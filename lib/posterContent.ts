export interface PosterCustomMeta {
  projectCode: string;
  teamMembers: string;
  schoolName: string;
}

export const DEFAULT_POSTER_META: PosterCustomMeta = {
  projectCode: 'ENG-RED-2027',
  teamMembers: 'NEURANUM Research Team',
  schoolName: 'STEM Engineering Research Lab',
};

export interface PosterFigureSpec {
  id: string;
  filename: string;
  title: string;
  axesAndUnits: string;
  caption: string;
}

export const POSTER_FIGURES: PosterFigureSpec[] = [
  {
    id: 'Fig. 1',
    filename: 'fig04_concentration_fields.png',
    title: 'Fig. 1 — 2D Salinity & CEM Boundary Polarization',
    axesAndUnits: 'x (m), y (μm), Concentration c (mol/m³)',
    caption:
      'Repaired v2.1.0 Neumann flux resolves HC wall depletion and LC enrichment across the membrane interface.',
  },
  {
    id: 'Fig. 2',
    filename: 'fig09_mediterranean_vs_red_sea_brines.png',
    title: 'Fig. 2 — 8-Ion RO Brine Power vs. Equivalent NaCl',
    axesAndUnits: 'Brine Profile, Gross & Net Power Density (W/m²)',
    caption:
      'Divalent competition (Ca²⁺, Mg²⁺, SO₄²⁻) reduces gross power in Mediterranean and Red Sea RO brines.',
  },
  {
    id: 'Fig. 3',
    filename: 'fig11_gypsum_scaling_risk_comparison.png',
    title: 'Fig. 3 — Gypsum SI: USGS Pitzer vs. Davies Breakdown',
    axesAndUnits: 'Ionic Strength I (mol/kg), Saturation Index SI (-)',
    caption:
      'Above I > 0.5 mol/kg, Davies over-predicts risk by >2.3 SI units, while HMW Pitzer captures salting-in.',
  },
  {
    id: 'Fig. 4',
    filename: 'fig10_calcite_scaling_risk_map.png',
    title: 'Fig. 4 — CEM Wall Calcite Saturation Index Map',
    axesAndUnits: 'Operating Regime / I (mol/kg), SI_calcite (-)',
    caption:
      'Thermodynamic CaCO₃ supersaturation zones (SI > 0) along the cation-exchange membrane interface.',
  },
  {
    id: 'Fig. 5',
    filename: 'fig16_pinn_2d_comparison.png',
    title: 'Fig. 5 — 8-Ion PINN vs. 2D Solver (Unseen Case)',
    axesAndUnits: 'Normalized x/L, y/h (0=CEM), Ion c [mol/m³], Φ [mV]',
    caption:
      'Fine-tuned PINN reproduces Ca²⁺, SO₄²⁻, Na⁺ & Φ on unseen pinn_8ion_158 (HC L2 = 0.75%, Val L2 = 2.47%).',
  },
  {
    id: 'Fig. 6',
    filename: 'fig17_pinn_scaling_parity.png',
    title: 'Fig. 6 — PINN + Pitzer Scaling Parity (100% Risk Acc.)',
    axesAndUnits: '2D Solver True SI vs. PINN + Pitzer Predicted SI (-)',
    caption:
      '42 unseen test cases: Calcite MAE = 0.0021 SI, Gypsum MAE = 0.0011 SI, 42/42 (100%) Risk A/B/C accuracy.',
  },
];

export const POSTER_DATA = {
  title:
    'NEURANUM: Physics-Based 2D Simulation and Real-Time PINN Prediction of Membrane Scaling Risk in Desalination Brine Reverse Electrodialysis',
  subtitle:
    'Multi-Physics 8-Ion Transport, USGS Pitzer Geochemistry, and 1.00 ms Fourier-SiLU PINN Surrogate Control',

  abstract:
    'Reverse osmosis (RO) desalination consumes intensive energy while discharging hypersaline brine, wasting chemical mixing energy. Reverse Electrodialysis (RED) recovers electrical power across ion-exchange membranes, yet divalent cations (Ca²⁺, Mg²⁺) and polarization trigger inorganic mineral scaling (CaCO₃, CaSO₄·2H₂O). NEURANUM v2.1.0 is a verified 2D finite-volume RED simulator combining Poiseuille flow, Donnan partitioning, and 8-ion Nernst–Planck–GHK transport coupled to USGS HMW Pitzer thermodynamics and Santoro (2021) Classical Nucleation Theory (10/10 verification pass, 0.13% Gurreri OCV). Using 275 Sobol-sampled 18D 8-ion cases (550,000 physics nodes), a fine-tuned hard-inlet Fourier-SiLU PINN predicts 2D HC fields to 0.75% Rel L2 error (2.87% overall, 0.373 mV Φ MAE, 0.33 mol/m³ charge imbalance) in 1.00 ms/channel—achieving 100.0% (42/42) Category A/B/C scaling-risk accuracy vs. 76.2% for Random Forest.',

  generalProblem:
    'Desalination plants require high electrical power and discharge concentrated RO brine (57–80 g/L TDS), wasting extractable salinity-gradient mixing energy and elevating local marine salinity.',

  specializedProblem:
    'In RED brine recovery, Ca²⁺, Mg²⁺, SO₄²⁻, and carbonate polarization trigger mineral scaling on CEM walls, degrading power output—while full 2D PDE+Pitzer solvers are too slow for real-time stack control.',

  sorourBrineTable: {
    caption: 'Published Egyptian RO Brines (Sorour et al., 2015)',
    headers: ['Constituent', 'Med. Brine B1', 'Red Sea B2'],
    rows: [
      ['TDS', '62.64 g/L', '73.87 g/L'],
      ['Na⁺ / Cl⁻', '19.0 / 35.0 g/L', '24.0 / 40.0 g/L'],
      ['Mg²⁺ / Ca²⁺', '1.92 / 0.80 g/L', '2.60 / 0.69 g/L'],
    ],
  },

  backgroundTable: {
    headers: ['Study', 'Contribution', 'Role in NEURANUM'],
    rows: [
      ['Gurreri (2017)', '2D multiphysics RED cell CFD', 'Baseline PDEs & OCV benchmark'],
      ['Tedesco (2016)', 'Co-ion leakage & fixed charge', 'Donnan & divalent retardation'],
      ['Long (2018)', '1D stack pump-loss model', 'R_int, P_pump vs P_net optimization'],
      ['Faghihi (2022)', '2D CFD + ANN optimization', 'Benchmark prior AI in binary RED'],
      ['Santoro (2021)', 'Calcite CNT nucleation in RED', 'Wenzel barrier ΔG*_het / k_B T'],
      ['PHREEQC (2013)', 'USGS Pitzer virial database', 'High-I SI_calcite & SI_gypsum'],
    ],
  },

  researchGap:
    'Prior AI-RED studies (Faghihi & Jalali, 2022) used binary NaCl only. No open 2D dataset couples 8-ion Nernst–Planck transport with high-I USGS Pitzer scaling to train and benchmark real-time PINNs.',

  researchQuestion:
    'Can a Physics-Informed Neural Network (PINN) predict 2D 8-ion polarization and mineral scaling risk in brine RED at millisecond latency for real-time control?',

  hypothesis:
    'A hard-inlet Fourier-SiLU PINN constrained by Nernst–Planck, electroneutrality, and potential-closure PDEs on 18D Sobol cases can predict 2D transport and Pitzer/CNT scaling risk with >98% accuracy.',

  materialsTools: [
    ['Python / NumPy / SciPy', '2D FVM PDEs, SuperLU & USGS Pitzer engine'],
    ['PyTorch (Tesla T4 GPU)', 'Fourier-SiLU PINN (5000 ep + 2500 FT, 2.47% val)'],
    ['Sobol / Pandas / Sklearn', '18D Sobol DOE (275 cases), case-level split'],
    ['Matplotlib / pytest / Web', '300-DPI figures, 10-test suite & live 2D app'],
  ],

  variablesTable: {
    headers: ['Type', 'Parameters (case_metadata.csv Schema)'],
    rows: [
      [
        'Independent (18D)',
        '8 inlet ions (Na, K, Mg, Ca, Cl, SO4, HCO3, CO3), c_dil, pH, T, u_conc, u_dil, h, L, X_cem, X_aem, load_fraction',
      ],
      [
        'Dependent',
        'u(y), c_k(x,y) [8 ions], Φ(x,y), OCV, R_int, P_net, Δp, SI_Calcite, SI_Gypsum, Risk A/B/C',
      ],
      [
        'Controlled',
        'δ_m = 125 μm, σ_m = 1.0 S/m, η_pump = 0.75, laminar Poiseuille flow, v_y = 0',
      ],
    ],
  },

  procedureSteps: [
    '1. Brine Audit: Extract governing equations, 42 constants, and 6 Egyptian RO brines.',
    '2. 2D Solver & Fix: Build Poiseuille + Scharfetter–Gummel NP + Donnan–GHK solver; fix CEM sign.',
    '3. Geochemistry: Couple CEM wall fields to USGS HMW Pitzer SI and Santoro (2021) CNT.',
    '4. 18D Sobol Corpus: Solve 275 converged 8-ion cases (550k spatial nodes) + 188 multi-stage runs.',
    '5. Fourier-SiLU PINN: Train on 192 cases with hard inlet BC, 35% wall bias & NP/EN PDE losses.',
    '6. Test Audit: Benchmark 42 unseen cases (0.75% HC L2, 2.87% overall L2, 0.373 mV Φ MAE, 1.00 ms).',
    '7. Ablation & Parity: Beat Pure-Data NN (0.0093 SI) & RF (76.2%) with 100% A/B/C accuracy.',
    '8. Verification: Pass 10/10 physics tests, Gurreri (0.13% OCV) & 3-grid Richardson GCI.',
  ],

  verifiedDataTable: {
    headers: ['Verification / Benchmark', 'Reference Target', 'NEURANUM v2.1.0', 'Status'],
    rows: [
      ['Gurreri (2017) Baseline OCV', '155.00 mV', '155.21 mV', '+0.13% · PASS'],
      ['Channel Pressure Drop Δp', '146.50 Pa', '146.502 Pa', '+0.001% · PASS'],
      ['Dilute Mass Balance (v1→v2)', '3.40% (v1)', '0.10% (v2)', '33× Better · PASS'],
      ['3-Grid OCV Mesh Convergence', '< 2.0% target', '0.003%', '10/10 Suite · PASS'],
      ['8-Ion PINN vs Pure-Data NN', '1.63% HC / 4.82 EN', '0.75% HC / 0.33 mol/m³', '14.6× EN · PASS'],
      ['PINN + Pitzer vs Tabular RF', 'RF: 0.0984 / 76.2%', 'SI MAE 0.0021 / 0.0011', '100% (42/42) · PASS'],
    ],
  },

  dataAnalysisPoints: [
    '• Flow–Power Trade-Off: Higher flow reduces polarization resistance, while quadratic pumping loss (P_pump ∝ ū²) creates a narrow net-power optimum.',
    '• 8-Ion Brine Penalty: Divalent Ca²⁺/Mg²⁺ Donnan competition and lower membrane mobility cut gross power vs. equivalent-salinity NaCl feeds.',
    '• Pitzer vs. Davies: High-TDS RO brines (I = 0.77–1.66 mol/kg) exceed the I = 0.5 Davies limit; only Pitzer captures gypsum salting-in.',
    '• Physics-Informed Gains: Hard-inlet encoding, PDE losses & fine-tuning cut HC error to 0.75% (vs 1.63% Pure-Data NN) and Calcite MAE to 0.0021 (47× below RF).',
  ],

  resultsSummary: [
    '10/10 Solver Verification & 275-Case 18D Corpus: Mass conservation (<0.1%), machine-precision electroneutrality (~10⁻¹⁶), and real Mediterranean/Red Sea CEM calcite risk (SI = +0.67 to +1.03) verified.',
    'Fine-Tuned 8-Ion PINN vs. Pure ML: On 42 unseen tests, PINN cuts HC Rel L2 to 0.75% (2.47% val), charge imbalance to 0.33 mol/m³ (vs 4.82 Pure-NN), Calcite/Gypsum SI MAE to 0.0021/0.0011, and scores 100.0% Risk A/B/C (vs 76.2% RF).',
  ],

  pinnSummaryTable: {
    headers: ['8-Ion PINN Test Metric', 'Measured Value', 'Engineering / Ablation Comparison'],
    rows: [
      ['HC Channel Rel L2 (42 Test)', '0.75% (2.47% val)', '2.2× lower than Pure-Data NN (1.63%)'],
      ['Charge Imbalance |Σ zc|', '0.33 mol/m³', '14.6× cleaner than Pure-Data NN (4.82)'],
      ['Calcite / Gypsum SI MAE', '0.0021 / 0.0011', '4.4× below NN (0.0093) · 47× below RF (0.0984)'],
      ['Risk Category (A/B/C) Acc.', '100.0% (42/42)', 'Beats Tabular RF (76.2%) in 1.00 ms'],
    ],
    note: 'Valid across the 18D Sobol domain (L = 6–15 cm, T = 15–40 °C, pH = 6.2–8.8). Trained 5,000 curriculum + 2,500 fine-tuning epochs on Tesla T4.',
  },

  conclusions: [
    'NEURANUM v2.1.0 unifies a verified 2D 8-ion RED solver, USGS Pitzer geochemistry, and Santoro CNT nucleation into a 275-case 18D Sobol benchmark resolving membrane polarization and high-I scaling.',
    'Hypothesis Confirmed: Fine-tuned hard-inlet Fourier-SiLU PINN achieves 0.75% HC error, 0.33 mol/m³ charge neutrality, and 100.0% (42/42) Category A/B/C risk accuracy—outperforming Pure-Data NN and Random Forest.',
  ],

  applications: [
    'Real-time (<1 ms) scaling-risk screening of Mediterranean & Red Sea RO brine RED stacks from feed chemistry sensors.',
    'Selecting scaling-safe pH, flow velocity, and load windows before Calcite/Gypsum nucleation damages CEMs.',
  ],

  futureWork: [
    '1. Expand 8-ion PINN validation against pilot-scale RED brine stacks & live plant sensor streams.',
    '2. Couple time-dependent crystal growth kinetics & progressive ΔR_m resistance feedback.',
    '3. Extend surrogate transfer learning to monovalent-selective CEM & organic/silica fouling.',
  ],

  apaReferences: [
    'Abdel-Aal, E. A., et al. (2021). Brine characterization from Mediterranean & brackish RO plants. Membranes, 11(3), 212.',
    'Faghihi, P., & Jalali, A. (2022). ANN optimization of RED cells using CFD and genetic algorithm. Int. J. Energy Res., 46(15), 21217–21233.',
    'Gurreri, L., et al. (2017). Multi-physical modelling of reverse electrodialysis. Desalination, 423, 52–64.',
    'Harvie, C. E., Møller, N., & Weare, J. H. (1984). Mineral solubilities to high ionic strengths. Geochim. Cosmochim. Acta, 48(4), 723–751.',
    'Long, R., et al. (2018). Performance analysis of RED stacks: Geometry and flow optimization. Energy, 158, 427–436.',
    'Parkhurst, D. L., & Appelo, C. A. J. (2013). PHREEQC version 3 (pitzer.dat). USGS Techniques and Methods 6-A43.',
    'Santoro, S., et al. (2021). Fouling propensity in RED operated with hypersaline brine. Energy, 228, 120563.',
    'Sorour, M. H., et al. (2015). Salt recovery from seawater and RO brines. Desalin. Water Treat., 55(9), 2398–2407.',
    'Tedesco, M., Hamelers, H. V. M., & Biesheuvel, P. M. (2016). Nernst–Planck transport theory for RED. J. Membr. Sci., 510, 370–381.',
    'Vermaas, D. A., et al. (2013). Fouling in reverse electrodialysis under natural conditions. Water Research, 47(3), 1289–1298.',
  ],
};
