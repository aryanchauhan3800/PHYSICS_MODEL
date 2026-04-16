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
    Predict Water Level (L) in meters.
    Water level: L = Vdw / A
    """
    L = V_dw / const.A_D
    return L

def calculate_temperature(P):
    """
    Predict Temperature (T) in Celsius.
    T is a saturation temperature function of P.
    """
    T_K = thermo.get_T_sat(P)
    return T_K - 273.15
