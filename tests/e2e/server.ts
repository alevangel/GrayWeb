import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const PAGE = (title: string, body = '') => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<script>
  // Record the filter before the first paint, to find a flash of color (F-02).
  requestAnimationFrame(() => {
    window.filterAtFirstFrame = getComputedStyle(document.documentElement).filter;
  });
</script>
<style>body{margin:0;font:16px sans-serif}.hero{height:200px;background:linear-gradient(90deg,red,blue)}</style>
</head><body><div class="hero"></div><h1>${title}</h1>${body}</body></html>`;

export interface TestServer {
  /** Base URL on 127.0.0.1. */
  url: string;
  /** Base URL on localhost: a different host for the same server. */
  altUrl: string;
  close(): Promise<void>;
}

export async function startServer(): Promise<TestServer> {
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    if (path.startsWith('/frame-host')) {
      const src = new URL(request.url ?? '/', 'http://x').searchParams.get('src') ?? '';
      response.end(PAGE('Frame host', `<iframe id="frame" src="${src}"></iframe>`));
      return;
    }
    if (path.startsWith('/spa')) {
      response.end(
        PAGE(
          'Single-page application',
          `<button id="go" onclick="history.pushState({}, '', '/spa/gray')">Go</button>`,
        ),
      );
      return;
    }
    response.end(PAGE(`Page ${path}`));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    altUrl: `http://localhost:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        // The browser keeps connections open. Close them, or close() waits for ever.
        server.closeAllConnections();
      }),
  };
}
