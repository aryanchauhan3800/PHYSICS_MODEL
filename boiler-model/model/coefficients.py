import numpy as np
from equations import thermo_relations as thermo
from equations import void_fraction as void
from equations import water_mass
from equations import steam_below
from equations import steam_above
from equations import energy
from inputs import constants as const

def calculate_matrix_C(P, V_dw, phi):
    """
    Calculate the 4x4 matrix C for the system CX = D.
    X = [dP/dt, dV_dw/dt, dphi/dt, m_g]^T
    """
    # Thermo properties
    rho_w = thermo.get_rho_w(P)
    rho_s = thermo.get_rho_s(P)
    drho_w_dP = thermo.get_drho_w_dP(P)
    drho_s_dP = thermo.get_drho_s_dP(P)
    
    h_w = thermo.get_h_w(P)
    h_s = thermo.get_h_s(P)
    u_w = thermo.get_u_w(P)
    u_s = thermo.get_u_s(P)
    
    d_rho_u_w_dP = thermo.get_d_rho_u_w_dP(P)
    d_rho_u_s_dP = thermo.get_d_rho_u_s_dP(P)
    dT_s_dP = thermo.get_dT_sat_dP(P)
    
    dh_w_dP = thermo.get_dh_w_dP(P)
    dh_s_dP = thermo.get_dh_s_dP(P)
    
    # Void fraction properties
    alpha_r = void.get_void_fraction(phi, P)
    da_dphi = void.get_d_alpha_d_phi(phi, P)
    da_dP = void.get_d_alpha_d_P(phi, P)
    
    C = np.zeros((4, 4))
    
    # Row 1: Liquid Mass Balance
    C[0, :] = water_mass.get_water_mass_coefficients(V_dw, phi, rho_w, drho_w_dP)
    
    # Row 2: Steam Mass Balance (below water level)
    C[1, :] = steam_below.get_steam_below_coefficients(V_dw, phi, rho_s, drho_s_dP)
    
    # Row 3: Total Energy Balance (including metal thermal mass)
    C[2, :] = energy.get_energy_coefficients(
        V_dw, phi, rho_w, rho_s, h_w, h_s, 
        drho_w_dP, drho_s_dP, dh_w_dP, dh_s_dP,
        M_M=const.M_M, C_M=const.C_M, dTsat_dP=dT_s_dP
    )
    
    # Row 4: Steam Mass Balance (above water level)
    C[3, :] = steam_above.get_steam_above_coefficients(const.V_T, V_dw, rho_s, drho_s_dP)
    
    return C

def calculate_vector_D(P, V_dw, phi, m_w, Q, valve_opening):
    """
    Calculate the 4x1 vector D for the system CX = D.
    Inputs:
    - m_w: inlet water flow (kg/s)
    - Q: heat input (W)
    - valve_opening: scale for steam exit flow
    """
    # Calculate steam exit flow m_s using orifice equation
    # m_s = C_d * A * sqrt(2 * rho_s * (P - P_downstream))
    A_orifice = np.pi / 4.0 * const.D_PIPE**2
    rho_s = thermo.get_rho_s(P)
    delta_P = max(P - const.P_DOWNSTREAM, 0.0)  # Prevent negative sqrt
    m_s = const.C_D_VALVE * A_orifice * valve_opening * np.sqrt(2.0 * rho_s * delta_P)
    
    # Feed water enthalpy (assuming constant T_feed for now)
    # Actually, we should use a proper function for subcooled water if needed,
    # but for simplicity, use h_w at T_feed.
    h_feed = 4186.0 * (const.T_FEED) # Approx J/kg
    
    h_s = thermo.get_h_s(P)
    
    D = np.zeros(4)
    
    # Inter-region steam transfer (m_i for dome, output from below)
    # New mechanistic bubble rise velocity formula:
    # mi = A_drum * phi * rho_s * v_rise
    # v_rise = 1.41 * ( (sigma * g * (rho_w - rho_s)) / rho_w^2 )^0.25
    g = 9.81
    sigma = thermo.get_sigma(P)
    rho_w = thermo.get_rho_w(P)
    A_drum = np.pi / 4.0 * const.D_DRUM**2
    
    v_rise = 1.41 * ( (sigma * g * (rho_w - rho_s)) / (rho_w**2) )**0.25
    transfer = A_drum * phi * rho_s * v_rise
    
    # D1: Liquid Mass Balance
    D[0] = m_w
    
    # D2: Steam Mass Balance (below water level) - Transfer term
    D[1] = - transfer
    
    # D3: Energy Balance
    D[2] = Q + m_w * h_feed - m_s * h_s
    
    # D4: Steam Mass Balance (above water level)
    # Includes m_s outflow here natively.
    D[3] = transfer - m_s
    
    return D
