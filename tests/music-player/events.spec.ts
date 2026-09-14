// @vitest-environment jsdom

// The retained v1 DOM CustomEvent surface: every `musicplayer:*` event is
// dispatched on the container, bubbles, and carries its documented detail. Each
// event is asserted from a listener on the PARENT element (proving `bubbles:
// true`) — except detach/attach, which relocate the container in the DOM and so
// are observed on the container itself. Playback events (`play`/`pause`/
// `ended`) are driven by dispatching the native audio event the core listens
// for; the shared media stub never emits them on its own.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MusicPlayer } from '../../src/music-player/core.js';
import type { MusicPlayerOptions } from '../../src/music-player/core.js';

const TRACKS = [
  { name: 'Alpha', url: 'https://cdn.test/alpha.mp3' },
  { name: 'Bravo', url: 'https://cdn.test/bravo.mp3' },
  { name: 'Charlie', url: 'https://cdn.test/charlie.mp3' },
];

/** Build a player nested inside a parent, both attached to the body. */
function build(opts: MusicPlayerOptions = {}): { parent: HTMLElement; container: HTMLElement } {
  const parent = document.createElement('div');
  const container = document.createElement('div');
  parent.appendChild(container);
  document.body.appendChild(parent);
  MusicPlayer.initPlayer(container, { tracks: TRACKS.map((t) => ({ ...t })), ...opts });
  return { parent, container };
}

function audioOf(container: HTMLElement): HTMLMediaElement {
  const inst = MusicPlayer.instances.get(container);
  if (!inst) throw new Error('expected a live music-player instance');
  return (inst as { audio: HTMLMediaElement }).audio;
}

afterEach(() => {
  MusicPlayer.destroyAll();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('musicplayer:trackchange', () => {
  it('carries { index, name, url } and bubbles to the parent (spec scenario)', () => {
    const { parent, container } = build();
    const events: CustomEvent[] = [];
    parent.addEventListener('musicplayer:trackchange', (e) => events.push(e as CustomEvent));

    MusicPlayer.setTrack(container, 2);

    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({
      index: 2,
      name: 'Charlie',
      url: 'https://cdn.test/charlie.mp3',
    });
  });
});

describe('musicplayer:play / musicplayer:pause', () => {
  it('fire in response to the audio events and bubble to the parent', () => {
    const { parent, container } = build();
    const audio = audioOf(container);
    const seen: string[] = [];
    parent.addEventListener('musicplayer:play', () => seen.push('play'));
    parent.addEventListener('musicplayer:pause', () => seen.push('pause'));

    audio.dispatchEvent(new Event('play'));
    audio.dispatchEvent(new Event('pause'));

    expect(seen).toEqual(['play', 'pause']);
  });
});

describe('musicplayer:volumechange', () => {
  it('carries { volume } and bubbles', () => {
    const { parent, container } = build();
    const events: CustomEvent[] = [];
    parent.addEventListener('musicplayer:volumechange', (e) => events.push(e as CustomEvent));

    MusicPlayer.setVolume(container, 0.42);

    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({ volume: 0.42 });
  });
});

describe('musicplayer:repeatchange', () => {
  it('carries { repeat } and bubbles', () => {
    const { parent, container } = build();
    const events: CustomEvent[] = [];
    parent.addEventListener('musicplayer:repeatchange', (e) => events.push(e as CustomEvent));

    MusicPlayer.repeat(container); // off -> one
    MusicPlayer.repeat(container); // one -> all

    expect(events.map((e) => e.detail)).toEqual([{ repeat: 'one' }, { repeat: 'all' }]);
  });
});

describe('musicplayer:ended', () => {
  it('fires when a single track ends with repeat off and no auto-advance', () => {
    const { parent, container } = build({ tracks: [TRACKS[0]], autoAdvance: false });
    const events: CustomEvent[] = [];
    parent.addEventListener('musicplayer:ended', (e) => events.push(e as CustomEvent));

    audioOf(container).dispatchEvent(new Event('ended'));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('musicplayer:ended');
  });

  // Regression: with the defaults (repeat 'off', autoAdvance true) a multi-track
  // playlist used `(currentIndex + 1) % tracks.length`, which WRAPPED at the
  // final track — looping forever and making this `ended` branch unreachable.
  it('stops and fires ended at the end of a repeat-off playlist (no wrap to track 0)', () => {
    const { parent, container } = build({ tracks: [TRACKS[0], TRACKS[1]] }); // repeat off, autoAdvance true
    MusicPlayer.setTrack(container, 1); // move to the LAST track
    const events: CustomEvent[] = [];
    parent.addEventListener('musicplayer:ended', (e) => events.push(e as CustomEvent));

    audioOf(container).dispatchEvent(new Event('ended'));

    expect(events).toHaveLength(1); // fired (was 0 with the wrap bug)
    expect(events[0].type).toBe('musicplayer:ended');
    const state = MusicPlayer.getState(container);
    expect(state?.currentIndex).toBe(1); // did NOT wrap back to track 0
    expect(state?.isPlaying).toBe(false); // playback stopped
  });

  it('still auto-advances on a non-final track (repeat off)', () => {
    const { parent, container } = build({ tracks: [TRACKS[0], TRACKS[1]] });
    const events: CustomEvent[] = [];
    parent.addEventListener('musicplayer:ended', (e) => events.push(e as CustomEvent));

    audioOf(container).dispatchEvent(new Event('ended')); // ends track 0 → advance

    expect(events).toHaveLength(0); // not the end of the playlist yet
    expect(MusicPlayer.getState(container)?.currentIndex).toBe(1);
  });
});

describe('musicplayer:minimize / musicplayer:expand', () => {
  it('fire on minimize/expand and bubble (minimizable: true)', () => {
    const { parent, container } = build({ minimizable: true });
    const seen: string[] = [];
    parent.addEventListener('musicplayer:minimize', () => seen.push('minimize'));
    parent.addEventListener('musicplayer:expand', () => seen.push('expand'));

    MusicPlayer.minimize(container);
    MusicPlayer.expand(container);

    expect(seen).toEqual(['minimize', 'expand']);
  });
});

describe('musicplayer:detach / musicplayer:attach', () => {
  it('fire on detach/attach and toggle isDetached (detachable: true)', () => {
    const { container } = build({ detachable: true });
    const seen: string[] = [];
    // detach relocates the container to <body>, so observe on the container.
    container.addEventListener('musicplayer:detach', () => seen.push('detach'));
    container.addEventListener('musicplayer:attach', () => seen.push('attach'));

    MusicPlayer.detach(container);
    expect(MusicPlayer.getState(container)?.isDetached).toBe(true);

    MusicPlayer.attach(container);
    expect(MusicPlayer.getState(container)?.isDetached).toBe(false);

    expect(seen).toEqual(['detach', 'attach']);
  });
});
