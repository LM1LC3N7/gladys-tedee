// -----------------------------------------------------------------------------
// The Bridge API client against the fake bridge (127.0.0.1 only).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BridgeClient, authToken, retryAfterMs } from '../src/bridge.js';
import { parseHost } from '../src/config.js';
import { IDS, TOKEN } from './fixtures/bridge.js';
import { startFakeBridge } from './helpers/fakeBridge.js';

async function setup(t, { mode = 'hashed', token = TOKEN, bridgeOptions = {} } = {}) {
  const bridge = await startFakeBridge({ mode, ...bridgeOptions });
  t.after(() => bridge.close());
  const client = new BridgeClient();
  client.configure({ bridge: parseHost(bridge.host), token, mode });
  return { bridge, client };
}

test('hashed token: SHA-256 of token + ms, then the ms; plain: the token', () => {
  const value = authToken('secret', 'hashed', 1_700_000_000_123);
  const hash = createHash('sha256').update('secret1700000000123').digest('hex');
  assert.equal(value, `${hash}1700000000123`);
  assert.equal(authToken('secret', 'plain', 1), 'secret');
  assert.ok(!value.includes('secret'));
});

test('Retry-After in seconds or as a date', () => {
  assert.equal(retryAfterMs('120', 0), 120_000);
  assert.equal(retryAfterMs(new Date(60_000).toUTCString(), 0), 60_000);
  assert.equal(retryAfterMs(undefined, 0), undefined);
  assert.equal(retryAfterMs('soon', 0), undefined);
});

test('reads the bridge, the locks and one lock in hashed mode', async (t) => {
  const { bridge, client } = await setup(t);
  assert.equal((await client.getBridge()).serialNumber, '12345678-000001');
  assert.equal((await client.getLocks()).length, 4);
  assert.equal((await client.getLock(IDS.pro)).state, 6);
  assert.deepEqual(
    bridge.requests.map((r) => r.path),
    ['/v1.0/bridge', '/v1.0/lock', `/v1.0/lock/${IDS.pro}`],
  );
  for (const r of bridge.requests) {
    assert.ok(!r.apiToken.includes(TOKEN), 'the token never travels in hashed mode');
  }
});

test('plain mode sends the token as is', async (t) => {
  const { bridge, client } = await setup(t, { mode: 'plain' });
  await client.getLocks();
  assert.equal(bridge.requests[0].apiToken, TOKEN);
});

test('commands: lock, unlock with its mode, pull', async (t) => {
  const { bridge, client } = await setup(t);
  assert.equal(await client.lock(IDS.go), null);
  await client.unlock(IDS.go, 3);
  await client.pull(IDS.go);
  assert.deepEqual(
    bridge.commands().map((r) => [r.path, r.query]),
    [
      [`/v1.0/lock/${IDS.go}/lock`, {}],
      [`/v1.0/lock/${IDS.go}/unlock`, { mode: '3' }],
      [`/v1.0/lock/${IDS.go}/pull`, {}],
    ],
  );
});

test('a wrong token is "refused", and the error never shows it', async (t) => {
  const { client } = await setup(t, { token: 'wrong-token' });
  await assert.rejects(client.getLocks(), (err) => {
    assert.equal(err.kind, 'refused');
    assert.equal(err.status, 401);
    assert.ok(!err.message.includes('wrong-token'));
    return true;
  });
});

test('HTTP errors have a kind; 429 carries Retry-After', async (t) => {
  const { bridge, client } = await setup(t);
  const cases = [
    [{ status: 429, body: {}, headers: { 'retry-after': '90' } }, 'rate_limited'],
    [{ status: 503, body: {} }, 'unavailable'],
    [{ status: 404, body: {} }, 'not_found'],
    [{ status: 409, body: {} }, 'conflict'],
    [{ status: 400, body: {} }, 'rejected'],
    [{ status: 200, raw: 'not json' }, 'bad_response'],
    [{ status: 200, body: { not: 'a list' } }, 'bad_response'],
    [{ status: 200, raw: 'x'.repeat(300 * 1024) }, 'size'],
  ];
  for (const [answer, kind] of cases) {
    bridge.hook = () => answer;
    await assert.rejects(client.getLocks(), (err) => {
      assert.equal(err.kind, kind, JSON.stringify(answer).slice(0, 80));
      if (kind === 'rate_limited') {
        assert.equal(err.retryAfter, 90_000);
      }
      return true;
    });
  }
});

test('a bridge that does not answer in time: "timeout"', async (t) => {
  const { bridge, client } = await setup(t);
  bridge.hook = () => ({ delay: 1_000, status: 200, body: [] });
  await assert.rejects(client.getLocks({ timeout: 200 }), { kind: 'timeout' });
});

test('nobody listening: "network"', async (t) => {
  const { bridge, client } = await setup(t);
  await bridge.close();
  await assert.rejects(client.getLocks(), { kind: 'network' });
});

test('not configured: no request', async () => {
  const client = new BridgeClient();
  client.configure({ bridge: undefined, token: '' });
  await assert.rejects(client.getLocks(), { kind: 'no_config' });
});
