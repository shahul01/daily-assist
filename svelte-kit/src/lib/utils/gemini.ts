import { GoogleGenerativeAI, type Part, type TextPart } from '@google/generative-ai';

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
			(part: Part) => 'thoughtSignature' in part
		)?.thoughtSignature as string | undefined;

		return {
			text: response.text(),
			thoughtSignature,
			finishReason: response.candidates?.[0]?.finishReason
		};
	} catch (error) {
		// Production error handling
		console.error('Gemini API error:', error);
		throw new Error(
			error instanceof Error ? error.message : 'Failed to call Gemini API'
		);
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
