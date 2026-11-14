const DEFAULT_ACCENT = '#d5ff66';
const STORAGE_KEY = 'algopilot-accent';

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function applyAccent(color: string, persist = true): void {
  if (!isHexColor(color)) return;
  document.documentElement.style.setProperty('--accent', color);
  if (persist) window.localStorage.setItem(STORAGE_KEY, color);
}

export function initAccent(): void {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  applyAccent(saved && isHexColor(saved) ? saved : DEFAULT_ACCENT, false);
}

export function defaultAccent(): string {
  return DEFAULT_ACCENT;
}
