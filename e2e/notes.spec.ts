import { expect, test, type Page } from '@playwright/test';

import {
  createNote,
  deleteActiveNote,
  login,
  startsWith,
  uniqueName,
  waitForContentSave,
} from './helpers';

async function setMarkdown(page: Page, markdown: string) {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(markdown);
}

function viewToggle(page: Page, label: 'Edit' | 'Preview') {
  return page.locator(`button[aria-label="${label}"]:visible`);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('creates, edits, autosaves, and deletes a note', async ({ page }) => {
  await createNote(page);

  const title = uniqueName('E2E Note');
  const content = 'Hello from Playwright';

  const contentSaved = waitForContentSave(page, content);
  await page.getByPlaceholder('Untitled').fill(title);
  await setMarkdown(page, content);
  await contentSaved;

  // Reload to confirm the autosave actually persisted, not just local state.
  // Reselect by title afterward — reload also resets which note the app
  // auto-selects, and that isn't necessarily this one (e.g. a pre-existing
  // pinned note in the disposable DB always sorts first).
  await page.reload();
  await page.getByRole('button', { name: startsWith(title) }).click();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue(title);
  await expect(page.locator('.cm-content')).toContainText(content);

  await deleteActiveNote(page);
  await expect(page.getByRole('button', { name: startsWith(title) })).toHaveCount(0);
});

test('ignores clipboard HTML and inserts plain text', async ({ page }) => {
  await createNote(page);

  const cmContent = page.locator('.cm-content');
  await cmContent.click();
  await cmContent.evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.setData('text/html', '<h2>Hello</h2><script>window.__xss = true;</script>');
    clipboard.setData('text/plain', '## Hello (plain text)');
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }),
    );
  });

  await expect(cmContent).toContainText('## Hello (plain text)');
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss),
  ).toBeUndefined();

  await deleteActiveNote(page);
});

test('renders only list markers in the markdown accent color', async ({ page }) => {
  await createNote(page);
  await setMarkdown(page, '- unordered item\n\n1. ordered item');

  const markerColors = await page.locator('.cm-md-list-marker').evaluateAll((markers) =>
    markers.map((marker) => {
      const leaf = marker.querySelector('span') ?? marker;
      return getComputedStyle(leaf).color;
    }),
  );
  expect(markerColors).toEqual(['rgb(129, 140, 248)', 'rgb(129, 140, 248)']);
  await expect(page.locator('.cm-content')).toContainText('unordered item');
  const proseColor = await page.locator('.cm-content').evaluate((content) => {
    const leaf = [...content.querySelectorAll<HTMLElement>('span')].find(
      (element) => element.textContent === 'unordered item',
    );
    return getComputedStyle(leaf ?? content).color;
  });
  expect(proseColor).toBe('rgb(212, 212, 216)');

  await deleteActiveNote(page);
});

test('previews the latest draft and retains selection, history, and both scroll positions', async ({
  page,
}) => {
  await createNote(page);
  const markdown = ['# Start', ...Array.from({ length: 80 }, (_, i) => `line ${i}`), '# End'].join(
    '\n\n',
  );
  await setMarkdown(page, markdown);
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  const draftSaved = waitForContentSave(page, markdown + ' draft');
  await page.keyboard.insertText(' draft');
  const outerScroll = page.getByTestId('markdown-editor-scroll');
  await page.keyboard.press('ControlOrMeta+Home');
  for (let index = 0; index < 26; index++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  const selected = await page.evaluate(() => getSelection()?.toString());
  expect(selected).toBe('line 12');
  const before = await editor.evaluate((element) => element.closest('.cm-scroller')!.scrollTop);
  const outerBefore = await outerScroll.evaluate((element) => element.scrollTop);
  expect(Math.max(before, outerBefore)).toBeGreaterThan(0);
  await viewToggle(page, 'Preview').click();
  await expect(page.getByRole('article')).toContainText('draft');
  await expect(outerScroll).toBeHidden();
  const savedDraft = await draftSaved;
  expect(((await savedDraft.json()) as { mode: string }).mode).toBe('PLAIN');
  for (let index = 0; index < 15; index++) {
    await page.keyboard.press('Tab');
    expect(await outerScroll.evaluate((element) => element.contains(document.activeElement))).toBe(
      false,
    );
  }
  await page.keyboard.insertText('must-not-enter-editor');
  await expect(page.getByRole('article')).not.toContainText('must-not-enter-editor');
  const preview = page.getByTestId('markdown-preview-scroll');
  await expect(preview).toHaveJSProperty('scrollTop', 0);
  await preview.evaluate((element) => {
    element.scrollTop = 240;
    element.dispatchEvent(new Event('scroll'));
  });
  await viewToggle(page, 'Edit').click();
  await expect
    .poll(() => editor.evaluate((element) => element.closest('.cm-scroller')!.scrollTop))
    .toBe(before);
  await expect.poll(() => outerScroll.evaluate((element) => element.scrollTop)).toBe(outerBefore);
  await editor.focus();
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe(selected);
  await expect
    .poll(() => editor.evaluate((element) => element.closest('.cm-scroller')!.scrollTop))
    .toBe(before);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(editor).not.toContainText('draft');
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(editor).toContainText('draft');
  await viewToggle(page, 'Preview').click();
  await expect.poll(() => preview.evaluate((element) => element.scrollTop)).toBe(240);
  await page.getByRole('button', { name: 'End draft', exact: true }).click();
  await expect.poll(() => preview.evaluate((element) => element.scrollTop)).toBeGreaterThan(240);
  const outlineOffset = await preview.evaluate((element) => element.scrollTop);
  // Exercise real keyboard activation, including a selection away from the top.
  await viewToggle(page, 'Edit').click();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+Home');
  for (let index = 0; index < 26; index++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  const keyboardBefore = await editor.evaluate(
    (element) => element.closest('.cm-scroller')!.scrollTop,
  );
  await page.getByPlaceholder('Untitled').focus();
  for (let index = 0; index < 10; index++) {
    await page.keyboard.press('Tab');
    if (await viewToggle(page, 'Preview').evaluate((element) => element === document.activeElement))
      break;
  }
  await expect(viewToggle(page, 'Preview')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => preview.evaluate((element) => element.scrollTop)).toBe(outlineOffset);
  await page.keyboard.press('Space');
  await expect(editor).toBeVisible();
  await expect
    .poll(() => editor.evaluate((element) => element.closest('.cm-scroller')!.scrollTop))
    .toBe(keyboardBefore);
  await editor.focus();
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('line 12');
  await setMarkdown(page, '# Short');
  await viewToggle(page, 'Preview').click();
  await expect.poll(() => preview.evaluate((element) => element.scrollTop)).toBe(0);
  await deleteActiveNote(page);
});

test('resets Preview position when opening another note', async ({ page }) => {
  await createNote(page);
  const first = uniqueName('Preview first');
  await page.getByPlaceholder('Untitled').fill(first);
  const content = '# First\n\n' + 'body\n\n'.repeat(80);
  const saved = waitForContentSave(page, content);
  await setMarkdown(page, content);
  await saved;
  await viewToggle(page, 'Preview').click();
  await page.getByTestId('markdown-preview-scroll').evaluate((element) => {
    element.scrollTop = 300;
    element.dispatchEvent(new Event('scroll'));
  });
  await createNote(page);
  const second = uniqueName('Preview second');
  await page.getByPlaceholder('Untitled').fill(second);
  const secondSaved = waitForContentSave(page, '# Second');
  await setMarkdown(page, '# Second');
  await secondSaved;
  await expect(viewToggle(page, 'Preview')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: startsWith(first) }).click();
  await viewToggle(page, 'Preview').click();
  await expect(page.getByTestId('markdown-preview-scroll')).toHaveJSProperty('scrollTop', 0);
  await page.reload();
  await page.getByRole('button', { name: startsWith(first) }).click();
  await expect(viewToggle(page, 'Preview')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.cm-content')).toContainText('First');
  await deleteActiveNote(page);
  await page.getByRole('button', { name: startsWith(second) }).click();
  await deleteActiveNote(page);
});

test('shows the outline from the md breakpoint and never overflows horizontally', async ({
  page,
}) => {
  await createNote(page);
  const title = uniqueName('Outline');
  const content = '# One\n\n## Two\n\nbody';
  await page.getByPlaceholder('Untitled').fill(title);
  const saved = waitForContentSave(page, content);
  await setMarkdown(page, content);
  await saved;
  await expect(page.locator('.cm-content')).toContainText('One');
  await viewToggle(page, 'Preview').click();
  const outline = page.getByRole('navigation', { name: 'Markdown outline' });
  await page.setViewportSize({ width: 767, height: 800 });
  await expect(outline).toBeHidden();
  await page.setViewportSize({ width: 768, height: 800 });
  await page.reload();
  await page.getByRole('button', { name: startsWith(title) }).click();
  await viewToggle(page, 'Preview').click();
  await expect(outline).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await deleteActiveNote(page);
});

async function startDelayedImagePaste(page: Page) {
  await page.evaluate(() => {
    const NativeImage = window.Image;
    let release: (() => void) | undefined;
    Object.defineProperty(window, 'Image', {
      configurable: true,
      value: function Image() {
        const image = new NativeImage();
        Object.defineProperty(image, 'src', {
          configurable: true,
          set(value: string) {
            release = () => {
              image.setAttribute('src', value);
            };
            image.addEventListener(
              'load',
              () => {
                (window as typeof window & { __imageDecoded?: boolean }).__imageDecoded = true;
              },
              { once: true },
            );
            (window as typeof window & { __imageDecodePending?: boolean }).__imageDecodePending =
              true;
          },
        });
        return image;
      },
    });
    (window as typeof window & { __releaseImageDecode?: () => void }).__releaseImageDecode = () =>
      release?.();
  });
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').evaluate((element) => {
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      ),
      (character) => character.charCodeAt(0),
    );
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([bytes], 'pixel.png', { type: 'image/png' }));
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

test('finishes an in-flight image paste while Preview is visible', async ({ page }) => {
  await createNote(page);
  await startDelayedImagePaste(page);
  await viewToggle(page, 'Preview').click();
  await expect(page.getByRole('article').locator('img')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { __imageDecodePending?: boolean }).__imageDecodePending,
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    (window as typeof window & { __releaseImageDecode?: () => void }).__releaseImageDecode?.();
  });
  const image = page.getByRole('article').locator('img[alt="pixel.png"]');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).complete)).toBe(true);
  await viewToggle(page, 'Edit').click();
  await expect(page.locator('.cm-content')).toContainText('![pixel.png](data:image/webp');
  await deleteActiveNote(page);
});

test('ignores image completion after its editor session closes', async ({ page }) => {
  await createNote(page);
  const first = uniqueName('Pending image');
  await page.getByPlaceholder('Untitled').fill(first);
  const firstSaved = waitForContentSave(page, '# Original');
  await setMarkdown(page, '# Original');
  await firstSaved;
  await startDelayedImagePaste(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { __imageDecodePending?: boolean }).__imageDecodePending,
      ),
    )
    .toBe(true);
  await createNote(page);
  const second = uniqueName('Other session');
  await page.getByPlaceholder('Untitled').fill(second);
  const secondSaved = waitForContentSave(page, '# Other');
  await setMarkdown(page, '# Other');
  await secondSaved;
  await page.evaluate(() =>
    (window as typeof window & { __releaseImageDecode?: () => void }).__releaseImageDecode?.(),
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { __imageDecoded?: boolean }).__imageDecoded),
    )
    .toBe(true);
  await expect(page.locator('.cm-content')).toHaveText('# Other');
  await page.getByRole('button', { name: startsWith(first) }).click();
  await expect(page.locator('.cm-content')).toHaveText('# Original');
  await deleteActiveNote(page);
  await page.getByRole('button', { name: startsWith(second) }).click();
  await deleteActiveNote(page);
});
