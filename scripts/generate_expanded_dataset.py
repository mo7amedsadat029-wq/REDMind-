"""
Master REDMind v2.0.0 Scientific Dataset Generation & Benchmark Pipeline.

Generates all expanded datasets while keeping data/original_51_cases/ strictly untouched:
  0. data/repaired_baseline_51/  : 51 repaired binary NaCl baseline + LHS cases
  1. data/clean_cases/          : 90 Sobol-sampled clean operating condition cases (Stage 1)
  2. data/multicomponent_brines/: 48 8-species multicomponent brine 2D cases + Pitzer wall SI (Stage 2)
  3. data/scaling_risk/         : 36 Calcite & Gypsum Pitzer saturation-risk cases (3 regimes) (Stage 3)
  4. data/mineral_scaling/      : 18 CNT heterogeneous nucleation + 8 exploratory Delta-R_m cases (Stage 4)
  5. data/benchmark_cases/      : Literature benchmark tables (Gurreri, Long, Robinson-Stokes, Gypsum, Santoro, Mujahid)
  6. data/metadata/             : Unified v2.0.0 manifest.json, simulation_summary.csv, failure_log.csv, brine_audit.csv
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any, Dict, List

import numpy as np
import pandas as pd
import yaml

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.dataset_writer_v2 import (
    build_clean_metadata_row,
    export_clean_case_npz,
    export_multicomponent_case_npz,
    write_csv,
    write_json,
)
from src.multicomponent_transport import (
    SPECIES_CHARGES,
    SPECIES_ORDER,
    MulticomponentSimConfig,
    prepare_electrolyte_composition,
    run_multicomponent_simulation,
)
from src.nucleation_model import evaluate_heterogeneous_nucleation
from src.pitzer_model import (
    compute_pitzer_activities,
    evaluate_mineral_saturation_pitzer,
    get_phase_log_ksp,
)
from src.reference_simulator import SimulationConfig, run_simulation
from src.sampling import sample_parameter_space_lhs
from src.sampling_v2 import sample_clean_sobol_cases
from src.validation import compare_with_long_2018, validate_against_gurreri_2017

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(ROOT_DIR, "data")
RESULTS_DIR = os.path.join(ROOT_DIR, "results")
REPORTS_DIR = os.path.join(ROOT_DIR, "reports")


def run_repaired_baseline_51() -> Dict[str, Any]:
    """Regenerate the 51 baseline LHS cases using the repaired binary simulator into data/repaired_baseline_51/."""
    out_dir = os.path.join(DATA_DIR, "repaired_baseline_51")
    gen_dir = os.path.join(out_dir, "generated")
    meta_dir = os.path.join(out_dir, "metadata")
    os.makedirs(gen_dir, exist_ok=True)
    os.makedirs(meta_dir, exist_ok=True)

    configs = sample_parameter_space_lhs(n_samples=50, random_seed=42, grid_nx=40, grid_ny=15)
    rows: List[Dict[str, Any]] = []
    failures: List[Dict[str, Any]] = []

    for cfg in configs:
        res = run_simulation(cfg, verbose=False)
        mb_c = res.mass_balance_conc["relative_error"]
        mb_d = res.mass_balance_dil["relative_error"]
        min_c = float(min(np.min(res.c_conc), np.min(res.c_dil)))
        if res.converged and mb_c < 0.02 and mb_d < 0.02 and min_c > 0.0 and res.electrical.P_gross_max > 0.0:
            export_clean_case_npz(res, gen_dir, J_cem=res.J_cem, J_aem=res.J_aem)
            rows.append(
                build_clean_metadata_row(
                    res,
                    scenario_group="repaired_baseline_51",
                    model_version="REDMind-2D-Binary-v2.0",
                    config_version="v1.0-lhs-seed42",
                )
            )
        else:
            failures.append(
                {
                    "case_id": cfg.case_id,
                    "scenario_group": "repaired_baseline_51",
                    "reason": "Convergence or conservation failure",
                    "error_detail": f"conv={res.converged}, mb_c={mb_c:.3e}, mb_d={mb_d:.3e}",
                }
            )

    write_csv(rows, os.path.join(meta_dir, "case_metadata.csv"))
    write_csv(failures, os.path.join(meta_dir, "failure_log.csv"), columns=["case_id", "scenario_group", "reason", "error_detail"])
    manifest = {
        "dataset_title": "REDMind Repaired Baseline 51 Cases (v2.0.0)",
        "version": "2.0.0-repaired-baseline",
        "note": "Regenerated with repaired bottom-wall Neumann flux BC sign; data/original_51_cases/ preserved untouched.",
        "num_converged_cases": len(rows),
        "num_failed_cases": len(failures),
    }
    write_json(manifest, os.path.join(meta_dir, "manifest.json"))

    # Compare vs original_51_cases/metadata/case_metadata.csv
    orig_csv = os.path.join(DATA_DIR, "original_51_cases", "metadata", "case_metadata.csv")
    if os.path.exists(orig_csv) and rows:
        df_orig = pd.read_csv(orig_csv)
        df_rep = pd.DataFrame(rows)
        merged = df_orig.merge(df_rep, on="case_id", suffixes=("_orig", "_rep"))
        comp = {
            "n_compared": int(len(merged)),
            "max_abs_diff_ocv_mV": float(np.max(np.abs(merged["ocv_mV_rep"] - merged["ocv_mV_orig"]))),
            "mean_abs_diff_ocv_mV": float(np.mean(np.abs(merged["ocv_mV_rep"] - merged["ocv_mV_orig"]))),
            "max_abs_diff_P_gross_W_m2": float(np.max(np.abs(merged["P_gross_max_W_m2_rep"] - merged["P_gross_max_W_m2_orig"]))),
            "orig_max_mb_dil": float(df_orig["mass_balance_rel_err_dil"].max()),
            "repaired_max_mb_dil": float(df_rep["mass_balance_rel_err_dil"].max()),
            "orig_max_mb_conc": float(df_orig["mass_balance_rel_err_conc"].max()),
            "repaired_max_mb_conc": float(df_rep["mass_balance_rel_err_conc"].max()),
            "baseline_case_000": {
                "orig_ocv_mV": float(df_orig.loc[0, "ocv_mV"]),
                "repaired_ocv_mV": float(df_rep.loc[0, "ocv_mV"]),
                "orig_P_gross_W_m2": float(df_orig.loc[0, "P_gross_max_W_m2"]),
                "repaired_P_gross_W_m2": float(df_rep.loc[0, "P_gross_max_W_m2"]),
            },
        }
        write_json(comp, os.path.join(RESULTS_DIR, "validation", "repaired_vs_original_51.json"))

    print(f"[Baseline-51] Converged: {len(rows)}/51, Failed: {len(failures)}", flush=True)
    return {"rows": rows, "failures": failures}


def run_stage1_clean_cases() -> Dict[str, Any]:
    """Stage 1: Execute 90 Sobol-sampled clean binary NaCl RED simulations."""
    out_dir = os.path.join(DATA_DIR, "clean_cases")
    gen_dir = os.path.join(out_dir, "generated")
    os.makedirs(gen_dir, exist_ok=True)

    configs = sample_clean_sobol_cases()
    rows: List[Dict[str, Any]] = []
    failures: List[Dict[str, Any]] = []

    for idx, cfg in enumerate(configs):
        try:
            res = run_simulation(cfg, verbose=False)
            mb_c = res.mass_balance_conc["relative_error"]
            mb_d = res.mass_balance_dil["relative_error"]
            min_c = float(min(np.min(res.c_conc), np.min(res.c_dil)))
            valid = (
                res.converged
                and mb_c < 0.02
                and mb_d < 0.02
                and min_c > 0.0
                and res.electrical.P_gross_max > 0.0
                and not np.isnan(res.electrical.P_gross_max)
            )
            if valid:
                export_clean_case_npz(res, gen_dir, J_cem=res.J_cem, J_aem=res.J_aem)
                rows.append(
                    build_clean_metadata_row(
                        res,
                        scenario_group="clean_operating_conditions",
                        model_version="REDMind-2D-Binary-v2.0",
                        config_version="clean_operating_cases.yaml@2.0.0",
                    )
                )
            else:
                failures.append(
                    {
                        "case_id": cfg.case_id,
                        "scenario_group": "clean_operating_conditions",
                        "reason": "Failed convergence or physical conservation check",
                        "error_detail": f"conv={res.converged}, mb_c={mb_c:.3e}, mb_d={mb_d:.3e}, min_c={min_c:.3e}",
                    }
                )
        except Exception as exc:
            failures.append(
                {
                    "case_id": cfg.case_id,
                    "scenario_group": "clean_operating_conditions",
                    "reason": "Runtime exception",
                    "error_detail": str(exc),
                }
            )
        if (idx + 1) % 15 == 0 or (idx + 1) == len(configs):
            print(f"[Stage 1] {idx+1}/{len(configs)} done | valid={len(rows)}, failed={len(failures)}", flush=True)

    write_csv(rows, os.path.join(out_dir, "case_metadata.csv"))
    write_csv(failures, os.path.join(out_dir, "failure_log.csv"), columns=["case_id", "scenario_group", "reason", "error_detail"])
    write_json(
        {
            "stage": "Stage 1 - Clean Operating Conditions",
            "version": "2.0.0",
            "sampling": "Sobol QMC (scramble=True, seed=2026)",
            "num_target": len(configs),
            "num_converged": len(rows),
            "num_failed": len(failures),
        },
        os.path.join(out_dir, "manifest.json"),
    )
    return {"rows": rows, "failures": failures}


def run_stage2_multicomponent_brines() -> Dict[str, Any]:
    """Stage 2: Audit documented RO brines and run 48 8-species 2D RED simulations + Pitzer wall SI."""
    out_dir = os.path.join(DATA_DIR, "multicomponent_brines")
    gen_dir = os.path.join(out_dir, "generated")
    os.makedirs(gen_dir, exist_ok=True)

    with open(os.path.join(ROOT_DIR, "configs", "brine_profiles.yaml"), "r", encoding="utf-8") as f:
        bp_cfg = yaml.safe_load(f)
    with open(os.path.join(ROOT_DIR, "configs", "multicomponent_transport.yaml"), "r", encoding="utf-8") as f:
        mc_cfg = yaml.safe_load(f)

    audit_rows: List[Dict[str, Any]] = []
    valid_profiles: Dict[str, Any] = {}

    for pid, p in bp_cfg["profiles"].items():
        is_incomplete = p.get("completeness") == "incomplete_missing_HCO3_and_pH"
        T_K = 273.15 + float(p["temperature_C"])
        aud = prepare_electrolyte_composition(
            profile_id=pid,
            conc_mg_L=p["concentrations_mg_L"],
            pH=p.get("pH"),
            T_K=T_K,
            missing_species=p.get("missing_species", []),
            enforce_electroneutrality=not is_incomplete,
        )
        audit_rows.append(
            {
                "profile_id": pid,
                "title": p["title"],
                "region": p["region"],
                "stream_type": p["stream_type"],
                "source_citation": p["source_citation"],
                "completeness": p["completeness"],
                "included_in_transport_pde": not is_incomplete,
                "pH": p.get("pH"),
                "temperature_C": p["temperature_C"],
                "tds_reported_mg_L": p["tds_reported_mg_L"],
                "tds_balanced_mg_L": round(aud.tds_mg_L, 2),
                "ionic_strength_M": round(aud.ionic_strength_M, 4),
                "cbe_raw_pct": round(aud.cbe_raw_pct, 4),
                "cbe_balanced_pct": round(aud.cbe_balanced_pct, 6),
                "derived_species": ";".join(aud.derived_species) if aud.derived_species else "None",
                "missing_species": ";".join(aud.missing_species) if aud.missing_species else "None",
                "adjustment_species": aud.adjustment_species or "None",
                "adjustment_delta_mol_m3": round(aud.adjustment_delta_mol_m3, 4),
                "notes": p.get("notes", ""),
            }
        )
        if not is_incomplete:
            valid_profiles[pid] = (p, aud)

    write_csv(audit_rows, os.path.join(out_dir, "brine_audit.csv"))

    # Design 48 structured cases: 6 valid profiles x 8 operating conditions = 48 unique cases
    # Spanning dilute salinity [5, 17, 35] mol/m3, velocities [0.005, 0.01, 0.02, 0.03] m/s,
    # T shifts, channel_height [200, 270, 350] um, |X_fix| [1500, 2000, 3000] mol/m3, load_fraction [0.0, 0.5]
    design_matrix = [
        {"dil_nacl": 17.0, "u_c": 0.010, "u_d": 0.010, "dT": 0.0, "h": 270e-6, "X": 2000.0, "lf": 0.0},
        {"dil_nacl": 17.0, "u_c": 0.010, "u_d": 0.010, "dT": 0.0, "h": 270e-6, "X": 2000.0, "lf": 0.5},
        {"dil_nacl": 5.0,  "u_c": 0.020, "u_d": 0.020, "dT": 0.0, "h": 270e-6, "X": 2000.0, "lf": 0.0},
        {"dil_nacl": 35.0, "u_c": 0.020, "u_d": 0.020, "dT": 5.0, "h": 270e-6, "X": 2000.0, "lf": 0.5},
        {"dil_nacl": 17.0, "u_c": 0.005, "u_d": 0.005, "dT": -5.0, "h": 200e-6, "X": 2500.0, "lf": 0.0},
        {"dil_nacl": 17.0, "u_c": 0.030, "u_d": 0.030, "dT": 10.0, "h": 350e-6, "X": 2500.0, "lf": 0.5},
        {"dil_nacl": 10.0, "u_c": 0.015, "u_d": 0.010, "dT": 0.0, "h": 220e-6, "X": 1500.0, "lf": 0.0},
        {"dil_nacl": 25.0, "u_c": 0.010, "u_d": 0.015, "dT": 5.0, "h": 300e-6, "X": 3000.0, "lf": 0.5},
    ]

    rows: List[Dict[str, Any]] = []
    failures: List[Dict[str, Any]] = []
    case_idx = 0
    total_target = len(valid_profiles) * len(design_matrix)
    grid_nx = int(mc_cfg["grid"]["nx"])
    grid_ny = int(mc_cfg["grid"]["ny"])

    for pid, (p, aud) in valid_profiles.items():
        base_T = 273.15 + float(p["temperature_C"])
        conc_eq_nacl = sum(SPECIES_CHARGES[sp] * aud.conc_balanced_mol_m3[sp] for sp in SPECIES_ORDER if SPECIES_CHARGES[sp] > 0)

        for cond in design_matrix:
            case_idx += 1
            cid = f"mc_brine_{case_idx:03d}"
            T_K = max(283.15, min(318.15, base_T + cond["dT"]))
            dil_dict = prepare_electrolyte_composition(
                f"dil_{cond['dil_nacl']}", conc_mol_m3={"Na": cond["dil_nacl"], "Cl": cond["dil_nacl"]}, pH=7.5
            ).conc_balanced_mol_m3

            cfg = MulticomponentSimConfig(
                case_id=cid,
                conc_inlet=aud.conc_balanced_mol_m3,
                dil_inlet=dil_dict,
                u_mean_conc=cond["u_c"],
                u_mean_dil=cond["u_d"],
                T=T_K,
                channel_height=cond["h"],
                X_cem=-cond["X"],
                X_aem=cond["X"],
                load_fraction=cond["lf"],
                nx=grid_nx,
                ny=grid_ny,
                brine_profile_id=pid,
                pH_conc=float(p["pH"]),
                pH_dil=7.5,
            )

            try:
                res = run_multicomponent_simulation(cfg)
                mb_c_max = max(res.mass_balance_conc.values())
                mb_d_max = max(res.mass_balance_dil.values())
                en_max = max(res.max_electroneutrality_err_conc, res.max_electroneutrality_err_dil)
                valid = (
                    res.converged
                    and en_max < 1e-3
                    and mb_c_max < 0.02
                    and mb_d_max < 0.02
                    and res.min_conc_all >= 0.0
                    and res.P_gross_max > 0.0
                )
                if not valid:
                    failures.append(
                        {
                            "case_id": cid,
                            "scenario_group": "multicomponent_brine_scenarios",
                            "reason": "Multicomponent convergence or conservation check failed",
                            "error_detail": f"conv={res.converged}, en={en_max:.3e}, mb_c={mb_c_max:.3e}, mb_d={mb_d_max:.3e}",
                        }
                    )
                    continue

                # Equivalent-NaCl clean binary reference for performance reduction calculation
                bin_cfg = SimulationConfig(
                    case_id=f"{cid}_eq_nacl",
                    channel_height=cond["h"],
                    channel_length=cfg.channel_length,
                    nx=grid_nx,
                    ny=grid_ny,
                    u_mean_conc=cond["u_c"],
                    u_mean_dil=cond["u_d"],
                    c_conc_inlet=float(conc_eq_nacl),
                    c_dil_inlet=float(cond["dil_nacl"]),
                    T=T_K,
                    X_cem=-cond["X"],
                    X_aem=cond["X"],
                    load_fraction=cond["lf"],
                )
                bin_res = run_simulation(bin_cfg, verbose=False)
                p_bin = bin_res.electrical.P_gross_max
                perf_red_pct = 100.0 * (p_bin - res.P_gross_max) / max(p_bin, 1e-12)

                # One-way coupled Pitzer mineral saturation along CEM conc & AEM conc interfaces (every 5th axial node for speed, interpolated or full)
                si_cal_cem = np.zeros(grid_nx)
                si_gyp_cem = np.zeros(grid_nx)
                si_cal_aem = np.zeros(grid_nx)
                si_gyp_aem = np.zeros(grid_nx)
                sample_ix = np.linspace(0, grid_nx - 1, 11, dtype=int)
                sc_cal_c, sc_gyp_c, sc_cal_a, sc_gyp_a = [], [], [], []
                dav_cal_cem_out = 0.0
                dav_flag = "within_range_I<=0.5"
                iw_cem = 0.0
                aw_cem = 1.0
                for ix in sample_ix:
                    wall_cem_c = {sp: float(res.c_conc[sp][ix, 0]) for sp in SPECIES_ORDER}
                    wall_aem_c = {sp: float(res.c_conc[sp][ix, -1]) for sp in SPECIES_ORDER}
                    ps_c = evaluate_mineral_saturation_pitzer(wall_cem_c, pH=float(p["pH"]), T_K=T_K)
                    ps_a = evaluate_mineral_saturation_pitzer(wall_aem_c, pH=float(p["pH"]), T_K=T_K)
                    sc_cal_c.append(ps_c.si_calcite)
                    sc_gyp_c.append(ps_c.si_gypsum)
                    sc_cal_a.append(ps_a.si_calcite)
                    sc_gyp_a.append(ps_a.si_gypsum)
                    if ix == sample_ix[-1]:
                        dav_cal_cem_out = ps_c.davies_si_calcite
                        dav_flag = ps_c.davies_validity_flag
                        iw_cem = ps_c.ionic_strength_molal
                        aw_cem = ps_c.water_activity

                x_all = np.arange(grid_nx, dtype=float)
                si_cal_cem = np.interp(x_all, sample_ix, sc_cal_c)
                si_gyp_cem = np.interp(x_all, sample_ix, sc_gyp_c)
                si_cal_aem = np.interp(x_all, sample_ix, sc_cal_a)
                si_gyp_aem = np.interp(x_all, sample_ix, sc_gyp_a)

                export_multicomponent_case_npz(
                    res,
                    gen_dir,
                    pitzer_profiles={
                        "si_calcite_cem_conc": si_cal_cem,
                        "si_gypsum_cem_conc": si_gyp_cem,
                        "si_calcite_aem_conc": si_cal_aem,
                        "si_gypsum_aem_conc": si_gyp_aem,
                    },
                )

                max_si_cal = float(max(np.max(si_cal_cem), np.max(si_cal_aem)))
                max_si_gyp = float(max(np.max(si_gyp_cem), np.max(si_gyp_aem)))
                rows.append(
                    {
                        "case_id": cid,
                        "scenario_group": "multicomponent_brine_scenarios",
                        "brine_profile_id": pid,
                        "region": p["region"],
                        "result_classification": "Numerically solved",
                        "model_version": "REDMind-2D-Multicomponent-v2.0",
                        "config_version": "multicomponent_transport.yaml@2.0.0",
                        "time_s": None,
                        "converged": True,
                        "iterations": int(res.coupling_iterations),
                        "wall_time_s": float(res.wall_time_seconds),
                        "nx": grid_nx,
                        "ny": grid_ny,
                        "dx_um": float(res.geometry.concentrated.dx * 1e6),
                        "dy_um": float(res.geometry.concentrated.dy * 1e6),
                        "channel_height_um": float(cond["h"] * 1e6),
                        "channel_length_cm": float(cfg.channel_length * 1e2),
                        "c_conc_inlet_mol_m3": float(conc_eq_nacl),
                        "c_dil_inlet_mol_m3": float(cond["dil_nacl"]),
                        "u_mean_conc_m_s": float(cond["u_c"]),
                        "u_mean_dil_m_s": float(cond["u_d"]),
                        "flow_rate_per_width_conc_m2_s": float(cond["u_c"] * cond["h"]),
                        "flow_rate_per_width_dil_m2_s": float(cond["u_d"] * cond["h"]),
                        "temperature_K": float(T_K),
                        "X_cem_mol_m3": float(-cond["X"]),
                        "X_aem_mol_m3": float(cond["X"]),
                        "load_fraction": float(cond["lf"]),
                        "Re_conc": float(res.flow_conc.Re),
                        "Re_dil": float(res.flow_dil.Re),
                        "delta_p_conc_Pa": float(res.flow_conc.delta_p),
                        "delta_p_dil_Pa": float(res.flow_dil.delta_p),
                        "mass_balance_rel_err_conc": float(mb_c_max),
                        "mass_balance_rel_err_dil": float(mb_d_max),
                        "electroneutrality_err": float(en_max),
                        "min_conc_mol_m3": float(res.min_conc_all),
                        "ocv_mV": float(res.E_ocv * 1000.0),
                        "R_internal_Ohm_cm2": float(res.R_internal * 1e4),
                        "R_conc_Ohm_cm2": float(res.R_conc * 1e4),
                        "R_dil_Ohm_cm2": float(res.R_dil * 1e4),
                        "R_mem_Ohm_cm2": float((res.R_cem + res.R_aem) * 1e4),
                        "I_op_A_m2": float(res.I_op),
                        "V_cell_V": float(res.V_cell),
                        "P_gross_max_W_m2": float(res.P_gross_max),
                        "P_gross_loaded_W_m2": float(res.P_gross_loaded),
                        "P_pump_total_W_m2": float(res.P_pump_total),
                        "P_net_max_W_m2": float(res.P_net_max),
                        "binary_eq_P_gross_max_W_m2": float(p_bin),
                        "binary_eq_ocv_mV": float(bin_res.electrical.E_ocv * 1000.0),
                        "performance_reduction_pct": float(perf_red_pct),
                        "mineral_phase": "Calcite+Gypsum (wall post-processing)",
                        "saturation_index": float(max_si_cal),
                        "si_calcite_cem_max": float(np.max(si_cal_cem)),
                        "si_gypsum_cem_max": float(np.max(si_gyp_cem)),
                        "davies_si_calcite_outlet": float(dav_cal_cem_out),
                        "davies_validity_flag": dav_flag,
                        "ionic_strength_molal": float(iw_cem),
                        "water_activity": float(aw_cem),
                        "saturation_model": "USGS pitzer.dat (HMW)",
                        "activity_model": "Pitzer (one-way coupled wall SI)",
                        "ksp_source": "USGS pitzer.dat",
                        "membrane_type": "CEM+AEM",
                        "nucleation_model_id": "None",
                        "deposition_model_validity_status": "Category B: Scaling-risk condition" if max(max_si_cal, max_si_gyp) > -0.1 else "Category A: Clean membrane",
                        "conc_Na_mol_m3": float(aud.conc_balanced_mol_m3["Na"]),
                        "conc_Mg_mol_m3": float(aud.conc_balanced_mol_m3["Mg"]),
                        "conc_Ca_mol_m3": float(aud.conc_balanced_mol_m3["Ca"]),
                        "conc_SO4_mol_m3": float(aud.conc_balanced_mol_m3["SO4"]),
                        "conc_Cl_mol_m3": float(aud.conc_balanced_mol_m3["Cl"]),
                    }
                )
            except Exception as exc:
                failures.append(
                    {
                        "case_id": cid,
                        "scenario_group": "multicomponent_brine_scenarios",
                        "reason": "Runtime exception",
                        "error_detail": str(exc),
                    }
                )
            if case_idx % 8 == 0 or case_idx == total_target:
                print(f"[Stage 2] {case_idx}/{total_target} done | valid={len(rows)}, failed={len(failures)}", flush=True)

    write_csv(rows, os.path.join(out_dir, "case_metadata.csv"))
    write_csv(failures, os.path.join(out_dir, "failure_log.csv"), columns=["case_id", "scenario_group", "reason", "error_detail"])
    write_json(
        {
            "stage": "Stage 2 - Multicomponent Desalination-Brine Scenarios",
            "version": "2.0.0",
            "profiles_included": list(valid_profiles.keys()),
            "profiles_excluded_incomplete": ["hypersaline_swro_santoro_2024_ic"],
            "num_target": total_target,
            "num_converged": len(rows),
            "num_failed": len(failures),
        },
        os.path.join(out_dir, "manifest.json"),
    )
    return {"rows": rows, "failures": failures, "audit_rows": audit_rows}


def run_stage3_scaling_risk() -> Dict[str, Any]:
    """Stage 3: Generate 36 Calcite (18) and Gypsum (18) Pitzer saturation-risk cases across all 3 regimes."""
    out_dir = os.path.join(DATA_DIR, "scaling_risk")
    gen_dir = os.path.join(out_dir, "generated")
    os.makedirs(gen_dir, exist_ok=True)

    with open(os.path.join(ROOT_DIR, "configs", "brine_profiles.yaml"), "r", encoding="utf-8") as f:
        bp = yaml.safe_load(f)["profiles"]

    def _bal(pid: str) -> Dict[str, float]:
        p = bp[pid]
        return prepare_electrolyte_composition(
            pid, conc_mg_L=p["concentrations_mg_L"], pH=p["pH"], T_K=273.15 + p["temperature_C"],
            missing_species=p.get("missing_species", []),
        ).conc_balanced_mol_m3

    med_feed = _bal("mediterranean_el_remel_feed")
    med_brine = _bal("mediterranean_el_remel_brine")
    rs_feed = _bal("red_sea_swro_feed_egypt")
    rs_brine = _bal("red_sea_swro_brine_egypt")
    shammas = _bal("shammas_brackish_ro_brine")

    # Helper to balance modified Ca/SO4/DIC dict cleanly by adjusting Na/Cl
    def _mod(base: Dict[str, float], ca_mult: float = 1.0, so4_mult: float = 1.0, dic_mult: float = 1.0, nacl_add: float = 0.0) -> Dict[str, float]:
        d = dict(base)
        d["Ca"] = base["Ca"] * ca_mult
        d["SO4"] = base["SO4"] * so4_mult
        d["HCO3"] = base["HCO3"] * dic_mult
        d["CO3"] = base["CO3"] * dic_mult
        d["Na"] = base["Na"] + nacl_add
        d["Cl"] = base["Cl"] + nacl_add
        pos = d["Na"] + d["K"] + 2.0 * (d["Mg"] + d["Ca"])
        neg = d["Cl"] + 2.0 * (d["SO4"] + d["CO3"]) + d["HCO3"]
        if pos > neg:
            d["Cl"] += (pos - neg)
        else:
            d["Na"] += (neg - pos)
        return d

    # 18 Calcite cases: 6 Undersaturated, 6 Near-equilibrium, 6 Supersaturated
    calcite_specs = [
        # Undersaturated (SI < -0.1)
        ("mediterranean_el_remel_feed", med_feed, 6.40, 298.15),
        ("mediterranean_el_remel_feed", med_feed, 6.90, 298.15),
        ("mediterranean_el_remel_brine", med_brine, 6.50, 293.15),
        ("red_sea_swro_feed_egypt", rs_feed, 6.60, 298.15),
        ("red_sea_swro_brine_egypt", rs_brine, 6.40, 298.15),
        ("shammas_brackish_ro_brine", shammas, 6.65, 298.15),
        # Near-equilibrium (|SI| <= 0.1)
        ("mediterranean_el_remel_feed", med_feed, 7.35, 298.15),
        ("mediterranean_el_remel_feed", _mod(med_feed, dic_mult=0.8), 7.42, 298.15),
        ("mediterranean_el_remel_brine", med_brine, 7.18, 298.15),
        ("red_sea_swro_feed_egypt", rs_feed, 7.36, 298.15),
        ("red_sea_swro_brine_egypt", rs_brine, 6.90, 298.15),
        ("shammas_brackish_ro_brine", shammas, 7.08, 298.15),
        # Supersaturated (SI > 0.1)
        ("mediterranean_el_remel_feed", med_feed, 8.00, 298.15),
        ("mediterranean_el_remel_brine", med_brine, 8.10, 308.15),
        ("red_sea_swro_feed_egypt", rs_feed, 8.10, 298.15),
        ("red_sea_swro_brine_egypt", rs_brine, 7.80, 303.15),
        ("shammas_brackish_ro_brine", shammas, 8.00, 298.15),
        ("mediterranean_el_remel_brine", _mod(med_brine, ca_mult=1.5), 8.40, 313.15),
    ]

    # 18 Gypsum cases: 6 Undersaturated, 6 Near-equilibrium, 6 Supersaturated
    gypsum_specs = [
        # Undersaturated (SI < -0.1)
        ("mediterranean_el_remel_feed", med_feed, 8.0, 298.15),
        ("mediterranean_el_remel_brine", med_brine, 8.1, 298.15),
        ("red_sea_swro_feed_egypt", rs_feed, 8.1, 298.15),
        ("red_sea_swro_brine_egypt", rs_brine, 7.8, 298.15),
        ("shammas_brackish_ro_brine", shammas, 8.0, 298.15),
        ("synthetic_NaCl_CaSO4", {"Na": 1000.0, "Cl": 1000.0, "Ca": 12.0, "SO4": 25.0, "K": 0.0, "Mg": 0.0, "HCO3": 0.0, "CO3": 0.0}, 7.0, 298.15),
        # Near-equilibrium (|SI| <= 0.1)
        ("mediterranean_el_remel_brine", _mod(med_brine, ca_mult=2.0, so4_mult=2.0), 7.8, 298.15),
        ("mediterranean_el_remel_brine", _mod(med_brine, ca_mult=2.3, so4_mult=2.3), 7.8, 303.15),
        ("red_sea_swro_brine_egypt", _mod(rs_brine, ca_mult=1.32, so4_mult=1.32), 7.8, 298.15),
        ("red_sea_swro_brine_egypt", _mod(rs_brine, ca_mult=1.45, so4_mult=1.45), 7.8, 308.15),
        ("shammas_brackish_ro_brine", _mod(shammas, ca_mult=2.15, so4_mult=2.15), 7.6, 298.15),
        ("synthetic_NaCl_CaSO4", {"Na": 1000.0, "Cl": 1000.0, "Ca": 44.0, "SO4": 44.0, "K": 0.0, "Mg": 0.0, "HCO3": 0.0, "CO3": 0.0}, 7.0, 298.15),
        # Supersaturated (SI > 0.1)
        ("mediterranean_el_remel_brine", _mod(med_brine, ca_mult=2.8, so4_mult=2.8), 7.8, 298.15),
        ("mediterranean_el_remel_brine", _mod(med_brine, ca_mult=3.6, so4_mult=3.6), 7.8, 313.15),
        ("red_sea_swro_brine_egypt", _mod(rs_brine, ca_mult=1.7, so4_mult=1.7), 7.8, 298.15),
        ("red_sea_swro_brine_egypt", _mod(rs_brine, ca_mult=2.4, so4_mult=2.4), 7.8, 308.15),
        ("shammas_brackish_ro_brine", _mod(shammas, ca_mult=3.2, so4_mult=3.2), 7.6, 298.15),
        ("synthetic_NaCl_CaSO4", {"Na": 1000.0, "Cl": 1000.0, "Ca": 70.0, "SO4": 70.0, "K": 0.0, "Mg": 0.0, "HCO3": 0.0, "CO3": 0.0}, 7.0, 298.15),
    ]

    # Pre-solve one representative 2D RED wall polarization multiplier ratio profile for one-way spatial mapping
    base_sim = run_simulation(SimulationConfig(case_id="wall_cp_ref", nx=50, ny=20, load_fraction=0.5), verbose=False)
    wall_ratio_cem = base_sim.c_conc[:, 0] / base_sim.config.c_conc_inlet
    x_if = base_sim.geometry.concentrated.x

    rows: List[Dict[str, Any]] = []

    def _run_batch(specs, mineral: str, prefix: str, speciate_carb: bool):
        for i, (pid, comp, ph, T_K) in enumerate(specs, start=1):
            cid = f"{prefix}_{i:03d}"
            p_res = evaluate_mineral_saturation_pitzer(comp, pH=ph, T_K=T_K, speciate_carbonate_from_pH=speciate_carb)

            # One-way coupled spatial wall SI along 10 axial stations
            nx_w = len(x_if)
            ix_s = np.linspace(0, nx_w - 1, 10, dtype=int)
            si_s, om_s, dav_s = [], [], []
            for ix in ix_s:
                f = float(wall_ratio_cem[ix])
                c_w = {k: v * f for k, v in comp.items()}
                rw = evaluate_mineral_saturation_pitzer(c_w, pH=ph, T_K=T_K, speciate_carbonate_from_pH=speciate_carb)
                si_s.append(rw.si_calcite if mineral == "Calcite" else rw.si_gypsum)
                om_s.append(rw.omega_calcite if mineral == "Calcite" else rw.omega_gypsum)
                dav_s.append(rw.davies_si_calcite if mineral == "Calcite" else rw.davies_si_gypsum)

            si_prof = np.interp(np.arange(nx_w), ix_s, si_s)
            om_prof = np.interp(np.arange(nx_w), ix_s, om_s)
            dav_prof = np.interp(np.arange(nx_w), ix_s, dav_s)
            np.savez_compressed(
                os.path.join(gen_dir, f"{cid}_wall_si.npz"),
                x_interface=x_if,
                wall_cp_ratio=wall_ratio_cem,
                si_pitzer_profile=si_prof,
                omega_pitzer_profile=om_prof,
                si_davies_profile=dav_prof,
            )

            si_val = p_res.si_calcite if mineral == "Calcite" else p_res.si_gypsum
            om_val = p_res.omega_calcite if mineral == "Calcite" else p_res.omega_gypsum
            dav_val = p_res.davies_si_calcite if mineral == "Calcite" else p_res.davies_si_gypsum
            regime = p_res.calcite_regime if mineral == "Calcite" else p_res.gypsum_regime
            cat = "Category A: Clean membrane" if si_val < -0.1 else "Category B: Scaling-risk condition"

            rows.append(
                {
                    "case_id": cid,
                    "scenario_group": f"{mineral.lower()}_saturation_risk",
                    "brine_profile_id": pid,
                    "result_classification": "Thermodynamic post-processing",
                    "model_version": "REDMind-Pitzer-HMW-v2.0",
                    "config_version": f"{mineral.lower()}_scaling.yaml@2.0.0",
                    "converged": True,
                    "temperature_K": float(T_K),
                    "pH": float(ph),
                    "ionic_strength_molal": float(p_res.ionic_strength_molal),
                    "water_activity": float(p_res.water_activity),
                    "ca_mol_m3": float(comp.get("Ca", 0.0)),
                    "so4_mol_m3": float(comp.get("SO4", 0.0)),
                    "dic_mol_m3": float(comp.get("HCO3", 0.0) + comp.get("CO3", 0.0)),
                    "gamma_ca": float(p_res.gamma_ca),
                    "gamma_co3": float(p_res.gamma_co3),
                    "gamma_so4": float(p_res.gamma_so4),
                    "mineral_phase": mineral,
                    "omega": float(om_val),
                    "saturation_index": float(si_val),
                    "saturation_regime": regime,
                    "davies_si": float(dav_val),
                    "davies_validity_flag": p_res.davies_validity_flag,
                    "saturation_model": "One-way coupled thermodynamic post-processing (USGS pitzer.dat)",
                    "activity_model": "Pitzer (Harvie-Moller-Weare)",
                    "ksp_source": "USGS pitzer.dat",
                    "membrane_type": "CEM",
                    "nucleation_model_id": "None",
                    "deposition_model_validity_status": cat,
                }
            )

    _run_batch(calcite_specs, "Calcite", "sr_calcite", True)
    _run_batch(gypsum_specs, "Gypsum", "sr_gypsum", False)

    write_csv(rows, os.path.join(out_dir, "case_metadata.csv"))
    write_json(
        {
            "stage": "Stage 3 - Mineral Saturation-Risk Cases",
            "version": "2.0.0",
            "num_calcite": len(calcite_specs),
            "num_gypsum": len(gypsum_specs),
            "total_cases": len(rows),
            "coupling_note": "One-way coupled thermodynamic post-processing; supersaturation != actual crystal deposition.",
        },
        os.path.join(out_dir, "manifest.json"),
    )
    print(f"[Stage 3] Exported {len(rows)} saturation-risk cases (18 Calcite + 18 Gypsum).", flush=True)
    return {"rows": rows}


def run_stage4_nucleation_and_benchmarks() -> Dict[str, Any]:
    """Stage 4: CNT heterogeneous nucleation (18 cases), exploratory Delta-R_m (8 cases), and literature benchmarks."""
    ms_dir = os.path.join(DATA_DIR, "mineral_scaling")
    ms_gen = os.path.join(ms_dir, "generated")
    bm_dir = os.path.join(DATA_DIR, "benchmark_cases")
    os.makedirs(ms_gen, exist_ok=True)
    os.makedirs(bm_dir, exist_ok=True)

    # --- Part A: 18 CNT Heterogeneous Nucleation Cases (Category A/B/C across CEM & AEM) ---
    cnt_specs = [
        # Calcite (12 cases)
        ("Calcite", "CEM", 0.6, 55.0, 1.1, 0.094, 298.15, -0.05, 78.4),
        ("Calcite", "CEM", 1.0, 55.0, 1.1, 0.094, 298.15, -0.05, 78.4),
        ("Calcite", "CEM", 3.0, 55.0, 1.0, 0.094, 298.15, -0.05, 78.4),
        ("Calcite", "CEM", 6.0, 55.0, 1.2, 0.094, 298.15, -0.05, 74.0),
        ("Calcite", "CEM", 12.0, 55.0, 1.3, 0.094, 298.15, -0.05, 70.0),
        ("Calcite", "CEM", 20.0, 45.0, 1.4, 0.094, 308.15, -0.06, 68.0),
        ("Calcite", "CEM", 12.0, 35.0, 1.6, 0.085, 308.15, -0.06, 68.0),
        ("Calcite", "AEM", 0.7, 65.0, 1.1, 0.094, 298.15, 0.05, 78.4),
        ("Calcite", "AEM", 3.0, 65.0, 1.1, 0.094, 298.15, 0.05, 78.4),
        ("Calcite", "AEM", 8.0, 65.0, 1.2, 0.094, 298.15, 0.05, 74.0),
        ("Calcite", "AEM", 15.0, 85.0, 1.0, 0.094, 298.15, 0.05, 78.4),
        ("Calcite", "AEM", 25.0, 95.0, 1.2, 0.100, 298.15, 0.04, 78.4),
        # Gypsum (6 cases)
        ("Gypsum", "CEM", 0.5, 55.0, 1.1, 0.037, 298.15, -0.05, 78.4),
        ("Gypsum", "CEM", 1.0, 55.0, 1.1, 0.037, 298.15, -0.05, 78.4),
        ("Gypsum", "CEM", 2.5, 55.0, 1.2, 0.037, 298.15, -0.05, 74.0),
        ("Gypsum", "CEM", 6.0, 45.0, 1.4, 0.037, 308.15, -0.06, 70.0),
        ("Gypsum", "AEM", 3.0, 85.0, 1.0, 0.037, 298.15, 0.05, 78.4),
        ("Gypsum", "AEM", 8.0, 65.0, 1.3, 0.037, 298.15, 0.05, 74.0),
    ]

    rows: List[Dict[str, Any]] = []
    for idx, (min_name, mtype, om, th, r_w, gsl, T_K, q_surf, eps_r) in enumerate(cnt_specs, start=1):
        cid = f"ms_cnt_{idx:03d}"
        res = evaluate_heterogeneous_nucleation(
            mineral=min_name,
            omega=om,
            temperature_K=T_K,
            contact_angle_deg=th,
            roughness_factor=r_w,
            gamma_sl_J_m2=gsl,
            surface_charge_proxy=q_surf,
            relative_permittivity=eps_r,
            classification_tag="Thermodynamic post-processing",
        )
        rows.append(
            {
                "case_id": cid,
                "scenario_group": "mineral_nucleation_cnt",
                "brine_profile_id": f"{min_name}_CNT_parametric",
                "result_classification": "Thermodynamic post-processing",
                "model_version": "REDMind-CNT-Santoro2021-v2.0",
                "config_version": f"{min_name.lower()}_scaling.yaml@2.0.0",
                "converged": True,
                "temperature_K": float(T_K),
                "mineral_phase": min_name,
                "omega": float(res.omega),
                "saturation_index": float(res.si),
                "gamma_sl_J_m2": float(res.gamma_sl_J_m2),
                "contact_angle_deg": float(res.contact_angle_deg),
                "roughness_factor": float(res.roughness_factor),
                "effective_contact_angle_deg": float(res.effective_contact_angle_deg),
                "wetting_factor_f": float(res.wetting_factor_f),
                "critical_radius_nm": float(res.critical_radius_nm) if np.isfinite(res.critical_radius_nm) else None,
                "delta_G_hom_J": float(res.delta_G_hom_J) if np.isfinite(res.delta_G_hom_J) else None,
                "delta_G_het_J": float(res.delta_G_het_J) if np.isfinite(res.delta_G_het_J) else None,
                "barrier_het_kBT": float(res.barrier_het_kBT) if np.isfinite(res.barrier_het_kBT) else None,
                "boltzmann_propensity": float(res.boltzmann_propensity),
                "surface_charge_C_m2_proxy": float(res.surface_charge_C_m2_proxy),
                "relative_permittivity": float(res.relative_permittivity),
                "membrane_type": mtype,
                "saturation_model": "Prescribed Omega (CNT sweep)",
                "activity_model": "Pitzer reference",
                "ksp_source": "USGS pitzer.dat",
                "nucleation_model_id": "Santoro_2021_CNT_Wenzel",
                "deposition_model_validity_status": res.condition_category,
                "performance_reduction_pct": 0.0,
            }
        )

    # --- Part B: 8 Exploratory Sensitivity Scenarios (Fixed hypothetical Delta R_m increments) ---
    # 4 on Clean Gurreri Binary NaCl + 4 on Mediterranean RO Brine
    with open(os.path.join(ROOT_DIR, "configs", "brine_profiles.yaml"), "r", encoding="utf-8") as f:
        bp_med = yaml.safe_load(f)["profiles"]["mediterranean_el_remel_brine"]
    aud_med = prepare_electrolyte_composition(
        "med_brine", conc_mg_L=bp_med["concentrations_mg_L"], pH=bp_med["pH"], T_K=273.15 + bp_med["temperature_C"]
    )
    dil_17 = prepare_electrolyte_composition("dil17", conc_mol_m3={"Na": 17.0, "Cl": 17.0}, pH=7.5).conc_balanced_mol_m3

    ref_bin = run_simulation(SimulationConfig(case_id="ref_bin_sens", nx=50, ny=20, load_fraction=0.5), verbose=False)
    ref_mc = run_multicomponent_simulation(
        MulticomponentSimConfig(
            case_id="ref_mc_sens",
            conc_inlet=aud_med.conc_balanced_mol_m3,
            dil_inlet=dil_17,
            nx=50,
            ny=20,
            load_fraction=0.5,
            brine_profile_id="mediterranean_el_remel_brine",
        )
    )

    deltas_ohm_cm2 = [0.5, 1.5, 3.0, 6.0]
    sens_idx = 0
    for dRm in deltas_ohm_cm2:
        sens_idx += 1
        cid = f"ms_sens_{sens_idx:03d}"
        # Split hypothetical resistance increment symmetrically across CEM and AEM
        r_m0 = 125e-6 / 1.0
        r_m_eff = r_m0 + 0.5 * (dRm * 1e-4)
        sigma_eff = 125e-6 / r_m_eff
        sim_s = run_simulation(
            SimulationConfig(
                case_id=cid, nx=50, ny=20, load_fraction=0.5, sigma_cem=sigma_eff, sigma_aem=sigma_eff
            ),
            verbose=False,
        )
        export_clean_case_npz(sim_s, ms_gen, J_cem=sim_s.J_cem, J_aem=sim_s.J_aem)
        perf_red = 100.0 * (ref_bin.electrical.P_gross_max - sim_s.electrical.P_gross_max) / ref_bin.electrical.P_gross_max
        rows.append(
            build_clean_metadata_row(
                sim_s,
                scenario_group="exploratory_resistance_sensitivity",
                model_version="REDMind-2D-Binary-v2.0",
                config_version="exploratory_delta_Rm",
                result_classification="Exploratory sensitivity scenario",
                extra={
                    "mineral_phase": "Hypothetical fixed Delta_R_m",
                    "deposition_model_validity_status": f"Exploratory sensitivity scenario: hypothetical fixed Delta_R_m = +{dRm:.1f} Ohm*cm2 (not validated kinetic growth)",
                    "performance_reduction_pct": float(perf_red),
                    "delta_Rm_ohm_cm2": float(dRm),
                },
            )
        )

    for dRm in deltas_ohm_cm2:
        sens_idx += 1
        cid = f"ms_sens_{sens_idx:03d}"
        r_m0 = 125e-6 / 1.0
        r_m_eff = r_m0 + 0.5 * (dRm * 1e-4)
        sigma_eff = 125e-6 / r_m_eff
        mc_s = run_multicomponent_simulation(
            MulticomponentSimConfig(
                case_id=cid,
                conc_inlet=aud_med.conc_balanced_mol_m3,
                dil_inlet=dil_17,
                nx=50,
                ny=20,
                load_fraction=0.5,
                sigma_cem=sigma_eff,
                sigma_aem=sigma_eff,
                brine_profile_id="mediterranean_el_remel_brine",
            )
        )
        export_multicomponent_case_npz(mc_s, ms_gen)
        perf_red = 100.0 * (ref_mc.P_gross_max - mc_s.P_gross_max) / ref_mc.P_gross_max
        rows.append(
            {
                "case_id": cid,
                "scenario_group": "exploratory_resistance_sensitivity",
                "brine_profile_id": "mediterranean_el_remel_brine",
                "result_classification": "Exploratory sensitivity scenario",
                "model_version": "REDMind-2D-Multicomponent-v2.0",
                "config_version": "exploratory_delta_Rm",
                "converged": bool(mc_s.converged),
                "iterations": int(mc_s.coupling_iterations),
                "wall_time_s": float(mc_s.wall_time_seconds),
                "nx": 50,
                "ny": 20,
                "temperature_K": 298.15,
                "load_fraction": 0.5,
                "ocv_mV": float(mc_s.E_ocv * 1000.0),
                "R_internal_Ohm_cm2": float(mc_s.R_internal * 1e4),
                "I_op_A_m2": float(mc_s.I_op),
                "V_cell_V": float(mc_s.V_cell),
                "P_gross_max_W_m2": float(mc_s.P_gross_max),
                "P_pump_total_W_m2": float(mc_s.P_pump_total),
                "P_net_max_W_m2": float(mc_s.P_net_max),
                "mineral_phase": "Hypothetical fixed Delta_R_m",
                "membrane_type": "CEM+AEM",
                "nucleation_model_id": "None",
                "deposition_model_validity_status": f"Exploratory sensitivity scenario: hypothetical fixed Delta_R_m = +{dRm:.1f} Ohm*cm2 (not validated kinetic growth)",
                "performance_reduction_pct": float(perf_red),
                "delta_Rm_ohm_cm2": float(dRm),
            }
        )

    write_csv(rows, os.path.join(ms_dir, "case_metadata.csv"))
    write_csv([], os.path.join(ms_dir, "failure_log.csv"), columns=["case_id", "scenario_group", "reason", "error_detail"])
    write_json(
        {
            "stage": "Stage 4 - Mineral Nucleation & Exploratory Sensitivity",
            "version": "2.0.0",
            "num_cnt_cases": len(cnt_specs),
            "num_exploratory_sensitivity_cases": 2 * len(deltas_ohm_cm2),
            "total_cases": len(rows),
            "scientific_disclaimer": "CNT predicts thermodynamic critical barriers only; Delta_R_m cases are labeled Exploratory sensitivity scenarios, not validated fouling kinetics.",
        },
        os.path.join(ms_dir, "manifest.json"),
    )

    # --- Part C: Literature Benchmarks (data/benchmark_cases/) ---
    g_res = validate_against_gurreri_2017()
    write_csv(
        [
            {
                "benchmark_name": c.benchmark_name,
                "parameter": c.parameter_name,
                "published_value": c.published_value,
                "simulated_value": c.simulated_value,
                "unit": c.unit,
                "relative_error": c.relative_error,
                "passed": c.passed,
                "result_classification": "Literature benchmark",
                "notes": c.notes,
            }
            for c in g_res["comparisons"]
        ],
        os.path.join(bm_dir, "gurreri_2017_benchmark.csv"),
    )

    l_res = compare_with_long_2018()
    write_csv(
        [
            {
                "benchmark_name": "Long et al. (2018)",
                "ocv_spatial_V": l_res["ocv_spatial"],
                "ocv_lumped_V": l_res["ocv_lumped"],
                "r_int_spatial_Ohm_m2": l_res["r_int_spatial"],
                "r_int_lumped_Ohm_m2": l_res["r_int_lumped"],
                "power_spatial_W_m2": l_res["power_spatial"],
                "power_lumped_W_m2": l_res["power_lumped"],
                "polarization_effect_ocv": l_res["polarization_effect_ocv"],
                "polarization_effect_resistance": l_res["polarization_effect_resistance"],
                "result_classification": "Literature benchmark",
                "notes": l_res["notes"],
            }
        ],
        os.path.join(bm_dir, "long_2018_benchmark.csv"),
    )

    rs_benchmarks = [(0.1, 0.778), (0.5, 0.681), (1.0, 0.657), (2.0, 0.668), (3.0, 0.714), (4.0, 0.783)]
    rs_rows = []
    for m_na, ref_g in rs_benchmarks:
        act = compute_pitzer_activities({"Na+": m_na, "Cl-": m_na}, T_K=298.15)
        g_pm = float(np.sqrt(act.gamma_molal["Na+"] * act.gamma_molal["Cl-"]))
        rs_rows.append(
            {
                "molality_NaCl_mol_kg": m_na,
                "gamma_mean_pitzer": g_pm,
                "gamma_mean_robinson_stokes": ref_g,
                "abs_error": abs(g_pm - ref_g),
                "osmotic_coeff_phi": act.osmotic_coefficient,
                "water_activity": act.water_activity,
                "result_classification": "Literature benchmark",
            }
        )
    write_csv(rs_rows, os.path.join(bm_dir, "pitzer_nacl_robinson_stokes.csv"))

    gyp_rows = []
    for m_nacl_mM, ca_mM, label in [
        (0.0, 15.2, "Pure water gypsum equilibrium (~2.09 g/L)"),
        (1000.0, 38.0, "1.0m NaCl salting-in near-saturation"),
        (3000.0, 15.2, "3.0m NaCl undersaturated due to ionic strength"),
        (3000.0, 55.0, "3.0m NaCl salting-in near-saturation (~3.6x solubility)"),
    ]:
        gs = evaluate_mineral_saturation_pitzer(
            {"Na": m_nacl_mM, "Cl": m_nacl_mM, "Ca": ca_mM, "SO4": ca_mM},
            pH=7.0,
            T_K=298.15,
            speciate_carbonate_from_pH=False,
        )
        gyp_rows.append(
            {
                "scenario": label,
                "nacl_mol_m3": m_nacl_mM,
                "ca_so4_mol_m3": ca_mM,
                "ionic_strength_molal": gs.ionic_strength_molal,
                "water_activity": gs.water_activity,
                "gamma_ca": gs.gamma_ca,
                "gamma_so4": gs.gamma_so4,
                "si_gypsum_pitzer": gs.si_gypsum,
                "si_gypsum_davies": gs.davies_si_gypsum,
                "davies_validity_flag": gs.davies_validity_flag,
                "result_classification": "Literature benchmark",
            }
        )
    write_csv(gyp_rows, os.path.join(bm_dir, "pitzer_gypsum_salting_in.csv"))

    cnt_bm_rows = []
    for mtype, th0 in [("CEM_Fujifilm_Type10", 55.0), ("AEM_Fujifilm_Type10", 65.0)]:
        for om in [1.5, 3.0, 5.0, 10.0, 20.0, 40.0]:
            cn = evaluate_heterogeneous_nucleation("Calcite", omega=om, contact_angle_deg=th0, roughness_factor=1.2)
            cnt_bm_rows.append(
                {
                    "membrane": mtype,
                    "contact_angle_deg": th0,
                    "roughness_factor": 1.2,
                    "omega": om,
                    "si_calcite": cn.si,
                    "critical_radius_nm": cn.critical_radius_nm,
                    "barrier_het_kBT": cn.barrier_het_kBT,
                    "wetting_factor_f": cn.wetting_factor_f,
                    "boltzmann_propensity": cn.boltzmann_propensity,
                    "condition_category": cn.condition_category,
                    "result_classification": "Literature benchmark",
                }
            )
    write_csv(cnt_bm_rows, os.path.join(bm_dir, "santoro_2021_calcite_cnt.csv"))

    # Mujahid et al. (2026) documented benchmark notes + compatible Pitzer gypsum saturation check
    mujahid_note = {
        "citation": "Mujahid et al. (2026), Separation and Purification Technology 390, 136960, DOI: 10.1016/j.seppur.2026.136960",
        "result_classification": "Literature benchmark",
        "accessibility_note": "Journal full text behind publisher paywall; abstract-verified scope covers gypsum and silica impurities on RED OCV, stack resistance, and power density across CEM/AEM.",
        "scientific_policy": "No time-dependent kinetic constants or additive gypsum+silica growth laws are fabricated from abstract-level resistance/power observations.",
        "compatible_thermodynamic_states": gyp_rows,
    }
    write_json(mujahid_note, os.path.join(bm_dir, "mujahid_2026_gypsum_silica_notes.json"))

    print(f"[Stage 4] Exported {len(rows)} mineral scaling/sensitivity cases + 6 benchmark artifacts.", flush=True)
    return {"rows": rows}


def main():
    t_start = time.time()
    print("=" * 75, flush=True)
    print("REDMind v2.0.0 EXPANDED SCIENTIFIC DATASET GENERATION PIPELINE", flush=True)
    print("=" * 75, flush=True)

    b51 = run_repaired_baseline_51()
    s1 = run_stage1_clean_cases()
    s2 = run_stage2_multicomponent_brines()
    s3 = run_stage3_scaling_risk()
    s4 = run_stage4_nucleation_and_benchmarks()

    all_rows = s1["rows"] + s2["rows"] + s3["rows"] + s4["rows"]
    all_failures = b51["failures"] + s1["failures"] + s2["failures"]

    # Unified global metadata/
    global_meta = os.path.join(DATA_DIR, "metadata")
    os.makedirs(global_meta, exist_ok=True)
    os.makedirs(REPORTS_DIR, exist_ok=True)

    summary_csv = os.path.join(global_meta, "simulation_summary.csv")
    write_csv(all_rows, summary_csv)
    write_csv(all_rows, os.path.join(REPORTS_DIR, "simulation_summary.csv"))
    write_csv(s2["audit_rows"], os.path.join(global_meta, "brine_audit.csv"))
    write_csv(
        all_failures,
        os.path.join(global_meta, "failure_log.csv"),
        columns=["case_id", "scenario_group", "reason", "error_detail"],
    )

    case_counts = {
        "original_51_preserved": 51,
        "repaired_baseline_51": len(b51["rows"]),
        "stage1_clean_operating_conditions": len(s1["rows"]),
        "stage2_multicomponent_brines": len(s2["rows"]),
        "stage3_calcite_saturation_risk": sum(1 for r in s3["rows"] if r["mineral_phase"] == "Calcite"),
        "stage3_gypsum_saturation_risk": sum(1 for r in s3["rows"] if r["mineral_phase"] == "Gypsum"),
        "stage4_cnt_nucleation": sum(1 for r in s4["rows"] if r["scenario_group"] == "mineral_nucleation_cnt"),
        "stage4_exploratory_delta_Rm": sum(1 for r in s4["rows"] if r["scenario_group"] == "exploratory_resistance_sensitivity"),
        "total_new_cases": len(all_rows),
        "total_failed_cases": len(all_failures),
    }

    manifest_v2 = {
        "dataset_title": "REDMind v2.0.0 Expanded Multiphysics & Mineral Scaling RED Dataset",
        "version": "2.0.0",
        "original_51_cases_preserved": "data/original_51_cases/ (untouched)",
        "repaired_baseline_51_location": "data/repaired_baseline_51/",
        "stage_directories": {
            "stage1_clean": "data/clean_cases/",
            "stage2_multicomponent": "data/multicomponent_brines/",
            "stage3_scaling_risk": "data/scaling_risk/",
            "stage4_mineral_scaling": "data/mineral_scaling/",
            "benchmarks": "data/benchmark_cases/",
        },
        "case_counts": case_counts,
        "random_seeds": {"baseline_lhs": 42, "stage1_sobol": 2026, "stage2_multicomponent": 2027},
        "wall_time_total_s": round(time.time() - t_start, 2),
    }
    write_json(manifest_v2, os.path.join(global_meta, "manifest.json"))

    print("\n" + "=" * 75, flush=True)
    print("DATASET GENERATION SUMMARY:", json.dumps(case_counts, indent=2), flush=True)
    print(f"Total elapsed time: {time.time() - t_start:.1f} s", flush=True)
    print("=" * 75, flush=True)


if __name__ == "__main__":
    main()
