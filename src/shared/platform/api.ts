/**
 * Browser API adapter. Firefox and Safari expose the promise-based `browser`
 * namespace. Chromium exposes `chrome`, which also returns promises in Manifest V3.
 */
export const api: typeof chrome =
  (globalThis as { browser?: typeof chrome }).browser ?? globalThis.chrome;
