# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.1.1] - 2026-10-17

### Added

- Tedee GO and PRO locks through the local API of the Tedee Bridge (v1.0),
  with the API token in hashed (default) or plain mode.
- Lock (lock and unlock), lock state (unlocked, locked, moving, error),
  detailed status (half-locked, jammed, not calibrated…), door sensor, battery
  and charging (PRO); keypads listed by the bridge with their battery.
- Unlocking and opening the door (pull spring) are off by default, each behind
  its own option; opening the door always needs both, and unlocking a lock
  whose automatic pull spring is on needs both too. Locking is always allowed.
- Commands run one at a time per lock, after a fresh read of the lock; refused
  when that read fails, when the lock is offline, moving (latch pulled
  included) or in an unknown state, or when the command cannot be sent within
  3.5 s of its arrival. After a command, the lock is shown moving and any new
  command refused until the bridge shows the expected state (10 s at most).
- One request at a time to the bridge, the commands first; a refused token is
  tried once more with a new timestamp; clear messages for a refused token
  mode (403), a disconnected lock (405) and a Bluetooth error (406).
- The bridge is read every 10 s (5 to 300) and right after each command;
  pauses after errors, a retry every 5 minutes after a refused token, and a
  pause of 60 s to 6 h when the bridge answers 429.
- Badges: local; unreachable when the bridge does not answer; unreachable and
  degraded for a lock not connected to the bridge.
- "Test the connection" button.
- Feature names and status texts in French or English.

[Unreleased]: https://github.com/LM1LC3N7/gladys-tedee/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-tedee/releases/tag/v0.1.1
