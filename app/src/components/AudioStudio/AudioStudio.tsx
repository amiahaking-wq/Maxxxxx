import { useState, useRef, useEffect } from 'react';
import { useNexusStore } from '@/store/nexusStore';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Mic,
  Square,
  Scissors,
  Plus,
  Trash2,
  Music,
  Wand2,
  SlidersHorizontal,
  Headphones,
  Waves,
  Zap,
  Download,
  Undo2,
  Redo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function AudioStudio() {
  const { audioTracks, addAudioTrack, updateAudioTrack, removeAudioTrack } = useNexusStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const totalDuration = 120;
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);


  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    ctx.clearRect(0, 0, w, h);

    // Draw grid
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }
    for (let i = 0; i < h; i += 20) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(w, i);
      ctx.stroke();
    }

    // Draw mock waveform
    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const centerY = h / 2;
    for (let x = 0; x < w; x++) {
      const progress = x / w;
      const amplitude = Math.sin(progress * Math.PI * 20) * 20 + Math.sin(progress * Math.PI * 45) * 10 + Math.random() * 8;
      const y = centerY + amplitude * Math.sin(x * 0.02);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw center line
    ctx.strokeStyle = '#2a2a3e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.stroke();

    // Draw playhead
    const playheadX = (currentTime / totalDuration) * w;
    ctx.strokeStyle = '#fdcb6e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();
  }, [currentTime, zoom]);

  useEffect(() => {
    if (isPlaying) {
      const interval = setInterval(() => {
        setCurrentTime((t) => Math.min(t + 0.1, totalDuration));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isPlaying]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const addTrack = () => {
    addAudioTrack({
      id: `at-${Date.now()}`,
      name: `Track ${audioTracks.length + 1}`,
      buffer: null,
      regions: [],
      isMuted: false,
      volume: 80,
      pan: 0,
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f1a]">
      {/* Toolbar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#2a2a3e] bg-[#16162a] shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => setCurrentTime(0)} className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <SkipBack size={14} />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 rounded bg-[#6c5ce7] text-white hover:bg-[#5b4dd1]"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={() => setCurrentTime(Math.min(currentTime + 1, totalDuration))} className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <SkipForward size={14} />
          </button>
          <div className="w-px h-4 bg-[#2a2a3e] mx-2" />
          <span className="text-xs font-mono text-[#6c5ce7] w-16">{formatTime(currentTime)}</span>
          <div className="w-px h-4 bg-[#2a2a3e] mx-2" />
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={cn(
              'p-1.5 rounded transition-all',
              isRecording ? 'bg-red-500/20 text-red-400' : 'hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]'
            )}
          >
            {isRecording ? <Square size={14} /> : <Mic size={14} />}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={addTrack} className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <Plus size={14} />
          </button>
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <Scissors size={14} />
          </button>
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <Wand2 size={14} />
          </button>
          <div className="w-px h-4 bg-[#2a2a3e] mx-2" />
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <Download size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Main Editor */}
        <div className="flex-1 flex flex-col">
          {/* Waves Canvas */}
          <div className="flex-1 p-4">
            <div className="w-full h-full bg-[#16162a] rounded-lg border border-[#2a2a3e] overflow-hidden relative">
              <canvas ref={canvasRef} className="w-full h-full" />
            </div>
          </div>

          {/* Track Timeline */}
          <div className="h-40 border-t border-[#2a2a3e] bg-[#16162a] overflow-y-auto">
            <div className="h-6 border-b border-[#2a2a3e] flex items-center px-2 gap-2">
              <span className="text-[10px] text-[#6b6b8d] font-medium">Timeline</span>
              <button className="p-0.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d]"><Undo2 size={10} /></button>
              <button className="p-0.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d]"><Redo2 size={10} /></button>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => setZoom(Math.max(0.2, zoom - 0.2))} className="text-[#6b6b8d] hover:text-[#e0e0e0] text-[10px]">-</button>
                <span className="text-[9px] text-[#6b6b8d] w-8 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(Math.min(5, zoom + 0.2))} className="text-[#6b6b8d] hover:text-[#e0e0e0] text-[10px]">+</button>
              </div>
            </div>

            {audioTracks.length === 0 ? (
              <div className="flex items-center justify-center h-20">
                <button
                  onClick={addTrack}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg text-[#a0a0c0] hover:border-[#6c5ce7] hover:text-[#e0e0e0] transition-all"
                >
                  <Plus size={14} />
                  <span className="text-xs">Add Track</span>
                </button>
              </div>
            ) : (
              audioTracks.map((track) => (
                <div
                  key={track.id}
                  onClick={() => setSelectedTrack(track.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 border-b border-[#2a2a3e] cursor-pointer transition-colors',
                    selectedTrack === track.id ? 'bg-[#6c5ce7]/10' : 'hover:bg-[#1e1e32]'
                  )}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateAudioTrack(track.id, { isMuted: !track.isMuted });
                    }}
                    className="text-[#6b6b8d] hover:text-[#e0e0e0]"
                  >
                    {track.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                  </button>
                  <Music size={12} className="text-[#00b894]" />
                  <span className="text-xs text-[#a0a0c0] flex-1">{track.name}</span>
                  <div className="w-16 h-4 bg-[#1a1a2e] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#00b894] to-[#6c5ce7] rounded-full" style={{ width: `${track.volume}%` }} />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAudioTrack(track.id);
                    }}
                    className="text-[#6b6b8d] hover:text-red-400"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Effects Panel */}
        <div className="w-52 border-l border-[#2a2a3e] bg-[#16162a] overflow-y-auto">
          <div className="h-8 flex items-center px-3 border-b border-[#2a2a3e]">
            <span className="text-xs font-medium text-[#e0e0e0]">Effects</span>
          </div>
          <div className="p-3 space-y-4">
            <EffectSection title="EQ" icon={SlidersHorizontal}>
              {['Low', 'Mid', 'High'].map((band) => (
                <div key={band}>
                  <label className="text-[10px] text-[#6b6b8d]">{band}</label>
                  <input type="range" min={-12} max={12} defaultValue={0} className="w-full accent-[#6c5ce7]" />
                </div>
              ))}
            </EffectSection>
            <EffectSection title="Dynamics" icon={Waves}>
              <div>
                <label className="text-[10px] text-[#6b6b8d]">Threshold</label>
                <input type="range" min={-60} max={0} defaultValue={-20} className="w-full accent-[#6c5ce7]" />
              </div>
              <div>
                <label className="text-[10px] text-[#6b6b8d]">Ratio</label>
                <input type="range" min={1} max={20} defaultValue={4} className="w-full accent-[#6c5ce7]" />
              </div>
            </EffectSection>
            <EffectSection title="Reverb" icon={Headphones}>
              <div>
                <label className="text-[10px] text-[#6b6b8d]">Size</label>
                <input type="range" min={0} max={100} defaultValue={30} className="w-full accent-[#6c5ce7]" />
              </div>
              <div>
                <label className="text-[10px] text-[#6b6b8d]">Mix</label>
                <input type="range" min={0} max={100} defaultValue={20} className="w-full accent-[#6c5ce7]" />
              </div>
            </EffectSection>
            <EffectSection title="Delay" icon={Zap}>
              <div>
                <label className="text-[10px] text-[#6b6b8d]">Time</label>
                <input type="range" min={1} max={1000} defaultValue={250} className="w-full accent-[#6c5ce7]" />
              </div>
              <div>
                <label className="text-[10px] text-[#6b6b8d]">Feedback</label>
                <input type="range" min={0} max={100} defaultValue={30} className="w-full accent-[#6c5ce7]" />
              </div>
            </EffectSection>
          </div>
        </div>
      </div>
    </div>
  );
}

function EffectSection({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-[#2a2a3e] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-2 bg-[#1a1a2e] hover:bg-[#20203a] transition-colors"
      >
        <Icon size={12} className="text-[#6c5ce7]" />
        <span className="text-xs text-[#e0e0e0] flex-1 text-left">{title}</span>
        <span className="text-[#6b6b8d] text-xs">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="p-2.5 space-y-2">{children}</div>}
    </div>
  );
}
