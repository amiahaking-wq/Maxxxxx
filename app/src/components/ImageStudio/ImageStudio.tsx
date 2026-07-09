import { useState, useRef } from 'react';
import { useNexusStore } from '@/store/nexusStore';
import {
  Layers,
  ImagePlus,
  Wand2,
  Download,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Paintbrush,
  Eraser,
  Square,
  Circle,
  Type,
  Move,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  SlidersHorizontal,
  Crop,
  Sun,
  Contrast,
  Droplets,
  Palette,
  CloudFog,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function ImageStudio() {
  const { imageLayers, activeLayerId, canvasSize, addImageLayer, updateImageLayer, setActiveLayer, removeImageLayer } = useNexusStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [activeTool, setActiveTool] = useState('move');
  const [showFilters, setShowFilters] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');

  const tools = [
    { id: 'move', icon: Move, label: 'Move' },
    { id: 'brush', icon: Paintbrush, label: 'Brush' },
    { id: 'eraser', icon: Eraser, label: 'Eraser' },
    { id: 'rect', icon: Square, label: 'Rectangle' },
    { id: 'circle', icon: Circle, label: 'Circle' },
    { id: 'text', icon: Type, label: 'Text' },
    { id: 'crop', icon: Crop, label: 'Crop' },
  ];

  const filters = [
    { id: 'brightness', icon: Sun, label: 'Brightness', min: 0, max: 200, default: 100 },
    { id: 'contrast', icon: Contrast, label: 'Contrast', min: 0, max: 200, default: 100 },
    { id: 'saturation', icon: Droplets, label: 'Saturation', min: 0, max: 200, default: 100 },
    { id: 'hue', icon: Palette, label: 'Hue Rotate', min: 0, max: 360, default: 0 },
    { id: 'blur', icon: CloudFog, label: 'CloudFog', min: 0, max: 20, default: 0 },
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 2000));
    setGeneratedImage(`https://picsum.photos/800/600?random=${Date.now()}`);
    setIsGenerating(false);
  };

  const addNewLayer = () => {
    addImageLayer({
      id: `layer-${Date.now()}`,
      name: `Layer ${imageLayers.length + 1}`,
      visible: true,
      opacity: 100,
      blendMode: 'normal',
      data: '',
      width: canvasSize.width,
      height: canvasSize.height,
      x: 0,
      y: 0,
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f1a]">
      {/* Toolbar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#2a2a3e] bg-[#16162a] shrink-0">
        <div className="flex items-center gap-1">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className={cn(
                  'p-1.5 rounded transition-all',
                  activeTool === tool.id
                    ? 'bg-[#6c5ce7]/20 text-[#6c5ce7]'
                    : 'text-[#6b6b8d] hover:text-[#e0e0e0] hover:bg-[#2a2a3e]'
                )}
                title={tool.label}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]" title="Undo">
            <Undo2 size={14} />
          </button>
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]" title="Redo">
            <Redo2 size={14} />
          </button>
          <div className="w-px h-4 bg-[#2a2a3e] mx-1" />
          <button onClick={() => setZoom(Math.max(0.1, zoom - 0.1))} className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <ZoomOut size={14} />
          </button>
          <span className="text-[10px] text-[#6b6b8d] w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(Math.min(3, zoom + 0.1))} className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <ZoomIn size={14} />
          </button>
          <button onClick={() => setZoom(1)} className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <Maximize size={14} />
          </button>
          <div className="w-px h-4 bg-[#2a2a3e] mx-1" />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'p-1.5 rounded transition-all',
              showFilters ? 'bg-[#6c5ce7]/20 text-[#6c5ce7]' : 'text-[#6b6b8d] hover:text-[#e0e0e0] hover:bg-[#2a2a3e]'
            )}
          >
            <SlidersHorizontal size={14} />
          </button>
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <Download size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Canvas Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* AI Generation Bar */}
          <div className="px-3 py-2 border-b border-[#2a2a3e] flex gap-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe an image to generate..."
              className="flex-1 bg-[#1a1a2e] border border-[#2a2a3e] rounded-md px-3 py-1.5 text-xs text-[#e0e0e0] placeholder-[#4a4a6a] outline-none focus:border-[#6c5ce7] transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-3 py-1.5 bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-white text-xs rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 shrink-0 transition-all"
            >
              {isGenerating ? (
                <><span className="animate-spin">⟳</span> Generating...</>
              ) : (
                <><Wand2 size={12} /> Generate</>
              )}
            </button>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-[#0a0a14]">
            <div
              className="relative bg-[#1a1a2e] border border-[#2a2a3e] shadow-2xl"
              style={{
                width: canvasSize.width * zoom,
                height: canvasSize.height * zoom,
              }}
            >
              <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                className="w-full h-full"
              />
              {generatedImage && (
                <img
                  src={generatedImage}
                  alt="Generated"
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{ opacity: 0.9 }}
                />
              )}
              {/* Grid overlay */}
              <div
                className="absolute inset-0 pointer-events-none opacity-10"
                style={{
                  backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
                  backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Right Panel - Layers & Filters */}
        <div className="w-56 border-l border-[#2a2a3e] bg-[#16162a] flex flex-col overflow-hidden">
          {showFilters ? (
            <>
              <div className="h-8 flex items-center px-3 border-b border-[#2a2a3e]">
                <span className="text-xs font-medium text-[#e0e0e0]">Filters</span>
                <button onClick={() => setShowFilters(false)} className="ml-auto text-[#6b6b8d] hover:text-[#e0e0e0]">
                  <ChevronDown size={12} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {filters.map((filter) => {
                  const Icon = filter.icon;
                  return (
                    <div key={filter.id}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon size={12} className="text-[#6c5ce7]" />
                        <span className="text-[10px] text-[#a0a0c0]">{filter.label}</span>
                      </div>
                      <input
                        type="range"
                        min={filter.min}
                        max={filter.max}
                        defaultValue={filter.default}
                        className="w-full h-1 bg-[#2a2a3e] rounded-full appearance-none cursor-pointer accent-[#6c5ce7]"
                      />
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="h-8 flex items-center justify-between px-3 border-b border-[#2a2a3e]">
                <span className="text-xs font-medium text-[#e0e0e0]">Layers</span>
                <button onClick={addNewLayer} className="text-[#6b6b8d] hover:text-[#e0e0e0]">
                  <ImagePlus size={12} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {imageLayers.length === 0 ? (
                  <div className="p-4 text-center">
                    <Layers size={20} className="text-[#3a3a4e] mx-auto mb-2" />
                    <p className="text-[10px] text-[#4a4a6a]">No layers yet</p>
                    <button
                      onClick={addNewLayer}
                      className="mt-2 text-[10px] text-[#6c5ce7] hover:underline"
                    >
                      Add Layer
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-[#2a2a3e]">
                    {[...imageLayers].reverse().map((layer) => (
                      <div
                        key={layer.id}
                        onClick={() => setActiveLayer(layer.id)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
                          activeLayerId === layer.id ? 'bg-[#6c5ce7]/10' : 'hover:bg-[#1e1e32]'
                        )}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateImageLayer(layer.id, { visible: !layer.visible });
                          }}
                          className="text-[#6b6b8d] hover:text-[#e0e0e0]"
                        >
                          {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                        <Layers size={12} className="text-[#6c5ce7]" />
                        <span className="text-xs text-[#a0a0c0] flex-1 truncate">{layer.name}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImageLayer(layer.id);
                          }}
                          className="text-[#6b6b8d] hover:text-red-400 opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Opacity */}
              {imageLayers.length > 0 && (
                <div className="p-3 border-t border-[#2a2a3e]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-[#6b6b8d]">Opacity</span>
                    <span className="text-[10px] text-[#a0a0c0]">100%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    defaultValue={100}
                    className="w-full h-1 bg-[#2a2a3e] rounded-full appearance-none cursor-pointer accent-[#6c5ce7]"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
