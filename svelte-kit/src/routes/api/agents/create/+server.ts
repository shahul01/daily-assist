import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createAgent,
	GenerateImageInputSchema,
	GenerateImageWithTextInputSchema,
	GenerateVideoInputSchema,
	GenerateVideoFromFramesInputSchema,
	ExtendVideoInputSchema,
	CreateCharacterProfileInputSchema
} from '$lib/agents/createAgent';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;
		const action = body.action as string;
		if (!action) {
			return json({ error: 'Missing action' }, { status: 400 });
		}

		switch (action) {
			case 'generateImage': {
				const validated = GenerateImageInputSchema.safeParse(body);
				if (!validated.success) {
					return json(
						{ error: 'Invalid request', details: validated.error.flatten() },
						{ status: 400 }
					);
				}
				const result = await createAgent.generateImage(validated.data);
				return json(result);
			}

			case 'generateImageWithText': {
				const validated = GenerateImageWithTextInputSchema.safeParse(body);
				if (!validated.success) {
					return json(
						{ error: 'Invalid request', details: validated.error.flatten() },
						{ status: 400 }
					);
				}
				const result = await createAgent.generateImageWithText(validated.data);
				return json(result);
			}

			case 'generateVideo': {
				const validated = GenerateVideoInputSchema.safeParse(body);
				if (!validated.success) {
					return json(
						{ error: 'Invalid request', details: validated.error.flatten() },
						{ status: 400 }
					);
				}
				const result = await createAgent.generateVideo(validated.data);
				return json(result);
			}

			case 'generateVideoFromFrames': {
				const validated = GenerateVideoFromFramesInputSchema.safeParse(body);
				if (!validated.success) {
					return json(
						{ error: 'Invalid request', details: validated.error.flatten() },
						{ status: 400 }
					);
				}
				const result = await createAgent.generateVideoFromFrames(validated.data);
				return json(result);
			}

			case 'extendVideo': {
				const validated = ExtendVideoInputSchema.safeParse(body);
				if (!validated.success) {
					return json(
						{ error: 'Invalid request', details: validated.error.flatten() },
						{ status: 400 }
					);
				}
				const result = await createAgent.extendVideo(validated.data);
				return json(result);
			}

			case 'createCharacterProfile': {
				const validated = CreateCharacterProfileInputSchema.safeParse(body);
				if (!validated.success) {
					return json(
						{ error: 'Invalid request', details: validated.error.flatten() },
						{ status: 400 }
					);
				}
				const result = await createAgent.createCharacterProfile(validated.data);
				return json(result);
			}

			case 'listCharacterProfiles': {
				const userId = (body.userId as string) ?? 'anonymous';
				const list = await createAgent.listCharacterProfiles(userId);
				return json(list);
			}

			case 'getCharacterProfile': {
				const profileId = body.profileId as string;
				const userId = (body.userId as string) ?? 'anonymous';
				if (!profileId) {
					return json({ error: 'Missing profileId' }, { status: 400 });
				}
				const profile = await createAgent.getCharacterProfile(profileId, userId);
				return json(profile ?? { error: 'Not found' }, { status: profile ? 200 : 404 });
			}

			case 'getGenerationHistory': {
				const userId = (body.userId as string) ?? 'anonymous';
				const type = body.type as 'image' | 'video' | undefined;
				const limit = typeof body.limit === 'number' ? body.limit : 50;
				const history = await createAgent.getGenerationHistory(userId, type, limit);
				return json(history);
			}

			case 'getMediaDownloadUrl': {
				const generationId = body.generationId as string;
				const userId = (body.userId as string) ?? 'anonymous';
				if (!generationId) {
					return json({ error: 'Missing generationId' }, { status: 400 });
				}
				const url = await createAgent.getMediaDownloadUrl(generationId, userId);
				return json({ url });
			}

			case 'deleteGeneration': {
				const generationId = body.generationId as string;
				const userId = (body.userId as string) ?? 'anonymous';
				if (!generationId) {
					return json({ error: 'Missing generationId' }, { status: 400 });
				}
				await createAgent.deleteGeneration(generationId, userId);
				return json({ ok: true });
			}

			default:
				return json({ error: 'Invalid action' }, { status: 400 });
		}
	} catch (error) {
		console.error('Create agent API error:', error);
		return json(
			{
				error: 'Create agent failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
