"""
Steam Mass Conservation Equation (Below Water Level)

Formulates the mass conservation for the steam phase in the water region,
i.e., the steam bubbles present below the water level.

Starting point:
Accumulation = Generation - Transfer
d(M_steam)/dt = m_g - transfer

Where M_steam is expressed as:
M_steam = rho_g * V_dw * phi

Differentiating using the product rule:
d[rho_g * V_dw * phi]/dt = m_g - transfer

Applying product rule (with rho_g dependent on Pressure P):
V_dw * phi * (d(rho_g)/dP) * dP/dt
+ rho_g * phi * dV_dw/dt
+ rho_g * V_dw * dphi/dt
= m_g - transfer
"""

def get_steam_below_coefficients(V_dw, phi, rho_g, drho_g_dp):
    """
    Returns the coefficients for the C matrix corresponding to the
    steam mass conservation equation (below water level) and the RHS value.

    The state vector formulation is assumed to be: X = [dP/dt, dV_dw/dt, dphi/dt, m_g]^T

    Accumulation = d(rho_g * V_dw * phi) / dt
                 = V_dw * phi * drho_g_dp * dP/dt + rho_g * phi * dV_dw/dt + rho_g * V_dw * dphi/dt
    
    Accumulation = Generation (m_g) - Transfer (m_t)
    Accumulation - Generation = - Transfer
    
    Rearranging for CX = D:
    (V_dw * phi * drho_g_dp)*dP/dt + (rho_g * phi)*dV_dw/dt + (rho_g * V_dw)*dphi/dt + (-1.0)*m_g = -transfer

    Args:
        V_dw (float): Volume of water/steam mixture below water level.
        phi (float): Void fraction in the below water level volume.
        rho_g (float): Saturated steam density.
        drho_g_dp (float): Partial derivative of steam density w.r.t pressure.

    Returns:
        tuple: (list of C coefficients [C11, C12, C13, C14], D coefficient)
            - C_coeffs: List of 4 floats for the C matrix row.
    """
    
    # C1: Coefficient for dP/dt
    C1 = V_dw * phi * drho_g_dp
    
    # C2: Coefficient for dV_dw/dt
    C2 = rho_g * phi
    
    # C3: Coefficient for dphi/dt
    C3 = rho_g * V_dw
    
    # C4: Coefficient for m_g (generation)
    C4 = -1.0

    C_coeffs = [C1, C2, C3, C4]
    
    return C_coeffs
