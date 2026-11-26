"""
Dataset writer v2.0.0 for REDMind expanded scientific dataset.

Supports exporting:
  - Repaired baseline 51 cases (separate from untouched data/original_51_cases/)
  - Stage 1: Clean operating conditions (binary 2D Sobol cases, including Jx/Jy & fluxes)
  - Stage 2: Multicomponent desalination-brine 2D Nernst-Planck + Donnan cases + Pitzer wall SI
  - Stage 3: Calcite & Gypsum Pitzer saturation-risk cases
  - Stage 4: CNT heterogeneous nucleation & exploratory Delta-R_m sensitivity scenarios
  - Literature benchmarks & global v2.0.0 metadata/manifest/audit/failure logs
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from src.ion_transport import compute_diffusive_flux
from src.multicomponent_transport import SPECIES_ORDER, MulticomponentSimResult
from src.reference_simulator import SimulationResult


def export_clean_case_npz(
    result: SimulationResult,
    output_dir: str,
    J_cem: Optional[np.ndarray] = None,
    J_aem: Optional[np.ndarray] = None,
) -> str:
    """Export 2D binary spatial fields including diffusive fluxes Jx, Jy and interface profiles."""
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, f"{result.config.case_id}_fields.npz")
    D_eff = result.config.D_eff
    Jx_conc, Jy_conc = compute_diffusive_flux(result.c_conc, result.geometry.concentrated, D_eff)
    Jx_dil, Jy_dil = compute_diffusive_flux(result.c_dil, result.geometry.dilute, D_eff)

    payload: Dict[str, Any] = dict(
        x_conc=result.geometry.concentrated.X,
        y_conc=result.geometry.concentrated.Y_global,
        region_conc=np.ones_like(result.c_conc, dtype=np.int32),
        u_conc=result.flow_conc.u,
        v_conc=result.flow_conc.v,
        p_conc=result.flow_conc.p,
        c_na_conc=result.c_conc,
        c_cl_conc=result.c_conc,
        phi_conc=result.phi_conc,
        Jx_conc=Jx_conc,
        Jy_conc=Jy_conc,
        x_dil=result.geometry.dilute.X,
        y_dil=result.geometry.dilute.Y_global,
        region_dil=np.zeros_like(result.c_dil, dtype=np.int32),
        u_dil=result.flow_dil.u,
        v_dil=result.flow_dil.v,
        p_dil=result.flow_dil.p,
        c_na_dil=result.c_dil,
        c_cl_dil=result.c_dil,
        phi_dil=result.phi_dil,
        Jx_dil=Jx_dil,
        Jy_dil=Jy_dil,
        x_interface=result.geometry.concentrated.x,
        cem_E_membrane=result.membrane_profiles["cem"]["E_membrane"],
        aem_E_membrane=result.membrane_profiles["aem"]["E_membrane"],
        E_cell_pair=result.membrane_profiles["E_cell_pair"],
        cem_alpha_conc=result.membrane_profiles["cem"]["permselectivity_conc"],
        cem_alpha_dil=result.membrane_profiles["cem"]["permselectivity_dil"],
    )
    if J_cem is not None:
        payload["J_cem_flux"] = J_cem
    if J_aem is not None:
        payload["J_aem_flux"] = J_aem

    np.savez_compressed(filepath, **payload)
    return filepath


def export_multicomponent_case_npz(
    result: MulticomponentSimResult,
    output_dir: str,
    pitzer_profiles: Optional[Dict[str, np.ndarray]] = None,
) -> str:
    """Export 2D multicomponent spatial fields (all 8 species, potential, interface fluxes, optional Pitzer wall SI)."""
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, f"{result.config.case_id}_fields.npz")

    payload: Dict[str, Any] = dict(
        x_conc=result.geometry.concentrated.X,
        y_conc=result.geometry.concentrated.Y_global,
        region_conc=np.ones_like(result.phi_conc, dtype=np.int32),
        u_conc=result.flow_conc.u,
        v_conc=result.flow_conc.v,
        p_conc=result.flow_conc.p,
        phi_conc=result.phi_conc,
        x_dil=result.geometry.dilute.X,
        y_dil=result.geometry.dilute.Y_global,
        region_dil=np.zeros_like(result.phi_dil, dtype=np.int32),
        u_dil=result.flow_dil.u,
        v_dil=result.flow_dil.v,
        p_dil=result.flow_dil.p,
        phi_dil=result.phi_dil,
        x_interface=result.geometry.concentrated.x,
        E_cem_profile=result.E_cem_profile,
        E_aem_profile=result.E_aem_profile,
        E_cell_pair=result.E_cem_profile + result.E_aem_profile,
    )
    for sp in SPECIES_ORDER:
        payload[f"c_{sp}_conc"] = result.c_conc[sp]
        payload[f"c_{sp}_dil"] = result.c_dil[sp]
        payload[f"J_cem_{sp}"] = result.J_cem[sp]
        payload[f"J_aem_{sp}"] = result.J_aem[sp]

    if pitzer_profiles:
        for k, arr in pitzer_profiles.items():
            payload[k] = arr

    np.savez_compressed(filepath, **payload)
    return filepath


def build_clean_metadata_row(
    result: SimulationResult,
    scenario_group: str,
    model_version: str,
    config_version: str,
    result_classification: str = "Numerically solved",
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build structured Section-11 metadata row for a binary clean RED simulation."""
    cfg = result.config
    elec = result.electrical
    i_op = (
        float(cfg.current_density)
        if cfg.current_density is not None
        else float(cfg.load_fraction * (elec.E_ocv / elec.R_internal))
    )
    v_cell = max(elec.E_ocv - i_op * elec.R_internal, 0.0)
    p_loaded = i_op * v_cell if i_op > 0.0 else elec.P_gross_max
    q_conc_m2_s = cfg.u_mean_conc * cfg.channel_height
    q_dil_m2_s = cfg.u_mean_dil * cfg.channel_height

    row: Dict[str, Any] = {
        "case_id": cfg.case_id,
        "scenario_group": scenario_group,
        "brine_profile_id": "synthetic_NaCl",
        "result_classification": result_classification,
        "model_version": model_version,
        "config_version": config_version,
        "time_s": None,
        "converged": bool(result.converged),
        "iterations": int(result.coupling_iterations),
        "wall_time_s": float(result.wall_time_seconds),
        "nx": int(cfg.nx),
        "ny": int(cfg.ny),
        "dx_um": float(result.geometry.concentrated.dx * 1e6),
        "dy_um": float(result.geometry.concentrated.dy * 1e6),
        "channel_height_um": float(cfg.channel_height * 1e6),
        "channel_length_cm": float(cfg.channel_length * 1e2),
        "membrane_thickness_cem_um": float(cfg.membrane_thickness_cem * 1e6),
        "membrane_thickness_aem_um": float(cfg.membrane_thickness_aem * 1e6),
        "c_conc_inlet_mol_m3": float(cfg.c_conc_inlet),
        "c_dil_inlet_mol_m3": float(cfg.c_dil_inlet),
        "u_mean_conc_m_s": float(cfg.u_mean_conc),
        "u_mean_dil_m_s": float(cfg.u_mean_dil),
        "flow_rate_per_width_conc_m2_s": float(q_conc_m2_s),
        "flow_rate_per_width_dil_m2_s": float(q_dil_m2_s),
        "temperature_K": float(cfg.T),
        "X_cem_mol_m3": float(cfg.X_cem),
        "X_aem_mol_m3": float(cfg.X_aem),
        "sigma_cem_S_m": float(cfg.sigma_cem),
        "sigma_aem_S_m": float(cfg.sigma_aem),
        "D_co_cem_m2_s": float(cfg.D_co_cem),
        "D_co_aem_m2_s": float(cfg.D_co_aem),
        "load_fraction": float(cfg.load_fraction),
        "Re_conc": float(result.flow_conc.Re),
        "Re_dil": float(result.flow_dil.Re),
        "delta_p_conc_Pa": float(result.flow_conc.delta_p),
        "delta_p_dil_Pa": float(result.flow_dil.delta_p),
        "mass_balance_rel_err_conc": float(result.mass_balance_conc["relative_error"]),
        "mass_balance_rel_err_dil": float(result.mass_balance_dil["relative_error"]),
        "electroneutrality_err": 0.0,
        "min_conc_mol_m3": float(min(np.min(result.c_conc), np.min(result.c_dil))),
        "ocv_mV": float(elec.E_ocv * 1000.0),
        "R_internal_Ohm_cm2": float(elec.R_internal * 1e4),
        "R_conc_Ohm_cm2": float(elec.R_conc * 1e4),
        "R_dil_Ohm_cm2": float(elec.R_dil * 1e4),
        "R_mem_Ohm_cm2": float((elec.R_cem + elec.R_aem) * 1e4),
        "I_op_A_m2": float(i_op),
        "V_cell_V": float(v_cell),
        "P_gross_max_W_m2": float(elec.P_gross_max),
        "P_gross_loaded_W_m2": float(p_loaded),
        "P_pump_total_W_m2": float(elec.P_pump_total),
        "P_net_max_W_m2": float(elec.P_net_max),
        "permselectivity_cem": float(elec.alpha_cem),
        "permselectivity_aem": float(elec.alpha_aem),
        "mineral_phase": "None",
        "saturation_index": None,
        "saturation_model": "None",
        "activity_model": "Ideal (1:1 NaCl)",
        "ksp_source": "None",
        "membrane_type": "CEM+AEM",
        "nucleation_model_id": "None",
        "deposition_model_validity_status": "Category A: Clean membrane",
        "performance_reduction_pct": 0.0,
    }
    if extra:
        row.update(extra)
    return row


def write_csv(rows: List[Dict[str, Any]], filepath: str, columns: Optional[List[str]] = None) -> str:
    """Write rows to CSV cleanly, creating parent directories."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    if rows:
        df = pd.DataFrame(rows)
        if columns:
            for col in columns:
                if col not in df.columns:
                    df[col] = None
            df = df[columns]
    else:
        df = pd.DataFrame(columns=columns or [])
    df.to_csv(filepath, index=False)
    return filepath


def write_json(data: Any, filepath: str) -> str:
    """Write formatted JSON cleanly."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    return filepath
