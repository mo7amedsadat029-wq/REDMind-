"""Test mesh refinement convergence."""
from src.verification import test_9_mesh_convergence_study as run_mesh_convergence_study


def test_mesh_convergence():
    res = run_mesh_convergence_study()
    assert res.passed, f"Mesh convergence failed: {res.summary}"
    assert res.details['rel_change_ocv'] < 0.02
    assert res.details['rel_change_power'] < 0.02
