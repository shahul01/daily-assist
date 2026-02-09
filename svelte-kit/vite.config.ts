import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()],

	server: {
		port: 5221
	},

	test: {
		expect: { requireAssertions: true },
		teardownTimeout: 5000,
		testTimeout: 60000,

		projects: [
			{
				extends: './vite.config.ts',

				test: {
					name: 'client',

					browser: {
						enabled: true,
						provider: playwright(),
						instances: [
							{
								browser: 'chromium',
								headless: process.env.VITEST_SHOW_BROWSER !== '1'
							}
						]
					},

					include: [
						'src/**/*.svelte.{test,spec}.{js,ts}',
						'src/tests/e2e/**/*.browser.{test,spec}.{js,ts}'
					],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',

				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: [
						'src/**/*.svelte.{test,spec}.{js,ts}',
						'src/tests/e2e/**/*.browser.{test,spec}.{js,ts}'
					],
					testTimeout: 90000
				}
			}
		]
	}
});
