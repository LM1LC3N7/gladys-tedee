// -----------------------------------------------------------------------------
// A fake Tedee Bridge: a real HTTP server on 127.0.0.1 (never the outside
// network) serving the local API v1.0, checking the `api_token` header in
// both modes, and moving its locks on the commands.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { BRIDGE, LOCKS, TOKEN } from '../fixtures/bridge.js';

const FINAL = { lock: 6, unlock: 2, pull: 2 };
const MOVING = { lock: 5, unlock: 4, pull: 8 };

/** True when the header is valid for the token and the mode. */
export function checkToken(header, { token, mode, now = Date.now(), skew = 30_000 }) {
  if (typeof header !== 'string') {
    return false;
  }
  if (mode === 'plain') {
    return header === token;
  }
  const match = /^([0-9a-f]{64})(\d{13})$/.exec(header);
  if (!match) {
    return false;
  }
  const expected = createHash('sha256').update(`${token}${match[2]}`).digest('hex');
  return expected === match[1] && Math.abs(Number(match[2]) - now) <= skew;
}

/**
 * Options: `token`, `mode` ('hashed' | 'plain'), `effect` ('final': a command
 * puts the lock in its final state at once; 'moving': in its moving state).
 * `hook(req)` may return `{ status, body, headers, delay }` to answer instead,
 * or run code (a clock jump) before the normal answer.
 */
export async function startFakeBridge({ token = TOKEN, mode = 'hashed', effect = 'final' } = {}) {
  const bridge = {
    token,
    mode,
    effect,
    info: structuredClone(BRIDGE),
    locks: structuredClone(LOCKS),
    requests: [],
    hook: undefined,
  };
  const lockOf = (id) => bridge.locks.find((l) => String(l.id) === id);
  const send = (res, status, body, headers = {}) => {
    if (res.destroyed) {
      return;
    }
    const text = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(text);
  };

  const server = createServer(async (req, res) => {
    req.on('error', () => {});
    res.on('error', () => {});
    const url = new URL(req.url, 'http://bridge');
    const entry = {
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      apiToken: req.headers.api_token,
    };
    bridge.requests.push(entry);
    const custom = bridge.hook ? await bridge.hook(entry) : undefined;
    if (custom) {
      if (custom.delay) {
        await new Promise((resolve) => setTimeout(resolve, custom.delay));
      }
      if (custom.status) {
        if (custom.raw !== undefined) {
          res.writeHead(custom.status, custom.headers ?? {});
          res.end(custom.raw);
          return;
        }
        send(res, custom.status, custom.body, custom.headers);
        return;
      }
    }
    if (!checkToken(req.headers.api_token, bridge)) {
      send(res, 401, { error: 'Unauthorized' });
      return;
    }
    const path = url.pathname.replace(/^\/v1\.0/, '');
    let match;
    if (req.method === 'GET' && path === '/bridge') {
      send(res, 200, bridge.info);
    } else if (req.method === 'GET' && path === '/lock') {
      send(res, 200, bridge.locks);
    } else if (req.method === 'GET' && (match = /^\/lock\/(\d+)$/.exec(path))) {
      const lock = lockOf(match[1]);
      send(res, lock ? 200 : 404, lock ?? { error: 'Not found' });
    } else if (
      req.method === 'POST' &&
      (match = /^\/lock\/(\d+)\/(lock|unlock|pull)$/.exec(path))
    ) {
      const lock = lockOf(match[1]);
      if (!lock) {
        send(res, 404, { error: 'Not found' });
        return;
      }
      const action = match[2];
      lock.state = bridge.effect === 'moving' ? MOVING[action] : FINAL[action];
      send(res, 202, undefined);
    } else {
      send(res, 404, { error: 'Not found' });
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  bridge.port = server.address().port;
  bridge.host = `127.0.0.1:${bridge.port}`;
  bridge.lock = (id) => lockOf(String(id));
  bridge.commands = () => bridge.requests.filter((r) => r.method === 'POST');
  bridge.reads = (id) =>
    bridge.requests.filter((r) => r.method === 'GET' && r.path === `/v1.0/lock/${id}`);
  bridge.close = () =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return bridge;
}
