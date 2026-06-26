// This app is a fully client-side SPA: all data lives in IndexedDB and the board
// uses browser-only APIs, so we disable SSR and render everything in the browser.
// The root shell is prerendered to produce index.html; every other route is served
// via the adapter-static fallback (404.html) and resolved by the client router.
export const ssr = false;
export const prerender = true;
