import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  Search,
} from 'lucide-react';
import { DatasetCategory, LoadedNpzCase } from '../types';

interface DatasetsViewProps {
  initialCategory?: DatasetCategory;
  onInspectCase: (npz: LoadedNpzCase) => void;
}

interface FolderResponse {
  folder: string;
  title: string;
  description: string;
  headers: string[];
  rows: Array<Record<string, string | boolean>>;
  npzFolder: string | null;
}

interface BenchmarksPayload {
  csvBenchmarks: Array<{
    filename: string;
    headers: string[];
    rows: Array<Record<string, string>>;
  }>;
  mujahidNotes: {
    citation?: string;
    result_classification?: string;
    accessibility_note?: string;
    scientific_policy?: string;
    compatible_thermodynamic_states?: Array<Record<string, string | number>>;
  };
}

const CATEGORIES: Array<{
  id: DatasetCategory;
  label: string;
  folders: Array<{ id: string; label: string }>;
}> = [
  {
    id: 'clean_baseline',
    label: 'Clean & Baseline (NaCl)',
    folders: [
      { id: 'clean_cases', label: 'Stage 1: Clean Sobol (85)' },
      { id: 'repaired_baseline_51', label: 'Repaired v2.0 Baseline (51)' },
      { id: 'original_51_cases', label: 'Preserved v1.0 Archive (51)' },
      { id: 'simulation_summary', label: 'Unified Master Summary (188)' },
    ],
  },
  {
    id: 'multicomponent_brines',
    label: '8-Ion Brines (Discrete RO)',
    folders: [
      { id: 'multicomponent_brines', label: 'Stage 2A: 6 RO Brines (41)' },
      { id: 'brine_audit', label: 'Brine Electroneutrality Audit (7)' },
    ],
  },
  {
    id: 'pinn_corpus',
    label: 'Continuous 18D 8-Ion Scaling Corpus',
    folders: [
      { id: 'pinn_8ion_sobol', label: 'Stage 2B: 18D 8-Ion + Pitzer + CNT Runs' },
      { id: 'pinn_8ion_failure_log', label: 'Stage 2B Excluded Runs Log' },
    ],
  },
  {
    id: 'inorganic_scaling',
    label: 'Inorganic Scaling (Calcite / Gypsum)',
    folders: [{ id: 'scaling_risk', label: 'Stage 3: Wall SI Pitzer vs Davies (36)' }],
  },
  {
    id: 'cnt_exploratory',
    label: 'CNT & Exploratory ΔR_m',
    folders: [{ id: 'mineral_scaling', label: 'Stage 4: CNT (18) & ΔR_m (8)' }],
  },
  {
    id: 'organic_silica_biofouling',
    label: 'Organic / Silica / Biofouling Scope',
    folders: [],
  },
  {
    id: 'failures_benchmarks',
    label: 'Failure Log & Benchmarks',
    folders: [
      { id: 'failure_log', label: 'Excluded Runs Log (12)' },
      { id: 'benchmarks', label: 'Literature Benchmarks (5 CSV + Notes)' },
    ],
  },
];

export const DatasetsView: React.FC<DatasetsViewProps> = ({
  initialCategory = 'clean_baseline',
  onInspectCase,
}) => {
  const [category, setCategory] = useState<DatasetCategory>(initialCategory);
  const [activeFolder, setActiveFolder] = useState<string>('clean_cases');
  const [folderData, setFolderData] = useState<FolderResponse | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarksPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCaseId, setLoadingCaseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [showAllCols, setShowAllCols] = useState(false);
  const [sortCol, setSortCol] = useState<string>('');
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  // Sync activeFolder when category changes
  useEffect(() => {
    const cat = CATEGORIES.find((c) => c.id === category);
    if (cat && cat.folders.length > 0) {
      if (!cat.folders.some((f) => f.id === activeFolder)) {
        setActiveFolder(cat.folders[0].id);
      }
    }
    if (category === 'organic_silica_biofouling') {
      setActiveFolder('mujahid_scope');
    }
  }, [category, activeFolder]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setSortCol('');
      try {
        if (
          activeFolder === 'benchmarks' ||
          activeFolder === 'mujahid_scope'
        ) {
          const res = await fetch('/api/benchmarks');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as BenchmarksPayload;
          if (!cancelled) {
            setBenchmarks(data);
            setFolderData(null);
          }
        } else {
          const res = await fetch(`/api/datasets/folder/${activeFolder}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as FolderResponse;
          if (!cancelled) setFolderData(data);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeFolder]);

  const visibleHeaders = useMemo(() => {
    if (!folderData) return [];
    if (showAllCols || folderData.headers.length <= 12) {
      return folderData.headers;
    }
    const preferred = [
      'case_id',
      'candidate_id',
      'profile_id',
      'scenario_group',
      'brine_profile_id',
      'dominant_scaling_category',
      'result_classification',
      'converged',
      'conc_Na_mol_m3',
      'conc_Ca_mol_m3',
      'conc_SO4_mol_m3',
      'dic_inlet_mol_m3',
      'c_conc_inlet_mol_m3',
      'c_dil_inlet_mol_m3',
      'u_mean_conc_m_s',
      'temperature_K',
      'pH',
      'load_fraction',
      'ocv_mV',
      'R_internal_Ohm_cm2',
      'P_gross_max_W_m2',
      'P_net_max_W_m2',
      'mineral_phase',
      'saturation_index',
      'si_calcite_cem_max',
      'si_gypsum_cem_max',
      'calcite_barrier_het_kBT_max',
      'omega',
      'barrier_het_kBT',
      'delta_Rm_ohm_cm2',
      'performance_reduction_pct',
      'reason',
      'error_detail',
      'included_in_transport_pde',
      'cbe_raw_pct',
      'ionic_strength_M',
    ];
    const picked = folderData.headers.filter((h) => preferred.includes(h));
    return picked.length >= 4 ? picked : folderData.headers.slice(0, 12);
  }, [folderData, showAllCols]);

  const filteredRows = useMemo(() => {
    if (!folderData) return [];
    const q = search.trim().toLowerCase();
    const list = q
      ? folderData.rows.filter((row) =>
          Object.values(row).some((v) =>
            String(v ?? '')
              .toLowerCase()
              .includes(q)
          )
        )
      : [...folderData.rows];

    if (sortCol) {
      list.sort((a, b) => {
        const av = a[sortCol];
        const bv = b[sortCol];
        const an = Number(av);
        const bn = Number(bv);
        let cmp = 0;
        if (av !== '' && bv !== '' && Number.isFinite(an) && Number.isFinite(bn)) {
          cmp = an - bn;
        } else {
          cmp = String(av ?? '').localeCompare(String(bv ?? ''));
        }
        return sortAsc ? cmp : -cmp;
      });
    }
    return list;
  }, [folderData, search, sortCol, sortAsc]);

  const handleLoadNpz = async (
    row: Record<string, string | boolean>,
    npzFolder: string
  ) => {
    const caseId = String(row.case_id ?? '');
    if (!caseId) return;
    setLoadingCaseId(caseId);
    setError(null);
    try {
      const res = await fetch(
        `/api/datasets/case?folder=${encodeURIComponent(npzFolder)}&caseId=${encodeURIComponent(caseId)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as LoadedNpzCase;
      const metaClean: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        if (!k.startsWith('_')) metaClean[k] = String(v ?? '');
      }
      onInspectCase({ ...data, metadata: metaClean });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decode NPZ');
    } finally {
      setLoadingCaseId(null);
    }
  };

  const downloadCsv = () => {
    if (!folderData) return;
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const lines = [
      folderData.headers.join(','),
      ...filteredRows.map((r) => folderData.headers.map((h) => esc(r[h])).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${folderData.folder}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCell = (val: unknown) => {
    const s = String(val ?? '');
    if (!s) return '—';
    const num = Number(s);
    if (
      s !== 'True' &&
      s !== 'False' &&
      !Number.isNaN(num) &&
      Number.isFinite(num) &&
      s.includes('.')
    ) {
      if (Math.abs(num) > 0 && Math.abs(num) < 1e-3) return num.toExponential(2);
      if (Math.abs(num) >= 1000) return num.toFixed(1);
      return num.toFixed(4).replace(/\.?0+$/, '');
    }
    return s;
  };

  const activeCategoryMeta = CATEGORIES.find((c) => c.id === category)!;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="border-b border-[#1C2536] pb-4">
        <h1 className="text-xl font-semibold text-slate-100">
          Categorized Datasets by Fouling &amp; Chemistry Type
        </h1>
        <p className="mt-1 text-sm text-slate-400 max-w-3xl">
          Dedicated quantitative analytics, raw CSV ledgers, and 1-click `.npz` simulator inspection organized across clean NaCl operation, 8-ion desalination brines, inorganic scaling (calcite &amp; gypsum), CNT nucleation &amp; ΔR_m sensitivity, plus the explicit scientific audit of organic, colloidal silica, and biofouling scope.
        </p>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[#1C2536]">
        {CATEGORIES.map((c) => {
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'border-cyan-400 text-cyan-300 bg-[#0E131D]'
                  : 'border-transparent text-slate-400 hover:text-slate-100'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Sub-folder switcher when a category has > 1 folder */}
      {activeCategoryMeta.folders.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeCategoryMeta.folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFolder(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                activeFolder === f.id
                  ? 'border-cyan-500/50 bg-[#131A27] text-cyan-300'
                  : 'border-[#1C2536] bg-[#0E131D] text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="border border-rose-500/40 bg-rose-950/30 text-rose-200 px-4 py-2.5 rounded text-xs">
          ✖ {error}
        </div>
      )}

      {/* Special Dedicated Page: Organic, Colloidal Silica & Biofouling Scope */}
      {category === 'organic_silica_biofouling' ? (
        <OrganicSilicaBiofoulingView benchmarks={benchmarks} />
      ) : loading ? (
        <div className="border border-[#1C2536] bg-[#0E131D] rounded p-10 text-center text-xs text-slate-400">
          Loading dataset records...
        </div>
      ) : activeFolder === 'benchmarks' && benchmarks ? (
        <div className="space-y-4">
          {benchmarks.csvBenchmarks.map((b) => (
            <div
              key={b.filename}
              className="border border-[#1C2536] bg-[#0E131D] rounded p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold font-mono text-cyan-300">
                  data/benchmark_cases/{b.filename}
                </h3>
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  {b.rows.length} rows
                </span>
              </div>
              <div className="overflow-x-auto border border-[#1C2536] rounded">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#131A27] border-b border-[#1C2536] text-slate-300">
                    <tr>
                      {b.headers.map((h) => (
                        <th key={h} className="py-2 px-3 font-semibold whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1C2536]/70 font-mono tabular-nums">
                    {b.rows.map((r, ri) => (
                      <tr key={ri} className="hover:bg-[#131A27]/50">
                        {b.headers.map((h) => (
                          <td key={h} className="py-2 px-3 text-slate-300 whitespace-nowrap">
                            {formatCell(r[h])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : folderData ? (
        <div className="space-y-5">
          {/* Quantitative Type-Specific Analytics Chart derived directly from disk rows */}
          <CategoryAnalyticsChart
            folder={folderData.folder}
            rows={folderData.rows}
          />

          {/* Interactive Data Ledger */}
          <div className="border border-[#1C2536] bg-[#0E131D] rounded p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  {folderData.title}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {folderData.description}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter rows..."
                    className="bg-[#080B11] border border-[#2C3A52] rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {folderData.headers.length > 12 && (
                  <button
                    type="button"
                    onClick={() => setShowAllCols(!showAllCols)}
                    className="px-3 py-1.5 text-xs font-medium rounded border border-[#2C3A52] bg-[#131A27] text-slate-200 hover:bg-[#1C2536] whitespace-nowrap shrink-0"
                  >
                    {showAllCols
                      ? 'Key Columns'
                      : `All Columns (${folderData.headers.length})`}
                  </button>
                )}

                <button
                  type="button"
                  onClick={downloadCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[#2C3A52] bg-[#131A27] text-slate-200 hover:bg-[#1C2536] whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV
                </button>
              </div>
            </div>

            <div className="text-xs font-mono tabular-nums text-slate-400">
              Showing {filteredRows.length} of {folderData.rows.length} rows
            </div>

            <div className="overflow-x-auto border border-[#1C2536] rounded max-h-[560px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#131A27] sticky top-0 z-10 border-b border-[#1C2536] text-slate-300">
                  <tr>
                    {folderData.npzFolder && (
                      <th className="py-2.5 px-3 font-semibold whitespace-nowrap">
                        2D / Wall NPZ
                      </th>
                    )}
                    {visibleHeaders.map((h) => (
                      <th
                        key={h}
                        onClick={() => {
                          if (sortCol === h) setSortAsc(!sortAsc);
                          else {
                            setSortCol(h);
                            setSortAsc(true);
                          }
                        }}
                        className="py-2.5 px-3 font-semibold whitespace-nowrap cursor-pointer hover:text-cyan-300 select-none"
                      >
                        <span className="inline-flex items-center gap-1">
                          {h}
                          {sortCol === h &&
                            (sortAsc ? (
                              <ArrowUp className="w-3 h-3 text-cyan-400" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-cyan-400" />
                            ))}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C2536]/70 font-mono tabular-nums">
                  {filteredRows.map((row, idx) => {
                    const hasNpz =
                      Boolean(row._hasNpz) && Boolean(folderData.npzFolder);
                    const caseId = String(row.case_id ?? idx);
                    const isExploratory =
                      row.result_classification === 'Exploratory sensitivity scenario';
                    const isAuditOnly = row.included_in_transport_pde === 'False';
                    return (
                      <tr
                        key={`${caseId}-${idx}`}
                        className={`hover:bg-[#131A27]/60 ${
                          isExploratory || isAuditOnly ? 'bg-amber-950/15' : ''
                        }`}
                      >
                        {folderData.npzFolder && (
                          <td className="py-2 px-3 whitespace-nowrap">
                            {hasNpz ? (
                              <button
                                type="button"
                                disabled={loadingCaseId === caseId}
                                onClick={() =>
                                  handleLoadNpz(row, folderData.npzFolder!)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 text-[11px] font-sans font-medium whitespace-nowrap"
                              >
                                <Eye className="w-3 h-3" />
                                {loadingCaseId === caseId
                                  ? 'Loading...'
                                  : 'Inspect in Simulator'}
                              </button>
                            ) : (
                              <span className="text-slate-600 text-[11px] font-sans">
                                Parametric only
                              </span>
                            )}
                          </td>
                        )}
                        {visibleHeaders.map((h) => (
                          <td
                            key={h}
                            className={`py-2 px-3 whitespace-nowrap ${
                              h === 'result_classification' && isExploratory
                                ? 'text-amber-300 font-sans font-medium'
                                : h === 'case_id' || h === 'profile_id'
                                  ? 'text-slate-100 font-semibold'
                                  : 'text-slate-300'
                            }`}
                          >
                            {formatCell(row[h])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

/* ---------- Quantitative SVG Chart per Dataset Type ---------- */
const CategoryAnalyticsChart: React.FC<{
  folder: string;
  rows: Array<Record<string, string | boolean>>;
}> = ({ folder, rows }) => {
  if (!rows || rows.length === 0) return null;

  // 1. Scaling risk: Pitzer SI vs Davies SI vs Ionic Strength
  if (folder === 'scaling_risk') {
    const pts = rows
      .map((r) => ({
        id: String(r.case_id ?? ''),
        mineral: String(r.mineral_phase ?? ''),
        I: Number(r.ionic_strength_molal),
        siPitz: Number(r.si_pitzer_outlet ?? r.saturation_index),
        siDav: Number(r.si_davies_outlet),
      }))
      .filter((p) => Number.isFinite(p.I) && Number.isFinite(p.siPitz));

    if (pts.length === 0) return null;
    const W = 820;
    const H = 200;
    const padL = 56;
    const padR = 20;
    const padT = 18;
    const padB = 34;
    const xMax = Math.max(...pts.map((p) => p.I), 1.5);
    const allY = pts.flatMap((p) => [p.siPitz, p.siDav].filter(Number.isFinite));
    const yMin = Math.min(...allY, -0.5);
    const yMax = Math.max(...allY, 1.5);
    const toX = (v: number) => padL + (v / xMax) * (W - padL - padR);
    const toY = (v: number) =>
      padT + ((yMax - v) / Math.max(yMax - yMin, 1e-6)) * (H - padT - padB);

    return (
      <div className="border border-[#1C2536] bg-[#0E131D] rounded p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-100">
            Inorganic Scaling Regime Map — Pitzer HMW vs Davies Breakdown Across Wall Ionic Strength (I)
          </span>
          <div className="flex items-center gap-4 font-mono text-[11px]">
            <span className="text-cyan-300">● Pitzer Calcite / Gypsum</span>
            <span className="text-amber-400">▲ Davies Over-Prediction (I &gt; 0.5)</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#080B11] rounded border border-[#1C2536]">
          <line x1={toX(0.5)} y1={padT} x2={toX(0.5)} y2={H - padB} stroke="#475569" strokeDasharray="4 3" />
          <line x1={padL} y1={toY(0)} x2={W - padR} y2={toY(0)} stroke="#334155" strokeDasharray="3 3" />
          <text x={toX(0.5) + 4} y={padT + 12} fill="#94A3B8" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
            I = 0.5 mol/kg Davies Limit
          </text>
          {pts.map((p, idx) => (
            <g key={idx}>
              <circle cx={toX(p.I)} cy={toY(p.siPitz)} r={3.5} fill="#22D3EE" fillOpacity={0.85} />
              {Number.isFinite(p.siDav) && (
                <circle cx={toX(p.I)} cy={toY(p.siDav)} r={2.8} fill="#F59E0B" fillOpacity={0.75} />
              )}
            </g>
          ))}
          <text x={W / 2} y={H - 8} textAnchor="middle" fill="#64748B" fontSize="10" fontFamily="JetBrains Mono, monospace">
            CEM Wall Ionic Strength I (mol/kg H₂O)
          </text>
        </svg>
      </div>
    );
  }

  // 2. Clean cases / baseline: P_net vs Velocity or Salinity
  if (
    folder === 'clean_cases' ||
    folder === 'repaired_baseline_51' ||
    folder === 'original_51_cases'
  ) {
    const pts = rows
      .map((r) => ({
        x: Number(r.u_mean_conc_m_s ?? r.u_mean_conc ?? 0.01) * 100,
        pNet: Number(r.P_net_max_W_m2),
        pGross: Number(r.P_gross_max_W_m2),
      }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.pNet));

    if (pts.length === 0) return null;
    const W = 820;
    const H = 190;
    const padL = 56;
    const padR = 20;
    const padT = 18;
    const padB = 32;
    const xMax = Math.max(...pts.map((p) => p.x), 4);
    const yMin = Math.min(...pts.map((p) => p.pNet), 0);
    const yMax = Math.max(...pts.map((p) => p.pGross), 1);
    const toX = (v: number) => padL + (v / xMax) * (W - padL - padR);
    const toY = (v: number) =>
      padT + ((yMax - v) / Math.max(yMax - yMin, 1e-6)) * (H - padT - padB);

    return (
      <div className="border border-[#1C2536] bg-[#0E131D] rounded p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-100">
            Power Density Distribution ({pts.length} Solved Runs) — Gross vs Net Electrical Power vs Channel Velocity
          </span>
          <div className="flex items-center gap-4 font-mono text-[11px]">
            <span className="text-cyan-300">● P_net (W/m²)</span>
            <span className="text-emerald-400">● P_gross (W/m²)</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#080B11] rounded border border-[#1C2536]">
          <line x1={padL} y1={toY(0)} x2={W - padR} y2={toY(0)} stroke="#334155" strokeDasharray="3 3" />
          {pts.map((p, idx) => (
            <g key={idx}>
              <circle cx={toX(p.x)} cy={toY(p.pGross)} r={3.2} fill="#34D399" fillOpacity={0.65} />
              <circle cx={toX(p.x)} cy={toY(p.pNet)} r={3.2} fill="#22D3EE" fillOpacity={0.85} />
            </g>
          ))}
          <text x={W / 2} y={H - 8} textAnchor="middle" fill="#64748B" fontSize="10" fontFamily="JetBrains Mono, monospace">
            Concentrated Channel Mean Velocity u_mean (cm/s)
          </text>
        </svg>
      </div>
    );
  }

  // 3. Stage 4 CNT & Exploratory Delta R_m
  if (folder === 'mineral_scaling') {
    const sens = rows
      .filter((r) => String(r.result_classification).includes('Exploratory'))
      .map((r) => ({
        id: String(r.case_id ?? ''),
        dRm: Number(r.delta_Rm_ohm_cm2),
        red: Number(r.performance_reduction_pct),
      }))
      .filter((p) => Number.isFinite(p.dRm));
    if (sens.length === 0) return null;
    const W = 820;
    const H = 170;
    const padL = 56;
    const padR = 24;
    const padT = 18;
    const padB = 32;
    const maxRed = Math.max(...sens.map((s) => s.red), 60);
    return (
      <div className="border border-amber-500/35 bg-[#0E131D] rounded p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-amber-300">
            Exploratory Sensitivity Scenarios (ms_sens_001..008) — Prescribed ΔR_m Power Penalty (%)
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            Not calibrated deposition kinetics
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#080B11] rounded border border-[#1C2536]">
          {sens.map((s, idx) => {
            const bw = (W - padL - padR) / sens.length - 8;
            const bx = padL + idx * ((W - padL - padR) / sens.length) + 4;
            const bh = (s.red / maxRed) * (H - padT - padB);
            const by = H - padB - bh;
            return (
              <g key={s.id}>
                <rect x={bx} y={by} width={bw} height={bh} fill="#F59E0B" fillOpacity={0.78} rx={2} />
                <text x={bx + bw / 2} y={by - 4} textAnchor="middle" fill="#FDE68A" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  -{s.red.toFixed(1)}%
                </text>
                <text x={bx + bw / 2} y={H - 10} textAnchor="middle" fill="#94A3B8" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  +{s.dRm} Ω·cm²
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // 4. Stage 2 Multicomponent 8-Ion Brines: 8-Ion P_gross vs Binary Equivalent NaCl
  if (folder === 'multicomponent_brines') {
    const pts = rows
      .map((r) => ({
        cConc: Number(r.c_conc_inlet_mol_m3),
        p8: Number(r.P_gross_max_W_m2),
        pBin: Number(r.binary_eq_P_gross_max_W_m2),
      }))
      .filter(
        (p) => Number.isFinite(p.cConc) && Number.isFinite(p.p8) && Number.isFinite(p.pBin)
      );
    if (pts.length === 0) return null;
    const W = 820;
    const H = 190;
    const padL = 56;
    const padR = 24;
    const padT = 18;
    const padB = 34;
    const xMin = Math.min(...pts.map((p) => p.cConc), 200);
    const xMax = Math.max(...pts.map((p) => p.cConc), 1200);
    const yMax = Math.max(...pts.flatMap((p) => [p.p8, p.pBin]), 1);
    const toX = (v: number) =>
      padL + ((v - xMin) / Math.max(xMax - xMin, 1)) * (W - padL - padR);
    const toY = (v: number) => padT + ((yMax - v) / Math.max(yMax, 1e-6)) * (H - padT - padB);

    return (
      <div className="border border-[#1C2536] bg-[#0E131D] rounded p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-100">
            8-Ion Nernst–Planck vs Equivalent-NaCl Baseline Power ({pts.length} Brine Runs)
          </span>
          <div className="flex items-center gap-4 font-mono text-[11px]">
            <span className="text-cyan-300">● 8-Ion NP P_gross_max (W/m²)</span>
            <span className="text-amber-400">○ Equivalent NaCl Binary (W/m²)</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#080B11] rounded border border-[#1C2536]">
          {pts.map((p, idx) => (
            <g key={idx}>
              <line
                x1={toX(p.cConc)}
                y1={toY(p.p8)}
                x2={toX(p.cConc)}
                y2={toY(p.pBin)}
                stroke="#334155"
                strokeWidth={1}
              />
              <circle
                cx={toX(p.cConc)}
                cy={toY(p.pBin)}
                r={3.2}
                fill="none"
                stroke="#F59E0B"
                strokeWidth={1.3}
              />
              <circle cx={toX(p.cConc)} cy={toY(p.p8)} r={3.5} fill="#22D3EE" fillOpacity={0.88} />
            </g>
          ))}
          <text x={W / 2} y={H - 8} textAnchor="middle" fill="#64748B" fontSize="10" fontFamily="JetBrains Mono, monospace">
            Brine Equivalent Feed Salinity c_conc (mol/m³)
          </text>
        </svg>
      </div>
    );
  }

  // 5. Stage 2B Continuous 18D 8-Ion + Pitzer + CNT Corpus: Calcite vs Gypsum CEM Max SI
  if (folder === 'pinn_8ion_sobol') {
    const pts = rows
      .map((r) => ({
        siCal: Number(r.si_calcite_cem_max),
        siGyp: Number(r.si_gypsum_cem_max),
        cat: String(r.dominant_scaling_category ?? ''),
      }))
      .filter((p) => Number.isFinite(p.siCal) && Number.isFinite(p.siGyp));
    if (pts.length === 0) return null;

    let catA = 0;
    let catB = 0;
    let catC = 0;
    for (const p of pts) {
      if (p.cat.includes('Category C')) catC++;
      else if (p.cat.includes('Category B')) catB++;
      else catA++;
    }

    const W = 820;
    const H = 210;
    const padL = 56;
    const padR = 24;
    const padT = 18;
    const padB = 34;
    const xMin = Math.min(...pts.map((p) => p.siCal), -2.5);
    const xMax = Math.max(...pts.map((p) => p.siCal), 2.5);
    const yMin = Math.min(...pts.map((p) => p.siGyp), -1.8);
    const yMax = Math.max(...pts.map((p) => p.siGyp), 0.5);
    const toX = (v: number) =>
      padL + ((v - xMin) / Math.max(xMax - xMin, 1e-6)) * (W - padL - padR);
    const toY = (v: number) =>
      padT + ((yMax - v) / Math.max(yMax - yMin, 1e-6)) * (H - padT - padB);

    return (
      <div className="border border-[#1C2536] bg-[#0E131D] rounded p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-100">
            18D Continuous 8-Ion Thermodynamic Scaling Map ({pts.length} Solved Runs) — CEM Calcite SI_max vs Gypsum SI_max
          </span>
          <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] tabular-nums">
            <span className="text-emerald-400">● Cat A Clean ({catA})</span>
            <span className="text-cyan-300">● Cat B Scaling-Risk ({catB})</span>
            <span className="text-amber-400">● Cat C Nucleation-Prone ({catC})</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#080B11] rounded border border-[#1C2536]">
          <line x1={toX(0)} y1={padT} x2={toX(0)} y2={H - padB} stroke="#334155" strokeDasharray="4 3" />
          <line x1={padL} y1={toY(0)} x2={W - padR} y2={toY(0)} stroke="#334155" strokeDasharray="4 3" />
          <text x={toX(0) + 4} y={padT + 12} fill="#64748B" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
            SI_calcite = 0
          </text>
          <text x={padL + 4} y={toY(0) - 5} fill="#64748B" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
            SI_gypsum = 0
          </text>
          {pts.map((p, idx) => {
            const color = p.cat.includes('Category C')
              ? '#F59E0B'
              : p.cat.includes('Category B')
                ? '#22D3EE'
                : '#34D399';
            return (
              <circle
                key={idx}
                cx={toX(p.siCal)}
                cy={toY(p.siGyp)}
                r={3.0}
                fill={color}
                fillOpacity={0.82}
              />
            );
          })}
          <text x={W / 2} y={H - 8} textAnchor="middle" fill="#64748B" fontSize="10" fontFamily="JetBrains Mono, monospace">
            Max CEM Wall Calcite Saturation Index SI_calcite (Pitzer HMW)
          </text>
        </svg>
      </div>
    );
  }

  return null;
};

/* ---------- Dedicated Organic / Silica / Biofouling Scope Page ---------- */
const OrganicSilicaBiofoulingView: React.FC<{
  benchmarks: BenchmarksPayload | null;
}> = ({ benchmarks }) => {
  const states = benchmarks?.mujahidNotes?.compatible_thermodynamic_states ?? [];

  return (
    <div className="space-y-5">
      {/* Scope Boundary Banner */}
      <div className="border border-[#2C3A52] bg-[#0E131D] rounded p-5 space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-slate-100">
              Non-Inorganic Fouling Audit: Organic, Colloidal Silica &amp; Biofouling Scope
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed max-w-[80ch]">
              In strict compliance with <span className="font-mono text-cyan-300">reports/limitations.md (§4–5)</span> and <span className="font-mono text-cyan-300">MODEL_SPECIFICATION.md</span>, REDMind v2.1.0 models <strong>inorganic mineral scaling</strong> (CaCO₃ calcite and CaSO₄·2H₂O gypsum) via validated USGS Pitzer thermodynamics and Santoro (2021) CNT barriers. Synthetic datasets are <strong>never fabricated</strong> for excluded or paywalled biological/organic/colloidal fouling mechanisms.
            </p>
          </div>
        </div>
      </div>

      {/* Fouling Taxonomy Audit Table */}
      <div className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden">
        <div className="px-4 py-2.5 bg-[#131A27] border-b border-[#1C2536] text-xs font-semibold text-slate-200">
          Complete Fouling Mechanism Taxonomy &amp; Dataset Policy Matrix
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="border-b border-[#1C2536] text-slate-400 bg-[#080B11]/60">
              <tr>
                <th className="py-2.5 px-4">Fouling Mechanism</th>
                <th className="py-2.5 px-4">Key Literature Anchor</th>
                <th className="py-2.5 px-4">Model Implementation Status</th>
                <th className="py-2.5 px-4">Data Availability / Policy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C2536]">
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-100">
                  Organic Fouling (Humic Acid, Alginate, NOM)
                </td>
                <td className="py-3 px-4 text-slate-300">
                  Vermaas et al. (2013), Environ. Sci. Technol. 47(10)
                </td>
                <td className="py-3 px-4 font-mono text-slate-400">
                  Explicitly Excluded
                </td>
                <td className="py-3 px-4 text-slate-300">
                  Requires macromolecular adsorption kinetics, Ca²⁺–alginate bridging, and unsteady cake resistance; no synthetic organic trajectories generated.
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-100">
                  Biofouling &amp; Extracellular Polymeric Substances (EPS)
                </td>
                <td className="py-3 px-4 text-slate-300">
                  Vermaas et al. (2013); Tedesco et al. (2016)
                </td>
                <td className="py-3 px-4 font-mono text-slate-400">
                  Explicitly Excluded
                </td>
                <td className="py-3 px-4 text-slate-300">
                  Biological colonization depends on feed nutrient load, shear stress history, and spacer bio-attachment; out of inorganic PDE scope.
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-100">
                  Colloidal / Amorphous Silica Polymerization
                </td>
                <td className="py-3 px-4 text-slate-300">
                  Mujahid et al. (2026), Sep. Purif. Technol. 390, 136960
                </td>
                <td className="py-3 px-4 font-mono text-amber-300">
                  Abstract-Level Benchmark Note Only
                </td>
                <td className="py-3 px-4 text-slate-300">
                  Full-text dataset is behind publisher paywall; only 4 verified gypsum + NaCl thermodynamic benchmark states are stored (zero back-fitted silica kinetics).
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-100">
                  Hypothetical Membrane Resistance Shift (ΔR_m)
                </td>
                <td className="py-3 px-4 text-slate-300">
                  Parametric Stack Sensitivity (ms_sens_001..008)
                </td>
                <td className="py-3 px-4 font-mono text-amber-300">
                  Exploratory Sensitivity Only
                </td>
                <td className="py-3 px-4 text-slate-300">
                  Prescribes +0.5 to +6.0 Ω·cm² lump resistance. Electrical ΔP alone cannot distinguish organic, biofouling, or inorganic blockage causes.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Mujahid 2026 Compatible Benchmark States */}
      <div className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden">
        <div className="px-4 py-3 bg-[#131A27] border-b border-[#1C2536] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Mujahid et al. (2026) Gypsum + Silica Benchmark Reference States
            </h3>
            <p className="text-xs text-slate-400">
              {benchmarks?.mujahidNotes?.citation ?? 'Sep. Purif. Technol. 390, 136960'} ·{' '}
              {benchmarks?.mujahidNotes?.accessibility_note}
            </p>
          </div>
          <span className="text-xs font-mono text-cyan-400">
            data/benchmark_cases/mujahid_2026_gypsum_silica_notes.json
          </span>
        </div>

        {states.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
              <thead className="border-b border-[#1C2536] text-slate-400 bg-[#080B11]/60">
                <tr>
                  <th className="py-2.5 px-3 font-sans">Scenario</th>
                  <th className="py-2.5 px-3 text-right">NaCl (mol/m³)</th>
                  <th className="py-2.5 px-3 text-right">CaSO₄ (mol/m³)</th>
                  <th className="py-2.5 px-3 text-right">I (mol/kg)</th>
                  <th className="py-2.5 px-3 text-right">Pitzer SI</th>
                  <th className="py-2.5 px-3 text-right">Davies SI</th>
                  <th className="py-2.5 px-3">Davies Validity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C2536]/80">
                {states.map((st, idx) => (
                  <tr key={idx} className="hover:bg-[#131A27]/50">
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-100">
                      {String(st.scenario)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {Number(st.nacl_mol_m3).toFixed(0)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {Number(st.ca_so4_mol_m3).toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {Number(st.ionic_strength_molal).toFixed(3)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-cyan-300">
                      {Number(st.si_gypsum_pitzer).toFixed(4)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-400">
                      +{Number(st.si_gypsum_davies).toFixed(4)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {String(st.davies_validity_flag)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
