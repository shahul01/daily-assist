import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractPageContent } from './contentExtractor';

describe('contentExtractor', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				url: 'https://example.com/page',
				ok: true,
				headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
				text: () =>
					Promise.resolve(
						`<!DOCTYPE html><html><head><title>Test Page Title</title></head><body><main><p>Main content here. &amp; entities.</p></main></body></html>`
					)
			})
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('extractPageContent returns title and content for valid HTML', async () => {
		const out = await extractPageContent('https://example.com/page');
		expect(out.url).toBe('https://example.com/page');
		expect(out.title).toBe('Test Page Title');
		expect(out.content).toContain('Main content here');
		expect(out.error).toBeUndefined();
	});

	it('rejects disallowed URLs', async () => {
		const out = await extractPageContent('http://localhost/');
		expect(out.error).toBe('URL not allowed');
		expect(out.content).toBe('');
	});

	it('returns error for non-HTML content-type', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				url: 'https://example.com/file.pdf',
				ok: true,
				headers: new Headers({ 'content-type': 'application/pdf' }),
				text: () => Promise.resolve('')
			})
		);
		const out = await extractPageContent('https://example.com/file.pdf');
		expect(out.error).toBe('Not HTML');
	});
});
