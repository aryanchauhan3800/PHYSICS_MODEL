import numpy as np
from model import coefficients as coef
from equations import void_fraction as void
from equations import thermo_relations as thermo
from inputs import constants as const

def solve_system(P, V_dw, phi, m_w, Q, valve_opening):
    """
    Solve for dX/dt and algebraic variables.
    Returns: [dP/dt, dV_dw/dt, dphi/dt, m_g]
    """
    # Calculate C and D
    C = coef.calculate_matrix_C(P, V_dw, phi)
    D = coef.calculate_vector_D(P, V_dw, phi, m_w, Q, valve_opening)
    
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
      L_liquid  = V_dw / A_D          — level from liquid volume alone
      L_apparent = L_liquid / (1 - φ)  — swell from steam bubbles in the
                                         liquid column (void fraction φ)

    The swell effect is critical: even a 5% void fraction raises the
    apparent level by ~5%, which in a 16.5 cm water column is ~0.8 cm.
    At φ=20% the level rises by ~4 cm — eating into the 7.5 cm steam space.
    """
    L_liquid = V_dw / const.A_D
    phi_safe = max(0.0, min(phi, 0.95))  # clamp to prevent division by zero
    L_apparent = L_liquid / (1.0 - phi_safe)
    # Clamp to drum height
    return min(L_apparent, const.H_DRUM)

def calculate_temperature(P):
    """
    Predict Temperature (T) in Celsius.
    T is a saturation temperature function of P.
    """
    T_K = thermo.get_T_sat(P)
    return T_K - 273.15
