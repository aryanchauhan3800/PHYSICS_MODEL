"""
Energy Conservation Equation (First Law)

Formulates the global energy conservation for the entire boiler volume,
using pure internal energy (u) instead of enthalpy (h), satisfying the First Law 
of Thermodynamics for a constant-volume system.

U_total = U_liquid + U_steam_below + U_steam_dome
U_total = (rho_w * u_w) * V_dw * (1 - phi) + 
          (rho_s * u_s) * V_dw * phi + 
          (rho_s * u_s) * (V_T - V_dw)

Differentiating U_total via product rule:
dU/dt = C1 * dP/dt + C2 * dV_dw/dt + C3 * dphi/dt
"""

def get_energy_coefficients(V_dw, phi, rho_w, rho_s, u_w, u_s, 
                            d_rho_u_w_dP, d_rho_u_s_dP, V_T):
    """
    Returns the coefficients for the C matrix corresponding to the
    global energy conservation equation (water region + steam dome).

    The state vector formulation is assumed to be: X = [dP/dt, dV_dw/dt, dphi/dt, m_g]^T

    Args:
        V_dw (float): Volume of water/steam mixture below water level.
        phi (float): Void fraction in the below water level volume.
        rho_w (float): Saturated liquid density.
        rho_s (float): Saturated steam density.
        u_w (float): Saturated liquid internal energy.
        u_s (float): Saturated steam internal energy.
        d_rho_u_w_dP (float): Partial derivative of (rho_w * u_w) w.r.t pressure.
        d_rho_u_s_dP (float): Partial derivative of (rho_s * u_s) w.r.t pressure.
        V_T (float): Total internal volume of the boiler (drum).

    Returns:
        tuple: (list of C coefficients [C1, C2, C3, C4])
            - C_coeffs: List of 4 floats for the C matrix row.
    """
    
    # C1: Coefficient for dP/dt
    # Includes thermal inertia of water, sub-surface steam, and the entire steam dome
    C1 = (V_dw * (1.0 - phi) * d_rho_u_w_dP) + ((V_T - V_dw * (1.0 - phi)) * d_rho_u_s_dP)
    
    # C2: Coefficient for dV_dw/dt
    C2 = (1.0 - phi) * (rho_w * u_w - rho_s * u_s)
    
    # C3: Coefficient for dphi/dt
    C3 = -V_dw * (rho_w * u_w - rho_s * u_s)
    
    # C4: Coefficient for m_g (generation)
    # The generation of steam is purely internal mass transfer; it does not change the global U
    C4 = 0.0

    C_coeffs = [C1, C2, C3, C4]
    
    return C_coeffs
