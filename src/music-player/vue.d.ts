import type { DefineComponent } from 'vue';
import type { MusicPlayerRepeatMode } from './core';

export interface VdMusicPlayerTrack {
  name: string;
  url: string;
}

export interface VdMusicPlayerOptions {
  volume?: number;
  shuffle?: boolean;
  repeat?: 'off' | 'one' | 'all';
  showProgress?: boolean;
  showPlaylist?: boolean;
  autoAdvance?: boolean;
  glass?: boolean;
  detachable?: boolean;
  floatingPosition?: string | null;
  draggable?: boolean;
  minimizable?: boolean;
  startMinimized?: boolean;
  persistPosition?: boolean;
  persistKey?: string;
}

export interface VdMusicPlayerProps {
  /** Playlist ([{ name, url }]). */
  tracks?: VdMusicPlayerTrack[];
  /** Player options. */
  options?: VdMusicPlayerOptions;
}

/** `trackchange` payload — the newly active track and its playlist index. */
export interface VdMusicPlayerTrackChangePayload {
  index: number;
  name: string;
  url: string;
}

/** `volumechange` payload — the new volume (0–1). */
export interface VdMusicPlayerVolumeChangePayload {
  volume: number;
}

/** `repeatchange` payload — the new repeat mode. */
export interface VdMusicPlayerRepeatChangePayload {
  repeat: MusicPlayerRepeatMode;
}

/**
 * The events the wrapper re-emits. Ten mirror the core's `musicplayer:*` DOM
 * CustomEvents (payload = `event.detail`); `ready` fires once after the core is
 * created, with the container element. Payload-less events carry no detail.
 */
export interface VdMusicPlayerEmits {
  (event: 'play'): void;
  (event: 'pause'): void;
  (event: 'trackchange', payload: VdMusicPlayerTrackChangePayload): void;
  (event: 'volumechange', payload: VdMusicPlayerVolumeChangePayload): void;
  (event: 'repeatchange', payload: VdMusicPlayerRepeatChangePayload): void;
  (event: 'ended'): void;
  (event: 'detach'): void;
  (event: 'attach'): void;
  (event: 'minimize'): void;
  (event: 'expand'): void;
  (event: 'ready', container: HTMLElement): void;
}

/* eslint-disable @typescript-eslint/no-empty-object-type -- DefineComponent filler params */
export declare const VdMusicPlayer: DefineComponent<
  VdMusicPlayerProps,
  {},
  {},
  {},
  {},
  {},
  {},
  VdMusicPlayerEmits
>;
/* eslint-enable @typescript-eslint/no-empty-object-type */
