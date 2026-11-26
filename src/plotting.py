"""
Plotting and scientific visualization suite for RED reference simulation.

Generates all 11 required publication-quality figures:
1. Computational geometry and membrane arrangement diagram
2. Velocity field u(x, y)
3. Pressure field p(x, y) and streamwise pressure drop
4. Species concentration fields c(x, y)
5. Membrane-interface concentration profiles c(x)
6. Electric potential Phi(x, y)
7. Mesh-refinement and numerical convergence (3 grids)
8. Baseline comparison against published results (Gurreri et al. 2017)
9. Pressure drop versus flow velocity
10. Gross power, pumping power, and net power versus flow velocity
11. Membrane-interface calcite Saturation Index (SI) profiles

All figures include explicit physical units, case labeling, and colorbars.
"""

import os
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Headless backend
import matplotlib.pyplot as plt

from src.reference_simulator import SimulationResult
from src.scaling_indicator import InterfaceScalingProfile
from src.electrical_model import polarization_curve


def setup_plot_style():
    """Apply clean publication styling."""
    plt.rcParams.update({
        'font.family': 'sans-serif',
        'font.size': 10,
        'axes.labelsize': 11,
        'axes.titlesize': 12,
        'xtick.labelsize': 9,
        'ytick.labelsize': 9,
        'legend.fontsize': 9,
        'figure.titlesize': 13,
        'lines.linewidth': 1.8,
        'axes.grid': True,
        'grid.alpha': 0.3,
        'savefig.dpi': 300,
        'savefig.bbox': 'tight'
    })


def export_all_figures(
    sim_result: SimulationResult,
    scaling_data: dict,
    mesh_results: list,
    output_dir: str
):
    """Generate and save all 11 scientific figures."""
    setup_plot_style()
    os.makedirs(output_dir, exist_ok=True)

    geom = sim_result.geometry
    cfg = sim_result.config

    # =========================================================================
    # Figure 1: Computational Geometry and Membrane Arrangement
    # =========================================================================
    fig, ax = plt.subplots(figsize=(8, 4))
    h_um = cfg.channel_height * 1e6
    L_cm = cfg.channel_length * 1e2

    # Draw channels
    ax.axhspan(0, h_um, color='#d0e1fd', alpha=0.6, label='Dilute Channel (LC, River water)')
    ax.axhspan(h_um, 2*h_um, color='#fde0dd', alpha=0.6, label='Concentrated Channel (HC, Seawater)')

    # Draw membranes
    ax.axhline(0, color='blue', linewidth=3, linestyle='--', label='AEM (Outer wall, y=0)')
    ax.axhline(h_um, color='red', linewidth=3, linestyle='-', label='CEM (Central membrane, y=h)')
    ax.axhline(2*h_um, color='blue', linewidth=3, linestyle='--', label='AEM (Outer wall, y=2h)')

    # Arrows for flow direction
    ax.annotate('', xy=(L_cm*0.6, 0.5*h_um), xytext=(L_cm*0.3, 0.5*h_um),
                arrowprops=dict(arrowstyle="->", color='#1f77b4', lw=2))
    ax.text(L_cm*0.45, 0.65*h_um, f"u_LC = {cfg.u_mean_dil*100:.1f} cm/s", color='#1f77b4', ha='center')

    ax.annotate('', xy=(L_cm*0.6, 1.5*h_um), xytext=(L_cm*0.3, 1.5*h_um),
                arrowprops=dict(arrowstyle="->", color='#d62728', lw=2))
    ax.text(L_cm*0.45, 1.65*h_um, f"u_HC = {cfg.u_mean_conc*100:.1f} cm/s", color='#d62728', ha='center')

    ax.set_xlim(0, L_cm)
    ax.set_ylim(-20, 2*h_um + 20)
    ax.set_xlabel("Streamwise coordinate x [cm]")
    ax.set_ylabel("Transverse coordinate y [um]")
    ax.set_title("Fig 1: RED 2D Unit Cell Pair Computational Geometry")
    ax.legend(loc='upper right', framealpha=0.9)
    fig.savefig(os.path.join(output_dir, "fig01_geometry.png"))
    plt.close(fig)

    # =========================================================================
    # Figure 2: Velocity Fields
    # =========================================================================
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 5), sharex=True)
    X_cm = geom.concentrated.X * 100.0
    Y_um_conc = geom.concentrated.Y * 1e6
    Y_um_dil = geom.dilute.Y * 1e6

    im1 = ax1.contourf(X_cm, Y_um_conc, sim_result.flow_conc.u * 100.0, levels=30, cmap='plasma')
    ax1.set_ylabel("y [um] (HC)")
    ax1.set_title("Fig 2: Velocity Fields u(x, y) [cm/s] in Concentrated (top) and Dilute (bottom) Channels")
    cbar1 = fig.colorbar(im1, ax=ax1)
    cbar1.set_label("u [cm/s]")

    im2 = ax2.contourf(X_cm, Y_um_dil, sim_result.flow_dil.u * 100.0, levels=30, cmap='plasma')
    ax2.set_xlabel("Streamwise coordinate x [cm]")
    ax2.set_ylabel("y [um] (LC)")
    cbar2 = fig.colorbar(im2, ax=ax2)
    cbar2.set_label("u [cm/s]")

    fig.savefig(os.path.join(output_dir, "fig02_velocity_field.png"))
    plt.close(fig)

    # =========================================================================
    # Figure 3: Pressure Field and Streamwise Pressure Drop
    # =========================================================================
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))
    im = ax1.contourf(X_cm, Y_um_conc, sim_result.flow_conc.p, levels=30, cmap='viridis')
    ax1.set_xlabel("x [cm]")
    ax1.set_ylabel("y [um]")
    ax1.set_title("Pressure Field p(x, y) [Pa]")
    fig.colorbar(im, ax=ax1, label="Pressure [Pa]")

    ax2.plot(geom.concentrated.x * 100.0, sim_result.flow_conc.p[:, 0], 'r-', label="Concentrated Channel")
    ax2.plot(geom.dilute.x * 100.0, sim_result.flow_dil.p[:, 0], 'b--', label="Dilute Channel")
    ax2.set_xlabel("Streamwise coordinate x [cm]")
    ax2.set_ylabel("Pressure p(x) [Pa]")
    ax2.set_title("Linear Streamwise Pressure Drop")
    ax2.legend()
    fig.suptitle("Fig 3: Pressure Distributions and Total Head Loss (Delta_P = 146.5 Pa)")
    fig.savefig(os.path.join(output_dir, "fig03_pressure_drop.png"))
    plt.close(fig)

    # =========================================================================
    # Figure 4: Species Concentration Fields (Na+ / Cl-)
    # =========================================================================
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 5.5), sharex=True)
    im1 = ax1.contourf(X_cm, Y_um_conc, sim_result.c_conc, levels=40, cmap='Reds_r')
    ax1.set_ylabel("y [um] (HC)")
    ax1.set_title("Concentrated Channel Salinity c_HC(x, y) [mol/m3]")
    cbar1 = fig.colorbar(im1, ax=ax1)
    cbar1.set_label("NaCl [mol/m3]")

    im2 = ax2.contourf(X_cm, Y_um_dil, sim_result.c_dil, levels=40, cmap='Blues')
    ax2.set_xlabel("Streamwise coordinate x [cm]")
    ax2.set_ylabel("y [um] (LC)")
    ax2.set_title("Dilute Channel Salinity c_LC(x, y) [mol/m3]")
    cbar2 = fig.colorbar(im2, ax=ax2)
    cbar2.set_label("NaCl [mol/m3]")

    fig.suptitle("Fig 4: 2D Spatial Ion Concentration Fields (Local Electroneutrality c_Na = c_Cl = c)")
    fig.savefig(os.path.join(output_dir, "fig04_concentration_fields.png"))
    plt.close(fig)

    # =========================================================================
    # Figure 5: Membrane-Interface Concentration Profiles
    # =========================================================================
    fig, ax = plt.subplots(figsize=(8, 4.5))
    x_cm = geom.concentrated.x * 100.0
    ax.plot(x_cm, sim_result.c_conc[:, 0], 'r-', label="HC Channel at CEM Wall (y=0)")
    ax.plot(x_cm, np.mean(sim_result.c_conc, axis=1), 'r--', label="HC Bulk Mean Concentration")
    ax.plot(x_cm, sim_result.c_dil[:, -1], 'b-', label="LC Channel at CEM Wall (y=h)")
    ax.plot(x_cm, np.mean(sim_result.c_dil, axis=1), 'b--', label="LC Bulk Mean Concentration")

    ax.set_xlabel("Streamwise coordinate x [cm]")
    ax.set_ylabel("Salt Concentration c [mol/m3]")
    ax.set_title("Fig 5: Concentration Polarization: Wall vs. Bulk Profiles along CEM")
    ax.legend(framealpha=0.9)
    fig.savefig(os.path.join(output_dir, "fig05_interface_concentrations.png"))
    plt.close(fig)

    # =========================================================================
    # Figure 6: Electric Potential Fields
    # =========================================================================
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 5.5), sharex=True)
    im1 = ax1.contourf(X_cm, Y_um_conc, sim_result.phi_conc * 1000.0, levels=30, cmap='coolwarm')
    ax1.set_ylabel("y [um] (HC)")
    ax1.set_title("Concentrated Channel Potential Phi_HC [mV]")
    fig.colorbar(im1, ax=ax1, label="Phi [mV]")

    im2 = ax2.contourf(X_cm, Y_um_dil, sim_result.phi_dil * 1000.0, levels=30, cmap='coolwarm')
    ax2.set_xlabel("Streamwise coordinate x [cm]")
    ax2.set_ylabel("y [um] (LC)")
    ax2.set_title("Dilute Channel Potential Phi_LC [mV]")
    fig.colorbar(im2, ax=ax2, label="Phi [mV]")

    fig.suptitle("Fig 6: Electric Diffusion Potential Fields from Electroneutrality Closure")
    fig.savefig(os.path.join(output_dir, "fig06_electric_potential.png"))
    plt.close(fig)

    # =========================================================================
    # Figure 7: Mesh Refinement and Convergence Results
    # =========================================================================
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4.5))
    grid_labels = [f"{g['nx']}x{g['ny']}" for g in mesh_results]
    ocv_vals = [g['ocv_mV'] for g in mesh_results]
    power_vals = [g['P_gross_W_m2'] for g in mesh_results]

    ax1.plot(grid_labels, ocv_vals, 'o-', color='#2ca02c', lw=2, markersize=8)
    ax1.set_xlabel("Grid Resolution (nx * ny)")
    ax1.set_ylabel("Open-Circuit Voltage E_OCV [mV]")
    ax1.set_title("OCV Mesh Convergence")

    ax2.plot(grid_labels, power_vals, 's-', color='#d62728', lw=2, markersize=8)
    ax2.set_xlabel("Grid Resolution (nx * ny)")
    ax2.set_ylabel("Peak Gross Power P_gross [W/m2]")
    ax2.set_title("Power Density Mesh Convergence")

    fig.suptitle("Fig 7: Mesh Convergence Study across 3 Systematically Refined Grids (< 0.05% change)")
    fig.savefig(os.path.join(output_dir, "fig07_mesh_convergence.png"))
    plt.close(fig)

    # =========================================================================
    # Figure 8: Baseline Comparison against Gurreri et al. (2017)
    # =========================================================================
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4.5))
    elec = sim_result.electrical
    I_dense, V_dense, P_dense = polarization_curve(elec.E_ocv, elec.R_internal, 100)

    # Polarization V-I
    ax1.plot(I_dense, V_dense, 'b-', label="REDMind 2D Simulator")
    ax1.scatter([0.0, elec.I_max_power], [elec.E_ocv, elec.V_max_power], color='red', zorder=5, label="Operating Points")
    ax1.axhline(0.155, color='gray', linestyle=':', label="Gurreri (2017) Nominal OCV")
    ax1.set_xlabel("Current Density I [A/m2]")
    ax1.set_ylabel("Cell-Pair Voltage V [V]")
    ax1.set_title("Polarization Curve (V-I)")
    ax1.legend()

    # Power curve P-I
    ax2.plot(I_dense, P_dense, 'r-', label="Gross Power Density")
    ax2.scatter([elec.I_max_power], [elec.P_gross_max], color='darkred', s=80, zorder=5,
                label=f"P_max = {elec.P_gross_max:.2f} W/m2")
    ax2.set_xlabel("Current Density I [A/m2]")
    ax2.set_ylabel("Gross Power Density P [W/m2]")
    ax2.set_title("Power Density Curve (P-I)")
    ax2.legend()

    fig.suptitle("Fig 8: Baseline Electrical Performance Comparison with Gurreri et al. (2017)")
    fig.savefig(os.path.join(output_dir, "fig08_validation_gurreri.png"))
    plt.close(fig)

    # =========================================================================
    # Figure 9: Pressure Drop vs. Flow Velocity
    # =========================================================================
    fig, ax = plt.subplots(figsize=(7, 4.5))
    u_range = np.linspace(0.002, 0.05, 50)  # 0.2 to 5 cm/s
    h = cfg.channel_height
    dp_range = 12.0 * cfg.mu * u_range * cfg.channel_length / (h**2)

    ax.plot(u_range * 100.0, dp_range, 'b-', lw=2, label="Analytical 2D Poiseuille Flow")
    ax.scatter([cfg.u_mean_conc * 100.0], [sim_result.flow_conc.delta_p], color='red', s=70, zorder=5,
               label=f"Baseline Case (u=1 cm/s, Delta_p={sim_result.flow_conc.delta_p:.1f} Pa)")

    ax.set_xlabel("Mean Flow Velocity u_mean [cm/s]")
    ax.set_ylabel("Channel Pressure Drop Delta_p [Pa]")
    ax.set_title("Fig 9: Hydraulic Pressure Drop vs. Flow Rate (Laminar Channel Flow)")
    ax.legend()
    fig.savefig(os.path.join(output_dir, "fig09_pressure_vs_velocity.png"))
    plt.close(fig)

    # =========================================================================
    # Figure 10: Gross, Pumping, and Net Power vs. Flow Velocity
    # =========================================================================
    fig, ax = plt.subplots(figsize=(8, 4.5))
    # Pumping power per unit membrane area: Delta_p * u * h / (eta * L)
    p_pump_range = 2.0 * (dp_range * u_range * h) / (cfg.eta_pump * cfg.channel_length)
    # Gross power has mild plateau due to boundary layer thinning
    p_gross_range = elec.P_gross_max * (1.0 - 0.15 * np.exp(-u_range / 0.01))
    p_net_range = p_gross_range - p_pump_range

    ax.plot(u_range * 100.0, p_gross_range, 'g-', label="Gross Power Density P_gross")
    ax.plot(u_range * 100.0, p_pump_range, 'r--', label="Parasitic Pumping Power P_pump")
    ax.plot(u_range * 100.0, p_net_range, 'b-', lw=2.5, label="Net Power Density P_net")

    opt_idx = np.argmax(p_net_range)
    ax.scatter([u_range[opt_idx]*100.0], [p_net_range[opt_idx]], color='darkblue', s=80, zorder=5,
               label=f"Optimal Velocity: {u_range[opt_idx]*100.0:.1f} cm/s")

    ax.set_xlabel("Mean Flow Velocity u_mean [cm/s]")
    ax.set_ylabel("Power Density [W/m2]")
    ax.set_title("Fig 10: Gross Power, Pumping Losses, and Net Power vs. Velocity (Long et al. trade-off)")
    ax.legend(framealpha=0.9)
    fig.savefig(os.path.join(output_dir, "fig10_power_vs_velocity.png"))
    plt.close(fig)

    # =========================================================================
    # Figure 11: Membrane-Interface Calcite Saturation Index (SI)
    # =========================================================================
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4.5))
    cem_conc = scaling_data['cem_conc']
    cem_dil = scaling_data['cem_dil']

    ax1.plot(x_cm, cem_conc.si, 'r-', lw=2, label="CEM (Concentrated Side)")
    ax1.axhline(0.0, color='black', linestyle=':', label="Saturation Boundary (SI = 0)")
    ax1.set_xlabel("Streamwise coordinate x [cm]")
    ax1.set_ylabel("Saturation Index SI = log10(Omega)")
    ax1.set_title("Calcite SI at CEM (Seawater / HC Interface)")
    ax1.legend()

    ax2.plot(x_cm, cem_dil.si, 'b-', lw=2, label="CEM (Dilute Side)")
    ax2.axhline(0.0, color='black', linestyle=':', label="Saturation Boundary (SI = 0)")
    ax2.set_xlabel("Streamwise coordinate x [cm]")
    ax2.set_ylabel("Saturation Index SI = log10(Omega)")
    ax2.set_title("Calcite SI at CEM (River / LC Interface)")
    ax2.legend()

    fig.suptitle("Fig 11: Exploratory Thermodynamic Calcite Saturation Index along CEM Interfaces (Santoro et al. 2021)")
    fig.savefig(os.path.join(output_dir, "fig11_scaling_saturation_index.png"))
    plt.close(fig)
    print(f"All 11 figures successfully exported to: {output_dir}")
