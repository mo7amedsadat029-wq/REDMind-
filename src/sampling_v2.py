"""
Sobol quasi-random and scenario-based parameter sampling for REDMind v2.0.0.

Uses SciPy Sobol QMC (fixed seed=2026) over configs/clean_operating_cases.yaml
to generate 90 distinct clean operating condition cases without duplication.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

import numpy as np
import yaml
from scipy.stats import qmc

from src.reference_simulator import SimulationConfig


def load_yaml(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def sample_clean_sobol_cases(config_path: str | None = None) -> List[SimulationConfig]:
    """Generate 90 unique Sobol-sampled clean binary NaCl RED cases from YAML config."""
    if config_path is None:
        config_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "configs", "clean_operating_cases.yaml")
        )
    cfg_yaml = load_yaml(config_path)
    seed = int(cfg_yaml["random_seed"])
    n_cases = int(cfg_yaml["n_new_cases"])
    grid = cfg_yaml["grid"]
    fixed = cfg_yaml["fixed_parameters"]
    bounds = cfg_yaml["sampling_bounds"]

    dim_keys = [
        "c_conc_inlet_mol_m3",
        "c_dil_inlet_mol_m3",
        "u_mean_conc_m_s",
        "u_mean_dil_m_s",
        "T_K",
        "channel_height_m",
        "channel_length_m",
        "X_fix_mag_mol_m3",
        "sigma_mem_S_m",
        "D_co_mem_m2_s",
    ]
    lo = np.array([bounds[k][0] for k in dim_keys], dtype=float)
    hi = np.array([bounds[k][1] for k in dim_keys], dtype=float)

    sampler = qmc.Sobol(d=len(dim_keys), scramble=True, seed=seed)
    # Generate next power of 2 >= n_cases and slice strictly first n_cases
    m_pow = int(np.ceil(np.log2(max(n_cases, 2))))
    unit_pts = sampler.random_base2(m=m_pow)[:n_cases]
    scaled = qmc.scale(unit_pts, lo, hi)

    load_fractions = [float(v) for v in bounds["load_fractions"]]
    configs: List[SimulationConfig] = []

    for idx in range(n_cases):
        row = scaled[idx]
        lf = load_fractions[idx % len(load_fractions)]
        d_co = float(row[9])
        cfg = SimulationConfig(
            case_id=f"clean_sobol_{idx + 1:03d}",
            channel_height=float(row[5]),
            channel_length=float(row[6]),
            membrane_thickness_cem=float(fixed["membrane_thickness_cem"]),
            membrane_thickness_aem=float(fixed["membrane_thickness_aem"]),
            nx=int(grid["nx"]),
            ny=int(grid["ny"]),
            u_mean_conc=float(row[2]),
            u_mean_dil=float(row[3]),
            c_conc_inlet=float(row[0]),
            c_dil_inlet=float(row[1]),
            D_na=float(fixed["D_na_25C"]),
            D_cl=float(fixed["D_cl_25C"]),
            rho=float(fixed["rho"]),
            mu=float(fixed["mu_25C"]),
            T=float(row[4]),
            X_cem=-float(row[7]),
            X_aem=float(row[7]),
            D_counter_cem=1.0e-11,
            D_co_cem=d_co,
            D_counter_aem=1.0e-11,
            D_co_aem=d_co,
            sigma_cem=float(row[8]),
            sigma_aem=float(row[8]),
            max_coupling_iter=int(fixed["max_coupling_iter"]),
            coupling_tol=float(fixed["coupling_tol"]),
            relaxation=float(fixed["relaxation"]),
            eta_pump=float(fixed["eta_pump"]),
            load_fraction=lf,
            temperature_dependent_properties=bool(fixed["temperature_dependent_properties"]),
        )
        configs.append(cfg)

    return configs
