import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  runMulticomponentSimulation,
  SPECIES_ORDER,
} from '../lib/multicomponentSolver2d';
import { writeNpzFile } from '../lib/npzWriter';
import { loadNpzFile } from '../lib/npzParser';

const ROOT = process.cwd();
const OUT_DIR = path.resolve(ROOT, 'data', 'pinn_8ion_sobol');
const GEN_DIR = path.join(OUT_DIR, 'generated');
const SHARD_TMP_DIR = path.join(OUT_DIR, '.tmp_shards');

const SEED_ID = 2028;
const HALTON_OFFSET = 200;
const TOTAL_CANDIDATES = 320;
const GRID_NX = 50;
const GRID_NY = 20;

const PRIMES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61,
];

function halton(index: number, dim: number): number {
  const base = PRIMES[dim];
  let f = 1.0;
  let r = 0.0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

function scaleLin(u: number, lo: number, hi: number): number {
  return lo + u * (hi - lo);
}

function scaleLog(u: number, lo: number, hi: number): number {
  return Math.exp(Math.log(lo) + u * (Math.log(hi) - Math.log(lo)));
}

function scalePow(u: number, lo: number, hi: number, power: number): number {
  return lo + (hi - lo) * Math.pow(u, power);
}

interface CandidateSample {
  sampleIndex: number;
  na: number;
  k: number;
  mg: number;
  ca: number;
  so4: number;
  dic: number;
  hco3: number;
  co3: number;
  clCheck: number;
  cDil: number;
  pH: number;
  T: number;
  uMeanConc: number;
  uMeanDil: number;
  channelHeight: number;
  channelLength: number;
  xCem: number;
  xAem: number;
  loadFraction: number;
  contactAngleCemDeg: number;
  roughnessFactorCem: number;
}

function buildCandidates(targetCount: number): CandidateSample[] {
  const out: CandidateSample[] = [];
  let seq = HALTON_OFFSET;
  while (out.length < targetCount) {
    seq++;
    const na = scaleLog(halton(seq, 0), 160.0, 1250.0);
    const k = scaleLog(halton(seq, 1), 2.5, 32.0);
    const mg = scaleLog(halton(seq, 2), 6.0, 120.0);
    // Gentle power shaping populates low-Ca undersaturated AND high-Ca gypsum regimes
    const ca = scalePow(halton(seq, 3), 4.0, 80.0, 0.82);
    const so4 = scalePow(halton(seq, 4), 5.0, 115.0, 0.84);
    const dic = scaleLog(halton(seq, 5), 0.6, 8.5);
    const cDil = scaleLog(halton(seq, 6), 8.0, 65.0);
    const pH = scaleLin(halton(seq, 7), 6.2, 8.8);
    const T = scaleLin(halton(seq, 8), 288.15, 313.15);
    const uMeanConc = scaleLog(halton(seq, 9), 0.005, 0.04);
    const uMeanDil = scaleLog(halton(seq, 10), 0.005, 0.04);
    const channelHeight = scaleLin(halton(seq, 11), 180e-6, 400e-6);
    const channelLength = scaleLin(halton(seq, 12), 0.06, 0.15);
    const xCem = -scaleLin(halton(seq, 13), 1200.0, 3600.0);
    const xAem = scaleLin(halton(seq, 14), 1200.0, 3600.0);
    const loadFraction = scaleLin(halton(seq, 15), 0.0, 0.85);
    const contactAngleCemDeg = scaleLin(halton(seq, 16), 38.0, 78.0);
    const roughnessFactorCem = scaleLin(halton(seq, 17), 1.0, 1.45);

    // Thermodynamic pK2(T) split at inlet pH for realistic initial HCO3/CO3 partition
    const pk2 = 10.329 - 0.0147 * (T - 298.15);
    const ratio = Math.pow(10.0, pH - pk2);
    const hco3 = dic / (1.0 + ratio);
    const co3 = dic - hco3;

    const clCheck =
      na + k + 2 * mg + 2 * ca - 2 * so4 - hco3 - 2 * co3;
    // Physical chloride-brine electroneutrality check (>= 25 mol/m3 Cl-)
    if (clCheck < 25.0) continue;

    out.push({
      sampleIndex: out.length + 1,
      na,
      k,
      mg,
      ca,
      so4,
      dic,
      hco3,
      co3,
      clCheck,
      cDil,
      pH,
      T,
      uMeanConc,
      uMeanDil,
      channelHeight,
      channelLength,
      xCem,
      xAem,
      loadFraction,
      contactAngleCemDeg,
      roughnessFactorCem,
    });
  }
  return out;
}

const CSV_HEADERS = [
  'case_id',
  'sample_index',
  'scenario_group',
  'result_classification',
  'model_version',
  'converged',
  'iterations',
  'wall_time_s',
  'nx',
  'ny',
  'dx_um',
  'dy_um',
  'channel_height_um',
  'channel_length_cm',
  'u_mean_conc_m_s',
  'u_mean_dil_m_s',
  'c_conc_inlet_mol_m3',
  'c_dil_inlet_mol_m3',
  'conc_Na_mol_m3',
  'conc_K_mol_m3',
  'conc_Mg_mol_m3',
  'conc_Ca_mol_m3',
  'conc_Cl_mol_m3',
  'conc_SO4_mol_m3',
  'conc_HCO3_mol_m3',
  'conc_CO3_mol_m3',
  'dic_inlet_mol_m3',
  'pH',
  'temperature_K',
  'X_cem_mol_m3',
  'X_aem_mol_m3',
  'load_fraction',
  'contact_angle_cem_deg',
  'roughness_factor_cem',
  'mass_balance_rel_err_conc',
  'mass_balance_rel_err_dil',
  'electroneutrality_err_conc',
  'electroneutrality_err_dil',
  'min_conc_mol_m3',
  'Re_conc',
  'Re_dil',
  'delta_p_conc_Pa',
  'delta_p_dil_Pa',
  'ocv_mV',
  'R_internal_Ohm_cm2',
  'R_conc_Ohm_cm2',
  'R_dil_Ohm_cm2',
  'R_mem_Ohm_cm2',
  'I_op_A_m2',
  'V_cell_V',
  'P_gross_max_W_m2',
  'P_gross_loaded_W_m2',
  'P_pump_total_W_m2',
  'P_net_max_W_m2',
  'permselectivity_cem',
  'permselectivity_aem',
  'cem_wall_Na_mol_m3',
  'cem_wall_Ca_mol_m3',
  'cem_wall_Mg_mol_m3',
  'cem_wall_SO4_mol_m3',
  'cem_wall_HCO3_mol_m3',
  'cem_wall_CO3_mol_m3',
  'ca_polarization_ratio_cem_outlet',
  'so4_polarization_ratio_cem_outlet',
  'ionic_strength_molal',
  'water_activity',
  'gamma_ca',
  'gamma_co3',
  'gamma_so4',
  'si_calcite_cem_inlet',
  'si_calcite_cem_outlet',
  'si_calcite_cem_max',
  'omega_calcite_cem_outlet',
  'omega_calcite_cem_max',
  'davies_si_calcite_outlet',
  'si_gypsum_cem_inlet',
  'si_gypsum_cem_outlet',
  'si_gypsum_cem_max',
  'omega_gypsum_cem_outlet',
  'omega_gypsum_cem_max',
  'davies_si_gypsum_outlet',
  'si_calcite_aem_outlet',
  'si_gypsum_aem_outlet',
  'davies_validity_flag',
  'calcite_wetting_factor_f',
  'calcite_effective_contact_angle_deg',
  'calcite_critical_radius_nm_outlet',
  'calcite_barrier_het_kBT_outlet',
  'calcite_barrier_het_kBT_max',
  'calcite_boltzmann_propensity_max',
  'calcite_condition_category',
  'gypsum_critical_radius_nm_outlet',
  'gypsum_barrier_het_kBT_outlet',
  'gypsum_barrier_het_kBT_max',
  'gypsum_boltzmann_propensity_max',
  'gypsum_condition_category',
  'dominant_scaling_category',
] as const;

function severityRank(cat: string): number {
  if (cat.includes('Category C')) return 3;
  if (cat.includes('Category B')) return 2;
  return 1;
}

function dominantCategory(catA: string, catB: string): string {
  return severityRank(catA) >= severityRank(catB) ? catA : catB;
}

function make2dCoordGrid(
  valsX: number[],
  valsY: number[]
): { xGrid: number[][]; yGrid: number[][] } {
  const nx = valsX.length;
  const ny = valsY.length;
  const xGrid = Array.from({ length: nx }, (_, i) =>
    new Array<number>(ny).fill(valsX[i])
  );
  const yGrid = Array.from({ length: nx }, () => [...valsY]);
  return { xGrid, yGrid };
}

function hasAnyNonFinite(arr: unknown): boolean {
  if (typeof arr === 'number') return !Number.isFinite(arr);
  if (Array.isArray(arr)) {
    for (let i = 0; i < arr.length; i++) {
      if (hasAnyNonFinite(arr[i])) return true;
    }
  }
  return false;
}

function runShard(shardIdx: number, totalShards: number): void {
  const all = buildCandidates(TOTAL_CANDIDATES);
  const mine = all.filter((_, idx) => idx % totalShards === shardIdx);
  const validRows: Array<Record<string, string | number | boolean>> = [];
  const failedRows: Array<Record<string, string | number>> = [];

  for (const s of mine) {
    const tempCaseId = `cand_${String(s.sampleIndex).padStart(3, '0')}`;
    const res = runMulticomponentSimulation({
      caseId: tempCaseId,
      nx: GRID_NX,
      ny: GRID_NY,
      maxCouplingIter: 75,
      couplingTol: 2e-4,
      relaxation: 0.3,
      channelHeight: s.channelHeight,
      channelLength: s.channelLength,
      uMeanConc: s.uMeanConc,
      uMeanDil: s.uMeanDil,
      cConcInlet: s.na,
      cDilInlet: s.cDil,
      kInletMolM3: s.k,
      mgInletMolM3: s.mg,
      caInletMolM3: s.ca,
      so4InletMolM3: s.so4,
      hco3InletMolM3: s.hco3,
      co3InletMolM3: s.co3,
      pH: s.pH,
      T: s.T,
      xCem: s.xCem,
      xAem: s.xAem,
      loadFraction: s.loadFraction,
      contactAngleCemDeg: s.contactAngleCemDeg,
      roughnessFactorCem: s.roughnessFactorCem,
    });

    const mc = res.multicomponent;
    let minConc = Infinity;
    let nonFinite = false;
    for (const sp of SPECIES_ORDER) {
      for (const col of mc.cConcSpecies[sp]) {
        for (const v of col) {
          if (!Number.isFinite(v)) nonFinite = true;
          if (v < minConc) minConc = v;
        }
      }
      for (const col of mc.cDilSpecies[sp]) {
        for (const v of col) {
          if (!Number.isFinite(v)) nonFinite = true;
          if (v < minConc) minConc = v;
        }
      }
    }
    if (
      hasAnyNonFinite(res.geochemistry.siCalciteCemProfile) ||
      hasAnyNonFinite(res.geochemistry.siGypsumCemProfile) ||
      !Number.isFinite(res.electrical.pNetMaxWM2)
    ) {
      nonFinite = true;
    }

    const ok =
      res.converged &&
      !nonFinite &&
      minConc >= 0 &&
      res.massBalanceConc.relativeError < 0.02 &&
      res.massBalanceDil.relativeError < 0.02 &&
      mc.maxElectroneutralityErrConc < 1e-11 &&
      mc.maxElectroneutralityErrDil < 1e-11;

    if (!ok) {
      failedRows.push({
        candidate_id: tempCaseId,
        sample_index: s.sampleIndex,
        scenario_group: 'pinn_continuous_8ion_sobol',
        reason: 'Convergence, mass conservation, or positivity check failed',
        error_detail: `conv=${res.converged}, mb_c=${res.massBalanceConc.relativeError.toExponential(3)}, mb_d=${res.massBalanceDil.relativeError.toExponential(3)}, en_c=${mc.maxElectroneutralityErrConc.toExponential(2)}, min_c=${minConc.toExponential(2)}, cConc=${s.na.toFixed(1)}, cDil=${s.cDil.toFixed(1)}, uD=${s.uMeanDil.toFixed(4)}, load=${s.loadFraction.toFixed(2)}`,
      });
      continue;
    }

    const lastIx = GRID_NX - 1;
    const { xGrid: xConcG, yGrid: yConcG } = make2dCoordGrid(
      res.geomConc.x,
      res.geomConc.y
    );
    const { xGrid: xDilG, yGrid: yDilG } = make2dCoordGrid(
      res.geomDil.x,
      res.geomDil.y
    );

    const npzArrays: Record<string, number[] | number[][]> = {
      x_conc: xConcG,
      y_conc: yConcG,
      u_conc: res.flowConc.u,
      v_conc: res.flowConc.v,
      p_conc: res.flowConc.p,
      phi_conc: res.phiConc,
      Jx_conc: res.jxConc,
      Jy_conc: res.jyConc,
      x_dil: xDilG,
      y_dil: yDilG,
      u_dil: res.flowDil.u,
      v_dil: res.flowDil.v,
      p_dil: res.flowDil.p,
      phi_dil: res.phiDil,
      Jx_dil: res.jxDil,
      Jy_dil: res.jyDil,
      x_interface: res.geomConc.x,
      E_cem_profile: res.cemEMembrane,
      E_aem_profile: res.aemEMembrane,
      E_cell_pair: res.eCellPair,
      cem_alpha_conc: res.cemAlphaConc,
      cem_alpha_dil: res.cemAlphaDil,
      si_calcite_cem_conc: res.geochemistry.siCalciteCemProfile,
      si_gypsum_cem_conc: res.geochemistry.siGypsumCemProfile,
      omega_calcite_cem_conc: res.geochemistry.omegaCalciteCemProfile,
      omega_gypsum_cem_conc: res.geochemistry.omegaGypsumCemProfile,
      si_davies_calcite_cem_conc: res.geochemistry.daviesSiCalciteProfile,
      si_davies_gypsum_cem_conc: res.geochemistry.daviesSiGypsumProfile,
      ionic_strength_cem_conc: res.geochemistry.ionicStrengthCemProfile,
      si_calcite_aem_conc: res.geochemistry.siCalciteAemProfile,
      si_gypsum_aem_conc: res.geochemistry.siGypsumAemProfile,
    };

    for (const sp of SPECIES_ORDER) {
      npzArrays[`c_${sp}_conc`] = mc.cConcSpecies[sp];
      npzArrays[`c_${sp}_dil`] = mc.cDilSpecies[sp];
      npzArrays[`J_cem_${sp}`] = mc.jCemSpecies[sp];
      npzArrays[`J_aem_${sp}`] = mc.jAemSpecies[sp];
    }

    const tmpNpzPath = path.join(GEN_DIR, `${tempCaseId}_fields.npz`);
    writeNpzFile(tmpNpzPath, npzArrays);

    const eqNormInlet =
      mc.concInlet.Na +
      mc.concInlet.K +
      2 * mc.concInlet.Mg +
      2 * mc.concInlet.Ca;
    const g = res.geochemistry;
    const domCat = dominantCategory(
      g.cntCalciteMax.condition_category,
      g.cntGypsumMax.condition_category
    );

    validRows.push({
      _tempCaseId: tempCaseId,
      sample_index: s.sampleIndex,
      scenario_group: 'pinn_continuous_8ion_sobol',
      result_classification:
        'Numerically solved + Thermodynamic post-processing',
      model_version: 'NEURANUM-2D-Multicomponent-v2.1',
      converged: 'True',
      iterations: res.couplingIterations,
      wall_time_s: res.wallTimeMs / 1000.0,
      nx: GRID_NX,
      ny: GRID_NY,
      dx_um: res.geomConc.dx * 1e6,
      dy_um: res.geomConc.dy * 1e6,
      channel_height_um: s.channelHeight * 1e6,
      channel_length_cm: s.channelLength * 100,
      u_mean_conc_m_s: s.uMeanConc,
      u_mean_dil_m_s: s.uMeanDil,
      c_conc_inlet_mol_m3: eqNormInlet,
      c_dil_inlet_mol_m3: s.cDil,
      conc_Na_mol_m3: mc.concInlet.Na,
      conc_K_mol_m3: mc.concInlet.K,
      conc_Mg_mol_m3: mc.concInlet.Mg,
      conc_Ca_mol_m3: mc.concInlet.Ca,
      conc_Cl_mol_m3: mc.concInlet.Cl,
      conc_SO4_mol_m3: mc.concInlet.SO4,
      conc_HCO3_mol_m3: mc.concInlet.HCO3,
      conc_CO3_mol_m3: mc.concInlet.CO3,
      dic_inlet_mol_m3: mc.concInlet.HCO3 + mc.concInlet.CO3,
      pH: s.pH,
      temperature_K: s.T,
      X_cem_mol_m3: s.xCem,
      X_aem_mol_m3: s.xAem,
      load_fraction: s.loadFraction,
      contact_angle_cem_deg: s.contactAngleCemDeg,
      roughness_factor_cem: s.roughnessFactorCem,
      mass_balance_rel_err_conc: res.massBalanceConc.relativeError,
      mass_balance_rel_err_dil: res.massBalanceDil.relativeError,
      electroneutrality_err_conc: mc.maxElectroneutralityErrConc,
      electroneutrality_err_dil: mc.maxElectroneutralityErrDil,
      min_conc_mol_m3: minConc,
      Re_conc: res.flowConc.Re,
      Re_dil: res.flowDil.Re,
      delta_p_conc_Pa: res.flowConc.deltaP,
      delta_p_dil_Pa: res.flowDil.deltaP,
      ocv_mV: res.electrical.eOcvV * 1000.0,
      R_internal_Ohm_cm2: res.electrical.rInternalOhmM2 * 1e4,
      R_conc_Ohm_cm2: res.electrical.rConcOhmM2 * 1e4,
      R_dil_Ohm_cm2: res.electrical.rDilOhmM2 * 1e4,
      R_mem_Ohm_cm2:
        (res.electrical.rCemOhmM2 + res.electrical.rAemOhmM2) * 1e4,
      I_op_A_m2: mc.iOpAM2,
      V_cell_V: mc.vCellV,
      P_gross_max_W_m2: res.electrical.pGrossMaxWM2,
      P_gross_loaded_W_m2: mc.pGrossLoadedWM2,
      P_pump_total_W_m2: res.electrical.pPumpTotalWM2,
      P_net_max_W_m2: res.electrical.pNetMaxWM2,
      permselectivity_cem: res.electrical.alphaCem,
      permselectivity_aem: res.electrical.alphaAem,
      cem_wall_Na_mol_m3: mc.cConcSpecies.Na[lastIx][0],
      cem_wall_Ca_mol_m3: mc.cConcSpecies.Ca[lastIx][0],
      cem_wall_Mg_mol_m3: mc.cConcSpecies.Mg[lastIx][0],
      cem_wall_SO4_mol_m3: mc.cConcSpecies.SO4[lastIx][0],
      cem_wall_HCO3_mol_m3: mc.cConcSpecies.HCO3[lastIx][0],
      cem_wall_CO3_mol_m3: mc.cConcSpecies.CO3[lastIx][0],
      ca_polarization_ratio_cem_outlet:
        mc.cConcSpecies.Ca[lastIx][0] / Math.max(mc.concInlet.Ca, 1e-12),
      so4_polarization_ratio_cem_outlet:
        mc.cConcSpecies.SO4[lastIx][0] / Math.max(mc.concInlet.SO4, 1e-12),
      ionic_strength_molal: g.ionicStrengthMolal,
      water_activity: g.waterActivityOutlet,
      gamma_ca: g.gammaCaOutlet,
      gamma_co3: g.gammaCo3Outlet,
      gamma_so4: g.gammaSo4Outlet,
      si_calcite_cem_inlet: g.siCalciteCemProfile[0],
      si_calcite_cem_outlet: g.siCalciteOutlet,
      si_calcite_cem_max: g.siCalciteCemMax,
      omega_calcite_cem_outlet: g.omegaCalciteOutlet,
      omega_calcite_cem_max: g.omegaCalciteCemMax,
      davies_si_calcite_outlet:
        g.daviesSiCalciteProfile[g.daviesSiCalciteProfile.length - 1],
      si_gypsum_cem_inlet: g.siGypsumCemProfile[0],
      si_gypsum_cem_outlet: g.siGypsumOutlet,
      si_gypsum_cem_max: g.siGypsumCemMax,
      omega_gypsum_cem_outlet: g.omegaGypsumOutlet,
      omega_gypsum_cem_max: g.omegaGypsumCemMax,
      davies_si_gypsum_outlet:
        g.daviesSiGypsumProfile[g.daviesSiGypsumProfile.length - 1],
      si_calcite_aem_outlet: g.siCalciteAemProfile[lastIx],
      si_gypsum_aem_outlet: g.siGypsumAemProfile[lastIx],
      davies_validity_flag: g.daviesValidityFlag,
      calcite_wetting_factor_f: g.cntCalciteMax.wetting_factor_f,
      calcite_effective_contact_angle_deg:
        g.cntCalciteMax.effective_contact_angle_deg,
      calcite_critical_radius_nm_outlet: g.cntCalcite.critical_radius_nm,
      calcite_barrier_het_kBT_outlet: g.cntCalcite.barrier_het_kBT,
      calcite_barrier_het_kBT_max: g.cntCalciteMax.barrier_het_kBT,
      calcite_boltzmann_propensity_max: g.cntCalciteMax.boltzmann_propensity,
      calcite_condition_category: g.cntCalciteMax.condition_category,
      gypsum_critical_radius_nm_outlet: g.cntGypsum.critical_radius_nm,
      gypsum_barrier_het_kBT_outlet: g.cntGypsum.barrier_het_kBT,
      gypsum_barrier_het_kBT_max: g.cntGypsumMax.barrier_het_kBT,
      gypsum_boltzmann_propensity_max: g.cntGypsumMax.boltzmann_propensity,
      gypsum_condition_category: g.cntGypsumMax.condition_category,
      dominant_scaling_category: domCat,
    });
  }

  fs.writeFileSync(
    path.join(SHARD_TMP_DIR, `shard_${shardIdx}.json`),
    JSON.stringify({ validRows, failedRows })
  );
  console.log(
    `[Worker ${shardIdx}/${totalShards}] finished: ${validRows.length} valid, ${failedRows.length} failed`
  );
}

function csvEscape(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') {
    if (v === Infinity) return 'inf';
    if (v === -Infinity) return '-inf';
    if (Number.isNaN(v)) return 'nan';
    return String(v);
  }
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

async function runCoordinator(): Promise<void> {
  const tStart = performance.now();
  fs.mkdirSync(GEN_DIR, { recursive: true });
  fs.mkdirSync(SHARD_TMP_DIR, { recursive: true });

  // Clean previous files inside data/pinn_8ion_sobol/generated and .tmp_shards
  for (const f of fs.readdirSync(GEN_DIR)) {
    fs.unlinkSync(path.join(GEN_DIR, f));
  }
  for (const f of fs.readdirSync(SHARD_TMP_DIR)) {
    fs.unlinkSync(path.join(SHARD_TMP_DIR, f));
  }

  const numWorkers = Math.max(1, Math.min(4, os.cpus().length));
  console.log(
    `Launching ${numWorkers} parallel physics workers for ${TOTAL_CANDIDATES} continuous 18D Halton/Sobol 8-ion simulations (${GRID_NX}x${GRID_NY} + exact Pitzer + CNT)...`
  );

  await Promise.all(
    Array.from({ length: numWorkers }, (_, shardIdx) => {
      return new Promise<void>((resolve, reject) => {
        const child = spawn(
          'npx',
          [
            'tsx',
            'scripts/generate_pinn_dataset.ts',
            '--worker',
            String(shardIdx),
            String(numWorkers),
          ],
          { cwd: ROOT, stdio: 'inherit' }
        );
        child.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Worker ${shardIdx} exited with code ${code}`));
        });
        child.on('error', reject);
      });
    })
  );

  const allValid: Array<Record<string, unknown>> = [];
  const allFailed: Array<Record<string, unknown>> = [];
  for (let s = 0; s < numWorkers; s++) {
    const p = path.join(SHARD_TMP_DIR, `shard_${s}.json`);
    const payload = JSON.parse(fs.readFileSync(p, 'utf-8'));
    allValid.push(...payload.validRows);
    allFailed.push(...payload.failedRows);
  }

  allValid.sort((a, b) => Number(a.sample_index) - Number(b.sample_index));
  allFailed.sort((a, b) => Number(a.sample_index) - Number(b.sample_index));

  // Assign deterministic sequential case IDs and rename NPZ files cleanly
  for (let idx = 0; idx < allValid.length; idx++) {
    const row = allValid[idx];
    const caseId = `pinn_8ion_${String(idx + 1).padStart(3, '0')}`;
    const tmpName = `${String(row._tempCaseId)}_fields.npz`;
    const finalName = `${caseId}_fields.npz`;
    fs.renameSync(path.join(GEN_DIR, tmpName), path.join(GEN_DIR, finalName));
    row.case_id = caseId;
    delete row._tempCaseId;
  }

  // Write case_metadata.csv
  const csvLines = [
    CSV_HEADERS.join(','),
    ...allValid.map((row) => CSV_HEADERS.map((h) => csvEscape(row[h])).join(',')),
  ];
  fs.writeFileSync(
    path.join(OUT_DIR, 'case_metadata.csv'),
    csvLines.join('\n') + '\n'
  );

  // Write failure_log.csv honestly documenting every non-converged candidate
  const failHeaders = [
    'candidate_id',
    'sample_index',
    'scenario_group',
    'reason',
    'error_detail',
  ];
  const failLines = [
    failHeaders.join(','),
    ...allFailed.map((row) =>
      failHeaders.map((h) => csvEscape(row[h])).join(',')
    ),
  ];
  fs.writeFileSync(
    path.join(OUT_DIR, 'failure_log.csv'),
    failLines.join('\n') + '\n'
  );

  // Clean temp shard directory
  fs.rmSync(SHARD_TMP_DIR, { recursive: true, force: true });

  // Verify random subset + statistics
  let catA = 0;
  let catB = 0;
  let catC = 0;
  let gypNearOrSup = 0;
  let gypSup = 0;
  let calSup = 0;
  let maxMbC = 0;
  let maxMbD = 0;
  let maxEn = 0;
  for (const r of allValid) {
    const dcat = String(r.dominant_scaling_category);
    if (dcat.includes('Category C')) catC++;
    else if (dcat.includes('Category B')) catB++;
    else catA++;
    if (Number(r.si_gypsum_cem_max) >= -0.1) gypNearOrSup++;
    if (Number(r.si_gypsum_cem_max) > 0.0) gypSup++;
    if (Number(r.si_calcite_cem_max) > 0.0) calSup++;
    maxMbC = Math.max(maxMbC, Number(r.mass_balance_rel_err_conc));
    maxMbD = Math.max(maxMbD, Number(r.mass_balance_rel_err_dil));
    maxEn = Math.max(
      maxEn,
      Number(r.electroneutrality_err_conc),
      Number(r.electroneutrality_err_dil)
    );
  }

  // Round-trip verify NPZ files exist and decode cleanly
  let npzVerified = 0;
  for (const checkIdx of [0, Math.floor(allValid.length / 2), allValid.length - 1]) {
    if (allValid[checkIdx]) {
      const f = path.join(
        GEN_DIR,
        `${String(allValid[checkIdx].case_id)}_fields.npz`
      );
      const parsed = loadNpzFile(f);
      if (parsed.c_Ca_conc?.shape[0] === GRID_NX && parsed.si_calcite_cem_conc?.shape[0] === GRID_NX) {
        npzVerified++;
      }
    }
  }

  const wallTimeS = (performance.now() - tStart) / 1000.0;
  const manifest = {
    dataset_id: 'pinn_8ion_sobol',
    title: 'Continuous 18D Halton/Sobol 8-Ion Multiphysics + Pitzer + CNT Dataset',
    version: '2.1.0',
    seed: SEED_ID,
    halton_offset: HALTON_OFFSET,
    grid: { nx: GRID_NX, ny: GRID_NY },
    attempted_candidates: TOTAL_CANDIDATES,
    converged_cases: allValid.length,
    failed_cases: allFailed.length,
    convergence_rate_pct: Number(
      ((100 * allValid.length) / TOTAL_CANDIDATES).toFixed(2)
    ),
    regime_counts: {
      dominant_category_A_clean: catA,
      dominant_category_B_scaling_risk: catB,
      dominant_category_C_nucleation_prone: catC,
      calcite_supersaturated_SI_gt_0: calSup,
      gypsum_near_or_supersaturated_SI_ge_neg0_1: gypNearOrSup,
      gypsum_supersaturated_SI_gt_0: gypSup,
    },
    qa_summary: {
      max_mass_balance_err_conc: maxMbC,
      max_mass_balance_err_dil: maxMbD,
      max_electroneutrality_err: maxEn,
      npz_spot_checks_passed: npzVerified,
      collocation_nodes_per_case_2d: GRID_NX * GRID_NY * 2,
      total_2d_field_nodes: allValid.length * GRID_NX * GRID_NY * 2,
      total_wall_si_nodes: allValid.length * GRID_NX * 2,
    },
    parameter_ranges: {
      conc_Na_mol_m3: [160, 1250],
      conc_K_mol_m3: [2.5, 32],
      conc_Mg_mol_m3: [6, 120],
      conc_Ca_mol_m3: [4, 80],
      conc_SO4_mol_m3: [5, 115],
      dic_inlet_mol_m3: [0.6, 8.5],
      c_dil_inlet_mol_m3: [8, 65],
      pH: [6.2, 8.8],
      temperature_K: [288.15, 313.15],
      u_mean_conc_m_s: [0.005, 0.04],
      u_mean_dil_m_s: [0.005, 0.04],
      channel_height_um: [180, 400],
      channel_length_cm: [6, 15],
      X_cem_mol_m3: [-3600, -1200],
      X_aem_mol_m3: [1200, 3600],
      load_fraction: [0.0, 0.85],
      contact_angle_cem_deg: [38, 78],
      roughness_factor_cem: [1.0, 1.45],
    },
    wall_time_s: Number(wallTimeS.toFixed(2)),
    scientific_scope_note:
      'Thermodynamic inorganic scaling propensity (Calcite & Gypsum via USGS pitzer.dat + Santoro 2021 heterogeneous CNT). Zero fabricated deposition kinetics, zero organic/biofouling synthesis.',
  };

  fs.writeFileSync(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  // Update root data/metadata/manifest.json accurately while preserving existing fields
  const rootManifestPath = path.resolve(ROOT, 'data', 'metadata', 'manifest.json');
  const rootManifest = JSON.parse(fs.readFileSync(rootManifestPath, 'utf-8'));
  rootManifest.dataset_title =
    'NEURANUM v2.1.0 Expanded Multiphysics, Pitzer & PINN-Ready 8-Ion RED Corpus';
  rootManifest.version = '2.1.0';
  rootManifest.stage_directories = {
    ...rootManifest.stage_directories,
    stage2b_pinn_8ion_sobol: 'data/pinn_8ion_sobol/',
  };
  rootManifest.case_counts = {
    ...rootManifest.case_counts,
    stage2b_pinn_8ion_sobol: allValid.length,
    stage2b_pinn_8ion_failed: allFailed.length,
    total_new_cases: 188 + allValid.length,
  };
  rootManifest.random_seeds = {
    ...rootManifest.random_seeds,
    stage2b_pinn_8ion_sobol: SEED_ID,
  };
  fs.writeFileSync(
    rootManifestPath,
    JSON.stringify(rootManifest, null, 2) + '\n'
  );

  console.log('\n=== PINN 8-ION DATASET GENERATION COMPLETE ===');
  console.log(JSON.stringify(manifest, null, 2));
}

const workerFlagIdx = process.argv.indexOf('--worker');
if (workerFlagIdx !== -1) {
  const shardIdx = parseInt(process.argv[workerFlagIdx + 1], 10);
  const totalShards = parseInt(process.argv[workerFlagIdx + 2], 10);
  runShard(shardIdx, totalShards);
} else {
  runCoordinator().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
