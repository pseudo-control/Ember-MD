// Copyright (c) 2026 Ember Contributors. MIT License.
import { createSignal } from 'solid-js';

export type Theme = 'wireframe' | 'business';

const STORAGE_KEY = 'ember-theme';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'wireframe' || stored === 'business') return stored;
  return 'wireframe';
}

const initialTheme = getInitialTheme();
const [theme, setThemeSignal] = createSignal<Theme>(initialTheme);

// Apply immediately (before first render) to avoid flash
document.documentElement.setAttribute('data-theme', initialTheme);

export { theme };

export function setTheme(t: Theme): void {
  setThemeSignal(t);
  localStorage.setItem(STORAGE_KEY, t);
  document.documentElement.setAttribute('data-theme', t);
}

export function toggleTheme(): void {
  setTheme(theme() === 'wireframe' ? 'business' : 'wireframe');
}
