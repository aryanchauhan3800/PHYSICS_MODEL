import serial
import time
import json
import threading
import queue
from http.server import BaseHTTPRequestHandler, HTTPServer
import sys
import os
from pathlib import Path

# Add the boiler-model directory to path so we can import the solver
repo_root = Path(__file__).parent.parent
sys.path.append(str(repo_root / "boiler-model"))
from simulation.solver_logic import predict_forward, predict_timeline, compute_initial_state

SERIAL_PORT = "/dev/tty.usbserial-0001"
BAUD_RATE = 115200

# Shared state memory
latest_data = {
    "mw": 0.0,
    "Q": 0.0,
    "Kv": 0.0,
    "T": 0.0,
    "P": 1.013,
    "pump": 0,
    "ip": "0.0.0.0",
    "mode": "AUTO",
    "float_low": 0,
    "float_high": 0,
    "ready": 0
}
is_connected = False
command_queue = queue.Queue()

# ── Water Volume & Level Tracking from Arduino ──
# Cumulative water mass in the boiler (kg)
water_mass_kg = 1.500
last_flow_time = time.time()

# Explicit Volume Tracking 
# V_new_L = V_old_L + (Flow_in_Lpm - Flow_out_Lpm) * dt_min
current_water_volume_L = 1.500  # 1.5 Liters initial volume

# Heater command intent tracking
# When user clicks "Start Heater", we set this True immediately
heater_cmd_pending = False

# ── Predictive Autopilot State ──
autopilot_state = {
    "mode": "manual",        # manual | auto
    "target_p": 1.5,         # Target Gauge Pressure (bar)
    "status": "idle",        # idle | heating | coasting | stabilizing
    "forecast_p_5min": 0.0
}

def read_serial():
    global is_connected
    print(f"🔌 Opening up physical connection to {SERIAL_PORT}...")
    while True:
        try:
            with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2) as ser:
                print("✅ Serial connected! Listening for incoming telemetry...")
                is_connected = True
                while True:
                    # Check for outgoing commands
                    try:
                        cmd = command_queue.get_nowait()
                        print(f"📤 Sending command to serial: {cmd.strip()}")
                        ser.write(cmd.encode('utf-8'))
                        # Track heater intent immediately
                        global heater_cmd_pending
                        if 'HEATER_ON' in cmd:
                            heater_cmd_pending = True
                            print("🔥 Heater intent flagged — predictions will activate")
                        elif 'HEATER_OFF' in cmd:
                            heater_cmd_pending = False
                    except queue.Empty:
                        pass

                    # Read incoming telemetry (non-blocking-ish with small timeout)
                    ser.timeout = 0.1 
                    line = ser.readline().decode('utf-8', errors='ignore').strip()
                    if not line:
                        continue
                    
                    # IP Auto-Detection from Arduino log
                    if "http://" in line and "/data" in line:
                        try:
                            # Extract IP from http://172.20.10.3/data
                            extracted_ip = line.split("http://")[1].split("/")[0]
                            latest_data["ip"] = extracted_ip
                            print(f"📡 Detected ESP32 Hardware IP: {extracted_ip}")
                        except:
                            pass

                    if "Temp:" in line:
                        try: 
                            # Handle both "Temp: 760" and "Temp:760"
                            raw_val = float(line.split(":")[1].strip())
                            # Calibration: Most hobbyist sensors (TMP36) send millivolts
                            # conversion: (mV - 500) / 10
                            if raw_val > 300: # Heuristic for raw mV vs Celsius
                                latest_data["T"] = (raw_val - 500.0) / 10.0
                            else:
                                latest_data["T"] = raw_val
                        except: pass
                    elif "Pressure:" in line:
                        try:
                            # Convert Gauge to Absolute Pressure for the frontend
                            p_val = float(line.split(":")[1].strip())
                            latest_data["P"] = p_val + 1.013
                        except:
                            pass
                    elif "Flow:" in line:
                        try: 
                            # Flow in L/min from Arduino flow meter
                            flow_lpm = float(line.split(":")[1].strip())
                            latest_data["mw"] = flow_lpm

                            # ── Live Water Tracking in Liters ──
                            global water_mass_kg, current_water_volume_L, last_flow_time
                            now = time.time()
                            dt_sec = now - last_flow_time
                            
                            if dt_sec < 10:  # Guard against stale timestamps
                                dt_min = dt_sec / 60.0
                                
                                # 1. Water IN (from Arduino L/min)
                                flow_in_L = max(0, flow_lpm) * dt_min
                                if flow_lpm > 0:
                                    water_mass_kg += flow_lpm * dt_min * 0.997
                                
                                # 2. Steam OUT (if Boiler is ON and actively boiling > 99.5°C)
                                flow_out_L = 0.0
                                if latest_data.get("Q", 0) > 0 and latest_data.get("T", 25) >= 99.5:
                                    steam_loss_lpm = 0.0267  # 1kW heater loses ~26.7 mL/min
                                    flow_out_L = steam_loss_lpm * dt_min
                                    water_mass_kg -= steam_loss_lpm * dt_min * 0.997
                                
                                # ── V_new = V_old + (dV/dt * dt) ──
                                current_water_volume_L += (flow_in_L - flow_out_L)
                                    
                                # Make this live explicitly visible to dashboard as a live sensor!
                                latest_data["Water_Volume_Liters"] = round(current_water_volume_L, 3)
                            
                            last_flow_time = now
                        except: pass
                    elif "Pump:" in line:
                        try: latest_data["pump"] = int(line.split(":")[1].strip())
                        except: pass
                    elif "Valve:" in line:
                        val = line.split(":")[1].strip()
                        latest_data["Kv"] = 1.0 if val == "OPEN" else 0.0
                    elif "Heater:" in line:
                        val = line.split(":")[1].strip()
                        latest_data["Q"] = 1000.0 if val == "ON" else 0.0
                        # Serial confirmed heater state — clear pending flag
                        if val == "ON":
                            heater_cmd_pending = False
                        elif val == "OFF":
                            heater_cmd_pending = False
                    elif "Mode:" in line:
                        latest_data["mode"] = line.split(":")[1].strip()
                    elif "FloatLow:" in line:
                        latest_data["float_low"] = 1 if line.split(":")[1].strip() == "1" else 0
                    elif "FloatHigh:" in line:
                        latest_data["float_high"] = 1 if line.split(":")[1].strip() == "1" else 0
                    elif "Ready:" in line:
                        latest_data["ready"] = 1 if line.split(":")[1].strip() == "1" else 0
                        
        except Exception as e:
            if is_connected:
                print(f"⚠️ Serial Disconnected! Hardware unplugged?")
                is_connected = False
            time.sleep(2)

def run_autopilot():
    """
    Background thread for Proactive Model-Based Control.
    Runs a 5-minute forecast every few seconds to decide heater state.
    """
    global autopilot_state, latest_data, water_mass_kg
    print("🤖 Predictive Autopilot Thread Started")
    
    while True:
        try:
            # Heartbeat for debugging
            # print(f"DEBUG: Autopilot Thread Heartbeat (Mode: {autopilot_state['mode']}, Connected: {is_connected})")
            
            if not is_connected or autopilot_state["mode"] != "auto":
                time.sleep(2)
                continue
            
            print(f"🤖 [Auto] Decision Cycle Start...")
            
            # 1. Get current state
            P_gauge = max(0, latest_data["P"] - 1.013)
            T_curr = latest_data["T"]
            mw_curr = latest_data.get("mw", 0) / 60.0
            valve = latest_data.get("Kv", 0)
            target = autopilot_state["target_p"]
            
            # 2. Run 5-minute "What If" Forecast (assuming 1kW heater is ON)
            # Internal prediction for proactive decision making
            P_init_pa = latest_data["P"] * 1e5
            Vdw_init, phi_init, _ = compute_initial_state(
                T_celsius=T_curr,
                P_pa=P_init_pa,
                water_mass_kg=water_mass_kg
            )
            
            # Predict 5 minutes ahead
            P_final, _, _, _, _ = predict_forward(
                P_init=P_init_pa,
                Vdw_init=Vdw_init,
                phi_init=phi_init,
                m_w=mw_curr,
                Q=1000.0, # What if heater is ON?
                valve_opening=valve,
                T_init=T_curr,
                duration=300.0 # 5 minutes
            )
            
            f_p_gauge = max(0, (P_final / 1e5) - 1.013)
            autopilot_state["forecast_p_5min"] = round(f_p_gauge, 3)
            
            # 3. Decision Logic (Proactive Control)
            if P_gauge >= target:
                # Hard limit reached
                if latest_data["Q"] > 0:
                    command_queue.put("HEATER_OFF\n")
                    autopilot_state["status"] = "stabilizing"
                    print(f"🤖 [Auto] Target reached ({P_gauge:.2f} bar). Cutting heat.")
            elif f_p_gauge >= target:
                # Proactive Cutoff: We will hit target within 5 mins due to inertia
                if latest_data["Q"] > 0:
                    command_queue.put("HEATER_OFF\n")
                    autopilot_state["status"] = "coasting"
                    print(f"🤖 [Auto] Proactive Cutoff! Predicted {f_p_gauge:.2f} bar in 5m. Coasting now.")
            elif P_gauge < (target - 0.1):
                # Below target with hysteresis
                if latest_data["Q"] == 0:
                    command_queue.put("HEATER_ON\n")
                    autopilot_state["status"] = "heating"
                    print(f"🤖 [Auto] Below target. Starting ascent.")
            
            time.sleep(5) # Control cycle interval
            
        except Exception as e:
            print(f"❌ [Autopilot] Error in control loop: {e}")
            time.sleep(5)

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        print(f"📥 Incoming GET request: {self.path}")
        try:
            # Clean path to ignore query parameters like ?predict=true
            clean_path = self.path.split('?')[0]
            
            if clean_path == '/data':
                if is_connected:
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    # Inject Autopilot state into the telemetry feed
                    response = {**latest_data, "autopilot": autopilot_state}
                    self.wfile.write(json.dumps(response).encode('utf-8'))
                else:
                    self.send_response(503)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Serial not connected"}).encode('utf-8'))
            elif clean_path == '/predict':
                print("DEBUG: Received prediction request")
                try:
                    if is_connected:
                        import math
                        from urllib.parse import urlparse, parse_qs
                        def clean_val(v, default=0.0):
                            return default if math.isnan(v) or math.isinf(v) else v

                        # ── Parse demand parameters from query string ──
                        parsed = urlparse(self.path)
                        qp = parse_qs(parsed.query)
                        demand_minutes = int(qp.get('minutes', ['10'])[0])
                        target_pressure_bar = float(qp.get('target_pressure', ['0'])[0])

                        # Clamp to valid range
                        demand_minutes = max(1, min(demand_minutes, 30))
                        print(f"DEBUG: Demand → {demand_minutes} min, target P = {target_pressure_bar} bar")

                        # Determine effective heater power:
                        # Use actual Q if serial has confirmed, OR use pending flag
                        effective_Q = latest_data["Q"]
                        if effective_Q == 0 and heater_cmd_pending:
                            effective_Q = 1000.0  # 1kW — user has clicked Start Heater
                            print("DEBUG: Using heater_cmd_pending flag (serial echo not yet received)")

                        # If heater is effectively OFF, return idle baseline
                        if effective_Q == 0:
                            # Derive current state from live sensors + flow tracking
                            _, _, L_live = compute_initial_state(
                                T_celsius=latest_data["T"],
                                P_pa=latest_data["P"] * 1e5,
                                water_mass_kg=water_mass_kg
                            )
                            prediction = {
                                "status": "idle_baseline",
                                "heater_power_kw": 0.0,
                                "demand_minutes": demand_minutes,
                                "target_pressure_bar": target_pressure_bar,
                                "current": {
                                    "T": latest_data["T"],
                                    "P": round(max(0, latest_data["P"] - 1.013), 3),
                                    "L": round(L_live, 3)
                                },
                                "timeline": [],
                                "time_to_target": None
                            }
                        else:
                            # ── Forward Prediction Timeline (demand-driven) ──
                            P_init_pa = latest_data["P"] * 1e5
                            mw_init_kgs = latest_data["mw"] / 60.0
                            valve = latest_data["Kv"]

                            # Compute Vdw, phi, L from real sensor readings + flow tracking
                            Vdw_init, phi_init, L_init = compute_initial_state(
                                T_celsius=latest_data["T"],
                                P_pa=P_init_pa,
                                water_mass_kg=water_mass_kg
                            )
                            print(f"DEBUG: Sensor-derived state → Vdw={Vdw_init:.5f} m³, phi={phi_init:.4f}, L={L_init:.4f} m (water={water_mass_kg:.2f} kg)")

                            timeline = []
                            # t=0 is the current state — gauge pressure (0 at atmospheric)
                            timeline.append({
                                "t_min": 0,
                                "T": round(latest_data["T"], 1),
                                "P": round(max(0, latest_data["P"] - 1.013), 3),
                                "L": round(current_water_volume_L, 3)
                            })

                            try:
                                # Single-shot ODE solve with demand-driven time horizon
                                raw_timeline = predict_timeline(
                                    P_init=P_init_pa,
                                    Vdw_init=Vdw_init,
                                    phi_init=phi_init,
                                    m_w=mw_init_kgs,
                                    Q=effective_Q,
                                    valve_opening=valve,
                                    T_init=latest_data["T"],
                                    n_points=demand_minutes,
                                    step_seconds=60.0
                                )

                                for pt in raw_timeline:
                                    P_gauge = max(0, clean_val(pt["P"] / 1e5, latest_data["P"]) - 1.013)
                                    timeline.append({
                                        "t_min": pt["t_min"],
                                        "T": round(clean_val(pt["T"], latest_data["T"]), 1),
                                        "P": round(P_gauge, 3),
                                        "L": round(pt["Vdw"] * 1000.0, 3)
                                    })

                                # ── Calculate time to reach target pressure ──
                                time_to_target = None
                                if target_pressure_bar > 0:
                                    for pt in timeline:
                                        if pt["P"] >= target_pressure_bar:
                                            time_to_target = pt["t_min"]
                                            break
                                    # If not reached within the window
                                    if time_to_target is None and len(timeline) > 1:
                                        time_to_target = -1  # -1 signals "not reachable in this window"

                                prediction = {
                                    "status": "active_prediction",
                                    "heater_power_kw": effective_Q / 1000.0,
                                    "demand_minutes": demand_minutes,
                                    "target_pressure_bar": target_pressure_bar,
                                    "time_to_target": time_to_target,
                                    "current": {
                                        "T": latest_data["T"],
                                        "P": round(max(0, latest_data["P"] - 1.013), 3),
                                        "L": round(current_water_volume_L, 3)
                                    },
                                    "timeline": timeline
                                }
                                print(f"DEBUG: {demand_minutes}-min forecast served — T: {timeline[0]['T']}→{timeline[-1]['T']}°C, P: {timeline[0]['P']}→{timeline[-1]['P']} bar")

                            except Exception as solver_err:
                                print(f"❌ [Solver] Error calculating timeline: {solver_err}")
                                prediction = {
                                    "status": "solver_error",
                                    "heater_power_kw": effective_Q / 1000.0,
                                    "current": {
                                        "T": latest_data["T"],
                                        "P": round(max(0, latest_data["P"] - 1.013), 3),
                                        "L": round(current_water_volume_L, 3)
                                    },
                                    "timeline": [],
                                    "error": str(solver_err)
                                }

                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(json.dumps(prediction).encode('utf-8'))
                        if effective_Q == 0:
                            print("DEBUG: Served idle baseline (Heater OFF)")
                    else:
                        print("DEBUG: Prediction requested but Serial not connected")
                        self.send_response(503)
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(json.dumps({"error": "Serial not connected"}).encode('utf-8'))
                except Exception as e:
                    print(f"❌ [Server] Prediction handler crashed: {e}")
                    self.send_response(500)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            else:
                self.send_response(404)
                self.end_headers()
        except (BrokenPipeError, ConnectionResetError):
            # Happens if the client (browser) disconnects early
            pass
    def do_POST(self):
        print(f"📥 Incoming POST request: {self.path}")
        try:
            if self.path == '/control':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                print(f"DEBUG: Control Payload → {data}")
                command = data.get('command')
                if command:
                    # Legacy command support
                    if not command.endswith('\n'):
                        command += '\n'
                    command_queue.put(command)
                    
                    self.send_response(200)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "queued", "command": command.strip()}).encode('utf-8'))
                elif 'autopilot' in data:
                    # New Autopilot configuration support
                    cfg = data['autopilot']
                    if 'mode' in cfg:
                        autopilot_state['mode'] = cfg['mode']
                    if 'target_p' in cfg:
                        autopilot_state['target_p'] = float(cfg['target_p'])
                    
                    print(f"🤖 [Auto] Configuration Updated: {autopilot_state['mode'].upper()}, Target: {autopilot_state['target_p']} bar")
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "updated", "autopilot": autopilot_state}).encode('utf-8'))
                else:
                    self.send_response(400)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "No command provided"}).encode('utf-8'))
            else:
                self.send_response(404)
                self.end_headers()
        except Exception as e:
            print(f"Server Error handling POST: {e}")
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
            
    def log_message(self, format, *args):
        pass # Suppress logging so it doesn't spam the console

if __name__ == "__main__":
    # Start the serial reader in the background
    t = threading.Thread(target=read_serial, daemon=True)
    t.start()
    
    # Start the Autopilot background thread
    ta = threading.Thread(target=run_autopilot, daemon=True)
    ta.start()
    
    # Start the local Proxy Web Server for the Next.js Dashboard to read from
    server = HTTPServer(('127.0.0.1', 8080), RequestHandler)
    print("🌐 Python Serial-to-HTTP Proxy running on http://127.0.0.1:8080/data")
    server.serve_forever()
