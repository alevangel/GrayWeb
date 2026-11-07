import { expect, rootFilter, rule, test } from './fixtures';

test.describe('filter on pages', () => {
  test('does not change a page without a rule', async ({ context, server }) => {
    const page = await context.newPage();
    await page.goto(`${server.url}/a`);
    await page.waitForTimeout(200);
    expect(await rootFilter(page)).toBe('none');
  });

  test('applies the filter before the first paint (F-02)', async ({
    context,
    server,
    setConfig,
  }) => {
    await setConfig({ rules: [rule('127.0.0.1')] });
    const page = await context.newPage();
    await page.goto(`${server.url}/a`);
    await expect
      .poll(() =>
        page.evaluate(() => (window as { filterAtFirstFrame?: string }).filterAtFirstFrame),
      )
      .toBe('grayscale(1)');
  });

  test('updates open tabs when a setting changes (F-06, S-06)', async ({
    context,
    server,
    setConfig,
  }) => {
    const page = await context.newPage();
    await page.goto(`${server.url}/a`);
    await setConfig({ rules: [rule('127.0.0.1')] });
    await expect.poll(() => rootFilter(page)).toBe('grayscale(1)');

    await setConfig({
      rules: [rule('127.0.0.1', { settings: { intensity: 40, contrast: 120, brightness: 100 } })],
    });
    await expect.poll(() => rootFilter(page)).toBe('grayscale(0.4) contrast(1.2)');

    await setConfig({ enabled: false });
    await expect.poll(() => rootFilter(page)).toBe('none');
  });

  test('compares the host exactly (M-02)', async ({ context, server, setConfig }) => {
    await setConfig({ rules: [rule('localhost')] });
    const page = await context.newPage();
    await page.goto(`${server.url}/a`);
    await page.waitForTimeout(200);
    expect(await rootFilter(page)).toBe('none');
    await page.goto(`${server.altUrl}/a`);
    await expect.poll(() => rootFilter(page)).toBe('grayscale(1)');
  });

  test('follows URL changes in single-page applications (F-05)', async ({
    context,
    server,
    setConfig,
  }) => {
    await setConfig({ rules: [rule('/spa/gray', { matchType: 'path' })] });
    const page = await context.newPage();
    await page.goto(`${server.url}/spa`);
    await page.waitForTimeout(200);
    expect(await rootFilter(page)).toBe('none');
    await page.click('#go');
    await expect.poll(() => rootFilter(page)).toBe('grayscale(1)');
  });

  test('gives priority to the first rule (R-05) in "all" mode (R-04)', async ({
    context,
    server,
    setConfig,
  }) => {
    await setConfig({
      mode: 'all',
      rules: [rule('/skip', { matchType: 'path', action: 'skip' })],
    });
    const page = await context.newPage();
    await page.goto(`${server.url}/a`);
    await expect.poll(() => rootFilter(page)).toBe('grayscale(1)');
    await page.goto(`${server.url}/skip/me`);
    await page.waitForTimeout(200);
    expect(await rootFilter(page)).toBe('none');
  });

  test('applies the filter to frames, but not two times (F-04)', async ({
    context,
    server,
    setConfig,
  }) => {
    const framed = `${server.altUrl}/inner`;
    const page = await context.newPage();

    // Only the frame agrees with a rule.
    await setConfig({ rules: [rule('localhost')] });
    await page.goto(`${server.url}/frame-host?src=${encodeURIComponent(framed)}`);
    const frame = page.frameLocator('#frame');
    const frameFilter = () =>
      frame.locator('html').evaluate((html) => getComputedStyle(html).filter);
    await expect.poll(frameFilter).toBe('grayscale(1)');
    expect(await rootFilter(page)).toBe('none');

    // The top page is gray: the frame must not add a second filter.
    await setConfig({ rules: [rule('localhost'), rule('127.0.0.1')] });
    await expect.poll(() => rootFilter(page)).toBe('grayscale(1)');
    await expect.poll(frameFilter).toBe('none');
  });

  test('pauses one tab (G-02)', async ({ context, server, setConfig, worker, sendMessage }) => {
    await setConfig({ rules: [rule('127.0.0.1')] });
    const page = await context.newPage();
    await page.goto(`${server.url}/a`);
    await expect.poll(() => rootFilter(page)).toBe('grayscale(1)');

    const tabId = await worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({ url: `${url}/*` });
      return tabs[0]?.id;
    }, server.url);
    await sendMessage({ type: 'setTabPause', tabId, paused: true });
    await expect.poll(() => rootFilter(page)).toBe('none');

    // The pause stays after a navigation in the same tab.
    await page.goto(`${server.url}/b`);
    await page.waitForTimeout(300);
    expect(await rootFilter(page)).toBe('none');

    await sendMessage({ type: 'setTabPause', tabId, paused: false });
    await expect.poll(() => rootFilter(page)).toBe('grayscale(1)');
  });

  test('stops during a timed pause (G-03)', async ({ context, server, setConfig }) => {
    await setConfig({ rules: [rule('127.0.0.1')], pausedUntil: Date.now() + 1500 });
    const page = await context.newPage();
    await page.goto(`${server.url}/a`);
    await page.waitForTimeout(200);
    expect(await rootFilter(page)).toBe('none');
    await expect.poll(() => rootFilter(page), { timeout: 5000 }).toBe('grayscale(1)');
  });
});
