"""
Energy Conservation Equation (First Law)

Formulates the energy conservation for the water region, using the
user-defined definition of energy:
U = h_f * rho_f * V_dw * (1 - phi) + h_g * rho_g * V_dw * phi

Starting point:
dU/dt + dU_metal/dt = Energy in - Energy out + heat input

Where:
dU_metal/dt = M_M * C_M * dT_sat/dt = M_M * C_M * (dT_sat/dP) * (dP/dt)

This metal thermal mass term adds to the coefficient of dP/dt in the C matrix,
representing the energy stored/released by the 150 tonnes of steel drum.

Differentiating U using the product rule:
Since h_f, rho_f, h_g, rho_g are functions of P, and V_dw, phi are functions of t:

d(h_f*rho_f)/dP = rho_f * dh_f/dP + h_f * drho_f/dP
d(h_g*rho_g)/dP = rho_g * dh_g/dP + h_g * drho_g/dP

dU/dt = [ (rho_f * dh_f_dP + h_f * drho_f_dP) * V_dw * (1 - phi) + 
          (rho_g * dh_g_dP + h_g * drho_g_dP) * V_dw * phi ] * dP/dt
        + [ h_f * rho_f * (1 - phi) + h_g * rho_g * phi ] * dV_dw/dt
        + [ h_g * rho_g * V_dw - h_f * rho_f * V_dw ] * dphi/dt
"""

def get_energy_coefficients(V_dw, phi, rho_f, rho_g, h_f, h_g, drhof_dp, drhog_dp, dhf_dp, dhg_dp,
                            M_M=0.0, C_M=0.0, dTsat_dP=0.0):
    """
    Returns the coefficients for the C matrix corresponding to the
    energy conservation equation (water region + metal thermal mass).

    The state vector formulation is assumed to be: X = [dP/dt, dV_dw/dt, dphi/dt, m_g]^T

    Args:
        V_dw (float): Volume of water/steam mixture below water level.
        phi (float): Void fraction in the below water level volume.
        rho_f (float): Saturated liquid density.
        rho_g (float): Saturated steam density.
        h_f (float): Saturated liquid enthalpy.
        h_g (float): Saturated steam enthalpy.
        drhof_dp (float): Partial derivative of liquid density w.r.t pressure.
        drhog_dp (float): Partial derivative of steam density w.r.t pressure.
        dhf_dp (float): Partial derivative of liquid enthalpy w.r.t pressure.
        dhg_dp (float): Partial derivative of steam enthalpy w.r.t pressure.
        M_M (float): Mass of boiler metal (kg). Default 0 = no metal mass.
        C_M (float): Specific heat capacity of metal (J/kg·K). Default 0.
        dTsat_dP (float): dT_sat/dP (K/Pa). Default 0.

    Returns:
        tuple: (list of C coefficients [C11, C12, C13, C14])
            - C_coeffs: List of 4 floats for the C matrix row.
    """
    
    # d(rho*h)/dP for liquid and steam
    d_rhoh_f_dP = rho_f * dhf_dp + h_f * drhof_dp
    d_rhoh_g_dP = rho_g * dhg_dp + h_g * drhog_dp
    
    # C1: Coefficient for dP/dt
    # Fluid thermal inertia + Metal thermal inertia
    C1_fluid = (d_rhoh_f_dP * V_dw * (1 - phi)) + (d_rhoh_g_dP * V_dw * phi)
    C1_metal = M_M * C_M * dTsat_dP  # Metal thermal mass contribution
    C1 = C1_fluid + C1_metal
    
    # C2: Coefficient for dV_dw/dt
    C2 = (h_f * rho_f * (1 - phi)) + (h_g * rho_g * phi)
    
    # C3: Coefficient for dphi/dt
    C3 = (h_g * rho_g * V_dw) - (h_f * rho_f * V_dw)
    
    # C4: Coefficient for m_g (generation)
    # The left side dU/dt does not have m_g. 
    C4 = 0.0

    C_coeffs = [C1, C2, C3, C4]
    
    return C_coeffs
