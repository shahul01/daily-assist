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
			throw new Error(`Read agent failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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