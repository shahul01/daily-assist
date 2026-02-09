import { describe, it, expect } from 'vitest';
import {
	SearchFilesInputSchema,
	LocateDocumentInputSchema,
	ListDirectoryInputSchema,
	findItAgent
} from './findItAgent';

describe('FindItAgent schemas', () => {
	describe('SearchFilesInputSchema', () => {
		it('accepts empty object', () => {
			const out = SearchFilesInputSchema.parse({});
			expect(out.query).toBeUndefined();
			expect(out.userId).toBeUndefined();
		});

		it('accepts query and userId', () => {
			const out = SearchFilesInputSchema.parse({
				query: 'report.pdf',
				userId: 'user-1'
			});
			expect(out.query).toBe('report.pdf');
			expect(out.userId).toBe('user-1');
		});
	});

	describe('LocateDocumentInputSchema', () => {
		it('accepts name and userId', () => {
			const out = LocateDocumentInputSchema.parse({
				name: 'invoice',
				userId: 'user-2'
			});
			expect(out.name).toBe('invoice');
			expect(out.userId).toBe('user-2');
		});
	});

	describe('ListDirectoryInputSchema', () => {
		it('accepts path and userId', () => {
			const out = ListDirectoryInputSchema.parse({
				path: '/docs',
				userId: 'user-3'
			});
			expect(out.path).toBe('/docs');
			expect(out.userId).toBe('user-3');
		});
	});
});

describe('FindItAgent', () => {
	it('searchFiles returns message with guidance', async () => {
		const result = await findItAgent.searchFiles({ query: 'test', userId: 'u1' });
		expect(result).toHaveProperty('message');
		expect(typeof result.message).toBe('string');
		expect(result.message).toContain('Find-It');
	});

	it('locateDocument returns message with guidance', async () => {
		const result = await findItAgent.locateDocument({ name: 'doc', userId: 'u1' });
		expect(result).toHaveProperty('message');
		expect(result.message).toContain('Find-It');
	});

	it('listDirectory returns message with guidance', async () => {
		const result = await findItAgent.listDirectory({ path: '/', userId: 'u1' });
		expect(result).toHaveProperty('message');
		expect(result.message).toContain('Find-It');
	});
});
