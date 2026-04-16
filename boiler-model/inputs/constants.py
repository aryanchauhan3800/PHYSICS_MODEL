# Physical Constants for the Boiler Model (Tabletop Scale Calibration)

# Volumes (m^3)
V_T = 0.005         # Total volume of the boiler system (5 Liters)
V_R = 0.003         # Volume of the riser tubes
V_DC = 0.001        # Volume of the downcomer tubes
A_D = 0.02          # Area of the drum at water level (m^2)

# Metal Properties
M_M = 5.0           # Mass of metal part of the boiler (kg) - Scaled to hobby size
C_M = 480.0         # Specific heat capacity of steel (J/kg K)

# Flow Parameters
M_DC = 0.5          # Circulation flow rate through the loop (kg/s) - Scaled

# Steam Outlet Orifice Parameters
C_D_VALVE = 0.65     # Discharge coefficient
D_PIPE = 0.010       # Steam outlet pipe diameter (10 mm)
P_DOWNSTREAM = 1.013e5 # Downstream pressure (Pa) — 1 atm

# Operational Parameters
P_NOMINAL = 2.0e5    # Nominal operating pressure (2 bar)
T_FEED = 25.0        # Feed water temperature (Celsius)
