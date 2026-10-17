// -----------------------------------------------------------------------------
// Constants of the Tedee Bridge local API (v1.0) and of the integration.
//
// The enums are those of the official Bridge API documentation
// (docs.tedee.com/bridge-api), as zweckj/aiotedee (MIT) reads them: see
// THIRD_PARTY_NOTICES.md.
// -----------------------------------------------------------------------------

/** The manifest action keys. */
export const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
};

/** The local API: plain HTTP on port 80 of the bridge, version prefix v1.0. */
export const API = {
  version: 'v1.0',
  defaultPort: 80,
};

/** Lock states of the Bridge API (`state`). */
export const LOCK_STATE = {
  UNCALIBRATED: 0,
  CALIBRATING: 1,
  UNLOCKED: 2,
  HALF_OPEN: 3,
  UNLOCKING: 4,
  LOCKING: 5,
  LOCKED: 6,
  PULLED: 7,
  PULLING: 8,
  UNKNOWN: 9,
  UPDATING: 18,
  UNPULLING: 255,
};

/**
 * The states during which the lock moves: no command is sent then. PULLED is
 * one of them: the latch is held, then released by the lock itself.
 */
export const MOVING_STATES = [
  LOCK_STATE.CALIBRATING,
  LOCK_STATE.UNLOCKING,
  LOCK_STATE.LOCKING,
  LOCK_STATE.PULLED,
  LOCK_STATE.PULLING,
  LOCK_STATE.UNPULLING,
];

/** The states whose position is known and still: a command may be sent. */
export const STILL_STATES = [LOCK_STATE.UNLOCKED, LOCK_STATE.HALF_OPEN, LOCK_STATE.LOCKED];

/** Door sensor states of the Bridge API (`doorState`). */
export const DOOR_STATE = {
  NOT_PAIRED: 0,
  DISCONNECTED: 1,
  OPENED: 2,
  CLOSED: 3,
  UNCALIBRATED: 4,
};

/** Device types of the Bridge API (`type`). */
export const DEVICE_TYPE = {
  BRIDGE: 1,
  LOCK_PRO: 2,
  KEYPAD: 3,
  LOCK_GO: 4,
  GATE: 5,
  DRY_CONTACT: 6,
  DOOR_SENSOR: 8,
  KEYPAD_PRO: 10,
};

export const LOCK_TYPES = [DEVICE_TYPE.LOCK_PRO, DEVICE_TYPE.LOCK_GO];
export const KEYPAD_TYPES = [DEVICE_TYPE.KEYPAD, DEVICE_TYPE.KEYPAD_PRO];

export const MODEL_NAMES = {
  [DEVICE_TYPE.LOCK_PRO]: 'Tedee PRO',
  [DEVICE_TYPE.LOCK_GO]: 'Tedee GO',
  [DEVICE_TYPE.KEYPAD]: 'Tedee Keypad',
  [DEVICE_TYPE.KEYPAD_PRO]: 'Tedee Keypad PRO',
};

/**
 * Unlock modes of `POST /lock/{id}/unlock?mode=`: 3 unlocks without the
 * automatic pull spring (what Home Assistant sends), 4 unlocks and pulls
 * (or pulls only when already unlocked).
 */
export const UNLOCK_MODE = {
  WITHOUT_PULL: 3,
  UNLOCK_OR_PULL: 4,
};

/** Gladys values (server/utils/constants.js of the core). */
export const GLADYS = {
  LOCK_BINARY: { UNLOCKED: 0, LOCKED: 1 },
  LOCK_STATE: { UNLOCKED: 0, LOCKED: 1, ACTIVITY: 2, ERROR: 3 },
  OPENING: { OPEN: 0, CLOSED: 1 },
  ON: 1,
  OFF: 0,
};

/** The poll interval of the configuration, in seconds. */
export const POLL_INTERVAL = { default: 10, min: 5, max: 300 };

export const TIMINGS = {
  /**
   * A read of the lock list or of the bridge. Short: one request at a time
   * goes to the bridge, and a command waits behind a read in progress.
   */
  requestTimeout: 3_000,
  /**
   * Gladys gives up on a set_value after 5 s and shows a failure: a command
   * not sent 3.5 s after it arrived is refused, never sent after the failure.
   */
  commandDeadline: 3_500,
  /** The command request may last until 4.6 s after the arrival, 1.2 s at least. */
  commandAnswerBy: 4_600,
  commandTimeout: 1_200,
  /** The shortest timeout worth a request, inside the command deadline. */
  minRequestTimeout: 300,
  /**
   * After a command is sent (or may have been): every command of the lock is
   * refused until a read shows the expected end state (or jammed), or for
   * 10 s at most; meanwhile the lock is shown moving.
   */
  commandGuard: 10_000,
  /** The re-reads of a lock after a command, to show the movement and its end. */
  followUps: [1_500, 4_000, 8_000, 11_000],
  /** Pauses after failures (network, bridge busy…), growing. */
  backoff: [10_000, 30_000, 60_000, 120_000, 300_000],
  /** After a refused token: retried by itself every 5 minutes (a clock drift heals). */
  refusedRetry: 300_000,
  /** 429: a pause between 60 s and 6 h, Retry-After when given. */
  rateLimitMin: 60_000,
  rateLimitMax: 6 * 3_600_000,
  /** The test button and the Discovery scan read the bridge at most every 10 s. */
  testCooldown: 10_000,
  /** States flushed to Gladys every second; unchanged ones again every 30 min. */
  flushInterval: 1_000,
  stateHeartbeat: 30 * 60_000,
};

export const LIMITS = {
  /** Gladys accepts 300 states per minute. */
  statesPerMinute: 280,
  statesPerRequest: 100,
  /** The biggest answer read from the bridge: a lock list is a few KB. */
  responseBytes: 256 * 1024,
  /** Locks and keypads kept from one answer. */
  devices: 50,
  nameLength: 80,
};
