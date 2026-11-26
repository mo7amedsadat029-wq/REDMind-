export type SlideStatus = 'keep' | 'replace' | 'add' | 'update' | 'patch_note';

export interface PresentationSlideMeta {
  newNumber: number;
  originalNumber: number | null;
  id: string;
  title: string;
  kicker: string;
  status: SlideStatus;
  statusLabel: string;
  summary: string;
  origImage?: string;
}

export const PRESENTATION_AUDIT_SLIDES: PresentationSlideMeta[] = [
  {
    newNumber: 1,
    originalNumber: 1,
    id: 'slide-1',
    title: 'REDMind — Title & Sponsor Lockup',
    kicker: 'TITLE',
    status: 'keep',
    statusLabel: 'Keep As-Is',
    summary: 'ExxonMobil / GESR / Misr El-Kheir title slide, team lockup, and coral reef hero visual.',
    origImage: 'orig_p01.png',
  },
  {
    newNumber: 2,
    originalNumber: 2,
    id: 'slide-2',
    title: 'THE PROBLEM — Brine & RO Energy Crisis',
    kicker: 'THE PROBLEM',
    status: 'keep',
    statusLabel: 'Keep (Fix 2 Typos in Canva)',
    summary:
      'Strong problem framing. Note for your Canva file: fix "552.5-6 kWh/m³%" -> "2.5–6 kWh/m³" and complete "communities that depend on [them]."',
    origImage: 'orig_p02.png',
  },
  {
    newNumber: 3,
    originalNumber: 3,
    id: 'slide-3',
    title: 'The Opportunity & CFD Bottleneck',
    kicker: 'OPPORTUNITY',
    status: 'keep',
    statusLabel: 'Keep As-Is',
    summary: 'Clearly explains RED/PRO opportunity, slow CFD bottleneck, and why a PINN solves it.',
    origImage: 'orig_p03.png',
  },
  {
    newNumber: 4,
    originalNumber: 4,
    id: 'slide-4',
    title: 'System Architecture & Control Loop',
    kicker: 'ARCHITECTURE',
    status: 'keep',
    statusLabel: 'Keep As-Is',
    summary: 'RED membrane stack schematic, PDE loss diagram, and Sense → Predict → Control loop.',
    origImage: 'orig_p04.png',
  },
  {
    newNumber: 5,
    originalNumber: 5,
    id: 'slide-5',
    title: 'Verified 2D 8-Ion Fourier-SiLU PINN Surrogate',
    kicker: '8-ION PINN SURROGATE',
    status: 'replace',
    statusLabel: 'Replaced Old Slide 5 (PoC)',
    summary:
      'Replaces the outdated 4.5–5.5% binary NaCl PoC with your fine-tuned 8-ion PINN (0.75% HC L2, 2.47% Val L2, 0.373 mV Φ MAE, 1.00 ms) and Fig. 16.',
  },
  {
    newNumber: 6,
    originalNumber: null,
    id: 'slide-6',
    title: 'End-to-End Scaling Risk & 100% Accuracy Proof',
    kicker: 'SCALING PREDICTION',
    status: 'add',
    statusLabel: 'New High-Impact Slide',
    summary:
      'Shows the 4-stage PINN → USGS Pitzer → Wenzel CNT pipeline, Fig. 17 parity (Calcite 0.0021 / Gypsum 0.0011 SI MAE), and why 42/42 (100%) on 275 cases is valid.',
  },
  {
    newNumber: 7,
    originalNumber: null,
    id: 'slide-7',
    title: 'Ablation Benchmark: PINN vs. Pure ML & Random Forest',
    kicker: 'MODEL BENCHMARK',
    status: 'add',
    statusLabel: 'New High-Impact Slide',
    summary:
      'Embeds Fig. 18 + controlled comparison on the exact same 192 train / 42 unseen test cases (0.75% vs 1.63% NN, 0.33 vs 4.82 EN, 100% vs 76.2% RF).',
  },
  {
    newNumber: 8,
    originalNumber: 6,
    id: 'slide-8',
    title: 'Simulation Graphs 1 — Multi-Physics Transport & Brines',
    kicker: 'SIMULATION GRAPHS',
    status: 'keep',
    statusLabel: 'Keep (Was Slide 6)',
    summary: 'Preserves 2D Salinity Boundary Polarization (Fig. 1) and Med vs. Red Sea 8-ion power penalty (Fig. 2).',
    origImage: 'orig_p06.png',
  },
  {
    newNumber: 9,
    originalNumber: 7,
    id: 'slide-9',
    title: 'Simulation Graphs 2 — Scaling Risk, Gypsum & Calcite',
    kicker: 'SIMULATION GRAPHS',
    status: 'patch_note',
    statusLabel: 'Keep + Footer Note Updated (Was Slide 7)',
    summary:
      'Preserves Pitzer vs. Davies breakdown & Calcite wall maps while updating the outdated footer note that claimed PINN retraining was still pending.',
    origImage: 'orig_p07.png',
  },
  {
    newNumber: 10,
    originalNumber: 8,
    id: 'slide-10',
    title: 'THE BUSINESS — Market & Scalability Model',
    kicker: 'THE BUSINESS',
    status: 'keep',
    statusLabel: 'Keep (Was Slide 8)',
    summary: 'Target market, B2B licensing model, cost structure, and 3-phase commercialization path.',
    origImage: 'orig_p08.png',
  },
  {
    newNumber: 11,
    originalNumber: 9,
    id: 'slide-11',
    title: 'FINANCIAL FEASIBILITY — Monthly Unit Economics',
    kicker: 'FINANCIAL FEASIBILITY',
    status: 'keep',
    statusLabel: 'Keep (Was Slide 9)',
    summary: '50K EGP/mo site pricing, 60% contribution margin, and 2-site break-even model.',
    origImage: 'orig_p09.png',
  },
  {
    newNumber: 12,
    originalNumber: 10,
    id: 'slide-12',
    title: 'Future Plan & Conclusion',
    kicker: 'ROADMAP & CONCLUSION',
    status: 'update',
    statusLabel: 'Updated Slide 10 (Fixed Typo & Metrics)',
    summary:
      'Fixes "Futuren Plan" typo, updates Step 1 ("Now") & Technical Conclusion from old 4.5–5.5% PoC to completed 8-ion PINN (0.75% HC L2, ~1,000× speedup, 100% Risk Acc).',
  },
  {
    newNumber: 13,
    originalNumber: 11,
    id: 'slide-13',
    title: '15. Research Sources (APA)',
    kicker: 'REFERENCES',
    status: 'keep',
    statusLabel: 'Keep (Was Slide 11)',
    summary: 'Full 10-reference APA bibliography covering Gurreri, Tedesco, Santoro, PHREEQC, and Sorour.',
    origImage: 'orig_p11.png',
  },
  {
    newNumber: 14,
    originalNumber: 12,
    id: 'slide-14',
    title: 'OUR TEAM — Meet NEURANUM Team',
    kicker: 'OUR TEAM',
    status: 'keep',
    statusLabel: 'Keep (Was Slide 12)',
    summary: 'Closing team slide featuring Seif Eldin Montaser & Mohamed Sadat.',
    origImage: 'orig_p12.png',
  },
];

export const NATIVE_SLIDES_CONTENT = {
  slide5: {
    kicker: '8-ION PINN SURROGATE',
    title: 'Verified 2D Multi-Ion PINN: 0.75% HC Error in 1.00 ms',
    banner:
      'Upgraded from the 4.5–5.5% binary NaCl PoC to a fine-tuned 8-ion Fourier-SiLU PINN on 275 Sobol cases (550,000 PDE nodes).',
    archCardTitle: 'Architecture & Physics Losses',
    archBullets: [
      'Fourier spatial features (σ=1.2, 16) + 4×128 SiLU + Hard-Inlet BC (x̃=0) + Softplus positivity (c_k > 0).',
      'Coupled Nernst–Planck, Electroneutrality, Potential & Neumann PDE losses + 35% CEM/AEM wall bias.',
    ],
    trainCardTitle: 'Curriculum + Cosine Fine-Tuning',
    trainBullets: [
      'Strict case_id split (192 train / 41 val / 42 unseen test) — zero spatial node leakage.',
      '5,000 curriculum epochs (Val L2: 20.04% → 2.75%) + 2,500 cosine FT epochs → Best Val L2 = 2.47%.',
    ],
    kpis: [
      { value: '0.75%', label: 'HC Channel Rel L2 (42 Test)' },
      { value: '2.87%', label: 'Overall Test Rel L2 Error' },
      { value: '0.373 mV', label: 'Liquid-Junction Φ MAE' },
      { value: '1.00 ms', label: 'Inference Time / Channel' },
    ],
    figHeader: 'Unseen Case pinn_8ion_158: 2D Solver vs. Fine-Tuned PINN',
    figFile: 'fig16_pinn_2d_comparison.png',
    figFooter:
      'PINN reproduces Ca²⁺, SO₄²⁻, Na⁺, and Φ fields accurately near the scaling-critical CEM wall (y/h = 0).',
  },

  slide6: {
    kicker: 'SCALING RISK WORKFLOW & PARITY',
    title: 'End-to-End Scaling Prediction: 100.0% Risk Accuracy (42/42)',
    banner:
      'Separating fast 2D transport (PINN) from exact geochemistry (USGS HMW Pitzer + Wenzel CNT) achieves 100% Risk A/B/C accuracy.',
    stages: [
      {
        num: '1. Feed Input',
        desc: '18D vector: 8 ions, pH, T, u, h, L, X_m, load (train scaler)',
      },
      {
        num: '2. Fourier PINN',
        desc: 'Predicts full 50×20 8-ion fields & Φ in 1.00 ms / channel',
      },
      {
        num: '3. USGS Pitzer HMW',
        desc: 'Exact CEM wall activity γ_i & SI (valid past I > 6 mol/kg)',
      },
      {
        num: '4. Wenzel CNT Risk',
        desc: 'Nucleation barrier ΔG*_het / k_BT → Category A / B / C',
      },
    ],
    figHeader: '42 Unseen Test Cases: Calcite & Gypsum Wall SI Parity',
    figFile: 'fig17_pinn_scaling_parity.png',
    figFooter:
      'Calcite SI_max MAE = 0.0021 SI   |   Gypsum SI_max MAE = 0.0011 SI   |   42 / 42 (100.0%) Exact Risk Match',
    proofTitle: 'Why 275 Cases Yield 100% Accuracy',
    proofPoints: [
      {
        head: '384,000 PDE Training Nodes:',
        body: 'Each 2D run provides 2,000 spatial points (192 × 2,000 = 384k nodes + PDE residuals), not 192 isolated summary rows.',
      },
      {
        head: '50× Margin Inside Decision Bands:',
        body: '0.75% concentration error causes only ±0.0021 SI shift — far tighter than the tenths of an SI separating Categories A, B & C.',
      },
      {
        head: 'Strict Zero-Leakage Audit:',
        body: 'Case-level 192/41/42 split; scaler & inlet BCs never touch test .npz arrays.',
      },
      {
        head: 'Real Plant Inference (Cell 8):',
        body: 'Calcite SI = +1.2015 (Ω = 15.90) → Category C: Nucleation-prone.',
      },
    ],
  },

  slide7: {
    kicker: 'SCIENTIFIC VALIDATION & ABLATION',
    title: 'Why Physics-Informed ML Beats Pure ML on Limited Data',
    banner:
      'Controlled ablation on the exact same 192 training & 42 unseen test cases — zero extra data provided to the PINN.',
    figHeader: 'Controlled Comparison: 8-Ion PINN vs. Pure-Data NN & Random Forest',
    figFile: 'fig18_pinn_vs_pure_ml.png',
    highlights: [
      {
        metric: '2.2× Lower Error',
        detail: '0.75% HC Rel L2 vs. 1.63% for Pure-Data NN without PDEs.',
      },
      {
        metric: '14.6× Cleaner Neutrality',
        detail: '0.33 mol/m³ charge imbalance vs. 4.82 mol/m³ for Pure-Data NN.',
      },
      {
        metric: '47× Tighter Calcite SI',
        detail: '0.0021 SI MAE vs. 0.0984 SI for Tabular Random Forest (76.2% acc).',
      },
    ],
    tableHeaders: [
      'Unseen Test Metric (42 Cases)',
      'NEURANUM 8-Ion PINN',
      'Pure-Data NN (No PDE)',
      'Tabular Random Forest',
      'Physics Advantage',
    ],
    tableRows: [
      [
        'HC Channel Rel L2 Error',
        '0.75%',
        '1.63%',
        'N/A (0D scalar only)',
        '2.2× lower + full 2D spatial fields',
      ],
      [
        'Charge Imbalance |Σ z_k c_k|',
        '0.33 mol/m³',
        '4.82 mol/m³',
        'N/A',
        '14.6× cleaner electroneutrality',
      ],
      [
        'Calcite Wall SI_max MAE',
        '0.0021 SI',
        '0.0093 SI',
        '0.0984 SI',
        '4.4× vs. Pure-NN · 47× vs. RF',
      ],
      [
        'Risk Category Acc. (A / B / C)',
        '100.0% (42/42)',
        '100.0% (42/42)',
        '76.2% (32/42)',
        '+23.8 pts higher than Random Forest',
      ],
    ],
  },

  slide12: {
    kicker: 'ROADMAP & IMPACT',
    title: 'Future Plan & Conclusion',
    roadmapTitle: 'Future Plan',
    roadmapSteps: [
      {
        num: '1',
        heading: 'Now (Completed & Validated)',
        bullets: [
          '8-Ion Fourier-SiLU PINN trained on 275 18D Sobol cases (0.75% HC L2, 2.47% Val L2, 0.373 mV Φ MAE).',
          'Coupled to USGS Pitzer + Wenzel CNT for 100.0% (42/42) scaling-risk accuracy in 1.00 ms; beat Pure-NN & RF.',
        ],
      },
      {
        num: '2',
        heading: 'Year 1–2',
        bullets: [
          'Scale architecture to full 3D multi-ion stack + progressive fouling resistance ΔR_m(t).',
          'Deploy a shadow-mode pilot on a live RED stack at an Egyptian coastal desalination plant.',
        ],
      },
      {
        num: '3',
        heading: 'Yr 3–5',
        bullets: ['Commercial B2B software licensing rollout: Egypt, then the Gulf.'],
      },
    ],
    phase1Title: 'Phase-1 target',
    phase1Plant: 'El Alamein desalination plant',
    phase1Detail:
      "150,000–300,000 m³/day, Mediterranean coast, now open to private O&M partners under Egypt's Mar-2026 policy.",
    phase1Alt: "Alternative Pilot Options: ACWA Power's upcoming PPP regional projects.",
    conclusionTitle: 'Conclusion',
    conclusionBullets: [
      {
        label: 'Environmental:',
        text: 'Turns desalination brine from a marine pollutant into clean blue energy while cutting discharge salinity stress on coral ecosystems.',
      },
      {
        label: 'Technical:',
        text: 'Validated 8-Ion PINN + USGS Pitzer replaces slow 2D PDE runs with 1.00 ms (~1,000× faster) inference at 0.75% HC L2, 0.33 mol/m³ charge neutrality, and 100% (42/42) unseen risk accuracy.',
      },
      {
        label: 'Economic:',
        text: 'A software-first layer requires zero new process hardware, scaling directly across existing RO desalination plants.',
      },
      {
        label: 'Human impact:',
        text: "Protecting coastal reefs preserves fishers' livelihoods and Egypt's tourism sector (2.42M jobs, ~$7B/yr).",
      },
      {
        label: 'Ethical impact:',
        text: 'Auditable real-time scaling & discharge metrics run on standard CPUs, making compliance accessible to regional operators.',
      },
      {
        label: "What's next:",
        text: 'Validated 2D 8-ion PINN → bench stack calibration → El-Alamein shadow-mode pilot → regional deployment.',
      },
    ],
  },
};
