// -----------------------------------------------------------------------------
// The integration: the Tedee Bridge read every few seconds (GET /lock), the
// Gladys devices and their states, the transport badges, and the commands of
// the locks under Louis's safety rules:
//
// - locking is always allowed; unlocking (allow_unlock) and opening the door
//   with the pull spring (allow_pull) are off until the user turns them on;
// - the commands of one lock run one at a time (a promise chain per lock);
// - the lock is read again (GET /lock/{id}) just before acting, never decided
//   on a state in memory; refused when that read fails, or when the lock is
//   not connected, moving, or in an unknown state;
// - a command not sent 3.5 s after it arrived is refused (Gladys shows a
//   failure after 5 s: nothing must move after that).
//
// The bridge can call back an HTTP URL on each event, but an integration
// container declares no port of its own (only sub-containers do): the bridge
// could not reach it, so the integration polls. index.js only wires the SDK
// handlers to this class.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { BridgeClient, BridgeError, errorReason } from './bridge.js';
import { normalizeConfig } from './config.js';
import { LOCK_STATE, TIMINGS, UNLOCK_MODE } from './constants.js';
import {
  COMMAND_ROLES,
  buildDevices,
  deviceIds,
  deviceName,
  parseFeatureId,
  statesOf,
} from './devices.js';
import { T, age, word } from './i18n.js';
import { StatePublisher } from './publisher.js';
import { isLocked, isMoving, isStill, parseDevice, parseDevices } from './tedee.js';

/** Errors meaning the bridge did not answer usefully: every device is unreachable. */
const OFFLINE = new Set(['network', 'timeout', 'unavailable', 'bad_response', 'size']);

/** A refusal shown in the ack of the command (Gladys shows the message). */
class Refusal extends Error {}

export class TedeeApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'tedee' }),
    fetch,
    now = Date.now,
    timers = globalThis,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.client = new BridgeClient({ fetch, now, timers });
    this.publisher = new StatePublisher({ gladys, logger, now, timers });
    this.config = normalizeConfig();
    /** id -> device of src/tedee.js */
    this.devices = new Map();
    this.bridgeInfo = undefined;
    this.readAt = undefined;
    this.timer = undefined;
    this.followUpTimers = new Set();
    this.running = undefined;
    this.generation = 0;
    this.refused = false;
    this.offline = false;
    this.failures = 0;
    this.pausedUntil = 0;
    /** lockId -> tail of its command chain: one command at a time per lock */
    this.commandChains = new Map();
    this.published = undefined;
    /** deviceId -> badge last published (JSON) */
    this.transports = new Map();
    this.lastStatus = undefined;
    this.lastTestAt = -Infinity;
    this.started = false;
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    this.stop();
    await this.running;
    this.config = normalizeConfig(raw);
    this.reset();
    this.client.configure({
      bridge: this.config.bridge,
      token: this.config.token,
      mode: this.config.tokenMode,
    });
    this.publisher.start();
    if (!this.config.hostText || !this.config.token) {
      await this.setStatus(false, T.noConfig);
      return;
    }
    if (!this.config.bridge) {
      await this.setStatus(false, T.badHost);
      return;
    }
    await this.setStatus(false, T.connecting);
    await this.refresh();
  }

  stop() {
    this.generation += 1;
    if (this.timer) {
      this.timers.clearTimeout(this.timer);
      this.timer = undefined;
    }
    for (const handle of this.followUpTimers) {
      this.timers.clearTimeout(handle);
    }
    this.followUpTimers.clear();
    this.publisher.stop();
  }

  /** Forgets the bridge and the failures: new settings, or a restart. */
  reset() {
    this.devices.clear();
    this.bridgeInfo = undefined;
    this.readAt = undefined;
    this.refused = false;
    this.offline = false;
    this.failures = 0;
    this.pausedUntil = 0;
    this.published = undefined;
    this.transports.clear();
  }

  /**
   * Connected to Gladys. The first time, start; after a reconnection (Gladys
   * restarted), resend what Gladys keeps in memory only (Discovery list,
   * status, badges).
   */
  async connected(raw = {}) {
    if (!this.started) {
      this.started = true;
      await this.start(raw);
      return;
    }
    await this.configUpdated(raw);
    this.published = undefined;
    this.transports.clear();
    const status = this.lastStatus;
    this.lastStatus = undefined;
    if (status) {
      const [connected, message] = JSON.parse(status);
      await this.setStatus(connected, message ?? undefined);
    }
    await this.publishDevices();
    await this.publishAllTransports();
  }

  /** A new bridge or token restarts; the rest applies at once. */
  async configUpdated(raw = {}) {
    const next = normalizeConfig(raw);
    const previous = this.config;
    if (
      next.hostText !== previous.hostText ||
      next.token !== previous.token ||
      next.tokenMode !== previous.tokenMode
    ) {
      return this.start(raw);
    }
    this.config = next;
    if (next.pollInterval !== previous.pollInterval && this.timer && !this.refused) {
      if (this.now() >= this.pausedUntil && this.failures === 0) {
        this.schedule(next.pollInterval * 1000);
      }
    }
    if (next.language !== previous.language) {
      await this.publishDevices();
      this.queueAll();
      await this.flush();
    }
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  // --- Polling ---------------------------------------------------------------

  schedule(ms) {
    if (this.timer) {
      this.timers.clearTimeout(this.timer);
    }
    const generation = this.generation;
    this.timer = this.timers.setTimeout(() => {
      this.timer = undefined;
      if (generation === this.generation) {
        this.refresh().catch((err) => this.logger.error(`Tedee refresh failed: ${err.message}`));
      }
    }, ms);
  }

  /** One read at a time: a call during a read joins it. */
  refresh() {
    if (!this.running) {
      this.running = this.run().finally(() => {
        this.running = undefined;
      });
    }
    return this.running;
  }

  async run() {
    const generation = this.generation;
    if (!this.client.configured) {
      return;
    }
    if (this.now() < this.pausedUntil) {
      this.schedule(this.pausedUntil - this.now());
      return;
    }
    try {
      this.bridgeInfo ??= await this.client.getBridge();
      const list = await this.client.getLocks();
      if (generation !== this.generation) {
        return;
      }
      this.devices = parseDevices(list);
      this.readAt = this.now();
      this.failures = 0;
      this.offline = false;
      this.refused = false;
      await this.publishDevices();
      this.queueAll();
      await this.setStatus(true, this.statusMessage());
      this.schedule(this.config.pollInterval * 1000);
    } catch (err) {
      if (generation !== this.generation) {
        return;
      }
      await this.failed(err);
    }
    await this.publishAllTransports();
    await this.flush();
  }

  bridgeName() {
    const info = this.bridgeInfo ?? {};
    const name = typeof info.name === 'string' && info.name.trim() ? info.name.trim() : undefined;
    const serial = typeof info.serialNumber === 'string' ? info.serialNumber : undefined;
    return (name ?? serial ?? this.config.bridge?.host ?? '').slice(0, 60);
  }

  statusMessage() {
    const kinds = [...this.devices.values()].map((d) => d.kind);
    return T.connected(
      this.bridgeName(),
      kinds.filter((k) => k === 'lock').length,
      kinds.filter((k) => k === 'keypad').length,
    );
  }

  /** A pause after a failure, then a new try: never a dead integration. */
  async failed(err) {
    const reason = errorReason(err);
    let wait;
    if (err.kind === 'refused') {
      // A drifting clock can refuse a hashed token for a while: retried by itself.
      this.refused = true;
      wait = TIMINGS.refusedRetry;
      this.logger.warn(`The Tedee Bridge refused the API token (${reason})`);
      await this.setStatus(false, T.refused(age(wait)));
    } else if (err.kind === 'rate_limited') {
      wait = this.pause(err);
      await this.setStatus(this.readAt !== undefined, T.rateLimited(age(wait)));
    } else {
      wait = TIMINGS.backoff[Math.min(this.failures, TIMINGS.backoff.length - 1)];
      this.offline = OFFLINE.has(err.kind) || this.offline;
      await this.setStatus(false, T.unreachable(reason, age(wait)));
    }
    this.failures += 1;
    this.schedule(wait);
    this.logger.warn(`Tedee: ${reason}; next try in ${Math.round(wait / 1000)} s`);
  }

  /** 429: a pause of Retry-After, between 60 s and 6 h, for every path. */
  pause(err) {
    const asked = err.retryAfter ?? TIMINGS.rateLimitMin;
    const wait = Math.max(TIMINGS.rateLimitMin, Math.min(TIMINGS.rateLimitMax, asked));
    this.pausedUntil = Math.max(this.pausedUntil, this.now() + wait);
    return wait;
  }

  // --- Gladys ----------------------------------------------------------------

  async publishDevices() {
    if (this.readAt === undefined) {
      return;
    }
    const devices = buildDevices(this.gladys, [...this.devices.values()], this.config.language);
    const json = JSON.stringify(devices);
    if (json === this.published) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.published = json;
    } catch (err) {
      this.logger.warn(`Publishing the discovered devices failed: ${err.message}`);
    }
  }

  createdFeatures() {
    return new Set(
      (this.gladys.devices ?? []).flatMap((d) => (d.features ?? []).map((f) => f.external_id)),
    );
  }

  /** Queues the states of one device (the features created in Gladys only). */
  queue(device, created = this.createdFeatures()) {
    const ids = deviceIds(this.gladys, device.id);
    for (const { role, ...value } of statesOf(device, this.config.language)) {
      const id = ids.feature(role);
      if (created.has(id)) {
        this.publisher.push(id, value);
      }
    }
  }

  queueAll(created = this.createdFeatures()) {
    for (const device of this.devices.values()) {
      this.queue(device, created);
    }
  }

  async flush() {
    await this.publisher
      .flush()
      .catch((err) => this.logger.warn(`Sending to Gladys failed: ${err.message}`));
  }

  badge(device) {
    if (this.refused || this.offline) {
      return { transport: DEVICE_TRANSPORTS.UNREACHABLE };
    }
    if (!device.connected) {
      return { transport: DEVICE_TRANSPORTS.UNREACHABLE, degraded: true, message: T.lockOffline };
    }
    return { transport: DEVICE_TRANSPORTS.LOCAL };
  }

  async publishAllTransports() {
    const created = new Set((this.gladys.devices ?? []).map((d) => d.external_id));
    const entries = [];
    for (const device of this.devices.values()) {
      const externalId = deviceIds(this.gladys, device.id).device;
      if (!created.has(externalId)) {
        continue;
      }
      const entry = { external_id: externalId, ...this.badge(device) };
      const json = JSON.stringify(entry);
      if (this.transports.get(externalId) !== json) {
        this.transports.set(externalId, json);
        entries.push(entry);
      }
    }
    if (entries.length > 0) {
      await this.gladys
        .publishTransports(entries)
        .catch((err) => this.logger.warn(`Transport badges failed: ${err.message}`));
    }
  }

  /** A device was created (or updated): send its last values at once. */
  async deviceCreated(device) {
    this.transports.delete(device?.external_id);
    const created = this.createdFeatures();
    for (const f of device?.features ?? []) {
      created.add(f.external_id);
    }
    this.queueAll(created);
    await this.flush();
    await this.publishAllTransports();
  }

  async deviceDeleted(device) {
    this.transports.delete(device?.external_id);
    if (device?.external_id) {
      this.publisher.forget(device.external_id);
    }
  }

  /** The Discovery tab asks for a scan: a fresh read if the last one is old enough. */
  async scan() {
    if (
      this.client.configured &&
      this.now() >= this.pausedUntil &&
      (this.readAt === undefined || this.now() - this.readAt >= TIMINGS.testCooldown)
    ) {
      await this.refresh();
      return;
    }
    await this.publishDevices();
  }

  // --- Commands --------------------------------------------------------------

  refusal(text, cause) {
    return new Refusal(word(text, this.config.language), cause ? { cause } : undefined);
  }

  async setValue(_gladysDevice, feature, value) {
    // The ack deadline counts from the arrival of the command, before any wait.
    const receivedAt = this.now();
    const target = parseFeatureId(feature?.external_id);
    if (!target || !COMMAND_ROLES.includes(target.role)) {
      throw new Error(`${feature?.external_id} cannot be set`);
    }
    const number = Number(value);
    if (target.role === 'lock' && number !== 0 && number !== 1) {
      throw new Error(`Unexpected value "${value}" (0 or 1)`);
    }
    if (target.role === 'pull' && !Number.isFinite(number)) {
      throw new Error(`Unexpected value "${value}"`);
    }
    return this.serialized(target.id, () => this.command(target, number, receivedAt));
  }

  /** Runs `task` after the previous task of the same key (a promise chain per key). */
  serialized(key, task) {
    const previous = this.commandChains.get(key) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(task);
    const tail = run.catch(() => {});
    this.commandChains.set(key, tail);
    tail.then(() => {
      if (this.commandChains.get(key) === tail) {
        this.commandChains.delete(key);
      }
    });
    return run;
  }

  /** Time left before the deadline of a command that arrived at `receivedAt`. */
  remaining(receivedAt) {
    return receivedAt + TIMINGS.commandDeadline - this.now();
  }

  async command({ id, role }, value, receivedAt) {
    const { allowUnlock, allowPull } = this.config;
    const unlocking = role === 'lock' && value === 0;
    if (!this.client.configured) {
      throw this.refusal(T.denied.noConfig);
    }
    if (unlocking && !allowUnlock) {
      throw this.refusal(T.denied.unlock);
    }
    if (role === 'pull' && !allowPull) {
      throw this.refusal(T.denied.pull);
    }
    if (this.refused) {
      throw this.refusal(T.denied.refused);
    }
    if (this.now() < this.pausedUntil) {
      throw this.refusal(T.denied.paused);
    }
    const known = this.devices.get(id);
    if (!known || known.kind !== 'lock') {
      throw this.refusal(T.denied.unknownDevice);
    }
    if (this.remaining(receivedAt) <= TIMINGS.minRequestTimeout) {
      throw this.refusal(T.denied.late);
    }

    // The state just before acting, never the one in memory.
    const lock = await this.readLock(id, receivedAt);
    if (this.remaining(receivedAt) <= 0) {
      throw this.refusal(T.denied.late);
    }
    if (!lock.connected) {
      throw this.refusal(T.denied.offline);
    }
    if (isMoving(lock)) {
      throw this.refusal(T.denied.moving);
    }
    if (!isStill(lock)) {
      throw this.refusal(T.denied.unknown);
    }

    let send;
    let moving;
    if (role === 'lock' && value === 1) {
      if (isLocked(lock)) {
        return;
      }
      send = () => this.client.lock(id, { timeout: TIMINGS.commandTimeout });
      moving = LOCK_STATE.LOCKING;
    } else if (role === 'lock') {
      if (lock.state === LOCK_STATE.UNLOCKED || lock.state === LOCK_STATE.PULLED) {
        return;
      }
      send = () =>
        this.client.unlock(id, UNLOCK_MODE.WITHOUT_PULL, { timeout: TIMINGS.commandTimeout });
      moving = LOCK_STATE.UNLOCKING;
    } else {
      if (!lock.pullSpring) {
        throw this.refusal(T.denied.pullSpring);
      }
      if (lock.state === LOCK_STATE.LOCKED || lock.state === LOCK_STATE.HALF_OPEN) {
        // Opening a locked door unlocks it first: both options are needed.
        if (!allowUnlock) {
          throw this.refusal(T.denied.pullLocked);
        }
        send = () =>
          this.client.unlock(id, UNLOCK_MODE.UNLOCK_OR_PULL, { timeout: TIMINGS.commandTimeout });
      } else {
        send = () => this.client.pull(id, { timeout: TIMINGS.commandTimeout });
      }
      moving = LOCK_STATE.PULLING;
    }

    try {
      await send();
    } catch (err) {
      this.followUp();
      if (err.kind === 'rate_limited') {
        this.pause(err);
      }
      if (err.kind === 'timeout' || err.kind === 'network') {
        // The request may have reached the bridge: the lock may move anyway.
        throw new Error(word(T.sentNoAnswer, this.config.language), { cause: err });
      }
      throw new Error(word(T.commandFailed(errorReason(err)), this.config.language), {
        cause: err,
      });
    }
    this.logger.info(
      `${deviceName(lock, 'en')}: ${role === 'pull' ? 'pull' : value ? 'lock' : 'unlock'} sent`,
    );
    // Shown as moving until the bridge reports the end of the movement.
    const shown = { ...lock, state: moving, jammed: false };
    this.devices.set(id, shown);
    this.queue(shown);
    this.flush();
    this.followUp();
  }

  /** GET /lock/{id} within the command deadline; refused on any failure. */
  async readLock(id, receivedAt) {
    const timeout = Math.max(
      TIMINGS.minRequestTimeout,
      Math.min(TIMINGS.requestTimeout, this.remaining(receivedAt)),
    );
    let raw;
    try {
      raw = await this.client.getLock(id, { timeout });
    } catch (err) {
      if (err.kind === 'rate_limited') {
        this.pause(err);
      }
      this.logger.info(`Tedee lock ${id}: no state before the command (${errorReason(err)})`);
      throw this.refusal(T.denied.unreadable, err);
    }
    const lock = parseDevice(raw);
    if (!lock || lock.id !== id || lock.kind !== 'lock') {
      throw this.refusal(T.denied.unreadable, new BridgeError('bad_response', 'not this lock'));
    }
    this.devices.set(id, lock);
    this.queue(lock);
    this.flush();
    return lock;
  }

  /** A few reads after a command: the movement, then its end. */
  followUp() {
    const generation = this.generation;
    for (const delay of TIMINGS.followUps) {
      const handle = this.timers.setTimeout(() => {
        this.followUpTimers.delete(handle);
        if (generation === this.generation) {
          this.refresh().catch((err) => this.logger.warn(`Tedee refresh failed: ${err.message}`));
        }
      }, delay);
      this.followUpTimers.add(handle);
    }
  }

  // --- "Test the connection" button -----------------------------------------

  async testConnection() {
    if (!this.config.hostText || !this.config.token) {
      return T.noConfig;
    }
    if (!this.config.bridge) {
      return T.badHost;
    }
    if (this.now() < this.pausedUntil) {
      return T.rateLimited(age(this.pausedUntil - this.now()));
    }
    if (this.now() - this.lastTestAt < TIMINGS.testCooldown) {
      const [, message] = JSON.parse(this.lastStatus ?? '[false,null]');
      return message
        ? { en: `${T.testCooldown.en} ${message.en}`, fr: `${T.testCooldown.fr} ${message.fr}` }
        : T.testCooldown;
    }
    this.lastTestAt = this.now();
    // The button is how a refused token is retried at once.
    this.refused = false;
    this.bridgeInfo = undefined;
    await this.running;
    await this.refresh();
    const [, message] = JSON.parse(this.lastStatus ?? '[false,null]');
    return message ?? T.noConfig;
  }
}
