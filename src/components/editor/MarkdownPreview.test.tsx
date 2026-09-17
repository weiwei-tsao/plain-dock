// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MarkdownPreview from './MarkdownPreview';

const reactGlobals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactGlobals.IS_REACT_ACT_ENVIRONMENT;
const previousCss = globalThis.CSS;
let cleanup = () => {};

beforeEach(() => {
  reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  cleanup();
  cleanup = () => {};
  reactGlobals.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  Object.defineProperty(globalThis, 'CSS', { configurable: true, value: previousCss });
  document.body.replaceChildren();
});

it('omits outline for heading-free content and rerenders the current draft', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  const report = vi.fn();
  await act(async () =>
    root.render(
      <MarkdownPreview content="draft" initialScrollTop={0} onScrollPositionChange={report} />,
    ),
  );
  expect(host.querySelector('nav')).toBeNull();
  expect(host.querySelector('.md-preview')?.textContent).toBe('draft');
  await act(async () =>
    root.render(
      <MarkdownPreview
        content="# New draft"
        initialScrollTop={0}
        onScrollPositionChange={report}
      />,
    ),
  );
  expect(host.querySelector('h1')?.textContent?.trim()).toBe('New draft');
  expect(host.querySelector('nav button')?.textContent).toBe('New draft');
});

it('scopes Unicode outline targets to its own preview', async () => {
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: { escape: (value: string) => value },
  });
  const outside = document.createElement('h1');
  outside.id = '架构';
  document.body.append(outside);
  const wrong = vi.fn();
  outside.scrollIntoView = wrong;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
    outside.remove();
  };
  await act(async () =>
    root.render(
      <MarkdownPreview content="# 架构" initialScrollTop={0} onScrollPositionChange={() => {}} />,
    ),
  );
  const target = host.querySelector('h1')!;
  const order: string[] = [];
  host
    .querySelector('[data-testid="markdown-preview-scroll"]')!
    .addEventListener('preview-navigation', () => order.push('navigation'));
  target.scrollIntoView = vi.fn(() => order.push('scroll'));
  host.querySelector('button')!.click();
  expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  expect(order).toEqual(['navigation', 'scroll']);
  expect(wrong).not.toHaveBeenCalled();
});
