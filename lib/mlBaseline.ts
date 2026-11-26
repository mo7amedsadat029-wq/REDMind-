import fs from 'fs';
import path from 'path';

export type BaselineModelType =
  | 'random_forest'
  | 'xgboost'
  | 'data_only_mlp'
  | 'uploaded';

export interface MlCompareRequest {
  modelType: Exclude<BaselineModelType, 'uploaded'>;
  trainCasesCount?: number; // 48..192
  nEstimators?: number; // 20..200 trees
  maxDepth?: number; // 3..10
  learningRate?: number; // 0.03..0.3
  epochs?: number; // 100..600 for MLP
}

export interface TrainingCurvePoint {
  step: number;
  label: string;
  trainMetric: number;
  valMetric: number;
}

export interface TestCasePrediction {
  caseId: string;
  trueCalciteSi: number;
  predCalciteSi: number;
  trueGypsumSi: number;
  predGypsumSi: number;
  trueCategory: string;
  predCategory: string;
}

export interface ComparisonResultPayload {
  modelType: BaselineModelType;
  modelName: string;
  sourceKind: 'trained_live' | 'uploaded_file';
  datasetInfo: {
    totalVerifiedCases: number;
    trainCasesUsed: number;
    valCasesCount: number;
    testCasesCount: number;
    featureCount: number;
  };
  hyperparameters: Record<string, string | number>;
  trainingDurationMs: number;
  pinnReference: {
    modelName: string;
    architecture: string;
    trainCases: number;
    spatialNodesTotal: number;
    hcRelL2Pct: number;
    overallRelL2Pct: number;
    phiMaeMv: number;
    calciteSiMae: number;
    gypsumSiMae: number;
    riskAccuracyPct: number;
    riskCorrectCount: number;
    riskTotalCount: number;
    inferenceMsPerChannel: number;
    trainingCurve: TrainingCurvePoint[];
  };
  baselineMetrics: {
    calciteSiMae: number;
    gypsumSiMae: number;
    calciteR2: number;
    gypsumR2: number;
    riskAccuracyPct: number;
    riskCorrectCount: number;
    riskTotalCount: number;
    supports2dFields: boolean;
    physicsResidualsEnforced: boolean;
    trainingCurve: TrainingCurvePoint[];
    sampleEfficiencyCurve: Array<{
      trainCases: number;
      baselineCalciteMae: number;
      baselineRiskAccPct: number;
      pinnCalciteMae: number;
      pinnRiskAccPct: number;
    }>;
    confusionMatrix: {
      labels: ['Category A', 'Category B', 'Category C'];
      counts: number[][];
    };
    testPredictions: TestCasePrediction[];
  };
}

interface ParsedRow {
  case_id: string;
  features: number[];
  si_calcite_cem_max: number;
  si_gypsum_cem_max: number;
  temperature_K: number;
  contact_angle_cem_deg: number;
  roughness_factor_cem: number;
  dominant_scaling_category: string;
}

const FEATURE_COLS = [
  'conc_Na_mol_m3',
  'conc_K_mol_m3',
  'conc_Mg_mol_m3',
  'conc_Ca_mol_m3',
  'conc_Cl_mol_m3',
  'conc_SO4_mol_m3',
  'conc_HCO3_mol_m3',
  'conc_CO3_mol_m3',
  'c_dil_inlet_mol_m3',
  'pH',
  'temperature_K',
  'u_mean_conc_m_s',
  'u_mean_dil_m_s',
  'channel_height_um',
  'channel_length_cm',
  'X_cem_mol_m3',
  'X_aem_mol_m3',
  'load_fraction',
  'contact_angle_cem_deg',
  'roughness_factor_cem',
] as const;

const ROOT = process.cwd();

// Logged 275-case 8-Ion Fourier-SiLU PINN training + fine-tuning trajectory (Colab T4 GPU run)
const PINN_TRAINING_CURVE: TrainingCurvePoint[] = [
  { step: 1, label: 'Epoch 1', trainMetric: 21.37, valMetric: 20.04 },
  { step: 250, label: 'Epoch 250', trainMetric: 10.95, valMetric: 10.07 },
  { step: 500, label: 'Epoch 500', trainMetric: 8.27, valMetric: 6.07 },
  { step: 1000, label: 'Epoch 1000', trainMetric: 2.21, valMetric: 5.32 },
  { step: 1500, label: 'Epoch 1500', trainMetric: 2.66, valMetric: 4.25 },
  { step: 2000, label: 'Epoch 2000', trainMetric: 2.47, valMetric: 3.93 },
  { step: 2500, label: 'Epoch 2500', trainMetric: 0.66, valMetric: 3.40 },
  { step: 3000, label: 'Epoch 3000', trainMetric: 0.76, valMetric: 3.17 },
  { step: 3500, label: 'Epoch 3500', trainMetric: 1.17, valMetric: 2.91 },
  { step: 4000, label: 'Epoch 4000', trainMetric: 0.82, valMetric: 2.83 },
  { step: 4500, label: 'Epoch 4500', trainMetric: 0.90, valMetric: 2.78 },
  { step: 5000, label: 'Epoch 5000', trainMetric: 0.63, valMetric: 2.75 },
  { step: 5250, label: 'FT +250', trainMetric: 0.77, valMetric: 2.70 },
  { step: 5500, label: 'FT +500', trainMetric: 0.62, valMetric: 2.67 },
  { step: 6000, label: 'FT +1000', trainMetric: 0.47, valMetric: 2.58 },
  { step: 6500, label: 'FT +1500', trainMetric: 0.47, valMetric: 2.54 },
  { step: 7000, label: 'FT +2000', trainMetric: 0.38, valMetric: 2.47 },
  { step: 7500, label: 'FT +2500', trainMetric: 0.60, valMetric: 2.49 },
];

const PINN_REF = {
  modelName: '8-Ion Fourier-SiLU Hard-Inlet PINN',
  architecture: 'Fourier(σ=1.2, 16) + 4×128 SiLU + Hard Inlet BC (5000 ep + 2500 FT)',
  trainCases: 192,
  spatialNodesTotal: 550000,
  hcRelL2Pct: 0.75,
  overallRelL2Pct: 2.87,
  phiMaeMv: 0.373,
  calciteSiMae: 0.0021,
  gypsumSiMae: 0.0011,
  riskAccuracyPct: 100.0,
  riskCorrectCount: 42,
  riskTotalCount: 42,
  inferenceMsPerChannel: 1.00,
  trainingCurve: PINN_TRAINING_CURVE,
};

function createRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function loadVerified8IonSplit(): {
  all: ParsedRow[];
  train: ParsedRow[];
  val: ParsedRow[];
  test: ParsedRow[];
} {
  const csvPath = path.resolve(ROOT, 'data/pinn_8ion_sobol/case_metadata.csv');
  const raw = fs.readFileSync(csvPath, 'utf-8').trim().split(/\r?\n/);
  const headers = raw[0].split(',');
  const idxMap = new Map<string, number>();
  headers.forEach((h, i) => idxMap.set(h, i));

  const parsed: ParsedRow[] = [];
  for (let r = 1; r < raw.length; r++) {
    const parts = raw[r].split(',');
    if (parts.length < headers.length) continue;
    const conv = (parts[idxMap.get('converged')!] ?? '').toLowerCase() === 'true';
    const mbC = parseFloat(parts[idxMap.get('mass_balance_rel_err_conc')!] ?? '1');
    const mbD = parseFloat(parts[idxMap.get('mass_balance_rel_err_dil')!] ?? '1');
    if (!conv || !(mbC < 0.02) || !(mbD < 0.02)) continue;

    const cid = parts[idxMap.get('case_id')!];

    const features = FEATURE_COLS.map((c) =>
      parseFloat(parts[idxMap.get(c)!] ?? '0')
    );
    if (features.some((v) => !Number.isFinite(v))) continue;

    parsed.push({
      case_id: cid,
      features,
      si_calcite_cem_max: parseFloat(parts[idxMap.get('si_calcite_cem_max')!] ?? '0'),
      si_gypsum_cem_max: parseFloat(parts[idxMap.get('si_gypsum_cem_max')!] ?? '0'),
      temperature_K: parseFloat(parts[idxMap.get('temperature_K')!] ?? '298.15'),
      contact_angle_cem_deg: parseFloat(
        parts[idxMap.get('contact_angle_cem_deg')!] ?? '55'
      ),
      roughness_factor_cem: parseFloat(
        parts[idxMap.get('roughness_factor_cem')!] ?? '1.15'
      ),
      dominant_scaling_category:
        parts[idxMap.get('dominant_scaling_category')!] ?? 'Category A: Clean membrane',
    });
  }

  // Deterministic 70% / 15% / 15% split -> 192 train, 41 val, 42 test for 275 rows
  const rng = createRng(42);
  const shuffled = [...parsed];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const nTrain = Math.round(shuffled.length * 0.698); // 192 of 275
  const nVal = Math.round((shuffled.length - nTrain) * 0.494); // 41 of 83 -> 42 test
  return {
    all: parsed,
    train: shuffled.slice(0, nTrain),
    val: shuffled.slice(nTrain, nTrain + nVal),
    test: shuffled.slice(nTrain + nVal),
  };
}

function classifyCntFromSi(
  siCal: number,
  siGyp: number,
  tempK: number,
  thetaDeg: number,
  rough: number
): string {
  const cosEff = Math.max(
    -0.9999,
    Math.min(0.9999, rough * Math.cos((thetaDeg * Math.PI) / 180))
  );
  const fWet = 0.25 * (2.0 + cosEff) * (1.0 - cosEff) ** 2;

  const rankOne = (si: number, vm: number, gam: number) => {
    const om = Math.pow(10, si);
    if (om <= 1.0) return si < -0.1 ? 1 : 2;
    const kbT = 1.380649e-23 * tempK;
    const dmu = kbT * Math.log(om);
    const vol = vm / 6.02214076e23;
    const bar = (fWet * (16 * Math.PI * gam ** 3 * vol ** 2)) / (3 * dmu ** 2 * kbT);
    return bar <= 40.0 ? 3 : 2;
  };

  const r = Math.max(
    rankOne(siCal, 36.9e-6, 0.094),
    rankOne(siGyp, 73.9e-6, 0.037)
  );
  if (r === 1) return 'Category A: Clean membrane';
  if (r === 2) return 'Category B: Scaling-risk condition';
  return 'Category C: Nucleation-prone condition';
}

function shortCategory(cat: string): 'Category A' | 'Category B' | 'Category C' {
  const norm = cat.trim().toLowerCase();
  if (norm.startsWith('category a') || norm === 'a' || norm.includes('clean')) {
    return 'Category A';
  }
  if (norm.startsWith('category b') || norm === 'b' || norm.includes('scaling-risk')) {
    return 'Category B';
  }
  return 'Category C';
}

function buildConfusionMatrix(preds: TestCasePrediction[]) {
  const labels: ['Category A', 'Category B', 'Category C'] = [
    'Category A',
    'Category B',
    'Category C',
  ];
  const counts = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const mapIdx = (s: string) =>
    shortCategory(s) === 'Category A'
      ? 0
      : shortCategory(s) === 'Category B'
        ? 1
        : 2;

  for (const p of preds) {
    counts[mapIdx(p.trueCategory)][mapIdx(p.predCategory)]++;
  }
  return { labels, counts };
}

function computeR2(yTrue: number[], yPred: number[]): number {
  if (yTrue.length === 0) return 0;
  const mean = yTrue.reduce((a, b) => a + b, 0) / yTrue.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < yTrue.length; i++) {
    ssRes += (yTrue[i] - yPred[i]) ** 2;
    ssTot += (yTrue[i] - mean) ** 2;
  }
  return ssTot > 1e-12 ? 1 - ssRes / ssTot : 0;
}

function computeMae(yTrue: number[], yPred: number[]): number {
  if (yTrue.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < yTrue.length; i++) s += Math.abs(yTrue[i] - yPred[i]);
  return s / yTrue.length;
}

/* ---------------- Pure TypeScript Regression Tree (CART) ---------------- */
interface TreeNode {
  leafValue?: number;
  featureIdx?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

function fitRegressionTree(
  X: number[][],
  y: number[],
  indices: number[],
  depth: number,
  maxDepth: number,
  minSamplesLeaf: number,
  maxFeatures: number,
  l2Reg: number,
  rng: () => number
): TreeNode {
  const n = indices.length;
  const sumY = indices.reduce((s, idx) => s + y[idx], 0);
  const leafMean = sumY / (n + l2Reg);

  if (depth >= maxDepth || n < minSamplesLeaf * 2) {
    return { leafValue: leafMean };
  }

  // Variance check
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const idx of indices) {
    if (y[idx] < yMin) yMin = y[idx];
    if (y[idx] > yMax) yMax = y[idx];
  }
  if (yMax - yMin < 1e-9) {
    return { leafValue: leafMean };
  }

  const d = X[0].length;
  const featPool = Array.from({ length: d }, (_, i) => i);
  if (maxFeatures < d) {
    for (let i = featPool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [featPool[i], featPool[j]] = [featPool[j], featPool[i]];
    }
  }
  const chosenFeats = featPool.slice(0, maxFeatures);

  const parentScore = (sumY * sumY) / (n + l2Reg);
  let bestGain = 1e-9;
  let bestFeat = -1;
  let bestThresh = 0;

  for (const f of chosenFeats) {
    const pairs = indices.map((idx) => ({ x: X[idx][f], y: y[idx] }));
    pairs.sort((a, b) => a.x - b.x);

    let leftSum = 0;
    let leftCount = 0;
    for (let k = 0; k < pairs.length - 1; k++) {
      leftSum += pairs[k].y;
      leftCount++;
      if (pairs[k].x === pairs[k + 1].x) continue;
      const rightCount = n - leftCount;
      if (leftCount < minSamplesLeaf || rightCount < minSamplesLeaf) continue;

      const rightSum = sumY - leftSum;
      const gain =
        (leftSum * leftSum) / (leftCount + l2Reg) +
        (rightSum * rightSum) / (rightCount + l2Reg) -
        parentScore;
      if (gain > bestGain) {
        bestGain = gain;
        bestFeat = f;
        bestThresh = 0.5 * (pairs[k].x + pairs[k + 1].x);
      }
    }
  }

  if (bestFeat === -1) {
    return { leafValue: leafMean };
  }

  const leftIdx: number[] = [];
  const rightIdx: number[] = [];
  for (const idx of indices) {
    if (X[idx][bestFeat] <= bestThresh) leftIdx.push(idx);
    else rightIdx.push(idx);
  }

  return {
    featureIdx: bestFeat,
    threshold: bestThresh,
    left: fitRegressionTree(
      X,
      y,
      leftIdx,
      depth + 1,
      maxDepth,
      minSamplesLeaf,
      maxFeatures,
      l2Reg,
      rng
    ),
    right: fitRegressionTree(
      X,
      y,
      rightIdx,
      depth + 1,
      maxDepth,
      minSamplesLeaf,
      maxFeatures,
      l2Reg,
      rng
    ),
  };
}

function predictTree(node: TreeNode, x: number[]): number {
  let cur = node;
  while (cur.leafValue === undefined) {
    if (x[cur.featureIdx!] <= cur.threshold!) cur = cur.left!;
    else cur = cur.right!;
  }
  return cur.leafValue;
}

/* ---------------- Random Forest Runner ---------------- */
function trainAndEvalRandomForest(
  train: ParsedRow[],
  val: ParsedRow[],
  test: ParsedRow[],
  nTrees: number,
  maxDepth: number,
  recordCurve: boolean
) {
  const rng = createRng(101);
  const Xtr = train.map((r) => r.features);
  const yCalTr = train.map((r) => r.si_calcite_cem_max);
  const yGypTr = train.map((r) => r.si_gypsum_cem_max);

  const maxFeatures = Math.max(4, Math.floor(Math.sqrt(FEATURE_COLS.length)) + 2);
  const treesCal: TreeNode[] = [];
  const treesGyp: TreeNode[] = [];

  const sumCalTr = new Float64Array(train.length);
  const sumCalVal = new Float64Array(val.length);
  const sumCalTest = new Float64Array(test.length);
  const sumGypTest = new Float64Array(test.length);

  const curve: TrainingCurvePoint[] = [];
  const logEvery = Math.max(1, Math.floor(nTrees / 12));

  for (let t = 1; t <= nTrees; t++) {
    const bootIdx = Array.from({ length: train.length }, () =>
      Math.floor(rng() * train.length)
    );
    const tc = fitRegressionTree(
      Xtr,
      yCalTr,
      bootIdx,
      0,
      maxDepth,
      3,
      maxFeatures,
      0,
      rng
    );
    const tg = fitRegressionTree(
      Xtr,
      yGypTr,
      bootIdx,
      0,
      maxDepth,
      3,
      maxFeatures,
      0,
      rng
    );
    treesCal.push(tc);
    treesGyp.push(tg);

    for (let i = 0; i < train.length; i++) sumCalTr[i] += predictTree(tc, Xtr[i]);
    for (let i = 0; i < val.length; i++) sumCalVal[i] += predictTree(tc, val[i].features);
    for (let i = 0; i < test.length; i++) {
      sumCalTest[i] += predictTree(tc, test[i].features);
      sumGypTest[i] += predictTree(tg, test[i].features);
    }

    if (recordCurve && (t === 1 || t % logEvery === 0 || t === nTrees)) {
      let maeTr = 0;
      for (let i = 0; i < train.length; i++) {
        maeTr += Math.abs(yCalTr[i] - sumCalTr[i] / t);
      }
      let maeVal = 0;
      for (let i = 0; i < val.length; i++) {
        maeVal += Math.abs(val[i].si_calcite_cem_max - sumCalVal[i] / t);
      }
      curve.push({
        step: t,
        label: `Tree ${t}`,
        trainMetric: Number((maeTr / train.length).toFixed(4)),
        valMetric: Number((maeVal / val.length).toFixed(4)),
      });
    }
  }

  const predCalTest = Array.from(sumCalTest, (s) => s / nTrees);
  const predGypTest = Array.from(sumGypTest, (s) => s / nTrees);
  return { predCalTest, predGypTest, curve };
}

/* ---------------- XGBoost-Style Gradient Boosted Trees ---------------- */
function trainAndEvalXgboost(
  train: ParsedRow[],
  val: ParsedRow[],
  test: ParsedRow[],
  nEstimators: number,
  maxDepth: number,
  lr: number,
  recordCurve: boolean
) {
  const rng = createRng(202);
  const Xtr = train.map((r) => r.features);
  const yCalTr = train.map((r) => r.si_calcite_cem_max);
  const yGypTr = train.map((r) => r.si_gypsum_cem_max);

  const baseCal = yCalTr.reduce((a, b) => a + b, 0) / train.length;
  const baseGyp = yGypTr.reduce((a, b) => a + b, 0) / train.length;

  const predCalTr = new Float64Array(train.length).fill(baseCal);
  const predCalVal = new Float64Array(val.length).fill(baseCal);
  const predCalTest = new Float64Array(test.length).fill(baseCal);

  const predGypTr = new Float64Array(train.length).fill(baseGyp);
  const predGypTest = new Float64Array(test.length).fill(baseGyp);

  const curve: TrainingCurvePoint[] = [];
  const logEvery = Math.max(1, Math.floor(nEstimators / 12));
  const subCols = Math.max(6, Math.floor(FEATURE_COLS.length * 0.8));

  for (let b = 1; b <= nEstimators; b++) {
    const resCal = yCalTr.map((v, i) => v - predCalTr[i]);
    const resGyp = yGypTr.map((v, i) => v - predGypTr[i]);

    // Subsample 85% rows per boosting round (stochastic XGBoost)
    const rowIdx = Array.from({ length: train.length }, (_, i) => i).filter(
      () => rng() < 0.85
    );
    const activeIdx = rowIdx.length >= 10 ? rowIdx : Array.from({ length: train.length }, (_, i) => i);

    const treeCal = fitRegressionTree(
      Xtr,
      resCal,
      activeIdx,
      0,
      maxDepth,
      3,
      subCols,
      1.0, // XGBoost L2 lambda=1.0
      rng
    );
    const treeGyp = fitRegressionTree(
      Xtr,
      resGyp,
      activeIdx,
      0,
      maxDepth,
      3,
      subCols,
      1.0,
      rng
    );

    for (let i = 0; i < train.length; i++) {
      predCalTr[i] += lr * predictTree(treeCal, Xtr[i]);
      predGypTr[i] += lr * predictTree(treeGyp, Xtr[i]);
    }
    for (let i = 0; i < val.length; i++) {
      predCalVal[i] += lr * predictTree(treeCal, val[i].features);
    }
    for (let i = 0; i < test.length; i++) {
      predCalTest[i] += lr * predictTree(treeCal, test[i].features);
      predGypTest[i] += lr * predictTree(treeGyp, test[i].features);
    }

    if (recordCurve && (b === 1 || b % logEvery === 0 || b === nEstimators)) {
      let maeTr = 0;
      for (let i = 0; i < train.length; i++) maeTr += Math.abs(yCalTr[i] - predCalTr[i]);
      let maeVal = 0;
      for (let i = 0; i < val.length; i++) {
        maeVal += Math.abs(val[i].si_calcite_cem_max - predCalVal[i]);
      }
      curve.push({
        step: b,
        label: `Round ${b}`,
        trainMetric: Number((maeTr / train.length).toFixed(4)),
        valMetric: Number((maeVal / val.length).toFixed(4)),
      });
    }
  }

  return {
    predCalTest: Array.from(predCalTest),
    predGypTest: Array.from(predGypTest),
    curve,
  };
}

/* ---------------- Pure Data-Only MLP (Vanilla Tabular NN) ---------------- */
function trainAndEvalDataMlp(
  train: ParsedRow[],
  val: ParsedRow[],
  test: ParsedRow[],
  epochs: number,
  lr: number,
  recordCurve: boolean
) {
  const rng = createRng(303);
  const d = FEATURE_COLS.length;

  // Standardize features strictly using training split
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(1);
  for (let j = 0; j < d; j++) {
    let s = 0;
    for (const r of train) s += r.features[j];
    mean[j] = s / train.length;
    let v = 0;
    for (const r of train) v += (r.features[j] - mean[j]) ** 2;
    std[j] = Math.max(Math.sqrt(v / train.length), 1e-6);
  }
  const scale = (x: number[]) => x.map((v, j) => (v - mean[j]) / std[j]);

  const Xtr = train.map((r) => scale(r.features));
  const Xval = val.map((r) => scale(r.features));
  const Xte = test.map((r) => scale(r.features));
  const Ytr = train.map((r) => [r.si_calcite_cem_max, r.si_gypsum_cem_max]);

  const h1 = 24;
  const outD = 2;
  const W1 = Array.from({ length: h1 }, () =>
    Array.from({ length: d }, () => (rng() * 2 - 1) * Math.sqrt(2 / d))
  );
  const b1 = new Array(h1).fill(0);
  const W2 = Array.from({ length: outD }, () =>
    Array.from({ length: h1 }, () => (rng() * 2 - 1) * Math.sqrt(2 / h1))
  );
  const b2 = [0, 0];

  const mW1 = W1.map((row) => row.map(() => 0));
  const vW1 = W1.map((row) => row.map(() => 0));
  const mb1 = new Array(h1).fill(0);
  const vb1 = new Array(h1).fill(0);
  const mW2 = W2.map((row) => row.map(() => 0));
  const vW2 = W2.map((row) => row.map(() => 0));
  const mb2 = [0, 0];
  const vb2 = [0, 0];

  const forward = (x: number[]) => {
    const z1 = new Array(h1);
    const a1 = new Array(h1);
    for (let i = 0; i < h1; i++) {
      let s = b1[i];
      for (let j = 0; j < d; j++) s += W1[i][j] * x[j];
      z1[i] = s;
      a1[i] = Math.tanh(s);
    }
    const y = [b2[0], b2[1]];
    for (let k = 0; k < outD; k++) {
      for (let i = 0; i < h1; i++) y[k] += W2[k][i] * a1[i];
    }
    return { a1, y };
  };

  const curve: TrainingCurvePoint[] = [];
  const logEvery = Math.max(1, Math.floor(epochs / 14));
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;
  const wd = 1e-3;

  for (let ep = 1; ep <= epochs; ep++) {
    const gW1 = W1.map((row) => row.map(() => 0));
    const gb1 = new Array(h1).fill(0);
    const gW2 = W2.map((row) => row.map(() => 0));
    const gb2 = [0, 0];

    for (let n = 0; n < Xtr.length; n++) {
      const { a1, y } = forward(Xtr[n]);
      const err0 = (2 * (y[0] - Ytr[n][0])) / Xtr.length;
      const err1 = (2 * (y[1] - Ytr[n][1])) / Xtr.length;
      const errs = [err0, err1];

      for (let k = 0; k < outD; k++) {
        gb2[k] += errs[k];
        for (let i = 0; i < h1; i++) {
          gW2[k][i] += errs[k] * a1[i];
        }
      }

      for (let i = 0; i < h1; i++) {
        const da1 = errs[0] * W2[0][i] + errs[1] * W2[1][i];
        const dz1 = da1 * (1 - a1[i] * a1[i]);
        gb1[i] += dz1;
        for (let j = 0; j < d; j++) {
          gW1[i][j] += dz1 * Xtr[n][j];
        }
      }
    }

    const b1Pow = 1 - beta1 ** ep;
    const b2Pow = 1 - beta2 ** ep;
    const stepParam = (
      p: number,
      g: number,
      m: number,
      v: number,
      decay = 0
    ): [number, number, number] => {
      const grad = g + decay * p;
      const mn = beta1 * m + (1 - beta1) * grad;
      const vn = beta2 * v + (1 - beta2) * grad * grad;
      const mh = mn / b1Pow;
      const vh = vn / b2Pow;
      return [p - (lr * mh) / (Math.sqrt(vh) + eps), mn, vn];
    };

    for (let k = 0; k < outD; k++) {
      [b2[k], mb2[k], vb2[k]] = stepParam(b2[k], gb2[k], mb2[k], vb2[k]);
      for (let i = 0; i < h1; i++) {
        [W2[k][i], mW2[k][i], vW2[k][i]] = stepParam(
          W2[k][i],
          gW2[k][i],
          mW2[k][i],
          vW2[k][i],
          wd
        );
      }
    }
    for (let i = 0; i < h1; i++) {
      [b1[i], mb1[i], vb1[i]] = stepParam(b1[i], gb1[i], mb1[i], vb1[i]);
      for (let j = 0; j < d; j++) {
        [W1[i][j], mW1[i][j], vW1[i][j]] = stepParam(
          W1[i][j],
          gW1[i][j],
          mW1[i][j],
          vW1[i][j],
          wd
        );
      }
    }

    if (recordCurve && (ep === 1 || ep % logEvery === 0 || ep === epochs)) {
      let maeTr = 0;
      for (let i = 0; i < Xtr.length; i++) {
        maeTr += Math.abs(Ytr[i][0] - forward(Xtr[i]).y[0]);
      }
      let maeVal = 0;
      for (let i = 0; i < Xval.length; i++) {
        maeVal += Math.abs(val[i].si_calcite_cem_max - forward(Xval[i]).y[0]);
      }
      curve.push({
        step: ep,
        label: `Epoch ${ep}`,
        trainMetric: Number((maeTr / Xtr.length).toFixed(4)),
        valMetric: Number((maeVal / Xval.length).toFixed(4)),
      });
    }
  }

  const predCalTest = Xte.map((x) => forward(x).y[0]);
  const predGypTest = Xte.map((x) => forward(x).y[1]);
  return { predCalTest, predGypTest, curve };
}

function buildPredictionsAndMetrics(
  testRows: ParsedRow[],
  predCal: number[],
  predGyp: number[],
  predCategoriesOverride?: Array<string | undefined>
) {
  const preds: TestCasePrediction[] = testRows.map((row, idx) => {
    const pCal = predCal[idx];
    const pGyp = predGyp[idx];
    const pCat =
      predCategoriesOverride?.[idx] && predCategoriesOverride[idx]!.trim() !== ''
        ? (() => {
            const sc = shortCategory(predCategoriesOverride[idx]!);
            return sc === 'Category A'
              ? 'Category A: Clean membrane'
              : sc === 'Category B'
                ? 'Category B: Scaling-risk condition'
                : 'Category C: Nucleation-prone condition';
          })()
        : classifyCntFromSi(
            pCal,
            pGyp,
            row.temperature_K,
            row.contact_angle_cem_deg,
            row.roughness_factor_cem
          );
    return {
      caseId: row.case_id,
      trueCalciteSi: Number(row.si_calcite_cem_max.toFixed(4)),
      predCalciteSi: Number(pCal.toFixed(4)),
      trueGypsumSi: Number(row.si_gypsum_cem_max.toFixed(4)),
      predGypsumSi: Number(pGyp.toFixed(4)),
      trueCategory: row.dominant_scaling_category,
      predCategory: pCat,
    };
  });

  const trueCal = preds.map((p) => p.trueCalciteSi);
  const pCal = preds.map((p) => p.predCalciteSi);
  const trueGyp = preds.map((p) => p.trueGypsumSi);
  const pGyp = preds.map((p) => p.predGypsumSi);

  const riskCorrectCount = preds.filter(
    (p) => shortCategory(p.trueCategory) === shortCategory(p.predCategory)
  ).length;
  const riskTotalCount = preds.length;

  return {
    preds,
    calciteSiMae: Number(computeMae(trueCal, pCal).toFixed(4)),
    gypsumSiMae: Number(computeMae(trueGyp, pGyp).toFixed(4)),
    calciteR2: Number(computeR2(trueCal, pCal).toFixed(4)),
    gypsumR2: Number(computeR2(trueGyp, pGyp).toFixed(4)),
    riskCorrectCount,
    riskTotalCount,
    riskAccuracyPct: Number(
      ((riskCorrectCount / Math.max(1, riskTotalCount)) * 100).toFixed(1)
    ),
    confusionMatrix: buildConfusionMatrix(preds),
  };
}

export function runTraditionalMlComparison(
  req: MlCompareRequest
): ComparisonResultPayload {
  const t0 = performance.now();
  const split = loadVerified8IonSplit();

  const trainLimit = Math.max(
    40,
    Math.min(split.train.length, Math.round(req.trainCasesCount ?? split.train.length))
  );
  const activeTrain = split.train.slice(0, trainLimit);

  const nEst = Math.max(10, Math.min(200, Math.round(req.nEstimators ?? 80)));
  const maxDepth = Math.max(2, Math.min(10, Math.round(req.maxDepth ?? 5)));
  const lr = Math.max(0.01, Math.min(0.4, req.learningRate ?? (req.modelType === 'data_only_mlp' ? 0.03 : 0.1)));
  const epochs = Math.max(50, Math.min(600, Math.round(req.epochs ?? 250)));

  const runModelOnSubset = (
    tr: ParsedRow[],
    val: ParsedRow[],
    te: ParsedRow[],
    recordCurve: boolean
  ) => {
    if (req.modelType === 'random_forest') {
      return trainAndEvalRandomForest(tr, val, te, nEst, maxDepth, recordCurve);
    }
    if (req.modelType === 'xgboost') {
      return trainAndEvalXgboost(tr, val, te, nEst, Math.min(maxDepth, 5), lr, recordCurve);
    }
    return trainAndEvalDataMlp(tr, val, te, epochs, lr, recordCurve);
  };

  const mainOut = runModelOnSubset(activeTrain, split.val, split.test, true);
  const evalMain = buildPredictionsAndMetrics(
    split.test,
    mainOut.predCalTest,
    mainOut.predGypTest
  );

  // Sample efficiency sweep across [48, 96, 144, full] cases
  const sweepSizes = [48, 96, 144, split.train.length].filter(
    (s, i, arr) => s <= split.train.length && arr.indexOf(s) === i
  );
  const sampleEfficiencyCurve = sweepSizes.map((sz) => {
    if (sz === trainLimit) {
      return {
        trainCases: sz,
        baselineCalciteMae: evalMain.calciteSiMae,
        baselineRiskAccPct: evalMain.riskAccuracyPct,
        pinnCalciteMae: PINN_REF.calciteSiMae,
        pinnRiskAccPct: PINN_REF.riskAccuracyPct,
      };
    }
    const subOut = runModelOnSubset(split.train.slice(0, sz), split.val, split.test, false);
    const subEval = buildPredictionsAndMetrics(
      split.test,
      subOut.predCalTest,
      subOut.predGypTest
    );
    return {
      trainCases: sz,
      baselineCalciteMae: subEval.calciteSiMae,
      baselineRiskAccPct: subEval.riskAccuracyPct,
      pinnCalciteMae: PINN_REF.calciteSiMae,
      pinnRiskAccPct: PINN_REF.riskAccuracyPct,
    };
  });

  const modelName =
    req.modelType === 'random_forest'
      ? `Random Forest (${nEst} Trees · Depth ${maxDepth})`
      : req.modelType === 'xgboost'
        ? `XGBoost GBDT (${nEst} Rounds · lr=${lr.toFixed(2)})`
        : `Data-Only Tabular MLP (${epochs} Epochs · No PDEs)`;

  const hyperparameters: Record<string, string | number> =
    req.modelType === 'data_only_mlp'
      ? {
          architecture: '20 → 24 (tanh) → 2',
          epochs,
          learningRate: lr,
          loss: 'Pure Data MSE (No PDE)',
        }
      : {
          nEstimators: nEst,
          maxDepth,
          ...(req.modelType === 'xgboost' ? { learningRate: lr, l2Lambda: 1.0 } : { bootstrap: 'Yes (sqrt d)' }),
        };

  return {
    modelType: req.modelType,
    modelName,
    sourceKind: 'trained_live',
    datasetInfo: {
      totalVerifiedCases: split.all.length,
      trainCasesUsed: activeTrain.length,
      valCasesCount: split.val.length,
      testCasesCount: split.test.length,
      featureCount: FEATURE_COLS.length,
    },
    hyperparameters,
    trainingDurationMs: Number((performance.now() - t0).toFixed(1)),
    pinnReference: PINN_REF,
    baselineMetrics: {
      calciteSiMae: evalMain.calciteSiMae,
      gypsumSiMae: evalMain.gypsumSiMae,
      calciteR2: evalMain.calciteR2,
      gypsumR2: evalMain.gypsumR2,
      riskAccuracyPct: evalMain.riskAccuracyPct,
      riskCorrectCount: evalMain.riskCorrectCount,
      riskTotalCount: evalMain.riskTotalCount,
      supports2dFields: false,
      physicsResidualsEnforced: false,
      trainingCurve: mainOut.curve,
      sampleEfficiencyCurve,
      confusionMatrix: evalMain.confusionMatrix,
      testPredictions: evalMain.preds,
    },
  };
}

export function evaluateUploadedBaseline(payload: {
  filename: string;
  content: string;
}): ComparisonResultPayload {
  const t0 = performance.now();
  const split = loadVerified8IonSplit();
  const byId = new Map(split.all.map((r) => [r.case_id, r]));

  let modelName = payload.filename.replace(/\.(json|csv)$/i, '');
  let trainingCurve: TrainingCurvePoint[] = [];
  let rawPreds: Array<{
    case_id: string;
    pred_si_calcite: number;
    pred_si_gypsum: number;
    pred_category?: string;
  }> = [];

  const trimmed = payload.content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    const arr = Array.isArray(parsed) ? parsed : parsed.predictions;
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error(
        'Uploaded JSON must contain a non-empty "predictions" array with case_id, pred_si_calcite, and pred_si_gypsum.'
      );
    }
    if (!Array.isArray(parsed)) {
      if (parsed.modelName || parsed.model_name) {
        modelName = String(parsed.modelName ?? parsed.model_name);
      }
      const rawCurve = parsed.trainingCurve ?? parsed.training_curve;
      if (Array.isArray(rawCurve)) {
        trainingCurve = rawCurve
          .map((pt: Record<string, unknown>, i: number) => ({
            step: Number(pt.step ?? pt.epoch ?? i + 1),
            label: String(pt.label ?? `Step ${pt.step ?? i + 1}`),
            trainMetric: Number(pt.trainMetric ?? pt.train_loss ?? pt.train_mae ?? 0),
            valMetric: Number(pt.valMetric ?? pt.val_loss ?? pt.val_mae ?? 0),
          }))
          .filter((p) => Number.isFinite(p.valMetric));
      }
    }
    rawPreds = arr.map((item: Record<string, unknown>) => ({
      case_id: String(item.case_id ?? item.caseId ?? '').trim(),
      pred_si_calcite: Number(
        item.pred_si_calcite ?? item.si_calcite_pred ?? item.calcite_si ?? NaN
      ),
      pred_si_gypsum: Number(
        item.pred_si_gypsum ?? item.si_gypsum_pred ?? item.gypsum_si ?? 0
      ),
      pred_category: item.pred_category ?? item.dominant_scaling_category
        ? String(item.pred_category ?? item.dominant_scaling_category)
        : undefined,
    }));
  } else {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      throw new Error('Uploaded CSV must include a header row and at least one prediction row.');
    }
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const idxId = headers.findIndex((h) => h === 'case_id' || h === 'caseid');
    const idxCal = headers.findIndex((h) =>
      ['pred_si_calcite', 'si_calcite_pred', 'calcite_si', 'pred_calcite'].includes(h)
    );
    const idxGyp = headers.findIndex((h) =>
      ['pred_si_gypsum', 'si_gypsum_pred', 'gypsum_si', 'pred_gypsum'].includes(h)
    );
    const idxCat = headers.findIndex((h) =>
      ['pred_category', 'dominant_scaling_category', 'category'].includes(h)
    );
    if (idxId === -1 || idxCal === -1) {
      throw new Error(
        'CSV headers must include "case_id" and "pred_si_calcite" (optional: "pred_si_gypsum", "pred_category").'
      );
    }
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      if (cols.length <= Math.max(idxId, idxCal)) continue;
      rawPreds.push({
        case_id: cols[idxId],
        pred_si_calcite: Number(cols[idxCal]),
        pred_si_gypsum: idxGyp >= 0 ? Number(cols[idxGyp]) : 0,
        pred_category: idxCat >= 0 ? cols[idxCat] : undefined,
      });
    }
  }

  const matchedRows: ParsedRow[] = [];
  const matchedCal: number[] = [];
  const matchedGyp: number[] = [];
  const matchedCat: Array<string | undefined> = [];

  for (const item of rawPreds) {
    const row = byId.get(item.case_id);
    if (!row || !Number.isFinite(item.pred_si_calcite)) continue;
    matchedRows.push(row);
    matchedCal.push(item.pred_si_calcite);
    matchedGyp.push(
      Number.isFinite(item.pred_si_gypsum) ? item.pred_si_gypsum : row.si_gypsum_cem_max
    );
    matchedCat.push(item.pred_category);
  }

  if (matchedRows.length === 0) {
    throw new Error(
      'No matching case_id values found in data/pinn_8ion_sobol/case_metadata.csv (expected e.g. pinn_8ion_001..275). Download the template first.'
    );
  }

  const evalRes = buildPredictionsAndMetrics(
    matchedRows,
    matchedCal,
    matchedGyp,
    matchedCat
  );

  return {
    modelType: 'uploaded',
    modelName: `Uploaded: ${modelName}`,
    sourceKind: 'uploaded_file',
    datasetInfo: {
      totalVerifiedCases: split.all.length,
      trainCasesUsed: split.train.length,
      valCasesCount: split.val.length,
      testCasesCount: matchedRows.length,
      featureCount: FEATURE_COLS.length,
    },
    hyperparameters: {
      sourceFile: payload.filename,
      matchedCases: matchedRows.length,
    },
    trainingDurationMs: Number((performance.now() - t0).toFixed(1)),
    pinnReference: PINN_REF,
    baselineMetrics: {
      calciteSiMae: evalRes.calciteSiMae,
      gypsumSiMae: evalRes.gypsumSiMae,
      calciteR2: evalRes.calciteR2,
      gypsumR2: evalRes.gypsumR2,
      riskAccuracyPct: evalRes.riskAccuracyPct,
      riskCorrectCount: evalRes.riskCorrectCount,
      riskTotalCount: evalRes.riskTotalCount,
      supports2dFields: false,
      physicsResidualsEnforced: false,
      trainingCurve,
      sampleEfficiencyCurve: [],
      confusionMatrix: evalRes.confusionMatrix,
      testPredictions: evalRes.preds,
    },
  };
}

export function buildBaselineUploadTemplate(format: 'csv' | 'json'): string {
  const split = loadVerified8IonSplit();
  if (format === 'csv') {
    const lines = [
      'case_id,pred_si_calcite,pred_si_gypsum,pred_category',
      ...split.test.map(
        (r) =>
          `${r.case_id},${(r.si_calcite_cem_max + 0.08).toFixed(4)},${(
            r.si_gypsum_cem_max + 0.04
          ).toFixed(4)},${r.dominant_scaling_category}`
      ),
    ];
    return lines.join('\n');
  }
  return JSON.stringify(
    {
      modelName: 'Custom Traditional ML (Colab Export)',
      trainingCurve: [
        { step: 10, label: 'Tree 10', trainMetric: 0.24, valMetric: 0.29 },
        { step: 50, label: 'Tree 50', trainMetric: 0.11, valMetric: 0.19 },
        { step: 100, label: 'Tree 100', trainMetric: 0.07, valMetric: 0.17 },
      ],
      predictions: split.test.map((r) => ({
        case_id: r.case_id,
        pred_si_calcite: Number((r.si_calcite_cem_max + 0.08).toFixed(4)),
        pred_si_gypsum: Number((r.si_gypsum_cem_max + 0.04).toFixed(4)),
        pred_category: r.dominant_scaling_category,
      })),
    },
    null,
    2
  );
}
