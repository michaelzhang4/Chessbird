import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// SPA on GitHub Pages: dynamic routes (set/[id], assess/[id]) are resolved
			// client-side, so we ship a fallback page instead of prerendering every route.
			adapter: adapter({ fallback: '404.html' }),
			// Project-pages live under https://<user>.github.io/<repo>/ — CI sets BASE_PATH.
			// relative:false → absolute asset URLs so the SPA 404 fallback works for deep links
			// refreshed at any path depth (e.g. /set/123).
			paths: {
				base: (process.env.BASE_PATH ?? '') as '' | `/${string}`,
				relative: false
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
