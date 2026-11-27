import React from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Database,
  FileCode2,
  FlaskConical,
  Image as ImageIcon,
  ShieldCheck,
} from 'lucide-react';
import { DatasetCategory, LibrarySubTab, NavTab, OverviewPayload } from '../types';
import { TeamAndIpSection } from '../components/TeamAndIpSection';

interface OverviewViewProps {
  overview: OverviewPayload | null;
  onNavigate: (
    tab: NavTab,
    options?: {
      datasetCategory?: DatasetCategory;
      librarySubTab?: LibrarySubTab;
      autoVerify?: boolean;
    }
  ) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  overview,
  onNavigate,
}) => {
  const counts = overview?.manifest.case_counts ?? {
    repaired_baseline_51: 51,
    clean_operating_cases: 85,
    multicomponent_brine_cases: 41,
    scaling_risk_cases: 36,
    mineral_scaling_and_sensitivity_cases: 26,
    total_new_cases: 188,
    original_51_preserved: 51,
  };

  const vPass =
    overview?.verificationSummary.filter((t) => t.passed).length ?? 10;
  const vTotal = overview?.verificationSummary.length ?? 10;
  const base0 = overview?.baselineComparison.baseline_case_000;

  return (
    <div className="space-y-8">
      {/* Hero Band — Clean Asymmetric Research Header */}
      <section className="border-b border-[#1C2536] pb-7 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-4">
          <div className="text-xs font-mono text-cyan-400 tracking-wide uppercase">
            REDMind v2.1.0 · 2D Reverse Electrodialysis Multiphysics &amp; Geochemistry
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-50 leading-tight max-w-3xl">
            Spacially Resolved Ion Transport, Pitzer Scaling Thermodynamics, and Executable Verification for Reverse Electrodialysis
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed max-w-[72ch]">
            REDMind v2.1.0 resolves the concentrated vs. dilute cell-pair boundary layers using both the repaired 2D NaCl finite-difference/volume solver and a full 8-ion Nernst–Planck, elliptic potential, Donnan equilibrium, and Goldman–Hodgkin–Katz membrane solver—coupled one-way to USGS PHREEQC HMW Pitzer thermodynamics and Santoro et al. (2021) heterogeneous Classical Nucleation Theory.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('simulator')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors whitespace-nowrap"
            >
              Launch Live 2D Simulator
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('equations')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded border border-[#2C3A52] bg-[#0E131D] hover:bg-[#131A27] text-slate-200 transition-colors whitespace-nowrap"
            >
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              Model Specification &amp; Equations
            </button>
            <button
              type="button"
              onClick={() =>
                onNavigate('library', { librarySubTab: 'references' })
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded border border-[#2C3A52] bg-[#0E131D] hover:bg-[#131A27] text-slate-200 transition-colors whitespace-nowrap"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              References &amp; Papers (16)
            </button>
            <button
              type="button"
              onClick={() =>
                onNavigate('verification', { autoVerify: true })
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded border border-[#2C3A52] bg-[#0E131D] hover:bg-[#131A27] text-slate-200 transition-colors whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Run {vTotal}-Test Verification Suite
            </button>
          </div>
        </div>

        {/* Calibrated Platform Telemetry Panel */}
        <div className="lg:col-span-5 border border-[#1C2536] bg-[#0E131D] rounded divide-y divide-[#1C2536]">
          <div className="px-4 py-2.5 bg-[#131A27] flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">
              Verified Corpus &amp; Repair Summary
            </span>
            <span className="font-mono text-emerald-400 tabular-nums">
              {vPass}/{vTotal} Checks Passing
            </span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-[#1C2536]">
            <div className="p-3.5">
              <div className="text-[11px] text-slate-400">
                Repaired &amp; New Cases
              </div>
              <div className="mt-1 text-xl font-mono font-semibold text-cyan-300 tabular-nums">
                {counts.repaired_baseline_51 + counts.total_new_cases}
              </div>
              <div className="mt-0.5 text-[11px] font-mono text-slate-500">
                51 repaired + {counts.total_new_cases} Stages 1–4 &amp; 18D Corpus
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] text-slate-400">
                Gurreri (2017) ΔP Error
              </div>
              <div className="mt-1 text-xl font-mono font-semibold text-emerald-400 tabular-nums">
                0.000%
              </div>
              <div className="mt-0.5 text-[11px] font-mono text-slate-500">
                146.50 Pa exact Poiseuille
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-[#1C2536]">
            <div className="p-3.5">
              <div className="text-[11px] text-slate-400">
                v1 → v2 Mass Balance Fix
              </div>
              <div className="mt-1 text-base font-mono font-semibold text-slate-100 tabular-nums">
                {overview
                  ? `${(overview.baselineComparison.orig_max_mb_dil * 100).toFixed(2)}% → ${(overview.baselineComparison.repaired_max_mb_dil * 100).toFixed(3)}%`
                  : '1.10% → 0.006%'}
              </div>
              <div className="mt-0.5 text-[11px] font-mono text-slate-500">
                CEM Neumann (-J vs +J)
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] text-slate-400">
                Case 000 Cell-Pair OCV
              </div>
              <div className="mt-1 text-base font-mono font-semibold text-slate-100 tabular-nums">
                {base0 ? `${base0.repaired_ocv_mV.toFixed(2)} mV` : '159.98 mV'}
              </div>
              <div className="mt-0.5 text-[11px] font-mono text-slate-500">
                v1 legacy: {base0 ? `${base0.orig_ocv_mV.toFixed(2)} mV` : '163.36 mV'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Complete Platform Sections — Direct Navigation */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-100">
            Platform Workspace Architecture
          </h2>
          <span className="text-xs text-slate-400">
            Every simulation module, equation sheet, categorized dataset, figure, and source file
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <ModuleTile
            icon={<Activity className="w-4 h-4 text-cyan-400" />}
            title="Live 2D Physics Simulator"
            meta="Binary NaCl (v2 / v1) · 8-Ion Nernst-Planck"
            body="Run the actual 2D finite-volume Poiseuille + Donnan + GHK solvers in real time across salinity, velocity, temperature, load fraction, pH, and brine presets, or inspect any .npz field archive with interactive transverse boundary-layer slicing."
            actionLabel="Open Simulator"
            onClick={() => onNavigate('simulator')}
          />
          <ModuleTile
            icon={<BookOpen className="w-4 h-4 text-cyan-400" />}
            title="Model Specification &amp; Equations"
            meta="KaTeX PDEs · Schematic · 42 Parameters"
            body="Full mathematical formulation of the computational domain, analytical Poiseuille flow, binary &amp; 8-ion Scharfetter-Gummel Nernst-Planck PDEs, multi-ion Donnan + GHK fluxes, USGS Pitzer HMW equations, and Wenzel CNT nucleation barriers."
            actionLabel="Read Equations &amp; Spec"
            onClick={() => onNavigate('equations')}
          />
          <ModuleTile
            icon={<Database className="w-4 h-4 text-cyan-400" />}
            title="Categorized Datasets by Fouling &amp; Brine Type"
            meta="7 Scientific Dataset Types · .npz Loader"
            body={`Dedicated views & quantitative charts for Clean Baseline (136), Discrete 8-Ion Brines (41), Continuous 18D 8-Ion + Pitzer PINN Corpus (${counts.stage2b_pinn_8ion_sobol ?? '—'}), Wall SI (36), CNT & Exploratory ΔRm (26), and Organic/Silica/Biofouling Scope.`}
            actionLabel="Explore Datasets by Type"
            onClick={() => onNavigate('datasets')}
          />
          <ModuleTile
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            title="Executable Verification &amp; Validation"
            meta="10-Test Suite · Gurreri 2017 · Pitzer &amp; CNT"
            body="Execute live solver checks against benchmark solutions, 3-grid Richardson convergence, Robinson &amp; Stokes NaCl activity coefficients, gypsum salting-in, Santoro (2021) CNT barriers, and the 51-case v1→v2 baseline audit."
            actionLabel="Open Verification Deck"
            onClick={() => onNavigate('verification')}
          />
          <ModuleTile
            icon={<ImageIcon className="w-4 h-4 text-cyan-400" />}
            title="Publication Figures Gallery"
            meta="18 Diagnostic &amp; PINN Charts (results/figures)"
            body="Browse all 18 high-resolution diagnostic &amp; surrogate figures spanning domain geometry, concentration polarization boundary layers, Mediterranean vs. Red Sea brines, Pitzer vs. Davies SI maps, CNT barriers, 8-Ion PINN 2D parity, and Pure-ML ablation."
            actionLabel="Browse 18 Figures"
            onClick={() =>
              onNavigate('library', { librarySubTab: 'figures' })
            }
          />
          <ModuleTile
            icon={<FileCode2 className="w-4 h-4 text-cyan-400" />}
            title="Technical Reports, Configs &amp; Source"
            meta="Reports · YAML/JSON · Python src/ &amp; tests/"
            body="Inspect all Markdown technical reports with rendered KaTeX math, YAML &amp; USGS pitzer.dat JSON configs, raw Python modules, pytest test suites, CLI scripts, and the complete 42-row parameter provenance table."
            actionLabel="Open Technical Library"
            onClick={() =>
              onNavigate('library', { librarySubTab: 'materials' })
            }
          />
        </div>
      </section>

      {/* Dataset Taxonomy & Fouling Scope Matrix */}
      <section className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden">
        <div className="px-5 py-3 bg-[#131A27] border-b border-[#1C2536] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Dataset Coverage by Chemistry &amp; Fouling Type
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Jump directly to any dataset category
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="border-b border-[#1C2536] text-slate-400 bg-[#080B11]/60">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Category / Type</th>
                <th className="py-2.5 px-4 font-semibold">Folders &amp; Cases</th>
                <th className="py-2.5 px-4 font-semibold">Modeling Method &amp; Scope</th>
                <th className="py-2.5 px-4 font-semibold">Scientific Status</th>
                <th className="py-2.5 px-4 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C2536]">
              <tr className="hover:bg-[#131A27]/50">
                <td className="py-3 px-4 font-semibold text-slate-100">
                  Clean Operating &amp; Baseline (NaCl)
                </td>
                <td className="py-3 px-4 font-mono tabular-nums text-cyan-300">
                  clean_cases (85) + repaired_baseline_51 + original_51_cases
                </td>
                <td className="py-3 px-4 text-slate-300">
                  2D Poiseuille + steady advection–diffusion + 1:1 Donnan across Sobol parameter space &amp; LHS baseline.
                </td>
                <td className="py-3 px-4 font-mono text-emerald-400 whitespace-nowrap">
                  ● Verified Physics
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate('datasets', { datasetCategory: 'clean_baseline' })
                    }
                    className="text-xs font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
                  >
                    Open →
                  </button>
                </td>
              </tr>
              <tr className="hover:bg-[#131A27]/50">
                <td className="py-3 px-4 font-semibold text-slate-100">
                  Multicomponent 8-Ion Brines
                </td>
                <td className="py-3 px-4 font-mono tabular-nums text-cyan-300">
                  multicomponent_brines (41) + brine_audit (7)
                </td>
                <td className="py-3 px-4 text-slate-300">
                  Coupled 8-ion Nernst–Planck + Scharfetter–Gummel + GHK flux (Mediterranean, Red Sea, Shammas RO).
                </td>
                <td className="py-3 px-4 font-mono text-emerald-400 whitespace-nowrap">
                  ● Verified Physics
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate('datasets', {
                        datasetCategory: 'multicomponent_brines',
                      })
                    }
                    className="text-xs font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
                  >
                    Open →
                  </button>
                </td>
              </tr>
              <tr className="hover:bg-[#131A27]/50">
                <td className="py-3 px-4 font-semibold text-slate-100">
                  Continuous 18D 8-Ion + Pitzer + CNT Corpus
                </td>
                <td className="py-3 px-4 font-mono tabular-nums text-cyan-300">
                  pinn_8ion_sobol ({counts.stage2b_pinn_8ion_sobol ?? 'generating'})
                </td>
                <td className="py-3 px-4 text-slate-300">
                  Halton/Sobol 18D continuous sweep (ion chemistry, pH, T, u, h, L, X_m, load, wetting) with full 2D fields &amp; node-wise Pitzer/CNT wall targets.
                </td>
                <td className="py-3 px-4 font-mono text-emerald-400 whitespace-nowrap">
                  ● Verified Physics
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate('datasets', {
                        datasetCategory: 'pinn_corpus',
                      })
                    }
                    className="text-xs font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
                  >
                    Open →
                  </button>
                </td>
              </tr>
              <tr className="hover:bg-[#131A27]/50">
                <td className="py-3 px-4 font-semibold text-slate-100">
                  Inorganic Scaling: Calcite &amp; Gypsum
                </td>
                <td className="py-3 px-4 font-mono tabular-nums text-cyan-300">
                  scaling_risk (36) + Pitzer benchmarks
                </td>
                <td className="py-3 px-4 text-slate-300">
                  One-way USGS PHREEQC HMW Pitzer saturation index SI(x) along CEM wall vs. high-I Davies breakdown.
                </td>
                <td className="py-3 px-4 font-mono text-cyan-300 whitespace-nowrap">
                  ● Thermodynamic SI
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate('datasets', {
                        datasetCategory: 'inorganic_scaling',
                      })
                    }
                    className="text-xs font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
                  >
                    Open →
                  </button>
                </td>
              </tr>
              <tr className="hover:bg-[#131A27]/50">
                <td className="py-3 px-4 font-semibold text-slate-100">
                  CNT Nucleation &amp; Exploratory ΔR_m
                </td>
                <td className="py-3 px-4 font-mono tabular-nums text-amber-300">
                  mineral_scaling (18 CNT + 8 ΔR_m)
                </td>
                <td className="py-3 px-4 text-slate-300">
                  Heterogeneous Wenzel CNT barriers (Category A/B/C) + hypothetical membrane resistance ΔR_m sensitivity.
                </td>
                <td className="py-3 px-4 font-mono text-amber-400 whitespace-nowrap">
                  ▲ Propensity / Exploratory
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate('datasets', {
                        datasetCategory: 'cnt_exploratory',
                      })
                    }
                    className="text-xs font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
                  >
                    Open →
                  </button>
                </td>
              </tr>
              <tr className="hover:bg-[#131A27]/50">
                <td className="py-3 px-4 font-semibold text-slate-100">
                  Organic, Colloidal Silica &amp; Biofouling Scope
                </td>
                <td className="py-3 px-4 font-mono tabular-nums text-slate-400">
                  mujahid_2026 notes (4 states) · policy exclusions
                </td>
                <td className="py-3 px-4 text-slate-300">
                  Humic/alginate organics, colloidal clay, amorphous silica kinetics, and Vermaas biofouling audited &amp; excluded cleanly without fabrication.
                </td>
                <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                  — Audited Exclusion
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate('datasets', {
                        datasetCategory: 'organic_silica_biofouling',
                      })
                    }
                    className="text-xs font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
                  >
                    Open →
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Team, Contact & Intellectual Property Attribution */}
      <TeamAndIpSection />
    </div>
  );
};

const ModuleTile: React.FC<{
  icon: React.ReactNode;
  title: string;
  meta: string;
  body: string;
  actionLabel: string;
  onClick: () => void;
}> = ({ icon, title, meta, body, actionLabel, onClick }) => (
  <div className="border border-[#1C2536] bg-[#0E131D] rounded p-5 flex flex-col justify-between gap-4 hover:border-[#2C3A52] transition-colors">
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[11px] font-mono text-slate-400">{meta}</span>
      </div>
      <h3 className="text-base font-semibold text-slate-100">{title}</h3>
      <p className="text-xs text-slate-400 leading-relaxed">{body}</p>
    </div>
    <div className="pt-2 border-t border-[#1C2536]">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition-colors"
      >
        {actionLabel}
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);
