import { expect, test, type ConsoleMessage } from '@playwright/test';

// Real-browser smoke for the built dist entry: the fixture drives the
// framework-agnostic core (/dist/code-editor/index.js, `vue` resolved locally via
// an import map) mounted into #editor. jsdom can't exercise caret, native undo,
// or the overlay, so this covers what the wrapper unit test cannot: real typing
// updates the value and highlight, auto-close inserts a pair, and native undo
// (preserved via execCommand) reverts an edit — all with zero console errors.

interface EditorWindow {
  __ready?: boolean;
  editorVersion: string;
  changes: string[];
  getValue: () => string;
  caretToEnd: () => void;
}

test.describe('code-editor smoke — built dist entry', () => {
  const errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors.length = 0;
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto('/tests/e2e/fixtures/code-editor.html');
    await page.waitForFunction(() => (window as unknown as EditorWindow).__ready === true);
  });

  test('renders the textarea, highlight layer, and keyword spans', async ({ page }) => {
    await expect(page.locator('#editor textarea.vd-code-editor-input')).toHaveCount(1);
    await expect(page.locator('#editor pre.vd-code-editor-highlight')).toHaveCount(1);
    await expect(page.locator('#editor .vd-code-editor-code .vd-tk-keyword')).not.toHaveCount(0);
  });

  test('reports the built-entry version constant', async ({ page }) => {
    const version = await page.evaluate(() => (window as unknown as EditorWindow).editorVersion);
    expect(version).toBe('1.1.0');
  });

  test('typing updates the value and repaints the highlight', async ({ page }) => {
    await page.locator('#editor textarea').click();
    await page.evaluate(() => (window as unknown as EditorWindow).caretToEnd());
    await page.keyboard.type('let y = 2;');

    const value = await page.evaluate(() => (window as unknown as EditorWindow).getValue());
    expect(value).toContain('let y = 2;');
    // 'const' + 'let' ⇒ at least two keyword spans after the repaint.
    await expect(page.locator('#editor .vd-code-editor-code .vd-tk-keyword')).toHaveCount(2);
  });

  test('auto-closes an opening bracket', async ({ page }) => {
    await page.locator('#editor textarea').click();
    await page.evaluate(() => (window as unknown as EditorWindow).caretToEnd());
    await page.keyboard.type('foo(');

    const value = await page.evaluate(() => (window as unknown as EditorWindow).getValue());
    expect(value).toContain('foo()');
  });

  test('native undo reverts the last edit', async ({ page }) => {
    await page.locator('#editor textarea').click();
    await page.evaluate(() => (window as unknown as EditorWindow).caretToEnd());
    await page.keyboard.type('ZZZ');
    const typed = await page.evaluate(() => (window as unknown as EditorWindow).getValue());
    expect(typed).toContain('ZZZ');

    await page.keyboard.press('ControlOrMeta+z');
    const undone = await page.evaluate(() => (window as unknown as EditorWindow).getValue());
    expect(undone).not.toBe(typed);
  });

  test('gutter updates line numbers on Enter', async ({ page }) => {
    const gutter = page.locator('#editor .vd-code-editor-gutter-lines');
    const initialText = await gutter.innerText();

    await page.locator('#editor textarea').click();
    await page.evaluate(() => (window as unknown as EditorWindow).caretToEnd());
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(50);

    const updatedText = await gutter.innerText();
    expect(updatedText.length).toBeGreaterThan(initialText.length);
  });

  test('Tab inserts spaces at the caret', async ({ page }) => {
    await page.locator('#editor textarea').click();
    await page.evaluate(() => (window as unknown as EditorWindow).caretToEnd());
    await page.keyboard.press('Tab');

    const value = await page.evaluate(() => (window as unknown as EditorWindow).getValue());
    expect(value).toContain('  ');
  });

  test('Enter preserves indentation', async ({ page }) => {
    await page.locator('#editor textarea').click();
    await page.evaluate(() => (window as unknown as EditorWindow).caretToEnd());
    await page.keyboard.type('  if (true) {');
    await page.keyboard.press('Enter');

    const value = await page.evaluate(() => (window as unknown as EditorWindow).getValue());
    expect(value).toContain('\n    ');
  });

  test('default mode shows gutter and active-line', async ({ page }) => {
    await expect(page.locator('#editor .vd-code-editor-gutter')).toHaveCount(1);
    await expect(page.locator('#editor .vd-code-editor-active-line')).toHaveCount(1);
  });

  test('auto-closes all bracket types', async ({ page }) => {
    await page.locator('#editor textarea').click();
    await page.evaluate(() => (window as unknown as EditorWindow).caretToEnd());
    await page.keyboard.type('[');

    let value = await page.evaluate(() => (window as unknown as EditorWindow).getValue());
    expect(value).toContain('[]');

    await page.evaluate(() => (window as unknown as EditorWindow).caretToEnd());
    await page.keyboard.type('{');

    value = await page.evaluate(() => (window as unknown as EditorWindow).getValue());
    expect(value).toContain('{}');
  });

  test.afterEach(() => {
    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });
});
