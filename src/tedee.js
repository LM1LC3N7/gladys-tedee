// -----------------------------------------------------------------------------
// The devices of a Bridge API answer, read defensively (pure). Ported from the
// models of zweckj/aiotedee (MIT, see THIRD_PARTY_NOTICES.md): the local API
// puts the state at the top level of each lock (`state`, `jammed`,
// `doorState`, `batteryLevel`, `isCharging`, `isConnected`) and the pull
// spring settings under `deviceSettings`.
// -----------------------------------------------------------------------------

import {
  DEVICE_TYPE,
  DOOR_STATE,
  KEYPAD_TYPES,
  LIMITS,
  LOCK_STATE,
  LOCK_TYPES,
  MODEL_NAMES,
  MOVING_STATES,
  STILL_STATES,
} from './constants.js';

const KNOWN_STATES = new Set(Object.values(LOCK_STATE));
const KNOWN_DOORS = new Set(Object.values(DOOR_STATE));

/** An integer field (a number or a numeric string), else undefined. */
const intOf = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return undefined;
  }
  const n = Number(value);
  return value !== '' && Number.isInteger(n) ? n : undefined;
};

/** The id of a device: a positive integer the bridge gives it, as a string. */
export function idOf(raw) {
  const id = intOf(raw?.id);
  return id !== undefined && id > 0 ? String(id) : undefined;
}

/** 'lock', 'keypad' or undefined (a device we do not handle). */
export function kindOf(raw) {
  const type = intOf(raw?.type);
  if (LOCK_TYPES.includes(type)) {
    return 'lock';
  }
  if (KEYPAD_TYPES.includes(type)) {
    return 'keypad';
  }
  return undefined;
}

/**
 * One device of `GET /lock` (or `GET /lock/{id}`), or undefined when it is
 * not a usable lock or keypad.
 */
export function parseDevice(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const id = idOf(raw);
  const kind = kindOf(raw);
  if (!id || !kind) {
    return undefined;
  }
  const type = intOf(raw.type);
  const state = intOf(raw.state);
  const door = intOf(raw.doorState);
  const battery = intOf(raw.batteryLevel);
  const settings =
    raw.deviceSettings && typeof raw.deviceSettings === 'object' ? raw.deviceSettings : {};
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, LIMITS.nameLength) : '';
  return {
    id,
    kind,
    type,
    model: MODEL_NAMES[type],
    name,
    serial: typeof raw.serialNumber === 'string' ? raw.serialNumber.slice(0, 40) : undefined,
    connected: raw.isConnected === true || raw.isConnected === 1,
    state: state !== undefined && KNOWN_STATES.has(state) ? state : LOCK_STATE.UNKNOWN,
    jammed: raw.jammed === true || intOf(raw.jammed) === 1,
    door: door !== undefined && KNOWN_DOORS.has(door) ? door : DOOR_STATE.NOT_PAIRED,
    battery: battery !== undefined && battery >= 0 && battery <= 100 ? battery : undefined,
    charging: raw.isCharging === true || intOf(raw.isCharging) === 1,
    pullSpring: settings.pullSpringEnabled === true || intOf(settings.pullSpringEnabled) === 1,
  };
}

/** Every usable device of a `GET /lock` answer, at most LIMITS.devices, ids unique. */
export function parseDevices(list) {
  const devices = new Map();
  for (const raw of Array.isArray(list) ? list : []) {
    const device = parseDevice(raw);
    if (device && !devices.has(device.id) && devices.size < LIMITS.devices) {
      devices.set(device.id, device);
    }
  }
  return devices;
}

export const isMoving = (device) => MOVING_STATES.includes(device.state);
export const isStill = (device) => STILL_STATES.includes(device.state);
export const isLocked = (device) => device.state === LOCK_STATE.LOCKED;

/** The door sensor reports a usable state. */
export const hasDoorState = (device) =>
  device.door === DOOR_STATE.OPENED || device.door === DOOR_STATE.CLOSED;

/** A door sensor is paired with the lock (it may be disconnected right now). */
export const hasDoorSensor = (device) => device.door !== DOOR_STATE.NOT_PAIRED;

export const isRechargeable = (device) => device.type === DEVICE_TYPE.LOCK_PRO;

/** The key of the detailed status (text feature, src/i18n.js STATUS). */
export function statusKey(device) {
  if (!device.connected) {
    return 'disconnected';
  }
  if (device.jammed) {
    return 'jammed';
  }
  switch (device.state) {
    case LOCK_STATE.LOCKED:
      return 'locked';
    case LOCK_STATE.UNLOCKED:
      return 'unlocked';
    case LOCK_STATE.HALF_OPEN:
      return 'half_open';
    case LOCK_STATE.PULLED:
      return 'pulled';
    case LOCK_STATE.LOCKING:
      return 'locking';
    case LOCK_STATE.UNLOCKING:
      return 'unlocking';
    case LOCK_STATE.PULLING:
    case LOCK_STATE.UNPULLING:
      return 'pulling';
    case LOCK_STATE.CALIBRATING:
      return 'calibrating';
    case LOCK_STATE.UNCALIBRATED:
      return 'uncalibrated';
    case LOCK_STATE.UPDATING:
      return 'updating';
    default:
      return 'unknown';
  }
}
