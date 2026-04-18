const UI_VERSION_KEY = 'fractal.uiVersion';

const PREFIXES = ['fractal.', 'fractal_chart_'];

function purgeUiKeys() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (PREFIXES.some((prefix) => key.startsWith(prefix))) {
      localStorage.removeItem(key);
    }
  }
}

export function ensureUiStateVersion(buildStamp: string) {
  if (!buildStamp) return;
  try {
    const current = localStorage.getItem(UI_VERSION_KEY);
    if (current === buildStamp) return;
    purgeUiKeys();
    localStorage.setItem(UI_VERSION_KEY, buildStamp);
  } catch {
    // Ignore storage errors (private mode / policy)
  }
}

export function resetUiState() {
  try {
    purgeUiKeys();
  } catch {
    // Ignore storage errors (private mode / policy)
  }
}
