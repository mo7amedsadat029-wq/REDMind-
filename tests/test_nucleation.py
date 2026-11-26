"""Pytest verification suite for the CNT heterogeneous mineral nucleation model."""

import math
import pytest

from src.nucleation_model import (
    evaluate_heterogeneous_nucleation,
    wenzel_wetting_factor,
    NUCLEATION_BARRIER_THRESHOLD_KBT,
)


def test_wenzel_wetting_factor_limits():
    """Verify f(theta) = 0.5 at 90 deg smooth wall and decreases with smaller contact angle or roughness."""
    theta_90, f_90 = wenzel_wetting_factor(90.0, 1.0)
    assert abs(theta_90 - 90.0) < 1e-6
    assert abs(f_90 - 0.5) < 1e-6

    _, f_60_smooth = wenzel_wetting_factor(60.0, 1.0)
    _, f_60_rough = wenzel_wetting_factor(60.0, 1.2)
    # 0.25*(2+0.5)*(0.5)^2 = 0.15625
    assert abs(f_60_smooth - 0.15625) < 1e-6
    assert f_60_rough < f_60_smooth


def test_cnt_category_transitions_and_monotone_barriers():
    """Verify strictly defined Category A / B / C classification without Category D fabrication."""
    res_a = evaluate_heterogeneous_nucleation("Calcite", omega=0.5, contact_angle_deg=60.0, roughness_factor=1.2)
    res_b_eq = evaluate_heterogeneous_nucleation("Calcite", omega=1.0, contact_angle_deg=60.0, roughness_factor=1.2)
    res_b_mild = evaluate_heterogeneous_nucleation("Calcite", omega=3.0, contact_angle_deg=60.0, roughness_factor=1.2)
    res_c = evaluate_heterogeneous_nucleation("Calcite", omega=20.0, contact_angle_deg=60.0, roughness_factor=1.2)

    assert res_a.condition_category == "Category A: Clean membrane"
    assert res_b_eq.condition_category == "Category B: Scaling-risk condition"
    assert res_b_mild.condition_category == "Category B: Scaling-risk condition"
    assert res_c.condition_category == "Category C: Nucleation-prone condition"
    assert res_c.barrier_het_kBT <= NUCLEATION_BARRIER_THRESHOLD_KBT
    assert res_c.critical_radius_nm < res_b_mild.critical_radius_nm
    assert res_c.boltzmann_propensity > res_b_mild.boltzmann_propensity


def test_cnt_gypsum_and_contact_angle_sensitivity():
    """Smaller contact angle reduces heterogeneous barrier DeltaG*_het."""
    res_low = evaluate_heterogeneous_nucleation("Gypsum", omega=4.0, contact_angle_deg=45.0, roughness_factor=1.1)
    res_high = evaluate_heterogeneous_nucleation("Gypsum", omega=4.0, contact_angle_deg=85.0, roughness_factor=1.1)
    assert res_low.delta_G_het_J < res_high.delta_G_het_J
    assert res_low.critical_radius_nm == pytest.approx(res_high.critical_radius_nm, rel=1e-9)
