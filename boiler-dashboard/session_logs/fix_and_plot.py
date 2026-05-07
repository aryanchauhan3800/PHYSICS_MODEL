import pandas as pd
import glob
import os
import matplotlib.pyplot as plt
import seaborn as sns

def main():
    log_dir = "/Users/aryanchauhan/Developer/Physics-based-model/boiler-dashboard/session_logs"
    csv_files = glob.glob(os.path.join(log_dir, "session_*.csv"))
    
    if not csv_files:
        print("No CSV files found.")
        return

    expected_columns = [
        "timestamp", "T_actual", "P_actual_gauge", "T_predicted", "P_predicted", 
        "Q_watts", "flow_lpm", "water_L", "eta_instant", "health_score", 
        "anomaly_flag", "prediction_horizon_s", "prediction_target_timestamp", "L_predicted"
    ]

    dfs = []
    for f in csv_files:
        try:
            # First, check if the file has a header by looking at the first row
            with open(f, 'r') as file:
                first_line = file.readline().strip()
            
            if first_line.startswith("timestamp"):
                df = pd.read_csv(f)
            else:
                df = pd.read_csv(f, names=expected_columns)
            
            # Ensure only expected columns are kept
            # Find common columns
            common_cols = [col for col in expected_columns if col in df.columns]
            df = df[common_cols]
            
            # If some columns are missing, add them with NaNs
            for col in expected_columns:
                if col not in df.columns:
                    df[col] = pd.NA
                    
            dfs.append(df)
        except Exception as e:
            print(f"Error reading {f}: {e}")

    if not dfs:
        print("No data could be read.")
        return

    # Merge all dataframes
    combined_df = pd.concat(dfs, ignore_index=True)
    
    # Clean up empty rows
    combined_df = combined_df.dropna(subset=['timestamp'])
    
    # Sort by timestamp
    combined_df['timestamp'] = pd.to_datetime(combined_df['timestamp'], errors='coerce')
    combined_df = combined_df.dropna(subset=['timestamp']) # remove rows where timestamp parsing failed
    combined_df = combined_df.sort_values(by='timestamp')
        
    output_csv = os.path.join(log_dir, "clean_combined_sessions.csv")
    combined_df.to_csv(output_csv, index=False)
    print(f"Saved clean combined CSV with {len(combined_df)} rows to {output_csv}")

    # Plot time series
    fig, axes = plt.subplots(2, 1, figsize=(14, 10))
    
    # Subplot 1: Temperature Actual vs Predicted
    ax = axes[0]
    ax.plot(combined_df['timestamp'], combined_df['T_actual'], label='Actual Temp', color='blue', alpha=0.7, linewidth=1)
    ax.plot(combined_df['timestamp'], combined_df['T_predicted'], label='Predicted Temp', color='orange', alpha=0.7, linewidth=1)
    ax.set_title('Boiler Temperature Over Time')
    ax.set_ylabel('Temperature (°C)')
    ax.legend()
    
    # Subplot 2: Pressure Actual vs Predicted
    ax = axes[1]
    ax.plot(combined_df['timestamp'], combined_df['P_actual_gauge'], label='Actual Pressure', color='green', alpha=0.7, linewidth=1)
    ax.plot(combined_df['timestamp'], combined_df['P_predicted'], label='Predicted Pressure', color='red', alpha=0.7, linewidth=1)
    ax.set_title('Boiler Pressure Over Time')
    ax.set_ylabel('Gauge Pressure (Bar)')
    ax.legend()
    
    plt.tight_layout()
    plot_file = os.path.join(log_dir, "timeseries_graph.png")
    plt.savefig(plot_file, dpi=300)
    print(f"Saved timeseries graph to {plot_file}")

if __name__ == "__main__":
    main()
