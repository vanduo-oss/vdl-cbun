# music-player Specification

## Purpose
Music-player core, DOM CustomEvents, stylesheet, and Vue wrapper on
`./music-player`.
## Requirements
### Requirement: music-player subpath exports the wrapper primary and the whole core namespace

The `./music-player` subpath entry SHALL export the Vue wrapper
`VdMusicPlayer` as the primary surface and SHALL re-export the
framework-agnostic core namespace as the named export `MusicPlayer`, kept
whole apart from the excised vanilla layer: `initPlayer`, `destroy`,
`destroyAll`, `play`, `pause`, `toggle`, `next`, `previous`, `setVolume`,
`setTrack`, `shuffle`, `detach`, `attach`, `minimize`, `expand`,
`toggleMinimize`, `setPosition`, `getState`, plus the `instances` map,
`defaults`, and `version`. `VD_MUSIC_PLAYER_VERSION` is also exported. The
entry MUST use named exports only; the old `VanduoMusicPlayer` alias and
`export default` are dropped.

#### Scenario: wrapper and core are importable from one subpath

- **GIVEN** a Vue 3 project with `@vanduo-oss/vdl-cbun` installed
- **WHEN** it executes
  `import { VdMusicPlayer, MusicPlayer } from '@vanduo-oss/vdl-cbun/music-player'`
- **THEN** `VdMusicPlayer` is a mountable Vue component and
  `MusicPlayer.initPlayer(container, { tracks })` creates a working player on
  the given element

### Requirement: music-player vanilla layer is surgically excised

The core SHALL NOT retain `MusicPlayer.init` (the DOM `data-*`/class scan
method), the module-level `reinit` export, or the `window.VanduoMusicPlayer`
registration block, nor the helpers orphaned by those removals (`hasWindow`,
`normalizeRoot`, `queryAll`). The guarded `window.safeStorageGet` /
`window.safeStorageSet` branches in position persistence SHALL be reduced to
their `localStorage` try/catch fallbacks (the window hooks are
vanilla-framework integration and never exist in the vd3 line; behavior is
identical). Importing the module MUST NOT register any `window.*` global or
scan the DOM.

#### Scenario: importing the module registers no globals and scans nothing

- **GIVEN** a browser-like environment where `window.VanduoMusicPlayer` is
  undefined and the DOM contains a `.vd-music-player` element
- **WHEN** `@vanduo-oss/vdl-cbun/music-player` is imported
- **THEN** `window.VanduoMusicPlayer` is still undefined and the element has
  not been initialized as a player

#### Scenario: position persistence works via localStorage alone

- **GIVEN** a detached draggable player with `persistPosition: true` in an
  environment with no `window.safeStorageSet`
- **WHEN** the player is dragged to a new position
- **THEN** the position is persisted through `localStorage` (and storage
  failures are swallowed), exactly as the old-line fallback behaved

### Requirement: music-player keeps DOM CustomEvents in v1

The core SHALL keep dispatching its DOM CustomEvents on the player container
(bubbling): `musicplayer:play`, `musicplayer:pause`,
`musicplayer:trackchange`, `musicplayer:volumechange`,
`musicplayer:repeatchange`, `musicplayer:ended`, `musicplayer:detach`,
`musicplayer:attach`, `musicplayer:minimize`, `musicplayer:expand` — the v1
decision. The Vue wrapper SHALL keep listening to these DOM events and
re-emitting them as Vue events (`play`, `pause`, `trackchange`, …).

#### Scenario: core dispatches and wrapper forwards

- **GIVEN** a mounted `VdMusicPlayer` with a `@trackchange` listener
- **WHEN** the underlying player changes track (dispatching
  `musicplayer:trackchange` with `{ index, name, url }` detail on the
  container)
- **THEN** the DOM CustomEvent bubbles from the container AND the Vue
  listener receives the event detail

### Requirement: music-player types move into the component directory

The hand-written declarations SHALL move from the old repo's
`types/index.d.ts` to the `src/music-player/` surface (`core.d.ts` minus the
`init`/`reinit`/`VanduoMusicPlayer` declarations, carried `vue.d.ts`, and the
`index.d.ts` entry), copied to `dist/music-player/` at build time.

#### Scenario: typed consumer compiles against the moved declarations

- **GIVEN** a TypeScript consumer with strict mode enabled
- **WHEN** it imports `MusicPlayer`, `VdMusicPlayer`, and the option/state
  types from `@vanduo-oss/vdl-cbun/music-player` and type-checks
  `initPlayer`/`getState` usage
- **THEN** `tsc --noEmit` passes, and `init`/`reinit` are compile errors

### Requirement: music-player version constant carries at 1.0.1

`VD_MUSIC_PLAYER_VERSION` SHALL be `'1.0.1'` (patch-bumped from the launch
`'1.0.0'` for the end-of-playlist fix) and MUST equal the `music-player`
entry in `component-versions.json`; `MusicPlayer.version` mirrors it.

#### Scenario: version constant matches the manifest

- **GIVEN** the music-player core and `component-versions.json`
- **WHEN** `VD_MUSIC_PLAYER_VERSION` and `MusicPlayer.version` are compared
  against the manifest's `music-player` value
- **THEN** all three are exactly `'1.0.1'`

### Requirement: music-player stylesheet ships as a css subpath

The old-line stylesheet SHALL be carried to `src/music-player/styles.css`
and published as `dist/music-player/vd3-music-player.css`, resolvable via
the `./music-player/css` subpath export.

#### Scenario: stylesheet resolves through the exports map

- **GIVEN** a bundler that honors package `exports`
- **WHEN** the consumer imports `@vanduo-oss/vdl-cbun/music-player/css`
- **THEN** it resolves to `dist/music-player/vd3-music-player.css`, whose
  rules match the old-line `music-player/src/styles.css`

### Requirement: music-player state-machine test coverage

The repo SHALL provide vitest coverage (jsdom, with the shared
`HTMLMediaElement` stubs) driving the core through
`MusicPlayer.initPlayer`/`getState`: initialization state (tracks
normalized, invalid tracks filtered, defaults applied), `play`/`pause`/
`toggle` transitions, `next`/`previous` track cycling, the repeat cycle
`off → one → all → off`, `shuffle` reshuffling without mutating the source
list, `setVolume` clamping, `setTrack` bounds handling,
`minimize`/`expand`/`toggleMinimize`, and `destroy`/`destroyAll` clearing
`instances`. The suite MUST assert `VD_MUSIC_PLAYER_VERSION === '1.0.1'`,
equal to the `music-player` entry of `component-versions.json` and to
`MusicPlayer.version`.

#### Scenario: transport transitions reflect in getState

- **GIVEN** a player initialized with three valid tracks
- **WHEN** `play`, `next`, `pause` are called in order
- **THEN** `getState` reports `isPlaying` true after `play`,
  `currentIndex === 1` after `next`, and `isPlaying` false after `pause`

#### Scenario: repeat mode cycles

- **GIVEN** a freshly initialized player (`repeat: 'off'`)
- **WHEN** the repeat control is invoked three times
- **THEN** `getState().repeat` steps through `'one'`, `'all'`, `'off'`

### Requirement: music-player event and wrapper test coverage

The repo SHALL provide vitest coverage (jsdom) asserting the retained v1 DOM
CustomEvent surface: `musicplayer:play`, `musicplayer:pause`,
`musicplayer:trackchange` (with `{ index, name, url }` detail),
`musicplayer:volumechange`, and `musicplayer:repeatchange` dispatch on the
container and bubble. A `VdMusicPlayer` mount spec MUST verify mount creates
the player from props, the wrapper re-emits the DOM events as Vue events, and
unmount destroys the player instance.

#### Scenario: trackchange event carries its detail and bubbles

- **GIVEN** an initialized player inside a parent element with a
  `musicplayer:trackchange` listener
- **WHEN** `setTrack` selects a different track
- **THEN** the listener on the PARENT receives the event (bubbled) with
  `detail.index`, `detail.name`, and `detail.url` for the new track

#### Scenario: wrapper re-emits DOM events as Vue events

- **GIVEN** a jsdom mount of `VdMusicPlayer` with tracks and a
  `@trackchange` listener
- **WHEN** the underlying core changes track
- **THEN** the Vue `trackchange` event fires with the CustomEvent payload,
  and unmounting removes the instance from `MusicPlayer.instances`

### Requirement: repeat-off playlists stop at the final track

When `repeat` is `'off'`, `onEnded` SHALL auto-advance only while a next track exists (`currentIndex + 1 < tracks.length`); at the final track it MUST stop playback and dispatch `musicplayer:ended`. The modulo wrap (`(currentIndex + 1) % tracks.length`) MUST be used **only** in the `repeat === 'all'` branch, so a multi-track playlist with the defaults (`repeat: 'off'`, `autoAdvance: true`) never loops forever and the `musicplayer:ended` branch stays reachable.

#### Scenario: a repeat-off playlist ends instead of wrapping

- **GIVEN** a 2-track player with `repeat: 'off'` and `autoAdvance: true`, positioned on the last track
- **WHEN** the current track ends (the audio `ended` event fires)
- **THEN** playback stops (`isPlaying` is `false`), `currentIndex` stays on the last track (no wrap to `0`), and `musicplayer:ended` is dispatched once

#### Scenario: a non-final track still auto-advances

- **GIVEN** a 2-track player with `repeat: 'off'` and `autoAdvance: true`, positioned on the first track
- **WHEN** the current track ends
- **THEN** the player advances to the next track and does NOT dispatch `musicplayer:ended`

