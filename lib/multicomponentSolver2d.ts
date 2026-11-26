import {
  evaluateHeterogeneousNucleation,
  evaluateMineralSaturationPitzer,
  HeterogeneousNucleationResult,
} from './pitzerCnt';
import {
  analyticalPoiseuille2d,
  ChannelGeom,
  createChannelGeom,
  DEFAULT_SIM_CONFIG,
  ElectricalResult,
  FARADAY,
  FlowSolution,
  GAS_CONST,
  SimulationConfig,
  solveBandedSystem,
} from './redSolver2d';

export const SPECIES_ORDER = [
  'Na',
  'K',
  'Mg',
  'Ca',
  'Cl',
  'SO4',
  'HCO3',
  'CO3',
] as const;

export type SpeciesName = (typeof SPECIES_ORDER)[number];

export const SPECIES_CHARGES: Record<SpeciesName, number> = {
  Na: 1,
  K: 1,
  Mg: 2,
  Ca: 2,
  Cl: -1,
  SO4: -2,
  HCO3: -1,
  CO3: -2,
};

export const SPECIES_D_25C: Record<SpeciesName, number> = {
  Na: 1.334e-9,
  K: 1.96e-9,
  Mg: 0.705e-9,
  Ca: 0.792e-9,
  Cl: 2.032e-9,
  SO4: 1.07e-9,
  HCO3: 1.18e-9,
  CO3: 0.955e-9,
};

const MEMBRANE_RATIOS = {
  counterionMonovalent: 0.08,
  counterionDivalent: 0.025,
  coionMonovalent: 0.0008,
  coionDivalent: 0.00025,
};

export function vogelWaterViscosity(T_K: number, mu25C = 8.9e-4): number {
  if (Math.abs(T_K - 298.15) < 1e-9) return mu25C;
  return (
    mu25C *
    Math.exp(
      578.919 * (1.0 / (T_K - 137.546) - 1.0 / (298.15 - 137.546))
    )
  );
}

export function stokesEinsteinDiffusivities(
  T_K: number,
  mu25C = 8.9e-4
): Record<SpeciesName, number> {
  const muEff = vogelWaterViscosity(T_K, mu25C);
  const factor = (T_K / 298.15) * (mu25C / muEff);
  const out = {} as Record<SpeciesName, number>;
  for (const sp of SPECIES_ORDER) {
    out[sp] = SPECIES_D_25C[sp] * factor;
  }
  return out;
}

function buildMembraneDiffusivities(
  dAq: Record<SpeciesName, number>,
  isCem: boolean
): Record<SpeciesName, number> {
  const dMem = {} as Record<SpeciesName, number>;
  for (const sp of SPECIES_ORDER) {
    const z = SPECIES_CHARGES[sp];
    const isCounter = isCem ? z > 0 : z < 0;
    const ratio = isCounter
      ? Math.abs(z) === 1
        ? MEMBRANE_RATIOS.counterionMonovalent
        : MEMBRANE_RATIOS.counterionDivalent
      : Math.abs(z) === 1
        ? MEMBRANE_RATIOS.coionMonovalent
        : MEMBRANE_RATIOS.coionDivalent;
    dMem[sp] = dAq[sp] * ratio;
  }
  return dMem;
}

function bernoulli(x: number): number {
  if (Math.abs(x) < 1e-5) return 1.0 - 0.5 * x + (x * x) / 12.0;
  if (x > 40.0) return x * Math.exp(-x);
  if (x < -40.0) return -x;
  return x / Math.expm1(x);
}

function bernoulliDeriv(x: number): number {
  if (Math.abs(x) < 1e-4) return -0.5 + x / 6.0;
  if (x > 40.0) return (1.0 - x) * Math.exp(-x);
  if (x < -40.0) return -1.0;
  const ex = Math.exp(x);
  const em1 = Math.expm1(x);
  return (ex * (1.0 - x) - 1.0) / (em1 * em1);
}

function multiIonDonnanBatch(
  cSol: Record<SpeciesName, number[]>,
  xFix: number,
  T: number
): { cMem: Record<SpeciesName, number[]>; phiDonnan: number[] } {
  const n = cSol.Na.length;
  const lo = new Float64Array(n).fill(-25.0);
  const hi = new Float64Array(n).fill(25.0);
  const u = new Float64Array(n);
  const tol = 1e-11 * Math.max(Math.abs(xFix), 1.0);

  for (let it = 0; it < 45; it++) {
    let anyActive = false;
    for (let i = 0; i < n; i++) {
      let val = xFix;
      let der = 0.0;
      const ui = u[i];
      for (const sp of SPECIES_ORDER) {
        const cs = Math.max(cSol[sp][i], 0.0);
        if (cs <= 0) continue;
        const z = SPECIES_CHARGES[sp];
        const e = Math.exp(Math.max(Math.min(z * ui, 40.0), -40.0));
        val += z * cs * e;
        der += z * z * cs * e;
      }
      if (Math.abs(val) >= tol) {
        anyActive = true;
        if (val < 0.0) lo[i] = Math.max(lo[i], ui);
        else hi[i] = Math.min(hi[i], ui);
        let uNew = ui - val / Math.max(der, 1e-30);
        if (!(uNew > lo[i] && uNew < hi[i])) {
          uNew = 0.5 * (lo[i] + hi[i]);
        }
        u[i] = uNew;
      }
    }
    if (!anyActive) break;
  }

  const cMem = {} as Record<SpeciesName, number[]>;
  for (const sp of SPECIES_ORDER) {
    const z = SPECIES_CHARGES[sp];
    const arr = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const cs = Math.max(cSol[sp][i], 0.0);
      arr[i] =
        cs > 0
          ? cs * Math.exp(Math.max(Math.min(z * u[i], 40.0), -40.0))
          : 0.0;
    }
    cMem[sp] = arr;
  }

  const phiDonnan = Array.from(u, (ui) => -((GAS_CONST * T) / FARADAY) * ui);
  return { cMem, phiDonnan };
}

function evalGhkBatch(
  cMemH: Record<SpeciesName, number[]>,
  cMemL: Record<SpeciesName, number[]>,
  dMem: Record<SpeciesName, number>,
  thickness: number,
  T: number,
  dphiM: Float64Array
) {
  const n = dphiM.length;
  const VT = (GAS_CONST * T) / FARADAY;
  const fluxes = {} as Record<SpeciesName, number[]>;
  const iCalc = new Float64Array(n);
  const dIdPhi = new Float64Array(n);

  for (const sp of SPECIES_ORDER) {
    const z = SPECIES_CHARGES[sp];
    const dm = dMem[sp];
    const cH = cMemH[sp];
    const cL = cMemL[sp];
    const flx = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const xi = (z * dphiM[i]) / VT;
      const fNeg = bernoulli(xi);
      const fPos = bernoulli(-xi);
      const Jk = (dm / thickness) * (fPos * cH[i] - fNeg * cL[i]);
      flx[i] = Jk;
      iCalc[i] += FARADAY * z * Jk;

      const dfNeg = bernoulliDeriv(xi);
      const dfPos = dfNeg + 1.0;
      const dJdPhi = (dm / thickness) * (z / VT) * (dfPos * cH[i] - dfNeg * cL[i]);
      dIdPhi[i] += FARADAY * z * dJdPhi;
    }
    fluxes[sp] = flx;
  }

  return { fluxes, iCalc, dIdPhi };
}

function multiIonMembraneFluxBatch(
  cHighWall: Record<SpeciesName, number[]>,
  cLowWall: Record<SpeciesName, number[]>,
  xFix: number,
  thickness: number,
  dMem: Record<SpeciesName, number>,
  T: number,
  iOp: number,
  computeRobinSlopes: boolean
) {
  const { cMem: cMemH, phiDonnan: phiDH } = multiIonDonnanBatch(
    cHighWall,
    xFix,
    T
  );
  const { cMem: cMemL, phiDonnan: phiDL } = multiIonDonnanBatch(
    cLowWall,
    xFix,
    T
  );
  const n = phiDH.length;

  const solveDphi = (targetI: number) => {
    const dphi = new Float64Array(n);
    const lo = new Float64Array(n).fill(-0.5);
    const hi = new Float64Array(n).fill(0.5);
    for (let it = 0; it < 35; it++) {
      const { iCalc, dIdPhi } = evalGhkBatch(
        cMemH,
        cMemL,
        dMem,
        thickness,
        T,
        dphi
      );
      let anyActive = false;
      for (let i = 0; i < n; i++) {
        const res = iCalc[i] - targetI;
        if (Math.abs(res) >= 1e-9) {
          anyActive = true;
          if (res > 0.0) hi[i] = Math.min(hi[i], dphi[i]);
          else lo[i] = Math.max(lo[i], dphi[i]);
          let dphiNew = dphi[i] - res / Math.max(dIdPhi[i], 1e-12);
          if (!(dphiNew > lo[i] && dphiNew < hi[i])) {
            dphiNew = 0.5 * (lo[i] + hi[i]);
          }
          dphi[i] = dphiNew;
        }
      }
      if (!anyActive) break;
    }
    const evalOut = evalGhkBatch(cMemH, cMemL, dMem, thickness, T, dphi);
    return { fluxes: evalOut.fluxes, dphi };
  };

  const { fluxes: flxOcv, dphi: dphiOcv } = solveDphi(0.0);
  const eOcvMem = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const deltaPhiOcv = -phiDH[i] + dphiOcv[i] + phiDL[i];
    eOcvMem[i] = xFix < 0 ? -deltaPhiOcv : deltaPhiOcv;
  }

  let fluxes: Record<SpeciesName, number[]>;
  let dphiUsed: Float64Array;
  if (Math.abs(iOp) < 1e-12) {
    fluxes = flxOcv;
    dphiUsed = dphiOcv;
  } else {
    const targetI = xFix < 0 ? iOp : -iOp;
    const solved = solveDphi(targetI);
    fluxes = solved.fluxes;
    dphiUsed = solved.dphi;
  }

  let sHOut: Record<SpeciesName, number[]> | null = null;
  let sLOut: Record<SpeciesName, number[]> | null = null;

  if (computeRobinSlopes) {
    const VT = (GAS_CONST * T) / FARADAY;
    sHOut = {} as Record<SpeciesName, number[]>;
    sLOut = {} as Record<SpeciesName, number[]>;
    const denomH = new Float64Array(n);
    const denomL = new Float64Array(n);
    for (const sp of SPECIES_ORDER) {
      const z2 = SPECIES_CHARGES[sp] ** 2;
      for (let i = 0; i < n; i++) {
        denomH[i] += z2 * cMemH[sp][i];
        denomL[i] += z2 * cMemL[sp][i];
      }
    }
    for (let i = 0; i < n; i++) {
      denomH[i] = Math.max(denomH[i], 1e-6);
      denomL[i] = Math.max(denomL[i], 1e-6);
    }

    for (const sp of SPECIES_ORDER) {
      const z = SPECIES_CHARGES[sp];
      const dm = dMem[sp];
      const sh = new Array<number>(n);
      const sl = new Array<number>(n);
      for (let i = 0; i < n; i++) {
        const xi = (z * dphiUsed[i]) / VT;
        const fNeg = bernoulli(xi);
        const fPos = bernoulli(-xi);
        const uH = -phiDH[i] / VT;
        const uL = -phiDL[i] / VT;
        const ratioH = Math.exp(Math.max(Math.min(z * uH, 40.0), -40.0));
        const ratioL = Math.exp(Math.max(Math.min(z * uL, 40.0), -40.0));
        const factorH =
          ratioH * Math.max(1.0 - (z * z * cMemH[sp][i]) / denomH[i], 0.05);
        const factorL =
          ratioL * Math.max(1.0 - (z * z * cMemL[sp][i]) / denomL[i], 0.05);
        sh[i] = (dm / thickness) * fPos * factorH;
        sl[i] = (dm / thickness) * fNeg * factorL;
      }
      sHOut[sp] = sh;
      sLOut[sp] = sl;
    }
  }

  return { fluxes, eOcvMem, sHOut, sLOut };
}

function solveChannelPotential(
  cFields: Record<SpeciesName, number[][]>,
  dIons: Record<SpeciesName, number>,
  geom: ChannelGeom,
  T: number,
  iWallBottom: number[],
  iWallTop: number[]
): number[][] {
  const { nx, ny, dx, dy } = geom;
  const RT_F = (GAS_CONST * T) / FARADAY;
  const kappa: number[][] = Array.from({ length: nx }, () =>
    new Array(ny).fill(0)
  );
  const S: number[][] = Array.from({ length: nx }, () => new Array(ny).fill(0));

  for (const sp of SPECIES_ORDER) {
    const z = SPECIES_CHARGES[sp];
    const D = dIons[sp];
    const c = cFields[sp];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const cv = c[i][j];
        if (cv > 0) {
          kappa[i][j] += (FARADAY / RT_F) * (z * z) * D * cv;
          S[i][j] += FARADAY * z * D * cv;
        }
      }
    }
  }
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (kappa[i][j] < 1e-12) kappa[i][j] = 1e-12;
    }
  }

  const N = nx * ny;
  const lBw = ny;
  const uBw = 2 * ny;
  const width = lBw + uBw + 1;
  const band = new Float64Array(N * width);
  const rhs = new Float64Array(N);

  const idx = (i: number, j: number) => i * ny + j;
  const addA = (row: number, col: number, val: number) => {
    const off = col - row + lBw;
    if (off >= 0 && off < width) {
      band[row * width + off] += val;
    }
  };

  for (let i = 0; i < nx; i++) {
    const dxi = i === 0 || i === nx - 1 ? 0.5 * dx : dx;
    rhs[idx(i, 0)] += dxi * iWallBottom[i];
    rhs[idx(i, ny - 1)] += dxi * iWallTop[i];
    for (let j = 0; j < ny; j++) {
      const dyj = j === 0 || j === ny - 1 ? 0.5 * dy : dy;
      const kCur = idx(i, j);
      if (i < nx - 1) {
        const kE = 0.5 * (kappa[i][j] + kappa[i + 1][j]);
        const cE = (dyj * kE) / dx;
        const sE = (dyj * (S[i + 1][j] - S[i][j])) / dx;
        const kRight = idx(i + 1, j);
        addA(kCur, kCur, cE);
        addA(kRight, kRight, cE);
        addA(kCur, kRight, -cE);
        addA(kRight, kCur, -cE);
        rhs[kCur] += sE;
        rhs[kRight] -= sE;
      }
      if (j < ny - 1) {
        const kN = 0.5 * (kappa[i][j] + kappa[i][j + 1]);
        const cN = (dxi * kN) / dy;
        const sN = (dxi * (S[i][j + 1] - S[i][j])) / dy;
        const kUp = idx(i, j + 1);
        addA(kCur, kCur, cN);
        addA(kUp, kUp, cN);
        addA(kCur, kUp, -cN);
        addA(kUp, kCur, -cN);
        rhs[kCur] += sN;
        rhs[kUp] -= sN;
      }
    }
  }

  // Pin reference potential at inlet mid-height
  const jPin = Math.floor(ny / 2);
  const pinId = idx(0, jPin);
  for (let off = 0; off < width; off++) {
    band[pinId * width + off] = 0.0;
  }
  band[pinId * width + lBw] = 1.0;
  rhs[pinId] = 0.0;

  const sol = solveBandedSystem(N, lBw, uBw, band, rhs);
  return Array.from({ length: nx }, (_, i) =>
    Array.from({ length: ny }, (_, j) => sol[idx(i, j)])
  );
}

function solveSpecies2dNp(
  geom: ChannelGeom,
  flow: FlowSolution,
  phi: number[][],
  zk: number,
  dk: number,
  T: number,
  cInlet: number,
  jBottom: number[],
  jTop: number[],
  sBottom: number[],
  sTop: number[],
  cBottomOld: number[],
  cTopOld: number[]
): number[][] {
  const { nx, ny, dx, dy } = geom;
  let maxJ = 0;
  for (let i = 0; i < nx; i++) {
    maxJ = Math.max(maxJ, Math.abs(jBottom[i]), Math.abs(jTop[i]));
  }
  if (cInlet <= 0.0 && maxJ <= 1e-18) {
    return Array.from({ length: nx }, () => new Array(ny).fill(0));
  }

  const RT_F = (GAS_CONST * T) / FARADAY;
  const N = nx * ny;
  const lBw = ny;
  const uBw = 2 * ny;
  const width = lBw + uBw + 1;
  const band = new Float64Array(N * width);
  const rhs = new Float64Array(N);

  const idx = (i: number, j: number) => i * ny + j;
  const addA = (row: number, col: number, val: number) => {
    const off = col - row + lBw;
    if (off >= 0 && off < width) {
      band[row * width + off] += val;
    }
  };

  for (let i = 0; i < nx; i++) {
    const dxi = i === 0 || i === nx - 1 ? 0.5 * dx : dx;
    rhs[idx(i, 0)] += dxi * jBottom[i] + dxi * Math.max(sBottom[i], 0) * cBottomOld[i];
    addA(idx(i, 0), idx(i, 0), dxi * Math.max(sBottom[i], 0));
    rhs[idx(i, ny - 1)] += dxi * jTop[i] + dxi * Math.max(sTop[i], 0) * cTopOld[i];
    addA(idx(i, ny - 1), idx(i, ny - 1), dxi * Math.max(sTop[i], 0));

    for (let j = 0; j < ny; j++) {
      const dyj = j === 0 || j === ny - 1 ? 0.5 * dy : dy;
      const kCur = idx(i, j);
      if (i === nx - 1) {
        addA(kCur, kCur, dyj * Math.max(flow.u[nx - 1][j], 0.0));
      }
      if (i < nx - 1) {
        const ux = 0.5 * (flow.u[i][j] + flow.u[i + 1][j]);
        const peX = (zk * (phi[i + 1][j] - phi[i][j])) / RT_F;
        const diffX = dyj * (dk / dx);
        const fluxL = diffX * bernoulli(peX) + dyj * Math.max(ux, 0.0);
        const fluxR = -diffX * bernoulli(-peX) + dyj * Math.min(ux, 0.0);
        const kE = idx(i + 1, j);
        addA(kCur, kCur, fluxL);
        addA(kCur, kE, fluxR);
        addA(kE, kE, -fluxR);
        addA(kE, kCur, -fluxL);
      }
      if (j < ny - 1) {
        const peY = (zk * (phi[i][j + 1] - phi[i][j])) / RT_F;
        const diffY = dxi * (dk / dy);
        const fluxS = diffY * bernoulli(peY);
        const fluxN = -diffY * bernoulli(-peY);
        const kN = idx(i, j + 1);
        addA(kCur, kCur, fluxS);
        addA(kCur, kN, fluxN);
        addA(kN, kN, -fluxN);
        addA(kN, kCur, -fluxS);
      }
    }
  }

  // Dirichlet inlet i === 0
  for (let j = 0; j < ny; j++) {
    const id = idx(0, j);
    for (let off = 0; off < width; off++) {
      band[id * width + off] = 0.0;
    }
    band[id * width + lBw] = 1.0;
    rhs[id] = cInlet;
  }

  const sol = solveBandedSystem(N, lBw, uBw, band, rhs);
  return Array.from({ length: nx }, (_, i) =>
    Array.from({ length: ny }, (_, j) => Math.max(sol[idx(i, j)], 0.0))
  );
}

function solveSmallDenseSystem(A: number[][], b: number[]): number[] | null {
  const m = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < m; k++) {
    let piv = k;
    for (let r = k + 1; r < m; r++) {
      if (Math.abs(M[r][k]) > Math.abs(M[piv][k])) piv = r;
    }
    if (Math.abs(M[piv][k]) < 1e-18) return null;
    if (piv !== k) {
      const tmp = M[k];
      M[k] = M[piv];
      M[piv] = tmp;
    }
    for (let r = k + 1; r < m; r++) {
      const f = M[r][k] / M[k][k];
      for (let c = k; c <= m; c++) M[r][c] -= f * M[k][c];
    }
  }
  const x = new Array<number>(m).fill(0);
  for (let k = m - 1; k >= 0; k--) {
    let s = M[k][m];
    for (let c = k + 1; c < m; c++) s -= M[k][c] * x[c];
    x[k] = s / M[k][k];
  }
  return x;
}

export interface MulticomponentRunOutput {
  solverMode: 'multicomponent';
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
    omegaCalciteCemProfile: number[];
    omegaGypsumCemProfile: number[];
    ionicStrengthCemProfile: number[];
    siCalciteAemProfile: number[];
    siGypsumAemProfile: number[];
    daviesSiCalciteProfile: number[];
    daviesSiGypsumProfile: number[];
    omegaCalciteOutlet: number;
    siCalciteOutlet: number;
    omegaGypsumOutlet: number;
    siGypsumOutlet: number;
    siCalciteCemMax: number;
    siGypsumCemMax: number;
    omegaCalciteCemMax: number;
    omegaGypsumCemMax: number;
    waterActivityOutlet: number;
    gammaCaOutlet: number;
    gammaCo3Outlet: number;
    gammaSo4Outlet: number;
    ionicStrengthMolal: number;
    daviesValidityFlag: string;
    cntCalcite: HeterogeneousNucleationResult;
    cntGypsum: HeterogeneousNucleationResult;
    cntCalciteMax: HeterogeneousNucleationResult;
    cntGypsumMax: HeterogeneousNucleationResult;
  };
  multicomponent: {
    speciesOrder: readonly SpeciesName[];
    concInlet: Record<SpeciesName, number>;
    dilInlet: Record<SpeciesName, number>;
    cConcSpecies: Record<SpeciesName, number[][]>;
    cDilSpecies: Record<SpeciesName, number[][]>;
    jCemSpecies: Record<SpeciesName, number[]>;
    jAemSpecies: Record<SpeciesName, number[]>;
    massBalanceConcSpecies: Record<SpeciesName, number>;
    massBalanceDilSpecies: Record<SpeciesName, number>;
    maxElectroneutralityErrConc: number;
    maxElectroneutralityErrDil: number;
    iOpAM2: number;
    vCellV: number;
    pGrossLoadedWM2: number;
  };
}

export function runMulticomponentSimulation(
  partialCfg: Partial<SimulationConfig> = {}
): MulticomponentRunOutput {
  const t0 = performance.now();
  const cfg: SimulationConfig = {
    ...DEFAULT_SIM_CONFIG,
    nx: 45,
    ny: 18,
    maxCouplingIter: 45,
    couplingTol: 2e-4,
    relaxation: 0.35,
    ...partialCfg,
  };

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

  const muEff = cfg.temperatureDependentProperties
    ? vogelWaterViscosity(cfg.T, cfg.mu)
    : cfg.mu;
  const dIons = cfg.temperatureDependentProperties
    ? stokesEinsteinDiffusivities(cfg.T, cfg.mu)
    : { ...SPECIES_D_25C };
  const dMemCem = buildMembraneDiffusivities(dIons, true);
  const dMemAem = buildMembraneDiffusivities(dIons, false);

  const flowConc = analyticalPoiseuille2d(
    geomConc,
    cfg.uMeanConc,
    cfg.rho,
    muEff
  );
  const flowDil = analyticalPoiseuille2d(
    geomDil,
    cfg.uMeanDil,
    cfg.rho,
    muEff
  );

  // Build charge-balanced inlet species dicts matching brine & chemistry sliders
  const concRaw: Record<SpeciesName, number> = {
    Na: Math.max(cfg.cConcInlet, 0),
    K: Math.max(cfg.kInletMolM3, 0),
    Mg: Math.max(cfg.mgInletMolM3, 0),
    Ca: Math.max(cfg.caInletMolM3, 0),
    Cl: 0,
    SO4: Math.max(cfg.so4InletMolM3, 0),
    HCO3: Math.max(cfg.hco3InletMolM3, 0),
    CO3: Math.max(cfg.co3InletMolM3, 0),
  };
  const clBalConc =
    concRaw.Na +
    concRaw.K +
    2 * concRaw.Mg +
    2 * concRaw.Ca -
    2 * concRaw.SO4 -
    concRaw.HCO3 -
    2 * concRaw.CO3;
  if (clBalConc >= 0) {
    concRaw.Cl = clBalConc;
  } else {
    concRaw.Na += -clBalConc;
    concRaw.Cl = 0;
  }

  const dilRaw: Record<SpeciesName, number> = {
    Na: Math.max(cfg.cDilInlet, 0),
    K: 0,
    Mg: 0,
    Ca: 0,
    Cl: Math.max(cfg.cDilInlet, 0),
    SO4: 0,
    HCO3: 0,
    CO3: 0,
  };

  const activeSpecies = SPECIES_ORDER.filter(
    (sp) => concRaw[sp] > 0 || dilRaw[sp] > 0
  );
  const indepSpecies = activeSpecies.filter((sp) => sp !== 'Cl');

  const cConc = {} as Record<SpeciesName, number[][]>;
  const cDil = {} as Record<SpeciesName, number[][]>;
  for (const sp of SPECIES_ORDER) {
    cConc[sp] = Array.from({ length: cfg.nx }, () =>
      new Array(cfg.ny).fill(concRaw[sp])
    );
    cDil[sp] = Array.from({ length: cfg.nx }, () =>
      new Array(cfg.ny).fill(dilRaw[sp])
    );
  }

  let phiConc = Array.from({ length: cfg.nx }, () =>
    new Array(cfg.ny).fill(0)
  );
  let phiDil = Array.from({ length: cfg.nx }, () =>
    new Array(cfg.ny).fill(0)
  );
  let jCemSp = {} as Record<SpeciesName, number[]>;
  let jAemSp = {} as Record<SpeciesName, number[]>;
  for (const sp of SPECIES_ORDER) {
    jCemSp[sp] = new Array(cfg.nx).fill(0);
    jAemSp[sp] = new Array(cfg.nx).fill(0);
  }
  let eCemProf = new Array(cfg.nx).fill(0);
  let eAemProf = new Array(cfg.nx).fill(0);

  const channelCond = (fields: Record<SpeciesName, number[][]>) => {
    const RT_F = (GAS_CONST * cfg.T) / FARADAY;
    let sum = 0;
    for (let i = 0; i < cfg.nx; i++) {
      for (let j = 0; j < cfg.ny; j++) {
        let kap = 0;
        for (const sp of activeSpecies) {
          const z = SPECIES_CHARGES[sp];
          kap += (FARADAY / RT_F) * (z * z) * dIons[sp] * fields[sp][i][j];
        }
        sum += kap;
      }
    }
    return sum / (cfg.nx * cfg.ny);
  };

  const spScaleConc = {} as Record<SpeciesName, number>;
  const spScaleDil = {} as Record<SpeciesName, number>;
  for (const sp of activeSpecies) {
    spScaleConc[sp] = Math.max(concRaw[sp], 0.1 * dilRaw[sp], 1e-2);
    spScaleDil[sp] = Math.max(dilRaw[sp], 0.05 * concRaw[sp], 1e-2);
  }

  const blk = cfg.nx * cfg.ny;
  const vecLen = indepSpecies.length * 2 * blk;

  const packState = (
    cc: Record<SpeciesName, number[][]>,
    cd: Record<SpeciesName, number[][]>
  ) => {
    const out = new Float64Array(vecLen);
    let pos = 0;
    for (const sp of indepSpecies) {
      const sc = spScaleConc[sp];
      const sd = spScaleDil[sp];
      for (let i = 0; i < cfg.nx; i++) {
        for (let j = 0; j < cfg.ny; j++) out[pos++] = cc[sp][i][j] / sc;
      }
      for (let i = 0; i < cfg.nx; i++) {
        for (let j = 0; j < cfg.ny; j++) out[pos++] = cd[sp][i][j] / sd;
      }
    }
    return out;
  };

  const unpackState = (vec: Float64Array) => {
    let pos = 0;
    for (const sp of indepSpecies) {
      const sc = spScaleConc[sp];
      const sd = spScaleDil[sp];
      for (let i = 0; i < cfg.nx; i++) {
        for (let j = 0; j < cfg.ny; j++)
          cConc[sp][i][j] = Math.max(vec[pos++] * sc, 0.0);
      }
      for (let i = 0; i < cfg.nx; i++) {
        for (let j = 0; j < cfg.ny; j++)
          cDil[sp][i][j] = Math.max(vec[pos++] * sd, 0.0);
      }
    }
    for (let i = 0; i < cfg.nx; i++) {
      for (let j = 0; j < cfg.ny; j++) {
        let clc = 0;
        let cld = 0;
        for (const sp of indepSpecies) {
          const z = SPECIES_CHARGES[sp];
          clc += z * cConc[sp][i][j];
          cld += z * cDil[sp][i][j];
        }
        cConc.Cl[i][j] = Math.max(clc, 0.0);
        cDil.Cl[i][j] = Math.max(cld, 0.0);
      }
    }
  };

  const mAa = 4;
  let aaXHist: Float64Array[] = [];
  let aaFHist: Float64Array[] = [];
  let iOp = 0;
  let bestRes = Infinity;
  let stagnantCount = 0;
  let converged = false;
  let iter = 0;
  const convergenceHistory: MulticomponentRunOutput['convergenceHistory'] = [];

  const rDeltaRmOhmM2 = Math.max(0, cfg.deltaRmOhmCm2) * 1e-4;

  const sliceWalls = (fields: Record<SpeciesName, number[][]>, jIdx: number) => {
    const out = {} as Record<SpeciesName, number[]>;
    for (const sp of SPECIES_ORDER) {
      out[sp] = fields[sp].map((col) => col[jIdx]);
    }
    return out;
  };

  for (; iter < cfg.maxCouplingIter; iter++) {
    const wHCem = sliceWalls(cConc, 0);
    const wLCem = sliceWalls(cDil, cfg.ny - 1);
    const wHAem = sliceWalls(cConc, cfg.ny - 1);
    const wLAem = sliceWalls(cDil, 0);

    if (cfg.loadFraction > 0) {
      if (iter === 0) {
        eCemProf = multiIonMembraneFluxBatch(
          wHCem,
          wLCem,
          cfg.xCem,
          cfg.membraneThicknessCem,
          dMemCem,
          cfg.T,
          0.0,
          false
        ).eOcvMem;
        eAemProf = multiIonMembraneFluxBatch(
          wHAem,
          wLAem,
          cfg.xAem,
          cfg.membraneThicknessAem,
          dMemAem,
          cfg.T,
          0.0,
          false
        ).eOcvMem;
      }
      const sigC = Math.max(channelCond(cConc), 1e-10);
      const sigD = Math.max(channelCond(cDil), 1e-10);
      const rTmp =
        cfg.channelHeight / sigC +
        cfg.channelHeight / sigD +
        cfg.membraneThicknessCem / Math.max(cfg.sigmaCem, 1e-10) +
        cfg.membraneThicknessAem / Math.max(cfg.sigmaAem, 1e-10) +
        rDeltaRmOhmM2;
      let eSum = 0;
      for (let i = 0; i < cfg.nx; i++) eSum += eCemProf[i] + eAemProf[i];
      const iNew = cfg.loadFraction * (eSum / cfg.nx / rTmp);
      iOp = iter === 0 ? iNew : 0.5 * iNew + 0.5 * iOp;
    } else {
      iOp = 0;
    }

    const cemRes = multiIonMembraneFluxBatch(
      wHCem,
      wLCem,
      cfg.xCem,
      cfg.membraneThicknessCem,
      dMemCem,
      cfg.T,
      iOp,
      true
    );
    const aemRes = multiIonMembraneFluxBatch(
      wHAem,
      wLAem,
      cfg.xAem,
      cfg.membraneThicknessAem,
      dMemAem,
      cfg.T,
      iOp,
      true
    );
    jCemSp = cemRes.fluxes;
    eCemProf = cemRes.eOcvMem;
    jAemSp = aemRes.fluxes;
    eAemProf = aemRes.eOcvMem;

    const iCemArr = new Array<number>(cfg.nx).fill(0);
    const iAemArr = new Array<number>(cfg.nx).fill(0);
    for (const sp of activeSpecies) {
      const z = SPECIES_CHARGES[sp];
      for (let i = 0; i < cfg.nx; i++) {
        iCemArr[i] += FARADAY * z * jCemSp[sp][i];
        iAemArr[i] += FARADAY * z * jAemSp[sp][i];
      }
    }

    phiConc = solveChannelPotential(
      cConc,
      dIons,
      geomConc,
      cfg.T,
      iCemArr.map((v) => -v),
      iAemArr.map((v) => -v)
    );
    phiDil = solveChannelPotential(
      cDil,
      dIons,
      geomDil,
      cfg.T,
      iAemArr,
      iCemArr
    );

    const cConcTarget = {} as Record<SpeciesName, number[][]>;
    const cDilTarget = {} as Record<SpeciesName, number[][]>;
    let rawResMax = 0;
    let errCMax = 0;
    let errDMax = 0;

    for (const sp of indepSpecies) {
      const z = SPECIES_CHARGES[sp];
      const dk = dIons[sp];
      const ccN = solveSpecies2dNp(
        geomConc,
        flowConc,
        phiConc,
        z,
        dk,
        cfg.T,
        concRaw[sp],
        jCemSp[sp].map((v) => -v),
        jAemSp[sp].map((v) => -v),
        cemRes.sHOut![sp],
        aemRes.sHOut![sp],
        wHCem[sp],
        wHAem[sp]
      );
      const cdN = solveSpecies2dNp(
        geomDil,
        flowDil,
        phiDil,
        z,
        dk,
        cfg.T,
        dilRaw[sp],
        jAemSp[sp],
        jCemSp[sp],
        aemRes.sLOut![sp],
        cemRes.sLOut![sp],
        wLAem[sp],
        wLCem[sp]
      );
      cConcTarget[sp] = ccN;
      cDilTarget[sp] = cdN;
      for (let i = 0; i < cfg.nx; i++) {
        for (let j = 0; j < cfg.ny; j++) {
          const ec = Math.abs(ccN[i][j] - cConc[sp][i][j]) / spScaleConc[sp];
          const ed = Math.abs(cdN[i][j] - cDil[sp][i][j]) / spScaleDil[sp];
          if (ec > errCMax) errCMax = ec;
          if (ed > errDMax) errDMax = ed;
        }
      }
    }
    rawResMax = Math.max(errCMax, errDMax);

    let jCemSum = 0;
    let jAemSum = 0;
    for (let i = 0; i < cfg.nx; i++) {
      jCemSum += jCemSp.Na[i];
      jAemSum += jAemSp.Cl[i];
    }
    convergenceHistory.push({
      iter,
      errConc: errCMax,
      errDil: errDMax,
      errMax: rawResMax,
      jCemAvg: jCemSum / cfg.nx,
      jAemAvg: jAemSum / cfg.nx,
    });

    if (rawResMax < 0.98 * bestRes) {
      bestRes = rawResMax;
      stagnantCount = 0;
    } else {
      stagnantCount++;
    }

    // Robin linearization check matching multicomponent_transport.py
    let robinRelErr = 0;
    const dxFvm = new Array<number>(cfg.nx).fill(geomConc.dx);
    dxFvm[0] = 0;
    dxFvm[cfg.nx - 1] = 0.5 * geomConc.dx;

    for (const sp of indepSpecies) {
      let wTotC = 0;
      let robC = 0;
      let wTotD = 0;
      let robD = 0;
      for (let i = 0; i < cfg.nx; i++) {
        wTotC += dxFvm[i] * (-jCemSp[sp][i] - jAemSp[sp][i]);
        robC +=
          dxFvm[i] *
          (cemRes.sHOut![sp][i] *
            Math.abs(cConcTarget[sp][i][0] - cConc[sp][i][0]) +
            aemRes.sHOut![sp][i] *
              Math.abs(
                cConcTarget[sp][i][cfg.ny - 1] - cConc[sp][i][cfg.ny - 1]
              ));
        wTotD += dxFvm[i] * (jAemSp[sp][i] + jCemSp[sp][i]);
        robD +=
          dxFvm[i] *
          (aemRes.sLOut![sp][i] *
            Math.abs(cDilTarget[sp][i][0] - cDil[sp][i][0]) +
            cemRes.sLOut![sp][i] *
              Math.abs(
                cDilTarget[sp][i][cfg.ny - 1] - cDil[sp][i][cfg.ny - 1]
              ));
      }
      const denomC = Math.max(
        Math.abs(cfg.uMeanConc * cfg.channelHeight * concRaw[sp]) +
          Math.abs(wTotC),
        1e-12
      );
      const denomD = Math.max(
        Math.abs(cfg.uMeanDil * cfg.channelHeight * dilRaw[sp]) +
          Math.abs(wTotD),
        1e-12
      );
      robinRelErr = Math.max(
        robinRelErr,
        Math.abs(robC) / denomC,
        Math.abs(robD) / denomD
      );
    }

    if (rawResMax < cfg.couplingTol && robinRelErr < 0.005) {
      for (const sp of indepSpecies) {
        cConc[sp] = cConcTarget[sp];
        cDil[sp] = cDilTarget[sp];
      }
      for (let i = 0; i < cfg.nx; i++) {
        for (let j = 0; j < cfg.ny; j++) {
          let clc = 0;
          let cld = 0;
          for (const sp of indepSpecies) {
            const z = SPECIES_CHARGES[sp];
            clc += z * cConc[sp][i][j];
            cld += z * cDil[sp][i][j];
          }
          cConc.Cl[i][j] = Math.max(clc, 0);
          cDil.Cl[i][j] = Math.max(cld, 0);
        }
      }
      // Final potential & flux consistency pass
      const fHCem = sliceWalls(cConc, 0);
      const fLCem = sliceWalls(cDil, cfg.ny - 1);
      const fHAem = sliceWalls(cConc, cfg.ny - 1);
      const fLAem = sliceWalls(cDil, 0);
      const fc = multiIonMembraneFluxBatch(
        fHCem,
        fLCem,
        cfg.xCem,
        cfg.membraneThicknessCem,
        dMemCem,
        cfg.T,
        iOp,
        false
      );
      const fa = multiIonMembraneFluxBatch(
        fHAem,
        fLAem,
        cfg.xAem,
        cfg.membraneThicknessAem,
        dMemAem,
        cfg.T,
        iOp,
        false
      );
      jCemSp = fc.fluxes;
      eCemProf = fc.eOcvMem;
      jAemSp = fa.fluxes;
      eAemProf = fa.eOcvMem;
      const icArr = new Array<number>(cfg.nx).fill(0);
      const iaArr = new Array<number>(cfg.nx).fill(0);
      for (const sp of activeSpecies) {
        const z = SPECIES_CHARGES[sp];
        for (let i = 0; i < cfg.nx; i++) {
          icArr[i] += FARADAY * z * jCemSp[sp][i];
          iaArr[i] += FARADAY * z * jAemSp[sp][i];
        }
      }
      phiConc = solveChannelPotential(
        cConc,
        dIons,
        geomConc,
        cfg.T,
        icArr.map((v) => -v),
        iaArr.map((v) => -v)
      );
      phiDil = solveChannelPotential(cDil, dIons, geomDil, cfg.T, iaArr, icArr);
      converged = true;
      iter++;
      break;
    }

    // Anderson Acceleration (DIIS, m = 4)
    const xCurr = packState(cConc, cDil);
    const gCurr = packState(cConcTarget, cDilTarget);
    const fCurr = new Float64Array(vecLen);
    let maxAbsF = 0;
    for (let k = 0; k < vecLen; k++) {
      fCurr[k] = gCurr[k] - xCurr[k];
      maxAbsF = Math.max(maxAbsF, Math.abs(fCurr[k]));
    }

    if (stagnantCount >= 6) {
      aaXHist = [xCurr];
      aaFHist = [fCurr];
      stagnantCount = 0;
      const xNext = new Float64Array(vecLen);
      for (let k = 0; k < vecLen; k++) {
        xNext[k] = Math.max(xCurr[k] + 0.5 * cfg.relaxation * fCurr[k], 0.0);
      }
      unpackState(xNext);
      continue;
    }

    aaXHist.push(xCurr);
    aaFHist.push(fCurr);
    if (aaXHist.length > mAa + 1) {
      aaXHist.shift();
      aaFHist.shift();
    }

    const mk = aaXHist.length - 1;
    const alpha = cfg.relaxation;
    const xNext = new Float64Array(vecLen);
    let usedAa = false;

    if (mk >= 1) {
      const gram: number[][] = Array.from({ length: mk }, () =>
        new Array(mk).fill(0)
      );
      const rhsAa = new Array<number>(mk).fill(0);
      for (let r = 0; r < mk; r++) {
        for (let c = r; c < mk; c++) {
          let dot = 0;
          for (let k = 0; k < vecLen; k++) {
            const dfr = aaFHist[r + 1][k] - aaFHist[r][k];
            const dfc = aaFHist[c + 1][k] - aaFHist[c][k];
            dot += dfr * dfc;
          }
          gram[r][c] = dot + (r === c ? 1e-10 : 0);
          gram[c][r] = gram[r][c];
        }
        let drhs = 0;
        for (let k = 0; k < vecLen; k++) {
          drhs += (aaFHist[r + 1][k] - aaFHist[r][k]) * fCurr[k];
        }
        rhsAa[r] = drhs;
      }

      const gamma = solveSmallDenseSystem(gram, rhsAa);
      if (gamma) {
        let minCand = Infinity;
        let maxStep = 0;
        for (let k = 0; k < vecLen; k++) {
          let dxDot = 0;
          let dfDot = 0;
          for (let j = 0; j < mk; j++) {
            dxDot += (aaXHist[j + 1][k] - aaXHist[j][k]) * gamma[j];
            dfDot += (aaFHist[j + 1][k] - aaFHist[j][k]) * gamma[j];
          }
          const val = xCurr[k] - dxDot + alpha * (fCurr[k] - dfDot);
          xNext[k] = val;
          if (val < minCand) minCand = val;
          maxStep = Math.max(maxStep, Math.abs(val - xCurr[k]));
        }
        if (minCand >= -0.05 && maxStep <= 3.0 * maxAbsF + 1e-6) {
          for (let k = 0; k < vecLen; k++) xNext[k] = Math.max(xNext[k], 0.0);
          usedAa = true;
        } else {
          aaXHist = [xCurr];
          aaFHist = [fCurr];
        }
      }
    }

    if (!usedAa) {
      for (let k = 0; k < vecLen; k++) {
        xNext[k] = Math.max(xCurr[k] + alpha * fCurr[k], 0.0);
      }
    }
    unpackState(xNext);
  }

  // Electrical calculations matching multicomponent_transport.py
  const eOcv =
    eCemProf.reduce((s, v, i) => s + v + eAemProf[i], 0) / cfg.nx;
  const sigCAvg = Math.max(channelCond(cConc), 1e-10);
  const sigDAvg = Math.max(channelCond(cDil), 1e-10);
  const rConc = cfg.channelHeight / sigCAvg;
  const rDil = cfg.channelHeight / sigDAvg;
  const rCem = cfg.membraneThicknessCem / Math.max(cfg.sigmaCem, 1e-10);
  const rAem = cfg.membraneThicknessAem / Math.max(cfg.sigmaAem, 1e-10);
  const rInt = rConc + rDil + rCem + rAem + rDeltaRmOhmM2;
  const pGrossMax = (eOcv * eOcv) / (4.0 * rInt);
  const vCell = Math.max(eOcv - iOp * rInt, 0.0);
  const pGrossLoaded = iOp > 0 ? iOp * vCell : pGrossMax;
  const pPumpConc =
    (flowConc.deltaP * cfg.uMeanConc * cfg.channelHeight) /
    (cfg.etaPump * cfg.channelLength);
  const pPumpDil =
    (flowDil.deltaP * cfg.uMeanDil * cfg.channelHeight) /
    (cfg.etaPump * cfg.channelLength);
  const pPumpTotal = pPumpConc + pPumpDil;
  const pNetMax = pGrossMax - pPumpTotal;

  // Discrete FVM species mass balance & electroneutrality error
  const dx = geomConc.dx;
  const dyC = geomConc.dy;
  const dyD = geomDil.dy;
  const dxFvm = new Array<number>(cfg.nx).fill(dx);
  dxFvm[0] = 0;
  dxFvm[cfg.nx - 1] = 0.5 * dx;
  const dyWC = new Array<number>(cfg.ny).fill(dyC);
  dyWC[0] = 0.5 * dyC;
  dyWC[cfg.ny - 1] = 0.5 * dyC;
  const dyWD = new Array<number>(cfg.ny).fill(dyD);
  dyWD[0] = 0.5 * dyD;
  dyWD[cfg.ny - 1] = 0.5 * dyD;
  const RT_F = (GAS_CONST * cfg.T) / FARADAY;

  const mbConc = {} as Record<SpeciesName, number>;
  const mbDil = {} as Record<SpeciesName, number>;
  let maxMbConcAll = 0;
  let maxMbDilAll = 0;

  for (const sp of SPECIES_ORDER) {
    if (!activeSpecies.includes(sp)) {
      mbConc[sp] = 0;
      mbDil[sp] = 0;
      continue;
    }
    const z = SPECIES_CHARGES[sp];
    const dk = dIons[sp];
    let mcIn = 0;
    let mcOut = 0;
    let mdIn = 0;
    let mdOut = 0;
    for (let j = 0; j < cfg.ny; j++) {
      const uxc = 0.5 * (flowConc.u[0][j] + flowConc.u[1][j]);
      const pec = (z * (phiConc[1][j] - phiConc[0][j])) / RT_F;
      const flc = dyWC[j] * (dk / dx) * bernoulli(pec) + dyWC[j] * Math.max(uxc, 0);
      const frc = -dyWC[j] * (dk / dx) * bernoulli(-pec) + dyWC[j] * Math.min(uxc, 0);
      mcIn += flc * cConc[sp][0][j] + frc * cConc[sp][1][j];
      mcOut += dyWC[j] * flowConc.u[cfg.nx - 1][j] * cConc[sp][cfg.nx - 1][j];

      const uxd = 0.5 * (flowDil.u[0][j] + flowDil.u[1][j]);
      const ped = (z * (phiDil[1][j] - phiDil[0][j])) / RT_F;
      const fld = dyWD[j] * (dk / dx) * bernoulli(ped) + dyWD[j] * Math.max(uxd, 0);
      const frd = -dyWD[j] * (dk / dx) * bernoulli(-ped) + dyWD[j] * Math.min(uxd, 0);
      mdIn += fld * cDil[sp][0][j] + frd * cDil[sp][1][j];
      mdOut += dyWD[j] * flowDil.u[cfg.nx - 1][j] * cDil[sp][cfg.nx - 1][j];
    }
    let wc = 0;
    let wd = 0;
    for (let i = 0; i < cfg.nx; i++) {
      wc += dxFvm[i] * (-jCemSp[sp][i] - jAemSp[sp][i]);
      wd += dxFvm[i] * (jAemSp[sp][i] + jCemSp[sp][i]);
    }
    const ec =
      Math.abs(mcIn) > 1e-16 || Math.abs(wc) > 1e-16
        ? Math.abs(mcIn + wc - mcOut) /
          Math.max(Math.abs(mcIn) + Math.abs(wc), Math.abs(mcOut), 1e-18)
        : 0;
    const ed =
      Math.abs(mdIn) > 1e-16 || Math.abs(wd) > 1e-16
        ? Math.abs(mdIn + wd - mdOut) /
          Math.max(Math.abs(mdIn) + Math.abs(wd), Math.abs(mdOut), 1e-18)
        : 0;
    mbConc[sp] = ec;
    mbDil[sp] = ed;
    maxMbConcAll = Math.max(maxMbConcAll, ec);
    maxMbDilAll = Math.max(maxMbDilAll, ed);
  }

  let enErrC = 0;
  let enErrD = 0;
  for (let i = 0; i < cfg.nx; i++) {
    for (let j = 0; j < cfg.ny; j++) {
      let nqc = 0;
      let aqc = 0;
      let nqd = 0;
      let aqd = 0;
      for (const sp of activeSpecies) {
        const z = SPECIES_CHARGES[sp];
        nqc += z * cConc[sp][i][j];
        aqc += Math.abs(z) * cConc[sp][i][j];
        nqd += z * cDil[sp][i][j];
        aqd += Math.abs(z) * cDil[sp][i][j];
      }
      enErrC = Math.max(enErrC, Math.abs(nqc) / Math.max(aqc, 1e-12));
      enErrD = Math.max(enErrD, Math.abs(nqd) / Math.max(aqd, 1e-12));
    }
  }

  // Average CEM / AEM apparent permselectivities across Donnan equilibrium
  const donCemConc = multiIonDonnanBatch(sliceWalls(cConc, 0), cfg.xCem, cfg.T);
  const donCemDil = multiIonDonnanBatch(
    sliceWalls(cDil, cfg.ny - 1),
    cfg.xCem,
    cfg.T
  );
  const cemAlphaConc = new Array<number>(cfg.nx);
  const cemAlphaDil = new Array<number>(cfg.nx);
  for (let i = 0; i < cfg.nx; i++) {
    let coC = 0;
    let coD = 0;
    for (const sp of SPECIES_ORDER) {
      if (SPECIES_CHARGES[sp] < 0) {
        coC += Math.abs(SPECIES_CHARGES[sp]) * donCemConc.cMem[sp][i];
        coD += Math.abs(SPECIES_CHARGES[sp]) * donCemDil.cMem[sp][i];
      }
    }
    cemAlphaConc[i] = Math.abs(cfg.xCem) / (Math.abs(cfg.xCem) + 2 * coC);
    cemAlphaDil[i] = Math.abs(cfg.xCem) / (Math.abs(cfg.xCem) + 2 * coD);
  }
  const alphaCemAvg = cemAlphaConc.reduce((s, v) => s + v, 0) / cfg.nx;
  const donAemConc = multiIonDonnanBatch(
    sliceWalls(cConc, cfg.ny - 1),
    cfg.xAem,
    cfg.T
  );
  let alphaAemAvg = 0;
  for (let i = 0; i < cfg.nx; i++) {
    let coA = 0;
    for (const sp of SPECIES_ORDER) {
      if (SPECIES_CHARGES[sp] > 0) {
        coA += Math.abs(SPECIES_CHARGES[sp]) * donAemConc.cMem[sp][i];
      }
    }
    alphaAemAvg += Math.abs(cfg.xAem) / (Math.abs(cfg.xAem) + 2 * coA) / cfg.nx;
  }

  // Diffusive flux magnitude fields of primary cation Na+ for FieldCanvas
  const makeDiff = (grid: number[][], geom: ChannelGeom, dk: number) => {
    const jx = Array.from({ length: geom.nx }, () => new Array(geom.ny).fill(0));
    const jy = Array.from({ length: geom.nx }, () => new Array(geom.ny).fill(0));
    for (let i = 0; i < geom.nx; i++) {
      for (let j = 0; j < geom.ny; j++) {
        jx[i][j] =
          i === 0
            ? (-dk * (grid[1][j] - grid[0][j])) / geom.dx
            : i === geom.nx - 1
              ? (-dk * (grid[geom.nx - 1][j] - grid[geom.nx - 2][j])) / geom.dx
              : (-dk * (grid[i + 1][j] - grid[i - 1][j])) / (2 * geom.dx);
        jy[i][j] =
          j === 0
            ? (-dk * (grid[i][1] - grid[i][0])) / geom.dy
            : j === geom.ny - 1
              ? (-dk * (grid[i][geom.ny - 1] - grid[i][geom.ny - 2])) / geom.dy
              : (-dk * (grid[i][j + 1] - grid[i][j - 1])) / (2 * geom.dy);
      }
    }
    return { jx, jy };
  };
  const { jx: jxConc, jy: jyConc } = makeDiff(cConc.Na, geomConc, dIons.Na);
  const { jx: jxDil, jy: jyDil } = makeDiff(cDil.Na, geomDil, dIons.Na);

  // Polarization curve
  const iShort = eOcv / Math.max(rInt, 1e-12);
  const polarizationCurve = Array.from({ length: 25 }, (_, k) => {
    const cur = (k / 24) * iShort;
    const v = eOcv - cur * rInt;
    return { i: cur, v, p: cur * v };
  });

  // One-way coupled USGS Pitzer HMW geochemistry at every streamwise CEM and AEM wall node
  const siCalciteCemProfile = new Array<number>(cfg.nx);
  const siGypsumCemProfile = new Array<number>(cfg.nx);
  const omegaCalciteCemProfile = new Array<number>(cfg.nx);
  const omegaGypsumCemProfile = new Array<number>(cfg.nx);
  const ionicStrengthCemProfile = new Array<number>(cfg.nx);
  const siCalciteAemProfile = new Array<number>(cfg.nx);
  const siGypsumAemProfile = new Array<number>(cfg.nx);
  const daviesSiCalciteProfile = new Array<number>(cfg.nx);
  const daviesSiGypsumProfile = new Array<number>(cfg.nx);

  let lastSat = evaluateMineralSaturationPitzer(concRaw, cfg.pH, cfg.T);
  let omegaCalCemMax = -Infinity;
  let omegaGypCemMax = -Infinity;
  let siCalCemMax = -Infinity;
  let siGypCemMax = -Infinity;

  for (let ix = 0; ix < cfg.nx; ix++) {
    const cemWall = {} as Record<SpeciesName, number>;
    const aemWall = {} as Record<SpeciesName, number>;
    for (const sp of SPECIES_ORDER) {
      cemWall[sp] = cConc[sp][ix][0];
      aemWall[sp] = cConc[sp][ix][cfg.ny - 1];
    }
    const satCem = evaluateMineralSaturationPitzer(cemWall, cfg.pH, cfg.T);
    const satAem = evaluateMineralSaturationPitzer(aemWall, cfg.pH, cfg.T);
    lastSat = satCem;

    siCalciteCemProfile[ix] = satCem.si_calcite;
    siGypsumCemProfile[ix] = satCem.si_gypsum;
    omegaCalciteCemProfile[ix] = satCem.omega_calcite;
    omegaGypsumCemProfile[ix] = satCem.omega_gypsum;
    ionicStrengthCemProfile[ix] = satCem.ionic_strength_molal;
    daviesSiCalciteProfile[ix] = satCem.davies_si_calcite;
    daviesSiGypsumProfile[ix] = satCem.davies_si_gypsum;

    siCalciteAemProfile[ix] = satAem.si_calcite;
    siGypsumAemProfile[ix] = satAem.si_gypsum;

    if (satCem.omega_calcite > omegaCalCemMax) {
      omegaCalCemMax = satCem.omega_calcite;
      siCalCemMax = satCem.si_calcite;
    }
    if (satCem.omega_gypsum > omegaGypCemMax) {
      omegaGypCemMax = satCem.omega_gypsum;
      siGypCemMax = satCem.si_gypsum;
    }
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
  const cntCalciteMax = evaluateHeterogeneousNucleation(
    'Calcite',
    omegaCalCemMax,
    cfg.T,
    cfg.contactAngleCemDeg,
    cfg.roughnessFactorCem
  );
  const cntGypsumMax = evaluateHeterogeneousNucleation(
    'Gypsum',
    omegaGypCemMax,
    cfg.T,
    cfg.contactAngleCemDeg,
    cfg.roughnessFactorCem
  );

  // Sum total cation normality as representative cConc / cDil or Na+ for scalar map
  const totalNorm = (fields: Record<SpeciesName, number[][]>) =>
    Array.from({ length: cfg.nx }, (_, i) =>
      Array.from({ length: cfg.ny }, (_, j) =>
        fields.Na[i][j] +
        fields.K[i][j] +
        2 * fields.Mg[i][j] +
        2 * fields.Ca[i][j]
      )
    );

  // Sum net transmembrane cation + anion salt flux
  const jCemNet = Array.from(
    { length: cfg.nx },
    (_, i) =>
      jCemSp.Na[i] +
      jCemSp.K[i] +
      2 * jCemSp.Mg[i] +
      2 * jCemSp.Ca[i]
  );
  const jAemNet = Array.from(
    { length: cfg.nx },
    (_, i) =>
      jAemSp.Cl[i] +
      2 * jAemSp.SO4[i] +
      jAemSp.HCO3[i] +
      2 * jAemSp.CO3[i]
  );

  return {
    solverMode: 'multicomponent',
    config: cfg,
    geomConc,
    geomDil,
    flowConc,
    flowDil,
    cConc: totalNorm(cConc),
    cDil: totalNorm(cDil),
    phiConc,
    phiDil,
    jxConc,
    jyConc,
    jxDil,
    jyDil,
    jCem: jCemNet,
    jAem: jAemNet,
    cemEMembrane: eCemProf,
    aemEMembrane: eAemProf,
    eCellPair: eCemProf.map((v, i) => v + eAemProf[i]),
    cemAlphaConc,
    cemAlphaDil,
    electrical: {
      eOcvV: eOcv,
      rInternalOhmM2: rInt,
      rConcOhmM2: rConc,
      rDilOhmM2: rDil,
      rCemOhmM2: rCem,
      rAemOhmM2: rAem,
      rDeltaRmOhmM2: rDeltaRmOhmM2,
      iMaxPowerAM2: eOcv / (2 * rInt),
      vMaxPowerV: eOcv / 2,
      pGrossMaxWM2: pGrossMax,
      pPumpConcWM2: pPumpConc,
      pPumpDilWM2: pPumpDil,
      pPumpTotalWM2: pPumpTotal,
      pNetMaxWM2: pNetMax,
      alphaCem: alphaCemAvg,
      alphaAem: alphaAemAvg,
      polarizationCurve,
    },
    massBalanceConc: {
      mIn: 0,
      mOut: 0,
      wallFluxTotal: 0,
      residual: maxMbConcAll,
      relativeError: maxMbConcAll,
      pass: maxMbConcAll < 0.02,
    },
    massBalanceDil: {
      mIn: 0,
      mOut: 0,
      wallFluxTotal: 0,
      residual: maxMbDilAll,
      relativeError: maxMbDilAll,
      pass: maxMbDilAll < 0.02,
    },
    convergenceHistory,
    couplingIterations: iter,
    converged,
    wallTimeMs: performance.now() - t0,
    effectiveProps: {
      muEff,
      dNaEff: dIons.Na,
      dClEff: dIons.Cl,
      dEff: (2 * dIons.Na * dIons.Cl) / (dIons.Na + dIons.Cl),
    },
    geochemistry: {
      siCalciteCemProfile,
      siGypsumCemProfile,
      omegaCalciteCemProfile,
      omegaGypsumCemProfile,
      ionicStrengthCemProfile,
      siCalciteAemProfile,
      siGypsumAemProfile,
      daviesSiCalciteProfile,
      daviesSiGypsumProfile,
      omegaCalciteOutlet: lastSat.omega_calcite,
      siCalciteOutlet: lastSat.si_calcite,
      omegaGypsumOutlet: lastSat.omega_gypsum,
      siGypsumOutlet: lastSat.si_gypsum,
      siCalciteCemMax: siCalCemMax,
      siGypsumCemMax: siGypCemMax,
      omegaCalciteCemMax: omegaCalCemMax,
      omegaGypsumCemMax: omegaGypCemMax,
      waterActivityOutlet: lastSat.water_activity,
      gammaCaOutlet: lastSat.gamma_ca,
      gammaCo3Outlet: lastSat.gamma_co3,
      gammaSo4Outlet: lastSat.gamma_so4,
      ionicStrengthMolal: lastSat.ionic_strength_molal,
      daviesValidityFlag: lastSat.davies_validity_flag,
      cntCalcite,
      cntGypsum,
      cntCalciteMax,
      cntGypsumMax,
    },
    multicomponent: {
      speciesOrder: SPECIES_ORDER,
      concInlet: concRaw,
      dilInlet: dilRaw,
      cConcSpecies: cConc,
      cDilSpecies: cDil,
      jCemSpecies: jCemSp,
      jAemSpecies: jAemSp,
      massBalanceConcSpecies: mbConc,
      massBalanceDilSpecies: mbDil,
      maxElectroneutralityErrConc: enErrC,
      maxElectroneutralityErrDil: enErrD,
      iOpAM2: iOp,
      vCellV: vCell,
      pGrossLoadedWM2: pGrossLoaded,
    },
  };
}
