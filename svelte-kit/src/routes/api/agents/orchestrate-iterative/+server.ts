import type { RequestHandler } from './$types';
import { orchestrator } from '$lib/agents/orchestrator';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		if (!body.userInput || !body.userId) {
			return new Response(
				JSON.stringify({ type: 'error', message: 'Missing required fields: userInput, userId' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const maxIterations = Math.min(Math.max(Number(body.maxIterations) || 10, 1), 20);
		const signal = request.signal;
		const allowMarathonSuggestion = body.allowMarathonSuggestion === true;

		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();
				try {
					for await (const event of orchestrator.processIterative(
						{
							userInput: String(body.userInput).trim(),
							userId: String(body.userId),
							conversationHistory: Array.isArray(body.conversationHistory)
								? body.conversationHistory
								: []
						},
						{ maxIterations, signal, allowMarathonSuggestion }
					)) {
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
	} catch (error) {
		console.error('Orchestrate-iterative API error:', error);
		return new Response(
			JSON.stringify({
				type: 'error',
				message: error instanceof Error ? error.message : 'Unknown error'
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
};
