import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  LayoutGrid,
  Presentation,
  Printer,
} from 'lucide-react';
import {
  DEFAULT_POSTER_META,
  POSTER_DATA,
  POSTER_FIGURES,
  PosterCustomMeta,
} from '../../lib/posterContent';
import {
  NATIVE_SLIDES_CONTENT,
  PRESENTATION_AUDIT_SLIDES,
  PresentationSlideMeta,
} from '../../lib/presentationContent';

type WorkspaceMode = 'poster' | 'presentation';

export const PosterView: React.FC = () => {
  const [mode, setMode] = useState<WorkspaceMode>('presentation');
  const [meta, setMeta] = useState<PosterCustomMeta>(DEFAULT_POSTER_META);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlideIdx, setSelectedSlideIdx] = useState<number>(4); // Start on replaced Slide 5

  const buildQuery = () => {
    const params = new URLSearchParams({
      projectCode: meta.projectCode,
      teamMembers: meta.teamMembers,
      schoolName: meta.schoolName,
    });
    return params.toString();
  };

  const handlePosterDownload = async (format: 'pptx' | 'pdf') => {
    setDownloading(`poster_${format}`);
    setError(null);
    try {
      const res = await fetch(`/api/poster/download/${format}?${buildQuery()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Download failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        format === 'pptx'
          ? 'NEURANUM_ISEF_Poster_48x36.pptx'
          : 'NEURANUM_ISEF_Poster_48x36.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export error');
    } finally {
      setDownloading(null);
    }
  };

  const handlePresentationDownload = async (
    scope: 'full' | 'new_only',
    format: 'pptx' | 'pdf'
  ) => {
    const key = `pres_${scope}_${format}`;
    setDownloading(key);
    setError(null);
    try {
      const res = await fetch(`/api/presentation/download/${scope}/${format}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Download failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        scope === 'new_only'
          ? `REDMind_New_PINN_Slides.${format}`
          : `REDMind_Updated_Presentation_14Slides.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Presentation export failed');
    } finally {
      setDownloading(null);
    }
  };

  const activeSlide =
    PRESENTATION_AUDIT_SLIDES[selectedSlideIdx] ?? PRESENTATION_AUDIT_SLIDES[0];

  return (
    <div className="space-y-6">
      {/* Workspace Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border border-[#1C2536] bg-[#0E131D] rounded px-4 py-3">
        <div className="flex items-center gap-1 p-1 bg-[#080B11] border border-[#1C2536] rounded">
          <button
            type="button"
            onClick={() => setMode('presentation')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              mode === 'presentation'
                ? 'bg-cyan-400 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Presentation className="w-3.5 h-3.5" />
            REDMind Presentation (14 Slides · 16:9)
          </button>
          <button
            type="button"
            onClick={() => setMode('poster')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              mode === 'poster'
                ? 'bg-cyan-400 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            ISEF Tri-Fold Poster (48×36 in)
          </button>
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-400">
          Synced with final 8-Ion Fine-Tuned PINN (0.75% HC L2 · 2.47% Val L2 · 100% Risk Acc)
        </div>
      </div>

      {error && (
        <div className="border border-rose-500/40 bg-rose-950/30 text-rose-200 px-4 py-2 rounded text-xs">
          ✖ {error}
        </div>
      )}

      {mode === 'presentation' ? (
        <div className="space-y-6">
          {/* Presentation Export Header */}
          <div className="border border-[#1C2536] bg-[#0E131D] rounded p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1C2536] pb-4">
              <div className="space-y-1.5">
                <h1 className="text-xl font-semibold text-slate-100">
                  REDMind Pitch &amp; Judging Deck (Updated 14-Slide Edition)
                </h1>
                <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
                  Replaces outdated Slide 5 (4.5–5.5% binary PoC), adds two high-impact 8-Ion PINN &amp; ML ablation slides, cleans Slide 7&apos;s old retraining disclaimer, and updates Slide 10 (Future Plan &amp; Conclusion) using REDMind&apos;s exact palette and layout.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={downloading !== null}
                  onClick={() => handlePresentationDownload('full', 'pptx')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {downloading === 'pres_full_pptx'
                    ? 'Building Full PPTX...'
                    : 'Download Full 14-Slide Deck (.pptx)'}
                </button>
                <button
                  type="button"
                  disabled={downloading !== null}
                  onClick={() => handlePresentationDownload('full', 'pdf')}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded border border-cyan-500/50 bg-[#131A27] hover:bg-[#1C2536] text-cyan-300 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4" />
                  {downloading === 'pres_full_pdf' ? 'Rendering...' : 'Full Deck (.pdf)'}
                </button>
                <button
                  type="button"
                  disabled={downloading !== null}
                  onClick={() => handlePresentationDownload('new_only', 'pptx')}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded border border-[#2C3A52] bg-[#080B11] hover:bg-[#131A27] text-slate-200 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  {downloading === 'pres_new_only_pptx'
                    ? 'Building Pack...'
                    : 'New & Updated 4 Slides (.pptx)'}
                </button>
                <button
                  type="button"
                  disabled={downloading !== null}
                  onClick={() => handlePresentationDownload('new_only', 'pdf')}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded border border-[#2C3A52] bg-[#080B11] hover:bg-[#131A27] text-slate-300 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4" />
                  {downloading === 'pres_new_only_pdf' ? 'Rendering...' : '4 Slides (.pdf)'}
                </button>
              </div>
            </div>

            {/* Interactive Slide Filmstrip Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Select Slide to Preview ({selectedSlideIdx + 1} /{' '}
                  {PRESENTATION_AUDIT_SLIDES.length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedSlideIdx((i) =>
                        i > 0 ? i - 1 : PRESENTATION_AUDIT_SLIDES.length - 1
                      )
                    }
                    className="p-1 rounded border border-[#2C3A52] bg-[#080B11] text-slate-300 hover:text-white"
                    aria-label="Previous slide"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedSlideIdx((i) =>
                        i < PRESENTATION_AUDIT_SLIDES.length - 1 ? i + 1 : 0
                      )
                    }
                    className="p-1 rounded border border-[#2C3A52] bg-[#080B11] text-slate-300 hover:text-white"
                    aria-label="Next slide"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {PRESENTATION_AUDIT_SLIDES.map((sl, idx) => {
                  const isActive = idx === selectedSlideIdx;
                  const statusTone =
                    sl.status === 'replace' || sl.status === 'add' || sl.status === 'update'
                      ? 'text-cyan-300'
                      : sl.status === 'patch_note'
                        ? 'text-amber-300'
                        : 'text-slate-400';
                  return (
                    <button
                      key={sl.id}
                      type="button"
                      onClick={() => setSelectedSlideIdx(idx)}
                      className={`text-left p-2 rounded border transition-colors ${
                        isActive
                          ? 'bg-[#131A27] border-cyan-400'
                          : 'bg-[#080B11] border-[#1C2536] hover:border-[#2C3A52]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 font-mono text-[11px] tabular-nums">
                        <span className="text-slate-200 font-semibold">
                          #{sl.newNumber}
                        </span>
                        <span className={statusTone}>
                          {sl.status === 'add'
                            ? 'NEW'
                            : sl.status === 'replace'
                              ? 'REPLACED'
                              : sl.status === 'update'
                                ? 'UPDATED'
                                : sl.status === 'patch_note'
                                  ? 'PATCHED'
                                  : 'KEEP'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300 truncate mt-0.5">
                        {sl.title}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 16:9 Live Slide Preview Stage */}
          <div className="border border-[#1C2536] bg-[#0E131D] rounded p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-[#1C2536] pb-2.5">
              <div className="flex items-center gap-2 text-slate-100 font-semibold">
                <span className="font-mono tabular-nums text-cyan-400">
                  Slide {activeSlide.newNumber} of {PRESENTATION_AUDIT_SLIDES.length}
                </span>
                <span className="text-slate-600">·</span>
                <span>{activeSlide.title}</span>
              </div>
              <span className="text-[11px] font-mono text-emerald-400">
                {activeSlide.statusLabel}
              </span>
            </div>

            <div className="overflow-x-auto pb-1">
              <div className="min-w-[960px] max-w-[1160px] mx-auto aspect-[16/9] bg-white rounded border border-slate-300 overflow-hidden shadow-2xl text-slate-900">
                <PresentationSlidePreview slide={activeSlide} />
              </div>
            </div>

            <p className="text-xs text-slate-400">
              {activeSlide.summary}
            </p>
          </div>

          {/* Concise Slide-by-Slide Audit Table */}
          <div className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden">
            <div className="px-4 py-3 bg-[#131A27] border-b border-[#1C2536] flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-100">
                Presentation Audit Plan (12 Original Slides → 14 Concise Judging Slides)
              </h2>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                1 Deleted (Old Slide 5) · 4 Native REDMind Slides Added/Updated
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-[#080B11] text-slate-400 font-mono text-[11px] border-b border-[#1C2536]">
                  <tr>
                    <th className="py-2.5 px-3">New #</th>
                    <th className="py-2.5 px-3">Orig #</th>
                    <th className="py-2.5 px-3">Slide Title</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Audit Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C2536]">
                  {PRESENTATION_AUDIT_SLIDES.map((s, idx) => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedSlideIdx(idx)}
                      className={`cursor-pointer transition-colors ${
                        idx === selectedSlideIdx
                          ? 'bg-[#131A27]'
                          : 'hover:bg-[#131A27]/50'
                      }`}
                    >
                      <td className="py-2 px-3 font-mono tabular-nums text-cyan-300 font-semibold">
                        {s.newNumber}
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums text-slate-400">
                        {s.originalNumber ?? '—'}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-100">
                        {s.title}
                      </td>
                      <td
                        className={`py-2 px-3 font-mono text-[11px] whitespace-nowrap ${
                          s.status === 'keep'
                            ? 'text-slate-400'
                            : s.status === 'patch_note'
                              ? 'text-amber-300'
                              : 'text-emerald-400'
                        }`}
                      >
                        {s.statusLabel}
                      </td>
                      <td className="py-2 px-3 text-slate-300">{s.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ==================== ISEF TRI-FOLD POSTER MODE ==================== */
        <>
          <div className="border border-[#1C2536] bg-[#0E131D] rounded p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1C2536] pb-4">
              <div className="space-y-1">
                <h1 className="text-xl font-semibold text-slate-100">
                  ISEF Tri-Fold Display Board (48&Prime; × 36&Prime;)
                </h1>
                <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
                  Final print-ready layout with large legible typography, 6 high-res solver &amp; 8-Ion PINN figures, verified NEURANUM v2.1.0 metrics, end-to-end scaling validation, and APA references. Download as an editable <span className="font-mono text-cyan-300">.pptx</span> or vector <span className="font-mono text-cyan-300">.pdf</span>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={downloading !== null}
                  onClick={() => handlePosterDownload('pptx')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {downloading === 'poster_pptx'
                    ? 'Generating Editable PPTX...'
                    : 'Download Editable PPTX (48×36 in)'}
                </button>

                <button
                  type="button"
                  disabled={downloading !== null}
                  onClick={() => handlePosterDownload('pdf')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded border border-cyan-500/50 bg-[#131A27] hover:bg-[#1C2536] text-cyan-300 transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  {downloading === 'poster_pdf'
                    ? 'Rendering Vector PDF...'
                    : 'Download Print PDF (48×36 in)'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="space-y-1 text-xs">
                <span className="text-slate-400 block font-mono">Project Code</span>
                <input
                  type="text"
                  value={meta.projectCode}
                  onChange={(e) => setMeta({ ...meta, projectCode: e.target.value })}
                  className="w-full bg-[#080B11] border border-[#2C3A52] rounded px-3 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-cyan-400"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-slate-400 block font-mono">Team Members</span>
                <input
                  type="text"
                  value={meta.teamMembers}
                  onChange={(e) => setMeta({ ...meta, teamMembers: e.target.value })}
                  className="w-full bg-[#080B11] border border-[#2C3A52] rounded px-3 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-cyan-400"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-slate-400 block font-mono">Institution</span>
                <input
                  type="text"
                  value={meta.schoolName}
                  onChange={(e) => setMeta({ ...meta, schoolName: e.target.value })}
                  className="w-full bg-[#080B11] border border-[#2C3A52] rounded px-3 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-cyan-400"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-5 text-[11px] text-slate-400 pt-1">
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                6 high-res 3×2 graphs (2D Solver + 8-Ion PINN &amp; 100% Risk Parity)
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <Printer className="w-3.5 h-3.5" />
                True 48&Prime;×36&Prime; print typography (16–42 pt on board)
              </span>
            </div>
          </div>

          {/* Interactive Tri-Fold Poster Canvas Preview */}
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[1440px] bg-[#E2E8F0] p-4 rounded border border-[#1C2536] text-slate-900 shadow-2xl space-y-3">
              <div className="bg-[#0F2942] border-2 border-[#0E7490] border-b-4 border-b-[#22D3EE] px-10 py-6 text-center space-y-2 rounded-sm">
                <h2 className="text-[31px] font-bold text-white leading-snug tracking-tight">
                  {POSTER_DATA.title}
                </h2>
                <p className="text-lg font-medium text-[#67E8F9]">
                  {POSTER_DATA.subtitle}
                </p>
                <div className="pt-1 text-[15px] font-mono font-semibold text-slate-200">
                  Project Code: {meta.projectCode} &nbsp;|&nbsp; Team: {meta.teamMembers} &nbsp;|&nbsp; Institution: {meta.schoolName}
                </div>
              </div>

              <div className="grid grid-cols-12 gap-3 items-stretch">
                {/* LEFT WING */}
                <div className="col-span-3 bg-white border border-slate-300 p-3 flex flex-col gap-3">
                  <PosterCard title="1. Abstract" navyHeader className="flex-1">
                    <p className="text-[15.5px] leading-relaxed text-slate-900">
                      {POSTER_DATA.abstract}
                    </p>
                  </PosterCard>

                  <PosterCard title="2. Purpose &amp; Problem Statement" className="flex-1">
                    <div className="space-y-2.5 text-[15px] leading-relaxed text-slate-900">
                      <p>
                        <strong className="text-[#0F2942]">General Problem:</strong>{' '}
                        {POSTER_DATA.generalProblem}
                      </p>
                      <p>
                        <strong className="text-[#0F2942]">Specialized Problem:</strong>{' '}
                        {POSTER_DATA.specializedProblem}
                      </p>
                      <table className="w-full text-[13.5px] border-collapse border border-slate-300 mt-1">
                        <thead className="bg-slate-200 text-[#0F2942]">
                          <tr>
                            {POSTER_DATA.sorourBrineTable.headers.map((h) => (
                              <th key={h} className="p-2 text-left border border-slate-300 font-bold">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          {POSTER_DATA.sorourBrineTable.rows.map((r, i) => (
                            <tr key={i} className="odd:bg-white even:bg-slate-50">
                              {r.map((c, j) => (
                                <td key={j} className="p-2 border border-slate-300">
                                  {c}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-[13px] italic text-slate-600">
                        {POSTER_DATA.sorourBrineTable.caption}
                      </p>
                    </div>
                  </PosterCard>

                  <PosterCard title="3. Background Research &amp; Gap" className="flex-1">
                    <table className="w-full text-[13px] border-collapse border border-slate-300">
                      <thead className="bg-slate-200 text-[#0F2942]">
                        <tr>
                          {POSTER_DATA.backgroundTable.headers.map((h) => (
                            <th key={h} className="p-1.5 text-left border border-slate-300 font-bold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {POSTER_DATA.backgroundTable.rows.map((r, i) => (
                          <tr key={i} className="odd:bg-white even:bg-slate-50">
                            <td className="p-1.5 border border-slate-300 font-bold text-[#0F2942]">
                              {r[0]}
                            </td>
                            <td className="p-1.5 border border-slate-300">{r[1]}</td>
                            <td className="p-1.5 border border-slate-300">{r[2]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate-900">
                      <strong className="text-[#0E7490]">Research Gap:</strong>{' '}
                      {POSTER_DATA.researchGap}
                    </p>
                  </PosterCard>

                  <PosterCard title="4. Research Question &amp; Hypothesis">
                    <div className="space-y-3 text-[16px] leading-relaxed text-slate-900">
                      <p>
                        <strong className="text-[#0F2942]">Question:</strong>{' '}
                        {POSTER_DATA.researchQuestion}
                      </p>
                      <p>
                        <strong className="text-[#0F2942]">Hypothesis:</strong>{' '}
                        {POSTER_DATA.hypothesis}
                      </p>
                    </div>
                  </PosterCard>

                  <PosterCard title="5. Materials &amp; Software Tools">
                    <table className="w-full text-[13.5px] border-collapse border border-slate-300">
                      <thead className="bg-slate-200 text-[#0F2942]">
                        <tr>
                          <th className="p-2 text-left border border-slate-300">Tool / Stack</th>
                          <th className="p-2 text-left border border-slate-300">Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {POSTER_DATA.materialsTools.map((m, i) => (
                          <tr key={i} className="odd:bg-white even:bg-slate-50">
                            <td className="p-2 border border-slate-300 font-semibold text-[#0F2942]">
                              {m[0]}
                            </td>
                            <td className="p-2 border border-slate-300">{m[1]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </PosterCard>

                  <PosterCard title="6. Variables">
                    <table className="w-full text-[13.5px] border-collapse border border-slate-300">
                      <thead className="bg-slate-200 text-[#0F2942]">
                        <tr>
                          {POSTER_DATA.variablesTable.headers.map((h) => (
                            <th key={h} className="p-2 text-left border border-slate-300">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {POSTER_DATA.variablesTable.rows.map((r, i) => (
                          <tr key={i} className="odd:bg-white even:bg-slate-50">
                            <td className="p-2 border border-slate-300 font-semibold text-[#0F2942] align-top">
                              {r[0]}
                            </td>
                            <td className="p-2 border border-slate-300 font-mono text-[13px] leading-snug">
                              {r[1]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </PosterCard>
                </div>

                {/* CENTER PANEL */}
                <div className="col-span-6 bg-white border border-slate-300 p-3 flex flex-col gap-3">
                  <PosterCard title="7. Procedure" navyHeader>
                    <div className="grid grid-cols-4 gap-2.5">
                      {POSTER_DATA.procedureSteps.map((step, i) => (
                        <div
                          key={i}
                          className="border border-[#0E7490] bg-white p-3 rounded-sm text-[14.5px] leading-snug text-slate-900"
                        >
                          {step}
                        </div>
                      ))}
                    </div>
                  </PosterCard>

                  <PosterCard title="8. Data &amp; Benchmark Verification">
                    <table className="w-full text-[14.5px] border-collapse border border-slate-300">
                      <thead className="bg-slate-200 text-[#0F2942]">
                        <tr>
                          {POSTER_DATA.verifiedDataTable.headers.map((h) => (
                            <th key={h} className="p-2 text-left border border-slate-300 font-bold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="font-mono text-[14px]">
                        {POSTER_DATA.verifiedDataTable.rows.map((r, i) => (
                          <tr key={i} className="odd:bg-white even:bg-slate-50">
                            <td className="p-2 border border-slate-300 font-sans font-semibold text-[#0F2942]">
                              {r[0]}
                            </td>
                            <td className="p-2 border border-slate-300">{r[1]}</td>
                            <td className="p-2 border border-slate-300">{r[2]}</td>
                            <td className="p-2 border border-slate-300 font-bold text-emerald-700">
                              {r[3]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </PosterCard>

                  <PosterCard
                    title="9. Graphs — Multi-Physics Transport, Scaling Risk &amp; 8-Ion PINN Parity"
                    navyHeader
                    className="flex-1 flex flex-col"
                  >
                    <div className="grid grid-cols-3 gap-3 flex-1">
                      {POSTER_FIGURES.map((fig) => (
                        <div
                          key={fig.filename}
                          className="border border-slate-300 bg-white p-2.5 flex flex-col justify-between gap-1.5"
                        >
                          <div className="text-[14px] font-bold text-[#0F2942] leading-tight">
                            {fig.title}
                          </div>
                          <div className="bg-white flex items-center justify-center py-1 flex-1">
                            <img
                              src={`/figures/${fig.filename}`}
                              alt={fig.title}
                              className="w-full h-auto object-contain max-h-[240px]"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-[12px] font-mono font-semibold text-[#0369A1]">
                              Axes / Units: {fig.axesAndUnits}
                            </div>
                            <p className="text-[12.5px] text-slate-700 leading-snug">
                              {fig.caption}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PosterCard>

                  <PosterCard title="10. Data Analysis">
                    <div className="grid grid-cols-2 gap-3">
                      {POSTER_DATA.dataAnalysisPoints.map((pt, i) => (
                        <div
                          key={i}
                          className="border border-slate-300 bg-white p-3.5 text-[15px] leading-relaxed text-slate-900"
                        >
                          {pt}
                        </div>
                      ))}
                    </div>
                  </PosterCard>
                </div>

                {/* RIGHT WING */}
                <div className="col-span-3 bg-white border border-slate-300 p-3 flex flex-col gap-3">
                  <PosterCard title="11. Results" className="flex-1">
                    <ul className="list-disc pl-4 space-y-2.5 text-[15.5px] leading-relaxed text-slate-900">
                      {POSTER_DATA.resultsSummary.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </PosterCard>

                  <PosterCard title="12. 8-Ion PINN Validation &amp; Scope" navyHeader className="flex-1">
                    <div className="space-y-2.5">
                      <table className="w-full text-[13.5px] border-collapse border border-slate-300">
                        <thead className="bg-slate-200 text-[#0F2942]">
                          <tr>
                            {POSTER_DATA.pinnSummaryTable.headers.map((h) => (
                              <th key={h} className="p-2 text-left border border-slate-300 font-bold">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {POSTER_DATA.pinnSummaryTable.rows.map((r, i) => (
                            <tr key={i} className="bg-white">
                              <td className="p-2 border border-slate-300 font-semibold text-[#0F2942]">
                                {r[0]}
                              </td>
                              <td className="p-2 border border-slate-300 font-mono font-semibold text-slate-900">
                                {r[1]}
                              </td>
                              <td className="p-2 border border-slate-300 text-slate-700">
                                {r[2]}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-[13.5px] italic text-slate-700 leading-snug">
                        {POSTER_DATA.pinnSummaryTable.note}
                      </p>
                    </div>
                  </PosterCard>

                  <PosterCard title="13. Conclusions" navyHeader className="flex-1">
                    <ul className="list-disc pl-4 space-y-2.5 text-[16px] leading-relaxed text-slate-900">
                      {POSTER_DATA.conclusions.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </PosterCard>

                  <PosterCard title="14. Applications &amp; Future Work" className="flex-1">
                    <div className="space-y-3 text-[15px] leading-relaxed text-slate-900">
                      <div>
                        <strong className="text-[#0F2942] block mb-1">
                          Applications:
                        </strong>
                        <ul className="list-disc pl-4 space-y-1.5">
                          {POSTER_DATA.applications.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <strong className="text-[#0F2942] block mb-1">
                          Future Work:
                        </strong>
                        <div className="space-y-1.5">
                          {POSTER_DATA.futureWork.map((f, i) => (
                            <div key={i}>{f}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </PosterCard>

                  <PosterCard title="15. Research Sources (APA)" navyHeader className="flex-1">
                    <div className="space-y-2 text-[13.5px] leading-snug text-slate-900">
                      {POSTER_DATA.apaReferences.map((ref, i) => (
                        <p key={i} className="pl-3 -indent-3">
                          {ref}
                        </p>
                      ))}
                    </div>
                  </PosterCard>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ============================================================================
 * REDMind 16:9 Slide Visual Preview Component (Preserved + Native Slides)
 * ========================================================================== */
const PresentationSlidePreview: React.FC<{ slide: PresentationSlideMeta }> = ({
  slide,
}) => {
  if (slide.origImage) {
    return (
      <div className="relative w-full h-full bg-white">
        <img
          src={`/presentation-slides/${slide.origImage}`}
          alt={slide.title}
          className="w-full h-full object-contain"
        />
        {slide.status === 'patch_note' && (
          <div className="absolute bottom-[3.2%] left-[2%] right-[2%] bg-white px-3 py-1 text-[11px] italic text-slate-600">
            Calcite &amp; Gypsum SI denote thermodynamic supersaturation only (not time-dependent fouling thickness). Real-time 8-ion PINN surrogate trained &amp; validated on NEURANUM v2.1.0 (see Slides 5–7).
          </div>
        )}
      </div>
    );
  }

  if (slide.id === 'slide-5') {
    const c = NATIVE_SLIDES_CONTENT.slide5;
    return (
      <div className="w-full h-full bg-white p-5 flex flex-col gap-2.5 font-sans">
        <div>
          <div className="text-[11px] font-bold tracking-[0.22em] text-[#1B6B89] uppercase">
            {c.kicker}
          </div>
          <h2 className="text-[22px] font-serif font-bold text-[#081826] leading-tight">
            {c.title}
          </h2>
        </div>

        <div className="bg-[#0B3B59] text-white rounded-full px-5 py-1.5 text-[12px] font-semibold">
          {c.banner}
        </div>

        <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">
          <div className="col-span-5 flex flex-col gap-2.5 min-h-0">
            <div className="bg-[#EFF6FA] border border-[#D4E4EE] rounded-xl p-2.5 space-y-1.5">
              <div className="bg-[#0E7490] text-white rounded-full px-3.5 py-1 text-[12px] font-serif font-bold">
                {c.archCardTitle}
              </div>
              <ul className="text-[11px] text-slate-800 space-y-1 pl-3 list-disc leading-snug">
                {c.archBullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>

            <div className="bg-[#EFF6FA] border border-[#D4E4EE] rounded-xl p-2.5 space-y-1.5">
              <div className="bg-[#0E7490] text-white rounded-full px-3.5 py-1 text-[12px] font-serif font-bold">
                {c.trainCardTitle}
              </div>
              <ul className="text-[11px] text-slate-800 space-y-1 pl-3 list-disc leading-snug">
                {c.trainBullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-2 flex-1">
              {c.kpis.map((k, idx) => (
                <div
                  key={k.label}
                  className={`rounded-xl px-3 py-2 flex flex-col justify-center border ${
                    idx === 0
                      ? 'bg-[#0B3B59] border-[#0B3B59] text-white'
                      : 'bg-white border-[#D4E4EE] text-[#0B3B59]'
                  }`}
                >
                  <div className="text-[20px] font-serif font-bold tabular-nums leading-none">
                    {k.value}
                  </div>
                  <div
                    className={`text-[10.5px] font-semibold mt-1 ${
                      idx === 0 ? 'text-sky-200' : 'text-slate-600'
                    }`}
                  >
                    {k.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-7 bg-[#EFF6FA] border border-[#D4E4EE] rounded-xl p-2.5 flex flex-col gap-2 min-h-0">
            <div className="bg-[#0E7490] text-white rounded-full px-4 py-1 text-[12px] font-serif font-bold shrink-0">
              {c.figHeader}
            </div>
            <div className="bg-white border border-[#D4E4EE] rounded-lg flex-1 min-h-0 flex items-center justify-center p-1.5">
              <img
                src={`/figures/${c.figFile}`}
                alt={c.figHeader}
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="bg-[#0B3B59] text-white rounded-lg px-3 py-1.5 text-[11px] font-semibold shrink-0">
              {c.figFooter}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (slide.id === 'slide-6') {
    const c = NATIVE_SLIDES_CONTENT.slide6;
    return (
      <div className="w-full h-full bg-white p-5 flex flex-col gap-2.5 font-sans">
        <div>
          <div className="text-[11px] font-bold tracking-[0.22em] text-[#1B6B89] uppercase">
            {c.kicker}
          </div>
          <h2 className="text-[22px] font-serif font-bold text-[#081826] leading-tight">
            {c.title}
          </h2>
        </div>

        <div className="bg-[#0B3B59] text-white rounded-full px-5 py-1.5 text-[12px] font-semibold">
          {c.banner}
        </div>

        <div className="grid grid-cols-4 gap-2.5 shrink-0">
          {c.stages.map((st, idx) => (
            <div
              key={st.num}
              className={`rounded-xl border p-2.5 ${
                idx === 1
                  ? 'bg-[#0B3B59] border-[#0B3B59] text-white'
                  : 'bg-[#EFF6FA] border-[#D4E4EE] text-slate-800'
              }`}
            >
              <div
                className={`text-[12px] font-serif font-bold ${
                  idx === 1 ? 'text-cyan-300' : 'text-[#0E7490]'
                }`}
              >
                {st.num}
              </div>
              <div className="text-[11px] mt-1 leading-snug">{st.desc}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">
          <div className="col-span-7 bg-[#EFF6FA] border border-[#D4E4EE] rounded-xl p-2.5 flex flex-col gap-2 min-h-0">
            <div className="bg-[#0E7490] text-white rounded-full px-4 py-1 text-[12px] font-serif font-bold shrink-0">
              {c.figHeader}
            </div>
            <div className="bg-white border border-[#D4E4EE] rounded-lg flex-1 min-h-0 flex items-center justify-center p-1.5">
              <img
                src={`/figures/${c.figFile}`}
                alt={c.figHeader}
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="bg-[#0B3B59] text-white rounded-lg px-3 py-1.5 text-[11px] font-semibold text-center shrink-0">
              {c.figFooter}
            </div>
          </div>

          <div className="col-span-5 bg-[#0B3B59] rounded-xl p-3 flex flex-col gap-2 text-white">
            <div className="bg-[#0E7490] text-white rounded-full px-4 py-1 text-[12px] font-serif font-bold shrink-0">
              {c.proofTitle}
            </div>
            <ul className="space-y-2.5 text-[11px] leading-snug flex-1 pt-1">
              {c.proofPoints.map((p) => (
                <li key={p.head}>
                  <span className="font-bold text-cyan-300">• {p.head} </span>
                  <span>{p.body}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (slide.id === 'slide-7') {
    const c = NATIVE_SLIDES_CONTENT.slide7;
    return (
      <div className="w-full h-full bg-white p-5 flex flex-col gap-2.5 font-sans">
        <div>
          <div className="text-[11px] font-bold tracking-[0.22em] text-[#1B6B89] uppercase">
            {c.kicker}
          </div>
          <h2 className="text-[22px] font-serif font-bold text-[#081826] leading-tight">
            {c.title}
          </h2>
        </div>

        <div className="bg-[#0B3B59] text-white rounded-full px-5 py-1.5 text-[12px] font-semibold">
          {c.banner}
        </div>

        <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">
          <div className="col-span-8 bg-[#EFF6FA] border border-[#D4E4EE] rounded-xl p-2.5 flex flex-col gap-1.5 min-h-0">
            <div className="bg-[#0E7490] text-white rounded-full px-4 py-1 text-[12px] font-serif font-bold shrink-0">
              {c.figHeader}
            </div>
            <div className="bg-white border border-[#D4E4EE] rounded-lg flex-1 min-h-0 flex items-center justify-center p-1">
              <img
                src={`/figures/${c.figFile}`}
                alt={c.figHeader}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          </div>

          <div className="col-span-4 flex flex-col justify-between gap-2">
            {c.highlights.map((hl, idx) => (
              <div
                key={hl.metric}
                className={`rounded-xl border p-2.5 flex-1 flex flex-col justify-center ${
                  idx === 0
                    ? 'bg-[#0B3B59] border-[#0B3B59] text-white'
                    : 'bg-[#EFF6FA] border-[#D4E4EE] text-slate-800'
                }`}
              >
                <div
                  className={`text-[14px] font-serif font-bold ${
                    idx === 0 ? 'text-cyan-300' : 'text-[#0E7490]'
                  }`}
                >
                  {hl.metric}
                </div>
                <div className="text-[11px] mt-0.5 leading-snug">{hl.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <table className="w-full text-[11px] border-collapse border border-[#D4E4EE] shrink-0">
          <thead className="bg-[#0B3B59] text-white">
            <tr>
              {c.tableHeaders.map((h) => (
                <th key={h} className="py-1.5 px-2.5 text-left font-bold border border-[#D4E4EE]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.tableRows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-[#EFF6FA]'}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`py-1.5 px-2.5 border border-[#D4E4EE] ${
                      ci === 1
                        ? 'font-bold text-emerald-700'
                        : ci === 4
                          ? 'font-semibold text-[#0E7490]'
                          : ci === 0
                            ? 'font-semibold text-slate-900'
                            : 'text-slate-800'
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Slide 12 (Updated Future Plan & Conclusion)
  const c12 = NATIVE_SLIDES_CONTENT.slide12;
  return (
    <div className="w-full h-full bg-white p-5 flex flex-col gap-2.5 font-sans">
      <div>
        <div className="text-[11px] font-bold tracking-[0.22em] text-[#1B6B89] uppercase">
          {c12.kicker}
        </div>
        <h2 className="text-[23px] font-serif font-bold text-[#081826] leading-tight">
          {c12.title}
        </h2>
      </div>

      <div className="grid grid-cols-12 gap-3.5 flex-1 min-h-0">
        <div className="col-span-6 flex flex-col gap-3 min-h-0">
          <div className="bg-[#EFF6FA] border border-[#D4E4EE] rounded-xl p-3 flex-1 space-y-2.5">
            <div className="bg-[#0E7490] text-white rounded-full px-4 py-1 text-[12px] font-serif font-bold inline-block">
              {c12.roadmapTitle}
            </div>
            <div className="space-y-2.5 pt-1">
              {c12.roadmapSteps.map((st) => (
                <div key={st.num} className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[#0E7490] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {st.num}
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[12px] font-bold text-[#081826]">
                      {st.heading}
                    </div>
                    <ul className="text-[10.8px] text-slate-800 list-disc pl-3.5 space-y-0.5 leading-snug">
                      {st.bullets.map((b, bi) => (
                        <li key={bi}>{b}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#EFF6FA] border border-[#D4E4EE] rounded-xl p-3 space-y-1.5">
            <div className="bg-[#0E7490] text-white rounded-full px-4 py-1 text-[12px] font-serif font-bold inline-block">
              {c12.phase1Title}
            </div>
            <div className="text-[13px] font-bold text-[#0E7490]">
              {c12.phase1Plant}
            </div>
            <p className="text-[11px] text-slate-800 leading-snug">
              {c12.phase1Detail}
            </p>
            <p className="text-[10.5px] text-slate-600">{c12.phase1Alt}</p>
          </div>
        </div>

        <div className="col-span-6 bg-[#0B3B59] rounded-xl p-3.5 text-white flex flex-col gap-2.5">
          <div className="bg-[#0E7490] text-white rounded-full px-4 py-1 text-[13px] font-serif font-bold inline-block self-start">
            {c12.conclusionTitle}
          </div>
          <ul className="space-y-2 text-[11.2px] leading-snug flex-1">
            {c12.conclusionBullets.map((b) => (
              <li key={b.label}>
                <span className="font-bold text-cyan-300">• {b.label} </span>
                <span>{b.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

const PosterCard: React.FC<{
  title: string;
  children: React.ReactNode;
  navyHeader?: boolean;
  className?: string;
}> = ({ title, children, navyHeader, className = '' }) => (
  <section className={`border border-slate-300 bg-slate-50 flex flex-col ${className}`}>
    <div
      className={`px-3.5 py-2 text-[15px] font-bold uppercase tracking-wide text-white shrink-0 ${
        navyHeader ? 'bg-[#0F2942]' : 'bg-[#0E7490]'
      }`}
    >
      {title}
    </div>
    <div className="p-3.5 flex-1 flex flex-col">{children}</div>
  </section>
);
