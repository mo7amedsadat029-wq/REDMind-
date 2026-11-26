"""
Default configuration for RED cell-pair simulation.

Based on Gurreri et al. (2017), Desalination, 423, 52-64.
Parameters are documented with their source and units.

All SI units unless noted.
"""

import numpy as np

# =============================================================================
# Physical constants
# =============================================================================
FARADAY = 96485.3329  # C/mol - Faraday constant
GAS_CONST = 8.31446   # J/(mol·K) - Universal gas constant
TEMPERATURE = 298.15  # K (25 °C) - Reference temperature

# =============================================================================
# Fluid properties (aqueous NaCl at ~25 °C)
# =============================================================================
WATER_DENSITY = 997.0       # kg/m³
WATER_VISCOSITY = 8.9e-4    # Pa·s (dynamic viscosity)

# =============================================================================
# Ion properties (binary NaCl electrolyte at infinite dilution, 25 °C)
# Source: Robinson & Stokes, standard electrochemistry references
# =============================================================================
# Na+ properties
Z_NA = 1           # charge number
D_NA = 1.334e-9    # m²/s - diffusion coefficient at infinite dilution

# Cl- properties
Z_CL = -1          # charge number
D_CL = 2.032e-9    # m²/s - diffusion coefficient at infinite dilution

# Effective salt diffusion coefficient (NaCl, Nernst-Hartley)
# D_salt = 2 * D_Na * D_Cl / (D_Na + D_Cl)
D_SALT = 2.0 * D_NA * D_CL / (D_NA + D_CL)  # ~1.611e-9 m²/s

# =============================================================================
# Channel geometry
# Source: Gurreri et al. (2017) - 2D cell pair, flat membranes
# =============================================================================
# Channel half-height (used for symmetric formulation)
# Typical RED channel thickness: 100-500 μm
CHANNEL_HEIGHT = 270e-6     # m - total channel height (from Gurreri et al.)
CHANNEL_HALF_HEIGHT = CHANNEL_HEIGHT / 2.0  # m
CHANNEL_LENGTH = 0.10       # m - channel length in flow direction (x)

# Membrane thickness
MEMBRANE_THICKNESS_CEM = 125e-6  # m - cation exchange membrane
MEMBRANE_THICKNESS_AEM = 125e-6  # m - anion exchange membrane

# =============================================================================
# Feed conditions
# Source: Gurreri et al. (2017) - typical RED operating conditions
# =============================================================================
# Concentrated stream (HIGH salinity - e.g., brine or seawater)
C_CONC_INLET = 500.0   # mol/m³ (0.5 M - seawater-like)

# Dilute stream (LOW salinity - e.g., river water)
C_DIL_INLET = 17.0     # mol/m³ (0.017 M - river water)

# Inlet flow velocity (mean)
# Typical RED: 0.5-2 cm/s
U_MEAN_CONC = 0.01      # m/s - mean velocity in concentrated channel
U_MEAN_DIL = 0.01       # m/s - mean velocity in dilute channel

# =============================================================================
# Membrane properties
# Source: Gurreri et al. (2017), Tedesco et al. (2016)
# =============================================================================
# Membrane fixed charge density
X_CEM = 5000.0  # mol/m³ - CEM fixed charge (negative groups, so cation-selective)
X_AEM = 5000.0  # mol/m³ - AEM fixed charge (positive groups, so anion-selective)

# Membrane diffusion coefficients (ions in membrane phase)
# These are effective values within the membrane matrix
# Typically 1-2 orders of magnitude lower than in free solution
D_NA_CEM = D_NA / 10.0   # m²/s - Na+ in CEM (counterion)
D_CL_CEM = D_NA / 100.0  # m²/s - Cl- in CEM (co-ion, much lower)
D_NA_AEM = D_CL / 100.0  # m²/s - Na+ in AEM (co-ion)
D_CL_AEM = D_CL / 10.0   # m²/s - Cl- in AEM (counterion)

# Membrane conductivity (alternative to resolving membrane interior)
# Can be used for simplified resistance calculation
SIGMA_CEM = 1.0  # S/m - typical CEM conductivity
SIGMA_AEM = 1.0  # S/m - typical AEM conductivity

# =============================================================================
# Numerical settings
# =============================================================================
# Mesh
NX = 100          # grid points in x (streamwise)
NY_CHANNEL = 30   # grid points in y per channel (transverse)

# Solver
MAX_ITER = 5000
TOLERANCE = 1e-6
RELAXATION_VELOCITY = 0.7
RELAXATION_CONCENTRATION = 0.5
RELAXATION_POTENTIAL = 0.3

# =============================================================================
# Electrical model
# =============================================================================
# External load resistance (ohm·m²)
# For maximum power: R_ext = R_internal
R_EXTERNAL = None  # None = calculate matched load

# Number of cell pairs (for stack-level calculations)
N_CELL_PAIRS = 1  # Single cell pair for baseline

# Pump efficiency
ETA_PUMP = 0.75  # dimensionless

# =============================================================================
# Output settings
# =============================================================================
SAVE_FIELDS = True
SAVE_FORMAT = 'npz'  # 'npz', 'hdf5', or 'csv'
RESULTS_DIR = 'results'
DATA_DIR = 'data/generated'
