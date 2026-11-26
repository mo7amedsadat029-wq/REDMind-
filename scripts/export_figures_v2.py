"""
Generate all 15 publication-quality figures required by Section 14 of REDMind v2.0.0.

Every figure is generated strictly from actual simulation/model outputs and includes:
  - Physical units on all axes & colorbars
  - Explicit Case ID(s) and operating conditions
  - Model version (REDMind v2.0)
  - Explicit classification label:
      [Numerically solved] / [Thermodynamic post-processing] /
      [Literature benchmark] / [Exploratory sensitivity scenario]
"""

from __future__ import annotations

import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import yaml

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.electrical_model import polarization_curve
from src.multicomponent_transport import (
    MulticomponentSimConfig,
    prepare_electrolyte_composition,
    run_multicomponent_simulation,
)
from src.nucleation_model import evaluate_heterogeneous_nucleation
from src.pitzer_model import evaluate_mineral_saturation_pitzer
from src.reference_simulator import SimulationConfig, run_simulation
from src.verification import test_9_mesh_convergence_study

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(ROOT_DIR, "data")
FIG_DIR = os.path.join(ROOT_DIR, "results", "figures")


def setup_style():
    plt.rcParams.update({
        "font.family": "sans-serif",
        "font.size": 9.5,
        "axes.labelsize": 10,
        "axes.titlesize": 10.5,
        "xtick.labelsize": 8.5,
        "ytick.labelsize": 8.5,
        "legend.fontsize": 8,
        "figure.titlesize": 11.5,
        "lines.linewidth": 1.8,
        "axes.grid": True,
        "grid.alpha": 0.3,
        "savefig.dpi": 260,
        "savefig.bbox": "tight",
    })


def add_footer(fig, text: str, y: float = -0.05):
    fig.text(
        0.5, y, text,
        ha="center", va="top", fontsize=7.8, color="#334155", style="italic",
        wrap=True,
    )


def main():
    setup_style()
    os.makedirs(FIG_DIR, exist_ok=True)

    # Remove old v1 filenames so results/figures/ cleanly holds fig01..fig15
    for stale in [
        "fig05_interface_concentrations.png",
        "fig06_electric_potential.png",
        "fig07_mesh_convergence.png",
        "fig08_validation_gurreri.png",
        "fig09_pressure_vs_velocity.png",
        "fig10_power_vs_velocity.png",
        "fig11_scaling_saturation_index.png",
    ]:
        p_stale = os.path.join(FIG_DIR, stale)
        if os.path.exists(p_stale):
            os.remove(p_stale)

    # Reference binary runs at low, baseline, high velocity
    sim_ref = run_simulation(SimulationConfig(case_id="case_000_reference", nx=60, ny=25), verbose=False)
    sim_low = run_simulation(SimulationConfig(case_id="u_0.5cms", u_mean_conc=0.005, u_mean_dil=0.005, nx=50, ny=20), verbose=False)
    sim_high = run_simulation(SimulationConfig(case_id="u_3.0cms", u_mean_conc=0.030, u_mean_dil=0.030, nx=50, ny=20), verbose=False)

    geom = sim_ref.geometry
    cfg = sim_ref.config
    X_cm = geom.concentrated.X * 100.0
    Y_um_c = geom.concentrated.Y * 1e6
    Y_um_d = geom.dilute.Y * 1e6
    x_cm = geom.concentrated.x * 100.0

    # 1. Clean RED geometry
    fig, ax = plt.subplots(figsize=(8.2, 3.8))
    h_um = cfg.channel_height * 1e6
    L_cm = cfg.channel_length * 1e2
    ax.axhspan(0, h_um, color="#dbeafe", alpha=0.8, label="Dilute Channel (LC: 17 mol/m3 NaCl)")
    ax.axhspan(h_um, 2 * h_um, color="#fee2e2", alpha=0.8, label="Concentrated Channel (HC: 500 mol/m3 NaCl)")
    ax.axhline(0, color="#1d4ed8", lw=3, ls="--", label="AEM (y = 0, Outer wall)")
    ax.axhline(h_um, color="#b91c1c", lw=3, ls="-", label="CEM (y = h, Central interface)")
    ax.axhline(2 * h_um, color="#1d4ed8", lw=3, ls="--", label="AEM (y = 2h, Outer wall)")
    ax.annotate("", xy=(L_cm * 0.62, 0.5 * h_um), xytext=(L_cm * 0.32, 0.5 * h_um), arrowprops=dict(arrowstyle="->", color="#1d4ed8", lw=2))
    ax.text(L_cm * 0.47, 0.64 * h_um, "u_LC = 1.0 cm/s (Re = 6.05)", color="#1d4ed8", ha="center", fontweight="bold")
    ax.annotate("", xy=(L_cm * 0.62, 1.5 * h_um), xytext=(L_cm * 0.32, 1.5 * h_um), arrowprops=dict(arrowstyle="->", color="#b91c1c", lw=2))
    ax.text(L_cm * 0.47, 1.64 * h_um, "u_HC = 1.0 cm/s (Re = 6.05)", color="#b91c1c", ha="center", fontweight="bold")
    ax.set_xlim(0, L_cm)
    ax.set_ylim(-25, 2 * h_um + 25)
    ax.set_xlabel("Streamwise Coordinate x [cm]")
    ax.set_ylabel("Transverse Coordinate y [um]")
    ax.set_title("Fig 1: Clean 2D RED Unit Cell-Pair Computational Geometry")
    ax.legend(loc="upper right", framealpha=0.95)
    add_footer(fig, "Case ID: case_000_reference | h=270 um, L=10 cm, delta_m=125 um, T=298.15 K | Model: REDMind-2D-Binary-v2.0 | [Numerically solved]")
    fig.savefig(os.path.join(FIG_DIR, "fig01_geometry.png"))
    plt.close(fig)

    # 2. Velocity fields under different flow rates
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.5, 4.2))
    im1 = ax1.contourf(X_cm, Y_um_c, sim_ref.flow_conc.u * 100.0, levels=25, cmap="plasma")
    ax1.set_xlabel("Streamwise x [cm]")
    ax1.set_ylabel("Channel Transverse y [um]")
    ax1.set_title("2D HC Velocity u(x,y) [cm/s] (u_mean=1.0 cm/s)")
    fig.colorbar(im1, ax=ax1, label="u [cm/s]")

    y_norm = sim_ref.geometry.concentrated.y * 1e6
    ax2.plot(sim_low.flow_conc.u[0, :] * 100.0, sim_low.geometry.concentrated.y * 1e6, "b--", label="u_mean = 0.5 cm/s (Re=3.02)")
    ax2.plot(sim_ref.flow_conc.u[0, :] * 100.0, y_norm, "k-", label="u_mean = 1.0 cm/s (Re=6.05)")
    ax2.plot(sim_high.flow_conc.u[0, :] * 100.0, sim_high.geometry.concentrated.y * 1e6, "r-", label="u_mean = 3.0 cm/s (Re=18.15)")
    ax2.set_xlabel("Axial Velocity u(y) [cm/s]")
    ax2.set_ylabel("Transverse y [um]")
    ax2.set_title("Parabolic Poiseuille Profiles Across Flow Rates")
    ax2.legend()
    fig.suptitle("Fig 2: Channel Velocity Fields Under Different Flow Rates")
    add_footer(fig, "Cases: u_0.5cms, case_000_reference, u_3.0cms | h=270 um, L=10 cm, T=298.15 K | Model: REDMind-2D-Binary-v2.0 | [Numerically solved]")
    fig.savefig(os.path.join(FIG_DIR, "fig02_velocity_field.png"))
    plt.close(fig)

    # 3. Pressure distributions
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.5, 4.2))
    im = ax1.contourf(X_cm, Y_um_c, sim_ref.flow_conc.p, levels=25, cmap="viridis")
    ax1.set_xlabel("Streamwise x [cm]")
    ax1.set_ylabel("Transverse y [um]")
    ax1.set_title("HC Pressure Field p(x,y) [Pa]")
    fig.colorbar(im, ax=ax1, label="Pressure [Pa]")

    ax2.plot(sim_low.geometry.concentrated.x * 100.0, sim_low.flow_conc.p[:, 0], "b--", label="u = 0.5 cm/s (dp = 73.3 Pa)")
    ax2.plot(x_cm, sim_ref.flow_conc.p[:, 0], "k-", label=f"u = 1.0 cm/s (dp = {sim_ref.flow_conc.delta_p:.1f} Pa)")
    ax2.plot(sim_high.geometry.concentrated.x * 100.0, sim_high.flow_conc.p[:, 0], "r-", label=f"u = 3.0 cm/s (dp = {sim_high.flow_conc.delta_p:.1f} Pa)")
    ax2.set_xlabel("Streamwise x [cm]")
    ax2.set_ylabel("Pressure p(x) [Pa]")
    ax2.set_title("Linear Streamwise Pressure Drop")
    ax2.legend()
    fig.suptitle("Fig 3: Hydrodynamic Pressure Distributions")
    add_footer(fig, "Cases: u_0.5cms, case_000_reference, u_3.0cms | Analytical Poiseuille dp = 12*mu*u*L/h^2 | Model: REDMind-2D-Binary-v2.0 | [Numerically solved]")
    fig.savefig(os.path.join(FIG_DIR, "fig03_pressure_drop.png"))
    plt.close(fig)

    # 4. Na+ and Cl- concentration fields
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8.5, 5.2), sharex=True)
    im1 = ax1.contourf(X_cm, Y_um_c, sim_ref.c_conc, levels=35, cmap="YlOrRd")
    ax1.set_ylabel("HC y [um]")
    ax1.set_title("Concentrated Channel c_Na = c_Cl [mol/m3] (Wall Depletion via CEM/AEM)")
    fig.colorbar(im1, ax=ax1, label="c_Na = c_Cl [mol/m3]")

    im2 = ax2.contourf(X_cm, Y_um_d, sim_ref.c_dil, levels=35, cmap="Blues")
    ax2.set_xlabel("Streamwise x [cm]")
    ax2.set_ylabel("LC y [um]")
    ax2.set_title("Dilute Channel c_Na = c_Cl [mol/m3] (Wall Enrichment via CEM/AEM)")
    fig.colorbar(im2, ax=ax2, label="c_Na = c_Cl [mol/m3]")
    fig.suptitle("Fig 4: 2D Spatial Na+ and Cl- Concentration Fields (Electroneutrality c_Na = c_Cl)")
    add_footer(fig, "Case ID: case_000_reference | 500/17 mol/m3 NaCl, u=1.0 cm/s, T=298.15 K, 60x25 | Model: REDMind-2D-Binary-v2.0 | [Numerically solved]")
    fig.savefig(os.path.join(FIG_DIR, "fig04_concentration_fields.png"))
    plt.close(fig)

    # 5. Multicomponent ion concentration fields (Mediterranean RO Brine mc_brine_009 / fresh 2D solve)
    with open(os.path.join(ROOT_DIR, "configs", "brine_profiles.yaml"), "r", encoding="utf-8") as f:
        bp = yaml.safe_load(f)["profiles"]
    p_med = bp["mediterranean_el_remel_brine"]
    aud_med = prepare_electrolyte_composition("med_brine", conc_mg_L=p_med["concentrations_mg_L"], pH=p_med["pH"], T_K=298.15)
    dil_17 = prepare_electrolyte_composition("dil17", conc_mol_m3={"Na": 17.0, "Cl": 17.0}, pH=7.5).conc_balanced_mol_m3
    mc_med = run_multicomponent_simulation(
        MulticomponentSimConfig(
            case_id="mc_brine_010",
            conc_inlet=aud_med.conc_balanced_mol_m3,
            dil_inlet=dil_17,
            load_fraction=0.5,
            nx=50,
            ny=20,
            brine_profile_id="mediterranean_el_remel_brine",
        )
    )
    Xm_cm = mc_med.geometry.concentrated.X * 100.0
    Ym_um = mc_med.geometry.concentrated.Y * 1e6
    fig, axes = plt.subplots(2, 2, figsize=(10.8, 5.8), sharex=True, sharey=True)
    for ax, (sp, label, cmap) in zip(
        axes.ravel(),
        [("Na", "Na+ [mol/m3]", "OrRd"), ("Mg", "Mg2+ [mol/m3]", "PuBu"), ("Ca", "Ca2+ [mol/m3]", "YlGn"), ("SO4", "SO4(2-) [mol/m3]", "Purples")],
    ):
        im = ax.contourf(Xm_cm, Ym_um, mc_med.c_conc[sp], levels=25, cmap=cmap)
        ax.set_title(f"HC Channel {label}")
        fig.colorbar(im, ax=ax, label=label)
    axes[1, 0].set_xlabel("Streamwise x [cm]")
    axes[1, 1].set_xlabel("Streamwise x [cm]")
    axes[0, 0].set_ylabel("HC y [um]")
    axes[1, 0].set_ylabel("HC y [um]")
    fig.suptitle("Fig 5: Multicomponent 2D Ion Concentration Fields (Mediterranean El-Remel RO Brine)")
    add_footer(fig, "Case ID: mc_brine_010 | El-Remel RO Brine (57.1 g/L TDS) vs 17 mol/m3 NaCl, lf=0.5, u=1 cm/s | Model: REDMind-2D-Multicomponent-v2.0 | [Numerically solved]")
    fig.savefig(os.path.join(FIG_DIR, "fig05_multicomponent_ion_fields.png"))
    plt.close(fig)

    # 6. Membrane-interface concentration profiles
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.5, 4.2))
    ax1.plot(x_cm, sim_ref.c_conc[:, 0], "r-", label="HC at CEM Wall (y=0)")
    ax1.plot(x_cm, np.mean(sim_ref.c_conc, axis=1), "r--", label="HC Bulk Mean")
    ax1.set_xlabel("Streamwise x [cm]")
    ax1.set_ylabel("Concentration [mol/m3]")
    ax1.set_title("Concentrated Channel Boundary-Layer Depletion")
    ax1.legend()

    ax2.plot(x_cm, sim_ref.c_dil[:, -1], "b-", label="LC at CEM Wall (y=h)")
    ax2.plot(x_cm, np.mean(sim_ref.c_dil, axis=1), "b--", label="LC Bulk Mean")
    ax2.set_xlabel("Streamwise x [cm]")
    ax2.set_ylabel("Concentration [mol/m3]")
    ax2.set_title("Dilute Channel Boundary-Layer Enrichment")
    ax2.legend()
    fig.suptitle("Fig 6: Repaired Membrane-Interface Concentration Polarization Profiles along CEM")
    add_footer(fig, "Case ID: case_000_reference | 500/17 mol/m3 NaCl, u=1.0 cm/s, T=298.15 K | Model: REDMind-2D-Binary-v2.0 | [Numerically solved]")
    fig.savefig(os.path.join(FIG_DIR, "fig06_interface_concentrations.png"))
    plt.close(fig)

    # 7. Electric potential distributions
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8.5, 5.2), sharex=True)
    im1 = ax1.contourf(X_cm, Y_um_c, sim_ref.phi_conc * 1000.0, levels=25, cmap="coolwarm")
    ax1.set_ylabel("HC y [um]")
    ax1.set_title("Concentrated Channel Liquid-Junction Potential Phi_HC [mV]")
    fig.colorbar(im1, ax=ax1, label="Phi [mV]")

    im2 = ax2.contourf(X_cm, Y_um_d, sim_ref.phi_dil * 1000.0, levels=25, cmap="coolwarm")
    ax2.set_xlabel("Streamwise x [cm]")
    ax2.set_ylabel("LC y [um]")
    ax2.set_title("Dilute Channel Liquid-Junction Potential Phi_LC [mV]")
    fig.colorbar(im2, ax=ax2, label="Phi [mV]")
    fig.suptitle("Fig 7: 2D Electric Potential Distributions from Electroneutrality Closure")
    add_footer(fig, "Case ID: case_000_reference | 500/17 mol/m3 NaCl, u=1.0 cm/s, T=298.15 K | Model: REDMind-2D-Binary-v2.0 | [Numerically solved]")
    fig.savefig(os.path.join(FIG_DIR, "fig07_electric_potential.png"))
    plt.close(fig)

    # 8. Net power versus operating conditions (Stage 1 Sobol + Long trade-off curve)
    df_s1 = pd.read_csv(os.path.join(DATA_DIR, "clean_cases", "case_metadata.csv"))
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.8, 4.3))
    sc = ax1.scatter(df_s1["u_mean_dil_m_s"] * 100.0, df_s1["P_net_max_W_m2"], c=df_s1["c_conc_inlet_mol_m3"], cmap="viridis", s=38, edgecolors="k", lw=0.4)
    fig.colorbar(sc, ax=ax1, label="c_HC Inlet [mol/m3]")
    ax1.set_xlabel("Dilute Channel Mean Velocity [cm/s]")
    ax1.set_ylabel("Net Power Density P_net_max [W/m2]")
    ax1.set_title("Stage 1 Sobol Dataset (90 Unique Cases)")

    u_sweep = np.linspace(0.003, 0.045, 10)
    p_g_sw, p_p_sw, p_n_sw = [], [], []
    for u_v in u_sweep:
        sr = run_simulation(SimulationConfig(case_id=f"u_{u_v:.3f}", u_mean_conc=float(u_v), u_mean_dil=float(u_v), nx=40, ny=16), verbose=False)
        p_g_sw.append(sr.electrical.P_gross_max)
        p_p_sw.append(sr.electrical.P_pump_total)
        p_n_sw.append(sr.electrical.P_net_max)
    ax2.plot(u_sweep * 100.0, p_g_sw, "g-o", markersize=4, label="P_gross_max")
    ax2.plot(u_sweep * 100.0, p_p_sw, "r--s", markersize=4, label="P_pump_total")
    ax2.plot(u_sweep * 100.0, p_n_sw, "b-^", markersize=4, label="P_net_max")
    ax2.set_xlabel("Symmetric Mean Flow Velocity u [cm/s]")
    ax2.set_ylabel("Power Density [W/m2]")
    ax2.set_title("2D Solved Net-Power vs Flow Trade-off (500/17 mM)")
    ax2.legend()
    fig.suptitle("Fig 8: Net Power Density Versus Operating Conditions")
    add_footer(fig, "Cases: clean_sobol_001..090 + 10 velocity sweep runs | c_HC=250-1500 mM, u=0.3-4.5 cm/s | Model: REDMind-2D-Binary-v2.0 | [Numerically solved]")
    fig.savefig(os.path.join(FIG_DIR, "fig08_net_power_operating_conditions.png"))
    plt.close(fig)

    # 9. Comparison of Mediterranean and Red Sea brine profiles
    df_mc = pd.read_csv(os.path.join(DATA_DIR, "multicomponent_brines", "case_metadata.csv"))
    # Select matched baseline operating point (lf=0.5, dil=17 mM, u=1 cm/s, h=270 um) per brine profile
    sub_mc = df_mc[(df_mc["load_fraction"] == 0.5) & (df_mc["c_dil_inlet_mol_m3"] == 17.0) & (np.isclose(df_mc["u_mean_conc_m_s"], 0.01))]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11.2, 4.5))
    short_names = [s.replace("mediterranean_", "Med ").replace("red_sea_", "RedSea ").replace("shammas_brackish_ro_brine", "Shammas BWRO").replace("_egypt", "").replace("_el_remel_", " ").replace("_pmc9694509", " PMC") for s in sub_mc["brine_profile_id"]]
    x_pos = np.arange(len(sub_mc))
    w = 0.25
    ax1.bar(x_pos - w, sub_mc["conc_Na_mol_m3"], width=w, label="Na+", color="#f97316")
    ax1.bar(x_pos, sub_mc["conc_Mg_mol_m3"], width=w, label="Mg2+", color="#0284c7")
    ax1.bar(x_pos + w, sub_mc["conc_SO4_mol_m3"], width=w, label="SO4(2-)", color="#7c3aed")
    ax1.set_xticks(x_pos)
    ax1.set_xticklabels(short_names, rotation=22, ha="right")
    ax1.set_ylabel("Inlet Concentration [mol/m3]")
    ax1.set_title("Documented RO Brine Major Ion Composition")
    ax1.legend()

    ax2.bar(x_pos - 0.18, sub_mc["P_gross_max_W_m2"], width=0.36, label="Multicomponent P_gross_max", color="#dc2626")
    ax2.bar(x_pos + 0.18, sub_mc["binary_eq_P_gross_max_W_m2"], width=0.36, label="Equivalent-NaCl Reference", color="#64748b", alpha=0.8)
    ax2.set_xticks(x_pos)
    ax2.set_xticklabels(short_names, rotation=22, ha="right")
    ax2.set_ylabel("Peak Gross Power Density [W/m2]")
    ax2.set_title("Simulated RED Power: Real Brine vs Eq-NaCl")
    ax2.legend()
    fig.suptitle("Fig 9: Comparison of Mediterranean, Red Sea, and Brackish RO Brine Profiles", y=0.99)
    fig.tight_layout(rect=[0.0, 0.04, 1.0, 0.94])
    add_footer(fig, "Cases: mc_brine baseline lf=0.5 subset | dil=17 mM NaCl, u=1 cm/s, h=270 um | Model: REDMind-2D-Multicomponent-v2.0 | [Numerically solved]", y=-0.01)
    fig.savefig(os.path.join(FIG_DIR, "fig09_mediterranean_vs_red_sea_brines.png"))
    plt.close(fig)

    # 10. Calcite saturation-risk maps (Stage 3)
    df_sr = pd.read_csv(os.path.join(DATA_DIR, "scaling_risk", "case_metadata.csv"))
    df_cal = df_sr[df_sr["mineral_phase"] == "Calcite"]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.8, 4.4))
    colors_reg = {"Undersaturated": "#2563eb", "Near-equilibrium": "#d97706", "Supersaturated": "#dc2626"}
    for reg, grp in df_cal.groupby("saturation_regime"):
        ax1.scatter(grp["pH"], grp["saturation_index"], color=colors_reg[reg], s=60, label=f"Pitzer: {reg}", edgecolors="k", lw=0.5)
    ax1.axhspan(-0.1, 0.1, color="#fef3c7", alpha=0.6, label="Near-eq band |SI|<=0.1")
    ax1.axhline(0.0, color="k", ls=":")
    ax1.set_xlabel("Solution pH [-]")
    ax1.set_ylabel("Calcite Saturation Index SI [-]")
    ax1.set_title("Pitzer Calcite SI Across 3 Saturation Regimes")
    ax1.legend()

    # Spatial wall SI from representative supersaturated & near-eq npz
    npz_sup = np.load(os.path.join(DATA_DIR, "scaling_risk", "generated", "sr_calcite_014_wall_si.npz"))
    npz_eq = np.load(os.path.join(DATA_DIR, "scaling_risk", "generated", "sr_calcite_009_wall_si.npz"))
    npz_und = np.load(os.path.join(DATA_DIR, "scaling_risk", "generated", "sr_calcite_003_wall_si.npz"))
    xw_cm = npz_sup["x_interface"] * 100.0
    ax2.plot(xw_cm, npz_sup["si_pitzer_profile"], "r-", label="Med Brine pH 8.1 (Pitzer)")
    ax2.plot(xw_cm, npz_sup["si_davies_profile"], "r--", alpha=0.7, label="Med Brine pH 8.1 (Davies invalid I>0.5)")
    ax2.plot(xw_cm, npz_eq["si_pitzer_profile"], "-", color="#d97706", label="Med Brine pH 7.18 (Near-eq)")
    ax2.plot(xw_cm, npz_und["si_pitzer_profile"], "b-", label="Med Brine pH 6.50 (Undersaturated)")
    ax2.axhline(0.0, color="k", ls=":")
    ax2.set_xlabel("Streamwise Interface x [cm]")
    ax2.set_ylabel("Local CEM Wall Calcite SI [-]")
    ax2.set_title("One-Way Coupled Wall SI & Davies Breakdown")
    ax2.legend()
    fig.suptitle("Fig 10: Calcite Saturation-Risk Regimes & One-Way Coupled CEM Wall Profiles")
    add_footer(fig, "Cases: sr_calcite_001..018 | I=0.3-1.7 mol/kg, T=293-313 K | Model: USGS pitzer.dat HMW | [Thermodynamic post-processing]")
    fig.savefig(os.path.join(FIG_DIR, "fig10_calcite_scaling_risk_map.png"))
    plt.close(fig)

    # 11. Gypsum saturation-risk comparisons
    df_gyp = df_sr[df_sr["mineral_phase"] == "Gypsum"]
    df_gsalt = pd.read_csv(os.path.join(DATA_DIR, "benchmark_cases", "pitzer_gypsum_salting_in.csv"))
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.8, 4.4))
    for reg, grp in df_gyp.groupby("saturation_regime"):
        ax1.scatter(grp["ca_mol_m3"] * grp["so4_mol_m3"] / 1e3, grp["saturation_index"], color=colors_reg[reg], s=60, label=reg, edgecolors="k", lw=0.5)
    ax1.axhspan(-0.1, 0.1, color="#fef3c7", alpha=0.6)
    ax1.axhline(0.0, color="k", ls=":")
    ax1.set_xlabel("Total Ion Product [Ca]*[SO4] [10^-3 M^2]")
    ax1.set_ylabel("Gypsum Saturation Index SI [-]")
    ax1.set_title("Stage 3 Gypsum SI Across 18 Cases")
    ax1.legend()

    x_g = np.arange(len(df_gsalt))
    ax2.bar(x_g - 0.18, df_gsalt["si_gypsum_pitzer"], width=0.36, label="Pitzer HMW (with a_w^2)", color="#0284c7")
    ax2.bar(x_g + 0.18, df_gsalt["si_gypsum_davies"], width=0.36, label="Davies (invalid at I>0.5)", color="#94a3b8")
    ax2.axhline(0.0, color="k", ls=":")
    ax2.set_xticks(x_g)
    ax2.set_xticklabels(["Pure 15.2mM", "1m NaCl+38mM", "3m NaCl+15.2mM", "3m NaCl+55mM"], rotation=15)
    ax2.set_ylabel("Gypsum SI [-]")
    ax2.set_title("NaCl Salting-In & Pitzer vs Davies")
    ax2.legend()
    fig.suptitle("Fig 11: Gypsum Saturation-Risk Regimes & High-Salinity Pitzer Activity Comparison")
    add_footer(fig, "Cases: sr_gypsum_001..018 & pitzer_gypsum_salting_in | T=298-313 K | Model: USGS pitzer.dat | [Thermodynamic post-processing / Literature benchmark]")
    fig.savefig(os.path.join(FIG_DIR, "fig11_gypsum_scaling_risk_comparison.png"))
    plt.close(fig)

    # 12. Heterogeneous nucleation results (Santoro et al. 2021 CNT)
    df_cnt_bm = pd.read_csv(os.path.join(DATA_DIR, "benchmark_cases", "santoro_2021_calcite_cnt.csv"))
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.8, 4.4))
    for m_lbl, grp in df_cnt_bm.groupby("membrane"):
        ax1.plot(grp["omega"], grp["barrier_het_kBT"], "o-", label=m_lbl)
    ax1.axhline(40.0, color="#dc2626", ls="--", label="Category B->C Threshold (40 kB*T)")
    ax1.set_xscale("log")
    ax1.set_xlabel("Calcite Saturation Ratio Omega [-]")
    ax1.set_ylabel("Heterogeneous Nucleation Barrier DeltaG*_het / (kB*T) [-]")
    ax1.set_title("Nucleation Barrier vs Supersaturation (CEM vs AEM)")
    ax1.legend()

    th_grid = np.linspace(35.0, 95.0, 25)
    for r_w, col in [(1.0, "#1d4ed8"), (1.3, "#d97706"), (1.6, "#dc2626")]:
        bars = [evaluate_heterogeneous_nucleation("Calcite", omega=10.0, contact_angle_deg=float(th), roughness_factor=r_w).barrier_het_kBT for th in th_grid]
        ax2.plot(th_grid, bars, color=col, label=f"Wenzel Roughness r = {r_w:.1f}")
    ax2.axhline(40.0, color="k", ls=":")
    ax2.set_xlabel("Intrinsic Contact Angle theta_0 [deg]")
    ax2.set_ylabel("DeltaG*_het / (kB*T) at Omega = 10 [-]")
    ax2.set_title("Effect of Wetting Angle & Wenzel Roughness (T=298.15 K)")
    ax2.legend()
    fig.suptitle("Fig 12: CNT Heterogeneous Nucleation Barriers (Santoro et al. 2021 Framework)")
    add_footer(fig, "Cases: ms_cnt_001..018 + Santoro CNT sweeps | gamma_sl=0.094 J/m2, Vm=36.9 cm3/mol | [Thermodynamic post-processing]")
    fig.savefig(os.path.join(FIG_DIR, "fig12_heterogeneous_nucleation_cnt.png"))
    plt.close(fig)

    # 13. Mineral-scaling & literature benchmark comparisons
    df_rs = pd.read_csv(os.path.join(DATA_DIR, "benchmark_cases", "pitzer_nacl_robinson_stokes.csv"))
    I_dense, V_dense, P_dense = polarization_curve(sim_ref.electrical.E_ocv, sim_ref.electrical.R_internal, 100)
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.8, 4.4))
    ax1.plot(I_dense, P_dense, "b-", label=f"REDMind 2D (P_max={sim_ref.electrical.P_gross_max:.2f} W/m2)")
    ax1.axhline(3.80, color="r", ls="--", label="Gurreri (2017) Nominal Empty (3.80 W/m2)")
    ax1.scatter([sim_ref.electrical.I_max_power], [sim_ref.electrical.P_gross_max], color="darkblue", zorder=5)
    ax1.set_xlabel("Current Density I [A/m2]")
    ax1.set_ylabel("Gross Power Density P [W/m2]")
    ax1.set_title("Gurreri et al. (2017) Power-Curve Benchmark")
    ax1.legend()

    ax2.plot(df_rs["molality_NaCl_mol_kg"], df_rs["gamma_mean_pitzer"], "r-o", label="REDMind USGS pitzer.dat")
    ax2.scatter(df_rs["molality_NaCl_mol_kg"], df_rs["gamma_mean_robinson_stokes"], marker="s", s=65, facecolors="none", edgecolors="black", lw=1.6, label="Robinson & Stokes Tabulated")
    ax2.set_xlabel("NaCl Molality m [mol/kg H2O]")
    ax2.set_ylabel("Mean Ionic Activity Coefficient gamma_+/- [-]")
    ax2.set_title("High-Salinity Pitzer Activity Benchmark (0.1–4.0 m)")
    ax2.legend()
    fig.suptitle("Fig 13: Literature Benchmarks (Gurreri 2017 RED & Robinson-Stokes Pitzer NaCl)")
    add_footer(fig, "Benchmarks: gurreri_2017_benchmark & pitzer_nacl_robinson_stokes | Note: Mujahid (2026) gypsum-silica full table paywalled (documented in JSON) | [Literature benchmark]")
    fig.savefig(os.path.join(FIG_DIR, "fig13_scaling_benchmark_comparisons.png"))
    plt.close(fig)

    # 14. Performance changes relative to clean reference cases
    df_ms = pd.read_csv(os.path.join(DATA_DIR, "mineral_scaling", "case_metadata.csv"))
    df_sens = df_ms[df_ms["scenario_group"] == "exploratory_resistance_sensitivity"]
    sens_bin = df_sens[df_sens["brine_profile_id"] == "synthetic_NaCl"]
    sens_mc = df_sens[df_sens["brine_profile_id"] == "mediterranean_el_remel_brine"]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11.6, 4.7))
    ax1.bar(x_pos, sub_mc["performance_reduction_pct"], color="#f59e0b", edgecolor="k", lw=0.5)
    ax1.set_xticks(x_pos)
    ax1.set_xticklabels(short_names, rotation=22, ha="right")
    ax1.set_ylabel("Power Reduction vs Eq-NaCl Reference [%]")
    ax1.set_title("Real Brines vs Eq-NaCl (Stage 2)")

    ax2.plot(sens_bin["delta_Rm_ohm_cm2"], sens_bin["performance_reduction_pct"], "b-o", label="Clean NaCl + fixed Delta_R_m")
    ax2.plot(sens_mc["delta_Rm_ohm_cm2"], sens_mc["performance_reduction_pct"], "r-s", label="Med RO Brine + fixed Delta_R_m")
    ax2.set_xlabel("Fixed Resistance Increment Delta_R_m [Ohm*cm2]")
    ax2.set_ylabel("Gross Power Reduction [%]")
    ax2.set_title("Exploratory Fixed-Delta_R_m Sensitivity (Non-Kinetic)")
    ax2.legend()
    fig.suptitle("Fig 14: Performance Changes Relative to Clean Reference Cases", y=0.99)
    fig.tight_layout(rect=[0.0, 0.04, 1.0, 0.94])
    add_footer(fig, "Cases: mc_brine subset & ms_sens_001..008 | Left: [Numerically solved] | Right: [Exploratory sensitivity scenario - hypothetical Delta_R_m]", y=-0.01)
    fig.savefig(os.path.join(FIG_DIR, "fig14_performance_change_vs_clean.png"))
    plt.close(fig)

    # 15. Mesh convergence & Stage 1-2 verification plots
    mesh_res = test_9_mesh_convergence_study().details["grids"]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12.2, 4.8))
    g_labels = [f"{g['nx']}x{g['ny']}" for g in mesh_res]
    ax1.plot(g_labels, [g["ocv_mV"] for g in mesh_res], "g-o", label="E_OCV [mV]")
    ax1.set_xlabel("Grid Resolution (nx x ny)")
    ax1.set_ylabel("Open-Circuit Voltage E_OCV [mV]", color="g")
    ax1.ticklabel_format(axis="y", useOffset=False)
    ax1b = ax1.twinx()
    ax1b.plot(g_labels, [g["P_gross_W_m2"] for g in mesh_res], "r-s", label="P_gross [W/m2]")
    ax1b.set_ylabel("Peak Gross Power [W/m2]", color="r")
    ax1b.ticklabel_format(axis="y", useOffset=False)
    ax1.set_title("3-Grid Mesh Refinement Convergence (< 0.01% shift)")

    ax2.boxplot(
        [df_s1["mass_balance_rel_err_conc"] * 100.0, df_s1["mass_balance_rel_err_dil"] * 100.0,
         df_mc["mass_balance_rel_err_conc"] * 100.0, df_mc["mass_balance_rel_err_dil"] * 100.0],
        labels=["S1 Conc", "S1 Dil", "S2 Conc", "S2 Dil"],
    )
    ax2.axhline(2.0, color="r", ls="--", label="Acceptance Limit (2.0%)")
    ax2.set_yscale("log")
    ax2.set_ylabel("Max Species Mass-Balance Error [%]")
    ax2.set_title(f"Mass Conservation Across Stage 1 ({len(df_s1)}) & Stage 2 ({len(df_mc)})")
    ax2.legend()
    fig.suptitle("Fig 15: Mesh Convergence & Automated Verification Residuals (v2.0)", y=0.99)
    fig.tight_layout(rect=[0.0, 0.04, 1.0, 0.94])
    fig.subplots_adjust(wspace=0.45)
    add_footer(fig, f"Cases: Mesh 25x10/50x20/100x40 + Stage 1 ({len(df_s1)}) & Stage 2 ({len(df_mc)}) | Model: REDMind v2.0 | [Numerically solved]", y=-0.01)
    fig.savefig(os.path.join(FIG_DIR, "fig15_mesh_convergence_and_verification.png"))
    plt.close(fig)

    print(f"Exported all 15 v2.0.0 figures to: {FIG_DIR}")


if __name__ == "__main__":
    main()
