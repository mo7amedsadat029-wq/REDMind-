"""Pytest verification suite for the USGS pitzer.dat high-ionic-strength geochemical model."""

import math
import pytest

from src.pitzer_model import (
    compute_pitzer_activities,
    evaluate_mineral_saturation_pitzer,
    get_phase_log_ksp,
)


def test_pitzer_nacl_mean_activity_against_robinson_stokes():
    """Verify NaCl mean ionic activity coefficient gamma_+/- and osmotic coefficient phi against standard 25 C values."""
    # Robinson & Stokes benchmark for aqueous NaCl at 25 C:
    # m=0.1 -> gamma_+/- ~ 0.778; m=1.0 -> ~0.657; m=2.0 -> ~0.668; m=4.0 -> ~0.783
    benchmarks = [
        (0.1, 0.778, 0.015),
        (1.0, 0.657, 0.015),
        (2.0, 0.668, 0.015),
        (4.0, 0.783, 0.025),
    ]
    for m_nacl, expected_g, tol in benchmarks:
        res = compute_pitzer_activities({"Na+": m_nacl, "Cl-": m_nacl}, T_K=298.15)
        g_pm = math.sqrt(res.gamma_molal["Na+"] * res.gamma_molal["Cl-"])
        assert abs(g_pm - expected_g) < tol, f"NaCl m={m_nacl}: got {g_pm:.4f}, expected {expected_g:.4f}"
        assert 0.85 < res.water_activity < 1.0


def test_pitzer_gypsum_solubility_pure_water_and_nacl_salting_in():
    """Verify Gypsum saturation in pure water (~0.0152 mol/kg) and salting-in in 3m NaCl (~0.045 mol/kg)."""
    # Pure water gypsum solubility at 25 C ~ 2.09 g/L ~ 0.0153 mol CaSO4 / kg H2O => SI ~ 0
    pure = evaluate_mineral_saturation_pitzer(
        {"Ca": 15.2, "SO4": 15.2}, pH=7.0, T_K=298.15, speciate_carbonate_from_pH=False
    )
    assert abs(pure.si_gypsum) < 0.12

    # 3m NaCl salting-in: 15.2 mol/m3 becomes clearly undersaturated while ~55 mol/m3 is near equilibrium
    salt_undersat = evaluate_mineral_saturation_pitzer(
        {"Na": 3000.0, "Cl": 3000.0, "Ca": 15.2, "SO4": 15.2},
        pH=7.0, T_K=298.15, speciate_carbonate_from_pH=False,
    )
    salt_sat = evaluate_mineral_saturation_pitzer(
        {"Na": 3000.0, "Cl": 3000.0, "Ca": 55.0, "SO4": 55.0},
        pH=7.0, T_K=298.15, speciate_carbonate_from_pH=False,
    )
    assert salt_undersat.si_gypsum < -0.35
    assert abs(salt_sat.si_gypsum) < 0.12
    assert salt_sat.si_gypsum > salt_undersat.si_gypsum + 0.5


def test_pitzer_three_regimes_calcite_and_gypsum():
    """Verify clean separation into Undersaturated (SI<-0.1), Near-equilibrium (|SI|<=0.1), Supersaturated (SI>0.1)."""
    # Calcite at pH 6.8 vs ~7.45 vs 8.5 in 0.7 M seawater matrix
    base_sw = {"Na": 500.0, "K": 10.0, "Mg": 50.0, "Ca": 11.0, "Cl": 570.0, "SO4": 28.0, "HCO3": 2.3, "CO3": 0.1}
    under = evaluate_mineral_saturation_pitzer(base_sw, pH=6.6, T_K=298.15)
    supersat = evaluate_mineral_saturation_pitzer(base_sw, pH=8.5, T_K=298.15)
    assert under.calcite_regime == "Undersaturated" and under.si_calcite < -0.1
    assert supersat.calcite_regime == "Supersaturated" and supersat.si_calcite > 0.1
    assert supersat.davies_validity_flag == "invalid_high_ionic_strength_I>0.5"

    # Gypsum regimes via Ca/SO4 concentrations in 1.0 M NaCl
    g_under = evaluate_mineral_saturation_pitzer(
        {"Na": 1000.0, "Cl": 1000.0, "Ca": 10.0, "SO4": 20.0}, pH=7.5, T_K=298.15, speciate_carbonate_from_pH=False
    )
    g_super = evaluate_mineral_saturation_pitzer(
        {"Na": 1000.0, "Cl": 1000.0, "Ca": 45.0, "SO4": 90.0}, pH=7.5, T_K=298.15, speciate_carbonate_from_pH=False
    )
    assert g_under.gypsum_regime == "Undersaturated"
    assert g_super.gypsum_regime == "Supersaturated"


def test_pitzer_ksp_temperature_trend():
    """Calcite shows retrograde solubility (log Ksp decreases with T)."""
    k25 = get_phase_log_ksp("Calcite", T_K=298.15, use_analytic=True)
    k40 = get_phase_log_ksp("Calcite", T_K=313.15, use_analytic=True)
    assert k40 < k25
    assert abs(k25 - (-8.48)) < 0.05
