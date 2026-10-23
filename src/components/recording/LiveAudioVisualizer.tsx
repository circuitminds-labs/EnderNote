import React, { useEffect, useRef, useState } from 'react';
import { Pause, Activity } from 'lucide-react';

interface LiveAudioVisualizerProps {
  analyser: AnalyserNode | null;
  isRecording: boolean;
  isPaused: boolean;
  className?: string;
}

export const LiveAudioVisualizer: React.FC<LiveAudioVisualizerProps> = ({
  analyser,
  isRecording,
  isPaused,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [micActiveLevel, setMicActiveLevel] = useState<'silent' | 'active' | 'peak'>('silent');

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let destroyed = false;
    let dataArray: Uint8Array<ArrayBuffer> | null = null;
    let bufferLength = 64;

    if (analyser) {
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
    }

    const updateCanvasDimensions = () => {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = Math.max(200, Math.floor(rect.width));
      const displayHeight = Math.max(60, Math.floor(rect.height));

      if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
      }
    };

    updateCanvasDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasDimensions();
    });
    resizeObserver.observe(container);

    let lastLevelUpdate = 0;

    const render = (time: number) => {
      if (destroyed) return;
      animFrameRef.current = requestAnimationFrame(render);

      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      let avgVolume = 0;
      let isSilent = true;

      if (analyser && dataArray && isRecording && !isPaused) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        avgVolume = sum / bufferLength;
        isSilent = avgVolume < 2.5;

        // Throttled UI status level update
        if (time - lastLevelUpdate > 150) {
          lastLevelUpdate = time;
          if (avgVolume > 65) {
            setMicActiveLevel('peak');
          } else if (avgVolume > 4) {
            setMicActiveLevel('active');
          } else {
            setMicActiveLevel('silent');
          }
        }
      } else if (isPaused) {
        if (time - lastLevelUpdate > 150) {
          lastLevelUpdate = time;
          setMicActiveLevel('silent');
        }
      }

      // Draw subtle background grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.lineWidth = 1 * dpr;
      const centerY = height / 2;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      // Number of bars scaled to canvas width
      const barCount = Math.max(28, Math.min(52, Math.floor((width / dpr) / 8.5)));
      const gap = 3.5 * dpr;
      const totalGap = gap * (barCount - 1);
      const barWidth = Math.max(3 * dpr, (width - totalGap) / barCount);

      for (let i = 0; i < barCount; i++) {
        let barHeight = 4 * dpr;

        if (analyser && dataArray && isRecording && !isPaused && !isSilent) {
          // Weight bin index towards conversational voice fundamental frequencies (100-3500 Hz)
          const normalizedIdx = i / barCount;
          const binIndex = Math.min(
            bufferLength - 1,
            Math.floor(Math.pow(normalizedIdx, 1.28) * (bufferLength * 0.88))
          );
          const rawVal = dataArray[binIndex] || 0;
          const normalized = rawVal / 255;
          
          // Center-biased bell curve shaping for natural harmonic aesthetic
          const centerFactor = 1 - Math.pow(Math.abs(normalizedIdx - 0.5) * 1.6, 2);
          const shapedFactor = Math.max(0.35, Math.min(1.0, centerFactor));
          
          barHeight = Math.max(4 * dpr, normalized * shapedFactor * (height * 0.88));
        } else if (isPaused) {
          barHeight = 4 * dpr;
        } else {
          // Resting idle state: gentle undulating baseline wave indicating mic is live
          const wave = Math.sin(time * 0.0032 + (i / barCount) * Math.PI * 2.5);
          barHeight = Math.max(3.5 * dpr, (wave * 0.5 + 0.5) * 8 * dpr + 3.5 * dpr);
        }

        const x = i * (barWidth + gap);
        const y = centerY - barHeight / 2;

        // Gradient styling
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (!isRecording || isPaused || isSilent) {
          gradient.addColorStop(0, 'rgba(168, 162, 158, 0.35)');
          gradient.addColorStop(0.5, 'rgba(217, 119, 6, 0.55)');
          gradient.addColorStop(1, 'rgba(168, 162, 158, 0.35)');
        } else {
          if (barHeight > height * 0.55) {
            // High energy voice formant
            gradient.addColorStop(0, '#fef08a');
            gradient.addColorStop(0.25, '#fbbf24');
            gradient.addColorStop(0.75, '#f59e0b');
            gradient.addColorStop(1, '#d97706');
          } else {
            // Medium energy
            gradient.addColorStop(0, '#fde68a');
            gradient.addColorStop(0.5, '#f59e0b');
            gradient.addColorStop(1, '#b45309');
          }
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        const cornerRadius = Math.min(barWidth / 2, barHeight / 2);
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, barWidth, barHeight, cornerRadius);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      }
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      destroyed = true;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [analyser, isRecording, isPaused]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl bg-stone-950 dark:bg-stone-950/90 border border-stone-800/90 flex items-center justify-center overflow-hidden shadow-inner ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />

      {/* Real-Time Live Status Pill Badge */}
      <div className="absolute top-2.5 right-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-stone-900/90 border border-stone-800/80 text-[10px] font-mono tracking-tight shadow-xs select-none pointer-events-none">
        {isPaused ? (
          <>
            <Pause className="w-2.5 h-2.5 text-amber-400" />
            <span className="text-amber-400 font-semibold">PAUSED</span>
          </>
        ) : isRecording ? (
          <>
            <span
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                micActiveLevel === 'peak'
                  ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]'
                  : micActiveLevel === 'active'
                  ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]'
                  : 'bg-stone-500'
              }`}
            />
            <span className="text-stone-300 font-medium">
              {micActiveLevel === 'peak'
                ? 'VOICE PEAK'
                : micActiveLevel === 'active'
                ? 'VOICE ACTIVE'
                : 'LISTENING'}
            </span>
          </>
        ) : (
          <>
            <Activity className="w-2.5 h-2.5 text-stone-500" />
            <span className="text-stone-400">STANDBY</span>
          </>
        )}
      </div>

      {/* Audio format indicator in bottom-left */}
      <div className="absolute bottom-2 left-3 text-[9px] font-mono text-stone-500 tracking-wider uppercase select-none pointer-events-none">
        {isRecording && !isPaused ? '16kHz · Mono · Realtime WebAudio' : 'Hardware Mic Input'}
      </div>
    </div>
  );
};
