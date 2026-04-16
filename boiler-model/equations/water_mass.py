"""
Water Mass Conservation Equation

Formulates the mass conservation for the liquid water phase in the drum/risers.

Starting point:
Accumulation = Inflow - Evaporation
d(M_liquid)/dt = W_fw - W_ev

Where M_liquid is expressed as:
M_liquid = rho_f * V_dw * (1 - phi)

Differentiating using the product rule:
d[rho_f * V_dw * (1 - phi)]/dt = W_fw - W_ev

Applying product rule (with rho_f dependent on Pressure P):
V_dw * (1 - phi) * d(rho_f)/dP * dP/dt  
+ rho_f * (1 - phi) * dV_dw/dt  
- rho_f * V_dw * dphi/dt  
= W_fw - W_ev
"""

def get_water_mass_coefficients(V_dw, phi, rho_f, drhof_dp):
    """
    Returns the coefficients for the C matrix corresponding to the
    water mass conservation equation and the RHS D matrix value.

    The state vector formulation is assumed to be: X = [dP/dt, dV_dw/dt, dphi/dt, m_g]^T

    Accumulation = d(rho_f * V_dw * (1 - phi)) / dt
                 = V_dw * (1 - phi) * (drho_f_dP * dP/dt) + rho_f * (1 - phi) * dV_dw/dt - rho_f * V_dw * dphi/dt
    
    Accumulation = Inflow (m_w) - Evaporation (m_g)
    
    Rearranging for CX = D:
    (V_dw * (1 - phi) * drho_f_dP)*dP/dt + (rho_f * (1 - phi))*dV_dw/dt + (-rho_f * V_dw)*dphi/dt + (1.0)*m_g = m_w

    Args:
        V_dw (float): Volume of water/steam mixture below water level.
        phi (float): Void fraction in the below water level volume.
        rho_f (float): Saturated liquid water density.
        drhof_dp (float): Partial derivative of liquid density w.r.t pressure.

    Returns:
        tuple: (list of C coefficients [C11, C12, C13, C14], D coefficient)
            - C_coeffs: List of 4 floats for the C matrix row.
    """
    
    # C11: Coefficient for dP/dt
    C11 = V_dw * (1 - phi) * drhof_dp
    
    # C12: Coefficient for dV_dw/dt
    C12 = rho_f * (1 - phi)
    
    # C13: Coefficient for dphi/dt
    C13 = -rho_f * V_dw
    
    # C14: Coefficient for m_g
    C14 = 1.0

    C_coeffs = [C11, C12, C13, C14]
    
    return C_coeffs
