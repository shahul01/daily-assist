import { z } from 'zod';
import { callGemini, parseGeminiJson } from '$lib/utils/gemini';
import { getMemorySummary, processConversation } from '$lib/memory';
import { readAgent } from './readAgent';
import { rememberAgent } from './rememberAgent';
import {
	verify,
	hasObviousFailure,
	type VerificationStatus,
	type ActionResultItem
} from './verification';
import { decideRecovery, getBackoffMs, sleep as sleepMs } from './errorRecovery';
import {
	saveCheckpoint,
	persistThoughtSignature,
	loadRecentThoughtSignatures
} from './stateManager';
import { supabaseServer } from '$lib/server/supabase';
import type { Database } from '$lib/types/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Cast needed: SupabaseClient<Database> still infers never for marathon_sessions in this SDK version. */
const marathonDb = supabaseServer as SupabaseClient<Database>;

/** User state observed each cycle (for background or on-demand) */
export interface UserState {
	userId: string;
	lastInput?: string;
	pendingRemindersCount?: number;
	timestamp: string;
	source: 'on_demand' | 'background';
}

/** Decision from reason() (what to do next) */
export interface Decision {
	intent: string;
	agents: string[];
	reasoning?: string;
	actions: Array<{ agent: string; action: string; params?: Record<string, unknown> }>;
	thoughtSignature?: string;
}

/** Result of executing a decision */
export interface ActionResults {
	actions: ActionResultItem[];
	thoughtSignature?: string;
	allSuccess: boolean;
}

/** Marathon run config */
export const MarathonConfigSchema = z.object({
	userId: z.string().min(1),
	durationHours: z.number().min(0.1).max(720).default(24),
	mode: z.enum(['on_demand', 'background', 'hybrid']).default('hybrid'),
	observeIntervalSeconds: z.number().min(10).max(3600).default(60),
	checkpointEveryNActions: z.number().min(1).default(10),
	maxRetriesPerAction: z.number().min(1).default(3)
});
export type MarathonConfig = z.infer<typeof MarathonConfigSchema>;

function normalizeAgentName(agent: string): string {
	const t = agent.trim();
	if (t.endsWith(' Agent')) return t.slice(0, -' Agent'.length);
	return t;
}

/**
 * Marathon Orchestrator: observe -> reason -> act -> verify -> updateMemory loop.
 * Runs 24/7 or on-demand; maintains thought signatures; self-corrects via verify + retry/fallback.
 */
export class MarathonOrchestrator {
	private sessionId: string | null = null;
	private conversationHistory: Map<
		string,
		Array<{ role: 'user' | 'model'; parts: Array<{ text: string; thoughtSignature?: string }> }>
	> = new Map();
	private actionCountSinceCheckpoint = 0;
	private stopRequested = false;

	/**
	 * Observe user state (for this cycle). On-demand: pass lastInput; background: poll.
	 */
	async observe(
		userId: string,
		lastInput?: string,
		source: 'on_demand' | 'background' = 'on_demand'
	): Promise<UserState> {
		let pendingRemindersCount = 0;
		try {
			const reminders = await rememberAgent.listReminders(userId);
			pendingRemindersCount = reminders.length;
		} catch {
			// ignore
		}
		return {
			userId,
			lastInput,
			pendingRemindersCount,
			timestamp: new Date().toISOString(),
			source
		};
	}

	/**
	 * Reason using Gemini with thought signatures; returns decision (plan).
	 */
	async reason(userState: UserState): Promise<Decision | null> {
		const history = this.conversationHistory.get(userState.userId) || [];
		let memoryContext = '';
		try {
			const summary = await getMemorySummary(
				userState.userId,
				userState.lastInput ?? 'current context'
			);
			memoryContext = [
				summary.activeGoals.length
					? `Goals: ${summary.activeGoals.map((g) => g.title).join('; ')}`
					: '',
				summary.pendingTodos.length
					? `Todos: ${summary.pendingTodos.map((t) => t.task).join('; ')}`
					: '',
				summary.recentMemories.length
					? `Relevant: ${summary.recentMemories.map((m) => m.text_content).join(' | ')}`
					: ''
			]
				.filter(Boolean)
				.join('\n');
		} catch {
			// ignore
		}

		const systemPrompt = `You are the Marathon Orchestrator for DailyAssist. Decide what to do next.
${memoryContext ? `User context:\n${memoryContext}\n` : ''}
Available agents: Read-To-Me, Remember-For-Me (others not implemented).
Output JSON only (no markdown):
{"agents": ["agent_name"], "reasoning": "...", "actions": [{"agent": "agent_name", "action": "action_name", "params": {...}}]}`;

		const prompt = userState.lastInput
			? `User request: "${userState.lastInput}". What agents and actions?`
			: `Background check. Pending reminders: ${userState.pendingRemindersCount ?? 0}. Any proactive action? Reply with agents and actions or empty actions if nothing.`;

		const result = await callGemini({
			prompt,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'medium',
			systemPrompt,
			conversationHistory: history
		});

		const parsed = parseGeminiJson(result.text) as {
			agents?: string[];
			reasoning?: string;
			actions?: Array<{ agent: string; action: string; params?: Record<string, unknown> }>;
		};
		const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
		if (actions.length === 0 && !userState.lastInput) return null;

		return {
			intent: userState.lastInput ?? 'background',
			agents: Array.isArray(parsed.agents) ? parsed.agents : [],
			reasoning: parsed.reasoning,
			actions,
			thoughtSignature: result.thoughtSignature
		};
	}

	/**
	 * Execute decision (multi-agent coordination) with retry and fallback.
	 */
	async act(decision: Decision, config: MarathonConfig): Promise<ActionResults> {
		const userId = config.userId;
		const actions: ActionResultItem[] = [];
		let lastThoughtSignature = decision.thoughtSignature;

		for (const step of decision.actions) {
			const agentName = normalizeAgentName(step.agent);
			const params = step.params ?? {};
			let result: unknown = undefined;
			let retries = 0;
			let currentAgent = agentName;

			while (retries <= config.maxRetriesPerAction) {
				try {
					switch (currentAgent) {
						case 'Read-To-Me':
							if (step.action === 'read_text' && String(params?.text ?? '').trim()) {
								result = await readAgent.read({
									text: String(params.text).trim(),
									speed: (params.speed as 'slow' | 'normal' | 'fast') ?? 'normal',
									format: (params.format as 'plain' | 'structured') ?? 'plain'
								});
							}
							break;
						case 'Remember-For-Me':
							if (step.action === 'create_reminder') {
								result = await rememberAgent.createReminder({
									action: 'create_reminder',
									task: params?.task as string | undefined,
									time: params?.time as string | undefined,
									userId
								});
							} else if (step.action === 'list_reminders') {
								result = await rememberAgent.listReminders(userId);
							}
							break;
						default:
							result = { error: `Agent ${currentAgent} not implemented` };
					}

					actions.push({ agent: currentAgent, action: step.action, result });
					if (result && typeof result === 'object' && 'thoughtSignature' in result) {
						lastThoughtSignature = (result as { thoughtSignature?: string }).thoughtSignature;
					}
					break;
				} catch (err) {
					const recovery = decideRecovery(err, retries, currentAgent, config.maxRetriesPerAction);
					if (recovery.strategy === 'notify_user' || recovery.strategy === 'graceful_degradation') {
						actions.push({
							agent: currentAgent,
							action: step.action,
							result: { error: err instanceof Error ? err.message : String(err) }
						});
						break;
					}
					if (recovery.strategy === 'fallback_agent' && recovery.fallbackAgent) {
						currentAgent = recovery.fallbackAgent;
					}
					await sleepMs(recovery.retryAfterMs ?? getBackoffMs(retries));
					retries++;
				}
			}
		}

		const allSuccess = actions.every((a) => {
			const r = a.result as Record<string, unknown> | null;
			return r != null && !('error' in r && r.error);
		});

		return {
			actions,
			thoughtSignature: lastThoughtSignature,
			allSuccess
		};
	}

	/**
	 * Verify results (Plan-Do-Verify-Act). Returns status; caller may retry or update memory.
	 */
	async verify(userRequest: string, results: ActionResults): Promise<VerificationStatus> {
		if (hasObviousFailure(results.actions)) {
			return {
				passed: false,
				issues: ['One or more actions failed or returned empty'],
				suggestedCorrections: [],
				shouldRetry: true
			};
		}
		return verify(userRequest, results.actions);
	}

	/**
	 * Update memory: persist thought signatures and conversation.
	 */
	async updateMemory(userId: string, decision: Decision, results: ActionResults): Promise<void> {
		if (results.thoughtSignature) {
			try {
				await persistThoughtSignature(
					userId,
					this.sessionId,
					results.thoughtSignature,
					decision.intent.slice(0, 500),
					decision.agents[0] ?? 'orchestrator',
					results.allSuccess
				);
			} catch (e) {
				console.warn('[marathon] updateMemory persistThoughtSignature failed', e);
			}
		}
		const history = this.conversationHistory.get(userId) || [];
		history.push(
			{
				role: 'user',
				parts: [{ text: decision.intent, thoughtSignature: decision.thoughtSignature }]
			},
			{
				role: 'model',
				parts: [
					{
						text: `Executed ${decision.actions.length} action(s).`,
						thoughtSignature: results.thoughtSignature
					}
				]
			}
		);
		this.conversationHistory.set(userId, history);
		try {
			await processConversation({
				userId,
				messages: [
					{ role: 'user', content: decision.intent },
					{ role: 'model', content: `Executed ${decision.actions.length} action(s).` }
				]
			});
		} catch {
			// ignore
		}
	}

	/**
	 * Save checkpoint if needed (every N actions).
	 */
	private async maybeCheckpoint(userId: string, config: MarathonConfig): Promise<void> {
		this.actionCountSinceCheckpoint++;
		if (this.sessionId && this.actionCountSinceCheckpoint >= config.checkpointEveryNActions) {
			const history = this.conversationHistory.get(userId) || [];
			await saveCheckpoint(this.sessionId, {
				sequenceNumber: Math.floor(
					this.actionCountSinceCheckpoint / config.checkpointEveryNActions
				),
				conversationHistory: history.slice(-50),
				metadata: { actionCount: this.actionCountSinceCheckpoint }
			});
			this.actionCountSinceCheckpoint = 0;
		}
	}

	/**
	 * Run marathon loop for up to durationHours. Stops when stopRequested or time elapsed.
	 */
	async runMarathon(config: MarathonConfig): Promise<void> {
		const validated = MarathonConfigSchema.parse(config);
		this.stopRequested = false;

		const insertPayload = {
			user_id: validated.userId,
			status: 'running',
			mode: validated.mode,
			config: {
				durationHours: validated.durationHours,
				observeIntervalSeconds: validated.observeIntervalSeconds
			}
		};
		const { data: session, error: sessionError } = await marathonDb
			.from('marathon_sessions')
			// @ts-expect-error Supabase client infers never for marathon_sessions insert in this SDK
			.insert(insertPayload as Database['public']['Tables']['marathon_sessions']['Insert'])
			.select('id')
			.single();

		if (sessionError || !session) {
			throw new Error(
				`Failed to create marathon session: ${sessionError?.message ?? 'no session id'}`
			);
		}
		this.sessionId = (session as { id: string }).id;
		const endAt = Date.now() + validated.durationHours * 60 * 60 * 1000;
		const intervalMs = validated.observeIntervalSeconds * 1000;

		try {
			while (!this.stopRequested && Date.now() < endAt) {
				const userState = await this.observe(
					validated.userId,
					undefined,
					validated.mode === 'on_demand' ? 'on_demand' : 'background'
				);
				const decision = await this.reason(userState);
				if (!decision) {
					await sleepMs(intervalMs);
					continue;
				}
				const results = await this.act(decision, validated);
				const verification = await this.verify(decision.intent, results);
				if (!verification.passed && verification.shouldRetry && results.actions.length > 0) {
					// One retry with same decision (simplified self-correction)
					const retryResults = await this.act(decision, validated);
					await this.updateMemory(validated.userId, decision, retryResults);
				} else {
					await this.updateMemory(validated.userId, decision, results);
				}
				await this.maybeCheckpoint(validated.userId, validated);
				await marathonDb
					.from('marathon_sessions')
					// @ts-expect-error Supabase client infers never for marathon_sessions update
					.update({
						last_activity_at: new Date().toISOString()
					} as Database['public']['Tables']['marathon_sessions']['Update'])
					.eq('id', this.sessionId!);
				await sleepMs(intervalMs);
			}
		} finally {
			const updatePayload = {
				status: this.stopRequested ? 'stopped' : 'completed',
				ended_at: new Date().toISOString(),
				duration_hours: Math.round(
					(Date.now() - (endAt - validated.durationHours * 60 * 60 * 1000)) / 3600000
				)
			};
			await marathonDb
				.from('marathon_sessions')
				// @ts-expect-error Supabase client infers never for marathon_sessions update
				.update(updatePayload as Database['public']['Tables']['marathon_sessions']['Update'])
				.eq('id', this.sessionId!);
			this.sessionId = null;
		}
	}

	stop(): void {
		this.stopRequested = true;
	}

	getSessionId(): string | null {
		return this.sessionId;
	}

	/**
	 * Load recent thought signatures for context (e.g. when resuming).
	 */
	async loadThoughtContext(userId: string, limit = 20): Promise<void> {
		const recent = await loadRecentThoughtSignatures(userId, this.sessionId, limit);
		// Could inject into conversation history; for now we just ensure DB has them for next reason() via memory
		console.info('[marathon] loaded thought signatures', { userId, count: recent.length });
	}
}

export const marathonOrchestrator = new MarathonOrchestrator();
