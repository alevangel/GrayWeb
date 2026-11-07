import { expect, openPopup, rootFilter, rule, tabIdOf, test } from './fixtures';

test.describe('popup', () => {
  test('makes the current site gray and back with the switch (R-09)', async ({
    context,
    extensionId,
    server,
    worker,
    getConfig,
  }) => {
    const site = await context.newPage();
    await site.goto(`${server.url}/a`);
    const popup = await openPopup(context, extensionId, await tabIdOf(worker, server.url));
    const toggle = popup.getByRole('switch', { name: 'Gray on this site' });

    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect.poll(() => rootFilter(site)).toBe('grayscale(1)');
    expect((await getConfig()).rules).toEqual([
      expect.objectContaining({ pattern: '127.0.0.1', matchType: 'domain', action: 'gray' }),
    ]);

    await toggle.click();
    await expect.poll(() => rootFilter(site)).toBe('none');
    expect((await getConfig()).rules).toEqual([]);
  });

  test('changes the intensity of the site (S-06, S-08)', async ({
    context,
    extensionId,
    server,
    worker,
    setConfig,
    getConfig,
  }) => {
    await setConfig({ rules: [rule('127.0.0.1')] });
    const site = await context.newPage();
    await site.goto(`${server.url}/a`);
    const popup = await openPopup(context, extensionId, await tabIdOf(worker, server.url));

    await popup.getByRole('slider', { name: 'Intensity' }).fill('40');
    await expect.poll(() => rootFilter(site)).toBe('grayscale(0.4)');
    const [saved] = (await getConfig()).rules as { settings?: { intensity: number } }[];
    expect(saved?.settings?.intensity).toBe(40);
  });

  test('pauses all sites and resumes (G-03)', async ({
    context,
    extensionId,
    server,
    worker,
    setConfig,
  }) => {
    await setConfig({ rules: [rule('127.0.0.1')] });
    const site = await context.newPage();
    await site.goto(`${server.url}/a`);
    const popup = await openPopup(context, extensionId, await tabIdOf(worker, server.url));

    await popup.getByRole('button', { name: '15 min' }).click();
    await expect(popup.getByText(/^Paused until/)).toBeVisible();
    await expect.poll(() => rootFilter(site)).toBe('none');

    await popup.getByRole('button', { name: 'Resume' }).click();
    await expect.poll(() => rootFilter(site)).toBe('grayscale(1)');
    await expect(popup.getByRole('button', { name: '15 min' })).toBeVisible();
  });

  test('pauses only the current tab (G-02)', async ({
    context,
    extensionId,
    server,
    worker,
    setConfig,
  }) => {
    await setConfig({ rules: [rule('127.0.0.1')] });
    const site = await context.newPage();
    await site.goto(`${server.url}/a`);
    const other = await context.newPage();
    await other.goto(`${server.url}/b`);
    const popup = await openPopup(context, extensionId, await tabIdOf(worker, `${server.url}/a`));

    await popup.getByRole('button', { name: 'This tab' }).click();
    await expect(popup.getByText('Paused on this tab')).toBeVisible();
    await expect.poll(() => rootFilter(site)).toBe('none');
    expect(await rootFilter(other)).toBe('grayscale(1)');
  });

  test('turns GrayWeb on when it is off (G-01)', async ({
    context,
    extensionId,
    server,
    worker,
    setConfig,
  }) => {
    await setConfig({ enabled: false, rules: [rule('127.0.0.1')] });
    const site = await context.newPage();
    await site.goto(`${server.url}/a`);
    const popup = await openPopup(context, extensionId, await tabIdOf(worker, server.url));

    await expect(popup.getByText('GrayWeb is off')).toBeVisible();
    await popup.getByRole('button', { name: 'Turn on' }).click();
    await expect.poll(() => rootFilter(site)).toBe('grayscale(1)');
  });
});
