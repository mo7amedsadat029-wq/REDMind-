import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  FlaskConical,
  HelpCircle,
  Layers,
  ShieldAlert,
  Sliders,
} from 'lucide-react';

interface FaqItem {
  id: string;
  question: string;
  tag: string;
  summaryMetric: string;
  answer: string[];
}

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Field RED Input Vector',
    subtitle: '18 Measured Operating & Ion Features',
    metric: '18D Input · StandardScaler',
    icon: Sliders,
    tone: 'text-slate-200 border-[#2C3A52]',
    details:
      'Collect 8 ion concentrations (Na+, K+, Mg2+, Ca2+, Cl-, SO4^2-, HCO3-, CO3^2-), dilute salinity, pH, temperature T, channel velocities (u_conc, u_dil), geometry (h, L), membrane fixed charge (X_cem, X_aem), and electrical load fraction. Inputs are normalized using the training-only scaler.',
    outputs: ['c_inlet[8]', 'params_norm[18]', 'c_scale[8]'],
  },
  {
    step: '02',
    title: 'Fourier-MLP PINN Pass',
    subtitle: '2D Concentration & Potential Surrogate',
    metric: '1.00 ms / channel · 0.75% HC L2',
    icon: Cpu,
    tone: 'text-cyan-300 border-cyan-500/40',
    details:
      'Evaluates all 50 × 20 normalized (x̃, ỹ) nodes in a single forward pass. Hard-encoded inlet Dirichlet BCs (x̃ = 0), Softplus positivity (c_k > 0), and Fourier spatial embeddings preserve steep concentration-polarization boundary layers without iterative PDE meshing.',
    outputs: ['c_k(x, y) [50×20×8]', '|Σ zc| = 0.33 mol/m³'],
  },
  {
    step: '03',
    title: 'USGS Pitzer HMW Solver',
    subtitle: 'CEM Wall Activity & Saturation Index',
    metric: '0.0021 Calcite · 0.0011 Gypsum MAE',
    icon: FlaskConical,
    tone: 'text-emerald-400 border-emerald-500/40',
    details:
      'Extracts the 50 streamwise nodes along the Cation-Exchange Membrane wall (ỹ = 0) and evaluates exact Harvie–Møller–Weare Pitzer activity coefficients γ_i(I, T). Remains thermodynamically accurate in hypersaline brines (I > 0.5 mol/kg) where the Davies equation diverges.',
    outputs: ['Ω_Calcite(x), Ω_Gypsum(x)', 'SI_max = log10(Ω_max)'],
  },
  {
    step: '04',
    title: 'Wenzel CNT Classifier',
    subtitle: 'Heterogeneous Scaling Risk Decision',
    metric: '42 / 42 Unseen Test (100.0%)',
    icon: ShieldAlert,
    tone: 'text-amber-300 border-amber-500/40',
    details:
      'Combines wall supersaturation Ω_max with membrane surface wetting angle θ and roughness factor r to compute the heterogeneous nucleation barrier ΔG*_het / (k_B T), issuing an actionable plant risk classification and mineral alert.',
    outputs: ['Category A: Clean', 'Category B: Metastable', 'Category C: Nucleation'],
  },
] as const;

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'low-case-count',
    question:
      'How can the PINN reach 100.0% Risk Category accuracy when trained on only 275 simulation cases?',
    tag: 'Spatial Node Multiplier',
    summaryMetric: '192 train cases -> 384,000 PDE nodes',
    answer: [
      'A traditional tabular ML model (Random Forest, XGBoost, or vanilla MLP) only sees 192 isolated summary rows in an 18-dimensional space, so it quickly overfits or interpolates poorly on unseen chemistries.',
      'By contrast, every single 2D simulation case contains 2 channels × 50 × 20 = 2,000 spatial field coordinates. Across the 192 training cases, the PINN trains on 384,000 labeled field nodes (550,000 total corpus nodes) plus 35% boundary-layer collocation bias near the CEM/AEM walls, constrained simultaneously by the Nernst–Planck PDE, electroneutrality, elliptic potential, and outlet Neumann residuals.',
    ],
  },
  {
    id: 'zero-error-myth',
    question:
      'Does 100.0% accuracy mean the PINN has zero prediction error?',
    tag: 'Continuous vs. Discrete Error',
    summaryMetric: 'HC Rel L2 = 0.75% · Calcite SI MAE = 0.0021',
    answer: [
      'No—and this distinction is essential for scientific rigor. On the 42 unseen test cases, the fine-tuned PINN has a non-zero continuous concentration Relative L2 error of 0.75% in the High-Concentration (HC) channel (2.87% overall test L2, 2.47% validation L2, 0.373 mV Φ MAE, 0.33 mol/m³ charge imbalance vs 4.82 mol/m³ for a Pure-Data NN).',
      'When passed through USGS Pitzer thermodynamics, that 0.75% concentration error translates to a Calcite SI_max MAE of just 0.0021 SI units and Gypsum SI_max MAE of 0.0011 SI units. Because the physical thresholds separating Category A (SI <= 0), Category B (metastable kinetic barrier), and Category C (nucleation-prone) span tenths of an SI unit, a 0.0021 SI margin is roughly 50×–100× tighter than the decision boundary—resulting in 42/42 exact category matches (vs. 76.2% for Tabular Random Forest).',
    ],
  },
  {
    id: 'data-leakage',
    question:
      'Could the 100% test score be caused by train/test data leakage or cherry-picking?',
    tag: 'Case-Level Split Audit',
    summaryMetric: 'Strict case_id split (192 / 41 / 42)',
    answer: [
      'No. Splitting randomly by (x, y) spatial points would leak neighboring nodes from the same simulation into the test set. REDMind strictly splits by case_id (seed 42): 192 training cases, 41 validation cases (used only for checkpoint selection), and 42 completely unseen test cases.',
      'Feature normalization (StandardScaler) is fit exclusively on the 192 training cases, and inlet concentration vectors are constructed strictly from the known operating inputs (PARAM_COLS) rather than ground-truth .npz arrays.',
    ],
  },
  {
    id: 'hybrid-physics',
    question:
      'Why does the hybrid PINN + Pitzer + CNT pipeline beat pure end-to-end ML on SI prediction?',
    tag: 'Physics-ML Decomposition',
    summaryMetric: '0.0021 SI MAE vs 0.0093 (NN) / 0.0984 (RF)',
    answer: [
      'Mineral Saturation Index depends nonlinearly on ionic strength (up to I > 6 mol/kg), specific ion-pair virial coefficients, carbonate speciation, temperature, and wall concentration polarization.',
      'A pure ML model has to rediscover all of thermodynamics and 2D transport from 192 rows. REDMind uses the PINN strictly where physics solvers are slow (resolving 2D ion transport and boundary-layer accumulation in 1.00 ms instead of iterative finite volumes), and delegates thermodynamics and nucleation to exact analytical USGS Pitzer HMW + Wenzel CNT equations.',
    ],
  },
  {
    id: 'plant-generalization',
    question:
      'What happens when testing real RED plant water that differs from the synthetic Sobol dataset?',
    tag: 'Field Deployment',
    summaryMetric: 'Cell 8 Plant Inference + 2D Solver Guardrail',
    answer: [
      'As long as the measured plant feed water lies within the physical bounds of the 18D Sobol domain (seawater, hypersaline RO brine, brackish/river water), Nernst–Planck conservation laws and Hard Inlet BCs enforce physically consistent concentration polarization.',
      'For extreme chemistries outside the trained parameter envelope, you can verify any PINN prediction directly against the live 2D Finite-Volume Multi-Physics Solver in the Simulator tab, or run Cell 8 (Real RED Plant Inference) in Library → PINN Resources.',
    ],
  },
];

export const AccuracyFaqAndWorkflow: React.FC = () => {
  const [openFaqId, setOpenFaqId] = useState<string>('low-case-count');

  return (
    <div className="space-y-5">
      {/* Section 1: End-to-End Prediction Workflow */}
      <section className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden">
        <div className="px-4 py-3 bg-[#131A27] border-b border-[#1C2536] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>End-to-End Field Prediction Workflow (Plant Data → Scaling Risk A / B / C)</span>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-cyan-300">
            Total Inference Latency: 1.00 ms / channel (~1,000× faster than 2D FVM)
          </span>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
            {WORKFLOW_STEPS.map((stage, idx) => {
              const Icon = stage.icon;
              return (
                <div
                  key={stage.step}
                  className="relative border border-[#1C2536] bg-[#080B11] rounded p-3.5 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-cyan-400 tabular-nums">
                        STAGE {stage.step}
                      </span>
                      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-100">
                        {stage.title}
                      </h4>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {stage.subtitle}
                      </div>
                    </div>
                    <div
                      className={`text-[11px] font-mono tabular-nums px-2 py-1 rounded border bg-[#0E131D] ${stage.tone}`}
                    >
                      {stage.metric}
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {stage.details}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#1C2536] space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      Stage Outputs
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {stage.outputs.map((out) => (
                        <span
                          key={out}
                          className="text-[10px] font-mono text-slate-200 bg-[#131A27] border border-[#2C3A52] rounded px-1.5 py-0.5"
                        >
                          {out}
                        </span>
                      ))}
                    </div>
                  </div>

                  {idx < WORKFLOW_STEPS.length - 1 && (
                    <ArrowRight
                      className="hidden xl:block w-4 h-4 text-cyan-500/60 absolute -right-3 top-1/2 -translate-y-1/2 z-10 bg-[#0E131D] rounded-sm"
                      aria-hidden="true"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 2: Scientific FAQ on 100% Accuracy */}
      <section className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden">
        <div className="px-4 py-3 bg-[#131A27] border-b border-[#1C2536] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
            <HelpCircle className="w-4 h-4 text-emerald-400" />
            <span>Scientific Audit FAQ: Why 100.0% Scaling Risk Accuracy on 275 Cases Is Physically Valid</span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            42 / 42 Unseen Test Cases · Zero Data Leakage
          </span>
        </div>

        <div className="divide-y divide-[#1C2536]">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openFaqId === item.id;
            return (
              <div key={item.id} className="bg-[#0E131D]">
                <button
                  type="button"
                  onClick={() => setOpenFaqId(isOpen ? '' : item.id)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-4 text-left hover:bg-[#131A27]/60 transition-colors"
                >
                  <div className="min-w-0 flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-xs text-cyan-400 tabular-nums shrink-0">
                      Q{idx + 1}.
                    </span>
                    <span className="text-xs font-semibold text-slate-100">
                      {item.question}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="hidden sm:inline-block font-mono text-[11px] tabular-nums text-slate-400 bg-[#080B11] border border-[#1C2536] rounded px-2 py-0.5">
                      {item.summaryMetric}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-1 bg-[#080B11]/60 border-t border-[#1C2536]/60 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-emerald-400">
                      <span>[{item.tag}]</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-cyan-300">{item.summaryMetric}</span>
                    </div>
                    {item.answer.map((para, pIdx) => (
                      <p
                        key={pIdx}
                        className="text-xs text-slate-300 leading-relaxed max-w-5xl"
                      >
                        {para}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
