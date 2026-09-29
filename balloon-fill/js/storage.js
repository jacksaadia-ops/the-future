/**
 * Persistence wrapper. localStorage can be missing or throw (private mode,
 * blocked storage) so every access is guarded; the game works without it.
 * Swap this module for API calls when a real backend exists.
 */
(function () {
  const KEY = BF.CONFIG.STORAGE_KEY;

  BF.storage = {
    load() {
      try {
        const raw = window.localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    },
    save(data) {
      try { window.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    },
    clear() {
      try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    },
  };
})();
