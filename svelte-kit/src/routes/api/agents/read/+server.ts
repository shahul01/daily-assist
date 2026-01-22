import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readAgent } from '$lib/agents/readAgent';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Text reading
		if (body.text) {
			const result = await readAgent.read({
				text: body.text,
				speed: body.speed || 'normal',
				format: body.format || 'plain'
			});
			return json(result);
		}

		// Image reading
		if (body.imageBase64) {
			const result = await readAgent.readImage(
				body.imageBase64,
				body.mimeType || 'image/jpeg'
			);
			return json({ description: result });
		}

		return json({ error: 'Missing text or imageBase64' }, { status: 400 });
	} catch (error) {
		console.error('Read agent API error:', error);
		return json(
			{
				error: 'Read agent failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};