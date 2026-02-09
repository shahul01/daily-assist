import { z } from 'zod';
import { callGemini } from '$lib/utils/gemini';
import { search } from '$lib/services/webSearchService';
import { extractPageContent } from '$lib/utils/contentExtractor';

/**
 * Find-It Agent: Search, navigate, locate files; web search for top pages + summaries.
 * Browser cannot expose full file system to server; use Find-It panel for client-side search.
 */

export const SearchFilesInputSchema = z.object({
	query: z.string().optional(),
	userId: z.string().optional()
});

export const LocateDocumentInputSchema = z.object({
	name: z.string().optional(),
	userId: z.string().optional()
});

export const ListDirectoryInputSchema = z.object({
	path: z.string().optional(),
	userId: z.string().optional()
});

export const WebSearchInputSchema = z.object({
	query: z.string().min(1, 'Query is required'),
	userId: z.string().optional()
});

export type SearchFilesInput = z.infer<typeof SearchFilesInputSchema>;
export type LocateDocumentInput = z.infer<typeof LocateDocumentInputSchema>;
export type ListDirectoryInput = z.infer<typeof ListDirectoryInputSchema>;
export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

export interface FindItResult {
	message: string;
	matches?: Array<{ name: string; path?: string }>;
}

export interface WebSearchSource {
	title: string;
	url: string;
	snippet: string;
	summary: string;
}

export interface WebSearchResult {
	query: string;
	synthesizedAnswer: string;
	sources: WebSearchSource[];
	provider: 'brave' | 'duckduckgo';
}

export const DrugSearchInputSchema = z.object({
	medicineName: z.string().min(1, 'Medicine name is required'),
	context: z.string().optional(),
	userId: z.string().optional()
});
export type DrugSearchInput = z.infer<typeof DrugSearchInputSchema>;

export interface DrugInfoResult {
	medicineName: string;
	commonUses: string[];
	sideEffects: string[];
	interactions: string[];
	dangerLevel: 'low' | 'medium' | 'high' | 'critical';
	emergencyIndicators: string[];
	synthesizedSummary: string;
	webSources?: WebSearchSource[];
}

export class FindItAgent {
	async searchFiles(input: SearchFilesInput): Promise<FindItResult> {
		SearchFilesInputSchema.parse(input);
		return {
			message:
				'Use the Find-It panel in Tools to search your files. Open the Tools tab, select Find-It, and choose a folder to search.'
		};
	}

	async locateDocument(input: LocateDocumentInput): Promise<FindItResult> {
		LocateDocumentInputSchema.parse(input);
		return {
			message:
				'Use the Find-It panel in Tools to locate documents. Open Tools → Find-It and select a folder to browse.'
		};
	}

	async listDirectory(input: ListDirectoryInput): Promise<FindItResult> {
		ListDirectoryInputSchema.parse(input);
		return {
			message:
				'Use the Find-It panel in Tools to list directory contents. Open Tools → Find-It and choose a folder.'
		};
	}

	/**
	 * Web search: top 3 pages fetched, summarized with Gemini, then synthesized answer.
	 */
	async webSearch(input: WebSearchInput): Promise<WebSearchResult> {
		const { query } = WebSearchInputSchema.parse(input);
		const searchResponse = await search(query);
		const top3 = searchResponse.results.slice(0, 3);
		if (top3.length === 0) {
			return {
				query,
				synthesizedAnswer: 'No web results found for that query. Try different keywords.',
				sources: [],
				provider: searchResponse.provider
			};
		}

		const pageContents = await Promise.allSettled(top3.map((r) => extractPageContent(r.url)));

		const summaries: string[] = [];
		for (let i = 0; i < top3.length; i++) {
			const settled = pageContents[i];
			const result = top3[i];
			let summary: string;
			if (settled?.status === 'fulfilled' && settled.value.content?.trim()) {
				try {
					const res = await callGemini({
						prompt: `Summarize this web page content in 2-3 sentences. Be concise.\n\nContent:\n${settled.value.content.slice(0, 4000)}`,
						model: 'gemini-2.5-flash',
						thinkingLevel: 'low'
					});
					summary = res.text?.trim() || result.snippet || 'No summary available.';
				} catch {
					summary = result.snippet || 'Summary unavailable.';
				}
			} else {
				summary = result.snippet || 'Page could not be loaded.';
			}
			summaries.push(summary);
		}

		const summariesBlock = top3.map((r, i) => `[${r.title}]: ${summaries[i]}`).join('\n\n');
		let synthesizedAnswer: string;
		try {
			const res = await callGemini({
				prompt: `The user asked: "${query}"\n\nBased only on these source summaries, provide a clear, concise answer. Do not invent information.\n\nSummaries:\n${summariesBlock}`,
				model: 'gemini-2.5-flash',
				thinkingLevel: 'low'
			});
			synthesizedAnswer = res.text?.trim() || 'Unable to synthesize an answer.';
		} catch {
			synthesizedAnswer = `Found ${top3.length} source(s). See links below for details.`;
		}

		const sources: WebSearchSource[] = top3.map((r, i) => {
			const extracted = pageContents[i]?.status === 'fulfilled' ? pageContents[i].value : null;
			return {
				title: extracted?.title?.trim() ? extracted.title : r.title,
				url: extracted?.url ?? r.url,
				snippet: r.snippet,
				summary: summaries[i] ?? r.snippet
			};
		});

		return {
			query,
			synthesizedAnswer,
			sources,
			provider: searchResponse.provider
		};
	}

	/**
	 * Drug information for safety: uses, side effects, interactions, danger level.
	 * Uses LLM with high thinking; optionally augments with web search.
	 */
	async searchDrugInfo(input: DrugSearchInput): Promise<DrugInfoResult> {
		const { medicineName, context } = DrugSearchInputSchema.parse(input);
		let webContext = '';
		let webSources: WebSearchSource[] = [];
		try {
			const web = await this.webSearch({
				query: `${medicineName} drug side effects uses`,
				userId: input.userId
			});
			webContext = web.synthesizedAnswer;
			webSources = web.sources;
		} catch {
			// Proceed with LLM only
		}

		const prompt = `You are providing drug safety information. Medicine/drug name: "${medicineName}"${context ? `\nAdditional context: ${context}` : ''}${webContext ? `\n\nWeb search summary (use to inform your answer):\n${webContext}` : ''}

Return a JSON object only (no markdown, no code fences) with:
- commonUses: string[] (brief)
- sideEffects: string[]
- interactions: string[] (with other drugs or substances)
- dangerLevel: "low" | "medium" | "high" | "critical" (overall risk for misuse or emergency)
- emergencyIndicators: string[] (when to seek emergency help)
- synthesizedSummary: string (2-3 sentences for the user)
If uncertain, use dangerLevel "medium" and note uncertainty in synthesizedSummary.`;
		const res = await callGemini({
			prompt,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'high'
		});
		const text = res?.text ?? '{}';
		const start = text.indexOf('{');
		const end = text.lastIndexOf('}') + 1;
		const parsed =
			start >= 0 && end > start
				? (JSON.parse(text.slice(start, end)) as Record<string, unknown>)
				: {};

		return {
			medicineName,
			commonUses: Array.isArray(parsed.commonUses)
				? (parsed.commonUses as string[]).filter((s) => typeof s === 'string')
				: [],
			sideEffects: Array.isArray(parsed.sideEffects)
				? (parsed.sideEffects as string[]).filter((s) => typeof s === 'string')
				: [],
			interactions: Array.isArray(parsed.interactions)
				? (parsed.interactions as string[]).filter((s) => typeof s === 'string')
				: [],
			dangerLevel:
				parsed.dangerLevel === 'critical' ||
				parsed.dangerLevel === 'high' ||
				parsed.dangerLevel === 'medium'
					? (parsed.dangerLevel as 'low' | 'medium' | 'high' | 'critical')
					: 'low',
			emergencyIndicators: Array.isArray(parsed.emergencyIndicators)
				? (parsed.emergencyIndicators as string[]).filter((s) => typeof s === 'string')
				: [],
			synthesizedSummary:
				typeof parsed.synthesizedSummary === 'string'
					? parsed.synthesizedSummary
					: 'Unable to retrieve drug information. Consult a doctor or pharmacist.',
			webSources: webSources.length > 0 ? webSources : undefined
		};
	}
}

export const findItAgent = new FindItAgent();
