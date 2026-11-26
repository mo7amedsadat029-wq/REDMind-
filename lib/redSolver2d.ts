import {
  evaluateHeterogeneousNucleation,
  evaluateMineralSaturationPitzer,
  HeterogeneousNucleationResult,
} from './pitzerCnt';

export const FARADAY = 96485.3329;
export const GAS_CONST = 8.31446;

export interface SimulationConfig {
  channelHeight: number; // m
  channelLength: number; // m
  membraneThicknessCem: number; // m
  membraneThicknessAem: number; // m
  nx: number;
  ny: number;
  uMeanConc: number; // m/s
  uMeanDil: number; // m/s
  cConcInlet: number; // mol/m^3
  cDilInlet: number; // mol/m^3
  dNa: number; // m^2/s
  dCl: number; // m^2/s
  rho: number; // kg/m^3
  mu: number; // Pa*s
  T: number; // K
  xCem: number; // mol/m^3 (negative)
  xAem: number; // mol/m^3 (positive)
  dCounterCem: number; // m^2/s
  dCoCem: number; // m^2/s
  dCounterAem: number; // m^2/s
  dCoAem: number; // m^2/s
  sigmaCem: number; // S/m
  sigmaAem: number; // S/m
  maxCouplingIter: number;
  couplingTol: number;
  relaxation: number;
  etaPump: number;
  loadFraction: number;
  currentDensity: number | null;
  temperatureDependentProperties: boolean;
  bcMode: 'v2_repaired' | 'v1_buggy_cem';
  deltaRmOhmCm2: number; // Exploratory sensitivity parameter (Ohm*cm^2)
  // Optional multicomponent / scaling chemistry (mol/m^3) at conc inlet
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
}

export const DEFAULT_SIM_CONFIG: SimulationConfig = {
  channelHeight: 270e-6,
  channelLength: 0.1,
  membraneThicknessCem: 125e-6,
  membraneThicknessAem: 125e-6,
  nx: 60,
  ny: 25,
  uMeanConc: 0.01,
  uMeanDil: 0.01,
  cConcInlet: 500.0,
  cDilInlet: 17.0,
  dNa: 1.334e-9,
  dCl: 2.032e-9,
  rho: 997.0,
  mu: 8.9e-4,
  T: 298.15,
  xCem: -2000.0,
  xAem: 2000.0,
  dCounterCem: 1e-11,
  dCoCem: 1e-12,
  dCounterAem: 1e-11,
  dCoAem: 1e-12,
  sigmaCem: 1.0,
  sigmaAem: 1.0,
  maxCouplingIter: 35,
  couplingTol: 1e-4,
  relaxation: 0.3,
  etaPump: 0.75,
  loadFraction: 0.0,
  currentDensity: null,
  temperatureDependentProperties: true,
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
  caseId: 'reference_v2',
};

export interface ChannelGeom {
  height: number;
  length: number;
  nx: number;
  ny: number;
  dx: number;
  dy: number;
  x: number[];
  y: number[];
  yGlobal: number[];
}

export interface FlowSolution {
  u: number[][];
  v: number[][];
  p: number[][];
  x: number[];
  y: number[];
  uMean: number;
  Re: number;
  dpDx: number;
  deltaP: number;
}

export interface ElectricalResult {
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
  pPumpConcWM2: number;
  pPumpDilWM2: number;
  pPumpTotalWM2: number;
  pNetMaxWM2: number;
  alphaCem: number;
  alphaAem: number;
  polarizationCurve: Array<{ i: number; v: number; p: number }>;
}

export interface SimulationResult {
  config: SimulationConfig;
  geomConc: ChannelGeom;
  geomDil: ChannelGeom;
  flowConc: FlowSolution;
  flowDil: FlowSolution;
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
  electrical: ElectricalResult;
  massBalanceConc: {
    mIn: number;
    mOut: number;
    wallFluxTotal: number;
    residual: number;
    relativeError: number;
    pass: boolean;
  };
  massBalanceDil: {
    mIn: number;
    mOut: number;
    wallFluxTotal: number;
    residual: number;
    relativeError: number;
    pass: boolean;
  };
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
  effectiveProps: {
    muEff: number;
    dNaEff: number;
    dClEff: number;
    dEff: number;
  };
  geochemistry: {
    siCalciteCemProfile: number[];
    siGypsumCemProfile: number[];
    daviesSiCalciteProfile: number[];
    daviesSiGypsumProfile: number[];
    omegaCalciteOutlet: number;
    siCalciteOutlet: number;
    omegaGypsumOutlet: number;
    siGypsumOutlet: number;
    ionicStrengthMolal: number;
    daviesValidityFlag: string;
    cntCalcite: HeterogeneousNucleationResult;
    cntGypsum: HeterogeneousNucleationResult;
  };
}

export function linspace(start: number, stop: number, n: number): number[] {
  if (n <= 1) return [start];
  const step = (stop - start) / (n - 1);
  return Array.from({ length: n }, (_, i) => start + i * step);
}

export function trapz(y: number[], x: number[]): number {
  let sum = 0;
  for (let i = 0; i < y.length - 1; i++) {
    sum += 0.5 * (y[i] + y[i + 1]) * (x[i + 1] - x[i]);
  }
  return sum;
}

export function createChannelGeom(
  height: number,
  length: number,
  nx: number,
  ny: number,
  yOffset = 0
): ChannelGeom {
  const x = linspace(0, length, nx);
  const y = linspace(0, height, ny);
  const yGlobal = y.map((v) => v + yOffset);
  return {
    height,
    length,
    nx,
    ny,
    dx: length / (nx - 1),
    dy: height / (ny - 1),
    x,
    y,
    yGlobal,
  };
}

export function computeEffectiveProps(cfg: SimulationConfig) {
  let muEff = cfg.mu;
  let dNaEff = cfg.dNa;
  let dClEff = cfg.dCl;
  if (cfg.temperatureDependentProperties && Math.abs(cfg.T - 298.15) > 1e-9) {
    const B = 578.919;
    const C = 137.546;
    muEff = cfg.mu * Math.exp(B * (1.0 / (cfg.T - C) - 1.0 / (298.15 - C)));
    dNaEff = cfg.dNa * (cfg.T / 298.15) * (cfg.mu / muEff);
    dClEff = cfg.dCl * (cfg.T / 298.15) * (cfg.mu / muEff);
  }
  const dEff = (2.0 * dNaEff * dClEff) / (dNaEff + dClEff);
  return { muEff, dNaEff, dClEff, dEff };
}

export function analyticalPoiseuille2d(
  geom: ChannelGeom,
  uMean: number,
  rho: number,
  mu: number
): FlowSolution {
  const H = geom.height;
  const L = geom.length;
  const dpDx = (-12.0 * mu * uMean) / (H * H);
  const deltaP = -dpDx * L;
  const Dh = 2.0 * H;
  const Re = (rho * uMean * Dh) / mu;

  const u1d = geom.y.map((yy) => -(1.0 / (2.0 * mu)) * dpDx * yy * (H - yy));
  const u: number[][] = Array.from({ length: geom.nx }, () => [...u1d]);
  const v: number[][] = Array.from({ length: geom.nx }, () =>
    new Array(geom.ny).fill(0)
  );
  const p: number[][] = geom.x.map((xx) =>
    new Array(geom.ny).fill(-dpDx * (L - xx))
  );

  return {
    u,
    v,
    p,
    x: geom.x,
    y: geom.y,
    uMean,
    Re,
    dpDx,
    deltaP,
  };
}

export function donnanEquilibrium1to1(cSol: number, xFix: number, T = 298.15) {
  const absX = Math.abs(xFix);
  const disc = (xFix / 2.0) ** 2 + cSol ** 2;
  const sqrtDisc = Math.sqrt(disc);
  let cNaMem: number;
  let cClMem: number;
  if (xFix < 0) {
    cNaMem = -xFix / 2.0 + sqrtDisc;
    cClMem = xFix / 2.0 + sqrtDisc;
  } else {
    cClMem = xFix / 2.0 + sqrtDisc;
    cNaMem = -xFix / 2.0 + sqrtDisc;
  }
  cNaMem = Math.max(cNaMem, 1e-10);
  cClMem = Math.max(cClMem, 1e-10);
  const phiDonnan =
    -(GAS_CONST * T / FARADAY) * Math.log(cNaMem / Math.max(cSol, 1e-10));
  const cCo = xFix < 0 ? cClMem : cNaMem;
  const permselectivity = absX / (absX + 2.0 * cCo);
  return { cNaMem, cClMem, phiDonnan, permselectivity };
}

export function membraneSaltFlux(
  cSolHigh: number,
  cSolLow: number,
  xFix: number,
  thickness: number,
  dCounter: number,
  dCo: number,
  T = 298.15
): number {
  const donHigh = donnanEquilibrium1to1(cSolHigh, xFix, T);
  const donLow = donnanEquilibrium1to1(cSolLow, xFix, T);
  const dEffMem = (2.0 * dCounter * dCo) / (dCounter + dCo);
  const dcCo =
    xFix < 0
      ? donHigh.cClMem - donLow.cClMem
      : donHigh.cNaMem - donLow.cNaMem;
  return (dEffMem * dcCo) / thickness;
}

export function solveBandedSystem(
  N: number,
  lBw: number,
  uBw: number,
  band: Float64Array,
  rhs: Float64Array
): Float64Array {
  const width = lBw + uBw + 1;

  // Banded LU with partial pivoting
  for (let k = 0; k < N - 1; k++) {
    const maxRow = Math.min(N - 1, k + lBw);
    let pivRow = k;
    let pivVal = Math.abs(band[k * width + lBw]);
    for (let r = k + 1; r <= maxRow; r++) {
      const colOff = k - r + lBw;
      const v = Math.abs(band[r * width + colOff]);
      if (v > pivVal) {
        pivVal = v;
        pivRow = r;
      }
    }

    if (pivRow !== k) {
      // Swap rows k and pivRow across aligned matrix columns up to full upper bandwidth
      const maxCol = Math.min(N - 1, k + uBw);
      for (let c = k; c <= maxCol; c++) {
        const offK = c - k + lBw;
        const offP = c - pivRow + lBw;
        const tmp = band[k * width + offK];
        band[k * width + offK] = band[pivRow * width + offP];
        band[pivRow * width + offP] = tmp;
      }
      const tmpR = rhs[k];
      rhs[k] = rhs[pivRow];
      rhs[pivRow] = tmpR;
    }

    const diag = band[k * width + lBw];
    if (Math.abs(diag) < 1e-30) continue;

    const maxColK = Math.min(N - 1, k + uBw);
    for (let r = k + 1; r <= maxRow; r++) {
      const offRk = k - r + lBw;
      const factor = band[r * width + offRk] / diag;
      if (factor === 0) continue;
      band[r * width + offRk] = 0;
      for (let c = k + 1; c <= maxColK; c++) {
        const offKc = c - k + lBw;
        const valKc = band[k * width + offKc];
        if (valKc !== 0) {
          const offRc = c - r + lBw;
          if (offRc >= 0 && offRc < width) {
            band[r * width + offRc] -= factor * valKc;
          }
        }
      }
      rhs[r] -= factor * rhs[k];
    }
  }

  // Back substitution
  const xSol = new Float64Array(N);
  for (let k = N - 1; k >= 0; k--) {
    let sum = rhs[k];
    const maxCol = Math.min(N - 1, k + uBw);
    for (let c = k + 1; c <= maxCol; c++) {
      sum -= band[k * width + (c - k + lBw)] * xSol[c];
    }
    xSol[k] = sum / band[k * width + lBw];
  }

  return xSol;
}

/**
 * Exact banded Gaussian elimination with partial pivoting for 2D finite difference stencil.
 * Node index k = i * ny + j, half-bandwidth lBw = ny, uBw = 2 * ny (handles row swaps cleanly).
 */
export function solveAdvectionDiffusion2d(
  geom: ChannelGeom,
  flow: FlowSolution,
  dEff: number,
  cInlet: number,
  jBottom: number[],
  jTop: number[]
): number[][] {
  const { nx, ny, dx, dy } = geom;
  const N = nx * ny;
  const lBw = ny;
  const uBw = 2 * ny;
  const width = lBw + uBw + 1;

  const band = new Float64Array(N * width);
  const rhs = new Float64Array(N);

  const setA = (row: number, col: number, val: number) => {
    const off = col - row + lBw;
    if (off >= 0 && off < width) {
      band[row * width + off] += val;
    }
  };

  const idx = (i: number, j: number) => i * ny + j;

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const k = idx(i, j);
      if (i === 0) {
        setA(k, k, 1.0);
        rhs[k] = cInlet;
      } else if (j === 0) {
        setA(k, k, 1.0);
        setA(k, idx(i, 1), -1.0);
        rhs[k] = (jBottom[i] * dy) / dEff;
      } else if (j === ny - 1) {
        setA(k, k, 1.0);
        setA(k, idx(i, ny - 2), -1.0);
        rhs[k] = (jTop[i] * dy) / dEff;
      } else if (i === nx - 1) {
        setA(k, k, 1.0);
        setA(k, idx(nx - 2, j), -1.0);
        rhs[k] = 0.0;
      } else {
        const u_ij = flow.u[i][j];
        const v_ij = flow.v[i][j];
        const aC =
          (2.0 * dEff) / (dx * dx) +
          (2.0 * dEff) / (dy * dy) +
          Math.max(u_ij, 0) / dx +
          Math.max(-u_ij, 0) / dx +
          Math.max(v_ij, 0) / dy +
          Math.max(-v_ij, 0) / dy;
        const aW = -dEff / (dx * dx) - Math.max(u_ij, 0) / dx;
        const aE = -dEff / (dx * dx) - Math.max(-u_ij, 0) / dx;
        const aS = -dEff / (dy * dy) - Math.max(v_ij, 0) / dy;
        const aN = -dEff / (dy * dy) - Math.max(-v_ij, 0) / dy;

        setA(k, k, aC);
        setA(k, idx(i - 1, j), aW);
        setA(k, idx(i + 1, j), aE);
        setA(k, idx(i, j - 1), aS);
        setA(k, idx(i, j + 1), aN);
        rhs[k] = 0.0;
      }
    }
  }

  const xSol = solveBandedSystem(N, lBw, uBw, band, rhs);

  const out: number[][] = Array.from({ length: nx }, (_, i) =>
    Array.from({ length: ny }, (_, j) => xSol[idx(i, j)])
  );
  return out;
}

export function solutionConductivityNacl(
  c: number,
  T = 298.15,
  dNa = 1.334e-9,
  dCl = 2.032e-9
): number {
  return (FARADAY ** 2 / (GAS_CONST * T)) * (dNa + dCl) * c;
}

function computeElectrical(
  cConcAvg: number,
  cDilAvg: number,
  cfg: SimulationConfig,
  alphaCem: number,
  alphaAem: number,
  deltaPConc: number,
  deltaPDil: number,
  dNaEff: number,
  dClEff: number
): ElectricalResult {
  const eOcvV =
    (alphaCem + alphaAem) *
    ((GAS_CONST * cfg.T) / FARADAY) *
    Math.log(cConcAvg / Math.max(cDilAvg, 1e-10));

  const sigmaConc = solutionConductivityNacl(cConcAvg, cfg.T, dNaEff, dClEff);
  const sigmaDil = solutionConductivityNacl(cDilAvg, cfg.T, dNaEff, dClEff);
  const rConcOhmM2 = cfg.channelHeight / Math.max(sigmaConc, 1e-10);
  const rDilOhmM2 = cfg.channelHeight / Math.max(sigmaDil, 1e-10);
  const rCemOhmM2 = cfg.membraneThicknessCem / Math.max(cfg.sigmaCem, 1e-10);
  const rAemOhmM2 = cfg.membraneThicknessAem / Math.max(cfg.sigmaAem, 1e-10);
  const rDeltaRmOhmM2 = Math.max(0, cfg.deltaRmOhmCm2) * 1e-4;
  const rInternalOhmM2 =
    rConcOhmM2 + rDilOhmM2 + rCemOhmM2 + rAemOhmM2 + rDeltaRmOhmM2;

  const iMaxPowerAM2 = eOcvV / (2.0 * rInternalOhmM2);
  const vMaxPowerV = eOcvV / 2.0;
  const pGrossMaxWM2 = eOcvV ** 2 / (4.0 * rInternalOhmM2);

  const pPumpConcWM2 =
    (deltaPConc * cfg.uMeanConc * cfg.channelHeight) /
    (cfg.etaPump * cfg.channelLength);
  const pPumpDilWM2 =
    (deltaPDil * cfg.uMeanDil * cfg.channelHeight) /
    (cfg.etaPump * cfg.channelLength);
  const pPumpTotalWM2 = pPumpConcWM2 + pPumpDilWM2;
  const pNetMaxWM2 = pGrossMaxWM2 - pPumpTotalWM2;

  const iShort = eOcvV / Math.max(rInternalOhmM2, 1e-12);
  const nPts = 25;
  const polarizationCurve = Array.from({ length: nPts }, (_, idx) => {
    const cur = (idx / (nPts - 1)) * iShort;
    const v = eOcvV - cur * rInternalOhmM2;
    return { i: cur, v, p: cur * v };
  });

  return {
    eOcvV,
    rInternalOhmM2,
    rConcOhmM2,
    rDilOhmM2,
    rCemOhmM2,
    rAemOhmM2,
    rDeltaRmOhmM2,
    iMaxPowerAM2,
    vMaxPowerV,
    pGrossMaxWM2,
    pPumpConcWM2,
    pPumpDilWM2,
    pPumpTotalWM2,
    pNetMaxWM2,
    alphaCem,
    alphaAem,
    polarizationCurve,
  };
}

function computeDiffusiveFlux(
  c: number[][],
  geom: ChannelGeom,
  dEff: number
): { jx: number[][]; jy: number[][] } {
  const { nx, ny, dx, dy } = geom;
  const jx = Array.from({ length: nx }, () => new Array(ny).fill(0));
  const jy = Array.from({ length: nx }, () => new Array(ny).fill(0));

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (i === 0) jx[i][j] = (-dEff * (c[1][j] - c[0][j])) / dx;
      else if (i === nx - 1)
        jx[i][j] = (-dEff * (c[nx - 1][j] - c[nx - 2][j])) / dx;
      else jx[i][j] = (-dEff * (c[i + 1][j] - c[i - 1][j])) / (2 * dx);

      if (j === 0) jy[i][j] = (-dEff * (c[i][1] - c[i][0])) / dy;
      else if (j === ny - 1)
        jy[i][j] = (-dEff * (c[i][ny - 1] - c[i][ny - 2])) / dy;
      else jy[i][j] = (-dEff * (c[i][j + 1] - c[i][j - 1])) / (2 * dy);
    }
  }
  return { jx, jy };
}

function checkMassBalance(
  c: number[][],
  flow: FlowSolution,
  geom: ChannelGeom,
  jBottom: number[],
  jTop: number[]
) {
  const { nx, x, y } = geom;
  const mIn = trapz(
    flow.u[0].map((uVal, j) => uVal * c[0][j]),
    y
  );
  const mOut = trapz(
    flow.u[nx - 1].map((uVal, j) => uVal * c[nx - 1][j]),
    y
  );
  const wallFluxTotal = trapz(
    jBottom.map((jb, i) => jb + jTop[i]),
    x
  );
  const residual = mIn + wallFluxTotal - mOut;
  const relativeError = Math.abs(residual) / Math.max(Math.abs(mIn), 1e-30);
  return {
    mIn,
    mOut,
    wallFluxTotal,
    residual,
    relativeError,
    pass: relativeError < 0.01,
  };
}

function mean2d(arr: number[][]): number {
  let s = 0;
  let cnt = 0;
  for (const row of arr) {
    for (const v of row) {
      s += v;
      cnt++;
    }
  }
  return s / Math.max(cnt, 1);
}

export function runRedSimulation(
  partialCfg: Partial<SimulationConfig> = {}
): SimulationResult {
  const t0 = performance.now();
  const cfg: SimulationConfig = { ...DEFAULT_SIM_CONFIG, ...partialCfg };

  const geomDil = createChannelGeom(
    cfg.channelHeight,
    cfg.channelLength,
    cfg.nx,
    cfg.ny,
    0
  );
  const geomConc = createChannelGeom(
    cfg.channelHeight,
    cfg.channelLength,
    cfg.nx,
    cfg.ny,
    cfg.channelHeight
  );

  const effectiveProps = computeEffectiveProps(cfg);
  const { muEff, dNaEff, dClEff, dEff } = effectiveProps;
  const tNaSol = dNaEff / (dNaEff + dClEff);
  const tClSol = dClEff / (dNaEff + dClEff);

  const flowConc = analyticalPoiseuille2d(
    geomConc,
    cfg.uMeanConc,
    cfg.rho,
    muEff
  );
  const flowDil = analyticalPoiseuille2d(geomDil, cfg.uMeanDil, cfg.rho, muEff);

  let cConc: number[][] = Array.from({ length: cfg.nx }, () =>
    new Array(cfg.ny).fill(cfg.cConcInlet)
  );
  let cDil: number[][] = Array.from({ length: cfg.nx }, () =>
    new Array(cfg.ny).fill(cfg.cDilInlet)
  );

  let jCem = new Array(cfg.nx).fill(0);
  let jAem = new Array(cfg.nx).fill(0);
  const convergenceHistory: SimulationResult['convergenceHistory'] = [];
  let converged = false;
  let iter = 0;

  for (; iter < cfg.maxCouplingIter; iter++) {
    const cConcAtCem = cConc.map((col) => col[0]);
    const cDilAtCem = cDil.map((col) => col[cfg.ny - 1]);
    const cConcAtAem = cConc.map((col) => col[cfg.ny - 1]);
    const cDilAtAem = cDil.map((col) => col[0]);

    let iOp = 0;
    if (cfg.currentDensity !== null) {
      iOp = cfg.currentDensity;
    } else if (cfg.loadFraction > 0) {
      let aCemSum = 0;
      let aAemSum = 0;
      for (let i = 0; i < cfg.nx; i++) {
        aCemSum += donnanEquilibrium1to1(
          cConcAtCem[i],
          cfg.xCem,
          cfg.T
        ).permselectivity;
        aAemSum += donnanEquilibrium1to1(
          cConcAtCem[i],
          cfg.xAem,
          cfg.T
        ).permselectivity;
      }
      const elecTmp = computeElectrical(
        mean2d(cConc),
        mean2d(cDil),
        cfg,
        aCemSum / cfg.nx,
        aAemSum / cfg.nx,
        flowConc.deltaP,
        flowDil.deltaP,
        dNaEff,
        dClEff
      );
      iOp = cfg.loadFraction * (elecTmp.eOcvV / elecTmp.rInternalOhmM2);
    }

    jCem = new Array(cfg.nx).fill(0);
    jAem = new Array(cfg.nx).fill(0);
    for (let i = 0; i < cfg.nx; i++) {
      const jDiffCem = membraneSaltFlux(
        cConcAtCem[i],
        cDilAtCem[i],
        cfg.xCem,
        cfg.membraneThicknessCem,
        cfg.dCounterCem,
        cfg.dCoCem,
        cfg.T
      );
      const jDiffAem = membraneSaltFlux(
        cConcAtAem[i],
        cDilAtAem[i],
        cfg.xAem,
        cfg.membraneThicknessAem,
        cfg.dCounterAem,
        cfg.dCoAem,
        cfg.T
      );
      if (iOp !== 0) {
        const alphaCemI =
          0.5 *
          (donnanEquilibrium1to1(cConcAtCem[i], cfg.xCem, cfg.T).permselectivity +
            donnanEquilibrium1to1(cDilAtCem[i], cfg.xCem, cfg.T).permselectivity);
        const tNaCem = 0.5 * (1.0 + alphaCemI);

        const alphaAemI =
          0.5 *
          (donnanEquilibrium1to1(cConcAtAem[i], cfg.xAem, cfg.T).permselectivity +
            donnanEquilibrium1to1(cDilAtAem[i], cfg.xAem, cfg.T).permselectivity);
        const tClAem = 0.5 * (1.0 + alphaAemI);

        jCem[i] = jDiffCem + (tNaCem - tNaSol) * (iOp / FARADAY);
        jAem[i] = jDiffAem + (tClAem - tClSol) * (iOp / FARADAY);
      } else {
        jCem[i] = jDiffCem;
        jAem[i] = jDiffAem;
      }
    }

    // Repaired v2.0.0: salt leaves conc channel through CEM -> jBottom = -jCem.
    // Legacy v1.0.0 bug: erroneously passed +jCem on bottom wall of conc channel!
    const concBottomFlux =
      cfg.bcMode === 'v1_buggy_cem' ? jCem : jCem.map((v) => -v);
    const concTopFlux = jAem.map((v) => -v);

    const cConcNew = solveAdvectionDiffusion2d(
      geomConc,
      flowConc,
      dEff,
      cfg.cConcInlet,
      concBottomFlux,
      concTopFlux
    );
    const cDilNew = solveAdvectionDiffusion2d(
      geomDil,
      flowDil,
      dEff,
      cfg.cDilInlet,
      jAem,
      jCem
    );

    let errConc = 0;
    let errDil = 0;
    const cConcUpd: number[][] = Array.from({ length: cfg.nx }, (_, i) =>
      Array.from({ length: cfg.ny }, (_, j) => {
        const val = Math.max(cConcNew[i][j], 1e-3);
        const upd = cfg.relaxation * val + (1 - cfg.relaxation) * cConc[i][j];
        errConc = Math.max(
          errConc,
          Math.abs(upd - cConc[i][j]) / Math.max(cfg.cConcInlet, 1e-6)
        );
        return upd;
      })
    );
    const cDilUpd: number[][] = Array.from({ length: cfg.nx }, (_, i) =>
      Array.from({ length: cfg.ny }, (_, j) => {
        const val = Math.max(cDilNew[i][j], 1e-3);
        const upd = cfg.relaxation * val + (1 - cfg.relaxation) * cDil[i][j];
        errDil = Math.max(
          errDil,
          Math.abs(upd - cDil[i][j]) / Math.max(cfg.cDilInlet, 1e-6)
        );
        return upd;
      })
    );

    const errMax = Math.max(errConc, errDil);
    const jCemAvg = jCem.reduce((s, v) => s + v, 0) / cfg.nx;
    const jAemAvg = jAem.reduce((s, v) => s + v, 0) / cfg.nx;

    convergenceHistory.push({
      iter,
      errConc,
      errDil,
      errMax,
      jCemAvg,
      jAemAvg,
    });

    cConc = cConcUpd;
    cDil = cDilUpd;

    if (errMax < cfg.couplingTol) {
      converged = true;
      break;
    }
  }

  // Electric potential fields
  const tFactor = (dNaEff - dClEff) / (dNaEff + dClEff);
  const jMid = Math.floor(cfg.ny / 2);
  const cRefConc = Math.max(cConc[0][jMid], 1e-10);
  const cRefDil = Math.max(cDil[0][jMid], 1e-10);
  const phiConc = cConc.map((col) =>
    col.map(
      (val) =>
        -((GAS_CONST * cfg.T) / FARADAY) *
        tFactor *
        Math.log(Math.max(val, 1e-10) / cRefConc)
    )
  );
  const phiDil = cDil.map((col) =>
    col.map(
      (val) =>
        -((GAS_CONST * cfg.T) / FARADAY) *
        tFactor *
        Math.log(Math.max(val, 1e-10) / cRefDil)
    )
  );

  // Membrane interface profiles along CEM
  const cemEMembrane: number[] = [];
  const aemEMembrane: number[] = [];
  const eCellPair: number[] = [];
  const cemAlphaConc: number[] = [];
  const cemAlphaDil: number[] = [];
  let aemAlphaSum = 0;

  for (let i = 0; i < cfg.nx; i++) {
    const cw = cConc[i][0];
    const dw = cDil[i][cfg.ny - 1];
    const donCemC = donnanEquilibrium1to1(cw, cfg.xCem, cfg.T);
    const donCemD = donnanEquilibrium1to1(dw, cfg.xCem, cfg.T);
    const donAemC = donnanEquilibrium1to1(cw, cfg.xAem, cfg.T);
    const donAemD = donnanEquilibrium1to1(dw, cfg.xAem, cfg.T);

    const aCem = 0.5 * (donCemC.permselectivity + donCemD.permselectivity);
    const aAem = 0.5 * (donAemC.permselectivity + donAemD.permselectivity);
    const eCem =
      aCem * ((GAS_CONST * cfg.T) / FARADAY) * Math.log(cw / Math.max(dw, 1e-10));
    const eAem =
      aAem * ((GAS_CONST * cfg.T) / FARADAY) * Math.log(cw / Math.max(dw, 1e-10));

    cemAlphaConc.push(donCemC.permselectivity);
    cemAlphaDil.push(donCemD.permselectivity);
    aemAlphaSum += donAemC.permselectivity;
    cemEMembrane.push(eCem);
    aemEMembrane.push(eAem);
    eCellPair.push(eCem + eAem);
  }

  const alphaCemAvg = cemAlphaConc.reduce((s, v) => s + v, 0) / cfg.nx;
  const alphaAemAvg = aemAlphaSum / cfg.nx;

  const electrical = computeElectrical(
    mean2d(cConc),
    mean2d(cDil),
    cfg,
    alphaCemAvg,
    alphaAemAvg,
    flowConc.deltaP,
    flowDil.deltaP,
    dNaEff,
    dClEff
  );

  const { jx: jxConc, jy: jyConc } = computeDiffusiveFlux(
    cConc,
    geomConc,
    dEff
  );
  const { jx: jxDil, jy: jyDil } = computeDiffusiveFlux(cDil, geomDil, dEff);

  const mbConc = checkMassBalance(
    cConc,
    flowConc,
    geomConc,
    cfg.bcMode === 'v1_buggy_cem' ? jCem : jCem.map((v) => -v),
    jAem.map((v) => -v)
  );
  const mbDil = checkMassBalance(cDil, flowDil, geomDil, jAem, jCem);

  // One-way coupled Pitzer thermodynamic post-processing along CEM wall
  // Scale local ion concentrations proportionally to local wall concentration ratio c_wall(x)/c_inlet
  const sampleIndices = Array.from({ length: cfg.nx }, (_, i) => i);
  const siCalciteCemProfile: number[] = new Array(cfg.nx);
  const siGypsumCemProfile: number[] = new Array(cfg.nx);
  const daviesSiCalciteProfile: number[] = new Array(cfg.nx);
  const daviesSiGypsumProfile: number[] = new Array(cfg.nx);

  // Evaluate at 12 evenly spaced points and interpolate for sub-millisecond UI responsiveness
  const nEval = Math.min(12, cfg.nx);
  const evalXIdx = Array.from({ length: nEval }, (_, k) =>
    Math.round((k * (cfg.nx - 1)) / Math.max(nEval - 1, 1))
  );
  let lastSat = evaluateMineralSaturationPitzer(
    {
      Na: cfg.cConcInlet,
      K: cfg.kInletMolM3,
      Mg: cfg.mgInletMolM3,
      Ca: cfg.caInletMolM3,
      Cl:
        cfg.cConcInlet +
        cfg.kInletMolM3 +
        2 * cfg.mgInletMolM3 +
        2 * cfg.caInletMolM3 -
        2 * cfg.so4InletMolM3 -
        cfg.hco3InletMolM3 -
        2 * cfg.co3InletMolM3,
      SO4: cfg.so4InletMolM3,
      HCO3: cfg.hco3InletMolM3,
      CO3: cfg.co3InletMolM3,
    },
    cfg.pH,
    cfg.T
  );

  const evalPts: Array<{
    idx: number;
    siCal: number;
    siGyp: number;
    davCal: number;
    davGyp: number;
  }> = [];

  for (const idxX of evalXIdx) {
    const ratio = cConc[idxX][0] / Math.max(cfg.cConcInlet, 1e-6);
    const naVal = Math.max(cConc[idxX][0], 1e-3);
    const kVal = cfg.kInletMolM3 * ratio;
    const mgVal = cfg.mgInletMolM3 * ratio;
    const caVal = cfg.caInletMolM3 * ratio;
    const so4Val = cfg.so4InletMolM3 * ratio;
    const hco3Val = cfg.hco3InletMolM3 * ratio;
    const co3Val = cfg.co3InletMolM3 * ratio;
    const clVal = Math.max(
      naVal + kVal + 2 * mgVal + 2 * caVal - 2 * so4Val - hco3Val - 2 * co3Val,
      1.0
    );
    lastSat = evaluateMineralSaturationPitzer(
      {
        Na: naVal,
        K: kVal,
        Mg: mgVal,
        Ca: caVal,
        Cl: clVal,
        SO4: so4Val,
        HCO3: hco3Val,
        CO3: co3Val,
      },
      cfg.pH,
      cfg.T
    );
    evalPts.push({
      idx: idxX,
      siCal: lastSat.si_calcite,
      siGyp: lastSat.si_gypsum,
      davCal: lastSat.davies_si_calcite,
      davGyp: lastSat.davies_si_gypsum,
    });
  }

  for (const i of sampleIndices) {
    let seg = 0;
    while (seg < evalPts.length - 2 && i > evalPts[seg + 1].idx) seg++;
    const p0 = evalPts[seg];
    const p1 = evalPts[Math.min(seg + 1, evalPts.length - 1)];
    const span = Math.max(p1.idx - p0.idx, 1);
    const t = Math.max(0, Math.min(1, (i - p0.idx) / span));
    siCalciteCemProfile[i] = p0.siCal + t * (p1.siCal - p0.siCal);
    siGypsumCemProfile[i] = p0.siGyp + t * (p1.siGyp - p0.siGyp);
    daviesSiCalciteProfile[i] = p0.davCal + t * (p1.davCal - p0.davCal);
    daviesSiGypsumProfile[i] = p0.davGyp + t * (p1.davGyp - p0.davGyp);
  }

  const cntCalcite = evaluateHeterogeneousNucleation(
    'Calcite',
    lastSat.omega_calcite,
    cfg.T,
    cfg.contactAngleCemDeg,
    cfg.roughnessFactorCem
  );
  const cntGypsum = evaluateHeterogeneousNucleation(
    'Gypsum',
    lastSat.omega_gypsum,
    cfg.T,
    cfg.contactAngleCemDeg,
    cfg.roughnessFactorCem
  );

  return {
    config: cfg,
    geomConc,
    geomDil,
    flowConc,
    flowDil,
    cConc,
    cDil,
    phiConc,
    phiDil,
    jxConc,
    jyConc,
    jxDil,
    jyDil,
    jCem,
    jAem,
    cemEMembrane,
    aemEMembrane,
    eCellPair,
    cemAlphaConc,
    cemAlphaDil,
    electrical,
    massBalanceConc: mbConc,
    massBalanceDil: mbDil,
    convergenceHistory,
    couplingIterations: converged ? iter + 1 : cfg.maxCouplingIter,
    converged,
    wallTimeMs: performance.now() - t0,
    effectiveProps,
    geochemistry: {
      siCalciteCemProfile,
      siGypsumCemProfile,
      daviesSiCalciteProfile,
      daviesSiGypsumProfile,
      omegaCalciteOutlet: lastSat.omega_calcite,
      siCalciteOutlet: lastSat.si_calcite,
      omegaGypsumOutlet: lastSat.omega_gypsum,
      siGypsumOutlet: lastSat.si_gypsum,
      ionicStrengthMolal: lastSat.ionic_strength_molal,
      daviesValidityFlag: lastSat.davies_validity_flag,
      cntCalcite,
      cntGypsum,
    },
  };
}
