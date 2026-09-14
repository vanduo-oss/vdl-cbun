export const VD_MUSIC_PLAYER_VERSION: string;

export interface MusicPlayerTrack {
  name: string;
  url: string;
}

export type MusicPlayerRepeatMode = 'off' | 'one' | 'all';

export interface MusicPlayerOptions {
  tracks?: MusicPlayerTrack[];
  volume?: number;
  shuffle?: boolean;
  repeat?: MusicPlayerRepeatMode;
  showProgress?: boolean;
  showPlaylist?: boolean;
  autoAdvance?: boolean;
  glass?: boolean;
  detachable?: boolean;
  floatingPosition?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | null;
  draggable?: boolean;
  minimizable?: boolean;
  startMinimized?: boolean;
  persistPosition?: boolean;
  persistKey?: string;
}

export interface MusicPlayerState {
  isPlaying: boolean;
  currentIndex: number;
  currentTrack: MusicPlayerTrack | null;
  volume: number;
  shuffle: boolean;
  repeat: MusicPlayerRepeatMode;
  tracks: MusicPlayerTrack[];
  isDetached: boolean;
  isMinimized: boolean;
}

export type MusicPlayerCorner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export type MusicPlayerPosition = MusicPlayerCorner | { x: number; y: number };

export interface MusicPlayerApi {
  version: string;
  instances: Map<HTMLElement, unknown>;
  defaults: Required<
    Pick<
      MusicPlayerOptions,
      | 'tracks'
      | 'volume'
      | 'shuffle'
      | 'repeat'
      | 'showProgress'
      | 'showPlaylist'
      | 'autoAdvance'
      | 'glass'
      | 'detachable'
      | 'draggable'
      | 'minimizable'
      | 'startMinimized'
      | 'persistPosition'
      | 'persistKey'
    >
  > & { floatingPosition: string | null };
  initPlayer(container: HTMLElement, options?: MusicPlayerOptions): void;
  play(container: HTMLElement): void;
  pause(container: HTMLElement): void;
  toggle(container: HTMLElement): void;
  next(container: HTMLElement): void;
  previous(container: HTMLElement): void;
  setVolume(container: HTMLElement, value: number): void;
  setTrack(container: HTMLElement, index: number): void;
  shuffle(container: HTMLElement): void;
  repeat(container: HTMLElement): void;
  setRepeat(container: HTMLElement, mode: MusicPlayerRepeatMode): void;
  detach(container: HTMLElement, position?: MusicPlayerCorner): void;
  attach(container: HTMLElement): void;
  minimize(container: HTMLElement): void;
  expand(container: HTMLElement): void;
  toggleMinimize(container: HTMLElement): void;
  setPosition(container: HTMLElement, position: MusicPlayerPosition): void;
  getState(container: HTMLElement): MusicPlayerState | null;
  destroy(container: HTMLElement): void;
  destroyAll(): void;
}

export const MusicPlayer: MusicPlayerApi;
