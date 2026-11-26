"""
Multicomponent 2D Nernst-Planck + Donnan Transport Solver for RED Cell Pairs.

Extends the verified binary NaCl model to realistic multi-ion desalination brines
containing major seawater/RO ions: Na+, K+, Mg2+, Ca2+, Cl-, SO4(2-), HCO3-, CO3(2-).

Governing physics:
    1. Analytical plane Poiseuille laminar flow in HC and LC channels (Vogel viscosity T-scaling).
    2. 2D steady Nernst-Planck species conservation on each channel:
           div(J_k) = 0,  J_k = u * c_k - D_k * grad(c_k) - (z_k * D_k * F / RT) * c_k * grad(phi)
    3. Local electroneutrality closure for electric potential phi:
           div(kappa * grad(phi)) = -F * sum_k z_k * div(D_k * grad(c_k))
       where kappa = (F^2 / RT) * sum_k z_k^2 * D_k * c_k.
    4. Multi-ion Donnan equilibrium at CEM/AEM interfaces solved via exact bracketed Newton
       for ln(psi_D) in sum_k z_k * c_k^sol * exp(z_k * u_D) + X_fix = 0.
    5. Multi-ion Goldman-Hodgkin-Katz (constant-field) 1D Nernst-Planck flux across
       each membrane enforcing net membrane current density I_mem = I_op.

References:
    - Gurreri et al. (2017), Desalination 423, 52-64.
    - Tedesco, Hamelers & Biesheuvel (2016), J. Membrane Science 510, 370-381; Part II (2017).
    - USGS PHREEQC pitzer.dat (aqueous tracer diffusivities Dw at 25 C).
"""

from __future__ import annotations

import math
import os
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
import yaml
from scipy import sparse
from scipy.sparse.linalg import spsolve

from src.geometry import CellPairGeometry, ChannelGeometry
from src.flow_solver import FlowSolution, analytical_poiseuille_2d

_trapz = getattr(np, "trapezoid", getattr(np, "trapz", None))

FARADAY = 96485.3329
GAS_CONST = 8.31446

SPECIES_ORDER = ["Na", "K", "Mg", "Ca", "Cl", "SO4", "HCO3", "CO3"]
SPECIES_CHARGES: Dict[str, int] = {
    "Na": 1,
    "K": 1,
    "Mg": 2,
    "Ca": 2,
    "Cl": -1,
    "SO4": -2,
    "HCO3": -1,
    "CO3": -2,
}
SPECIES_MW_G_MOL: Dict[str, float] = {
    "Na": 22.989769,
    "K": 39.0983,
    "Mg": 24.305,
    "Ca": 40.078,
    "Cl": 35.453,
    "SO4": 96.0626,
    "HCO3": 61.0168,
    "CO3": 60.0089,
}
SPECIES_D_25C: Dict[str, float] = {
    "Na": 1.334e-9,
    "K": 1.960e-9,
    "Mg": 0.705e-9,
    "Ca": 0.792e-9,
    "Cl": 2.032e-9,
    "SO4": 1.070e-9,
    "HCO3": 1.180e-9,
    "CO3": 0.955e-9,
}


def vogel_water_viscosity(T_K: float, mu_25C: float = 8.9e-4) -> float:
    if abs(T_K - 298.15) < 1e-9:
        return mu_25C
    return float(mu_25C * math.exp(578.919 * (1.0 / (T_K - 137.546) - 1.0 / (298.15 - 137.546))))


def stokes_einstein_diffusivities(T_K: float, mu_25C: float = 8.9e-4) -> Dict[str, float]:
    mu_eff = vogel_water_viscosity(T_K, mu_25C)
    factor = (T_K / 298.15) * (mu_25C / mu_eff)
    return {sp: d25 * factor for sp, d25 in SPECIES_D_25C.items()}


@dataclass
class BrineAuditRecord:
    """Electroneutrality and analytical completeness audit for an electrolyte stream."""
    profile_id: str
    conc_raw_mol_m3: Dict[str, float]
    conc_balanced_mol_m3: Dict[str, float]
    cbe_raw_pct: float
    cbe_balanced_pct: float
    derived_species: List[str]
    missing_species: List[str]
    adjustment_species: Optional[str]
    adjustment_delta_mol_m3: float
    ionic_strength_M: float
    tds_mg_L: float
    pH: Optional[float]


def prepare_electrolyte_composition(
    profile_id: str,
    conc_mg_L: Optional[Dict[str, Optional[float]]] = None,
    conc_mol_m3: Optional[Dict[str, float]] = None,
    pH: Optional[float] = 8.0,
    T_K: float = 298.15,
    missing_species: Optional[List[str]] = None,
    enforce_electroneutrality: bool = True,
) -> BrineAuditRecord:
    """
    Convert a published composition to mol/m3, verify completeness and charge balance,
    derive missing CO3(2-) strictly from measured HCO3- + pH if absent, and record
    any minimal Na+/Cl- counter-ion adjustment required for PDE electroneutrality.
    """
    c_raw: Dict[str, float] = {sp: 0.0 for sp in SPECIES_ORDER}
    derived: List[str] = []
    missing_out: List[str] = list(missing_species or [])

    if conc_mol_m3 is not None:
        for sp in SPECIES_ORDER:
            if conc_mol_m3.get(sp) is not None:
                c_raw[sp] = max(float(conc_mol_m3[sp]), 0.0)
    elif conc_mg_L is not None:
        for sp in SPECIES_ORDER:
            v = conc_mg_L.get(sp)
            if v is not None:
                c_raw[sp] = max(float(v) / SPECIES_MW_G_MOL[sp], 0.0)
            else:
                if sp not in missing_out:
                    missing_out.append(sp)

    # Derive CO3(2-) strictly when HCO3- and pH are present (never fabricate HCO3- from nothing)
    if (conc_mg_L is not None and conc_mg_L.get("CO3") is None) and c_raw["HCO3"] > 0.0 and pH is not None:
        # Use thermodynamic pK2 at T_K (10.329 at 25 C)
        from src.pitzer_model import _phreeqc_logk, _PITZER_DB
        k2_log = _phreeqc_logk(T_K, _PITZER_DB["reactions"]["CO3-2 + H+ = HCO3-"]["analytic"], 10.329)
        K2 = 10.0 ** (-k2_log)
        a_H = 10.0 ** (-pH)
        # Approximate free CO3 = HCO3 * K2 / a_H (and adjusted mildly for salinity activity factor ~0.25/0.65)
        c_raw["CO3"] = c_raw["HCO3"] * (K2 / a_H)
        derived.append("CO3_from_HCO3_pH")

    pos_raw = sum(SPECIES_CHARGES[sp] * c_raw[sp] for sp in SPECIES_ORDER if SPECIES_CHARGES[sp] > 0)
    neg_raw = sum(abs(SPECIES_CHARGES[sp]) * c_raw[sp] for sp in SPECIES_ORDER if SPECIES_CHARGES[sp] < 0)
    cbe_raw = 100.0 * (pos_raw - neg_raw) / max(pos_raw + neg_raw, 1e-30)

    c_bal = dict(c_raw)
    adj_sp: Optional[str] = None
    adj_delta = 0.0
    if enforce_electroneutrality and abs(pos_raw - neg_raw) > 1e-12:
        imbalance = pos_raw - neg_raw  # >0 means cation excess -> add Cl- ; <0 means anion excess -> add Na+
        if imbalance > 0.0:
            c_bal["Cl"] += imbalance
            adj_sp = "Cl"
            adj_delta = imbalance
        else:
            c_bal["Na"] += (-imbalance)
            adj_sp = "Na"
            adj_delta = -imbalance

    pos_bal = sum(SPECIES_CHARGES[sp] * c_bal[sp] for sp in SPECIES_ORDER if SPECIES_CHARGES[sp] > 0)
    neg_bal = sum(abs(SPECIES_CHARGES[sp]) * c_bal[sp] for sp in SPECIES_ORDER if SPECIES_CHARGES[sp] < 0)
    cbe_bal = 100.0 * (pos_bal - neg_bal) / max(pos_bal + neg_bal, 1e-30)
    ionic_str_M = 0.5 * sum((SPECIES_CHARGES[sp] ** 2) * (c_bal[sp] / 1000.0) for sp in SPECIES_ORDER)
    tds = sum(c_bal[sp] * SPECIES_MW_G_MOL[sp] for sp in SPECIES_ORDER)

    return BrineAuditRecord(
        profile_id=profile_id,
        conc_raw_mol_m3=c_raw,
        conc_balanced_mol_m3=c_bal,
        cbe_raw_pct=float(cbe_raw),
        cbe_balanced_pct=float(cbe_bal),
        derived_species=derived,
        missing_species=missing_out,
        adjustment_species=adj_sp,
        adjustment_delta_mol_m3=float(adj_delta),
        ionic_strength_M=float(ionic_str_M),
        tds_mg_L=float(tds),
        pH=pH,
    )


def multi_ion_donnan_equilibrium(
    c_sol: Dict[str, float],
    X_fix: float,
    T: float = 298.15,
) -> Tuple[Dict[str, float], float]:
    """
    Exact multi-ion Donnan equilibrium at a fixed-charge membrane interface.
    Solves sum_k z_k * c_k^sol * exp(z_k * u) + X_fix = 0 for u = -F * DeltaPhi_D / (RT).
    Strictly monotone increasing in u, guaranteed unique global root.
    """
    active = [(sp, SPECIES_CHARGES[sp], max(float(c_sol.get(sp, 0.0)), 0.0)) for sp in SPECIES_ORDER]
    active = [t for t in active if t[2] > 0.0]
    if not active:
        return {sp: 0.0 for sp in SPECIES_ORDER}, 0.0

    def g_and_gp(u: float) -> Tuple[float, float]:
        val = X_fix
        der = 0.0
        for _, z, cs in active:
            e = math.exp(max(min(z * u, 40.0), -40.0))
            val += z * cs * e
            der += (z * z) * cs * e
        return val, der

    lo, hi = -25.0, 25.0
    u = 0.0
    for _ in range(40):
        g_val, g_der = g_and_gp(u)
        if abs(g_val) < 1e-11 * max(abs(X_fix), 1.0):
            break
        if g_val < 0.0:
            lo = max(lo, u)
        else:
            hi = min(hi, u)
        u_new = u - g_val / max(g_der, 1e-30)
        if not (lo < u_new < hi):
            u_new = 0.5 * (lo + hi)
        u = u_new

    c_mem = {}
    for sp in SPECIES_ORDER:
        cs = max(float(c_sol.get(sp, 0.0)), 0.0)
        if cs > 0.0:
            z = SPECIES_CHARGES[sp]
            c_mem[sp] = cs * math.exp(max(min(z * u, 40.0), -40.0))
        else:
            c_mem[sp] = 0.0

    phi_donnan = -(GAS_CONST * T / FARADAY) * u
    return c_mem, float(phi_donnan)


def _bernoulli(x: float) -> float:
    """Bernoulli function B(x) = x / (exp(x) - 1) smoothly regularized near 0."""
    if abs(x) < 1e-5:
        return 1.0 - 0.5 * x + (x * x) / 12.0
    if x > 40.0:
        return x * math.exp(-x)
    if x < -40.0:
        return -x
    return x / math.expm1(x)


def _ghk_factor(xi: float) -> float:
    """xi / (exp(xi) - 1) smoothly regularized near xi = 0."""
    return _bernoulli(xi)


def multi_ion_membrane_flux(
    c_high_wall: Dict[str, float],
    c_low_wall: Dict[str, float],
    X_fix: float,
    thickness: float,
    D_mem: Dict[str, float],
    T: float = 298.15,
    I_op: float = 0.0,
) -> Tuple[Dict[str, float], float]:
    """
    Compute steady 1D constant-field Nernst-Planck fluxes J_k (mol/(m^2*s), positive high -> low)
    across an ion-exchange membrane coupled with Donnan partitioning at both boundaries.
    Enforces F * sum_k z_k * J_k = I_op.

    Returns (fluxes_dict, E_membrane_V) where E_membrane_V > 0 favors positive counter-ion
    transport from high-salinity CEM or low-to-high anion transport across AEM.
    """
    c_mem_H, phi_D_H = multi_ion_donnan_equilibrium(c_high_wall, X_fix, T)
    c_mem_L, phi_D_L = multi_ion_donnan_equilibrium(c_low_wall, X_fix, T)

    VT = GAS_CONST * T / FARADAY

    def eval_fluxes(dphi_m: float) -> Tuple[Dict[str, float], float, float]:
        # dphi_m = phi_mem(H) - phi_mem(L)
        fluxes: Dict[str, float] = {}
        I_calc = 0.0
        dI_dphi = 0.0
        for sp in SPECIES_ORDER:
            cH = c_mem_H[sp]
            cL = c_mem_L[sp]
            if cH == 0.0 and cL == 0.0:
                fluxes[sp] = 0.0
                continue
            z = SPECIES_CHARGES[sp]
            Dm = D_mem[sp]
            # Constant-field Nernst-Planck flux from H (y=0) to L (y=delta):
            # J = -D*(dc/dy + z*c*(dphi/dy)/VT) where dphi/dy = -dphi_m/delta
            # With xi = z * dphi_m / VT:
            # J_k = (Dm / delta) * (xi / (exp(xi)-1)) * (cH * exp(xi) - cL)
            # Check sign: when dphi_m = 0, xi=0 => J_k = Dm/delta*(cH - cL) (high -> low)!
            # Check electro-migration: if dphi_m > 0 (phi_H > phi_L) and cH=cL, xi>0:
            # xi/(exp(xi)-1)*(exp(xi)-1)*c = xi*c > 0 for z>0 => cations move H -> L!
            xi = z * dphi_m / VT
            if abs(xi) < 1e-5:
                f_pos = 1.0 + 0.5 * xi + (xi * xi) / 12.0
                f_neg = 1.0 - 0.5 * xi + (xi * xi) / 12.0
            elif xi > 40.0:
                f_pos = xi
                f_neg = xi * math.exp(-xi)
            elif xi < -40.0:
                f_pos = -xi * math.exp(xi)
                f_neg = -xi
            else:
                em1 = math.expm1(xi)
                f_neg = xi / em1
                f_pos = f_neg * math.exp(xi)
            J_k = (Dm / thickness) * (f_pos * cH - f_neg * cL)
            fluxes[sp] = J_k
            I_calc += FARADAY * z * J_k
            # Rough positive slope approx for Newton step (exact FD below or analytic)
            dI_dphi += FARADAY * (z * z) * (Dm / thickness) * (0.5 * (cH + cL)) / VT
        return fluxes, I_calc, dI_dphi

    def _solve_dphi_for_I(target_I_val: float) -> Tuple[Dict[str, float], float]:
        dphi_val = 0.0
        lo, hi = -0.5, 0.5
        for _ in range(35):
            flx, I_val, _ = eval_fluxes(dphi_val)
            res = I_val - target_I_val
            if abs(res) < 1e-9:
                break
            if res > 0.0:
                hi = min(hi, dphi_val)
            else:
                lo = max(lo, dphi_val)
            eps = 1e-6
            _, I_p, _ = eval_fluxes(dphi_val + eps)
            slope = (I_p - I_val) / eps
            dphi_new = dphi_val - res / max(abs(slope), 1e-12) * (1.0 if slope > 0 else -1.0)
            if not (lo < dphi_new < hi):
                dphi_new = 0.5 * (lo + hi)
            dphi_val = dphi_new
        flx, _, _ = eval_fluxes(dphi_val)
        return flx, dphi_val

    # Always compute true open-circuit EMF (I=0) separately from loaded fluxes (I=I_op)
    _, dphi_ocv = _solve_dphi_for_I(0.0)
    delta_phi_ocv = -phi_D_H + dphi_ocv + phi_D_L
    E_ocv_mem = -delta_phi_ocv if X_fix < 0 else delta_phi_ocv

    if abs(I_op) < 1e-12:
        fluxes, _, _ = eval_fluxes(dphi_ocv)
    else:
        target_I = I_op if X_fix < 0 else -I_op
        fluxes, _ = _solve_dphi_for_I(target_I)

    return fluxes, float(E_ocv_mem)


def _multi_ion_donnan_batch(
    c_sol: Dict[str, np.ndarray],
    X_fix: float,
    T: float = 298.15,
) -> Tuple[Dict[str, np.ndarray], np.ndarray]:
    """
    Vectorized multi-ion Donnan equilibrium across all axial membrane nodes (shape (N,)).
    Solves sum_k z_k * c_k^sol * exp(z_k * u) + X_fix = 0 for u = -F * DeltaPhi_D / (RT).
    """
    n = len(next(iter(c_sol.values())))
    lo = np.full(n, -25.0)
    hi = np.full(n, 25.0)
    u = np.zeros(n)

    c_pos = {sp: np.maximum(c_sol[sp], 0.0) for sp in SPECIES_ORDER}
    tol = 1e-11 * max(abs(X_fix), 1.0)

    for _ in range(45):
        val = np.full(n, float(X_fix))
        der = np.zeros(n)
        for sp in SPECIES_ORDER:
            cs = c_pos[sp]
            z = SPECIES_CHARGES[sp]
            e = np.exp(np.clip(z * u, -40.0, 40.0))
            val += z * cs * e
            der += (z * z) * cs * e
        active = np.abs(val) >= tol
        if not np.any(active):
            break
        lo = np.where(active & (val < 0.0), np.maximum(lo, u), lo)
        hi = np.where(active & (val > 0.0), np.minimum(hi, u), hi)
        u_new = u - val / np.maximum(der, 1e-30)
        in_bounds = (u_new > lo) & (u_new < hi)
        cand = np.where(in_bounds, u_new, 0.5 * (lo + hi))
        u = np.where(active, cand, u)

    c_mem = {}
    for sp in SPECIES_ORDER:
        z = SPECIES_CHARGES[sp]
        c_mem[sp] = np.where(c_pos[sp] > 0.0, c_pos[sp] * np.exp(np.clip(z * u, -40.0, 40.0)), 0.0)

    phi_donnan = -(GAS_CONST * T / FARADAY) * u
    return c_mem, phi_donnan


def _eval_ghk_batch(
    c_mem_H: Dict[str, np.ndarray],
    c_mem_L: Dict[str, np.ndarray],
    D_mem: Dict[str, float],
    thickness: float,
    T: float,
    dphi_m: np.ndarray,
) -> Tuple[Dict[str, np.ndarray], np.ndarray, np.ndarray]:
    """Vectorized constant-field 1D Nernst-Planck flux and analytical dI/d(dphi_m)."""
    VT = GAS_CONST * T / FARADAY
    n = len(dphi_m)
    fluxes: Dict[str, np.ndarray] = {}
    I_calc = np.zeros(n)
    dI_dphi = np.zeros(n)

    for sp in SPECIES_ORDER:
        cH = c_mem_H[sp]
        cL = c_mem_L[sp]
        z = SPECIES_CHARGES[sp]
        Dm = D_mem[sp]
        xi = z * dphi_m / VT
        f_neg = _bernoulli_arr(xi)
        f_pos = _bernoulli_arr(-xi)  # xi*exp(xi)/(exp(xi)-1) == B(-xi)
        J_k = (Dm / thickness) * (f_pos * cH - f_neg * cL)
        fluxes[sp] = J_k
        I_calc += FARADAY * z * J_k

        # Derivative of f_pos(xi) and f_neg(xi) wrt xi for analytical Newton slope
        # B'(x) = (exp(x)*(1-x) - 1) / (exp(x)-1)^2; near 0: -0.5 + x/6
        small = np.abs(xi) < 1e-4
        df_neg = np.empty_like(xi)
        df_neg[small] = -0.5 + xi[small] / 6.0
        hi = xi > 40.0
        df_neg[hi] = (1.0 - xi[hi]) * np.exp(-xi[hi])
        lo = xi < -40.0
        df_neg[lo] = -1.0
        mid = (~small) & (~hi) & (~lo)
        xm = xi[mid]
        ex = np.exp(xm)
        em1 = np.expm1(xm)
        df_neg[mid] = (ex * (1.0 - xm) - 1.0) / (em1 * em1)
        # Since f_pos(xi) = f_neg(xi) + xi, df_pos/dxi = df_neg/dxi + 1
        df_pos = df_neg + 1.0
        dJ_dphi = (Dm / thickness) * (z / VT) * (df_pos * cH - df_neg * cL)
        dI_dphi += FARADAY * z * dJ_dphi

    return fluxes, I_calc, dI_dphi


def multi_ion_membrane_flux_batch(
    c_high_wall: Dict[str, np.ndarray],
    c_low_wall: Dict[str, np.ndarray],
    X_fix: float,
    thickness: float,
    D_mem: Dict[str, float],
    T: float = 298.15,
    I_op: float = 0.0,
    compute_robin_slopes: bool = False,
) -> Tuple[Dict[str, np.ndarray], np.ndarray, Optional[Dict[str, np.ndarray]], Optional[Dict[str, np.ndarray]]]:
    """
    Vectorized multi-ion Donnan + GHK membrane flux across all axial nodes.
    Optionally computes diagonal Robin wall sensitivities:
        s_H[sp] = max(0, dJ_k/dc_H_k) >= 0 (stabilizes c_high_wall outward flux -J_k)
        s_L[sp] = max(0, -dJ_k/dc_L_k) >= 0 (stabilizes c_low_wall inward flux +J_k)
    """
    c_mem_H, phi_D_H = _multi_ion_donnan_batch(c_high_wall, X_fix, T)
    c_mem_L, phi_D_L = _multi_ion_donnan_batch(c_low_wall, X_fix, T)
    n = len(phi_D_H)

    def _solve_dphi_batch(target_I_val: float) -> Tuple[Dict[str, np.ndarray], np.ndarray]:
        dphi = np.zeros(n)
        lo = np.full(n, -0.5)
        hi = np.full(n, 0.5)
        for _ in range(35):
            flx, I_val, dI_dphi = _eval_ghk_batch(c_mem_H, c_mem_L, D_mem, thickness, T, dphi)
            res = I_val - target_I_val
            active = np.abs(res) >= 1e-9
            if not np.any(active):
                break
            hi = np.where(active & (res > 0.0), np.minimum(hi, dphi), hi)
            lo = np.where(active & (res <= 0.0), np.maximum(lo, dphi), lo)
            dphi_new = dphi - res / np.maximum(dI_dphi, 1e-12)
            in_bounds = (dphi_new > lo) & (dphi_new < hi)
            cand = np.where(in_bounds, dphi_new, 0.5 * (lo + hi))
            dphi = np.where(active, cand, dphi)
        flx, _, _ = _eval_ghk_batch(c_mem_H, c_mem_L, D_mem, thickness, T, dphi)
        return flx, dphi

    # True open-circuit EMF at I = 0
    flx_ocv, dphi_ocv = _solve_dphi_batch(0.0)
    delta_phi_ocv = -phi_D_H + dphi_ocv + phi_D_L
    E_ocv_mem = -delta_phi_ocv if X_fix < 0 else delta_phi_ocv

    if abs(I_op) < 1e-12:
        fluxes = flx_ocv
        dphi_used = dphi_ocv
    else:
        target_I = I_op if X_fix < 0 else -I_op
        fluxes, dphi_used = _solve_dphi_batch(target_I)

    s_H_out: Optional[Dict[str, np.ndarray]] = None
    s_L_out: Optional[Dict[str, np.ndarray]] = None
    if compute_robin_slopes:
        # Exact Donnan amplification dc_mem/dc_sol evaluated smoothly for stabilizing M-matrix diagonal:
        # Note: dc_mem_k / dc_sol_k ~ (c_mem_k / max(c_sol_k, c_reg)) modulated by Boltzmann flux weight.
        VT = GAS_CONST * T / FARADAY
        u_H = -phi_D_H / VT
        u_L = -phi_D_L / VT
        s_H_out = {}
        s_L_out = {}
        # Compute total Donnan denominator sum_m z_m^2 c_mem_m
        denom_H = np.zeros(n)
        denom_L = np.zeros(n)
        for sp in SPECIES_ORDER:
            z = SPECIES_CHARGES[sp]
            denom_H += (z * z) * c_mem_H[sp]
            denom_L += (z * z) * c_mem_L[sp]
        denom_H = np.maximum(denom_H, 1e-6)
        denom_L = np.maximum(denom_L, 1e-6)

        for sp in SPECIES_ORDER:
            z = SPECIES_CHARGES[sp]
            Dm = D_mem[sp]
            xi = z * dphi_used / VT
            f_neg = _bernoulli_arr(xi)
            f_pos = _bernoulli_arr(-xi)

            # Exact continuous Donnan partition ratio exp(z * u_D) = c_mem_k / c_sol_k
            # Valid and smooth all the way down to c_sol_k = 0 (no 1e-6/1e-3 cliff)
            ratio_H = np.exp(np.clip(z * u_H, -40.0, 40.0))
            ratio_L = np.exp(np.clip(z * u_L, -40.0, 40.0))
            factor_H = ratio_H * np.maximum(1.0 - (z * z) * c_mem_H[sp] / denom_H, 0.05)
            factor_L = ratio_L * np.maximum(1.0 - (z * z) * c_mem_L[sp] / denom_L, 0.05)

            s_H_out[sp] = (Dm / thickness) * f_pos * factor_H
            s_L_out[sp] = (Dm / thickness) * f_neg * factor_L

    return fluxes, E_ocv_mem, s_H_out, s_L_out


def build_membrane_diffusivities(cfg: Dict[str, Any], D_aq: Dict[str, float], is_cem: bool) -> Dict[str, float]:
    mp = cfg["membrane_transport_parameters"]
    d_mem: Dict[str, float] = {}
    for sp, z in SPECIES_CHARGES.items():
        is_counter = (z > 0) if is_cem else (z < 0)
        if is_counter:
            ratio = mp["counterion_monovalent_ratio"] if abs(z) == 1 else mp["counterion_divalent_ratio"]
        else:
            ratio = mp["coion_monovalent_ratio"] if abs(z) == 1 else mp["coion_divalent_ratio"]
        d_mem[sp] = D_aq[sp] * ratio
    return d_mem


def _solve_channel_potential(
    c_fields: Dict[str, np.ndarray],
    D_ions: Dict[str, float],
    geom: ChannelGeometry,
    T: float,
    i_wall_bottom: np.ndarray,
    i_wall_top: np.ndarray,
) -> np.ndarray:
    """
    Solve 2D elliptic current-conservation equation via vectorized node-centered conservative FVM:
        div(-kappa * grad(phi) - grad(S)) = 0,   S = F * sum_k z_k * D_k * c_k
    """
    nx, ny = geom.nx, geom.ny
    dx, dy = geom.dx, geom.dy
    RT_F = GAS_CONST * T / FARADAY

    kappa = np.zeros((nx, ny))
    S = np.zeros((nx, ny))
    for sp, c in c_fields.items():
        if np.max(c) <= 0.0:
            continue
        z = SPECIES_CHARGES[sp]
        D = D_ions[sp]
        kappa += (FARADAY / RT_F) * (z * z) * D * c
        S += FARADAY * z * D * c

    kappa = np.maximum(kappa, 1e-12)

    dx_i = np.full((nx, 1), dx)
    dx_i[0, 0] = 0.5 * dx
    dx_i[-1, 0] = 0.5 * dx
    dy_j = np.full((1, ny), dy)
    dy_j[0, 0] = 0.5 * dy
    dy_j[0, -1] = 0.5 * dy

    kE = 0.5 * (kappa[:-1, :] + kappa[1:, :])
    cE = dy_j * kE / dx
    sE = dy_j * (S[1:, :] - S[:-1, :]) / dx

    kN = 0.5 * (kappa[:, :-1] + kappa[:, 1:])
    cN = dx_i * kN / dy
    sN = dx_i * (S[:, 1:] - S[:, :-1]) / dy

    diag = np.zeros((nx, ny))
    rhs = np.zeros((nx, ny))

    diag[:-1, :] += cE
    diag[1:, :] += cE
    rhs[:-1, :] += sE
    rhs[1:, :] -= sE

    diag[:, :-1] += cN
    diag[:, 1:] += cN
    rhs[:, :-1] += sN
    rhs[:, 1:] -= sN

    rhs[:, 0] += dx_i[:, 0] * i_wall_bottom
    rhs[:, -1] += dx_i[:, 0] * i_wall_top

    j_pin = ny // 2
    idx_grid = np.arange(nx * ny).reshape((nx, ny))
    pin_id = int(idx_grid[0, j_pin])

    r_e = idx_grid[:-1, :].ravel()
    c_e = idx_grid[1:, :].ravel()
    v_e = (-cE).ravel()
    r_n = idx_grid[:, :-1].ravel()
    c_n = idx_grid[:, 1:].ravel()
    v_n = (-cN).ravel()

    rows = np.concatenate([r_e, c_e, r_n, c_n, idx_grid.ravel()])
    cols = np.concatenate([c_e, r_e, c_n, r_n, idx_grid.ravel()])
    vals = np.concatenate([v_e, v_e, v_n, v_n, diag.ravel()])

    keep = rows != pin_id
    rows = np.append(rows[keep], pin_id)
    cols = np.append(cols[keep], pin_id)
    vals = np.append(vals[keep], 1.0)

    rhs_flat = rhs.ravel()
    rhs_flat[pin_id] = 0.0

    N = nx * ny
    A = sparse.csr_matrix((vals, (rows, cols)), shape=(N, N))
    return spsolve(A, rhs_flat).reshape((nx, ny))


def _bernoulli_arr(x: np.ndarray) -> np.ndarray:
    """Vectorized Bernoulli function B(x) = x / (exp(x) - 1)."""
    out = np.empty_like(x, dtype=float)
    small = np.abs(x) < 1e-5
    xs = x[small]
    out[small] = 1.0 - 0.5 * xs + (xs * xs) / 12.0
    hi = x > 40.0
    out[hi] = x[hi] * np.exp(-x[hi])
    lo = x < -40.0
    out[lo] = -x[lo]
    mid = (~small) & (~hi) & (~lo)
    xm = x[mid]
    out[mid] = xm / np.expm1(xm)
    return out


def _solve_species_2d_np(
    geom: ChannelGeometry,
    flow: FlowSolution,
    phi: np.ndarray,
    z_k: int,
    D_k: float,
    T: float,
    c_inlet: float,
    J_bottom: np.ndarray,
    J_top: np.ndarray,
    s_bottom: Optional[np.ndarray] = None,
    s_top: Optional[np.ndarray] = None,
    c_bottom_old: Optional[np.ndarray] = None,
    c_top_old: Optional[np.ndarray] = None,
) -> np.ndarray:
    """
    Vectorized node-centered conservative FVM solver for 2D steady Nernst-Planck
    using 1st-order upwind fluid advection, Scharfetter-Gummel electro-migration,
    and optional Robin diagonal wall-flux stabilization (zero residual at convergence).
    """
    if c_inlet <= 0.0 and np.max(np.abs(J_bottom)) <= 1e-18 and np.max(np.abs(J_top)) <= 1e-18:
        return np.zeros((geom.nx, geom.ny))

    nx, ny = geom.nx, geom.ny
    dx, dy = geom.dx, geom.dy
    RT_F = GAS_CONST * T / FARADAY

    dx_i = np.full((nx, 1), dx)
    dx_i[0, 0] = 0.5 * dx
    dx_i[-1, 0] = 0.5 * dx
    dy_j = np.full((1, ny), dy)
    dy_j[0, 0] = 0.5 * dy
    dy_j[0, -1] = 0.5 * dy

    u_x = 0.5 * (flow.u[:-1, :] + flow.u[1:, :])
    pe_x = z_k * (phi[1:, :] - phi[:-1, :]) / RT_F
    diff_x = dy_j * (D_k / dx)
    flux_L_coeff = diff_x * _bernoulli_arr(pe_x) + dy_j * np.maximum(u_x, 0.0)
    flux_R_coeff = -diff_x * _bernoulli_arr(-pe_x) + dy_j * np.minimum(u_x, 0.0)

    pe_y = z_k * (phi[:, 1:] - phi[:, :-1]) / RT_F
    diff_y = dx_i * (D_k / dy)
    flux_S_coeff = diff_y * _bernoulli_arr(pe_y)
    flux_N_coeff = -diff_y * _bernoulli_arr(-pe_y)

    diag = np.zeros((nx, ny))
    rhs = np.zeros((nx, ny))

    diag[:-1, :] += flux_L_coeff
    diag[1:, :] -= flux_R_coeff
    diag[-1, :] += dy_j[0, :] * np.maximum(flow.u[-1, :], 0.0)

    diag[:, :-1] += flux_S_coeff
    diag[:, 1:] -= flux_N_coeff

    # Membrane wall inward fluxes + optional Robin stabilization:
    # J_in(c_new) ~ J_in(c_old) - s * (c_new - c_old) -> lhs += s*c_new, rhs += J_in + s*c_old
    rhs[:, 0] += dx_i[:, 0] * J_bottom
    rhs[:, -1] += dx_i[:, 0] * J_top
    if s_bottom is not None and c_bottom_old is not None:
        sb = np.maximum(s_bottom, 0.0)
        diag[:, 0] += dx_i[:, 0] * sb
        rhs[:, 0] += dx_i[:, 0] * sb * c_bottom_old
    if s_top is not None and c_top_old is not None:
        st = np.maximum(s_top, 0.0)
        diag[:, -1] += dx_i[:, 0] * st
        rhs[:, -1] += dx_i[:, 0] * st * c_top_old

    idx_grid = np.arange(nx * ny).reshape((nx, ny))
    inlet_ids = idx_grid[0, :]

    rows = np.concatenate([
        idx_grid[:-1, :].ravel(),
        idx_grid[1:, :].ravel(),
        idx_grid[:, :-1].ravel(),
        idx_grid[:, 1:].ravel(),
        idx_grid.ravel(),
    ])
    cols = np.concatenate([
        idx_grid[1:, :].ravel(),
        idx_grid[:-1, :].ravel(),
        idx_grid[:, 1:].ravel(),
        idx_grid[:, :-1].ravel(),
        idx_grid.ravel(),
    ])
    vals = np.concatenate([
        flux_R_coeff.ravel(),
        (-flux_L_coeff).ravel(),
        flux_N_coeff.ravel(),
        (-flux_S_coeff).ravel(),
        diag.ravel(),
    ])

    # Direct Dirichlet mask for i == 0 without .tolil()
    keep = rows >= ny
    rows = np.concatenate([rows[keep], inlet_ids])
    cols = np.concatenate([cols[keep], inlet_ids])
    vals = np.concatenate([vals[keep], np.ones(ny)])
    rhs[0, :] = c_inlet

    N = nx * ny
    A = sparse.csr_matrix((vals, (rows, cols)), shape=(N, N))
    c_sol = spsolve(A, rhs.ravel()).reshape((nx, ny))
    return np.maximum(c_sol, 0.0)


@dataclass
class MulticomponentSimConfig:
    case_id: str
    conc_inlet: Dict[str, float]      # mol/m3 per species
    dil_inlet: Dict[str, float]       # mol/m3 per species
    u_mean_conc: float = 0.01
    u_mean_dil: float = 0.01
    T: float = 298.15
    channel_height: float = 270e-6
    channel_length: float = 0.10
    membrane_thickness_cem: float = 125e-6
    membrane_thickness_aem: float = 125e-6
    X_cem: float = -2000.0
    X_aem: float = 2000.0
    sigma_cem: float = 1.0
    sigma_aem: float = 1.0
    rho: float = 997.0
    eta_pump: float = 0.75
    load_fraction: float = 0.0
    nx: int = 50
    ny: int = 20
    max_coupling_iter: int = 100
    coupling_tol: float = 2e-4
    relaxation: float = 0.35
    brine_profile_id: str = "custom"
    pH_conc: Optional[float] = 8.0
    pH_dil: Optional[float] = 7.5


@dataclass
class MulticomponentSimResult:
    config: MulticomponentSimConfig
    geometry: CellPairGeometry
    flow_conc: FlowSolution
    flow_dil: FlowSolution
    c_conc: Dict[str, np.ndarray]
    c_dil: Dict[str, np.ndarray]
    phi_conc: np.ndarray
    phi_dil: np.ndarray
    J_cem: Dict[str, np.ndarray]
    J_aem: Dict[str, np.ndarray]
    E_cem_profile: np.ndarray
    E_aem_profile: np.ndarray
    E_ocv: float
    R_internal: float
    R_conc: float
    R_dil: float
    R_cem: float
    R_aem: float
    P_gross_max: float
    P_pump_total: float
    P_net_max: float
    mass_balance_conc: Dict[str, float]
    mass_balance_dil: Dict[str, float]
    max_electroneutrality_err_conc: float
    max_electroneutrality_err_dil: float
    min_conc_all: float
    converged: bool
    coupling_iterations: int
    wall_time_seconds: float
    I_op: float = 0.0
    V_cell: float = 0.0
    P_gross_loaded: float = 0.0


def run_multicomponent_simulation(
    config: MulticomponentSimConfig,
    transport_yaml_path: Optional[str] = None,
    verbose: bool = False,
) -> MulticomponentSimResult:
    """Run coupled 2D multicomponent Nernst-Planck + Donnan RED cell-pair simulation."""
    t0 = time.time()
    if transport_yaml_path is None:
        transport_yaml_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "configs", "multicomponent_transport.yaml")
        )
    with open(transport_yaml_path, "r", encoding="utf-8") as f:
        t_cfg = yaml.safe_load(f)

    geom = CellPairGeometry(
        channel_height=config.channel_height,
        channel_length=config.channel_length,
        nx=config.nx,
        ny_per_channel=config.ny,
        membrane_thickness_cem=config.membrane_thickness_cem,
        membrane_thickness_aem=config.membrane_thickness_aem,
    )

    mu_eff = vogel_water_viscosity(config.T)
    D_ions = stokes_einstein_diffusivities(config.T)
    D_mem_cem = build_membrane_diffusivities(t_cfg, D_ions, is_cem=True)
    D_mem_aem = build_membrane_diffusivities(t_cfg, D_ions, is_cem=False)

    flow_conc = analytical_poiseuille_2d(geom.concentrated, config.u_mean_conc, config.rho, mu_eff)
    flow_dil = analytical_poiseuille_2d(geom.dilute, config.u_mean_dil, config.rho, mu_eff)

    active_species = [
        sp for sp in SPECIES_ORDER
        if config.conc_inlet.get(sp, 0.0) > 0.0 or config.dil_inlet.get(sp, 0.0) > 0.0
    ]
    indep_species = [sp for sp in active_species if sp != "Cl"]

    c_conc = {sp: np.full((config.nx, config.ny), float(config.conc_inlet.get(sp, 0.0))) for sp in SPECIES_ORDER}
    c_dil = {sp: np.full((config.nx, config.ny), float(config.dil_inlet.get(sp, 0.0))) for sp in SPECIES_ORDER}
    phi_conc = np.zeros((config.nx, config.ny))
    phi_dil = np.zeros((config.nx, config.ny))

    J_cem = {sp: np.zeros(config.nx) for sp in SPECIES_ORDER}
    J_aem = {sp: np.zeros(config.nx) for sp in SPECIES_ORDER}
    E_cem_prof = np.zeros(config.nx)
    E_aem_prof = np.zeros(config.nx)

    def _channel_cond(fields: Dict[str, np.ndarray]) -> float:
        RT_F = GAS_CONST * config.T / FARADAY
        kap = np.zeros((config.nx, config.ny))
        for sp in active_species:
            z = SPECIES_CHARGES[sp]
            kap += (FARADAY / RT_F) * (z * z) * D_ions[sp] * fields[sp]
        return float(np.mean(kap))

    converged = False
    sp_scale_conc = {
        sp: max(float(config.conc_inlet.get(sp, 0.0)), 0.1 * float(config.dil_inlet.get(sp, 0.0)), 1e-2)
        for sp in active_species
    }
    sp_scale_dil = {
        sp: max(float(config.dil_inlet.get(sp, 0.0)), 0.05 * float(config.conc_inlet.get(sp, 0.0)), 1e-2)
        for sp in active_species
    }
    I_op = 0.0
    best_res = float("inf")
    stagnant_count = 0

    # Anderson acceleration history (m = 4) over flattened independent species fields
    m_aa = 4
    aa_x_hist: List[np.ndarray] = []
    aa_f_hist: List[np.ndarray] = []

    def _pack_state(cc: Dict[str, np.ndarray], cd: Dict[str, np.ndarray]) -> np.ndarray:
        vecs = []
        for sp in indep_species:
            vecs.append((cc[sp] / sp_scale_conc[sp]).ravel())
            vecs.append((cd[sp] / sp_scale_dil[sp]).ravel())
        return np.concatenate(vecs)

    def _unpack_state(vec: np.ndarray, cc: Dict[str, np.ndarray], cd: Dict[str, np.ndarray]) -> None:
        blk = config.nx * config.ny
        pos = 0
        for sp in indep_species:
            cc[sp] = np.maximum(vec[pos:pos + blk].reshape((config.nx, config.ny)) * sp_scale_conc[sp], 0.0)
            pos += blk
            cd[sp] = np.maximum(vec[pos:pos + blk].reshape((config.nx, config.ny)) * sp_scale_dil[sp], 0.0)
            pos += blk
        if "Cl" in active_species:
            cl_c = np.zeros((config.nx, config.ny))
            cl_d = np.zeros((config.nx, config.ny))
            for sp in indep_species:
                z = SPECIES_CHARGES[sp]
                cl_c += z * cc[sp]
                cl_d += z * cd[sp]
            cc["Cl"] = np.maximum(cl_c, 0.0)
            cd["Cl"] = np.maximum(cl_d, 0.0)

    for it in range(config.max_coupling_iter):
        w_H_cem = {sp: c_conc[sp][:, 0] for sp in SPECIES_ORDER}
        w_L_cem = {sp: c_dil[sp][:, -1] for sp in SPECIES_ORDER}
        w_H_aem = {sp: c_conc[sp][:, -1] for sp in SPECIES_ORDER}
        w_L_aem = {sp: c_dil[sp][:, 0] for sp in SPECIES_ORDER}

        if config.load_fraction > 0.0:
            if it == 0:
                _, E_cem_prof, _, _ = multi_ion_membrane_flux_batch(
                    w_H_cem, w_L_cem, config.X_cem, config.membrane_thickness_cem, D_mem_cem, config.T, I_op=0.0
                )
                _, E_aem_prof, _, _ = multi_ion_membrane_flux_batch(
                    w_H_aem, w_L_aem, config.X_aem, config.membrane_thickness_aem, D_mem_aem, config.T, I_op=0.0
                )
            sig_c = max(_channel_cond(c_conc), 1e-10)
            sig_d = max(_channel_cond(c_dil), 1e-10)
            R_int_tmp = (
                config.channel_height / sig_c
                + config.channel_height / sig_d
                + config.membrane_thickness_cem / config.sigma_cem
                + config.membrane_thickness_aem / config.sigma_aem
            )
            E_tmp = float(np.mean(E_cem_prof + E_aem_prof))
            I_new = config.load_fraction * (E_tmp / R_int_tmp)
            I_op = I_new if it == 0 else 0.5 * I_new + 0.5 * I_op
        else:
            I_op = 0.0

        J_cem, E_cem_prof, sH_cem, sL_cem = multi_ion_membrane_flux_batch(
            w_H_cem, w_L_cem, config.X_cem, config.membrane_thickness_cem,
            D_mem_cem, config.T, I_op=I_op, compute_robin_slopes=True
        )
        J_aem, E_aem_prof, sH_aem, sL_aem = multi_ion_membrane_flux_batch(
            w_H_aem, w_L_aem, config.X_aem, config.membrane_thickness_aem,
            D_mem_aem, config.T, I_op=I_op, compute_robin_slopes=True
        )

        i_cem_arr = np.zeros(config.nx)
        i_aem_arr = np.zeros(config.nx)
        for sp in active_species:
            z = SPECIES_CHARGES[sp]
            i_cem_arr += FARADAY * z * J_cem[sp]
            i_aem_arr += FARADAY * z * J_aem[sp]

        phi_conc = _solve_channel_potential(c_conc, D_ions, geom.concentrated, config.T, -i_cem_arr, -i_aem_arr)
        phi_dil = _solve_channel_potential(c_dil, D_ions, geom.dilute, config.T, i_aem_arr, i_cem_arr)

        c_conc_target: Dict[str, np.ndarray] = {}
        c_dil_target: Dict[str, np.ndarray] = {}
        raw_res_max = 0.0
        for sp in indep_species:
            z = SPECIES_CHARGES[sp]
            D_k = D_ions[sp]
            cc_n = _solve_species_2d_np(
                geom.concentrated, flow_conc, phi_conc, z, D_k, config.T,
                float(config.conc_inlet.get(sp, 0.0)),
                -J_cem[sp], -J_aem[sp],
                s_bottom=sH_cem[sp], s_top=sH_aem[sp],
                c_bottom_old=c_conc[sp][:, 0], c_top_old=c_conc[sp][:, -1],
            )
            cd_n = _solve_species_2d_np(
                geom.dilute, flow_dil, phi_dil, z, D_k, config.T,
                float(config.dil_inlet.get(sp, 0.0)),
                J_aem[sp], J_cem[sp],
                s_bottom=sL_aem[sp], s_top=sL_cem[sp],
                c_bottom_old=c_dil[sp][:, 0], c_top_old=c_dil[sp][:, -1],
            )
            c_conc_target[sp] = cc_n
            c_dil_target[sp] = cd_n
            raw_res_max = max(
                raw_res_max,
                float(np.max(np.abs(cc_n - c_conc[sp]))) / sp_scale_conc[sp],
                float(np.max(np.abs(cd_n - c_dil[sp]))) / sp_scale_dil[sp],
            )

        if raw_res_max < 0.98 * best_res:
            best_res = raw_res_max
            stagnant_count = 0
        else:
            stagnant_count += 1

        if verbose and (it % 5 == 0 or raw_res_max < config.coupling_tol):
            print(f"  [Multi-NP iter {it:2d}] raw_res={raw_res_max:.3e}, OCV={np.mean(E_cem_prof+E_aem_prof)*1000:.2f} mV")

        # Ensure Robin linearization error is small relative to advective + wall species budget
        robin_rel_err = 0.0
        dx_fvm = np.full(config.nx, geom.concentrated.dx)
        dx_fvm[0] = 0.0
        dx_fvm[-1] = 0.5 * geom.concentrated.dx
        for sp in indep_species:
            w_tot_c = abs(float(np.sum(dx_fvm * (-J_cem[sp] - J_aem[sp]))))
            inlet_budget_c = abs(config.u_mean_conc * config.channel_height * float(config.conc_inlet.get(sp, 0.0)))
            denom_c = max(inlet_budget_c + w_tot_c, 1e-12)
            rob_c = abs(float(np.sum(dx_fvm * (
                sH_cem[sp] * np.abs(c_conc_target[sp][:, 0] - c_conc[sp][:, 0])
                + sH_aem[sp] * np.abs(c_conc_target[sp][:, -1] - c_conc[sp][:, -1])
            ))))
            robin_rel_err = max(robin_rel_err, rob_c / denom_c)

            w_tot_d = abs(float(np.sum(dx_fvm * (J_aem[sp] + J_cem[sp]))))
            inlet_budget_d = abs(config.u_mean_dil * config.channel_height * float(config.dil_inlet.get(sp, 0.0)))
            denom_d = max(inlet_budget_d + w_tot_d, 1e-12)
            rob_d = abs(float(np.sum(dx_fvm * (
                sL_aem[sp] * np.abs(c_dil_target[sp][:, 0] - c_dil[sp][:, 0])
                + sL_cem[sp] * np.abs(c_dil_target[sp][:, -1] - c_dil[sp][:, -1])
            ))))
            robin_rel_err = max(robin_rel_err, rob_d / denom_d)

        if raw_res_max < config.coupling_tol and robin_rel_err < 0.005:
            # Accept converged Robin-solved fields directly
            for sp in indep_species:
                c_conc[sp] = c_conc_target[sp]
                c_dil[sp] = c_dil_target[sp]
            if "Cl" in active_species:
                cl_c = np.zeros((config.nx, config.ny))
                cl_d = np.zeros((config.nx, config.ny))
                for sp in indep_species:
                    z = SPECIES_CHARGES[sp]
                    cl_c += z * c_conc[sp]
                    cl_d += z * c_dil[sp]
                c_conc["Cl"] = np.maximum(cl_c, 0.0)
                c_dil["Cl"] = np.maximum(cl_d, 0.0)
            # Re-evaluate fluxes & potential at converged fields for exact consistency
            w_H_cem = {sp: c_conc[sp][:, 0] for sp in SPECIES_ORDER}
            w_L_cem = {sp: c_dil[sp][:, -1] for sp in SPECIES_ORDER}
            w_H_aem = {sp: c_conc[sp][:, -1] for sp in SPECIES_ORDER}
            w_L_aem = {sp: c_dil[sp][:, 0] for sp in SPECIES_ORDER}
            J_cem, E_cem_prof, _, _ = multi_ion_membrane_flux_batch(
                w_H_cem, w_L_cem, config.X_cem, config.membrane_thickness_cem, D_mem_cem, config.T, I_op=I_op
            )
            J_aem, E_aem_prof, _, _ = multi_ion_membrane_flux_batch(
                w_H_aem, w_L_aem, config.X_aem, config.membrane_thickness_aem, D_mem_aem, config.T, I_op=I_op
            )
            i_cem_arr = np.zeros(config.nx)
            i_aem_arr = np.zeros(config.nx)
            for sp in active_species:
                z = SPECIES_CHARGES[sp]
                i_cem_arr += FARADAY * z * J_cem[sp]
                i_aem_arr += FARADAY * z * J_aem[sp]
            phi_conc = _solve_channel_potential(c_conc, D_ions, geom.concentrated, config.T, -i_cem_arr, -i_aem_arr)
            phi_dil = _solve_channel_potential(c_dil, D_ions, geom.dilute, config.T, i_aem_arr, i_cem_arr)
            converged = True
            break

        # Anderson Acceleration (DIIS) on fixed-point map G(x) - x
        x_curr = _pack_state(c_conc, c_dil)
        g_curr = _pack_state(c_conc_target, c_dil_target)
        f_curr = g_curr - x_curr

        if stagnant_count >= 6:
            aa_x_hist = [x_curr]
            aa_f_hist = [f_curr]
            stagnant_count = 0
            x_next = np.maximum(x_curr + 0.5 * config.relaxation * f_curr, 0.0)
            _unpack_state(x_next, c_conc, c_dil)
            continue

        aa_x_hist.append(x_curr)
        aa_f_hist.append(f_curr)
        if len(aa_x_hist) > m_aa + 1:
            aa_x_hist.pop(0)
            aa_f_hist.pop(0)

        m_k = len(aa_x_hist) - 1
        alpha = config.relaxation
        if m_k >= 1:
            dF = np.column_stack([aa_f_hist[j + 1] - aa_f_hist[j] for j in range(m_k)])
            dX = np.column_stack([aa_x_hist[j + 1] - aa_x_hist[j] for j in range(m_k)])
            gram = dF.T @ dF + 1e-10 * np.eye(m_k)
            rhs_aa = dF.T @ f_curr
            try:
                gamma = np.linalg.solve(gram, rhs_aa)
                x_aa = (x_curr - dX @ gamma) + alpha * (f_curr - dF @ gamma)
                if np.min(x_aa) >= -0.05 and np.max(np.abs(x_aa - x_curr)) <= 3.0 * np.max(np.abs(f_curr)) + 1e-6:
                    x_next = np.maximum(x_aa, 0.0)
                else:
                    aa_x_hist = [x_curr]
                    aa_f_hist = [f_curr]
                    x_next = np.maximum(x_curr + alpha * f_curr, 0.0)
            except np.linalg.LinAlgError:
                x_next = np.maximum(x_curr + alpha * f_curr, 0.0)
        else:
            x_next = np.maximum(x_curr + alpha * f_curr, 0.0)

        _unpack_state(x_next, c_conc, c_dil)

    E_ocv = float(np.mean(E_cem_prof + E_aem_prof))
    sig_c_avg = max(_channel_cond(c_conc), 1e-10)
    sig_d_avg = max(_channel_cond(c_dil), 1e-10)
    R_conc = config.channel_height / sig_c_avg
    R_dil = config.channel_height / sig_d_avg
    R_cem = config.membrane_thickness_cem / config.sigma_cem
    R_aem = config.membrane_thickness_aem / config.sigma_aem
    R_int = R_conc + R_dil + R_cem + R_aem
    P_gross_max = (E_ocv ** 2) / (4.0 * R_int)
    V_cell = max(E_ocv - I_op * R_int, 0.0)
    P_gross_loaded = I_op * V_cell if I_op > 0.0 else P_gross_max
    P_pump = (
        flow_conc.delta_p * config.u_mean_conc * config.channel_height / (config.eta_pump * config.channel_length)
        + flow_dil.delta_p * config.u_mean_dil * config.channel_height / (config.eta_pump * config.channel_length)
    )
    P_net_max = P_gross_max - P_pump

    # Exact discrete FVM control-volume mass balance across i = 1..nx-1 for each active species
    mb_conc: Dict[str, float] = {}
    mb_dil: Dict[str, float] = {}
    dx = geom.concentrated.dx
    dy_c = geom.concentrated.dy
    dy_d = geom.dilute.dy
    dx_fvm = np.full(config.nx, dx)
    dx_fvm[0] = 0.0  # i=0 is Dirichlet inlet face
    dx_fvm[-1] = 0.5 * dx
    dy_w_c = np.full(config.ny, dy_c); dy_w_c[0] = 0.5 * dy_c; dy_w_c[-1] = 0.5 * dy_c
    dy_w_d = np.full(config.ny, dy_d); dy_w_d[0] = 0.5 * dy_d; dy_w_d[-1] = 0.5 * dy_d
    RT_F = GAS_CONST * config.T / FARADAY
    u_x_c = 0.5 * (flow_conc.u[0, :] + flow_conc.u[1, :])
    u_x_d = 0.5 * (flow_dil.u[0, :] + flow_dil.u[1, :])

    for sp in active_species:
        z = SPECIES_CHARGES[sp]
        Dk = D_ions[sp]

        pe_c0 = z * (phi_conc[1, :] - phi_conc[0, :]) / RT_F
        fLc = dy_w_c * (Dk / dx) * _bernoulli_arr(pe_c0) + dy_w_c * np.maximum(u_x_c, 0.0)
        fRc = -dy_w_c * (Dk / dx) * _bernoulli_arr(-pe_c0) + dy_w_c * np.minimum(u_x_c, 0.0)
        mc_in = float(np.sum(fLc * c_conc[sp][0, :] + fRc * c_conc[sp][1, :]))
        mc_out = float(np.sum(dy_w_c * flow_conc.u[-1, :] * c_conc[sp][-1, :]))
        wc = float(np.sum(dx_fvm * (-J_cem[sp] - J_aem[sp])))
        denom_c = max(abs(mc_in) + abs(wc), abs(mc_out), 1e-18)
        mb_conc[sp] = abs(mc_in + wc - mc_out) / denom_c if (abs(mc_in) > 1e-16 or abs(wc) > 1e-16) else 0.0

        pe_d0 = z * (phi_dil[1, :] - phi_dil[0, :]) / RT_F
        fLd = dy_w_d * (Dk / dx) * _bernoulli_arr(pe_d0) + dy_w_d * np.maximum(u_x_d, 0.0)
        fRd = -dy_w_d * (Dk / dx) * _bernoulli_arr(-pe_d0) + dy_w_d * np.minimum(u_x_d, 0.0)
        md_in = float(np.sum(fLd * c_dil[sp][0, :] + fRd * c_dil[sp][1, :]))
        md_out = float(np.sum(dy_w_d * flow_dil.u[-1, :] * c_dil[sp][-1, :]))
        wd = float(np.sum(dx_fvm * (J_aem[sp] + J_cem[sp])))
        denom_d = max(abs(md_in) + abs(wd), abs(md_out), 1e-18)
        mb_dil[sp] = abs(md_in + wd - md_out) / denom_d if (abs(md_in) > 1e-16 or abs(wd) > 1e-16) else 0.0

    net_q_c = np.zeros((config.nx, config.ny))
    abs_q_c = np.zeros((config.nx, config.ny))
    net_q_d = np.zeros((config.nx, config.ny))
    abs_q_d = np.zeros((config.nx, config.ny))
    min_val = float("inf")
    for sp in active_species:
        z = SPECIES_CHARGES[sp]
        net_q_c += z * c_conc[sp]
        abs_q_c += abs(z) * c_conc[sp]
        net_q_d += z * c_dil[sp]
        abs_q_d += abs(z) * c_dil[sp]
        min_val = min(min_val, float(np.min(c_conc[sp])), float(np.min(c_dil[sp])))

    en_err_c = float(np.max(np.abs(net_q_c) / np.maximum(abs_q_c, 1e-12)))
    en_err_d = float(np.max(np.abs(net_q_d) / np.maximum(abs_q_d, 1e-12)))

    return MulticomponentSimResult(
        config=config,
        geometry=geom,
        flow_conc=flow_conc,
        flow_dil=flow_dil,
        c_conc=c_conc,
        c_dil=c_dil,
        phi_conc=phi_conc,
        phi_dil=phi_dil,
        J_cem=J_cem,
        J_aem=J_aem,
        E_cem_profile=E_cem_prof,
        E_aem_profile=E_aem_prof,
        E_ocv=float(E_ocv),
        R_internal=float(R_int),
        R_conc=float(R_conc),
        R_dil=float(R_dil),
        R_cem=float(R_cem),
        R_aem=float(R_aem),
        P_gross_max=float(P_gross_max),
        P_pump_total=float(P_pump),
        P_net_max=float(P_net_max),
        mass_balance_conc=mb_conc,
        mass_balance_dil=mb_dil,
        max_electroneutrality_err_conc=en_err_c,
        max_electroneutrality_err_dil=en_err_d,
        min_conc_all=float(min_val),
        converged=converged,
        coupling_iterations=it + 1,
        wall_time_seconds=time.time() - t0,
        I_op=float(I_op),
        V_cell=float(V_cell),
        P_gross_loaded=float(P_gross_loaded),
    )
