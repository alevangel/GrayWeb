import { expect, rootFilter, rule, test } from './fixtures';

test.describe('settings page', () => {
  test('adds a rule with the editor (R-11, E-02, E-03)', async ({
    context,
    extensionId,
    server,
    getConfig,
  }) => {
    const site = await context.newPage();
    await site.goto(`${server.url}/a`);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.getByText('No rules yet')).toBeVisible();

    await page.getByRole('button', { name: 'Add rule' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Type').selectOption('regex');
    await dialog.getByLabel('Pattern').fill('(broken');
    await expect(dialog.getByRole('alert')).toHaveText('This regular expression is not valid.');

    await dialog.getByLabel('Pattern').fill('^http://127\\.0\\.0\\.1:\\d+/a');
    await dialog.getByLabel('Test URL').fill(`${server.url}/a`);
    await expect(dialog.getByText('Matches', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    const config = await getConfig();
    expect(config.rules).toEqual([
      expect.objectContaining({ matchType: 'regex', pattern: '^http://127\\.0\\.0\\.1:\\d+/a' }),
    ]);
    await expect.poll(() => rootFilter(site)).toBe('grayscale(1)');
  });

  test('warns about a duplicate rule (R-13)', async ({ context, extensionId, setConfig }) => {
    await setConfig({ rules: [rule('example.com', { matchType: 'domain' })] });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.getByRole('button', { name: 'Add rule' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Pattern').fill('EXAMPLE.com');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#editor-warning')).toContainText('An equal rule exists already');
    await expect(dialog.getByRole('button', { name: 'Save anyway' })).toBeVisible();
  });

  test('deletes a rule and restores it with undo (R-12)', async ({
    context,
    extensionId,
    setConfig,
    getConfig,
  }) => {
    await setConfig({
      rules: [
        rule('a.example', { matchType: 'domain' }),
        rule('b.example', { matchType: 'domain' }),
      ],
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    const first = page.locator('[data-rule]').first();
    await first.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('[data-rule]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('[data-rule]')).toHaveCount(2);
    const config = await getConfig();
    expect((config.rules as { pattern: string }[]).map((r) => r.pattern)).toEqual([
      'a.example',
      'b.example',
    ]);
  });

  test('moves a rule with the keyboard (R-06)', async ({
    context,
    extensionId,
    setConfig,
    getConfig,
  }) => {
    await setConfig({
      rules: [
        rule('a.example', { matchType: 'domain' }),
        rule('b.example', { matchType: 'domain' }),
      ],
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page
      .locator('[data-rule]')
      .first()
      .getByRole('button', { name: /Move rule/ })
      .focus();
    await page.keyboard.press('ArrowDown');
    await expect
      .poll(async () => ((await getConfig()).rules as { pattern: string }[]).map((r) => r.pattern))
      .toEqual(['b.example', 'a.example']);
    await expect(page.locator('#live')).toHaveText('Rule moved to position 2');
  });

  test('shows the Italian interface (L-01, L-03)', async ({ context, extensionId, setConfig }) => {
    await setConfig({ language: 'it' });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.getByRole('button', { name: 'Aggiungi regola' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  });

  test('rejects an import file that is not valid (C-06)', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#backup`);
    await page.locator('#import-file').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ rules: [{ pattern: 'x', matchType: 'nope' }] })),
    });
    await expect(page.locator('#import-error')).toContainText('rules[0].matchType');
  });
});
