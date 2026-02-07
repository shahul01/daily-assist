import { z } from 'zod';
import { callGemini, parseGeminiJson } from '$lib/utils/gemini';
import { supabaseServer } from '$lib/server/supabase';
import type { Database, Json } from '$lib/types/database.types';

/** Tone options for composition and adjustment */
export const TONE_VALUES = ['formal', 'casual', 'friendly', 'professional', 'persuasive'] as const;
export type Tone = (typeof TONE_VALUES)[number];

/** Summary length */
export const SUMMARY_LENGTHS = ['brief', 'moderate', 'detailed'] as const;
export type SummaryLength = (typeof SUMMARY_LENGTHS)[number];

/** Input schemas */
export const ComposeEmailInputSchema = z.object({
	topic: z.string().min(1, 'Topic cannot be empty'),
	tone: z.enum(TONE_VALUES).optional().default('professional'),
	context: z.string().optional(),
	userId: z.string().optional()
});

export const CorrectGrammarInputSchema = z.object({
	text: z.string().min(1, 'Text cannot be empty')
});

export const AdjustToneInputSchema = z.object({
	text: z.string().min(1, 'Text cannot be empty'),
	targetTone: z.enum(TONE_VALUES)
});

export const ExpandTextInputSchema = z.object({
	notes: z.string().min(1, 'Notes cannot be empty')
});

export const SummarizeInputSchema = z.object({
	text: z.string().min(1, 'Text cannot be empty'),
	length: z.enum(SUMMARY_LENGTHS).optional().default('moderate')
});

export const GenerateTemplateInputSchema = z.object({
	purpose: z.string().min(1, 'Purpose cannot be empty')
});

export const SaveDraftInputSchema = z.object({
	userId: z.string().min(1, 'User ID required'),
	title: z.string().optional(),
	content: z.string().min(1, 'Content cannot be empty'),
	draftType: z.enum(['email', 'letter', 'document', 'other']).optional(),
	draftId: z.string().uuid().optional()
});

export const RefineTextInputSchema = z.object({
	originalText: z.string().min(1, 'Text cannot be empty'),
	feedback: z.string().min(1, 'Feedback cannot be empty'),
	conversationHistory: z
		.array(
			z.object({
				role: z.enum(['user', 'model']),
				parts: z.array(z.object({ text: z.string() }))
			})
		)
		.optional()
		.default([])
});

export type ComposeEmailInput = z.infer<typeof ComposeEmailInputSchema>;
export type CorrectGrammarInput = z.infer<typeof CorrectGrammarInputSchema>;
export type AdjustToneInput = z.infer<typeof AdjustToneInputSchema>;
export type ExpandTextInput = z.infer<typeof ExpandTextInputSchema>;
export type SummarizeInput = z.infer<typeof SummarizeInputSchema>;
export type GenerateTemplateInput = z.infer<typeof GenerateTemplateInputSchema>;
export type SaveDraftInput = z.infer<typeof SaveDraftInputSchema>;
export type RefineTextInput = z.infer<typeof RefineTextInputSchema>;

/** Output types */
export interface EmailOutput {
	subject: string;
	body: string;
	thoughtSignature?: string;
}

export interface Draft {
	id: string;
	title: string | null;
	content: string;
	draftType: string | null;
	createdAt: string;
	updatedAt: string;
	version: number;
}

export interface WritingTemplate {
	id: string;
	name: string;
	description: string | null;
	templateType: string;
	content: string;
	variables: string[];
}

export interface StyleProfile {
	vocabularyPreferences: Record<string, unknown>;
	sentencePatterns: Record<string, unknown>;
	commonPhrases: string[];
	tonePreference: string | null;
	formalityLevel: number | null;
	sampleCount: number;
	confidenceScore: number;
}

/**
 * Write-For-Me Agent
 * Purpose: Help motor/cognitive disabilities by drafting text, emails, documents; grammar correction; tone adjustment.
 * Thinking Level: HIGH for composition, LOW for grammar/speed.
 */
export class WriteAgent {
	async composeEmail(input: ComposeEmailInput): Promise<EmailOutput> {
		const validated = ComposeEmailInputSchema.parse(input);
		const systemPrompt = `You are a Write-For-Me assistant for people who need help composing written content.
Your job: Generate a complete email with subject line and body.

Rules:
1. Use a clear, appropriate subject line.
2. Match the requested tone: ${validated.tone}.
3. Be concise but complete.
4. Output ONLY valid JSON with keys: "subject" and "body". No markdown, no code fences.`;

		const prompt = `Compose an email about: ${validated.topic}
${validated.context ? `Context: ${validated.context}` : ''}`;

		const result = await callGemini({
			prompt,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'high',
			systemPrompt
		});

		const parsed = parseGeminiJson(result.text) as { subject?: string; body?: string };
		const subject = typeof parsed?.subject === 'string' ? parsed.subject.trim() : 'No subject';
		const body = typeof parsed?.body === 'string' ? parsed.body.trim() : result.text;
		return {
			subject,
			body,
			thoughtSignature: result.thoughtSignature
		};
	}

	async correctGrammar(text: string): Promise<string> {
		CorrectGrammarInputSchema.parse({ text });
		const systemPrompt = `You are a grammar and spelling corrector. Fix all errors while preserving the author's voice and intent. Return ONLY the corrected text, no explanations.`;
		const result = await callGemini({
			prompt: `Correct the grammar and spelling of this text:\n\n${text}`,
			model: 'gemini-3-flash-preview',
			thinkingLevel: 'low',
			systemPrompt
		});
		return result.text.trim();
	}

	async adjustTone(text: string, targetTone: Tone): Promise<string> {
		AdjustToneInputSchema.parse({ text, targetTone });
		const systemPrompt = `You are a tone adjustment assistant. Rewrite the given text to match the target tone (${targetTone}) while keeping the same message and key information. Return ONLY the rewritten text.`;
		const result = await callGemini({
			prompt: `Adjust the tone of this text to "${targetTone}":\n\n${text}`,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'medium',
			systemPrompt
		});
		return result.text.trim();
	}

	async expandText(notes: string): Promise<string> {
		ExpandTextInputSchema.parse({ notes });
		const systemPrompt = `You are a writing assistant. Expand the given notes or bullet points into full, coherent paragraphs. Keep a logical flow. Return ONLY the expanded text.`;
		const result = await callGemini({
			prompt: `Expand these notes into full paragraphs:\n\n${notes}`,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'high',
			systemPrompt
		});
		return result.text.trim();
	}

	async summarize(text: string, length: SummaryLength = 'moderate'): Promise<string> {
		SummarizeInputSchema.parse({ text, length });
		const lengthHint =
			length === 'brief'
				? '2-3 sentences'
				: length === 'detailed'
					? 'a full paragraph'
					: '4-6 sentences';
		const systemPrompt = `You are a summarization assistant. Summarize the text in ${lengthHint}. Return ONLY the summary.`;
		const result = await callGemini({
			prompt: `Summarize:\n\n${text}`,
			model: 'gemini-3-flash-preview',
			thinkingLevel: 'medium',
			systemPrompt
		});
		return result.text.trim();
	}

	async generateTemplate(purpose: string): Promise<WritingTemplate> {
		GenerateTemplateInputSchema.parse({ purpose });
		const systemPrompt = `You are a template writer. Create a reusable text template for the given purpose. Use placeholders like {{name}}, {{date}}, {{company}} where appropriate. Reply with a single JSON object (no markdown): "name", "description", "templateType", "content", "variables" (array of placeholder names).`;
		const result = await callGemini({
			prompt: `Create a template for: ${purpose}`,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'high',
			systemPrompt
		});
		const parsed = parseGeminiJson(result.text) as {
			name?: string;
			description?: string;
			templateType?: string;
			content?: string;
			variables?: string[];
		};
		return {
			id: '',
			name: typeof parsed?.name === 'string' ? parsed.name : purpose,
			description: typeof parsed?.description === 'string' ? parsed.description : null,
			templateType: typeof parsed?.templateType === 'string' ? parsed.templateType : 'other',
			content: typeof parsed?.content === 'string' ? parsed.content : result.text,
			variables: Array.isArray(parsed?.variables) ? parsed.variables : []
		};
	}

	async saveDraft(input: SaveDraftInput): Promise<Draft> {
		const validated = SaveDraftInputSchema.parse(input);
		const now = new Date().toISOString();
		type DraftInsert = Database['public']['Tables']['drafts']['Insert'];
		type DraftRow = Database['public']['Tables']['drafts']['Row'];

		if (validated.draftId) {
			const updatePayload = {
				title: validated.title ?? null,
				content: validated.content,
				draft_type: validated.draftType ?? null,
				updated_at: now
			};
			const { data, error } = await supabaseServer
				.from('drafts')
				// @ts-expect-error Supabase client generic can infer never for new tables
				.update(updatePayload)
				.eq('id', validated.draftId)
				.eq('user_id', validated.userId)
				.select('id, title, content, draft_type, created_at, updated_at, version')
				.single();
			if (error) throw new Error(`Save draft failed: ${error.message}`);
			const r = data as DraftRow;
			return mapDraftRow(r);
		}

		const insertPayload: DraftInsert = {
			user_id: validated.userId,
			title: validated.title ?? null,
			content: validated.content,
			draft_type: validated.draftType ?? null,
			metadata: {},
			created_at: now,
			updated_at: now,
			version: 1
		};
		const { data, error } = await supabaseServer
			.from('drafts')
			// @ts-expect-error Supabase client generic can infer never for new tables
			.insert(insertPayload)
			.select('id, title, content, draft_type, created_at, updated_at, version')
			.single();
		if (error) throw new Error(`Save draft failed: ${error.message}`);
		const r = data as DraftRow;
		return mapDraftRow(r);
	}

	async loadDrafts(userId: string): Promise<Draft[]> {
		const { data, error } = await supabaseServer
			.from('drafts')
			.select('id, title, content, draft_type, created_at, updated_at, version')
			.eq('user_id', userId)
			.order('updated_at', { ascending: false });
		if (error) throw new Error(`Load drafts failed: ${error.message}`);
		return ((data ?? []) as Database['public']['Tables']['drafts']['Row'][]).map(mapDraftRow);
	}

	async refineText(input: RefineTextInput): Promise<string> {
		const validated = RefineTextInputSchema.parse(input);
		const history = validated.conversationHistory.map((h) => ({
			role: h.role as 'user' | 'model',
			parts: h.parts.map((p) => ({ text: p.text }))
		}));
		const systemPrompt = `You are a writing assistant. The user will give you text and feedback. Apply the feedback to improve the text. Return ONLY the revised text.`;
		const prompt = `Original text:\n${validated.originalText}\n\nUser feedback: ${validated.feedback}`;
		const result = await callGemini({
			prompt,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'medium',
			systemPrompt,
			conversationHistory: history
		});
		return result.text.trim();
	}

	async learnUserStyle(userId: string, samples: string[]): Promise<StyleProfile> {
		if (samples.length === 0) {
			throw new Error('At least one writing sample is required');
		}
		const systemPrompt = `You are a style analyst. Analyze the writing samples and extract: vocabulary preferences, sentence patterns, common phrases, typical tone, formality (1-5). Reply with a single JSON object: vocabulary_preferences (object), sentence_patterns (object), common_phrases (array of strings), tone_preference (string), formality_level (1-5). No markdown.`;
		const prompt = `Analyze these writing samples:\n\n${samples.map((s, i) => `Sample ${i + 1}:\n${s}`).join('\n\n')}`;
		const result = await callGemini({
			prompt,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'high',
			systemPrompt
		});
		const parsed = parseGeminiJson(result.text) as {
			vocabulary_preferences?: Record<string, unknown>;
			sentence_patterns?: Record<string, unknown>;
			common_phrases?: string[];
			tone_preference?: string;
			formality_level?: number;
		};
		const profile: StyleProfile = {
			vocabularyPreferences: parsed?.vocabulary_preferences ?? {},
			sentencePatterns: parsed?.sentence_patterns ?? {},
			commonPhrases: Array.isArray(parsed?.common_phrases) ? parsed.common_phrases : [],
			tonePreference: typeof parsed?.tone_preference === 'string' ? parsed.tone_preference : null,
			formalityLevel:
				typeof parsed?.formality_level === 'number' &&
				parsed.formality_level >= 1 &&
				parsed.formality_level <= 5
					? parsed.formality_level
					: null,
			sampleCount: samples.length,
			confidenceScore: Math.min(0.5 + samples.length * 0.1, 0.95)
		};
		const now = new Date().toISOString();
		const payload = {
			user_id: userId,
			vocabulary_preferences: profile.vocabularyPreferences as Json,
			sentence_patterns: profile.sentencePatterns as Json,
			common_phrases: profile.commonPhrases,
			tone_preference: profile.tonePreference,
			formality_level: profile.formalityLevel,
			sample_count: profile.sampleCount,
			confidence_score: profile.confidenceScore,
			last_updated: now
		};
		await supabaseServer
			.from('style_profiles')
			// @ts-expect-error Supabase client generic can infer never for new tables
			.upsert(payload, { onConflict: 'user_id', ignoreDuplicates: false });
		return profile;
	}

	async applyUserStyle(text: string, userId: string): Promise<string> {
		const { data: row } = await supabaseServer
			.from('style_profiles')
			.select(
				'vocabulary_preferences, sentence_patterns, common_phrases, tone_preference, formality_level'
			)
			.eq('user_id', userId)
			.single();
		if (!row) return text;
		const systemPrompt = `You are a style applicator. Rewrite the given text to match the user's writing style. Use their vocabulary preferences, sentence patterns, and tone. Return ONLY the rewritten text.`;
		const styleContext = `Style: tone=${(row as { tone_preference?: string }).tone_preference ?? 'neutral'}, formality=${(row as { formality_level?: number }).formality_level ?? 3}.`;
		const result = await callGemini({
			prompt: `${styleContext}\n\nText to rewrite:\n${text}`,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'medium',
			systemPrompt
		});
		return result.text.trim();
	}
}

function mapDraftRow(r: Database['public']['Tables']['drafts']['Row']): Draft {
	return {
		id: r.id,
		title: r.title,
		content: r.content,
		draftType: r.draft_type,
		createdAt: r.created_at,
		updatedAt: r.updated_at,
		version: r.version
	};
}

export const writeAgent = new WriteAgent();
