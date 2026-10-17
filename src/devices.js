// -----------------------------------------------------------------------------
// The Tedee devices -> Gladys devices, and their states (pure).
//
// One Gladys device per lock or keypad, `ext:<selector>:tedee:<id>`, the id
// being the one Tedee gives the device (an integer, stable for the account).
// The features are keyed by their role (the last part of their external id):
// those keys are published forever, never rename them.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { DOOR_STATE, GLADYS, LOCK_STATE, MOVING_STATES } from './constants.js';
import { FEATURE_NAMES, STATUS, TYPE_NAMES, word } from './i18n.js';
import { hasDoorSensor, isRechargeable, statusKey } from './tedee.js';

const binary = { min: 0, max: 1 };

/** The features, by role. */
export const FEATURES = {
  // Writable: 1 locks, 0 unlocks (behind allow_unlock).
  lock: {
    category: C.LOCK,
    type: TYPES.LOCK.BINARY,
    ...binary,
    read_only: false,
    has_feedback: true,
  },
  // Read-only LOCK.STATE: 0 unlocked, 1 locked, 2 moving, 3 error (jammed, not calibrated).
  state: { category: C.LOCK, type: TYPES.LOCK.STATE, min: 0, max: 3 },
  // The detailed status, words (half-locked, jammed…).
  status: { category: C.TEXT, type: TYPES.TEXT.TEXT, min: 0, max: 0 },
  // A push opens the door (pull spring), behind allow_pull.
  pull: {
    category: C.BUTTON,
    type: TYPES.BUTTON.PUSH,
    ...binary,
    read_only: false,
    has_feedback: false,
    keep_history: false,
  },
  door: { category: C.OPENING_SENSOR, type: TYPES.SENSOR.BINARY, ...binary },
  battery: { category: C.BATTERY, type: TYPES.BATTERY.INTEGER, unit: U.PERCENT, min: 0, max: 100 },
  charging: { category: C.BATTERY, type: TYPES.BATTERY.CHARGING, ...binary },
};

/** The roles that take a command. */
export const COMMAND_ROLES = ['lock', 'pull'];

export const deviceIds = (gladys, id) => gladys.externalIds('tedee', String(id));

/** The Tedee id and the role of a feature external id. */
export function parseFeatureId(externalId) {
  const match = /:tedee:(\d+):([a-z]+)$/.exec(String(externalId ?? ''));
  return match ? { id: match[1], role: match[2] } : undefined;
}

export const deviceName = (device, language) =>
  device.name || `${word(TYPE_NAMES[device.kind], language)} ${device.id}`;

/** The roles of one device. Fixed at its first discovery by Gladys. */
export function rolesOf(device) {
  if (device.kind === 'keypad') {
    return ['battery'];
  }
  const roles = ['lock', 'state', 'status'];
  if (device.pullSpring) {
    roles.push('pull');
  }
  if (hasDoorSensor(device)) {
    roles.push('door');
  }
  roles.push('battery');
  if (isRechargeable(device)) {
    roles.push('charging');
  }
  return roles;
}

const params = (entries) =>
  entries
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([name, value]) => ({ name, value: String(value) }));

/** The Gladys devices of the bridge. */
export function buildDevices(gladys, devices, language) {
  return devices.map((device) => {
    const ids = deviceIds(gladys, device.id);
    return {
      name: deviceName(device, language),
      external_id: ids.device,
      model: device.model,
      features: rolesOf(device).map((role) => ({
        name: word(FEATURE_NAMES[role], language),
        external_id: ids.feature(role),
        read_only: true,
        has_feedback: false,
        keep_history: true,
        ...FEATURES[role],
      })),
      params: params([
        ['tedee_id', device.id],
        ['model', device.model],
        ['serial_number', device.serial],
      ]),
    };
  });
}

/** Gladys LOCK.BINARY: 1 locked, 0 unlocked (half-locked and pulled too), else none. */
export function lockBinary(device) {
  if (!device.connected) {
    return undefined;
  }
  if (device.jammed) {
    // A movement failed: only a lock that still says "locked" is shown so.
    return device.state === LOCK_STATE.LOCKED ? GLADYS.LOCK_BINARY.LOCKED : undefined;
  }
  switch (device.state) {
    case LOCK_STATE.LOCKED:
      return GLADYS.LOCK_BINARY.LOCKED;
    case LOCK_STATE.UNLOCKED:
    case LOCK_STATE.HALF_OPEN:
    case LOCK_STATE.PULLED:
      return GLADYS.LOCK_BINARY.UNLOCKED;
    default:
      return undefined;
  }
}

/** Gladys LOCK.STATE: 0 unlocked, 1 locked, 2 moving, 3 error; none when unknown. */
export function lockState(device) {
  if (!device.connected) {
    return undefined;
  }
  if (device.jammed || device.state === LOCK_STATE.UNCALIBRATED) {
    return GLADYS.LOCK_STATE.ERROR;
  }
  if (MOVING_STATES.includes(device.state)) {
    return GLADYS.LOCK_STATE.ACTIVITY;
  }
  switch (device.state) {
    case LOCK_STATE.LOCKED:
      return GLADYS.LOCK_STATE.LOCKED;
    case LOCK_STATE.UNLOCKED:
    case LOCK_STATE.HALF_OPEN:
    case LOCK_STATE.PULLED:
      return GLADYS.LOCK_STATE.UNLOCKED;
    default:
      return undefined;
  }
}

/** Gladys OPENING_SENSOR_STATE: 0 open, 1 closed; none without a sensor state. */
export function doorState(device) {
  if (device.door === DOOR_STATE.OPENED) {
    return GLADYS.OPENING.OPEN;
  }
  if (device.door === DOOR_STATE.CLOSED) {
    return GLADYS.OPENING.CLOSED;
  }
  return undefined;
}

/** The Gladys states of one device: `[{ role, state }]` or `[{ role, text }]`. */
export function statesOf(device, language) {
  const states = [];
  const add = (role, state) => {
    if (state !== undefined) {
      states.push({ role, state });
    }
  };
  if (device.kind === 'lock') {
    add('lock', lockBinary(device));
    add('state', lockState(device));
    states.push({ role: 'status', text: word(STATUS[statusKey(device)], language) });
    add('door', doorState(device));
  }
  add('battery', device.battery);
  if (device.kind === 'lock' && isRechargeable(device)) {
    add('charging', device.charging ? GLADYS.ON : GLADYS.OFF);
  }
  return states;
}
