# Cursor Implementation Guide: DailyAssist Tier 1

## Orchestrator + Read-To-Me Agent + Remember-For-Me Agent

**Goal**: Build working MVP with 3 agents showcasing Gemini 3's thinking levels, thought signatures, and multi-agent coordination.

---

## Prerequisites Checklist

✅ SvelteKit project created  
✅ `.env` file with `VITE_GEMINI_API_KEY`  
✅ Folder structure exists (`src/lib/agents`, `src/routes/api`, etc.)

---

## Step 1: Install Dependencies (2 minutes)

```bash
# Core dependencies
npm install @google/generative-ai zod

# Optional but recommended (Vercel AI SDK for streaming)
npm install ai

# Dev dependencies
npm install -D @types/node
```

**Why these packages:**

- `@google/generative-ai`: Official Gemini 3 SDK
- `zod`: Runtime type validation (security first)
- `ai`: Vercel AI SDK for streaming responses (optional for Tier 1)

---

## Step 2: Environment Setup (1 minute)

Verify `.env` file has:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

**Security Note**: Never commit this file. Already in `.gitignore`.

---

## Step 3: Create Gemini Client Utility

**File**: `src/lib/utils/gemini.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

if (!import.meta.env.VITE_GEMINI_API_KEY) {
	throw new Error('VITE_GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

/**
 * Gemini 3 API call with thinking levels and thought signatures
 */
export interface GeminiCallOptions {
	prompt: string;
	model?: 'gemini-3-flash' | 'gemini-3-pro';
	thinkingLevel?: 'low' | 'medium' | 'high';
	systemPrompt?: string;
	conversationHistory?: Array<{
		role: 'user' | 'model';
		parts: Array<{ text: string; thoughtSignature?: string }>;
	}>;
}

export interface GeminiResponse {
	text: string;
	thoughtSignature?: string;
	finishReason?: string;
}

/**
 * Call Gemini 3 with proper error handling
 *
 * @param options - Configuration for Gemini call
 * @returns Response with text and thought signature
 */
export async function callGemini(options: GeminiCallOptions): Promise<GeminiResponse> {
	const {
		prompt,
		model = 'gemini-3-flash',
		thinkingLevel = 'low',
		systemPrompt,
		conversationHistory = []
	} = options;

	try {
		const geminiModel = genAI.getGenerativeModel({
			model,
			generationConfig: {
				// CRITICAL: Gemini 3 uses thinking_level, not temperature
				// Do NOT set temperature below 1.0 (causes loops)
				temperature: 1.0,
				// @ts-expect-error - thinking_level is a Gemini 3 preview feature
				thinking_level: thinkingLevel
			}
		});

		// Build conversation with system prompt if provided
		const history = systemPrompt
			? [
					{ role: 'user' as const, parts: [{ text: systemPrompt }] },
					{ role: 'model' as const, parts: [{ text: 'Understood.' }] },
					...conversationHistory
				]
			: conversationHistory;

		const chat = geminiModel.startChat({ history });
		const result = await chat.sendMessage(prompt);
		const response = result.response;

		// Extract thought signature (REQUIRED for multi-turn context)
		const thoughtSignature = response.candidates?.[0]?.content?.parts?.find(
			(part: any) => part.thoughtSignature
		)?.thoughtSignature;

		return {
			text: response.text(),
			thoughtSignature,
			finishReason: response.candidates?.[0]?.finishReason
		};
	} catch (error) {
		// Production error handling
		console.error('Gemini API error:', error);
		throw new Error(error instanceof Error ? error.message : 'Failed to call Gemini API');
	}
}

/**
 * Helper: Call Gemini with image (multimodal)
 */
export async function callGeminiWithImage(
	prompt: string,
	imageBase64: string,
	mimeType: string = 'image/jpeg'
): Promise<string> {
	try {
		const model = genAI.getGenerativeModel({
			model: 'gemini-3-flash',
			generationConfig: {
				temperature: 1.0,
				// @ts-expect-error - thinking_level preview feature
				thinking_level: 'low' // Fast for image processing
			}
		});

		const result = await model.generateContent([
			{ text: prompt },
			{
				inlineData: {
					mimeType,
					data: imageBase64.split(',')[1] // Remove data:image/jpeg;base64, prefix
				}
			}
		]);

		return result.response.text();
	} catch (error) {
		console.error('Gemini image processing error:', error);
		throw new Error('Failed to process image');
	}
}
```

**Key Features:**

- ✅ Thinking levels (LOW/MEDIUM/HIGH)
- ✅ Thought signatures (context preservation)
- ✅ Conversation history support
- ✅ Multimodal (image processing)
- ✅ Error handling
- ✅ TypeScript types

---

## Step 4: Create Read-To-Me Agent

**File**: `src/lib/agents/readAgent.ts`

```typescript
import { z } from 'zod';
import { callGemini, callGeminiWithImage } from '$lib/utils/gemini';

/**
 * Input validation schema
 */
export const ReadAgentInputSchema = z.object({
	text: z.string().min(1, 'Text cannot be empty'),
	speed: z.enum(['slow', 'normal', 'fast']).optional().default('normal'),
	format: z.enum(['plain', 'structured']).optional().default('plain')
});

export type ReadAgentInput = z.infer<typeof ReadAgentInputSchema>;

/**
 * Output type
 */
export interface ReadAgentOutput {
	spokenText: string;
	summary?: string;
	thoughtSignature?: string;
}

/**
 * Read-To-Me Agent
 *
 * Purpose: Convert text to speech-friendly format for vision/reading disabilities
 * Thinking Level: LOW (simple task, speed matters)
 */
export class ReadAgent {
	/**
	 * Process text for text-to-speech
	 */
	async read(input: ReadAgentInput): Promise<ReadAgentOutput> {
		// Validate input
		const validatedInput = ReadAgentInputSchema.parse(input);

		const systemPrompt = `You are a Read-To-Me assistant for people with vision disabilities.
Your job: Convert text into natural, speech-friendly format.

Rules:
1. Remove unnecessary formatting (markdown, HTML tags)
2. Spell out acronyms on first use
3. Add natural pauses with punctuation
4. Keep it conversational and clear
5. For long text, provide a brief summary first

Speed setting: ${validatedInput.speed}
${validatedInput.speed === 'slow' ? '- Use shorter sentences\n- Add more pauses' : ''}
${validatedInput.speed === 'fast' ? '- Keep it concise\n- Skip redundant details' : ''}`;

		const prompt = `Read this text aloud (convert to speech-friendly format):\n\n${validatedInput.text}`;

		try {
			const result = await callGemini({
				prompt,
				model: 'gemini-3-flash', // Fast model for reading
				thinkingLevel: 'low', // Simple task - speed matters
				systemPrompt
			});

			return {
				spokenText: result.text,
				thoughtSignature: result.thoughtSignature
			};
		} catch (error) {
			throw new Error(
				`Read agent failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Read image (OCR + description for blind users)
	 */
	async readImage(imageBase64: string, mimeType: string = 'image/jpeg'): Promise<string> {
		const prompt = `Describe this image in detail for a blind person:
1. What objects are visible?
2. What text appears (OCR)?
3. What colors are present?
4. What is the spatial layout?
5. What is the main purpose/message?

Be thorough but concise.`;

		return await callGeminiWithImage(prompt, imageBase64, mimeType);
	}
}

// Singleton instance
export const readAgent = new ReadAgent();
```

**Features:**

- ✅ Zod validation (security)
- ✅ LOW thinking level (speed for accessibility)
- ✅ Text-to-speech formatting
- ✅ Image OCR for blind users
- ✅ Speed control (slow/normal/fast)

---

## Step 5: Create Remember-For-Me Agent

**File**: `src/lib/agents/rememberAgent.ts`

```typescript
import { z } from 'zod';
import { callGemini } from '$lib/utils/gemini';

/**
 * Input validation
 */
export const RememberAgentInputSchema = z.object({
	action: z.enum(['create_reminder', 'list_reminders', 'analyze_patterns']),
	task: z.string().optional(),
	time: z.string().optional(),
	userId: z.string().min(1, 'User ID required'),
	context: z.string().optional()
});

export type RememberAgentInput = z.infer<typeof RememberAgentInputSchema>;

/**
 * Reminder type
 */
export interface Reminder {
	id: string;
	task: string;
	time: string;
	created: string;
	thoughtSignature?: string;
}

/**
 * Remember-For-Me Agent
 *
 * Purpose: Help users with memory disabilities track tasks, appointments, medications
 * Thinking Level: MEDIUM (balance speed and reasoning)
 */
export class RememberAgent {
	private reminders: Map<string, Reminder[]> = new Map();

	/**
	 * Create a reminder from natural language
	 */
	async createReminder(input: RememberAgentInput): Promise<Reminder> {
		const validatedInput = RememberAgentInputSchema.parse(input);

		const systemPrompt = `You are a Remember-For-Me assistant for people with memory disabilities.
Your job: Extract structured reminder information from natural language.

Extract:
1. Task description (what to do)
2. Time (when to do it - be specific)
3. Priority (how urgent)

Output format: JSON only
{
  "task": "clear description",
  "time": "ISO 8601 timestamp",
  "priority": "low|medium|high"
}`;

		const prompt = `Extract reminder from: "${validatedInput.task}"
${validatedInput.time ? `User mentioned time: ${validatedInput.time}` : ''}
${validatedInput.context ? `Context: ${validatedInput.context}` : ''}`;

		try {
			const result = await callGemini({
				prompt,
				model: 'gemini-3-pro', // Use Pro for better reasoning
				thinkingLevel: 'medium', // Balance speed and quality
				systemPrompt
			});

			// Parse JSON response
			const reminderData = JSON.parse(result.text);

			const reminder: Reminder = {
				id: crypto.randomUUID(),
				task: reminderData.task,
				time: reminderData.time,
				created: new Date().toISOString(),
				thoughtSignature: result.thoughtSignature
			};

			// Store in memory (TODO: replace with database in Tier 2)
			const userReminders = this.reminders.get(validatedInput.userId) || [];
			userReminders.push(reminder);
			this.reminders.set(validatedInput.userId, userReminders);

			return reminder;
		} catch (error) {
			throw new Error(
				`Remember agent failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * List all reminders for user
	 */
	async listReminders(userId: string): Promise<Reminder[]> {
		return this.reminders.get(userId) || [];
	}

	/**
	 * Analyze user patterns (requires thought signatures for context)
	 */
	async analyzePatterns(userId: string, conversationHistory: any[]): Promise<string> {
		const userReminders = this.reminders.get(userId) || [];

		const systemPrompt = `You are a Remember-For-Me assistant analyzing user patterns.

Your job: Identify patterns in user's reminders and behaviors.
Look for:
1. Recurring tasks
2. Times user struggles (morning/evening)
3. Forgotten tasks
4. Medication adherence patterns`;

		const prompt = `Analyze this user's reminder patterns:
Reminders: ${JSON.stringify(userReminders, null, 2)}

What patterns do you notice? What suggestions can help them remember better?`;

		try {
			const result = await callGemini({
				prompt,
				model: 'gemini-3-pro',
				thinkingLevel: 'high', // Deep analysis requires high thinking
				systemPrompt,
				conversationHistory // Maintain context across analysis
			});

			return result.text;
		} catch (error) {
			throw new Error(
				`Pattern analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}
}

// Singleton instance
export const rememberAgent = new RememberAgent();
```

**Features:**

- ✅ Natural language → structured reminder
- ✅ MEDIUM thinking for extraction
- ✅ HIGH thinking for pattern analysis
- ✅ Thought signatures for context
- ✅ In-memory storage (Tier 1), ready for DB (Tier 2)

---

## Step 6: Create Orchestrator

**File**: `src/lib/agents/orchestrator.ts`

```typescript
import { z } from 'zod';
import { callGemini } from '$lib/utils/gemini';
import { readAgent } from './readAgent';
import { rememberAgent } from './rememberAgent';

/**
 * Orchestrator input
 */
export const OrchestratorInputSchema = z.object({
	userInput: z.string().min(1, 'Input cannot be empty'),
	userId: z.string().min(1, 'User ID required'),
	conversationHistory: z.array(z.any()).optional().default([])
});

export type OrchestratorInput = z.infer<typeof OrchestratorInputSchema>;

/**
 * Orchestrator output
 */
export interface OrchestratorOutput {
	response: string;
	agentsUsed: string[];
	thoughtSignature?: string;
	actions: Array<{
		agent: string;
		action: string;
		result: any;
	}>;
}

/**
 * Multi-Agent Orchestrator
 *
 * Purpose: Coordinate multiple agents to accomplish complex tasks
 * Key Feature: Uses thought signatures to maintain context across agents
 */
export class Orchestrator {
	private conversationHistory: Map<string, any[]> = new Map();

	/**
	 * Process user input and coordinate agents
	 */
	async process(input: OrchestratorInput): Promise<OrchestratorOutput> {
		const validatedInput = OrchestratorInputSchema.parse(input);

		// Load conversation history for this user
		const history = this.conversationHistory.get(validatedInput.userId) || [];

		const systemPrompt = `You are an orchestrator for DailyAssist, coordinating 5 AI agents:
1. Read-To-Me Agent: Read text aloud, OCR images
2. Write-For-Me Agent: Write emails, documents (NOT IMPLEMENTED YET)
3. Find-It Agent: Search, navigate, locate files (NOT IMPLEMENTED YET)
4. Remember-For-Me Agent: Create reminders, track tasks
5. Say-It-For-Me Agent: Text-to-speech for communication (NOT IMPLEMENTED YET)

Your job: Decide which agent(s) to use based on user intent.

Available agents RIGHT NOW: Read-To-Me, Remember-For-Me

Output JSON:
{
  "agents": ["agent_name"],
  "reasoning": "why these agents",
  "actions": [
    {"agent": "agent_name", "action": "specific_action", "params": {...}}
  ]
}`;

		try {
			// Step 1: Decide which agents to use
			const planningResult = await callGemini({
				prompt: `User request: "${validatedInput.userInput}"
				
What agents should I use? What actions should they take?`,
				model: 'gemini-3-pro',
				thinkingLevel: 'medium', // Medium thinking for orchestration
				systemPrompt,
				conversationHistory: history
			});

			// Parse plan
			const plan = JSON.parse(planningResult.text);

			// Step 2: Execute agent actions
			const actions: OrchestratorOutput['actions'] = [];

			for (const action of plan.actions) {
				let result;

				switch (action.agent) {
					case 'Read-To-Me':
						if (action.action === 'read_text') {
							result = await readAgent.read({
								text: action.params.text,
								speed: action.params.speed || 'normal'
							});
						}
						break;

					case 'Remember-For-Me':
						if (action.action === 'create_reminder') {
							result = await rememberAgent.createReminder({
								action: 'create_reminder',
								task: action.params.task,
								time: action.params.time,
								userId: validatedInput.userId
							});
						} else if (action.action === 'list_reminders') {
							result = await rememberAgent.listReminders(validatedInput.userId);
						}
						break;

					default:
						result = { error: `Agent ${action.agent} not implemented yet` };
				}

				actions.push({
					agent: action.agent,
					action: action.action,
					result
				});
			}

			// Step 3: Synthesize final response
			const synthesisResult = await callGemini({
				prompt: `User asked: "${validatedInput.userInput}"
				
I executed these actions:
${JSON.stringify(actions, null, 2)}

Provide a natural, helpful response to the user explaining what was done.`,
				model: 'gemini-3-flash',
				thinkingLevel: 'low', // Fast response synthesis
				conversationHistory: [
					...history,
					{
						role: 'user',
						parts: [
							{
								text: validatedInput.userInput,
								thoughtSignature: planningResult.thoughtSignature
							}
						]
					}
				]
			});

			// Update conversation history
			history.push(
				{
					role: 'user',
					parts: [{ text: validatedInput.userInput }]
				},
				{
					role: 'model',
					parts: [
						{
							text: synthesisResult.text,
							thoughtSignature: synthesisResult.thoughtSignature
						}
					]
				}
			);
			this.conversationHistory.set(validatedInput.userId, history);

			return {
				response: synthesisResult.text,
				agentsUsed: plan.agents,
				thoughtSignature: synthesisResult.thoughtSignature,
				actions
			};
		} catch (error) {
			console.error('Orchestrator error:', error);
			throw new Error(
				`Orchestration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Clear conversation history (for testing/reset)
	 */
	clearHistory(userId: string): void {
		this.conversationHistory.delete(userId);
	}
}

// Singleton instance
export const orchestrator = new Orchestrator();
```

**Features:**

- ✅ Multi-agent coordination
- ✅ Thought signatures across agents
- ✅ Strategic thinking levels (MEDIUM for planning, LOW for synthesis)
- ✅ Conversation history per user
- ✅ Graceful handling of unimplemented agents

---

## Step 7: Create API Routes

### 7a. Orchestrator API

**File**: `src/routes/api/orchestrate/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { orchestrator } from '$lib/agents/orchestrator';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Validate required fields
		if (!body.userInput || !body.userId) {
			return json({ error: 'Missing required fields: userInput, userId' }, { status: 400 });
		}

		const result = await orchestrator.process({
			userInput: body.userInput,
			userId: body.userId,
			conversationHistory: body.conversationHistory || []
		});

		return json(result);
	} catch (error) {
		console.error('Orchestrate API error:', error);
		return json(
			{
				error: 'Orchestration failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
```

### 7b. Read Agent API

**File**: `src/routes/api/agents/read/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readAgent } from '$lib/agents/readAgent';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Text reading
		if (body.text) {
			const result = await readAgent.read({
				text: body.text,
				speed: body.speed || 'normal',
				format: body.format || 'plain'
			});
			return json(result);
		}

		// Image reading
		if (body.imageBase64) {
			const result = await readAgent.readImage(body.imageBase64, body.mimeType || 'image/jpeg');
			return json({ description: result });
		}

		return json({ error: 'Missing text or imageBase64' }, { status: 400 });
	} catch (error) {
		console.error('Read agent API error:', error);
		return json(
			{
				error: 'Read agent failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
```

### 7c. Remember Agent API

**File**: `src/routes/api/agents/remember/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rememberAgent } from '$lib/agents/rememberAgent';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		if (!body.userId) {
			return json({ error: 'Missing userId' }, { status: 400 });
		}

		// Create reminder
		if (body.action === 'create_reminder') {
			const result = await rememberAgent.createReminder({
				action: 'create_reminder',
				task: body.task,
				time: body.time,
				userId: body.userId,
				context: body.context
			});
			return json(result);
		}

		// List reminders
		if (body.action === 'list_reminders') {
			const result = await rememberAgent.listReminders(body.userId);
			return json({ reminders: result });
		}

		// Analyze patterns
		if (body.action === 'analyze_patterns') {
			const result = await rememberAgent.analyzePatterns(
				body.userId,
				body.conversationHistory || []
			);
			return json({ analysis: result });
		}

		return json({ error: 'Invalid action' }, { status: 400 });
	} catch (error) {
		console.error('Remember agent API error:', error);
		return json(
			{
				error: 'Remember agent failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
```

---

## Step 8: Create Simple UI Components

### 8a. Agent Panel Component

**File**: `src/lib/components/AgentPanel.svelte`

```svelte
<script lang="ts">
	import { onMount } from 'svelte';

	let userInput = $state('');
	let response = $state('');
	let loading = $state(false);
	let agentsUsed = $state<string[]>([]);

	// Generate simple user ID (in production, use proper auth)
	const userId = crypto.randomUUID();

	async function handleSubmit() {
		if (!userInput.trim()) return;

		loading = true;
		response = '';
		agentsUsed = [];

		try {
			const res = await fetch('/api/orchestrate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userInput: userInput.trim(),
					userId
				})
			});

			if (!res.ok) {
				throw new Error(`API error: ${res.statusText}`);
			}

			const data = await res.json();
			response = data.response;
			agentsUsed = data.agentsUsed || [];
		} catch (error) {
			response = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
		} finally {
			loading = false;
		}
	}
</script>

<div class="agent-panel">
	<h2>DailyAssist - Your AI Companion</h2>

	<form on:submit|preventDefault={handleSubmit}>
		<label for="user-input"> What can I help you with today? </label>

		<textarea
			id="user-input"
			bind:value={userInput}
			placeholder="Examples:
- Read this text to me: [paste text]
- Remind me to take medication at 8 PM
- What are my reminders?"
			rows="4"
		></textarea>

		<button type="submit" disabled={loading}>
			{loading ? 'Processing...' : 'Ask DailyAssist'}
		</button>
	</form>

	{#if agentsUsed.length > 0}
		<div class="agents-used">
			<strong>Agents used:</strong>
			{agentsUsed.join(', ')}
		</div>
	{/if}

	{#if response}
		<div class="response">
			<strong>DailyAssist:</strong>
			<p>{response}</p>
		</div>
	{/if}
</div>

<style>
	.agent-panel {
		max-width: 600px;
		margin: 2rem auto;
		padding: 2rem;
		background: hsl(210 20% 98%);
		border-radius: 12px;
		box-shadow: 0 2px 8px hsla(210 20% 20% / 0.1);
	}

	:global(body.dark) .agent-panel {
		background: hsl(210 20% 15%);
		box-shadow: 0 2px 8px hsla(0 0% 0% / 0.3);
	}

	h2 {
		color: hsl(210 60% 40%);
		margin-bottom: 1.5rem;
	}

	:global(body.dark) h2 {
		color: hsl(210 60% 60%);
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		color: hsl(210 10% 30%);
	}

	:global(body.dark) label {
		color: hsl(210 10% 80%);
	}

	textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid hsl(210 10% 85%);
		border-radius: 8px;
		font-family: inherit;
		font-size: 1rem;
		resize: vertical;
	}

	:global(body.dark) textarea {
		background: hsl(210 20% 20%);
		border-color: hsl(210 20% 30%);
		color: hsl(0 0% 95%);
	}

	button {
		margin-top: 1rem;
		padding: 0.75rem 1.5rem;
		background: hsl(210 60% 50%);
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	button:hover:not(:disabled) {
		background: hsl(210 60% 45%);
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.agents-used {
		margin-top: 1rem;
		padding: 0.75rem;
		background: hsl(210 100% 95%);
		border-radius: 6px;
		font-size: 0.9rem;
		color: hsl(210 60% 40%);
	}

	:global(body.dark) .agents-used {
		background: hsl(210 60% 20%);
		color: hsl(210 60% 70%);
	}

	.response {
		margin-top: 1.5rem;
		padding: 1rem;
		background: white;
		border-radius: 8px;
		border-left: 4px solid hsl(210 60% 50%);
	}

	:global(body.dark) .response {
		background: hsl(210 20% 18%);
	}

	.response strong {
		color: hsl(210 60% 40%);
	}

	:global(body.dark) .response strong {
		color: hsl(210 60% 60%);
	}

	.response p {
		margin-top: 0.5rem;
		line-height: 1.6;
		white-space: pre-wrap;
	}
</style>
```

### 8b. Main Page

**File**: `src/routes/+page.svelte`

```svelte
<script lang="ts">
	import AgentPanel from '$lib/components/AgentPanel.svelte';
</script>

<svelte:head>
	<title>DailyAssist - AI Companion for Accessibility</title>
</svelte:head>

<main>
	<div class="hero">
		<h1>DailyAssist</h1>
		<p>Your AI companion helping with reading, writing, finding, remembering, and communicating</p>
	</div>

	<AgentPanel />

	<div class="features">
		<div class="feature">
			<h3>📖 Read-To-Me</h3>
			<p>Converts text to speech-friendly format for vision disabilities</p>
		</div>

		<div class="feature">
			<h3>🧠 Remember-For-Me</h3>
			<p>Creates reminders and tracks tasks for memory disabilities</p>
		</div>

		<div class="feature">
			<h3>🎯 Smart Orchestration</h3>
			<p>Multiple agents work together to help you accomplish complex tasks</p>
		</div>
	</div>
</main>

<style>
	main {
		padding: 2rem 1rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	.hero {
		text-align: center;
		margin-bottom: 3rem;
	}

	h1 {
		font-size: 3rem;
		color: hsl(210 60% 40%);
		margin-bottom: 0.5rem;
	}

	:global(body.dark) h1 {
		color: hsl(210 60% 60%);
	}

	.hero p {
		font-size: 1.25rem;
		color: hsl(210 10% 40%);
	}

	:global(body.dark) .hero p {
		color: hsl(210 10% 70%);
	}

	.features {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 2rem;
		margin-top: 3rem;
	}

	.feature {
		padding: 1.5rem;
		background: hsl(210 20% 98%);
		border-radius: 12px;
		text-align: center;
	}

	:global(body.dark) .feature {
		background: hsl(210 20% 15%);
	}

	.feature h3 {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
		color: hsl(210 60% 40%);
	}

	:global(body.dark) .feature h3 {
		color: hsl(210 60% 60%);
	}

	.feature p {
		color: hsl(210 10% 40%);
		line-height: 1.6;
	}

	:global(body.dark) .feature p {
		color: hsl(210 10% 70%);
	}
</style>
```

---

## Step 9: Testing Checklist

### Manual Testing

1. **Test Read-To-Me Agent**

```
Input: "Read this to me: The quick brown fox jumps over the lazy dog."
Expected: Speech-friendly formatted text
```

2. **Test Remember-For-Me Agent**

```
Input: "Remind me to take medication at 8 PM tonight"
Expected: Creates structured reminder with ISO timestamp
```

3. **Test Orchestrator**

```
Input: "Read this text and remind me about it: Important meeting tomorrow at 2 PM"
Expected: Both agents coordinate - reads text AND creates reminder
```

### API Testing (cURL)

```bash
# Test Orchestrator
curl -X POST http://localhost:5173/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "userInput": "Remind me to call doctor tomorrow at 3 PM",
    "userId": "test-user-123"
  }'

# Test Read Agent
curl -X POST http://localhost:5173/api/agents/read \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world, this is a test.",
    "speed": "normal"
  }'

# Test Remember Agent
curl -X POST http://localhost:5173/api/agents/remember \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create_reminder",
    "task": "Take medication",
    "time": "8 PM",
    "userId": "test-user-123"
  }'
```

---

## Step 10: Run and Verify

```bash
# Start development server
npm run dev

# Open browser
open http://localhost:5173
```

**Verification Checklist:**

- [ ] Page loads without errors
- [ ] Can input text and submit
- [ ] Orchestrator calls correct agents
- [ ] Agents use correct thinking levels (check logs)
- [ ] Thought signatures maintained across turns
- [ ] Errors handled gracefully
- [ ] UI is responsive and accessible
- [ ] Dark mode works

---

## Common Issues & Solutions

### Issue: "VITE_GEMINI_API_KEY is not set"

**Solution**: Check `.env` file exists and has correct variable name

### Issue: "thinking_level is not a valid property"

**Solution**: This is expected TypeScript error. Use `// @ts-expect-error` comment (already in code)

### Issue: JSON parsing error in agents

**Solution**: Add better error handling in agent code. Gemini sometimes returns markdown-wrapped JSON.

### Issue: Agents not coordinating

**Solution**: Check thought signatures are being passed correctly in orchestrator

---

## Next Steps (Tier 2)

After Tier 1 works:

1. Add Supabase database (replace in-memory storage)
2. Add Write-For-Me agent
3. Add Find-It-For-Me agent
4. Add Say-It-For-Me agent
5. Add Web Speech API (voice input/output)
6. Add image upload UI
7. Add real-time streaming
8. Add authentication

---

## Success Criteria

✅ Orchestrator coordinates multiple agents  
✅ Read-To-Me agent processes text  
✅ Remember-For-Me agent creates reminders  
✅ Thinking levels used strategically  
✅ Thought signatures preserved  
✅ UI is clean and accessible  
✅ Error handling works  
✅ Code follows security best practices (Zod, env vars)

**When all checked: Tier 1 complete! 🎉**

---

## Notes for Cursor

- Follow `basic.mdc` rules (security, maintainability, error handling)
- Use Zod for ALL input validation
- Comment only when necessary (why, not what)
- Keep functions simple and focused
- Handle errors gracefully
- Use TypeScript strict mode
- Follow mobile-first responsive design
- Use HSL colors for dark mode support
- Test each component independently before integration

**Priority**: Get orchestrator working first. Then agents. Then UI.

Good luck! 🚀
