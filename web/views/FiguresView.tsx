import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';

interface FigureItem {
  filename: string;
  stage: string;
  title: string;
  caption: string;
  url: string;
}

export const FiguresView: React.FC = () => {
  const [figures, setFigures] = useState<FigureItem[]>([]);
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/figures')
      .then((r) => r.json())
      .then((d) => setFigures(d.figures ?? []))
      .finally(() => setLoading(false));
  }, []);

  const stages = useMemo(
    () => ['All', ...Array.from(new Set(figures.map((f) => f.stage)))],
    [figures]
  );

  const visible = useMemo(
    () =>
      stageFilter === 'All'
        ? figures
        : figures.filter((f) => f.stage === stageFilter),
    [figures, stageFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {stages.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStageFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                stageFilter === st
                  ? 'border-cyan-500/50 bg-[#131A27] text-cyan-300'
                  : 'border-[#1C2536] bg-[#0E131D] text-slate-400 hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        <div className="text-xs font-mono tabular-nums text-slate-400">
          {visible.length} of {figures.length} figures
        </div>
      </div>

      {loading ? (
        <div className="border border-[#1C2536] bg-[#0E131D] rounded p-8 text-center text-xs text-slate-400">
          Loading figure gallery...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((fig, idx) => (
            <div
              key={fig.filename}
              className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden flex flex-col"
            >
              <button
                type="button"
                onClick={() => setLightboxIdx(idx)}
                className="relative group bg-white aspect-[16/10] w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                {!failedImages[fig.filename] ? (
                  <img
                    src={fig.url}
                    alt={fig.title}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedImages((prev) => ({
                        ...prev,
                        [fig.filename]: true,
                      }))
                    }
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full bg-[#080B11] flex flex-col items-center justify-center p-4 text-center">
                    <span className="text-xs font-mono text-slate-400">
                      {fig.filename}
                    </span>
                    <span className="text-xs text-slate-500 mt-1">
                      Preview unavailable
                    </span>
                  </div>
                )}
                <div className="absolute top-2 right-2 p-1.5 rounded bg-slate-950/75 text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="w-3.5 h-3.5" />
                </div>
              </button>

              <div className="p-3.5 flex-1 flex flex-col justify-between gap-2 border-t border-[#1C2536]">
                <div>
                  <div className="text-[11px] font-mono text-cyan-400 mb-1">
                    {fig.stage} · {fig.filename}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100 leading-snug">
                    {fig.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                    {fig.caption}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightboxIdx !== null && visible[lightboxIdx] && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxIdx(null)}
        >
          <div
            className="max-w-5xl w-full border border-[#2C3A52] bg-[#0E131D] rounded overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-[#1C2536] bg-[#131A27]">
              <div className="min-w-0">
                <div className="text-xs font-mono text-cyan-400">
                  {visible[lightboxIdx].stage} · {visible[lightboxIdx].filename}
                </div>
                <div className="text-sm font-semibold text-slate-100 truncate">
                  {visible[lightboxIdx].title}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIdx(
                      (lightboxIdx - 1 + visible.length) % visible.length
                    )
                  }
                  className="p-1.5 rounded border border-[#2C3A52] bg-[#080B11] text-slate-200 hover:bg-[#1C2536]"
                  aria-label="Previous figure"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIdx((lightboxIdx + 1) % visible.length)
                  }
                  className="p-1.5 rounded border border-[#2C3A52] bg-[#080B11] text-slate-200 hover:bg-[#1C2536]"
                  aria-label="Next figure"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxIdx(null)}
                  className="p-1.5 rounded border border-[#2C3A52] bg-[#080B11] text-slate-200 hover:bg-[#1C2536]"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="bg-white p-3 max-h-[75vh] flex items-center justify-center">
              <img
                src={visible[lightboxIdx].url}
                alt={visible[lightboxIdx].title}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
            <div className="px-4 py-3 border-t border-[#1C2536] text-xs text-slate-300">
              {visible[lightboxIdx].caption}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
