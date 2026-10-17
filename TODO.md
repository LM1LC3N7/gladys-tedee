# TODO — Tedee v1

Handoff document: what is done, what was decided, what comes next. Keep it
up to date at the end of every milestone.

## Working method

- One milestone at a time, one commit per milestone, tests green before moving on.
- After each milestone: `npm run format:check`, `npm run lint`, `npm test`
  (Node 22 and 24), `npm run audit`, `npx github:GladysAssistant/integration-store .`,
  then update README, `docs/en.md`, `docs/fr.md`, `CHANGELOG.md` and this file.
- The `gladys-assistant-integration` topic is added at the first real release
  only. No forum topic of its own, no forum post from a module session.

## Status

- [x] **Milestone 1 — core** (2026-10-17): Bridge API v1.0 client (hashed and
      plain `api_token`, bounded answers, error kinds), `GET /bridge` and
      `GET /lock` polling (10 s, 5–300), locks GO/PRO and keypads (battery),
      features lock/state/status/pull/door/battery/charging, safety rules
      (`allow_unlock`, `allow_pull`, one command at a time per lock, fresh
      read before acting, refusals on offline/moving/unknown, 3.5 s
      deadline), backoff, 401 retry every 5 min, 429 pause, badges, test
      button, en/fr, docs, cover. Tested against a fake bridge only.
- [ ] **Milestone 2 — real bridge**: run against a real bridge and lock,
      compare with the app (see "To check"); turn the answers (anonymized)
      into fixtures.
- [ ] **Milestone 3 — more**: callbacks if Gladys ever lets the main
      container publish a port (the bridge would then push
      `lock-status-changed`, `device-battery-*`, `device-connection-changed`,
      as aiotedee parses them); lock settings (auto-lock) as read-only params;
      a scene trigger on jammed.
- [ ] **Milestone 4 — first release**: Docker image build check, Release
      workflow, topic, GHCR package public.

## To check on a real bridge

- The exact shape of `GET /lock` on the local API: `state`, `jammed`,
  `doorState`, `batteryLevel`, `isCharging`, `isConnected` at the top level
  (as aiotedee reads them), `deviceSettings.pullSpringEnabled`,
  `serialNumber`. Booleans as 0/1 or true/false (both handled).
- Whether `GET /lock/{id}` exists on the bridge firmware in use (aiotedee only
  reads `GET /lock`); if not, the fresh read before a command must read the
  list instead.
- The validity window of the hashed token (how much clock drift the bridge
  accepts) and the answer to a stale one (401?).
- The status codes of a command on a busy lock (409? 503?) and the body of a
  `202`.
- Whether keypads (type 3 / 10) appear in `GET /lock` at all.
- Rate limits of the bridge: none documented in aiotedee; 10 s polling is the
  pace of Home Assistant.
- Whether Gladys 5.1 accepts the `battery/charging` feature type (present in
  the SDK 0.15 and the current core constants).

## Decisions

- **Not a duplicate** (checked 2026-10-17): no entry matching "tedee" in the
  store index (integration-store-storage.gladysassistant.com/index.json).
- **Reference reused: zweckj/aiotedee** (MIT, the library of Home Assistant's
  Tedee integration, maintained). Python cannot run in the container: its
  local client and models are ported to JavaScript; MIT notice in
  `THIRD_PARTY_NOTICES.md`, copied into the image with `LICENSE`. No
  maintained JavaScript client of the Bridge API exists on npm. No runtime
  dependency besides the SDK.
- **Polling, no callbacks**: the manifest can only declare ports for
  sub-containers; the main container is not reachable from the LAN, so the
  bridge cannot call it back. `GET /lock` every 10 s by default (Home
  Assistant's pace), plus reads 1.5, 4 and 8 s after a command.
- **Token**: `secret` field, kept by Gladys in its database (not encrypted),
  never logged, sent only to the bridge. Hashed mode by default: only
  `sha256(token + ms) + ms` travels; plain mode sends it in clear on the LAN
  (written in the docs). The bridge is plain HTTP (no HTTPS offered).
- **Bridge address**: an IP address or host name with an optional port only
  (no scheme but `http://`, no path, no user): the URL cannot be bent.
- **Safety** (Louis's rule): `allow_unlock` and `allow_pull` off by default;
  opening a locked or half-locked door uses `unlock?mode=4` and needs both;
  locking always allowed (still refused when offline, moving or unknown).
  Unlock uses mode 3 (no automatic pull spring), as Home Assistant.
- **Commands**: a promise chain per lock; `GET /lock/{id}` just before
  acting (the state in memory is never used); refused when that read fails,
  when `isConnected` is false, during a movement (calibrating, locking,
  unlocking, pulling, unpulling) or in an unknown state (uncalibrated,
  unknown, updating). Already in the asked state: nothing sent, success.
  Jammed but still: allowed (a new try is the usual cure).
- **Deadline**: Gladys acks set_value after 5 s. A command is refused when it
  starts (after its turn in the chain) with less than 0.3 s left of 3.5 s, or
  when the fresh read ends after 3.5 s; the command request has a 1.2 s
  timeout, so the answer comes before 4.7 s. A timed-out command answers "the
  lock may still move" and is followed by re-reads.
- **After a command**: shown as moving (lock/state 2) until the next read.
- **Errors**: 401/403 = refused token, tried again every 5 min by itself (a
  clock drift can cause it) or at once by the test button; 429 = pause
  `Retry-After` clamped to 60 s–6 h, applied to polling, scan, test and
  commands; network, timeout, 5xx, bad answers = backoff 10 s → 5 min.
  Answers read up to 256 KB, JSON parsed once.
- **Gladys features**: `lock` lock/binary writable (1 locked, 0 unlocked,
  half-locked and pulled shown as 0, nothing while moving or unknown);
  `state` lock/state read-only (LOCK.STATE 0/1/2/3, 3 = jammed or
  uncalibrated); `status` text (detailed status, in the configured language);
  `pull` button/push, only when the pull spring is on at discovery; `door`
  opening-sensor (1 closed, 0 open), only with a paired door sensor;
  `battery` %; `charging` battery/charging, PRO only. Feature keys are
  forever.
- **Badges**: `local`; `unreachable` when the bridge fails or refuses;
  `unreachable` + degraded for a lock with `isConnected` false.
- **Version 0.1.0 set by hand** in `package.json`, `package-lock.json` and the
  manifest (with the `docker_image` tag `ghcr.io/lm1lc3n7/gladys-tedee:0.1.0`):
  the one-time exception to "versions belong to the Release workflow"; the
  first patch release gives 0.1.1.
- **Docker**: not installed on the development PC, so no end-to-end test in a
  container yet; the CI builds the image.
