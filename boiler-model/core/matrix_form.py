import numpy as np
from core import coefficients as coef
from physics import void_fraction as void
from physics import thermo_relations as thermo
from config import constants as const

def solve_system(P, V_dw, phi, m_w, Q_fluid, valve_opening):
    """
    Solve for dX/dt and algebraic variables.
    Returns: [dP/dt, dV_dw/dt, dphi/dt, m_g]

    Uses row-scaling to reduce the condition number of C from O(10^14) to O(10^6).
    The extreme density ratio rho_w/rho_s ≈ 1600 causes large scale differences
    between mass equations; row-scaling normalizes each equation by its largest
    coefficient, preserving the solution while improving numerical precision.
    """
    # Calculate C and D
    C = coef.calculate_matrix_C(P, V_dw, phi)
    D = coef.calculate_vector_D(P, V_dw, phi, m_w, Q_fluid, valve_opening)
    
    # Row-scaling: normalize each row by its largest absolute element
    for i in range(C.shape[0]):
        scale = np.max(np.abs(C[i, :]))
        if scale > 1e-30:  # Guard against zero rows
            C[i, :] /= scale
            D[i] /= scale
    
    # Solve C * X = D
    try:
        X = np.linalg.solve(C, D)
    except np.linalg.LinAlgError:
        # Handle singular matrix (e.g., at boundaries)
        X = np.zeros(4)
        
    return X

def calculate_drum_level(V_dw, phi, P):
    """
    Predict apparent water level (m) including swell effect.

    Physics:
      V_dw is the total mixture volume (liquid + bubbles).
      Therefore, the apparent level is simply the mixture volume divided by the cross-sectional area.
      L_apparent = V_dw / A_D

    The swell effect is natively included in V_dw because the ODE system dynamically expands V_dw
    as steam bubbles (phi) are generated within the liquid column.
    """
    L_apparent = V_dw / const.A_D
    # Clamp to drum height
    return min(L_apparent, const.H_DRUM)

def calculate_temperature(P):
    """
    Predict Temperature (T) in Celsius.
    T is a saturation temperature function of P.
    """
    T_K = thermo.get_T_sat(P)
    return T_K - 273.15
