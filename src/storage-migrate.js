// storage-migrate.js —— RN-3 rebrand migration (dual2048.* → simultwin.*)
//
// Background: the rebrand renamed the localStorage key prefix from `dual2048.`
// to `simultwin.` for every persisted key (lang / bestScore / seenTutorial /
// muted / musicOn). This module performs a ONE-TIME, IDEMPOTENT, BEST-EFFORT
// migration so existing players' best scores and preferences survive the rename:
// for each known key it reads the legacy `dual2048.<key>`, writes `simultwin.<key>`,
// then deletes the legacy key.
//
// It is imported FIRST in main.js and runs at module-evaluation time, i.e. BEFORE
// any other module reads localStorage. (audio.js builds its AudioManager at import
// time, so the migration must complete first.)

const LEGACY_PREFIX = 'dual2048.';
const NEW_PREFIX = 'simultwin.';
// Only migrate keys the game actually uses, to avoid orphaning unrelated data.
const KNOWN_KEYS = ['lang', 'bestScore', 'seenTutorial', 'muted', 'musicOn'];

function _getLocalStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch (e) { /* privacy mode / sandbox may throw on access */ }
  return null;
}

export function migrateLegacyStorage() {
  const ls = _getLocalStorage();
  if (!ls) return;
  for (const key of KNOWN_KEYS) {
    const oldKey = LEGACY_PREFIX + key;
    const newKey = NEW_PREFIX + key;
    try {
      const legacy = ls.getItem(oldKey);
      if (legacy == null) continue; // nothing to migrate for this key
      // Preserve an already-migrated value; only copy if the new key is empty.
      if (ls.getItem(newKey) == null) ls.setItem(newKey, legacy);
      ls.removeItem(oldKey); // drop legacy key so it is never read again
    } catch (e) { /* a single key failure must not break boot */ }
  }
}

// Run immediately on load (imported first in main.js).
migrateLegacyStorage();
