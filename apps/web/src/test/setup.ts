import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Lazy route modules are transformed on first import; give findBy* queries room for that.
configure({ asyncUtilTimeout: 8000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// jsdom gaps that Radix and the canvas rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
window.requestAnimationFrame ??= (callback) => window.setTimeout(() => callback(Date.now()), 0);
class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??= IntersectionObserverStub as unknown as typeof IntersectionObserver;

// floating-ui (behind every Radix tooltip, menu, and popover) probes `:popover-open` and `:modal`
// on each position update. jsdom's selector engine throws on those pseudo-classes, and each
// throw costs seconds, which stalls any test with an open popper. Answer them directly.
const nativeMatches = Element.prototype.matches;
Element.prototype.matches = function matches(this: Element, selectors: string): boolean {
  if (selectors === ':popover-open' || selectors === ':modal') return false;
  return nativeMatches.call(this, selectors);
};

// React Router's <ScrollRestoration> calls window.scrollTo, which jsdom only logs as unimplemented.
window.scrollTo = (() => undefined) as typeof window.scrollTo;
