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
		const generationConfig: any = {
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
		const errorDetails = error instanceof Error && 'status' in error
			? `Status: ${(error as any).status}, Details: ${JSON.stringify((error as any).errorDetails || {})}`
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
 * Helper: Call Gemini with image (multimodal)
 */
export async function callGeminiWithImage(
	prompt: string,
	imageBase64: string,
	mimeType: string = 'image/jpeg'
): Promise<string> {
	try {
		const generationConfig: any = {
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
