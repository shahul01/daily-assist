import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findItAgent } from '$lib/agents/findItAgent';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;
		const action = typeof body.action === 'string' ? body.action : '';

		if (action === 'search_files') {
			const result = await findItAgent.searchFiles({
				query: typeof body.query === 'string' ? body.query : undefined,
				userId: typeof body.userId === 'string' ? body.userId : undefined
			});
			return json(result);
		}
		if (action === 'locate_document') {
			const result = await findItAgent.locateDocument({
				name: typeof body.name === 'string' ? body.name : undefined,
				userId: typeof body.userId === 'string' ? body.userId : undefined
			});
			return json(result);
		}
		if (action === 'list_directory') {
			const result = await findItAgent.listDirectory({
				path: typeof body.path === 'string' ? body.path : undefined,
				userId: typeof body.userId === 'string' ? body.userId : undefined
			});
			return json(result);
		}

		return json(
			{ error: 'Missing or invalid action: use search_files, locate_document, or list_directory' },
			{ status: 400 }
		);
	} catch (error) {
		console.error('Find-It agent API error:', error);
		return json(
			{
				error: 'Find-It agent failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
