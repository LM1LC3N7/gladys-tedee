// -----------------------------------------------------------------------------
// The client of the Tedee Bridge local API (v1.0), ported from the local
// client of zweckj/aiotedee (MIT, see THIRD_PARTY_NOTICES.md) and the official
// Bridge API documentation (docs.tedee.com/bridge-api).
//
// - Plain HTTP on the LAN (the bridge serves no HTTPS), port 80 by default.
// - Authentication: the `api_token` header. "Hashed" mode (the default of the
//   Tedee app): SHA-256(token + timestamp in ms) as hex, followed by the same
//   timestamp; the token itself never travels. "Plain" mode: the token as is.
// - Every answer is read up to LIMITS.responseBytes, with a timeout.
// - Errors carry a `kind`: refused (401/403), rate_limited (429, with
//   `retryAfter` in ms), unavailable (5xx), not_found (404), conflict (409),
//   rejected (other 4xx), network, timeout, bad_response, size.
// The token never appears in an error or a log line.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { API, LIMITS, TIMINGS } from './constants.js';

export class BridgeError extends Error {
  constructor(kind, message, { status, retryAfter } = {}) {
    super(message);
    this.name = 'BridgeError';
    this.kind = kind;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** The `api_token` header value. `ms`: the current time in milliseconds. */
export function authToken(token, mode, ms) {
  if (mode === 'plain') {
    return token;
  }
  const stamp = String(Math.trunc(ms));
  return createHash('sha256').update(`${token}${stamp}`).digest('hex') + stamp;
}

/** Retry-After (seconds or an HTTP date) in ms, or undefined. */
export function retryAfterMs(header, now) {
  if (header === null || header === undefined || header === '') {
    return undefined;
  }
  const text = String(header).trim();
  if (/^\d+$/.test(text)) {
    return Number(text) * 1000;
  }
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

function kindOfStatus(status) {
  if (status === 401 || status === 403) {
    return 'refused';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  if (status === 404) {
    return 'not_found';
  }
  if (status === 409) {
    return 'conflict';
  }
  if (status >= 500) {
    return 'unavailable';
  }
  return 'rejected';
}

/** Reads a body up to `limit` bytes; beyond, the stream is cancelled. */
async function readBounded(response, limit) {
  if (!response.body) {
    return '';
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw new BridgeError('size', `answer over ${limit} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

export class BridgeClient {
  constructor({ fetch = globalThis.fetch, now = Date.now, timers = globalThis } = {}) {
    this.fetchImpl = fetch;
    this.now = now;
    this.timers = timers;
    this.bridge = undefined;
    this.token = '';
    this.mode = 'hashed';
  }

  configure({ bridge, token, mode }) {
    this.bridge = bridge;
    this.token = token ?? '';
    this.mode = mode === 'plain' ? 'plain' : 'hashed';
  }

  get configured() {
    return Boolean(this.bridge && this.token);
  }

  get baseUrl() {
    return `http://${this.bridge.host}:${this.bridge.port}/${API.version}`;
  }

  /**
   * One request. `timeout` bounds the whole request, body included. Resolves
   * the parsed JSON (null for an empty body).
   */
  async request(method, path, { timeout = TIMINGS.requestTimeout } = {}) {
    if (!this.configured) {
      throw new BridgeError('no_config', 'bridge address or token missing');
    }
    const controller = new AbortController();
    let timedOut = false;
    // Our own (ref'd) timer, not AbortSignal.timeout: an unref'd one lets a
    // test runner, or the event loop, end before the request settles.
    const timer = this.timers.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    try {
      let response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: {
            accept: 'application/json',
            api_token: authToken(this.token, this.mode, this.now()),
          },
          signal: controller.signal,
          redirect: 'error',
        });
      } catch (err) {
        if (timedOut) {
          throw new BridgeError('timeout', `no answer within ${timeout} ms`);
        }
        throw new BridgeError('network', `bridge unreachable (${err?.cause?.code ?? err?.name})`);
      }
      let text;
      try {
        text = await readBounded(response, LIMITS.responseBytes);
      } catch (err) {
        if (err instanceof BridgeError) {
          throw err;
        }
        if (timedOut) {
          throw new BridgeError('timeout', `no answer within ${timeout} ms`);
        }
        throw new BridgeError('network', 'connection lost while reading the answer');
      }
      if (response.status < 200 || response.status > 299) {
        throw new BridgeError(kindOfStatus(response.status), `HTTP ${response.status}`, {
          status: response.status,
          retryAfter: retryAfterMs(response.headers.get('retry-after'), this.now()),
        });
      }
      if (text.trim() === '') {
        return null;
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new BridgeError('bad_response', 'the answer is not JSON', {
          status: response.status,
        });
      }
    } finally {
      this.timers.clearTimeout(timer);
    }
  }

  /** GET /bridge: the bridge itself (name, serial number, firmware…). */
  async getBridge(options) {
    const data = await this.request('GET', '/bridge', options);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new BridgeError('bad_response', 'unexpected bridge answer');
    }
    return data;
  }

  /** GET /lock: every device paired with the bridge, with its state. */
  async getLocks(options) {
    const data = await this.request('GET', '/lock', options);
    if (!Array.isArray(data)) {
      throw new BridgeError('bad_response', 'unexpected lock list');
    }
    return data;
  }

  /** GET /lock/{id}: one lock, read again just before a command. */
  async getLock(id, options) {
    const data = await this.request('GET', `/lock/${encodeURIComponent(id)}`, options);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new BridgeError('bad_response', 'unexpected lock answer');
    }
    return data;
  }

  /** POST /lock/{id}/lock */
  lock(id, options) {
    return this.request('POST', `/lock/${encodeURIComponent(id)}/lock`, options);
  }

  /** POST /lock/{id}/unlock?mode= */
  unlock(id, mode, options) {
    return this.request(
      'POST',
      `/lock/${encodeURIComponent(id)}/unlock?mode=${Number(mode)}`,
      options,
    );
  }

  /** POST /lock/{id}/pull */
  pull(id, options) {
    return this.request('POST', `/lock/${encodeURIComponent(id)}/pull`, options);
  }
}

/** A short reason for logs and messages, never the token. */
export function errorReason(err) {
  if (err instanceof BridgeError) {
    return `${err.kind}: ${err.message}`;
  }
  return err?.message ?? String(err);
}
