import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readAgent } from '$lib/agents/readAgent';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;

		// Text reading
		if (body.text && typeof body.text === 'string') {
			const result = await readAgent.read({
				text: body.text,
				speed: (body.speed as 'slow' | 'normal' | 'fast') || 'normal',
				format: (body.format as 'plain' | 'structured') || 'plain',
				language: typeof body.language === 'string' ? body.language : undefined
			});
			return json(result);
		}

		// Image reading
		if (body.imageBase64 && typeof body.imageBase64 === 'string') {
			const mimeType = (body.mimeType as string) || 'image/jpeg';
			const result = await readAgent.readImage(body.imageBase64, mimeType);
			return json({ description: result });
		}

		// PDF reading
		if (body.pdfBase64 && typeof body.pdfBase64 === 'string') {
			const spokenText = await readAgent.readPDF(body.pdfBase64);
			return json({ spokenText, description: spokenText });
		}

		// Document intelligence: analyze PDF (sections, tables, key points)
		if (body.analyzePdf && typeof body.analyzePdf === 'string') {
			const analysis = await readAgent.analyzePDF(body.analyzePdf);
			return json(analysis);
		}

		// Table extraction from image
		if (body.extractTables && typeof body.extractTables === 'string') {
			const mimeType = (body.extractTablesMimeType as string) || 'image/jpeg';
			const tables = await readAgent.extractTables(body.extractTables, mimeType);
			return json({ tables });
		}

		// Form analysis from image
		if (body.analyzeForm && typeof body.analyzeForm === 'string') {
			const mimeType = (body.analyzeFormMimeType as string) || 'image/jpeg';
			const form = await readAgent.analyzeForm(body.analyzeForm, mimeType);
			return json(form);
		}

		// Chart/diagram description
		if (body.describeChart && typeof body.describeChart === 'string') {
			const mimeType = (body.describeChartMimeType as string) || 'image/jpeg';
			const description = await readAgent.describeChart(body.describeChart, mimeType);
			return json({ description });
		}

		// Real-time camera frame: detect visible text (for camera pipeline)
		if (body.cameraFrame && typeof body.cameraFrame === 'string') {
			const mimeType = (body.cameraFrameMimeType as string) || 'image/jpeg';
			const text = await readAgent.readVisibleText(body.cameraFrame, mimeType);
			return json({ text });
		}

		return json(
			{
				error:
					'Missing payload: provide text, imageBase64, pdfBase64, or document intelligence params'
			},
			{ status: 400 }
		);
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
