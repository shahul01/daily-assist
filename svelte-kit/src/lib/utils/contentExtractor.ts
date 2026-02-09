/**
 * Fetch web page HTML and extract main text content for summarization.
 * Used by Find-It web search to read top results. Server-safe (no DOM).
 */

const FETCH_TIMEOUT_MS = 8_000;
const MAX_CONTENT_CHARS = 8_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; DailyAssist/1.0; +https://github.com/daily-assist)';

export interface ExtractedContent {
	url: string;
	title: string;
	content: string;
	error?: string;
}

const BLOCK_TAGS =
	/<(script|style|nav|header|footer|aside|iframe|noscript|form)[^>]*>[\s\S]*?<\/\1>/gi;
const ANY_TAG = /<[^>]+>/g;
const MULTI_SPACE = /\s+/g;
function decodeEntities(s: string): string {
	return s
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

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

function extractTitle(html: string): string {
	const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (m) {
		return decodeAndClean(m[1]).slice(0, 200);
	}
	return 'Untitled';
}

function decodeAndClean(s: string): string {
	return decodeEntities(s).replace(ANY_TAG, ' ').replace(MULTI_SPACE, ' ').trim();
}

/**
 * Strip scripts/styles and extract text from body. Limit length.
 */
function htmlToText(html: string): string {
	let text = html.replace(BLOCK_TAGS, ' ');
	// Prefer <main> or <article>, else <body>
	const mainMatch = text.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
	const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	const chunk = mainMatch?.[1] ?? bodyMatch?.[1] ?? text;
	text = decodeEntities(chunk.replace(ANY_TAG, ' ').replace(MULTI_SPACE, ' '));
	return text.trim().slice(0, MAX_CONTENT_CHARS);
}

/**
 * Fetch URL and extract title + main text. Follows redirects; returns final URL.
 */
export async function extractPageContent(url: string): Promise<ExtractedContent> {
	if (!isAllowedUrl(url)) {
		return { url, title: '', content: '', error: 'URL not allowed' };
	}
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: { 'User-Agent': USER_AGENT },
			redirect: 'follow'
		});
		const finalUrl = res.url || url;
		if (!res.ok) {
			return {
				url: finalUrl,
				title: '',
				content: '',
				error: `HTTP ${res.status}`
			};
		}
		const contentType = res.headers.get('content-type') ?? '';
		if (!contentType.includes('text/html')) {
			return {
				url: finalUrl,
				title: '',
				content: '',
				error: 'Not HTML'
			};
		}
		const html = await res.text();
		const title = extractTitle(html);
		const content = htmlToText(html);
		return { url: finalUrl, title, content };
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Unknown error';
		return {
			url,
			title: '',
			content: '',
			error: message.includes('abort') ? 'Timeout' : message
		};
	} finally {
		clearTimeout(timeoutId);
	}
}
