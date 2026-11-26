import React, { useEffect, useMemo, useState } from 'react';
import { BarChart2, Download, Layers, Play, RotateCcw } from 'lucide-react';
import { FieldCanvas } from '../components/FieldCanvas';
import { ProfileChart } from '../components/ProfileChart';
import { ComparisonView } from './ComparisonView';
import {
  BrineProfile,
  LoadedNpzCase,
  SimulationConfigPayload,
  SimulationResultPayload,
} from '../types';

interface SimulatorViewProps {
  brineProfiles: Record<string, BrineProfile>;
  molecularWeights: Record<string, number>;
  loadedNpz: LoadedNpzCase | null;
  onClearLoadedNpz: () => void;
}

const DEFAULT_PAYLOAD: SimulationConfigPayload = {
  solverMode: 'binary',
  channelHeight: 270e-6,
  channelLength: 0.1,
  membraneThicknessCem: 125e-6,
  membraneThicknessAem: 125e-6,
  nx: 60,
  ny: 25,
  uMeanConc: 0.01,
  uMeanDil: 0.01,
  cConcInlet: 500,
  cDilInlet: 17,
  T: 298.15,
  xCem: -2000,
  xAem: 2000,
  sigmaCem: 1.0,
  sigmaAem: 1.0,
  loadFraction: 0.0,
  bcMode: 'v2_repaired',
  deltaRmOhmCm2: 0.0,
  pH: 8.1,
  caInletMolM3: 10.2,
  mgInletMolM3: 53.0,
  kInletMolM3: 10.2,
  so4InletMolM3: 28.2,
  hco3InletMolM3: 2.1,
  co3InletMolM3: 0.2,
  contactAngleCemDeg: 55.0,
  roughnessFactorCem: 1.2,
  caseId: 'gurreri_2017_v2',
  compareWithV1: true,
  compareWithBinary: true,
};

const SPECIES_LIST = ['Na', 'K', 'Mg', 'Ca', 'Cl', 'SO4', 'HCO3', 'CO3'] as const;

type FieldKey = 'concentration' | 'velocity' | 'potential' | 'pressure' | 'flux';
type ChartTab = 'wall' | 'slice_y' | 'si' | 'polarization' | 'convergence';
type SimulatorTab = 'solver' | 'comparison';

export const SimulatorView: React.FC<SimulatorViewProps> = ({
  brineProfiles,
  molecularWeights,
  loadedNpz,
  onClearLoadedNpz,
}) => {
  const [cfg, setCfg] = useState<SimulationConfigPayload>(DEFAULT_PAYLOAD);
  const [selectedPreset, setSelectedPreset] = useState<string>('gurreri_baseline');
  const [simData, setSimData] = useState<{
    result: SimulationResultPayload;
    v1Comparison: SimulationResultPayload | null;
    binaryComparison: SimulationResultPayload | null;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [simulatorTab, setSimulatorTab] = useState<SimulatorTab>('solver');
  const [fieldKey, setFieldKey] = useState<FieldKey>('concentration');
  const [mcSpecies, setMcSpecies] = useState<string>('Na');
  const [animateIons, setAnimateIons] = useState(true);
  const [chartTab, setChartTab] = useState<ChartTab>('wall');
  const [selectedXIndex, setSelectedXIndex] = useState<number>(30);

  useEffect(() => {
    if (loadedNpz) {
      setSimulatorTab('solver');
    }
  }, [loadedNpz]);

  const runLive = async (override?: SimulationConfigPayload) => {
    const payload = override ?? cfg;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setSimData(json);
      if (json.result?.geomConc?.nx) {
        setSelectedXIndex((prev) =>
          Math.max(0, Math.min(json.result.geomConc.nx - 1, prev))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    runLive(DEFAULT_PAYLOAD);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (key: string) => {
    setSelectedPreset(key);
    if (loadedNpz) onClearLoadedNpz();

    if (key === 'gurreri_baseline') {
      const next: SimulationConfigPayload = {
        ...DEFAULT_PAYLOAD,
        solverMode: cfg.solverMode,
        compareWithV1: cfg.compareWithV1,
        compareWithBinary: true,
      };
      setCfg(next);
      runLive(next);
      return;
    }

    const prof = brineProfiles[key];
    if (!prof) return;
    const toMolM3 = (sp: string) => {
      const mgL = prof.concentrations_mg_L[sp];
      const mw = molecularWeights[sp] ?? 1;
      if (mgL === null || mgL === undefined) return 0;
      return mgL / mw;
    };
    const na = toMolM3('Na');
    const ca = toMolM3('Ca');
    const mg = toMolM3('Mg');
    const k = toMolM3('K');
    const so4 = toMolM3('SO4');
    const hco3 = toMolM3('HCO3');
    let co3 = toMolM3('CO3');
    const ph = prof.pH ?? 8.1;
    if (co3 === 0 && hco3 > 0) {
      co3 = (hco3 * 10 ** -10.329) / 10 ** -ph;
    }

    const next: SimulationConfigPayload = {
      ...cfg,
      solverMode: 'multicomponent',
      nx: 45,
      ny: 18,
      cConcInlet: Math.round(na),
      cDilInlet: 17,
      T: 273.15 + (prof.temperature_C ?? 25),
      pH: ph,
      caInletMolM3: Number(ca.toFixed(2)),
      mgInletMolM3: Number(mg.toFixed(2)),
      kInletMolM3: Number(k.toFixed(2)),
      so4InletMolM3: Number(so4.toFixed(2)),
      hco3InletMolM3: Number(hco3.toFixed(2)),
      co3InletMolM3: Number(co3.toFixed(3)),
      caseId: key,
    };
    setCfg(next);
    runLive(next);
  };

  const npzMode = loadedNpz !== null;
  const activeArrays = loadedNpz?.arrays;

  const npzCanvasBundle = useMemo(() => {
    if (!loadedNpz || !activeArrays) return null;
    if (loadedNpz.folder === 'scaling_risk') {
      return { isWallOnly: true as const };
    }

    const isMc =
      loadedNpz.folder === 'multicomponent_brines' ||
      loadedNpz.folder === 'pinn_8ion_sobol';
    const xArr = (activeArrays.x_conc?.data ??
      activeArrays.x_interface?.data ??
      []) as number[];
    const yConc = (activeArrays.y_conc?.data ?? [0, 270e-6]) as number[];
    const hM =
      yConc.length > 1 ? Math.abs(yConc[yConc.length - 1] - yConc[0]) : 270e-6;

    let concGrid: number[][] | null = null;
    let dilGrid: number[][] | null = null;
    let label = 'Concentration';
    let unit = 'mol/m³';
    let cmap: 'viridis' | 'plasma' | 'diverging' = 'viridis';

    if (fieldKey === 'concentration') {
      if (isMc) {
        concGrid = (activeArrays[`c_${mcSpecies}_conc`]?.data ??
          activeArrays.c_Na_conc?.data ??
          null) as number[][] | null;
        dilGrid = (activeArrays[`c_${mcSpecies}_dil`]?.data ??
          activeArrays.c_Na_dil?.data ??
          null) as number[][] | null;
        label = `${mcSpecies} Concentration`;
      } else {
        concGrid = (activeArrays.c_na_conc?.data ?? null) as number[][] | null;
        dilGrid = (activeArrays.c_na_dil?.data ?? null) as number[][] | null;
        label = 'Na⁺ / Salt Concentration';
      }
    } else if (fieldKey === 'velocity') {
      concGrid = (activeArrays.u_conc?.data ?? null) as number[][] | null;
      dilGrid = (activeArrays.u_dil?.data ?? null) as number[][] | null;
      label = 'Streamwise Velocity u';
      unit = 'm/s';
      cmap = 'plasma';
    } else if (fieldKey === 'potential') {
      concGrid = (activeArrays.phi_conc?.data ?? null) as number[][] | null;
      dilGrid = (activeArrays.phi_dil?.data ?? null) as number[][] | null;
      label = 'Electric Potential φ';
      unit = 'V';
      cmap = 'diverging';
    } else if (fieldKey === 'pressure') {
      concGrid = (activeArrays.p_conc?.data ?? null) as number[][] | null;
      dilGrid = (activeArrays.p_dil?.data ?? null) as number[][] | null;
      label = 'Gauge Pressure p';
      unit = 'Pa';
    } else {
      const jxC = activeArrays.Jx_conc?.data as number[][] | undefined;
      const jyC = activeArrays.Jy_conc?.data as number[][] | undefined;
      const jxD = activeArrays.Jx_dil?.data as number[][] | undefined;
      const jyD = activeArrays.Jy_dil?.data as number[][] | undefined;
      if (jxC && jyC && jxD && jyD) {
        concGrid = jxC.map((col, i) =>
          col.map((vx, j) => Math.hypot(vx, jyC[i][j]))
        );
        dilGrid = jxD.map((col, i) =>
          col.map((vx, j) => Math.hypot(vx, jyD[i][j]))
        );
      } else {
        concGrid = (activeArrays.c_na_conc?.data ?? null) as number[][] | null;
        dilGrid = (activeArrays.c_na_dil?.data ?? null) as number[][] | null;
      }
      label = 'Diffusive Flux |J|';
      unit = 'mol/(m²·s)';
    }

    return {
      isWallOnly: false as const,
      xCoords: xArr,
      channelHeightM: hM,
      concGrid,
      dilGrid,
      uConc: (activeArrays.u_conc?.data ?? null) as number[][] | null,
      uDil: (activeArrays.u_dil?.data ?? null) as number[][] | null,
      label,
      unit,
      cmap,
      isMc,
      siCalProfile: (activeArrays.si_calcite_cem_conc?.data ??
        null) as number[] | null,
    };
  }, [loadedNpz, activeArrays, fieldKey, mcSpecies]);

  const liveCanvasBundle = useMemo(() => {
    const r = simData?.result;
    if (!r) return null;
    const isMc = r.solverMode === 'multicomponent' && !!r.multicomponent;
    let concGrid = isMc
      ? (r.multicomponent!.cConcSpecies[mcSpecies] ?? r.cConc)
      : r.cConc;
    let dilGrid = isMc
      ? (r.multicomponent!.cDilSpecies[mcSpecies] ?? r.cDil)
      : r.cDil;
    let label = isMc
      ? `${mcSpecies} Ion Concentration (8-Ion NP)`
      : 'Salt Concentration (NaCl)';
    let unit = 'mol/m³';
    let cmap: 'viridis' | 'plasma' | 'diverging' = 'viridis';

    if (fieldKey === 'velocity') {
      concGrid = r.flowConc.u;
      dilGrid = r.flowDil.u;
      label = 'Streamwise Velocity u';
      unit = 'm/s';
      cmap = 'plasma';
    } else if (fieldKey === 'potential') {
      concGrid = r.phiConc;
      dilGrid = r.phiDil;
      label = isMc
        ? 'Elliptic Current-Conserving Potential φ'
        : 'Liquid Junction Potential φ';
      unit = 'V';
      cmap = 'diverging';
    } else if (fieldKey === 'pressure') {
      concGrid = r.flowConc.p;
      dilGrid = r.flowDil.p;
      label = 'Gauge Pressure p';
      unit = 'Pa';
    } else if (fieldKey === 'flux') {
      concGrid = r.jxConc.map((col, i) =>
        col.map((vx, j) => Math.hypot(vx, r.jyConc[i][j]))
      );
      dilGrid = r.jxDil.map((col, i) =>
        col.map((vx, j) => Math.hypot(vx, r.jyDil[i][j]))
      );
      label = 'Diffusive Flux Magnitude |J|';
      unit = 'mol/(m²·s)';
    }
    return { r, isMc, concGrid, dilGrid, label, unit, cmap };
  }, [simData, fieldKey, mcSpecies]);

  const exportSnapshot = () => {
    const payload = loadedNpz ?? simData;
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = loadedNpz
      ? `${loadedNpz.caseId}_fields.json`
      : `redmind_v2_${cfg.solverMode}_${cfg.caseId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const r = simData?.result;
  const v1 = simData?.v1Comparison;
  const binCmp = simData?.binaryComparison;
  const isMcActive = r?.solverMode === 'multicomponent' && !!r.multicomponent;

  // Transverse y-profile across dilute + conc channels at selectedXIndex
  const sliceProfile = useMemo(() => {
    if (!r) return null;
    const ix = Math.max(0, Math.min(r.geomConc.nx - 1, selectedXIndex));
    const hUm = r.config.channelHeight * 1e6;
    const cConcArr = isMcActive
      ? (r.multicomponent!.cConcSpecies[mcSpecies] ?? r.cConc)
      : r.cConc;
    const cDilArr = isMcActive
      ? (r.multicomponent!.cDilSpecies[mcSpecies] ?? r.cDil)
      : r.cDil;

    const yDilUm = r.geomDil.y.map((v) => v * 1e6);
    const yConcUm = r.geomConc.y.map((v) => hUm + v * 1e6);
    const yAll = [...yDilUm, ...yConcUm];
    const cAll = [...cDilArr[ix], ...cConcArr[ix]];
    const uAll = [...r.flowDil.u[ix], ...r.flowConc.u[ix]].map((v) => v * 100);
    return {
      xCm: r.geomConc.x[ix] * 100,
      yAll,
      cAll,
      uAll,
      label: isMcActive ? `${mcSpecies} (mol/m³)` : 'NaCl (mol/m³)',
    };
  }, [r, selectedXIndex, isMcActive, mcSpecies]);

  return (
    <div className="flex flex-col gap-5">
      {/* Simulator Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-[#1C2536] bg-[#0E131D] rounded px-3 py-2">
        <div className="inline-flex items-center gap-1 p-1 bg-[#080B11] border border-[#1C2536] rounded">
          <button
            type="button"
            onClick={() => setSimulatorTab('solver')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              simulatorTab === 'solver'
                ? 'bg-[#131A27] text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-100 border border-transparent'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            2D Multi-Physics Solver
          </button>
          <button
            type="button"
            onClick={() => setSimulatorTab('comparison')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              simulatorTab === 'comparison'
                ? 'bg-[#131A27] text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-100 border border-transparent'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            PINN vs. Traditional ML Comparison
          </button>
        </div>

        <span className="text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap">
          {simulatorTab === 'comparison'
            ? '8-Ion Sobol Benchmark · 192 Train / 41 Val / 42 Test'
            : '2D Finite-Volume Nernst–Planck + Pitzer HMW + CNT'}
        </span>
      </div>

      {simulatorTab === 'comparison' ? (
        <ComparisonView />
      ) : (
        <>
      {/* Top Instrument Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border border-[#1C2536] bg-[#0E131D] rounded px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-slate-100">
            {npzMode
              ? `Archive Inspector · ${loadedNpz.folder} / ${loadedNpz.caseId}`
              : cfg.solverMode === 'multicomponent'
                ? 'Live 2D 8-Ion Nernst–Planck + Donnan–GHK Solver'
                : `Live 2D Binary NaCl Solver · ${cfg.bcMode === 'v2_repaired' ? 'Repaired v2.0.0 (-J CEM BC)' : 'Legacy v1.0.0 (+J CEM BC)'}`}
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          {npzMode ? (
            <span className="text-cyan-400 font-mono">
              {loadedNpz.filename} ({loadedNpz.keys.length} arrays decoded)
            </span>
          ) : (
            <span className="text-slate-400 font-mono tabular-nums">
              {r
                ? `Grid ${r.config.nx}×${r.config.ny} · ${r.couplingIterations} iters (${r.wallTimeMs.toFixed(1)} ms) · ${r.converged ? 'Converged' : 'Max Iter'}`
                : 'Initializing solver...'}
            </span>
          )}
          {cfg.deltaRmOhmCm2 > 0 && !npzMode && (
            <>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="text-amber-400 font-medium">
                Exploratory sensitivity scenario (ΔR_m = +{cfg.deltaRmOhmCm2.toFixed(1)} Ω·cm²)
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {npzMode && (
            <button
              type="button"
              onClick={onClearLoadedNpz}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Return to Live Solver
            </button>
          )}
          <button
            type="button"
            onClick={exportSnapshot}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[#2C3A52] bg-[#131A27] text-slate-200 hover:bg-[#1C2536] transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
        </div>
      </div>

      {/* Main Split Console */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Control Column */}
        <aside className="w-full lg:w-[340px] shrink-0 border border-[#1C2536] bg-[#0E131D] rounded divide-y divide-[#1C2536]">
          {/* Physics Formulation Switch */}
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
              <span className="inline-flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Governing PDE Formulation
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#080B11] border border-[#1C2536] rounded">
              <button
                type="button"
                onClick={() => {
                  const next: SimulationConfigPayload = {
                    ...cfg,
                    solverMode: 'binary',
                    nx: 60,
                    ny: 25,
                  };
                  setCfg(next);
                  if (loadedNpz) onClearLoadedNpz();
                  runLive(next);
                }}
                className={`px-2 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  cfg.solverMode !== 'multicomponent'
                    ? 'bg-[#131A27] text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Binary NaCl (2D)
              </button>
              <button
                type="button"
                onClick={() => {
                  const next: SimulationConfigPayload = {
                    ...cfg,
                    solverMode: 'multicomponent',
                    nx: 45,
                    ny: 18,
                  };
                  setCfg(next);
                  if (loadedNpz) onClearLoadedNpz();
                  runLive(next);
                }}
                className={`px-2 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  cfg.solverMode === 'multicomponent'
                    ? 'bg-[#131A27] text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                8-Ion Nernst–Planck
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">
              {cfg.solverMode === 'multicomponent'
                ? 'Solves 7 independent ions + Cl⁻ neutrality, elliptic potential Φ, multi-ion Donnan + GHK with Anderson Acceleration.'
                : 'Solves 2D ambipolar NaCl advection–diffusion + 1:1 Donnan partitioning with Pitzer wall SI.'}
            </p>
          </div>

          {/* Preset Selector */}
          <div className="p-4">
            <label
              htmlFor="preset-select"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Feed &amp; Brine Preset
            </label>
            <select
              id="preset-select"
              value={selectedPreset}
              onChange={(e) => applyPreset(e.target.value)}
              className="w-full bg-[#080B11] border border-[#2C3A52] rounded px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
            >
              <option value="gurreri_baseline">
                Gurreri et al. (2017) Baseline (0.5 M / 0.017 M NaCl)
              </option>
              {Object.entries(brineProfiles)
                .filter(([id]) => id !== 'hypersaline_swro_santoro_2024_ic')
                .map(([id, prof]) => (
                  <option key={id} value={id}>
                    {prof.title}
                  </option>
                ))}
            </select>
            <p className="mt-1.5 text-[11px] text-slate-500 leading-snug">
              Brine presets switch to 8-ion Nernst–Planck automatically. Santoro (2024) IC brine remains audit-only in Datasets.
            </p>
          </div>

          {/* BC Switch for Binary Mode */}
          {cfg.solverMode !== 'multicomponent' && (
            <div className="p-4">
              <div className="text-xs font-semibold text-slate-300 mb-2">
                CEM Bottom-Wall Boundary Condition
              </div>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#080B11] border border-[#1C2536] rounded">
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...cfg, bcMode: 'v2_repaired' as const };
                    setCfg(next);
                    if (loadedNpz) onClearLoadedNpz();
                    runLive(next);
                  }}
                  className={`px-2 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    cfg.bcMode === 'v2_repaired'
                      ? 'bg-[#131A27] text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  v2.0 Repaired (-J)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...cfg, bcMode: 'v1_buggy_cem' as const };
                    setCfg(next);
                    if (loadedNpz) onClearLoadedNpz();
                    runLive(next);
                  }}
                  className={`px-2 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    cfg.bcMode === 'v1_buggy_cem'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  v1.0 Legacy (+J)
                </button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!cfg.compareWithV1}
                  onChange={(e) =>
                    setCfg({ ...cfg, compareWithV1: e.target.checked })
                  }
                  className="accent-cyan-400"
                />
                Overlay v1.0.0 legacy curve in wall chart
              </label>
            </div>
          )}

          {/* Operating Parameters */}
          <div className="p-4 space-y-3">
            <div className="text-xs font-semibold text-slate-300">
              Channel Operating Parameters
            </div>

            <SliderControl
              label="Na⁺ Conc. Inlet"
              value={cfg.cConcInlet}
              unit="mol/m³"
              min={150}
              max={2000}
              step={10}
              onChange={(v) => setCfg({ ...cfg, cConcInlet: v })}
            />
            <SliderControl
              label="Dilute Inlet Salinity"
              value={cfg.cDilInlet}
              unit="mol/m³"
              min={5}
              max={60}
              step={1}
              onChange={(v) => setCfg({ ...cfg, cDilInlet: v })}
            />
            <SliderControl
              label="Mean Velocity u_conc"
              value={cfg.uMeanConc * 100}
              unit="cm/s"
              min={0.2}
              max={5.0}
              step={0.1}
              decimals={1}
              onChange={(v) => setCfg({ ...cfg, uMeanConc: v / 100 })}
            />
            <SliderControl
              label="Mean Velocity u_dil"
              value={cfg.uMeanDil * 100}
              unit="cm/s"
              min={0.2}
              max={5.0}
              step={0.1}
              decimals={1}
              onChange={(v) => setCfg({ ...cfg, uMeanDil: v / 100 })}
            />
            <SliderControl
              label="Channel Height H"
              value={cfg.channelHeight * 1e6}
              unit="μm"
              min={150}
              max={500}
              step={10}
              onChange={(v) => setCfg({ ...cfg, channelHeight: v * 1e-6 })}
            />
            <SliderControl
              label="Temperature"
              value={cfg.T - 273.15}
              unit="°C"
              min={15}
              max={45}
              step={1}
              onChange={(v) => setCfg({ ...cfg, T: 273.15 + v })}
            />
            <SliderControl
              label="Electrical Load Fraction"
              value={cfg.loadFraction}
              unit=""
              min={0}
              max={0.9}
              step={0.05}
              decimals={2}
              onChange={(v) => setCfg({ ...cfg, loadFraction: v })}
            />
          </div>

          {/* Geochemistry & CNT */}
          <div className="p-4 space-y-3">
            <div className="text-xs font-semibold text-slate-300">
              Brine Chemistry &amp; CEM Wetting (CNT)
            </div>
            <SliderControl
              label="Brine pH"
              value={cfg.pH}
              unit=""
              min={6.4}
              max={9.0}
              step={0.05}
              decimals={2}
              onChange={(v) => setCfg({ ...cfg, pH: v })}
            />
            <SliderControl
              label="Ca²⁺ Inlet"
              value={cfg.caInletMolM3}
              unit="mol/m³"
              min={0.5}
              max={50}
              step={0.5}
              decimals={1}
              onChange={(v) => setCfg({ ...cfg, caInletMolM3: v })}
            />
            <SliderControl
              label="Mg²⁺ Inlet"
              value={cfg.mgInletMolM3}
              unit="mol/m³"
              min={0}
              max={150}
              step={1}
              onChange={(v) => setCfg({ ...cfg, mgInletMolM3: v })}
            />
            <SliderControl
              label="SO₄²⁻ Inlet"
              value={cfg.so4InletMolM3}
              unit="mol/m³"
              min={0.5}
              max={100}
              step={1}
              onChange={(v) => setCfg({ ...cfg, so4InletMolM3: v })}
            />
            <SliderControl
              label="CEM Contact Angle θ"
              value={cfg.contactAngleCemDeg}
              unit="°"
              min={25}
              max={90}
              step={1}
              onChange={(v) => setCfg({ ...cfg, contactAngleCemDeg: v })}
            />
          </div>

          {/* Exploratory Delta R_m */}
          <div className="p-4 space-y-2">
            <div className="text-xs font-semibold text-amber-300">
              Exploratory sensitivity scenario
            </div>
            <SliderControl
              label="Prescribed Fouling ΔR_m"
              value={cfg.deltaRmOhmCm2}
              unit="Ω·cm²"
              min={0}
              max={10}
              step={0.2}
              decimals={1}
              onChange={(v) => setCfg({ ...cfg, deltaRmOhmCm2: v })}
            />
            <p className="text-[11px] text-slate-500">
              Parametric resistance increment only; no uncalibrated crystal-growth thickness kinetics are assumed.
            </p>
          </div>

          <div className="p-4">
            <button
              type="button"
              disabled={running}
              onClick={() => {
                if (loadedNpz) onClearLoadedNpz();
                runLive();
              }}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {running
                ? cfg.solverMode === 'multicomponent'
                  ? 'Solving 8-Ion Nernst–Planck...'
                  : 'Solving 2D Fields...'
                : 'Run 2D Simulation'}
            </button>
          </div>
        </aside>

        {/* Right Visualization Stage */}
        <section className="flex-1 min-w-0 flex flex-col gap-5">
          {error && (
            <div className="border border-rose-500/40 bg-rose-950/30 text-rose-200 px-4 py-2.5 rounded text-xs">
              ✖ Solver error: {error}
            </div>
          )}

          {/* 2D Spatial Field Canvas */}
          <div className="border border-[#1C2536] bg-[#0E131D] rounded p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#080B11] border border-[#1C2536] rounded">
                {(
                  [
                    ['concentration', 'Concentration'],
                    ['velocity', 'Velocity u'],
                    ['potential', 'Potential φ'],
                    ['pressure', 'Pressure p'],
                    ['flux', 'Diffusive Flux'],
                  ] as Array<[FieldKey, string]>
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFieldKey(k)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      fieldKey === k
                        ? 'bg-[#131A27] text-cyan-300 border border-[#2C3A52]'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                {fieldKey === 'concentration' &&
                  ((npzMode && npzCanvasBundle && !npzCanvasBundle.isWallOnly && npzCanvasBundle.isMc) ||
                    (!npzMode && isMcActive)) && (
                    <select
                      value={mcSpecies}
                      onChange={(e) => setMcSpecies(e.target.value)}
                      className="bg-[#080B11] border border-[#2C3A52] rounded px-2.5 py-1.5 text-xs font-mono text-cyan-300"
                    >
                      {SPECIES_LIST.map((sp) => (
                        <option key={sp} value={sp}>
                          Ion: {sp}
                        </option>
                      ))}
                    </select>
                  )}

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={animateIons}
                    onChange={(e) => setAnimateIons(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  Real-velocity ion tracers
                </label>
              </div>
            </div>

            {npzMode && npzCanvasBundle?.isWallOnly && activeArrays ? (
              <div className="space-y-4">
                <div className="text-xs text-slate-300">
                  Loaded <span className="font-mono text-cyan-300">{loadedNpz.caseId}</span> from <span className="font-mono">data/scaling_risk/</span> (1D CEM wall thermodynamic profile archive).
                </div>
                <ProfileChart
                  title="CEM Wall Saturation Index: Pitzer (USGS pitzer.dat) vs Davies Breakdown"
                  xLabel="Streamwise Position x (cm)"
                  yLabel="Saturation Index SI"
                  xValues={((activeArrays.x_interface?.data ?? []) as number[]).map(
                    (x) => x * 100
                  )}
                  referenceZeroLine
                  series={[
                    {
                      label: 'Pitzer SI (HMW)',
                      color: '#22D3EE',
                      values: (activeArrays.si_pitzer_profile?.data ?? []) as number[],
                    },
                    {
                      label: 'Davies SI (breaks down I > 0.5)',
                      color: '#F59E0B',
                      dashed: true,
                      values: (activeArrays.si_davies_profile?.data ?? []) as number[],
                    },
                  ]}
                />
              </div>
            ) : npzMode && npzCanvasBundle && !npzCanvasBundle.isWallOnly ? (
              <FieldCanvas
                xCoords={npzCanvasBundle.xCoords}
                channelHeightM={npzCanvasBundle.channelHeightM}
                concField={npzCanvasBundle.concGrid}
                dilField={npzCanvasBundle.dilGrid}
                fieldLabel={npzCanvasBundle.label}
                fieldUnit={npzCanvasBundle.unit}
                colormap={npzCanvasBundle.cmap}
                animateParticles={animateIons}
                siProfile={npzCanvasBundle.siCalProfile}
                uConc={npzCanvasBundle.uConc}
                uDil={npzCanvasBundle.uDil}
              />
            ) : liveCanvasBundle ? (
              <FieldCanvas
                xCoords={liveCanvasBundle.r.geomConc.x}
                channelHeightM={liveCanvasBundle.r.config.channelHeight}
                concField={liveCanvasBundle.concGrid}
                dilField={liveCanvasBundle.dilGrid}
                fieldLabel={liveCanvasBundle.label}
                fieldUnit={liveCanvasBundle.unit}
                colormap={liveCanvasBundle.cmap}
                animateParticles={animateIons}
                siProfile={liveCanvasBundle.r.geochemistry.siCalciteCemProfile}
                uConc={liveCanvasBundle.r.flowConc.u}
                uDil={liveCanvasBundle.r.flowDil.u}
                jCem={liveCanvasBundle.r.jCem}
                alphaCemProfile={liveCanvasBundle.r.cemAlphaConc}
                bcMode={liveCanvasBundle.r.config.bcMode}
                selectedXIndex={selectedXIndex}
                onSelectXIndex={(ix) => {
                  setSelectedXIndex(ix);
                  setChartTab('slice_y');
                }}
              />
            ) : (
              <div className="h-[368px] flex items-center justify-center text-xs text-slate-500">
                Running 2D solver...
              </div>
            )}
          </div>

          {/* Unified Telemetry Bar */}
          {r && !npzMode && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 border border-[#1C2536] bg-[#0E131D] rounded divide-y md:divide-y-0 md:divide-x divide-[#1C2536]">
              <MetricBox
                label="Cell-Pair OCV"
                value={(r.electrical.eOcvV * 1000).toFixed(2)}
                unit="mV"
                sub={
                  binCmp
                    ? `Binary eq: ${(binCmp.electrical.eOcvV * 1000).toFixed(2)} mV`
                    : v1
                      ? `v1.0: ${(v1.electrical.eOcvV * 1000).toFixed(2)} mV`
                      : `α_CEM ${r.electrical.alphaCem.toFixed(3)}`
                }
              />
              <MetricBox
                label="Internal R"
                value={(r.electrical.rInternalOhmM2 * 1e4).toFixed(3)}
                unit="Ω·cm²"
                sub={`Mem ${((r.electrical.rCemOhmM2 + r.electrical.rAemOhmM2) * 1e4).toFixed(2)}`}
              />
              <MetricBox
                label="Peak P_gross"
                value={r.electrical.pGrossMaxWM2.toFixed(3)}
                unit="W/m²"
                sub={
                  binCmp
                    ? `vs Binary: ${(((r.electrical.pGrossMaxWM2 - binCmp.electrical.pGrossMaxWM2) / Math.max(binCmp.electrical.pGrossMaxWM2, 1e-9)) * 100).toFixed(1)}%`
                    : `P_net ${r.electrical.pNetMaxWM2.toFixed(3)} W/m²`
                }
              />
              <MetricBox
                label={isMcActive ? 'Max Species MB' : 'Mass Err (Dil)'}
                value={(Math.max(r.massBalanceDil.relativeError, r.massBalanceConc.relativeError) * 100).toFixed(4)}
                unit="%"
                sub={
                  isMcActive
                    ? `EN err ${(Math.max(r.multicomponent!.maxElectroneutralityErrConc, r.multicomponent!.maxElectroneutralityErrDil)).toExponential(1)}`
                    : v1
                      ? `v1.0: ${(v1.massBalanceDil.relativeError * 100).toFixed(3)}%`
                      : r.massBalanceDil.pass
                        ? '● Pass (<1%)'
                        : '▲ Above 1%'
                }
                tone={r.massBalanceDil.pass ? 'cyan' : 'amber'}
              />
              <MetricBox
                label="Calcite SI (Wall)"
                value={
                  (r.geochemistry.siCalciteOutlet >= 0 ? '+' : '') +
                  r.geochemistry.siCalciteOutlet.toFixed(3)
                }
                unit="Pitzer"
                sub={`Gypsum ${r.geochemistry.siGypsumOutlet.toFixed(3)}`}
                tone={r.geochemistry.siCalciteOutlet > 0 ? 'amber' : 'cyan'}
              />
              <MetricBox
                label="CNT ΔG*_het"
                value={
                  Number.isFinite(r.geochemistry.cntCalcite.barrier_het_kBT)
                    ? r.geochemistry.cntCalcite.barrier_het_kBT.toFixed(1)
                    : '∞'
                }
                unit="k_B T"
                sub={r.geochemistry.cntCalcite.condition_category.split(':')[0]}
                tone={
                  r.geochemistry.cntCalcite.condition_category.startsWith('Category C')
                    ? 'amber'
                    : 'default'
                }
              />
            </div>
          )}

          {/* 8-Ion Multicomponent Species Breakdown Strip */}
          {r && !npzMode && isMcActive && r.multicomponent && (
            <div className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden">
              <div className="px-4 py-2 bg-[#131A27] border-b border-[#1C2536] flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">
                  8-Ion Transport Conservation &amp; CEM Membrane Flux Summary
                </span>
                <span className="font-mono text-slate-400">
                  Anderson-accelerated coupled FVM
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                  <thead className="border-b border-[#1C2536] text-slate-400 bg-[#080B11]/60">
                    <tr>
                      <th className="py-2 px-3">Ion</th>
                      {SPECIES_LIST.map((sp) => (
                        <th
                          key={sp}
                          className={`py-2 px-3 text-right cursor-pointer hover:text-cyan-300 ${
                            mcSpecies === sp ? 'text-cyan-300' : ''
                          }`}
                          onClick={() => setMcSpecies(sp)}
                        >
                          {sp}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1C2536]/60">
                    <tr>
                      <td className="py-1.5 px-3 font-sans text-slate-400">
                        Conc. Inlet (mol/m³)
                      </td>
                      {SPECIES_LIST.map((sp) => (
                        <td key={sp} className="py-1.5 px-3 text-right text-slate-200">
                          {r.multicomponent!.concInlet[sp].toFixed(2)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 font-sans text-slate-400">
                        Mean J_CEM (mmol/m²·s)
                      </td>
                      {SPECIES_LIST.map((sp) => {
                        const arr = r.multicomponent!.jCemSpecies[sp] ?? [];
                        const avg =
                          arr.length > 0
                            ? (arr.reduce((s, v) => s + v, 0) / arr.length) * 1000
                            : 0;
                        return (
                          <td
                            key={sp}
                            className={`py-1.5 px-3 text-right ${
                              avg > 0 ? 'text-cyan-300' : 'text-slate-500'
                            }`}
                          >
                            {avg.toFixed(4)}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 font-sans text-slate-400">
                        Conc. Mass Err (%)
                      </td>
                      {SPECIES_LIST.map((sp) => (
                        <td key={sp} className="py-1.5 px-3 text-right text-emerald-400">
                          {(r.multicomponent!.massBalanceConcSpecies[sp] * 100).toFixed(3)}%
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Archive Metadata Summary when inspecting NPZ */}
          {npzMode && loadedNpz.metadata && (
            <div className="border border-[#1C2536] bg-[#0E131D] rounded p-4">
              <h4 className="text-xs font-semibold text-slate-200 mb-2">
                On-Disk Case Metadata ({loadedNpz.caseId})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                {Object.entries(loadedNpz.metadata)
                  .filter(([, v]) => v !== '' && v !== undefined)
                  .slice(0, 16)
                  .map(([k, v]) => (
                    <div
                      key={k}
                      className="border border-[#1C2536] bg-[#080B11] rounded px-2.5 py-1.5"
                    >
                      <div className="text-[10px] text-slate-500 truncate">{k}</div>
                      <div className="text-slate-200 truncate">{String(v)}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Bottom Spatial & Boundary-Layer Diagnostics */}
          {r && !npzMode && (
            <div className="border border-[#1C2536] bg-[#0E131D] rounded p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-[#080B11] border border-[#1C2536] rounded">
                  {(
                    [
                      ['wall', 'CEM Wall Concentration'],
                      ['slice_y', 'Transverse Boundary Layer c(y)'],
                      ['si', 'Pitzer vs Davies SI Profile'],
                      ['polarization', 'V-I & P-I Curves'],
                      ['convergence', 'Coupling Convergence'],
                    ] as Array<[ChartTab, string]>
                  ).map(([id, lbl]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setChartTab(id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                        chartTab === id
                          ? 'bg-[#131A27] text-cyan-300 border border-[#2C3A52]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                {chartTab === 'slice_y' && (
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                    <span>Slice x:</span>
                    <input
                      type="range"
                      min={0}
                      max={r.geomConc.nx - 1}
                      value={selectedXIndex}
                      onChange={(e) => setSelectedXIndex(Number(e.target.value))}
                      className="w-28 h-1.5 bg-slate-800 rounded accent-cyan-400"
                    />
                    <span>{(r.geomConc.x[selectedXIndex] * 100).toFixed(1)} cm</span>
                  </div>
                )}
              </div>

              {chartTab === 'wall' && (
                <ProfileChart
                  title={
                    isMcActive
                      ? `Concentrated CEM Wall ${mcSpecies} Concentration c(x, y=H)`
                      : 'Concentrated Channel CEM Wall Concentration c(x, y=H) — v2.0.0 vs v1.0.0'
                  }
                  xLabel="Streamwise Position x (cm)"
                  yLabel="c_conc at CEM (mol/m³)"
                  xValues={r.geomConc.x.map((x) => x * 100)}
                  series={[
                    {
                      label: isMcActive
                        ? `8-Ion Nernst–Planck (${mcSpecies})`
                        : r.config.bcMode === 'v2_repaired'
                          ? 'Repaired v2.0.0 (-J physical depletion)'
                          : 'Active Run (v1.0.0 +J)',
                      color: '#22D3EE',
                      values: (
                        isMcActive
                          ? (r.multicomponent!.cConcSpecies[mcSpecies] ?? r.cConc)
                          : r.cConc
                      ).map((col) => col[0]),
                    },
                    ...(v1
                      ? [
                          {
                            label: 'Legacy v1.0.0 (+J nonphysical enrichment)',
                            color: '#F59E0B',
                            dashed: true,
                            values: v1.cConc.map((col) => col[0]),
                          },
                        ]
                      : []),
                  ]}
                />
              )}

              {chartTab === 'slice_y' && sliceProfile && (
                <ProfileChart
                  title={`Transverse Boundary-Layer Profile at x = ${sliceProfile.xCm.toFixed(2)} cm (Dilute 0–${(r.config.channelHeight * 1e6).toFixed(0)} μm · CEM · Conc ${(r.config.channelHeight * 1e6).toFixed(0)}–${(2 * r.config.channelHeight * 1e6).toFixed(0)} μm)`}
                  xLabel="Transverse Coordinate y (μm)"
                  yLabel={sliceProfile.label}
                  xValues={sliceProfile.yAll}
                  series={[
                    {
                      label: `${sliceProfile.label} across cell pair`,
                      color: '#22D3EE',
                      values: sliceProfile.cAll,
                    },
                  ]}
                />
              )}

              {chartTab === 'si' && (
                <ProfileChart
                  title="Thermodynamic Calcite & Gypsum Saturation Index Along CEM Interface"
                  xLabel="Streamwise Position x (cm)"
                  yLabel="Saturation Index SI"
                  xValues={r.geomConc.x.map((x) => x * 100)}
                  referenceZeroLine
                  series={[
                    {
                      label: 'Calcite SI (Pitzer HMW)',
                      color: '#22D3EE',
                      values: r.geochemistry.siCalciteCemProfile,
                    },
                    {
                      label: 'Gypsum SI (Pitzer HMW)',
                      color: '#34D399',
                      values: r.geochemistry.siGypsumCemProfile,
                    },
                    {
                      label: 'Calcite SI (Davies — diverges I > 0.5)',
                      color: '#F59E0B',
                      dashed: true,
                      values: r.geochemistry.daviesSiCalciteProfile,
                    },
                  ]}
                />
              )}

              {chartTab === 'polarization' && (
                <ProfileChart
                  title="Cell-Pair Polarization Curve (V vs I) & Power Density (P vs I)"
                  xLabel="Current Density I (A/m²)"
                  yLabel="Power Density (W/m²) / Voltage (×100 mV)"
                  xValues={r.electrical.polarizationCurve.map((p) => p.i)}
                  series={[
                    {
                      label: 'Gross Power Density P (W/m²)',
                      color: '#22D3EE',
                      values: r.electrical.polarizationCurve.map((p) => p.p),
                    },
                    {
                      label: 'Cell Voltage V (×100 mV scale)',
                      color: '#F59E0B',
                      dashed: true,
                      values: r.electrical.polarizationCurve.map((p) => p.v * 10),
                    },
                  ]}
                />
              )}

              {chartTab === 'convergence' && (
                <ProfileChart
                  title="Channel–Membrane Coupling Residual (log₁₀ Error)"
                  xLabel="Coupling Iteration"
                  yLabel="log₁₀(Max Relative Residual)"
                  xValues={r.convergenceHistory.map((h) => h.iter)}
                  series={[
                    {
                      label: 'log₁₀(err_max)',
                      color: '#22D3EE',
                      values: r.convergenceHistory.map((h) =>
                        Math.log10(Math.max(h.errMax, 1e-12))
                      ),
                    },
                    {
                      label: 'log₁₀(err_dil)',
                      color: '#F59E0B',
                      dashed: true,
                      values: r.convergenceHistory.map((h) =>
                        Math.log10(Math.max(h.errDil, 1e-12))
                      ),
                    },
                  ]}
                />
              )}
            </div>
          )}
        </section>
      </div>
        </>
      )}
    </div>
  );
};

const SliderControl: React.FC<{
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  onChange: (val: number) => void;
}> = ({ label, value, unit, min, max, step, decimals = 0, onChange }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono tabular-nums text-slate-100">
        {value.toFixed(decimals)} {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-400"
    />
  </div>
);

const MetricBox: React.FC<{
  label: string;
  value: string;
  unit: string;
  sub: string;
  tone?: 'default' | 'cyan' | 'amber';
}> = ({ label, value, unit, sub, tone = 'default' }) => (
  <div className="px-3.5 py-2.5">
    <div className="text-[11px] font-medium text-slate-400 truncate">{label}</div>
    <div className="mt-1 flex items-baseline gap-1.5 font-mono tabular-nums">
      <span
        className={`text-lg font-semibold ${
          tone === 'amber'
            ? 'text-amber-400'
            : tone === 'cyan'
              ? 'text-cyan-300'
              : 'text-slate-100'
        }`}
      >
        {value}
      </span>
      <span className="text-[11px] text-slate-500">{unit}</span>
    </div>
    <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 truncate">
      {sub}
    </div>
  </div>
);
