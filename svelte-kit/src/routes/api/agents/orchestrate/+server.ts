import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { orchestrator } from '$lib/agents/orchestrator';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Validate required fields
		if (!body.userInput || !body.userId) {
			return json(
				{ error: 'Missing required fields: userInput, userId' },
				{ status: 400 }
			);
		}

		const result = await orchestrator.process({
			userInput: body.userInput,
			userId: body.userId,
			conversationHistory: body.conversationHistory || []
		});

		return json(result);
	} catch (error) {
		console.error('Orchestrate API error:', error);
		return json(
			{
				error: 'Orchestration failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};