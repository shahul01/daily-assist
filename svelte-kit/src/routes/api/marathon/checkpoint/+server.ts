import { json } from '@sveltejs/kit';
import { loadLatestCheckpoint } from '$lib/agents/stateManager';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const sessionId = url.searchParams.get('sessionId');
		if (!sessionId) {
			return json({ error: 'Missing query: sessionId' }, { status: 400 });
		}

		const checkpoint = await loadLatestCheckpoint(sessionId);
		if (!checkpoint) {
			return json({ checkpoint: null, message: 'No checkpoint found for this session.' });
		}

		return json({
			checkpoint: {
				sequenceNumber: checkpoint.sequenceNumber,
				conversationHistory: checkpoint.conversationHistory,
				lastThoughtSignatureIds: checkpoint.lastThoughtSignatureIds,
				lastActionId: checkpoint.lastActionId
			}
		});
	} catch (error) {
		console.error('Marathon checkpoint API error:', error);
		return json(
			{
				error: 'Failed to get checkpoint',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
