"""Pytest verification suite for the 2D Multicomponent Nernst-Planck + Donnan RED solver."""

import numpy as np
import yaml
import pytest

from src.reference_simulator import SimulationConfig, run_simulation
from src.multicomponent_transport import (
    SPECIES_ORDER,
    MulticomponentSimConfig,
    multi_ion_donnan_equilibrium,
    multi_ion_membrane_flux,
    multi_ion_membrane_flux_batch,
    prepare_electrolyte_composition,
    run_multicomponent_simulation,
    build_membrane_diffusivities,
    stokes_einstein_diffusivities,
)


def test_brine_charge_balance_and_incomplete_profile_protection():
    """Audit raw CBE, CO3 derivation from HCO3+pH, and explicit flagging of incomplete profiles."""
    with open("configs/brine_profiles.yaml", "r", encoding="utf-8") as f:
        bp = yaml.safe_load(f)

    p_med = bp["profiles"]["mediterranean_el_remel_brine"]
    aud_med = prepare_electrolyte_composition("med", conc_mg_L=p_med["concentrations_mg_L"], pH=p_med["pH"])
    assert abs(aud_med.cbe_balanced_pct) < 1e-10
    assert aud_med.missing_species == []

    p_rs = bp["profiles"]["red_sea_swro_brine_egypt"]
    aud_rs = prepare_electrolyte_composition(
        "rs", conc_mg_L=p_rs["concentrations_mg_L"], pH=p_rs["pH"], missing_species=p_rs["missing_species"]
    )
    assert "CO3_from_HCO3_pH" in aud_rs.derived_species
    assert aud_rs.conc_balanced_mol_m3["CO3"] > 0.0
    assert abs(aud_rs.cbe_balanced_pct) < 1e-10

    p_inc = bp["profiles"]["hypersaline_swro_santoro_2024_ic"]
    aud_inc = prepare_electrolyte_composition(
        "inc", conc_mg_L=p_inc["concentrations_mg_L"], pH=p_inc["pH"], missing_species=p_inc["missing_species"],
        enforce_electroneutrality=False,
    )
    assert "HCO3" in aud_inc.missing_species and "pH" in aud_inc.missing_species
    assert abs(aud_inc.cbe_raw_pct) > 5.0


def test_multi_ion_donnan_and_batch_flux_equivalence():
    """Scalar and vectorized batch Donnan + GHK membrane flux solvers must agree to machine precision."""
    c_sol = {"Na": 500.0, "K": 10.0, "Mg": 50.0, "Ca": 12.0, "Cl": 610.0, "SO4": 10.0, "HCO3": 4.0, "CO3": 0.5}
    c_mem, phi_d = multi_ion_donnan_equilibrium(c_sol, X_fix=-2000.0, T=298.15)
    net_mem = (
        c_mem["Na"] + c_mem["K"] + 2.0 * c_mem["Mg"] + 2.0 * c_mem["Ca"]
        - c_mem["Cl"] - 2.0 * c_mem["SO4"] - c_mem["HCO3"] - 2.0 * c_mem["CO3"] - 2000.0
    )
    assert abs(net_mem) < 1e-6
    assert phi_d < 0.0

    with open("configs/multicomponent_transport.yaml", "r", encoding="utf-8") as f:
        t_cfg = yaml.safe_load(f)
    D_aq = stokes_einstein_diffusivities(298.15)
    D_cem = build_membrane_diffusivities(t_cfg, D_aq, is_cem=True)

    wL = {"Na": 20.0, "K": 0.2, "Mg": 0.5, "Ca": 0.2, "Cl": 21.0, "SO4": 0.2, "HCO3": 0.2, "CO3": 0.01}
    f_sc, e_sc = multi_ion_membrane_flux(c_sol, wL, -2000.0, 125e-6, D_cem, 298.15, I_op=20.0)
    f_ba, e_ba, _, _ = multi_ion_membrane_flux_batch(
        {k: np.array([v]) for k, v in c_sol.items()},
        {k: np.array([v]) for k, v in wL.items()},
        -2000.0, 125e-6, D_cem, 298.15, I_op=20.0,
    )
    assert abs(e_sc - float(e_ba[0])) < 1e-9
    for sp in SPECIES_ORDER:
        assert abs(f_sc[sp] - float(f_ba[sp][0])) < 1e-12


def test_multicomponent_binary_limit_consistency():
    """Pure NaCl in multicomponent 2D solver matches physical 1:1 Nernst-Donnan EMF and binary resistance/salinity."""
    from src.multicomponent_transport import GAS_CONST, FARADAY
    cfg_bin = SimulationConfig(c_conc_inlet=500.0, c_dil_inlet=17.0, nx=40, ny=16, load_fraction=0.0)
    res_bin = run_simulation(cfg_bin, verbose=False)

    cfg_mc = MulticomponentSimConfig(
        case_id="binary_limit_check",
        conc_inlet={"Na": 500.0, "K": 0.0, "Mg": 0.0, "Ca": 0.0, "Cl": 500.0, "SO4": 0.0, "HCO3": 0.0, "CO3": 0.0},
        dil_inlet={"Na": 17.0, "K": 0.0, "Mg": 0.0, "Ca": 0.0, "Cl": 17.0, "SO4": 0.0, "HCO3": 0.0, "CO3": 0.0},
        nx=40, ny=16, load_fraction=0.0,
    )
    res_mc = run_multicomponent_simulation(cfg_mc)
    assert res_mc.converged
    # Exact 1D GHK with D_ct/D_co=100 closely matches the physical 1:1 TMS/Nernst-Donnan EMF (~0.17375 V)
    # (whereas binary v1 electrical model applies concentrated-side alpha_conc=0.8944 -> 0.1552 V)
    E_ideal_nernst = 2.0 * (GAS_CONST * 298.15 / FARADAY) * np.log(500.0 / 17.0)
    assert abs(res_mc.E_ocv - E_ideal_nernst) / E_ideal_nernst < 0.005
    assert abs(res_mc.R_internal - res_bin.electrical.R_internal) / res_bin.electrical.R_internal < 0.01
    assert abs(np.mean(res_mc.c_conc["Na"]) - np.mean(res_bin.c_conc)) / np.mean(res_bin.c_conc) < 0.005
    assert abs(np.mean(res_mc.c_dil["Na"]) - np.mean(res_bin.c_dil)) / np.mean(res_bin.c_dil) < 0.005
    assert res_mc.max_electroneutrality_err_conc < 1e-10
    assert res_mc.max_electroneutrality_err_dil < 1e-10
    assert res_mc.mass_balance_conc["Na"] < 0.01
    assert res_mc.mass_balance_dil["Na"] < 0.01


def test_multicomponent_zero_gradient_and_brine_convergence():
    """Verify zero-gradient limit gives zero OCV and realistic Mediterranean brine converges cleanly."""
    eq_in = {"Na": 100.0, "K": 2.0, "Mg": 10.0, "Ca": 2.0, "Cl": 120.0, "SO4": 2.5, "HCO3": 1.0, "CO3": 0.0}
    res_zero = run_multicomponent_simulation(
        MulticomponentSimConfig(case_id="zero_grad", conc_inlet=eq_in, dil_inlet=eq_in, nx=25, ny=12)
    )
    assert res_zero.converged
    assert abs(res_zero.E_ocv) < 1e-10

    with open("configs/brine_profiles.yaml", "r", encoding="utf-8") as f:
        bp = yaml.safe_load(f)
    p = bp["profiles"]["mediterranean_el_remel_feed"]
    aud = prepare_electrolyte_composition("med_feed", conc_mg_L=p["concentrations_mg_L"], pH=p["pH"])
    dil = prepare_electrolyte_composition("dil20", conc_mol_m3={"Na": 20.0, "Cl": 20.0}, pH=7.5)
    res_med = run_multicomponent_simulation(
        MulticomponentSimConfig(
            case_id="med_feed_test",
            conc_inlet=aud.conc_balanced_mol_m3,
            dil_inlet=dil.conc_balanced_mol_m3,
            nx=40, ny=16, load_fraction=0.5,
        )
    )
    assert res_med.converged
    assert res_med.min_conc_all >= 0.0
    assert res_med.max_electroneutrality_err_conc < 1e-10
    assert res_med.max_electroneutrality_err_dil < 1e-10
    assert res_med.P_gross_max > 0.0
