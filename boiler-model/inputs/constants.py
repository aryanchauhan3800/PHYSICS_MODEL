# ═══════════════════════════════════════════════════════════════════
# Physical Constants — Real Boiler Hardware Dimensions
# ═══════════════════════════════════════════════════════════════════
import math

# ── Boiler Cylinder Geometry ──
D_DRUM  = 0.18         # Drum diameter  (18 cm — measured)
H_DRUM  = 0.24         # Drum height    (24 cm — measured)
A_D     = math.pi / 4.0 * D_DRUM**2   # Cross-section area  ≈ 0.02545 m²

# ── Water Level Reference (Float Switch Calibration) ──
H_WATER_MAX = 0.165    # Water level at float_high (16.5 cm → 4.2 L)
H_STEAM     = 0.075    # Steam space above water  (7.5 cm → 1.9 L)

# ── Volumes (m³) ──
V_T     = A_D * H_DRUM               # Total internal volume ≈ 0.00611 m³ (~6.1 L)
V_WATER_INIT = A_D * H_WATER_MAX    # Water volume at float_high ≈ 0.00420 m³ (~4.2 L)
V_R     = 0.003                       # Riser tubes (model parameter)
V_DC    = 0.001                       # Downcomer tubes (model parameter)

# ── Inlet / Outlet Pipes ──
D_INLET  = 0.0127      # Water inlet diameter   (1.27 cm = ½ inch)
D_PIPE   = 0.0127      # Steam outlet diameter  (1.27 cm = ½ inch)
A_INLET  = math.pi / 4.0 * D_INLET**2   # Inlet area  ≈ 1.267e-4 m²
A_OUTLET = math.pi / 4.0 * D_PIPE**2    # Outlet area ≈ 1.267e-4 m²

# ── Metal Properties ──
M_M     = 1.5           # Mass of boiler metal (kg) — steel vessel (measured)
C_M     = 480.0         # Specific heat capacity of steel (J/(kg·K))

# ── Flow Parameters ──
M_DC    = 0.5           # Circulation flow rate through the loop (kg/s)

# ── Steam Outlet Orifice Parameters ──
C_D_VALVE    = 0.65     # Discharge coefficient
P_DOWNSTREAM = 1.013e5  # Downstream pressure (Pa) — 1 atm

# ── Operational Parameters ──
A_HEATER  = 0.01        # Heater surface area (m²) — assumed for 1kW immersion
P_NOMINAL = 2.0e5       # Nominal operating pressure (2 bar)
T_FEED    = 25.0        # Feed water temperature (°C)
