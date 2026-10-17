// -----------------------------------------------------------------------------
// The answers of the bridge -> devices -> Gladys states (pure).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildDevices, lockBinary, lockState, rolesOf, statesOf } from '../src/devices.js';
import { parseDevice, parseDevices, statusKey } from '../src/tedee.js';
import { KEYPAD, LOCKS, LOCK_GO, LOCK_PRO } from './fixtures/bridge.js';

const pro = (patch = {}) => parseDevice({ ...LOCK_PRO, ...patch });

test('the devices of a lock list: locks and keypads, others skipped', () => {
  const devices = parseDevices([...LOCKS, null, { id: 'x', type: 2 }, LOCK_PRO]);
  assert.deepEqual([...devices.keys()], ['12345', '23456', '34567']);
  const lock = devices.get('12345');
  assert.equal(lock.kind, 'lock');
  assert.equal(lock.model, 'Tedee PRO');
  assert.equal(lock.connected, true);
  assert.equal(lock.pullSpring, true);
  assert.equal(lock.battery, 80);
  assert.equal(devices.get('23456').model, 'Tedee GO');
  assert.equal(devices.get('34567').kind, 'keypad');
});

test('unknown or hostile values fall back safely', () => {
  const lock = pro({ state: 999, doorState: 'x', batteryLevel: 300, name: 7, isConnected: 'yes' });
  assert.equal(lock.state, 9);
  assert.equal(lock.door, 0);
  assert.equal(lock.battery, undefined);
  assert.equal(lock.name, '');
  assert.equal(lock.connected, false);
  assert.equal(parseDevice({ ...LOCK_PRO, id: -1 }), undefined);
  assert.equal(parseDevice([]), undefined);
});

test('the features of each device', () => {
  assert.deepEqual(rolesOf(pro()), [
    'lock',
    'state',
    'status',
    'pull',
    'door',
    'battery',
    'charging',
  ]);
  assert.deepEqual(rolesOf(parseDevice(LOCK_GO)), ['lock', 'state', 'status', 'battery']);
  assert.deepEqual(rolesOf(parseDevice(KEYPAD)), ['battery']);
});

test('the discovered devices pass the fake Gladys checks', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  const devices = buildDevices(gladys, [...parseDevices(LOCKS).values()], 'en');
  await gladys.publishDiscoveredDevices(devices);
  const [lock] = gladys.fake.discoveredDevices;
  assert.equal(lock.external_id, 'ext:test-integration:tedee:12345');
  assert.equal(lock.name, 'Porte d’entrée');
  const byRole = Object.fromEntries(lock.features.map((f) => [f.external_id.split(':').at(-1), f]));
  assert.deepEqual(
    [byRole.lock.category, byRole.lock.type, byRole.lock.read_only],
    ['lock', 'binary', false],
  );
  assert.deepEqual([byRole.state.type, byRole.state.read_only], ['state', true]);
  assert.deepEqual([byRole.pull.category, byRole.pull.type], ['button', 'push']);
  assert.deepEqual([byRole.door.category, byRole.door.type], ['opening-sensor', 'binary']);
  assert.equal(byRole.battery.unit, 'percent');
  assert.deepEqual([byRole.charging.category, byRole.charging.type], ['battery', 'charging']);
  await gladys.disconnect();
});

test('lock states: locked, unlocked, half-locked, moving, jammed, unknown, offline', () => {
  const cases = [
    [{ state: 6 }, 1, 1, 'locked'],
    [{ state: 2 }, 0, 0, 'unlocked'],
    [{ state: 3 }, 0, 0, 'half_open'],
    [{ state: 7 }, 0, 0, 'pulled'],
    [{ state: 5 }, undefined, 2, 'locking'],
    [{ state: 4 }, undefined, 2, 'unlocking'],
    [{ state: 8 }, undefined, 2, 'pulling'],
    [{ state: 1 }, undefined, 2, 'calibrating'],
    [{ state: 0 }, undefined, 3, 'uncalibrated'],
    [{ state: 2, jammed: 1 }, undefined, 3, 'jammed'],
    [{ state: 6, jammed: 1 }, 1, 3, 'jammed'],
    [{ state: 9 }, undefined, undefined, 'unknown'],
    [{ state: 18 }, undefined, undefined, 'updating'],
    [{ state: 6, isConnected: 0 }, undefined, undefined, 'disconnected'],
  ];
  for (const [patch, binary, state, status] of cases) {
    const lock = pro(patch);
    assert.equal(lockBinary(lock), binary, JSON.stringify(patch));
    assert.equal(lockState(lock), state, JSON.stringify(patch));
    assert.equal(statusKey(lock), status, JSON.stringify(patch));
  }
});

test('the states of a lock and of a keypad', () => {
  assert.deepEqual(statesOf(pro({ doorState: 2, isCharging: 1 }), 'fr'), [
    { role: 'lock', state: 1 },
    { role: 'state', state: 1 },
    { role: 'status', text: 'Verrouillée' },
    { role: 'door', state: 0 },
    { role: 'battery', state: 80 },
    { role: 'charging', state: 1 },
  ]);
  assert.deepEqual(
    statesOf(pro({ state: 3, doorState: 1 }), 'en').map((s) => s.state ?? s.text),
    [0, 0, 'Half-locked', 80, 0],
  );
  assert.deepEqual(statesOf(parseDevice(KEYPAD), 'en'), [{ role: 'battery', state: 90 }]);
});
