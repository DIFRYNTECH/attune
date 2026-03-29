/**
 * Thin storage abstraction over localStorage.
 *
 * On the web this delegates straight to localStorage.
 * When Capacitor Preferences is needed later, swap the internals here
 * without touching the rest of the app.
 *
 * All methods are sync today (localStorage is sync). If we later move
 * to Capacitor Preferences (async), change the signature to return
 * Promises and update callers.
 */

export const storageService = {
  /**
   * Read a string value.  Returns null when missing.
   * @param {string} key
   * @returns {string|null}
   */
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  /**
   * Write a string value.
   * @param {string} key
   * @param {string} value
   */
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // localStorage full or unavailable — fail silently.
    }
  },

  /**
   * Remove a key.
   * @param {string} key
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },

  /**
   * Remove all keys.
   */
  clear() {
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  },
};
