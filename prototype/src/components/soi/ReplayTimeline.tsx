'use client';

/**
 * SOI Replay Timeline
 *
 * Premium temporal playback bar with scrubber,
 * event markers, and replay state controls.
 */

import { useRef, useCallback } from 'react';

interface Props {
  active: boolean;
  playing: boolean;
  currentTimestamp: Date | null;
  startTimestamp: Date;
  endTimestamp: Date;
  eventTimestamps: number[];
  onScrub: (timestamp: Date) => void;
  onTogglePlay: () => void;
  onStep: (minutes: number) => void;
  onExit: () => void;
}

export function ReplayTimeline({
  active, playing, currentTimestamp, startTimestamp, endTimestamp,
  eventTimestamps, onScrub, onTogglePlay, onStep, onExit,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);

  const totalMs = endTimestamp.getTime() - startTimestamp.getTime();
  const currentMs = currentTimestamp ? currentTimestamp.getTime() - startTimestamp.getTime() : 0;
  const progress = totalMs > 0 ? Math.max(0, Math.min(1, currentMs / totalMs)) : 0;

  const handleBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const ts = new Date(startTimestamp.getTime() + pct * totalMs);
    onScrub(ts);
  }, [startTimestamp, totalMs, onScrub]);

  const handleDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    handleBarClick(e);
  }, [handleBarClick]);

  if (!active) return null;

  const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="mc-replay-bar">
      {/* Mode indicator */}
      <div className="mc-replay-mode">
        <span className="mc-replay-badge">Replay</span>
        <span className="mc-replay-time">{currentTimestamp ? fmt(currentTimestamp) : '--:--'}</span>
      </div>

      {/* Controls */}
      <button className="mc-replay-btn" onClick={() => onStep(-15)}>−15m</button>
      <button className="mc-replay-btn" onClick={() => onStep(-5)}>−5m</button>
      <button className={`mc-replay-btn${playing ? ' active' : ''}`} onClick={onTogglePlay}>
        {playing ? '⏸' : '▶'}
      </button>
      <button className="mc-replay-btn" onClick={() => onStep(5)}>+5m</button>
      <button className="mc-replay-btn" onClick={() => onStep(15)}>+15m</button>

      {/* Timeline scrubber */}
      <div className="mc-replay-track" ref={barRef} onClick={handleBarClick} onMouseMove={handleDrag}>
        {/* Event markers */}
        {eventTimestamps.map((ts, i) => {
          const pct = totalMs > 0 ? ((ts - startTimestamp.getTime()) / totalMs) * 100 : 0;
          if (pct < 0 || pct > 100) return null;
          return (
            <div key={i} className="mc-replay-marker" style={{ left: `${pct}%` }} />
          );
        })}

        {/* Progress fill */}
        <div className="mc-replay-fill" style={{ width: `${progress * 100}%` }} />

        {/* Scrubber head */}
        <div className="mc-replay-head" style={{ left: `${progress * 100}%` }} />
      </div>

      {/* Time range */}
      <span className="mc-replay-range">{fmt(startTimestamp)}</span>
      <span className="mc-replay-range">{fmt(endTimestamp)}</span>

      {/* Exit */}
      <button className="mc-replay-btn exit" onClick={onExit}>Exit</button>
    </div>
  );
}
