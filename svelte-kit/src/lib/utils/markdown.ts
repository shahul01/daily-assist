/**
 * Convert markdown to plain text suitable for text-to-speech.
 * Strips syntax (#, *, _, `, etc.) so TTS does not read "hashtag", "asterisk", etc.
 *
 * @param md - Raw markdown string
 * @returns Plain text safe for SpeechSynthesis
 */
export function markdownToPlainTextForTts(md: string): string {
	if (!md || typeof md !== 'string') return '';

	let text = md;

	// Code blocks: keep content only, drop ``` and language tag
	text = text.replace(/```[\w]*\s*([\s\S]*?)```/g, '$1');

	// Inline code: keep content only
	text = text.replace(/`([^`]+)`/g, '$1');

	// Images: speak alt text only; if no alt, skip
	text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt) => (alt ? alt : ''));

	// Links: speak link text only
	text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

	// Bold/italic: strip markers, keep text (order matters: double before single)
	text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
	text = text.replace(/__([^_]+)__/g, '$1');
	text = text.replace(/\*([^*]+)\*/g, '$1');
	text = text.replace(/_([^_]+)_/g, '$1');

	// Headings: remove # symbols only (do not say "heading" to keep natural)
	text = text.replace(/^#{1,6}\s+/gm, '');

	// Blockquote: remove > prefix per line
	text = text.replace(/^\s*>\s*/gm, '');

	// Unordered list markers
	text = text.replace(/^\s*[-*+]\s+/gm, '');

	// Ordered list markers
	text = text.replace(/^\s*\d+\.\s+/gm, '');

	// Horizontal rules: remove line
	text = text.replace(/^\s*[-*_]{2,}\s*$/gm, '');

	// Table pipes: replace with space so "a | b" doesn't sound odd
	text = text.replace(/\|/g, ' ');

	// Collapse multiple spaces/newlines to single space, trim
	text = text
		.replace(/\s+/g, ' ')
		.replace(/\n\s*\n/g, '\n')
		.trim();

	return text;
}
