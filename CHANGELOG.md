# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Tedee GO and PRO locks through the local API of the Tedee Bridge (v1.0),
  with the API token in hashed (default) or plain mode.
- Lock (lock and unlock), lock state (unlocked, locked, moving, error),
  detailed status (half-locked, jammed, not calibrated…), door sensor, battery
  and charging (PRO); keypads listed by the bridge with their battery.
- Unlocking and opening the door (pull spring) are off by default, each behind
  its own option; opening a locked door needs both. Locking is always allowed.
- Commands run one at a time per lock, after a fresh read of the lock; refused
  when that read fails, when the lock is offline, moving or in an unknown
  state, or when the command cannot be sent within 3.5 s of its arrival.
- The bridge is read every 10 s (5 to 300) and right after each command;
  pauses after errors, a retry every 5 minutes after a refused token, and a
  pause of 60 s to 6 h when the bridge answers 429.
- Badges: local; unreachable when the bridge does not answer; unreachable and
  degraded for a lock not connected to the bridge.
- "Test the connection" button.
- Feature names and status texts in French or English.

[Unreleased]: https://github.com/LM1LC3N7/gladys-tedee/commits/main
