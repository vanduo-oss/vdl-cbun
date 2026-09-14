/**
 * Vue 3 bindings for @vanduo-oss/vdl-cbun/music-player — primary export.
 *
 *   import { VdMusicPlayer } from '@vanduo-oss/vdl-cbun/music-player';
 *   <VdMusicPlayer :tracks="tracks" :options="{ showPlaylist: true }" @trackchange="onTrack" />
 *
 * The core (./core.js) stays framework-agnostic. SSR-safe: the player is
 * created on mount (client) into a plain container the server can pre-render.
 */
import { defineComponent, h, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { MusicPlayer } from './core.js';

const PLAYER_EVENTS = [
  'play',
  'pause',
  'trackchange',
  'volumechange',
  'repeatchange',
  'ended',
  'detach',
  'attach',
  'minimize',
  'expand',
];

export const VdMusicPlayer = defineComponent({
  name: 'VdMusicPlayer',
  props: {
    /** Playlist — `[{ name, url }]`. */
    tracks: { type: Array, default: () => [] },
    /** Player options (volume, shuffle, repeat, glass, detachable, …). */
    options: { type: Object, default: () => ({}) },
  },
  emits: [...PLAYER_EVENTS, 'ready'],
  setup(props, { emit, expose }) {
    const el = ref(null);
    const bound = [];

    const create = () => {
      MusicPlayer.initPlayer(el.value, { tracks: props.tracks, ...props.options });
      PLAYER_EVENTS.forEach((name) => {
        const type = `musicplayer:${name}`;
        const handler = (e) => emit(name, e.detail);
        el.value.addEventListener(type, handler);
        bound.push([type, handler]);
      });
      emit('ready', el.value);
    };

    const teardown = () => {
      bound.forEach(([type, handler]) => {
        if (el.value) el.value.removeEventListener(type, handler);
      });
      bound.length = 0;
      if (el.value) MusicPlayer.destroy(el.value);
    };

    onMounted(() => {
      if (typeof window === 'undefined' || !el.value) return;
      create();
    });

    // Tracks/options changes recreate the player.
    watch(
      () => [props.tracks, props.options],
      () => {
        teardown();
        create();
      },
      { deep: true },
    );

    onBeforeUnmount(teardown);

    expose({ player: MusicPlayer, container: () => el.value });

    return () => h('div', { ref: el, class: 'vd-music-player' });
  },
});
