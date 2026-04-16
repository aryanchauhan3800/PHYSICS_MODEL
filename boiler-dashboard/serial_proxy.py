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
from simulation.solver_logic import predict_forward

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
    "ip": "0.0.0.0"
}
is_connected = False
command_queue = queue.Queue()

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
                            # Flow in L/min from Arduino
                            latest_data["mw"] = float(line.split(":")[1].strip())
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
                        
        except Exception as e:
            if is_connected:
                print(f"⚠️ Serial Disconnected! Hardware unplugged?")
                is_connected = False
            time.sleep(2)

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
                    self.wfile.write(json.dumps(latest_data).encode('utf-8'))
                else:
                    self.send_response(503)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Serial not connected"}).encode('utf-8'))
            elif clean_path == '/predict':
                print("DEBUG: Received prediction request")
                try:
                    if is_connected:
                        P_init_pa = latest_data["P"] * 1e5
                        mw_init_kgs = latest_data["mw"] / 60.0
                        
                        try:
                            # 300s Prediction
                            P_final, Vdw_final, phi_final, L_final, T_final = predict_forward(
                                P_init=P_init_pa,
                                Vdw_init=0.003,
                                phi_init=0.1,
                                m_w=mw_init_kgs,
                                Q=latest_data["Q"],
                                valve_opening=latest_data["Kv"],
                                T_init=latest_data["T"],
                                duration=300.0
                            )
                            
                            # Protect against JSON crash if solver returns NaN
                            import math
                            def clean_val(v, default=0.0):
                                return default if math.isnan(v) or math.isinf(v) else v

                            prediction = {
                                "P": round(clean_val(P_final / 1e5, latest_data["P"]), 3), 
                                "T": round(clean_val(T_final, latest_data["T"]), 1),
                                "L": round(clean_val(L_final, 0.15), 2),
                                "mw": latest_data["mw"],
                                "Q": latest_data["Q"]
                            }
                        except Exception as solver_err:
                            print(f"❌ [Solver] Error calculating prediction: {solver_err}")
                            prediction = {
                                "P": latest_data["P"], "T": latest_data["T"], "L": 0.15,
                                "mw": latest_data["mw"], "Q": latest_data["Q"], "error": str(solver_err)
                            }
                        
                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(json.dumps(prediction).encode('utf-8'))
                        print(f"DEBUG: Successfully served prediction (P={prediction['P']} bar)")
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
        try:
            if self.path == '/control':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                command = data.get('command')
                if command:
                    # Ensure command ends with newline for serial protocol
                    if not command.endswith('\n'):
                        command += '\n'
                    command_queue.put(command)
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "queued", "command": command.strip()}).encode('utf-8'))
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
    
    # Start the local Proxy Web Server for the Next.js Dashboard to read from
    # Binding to 127.0.0.1 explicitly to match Next.js fetch calls
    server = HTTPServer(('127.0.0.1', 8080), RequestHandler)
    print("🌐 Python Serial-to-HTTP Proxy running on http://127.0.0.1:8080/data")
    server.serve_forever()
