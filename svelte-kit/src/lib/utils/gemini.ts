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
	model?: 'gemini-3-flash-preview' | 'gemini-3-pro-preview' | 'gemini-2.5-flash' | 'gemini-2.5-pro';
	thinkingLevel?: 'low' | 'medium' | 'high' | 'minimal';
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

/** Chunk yielded during streaming; final chunk has done: true and optional thoughtSignature */
export type GeminiStreamChunk = { text: string } | { done: true; thoughtSignature?: string };

/**
 * Parse JSON from Gemini text that may be wrapped in markdown code fences (e.g. ```json ... ```).
 *
 * @param text - Raw model output
 * @returns Parsed object or array
 */
export function parseGeminiJson(text: string): unknown {
	const trimmed = text.trim();
	const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const raw = fenceMatch ? fenceMatch[1].trim() : trimmed;

	const startObject = raw.indexOf('{');
	const startArray = raw.indexOf('[');
	const start =
		startObject === -1
			? startArray
			: startArray === -1
				? startObject
				: Math.min(startObject, startArray);
	const endObject = raw.lastIndexOf('}');
	const endArray = raw.lastIndexOf(']');
	const end =
		endObject === -1 ? endArray : endArray === -1 ? endObject : Math.max(endObject, endArray);

	if (start === -1 || end === -1 || end <= start) {
		throw new Error('Unable to locate JSON content in response');
	}

	return JSON.parse(raw.slice(start, end + 1));
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
		model = 'gemini-3-pro-preview',
		thinkingLevel = 'low',
		systemPrompt,
		conversationHistory = []
	} = options;

	try {
		// Build generation config with thinking config
		// According to Gemini API REST docs: generationConfig.thinkingConfig.thinkingLevel
		// Note: Old @google/generative-ai SDK (v0.24.1) may serialize nested objects correctly
		// If this fails, consider upgrading to @google/genai SDK or using REST API directly
		const generationConfig: Record<string, unknown> = {
			temperature: 1.0
		};

		// Add thinking config for Gemini 3 models (nested structure per REST API)
		if (model.includes('gemini-3') && thinkingLevel) {
			generationConfig.thinkingConfig = {
				thinkingLevel: thinkingLevel
			};
		}
		// Note: Gemini 2.5 uses thinkingBudget instead of thinkingLevel
		// For 2.5 models, we'd need to set thinkingBudget (not implemented here)

		const geminiModel = genAI.getGenerativeModel({
			model,
			generationConfig
		});

		// Build conversation with system prompt if provided
		// Ensure history format matches SDK expectations with thought signatures preserved
		const history = systemPrompt
			? [
					{ role: 'user' as const, parts: [{ text: systemPrompt }] },
					{ role: 'model' as const, parts: [{ text: 'Understood.' }] },
					...conversationHistory
				]
			: conversationHistory;

		// Start chat with history (thought signatures in parts are preserved automatically)
		const chat = geminiModel.startChat({ history });
		const result = await chat.sendMessage(prompt);
		const response = result.response;

		// Extract thought signature (REQUIRED for multi-turn context)
		// Thought signatures can be in any part, check all parts
		let thoughtSignature: string | undefined;
		for (const part of response.candidates?.[0]?.content?.parts || []) {
			if ('thoughtSignature' in part && part.thoughtSignature) {
				thoughtSignature = part.thoughtSignature as string;
				break; // Use first found signature
			}
		}

		return {
			text: response.text(),
			thoughtSignature,
			finishReason: response.candidates?.[0]?.finishReason
		};
	} catch (error) {
		// Enhanced error handling with context
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		type ErrorWithStatus = Error & { status?: number; errorDetails?: unknown };
		const err = error as ErrorWithStatus;
		const errorDetails =
			error instanceof Error && 'status' in error
				? `Status: ${err.status}, Details: ${JSON.stringify(err.errorDetails ?? {})}`
				: '';

		console.error('Gemini API error:', {
			model,
			thinkingLevel,
			error: errorMessage,
			details: errorDetails
		});

		// Re-throw with more context
		throw new Error(
			`Gemini API call failed (model: ${model}): ${errorMessage}${errorDetails ? ` - ${errorDetails}` : ''}`
		);
	}
}

/**
 * Stream Gemini 3 response; yields text chunks then a final { done, thoughtSignature }.
 *
 * @param options - Same as callGemini
 * @yields { text } for each chunk, then { done: true, thoughtSignature? }
 */
export async function* callGeminiStream(
	options: GeminiCallOptions
): AsyncGenerator<GeminiStreamChunk, void, undefined> {
	const {
		prompt,
		model = 'gemini-3-pro-preview',
		thinkingLevel = 'low',
		systemPrompt,
		conversationHistory = []
	} = options;

	const generationConfig: Record<string, unknown> = { temperature: 1.0 };
	if (model.includes('gemini-3') && thinkingLevel) {
		generationConfig.thinkingConfig = { thinkingLevel };
	}

	const geminiModel = genAI.getGenerativeModel({
		model,
		generationConfig: generationConfig as Record<string, unknown>
	});

	const history = systemPrompt
		? [
				{ role: 'user' as const, parts: [{ text: systemPrompt }] },
				{ role: 'model' as const, parts: [{ text: 'Understood.' }] },
				...conversationHistory
			]
		: conversationHistory;

	const chat = geminiModel.startChat({ history });
	const streamResult = await chat.sendMessageStream(prompt);

	for await (const chunk of streamResult.stream) {
		try {
			const text = chunk.text();
			if (text) {
				// Log chunk size for observability (sentence/completion granularity, not word-by-word)
				console.debug('[gemini-stream]', { chunkLength: text.length, preview: text.slice(0, 50) });
				yield { text };
			}
		} catch {
			// Chunk may be blocked or empty; skip
		}
	}

	const response = await streamResult.response;
	let thoughtSignature: string | undefined;
	for (const part of response.candidates?.[0]?.content?.parts || []) {
		if ('thoughtSignature' in part && part.thoughtSignature) {
			thoughtSignature = part.thoughtSignature as string;
			break;
		}
	}
	yield { done: true, thoughtSignature };
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
		const generationConfig: Record<string, unknown> = {
			temperature: 1.0,
			thinkingConfig: {
				thinkingLevel: 'low' // Fast for image processing
			}
		};

		const model = genAI.getGenerativeModel({
			model: 'gemini-3-flash-preview',
			generationConfig
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
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('Gemini image processing error:', {
			error: errorMessage,
			mimeType
		});
		throw new Error(`Failed to process image: ${errorMessage}`);
	}
}

/** Normalize base64: strip data URL prefix if present, return raw base64 */
function normalizeBase64(input: string): string {
	const comma = input.indexOf(',');
	return comma >= 0 ? input.slice(comma + 1) : input;
}

/**
 * Call Gemini with image and return raw text (for structured JSON parsing).
 * Use for vision agents (e.g. See-For-Me) that need a single image + prompt.
 *
 * @param prompt - Text prompt
 * @param imageBase64 - Data URL or raw base64
 * @param mimeType - e.g. image/jpeg
 * @returns Model text response
 */
export async function callGeminiWithVision(
	prompt: string,
	imageBase64: string,
	mimeType: string = 'image/jpeg'
): Promise<string> {
	return callGeminiWithInlineData(prompt, imageBase64, mimeType, {
		thinkingLevel: 'low',
		model: 'gemini-3-flash-preview'
	});
}

/**
 * Call Gemini with arbitrary inline data (image or PDF).
 * Use for PDF reading and other document types supported by the API.
 */
export async function callGeminiWithInlineData(
	prompt: string,
	base64: string,
	mimeType: string,
	options: { thinkingLevel?: 'low' | 'medium' | 'high'; model?: string } = {}
): Promise<string> {
	const { thinkingLevel = 'low', model = 'gemini-3-flash-preview' } = options;
	const generationConfig: Record<string, unknown> = {
		temperature: 1.0,
		thinkingConfig: { thinkingLevel }
	};
	const geminiModel = genAI.getGenerativeModel({
		model,
		generationConfig
	});
	const result = await geminiModel.generateContent([
		{ text: prompt },
		{ inlineData: { mimeType, data: normalizeBase64(base64) } }
	]);
	return result.response.text();
}

/** Supported audio MIME types for Gemini. */
const AUDIO_MIME_TYPES = ['audio/wav', 'audio/mpeg', 'audio/webm', 'audio/ogg'] as const;

/**
 * Call Gemini with audio data (Hear-For-Me agent).
 * Uses inline data; thinking level low for real-time.
 */
export async function callGeminiWithAudio(
	prompt: string,
	audioBase64: string,
	mimeType: string = 'audio/webm',
	options: { thinkingLevel?: 'low' | 'medium'; model?: string } = {}
): Promise<string> {
	const normalized = mimeType.split(';')[0];
	const allowed = AUDIO_MIME_TYPES.some(
		(m) => m === normalized || mimeType.startsWith(m.split('/')[0])
	);
	if (!allowed) {
		// Default to webm if unknown
		return callGeminiWithInlineData(prompt, audioBase64, 'audio/webm', {
			thinkingLevel: options.thinkingLevel ?? 'low',
			model: options.model ?? 'gemini-3-flash-preview'
		});
	}
	return callGeminiWithInlineData(prompt, audioBase64, mimeType, {
		thinkingLevel: options.thinkingLevel ?? 'low',
		model: options.model ?? 'gemini-3-flash-preview'
	});
}
