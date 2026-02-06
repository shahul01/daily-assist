import { z } from 'zod';
import {
	callGemini,
	callGeminiWithImage,
	callGeminiWithInlineData,
	parseGeminiJson
} from '$lib/utils/gemini';

/**
 * Input validation schema
 */
export const ReadAgentInputSchema = z.object({
	text: z.string().min(1, 'Text cannot be empty'),
	speed: z.enum(['slow', 'normal', 'fast']).optional().default('normal'),
	format: z.enum(['plain', 'structured']).optional().default('plain'),
	language: z.string().max(20).optional()
});

export type ReadAgentInput = z.infer<typeof ReadAgentInputSchema>;
/** Input type for read(): allows partial input; schema applies defaults. */
export type ReadAgentInputRaw = z.input<typeof ReadAgentInputSchema>;

/**
 * Output type
 */
export interface ReadAgentOutput {
	spokenText: string;
	summary?: string;
	thoughtSignature?: string;
}

export interface DocumentAnalysis {
	summary: string;
	sections: { title: string; content: string }[];
	tables: ExtractedTable[];
	keyPoints: string[];
}

export interface ExtractedTable {
	headers: string[];
	rows: string[][];
	caption?: string;
}

export interface FormFieldAnalysis {
	fields: { name: string; type: string; required: boolean; value?: string }[];
	instructions: string;
	description: string;
}

/**
 * Read-To-Me Agent
 *
 * Purpose: Convert text to speech-friendly format for vision/reading disabilities
 * Thinking Level: LOW for speed-critical paths, MEDIUM for document intelligence
 */
export class ReadAgent {
	/**
	 * Process text for text-to-speech
	 */
	async read(input: ReadAgentInputRaw): Promise<ReadAgentOutput> {
		const validatedInput = ReadAgentInputSchema.parse(input);

		const systemPrompt = `You are a Read-To-Me assistant for people with vision disabilities.
Your job: Convert text into natural, speech-friendly format.

Rules:
1. Remove unnecessary formatting (markdown, HTML tags)
2. Spell out acronyms on first use
3. Add natural pauses with punctuation
4. Keep it conversational and clear
5. For long text, provide a brief summary first
${validatedInput.language ? `6. Preserve or adapt for language: ${validatedInput.language}` : ''}

Speed setting: ${validatedInput.speed}
${validatedInput.speed === 'slow' ? '- Use shorter sentences\n- Add more pauses' : ''}
${validatedInput.speed === 'fast' ? '- Keep it concise\n- Skip redundant details' : ''}`;

		const prompt = `Read this text aloud (convert to speech-friendly format):\n\n${validatedInput.text}`;

		const result = await callGemini({
			prompt,
			model: 'gemini-3-flash-preview',
			thinkingLevel: 'low',
			systemPrompt
		});

		return {
			spokenText: result.text,
			thoughtSignature: result.thoughtSignature
		};
	}

	/**
	 * Read image (OCR + description for blind users)
	 */
	async readImage(imageBase64: string, mimeType: string = 'image/jpeg'): Promise<string> {
		const prompt = `Describe this image in detail for a blind person:
1. What objects are visible?
2. What text appears (OCR)? Extract all visible text.
3. What colors are present?
4. What is the spatial layout?
5. What is the main purpose/message?

Be thorough but concise. Support multi-language text.`;
		return await callGeminiWithImage(prompt, imageBase64, mimeType);
	}

	/**
	 * Read PDF: extract and summarize content (Gemini native PDF support)
	 */
	async readPDF(pdfBase64: string): Promise<string> {
		const prompt = `Extract and present all text from this PDF in reading order.
Format for text-to-speech: clear paragraphs, no markdown.
Include headings, lists, and body text. If there are tables, describe them in prose.
If the document is in a non-English language, keep that language.`;
		return await callGeminiWithInlineData(prompt, pdfBase64, 'application/pdf', {
			thinkingLevel: 'medium'
		});
	}

	/**
	 * Document intelligence: full analysis (sections, tables, key points)
	 */
	async analyzePDF(pdfBase64: string): Promise<DocumentAnalysis> {
		const prompt = `Analyze this PDF document. Reply with a single JSON object (no markdown fences) with:
- summary: string (2-3 sentence overview)
- sections: array of { title: string, content: string }
- tables: array of { headers: string[], rows: string[][], caption?: string }
- keyPoints: string[]

Extract all text and structure. For tables, use headers and rows arrays.`;
		const text = await callGeminiWithInlineData(prompt, pdfBase64, 'application/pdf', {
			thinkingLevel: 'medium',
			model: 'gemini-3-pro-preview'
		});
		const parsed = parseGeminiJson(text) as DocumentAnalysis;
		if (!parsed || typeof parsed.summary !== 'string') {
			throw new Error('Invalid document analysis response');
		}
		return {
			summary: parsed.summary ?? '',
			sections: Array.isArray(parsed.sections) ? parsed.sections : [],
			tables: Array.isArray(parsed.tables) ? parsed.tables : [],
			keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : []
		};
	}

	/**
	 * Extract tables from image or PDF (single image)
	 */
	async extractTables(
		imageBase64: string,
		mimeType: string = 'image/jpeg'
	): Promise<ExtractedTable[]> {
		const prompt = `Extract every table from this image. Reply with a single JSON array (no markdown fences).
Each table: { headers: string[], rows: string[][] , caption?: string }.
Preserve cell order and structure. If no tables, return [].`;
		const text = await callGeminiWithImage(prompt, imageBase64, mimeType);
		const parsed = parseGeminiJson(text) as ExtractedTable[] | { tables: ExtractedTable[] };
		const arr = Array.isArray(parsed) ? parsed : (parsed as { tables: ExtractedTable[] })?.tables;
		return Array.isArray(arr) ? arr : [];
	}

	/**
	 * Analyze a form (image): fields, labels, required/optional
	 */
	async analyzeForm(
		imageBase64: string,
		mimeType: string = 'image/jpeg'
	): Promise<FormFieldAnalysis> {
		const prompt = `Analyze this form image for a blind user. Reply with a single JSON object (no markdown fences):
- fields: array of { name: string, type: "text"|"checkbox"|"radio"|"select"|"date"|"other", required: boolean, value?: string }
- instructions: string (any form-level instructions)
- description: string (overall form purpose)

Extract every field label and indicate if required.`;
		const text = await callGeminiWithImage(prompt, imageBase64, mimeType);
		const parsed = parseGeminiJson(text) as FormFieldAnalysis;
		if (!parsed || !Array.isArray(parsed.fields)) {
			throw new Error('Invalid form analysis response');
		}
		return {
			fields: parsed.fields,
			instructions: parsed.instructions ?? '',
			description: parsed.description ?? ''
		};
	}

	/**
	 * Describe a chart or diagram with data and insights
	 */
	async describeChart(imageBase64: string, mimeType: string = 'image/jpeg'): Promise<string> {
		const prompt = `Describe this chart, graph, or diagram for a blind person.
1. Chart type (bar, line, pie, scatter, flowchart, etc.)
2. Axes, labels, legend
3. Data points and values
4. Key trend or insight in one sentence
5. Any text annotations

Be precise with numbers. Keep description clear for text-to-speech.`;
		return await callGeminiWithImage(prompt, imageBase64, mimeType);
	}

	/**
	 * Real-time text detection from a single frame (for camera pipeline).
	 * Returns detected text strings; caller handles debouncing and TTS.
	 */
	async readVisibleText(imageBase64: string, mimeType: string = 'image/jpeg'): Promise<string[]> {
		const prompt = `List all text visible in this image, in reading order. Reply with a JSON array of strings, one per line or text block. No other text. Example: ["Line 1", "Line 2"]. If no text, return [].`;
		const text = await callGeminiWithImage(prompt, imageBase64, mimeType);
		const parsed = parseGeminiJson(text) as string[] | { text: string[] };
		const arr = Array.isArray(parsed) ? parsed : (parsed as { text?: string[] })?.text;
		return Array.isArray(arr) ? arr : [];
	}
}

export const readAgent = new ReadAgent();
