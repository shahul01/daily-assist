import { page as browserPage } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

vi.mock('$app/stores', () => ({
	page: {
		subscribe(fn: (v: { url: URL }) => void) {
			fn({ url: new URL('http://localhost/') });
			return () => {};
		}
	}
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/supabase', () => ({ getOrCreateUserId: () => Promise.resolve('test-user-id') }));

describe('/+page.svelte', () => {
	it('should render h1', async () => {
		render(Page);

		const heading = browserPage.getByRole('heading', { level: 1 });
		await expect.element(heading).toBeInTheDocument();
	});
});
