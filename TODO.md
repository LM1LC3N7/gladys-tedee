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
- [x] **Review fixes** (2026-10-17): guard per lock after each command
      (refuses every command, keeps the lock shown moving, lifted by the
      expected end state or a jam, 10 s at most), unlock mode as header and
      query, auto pull spring check, any pull needs both options, 401 tried
      twice with increasing timestamps, single request queue (commands
      first), command answer by 4.6 s, pulled = moving, pull takes 1 only,
      403/405/406 messages, token mode labels.
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
  (as aiotedee reads them), `deviceSettings.pullSpringEnabled` and
  `autoPullSpringEnabled`, `serialNumber`. Booleans as 0/1 or true/false (both
  handled). An absent `autoPullSpringEnabled` is read as off.
- `GET /lock/{id}`: confirmed by the Bridge API specification v1.19 (per the
  review); still to see on a real firmware.
- The `mode` of `POST /lock/{id}/unlock`: a header in the v1.19 specification,
  a query parameter in aiotedee: both are sent. Check that the bridge accepts
  both together.
- The validity window of the hashed token (how much clock drift the bridge
  accepts) and the answer to a stale one (401, tried once more here).
- The answers of a command: 204 (or 202) without body; 405 lock disconnected,
  406 Bluetooth error, 409 busy?
- Whether keypads (type 3 / 10) appear in `GET /lock` at all.
- **Rate limit: 1 request per second, documented.** The integration sends one
  request at a time (single queue, commands first) but does not space them by
  1 s: a command is a read then a POST back to back, and the follow-up reads
  may meet a poll. Watch for errors on a real bridge; spacing would cost up to
  1 s per command inside the 3.5 s deadline.
- `battery/charging`: accepted by the Gladys core since v5.0.0 (per the
  review); the manifest asks for 5.1.0 anyway.

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
  Assistant's pace), plus reads 1.5, 4, 8 and 11 s after a command.
- **Token**: `secret` field, kept by Gladys in its database (not encrypted),
  never logged, sent only to the bridge. Hashed mode by default (the
  "Encrypted token" switch of the app on; off = Plain): only
  `sha256(token + ms) + ms` travels, with strictly increasing timestamps;
  plain mode sends it in clear on the LAN (written in the docs). The bridge is
  plain HTTP (no HTTPS offered).
- **Bridge address**: an IP address or host name with an optional port only
  (no scheme but `http://`, no path, no user): the URL cannot be bent.
- **One request at a time** to the bridge: a single queue, the commands (read
  and POST) before the polling. Polling reads time out after 3 s, so a command
  never waits long behind one.
- **Safety** (Louis's rule, and the coordinator's decision of 2026-10-17):
  `allow_unlock` and `allow_pull` off by default; **any pull needs both**,
  whatever the state; unlocking a lock whose automatic pull spring is on needs
  `allow_pull` too (it would open the door). Locking always allowed (still
  refused when offline, moving, unknown or guarded). Unlock uses mode 3 (no
  automatic pull spring), as Home Assistant; a pull on a locked or half-locked
  lock uses mode 4, which only unlocks when the automatic pull spring is off
  (shown "Unlocking…").
- **Commands**: a promise chain per lock; `GET /lock/{id}` just before acting
  (the state in memory is never used); refused when that read fails, when
  `isConnected` is false, during a movement (calibrating, locking, unlocking,
  pulled, pulling, unpulling) or in an unknown state (uncalibrated, unknown,
  updating). Already in the asked state and no guard: nothing sent, success.
  Jammed but still: allowed (a new try is the usual cure).
- **Guard after a command** (review blocker 1): set after the POST, whether it
  succeeded, timed out or failed on the network / 5xx (the bridge may have
  acted); holds the expected end state (locked, or unlocked for unlock and
  pull) and expires after 10 s. While it holds, every command of the lock is
  refused ("movement in progress", never "already done"), and any read (a
  poll that was in flight included) shows the lock moving; only a read showing
  the expected end state or a jam lifts it, never an unknown state.
- **Deadline**: Gladys acks set_value after 5 s. The read starts by 3.2 s
  after the arrival, the POST by 3.5 s (checked when it leaves the queue);
  the POST may last until 4.6 s after the arrival, 1.2 s at least. A
  timed-out command answers "the lock may still move", is guarded and
  followed by re-reads.
- **Errors**: 401 = refused token, after one more try with a new timestamp;
  403 = token mode refused; both tried again every 5 min by themselves or at
  once by the test button, and never refuse a command by themselves (the
  command tries). 405 = lock disconnected, 406 = Bluetooth error: own
  messages. 429 = pause `Retry-After` clamped to 60 s–6 h, applied to polling,
  scan, test and commands; network, timeout, 5xx, bad answers = backoff 10 s
  → 5 min. Answers read up to 256 KB, JSON parsed once.
- **Gladys features**: `lock` lock/binary writable (1 locked, 0 unlocked or
  half-locked, nothing while moving, pulled or unknown); `state` lock/state
  read-only (LOCK.STATE 0/1/2/3, 2 = moving or pulled, 3 = jammed or
  uncalibrated); `status` text (detailed status, in the configured language);
  `pull` button/push (value 1 only), only when the pull spring is on at
  discovery; `door` opening-sensor (1 closed, 0 open), only with a paired door
  sensor; `battery` %; `charging` battery/charging, PRO only. Feature keys
  are forever.
- **Badges**: `local`; `unreachable` when the bridge fails or refuses;
  `unreachable` + degraded for a lock with `isConnected` false.
- **Version 0.1.0 set by hand** in `package.json`, `package-lock.json` and the
  manifest (with the `docker_image` tag `ghcr.io/lm1lc3n7/gladys-tedee:0.1.0`):
  the one-time exception to "versions belong to the Release workflow"; the
  first patch release gives 0.1.1.
- **Docker**: not installed on the development PC, so no end-to-end test in a
  container yet; the CI builds the image.
