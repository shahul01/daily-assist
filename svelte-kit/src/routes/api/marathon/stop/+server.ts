import { json } from '@sveltejs/kit';
import { marathonOrchestrator } from '$lib/agents/marathonOrchestrator';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const userId = body?.userId;
		if (!userId || typeof userId !== 'string') {
			return json({ error: 'Missing or invalid userId' }, { status: 400 });
		}

		marathonOrchestrator.stop();
		const sessionId = marathonOrchestrator.getSessionId();

		return json({
			stopped: true,
			sessionId: sessionId ?? null,
			message: 'Marathon stop requested; session will end after current cycle.'
		});
	} catch (error) {
		console.error('Marathon stop API error:', error);
		return json(
			{
				error: 'Failed to stop marathon',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
