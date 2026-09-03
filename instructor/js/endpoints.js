/*
 * endpoints.js — is this address actually on this computer?
 *
 * Two settings take a URL the instructor types: the LanguageTool server and
 * the local model server. Both sit under a green banner promising the text
 * goes no further than this machine. That promise was printed, not checked —
 * paste a remote address into either box and the banner kept saying
 * "localhost" while the thesis travelled somewhere else.
 *
 * Nothing here blocks a remote address. Running LanguageTool on a department
 * server is a legitimate thing to do, and refusing it would be inventing a
 * policy the instructor did not ask for. What it does is make the interface
 * tell the truth about where the text is going.
 */

/* Loopback in every form a person might type, including IPv6 and the whole
   127.0.0.0/8 block, which is all loopback and not just 127.0.0.1. */
export function isLoopback(url) {
  const host = hostOf(url);
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '[::1]' || host === '0.0.0.0') return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return Boolean(v4) && Number(v4[1]) === 127;
}

export function hostOf(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  let host;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`).hostname.toLowerCase();
  } catch {
    return '';
  }
  /* URL() is forgiving: "my server" parses with the space percent-encoded
     into "my%20server", which would then be reported as a machine on the
     network rather than as the typo it is. Only real hostname characters
     count as a hostname. */
  const valid = /^\[[0-9a-f:]+\]$/.test(host) || /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host);
  return valid ? host : '';
}

/*
 * What to say about an address, in the terms the instructor cares about:
 * does my students' writing leave this computer or not.
 */
export function describeEndpoint(url, { what = 'The text' } = {}) {
  const raw = String(url || '').trim();
  if (!raw) return { local: null, tone: '', text: '' };
  const host = hostOf(raw);
  if (!host) {
    return { local: null, tone: 'warn', text: `“${raw}” is not an address this app can read. Nothing will be sent until it is a URL such as http://localhost:8081.` };
  }
  if (isLoopback(raw)) {
    return { local: true, tone: 'privacy', text: `${what} goes to a program running on this computer (${host}) and no further. The offline guarantee is unchanged.` };
  }
  const private_ = isPrivateNetwork(host);
  return {
    local: false,
    tone: 'warn',
    text: private_
      ? `${what} will be sent over the network to ${host}. That is another machine — on your own network, but not this computer. Whoever runs it can read what you send.`
      : `${what} will be sent over the internet to ${host}. This is not a computer you control, and student writing sent there leaves your machine. Use an address starting http://localhost if you meant to keep it local.`
  };
}

/* RFC 1918 and link-local: another machine, but not the open internet. */
function isPrivateNetwork(host) {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return host.endsWith('.local') || !host.includes('.');
}
