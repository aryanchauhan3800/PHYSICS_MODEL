import numpy as np
from scipy.integrate import solve_ivp
from model import matrix_form as model
from equations import thermo_relations as thermo
from inputs import constants as const

def system_derivatives(t, y, m_w, Q, valve_opening):
    """
    State wrapper for scipy integrate.
    y = [P, Vdw, phi]
    """
    P, V_dw, phi = y
    
    # Boundary clamps to prevent solver from evaluating unphysical states
    # which could domain error in square roots or steam tables computation
    P_safe = max(P, 1.0)
    V_dw_safe = max(V_dw, 0.0)
    phi_safe = max(0.0, min(1.0, phi))
    
    # Calculate derivatives [dP_dt, dVdw_dt, dphi_dt, mg]
    X = model.solve_system(P_safe, V_dw_safe, phi_safe, m_w, Q, valve_opening)
    return [X[0], X[1], X[2]]

def calculate_dynamic_temperature(P, V_dw, Q, duration, T_prev):
    """
    Helper to reconcile saturation vs subcooled liquid physics.
    Returns the predicted temperature after 'duration' seconds.
    """
    T_sat = model.calculate_temperature(P)
    
    if T_prev is not None and T_prev < T_sat:
        # P in Pa for thermo lookups
        P_pa = P * 1e5 if P < 100 else P
        rho_w = thermo.get_rho_w(P_pa)
        M_water = rho_w * V_dw
        
        # Effective thermal mass (Water + Metal)
        CP_WATER = 4186.0 
        thermal_mass = (M_water * CP_WATER) + (const.M_M * const.C_M)
        
        if Q > 0:
            dT_rise = (Q * duration) / thermal_mass
            return min(T_prev + dT_rise, T_sat)
        else:
            return T_prev # Stable at current subcooled T
            
    return T_sat

def predict_forward(P_init, Vdw_init, phi_init, m_w, Q, valve_opening, T_init=None, duration=300.0, dt=1.0):
    """
    Build a forward prediction model for a specified duration using Scipy solve_ivp.
    Now includes a subcooled heating model for tabletop scale accuracy.
    """
    y0 = [P_init, Vdw_init, phi_init]
    
    sol = solve_ivp(
        fun=lambda t, y: system_derivatives(t, y, m_w, Q, valve_opening),
        t_span=(0.0, duration),
        y0=y0,
        method='Radau', # Using Radau method for stiff boiler systems
        t_eval=[duration] # Only care about the final state
    )
    
    P_final = max(sol.y[0, -1], 1.0)
    Vdw_final = max(sol.y[1, -1], 0.0)
    phi_final = max(0.0, min(1.0, sol.y[2, -1]))
    
    L_final = model.calculate_drum_level(Vdw_final, phi_final, P_final)
    T_final = calculate_dynamic_temperature(P_final, Vdw_final, Q, duration, T_init)
    
    return P_final, Vdw_final, phi_final, L_final, T_final

def run_continuous(P_init, Vdw_init, phi_init, m_w, Q, valve_opening, T_init=None, dt=1.0):
    """
    Run the boiler physics model in a continuous simulation loop.
    Acts as an infinite generator emitting realtime predictions.
    """
    P = P_init
    V_dw = Vdw_init
    phi = phi_init
    current_T = T_init
    
    current_time = 0.0
    
    while True:
        # Compute outputs
        L = model.calculate_drum_level(V_dw, phi, P)
        T = calculate_dynamic_temperature(P, V_dw, Q, dt, current_T)
        current_T = T # Update state for next step
        
        # Yield the current timestep results
        new_inputs = (yield P, V_dw, phi, L, T)
        if new_inputs is not None:
            # If the user sends T in the tuple, update it (sync with hardware)
            if len(new_inputs) == 4:
                m_w, Q, valve_opening, current_T = new_inputs
            else:
                m_w, Q, valve_opening = new_inputs
        
        # Calculate diagnostics to print (like mg and ms)
        X = model.solve_system(P, V_dw, phi, m_w, Q, valve_opening)
        m_g = X[3]
        A_orifice = np.pi / 4.0 * const.D_PIPE**2
        rho_s = thermo.get_rho_s(P)
        delta_P = max(P - const.P_DOWNSTREAM, 0.0)
        m_s = const.C_D_VALVE * A_orifice * valve_opening * np.sqrt(2.0 * rho_s * delta_P)
        
        print(f"mg (evaporation rate): {m_g:.4f}")
        print(f"ms = Cd*A*sqrt(2*rho*dP): {m_s:.4f}")
        print("\nCompare:")
        if m_s > m_g:
            print("If ms > mg -> pressure must drop\n")
        elif m_s < m_g:
            print("If ms < mg -> pressure must rise\n")
        else:
            print("If ms == mg -> pressure stable\n")
            
        # Stepping forward by dt
        y0 = [P, V_dw, phi]
        
        sol = solve_ivp(
            fun=lambda t, y: system_derivatives(t, y, m_w, Q, valve_opening),
            t_span=(current_time, current_time + dt),
            y0=y0,
            method='Radau',
            t_eval=[current_time + dt]
        )
        
        P = max(sol.y[0, -1], 1.0)
        V_dw = max(sol.y[1, -1], 0.0)
        phi = max(0.0, min(1.0, sol.y[2, -1]))
        
        current_time += dt
