import { useRef, useState, useEffect } from 'react';
import { useNexusStore } from '@/store/nexusStore';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Maximize,
  Scissors,
  Plus,
  Film,
  Music,
  Type,
  Wand2,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  Magnet,
  Eye,
  Lock,
  Undo2,
  Redo2,
  Split,
  Copy,
  Download,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function VideoStudio() {
  const { videoTracks, currentTime, totalDuration, isPlaying, zoom, togglePlayback, setCurrentTime, setZoom } = useNexusStore();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [scrubbing] = useState(false);
  const [rulerHover, setRulerHover] = useState<number | null>(null);

  const pxPerSecond = 20 * zoom;
  const totalWidth = totalDuration * pxPerSecond;

  useEffect(() => {
    if (isPlaying && !scrubbing) {
      const interval = setInterval(() => {
        setCurrentTime(Math.min(currentTime + 0.1, totalDuration));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isPlaying, currentTime, totalDuration, scrubbing, setCurrentTime]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const rulerMarks = [];
  for (let i = 0; i <= totalDuration; i += 1) {
    const isMajor = i % 5 === 0;
    rulerMarks.push(
      <div
        key={i}
        className="absolute bottom-0 border-l border-[#3a3a4e]"
        style={{ left: i * pxPerSecond, height: isMajor ? 12 : 6 }}
      >
        {isMajor && (
          <span className="absolute -top-3 -left-3 text-[9px] text-[#4a4a6a] w-6 text-center">
            {formatTime(i)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0f0f1a]">
      {/* Toolbar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#2a2a3e] bg-[#16162a] shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => setCurrentTime(0)} className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <SkipBack size={14} />
          </button>
          <button
            onClick={togglePlayback}
            className="p-1.5 rounded bg-[#6c5ce7] text-white hover:bg-[#5b4dd1] transition-colors"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={() => setCurrentTime(Math.min(currentTime + 1, totalDuration))} className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <SkipForward size={14} />
          </button>
          <div className="w-px h-4 bg-[#2a2a3e] mx-2" />
          <span className="text-xs font-mono text-[#6c5ce7] w-16">{formatTime(currentTime)}</span>
          <span className="text-[10px] text-[#4a4a6a]">/</span>
          <span className="text-xs font-mono text-[#6b6b8d] w-16">{formatTime(totalDuration)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]"><Undo2 size={14} /></button>
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]"><Redo2 size={14} /></button>
          <div className="w-px h-4 bg-[#2a2a3e] mx-2" />
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]"><Scissors size={14} /></button>
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]"><Split size={14} /></button>
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]"><Copy size={14} /></button>
          <div className="w-px h-4 bg-[#2a2a3e] mx-2" />
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]"><Volume2 size={14} /></button>
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]"><Maximize size={14} /></button>
        </div>
      </div>

      {/* Preview + Timeline */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Preview Area */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex items-center justify-center bg-black relative">
            <div className="w-full max-w-2xl aspect-video bg-[#1a1a2e] rounded-lg border border-[#2a2a3e] relative overflow-hidden flex items-center justify-center">
              <Film size={48} className="text-[#2a2a3e]" />
              <div className="absolute bottom-2 right-2 bg-black/60 text-[#e0e0e0] text-[10px] px-2 py-0.5 rounded font-mono">
                {formatTime(currentTime)}
              </div>
              {/* Playback overlay */}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                    <Play size={20} className="text-white ml-0.5" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Properties Panel */}
          <div className="w-52 border-l border-[#2a2a3e] bg-[#16162a] overflow-y-auto">
            <div className="h-8 flex items-center px-3 border-b border-[#2a2a3e]">
              <span className="text-xs font-medium text-[#e0e0e0]">Properties</span>
            </div>
            <div className="p-3 space-y-3">
              {selectedClip ? (
                <>
                  <div>
                    <label className="text-[10px] text-[#6b6b8d] block mb-1">Position X</label>
                    <input type="number" className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1 text-xs text-[#e0e0e0]" defaultValue={0} />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b6b8d] block mb-1">Position Y</label>
                    <input type="number" className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1 text-xs text-[#e0e0e0]" defaultValue={0} />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b6b8d] block mb-1">Scale</label>
                    <input type="range" min={0} max={200} defaultValue={100} className="w-full accent-[#6c5ce7]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b6b8d] block mb-1">Opacity</label>
                    <input type="range" min={0} max={100} defaultValue={100} className="w-full accent-[#6c5ce7]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b6b8d] block mb-1">Rotation</label>
                    <input type="range" min={-180} max={180} defaultValue={0} className="w-full accent-[#6c5ce7]" />
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <Settings2 size={20} className="text-[#3a3a4e] mx-auto mb-2" />
                  <p className="text-[10px] text-[#4a4a6a]">Select a clip to edit properties</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="h-56 border-t border-[#2a2a3e] bg-[#16162a] flex flex-col">
          {/* Timeline Toolbar */}
          <div className="h-7 flex items-center px-2 border-b border-[#2a2a3e] gap-1">
            <button className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d]"><Plus size={10} /></button>
            <button className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d]"><Film size={10} /></button>
            <button className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d]"><Music size={10} /></button>
            <button className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d]"><Type size={10} /></button>
            <button className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d]"><Wand2 size={10} /></button>
            <div className="w-px h-3 bg-[#2a2a3e] mx-1" />
            <button onClick={() => setZoom(Math.max(0.2, zoom - 0.2))} className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d]"><ChevronLeft size={10} /></button>
            <span className="text-[9px] text-[#6b6b8d] w-8 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(Math.min(5, zoom + 0.2))} className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d]"><ChevronRight size={10} /></button>
            <div className="w-px h-3 bg-[#2a2a3e] mx-1" />
            <button className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d]"><Grid3X3 size={10} /></button>
            <button className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d]"><Magnet size={10} /></button>
            <button className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] ml-auto"><Download size={10} /></button>
          </div>

          {/* Timeline Tracks */}
          <div className="flex-1 overflow-auto" ref={timelineRef}>
            {/* Ruler */}
            <div
              className="h-6 border-b border-[#2a2a3e] relative select-none"
              style={{ width: totalWidth + 200 }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                setCurrentTime(Math.max(0, x / pxPerSecond));
              }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setRulerHover(e.clientX - rect.left);
              }}
              onMouseLeave={() => setRulerHover(null)}
            >
              {rulerMarks}
              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-px bg-[#6c5ce7] z-10 pointer-events-none"
                style={{ left: currentTime * pxPerSecond }}
              >
                <div className="absolute -top-0 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#6c5ce7]" />
              </div>
              {/* Hover indicator */}
              {rulerHover !== null && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-[#6c5ce7]/30 pointer-events-none"
                  style={{ left: rulerHover }}
                />
              )}
            </div>

            {/* Tracks */}
            <div style={{ width: totalWidth + 200 }}>
              {videoTracks.map((track) => (
                <div key={track.id} className="flex border-b border-[#2a2a3e]">
                  {/* Track Header */}
                  <div className="w-28 shrink-0 h-12 bg-[#16162a] border-r border-[#2a2a3e] flex items-center px-2 gap-1.5">
                    {track.type === 'video' ? <Film size={10} className="text-[#e17055]" /> : track.type === 'audio' ? <Music size={10} className="text-[#00b894]" /> : <Type size={10} className="text-[#6c5ce7]" />}
                    <span className="text-[10px] text-[#a0a0c0] truncate flex-1">{track.name}</span>
                    <button className="text-[#6b6b8d] hover:text-[#e0e0e0]"><Eye size={10} /></button>
                    <button className="text-[#6b6b8d] hover:text-[#e0e0e0]"><Lock size={10} /></button>
                  </div>
                  {/* Track Content */}
                  <div className="flex-1 h-12 relative bg-[#0f0f1a]">
                    {track.clips.map((clip) => (
                      <div
                        key={clip.id}
                        onClick={() => setSelectedClip(clip.id)}
                        className={cn(
                          'absolute top-1 h-10 rounded border cursor-pointer transition-all overflow-hidden group',
                          selectedClip === clip.id
                            ? 'border-[#6c5ce7] ring-1 ring-[#6c5ce7]/30'
                            : 'border-transparent hover:border-[#3a3a4e]',
                          track.type === 'video' ? 'bg-[#e17055]/20' : track.type === 'audio' ? 'bg-[#00b894]/20' : 'bg-[#6c5ce7]/20'
                        )}
                        style={{
                          left: clip.startTime * pxPerSecond,
                          width: Math.max(clip.duration * pxPerSecond, 20),
                        }}
                      >
                        <div className="flex items-center gap-1 px-1.5 h-full">
                          {track.type === 'video' ? <Film size={10} className="text-[#e17055] shrink-0" /> : track.type === 'audio' ? <Music size={10} className="text-[#00b894] shrink-0" /> : <Type size={10} className="text-[#6c5ce7] shrink-0" />}
                          <span className="text-[10px] text-[#e0e0e0] truncate">{clip.name}</span>
                        </div>
                        {clip.effects.length > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#fdcb6e]" title={`${clip.effects.length} effect(s)`} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
