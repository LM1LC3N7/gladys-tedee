# gladys-tedee

[Gladys Assistant](https://gladysassistant.com) external integration for
**Tedee** smart locks (Tedee GO, Tedee PRO), through the official **local API
of the Tedee Bridge** (Bridge API v1.0), without the Tedee cloud: lock state
(locked, unlocked, half-locked, moving, jammed), door sensor, battery and
charging, connection. Locking is always allowed; unlocking and opening the
door (pull spring) are off until the user allows them. Unofficial, not
affiliated with Tedee.

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

> **Work in progress (milestone 1).** Tested against a fake bridge only, never
> with a real Tedee Bridge or lock.

## How it works

```
Gladys ⇄ SDK ⇄ src/handlers.js ⇄ src/app.js (TedeeApp) ⇄ src/bridge.js ⇄ http://<bridge>/v1.0
                                   ├─ src/tedee.js      lock list -> devices (pure)
                                   ├─ src/devices.js    -> Gladys devices and states (pure)
                                   └─ src/publisher.js  300 states/min
```

- **Bridge**: plain HTTP on the LAN, port 80 (another port can be given as
  `host:port`). The `api_token` header is, in hashed mode (default),
  `sha256(token + ms)` in hex followed by `ms`, the current time in
  milliseconds; in plain mode, the token. The token is a `secret` field, never
  logged.
- **Reading**: `GET /bridge` once per start, then `GET /lock` every 10 s (5 to
  300), and 1.5, 4 and 8 s after each command. Answers are read up to 256 KB.
  Errors back off 10 s, 30 s, 1, 2 then 5 minutes; a refused token (401/403)
  is tried again every 5 minutes (a clock drift heals) or at once with the
  test button; a 429 pauses every path for Retry-After, between 60 s and 6 h.
- **No callbacks**: the bridge can POST its events to a URL (`/callback`), but
  the integration container declares no port the LAN can reach (only
  sub-containers can, in the manifest): polling instead.
- **Devices**: `ext:<selector>:tedee:<id>`, the Tedee device id. Features by
  role: `lock` (lock/binary, writable), `state` (lock/state: 0 unlocked, 1
  locked, 2 moving, 3 error), `status` (text), `pull` (button/push, when the
  pull spring is on), `door` (opening-sensor, when a door sensor is paired),
  `battery`, `charging` (PRO). Keypads, if listed: battery only.
- **Commands** (one chain per lock): refused without `allow_unlock` (unlock) or
  `allow_pull` (pull; a locked door needs both), then `GET /lock/{id}` just
  before acting, refused when that read fails, or the lock is offline, moving
  or in an unknown state, or when the command is not sent within 3.5 s of its
  arrival. `POST /lock/{id}/lock`, `/unlock?mode=3` (no auto pull),
  `/unlock?mode=4` (unlock and pull) or `/pull`, with a 1.2 s timeout.

## Development

```bash
npm install
npm test                                        # node --test, 127.0.0.1 only
npm run lint && npm run format:check
npm run audit
npx github:GladysAssistant/integration-store .  # store admission checks
```

`test/fixtures/bridge.js` holds answers shaped like the documentation
(made-up values); `test/helpers/fakeBridge.js` serves them from a real HTTP
server on 127.0.0.1, checks the `api_token` header in both modes and moves its
locks on the commands.

## Credits

- [zweckj/aiotedee](https://github.com/zweckj/aiotedee) (MIT), the Python
  library of the Home Assistant integration: the local client (endpoints,
  hashed token, unlock modes) and the models (states, door states, device
  types) are ported to JavaScript. Notice in
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- The official [Tedee Bridge API documentation](https://docs.tedee.com/bridge-api).

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release. The
`gladys-assistant-integration` topic lists the repository in the Gladys store
(added at the first real release).

## License

Apache-2.0 (see [LICENSE](LICENSE)); the ported aiotedee logic is MIT (see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)). Tedee is a trademark of its
owner; this project is not affiliated with Tedee.
