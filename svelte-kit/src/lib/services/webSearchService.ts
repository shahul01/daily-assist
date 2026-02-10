/**
 * Web search: Brave Search API (primary) with DuckDuckGo HTML fallback.
 * Server-only; uses BRAVE_SEARCH_API_KEY. Set USE_DUCKDUCKGO_ONLY=true to skip Brave.
 */
import { env } from '$env/dynamic/private';

const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';
const DDG_HTML_URL = 'https://html.duckduckgo.com/html/';

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; DailyAssist/1.0; +https://github.com/daily-assist)';

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	position: number;
}

export interface SearchResponse {
	query: string;
	results: SearchResult[];
	provider: 'brave' | 'duckduckgo';
}

function getBraveApiKey(): string | null {
	return env.BRAVE_SEARCH_API_KEY ?? null;
}

function useDuckDuckGoOnly(): boolean {
	return env.USE_DUCKDUCKGO_ONLY === 'true' || env.USE_DUCKDUCKGO_ONLY === '1';
}

function fetchWithTimeout(
	url: string,
	options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
	const { timeout = FETCH_TIMEOUT_MS, ...fetchOptions } = options;
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeout);
	return fetch(url, {
		...fetchOptions,
		signal: controller.signal,
		headers: {
			'User-Agent': USER_AGENT,
			...(fetchOptions.headers as Record<string, string>)
		}
	}).finally(() => clearTimeout(id));
}

/**
 * Search via Brave Search API.
 */
async function searchBrave(query: string): Promise<SearchResponse> {
	const key = getBraveApiKey();
	if (!key?.trim()) {
		throw new Error('BRAVE_SEARCH_API_KEY is not set');
	}
	const res = await fetchWithTimeout(`${BRAVE_API_URL}?q=${encodeURIComponent(query)}&count=10`, {
		headers: {
			Accept: 'application/json',
			'X-Subscription-Token': key
		}
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Brave API error ${res.status}: ${body.slice(0, 200)}`);
	}
	const data = (await res.json()) as {
		web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
	};
	const results: SearchResult[] = (data.web?.results ?? []).map((r, i) => ({
		title: r.title ?? '',
		url: r.url ?? '',
		snippet: r.description ?? '',
		position: i + 1
	}));
	return { query, results, provider: 'brave' };
}

/**
 * Search via DuckDuckGo HTML (no API key). Parses result list from HTML.
 */
async function searchDuckDuckGo(query: string): Promise<SearchResponse> {
	const body = new URLSearchParams({ q: query });
	const res = await fetchWithTimeout(DDG_HTML_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString()
	});
	if (!res.ok) {
		throw new Error(`DuckDuckGo error ${res.status}`);
	}
	const html = await res.text();
	const results = parseDuckDuckGoHtml(html);
	return { query, results, provider: 'duckduckgo' };
}

/**
 * Parse DuckDuckGo HTML results. Structure: .result .result__a (link), .result__snippet (snippet).
 */
function parseDuckDuckGoHtml(html: string): SearchResult[] {
	const results: SearchResult[] = [];
	// Match result blocks: class="result" then result__a and result__snippet
	const resultBlockRegex =
		/class="result[^"]*"[^>]*>[\s\S]*?<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/)/gi;
	let m: RegExpExecArray | null;
	while ((m = resultBlockRegex.exec(html)) !== null) {
		const rawUrl = m[1];
		const title = stripHtml(m[2]).trim().slice(0, 300);
		const snippet = stripHtml(m[3]).trim().slice(0, 500);
		let url: string;
		try {
			// DDG gives redirect URLs like //duckduckgo.com/l/?uddg=...
			if (rawUrl.startsWith('//')) {
				url = new URL(rawUrl, 'https://duckduckgo.com').href;
			} else {
				url = new URL(rawUrl).href;
			}
		} catch {
			continue;
		}
		if (!isAllowedUrl(url)) continue;
		results.push({
			title: title || 'Untitled',
			url,
			snippet: snippet || '',
			position: results.length + 1
		});
		if (results.length >= 10) break;
	}
	return results;
}

function stripHtml(html: string): string {
	return html
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Only allow http/https and block localhost / private IPs.
 */
function isAllowedUrl(url: string): boolean {
	try {
		const u = new URL(url);
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
		const host = u.hostname.toLowerCase();
		if (host === 'localhost' || host === '127.0.0.1') return false;
		if (host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.'))
			return false;
		return true;
	} catch {
		return false;
	}
}

/**
 * Perform web search. Uses Brave if key is set and USE_DUCKDUCKGO_ONLY is not true; else DuckDuckGo.
 */
export async function search(query: string): Promise<SearchResponse> {
	const q = query.trim();
	if (!q) {
		return { query: q, results: [], provider: 'duckduckgo' };
	}

	const useBrave = !useDuckDuckGoOnly() && getBraveApiKey();

	if (useBrave) {
		try {
			return await searchBrave(q);
		} catch (err) {
			console.warn('Brave search failed, falling back to DuckDuckGo:', err);
		}
	}

	return searchDuckDuckGo(q);
}
