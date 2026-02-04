import { env } from '$env/dynamic/private';

const EMBEDDING_DIM = 768;
const GEMINI_EMBED_MODEL = 'text-embedding-004';

export interface EmbeddingInput {
	text: string;
}

export interface EmbeddingResult {
	values: number[];
}

/**
 * Generate embedding for a single text using Gemini REST API (768 dimensions for pgvector).
 * Server-only; uses GEMINI_API_KEY or VITE_GEMINI_API_KEY from private env.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
	const apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;
	if (!apiKey) throw new Error('GEMINI_API_KEY or VITE_GEMINI_API_KEY must be set');

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent?key=${apiKey}`;
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			content: { parts: [{ text }] },
			output_dimensionality: EMBEDDING_DIM
		})
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Gemini embedding failed: ${res.status} ${err}`);
	}

	const data = (await res.json()) as { embedding?: { values?: number[] } };
	const values = data.embedding?.values;
	if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
		throw new Error(`Unexpected embedding shape: got ${values?.length ?? 0}, expected ${EMBEDDING_DIM}`);
	}
	return values;
}

/**
 * Batch generate embeddings. Prefer this when storing multiple memories.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
	if (texts.length === 0) return [];
	if (texts.length === 1) return [await generateEmbedding(texts[0])];
	return Promise.all(texts.map((t) => generateEmbedding(t)));
}
