import { z } from 'zod';

/**
 * Find-It Agent: Search, navigate, locate files.
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

export type SearchFilesInput = z.infer<typeof SearchFilesInputSchema>;
export type LocateDocumentInput = z.infer<typeof LocateDocumentInputSchema>;
export type ListDirectoryInput = z.infer<typeof ListDirectoryInputSchema>;

export interface FindItResult {
	message: string;
	matches?: Array<{ name: string; path?: string }>;
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
}

export const findItAgent = new FindItAgent();
