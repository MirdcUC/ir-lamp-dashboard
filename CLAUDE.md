# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page dashboard (Vue 3 + Vite + TypeScript) that monitors and controls 4 IR lamp temperature
controllers (FOTEK NT-48L-RS) on a production line. The browser talks to an Arduino over the Web Serial
API; the Arduino polls the 4 controllers over RS-485 (Modbus RTU) and relays plain-text lines back.

The wire protocol itself is defined in [PROTOCOL.md](./docs/PROTOCOL.md); open questions for the firmware
engineer are tracked in [DEVICE-CHECKLIST.md](./docs/DEVICE-CHECKLIST.md) (has a "還沒確認"/G-section — check
it before treating any field semantics as settled); the per-screen field layout (main/settings/advanced
screens) is documented in [README.md](./README.md)'s "畫面版面規劃" section. Read the relevant one before
touching `features/serial/protocol/`, `commands.ts`, or `constants.ts`.

## Commands

```bash
npm run dev              # http://localhost:5173
npm run test             # vitest run (all tests)
npx vitest run <path>    # run a single test file, e.g. src/features/serial/lampState.test.ts
npx vitest run -t "<name>"  # run tests matching a name
npm run build            # vue-tsc -b (type-check) + vite build
```

Useful query params during manual testing (see README.md for the full list): `?mock=1` boots straight
into simulation with all 4 lamps running; `?debug=1` shows the raw-line/parse-rate diagnostics panel.

## Architecture

### Feature-based layout

```
src/
├── app/              # App.vue (screen switcher), theme.ts
├── features/
│   ├── serial/       # the engine — protocol, connection, simulator, state, all in one feature
│   ├── dashboard/     # main monitoring screen
│   ├── settings/      # SET_SET screen
│   └── advanced-settings/  # SET_ADVANCED screen
└── shared/            # cross-feature: TopBar/LampTabs, utils, styles, settingsShared.ts
```

Within `features/serial/`, import via relative paths; across features/shared, import via the `@/` alias.
`settingsShared.ts` lives in `shared/` (not in `settings/`) because both the settings and
advanced-settings screens depend on it.

### The `features/serial/` engine

- `protocol/` — pluggable line-format adapters for the two confirmed formats (`idPrefixedAdapter` for
  the existing per-lamp status line, `mergedLineAdapter` for the newer unpaged all-fields line — see
  PROTOCOL.md). Per PROTOCOL.md both lines are sent concurrently, not as mutually-exclusive candidates,
  so the decoder classifies **each line independently** against every adapter rather than locking onto
  one for the whole connection.
- `connection.ts` — raw Web Serial read/write. Knows nothing about the protocol; just line I/O.
- `simulator.ts` — produces text lines in the **same formats** the real adapters parse (both formats,
  every tick), so simulated data flows through the identical decode → state pipeline as real hardware.
  Any UI action (SV, Run/Stop,
  AT, PID, SET_SET, SET_ADVANCED) that's wired through `store.ts`'s `dispatch()` actually mutates the
  simulator's internal state and shows up in the next emitted line — it isn't just background noise.
- `lampState.ts` — holds per-lamp status/PID/protocol-status plus a **station ↔ local-id routing table**.
  Local lamp ids (1–4, fixed to the UI tabs) are separate from the device "station" address, which can be
  changed at runtime via SET_ADVANCED (`setStation`). Incoming frames are routed by looking up the
  reported station in this table; if you change how station addressing works, `simulator.ts` must keep
  emitting its `Id` field as the *current* station (`SimLamp.station`), or simulated frames silently stop
  routing back to their card after a station change.
- `commandTracker.ts` — the protocol has no ACK, so "did the command take effect" is inferred by
  comparing the next reported value against what was sent, with a tolerance and timeout
  (`COMMAND_TOLERANCE`, `COMMAND_TIMEOUT_MS` in `constants.ts`). Status flows
  `pending → confirmed` (matched) or `pending → unconfirmed` (timed out, result unknown — never
  auto-retried). Some commands (manual output %) aren't verifiable at all since the controller's own PID
  overwrites the value; those go straight to `sent`.
- `store.ts` — the Pinia store wiring all of the above together. `dispatch()` is the single fork point
  between real hardware (`connection.write`) and simulation (calls straight into `simulator.ts`) — every
  new control command should go through it rather than branching on `isSimulating` elsewhere.
- `constants.ts` — the "confirm with the field/firmware engineer" values (baud rate, SV range/default,
  staleness thresholds, command tolerance) are deliberately centralized here so they're one place to
  update once real hardware/process parameters are known.

### Staleness / offline

`connections` in `lampState.ts` derives `online` / `stale` / `offline` per lamp from time since last
report (`STALE_AFTER_MS` = 5s, `OFFLINE_AFTER_MS` = 15s). Sending a command to an offline lamp is not
blocked, but `commandTracker` tags it `offlineAtSend` so the UI can warn "likely undelivered" immediately
instead of waiting out the full command timeout.

### Testing

Vitest only covers pure logic — protocol parsing (`protocol/adapters.test.ts`), staleness/state
projection (`lampState.test.ts`), command read-back matching (`commandTracker.test.ts`), and the
decode→state pipeline end-to-end (`pipeline.test.ts`). There's no component-level testing.
