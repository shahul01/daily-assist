import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		BRAVE_SEARCH_API_KEY: '',
		USE_DUCKDUCKGO_ONLY: 'true'
	}
}));

describe('webSearchService', () => {
	beforeEach(async () => {
		vi.resetModules();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				text: () =>
					Promise.resolve(`
            <div class="result">
              <a class="result__a" href="https://example.com/1">Title One</a>
              <div class="result__snippet">Snippet one text.</div>
            </div>
            <div class="result">
              <a class="result__a" href="https://example.com/2">Title Two</a>
              <div class="result__snippet">Snippet two.</div>
            </div>
          `)
			})
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('search returns normalized results from DuckDuckGo when USE_DUCKDUCKGO_ONLY', async () => {
		const { search } = await import('./webSearchService');
		const res = await search('test query');
		expect(res.query).toBe('test query');
		expect(res.provider).toBe('duckduckgo');
		expect(Array.isArray(res.results)).toBe(true);
	});
});
