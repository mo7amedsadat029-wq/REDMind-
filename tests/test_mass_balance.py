"""Test species mass balance."""
from src.reference_simulator import SimulationConfig, run_simulation


def test_species_mass_balance():
    cfg = SimulationConfig(nx=40, ny=15, max_coupling_iter=20)
    sim = run_simulation(cfg, verbose=False)
    assert sim.mass_balance_conc['relative_error'] < 0.02
    assert sim.mass_balance_dil['relative_error'] < 0.02
