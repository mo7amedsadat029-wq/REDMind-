"""Test dimensional and unit consistency."""
from configs.default_config import GAS_CONST, FARADAY, TEMPERATURE, D_NA, D_CL


def test_units_consistency():
    # Thermal voltage: V = J/C
    v_thermal = GAS_CONST * TEMPERATURE / FARADAY
    assert 0.025 < v_thermal < 0.026

    # Ambipolar diffusivity: m2/s
    D_eff = 2.0 * D_NA * D_CL / (D_NA + D_CL)
    assert 1.5e-9 < D_eff < 1.7e-9
