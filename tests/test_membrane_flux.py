"""Test trans-membrane salt flux consistency."""
from src.reference_simulator import SimulationConfig, run_simulation


def test_membrane_flux():
    cfg = SimulationConfig(nx=40, ny=15, max_coupling_iter=20)
    sim = run_simulation(cfg, verbose=False)
    assert sim.converged
    last_iter = sim.convergence_history[-1]
    assert last_iter['J_cem_avg'] > 0
    assert last_iter['J_aem_avg'] > 0
