// Settings are local device preferences only. Never persist questions, piles, or results.
export const SETTINGS_STORAGE_KEY = 'tarot-draw.preferences.v1';

export function defaultSettings() {
  return {
    deckId: 'A',
    majorOnly: false,
    selections: {
      A: { includeTitle: true, includeSecondary: true },
      B: { includeTitle: true, includeSecondary: true }
    }
  };
}

export function parseSavedSettings(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || !['A', 'B'].includes(value.deckId) ||
        typeof value.majorOnly !== 'boolean' ||
        !value.selections || typeof value.selections !== 'object') return null;
    for (const deckId of ['A', 'B']) {
      const selected = value.selections[deckId];
      if (!selected || typeof selected.includeTitle !== 'boolean' ||
          typeof selected.includeSecondary !== 'boolean') return null;
    }
    return {
      deckId: value.deckId,
      majorOnly: value.majorOnly,
      selections: {
        A: { includeTitle: value.selections.A.includeTitle, includeSecondary: value.selections.A.includeSecondary },
        B: { includeTitle: value.selections.B.includeTitle, includeSecondary: value.selections.B.includeSecondary }
      }
    };
  } catch {
    return null;
  }
}

export function loadSettings(storage) {
  if (!storage) return defaultSettings();
  try {
    return parseSavedSettings(storage.getItem(SETTINGS_STORAGE_KEY)) ?? defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(storage, value) {
  if (!storage) return false;
  const parsed = parseSavedSettings(JSON.stringify({ version: 1, ...value }));
  if (!parsed) return false;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, ...parsed }));
    return true;
  } catch {
    return false;
  }
}
