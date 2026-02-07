import { describe, it, expect } from 'vitest';
import {
	GenerateImageInputSchema,
	GenerateImageWithTextInputSchema,
	GenerateVideoInputSchema,
	GenerateVideoFromFramesInputSchema,
	ExtendVideoInputSchema,
	CreateCharacterProfileInputSchema
} from './createAgent';

describe('CreateAgent schemas', () => {
	describe('GenerateImageInputSchema', () => {
		it('accepts valid image input', () => {
			const out = GenerateImageInputSchema.parse({
				prompt: 'A calm sunset over the ocean',
				userId: 'user1'
			});
			expect(out.prompt).toBe('A calm sunset over the ocean');
			expect(out.userId).toBe('user1');
			expect(out.resolution).toBeUndefined();
		});

		it('accepts full options', () => {
			const out = GenerateImageInputSchema.parse({
				prompt: 'A cat',
				resolution: '4K',
				aspectRatio: '16:9',
				characterProfileId: '123e4567-e89b-12d3-a456-426614174000',
				negativePrompt: 'blurry',
				userId: 'u1'
			});
			expect(out.resolution).toBe('4K');
			expect(out.aspectRatio).toBe('16:9');
			expect(out.characterProfileId).toBe('123e4567-e89b-12d3-a456-426614174000');
		});

		it('rejects short prompt', () => {
			expect(() => GenerateImageInputSchema.parse({ prompt: 'ab', userId: 'u1' })).toThrow();
		});

		it('rejects empty userId', () => {
			expect(() =>
				GenerateImageInputSchema.parse({ prompt: 'valid prompt', userId: '' })
			).toThrow();
		});
	});

	describe('GenerateImageWithTextInputSchema', () => {
		it('accepts valid input with textContent', () => {
			const out = GenerateImageWithTextInputSchema.parse({
				prompt: 'A poster',
				textContent: 'Hello',
				userId: 'u1'
			});
			expect(out.textContent).toBe('Hello');
		});

		it('rejects empty textContent when provided', () => {
			const out = GenerateImageWithTextInputSchema.parse({
				prompt: 'A poster',
				textContent: 'x',
				userId: 'u1'
			});
			expect(out.textContent).toBe('x');
		});
	});

	describe('GenerateVideoInputSchema', () => {
		it('accepts valid video input', () => {
			const out = GenerateVideoInputSchema.parse({
				prompt: 'A person waving at the camera',
				userId: 'u1'
			});
			expect(out.prompt).toBe('A person waving at the camera');
			expect(out.durationSeconds).toBeUndefined();
		});

		it('accepts duration 4, 6, 8', () => {
			expect(
				GenerateVideoInputSchema.parse({
					prompt: 'Ten chars here',
					durationSeconds: 8,
					userId: 'u1'
				}).durationSeconds
			).toBe(8);
		});
	});

	describe('GenerateVideoFromFramesInputSchema', () => {
		it('accepts start and end image base64', () => {
			const out = GenerateVideoFromFramesInputSchema.parse({
				prompt: 'Morph between frames',
				startImageBase64: 'base64start',
				endImageBase64: 'base64end',
				userId: 'u1'
			});
			expect(out.startImageBase64).toBe('base64start');
			expect(out.endImageBase64).toBe('base64end');
		});
	});

	describe('ExtendVideoInputSchema', () => {
		it('accepts generationId and extensionPrompt', () => {
			const out = ExtendVideoInputSchema.parse({
				generationId: '123e4567-e89b-12d3-a456-426614174000',
				extensionPrompt: 'Continue the scene',
				userId: 'u1'
			});
			expect(out.generationId).toBe('123e4567-e89b-12d3-a456-426614174000');
			expect(out.extensionPrompt).toBe('Continue the scene');
		});
	});

	describe('CreateCharacterProfileInputSchema', () => {
		it('accepts name and at least one reference image', () => {
			const out = CreateCharacterProfileInputSchema.parse({
				name: 'My Character',
				referenceImagesBase64: ['base64img1'],
				userId: 'u1'
			});
			expect(out.name).toBe('My Character');
			expect(out.referenceImagesBase64).toHaveLength(1);
		});

		it('accepts up to 3 reference images', () => {
			const out = CreateCharacterProfileInputSchema.parse({
				name: 'Char',
				referenceImagesBase64: ['a', 'b', 'c'],
				userId: 'u1'
			});
			expect(out.referenceImagesBase64).toHaveLength(3);
		});

		it('rejects empty reference images', () => {
			expect(() =>
				CreateCharacterProfileInputSchema.parse({
					name: 'Char',
					referenceImagesBase64: [],
					userId: 'u1'
				})
			).toThrow();
		});

		it('rejects more than 3 reference images', () => {
			expect(() =>
				CreateCharacterProfileInputSchema.parse({
					name: 'Char',
					referenceImagesBase64: ['a', 'b', 'c', 'd'],
					userId: 'u1'
				})
			).toThrow();
		});
	});
});
