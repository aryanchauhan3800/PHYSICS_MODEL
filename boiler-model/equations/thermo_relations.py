import numpy as np
from iapws import IAPWS97

# ============================================================
# Thermodynamic Property Functions using IAPWS-IF97 Steam Tables
# Valid Range: 1 bar to 200 bar
# Units: P in Pa, T in K, rho in kg/m^3, h in J/kg
# ============================================================

# Small perturbation for numerical derivatives (Pa)
_dP = 500.0  # 500 Pa perturbation for central difference

def _sat_liquid(P):
    """Get saturated liquid properties at pressure P (Pa)."""
    P_MPa = P / 1e6
    return IAPWS97(P=P_MPa, x=0)

def _sat_vapor(P):
    """Get saturated vapor properties at pressure P (Pa)."""
    P_MPa = P / 1e6
    return IAPWS97(P=P_MPa, x=1)


# --- Saturation Temperature ---

def get_T_sat(P):
    """Saturation temperature (K) at pressure P (Pa)."""
    s = _sat_liquid(P)
    return s.T  # Already in K

def get_dT_sat_dP(P):
    """dT_sat/dP via central difference."""
    T1 = get_T_sat(P - _dP)
    T2 = get_T_sat(P + _dP)
    return (T2 - T1) / (2.0 * _dP)


# --- Liquid Density ---

def get_rho_w(P):
    """Saturated liquid density (kg/m^3) at pressure P (Pa)."""
    s = _sat_liquid(P)
    return s.rho

def get_drho_w_dP(P):
    """d(rho_w)/dP via central difference."""
    r1 = get_rho_w(P - _dP)
    r2 = get_rho_w(P + _dP)
    return (r2 - r1) / (2.0 * _dP)


# --- Steam Density ---

def get_rho_s(P):
    """Saturated steam density (kg/m^3) at pressure P (Pa)."""
    s = _sat_vapor(P)
    return s.rho

def get_drho_s_dP(P):
    """d(rho_s)/dP via central difference."""
    r1 = get_rho_s(P - _dP)
    r2 = get_rho_s(P + _dP)
    return (r2 - r1) / (2.0 * _dP)


# --- Liquid Enthalpy ---

def get_h_w(P):
    """Saturated liquid enthalpy (J/kg) at pressure P (Pa)."""
    s = _sat_liquid(P)
    return s.h * 1000.0  # iapws returns kJ/kg, convert to J/kg

def get_dh_w_dP(P):
    """d(h_w)/dP via central difference."""
    h1 = get_h_w(P - _dP)
    h2 = get_h_w(P + _dP)
    return (h2 - h1) / (2.0 * _dP)


# --- Steam Enthalpy ---

def get_h_s(P):
    """Saturated steam enthalpy (J/kg) at pressure P (Pa)."""
    s = _sat_vapor(P)
    return s.h * 1000.0  # iapws returns kJ/kg, convert to J/kg

def get_dh_s_dP(P):
    """d(h_s)/dP via central difference."""
    h1 = get_h_s(P - _dP)
    h2 = get_h_s(P + _dP)
    return (h2 - h1) / (2.0 * _dP)


# --- Internal Energy ---

def get_u_w(P):
    """Saturated liquid specific internal energy (J/kg)."""
    rho = get_rho_w(P)
    h = get_h_w(P)
    return h - P / rho

def get_u_s(P):
    """Saturated steam specific internal energy (J/kg)."""
    rho = get_rho_s(P)
    h = get_h_s(P)
    return h - P / rho

def get_d_rho_u_w_dP(P):
    """d(rho_w * u_w)/dP = d(rho_w * h_w - P)/dP = rho*dh/dP + h*drho/dP - 1"""
    rho = get_rho_w(P)
    h = get_h_w(P)
    drho = get_drho_w_dP(P)
    dh = get_dh_w_dP(P)
    return rho * dh + h * drho - 1.0

def get_d_rho_u_s_dP(P):
    """d(rho_s * u_s)/dP = rho*dh/dP + h*drho/dP - 1"""
    rho = get_rho_s(P)
    h = get_h_s(P)
    drho = get_drho_s_dP(P)
    dh = get_dh_s_dP(P)
    return rho * dh + h * drho - 1.0
