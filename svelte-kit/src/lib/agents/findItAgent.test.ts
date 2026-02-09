import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	SearchFilesInputSchema,
	LocateDocumentInputSchema,
	ListDirectoryInputSchema,
	WebSearchInputSchema,
	findItAgent
} from './findItAgent';

vi.mock('$lib/services/webSearchService', () => ({
	search: vi.fn().mockResolvedValue({
		query: 'test',
		results: [
			{ title: 'A', url: 'https://a.example.com', snippet: 'Snippet A', position: 1 },
			{ title: 'B', url: 'https://b.example.com', snippet: 'Snippet B', position: 2 },
			{ title: 'C', url: 'https://c.example.com', snippet: 'Snippet C', position: 3 }
		],
		provider: 'brave'
	})
}));

vi.mock('$lib/utils/contentExtractor', () => ({
	extractPageContent: vi.fn().mockResolvedValue({
		url: 'https://a.example.com',
		title: 'Page A',
		content: 'Some page content here.'
	})
}));

vi.mock('$lib/utils/gemini', () => ({
	callGemini: vi
		.fn()
		.mockResolvedValueOnce({ text: 'Summary 1.' })
		.mockResolvedValueOnce({ text: 'Summary 2.' })
		.mockResolvedValueOnce({ text: 'Summary 3.' })
		.mockResolvedValue({ text: 'Synthesized answer from all sources.' })
}));

describe('FindItAgent schemas', () => {
	describe('SearchFilesInputSchema', () => {
		it('accepts empty object', () => {
			const out = SearchFilesInputSchema.parse({});
			expect(out.query).toBeUndefined();
			expect(out.userId).toBeUndefined();
		});

		it('accepts query and userId', () => {
			const out = SearchFilesInputSchema.parse({
				query: 'report.pdf',
				userId: 'user-1'
			});
			expect(out.query).toBe('report.pdf');
			expect(out.userId).toBe('user-1');
		});
	});

	describe('LocateDocumentInputSchema', () => {
		it('accepts name and userId', () => {
			const out = LocateDocumentInputSchema.parse({
				name: 'invoice',
				userId: 'user-2'
			});
			expect(out.name).toBe('invoice');
			expect(out.userId).toBe('user-2');
		});
	});

	describe('ListDirectoryInputSchema', () => {
		it('accepts path and userId', () => {
			const out = ListDirectoryInputSchema.parse({
				path: '/docs',
				userId: 'user-3'
			});
			expect(out.path).toBe('/docs');
			expect(out.userId).toBe('user-3');
		});
	});
});

describe('FindItAgent', () => {
	it('searchFiles returns message with guidance', async () => {
		const result = await findItAgent.searchFiles({ query: 'test', userId: 'u1' });
		expect(result).toHaveProperty('message');
		expect(typeof result.message).toBe('string');
		expect(result.message).toContain('Find-It');
	});

	it('locateDocument returns message with guidance', async () => {
		const result = await findItAgent.locateDocument({ name: 'doc', userId: 'u1' });
		expect(result).toHaveProperty('message');
		expect(result.message).toContain('Find-It');
	});

	it('listDirectory returns message with guidance', async () => {
		const result = await findItAgent.listDirectory({ path: '/', userId: 'u1' });
		expect(result).toHaveProperty('message');
		expect(result.message).toContain('Find-It');
	});
});

describe('WebSearchInputSchema', () => {
	it('requires non-empty query', () => {
		expect(() => WebSearchInputSchema.parse({ query: '' })).toThrow();
		WebSearchInputSchema.parse({ query: 'x' });
	});

	it('accepts optional userId', () => {
		const out = WebSearchInputSchema.parse({ query: 'test', userId: 'u1' });
		expect(out.userId).toBe('u1');
	});
});

describe('FindItAgent.webSearch', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns WebSearchResult with synthesizedAnswer and sources', async () => {
		const result = await findItAgent.webSearch({ query: 'test query' });
		expect(result).toHaveProperty('query', 'test query');
		expect(result).toHaveProperty('synthesizedAnswer');
		expect(result).toHaveProperty('sources');
		expect(Array.isArray(result.sources)).toBe(true);
		expect(result.sources.length).toBe(3);
		expect(result).toHaveProperty('provider', 'brave');
	});

	it('returns empty sources when search has no results', async () => {
		const { search } = await import('$lib/services/webSearchService');
		vi.mocked(search).mockResolvedValueOnce({
			query: 'x',
			results: [],
			provider: 'duckduckgo'
		});
		const result = await findItAgent.webSearch({ query: 'x' });
		expect(result.sources).toEqual([]);
		expect(result.synthesizedAnswer).toContain('No web results');
	});
});
