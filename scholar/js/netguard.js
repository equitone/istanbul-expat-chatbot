/*
 * netguard.js — the offline switch.
 *
 * Flick it and nothing can leave this computer. Not "the app tries not to
 * send anything": a request to anywhere that is not this machine is refused
 * here, before it reaches the network, whichever button was pressed and
 * whatever a later version of this app might add. It fails closed.
 *
 * A warning would not do. A warning is a request, and a hidden button is
 * still reachable when some state is wrong. So the block sits where every
 * path has to pass — the browser's own network calls, wrapped before a line
 * of the app runs.
 *
 * WHY IT IS OFF BY DEFAULT HERE, unlike the Instructor Workbench where it
 * ships on. That app holds other people's work and never needs the network.
 * This one searches catalogues for you: with the switch on, Find, Gaps and
 * the Calls feeds stop working, because they are the parts that go out. The
 * switch is in the header rather than buried in Settings so that trade is
 * always visible and always one click away — on while you write, off while
 * you search.
 *
 * localhost is allowed, because localhost is this computer. A model or a
 * LanguageTool server you are running is a program on your desk, not a place
 * your work goes. That is the distinction the switch enforces.
 *
 * Loaded ahead of the app so nothing slips out during start-up, and it reads
 * storage directly rather than through the store, so no import order can
 * leave it briefly off.
 */
(function () {
  const KEY = 'scholar-desk:v1';

  /*
   * Off until asked for. The catalogue searches are what this app is for,
   * and shipping with them dead would teach the professor the app is broken
   * rather than that it is careful.
   *
   * Unreadable settings mean off for the same reason: a lock that silently
   * turns itself on would present as the network being down.
   */
  function locked() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      return (s.settings || {}).offlineLock === true;
    } catch {
      return false;
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
    'Blocked by the offline switch. Nothing can leave this computer while it is on, '
    + 'so the catalogue searches and the calls feeds will not work. '
    + 'Turn it off in the header when you want to search, and on again while you write.';

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
