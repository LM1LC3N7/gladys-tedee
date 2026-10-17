// -----------------------------------------------------------------------------
// End to end: the real SDK wiring (src/handlers.js) against the SDK's fake
// Gladys and a fake Tedee Bridge on 127.0.0.1 (never the outside network).
// The clock of the app can jump ahead (`clock.offset`) to test the deadline.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { TedeeApp } from '../src/app.js';
import { ACTIONS } from '../src/constants.js';
import { registerHandlers } from '../src/handlers.js';
import { IDS, TOKEN } from './fixtures/bridge.js';
import { startFakeBridge } from './helpers/fakeBridge.js';

const dev = (id) => `ext:test-integration:tedee:${id}`;

async function setup(t, { config = {}, bridgeOptions = {}, create = true } = {}) {
  const bridge = await startFakeBridge(bridgeOptions);
  const clock = { offset: 0 };
  const gladys = createFakeGladys({
    config: { bridge_host: bridge.host, api_token: TOKEN, ...config },
  });
  const lines = [];
  const logger = createLogger({ level: 'silent' });
  for (const level of ['debug', 'info', 'warn', 'error']) {
    logger[level] = (...args) => lines.push(args.map(String).join(' '));
  }
  const app = new TedeeApp({ gladys, logger, now: () => Date.now() + clock.offset });
  registerHandlers(gladys, app, logger);
  t.after(async () => {
    app.stop();
    await bridge.close();
  });
  await gladys.connect();
  if (create) {
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(device);
    }
  }
  return { gladys, app, bridge, clock, lines };
}

const deviceOf = (gladys, id) =>
  gladys.fake.discoveredDevices.find((d) => d.external_id === dev(id));
const set = (gladys, id, role, value) => {
  const device = deviceOf(gladys, id);
  const feature = device.features.find((f) => f.external_id === `${dev(id)}:${role}`);
  return gladys.fake.setValue(device, feature, value);
};
const last = (gladys, id, role) => gladys.fake.lastState(`${dev(id)}:${role}`);
const badgeOf = (gladys, id) =>
  gladys.fake.transports.filter((b) => b.device_external_id === dev(id)).at(-1);
const commandPaths = (bridge) =>
  bridge.commands().map((r) => `${r.path}${r.query.mode ? `?mode=${r.query.mode}` : ''}`);

test('without settings, the status asks for them and nothing is sent', async (t) => {
  const { gladys, bridge } = await setup(t, {
    config: { bridge_host: '', api_token: '' },
    create: false,
  });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /IP address of the Tedee Bridge/);
  assert.equal(bridge.requests.length, 0);
});

test('an address that is not a host is refused before any request', async (t) => {
  const { gladys, bridge } = await setup(t, {
    config: { bridge_host: 'http://x/../admin' },
    create: false,
  });
  assert.match(gladys.fake.connectionStatus.message.fr, /pas valide/);
  assert.equal(bridge.requests.length, 0);
});

test('start: bridge, lock list, devices, states and badges', async (t) => {
  const { gladys, bridge } = await setup(t);
  assert.deepEqual(
    bridge.requests.slice(0, 2).map((r) => r.path),
    ['/v1.0/bridge', '/v1.0/lock'],
  );
  assert.equal(gladys.fake.discoveredDevices.length, 3);
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: true,
    message: {
      en: 'Bridge Bridge entrée: 2 locks, 1 keypad.',
      fr: 'Bridge Bridge entrée : 2 serrures, 1 clavier.',
    },
  });
  assert.equal(last(gladys, IDS.pro, 'lock'), 1);
  assert.equal(last(gladys, IDS.pro, 'state'), 1);
  assert.equal(last(gladys, IDS.pro, 'status'), 'Verrouillée');
  assert.equal(last(gladys, IDS.pro, 'door'), 1);
  assert.equal(last(gladys, IDS.pro, 'battery'), 80);
  assert.equal(last(gladys, IDS.pro, 'charging'), 0);
  assert.equal(last(gladys, IDS.go, 'lock'), 0);
  assert.equal(last(gladys, IDS.keypad, 'battery'), 90);
  assert.equal(badgeOf(gladys, IDS.pro).transport, 'local');
});

test('locking is always allowed, after a fresh read of the lock', async (t) => {
  const { gladys, bridge } = await setup(t);
  bridge.requests.length = 0;
  const ack = await set(gladys, IDS.go, 'lock', 1);
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(
    bridge.requests.map((r) => `${r.method} ${r.path}`),
    [`GET /v1.0/lock/${IDS.go}`, `POST /v1.0/lock/${IDS.go}/lock`],
  );
  // Shown as moving until the bridge reports the end.
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(last(gladys, IDS.go, 'state'), 2);
  assert.equal(last(gladys, IDS.go, 'status'), 'Verrouillage…');
});

test('locking a locked lock sends nothing', async (t) => {
  const { gladys, bridge } = await setup(t);
  const ack = await set(gladys, IDS.pro, 'lock', 1);
  assert.equal(ack.success, true);
  assert.equal(bridge.commands().length, 0);
  assert.equal(bridge.reads(IDS.pro).length, 1);
});

test('unlocking is refused by default, without asking the bridge', async (t) => {
  const { gladys, bridge } = await setup(t);
  const ack = await set(gladys, IDS.pro, 'lock', 0);
  assert.equal(ack.success, false);
  assert.match(ack.error, /déverrouillage depuis Gladys est désactivé/);
  assert.equal(bridge.reads(IDS.pro).length, 0);
  assert.equal(bridge.commands().length, 0);
});

test('unlocking with allow_unlock: mode 3, without the pull spring', async (t) => {
  const { gladys, bridge } = await setup(t, { config: { allow_unlock: true } });
  const ack = await set(gladys, IDS.pro, 'lock', 0);
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(commandPaths(bridge), [`/v1.0/lock/${IDS.pro}/unlock?mode=3`]);
});

test('half-locked counts as unlocked for Gladys, and can be locked', async (t) => {
  const { gladys, bridge, app } = await setup(t);
  bridge.lock(IDS.pro).state = 3;
  await app.refresh();
  assert.equal(last(gladys, IDS.pro, 'lock'), 0);
  assert.equal(last(gladys, IDS.pro, 'status'), 'Semi-verrouillée');
  const ack = await set(gladys, IDS.pro, 'lock', 1);
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(commandPaths(bridge), [`/v1.0/lock/${IDS.pro}/lock`]);
});

test('refused when the lock moves, is offline, or its state is unknown', async (t) => {
  const { gladys, bridge } = await setup(t, { config: { allow_unlock: true } });
  const cases = [
    [{ state: 5 }, /en mouvement/],
    [{ state: 1 }, /en mouvement/],
    [{ state: 2, isConnected: 0 }, /pas connectée/],
    [{ state: 9 }, /inconnu/],
    [{ state: 0 }, /inconnu/],
    [{ state: 18 }, /inconnu/],
  ];
  for (const [patch, message] of cases) {
    Object.assign(bridge.lock(IDS.go), { state: 2, isConnected: 1 }, patch);
    const ack = await set(gladys, IDS.go, 'lock', 1);
    assert.equal(ack.success, false, JSON.stringify(patch));
    assert.match(ack.error, message, JSON.stringify(patch));
  }
  assert.equal(bridge.commands().length, 0);
});

test('the state in memory is never trusted: a failed read refuses', async (t) => {
  const { gladys, bridge } = await setup(t);
  bridge.hook = (r) =>
    r.method === 'GET' && r.path.startsWith('/v1.0/lock/') ? { status: 503, body: {} } : undefined;
  const ack = await set(gladys, IDS.go, 'lock', 1);
  assert.equal(ack.success, false);
  assert.match(ack.error, /n'a pas pu être relu/);
  assert.equal(bridge.commands().length, 0);
});

test('a command not sent within 3.5 s is refused', async (t) => {
  const { gladys, bridge, clock } = await setup(t);
  bridge.hook = (r) => {
    if (r.method === 'GET' && r.path === `/v1.0/lock/${IDS.go}`) {
      clock.offset += 4_000;
    }
  };
  const ack = await set(gladys, IDS.go, 'lock', 1);
  assert.equal(ack.success, false);
  assert.match(ack.error, /trop tard/);
  assert.equal(bridge.commands().length, 0);
});

test('one command at a time per lock: the second one sees the movement', async (t) => {
  const { gladys, bridge } = await setup(t, { bridgeOptions: { effect: 'moving' } });
  const [a, b] = await Promise.all([
    set(gladys, IDS.go, 'lock', 1),
    set(gladys, IDS.go, 'lock', 1),
  ]);
  assert.equal(a.success, true, a.error);
  assert.equal(b.success, false);
  assert.match(b.error, /en mouvement/);
  assert.equal(bridge.commands().length, 1);
  assert.equal(bridge.reads(IDS.go).length, 2);
});

test('a command queued past its deadline is refused without a request', async (t) => {
  const { gladys, bridge, clock } = await setup(t);
  let first = true;
  bridge.hook = (r) => {
    if (first && r.method === 'GET' && r.path === `/v1.0/lock/${IDS.go}`) {
      first = false;
      clock.offset += 3_400;
    }
  };
  const [a, b] = await Promise.all([
    set(gladys, IDS.go, 'lock', 1),
    set(gladys, IDS.go, 'lock', 1),
  ]);
  assert.equal(a.success, true, a.error);
  assert.equal(b.success, false);
  assert.match(b.error, /trop tard/);
  assert.equal(bridge.reads(IDS.go).length, 1);
});

test('opening the door: off by default, needs unlocking on a locked lock', async (t) => {
  const { gladys, bridge, app } = await setup(t);
  let ack = await set(gladys, IDS.pro, 'pull', 1);
  assert.match(ack.error, /ouverture de la porte depuis Gladys est désactivée/);
  await app.configUpdated({ ...gladys.fake.config, allow_pull: true });
  ack = await set(gladys, IDS.pro, 'pull', 1);
  assert.match(ack.error, /demande aussi l'option de déverrouillage/);
  assert.equal(bridge.commands().length, 0);
  await app.configUpdated({ ...gladys.fake.config, allow_pull: true, allow_unlock: true });
  ack = await set(gladys, IDS.pro, 'pull', 1);
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(commandPaths(bridge), [`/v1.0/lock/${IDS.pro}/unlock?mode=4`]);
});

test('opening an unlocked door pulls only; no pull spring, refused', async (t) => {
  const { gladys, bridge, app } = await setup(t, { config: { allow_pull: true } });
  bridge.lock(IDS.pro).state = 2;
  let ack = await set(gladys, IDS.pro, 'pull', 1);
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(commandPaths(bridge), [`/v1.0/lock/${IDS.pro}/pull`]);
  // The pull spring turned off in the app since the device was created.
  bridge.lock(IDS.pro).deviceSettings.pullSpringEnabled = 0;
  bridge.lock(IDS.pro).state = 2;
  ack = await set(gladys, IDS.pro, 'pull', 1);
  assert.match(ack.error, /pull spring est désactivé/);
  assert.equal(bridge.commands().length, 1);
  assert.equal(app.devices.get(IDS.pro).pullSpring, false);
});

test('a command the bridge does not confirm in time says the lock may move', async (t) => {
  const { gladys, bridge } = await setup(t);
  bridge.hook = (r) => (r.method === 'POST' ? { delay: 2_000, status: 202 } : undefined);
  const ack = await set(gladys, IDS.go, 'lock', 1);
  assert.equal(ack.success, false);
  assert.match(ack.error, /peut quand même bouger/);
});

test('a refused token: status, retried by the test button, never logged', async (t) => {
  const { gladys, app, lines } = await setup(t, {
    config: { api_token: 'wrong-token' },
    create: false,
  });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the API token/);
  assert.ok(app.timer, 'a new try is scheduled');
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.en, /refused the API token/);
  assert.ok(lines.every((l) => !l.includes('wrong-token')));
});

test('the test button reports the bridge', async (t) => {
  const { gladys } = await setup(t);
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /2 serrures, 1 clavier/);
});

test('429: a pause of Retry-After (60 s at least) for reads and commands', async (t) => {
  const { gladys, bridge, app } = await setup(t);
  bridge.hook = () => ({ status: 429, body: {}, headers: { 'retry-after': '5' } });
  await app.refresh();
  assert.match(gladys.fake.connectionStatus.message.en, /slow down: paused for 1 min/);
  bridge.hook = undefined;
  const before = bridge.requests.length;
  const ack = await set(gladys, IDS.go, 'lock', 1);
  assert.match(ack.error, /ralentir/);
  await app.scan();
  assert.equal(bridge.requests.length, before);
});

test('a bridge that stops answering: unreachable, badges too', async (t) => {
  const { gladys, bridge, app } = await setup(t);
  bridge.hook = () => ({ status: 503, body: {} });
  await app.refresh();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /unreachable.*Next try in 10 s/);
  assert.equal(badgeOf(gladys, IDS.pro).transport, 'unreachable');
  bridge.hook = undefined;
  await app.refresh();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(badgeOf(gladys, IDS.pro).transport, 'local');
});

test('a lock disconnected from the bridge: degraded badge, no lock state', async (t) => {
  const { gladys, bridge, app } = await setup(t);
  bridge.lock(IDS.go).isConnected = 0;
  await app.refresh();
  const badge = badgeOf(gladys, IDS.go);
  assert.deepEqual([badge.transport, badge.degraded], ['unreachable', true]);
  assert.equal(last(gladys, IDS.go, 'status'), 'Non connectée au bridge');
});

test('the language of the status texts follows the configuration', async (t) => {
  const { gladys, app } = await setup(t);
  await app.configUpdated({ ...gladys.fake.config, language: 'en' });
  assert.equal(last(gladys, IDS.pro, 'status'), 'Locked');
});

test('a value that is not a command is refused', async (t) => {
  const { gladys } = await setup(t);
  const device = deviceOf(gladys, IDS.pro);
  const battery = device.features.find((f) => f.external_id.endsWith(':battery'));
  assert.equal((await gladys.fake.setValue(device, battery, 1)).success, false);
  assert.equal((await set(gladys, IDS.pro, 'lock', 2)).success, false);
});
