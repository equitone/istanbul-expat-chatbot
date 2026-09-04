/*
 * netguard.js — the offline lock.
 *
 * The requirement this exists for: student work, thesis text and university
 * data must not be able to leave this computer, and no wrong button may make
 * it happen. Warnings and hidden buttons do not meet that. A warning is a
 * request; a hidden button is still reachable when a state is wrong or a
 * future edit forgets. So the block is put where every path has to pass:
 * the browser's own network calls, wrapped before any of the app's code runs.
 *
 * When the lock is on, a request to anything that is not this machine is
 * refused here and never reaches the network. It does not matter which button
 * was pressed, which setting was mis-typed, or whether some later version of
 * this app adds a new call — it fails closed.
 *
 * `localhost` is allowed because localhost is this computer; a local model or
 * a local LanguageTool is a program the instructor runs, not a place data
 * goes. That is the whole distinction the lock enforces.
 *
 * Loaded from index.html ahead of the app so nothing can slip out during
 * start-up, and it reads its own setting straight from storage rather than
 * through the store, so no import order can leave it briefly off.
 */
(function () {
  const KEY = 'instructor-workbench:v1';

  /* Default ON. A privacy control that has to be found and switched on has
     already failed the person it was for. */
  function locked() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return true;
      const s = JSON.parse(raw);
      return (s.settings || {}).offlineLock !== false;
    } catch {
      return true;   // unreadable settings must not mean "unlocked"
    }
  }

  function hostOf(url) {
    try {
      return new URL(String(url), location.href).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  /* Loopback in every form, including the whole 127.0.0.0/8 block. */
  function isLocal(url) {
    const u = String(url);
    /* Same-origin relative paths, and anything the page carries with it. */
    if (/^(data|blob|file):/i.test(u)) return true;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) return true;   // relative -> our own server
    const h = hostOf(u);
    if (!h) return false;
    if (h === location.hostname) return true;
    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h === '::1' || h === '[::1]') return true;
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
    return Boolean(v4) && Number(v4[1]) === 127;
  }

  const REFUSED =
    'Blocked: this workbench is locked to this computer, so nothing can be sent anywhere else. '
    + 'Student work, thesis text and marks stay on this machine. '
    + 'If you genuinely need an online lookup, Settings → "Lock to this computer" explains what unlocking allows and what it risks.';

  function refuse(url) {
    const err = new Error(`${REFUSED} (attempted: ${hostOf(url) || url})`);
    err.name = 'OfflineLockError';
    err.offlineLock = true;
    return err;
  }

  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  if (realFetch) {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      if (locked() && !isLocal(url)) return Promise.reject(refuse(url));
      return realFetch(input, init);
    };
  }

  /* The other ways a page can talk to the network. Blocked too, so the guard
     cannot be walked around by using a different API. */
  const RealXHR = window.XMLHttpRequest;
  if (RealXHR) {
    const open = RealXHR.prototype.open;
    RealXHR.prototype.open = function (method, url, ...rest) {
      if (locked() && !isLocal(url)) throw refuse(url);
      return open.call(this, method, url, ...rest);
    };
  }

  if (navigator.sendBeacon) {
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => (locked() && !isLocal(url) ? false : beacon(url, data));
  }

  const RealWS = window.WebSocket;
  if (RealWS) {
    window.WebSocket = function (url, protocols) {
      if (locked() && !isLocal(url)) throw refuse(url);
      return new RealWS(url, protocols);
    };
    window.WebSocket.prototype = RealWS.prototype;
  }

  const RealES = window.EventSource;
  if (RealES) {
    window.EventSource = function (url, cfg) {
      if (locked() && !isLocal(url)) throw refuse(url);
      return new RealES(url, cfg);
    };
    window.EventSource.prototype = RealES.prototype;
  }

  /* So the rest of the app can ask, and say so on screen. */
  window.__offlineLock = { locked, isLocal, REFUSED };
})();
