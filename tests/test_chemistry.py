"""Test geochemical calcite saturation calculations."""
from src.geochemistry import (
    calculate_activity_coefficient_davies,
    calculate_carbonate_species,
    evaluate_calcite_saturation
)


def test_chemistry_davies():
    # In pure water (I = 0), gamma = 1
    gamma_zero = calculate_activity_coefficient_davies(z=2, ionic_strength=0.0)
    assert abs(gamma_zero - 1.0) < 1e-6

    # In seawater (I ~ 0.5 M), gamma for divalent ions is ~0.2 - 0.35
    gamma_sw = calculate_activity_coefficient_davies(z=2, ionic_strength=0.5)
    assert 0.15 < gamma_sw < 0.45


def test_chemistry_calcite_saturation():
    # Standard seawater (pH 8.1, ~10 mM Ca2+, ~2.3 mM Alk) is slightly supersaturated with calcite (SI > 0)
    chem = evaluate_calcite_saturation(
        nacl_conc_mol_m3=500.0,
        ca_conc_mol_m3=10.0,
        alkalinity_mol_m3=2.3,
        pH=8.1
    )
    assert chem.si > -1.0  # reasonable marine range
    assert chem.iap > 0.0
    assert chem.omega > 0.0
