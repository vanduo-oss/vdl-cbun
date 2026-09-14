// @vitest-environment jsdom

// Music-player state machine, driven through the public
// `MusicPlayer.initPlayer` / `getState` surface (jsdom, with the shared
// HTMLMediaElement stubs from tests/setup.ts). Playback state (`isPlaying`) is
// event-driven in the core — the browser fires `play`/`pause` on the audio
// element and the core reflects them — so where the spec asserts a play/pause
// transition we dispatch that native audio event ourselves (the stub's
// `play()`/`pause()` are no-op resolves that never emit). Everything else
// (indices, volume, repeat, shuffle, minimize) is synchronous and asserted
// directly off `getState`.

import { afterEach, describe, expect, it, vi } from 'vitest';

import componentVersions from '../../component-versions.json';
import { MusicPlayer, VD_MUSIC_PLAYER_VERSION } from '../../src/music-player/core.js';
import type {
  MusicPlayerOptions,
  MusicPlayerRepeatMode,
  MusicPlayerState,
} from '../../src/music-player/core.js';

const TRACKS = [
  { name: 'Alpha', url: 'https://cdn.test/alpha.mp3' },
  { name: 'Bravo', url: 'https://cdn.test/bravo.mp3' },
  { name: 'Charlie', url: 'https://cdn.test/charlie.mp3' },
];

const containers: HTMLElement[] = [];

/** Build a player on a fresh, body-attached container. Tracks default to TRACKS. */
function init(opts: MusicPlayerOptions = {}): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  MusicPlayer.initPlayer(container, { tracks: TRACKS.map((t) => ({ ...t })), ...opts });
  return container;
}

/** Non-null getState — throws if the instance is gone. */
function state(container: HTMLElement): MusicPlayerState {
  const s = MusicPlayer.getState(container);
  if (!s) throw new Error('expected a live music-player instance');
  return s;
}

/** The private HTMLMediaElement the instance drives (so specs can fire audio events). */
function audioOf(container: HTMLElement): HTMLMediaElement {
  const inst = MusicPlayer.instances.get(container);
  if (!inst) throw new Error('expected a live music-player instance');
  return (inst as { audio: HTMLMediaElement }).audio;
}

afterEach(() => {
  MusicPlayer.destroyAll();
  containers.length = 0;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('MusicPlayer.initPlayer — initialization', () => {
  it('normalizes tracks and filters invalid entries', () => {
    const container = init({
      tracks: [
        { name: 'Keep A', url: 'https://cdn.test/a.mp3' },
        { name: 'Empty url', url: '' },
        { name: 'Whitespace url', url: '   ' },
        // @ts-expect-error — a null entry must be dropped, not throw
        null,
        // @ts-expect-error — a urlless entry must be dropped
        { name: 'No url' },
        { name: 'Keep B', url: 'https://cdn.test/b.mp3' },
      ],
    });
    const s = state(container);
    expect(s.tracks.map((t) => t.url)).toEqual([
      'https://cdn.test/a.mp3',
      'https://cdn.test/b.mp3',
    ]);
    expect(s.currentTrack).toEqual({ name: 'Keep A', url: 'https://cdn.test/a.mp3' });
  });

  it('applies the documented defaults', () => {
    const s = state(init());
    expect(s.isPlaying).toBe(false);
    expect(s.currentIndex).toBe(0);
    expect(s.volume).toBe(0.5);
    expect(s.shuffle).toBe(false);
    expect(s.repeat).toBe('off');
    expect(s.isDetached).toBe(false);
    expect(s.isMinimized).toBe(false);
    expect(s.tracks).toHaveLength(3);
  });

  it('clamps the initial volume into [0, 1]', () => {
    expect(state(init({ volume: 5 })).volume).toBe(1);
    expect(state(init({ volume: -3 })).volume).toBe(0);
    expect(state(init({ volume: 0.25 })).volume).toBe(0.25);
  });

  it('reports an empty playlist as no current track', () => {
    const s = state(init({ tracks: [] }));
    expect(s.tracks).toHaveLength(0);
    expect(s.currentTrack).toBeNull();
  });

  it('does not mutate the caller-provided track array', () => {
    const input = TRACKS.map((t) => ({ ...t }));
    const snapshot = input.map((t) => t.url);
    const container = document.createElement('div');
    document.body.appendChild(container);
    containers.push(container);
    MusicPlayer.initPlayer(container, { tracks: input, shuffle: true });
    expect(input.map((t) => t.url)).toEqual(snapshot);
  });
});

describe('MusicPlayer — play / pause / toggle', () => {
  it('transport transitions reflect in getState (spec scenario)', () => {
    const container = init();
    const audio = audioOf(container);

    MusicPlayer.play(container);
    audio.dispatchEvent(new Event('play')); // browser confirms playback
    expect(state(container).isPlaying).toBe(true);

    MusicPlayer.next(container);
    expect(state(container).currentIndex).toBe(1);

    MusicPlayer.pause(container);
    audio.dispatchEvent(new Event('pause')); // browser confirms pause
    expect(state(container).isPlaying).toBe(false);
  });

  it('play() lazily sets the source and invokes audio.play', () => {
    const container = init();
    const audio = audioOf(container);
    expect(audio.src).toBe('');
    const spy = vi.spyOn(audio, 'play');

    MusicPlayer.play(container);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(audio.src).toContain('alpha.mp3');
  });

  it('toggle() plays when paused and pauses when playing', () => {
    const container = init();
    const audio = audioOf(container);
    const playSpy = vi.spyOn(audio, 'play');
    const pauseSpy = vi.spyOn(audio, 'pause');

    MusicPlayer.toggle(container); // paused -> play
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy).not.toHaveBeenCalled();

    audio.dispatchEvent(new Event('play')); // now "playing"
    MusicPlayer.toggle(container); // playing -> pause
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });
});

describe('MusicPlayer — next / previous cycling', () => {
  it('next() advances and wraps to the first track', () => {
    const container = init();
    MusicPlayer.next(container);
    expect(state(container).currentIndex).toBe(1);
    MusicPlayer.next(container);
    expect(state(container).currentIndex).toBe(2);
    MusicPlayer.next(container);
    expect(state(container).currentIndex).toBe(0);
  });

  it('previous() steps back and wraps to the last track', () => {
    const container = init();
    MusicPlayer.previous(container);
    expect(state(container).currentIndex).toBe(2);
    MusicPlayer.previous(container);
    expect(state(container).currentIndex).toBe(1);
  });

  it('next() / previous() are no-ops with an empty playlist', () => {
    const container = init({ tracks: [] });
    MusicPlayer.next(container);
    MusicPlayer.previous(container);
    expect(state(container).currentIndex).toBe(0);
    expect(state(container).currentTrack).toBeNull();
  });
});

describe('MusicPlayer — repeat', () => {
  it('cycles off -> one -> all -> off (spec scenario)', () => {
    const container = init();
    expect(state(container).repeat).toBe('off');
    MusicPlayer.repeat(container);
    expect(state(container).repeat).toBe('one');
    MusicPlayer.repeat(container);
    expect(state(container).repeat).toBe('all');
    MusicPlayer.repeat(container);
    expect(state(container).repeat).toBe('off');
  });

  it('setRepeat() sets an explicit mode and normalizes unknown values to off', () => {
    const container = init();
    MusicPlayer.setRepeat(container, 'all');
    expect(state(container).repeat).toBe('all');
    MusicPlayer.setRepeat(container, 'nonsense' as MusicPlayerRepeatMode);
    expect(state(container).repeat).toBe('off');
  });
});

describe('MusicPlayer — shuffle', () => {
  it('reshuffles without mutating the source, preserving the current track, and round-trips', () => {
    const input = TRACKS.map((t) => ({ ...t }));
    const snapshot = input.map((t) => t.url);
    const container = document.createElement('div');
    document.body.appendChild(container);
    containers.push(container);
    MusicPlayer.initPlayer(container, { tracks: input });

    const before = state(container).currentTrack;

    MusicPlayer.shuffle(container); // shuffle on
    const shuffled = state(container);
    expect(shuffled.shuffle).toBe(true);
    // caller list untouched, and the working list is the same multiset
    expect(input.map((t) => t.url)).toEqual(snapshot);
    expect([...shuffled.tracks.map((t) => t.url)].sort()).toEqual([...snapshot].sort());
    // current track is kept, moved to the head of the shuffled order
    expect(shuffled.currentIndex).toBe(0);
    expect(shuffled.currentTrack).toEqual(before);

    MusicPlayer.shuffle(container); // shuffle off -> original order restored
    const restored = state(container);
    expect(restored.shuffle).toBe(false);
    expect(restored.tracks.map((t) => t.url)).toEqual(snapshot);
  });
});

describe('MusicPlayer — setVolume / setTrack', () => {
  it('setVolume clamps to [0, 1] and mirrors onto the audio element', () => {
    const container = init();
    const audio = audioOf(container);

    MusicPlayer.setVolume(container, 2);
    expect(state(container).volume).toBe(1);
    expect(audio.volume).toBe(1);

    MusicPlayer.setVolume(container, -1);
    expect(state(container).volume).toBe(0);
    expect(audio.volume).toBe(0);

    MusicPlayer.setVolume(container, 0.4);
    expect(state(container).volume).toBe(0.4);
    expect(audio.volume).toBeCloseTo(0.4, 5);
  });

  it('setTrack moves within bounds and ignores out-of-range indices', () => {
    const container = init();
    MusicPlayer.setTrack(container, 2);
    expect(state(container).currentIndex).toBe(2);

    MusicPlayer.setTrack(container, 99); // out of range -> ignored
    expect(state(container).currentIndex).toBe(2);

    MusicPlayer.setTrack(container, -1); // out of range -> ignored
    expect(state(container).currentIndex).toBe(2);
  });
});

describe('MusicPlayer — minimize / expand', () => {
  it('minimize / expand / toggleMinimize update state and class (minimizable: true)', () => {
    const container = init({ minimizable: true });

    MusicPlayer.minimize(container);
    expect(state(container).isMinimized).toBe(true);
    expect(container.classList.contains('vd-music-player-minimized')).toBe(true);

    MusicPlayer.expand(container);
    expect(state(container).isMinimized).toBe(false);
    expect(container.classList.contains('vd-music-player-minimized')).toBe(false);

    MusicPlayer.toggleMinimize(container);
    expect(state(container).isMinimized).toBe(true);
    MusicPlayer.toggleMinimize(container);
    expect(state(container).isMinimized).toBe(false);
  });

  it('minimize is a no-op when the player is not minimizable', () => {
    const container = init(); // minimizable defaults to false
    MusicPlayer.minimize(container);
    expect(state(container).isMinimized).toBe(false);
    expect(container.classList.contains('vd-music-player-minimized')).toBe(false);
  });
});

describe('MusicPlayer — destroy / destroyAll', () => {
  it('destroy removes the instance and its init marker', () => {
    const container = init();
    expect(MusicPlayer.instances.has(container)).toBe(true);
    expect(container.getAttribute('data-music-player-initialized')).toBe('true');

    MusicPlayer.destroy(container);

    expect(MusicPlayer.instances.has(container)).toBe(false);
    expect(container.hasAttribute('data-music-player-initialized')).toBe(false);
    expect(MusicPlayer.getState(container)).toBeNull();
  });

  it('destroyAll clears every registered instance', () => {
    init();
    init();
    expect(MusicPlayer.instances.size).toBe(2);
    MusicPlayer.destroyAll();
    expect(MusicPlayer.instances.size).toBe(0);
  });
});

describe('music-player version constant', () => {
  it('VD_MUSIC_PLAYER_VERSION === "1.0.1"', () => {
    expect(VD_MUSIC_PLAYER_VERSION).toBe('1.0.1');
  });

  it('MusicPlayer.version mirrors VD_MUSIC_PLAYER_VERSION', () => {
    expect(MusicPlayer.version).toBe(VD_MUSIC_PLAYER_VERSION);
  });

  it('matches the component-versions.json manifest', () => {
    expect(componentVersions['music-player']).toBe(VD_MUSIC_PLAYER_VERSION);
  });
});
