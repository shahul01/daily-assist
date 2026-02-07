import { z } from 'zod';
import {
	generateImageWithGemini,
	generateVideoWithVeo,
	extendVideoWithVeo,
	type GenerateImageOptions,
	type GenerateVideoOptions
} from '$lib/utils/gemini';
import { supabaseServer } from '$lib/server/supabase';
import {
	uploadGeneratedMedia,
	getSignedDownloadUrl,
	scheduleExpirationNotifications,
	deleteExpiredMedia
} from '$lib/server/storage';
import type { Database } from '$lib/types/database.types';

type CreateAgentGenerationRow = Database['public']['Tables']['create_agent_generations']['Row'];
type CreateAgentGenerationInsert =
	Database['public']['Tables']['create_agent_generations']['Insert'];
type CreateAgentGenerationUpdate =
	Database['public']['Tables']['create_agent_generations']['Update'];
type CharacterProfileRow = Database['public']['Tables']['character_profiles']['Row'];
type CharacterProfileInsert = Database['public']['Tables']['character_profiles']['Insert'];
type CharacterProfileUpdate = Database['public']['Tables']['character_profiles']['Update'];

const IMAGE_MODEL = 'gemini-3-pro-image-preview';
const VIDEO_MODEL = 'veo-3.1-generate-preview';
const EXPIRATION_DAYS = 3;

export const GenerateImageInputSchema = z.object({
	prompt: z.string().min(5).max(2000),
	resolution: z.enum(['1K', '2K', '4K']).optional(),
	aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional(),
	characterProfileId: z.string().uuid().optional(),
	negativePrompt: z.string().optional(),
	userId: z.string().min(1)
});
export type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;

export const GenerateImageWithTextInputSchema = z.object({
	prompt: z.string().min(5).max(2000),
	textContent: z.string().max(500),
	resolution: z.enum(['2K', '4K']).optional(),
	aspectRatio: z.enum(['1:1', '16:9', '4:3']).optional(),
	userId: z.string().min(1)
});
export type GenerateImageWithTextInput = z.infer<typeof GenerateImageWithTextInputSchema>;

export const GenerateVideoInputSchema = z.object({
	prompt: z.string().min(10).max(2000),
	durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).optional(),
	resolution: z.enum(['720p', '1080p', '4K']).optional(),
	aspectRatio: z.enum(['16:9', '9:16']).optional(),
	characterProfileId: z.string().uuid().optional(),
	includeAudio: z.boolean().optional(),
	userId: z.string().min(1)
});
export type GenerateVideoInput = z.infer<typeof GenerateVideoInputSchema>;

export const GenerateVideoFromFramesInputSchema = z.object({
	prompt: z.string().min(10).max(2000),
	startImageBase64: z.string().min(1),
	endImageBase64: z.string().min(1),
	durationSeconds: z.union([z.literal(8)]).optional(),
	resolution: z.enum(['720p', '1080p']).optional(),
	aspectRatio: z.enum(['16:9', '9:16']).optional(),
	userId: z.string().min(1)
});
export type GenerateVideoFromFramesInput = z.infer<typeof GenerateVideoFromFramesInputSchema>;

export const ExtendVideoInputSchema = z.object({
	generationId: z.string().uuid(),
	extensionPrompt: z.string().min(5).max(1000),
	userId: z.string().min(1)
});
export type ExtendVideoInput = z.infer<typeof ExtendVideoInputSchema>;

export const CreateCharacterProfileInputSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(1000).optional(),
	referenceImagesBase64: z.array(z.string().min(1)).min(1).max(3),
	userId: z.string().min(1)
});
export type CreateCharacterProfileInput = z.infer<typeof CreateCharacterProfileInputSchema>;

export interface GeneratedImage {
	id: string;
	imageBase64: string;
	mimeType: string;
	resolution: string;
	aspectRatio: string;
	storagePath: string;
	downloadUrl: string;
	expiresAt: string;
}

export interface GeneratedVideo {
	id: string;
	videoBase64: string;
	mimeType: string;
	durationSeconds: number;
	resolution: string;
	aspectRatio: string;
	hasAudio: boolean;
	storagePath: string;
	downloadUrl: string;
	expiresAt: string;
}

export interface CharacterProfile {
	id: string;
	name: string;
	description: string | null;
	referenceImages: Array<{ storagePath: string; mimeType: string }>;
	createdAt: string;
}

export interface GenerationRecord {
	id: string;
	type: 'image' | 'video';
	prompt: string;
	model: string;
	resultStoragePath: string | null;
	resultMimeType: string | null;
	metadata: Record<string, unknown> | null;
	expiresAt: string | null;
	deleted: boolean;
	createdAt: string;
}

export class CreateAgent {
	async generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
		const opts: GenerateImageOptions = {
			resolution: input.resolution ?? '2K',
			aspectRatio: input.aspectRatio ?? '1:1',
			negativePrompt: input.negativePrompt
		};
		if (input.characterProfileId) {
			const refs = await this.getReferenceImagesForProfile(input.characterProfileId, input.userId);
			if (refs.length) opts.referenceImages = refs;
		}
		const { imageBytes, mimeType } = await generateImageWithGemini(input.prompt, opts);
		return this.persistImage(
			input.userId,
			imageBytes,
			mimeType,
			{ resolution: input.resolution ?? '2K', aspectRatio: input.aspectRatio ?? '1:1' },
			input.characterProfileId ?? null,
			input.prompt
		);
	}

	async generateImageWithText(input: GenerateImageWithTextInput): Promise<GeneratedImage> {
		const promptWithText = `${input.prompt}. Include the following text clearly and legibly in the image: "${input.textContent.replace(/"/g, '\\"')}"`;
		const { imageBytes, mimeType } = await generateImageWithGemini(promptWithText, {
			resolution: input.resolution ?? '2K',
			aspectRatio: input.aspectRatio ?? '1:1'
		});
		return this.persistImage(
			input.userId,
			imageBytes,
			mimeType,
			{
				resolution: input.resolution ?? '2K',
				aspectRatio: input.aspectRatio ?? '1:1',
				textInImage: true
			},
			null,
			input.prompt
		);
	}

	private async persistImage(
		userId: string,
		imageBytes: string,
		mimeType: string,
		metadata: Record<string, unknown>,
		characterProfileId: string | null = null,
		promptText = ''
	): Promise<GeneratedImage> {
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + EXPIRATION_DAYS);

		const insertPayload: CreateAgentGenerationInsert = {
			user_id: userId,
			type: 'image',
			prompt: promptText || '(image)',
			model: IMAGE_MODEL,
			metadata:
				metadata as Database['public']['Tables']['create_agent_generations']['Row']['metadata'],
			character_profile_id: characterProfileId,
			expires_at: expiresAt.toISOString()
		};
		const { data: rawRow, error: insertErr } =
			await // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase table typings resolve to never
			(supabaseServer.from('create_agent_generations') as any)
				.insert(insertPayload)
				.select('id')
				.single();
		const row = rawRow as Pick<CreateAgentGenerationRow, 'id'> | null;
		if (insertErr || !row)
			throw new Error(insertErr?.message ?? 'Failed to create generation record');

		const {
			path,
			signedUrl,
			expiresAt: exp
		} = await uploadGeneratedMedia({
			bytesBase64: imageBytes,
			mimeType,
			userId,
			type: 'image',
			generationId: row.id
		});

		const updatePayload: CreateAgentGenerationUpdate = {
			result_storage_path: path,
			result_mime_type: mimeType
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase table typings resolve to never
		await (supabaseServer.from('create_agent_generations') as any)
			.update(updatePayload)
			.eq('id', row.id);

		await scheduleExpirationNotifications(row.id, exp);

		return {
			id: row.id,
			imageBase64: imageBytes,
			mimeType,
			resolution: (metadata.resolution as string) ?? '2K',
			aspectRatio: (metadata.aspectRatio as string) ?? '1:1',
			storagePath: path,
			downloadUrl: signedUrl,
			expiresAt: exp.toISOString()
		};
	}

	async generateVideo(input: GenerateVideoInput): Promise<GeneratedVideo> {
		const opts: GenerateVideoOptions = {
			durationSeconds: input.durationSeconds ?? 8,
			resolution: input.resolution ?? '720p',
			aspectRatio: input.aspectRatio ?? '16:9',
			negativePrompt: input.includeAudio === false ? 'no audio, silent' : undefined
		};
		if (input.characterProfileId) {
			const refs = await this.getReferenceImagesForProfile(input.characterProfileId, input.userId);
			if (refs.length) {
				opts.referenceImages = refs.map((r) => ({
					imageBytes: r.imageBytes,
					mimeType: r.mimeType,
					referenceType: 'asset' as const
				}));
			}
		}
		const { videoBytes, mimeType } = await generateVideoWithVeo(input.prompt, opts);
		return this.persistVideo(
			input.userId,
			videoBytes,
			mimeType,
			{
				durationSeconds: input.durationSeconds ?? 8,
				resolution: input.resolution ?? '720p',
				aspectRatio: input.aspectRatio ?? '16:9',
				hasAudio: input.includeAudio !== false
			},
			input.prompt
		);
	}

	async generateVideoFromFrames(input: GenerateVideoFromFramesInput): Promise<GeneratedVideo> {
		const { videoBytes, mimeType } = await generateVideoWithVeo(input.prompt, {
			durationSeconds: 8,
			resolution: input.resolution ?? '720p',
			aspectRatio: input.aspectRatio ?? '16:9',
			startImage: {
				imageBytes: input.startImageBase64,
				mimeType: 'image/png'
			},
			endImage: {
				imageBytes: input.endImageBase64,
				mimeType: 'image/png'
			}
		});
		return this.persistVideo(
			input.userId,
			videoBytes,
			mimeType,
			{
				durationSeconds: 8,
				resolution: input.resolution ?? '720p',
				aspectRatio: input.aspectRatio ?? '16:9',
				hasAudio: true
			},
			input.prompt
		);
	}

	async extendVideo(input: ExtendVideoInput): Promise<GeneratedVideo> {
		const { data: rawGen, error: fetchErr } = await supabaseServer
			.from('create_agent_generations')
			.select('result_storage_path, result_mime_type, user_id')
			.eq('id', input.generationId)
			.eq('user_id', input.userId)
			.single();
		const gen = rawGen as Pick<
			CreateAgentGenerationRow,
			'result_storage_path' | 'result_mime_type' | 'user_id'
		> | null;
		if (fetchErr || !gen?.result_storage_path) {
			throw new Error('Generation not found or no video to extend');
		}
		const { data: file } = await supabaseServer.storage
			.from('generated-media')
			.download(gen.result_storage_path);
		if (!file) throw new Error('Video file not found');
		const buf = await file.arrayBuffer();
		const base64 = Buffer.from(buf).toString('base64');
		const { videoBytes, mimeType } = await extendVideoWithVeo(base64, input.extensionPrompt, {
			resolution: '720p',
			aspectRatio: '16:9'
		});
		return this.persistVideo(
			input.userId,
			videoBytes,
			mimeType,
			{
				durationSeconds: 8,
				resolution: '720p',
				aspectRatio: '16:9',
				hasAudio: true,
				extendedFrom: input.generationId
			},
			input.extensionPrompt
		);
	}

	private async persistVideo(
		userId: string,
		videoBytes: string,
		mimeType: string,
		metadata: Record<string, unknown>,
		promptText = ''
	): Promise<GeneratedVideo> {
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + EXPIRATION_DAYS);

		const videoInsertPayload: CreateAgentGenerationInsert = {
			user_id: userId,
			type: 'video',
			prompt: promptText || '(video)',
			model: VIDEO_MODEL,
			metadata:
				metadata as Database['public']['Tables']['create_agent_generations']['Row']['metadata'],
			expires_at: expiresAt.toISOString()
		};
		const { data: rawVideoRow, error: insertErr } =
			await // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase table typings resolve to never
			(supabaseServer.from('create_agent_generations') as any)
				.insert(videoInsertPayload)
				.select('id')
				.single();
		const row = rawVideoRow as Pick<CreateAgentGenerationRow, 'id'> | null;
		if (insertErr || !row)
			throw new Error(insertErr?.message ?? 'Failed to create generation record');

		const {
			path,
			signedUrl,
			expiresAt: exp
		} = await uploadGeneratedMedia({
			bytesBase64: videoBytes,
			mimeType,
			userId,
			type: 'video',
			generationId: row.id
		});

		const videoUpdatePayload: CreateAgentGenerationUpdate = {
			result_storage_path: path,
			result_mime_type: mimeType
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase table typings resolve to never
		await (supabaseServer.from('create_agent_generations') as any)
			.update(videoUpdatePayload)
			.eq('id', row.id);

		await scheduleExpirationNotifications(row.id, exp);

		return {
			id: row.id,
			videoBase64: videoBytes,
			mimeType,
			durationSeconds: (metadata.durationSeconds as number) ?? 8,
			resolution: (metadata.resolution as string) ?? '720p',
			aspectRatio: (metadata.aspectRatio as string) ?? '16:9',
			hasAudio: (metadata.hasAudio as boolean) ?? true,
			storagePath: path,
			downloadUrl: signedUrl,
			expiresAt: exp.toISOString()
		};
	}

	private async getReferenceImagesForProfile(
		profileId: string,
		userId: string
	): Promise<Array<{ imageBytes: string; mimeType: string }>> {
		const { data: rawProfile } = await supabaseServer
			.from('character_profiles')
			.select('reference_images')
			.eq('id', profileId)
			.eq('user_id', userId)
			.single();
		const profile = rawProfile as Pick<CharacterProfileRow, 'reference_images'> | null;
		const refs =
			(profile?.reference_images as Array<{ storage_path: string; mime_type: string }>) ?? [];
		const out: Array<{ imageBytes: string; mimeType: string }> = [];
		for (const ref of refs) {
			const { data: file } = await supabaseServer.storage
				.from('generated-media')
				.download(ref.storage_path);
			if (!file) continue;
			const buf = await file.arrayBuffer();
			const b64 = Buffer.from(buf).toString('base64');
			out.push({ imageBytes: b64, mimeType: ref.mime_type ?? 'image/png' });
		}
		return out;
	}

	async createCharacterProfile(input: CreateCharacterProfileInput): Promise<CharacterProfile> {
		const insertPayload: CharacterProfileInsert = {
			user_id: input.userId,
			name: input.name,
			description: input.description ?? null,
			reference_images: []
		};
		const { data: rawProfile, error: profileErr } =
			await // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase table typings resolve to never
			(supabaseServer.from('character_profiles') as any)
				.insert(insertPayload)
				.select('id, name, description, reference_images, created_at')
				.single();
		const profile = rawProfile as CharacterProfileRow | null;
		if (profileErr || !profile)
			throw new Error(profileErr?.message ?? 'Failed to create character profile');

		const refPaths: Array<{ storage_path: string; mime_type: string }> = [];
		for (let i = 0; i < input.referenceImagesBase64.length; i++) {
			const b64 = input.referenceImagesBase64[i]!;
			const mimeType = 'image/png';
			const path = `${input.userId}/character_refs/${profile.id}_${i}.png`;
			const raw = b64.includes(',') ? b64.split(',')[1]! : b64;
			const buf = Buffer.from(raw, 'base64');
			const { error: upErr } = await supabaseServer.storage
				.from('generated-media')
				.upload(path, buf, {
					contentType: mimeType,
					upsert: true
				});
			if (!upErr) refPaths.push({ storage_path: path, mime_type: mimeType });
		}

		if (refPaths.length) {
			const profileUpdate: CharacterProfileUpdate = { reference_images: refPaths };
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase table typings resolve to never
			await (supabaseServer.from('character_profiles') as any)
				.update(profileUpdate)
				.eq('id', profile.id);
		}

		return {
			id: profile.id,
			name: profile.name,
			description: profile.description,
			referenceImages: refPaths.map((r) => ({
				storagePath: r.storage_path,
				mimeType: r.mime_type
			})),
			createdAt: profile.created_at
		};
	}

	async getCharacterProfile(profileId: string, userId: string): Promise<CharacterProfile | null> {
		const { data: rawData, error } = await supabaseServer
			.from('character_profiles')
			.select('id, name, description, reference_images, created_at')
			.eq('id', profileId)
			.eq('user_id', userId)
			.single();
		const data = rawData as CharacterProfileRow | null;
		if (error || !data) return null;
		return {
			id: data.id,
			name: data.name,
			description: data.description,
			referenceImages:
				(data.reference_images as Array<{ storage_path: string; mime_type: string }>)?.map((r) => ({
					storagePath: r.storage_path,
					mimeType: r.mime_type
				})) ?? [],
			createdAt: data.created_at
		};
	}

	async listCharacterProfiles(userId: string): Promise<CharacterProfile[]> {
		const { data: rawData, error } = await supabaseServer
			.from('character_profiles')
			.select('id, name, description, reference_images, created_at')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });
		if (error) throw new Error(error.message);
		const data = rawData as CharacterProfileRow[] | null;
		return (data ?? []).map((row) => ({
			id: row.id,
			name: row.name,
			description: row.description,
			referenceImages:
				(row.reference_images as Array<{ storage_path: string; mime_type: string }>)?.map((r) => ({
					storagePath: r.storage_path,
					mimeType: r.mime_type
				})) ?? [],
			createdAt: row.created_at
		}));
	}

	async getGenerationHistory(
		userId: string,
		type?: 'image' | 'video',
		limit = 50
	): Promise<GenerationRecord[]> {
		let q = supabaseServer
			.from('create_agent_generations')
			.select(
				'id, type, prompt, model, result_storage_path, result_mime_type, metadata, expires_at, deleted, created_at'
			)
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(limit);
		if (type) q = q.eq('type', type);
		const { data: rawData, error } = await q;
		if (error) throw new Error(error.message);
		const data = rawData as CreateAgentGenerationRow[] | null;
		return (data ?? []).map((row) => ({
			id: row.id,
			type: row.type as 'image' | 'video',
			prompt: row.prompt,
			model: row.model,
			resultStoragePath: row.result_storage_path,
			resultMimeType: row.result_mime_type,
			metadata: (row.metadata as Record<string, unknown>) ?? null,
			expiresAt: row.expires_at,
			deleted: row.deleted ?? false,
			createdAt: row.created_at
		}));
	}

	async getMediaDownloadUrl(generationId: string, userId: string): Promise<string> {
		const { data: rawData, error } = await supabaseServer
			.from('create_agent_generations')
			.select('result_storage_path')
			.eq('id', generationId)
			.eq('user_id', userId)
			.single();
		const data = rawData as Pick<CreateAgentGenerationRow, 'result_storage_path'> | null;
		if (error || !data?.result_storage_path) {
			throw new Error('Generation not found or no file');
		}
		return getSignedDownloadUrl(data.result_storage_path);
	}

	async deleteGeneration(generationId: string, userId: string): Promise<void> {
		const { data: rawData } = await supabaseServer
			.from('create_agent_generations')
			.select('result_storage_path')
			.eq('id', generationId)
			.eq('user_id', userId)
			.single();
		const data = rawData as Pick<CreateAgentGenerationRow, 'result_storage_path'> | null;
		await deleteExpiredMedia(generationId, data?.result_storage_path ?? null);
	}
}

export const createAgent = new CreateAgent();
