// updatePrefs.js — user preference for automatic app updates.
//
// OFF (default): a new release is downloaded only after the user clicks
//   "Download" in the update banner — nothing competes for bandwidth during
//   urgent work.
// ON: the release downloads automatically in the background as soon as it is
//   found; the user still chooses when to restart/install.

const KEY = 'pos_auto_update'

export const isAutoUpdateEnabled = () => {
  try { return localStorage.getItem(KEY) === 'true' } catch { return false }
}

export const setAutoUpdateEnabled = (enabled) => {
  try { localStorage.setItem(KEY, enabled ? 'true' : 'false') } catch { /* ignore */ }
}
