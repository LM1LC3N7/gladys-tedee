# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration**: a Node.js service (Node 22+, ESM,
no build step) that runs in its own sandboxed Docker container and talks to
Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official JavaScript template.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
node --test --test-name-pattern "unlock"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          SDK wiring only (src/handlers.js, before connect())
src/handlers.js                   the SDK handlers -> TedeeApp (shared with the e2e tests)
src/app.js                        TedeeApp: polling, devices, badges, commands and their safety rules
src/bridge.js                     Tedee Bridge local API client (api_token, timeouts, error kinds)
src/tedee.js                      lock list -> devices (pure)
src/devices.js                    devices -> Gladys devices and states (pure)
src/publisher.js                  states to Gladys within 300 states/min
src/config.js                     DEFAULTS (mirror the manifest defaults) + normalization
src/constants.js, src/i18n.js     Bridge API enums, timings; en/fr texts
gladys-assistant-integration.json manifest: name, config_schema, actions, image...
docs/en.md, docs/fr.md            user documentation, re-hosted by Gladys (mandatory)
test/                             node --test: SDK fake Gladys + fake bridge on 127.0.0.1
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
TODO.md                           status, things to check on a real bridge, decisions
THIRD_PARTY_NOTICES.md            MIT notice of aiotedee (ported logic), copied into the image
```

## Safety rules (locks)

Locking is always allowed. Unlocking (`allow_unlock`) and opening the door
(`allow_pull`) stay off by default; any pull needs both, and so does unlocking
a lock whose automatic pull spring is on. Commands of one lock are serialized,
one request at a time goes to the bridge, the lock is read again just before
acting, and a command is refused when that read fails, when the lock is
offline, moving or in an unknown state, when it cannot be sent within 3.5 s of
its arrival, or while the guard of the previous command holds (until the
expected end state, a jam, or 10 s). Never weaken these rules.

## Rules

- **External ids are forever.** Build them with
  `gladys.externalIds(type, platformId)`, `platformId` being the unique id the
  platform gives the device (serial, cloud id, MAC), never a label. Gladys keys
  devices, their history, scenes and dashboards on them: changing one creates a
  new device and orphans the old one. The same goes for every key users store:
  manifest `config_schema`, `actions`, widget and scene keys, feature keys.
- **The container rootfs is read-only.** Write only under `/data`, the one
  writable volume. Never log tokens, passwords or API keys.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand — except on the README's hand-pushed tag path, which bumps all three
  together before tagging. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section, and it
  becomes the notes of the GitHub Release.
- **Manifest.** Texts are multi-language objects `{ "en": ..., "fr": ... }`:
  `label`, `description` and `placeholder` alike, never a plain string. The
  catalog `description` holds 10 to 100 characters per language. A field the
  older cores do not know needs a higher `gladys_version` minimum
  (`categories`: 4.86.0; `widgets`, `scene_triggers`, `scene_actions`,
  `type: "provider"`: 5.1.0). `test/manifest.test.js` ties the manifest to the
  code (defaults, action, scene and widget handlers): change both sides
  together.
- **User-facing text** is bilingual (English and French): action messages,
  manifest texts, and `docs/en.md` / `docs/fr.md`, kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never leave 127.0.0.1 (the fake bridge).
