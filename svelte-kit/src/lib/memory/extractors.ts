import { callGemini, parseGeminiJson } from '$lib/utils/gemini';
import type { ExtractedMemory } from './types';
import { z } from 'zod';

const MemoryTypeSchema = z.enum(['preference', 'goal', 'todo', 'event', 'fact']);
const ExtractedMemorySchema = z.object({
	type: MemoryTypeSchema,
	text: z.string(),
	confidence: z.number().min(0).max(1),
	category: z.string().optional(),
	key: z.string().optional(),
	value: z.string().optional(),
	title: z.string().optional(),
	relationships: z
		.array(
			z.object({
				type: z.string(),
				targetType: z.string().optional(),
				targetDescription: z.string().optional(),
				targetId: z.string().optional(),
				strength: z.number().optional(),
				context: z.string().optional()
			})
		)
		.optional()
});

const ExtractionResponseSchema = z.object({
	memories: z.array(ExtractedMemorySchema)
});

/**
 * Extract structured memories from conversation using Gemini.
 */
export async function extractMemories(
	messages: Array<{ role: string; content: string; parts?: Array<{ text: string }> }>,
	userId: string
): Promise<ExtractedMemory[]> {
	void userId;
	const conversationText = messages
		.map((m) => {
			const text =
				typeof m.content === 'string' ? m.content : (m.parts?.map((p) => p.text).join(' ') ?? '');
			return `${m.role}: ${text}`;
		})
		.join('\n');

	if (!conversationText.trim()) return [];

	const systemPrompt = `You are a memory extractor. From the conversation, extract structured memories.

Focus on: preferences (likes/dislikes, habits), goals (objectives), todos (tasks, action items), events (milestones), facts (static info about the user).

For each memory provide: type (preference|goal|todo|event|fact), text (clear description), confidence (0-1), optional category, key/value for preferences, title for goals/todos.
Only extract clear, actionable items. Be conservative with confidence.

Respond with JSON only: { "memories": [ { "type": "...", "text": "...", "confidence": 0.9, ... } ] }`;

	const prompt = `Conversation:\n${conversationText.slice(0, 8000)}\n\nExtract memories as JSON.`;

	const result = await callGemini({
		prompt,
		model: 'gemini-3-flash-preview',
		thinkingLevel: 'low',
		systemPrompt
	});

	const parsed = parseGeminiJson(result.text) as unknown;
	const parsedSafe = ExtractionResponseSchema.safeParse(parsed);
	if (!parsedSafe.success) {
		const fallback = Array.isArray(parsed)
			? parsed
			: (parsed as { memories?: unknown[] })?.memories;
		if (Array.isArray(fallback)) {
			return fallback
				.filter(
					(m) => m && typeof m === 'object' && m.type && m.text != null && m.confidence != null
				)
				.map((m) => ({
					type: MemoryTypeSchema.parse(m.type),
					text: String(m.text),
					confidence: Number(m.confidence),
					category: m.category != null ? String(m.category) : undefined,
					key: m.key != null ? String(m.key) : undefined,
					value: m.value != null ? String(m.value) : undefined,
					title: m.title != null ? String(m.title) : undefined,
					relationships: Array.isArray(m.relationships) ? m.relationships : undefined
				})) as ExtractedMemory[];
		}
		return [];
	}

	return parsedSafe.data.memories
		.filter((m) => m.confidence >= 0.5)
		.map((m) => ({ ...m, type: m.type as ExtractedMemory['type'] }));
}
