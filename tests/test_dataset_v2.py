"""Automated verification & schema integrity suite for REDMind v2.0.0 datasets."""

import json
import os
import numpy as np
import pandas as pd


def test_original_51_cases_preserved_untouched():
    """Original 51 cases must remain preserved and intact in data/original_51_cases/."""
    orig_meta = pd.read_csv("data/original_51_cases/metadata/case_metadata.csv")
    assert len(orig_meta) == 51
    assert os.path.exists("data/original_51_cases/generated/case_000_reference_fields.npz")


def test_repaired_baseline_51_verified():
    """Repaired baseline 51 cases must exist separately and pass tight mass balance checks."""
    df = pd.read_csv("data/repaired_baseline_51/metadata/case_metadata.csv")
    assert len(df) == 51
    assert df["converged"].all()
    assert df["mass_balance_rel_err_conc"].max() < 0.02
    assert df["mass_balance_rel_err_dil"].max() < 0.02


def test_stage1_clean_sobol_dataset():
    """Stage 1 must contain unique Sobol cases with fluxes and clean physical checks."""
    df = pd.read_csv("data/clean_cases/case_metadata.csv")
    assert len(df) >= 80
    assert df["case_id"].is_unique
    assert df["converged"].all()
    assert (df["min_conc_mol_m3"] > 0.0).all()
    assert (df["P_gross_max_W_m2"] > 0.0).all()
    assert df["mass_balance_rel_err_conc"].max() < 0.02
    assert df["mass_balance_rel_err_dil"].max() < 0.02

    # Check spatial NPZ includes Jx/Jy and J_cem_flux/J_aem_flux
    sample_npz = np.load(f"data/clean_cases/generated/{df.iloc[0]['case_id']}_fields.npz")
    for k in ["x_conc", "u_conc", "p_conc", "c_na_conc", "phi_conc", "Jx_conc", "Jy_conc", "J_cem_flux", "J_aem_flux"]:
        assert k in sample_npz


def test_stage2_multicomponent_brines_and_audit():
    """Stage 2 must enforce electroneutrality, mass balance, and exclude incomplete Santoro 2024 IC profile."""
    audit = pd.read_csv("data/metadata/brine_audit.csv")
    inc = audit[audit["profile_id"] == "hypersaline_swro_santoro_2024_ic"]
    assert len(inc) == 1
    assert bool(inc.iloc[0]["included_in_transport_pde"]) is False

    df = pd.read_csv("data/multicomponent_brines/case_metadata.csv")
    assert len(df) >= 40
    assert df["case_id"].is_unique
    assert "hypersaline_swro_santoro_2024_ic" not in set(df["brine_profile_id"])
    assert df["converged"].all()
    assert df["electroneutrality_err"].max() < 1e-3
    assert df["mass_balance_rel_err_conc"].max() < 0.02
    assert df["mass_balance_rel_err_dil"].max() < 0.02

    sample_npz = np.load(f"data/multicomponent_brines/generated/{df.iloc[0]['case_id']}_fields.npz")
    for k in ["c_Na_conc", "c_Mg_conc", "c_Ca_conc", "c_SO4_conc", "c_CO3_conc", "si_calcite_cem_conc", "si_gypsum_cem_conc"]:
        assert k in sample_npz


def test_stage3_pitzer_three_regimes():
    """Stage 3 must cover Undersaturated, Near-equilibrium, and Supersaturated regimes for both Calcite and Gypsum."""
    df = pd.read_csv("data/scaling_risk/case_metadata.csv")
    for mineral in ("Calcite", "Gypsum"):
        sub = df[df["mineral_phase"] == mineral]
        regimes = set(sub["saturation_regime"])
        assert regimes == {"Undersaturated", "Near-equilibrium", "Supersaturated"}
        assert (sub["result_classification"] == "Thermodynamic post-processing").all()


def test_stage4_cnt_and_exploratory_labeling():
    """Stage 4 must separate CNT thermodynamic barriers from Exploratory sensitivity scenarios."""
    df = pd.read_csv("data/mineral_scaling/case_metadata.csv")
    cnt = df[df["scenario_group"] == "mineral_nucleation_cnt"]
    sens = df[df["scenario_group"] == "exploratory_resistance_sensitivity"]
    assert len(cnt) >= 15
    assert len(sens) >= 4
    assert (cnt["result_classification"] == "Thermodynamic post-processing").all()
    assert (sens["result_classification"] == "Exploratory sensitivity scenario").all()
    assert not any("Category D" in str(v) for v in df["deposition_model_validity_status"])

    with open("data/metadata/manifest.json", "r", encoding="utf-8") as f:
        man = json.load(f)
    assert man["version"] == "2.0.0"
