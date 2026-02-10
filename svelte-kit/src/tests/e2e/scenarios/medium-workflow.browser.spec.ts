/**
 * Browser E2E for medium workflow.
 * Run: pnpm test:e2e:browser (opens Chromium; use VITEST_SHOW_BROWSER=1 if needed).
 * To keep the browser open after tests: VITEST_KEEP_BROWSER_OPEN=1 (PowerShell: $env:VITEST_KEEP_BROWSER_OPEN='1').
 */
import { page as browserPage } from 'vitest/browser';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from '../../../routes/+page.svelte';

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
/** Valid UUID for browser E2E mock so DB (e.g. Marathon status) does not reject it. */
const E2E_BROWSER_USER_ID = '00000000-0000-4000-8000-000000000001';
vi.mock('$lib/supabase', () => ({ getOrCreateUserId: () => Promise.resolve(E2E_BROWSER_USER_ID) }));

const isCI = typeof process !== 'undefined' && process.env?.CI === 'true';
const keepBrowserOpen =
	!isCI && typeof process !== 'undefined' && process.env?.VITEST_KEEP_BROWSER_OPEN === '1';

describe('Medium workflow (browser)', () => {
	it('shows app with DailyAssist heading', async () => {
		render(Page);
		const heading = browserPage.getByRole('heading', { level: 1 });
		await expect.element(heading).toBeInTheDocument();
		await expect.element(heading).toHaveTextContent('DailyAssist');
		if (!isCI && !keepBrowserOpen) {
			await new Promise((r) => setTimeout(r, 2000));
		}
	});

	afterAll(async () => {
		if (keepBrowserOpen) {
			await new Promise<void>(() => {});
		}
	});
});
