// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restorePreviewScroll } from './preview-scroll';
const originalResizeObserver = globalThis.ResizeObserver;
const disconnect = vi.fn();
beforeEach(() => {
  disconnect.mockClear();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect = () => disconnect();
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  document.body.replaceChildren();
});
function fixture(pending = false) {
  const element = document.createElement('div');
  const image = document.createElement('img');
  element.append(image);
  let height = 300;
  Object.defineProperties(element, {
    scrollHeight: { get: () => height },
    clientHeight: { value: 100 },
  });
  let complete = !pending;
  Object.defineProperty(image, 'complete', { get: () => complete });
  return {
    element,
    image,
    grow: (next: number) => {
      height = next;
    },
    load: () => {
      complete = true;
      image.dispatchEvent(new Event('load'));
    },
  };
}
describe('preview offset restoration', () => {
  it('starts at zero and clamps completed shorter content', () => {
    const f = fixture();
    const report = vi.fn();
    let dispose = restorePreviewScroll(f.element, 0, report);
    expect(f.element.scrollTop).toBe(0);
    dispose();
    dispose = restorePreviewScroll(f.element, 900, report);
    expect(f.element.scrollTop).toBe(200);
    expect(report).toHaveBeenLastCalledWith(200);
    dispose();
  });
  it('does not commit a premature clamp before images load', () => {
    const f = fixture(true);
    const report = vi.fn();
    const dispose = restorePreviewScroll(f.element, 800, report);
    expect(f.element.scrollTop).toBe(200);
    expect(report).not.toHaveBeenCalled();
    f.element.dispatchEvent(new Event('scroll'));
    expect(report).not.toHaveBeenCalled();
    f.grow(1200);
    f.load();
    expect(f.element.scrollTop).toBe(800);
    expect(report).toHaveBeenLastCalledWith(800);
    dispose();
  });
  it.each(['wheel', 'touchstart', 'pointerdown', 'keydown', 'preview-navigation'])(
    '%s cancels pending restoration and subsequent scroll reports the user position',
    (eventName) => {
      const f = fixture(true);
      const report = vi.fn();
      const dispose = restorePreviewScroll(f.element, 800, report);
      f.element.dispatchEvent(new Event(eventName));
      f.element.scrollTop = 70;
      f.element.dispatchEvent(new Event('scroll'));
      expect(report).toHaveBeenLastCalledWith(70);
      f.grow(1200);
      f.load();
      expect(f.element.scrollTop).toBe(70);
      dispose();
    },
  );
  it('waits for every image to load or fail before committing the restored offset', () => {
    const f = fixture(true);
    const second = document.createElement('img');
    let secondComplete = false;
    Object.defineProperty(second, 'complete', { get: () => secondComplete });
    f.element.append(second);
    const report = vi.fn();
    const dispose = restorePreviewScroll(f.element, 800, report);
    f.grow(1200);
    f.load();
    expect(report).not.toHaveBeenCalled();
    secondComplete = true;
    second.dispatchEvent(new Event('error'));
    expect(f.element.scrollTop).toBe(800);
    expect(report).toHaveBeenLastCalledWith(800);
    dispose();
  });
  it('settles failed images and ignores late events after unmount', () => {
    const f = fixture(true);
    const report = vi.fn();
    const dispose = restorePreviewScroll(f.element, 800, report);
    f.image.dispatchEvent(new Event('error'));
    expect(report).toHaveBeenLastCalledWith(200);
    dispose();
    report.mockClear();
    f.grow(1400);
    f.load();
    f.element.dispatchEvent(new Event('scroll'));
    expect(report).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });
});
