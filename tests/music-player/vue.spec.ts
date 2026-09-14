// @vitest-environment jsdom

// Vue wrapper mount spec for <VdMusicPlayer> (jsdom, shared media stubs). The
// wrapper is a thin bridge: on mount it creates the framework-agnostic core in
// its own container from props, re-emits the core's `musicplayer:*` DOM
// CustomEvents as Vue events (payload = event.detail), recreates the core when
// tracks/options change, and destroys the instance on unmount. Real audio
// playback is out of scope here — the core is exercised via its public API and
// the DOM events it dispatches.

import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import { VdMusicPlayer } from '../../src/music-player/index.js';
import { MusicPlayer } from '../../src/music-player/core.js';

const TRACKS = [
  { name: 'Alpha', url: 'https://cdn.test/alpha.mp3' },
  { name: 'Bravo', url: 'https://cdn.test/bravo.mp3' },
  { name: 'Charlie', url: 'https://cdn.test/charlie.mp3' },
];

const wrappers: VueWrapper[] = [];
function mountPlayer(props: Record<string, unknown> = {}): VueWrapper {
  const wrapper = mount(VdMusicPlayer, { props });
  wrappers.push(wrapper);
  return wrapper;
}

/** The container element the wrapper rendered and initialized the core into. */
function elOf(wrapper: VueWrapper): HTMLElement {
  return wrapper.find('div.vd-music-player').element as HTMLElement;
}

afterEach(() => {
  while (wrappers.length) wrappers.pop()!.unmount();
  MusicPlayer.destroyAll();
});

describe('VdMusicPlayer — mount', () => {
  it('creates the core player in its own container from props', () => {
    const wrapper = mountPlayer({ tracks: TRACKS });
    expect(wrapper.find('div.vd-music-player').exists()).toBe(true);

    const el = elOf(wrapper);
    expect(MusicPlayer.instances.has(el)).toBe(true);
    expect(MusicPlayer.getState(el)?.tracks.map((t) => t.url)).toEqual(TRACKS.map((t) => t.url));
  });

  it('emits `ready` with the container element', () => {
    const wrapper = mountPlayer({ tracks: TRACKS });
    const ready = wrapper.emitted('ready');
    expect(ready).toHaveLength(1);
    expect(ready![0][0]).toBe(elOf(wrapper));
  });

  it('passes options through to the core', () => {
    const wrapper = mountPlayer({
      tracks: TRACKS,
      options: { volume: 0.9, repeat: 'all' as const },
    });
    const s = MusicPlayer.getState(elOf(wrapper));
    expect(s?.volume).toBe(0.9);
    expect(s?.repeat).toBe('all');
  });
});

describe('VdMusicPlayer — event forwarding', () => {
  it('re-emits core DOM CustomEvents as Vue events with their detail payload', async () => {
    const wrapper = mountPlayer({ tracks: TRACKS });
    const el = elOf(wrapper);

    MusicPlayer.setTrack(el, 1);
    await wrapper.vm.$nextTick();
    const trackchange = wrapper.emitted('trackchange');
    expect(trackchange).toHaveLength(1);
    expect(trackchange![0][0]).toEqual({
      index: 1,
      name: 'Bravo',
      url: 'https://cdn.test/bravo.mp3',
    });

    MusicPlayer.setVolume(el, 0.3);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('volumechange')![0][0]).toEqual({ volume: 0.3 });
  });
});

describe('VdMusicPlayer — prop changes', () => {
  it('recreates the core when the tracks prop changes', async () => {
    const wrapper = mountPlayer({ tracks: TRACKS });
    const el = elOf(wrapper);
    expect(MusicPlayer.getState(el)?.tracks).toHaveLength(3);

    await wrapper.setProps({ tracks: [TRACKS[0]] });

    expect(wrapper.emitted('ready')).toHaveLength(2); // torn down + recreated
    expect(MusicPlayer.getState(el)?.tracks).toHaveLength(1);
    expect(MusicPlayer.instances.has(el)).toBe(true);
  });

  it('does not double-emit forwarded events after a recreate (no listener leak)', async () => {
    const wrapper = mountPlayer({ tracks: TRACKS });
    const el = elOf(wrapper);
    await wrapper.setProps({ tracks: [TRACKS[0]] });
    // After teardown+recreate exactly one live wrapper listener should remain;
    // a leaked old listener would forward this event twice.
    const before = wrapper.emitted('play')?.length ?? 0;
    el.dispatchEvent(new CustomEvent('musicplayer:play', { detail: { index: 0 }, bubbles: true }));
    expect((wrapper.emitted('play')?.length ?? 0) - before).toBe(1);
  });
});

describe('VdMusicPlayer — unmount', () => {
  it('destroys the core instance on unmount', () => {
    const wrapper = mount(VdMusicPlayer, { props: { tracks: TRACKS } });
    const el = wrapper.find('div.vd-music-player').element as HTMLElement;
    expect(MusicPlayer.instances.has(el)).toBe(true);

    wrapper.unmount();

    expect(MusicPlayer.instances.has(el)).toBe(false);
  });
});
