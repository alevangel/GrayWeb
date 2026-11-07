import { join } from 'node:path';
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { startServer, type TestServer } from './server';

const EXTENSION_PATH = join(import.meta.dirname, '..', '..', 'dist', 'chromium');

interface Fixtures {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  server: TestServer;
  /** Writes a partial configuration to the extension storage. */
  setConfig: (partial: Record<string, unknown>) => Promise<void>;
  /** Reads the full configuration from the extension storage. */
  getConfig: () => Promise<Record<string, unknown>>;
  /** Sends a message to the background worker from an extension page. */
  sendMessage: (message: Record<string, unknown>) => Promise<unknown>;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    await use(context);
    await context.close();
  },

  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    // The interface follows the browser language. The tests use English.
    // Wait for the default configuration of the installation, then change it.
    await worker.evaluate(async () => {
      for (let i = 0; i < 50; i += 1) {
        const { config } = await chrome.storage.local.get('config');
        if (config !== undefined) {
          await chrome.storage.local.set({ config: { ...config, language: 'en' } });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('The extension did not write its default configuration');
    });
    await use(worker);
  },

  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },

  // eslint-disable-next-line no-empty-pattern
  server: async ({}, use) => {
    const server = await startServer();
    await use(server);
    await server.close();
  },

  setConfig: async ({ worker }, use) => {
    await use(async (partial) => {
      await worker.evaluate(async (data) => {
        const current = (await chrome.storage.local.get('config')).config as object | undefined;
        await chrome.storage.local.set({
          config: { ...current, ...data, updatedAt: Date.now() },
        });
      }, partial);
    });
  },

  getConfig: async ({ worker }, use) => {
    await use(() =>
      worker.evaluate(
        async () => (await chrome.storage.local.get('config')).config as Record<string, unknown>,
      ),
    );
  },

  sendMessage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await use((message) => page.evaluate((m) => chrome.runtime.sendMessage(m), message));
    await page.close();
  },
});

export const expect = test.expect;

export function rootFilter(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.documentElement).filter);
}

export function rule(pattern: string, extra: Record<string, unknown> = {}) {
  return {
    id: `rule-${pattern}-${Math.random().toString(36).slice(2)}`,
    pattern,
    matchType: 'host',
    action: 'gray',
    enabled: true,
    ...extra,
  };
}
