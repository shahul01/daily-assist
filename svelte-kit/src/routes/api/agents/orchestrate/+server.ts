import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { orchestrator } from '$lib/agents/orchestrator';

const STREAM_ACCEPT = 'text/event-stream';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		if (!body.userInput || !body.userId) {
			return json(
				{ error: 'Missing required fields: userInput, userId' },
				{ status: 400 }
			);
		}

		const wantsStream = request.headers.get('Accept')?.includes(STREAM_ACCEPT) ?? body.stream === true;

		if (wantsStream) {
			const stream = new ReadableStream({
				async start(controller) {
					const encoder = new TextEncoder();
					try {
						for await (const event of orchestrator.processStream({
							userInput: body.userInput,
							userId: body.userId,
							conversationHistory: body.conversationHistory || []
						})) {
							controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
						}
					} catch (err) {
						controller.enqueue(
							encoder.encode(
								JSON.stringify({
									type: 'error',
									message: err instanceof Error ? err.message : 'Unknown error'
								}) + '\n'
							)
						);
					} finally {
						controller.close();
					}
				}
			});

			return new Response(stream, {
				headers: {
					'Content-Type': 'application/x-ndjson',
					'Cache-Control': 'no-cache',
					Connection: 'keep-alive'
				}
			});
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