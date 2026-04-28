import pandas as pd
from sklearn.ensemble import RandomForestRegressor
import joblib
import os
import glob

# 1. Load the MOST RECENT session logs
log_dir = 'boiler-dashboard/session_logs'
# Sort alphabetically (which sorts by date because of YYYYMMDD_HHMMSS)
all_files = sorted(glob.glob(os.path.join(log_dir, "*.csv")), reverse=True)

df_list = []
for file in all_files:
    try:
        temp_df = pd.read_csv(file)
        if len(temp_df) > 10:  # Ignore empty or tiny logs
            df_list.append(temp_df)
            if len(df_list) == 4:  # Stop after grabbing the 4 most recent valid sessions
                break
    except Exception as e:
        print(f"Skipping {file}: {e}")

if not df_list:
    print("Error: No valid session data found.")
    exit(1)

print(f"Loading data from the {len(df_list)} most recent session logs...")
df = pd.concat(df_list, ignore_index=True)

# Ensure required columns exist
required_columns = ['T_actual', 'P_actual_gauge', 'T_predicted', 'P_predicted', 'Q_watts', 'flow_lpm', 'water_L']
missing_cols = [col for col in required_columns if col not in df.columns]
if missing_cols:
    print(f"Error: Missing columns {missing_cols} in CSV.")
    exit(1)

# 2. Filter out rows where predictions haven't populated yet
df = df.dropna(subset=['T_predicted', 'P_predicted'])

if len(df) == 0:
    print("Error: Not enough data with predictions to train.")
    exit(1)

# 3. Calculate the Residuals (The Target Variables for our AI)
# Residual = What actually happened MINUS what the physics model thought would happen
df['residual_T'] = df['T_actual'] - df['T_predicted']
df['residual_P'] = df['P_actual_gauge'] - df['P_predicted']

# 4. Define the Features (The Inputs the AI gets to see)
features = ['T_actual', 'P_actual_gauge', 'Q_watts', 'flow_lpm', 'water_L']
X = df[features]

# The Targets
y_T = df['residual_T']
y_P = df['residual_P']

# Initialize models
ml_model_T = RandomForestRegressor(n_estimators=50, max_depth=5, random_state=42)
ml_model_P = RandomForestRegressor(n_estimators=50, max_depth=5, random_state=42)

print(f"Training Hybrid AI on {len(df)} rows...")
ml_model_T.fit(X, y_T)
ml_model_P.fit(X, y_P)

# Save the trained AI models to disk so serial_proxy can use them later
# Save them inside boiler-dashboard directory where serial_proxy.py lives
os.makedirs('boiler-dashboard/models', exist_ok=True)
joblib.dump(ml_model_T, 'boiler-dashboard/models/residual_model_T.pkl')
joblib.dump(ml_model_P, 'boiler-dashboard/models/residual_model_P.pkl')
print("Models saved successfully to boiler-dashboard/models/ !")
