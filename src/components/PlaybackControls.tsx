import { SUPERTONIC_LANGUAGES, type Language } from '../features/language'
import type { Preferences } from '../lib/storage'

export type Playback = 'idle' | 'generating' | 'playing' | 'paused'

type Props = {
  playback: Playback
  voiceState: 'unprepared' | 'preparing' | 'ready'
  index: number
  chunkCount: number
  preferences: Preferences
  onPlay: () => void
  onMove: (direction: -1 | 1) => void
  onVoice: (voice: string) => void
  onLanguage: (language: Language | 'auto') => void
  onSpeed: (speed: number) => void
  onStop: () => void
}

const button =
  'inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full bg-emerald-950 px-3 py-2 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-12 sm:px-5 sm:py-3'
const quietButton = `${button} border border-slate-400 bg-transparent text-emerald-950 dark:border-slate-600 dark:text-slate-100`
const select =
  'min-h-10 rounded-md border border-slate-400 bg-white px-2 text-emerald-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

export function PlaybackControls({
  playback,
  voiceState,
  index,
  chunkCount,
  preferences,
  onPlay,
  onMove,
  onVoice,
  onLanguage,
  onSpeed,
  onStop,
}: Props) {
  const playLabel =
    voiceState === 'preparing'
      ? 'Preparing voice…'
      : voiceState === 'unprepared'
        ? 'Retry voice'
        : playback === 'playing'
          ? 'Pause'
          : playback === 'paused'
            ? 'Resume'
            : 'Play'

  return (
    <div
      className="sticky bottom-3 z-30 ml-auto flex w-fit max-w-full flex-wrap items-end justify-end gap-2 rounded-2xl border border-stone-200 bg-white/95 p-2 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:gap-3 sm:p-3"
      aria-label="Playback controls"
    >
      <button
        className={button}
        aria-label="Previous paragraph"
        disabled={!index}
        onClick={() => onMove(-1)}
      >
        ←
      </button>
      <button
        className={`${button} min-w-28 bg-orange-600 sm:min-w-32`}
        disabled={playback === 'generating' || voiceState === 'preparing'}
        aria-label={playLabel}
        onClick={onPlay}
      >
        {playback === 'generating' ? 'Preparing audio…' : playLabel}
      </button>
      <button
        className={button}
        aria-label="Next paragraph"
        disabled={index >= chunkCount - 1}
        onClick={() => onMove(1)}
      >
        →
      </button>
      <label className="text-xs font-bold">
        Voice
        <select
          className={`${select} block`}
          value={preferences.voice}
          onChange={(event) => onVoice(event.target.value)}
        >
          {['M1', 'M2', 'F1', 'F2'].map((voice) => (
            <option key={voice}>{voice}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-bold">
        Language
        <select
          className={`${select} block max-w-32`}
          aria-label="Language override"
          value={preferences.language}
          onChange={(event) =>
            onLanguage(event.target.value as Language | 'auto')
          }
        >
          <option value="auto">Auto</option>
          {[...SUPERTONIC_LANGUAGES, 'zh'].map((language) => (
            <option key={language} value={language}>
              {language.toUpperCase()}
              {language === 'zh' ? ' (OCR only)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-bold">
        Speed
        <select
          className={`${select} block`}
          aria-label="Playback speed"
          value={preferences.speed}
          onChange={(event) => onSpeed(Number(event.target.value))}
        >
          {[0.75, 1, 1.25, 1.5, 2].map((speed) => (
            <option key={speed} value={speed}>
              {speed}×
            </option>
          ))}
        </select>
      </label>
      <button className={quietButton} onClick={onStop}>
        Stop
      </button>
    </div>
  )
}
