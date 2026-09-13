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

export function getThemePreference(): ThemePreference {
  const value = read(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(preference: ThemePreference = getThemePreference()): void {
  const dark = preference === 'dark' || (preference === 'system' && systemPrefersDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function setThemePreference(preference: ThemePreference): void {
  write(THEME_KEY, preference);
  applyTheme(preference);
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
