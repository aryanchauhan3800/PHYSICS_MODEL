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

    dfs = []
    for f in csv_files:
        try:
            df = pd.read_csv(f)
            dfs.append(df)
        except Exception as e:
            print(f"Error reading {f}: {e}")

    if not dfs:
        print("No data could be read.")
        return

    # Merge all dataframes
    combined_df = pd.concat(dfs, ignore_index=True)
    
    # Sort by timestamp
    if 'timestamp' in combined_df.columns:
        combined_df['timestamp'] = pd.to_datetime(combined_df['timestamp'], errors='coerce')
        combined_df = combined_df.sort_values(by='timestamp')
        
    output_csv = os.path.join(log_dir, "combined_sessions.csv")
    combined_df.to_csv(output_csv, index=False)
    print(f"Saved combined CSV with {len(combined_df)} rows to {output_csv}")

    # Plot data quality
    fig, axes = plt.subplots(3, 1, figsize=(12, 18))
    
    # 1. Health Score over time
    if 'timestamp' in combined_df.columns and 'health_score' in combined_df.columns:
        ax = axes[0]
        # Sample data if it's too large to plot easily
        plot_df = combined_df.dropna(subset=['timestamp', 'health_score'])
        if len(plot_df) > 10000:
            plot_df = plot_df.sample(10000).sort_values('timestamp')
        ax.plot(plot_df['timestamp'], plot_df['health_score'], marker='.', linestyle='', alpha=0.5, color='blue')
        ax.set_title("Health Score over Time")
        ax.set_ylabel("Health Score")
        ax.tick_params(axis='x', rotation=45)

    # 2. Temperature Prediction Error (Actual - Predicted)
    if 'T_actual' in combined_df.columns and 'T_predicted' in combined_df.columns:
        ax = axes[1]
        error_t = combined_df['T_actual'] - combined_df['T_predicted']
        sns.histplot(error_t.dropna(), bins=50, ax=ax, kde=True, color='orange')
        ax.set_title("Temperature Prediction Error Distribution (Actual - Predicted)")
        ax.set_xlabel("Error (°C)")
        
    # 3. Pressure Prediction Error (Actual - Predicted)
    if 'P_actual_gauge' in combined_df.columns and 'P_predicted' in combined_df.columns:
        ax = axes[2]
        error_p = combined_df['P_actual_gauge'] - combined_df['P_predicted']
        sns.histplot(error_p.dropna(), bins=50, ax=ax, kde=True, color='green')
        ax.set_title("Pressure Prediction Error Distribution (Actual - Predicted)")
        ax.set_xlabel("Error (Gauge Pressure)")

    plt.tight_layout()
    plot_file = os.path.join(log_dir, "data_quality_report.png")
    plt.savefig(plot_file, dpi=300)
    print(f"Saved data quality report to {plot_file}")

if __name__ == "__main__":
    main()
