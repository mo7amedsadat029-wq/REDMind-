import fs from 'fs';
import path from 'path';

interface PitzerDb {
  pitzer: Record<string, Record<string, number[]>>;
  phases: Record<string, { log_k: number; analytic?: number[] }>;
  reactions: Record<string, { log_k?: number; analytic?: number[] }>;
}

let cachedPitzerDb: PitzerDb | null = null;
function getPitzerDb(): PitzerDb {
  if (!cachedPitzerDb) {
    const p = path.resolve(process.cwd(), 'configs', 'pitzer_parameters.json');
    cachedPitzerDb = JSON.parse(fs.readFileSync(p, 'utf-8')) as PitzerDb;
  }
  return cachedPitzerDb;
}

export const MOLAR_MASS_H2O = 0.01801528;
export const TR_REF = 298.15;
export const KB = 1.380649e-23;
export const N_AVOGADRO = 6.02214076e23;

export const ION_CHARGES: Record<string, number> = {
  'H+': 1,
  'Na+': 1,
  'K+': 1,
  'Mg+2': 2,
  'Ca+2': 2,
  'Cl-': -1,
  'HSO4-': -1,
  'HCO3-': -1,
  'OH-': -1,
  'SO4-2': -2,
  'CO3-2': -2,
  MgCO3: 0,
};

export const CANONICAL_TO_PHREEQC: Record<string, string> = {
  H: 'H+',
  Na: 'Na+',
  K: 'K+',
  Mg: 'Mg+2',
  Ca: 'Ca+2',
  Cl: 'Cl-',
  HSO4: 'HSO4-',
  HCO3: 'HCO3-',
  OH: 'OH-',
  SO4: 'SO4-2',
  CO3: 'CO3-2',
};

export const MOLAR_MASS_G_MOL: Record<string, number> = {
  'Na+': 22.989769,
  'K+': 39.0983,
  'Mg+2': 24.305,
  'Ca+2': 40.078,
  'Cl-': 35.453,
  'SO4-2': 96.0626,
  'HCO3-': 61.0168,
  'CO3-2': 60.0089,
  'H+': 1.00794,
  'OH-': 17.00734,
  'HSO4-': 97.0705,
  MgCO3: 84.3139,
};

export function debyeHuckelAphi(T_K: number): number {
  const t_c = T_K - 273.15;
  const rho_w =
    (999.83952 +
      16.945176 * t_c -
      7.9870401e-3 * t_c ** 2 -
      46.170461e-6 * t_c ** 3 +
      105.56302e-9 * t_c ** 4 -
      280.54253e-12 * t_c ** 5) /
    (1.0 + 16.87985e-3 * t_c) /
    1000.0;
  const U = [
    3.4279e2, -5.0866e-3, 9.469e-7, -2.0525, 3.1159e3, -1.8289e2, -8.0325e3,
    4.2142e6, 2.1417,
  ];
  const eps1000 = U[0] * Math.exp(U[1] * T_K + U[2] * T_K ** 2);
  const C_bp = U[3] + U[4] / (U[5] + T_K);
  const B_bp = U[6] + U[7] / T_K + U[8] * T_K;
  const eps = eps1000 + C_bp * Math.log((B_bp + 1.0) / (B_bp + 1000.0));
  const N_A = 6.02214076e23;
  const e_esu = 4.80320425e-10;
  const k_B = 1.380649e-16;
  return (
    (1.0 / 3.0) *
    Math.sqrt((2.0 * Math.PI * N_A * rho_w) / 1000.0) *
    (e_esu ** 2 / (eps * k_B * T_K)) ** 1.5
  );
}

function phreeqcPitzerParam(coeffs: number[], T_K: number): number {
  const c = [
    coeffs[0] ?? 0,
    coeffs[1] ?? 0,
    coeffs[2] ?? 0,
    coeffs[3] ?? 0,
    coeffs[4] ?? 0,
    coeffs[5] ?? 0,
  ];
  if (Math.abs(T_K - TR_REF) < 1e-9) return c[0];
  const inv_T = 1.0 / T_K - 1.0 / TR_REF;
  const ln_T = Math.log(T_K / TR_REF);
  const dT = T_K - TR_REF;
  const dT2 = T_K ** 2 - TR_REF ** 2;
  const inv_T2 = 1.0 / T_K ** 2 - 1.0 / TR_REF ** 2;
  return (
    c[0] +
    c[1] * inv_T +
    c[2] * ln_T +
    c[3] * dT +
    c[4] * dT2 +
    c[5] * inv_T2
  );
}

function phreeqcLogk(
  T_K: number,
  coeffs: number[] | undefined,
  fallback: number
): number {
  if (!coeffs || coeffs.length === 0) return fallback;
  const a = [
    coeffs[0] ?? 0,
    coeffs[1] ?? 0,
    coeffs[2] ?? 0,
    coeffs[3] ?? 0,
    coeffs[4] ?? 0,
    coeffs[5] ?? 0,
  ];
  return (
    a[0] +
    a[1] * T_K +
    a[2] / T_K +
    a[3] * Math.log10(T_K) +
    a[4] / T_K ** 2 +
    a[5] * T_K ** 2
  );
}

export function getPhaseLogKsp(
  phase: string,
  T_K = 298.15,
  useAnalytic = true
): number {
  const db = getPitzerDb();
  const p = db.phases[phase];
  if (useAnalytic && p.analytic) {
    return phreeqcLogk(T_K, p.analytic, p.log_k ?? 0);
  }
  return p.log_k;
}

function getParam(block: string, ions: string[], T_K = 298.15): number {
  const db = getPitzerDb();
  const key = [...ions].sort().join('|');
  const coeffs = db.pitzer[block]?.[key];
  if (!coeffs) return 0.0;
  return phreeqcPitzerParam(coeffs, T_K);
}

function pitzerG(x: number): number {
  if (x < 1e-8) return 1.0;
  return (2.0 * (1.0 - (1.0 + x) * Math.exp(-x))) / (x * x);
}

function pitzerGPrime(x: number): number {
  if (x < 1e-8) return 0.0;
  return (-2.0 * (1.0 - (1.0 + x + 0.5 * x * x) * Math.exp(-x))) / (x * x);
}

function pitzerJAndJprime(x: number): [number, number] {
  if (x <= 0.0) return [0.0, 0.0];
  const C1 = 4.581;
  const C2 = 0.7237;
  const C3 = 0.012;
  const C4 = 0.528;
  const u = x ** -C2;
  const v = x ** C4;
  const ex = Math.exp(-C3 * v);
  const D = 4.0 + C1 * u * ex;
  const J = x / D;
  const dD_dx = (C1 * u * ex * (-C2 - C3 * C4 * v)) / x;
  const Jprime = (D - x * dD_dx) / (D * D);
  return [J, Jprime];
}

function ethetaAndPrime(
  z1: number,
  z2: number,
  I: number,
  A_phi: number
): [number, number] {
  if (z1 === z2 || z1 === 0 || z2 === 0 || I <= 1e-12) return [0.0, 0.0];
  const sqrt_I = Math.sqrt(I);
  const x12 = 6.0 * z1 * z2 * A_phi * sqrt_I;
  const x11 = 6.0 * z1 * z1 * A_phi * sqrt_I;
  const x22 = 6.0 * z2 * z2 * A_phi * sqrt_I;
  const [J12, Jp12] = pitzerJAndJprime(x12);
  const [J11, Jp11] = pitzerJAndJprime(x11);
  const [J22, Jp22] = pitzerJAndJprime(x22);
  const E_theta = ((z1 * z2) / (4.0 * I)) * (J12 - 0.5 * J11 - 0.5 * J22);
  const dJ12 = (Jp12 * 0.5 * x12) / I;
  const dJ11 = (Jp11 * 0.5 * x11) / I;
  const dJ22 = (Jp22 * 0.5 * x22) / I;
  const E_theta_p =
    -E_theta / I + ((z1 * z2) / (4.0 * I)) * (dJ12 - 0.5 * dJ11 - 0.5 * dJ22);
  return [E_theta, E_theta_p];
}

export interface PitzerActivityResult {
  temperature_K: number;
  ionic_strength_molal: number;
  water_activity: number;
  osmotic_coefficient: number;
  gamma_molal: Record<string, number>;
  molalities: Record<string, number>;
  charge_balance_error_pct: number;
}

export function estimateBrineDensityKgL(
  concMolM3: Record<string, number>,
  T_K = 298.15
): number {
  const t_c = T_K - 273.15;
  const rho0 =
    (999.83952 +
      16.945176 * t_c -
      7.9870401e-3 * t_c ** 2 -
      46.170461e-6 * t_c ** 3) /
    (1.0 + 16.87985e-3 * t_c) /
    1000.0;
  let tds_g_L = 0;
  for (const [sp, c] of Object.entries(concMolM3)) {
    tds_g_L += (c / 1000.0) * (MOLAR_MASS_G_MOL[sp] ?? 0);
  }
  return rho0 + 0.72e-3 * tds_g_L;
}

export function concMolM3ToMolality(
  concMolM3: Record<string, number>,
  T_K = 298.15
): Record<string, number> {
  const mapped: Record<string, number> = {};
  for (const [k, v] of Object.entries(concMolM3)) {
    if (v > 0) mapped[CANONICAL_TO_PHREEQC[k] ?? k] = v;
  }
  const rho = estimateBrineDensityKgL(mapped, T_K);
  let tds_kg_L = 0;
  for (const [sp, c] of Object.entries(mapped)) {
    tds_kg_L += ((c / 1000.0) * (MOLAR_MASS_G_MOL[sp] ?? 0)) / 1000.0;
  }
  const waterKgPerL = Math.max(rho - tds_kg_L, 0.5);
  const out: Record<string, number> = {};
  for (const [sp, c] of Object.entries(mapped)) {
    out[sp] = c / 1000.0 / waterKgPerL;
  }
  return out;
}

export function computePitzerActivities(
  molalities: Record<string, number>,
  T_K = 298.15
): PitzerActivityResult {
  const m: Record<string, number> = {};
  for (const [k, v] of Object.entries(molalities)) {
    if (v > 0) m[CANONICAL_TO_PHREEQC[k] ?? k] = v;
  }
  const cations = Object.keys(m).filter((sp) => (ION_CHARGES[sp] ?? 0) > 0);
  const anions = Object.keys(m).filter((sp) => (ION_CHARGES[sp] ?? 0) < 0);
  const neutrals = Object.keys(m).filter((sp) => (ION_CHARGES[sp] ?? 0) === 0);

  const sumPos = cations.reduce((s, c) => s + ION_CHARGES[c] * m[c], 0);
  const sumNeg = anions.reduce(
    (s, a) => s + Math.abs(ION_CHARGES[a]) * m[a],
    0
  );
  const cbePct = (100.0 * (sumPos - sumNeg)) / Math.max(sumPos + sumNeg, 1e-30);

  const I =
    0.5 *
    Object.entries(m).reduce(
      (s, [sp, val]) => s + (ION_CHARGES[sp] ?? 0) ** 2 * val,
      0
    );

  if (I <= 1e-12) {
    const gOut: Record<string, number> = {};
    for (const sp of Object.keys(m)) gOut[sp] = 1.0;
    return {
      temperature_K: T_K,
      ionic_strength_molal: 0,
      water_activity: 1,
      osmotic_coefficient: 1,
      gamma_molal: gOut,
      molalities: m,
      charge_balance_error_pct: cbePct,
    };
  }

  const sqrt_I = Math.sqrt(I);
  const Z = Object.entries(m).reduce(
    (s, [sp, val]) => s + Math.abs(ION_CHARGES[sp] ?? 0) * val,
    0
  );
  const A_phi = debyeHuckelAphi(T_K);
  const b = 1.2;

  const f_gamma =
    -A_phi *
    (sqrt_I / (1.0 + b * sqrt_I) + (2.0 / b) * Math.log(1.0 + b * sqrt_I));
  let F = f_gamma;

  const B_ca: Record<string, number> = {};
  const Bphi_ca: Record<string, number> = {};
  const C_ca: Record<string, number> = {};

  for (const c of cations) {
    const zc = ION_CHARGES[c];
    for (const a of anions) {
      const za = Math.abs(ION_CHARGES[a]);
      const beta0 = getParam('B0', [c, a], T_K);
      const beta1 = getParam('B1', [c, a], T_K);
      const beta2 = getParam('B2', [c, a], T_K);
      const c_phi = getParam('C0', [c, a], T_K);

      const alpha1 = zc === 2 && za === 2 ? 1.4 : 2.0;
      const alpha2 = 12.0;

      const x1 = alpha1 * sqrt_I;
      let B = beta0 + beta1 * pitzerG(x1);
      let Bp = (beta1 * pitzerGPrime(x1)) / I;
      let Bphi = beta0 + beta1 * Math.exp(-x1);

      if (Math.abs(beta2) > 0) {
        const x2 = alpha2 * sqrt_I;
        B += beta2 * pitzerG(x2);
        Bp += (beta2 * pitzerGPrime(x2)) / I;
        Bphi += beta2 * Math.exp(-x2);
      }
      const C = c_phi / (2.0 * Math.sqrt(zc * za));
      const key = `${c}|${a}`;
      B_ca[key] = B;
      Bphi_ca[key] = Bphi;
      C_ca[key] = C;
      F += m[c] * m[a] * Bp;
    }
  }

  const Phi_cc: Record<string, number> = {};
  const Phiphi_cc: Array<[string, string, number]> = [];
  for (let i = 0; i < cations.length; i++) {
    for (let j = i + 1; j < cations.length; j++) {
      const c1 = cations[i];
      const c2 = cations[j];
      const theta = getParam('THETA', [c1, c2], T_K);
      const [e_th, e_th_p] = ethetaAndPrime(
        ION_CHARGES[c1],
        ION_CHARGES[c2],
        I,
        A_phi
      );
      const phi = theta + e_th;
      const phi_phi = phi + I * e_th_p;
      Phi_cc[`${c1}|${c2}`] = phi;
      Phi_cc[`${c2}|${c1}`] = phi;
      Phiphi_cc.push([c1, c2, phi_phi]);
      F += m[c1] * m[c2] * e_th_p;
    }
  }

  const Phi_aa: Record<string, number> = {};
  const Phiphi_aa: Array<[string, string, number]> = [];
  for (let i = 0; i < anions.length; i++) {
    for (let j = i + 1; j < anions.length; j++) {
      const a1 = anions[i];
      const a2 = anions[j];
      const theta = getParam('THETA', [a1, a2], T_K);
      const [e_th, e_th_p] = ethetaAndPrime(
        ION_CHARGES[a1],
        ION_CHARGES[a2],
        I,
        A_phi
      );
      const phi = theta + e_th;
      const phi_phi = phi + I * e_th_p;
      Phi_aa[`${a1}|${a2}`] = phi;
      Phi_aa[`${a2}|${a1}`] = phi;
      Phiphi_aa.push([a1, a2, phi_phi]);
      F += m[a1] * m[a2] * e_th_p;
    }
  }

  let sum_ca_C = 0;
  for (const c of cations) {
    for (const a of anions) {
      sum_ca_C += m[c] * m[a] * C_ca[`${c}|${a}`];
    }
  }

  const gamma_out: Record<string, number> = {};
  for (const M of cations) {
    const zM = ION_CHARGES[M];
    let ln_g = zM ** 2 * F;
    for (const a of anions) {
      ln_g += m[a] * (2.0 * B_ca[`${M}|${a}`] + Z * C_ca[`${M}|${a}`]);
    }
    for (const cp of cations) {
      if (cp !== M) {
        let psi_sum = 0;
        for (const a of anions) psi_sum += m[a] * getParam('PSI', [M, cp, a], T_K);
        ln_g += m[cp] * (2.0 * Phi_cc[`${M}|${cp}`] + psi_sum);
      }
    }
    for (let i = 0; i < anions.length; i++) {
      for (let j = i + 1; j < anions.length; j++) {
        ln_g +=
          m[anions[i]] *
          m[anions[j]] *
          getParam('PSI', [M, anions[i], anions[j]], T_K);
      }
    }
    ln_g += Math.abs(zM) * sum_ca_C;
    for (const n of neutrals) {
      ln_g += 2.0 * m[n] * getParam('LAMBDA', [M, n], T_K);
    }
    gamma_out[M] = Math.exp(ln_g);
  }

  for (const X of anions) {
    const zX = Math.abs(ION_CHARGES[X]);
    let ln_g = zX ** 2 * F;
    for (const c of cations) {
      ln_g += m[c] * (2.0 * B_ca[`${c}|${X}`] + Z * C_ca[`${c}|${X}`]);
    }
    for (const ap of anions) {
      if (ap !== X) {
        let psi_sum = 0;
        for (const c of cations) psi_sum += m[c] * getParam('PSI', [c, X, ap], T_K);
        ln_g += m[ap] * (2.0 * Phi_aa[`${X}|${ap}`] + psi_sum);
      }
    }
    for (let i = 0; i < cations.length; i++) {
      for (let j = i + 1; j < cations.length; j++) {
        ln_g +=
          m[cations[i]] *
          m[cations[j]] *
          getParam('PSI', [cations[i], cations[j], X], T_K);
      }
    }
    ln_g += zX * sum_ca_C;
    for (const n of neutrals) {
      ln_g += 2.0 * m[n] * getParam('LAMBDA', [X, n], T_K);
    }
    gamma_out[X] = Math.exp(ln_g);
  }

  for (const n of neutrals) {
    let ln_g = 0;
    for (const sp of Object.keys(m)) {
      if (sp !== n) ln_g += 2.0 * m[sp] * getParam('LAMBDA', [n, sp], T_K);
    }
    gamma_out[n] = Math.exp(ln_g);
  }

  const sum_m = Object.values(m).reduce((s, v) => s + v, 0);
  let term = -(A_phi * I ** 1.5) / (1.0 + b * sqrt_I);
  for (const c of cations) {
    for (const a of anions) {
      term += m[c] * m[a] * (Bphi_ca[`${c}|${a}`] + Z * C_ca[`${c}|${a}`]);
    }
  }
  for (const [c1, c2, pphi] of Phiphi_cc) {
    let psi_sum = 0;
    for (const a of anions) psi_sum += m[a] * getParam('PSI', [c1, c2, a], T_K);
    term += m[c1] * m[c2] * (pphi + psi_sum);
  }
  for (const [a1, a2, pphi] of Phiphi_aa) {
    let psi_sum = 0;
    for (const c of cations) psi_sum += m[c] * getParam('PSI', [c, a1, a2], T_K);
    term += m[a1] * m[a2] * (pphi + psi_sum);
  }

  const phi_osm = 1.0 + (2.0 / Math.max(sum_m, 1e-30)) * term;
  const a_w = Math.exp(-phi_osm * MOLAR_MASS_H2O * sum_m);

  return {
    temperature_K: T_K,
    ionic_strength_molal: I,
    water_activity: a_w,
    osmotic_coefficient: phi_osm,
    gamma_molal: gamma_out,
    molalities: m,
    charge_balance_error_pct: cbePct,
  };
}

export interface MineralSaturationResult {
  temperature_K: number;
  pH: number | null;
  ionic_strength_molal: number;
  water_activity: number;
  gamma_ca: number;
  gamma_co3: number;
  gamma_hco3: number;
  gamma_so4: number;
  omega_calcite: number;
  si_calcite: number;
  omega_gypsum: number;
  si_gypsum: number;
  davies_si_calcite: number;
  davies_si_gypsum: number;
  davies_validity_flag: string;
  calcite_regime: string;
  gypsum_regime: string;
}

function classifyRegime(si: number): string {
  if (si < -0.1) return 'Undersaturated';
  if (si <= 0.1) return 'Near-equilibrium';
  return 'Supersaturated';
}

export function evaluateMineralSaturationPitzer(
  concMolM3: Record<string, number>,
  pH: number | null = 8.1,
  T_K = 298.15,
  speciateCarbonateFromPh = true,
  includeMgco3Pairing = true,
  nSpecIter = 8
): MineralSaturationResult {
  const m_base = concMolM3ToMolality(concMolM3, T_K);
  const m_work: Record<string, number> = { ...m_base };

  const m_ca_tot = m_base['Ca+2'] ?? 0;
  const m_mg_tot = m_base['Mg+2'] ?? 0;
  const m_so4_tot = m_base['SO4-2'] ?? 0;
  const m_hco3_in = m_base['HCO3-'] ?? 0;
  const m_co3_in = m_base['CO3-2'] ?? 0;
  const dic_tot = m_hco3_in + m_co3_in;

  const rxns = getPitzerDb().reactions;
  const k2_log = phreeqcLogk(
    T_K,
    rxns['CO3-2 + H+ = HCO3-']?.analytic,
    10.329
  );
  const k_assoc_hco3 = 10.0 ** k2_log;
  const k1_log = phreeqcLogk(
    T_K,
    rxns['CO3-2 + 2 H+ = CO2 + H2O']?.analytic,
    16.6767
  );
  const k_assoc_co2 = 10.0 ** k1_log;
  const k_mgco3_log = phreeqcLogk(
    T_K,
    rxns['Mg+2 + CO3-2 = MgCO3']?.analytic,
    2.928
  );
  const k_mgco3 = 10.0 ** k_mgco3_log;
  const k_hso4_log = phreeqcLogk(
    T_K,
    rxns['SO4-2 + H+ = HSO4-']?.analytic,
    1.988
  );
  const k_hso4 = 10.0 ** k_hso4_log;

  let act = computePitzerActivities(m_work, T_K);
  for (let iter = 0; iter < nSpecIter; iter++) {
    const g = act.gamma_molal;
    const g_mg = g['Mg+2'] ?? 1.0;
    const g_co3 = g['CO3-2'] ?? 1.0;
    const g_hco3 = g['HCO3-'] ?? 1.0;
    const g_so4 = g['SO4-2'] ?? 1.0;
    const g_hso4 = g['HSO4-'] ?? 1.0;
    const a_w = act.water_activity;

    if (speciateCarbonateFromPh && pH !== null && dic_tot > 0) {
      const a_H = 10.0 ** -pH;
      const r_hco3 = k_assoc_hco3 * a_H * (g_co3 / Math.max(g_hco3, 1e-12));
      const r_co2 = (k_assoc_co2 * a_H ** 2 * g_co3) / Math.max(a_w, 0.2);
      const mg_free = m_work['Mg+2'] ?? m_mg_tot;
      const r_mgco3 = includeMgco3Pairing ? k_mgco3 * g_mg * mg_free * g_co3 : 0;
      const denom = 1.0 + r_hco3 + r_co2 + r_mgco3;
      const m_co3_free = dic_tot / denom;
      const m_hco3_free = r_hco3 * m_co3_free;
      const m_mgco3_pair = r_mgco3 * m_co3_free;
      m_work['CO3-2'] = m_co3_free;
      m_work['HCO3-'] = m_hco3_free;
      if (includeMgco3Pairing) {
        m_work['Mg+2'] = Math.max(m_mg_tot - m_mgco3_pair, 1e-12);
        m_work['MgCO3'] = m_mgco3_pair;
      }
    } else if (includeMgco3Pairing && m_co3_in > 0 && m_mg_tot > 0) {
      const K_eff = k_mgco3 * g_mg * g_co3;
      const b_q = -(K_eff * (m_mg_tot + m_co3_in) + 1.0);
      const c_q = K_eff * m_mg_tot * m_co3_in;
      const disc = Math.max(b_q * b_q - 4.0 * K_eff * c_q, 0);
      const x_pair = K_eff > 1e-12 ? (-b_q - Math.sqrt(disc)) / (2.0 * K_eff) : 0;
      m_work['CO3-2'] = Math.max(m_co3_in - x_pair, 1e-15);
      m_work['Mg+2'] = Math.max(m_mg_tot - x_pair, 1e-12);
      m_work['MgCO3'] = x_pair;
    }

    if (pH !== null && m_so4_tot > 0) {
      const a_H = 10.0 ** -pH;
      const r_hso4 = k_hso4 * a_H * (g_so4 / Math.max(g_hso4, 1e-12));
      const m_so4_free = m_so4_tot / (1.0 + r_hso4);
      m_work['SO4-2'] = m_so4_free;
      if (r_hso4 > 1e-6) {
        m_work['HSO4-'] = m_so4_tot - m_so4_free;
      } else {
        delete m_work['HSO4-'];
      }
    }

    act = computePitzerActivities(m_work, T_K);
  }

  const g = act.gamma_molal;
  const g_ca = g['Ca+2'] ?? 1.0;
  const g_co3 = g['CO3-2'] ?? 1.0;
  const g_hco3 = g['HCO3-'] ?? 1.0;
  const g_so4 = g['SO4-2'] ?? 1.0;
  const a_w = act.water_activity;

  const m_ca_free = m_work['Ca+2'] ?? 0;
  const m_co3_free = m_work['CO3-2'] ?? 0;
  const m_so4_free = m_work['SO4-2'] ?? 0;

  const iap_cal = Math.max(g_ca * m_ca_free * g_co3 * m_co3_free, 1e-30);
  const ksp_cal = 10.0 ** getPhaseLogKsp('Calcite', T_K, true);
  const omega_cal = iap_cal / ksp_cal;
  const si_cal = Math.log10(Math.max(omega_cal, 1e-30));

  const iap_gyp = Math.max(
    g_ca * m_ca_free * g_so4 * m_so4_free * a_w ** 2,
    1e-30
  );
  const ksp_gyp = 10.0 ** getPhaseLogKsp('Gypsum', T_K, false);
  const omega_gyp = iap_gyp / ksp_gyp;
  const si_gyp = Math.log10(Math.max(omega_gyp, 1e-30));

  const I_mol = act.ionic_strength_molal;
  const sqrt_I = Math.sqrt(Math.max(I_mol, 0));
  const A_dh = 0.5092;
  const log_g2_dav =
    I_mol > 1e-12 ? -A_dh * 4.0 * (sqrt_I / (1.0 + sqrt_I) - 0.3 * I_mol) : 0;
  const g2_dav = 10.0 ** log_g2_dav;
  const iap_cal_dav = Math.max(
    g2_dav * m_ca_tot * g2_dav * m_co3_free,
    1e-30
  );
  const iap_gyp_dav = Math.max(g2_dav * m_ca_tot * g2_dav * m_so4_tot, 1e-30);
  const si_cal_dav = Math.log10(iap_cal_dav / ksp_cal);
  const si_gyp_dav = Math.log10(iap_gyp_dav / ksp_gyp);

  return {
    temperature_K: T_K,
    pH,
    ionic_strength_molal: I_mol,
    water_activity: a_w,
    gamma_ca: g_ca,
    gamma_co3: g_co3,
    gamma_hco3: g_hco3,
    gamma_so4: g_so4,
    omega_calcite: omega_cal,
    si_calcite: si_cal,
    omega_gypsum: omega_gyp,
    si_gypsum: si_gyp,
    davies_si_calcite: si_cal_dav,
    davies_si_gypsum: si_gyp_dav,
    davies_validity_flag:
      I_mol <= 0.5 ? 'within_range_I<=0.5' : 'invalid_high_ionic_strength_I>0.5',
    calcite_regime: classifyRegime(si_cal),
    gypsum_regime: classifyRegime(si_gyp),
  };
}

export const MINERAL_CNT_PROPERTIES: Record<
  'Calcite' | 'Gypsum',
  { Vm_m3_mol: number; gamma_sl_J_m2: number }
> = {
  Calcite: { Vm_m3_mol: 36.9e-6, gamma_sl_J_m2: 0.094 },
  Gypsum: { Vm_m3_mol: 73.9e-6, gamma_sl_J_m2: 0.037 },
};

export interface HeterogeneousNucleationResult {
  mineral: 'Calcite' | 'Gypsum';
  temperature_K: number;
  omega: number;
  si: number;
  gamma_sl_J_m2: number;
  contact_angle_deg: number;
  roughness_factor: number;
  effective_contact_angle_deg: number;
  wetting_factor_f: number;
  critical_radius_nm: number;
  delta_G_hom_J: number;
  delta_G_het_J: number;
  barrier_het_kBT: number;
  boltzmann_propensity: number;
  condition_category: string;
  classification_tag: string;
}

export function wenzelWettingFactor(
  contactAngleDeg: number,
  roughnessFactor = 1.0
): [number, number] {
  const cos_t = Math.cos((contactAngleDeg * Math.PI) / 180.0);
  const cos_eff = Math.max(-0.9999, Math.min(0.9999, roughnessFactor * cos_t));
  const theta_eff_deg = (Math.acos(cos_eff) * 180.0) / Math.PI;
  const f_wet = 0.25 * (2.0 + cos_eff) * (1.0 - cos_eff) ** 2;
  return [theta_eff_deg, f_wet];
}

export function evaluateHeterogeneousNucleation(
  mineral: 'Calcite' | 'Gypsum',
  omega: number,
  temperatureK = 298.15,
  contactAngleDeg = 60.0,
  roughnessFactor = 1.0,
  gammaSlJM2?: number
): HeterogeneousNucleationResult {
  const props = MINERAL_CNT_PROPERTIES[mineral];
  const v_m = props.Vm_m3_mol / N_AVOGADRO;
  const gamma = gammaSlJM2 ?? props.gamma_sl_J_m2;
  const si = Math.log10(Math.max(omega, 1e-30));
  const [theta_eff_deg, f_wet] = wenzelWettingFactor(
    contactAngleDeg,
    roughnessFactor
  );

  if (omega <= 1.0) {
    return {
      mineral,
      temperature_K: temperatureK,
      omega,
      si,
      gamma_sl_J_m2: gamma,
      contact_angle_deg: contactAngleDeg,
      roughness_factor: roughnessFactor,
      effective_contact_angle_deg: theta_eff_deg,
      wetting_factor_f: f_wet,
      critical_radius_nm: Number.POSITIVE_INFINITY,
      delta_G_hom_J: Number.POSITIVE_INFINITY,
      delta_G_het_J: Number.POSITIVE_INFINITY,
      barrier_het_kBT: Number.POSITIVE_INFINITY,
      boltzmann_propensity: 0.0,
      condition_category:
        si < -0.1
          ? 'Category A: Clean membrane'
          : 'Category B: Scaling-risk condition',
      classification_tag: 'Thermodynamic post-processing',
    };
  }

  const dmu = KB * temperatureK * Math.log(omega);
  const r_star_nm = ((2.0 * gamma * v_m) / dmu) * 1e9;
  const dG_hom =
    (16.0 * Math.PI * gamma ** 3 * v_m ** 2) / (3.0 * dmu ** 2);
  const dG_het = f_wet * dG_hom;
  const barrier_kbt = dG_het / (KB * temperatureK);
  const propensity = Math.exp(-Math.min(barrier_kbt, 700.0));
  const condition_category =
    barrier_kbt <= 40.0
      ? 'Category C: Nucleation-prone condition'
      : 'Category B: Scaling-risk condition';

  return {
    mineral,
    temperature_K: temperatureK,
    omega,
    si,
    gamma_sl_J_m2: gamma,
    contact_angle_deg: contactAngleDeg,
    roughness_factor: roughnessFactor,
    effective_contact_angle_deg: theta_eff_deg,
    wetting_factor_f: f_wet,
    critical_radius_nm: r_star_nm,
    delta_G_hom_J: dG_hom,
    delta_G_het_J: dG_het,
    barrier_het_kBT: barrier_kbt,
    boltzmann_propensity: propensity,
    condition_category,
    classification_tag: 'Thermodynamic post-processing',
  };
}
