/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
/**
 * Offline cache for the app shell + static data (puzzle JSON), base-path aware via
 * SvelteKit's $service-worker module. Solving works fully offline because the active
 * set's puzzles are also copied into IndexedDB when a program starts.
 */
import { base, build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `woodpecker-${version}`;
const PRECACHE = [...build, ...files, ...prerendered];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== location.origin) return; // pass through cross-origin

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			// Precached build/static/prerendered assets: cache-first.
			if (PRECACHE.includes(url.pathname)) {
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
			}

			// Everything else (incl. /data/*.json): network-first, fall back to cache.
			try {
				const res = await fetch(req);
				if (res.ok) cache.put(req, res.clone());
				return res;
			} catch {
				const hit = await cache.match(req);
				if (hit) return hit;
				if (req.mode === 'navigate') {
					const shell = await cache.match(`${base}/`);
					if (shell) return shell;
				}
				return new Response('Offline', { status: 503, statusText: 'Offline' });
			}
		})()
	);
});
