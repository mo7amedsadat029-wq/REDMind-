"""
Geometry definition for 2D RED cell-pair simulation.

Defines the computational domain for a single cell pair consisting of:
- Concentrated solution channel (top)
- Membrane interface (CEM) between concentrated and dilute channels
- Dilute solution channel (bottom)
- Membrane interface (AEM) at the bottom of dilute channel

The 2D domain is in the x-y plane where:
- x: streamwise direction (flow direction)
- y: transverse direction (perpendicular to membranes)

Based on Gurreri et al. (2017), the domain represents a periodic
unit cell of the RED stack: one cell pair = one concentrated channel
+ one dilute channel bounded by ion-exchange membranes.

Geometry (y increases upward):
  ──────── AEM (top boundary, y = 2*h) ────────
  |          Concentrated channel              |
  ──────── CEM (interface, y = h) ─────────────
  |          Dilute channel                    |
  ──────── AEM (bottom boundary, y = 0) ───────

Note: The membranes are treated as interfaces (boundary conditions)
rather than resolved domains, following a common simplified approach.
If the full Gurreri model resolves membrane interiors, we document
this as a simplification.
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Optional, Tuple


@dataclass
class ChannelGeometry:
    """Geometry for a single channel in the RED cell pair."""
    height: float       # m - channel height
    length: float       # m - channel length (streamwise)
    ny: int             # number of grid points in y
    nx: int             # number of grid points in x
    y_offset: float = 0.0  # m - y position of channel bottom

    def __post_init__(self):
        self.dx = self.length / (self.nx - 1)
        self.dy = self.height / (self.ny - 1)
        self.aspect_ratio = self.length / self.height

    @property
    def x(self) -> np.ndarray:
        """1D array of x coordinates."""
        return np.linspace(0, self.length, self.nx)

    @property
    def y(self) -> np.ndarray:
        """1D array of y coordinates (local, starting from 0)."""
        return np.linspace(0, self.height, self.ny)

    @property
    def y_global(self) -> np.ndarray:
        """1D array of y coordinates (global, with offset)."""
        return np.linspace(self.y_offset, self.y_offset + self.height, self.ny)

    @property
    def X(self) -> np.ndarray:
        """2D meshgrid of x coordinates."""
        x, y = np.meshgrid(self.x, self.y, indexing='ij')
        return x

    @property
    def Y(self) -> np.ndarray:
        """2D meshgrid of y coordinates (local)."""
        x, y = np.meshgrid(self.x, self.y, indexing='ij')
        return y

    @property
    def Y_global(self) -> np.ndarray:
        """2D meshgrid of y coordinates (global)."""
        x, y = np.meshgrid(self.x, self.y_global, indexing='ij')
        return y


@dataclass
class CellPairGeometry:
    """
    Geometry for a complete RED cell pair.

    The cell pair consists of two channels (concentrated and dilute)
    separated by a cation exchange membrane (CEM).
    The concentrated channel is bounded above by an AEM,
    the dilute channel is bounded below by an AEM.

    This gives the repeating unit of a RED stack.
    """
    channel_height: float    # m - height of each channel
    channel_length: float    # m - length of channels
    nx: int                  # grid points in x
    ny_per_channel: int      # grid points in y per channel
    membrane_thickness_cem: float = 125e-6  # m
    membrane_thickness_aem: float = 125e-6  # m

    def __post_init__(self):
        # Dilute channel: y = [0, channel_height]
        self.dilute = ChannelGeometry(
            height=self.channel_height,
            length=self.channel_length,
            ny=self.ny_per_channel,
            nx=self.nx,
            y_offset=0.0
        )

        # Concentrated channel: y = [channel_height, 2*channel_height]
        # (In the physical domain, separated by CEM)
        self.concentrated = ChannelGeometry(
            height=self.channel_height,
            length=self.channel_length,
            ny=self.ny_per_channel,
            nx=self.nx,
            y_offset=self.channel_height
        )

    @property
    def total_height(self) -> float:
        """Total height of the cell pair domain (channels only)."""
        return 2 * self.channel_height

    @property
    def hydraulic_diameter(self) -> float:
        """
        Hydraulic diameter for a plane channel (2D slit).
        D_h = 2 * h for an infinite-width slit.
        """
        return 2.0 * self.channel_height

    def reynolds_number(self, u_mean: float, rho: float, mu: float) -> float:
        """
        Calculate Reynolds number for channel flow.

        Re = rho * u_mean * D_h / mu

        Parameters
        ----------
        u_mean : float - mean velocity (m/s)
        rho : float - density (kg/m³)
        mu : float - dynamic viscosity (Pa·s)
        """
        return rho * u_mean * self.hydraulic_diameter / mu

    def summary(self) -> str:
        """Return a summary string of the geometry."""
        lines = [
            "=" * 60,
            "RED Cell Pair Geometry Summary",
            "=" * 60,
            f"Channel height:       {self.channel_height*1e6:.1f} um",
            f"Channel length:       {self.channel_length*1e2:.2f} cm",
            f"Aspect ratio:         {self.channel_length/self.channel_height:.0f}",
            f"Hydraulic diameter:   {self.hydraulic_diameter*1e6:.1f} um",
            f"CEM thickness:        {self.membrane_thickness_cem*1e6:.1f} um",
            f"AEM thickness:        {self.membrane_thickness_aem*1e6:.1f} um",
            f"Grid (nx * ny/ch):    {self.nx} * {self.ny_per_channel}",
            f"dx:                   {self.dilute.dx*1e6:.1f} um",
            f"dy:                   {self.dilute.dy*1e6:.1f} um",
            "=" * 60,
        ]
        return "\n".join(lines)


def create_default_geometry(nx=100, ny=30) -> CellPairGeometry:
    """Create geometry with default parameters from Gurreri et al. (2017)."""
    from configs.default_config import (
        CHANNEL_HEIGHT, CHANNEL_LENGTH,
        MEMBRANE_THICKNESS_CEM, MEMBRANE_THICKNESS_AEM
    )
    return CellPairGeometry(
        channel_height=CHANNEL_HEIGHT,
        channel_length=CHANNEL_LENGTH,
        nx=nx,
        ny_per_channel=ny,
        membrane_thickness_cem=MEMBRANE_THICKNESS_CEM,
        membrane_thickness_aem=MEMBRANE_THICKNESS_AEM,
    )
