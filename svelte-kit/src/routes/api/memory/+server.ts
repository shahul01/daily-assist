import { json } from '@sveltejs/kit';
import { getMemorySummary, retrieve } from '$lib/memory';
import type { RequestHandler } from './$types';

/**
 * GET: Memory summary for user (preferences, goals, todos, learned patterns).
 * Query: userId (required)
 */
export const GET: RequestHandler = async ({ url }) => {
	const userId = url.searchParams.get('userId');
	if (!userId) {
		return json({ error: 'Missing userId' }, { status: 400 });
	}
	try {
		const summary = await getMemorySummary(userId);
		return json(summary);
	} catch (error) {
		console.error('Memory summary error:', error);
		return json(
			{
				error: 'Failed to get memory summary',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

/**
 * POST: Semantic search over user memories.
 * Body: { userId: string, query: string, limit?: number }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const userId = body?.userId;
		const query = body?.query;
		if (!userId || typeof query !== 'string') {
			return json({ error: 'Missing userId or query' }, { status: 400 });
		}
		const memories = await retrieve(userId, query, {
			limit: body.limit ?? 5,
			includeRelated: body.includeRelated !== false
		});
		return json({ memories });
	} catch (error) {
		console.error('Memory retrieve error:', error);
		return json(
			{
				error: 'Retrieve failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
