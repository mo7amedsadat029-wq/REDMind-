export type NavTab =
  | 'overview'
  | 'simulator'
  | 'equations'
  | 'datasets'
  | 'all_datasets'
  | 'verification'
  | 'library';

export type DatasetCategory =
  | 'clean_baseline'
  | 'multicomponent_brines'
  | 'pinn_corpus'
  | 'inorganic_scaling'
  | 'cnt_exploratory'
  | 'organic_silica_biofouling'
  | 'failures_benchmarks';

export interface DatasetCatalogItem {
  id: string;
  title: string;
  relPath: string;
  group: 'pinn_8ion' | 'binary_nacl' | 'thermo_bench' | 'legacy_audit';
  physicsModel: string;
  gridOrDim: string;
  statusLabel: string;
  statusTone: 'verified' | 'thermo' | 'exploratory' | 'legacy';
  pinnTrainingIncluded: boolean;
  explorerCategory: DatasetCategory;
  notes: string;
  totalBytes: number;
  fileCount: number;
  npzCount: number;
  csvRows: number;
}

export interface DatasetCatalogPayload {
  generatedAt: string;
  totalBytes: number;
  pinnBytes: number;
  pinnCases: number;
  verifiedCases: number;
  folderCount: number;
  items: DatasetCatalogItem[];
}

export type LibrarySubTab = 'figures' | 'references' | 'materials' | 'pinn';

export interface BrineProfile {
  title: string;
  source_citation: string;
  region: string;
  stream_type: string;
  pH: number | null;
  temperature_C: number;
  tds_reported_mg_L: number;
  completeness: string;
  missing_species: string[];
  notes?: string;
  concentrations_mg_L: Record<string, number | null>;
}

export interface SimulationConfigPayload {
  solverMode?: 'binary' | 'multicomponent';
  channelHeight: number;
  channelLength: number;
  membraneThicknessCem: number;
  membraneThicknessAem: number;
  nx: number;
  ny: number;
  uMeanConc: number;
  uMeanDil: number;
  cConcInlet: number;
  cDilInlet: number;
  T: number;
  xCem: number;
  xAem: number;
  sigmaCem: number;
  sigmaAem: number;
  loadFraction: number;
  bcMode: 'v2_repaired' | 'v1_buggy_cem';
  deltaRmOhmCm2: number;
  pH: number;
  caInletMolM3: number;
  mgInletMolM3: number;
  kInletMolM3: number;
  so4InletMolM3: number;
  hco3InletMolM3: number;
  co3InletMolM3: number;
  contactAngleCemDeg: number;
  roughnessFactorCem: number;
  caseId: string;
  compareWithV1?: boolean;
  compareWithBinary?: boolean;
}

export interface SimulationResultPayload {
  solverMode?: 'binary' | 'multicomponent';
  config: SimulationConfigPayload;
  geomConc: { height: number; length: number; nx: number; ny: number; x: number[]; y: number[] };
  geomDil: { height: number; length: number; nx: number; ny: number; x: number[]; y: number[] };
  flowConc: { u: number[][]; v: number[][]; p: number[][]; Re: number; deltaP: number };
  flowDil: { u: number[][]; v: number[][]; p: number[][]; Re: number; deltaP: number };
  cConc: number[][];
  cDil: number[][];
  phiConc: number[][];
  phiDil: number[][];
  jxConc: number[][];
  jyConc: number[][];
  jxDil: number[][];
  jyDil: number[][];
  jCem: number[];
  jAem: number[];
  cemEMembrane: number[];
  aemEMembrane: number[];
  eCellPair: number[];
  cemAlphaConc: number[];
  cemAlphaDil: number[];
  electrical: {
    eOcvV: number;
    rInternalOhmM2: number;
    rConcOhmM2: number;
    rDilOhmM2: number;
    rCemOhmM2: number;
    rAemOhmM2: number;
    rDeltaRmOhmM2: number;
    iMaxPowerAM2: number;
    vMaxPowerV: number;
    pGrossMaxWM2: number;
    pPumpTotalWM2: number;
    pNetMaxWM2: number;
    alphaCem: number;
    alphaAem: number;
    polarizationCurve: Array<{ i: number; v: number; p: number }>;
  };
  massBalanceConc: { relativeError: number; pass: boolean };
  massBalanceDil: { relativeError: number; pass: boolean };
  convergenceHistory: Array<{
    iter: number;
    errConc: number;
    errDil: number;
    errMax: number;
    jCemAvg: number;
    jAemAvg: number;
  }>;
  couplingIterations: number;
  converged: boolean;
  wallTimeMs: number;
  geochemistry: {
    siCalciteCemProfile: number[];
    siGypsumCemProfile: number[];
    omegaCalciteCemProfile?: number[];
    omegaGypsumCemProfile?: number[];
    ionicStrengthCemProfile?: number[];
    siCalciteAemProfile?: number[];
    siGypsumAemProfile?: number[];
    daviesSiCalciteProfile: number[];
    daviesSiGypsumProfile: number[];
    omegaCalciteOutlet: number;
    siCalciteOutlet: number;
    omegaGypsumOutlet: number;
    siGypsumOutlet: number;
    siCalciteCemMax?: number;
    siGypsumCemMax?: number;
    omegaCalciteCemMax?: number;
    omegaGypsumCemMax?: number;
    waterActivityOutlet?: number;
    gammaCaOutlet?: number;
    gammaCo3Outlet?: number;
    gammaSo4Outlet?: number;
    ionicStrengthMolal: number;
    daviesValidityFlag: string;
    cntCalcite: {
      barrier_het_kBT: number;
      critical_radius_nm: number;
      wetting_factor_f: number;
      boltzmann_propensity: number;
      condition_category: string;
    };
    cntGypsum: {
      barrier_het_kBT: number;
      critical_radius_nm: number;
      wetting_factor_f: number;
      boltzmann_propensity: number;
      condition_category: string;
    };
  };
  multicomponent?: {
    speciesOrder: string[];
    concInlet: Record<string, number>;
    dilInlet: Record<string, number>;
    cConcSpecies: Record<string, number[][]>;
    cDilSpecies: Record<string, number[][]>;
    jCemSpecies: Record<string, number[]>;
    jAemSpecies: Record<string, number[]>;
    massBalanceConcSpecies: Record<string, number>;
    massBalanceDilSpecies: Record<string, number>;
    maxElectroneutralityErrConc: number;
    maxElectroneutralityErrDil: number;
    iOpAM2: number;
    vCellV: number;
    pGrossLoadedWM2: number;
  };
}

export interface LoadedNpzCase {
  folder: string;
  caseId: string;
  filename: string;
  keys: string[];
  arrays: Record<string, { shape: number[]; data: number[] | number[][] }>;
  metadata?: Record<string, string>;
}

export interface CommandRunResult {
  commandId: string;
  title: string;
  passed: boolean;
  totalDurationMs: number;
  executedAt: string;
  stdout: string[];
  items: Array<{
    id: string;
    name: string;
    passed: boolean;
    durationMs: number;
    summary: string;
    details: Record<string, unknown>;
  }>;
}

export interface OverviewPayload {
  manifest: {
    dataset_title: string;
    version: string;
    case_counts: Record<string, number>;
    wall_time_total_s: number;
  };
  verificationSummary: Array<{
    test_id: number;
    name: string;
    passed: boolean;
    summary: string;
  }>;
  validationSummary: {
    gurreri_validation: Array<{
      parameter: string;
      published: number;
      simulated: number;
      unit: string;
      rel_error: number;
      passed: boolean;
    }>;
    long_comparison: {
      ocv_spatial_V: number;
      ocv_lumped_V: number;
      r_spatial_Ohm_m2: number;
      r_lumped_Ohm_m2: number;
      notes: string;
    };
  };
  baselineComparison: {
    n_compared: number;
    max_abs_diff_ocv_mV: number;
    mean_abs_diff_ocv_mV: number;
    max_abs_diff_P_gross_W_m2: number;
    orig_max_mb_dil: number;
    repaired_max_mb_dil: number;
    baseline_case_000: {
      orig_ocv_mV: number;
      repaired_ocv_mV: number;
      orig_P_gross_W_m2: number;
      repaired_P_gross_W_m2: number;
    };
  };
  brineProfiles: Record<string, BrineProfile>;
  molecularWeights: Record<string, number>;
  brineAudit: Array<Record<string, string>>;
  failureLog: Array<Record<string, string>>;
}
