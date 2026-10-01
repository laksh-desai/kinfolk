import { useSyncExternalStore } from 'react';

/**
 * The only module allowed to touch browser storage (lint-enforced). It stores display
 * preferences only — never anything auth-related.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'kinfolk.theme';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage disabled (private mode); the preference just won't persist
  }
}

/** Kinfolk is a dark product by default; light and "match this device" are a choice away. */
export const DEFAULT_THEME: ThemePreference = 'dark';

export function getThemePreference(): ThemePreference {
  const value = read(THEME_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME;
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(preference: ThemePreference = getThemePreference()): void {
  const dark = preference === 'dark' || (preference === 'system' && systemPrefersDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

const themeListeners = new Set<() => void>();

export function setThemePreference(preference: ThemePreference): void {
  write(THEME_KEY, preference);
  applyTheme(preference);
  for (const listener of themeListeners) listener();
}

/** Re-renders whatever shows the theme (the account page, the account menu) when it changes anywhere. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (listener) => {
      themeListeners.add(listener);
      return () => themeListeners.delete(listener);
    },
    getThemePreference,
    () => DEFAULT_THEME,
  );
}

/** Whether the screen is dark right now, for a toggle that offers the other one. */
export function isDarkTheme(preference: ThemePreference = getThemePreference()): boolean {
  return preference === 'dark' || (preference === 'system' && systemPrefersDark());
}

export function watchSystemTheme(): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = () => {
    if (getThemePreference() === 'system') applyTheme('system');
  };
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

export type TreeViewPreference = 'canvas' | 'list';

const TREE_VIEW_KEY = 'kinfolk.treeView';

/** Tree or list. Without a saved choice, narrow screens start in the list view (SPEC §5.3). */
export function getTreeViewPreference(): TreeViewPreference {
  const value = read(TREE_VIEW_KEY);
  if (value === 'canvas' || value === 'list') return value;
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639px)').matches ? 'list' : 'canvas';
}

export function setTreeViewPreference(preference: TreeViewPreference): void {
  write(TREE_VIEW_KEY, preference);
}
