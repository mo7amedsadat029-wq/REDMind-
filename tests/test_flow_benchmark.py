"""Test flow benchmark (Analytical Poiseuille solution)."""
import pytest
import numpy as np
from src.geometry import ChannelGeometry
from src.flow_solver import analytical_poiseuille_2d, verify_poiseuille_mass_conservation


def test_analytical_poiseuille():
    geom = ChannelGeometry(height=270e-6, length=0.10, ny=51, nx=101)
    flow = analytical_poiseuille_2d(geom, u_mean=0.01, rho=997.0, mu=8.9e-4)
    res = verify_poiseuille_mass_conservation(flow, geom)
    assert res['all_pass'], f"Flow verification failed: {res}"
    assert abs(res['u_max_error']) < 1e-6
    assert res['u_wall_bottom'] < 1e-12
