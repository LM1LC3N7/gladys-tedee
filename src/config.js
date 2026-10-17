// -----------------------------------------------------------------------------
// The configuration of the manifest `config_schema`, normalized.
// -----------------------------------------------------------------------------

import { API, POLL_INTERVAL } from './constants.js';

/** Defaults, mirrored by the manifest (checked by test/manifest.test.js). */
export const DEFAULTS = {
  token_mode: 'hashed',
  // The risky commands are off until the user turns them on (Louis's rule).
  allow_unlock: false,
  allow_pull: false,
  poll_interval: POLL_INTERVAL.default,
  language: 'fr',
};

export const LANGUAGES = ['fr', 'en'];
export const TOKEN_MODES = ['hashed', 'plain'];

/** A checkbox may arrive as a boolean or as a string from a form; absent = its default. */
const flag = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value === true || value === 'true' || value === 1 || value === '1';
};

const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const IPV6 = /^[0-9a-f:.]{2,45}$/i;

/**
 * The bridge address: an IP address or a host name, with an optional port.
 * `http://` and a trailing slash are tolerated; anything else (a path, a
 * user, a query) is refused, so the address can only name a host.
 * Returns `{ host, port }` (host bracketed for IPv6), or undefined.
 */
export function parseHost(raw) {
  let text = String(raw ?? '').trim();
  text = text.replace(/^http:\/\//i, '').replace(/\/+$/, '');
  if (!text) {
    return undefined;
  }
  let host;
  let port;
  const v6 = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(text);
  if (v6) {
    if (!IPV6.test(v6[1]) || !v6[1].includes(':')) {
      return undefined;
    }
    host = `[${v6[1].toLowerCase()}]`;
    port = v6[2];
  } else {
    const match = /^([^:/?#@\s]+)(?::(\d{1,5}))?$/.exec(text);
    if (!match || !HOSTNAME.test(match[1])) {
      return undefined;
    }
    host = match[1].toLowerCase();
    port = match[2];
  }
  const number = port === undefined ? API.defaultPort : Number(port);
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    return undefined;
  }
  return { host, port: number };
}

export function normalizeConfig(raw = {}) {
  const given = raw?.poll_interval;
  const interval = given === undefined || given === null || given === '' ? NaN : Number(given);
  const language = String(raw?.language ?? DEFAULTS.language)
    .trim()
    .toLowerCase();
  const mode = String(raw?.token_mode ?? DEFAULTS.token_mode)
    .trim()
    .toLowerCase();
  const hostText = String(raw?.bridge_host ?? '').trim();
  return {
    hostText,
    bridge: parseHost(hostText),
    token: String(raw?.api_token ?? '').trim(),
    tokenMode: TOKEN_MODES.includes(mode) ? mode : DEFAULTS.token_mode,
    allowUnlock: flag(raw?.allow_unlock, DEFAULTS.allow_unlock),
    allowPull: flag(raw?.allow_pull, DEFAULTS.allow_pull),
    pollInterval: Number.isFinite(interval)
      ? Math.round(Math.max(POLL_INTERVAL.min, Math.min(POLL_INTERVAL.max, interval)))
      : DEFAULTS.poll_interval,
    language: LANGUAGES.includes(language) ? language : DEFAULTS.language,
  };
}
