import numpy as np
from physics import thermo_relations as thermo

def get_void_fraction(phi, P):
    """
    Calculate average void fraction alpha_r based on quality phi and pressure P.
    Uses the analytical solution for linear quality distribution.
    """
    if phi < 1e-8:
        rho_w = thermo.get_rho_w(P)
        rho_s = thermo.get_rho_s(P)
        return phi * rho_w / (2.0 * rho_s)
    
    rho_w = thermo.get_rho_w(P)
    rho_s = thermo.get_rho_s(P)
    gamma = (rho_w - rho_s) / rho_s
    x = phi * gamma
    
    alpha_r = (rho_w / (rho_w - rho_s)) * (1.0 - np.log(1.0 + x) / x)
    return alpha_r

def get_d_alpha_d_phi(phi, P):
    """
    Partial derivative of void fraction with respect to quality phi.
    """
    rho_w = thermo.get_rho_w(P)
    rho_s = thermo.get_rho_s(P)
    gamma = (rho_w - rho_s) / rho_s
    
    if phi < 1e-8:
        return rho_w / (2.0 * rho_s)
        
    x = phi * gamma
    # f(x) = 1 - ln(1+x)/x
    # df/dx = ln(1+x)/x^2 - 1/(x(1+x))
    df_dx = np.log(1.0 + x) / (x**2) - 1.0 / (x * (1.0 + x))
    
    # d_alpha/d_phi = (rho_w / (rho_w - rho_s)) * df_dx * (dx/d_phi)
    # dx/d_phi = gamma
    return (rho_w / (rho_w - rho_s)) * df_dx * gamma

def get_d_alpha_d_P(phi, P):
    """
    Partial derivative of void fraction with respect to pressure P.
    Calculated numerically for robustness due to complex coupling via densities.
    """
    dP = 100.0 # 100 Pa perturbation
    a1 = get_void_fraction(phi, P - dP)
    a2 = get_void_fraction(phi, P + dP)
    return (a2 - a1) / (2.0 * dP)
