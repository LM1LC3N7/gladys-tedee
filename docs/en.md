# Tedee

Unofficial integration, not affiliated with Tedee. It brings the **Tedee GO**
and **Tedee PRO** smart locks paired with a **Tedee Bridge** into Gladys,
through the official local API of the bridge (Bridge API v1.0): everything
stays on your local network, without the Tedee cloud.

> **Warning: this integration has never been tested with a real bridge or a
> real lock.** It was written from the official Bridge API documentation and
> the aiotedee library, and tested against a fake bridge only. Feedback is
> welcome.

## What you get

For each lock:

| Feature                     | Detail                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Lock                        | Command: 1 locks, 0 unlocks (when allowed). Shows 1 locked, 0 unlocked or half-locked.                                    |
| Lock state                  | 0 unlocked, 1 locked, 2 moving, 3 error (jammed or not calibrated).                                                       |
| Status                      | Text: locked, unlocked, half-locked, latch pulled, moving, jammed, not calibrated, updating, not connected to the bridge. |
| Open the door (pull spring) | Button, only when the pull spring is on in the Tedee app (when both options are allowed).                                 |
| Door                        | Opening sensor, only when a Tedee Door Sensor is paired.                                                                  |
| Battery                     | In %.                                                                                                                     |
| Charging                    | Tedee PRO only (rechargeable battery).                                                                                    |

The connection of each lock to the bridge shows in the device badge:
"unreachable" (with an orange dot) when the lock is no longer connected to the
bridge, "unreachable" for all when the bridge no longer answers.

A **Tedee Keypad** listed by the bridge shows with its battery only; the local
API does not document keypads, this is not verified.

## Setup

1. In the Tedee app, open the bridge, then **Settings > Local API** (Bridge
   API), turn it on and note the **token** and the **Encrypted token** switch
   (on = **Hashed** mode, off = **Plain** mode). The bridge firmware must be
   recent enough to offer the local API.
2. Give the bridge a fixed IP address in your router (DHCP reservation).
3. In Gladys, install the Tedee integration and enter the **IP address of the
   bridge**, the **API token** and the **token mode**.
4. Click **Test the connection**, then add the locks from the **Discovery**
   tab.

## Safety

- **Locking is always possible.**
- **Unlocking** is off by default: turn on **Allow unlocking the locks from
  Gladys** to allow it (scenes, dashboard, voice assistants).
- **Opening the door (pull spring)** is off by default and **always needs both
  options**: **Allow unlocking** and **Allow opening the door**, whatever the
  state of the lock. On a locked lock, the button sends "unlock or pull"
  (mode 4): the lock unlocks, and pulls the latch only when the automatic pull
  spring is on in the Tedee app; Gladys then shows "Unlocking…".
- When the **automatic pull spring** is on in the Tedee app, unlocking also
  opens the door: unlocking is then refused until the option to open the door
  is on.
- Before each command, the integration **reads the lock again** on the
  bridge. The command is refused when that read fails, when the lock is not
  connected to the bridge, when it moves (latch pulled included), or when its
  state is unknown (not calibrated, updating).
- The commands of one lock run **one at a time**, and one request at a time
  goes to the bridge (the commands before the reads).
- After a command, any new command of the same lock is refused ("movement in
  progress") until the bridge shows the expected state (or a jammed lock), for
  10 seconds at most; the lock shows as moving meanwhile.
- A command that cannot be sent within **3.5 seconds** of its arrival is
  refused: Gladys shows a failure after 5 seconds, and nothing must move after
  that failure.
- When the bridge does not confirm a command in time, Gladys shows a failure,
  but the lock may still move: check its state.

## Token and privacy

- The token is **kept by Gladys in its database, never shown again, sent only
  to the bridge**. It never appears in the logs.
- The local API of the bridge is **plain HTTP, without encryption**. In
  **hashed** mode (recommended), the token never travels: each request carries
  a SHA-256 digest of the token and the time. This mode needs the clock of the
  Gladys host on time. In **plain** mode, the token travels in clear on the
  local network: whoever watches it can command your locks.
- Nothing goes to the Internet.

## Refresh

The bridge is read every 10 seconds by default (5 to 300 seconds), and a few
times right after a command to follow the movement. The bridge can call an
HTTP address on each event (callbacks), but a Gladys integration container
cannot declare a port reachable from the local network: the integration polls
the bridge instead.

## Errors

- **Token refused** (401, after a second try with a new time): check the
  token; in hashed mode, the clock of the Gladys host. Tried again every 5
  minutes, or at once with **Test the connection**.
- **HTTP 403 on a read**: the cause is not documented for the reads; most
  likely a token mode that does not match the "Encrypted token" switch of the
  app (an assumption). Tried again every 5 minutes.
- **HTTP 403 on an unlock**: the bridge refused the unlock mode (specification
  v1.19); the lock did not unlock.
- **Lock disconnected** (405) and **Bluetooth error** between the bridge and
  the lock (406): the command is not executed, a message says so.
- **Bridge unreachable**: tried again after 10 s, 30 s, 1 min, 2 min, then
  every 5 minutes.
- **The bridge asks to slow down** (429): a pause of at least 1 minute (at
  most 6 h), reads and commands included.

## Credits

- Official documentation of the Tedee Bridge API:
  https://docs.tedee.com/bridge-api
- The logic of the local client is ported to JavaScript from
  [aiotedee](https://github.com/zweckj/aiotedee) by Josef Zweck (MIT license,
  see `THIRD_PARTY_NOTICES.md`).
