// -----------------------------------------------------------------------------
// Answers of a Tedee Bridge (local API v1.0), made up from the official Bridge
// API documentation and the test fixtures of zweckj/aiotedee: never recorded
// from a real bridge (see TODO.md, "To check").
// -----------------------------------------------------------------------------

export const TOKEN = 'test-bridge-token-0001';

export const BRIDGE = {
  name: 'Bridge entrée',
  serialNumber: '12345678-000001',
  ssid: 'home-wifi',
  isConnected: 1,
  version: '2.2.21473',
  wifiVersion: '2.0.5',
};

/** A Tedee PRO: door sensor (closed), pull spring on, locked. */
export const LOCK_PRO = {
  id: 12345,
  type: 2,
  serialNumber: '10000001-000001',
  name: 'Porte d’entrée',
  isConnected: 1,
  connectedToId: 99,
  state: 6,
  jammed: 0,
  doorState: 3,
  batteryLevel: 80,
  isCharging: 0,
  stateChangeResult: 0,
  version: '2.4.10',
  deviceSettings: {
    autoLockEnabled: 0,
    autoLockDelay: 15,
    pullSpringEnabled: 1,
    pullSpringDuration: 3,
    autoPullSpringEnabled: 0,
    postponedLockEnabled: 0,
    buttonLockEnabled: 1,
    buttonUnlockEnabled: 1,
  },
};

/** A Tedee GO: no door sensor, pull spring off, unlocked. */
export const LOCK_GO = {
  id: 23456,
  type: 4,
  serialNumber: '20000002-000002',
  name: 'Garage',
  isConnected: 1,
  connectedToId: 99,
  state: 2,
  jammed: 0,
  doorState: 0,
  batteryLevel: 55,
  isCharging: 0,
  deviceSettings: { pullSpringEnabled: 0 },
};

/** A keypad, if the bridge lists one: battery only. */
export const KEYPAD = {
  id: 34567,
  type: 3,
  serialNumber: '30000003-000003',
  name: 'Clavier',
  isConnected: 1,
  batteryLevel: 90,
};

/** A dry contact: not handled, skipped. */
export const DRY_CONTACT = { id: 45678, type: 6, name: 'Contact', isConnected: 1 };

export const LOCKS = [LOCK_PRO, LOCK_GO, KEYPAD, DRY_CONTACT];

export const IDS = { pro: '12345', go: '23456', keypad: '34567', contact: '45678' };
