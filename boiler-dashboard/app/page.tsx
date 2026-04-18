'use client';

import { useState, useEffect, useRef } from "react";
import { Activity, ArrowUpRight, ArrowDownRight, ChevronRight, Droplets, Thermometer, Gauge, Zap, CircleDot, Cpu, BarChart2, Shield, Bell, Sliders, Moon, Sun, Clock, Database, Wifi, Lock, Eye, Download, RefreshCw, TrendingUp, Flame } from "lucide-react";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import BoilerSchematic from "../components/boiler/boiler-schematic";
import { STAT_CARDS, STATUS_ROWS, TELEMETRY, ANALYTICS_DATA } from "../lib/mock-data";
import { ToggleSwitch } from "../components/ui/toggle-switch";
import { LiveClock } from "../components/ui/live-clock";
import { StatCard } from "../components/dashboard/stat-card";
import { GlowMetricCard } from "../components/dashboard/glow-metric-card";
import { HeatGraphPanel } from "../components/dashboard/heat-graph-panel";
import { DarkTooltip } from "../components/ui/dark-tooltip";

interface LiveData {
  mw: number;
  Q: number;
  Kv: number;
  T: number;
  P: number;
  pump: number;
  ip: string;
  connected: boolean;
  mode?: string;
  autopilot?: {
    mode: 'manual' | 'auto';
    target_p: number;
    status: 'idle' | 'heating' | 'coasting' | 'stabilizing';
    forecast_p_5min: number;
  };
}

interface PredictionTimelinePoint {
  t_min: number;
  T: number;
  P: number;
  L: number;
}

interface PredictionData {
  status: string;
  heater_power_kw: number;
  demand_minutes: number;
  target_pressure_bar: number;
  time_to_target: number | null;
  current: { T: number; P: number; L: number };
  timeline: PredictionTimelinePoint[];
  error?: string;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [settings, setSettings] = useState({
    notifications: true,
    autoSync: true,
    darkMode: false,
    highFrequency: false,
    safetyAlerts: true,
    dataLogging: true,
  });
  const NAV_ITEMS = ['Overview', 'Telemetry', 'Analytics', 'Settings'] as const;

  // React State for Live Arduino Data
  const [liveData, setLiveData] = useState<LiveData>({
    mw: 0.0, Q: 0.0, Kv: 0.0, T: 0.0, P: 1.013, pump: 0, ip: "0.0.0.0", connected: false
  });
  const [predictedData, setPredictedData] = useState<PredictionData | null>(null);
  const [liveAnalytics, setLiveAnalytics] = useState<any[]>([]);
  const [liveTelemetry, setLiveTelemetry] = useState<any[]>([]);
  const [lastSync, setLastSync] = useState("Just now");
  const [isHeaterLoading, setIsHeaterLoading] = useState(false);

  // ── Demand inputs for prediction ──
  const [demandMinutes, setDemandMinutes] = useState(10);
  const [targetPressure, setTargetPressure] = useState(0);  // 0 = no target

  const handleHeaterToggle = async () => {
    if (!liveData.connected) return;
    
    setIsHeaterLoading(true);
    // If heater is currently pulling power (Q > 0), turn it off.
    const command = liveData.Q > 0 ? "HEATER_OFF" : "HEATER_ON";
    
    try {
      const res = await fetch('/api/arduino', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command })
      });
      
      if (!res.ok) throw new Error("Failed to send command");
      console.log(`Heater command sent: ${command}`);
      
      // Trigger immediate refresh to show effect on prediction
      fetchArduinoData();
    } catch (e) {
      console.error("Heater control error:", e);
    } finally {
      setTimeout(() => setIsHeaterLoading(false), 500);
    }
  };

  const handleAutopilotConfig = async (config: { mode?: string, target_p?: number }) => {
    // Relaxed connection check to allow UI toggling during sync drops
    console.log("🛠️ [Dashboard] handleAutopilotConfig triggered with:", config);
    setIsHeaterLoading(true);
    try {
      const res = await fetch('/api/arduino', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          autopilot: {
            ...liveData.autopilot,
            ...config
          }
        })
      });
      if (!res.ok) throw new Error("Failed to update autopilot");
      fetchArduinoData();
    } catch (e) {
      console.error("Autopilot config error:", e);
    } finally {
      setTimeout(() => setIsHeaterLoading(false), 500);
    }
  };

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.darkMode]);

  // Global fetch function for both polling and manual refreshes
  const fetchArduinoData = async () => {
      try {
        const res = await fetch('/api/arduino');
        if (!res.ok) throw new Error("Failed to fetch telemetry");
        const data: LiveData = await res.json();
        setLiveData(data);

        // Fetch prediction timeline with demand parameters
        try {
          const predParams = new URLSearchParams({
            predict: 'true',
            minutes: String(demandMinutes),
            target_pressure: String(targetPressure),
            _t: new Date().getTime().toString() // Cache buster
          });
          const predRes = await fetch(`/api/arduino?${predParams.toString()}`, { cache: 'no-store' });
          if (predRes.ok) {
            const pData: PredictionData = await predRes.json();
            setPredictedData(pData);
          }
        } catch (predErr) {
          console.warn('Prediction fetch failed:', predErr);
        }
        
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        setLastSync(timeStr);

        // Map live data into Telemetry Array (keep last 20)
        setLiveTelemetry(prev => {
          const newRow = {
            time: timeStr,
            date: dateStr,
            p: Math.max(0, data.P - 1.013).toFixed(2),
            l: data.Water_Volume_Liters != null ? data.Water_Volume_Liters.toFixed(2) : '0.00', // Liters

            t: data.T.toFixed(1),
            status: data.connected ? (data.P > 1.3 ? 'Warning' : 'Optimal') : 'Offline'
          };
          const next = [newRow, ...prev];
          if (next.length > 20) next.pop();
          return next;
        });

        // Map live data into Analytics Array for the graph (keep last 50)
        setLiveAnalytics(prev => {
          const pGauge = Math.max(0, data.P - 1.013);
          const next = [...prev, {
            time: timeStr,
            pressure: pGauge,
            temperature: data.T,
            waterLevel: data.Water_Volume_Liters ?? 0.0,
            // Map actual metrics to the 0-100 layout domain for AreaChart
            vP: data.connected ? Math.min(100, Math.max(0, (pGauge / 0.3) * 100)) : 0, 
            vT: data.connected ? Math.min(100, Math.max(0, (data.T / 150) * 100)) : 0, 
            vW: data.connected ? Math.min(100, Math.max(0, ((data.Water_Volume_Liters ?? 0.0) / 5.0) * 100)) : 0 
          }];
          if (next.length > 50) next.shift();
          return next;
        });
        
      } catch (e) {
        console.error("Arduino polling error:", e);
        setLiveData(prev => ({ ...prev, connected: false }));
      }
    };

    useEffect(() => {
    let interval: NodeJS.Timeout;

    if (settings.autoSync) {
      interval = setInterval(fetchArduinoData, 2000);
      fetchArduinoData(); // Fetch immediately
    }

    return () => clearInterval(interval);
  }, [settings.autoSync, demandMinutes, targetPressure]);

  // Generate dynamic STAT_CARDS from liveData
  const CURRENT_STAT_CARDS = [
    {
      ...STAT_CARDS[0],
      value: Math.max(0, liveData.P - 1.013).toFixed(2),
      unit: 'bar',
      sub: `Range 0.00 – 0.30 bar`,
      description: liveData.connected ? 'Reading Live Sensor' : 'Offline',
      bar: Math.min(100, Math.max(0, ((liveData.P - 1.013) / 0.3) * 100)),
      sparkData: liveAnalytics.map(d => d.pressure)
    },
    {
      ...STAT_CARDS[1],
      value: liveData.T.toFixed(1),
      sub: `Expected 100 °C average`,
      description: liveData.connected ? (liveData.Q > 0 ? 'Heater ON' : 'Heater OFF') : 'Offline',
      bar: Math.min(100, Math.max(0, (liveData.T / 150) * 100)),
      sparkData: liveAnalytics.map(d => d.temperature)
    },
    {
      ...STAT_CARDS[2],
      label: 'Flow Rate',
      value: liveData.mw.toFixed(1),
      unit: 'L/min',
      sub: `Pump: ${liveData.pump === 1 ? 'ON' : 'OFF'}`,
      description: 'Feedwater flow',
      bar: liveData.pump === 1 ? 100 : 0,
      sparkData: liveAnalytics.map(d => d.waterLevel)
    },
    {
      ...STAT_CARDS[3],
      label: 'Heat Power',
      value: (liveData.Q / 1000).toFixed(1),
      unit: 'kW',
      sub: `Target: 1.0 kW`,
      description: liveData.Q > 0 ? 'Drawing power' : 'Idle',
      bar: liveData.Q > 0 ? 100 : 0,
      sparkData: liveAnalytics.map(d => liveData.Q > 0 ? 1.0 : 0.0) // Dummy realtime track for Heat Power
    }
  ];

  // Compute forecast helpers
  const hasForecast = predictedData && predictedData.status === 'active_prediction' && predictedData.timeline.length > 0;
  const forecastTimeline = hasForecast ? predictedData.timeline : [];
  const forecastFinal = hasForecast ? predictedData.timeline[predictedData.timeline.length - 1] : null;

  // Generate dynamic STATUS_ROWS
  const CURRENT_STATUS_ROWS = [
    { 
      label: 'Drum Pressure', 
      value: !liveData.connected ? 'Offline' : (liveData.P > 1.3 ? 'High' : 'Normal'), 
      color: !liveData.connected ? '#8e8e93' : (liveData.P > 1.3 ? '#ff9f0a' : '#1a8f3c'), 
      type: !liveData.connected ? 'gray' : (liveData.P > 1.3 ? 'orange' : 'green') 
    },
    { 
      label: 'Network status', 
      value: liveData.connected ? 'Online' : 'Offline', 
      color: liveData.connected ? '#1a8f3c' : '#ff453a', 
      type: liveData.connected ? 'green' : 'red' 
    },
    { 
      label: 'Heater Status', 
      value: !liveData.connected ? 'Offline' : (liveData.Q > 0 ? 'Active' : 'Off'), 
      color: !liveData.connected ? '#8e8e93' : (liveData.Q > 0 ? '#0071e3' : '#8e8e93'), 
      type: !liveData.connected ? 'gray' : (liveData.Q > 0 ? 'blue' : 'gray') 
    },
    { 
      label: 'Steam Valve', 
      value: !liveData.connected ? 'Offline' : (liveData.Kv > 0 ? 'Open' : 'Closed'), 
      color: !liveData.connected ? '#8e8e93' : (liveData.Kv > 0 ? '#0071e3' : '#8e8e93'), 
      type: !liveData.connected ? 'gray' : (liveData.Kv > 0 ? 'blue' : 'gray') 
    },
    { 
      label: 'Feed Pump', 
      value: !liveData.connected ? 'Offline' : (liveData.pump === 1 ? 'Running' : 'Ready'), 
      color: !liveData.connected ? '#8e8e93' : (liveData.pump === 1 ? '#0071e3' : '#1a8f3c'), 
      type: !liveData.connected ? 'gray' : (liveData.pump === 1 ? 'blue' : 'green') 
    },
  ];

  // Calculate dynamic uptime
  const [uptime, setUptime] = useState(0);
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (liveData.connected) {
      interval = setInterval(() => setUptime(prev => prev + 1), 1000);
    } else {
      setUptime(0);
    }
    return () => clearInterval(interval);
  }, [liveData.connected]);

  const formatUptime = (seconds: number) => {
    if (!liveData.connected) return "Offline";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h} h ${m} m`;
    if (m > 0) return `${m} m ${s} s`;
    return `${s} s`;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--t1)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      zIndex: 1,
    }}>

      {/* ════════════════════════════════════════
          NAV BAR  — macOS-style frosted
      ════════════════════════════════════════ */}
      <header className="glass" style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        height: 'var(--nav-h)',
        borderBottom: '0.5px solid var(--border)',
        display: 'flex',
        justifyContent: 'center',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
        }}>

          {/* Left — wordmark + divider + nav */}
          <div style={{ display: 'flex', alignItems: 'center' }}>

            {/* Wordmark */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingRight: '24px' }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '9px',
                background: 'linear-gradient(145deg, #0A84FF 0%, #0055D4 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 12px rgba(0,113,227,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
              }}>
                <Zap style={{ width: '14px', height: '14px', color: '#fff' }} strokeWidth={2.5} />
              </div>
              <span className="font-display" style={{ fontSize: '15.5px', fontWeight: 600, letterSpacing: '-0.035em', color: 'var(--t1)' }}>
                Boiler<span style={{ color: 'var(--t3)', fontWeight: 400 }}>.Core</span>
              </span>
            </div>

            {/* Divider */}
            <div style={{
              width: '1px', height: '22px',
              background: 'linear-gradient(180deg, transparent, var(--border-med), transparent)',
              marginRight: '20px',
            }} />

            {/* Nav links */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {NAV_ITEMS.map(item => {
                const isActive = activeTab === item.toLowerCase();
                return (
                  <button
                    key={item}
                    onClick={() => setActiveTab(item.toLowerCase())}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '10px',
                      fontSize: '13.5px',
                      fontWeight: isActive ? 600 : 500,
                      background: isActive ? 'rgba(0,0,0,0.06)' : 'transparent',
                      color: isActive ? 'var(--t1)' : 'var(--t3)',
                      letterSpacing: '-0.01em',
                      transition: 'all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
                      cursor: 'pointer',
                      boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)' : 'none',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        (e.currentTarget).style.color = 'var(--t1)';
                        (e.currentTarget).style.background = 'rgba(0,0,0,0.035)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        (e.currentTarget).style.color = 'var(--t3)';
                        (e.currentTarget).style.background = 'transparent';
                      }
                    }}
                  >{item}</button>
                );
              })}
            </nav>
          </div>

          {/* Right — clock + status + avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>

            {/* Theme toggle */}
            <button
              onClick={() => toggleSetting('darkMode')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '32px', height: '32px', borderRadius: '50%',
                background: settings.darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                cursor: 'pointer', transition: 'all 0.2s', border: 'none',
                color: 'var(--t1)'
              }}
              onMouseEnter={e => { (e.currentTarget).style.background = settings.darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'; }}
              onMouseLeave={e => { (e.currentTarget).style.background = settings.darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'; }}
            >
              {settings.darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Live clock */}
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t3)', letterSpacing: '-0.01em' }}>
              <LiveClock />
            </div>

            {/* Divider */}
            <div style={{ width: '1px', height: '18px', background: 'var(--border)' }} />

            {/* Live status pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 14px',
              borderRadius: '99px',
              background: liveData.connected ? 'rgba(26,143,60,0.06)' : 'rgba(255,69,58,0.06)',
              border: liveData.connected ? '0.5px solid rgba(26,143,60,0.16)' : '0.5px solid rgba(255,69,58,0.16)',
            }}>
              <div style={{ position: 'relative', width: '7px', height: '7px' }}>
                <div className="animate-pulse-ring" style={{
                  position: 'absolute', inset: '-3px',
                  borderRadius: '50%', background: liveData.connected ? '#34C759' : '#ff453a', opacity: 0.35,
                }} />
                <div style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: liveData.connected ? '#34C759' : '#ff453a',
                  boxShadow: liveData.connected ? '0 0 8px rgba(52,199,89,0.55)' : '0 0 8px rgba(255,69,58,0.55)',
                }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: liveData.connected ? '#1a8f3c' : '#ff453a', letterSpacing: '0.01em' }}>
                {liveData.connected ? 'Online' : 'Offline'}
              </span>
            </div>

            {/* Avatar */}
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'linear-gradient(145deg, #6366F1 0%, #4338CA 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11.5px', fontWeight: 700, color: '#fff', letterSpacing: '0.02em',
              boxShadow: '0 2px 12px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.20)',
              cursor: 'pointer',
              transition: 'all 0.2s var(--ease-apple)',
              border: '2px solid rgba(255,255,255,0.90)',
            }}
              onMouseEnter={e => { (e.currentTarget).style.transform = 'scale(1.08)'; (e.currentTarget).style.boxShadow = '0 4px 16px rgba(99,102,241,0.40), inset 0 1px 0 rgba(255,255,255,0.20)'; }}
              onMouseLeave={e => { (e.currentTarget).style.transform = 'scale(1)'; (e.currentTarget).style.boxShadow = '0 2px 12px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.20)'; }}
            >AC</div>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════
          MAIN
      ════════════════════════════════════════ */}
      <main style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '100%', padding: '20px 20px 80px', overflowX: 'hidden' }}>


          {activeTab === 'overview' && (
            <>
              {/* ── Premium Hero Header ── */}
              <div className="animate-fade-up delay-1" style={{ marginBottom: '20px', padding: '0 2px' }}>
                <h1 className="hero-greeting font-display" style={{
                  fontSize: '30px', fontWeight: 600, letterSpacing: '-0.04em',
                  marginBottom: '4px', lineHeight: 1.15,
                }}>
                  System Overview
                </h1>
                <p className="hero-subtitle" style={{
                  fontSize: '15px', fontWeight: 400, letterSpacing: '-0.01em',
                  color: 'var(--t3)',
                }}>
                  {liveData.connected ? 'All systems operational' : 'System is currently offline'} — Last diagnostic: <span className="num" style={{ fontWeight: 600, color: 'var(--t2)' }}>{lastSync}</span>
                </p>
              </div>

              {/* ── System health banner ── */}
              <div className="banner-premium animate-fade-up delay-1" style={{
                display: 'flex', alignItems: 'center', gap: '0',
                borderRadius: 'var(--r-lg)',
                overflow: 'hidden',
                border: '0.5px solid var(--border)',
                marginBottom: '16px',
                background: 'var(--bg-elevated)',
                boxShadow: 'var(--shadow-sm)',
              }}>
            {[
              { icon: Cpu,      label: 'Model / Source',    value: liveData.connected ? 'ESP32 Linked' : 'Disconnected'   },
              { icon: BarChart2,label: 'Sync State',  value: liveData.connected ? '100% Realtime' : 'Halted'      },
              { icon: Activity, label: 'Proxy Cycle',     value: '2 s interval'},
              { icon: Zap,      label: 'Session Uptime',    value: formatUptime(uptime)   },
            ].map((item, i, arr) => {
              const Icon = item.icon;
              return (
                <div key={item.label} style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '14px 20px',
                  borderRight: i < arr.length - 1 ? '0.5px solid var(--border-s)' : 'none',
                  transition: 'background 0.2s var(--ease-apple)',
                  cursor: 'default',
                  opacity: liveData.connected ? 1.0 : 0.5,
                }}
                  onMouseEnter={e => (e.currentTarget).style.background = 'rgba(0,113,227,0.015)'}
                  onMouseLeave={e => (e.currentTarget).style.background = 'transparent'}
                >
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: 'rgba(0,113,227,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon style={{ width: '13px', height: '13px', color: 'var(--blue)' }} strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--t3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '2px' }}>{item.label}</div>
                    <div className="num" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.02em' }}>{item.value}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Stat Cards (Current State) ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', marginTop: '4px' }}>
            <p className="caps-label" style={{ margin: 0 }}>Current State</p>
          </div>
          <div
            className="stat-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}
          >
            {CURRENT_STAT_CARDS.map((card, i) => (
              <StatCard key={card.id} card={card} index={i} />
            ))}
          </div>

          {/* ── 10-Minute Forecast Panel ── */}
          {hasForecast ? (
            <div className="animate-fade-up delay-2" style={{
              marginBottom: '12px',
              borderRadius: 'var(--r-xl)',
              overflow: 'hidden',
              position: 'relative',
              background: 'linear-gradient(165deg, rgba(39, 39, 42, 0.75) 0%, rgba(24, 24, 27, 0.85) 50%, rgba(9, 9, 11, 0.97) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 12px 48px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 80px rgba(255,159,10,0.04)',
            }}>
              {/* Ambient glow */}
              <div style={{
                position: 'absolute', top: '-40px', left: '15%',
                width: '300px', height: '180px',
                background: 'radial-gradient(ellipse, rgba(255,159,10,0.06), transparent 70%)',
                pointerEvents: 'none', filter: 'blur(30px)',
              }} />
              <div style={{
                position: 'absolute', bottom: '-30px', right: '20%',
                width: '250px', height: '150px',
                background: 'radial-gradient(ellipse, rgba(255,59,48,0.04), transparent 70%)',
                pointerEvents: 'none', filter: 'blur(25px)',
              }} />
              {/* Top accent line */}
              <div style={{
                position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px',
                background: 'linear-gradient(90deg, transparent, rgba(255,159,10,0.30), rgba(255,59,48,0.15), transparent)',
              }} />

              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '18px 24px 0',
                zIndex: 10, position: 'relative',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '10px',
                    background: 'linear-gradient(135deg, rgba(255,159,10,0.15), rgba(255,59,48,0.10))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(255,159,10,0.20)',
                  }}>
                    <Flame style={{ width: '15px', height: '15px', color: '#FF9F0A' }} />
                  </div>
                  <div>
                  <h3 className="font-display" style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '-0.02em', color: '#fff', margin: 0 }}>{demandMinutes}-Minute Forecast</h3>
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.40)', marginTop: '2px', fontWeight: 400, letterSpacing: '-0.01em' }}>
                      Heating at {predictedData?.heater_power_kw ?? 1.0} kW — Physics-based prediction
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 12px', borderRadius: '99px', background: 'rgba(255,159,10,0.10)', border: '1px solid rgba(255,159,10,0.20)' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#FF9F0A', animation: 'pulse-ring 1.6s ease-out infinite' }} />
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#FF9F0A', letterSpacing: '0.08em' }}>ACTIVE</span>
                </div>
              </div>

              {/* ── Demand Selectors Row ── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '16px',
                padding: '12px 24px 4px',
                position: 'relative', zIndex: 10,
              }}>
                {/* Time Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock style={{ width: '13px', height: '13px', color: 'rgba(255,255,255,0.40)' }} />
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.40)', fontWeight: 500 }}>Predict</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 3, 5, 8, 10, 15, 20, 25].map(m => (
                      <button
                        key={m}
                        onClick={() => setDemandMinutes(m)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: demandMinutes === m ? '1px solid rgba(255,159,10,0.40)' : '1px solid rgba(255,255,255,0.10)',
                          background: demandMinutes === m ? 'rgba(255,159,10,0.15)' : 'rgba(255,255,255,0.04)',
                          color: demandMinutes === m ? '#FF9F0A' : 'rgba(255,255,255,0.50)',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.08)' }} />

                {/* Target Pressure Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Gauge style={{ width: '13px', height: '13px', color: 'rgba(255,255,255,0.40)' }} />
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.40)', fontWeight: 500 }}>Target</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[0, 1.2, 1.5, 1.8, 2.0, 2.5].map(p => (
                      <button
                        key={p}
                        onClick={() => setTargetPressure(p)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: targetPressure === p ? '1px solid rgba(10,132,255,0.40)' : '1px solid rgba(255,255,255,0.10)',
                          background: targetPressure === p ? 'rgba(10,132,255,0.15)' : 'rgba(255,255,255,0.04)',
                          color: targetPressure === p ? '#0A84FF' : 'rgba(255,255,255,0.50)',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {p === 0 ? 'Off' : `${p} bar`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time to Target Badge */}
                {targetPressure > 0 && predictedData?.time_to_target !== undefined && predictedData?.time_to_target !== null && (
                  <div style={{
                    marginLeft: 'auto',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '4px 14px',
                    borderRadius: '99px',
                    background: predictedData.time_to_target === -1
                      ? 'rgba(255,69,58,0.12)' : 'rgba(48,209,88,0.12)',
                    border: predictedData.time_to_target === -1
                      ? '1px solid rgba(255,69,58,0.25)' : '1px solid rgba(48,209,88,0.25)',
                  }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 700,
                      color: predictedData.time_to_target === -1 ? '#FF453A' : '#30D158',
                    }}>
                      {predictedData.time_to_target === -1
                        ? `Not reached in ${demandMinutes}m`
                        : `${targetPressure} bar in ${predictedData.time_to_target} min`}
                    </span>
                  </div>
                )}
              </div>

              {/* Chart */}
              <div style={{ height: '280px', padding: '12px 20px 4px', position: 'relative', zIndex: 5 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={forecastTimeline} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="fcStrokeT" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#FF9F0A" />
                        <stop offset="100%" stopColor="#FF6B35" />
                      </linearGradient>
                      <linearGradient id="fcStrokeP" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#0A84FF" />
                        <stop offset="100%" stopColor="#40B0FF" />
                      </linearGradient>
                      <linearGradient id="fcStrokeL" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#30D158" />
                        <stop offset="100%" stopColor="#34C759" />
                      </linearGradient>
                      <filter id="fcGlowT" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                        <feFlood floodColor="#FF9F0A" floodOpacity="0.4" result="color" />
                        <feComposite in="color" in2="blur" operator="in" result="glow" />
                        <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                      <filter id="fcGlowP" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                        <feFlood floodColor="#0A84FF" floodOpacity="0.4" result="color" />
                        <feComposite in="color" in2="blur" operator="in" result="glow" />
                        <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="t_min"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.30)', fontWeight: 500 }}
                      tickFormatter={(v: any) => `${v}m`}
                      dy={8}
                    />
                    <YAxis
                      yAxisId="temp"
                      domain={[0, 160]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.25)', fontWeight: 400 }}
                      dx={-5}
                      label={{ value: '°C', position: 'insideTopLeft', fill: 'rgba(255,255,255,0.20)', fontSize: 10, dy: -5, dx: 10 }}
                    />
                    <YAxis
                      yAxisId="pressure"
                      orientation="right"
                      domain={[0, 3.5]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.25)', fontWeight: 400 }}
                      dx={5}
                      label={{ value: 'bar', position: 'insideTopRight', fill: 'rgba(255,255,255,0.20)', fontSize: 10, dy: -5, dx: -10 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(24,24,27,0.95)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        borderRadius: '12px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.50)',
                        padding: '12px 16px',
                        backdropFilter: 'blur(16px)',
                      }}
                      labelStyle={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '6px' }}
                      itemStyle={{ color: 'rgba(255,255,255,0.90)', fontSize: '12.5px', fontWeight: 500, padding: '2px 0' }}
                      labelFormatter={(v: any) => `t + ${v} min`}
                      cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
                    />
                    <Line yAxisId="temp" type="monotone" dataKey="T" name="Temperature" stroke="url(#fcStrokeT)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#FF9F0A', stroke: 'rgba(255,159,10,0.3)', strokeWidth: 4 }} filter="url(#fcGlowT)" />
                    <Line yAxisId="pressure" type="monotone" dataKey="P" name="Pressure" stroke="url(#fcStrokeP)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#0A84FF', stroke: 'rgba(10,132,255,0.3)', strokeWidth: 4 }} filter="url(#fcGlowP)" />
                    <Line yAxisId="temp" type="monotone" dataKey="L" name="Water Level" stroke="url(#fcStrokeL)" strokeWidth={1.5} dot={false} activeDot={{ r: 4, fill: '#30D158', stroke: 'rgba(48,209,88,0.3)', strokeWidth: 4 }} strokeDasharray="6 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Legend row */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', padding: '4px 0 12px', position: 'relative', zIndex: 5 }}>
                {[
                  { label: 'Temperature', color: '#FF9F0A' },
                  { label: 'Pressure', color: '#0A84FF' },
                  { label: 'Water Level', color: '#30D158', dashed: true },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <div style={{
                      width: '16px', height: '2px', borderRadius: '1px',
                      background: item.color,
                      boxShadow: `0 0 6px ${item.color}50`,
                      ...(('dashed' in item && item.dashed) ? { backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0, ${item.color} 4px, transparent 4px, transparent 8px)`, background: 'none' } : {}),
                    }} />
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.40)', fontWeight: 500 }}>{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Summary cards */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                position: 'relative', zIndex: 5,
              }}>
                {forecastFinal && [
                  {
                    label: 'Temperature',
                    icon: Thermometer,
                    current: liveData.T,
                    predicted: forecastFinal.T,
                    unit: '°C',
                    color: '#FF9F0A',
                    decimals: 1,
                  },
                  {
                    label: 'Pressure',
                    icon: Gauge,
                    current: Math.max(0, liveData.P - 1.013),
                    predicted: forecastFinal.P,
                    unit: 'bar',
                    color: '#0A84FF',
                    decimals: 3,
                  },
                  {
                    label: 'Water Level',
                    icon: Droplets,
                    current: liveData.Water_Volume_Liters ?? 0.0,
                    predicted: forecastFinal.L,
                    unit: 'L',
                    color: '#30D158',
                    decimals: 3,
                  },
                ].map((m, i, arr) => {
                  const delta = m.predicted - m.current;
                  const isUp = delta >= 0;
                  const DeltaIcon = isUp ? ArrowUpRight : ArrowDownRight;
                  return (
                    <div key={m.label} style={{
                      padding: '16px 20px',
                      borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                      display: 'flex', flexDirection: 'column', gap: '6px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <m.icon style={{ width: '12px', height: '12px', color: m.color, opacity: 0.7 }} />
                        <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{m.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span className="num" style={{ fontSize: '22px', fontWeight: 700, color: '#fff', letterSpacing: '-0.03em' }}>
                          {m.predicted.toFixed(m.decimals)}
                        </span>
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.30)', fontWeight: 400 }}>{m.unit}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <DeltaIcon style={{ width: '12px', height: '12px', color: isUp ? '#FF9F0A' : '#30D158' }} />
                        <span style={{ fontSize: '11px', fontWeight: 600, color: isUp ? '#FF9F0A' : '#30D158' }}>
                          {isUp ? '+' : ''}{delta.toFixed(m.decimals)}
                        </span>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginLeft: '2px' }}>vs now</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Idle state — no active forecast */
            <div className="animate-fade-up delay-2" style={{
              marginBottom: '12px',
              padding: '24px',
              borderRadius: 'var(--r-lg)',
              background: 'var(--bg-elevated)',
              border: '0.5px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex', alignItems: 'center', gap: '16px',
            }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'rgba(142,142,147,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <TrendingUp style={{ width: '18px', height: '18px', color: 'var(--t3)' }} />
              </div>
              <div>
                <p className="font-display" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.02em', margin: 0 }}>System Idle — No Active Forecast</p>
                <p style={{ fontSize: '12.5px', color: 'var(--t3)', marginTop: '3px', fontWeight: 400 }}>Start the heater to generate a 10-minute physics-based prediction of temperature, pressure, and water level.</p>
              </div>
            </div>
          )}

          {/* ── Main grid: Schematic + Sidebar ── */}
          <div
            className="main-grid animate-fade-up delay-3"
            style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 316px', gap: '12px', marginBottom: '12px' }}
          >

            {/* ── Schematic Panel ── */}
            <div className="card" style={{ overflow: 'hidden' }}>
              {/* Panel header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '15px 22px',
                borderBottom: '0.5px solid var(--border-s)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="font-display" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.02em' }}>
                    System Schematic
                  </span>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '2px 10px', borderRadius: '99px',
                    background: 'rgba(0,113,227,0.07)',
                    border: '0.5px solid rgba(0,113,227,0.18)',
                  }}>
                    <div className="animate-pulse-dot" style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--blue)' }} />
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--blue)', letterSpacing: '0.06em' }}>LIVE</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  {['Reset', 'Fullscreen'].map(a => (
                    <button
                      key={a}
                      style={{
                        fontSize: '11.5px', fontWeight: 500, color: 'var(--t3)',
                        padding: '5px 10px', borderRadius: '7px',
                        transition: 'all 0.15s var(--ease-apple)',
                      }}
                      onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(0,0,0,0.05)'; (e.currentTarget).style.color = 'var(--t2)'; }}
                      onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; (e.currentTarget).style.color = 'var(--t3)'; }}
                    >{a}</button>
                  ))}
                </div>
              </div>

              {/* Schematic */}
              <div style={{ height: '680px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BoilerSchematic 
                  isHeating={liveData.Q > 0} 
                  mode={liveData.mode || 'AUTO'} 
                  onToggleHeater={handleHeaterToggle}
                  onSetAuto={() => handleAutopilotConfig({ mode: 'auto' })}
                  isLoading={isHeaterLoading}
                />
              </div>
            </div>

            {/* ── Sidebar ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* System Status */}
              <div className="card" style={{ padding: '18px 20px', flex: 1 }}>
                <p className="caps-label" style={{ marginBottom: '14px' }}>System Status</p>
                <div>
                  {CURRENT_STATUS_ROWS.map((row, i) => (
                    <div key={row.label} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: i < CURRENT_STATUS_ROWS.length - 1 ? '0.5px solid var(--border-s)' : 'none',
                    }}>
                      <span style={{ fontSize: '13px', color: 'var(--t2)', fontWeight: 400, letterSpacing: '-0.01em' }}>
                        {row.label}
                      </span>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '2px 9px', borderRadius: '99px',
                        background: row.type === 'green' ? 'rgba(26,143,60,0.08)' : (row.type === 'red' ? 'rgba(255,69,58,0.08)' : (row.type === 'orange' ? 'rgba(255,159,10,0.08)' : (row.type === 'gray' ? 'rgba(142,142,147,0.08)' : 'rgba(0,113,227,0.08)'))),
                        border: `0.5px solid ${row.type === 'green' ? 'rgba(26,143,60,0.20)' : (row.type === 'red' ? 'rgba(255,69,58,0.20)' : (row.type === 'orange' ? 'rgba(255,159,10,0.20)' : (row.type === 'gray' ? 'rgba(142,142,147,0.20)' : 'rgba(0,113,227,0.20)')))}`,
                      }}>
                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: row.color }} />
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: row.color, letterSpacing: '-0.005em' }}>
                          {row.value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Digital Twin Autopilot */}
              <div className="card-premium animate-fade-up delay-3" style={{ 
                padding: '20px', 
                background: liveData.autopilot?.mode === 'auto' ? 'linear-gradient(165deg, rgba(10,132,255,0.08) 0%, rgba(0,0,0,0) 100%)' : 'var(--bg-elevated)',
                border: liveData.autopilot?.mode === 'auto' ? '1px solid rgba(10,132,255,0.25)' : '1px solid var(--border)',
                boxShadow: liveData.autopilot?.mode === 'auto' ? '0 8px 32px rgba(10,132,255,0.12)' : 'var(--shadow-sm)',
                position: 'relative',
                overflow: 'hidden'
              }}>
                {liveData.autopilot?.mode === 'auto' && (
                  <div style={{
                    position: 'absolute', top: '-10px', right: '-10px', width: '60px', height: '60px',
                    background: 'radial-gradient(circle, rgba(10,132,255,0.1) 0%, transparent 70%)',
                    zIndex: 0
                  }} />
                )}
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '10px',
                      background: liveData.autopilot?.mode === 'auto' ? 'var(--blue)' : 'rgba(0,0,0,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: liveData.autopilot?.mode === 'auto' ? '#fff' : 'var(--t3)',
                      transition: 'all 0.3s var(--ease-apple)'
                    }}>
                      <Cpu size={16} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--t1)' }}>Digital Twin Autopilot</h3>
                      <p style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: 500 }}>{liveData.autopilot?.mode === 'auto' ? 'Active Proactive Control' : 'Manual Override Mode'}</p>
                    </div>
                  </div>
                  <ToggleSwitch 
                    active={liveData.autopilot?.mode === 'auto'}
                    onToggle={() => handleAutopilotConfig({ mode: liveData.autopilot?.mode === 'auto' ? 'manual' : 'auto' })}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative', zIndex: 1 }}>
                  {/* Status Indicator */}
                  <div style={{
                    padding: '12px', borderRadius: '12px',
                    background: 'rgba(0,0,0,0.03)',
                    border: '0.5px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t3)' }}>Current Status</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div className={liveData.autopilot?.status === 'heating' ? 'animate-pulse' : ''} style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: liveData.autopilot?.status === 'heating' ? '#FF9F0A' : (liveData.autopilot?.status === 'coasting' ? '#32D74B' : '#8E8E93')
                      }} />
                      <span style={{ 
                        fontSize: '11px', fontWeight: 700, 
                        color: liveData.autopilot?.status === 'heating' ? '#FF9F0A' : (liveData.autopilot?.status === 'coasting' ? '#32D74B' : 'var(--t2)'),
                        textTransform: 'uppercase', letterSpacing: '0.04em'
                      }}>
                        {liveData.autopilot?.status || 'Idle'}
                      </span>
                    </div>
                  </div>

                  {/* Target Selector */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t3)' }}>Target Pressure</span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--blue)' }}>{liveData.autopilot?.target_p || 1.5} <span style={{ fontSize: '10px', opacity: 0.7 }}>BAR</span></span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[1.2, 1.5, 1.8, 2.0, 2.2].map(p => (
                        <button
                          key={p}
                          onClick={() => handleAutopilotConfig({ target_p: p })}
                          style={{
                            flex: 1, padding: '7px 0', borderRadius: '8px',
                            background: liveData.autopilot?.target_p === p ? 'var(--blue)' : 'rgba(0,0,0,0.03)',
                            color: liveData.autopilot?.target_p === p ? '#fff' : 'var(--t2)',
                            fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >{p}</button>
                      ))}
                    </div>
                  </div>

                  {/* Forecast Insight */}
                  <div style={{
                    padding: '12px', borderRadius: '12px',
                    background: 'rgba(0,113,227,0.04)',
                    border: '0.5px dashed rgba(0,113,227,0.2)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Eye size={12} color="var(--blue)" />
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--blue)', letterSpacing: '0.02em', textTransform: 'uppercase' }}>5m Predictive Insight</span>
                    </div>
                    <p style={{ fontSize: '12.5px', color: 'var(--t1)', fontWeight: 500, lineHeight: 1.4 }}>
                      Model predicts <span className="num" style={{ fontWeight: 700, color: 'var(--blue)' }}>{liveData.autopilot?.forecast_p_5min || '0.0'} bar</span> in 5 mins.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="card" style={{ padding: '18px 20px' }}>
                <p className="caps-label" style={{ marginBottom: '14px' }}>Manual Overrides</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {/* Heater Control Button */}
                  <button 
                    onClick={handleHeaterToggle}
                    disabled={!liveData.connected || isHeaterLoading || liveData.autopilot?.mode === 'auto'}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', borderRadius: '11px',
                      background: !liveData.connected ? 'rgba(0,0,0,0.05)' : (liveData.Q > 0 ? 'linear-gradient(135deg, #FF3B30 0%, #D70015 100%)' : 'linear-gradient(135deg, #34C759 0%, #248A3D 100%)'),
                      fontSize: '13.5px', fontWeight: 600, color: '#fff', letterSpacing: '-0.015em',
                      boxShadow: !liveData.connected || liveData.autopilot?.mode === 'auto' ? 'none' : (liveData.Q > 0 ? '0 4px 16px rgba(255,59,48,0.30)' : '0 4px 16px rgba(52,199,89,0.30)'),
                      transition: 'all 0.18s var(--ease-apple)',
                      cursor: liveData.connected && !isHeaterLoading && liveData.autopilot?.mode !== 'auto' ? 'pointer' : 'not-allowed',
                      border: 'none',
                      opacity: liveData.connected && liveData.autopilot?.mode !== 'auto' ? 1 : 0.5,
                    }}
                   >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isHeaterLoading ? <RefreshCw className="animate-spin" size={14} /> : <Zap size={14} />}
                      {liveData.Q > 0 ? 'Stop Heater' : 'Start Heater'}
                    </div>
                    {liveData.autopilot?.mode === 'auto' ? <Lock size={12} /> : <ChevronRight style={{ width: '14px', height: '14px', opacity: 0.75 }} />}
                  </button>

                  <button 
                    onClick={() => setActiveTab('analytics')}
                    style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: '11px',
                    background: 'linear-gradient(135deg, #0077ed 0%, #0051a8 100%)',
                    fontSize: '13.5px', fontWeight: 600, color: '#fff', letterSpacing: '-0.015em',
                    boxShadow: '0 4px 16px rgba(0,113,227,0.30), inset 0 1px 0 rgba(255,255,255,0.12)',
                    transition: 'all 0.18s var(--ease-apple)',
                    border: 'none', cursor: 'pointer'
                  }}>
                    Optimize Performance
                    <ArrowUpRight style={{ width: '14px', height: '14px', opacity: 0.75 }} />
                  </button>


                  {['Export Report', 'View Predictions'].map(label => (
                    <button key={label} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: '10px',
                      background: 'rgba(0,0,0,0.03)',
                      border: '0.5px solid var(--border)',
                      fontSize: '13px', fontWeight: 500, color: 'var(--t2)', letterSpacing: '-0.012em',
                      transition: 'all 0.15s var(--ease-apple)',
                    }}
                      onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(0,0,0,0.055)'; (e.currentTarget).style.color = 'var(--t1)'; }}
                      onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(0,0,0,0.03)'; (e.currentTarget).style.color = 'var(--t2)'; }}
                    >
                      {label}
                      <ChevronRight style={{ width: '13px', height: '13px', opacity: 0.30 }} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Hardware Network Card */}
              <div className="card" style={{
                padding: '14px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'linear-gradient(135deg, rgba(10, 132, 255, 0.05) 0%, rgba(0, 0, 0, 0) 100%)',
                border: '0.5px solid rgba(10, 132, 255, 0.15)'
              }}>
                <div>
                  <p className="caps-label">ESP32 IP Address</p>
                  <p className="num" style={{ fontSize: '15px', fontWeight: 600, color: 'var(--blue)', marginTop: '4px', letterSpacing: '-0.02e m' }}>
                    {liveData.connected ? liveData.ip : 'Polling Serial...'}
                  </p>
                </div>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '12px',
                  background: 'rgba(0,113,227,0.09)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '0.5px solid rgba(0,113,227,0.18)',
                }}>
                  <Wifi style={{ width: '15px', height: '15px', color: 'var(--blue)' }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Telemetry Table ── */}
          <div className="card animate-fade-up delay-4" style={{ overflow: 'hidden' }}>

            {/* Table header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 24px',
              borderBottom: '0.5px solid var(--border-s)',
            }}>
              <div>
                <span className="font-display" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.02em' }}>
                  Telemetry Log
                </span>
                <p style={{ fontSize: '12px', color: 'var(--t3)', marginTop: '2px', fontWeight: 400, letterSpacing: '-0.01em' }}>
                  Recent sensor readings from the boiler system
                </p>
              </div>
              <button
                style={{
                  fontSize: '12.5px', fontWeight: 600, color: 'var(--blue)',
                  padding: '6px 14px', borderRadius: '8px',
                  letterSpacing: '-0.01em',
                  transition: 'all 0.15s var(--ease-apple)',
                  background: 'rgba(0,113,227,0.06)',
                  border: '0.5px solid rgba(0,113,227,0.15)',
                }}
                onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(0,113,227,0.10)'; }}
                onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(0,113,227,0.06)'; }}
              >View All</button>
            </div>

            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.1fr',
              padding: '9px 24px',
              borderBottom: '0.5px solid var(--border-s)',
              background: 'rgba(0,0,0,0.018)',
            }}>
              {['Timestamp', 'Pressure', 'Water Level', 'Temperature', 'Status'].map((col, i) => (
                <div key={col} style={{
                  fontSize: '10px', fontWeight: 600, color: 'var(--t3)',
                  letterSpacing: '0.07em', textTransform: 'uppercase',
                  textAlign: i === 4 ? 'right' : 'left',
                }}>{col}</div>
              ))}
            </div>

            {/* Rows */}
            <div>
              {liveTelemetry.map((row, i) => (
                <div
                  key={i}
                  className="telem-row"
                  style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.1fr',
                    alignItems: 'center',
                    padding: '13px 24px',
                    borderBottom: i < liveTelemetry.length - 1 ? '0.5px solid var(--border-s)' : 'none',
                    cursor: 'default',
                    position: 'relative',
                  }}
                >
                  {/* Timestamp */}
                  <div>
                    <div className="num" style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--t1)', letterSpacing: '-0.015em' }}>{row.time}</div>
                    <div style={{ fontSize: '10.5px', color: 'var(--t3)', marginTop: '2px', fontWeight: 400 }}>{row.date}</div>
                  </div>

                  {/* Pressure */}
                  <div className="num" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t2)' }}>
                    {row.p} <span style={{ fontSize: '10px', color: 'var(--t3)', fontWeight: 400 }}>bar</span>
                  </div>

                  {/* Level */}
                  <div className="num" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t2)' }}>
                    {row.l} <span style={{ fontSize: '10px', color: 'var(--t3)', fontWeight: 400 }}>Liters</span>
                  </div>

                  {/* Temp */}
                  <div className="num" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t2)' }}>
                    {row.t} <span style={{ fontSize: '10px', color: 'var(--t3)', fontWeight: 400 }}>°C</span>
                  </div>

                  {/* Status */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      padding: '3px 10px 3px 8px', borderRadius: '99px',
                      fontSize: '11.5px', fontWeight: 600,
                      background: row.status === 'Optimal' ? 'rgba(48,209,88,0.09)' : 'rgba(255,159,10,0.09)',
                      color: row.status === 'Optimal' ? '#1a8f3c' : '#b07800',
                      border: `0.5px solid ${row.status === 'Optimal' ? 'rgba(48,209,88,0.22)' : 'rgba(255,159,10,0.22)'}`,
                    }}>
                      <div style={{
                        width: '4px', height: '4px', borderRadius: '50%',
                        background: row.status === 'Optimal' ? '#30d158' : '#ff9f0a',
                      }} />
                      {row.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
              </div>
            </>
          )}

          {/* ════════════════════════════════════════
              TELEMETRY TAB
          ════════════════════════════════════════ */}
          {activeTab === 'telemetry' && (
            <div className="animate-fade-up delay-1" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Header */}
              <div style={{ padding: '0 2px' }}>
                <h1 className="hero-greeting font-display" style={{ fontSize: '30px', fontWeight: 600, letterSpacing: '-0.04em', marginBottom: '4px' }}>
                  Telemetry
                </h1>
                <p className="hero-subtitle" style={{ fontSize: '15px', color: 'var(--t3)' }}>
                  Real-time sensor data feed with historical logging.
                </p>
              </div>

              {/* Full telemetry table */}
              <div className="card animate-fade-up delay-2" style={{ overflow: 'hidden' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 24px',
                  borderBottom: '0.5px solid var(--border-s)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="font-display" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.02em' }}>Sensor Feed</span>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '2px 10px', borderRadius: '99px',
                      background: 'rgba(0,113,227,0.07)',
                      border: '0.5px solid rgba(0,113,227,0.18)',
                    }}>
                      <div className="animate-pulse-dot" style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--blue)' }} />
                      <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--blue)', letterSpacing: '0.06em' }}>LIVE</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      fontSize: '12px', fontWeight: 500, color: 'var(--t3)',
                      padding: '5px 12px', borderRadius: '8px',
                      background: 'rgba(0,0,0,0.03)', border: '0.5px solid var(--border)',
                      transition: 'all 0.15s var(--ease-apple)',
                    }}
                      onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(0,0,0,0.06)'; (e.currentTarget).style.color = 'var(--t2)'; }}
                      onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(0,0,0,0.03)'; (e.currentTarget).style.color = 'var(--t3)'; }}
                    >
                      <Download style={{ width: '12px', height: '12px' }} /> Export
                    </button>
                    <button style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      fontSize: '12px', fontWeight: 500, color: 'var(--t3)',
                      padding: '5px 12px', borderRadius: '8px',
                      background: 'rgba(0,0,0,0.03)', border: '0.5px solid var(--border)',
                      transition: 'all 0.15s var(--ease-apple)',
                    }}
                      onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(0,0,0,0.06)'; (e.currentTarget).style.color = 'var(--t2)'; }}
                      onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(0,0,0,0.03)'; (e.currentTarget).style.color = 'var(--t3)'; }}
                    >
                      <RefreshCw style={{ width: '12px', height: '12px' }} /> Refresh
                    </button>
                  </div>
                </div>

                {/* Column headers */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.1fr',
                  padding: '9px 24px',
                  borderBottom: '0.5px solid var(--border-s)',
                  background: 'rgba(0,0,0,0.018)',
                }}>
                  {['Timestamp', 'Pressure', 'Water Level', 'Temperature', 'Status'].map((col, i) => (
                    <div key={col} style={{
                      fontSize: '10px', fontWeight: 600, color: 'var(--t3)',
                      letterSpacing: '0.07em', textTransform: 'uppercase',
                      textAlign: i === 4 ? 'right' : 'left',
                    }}>{col}</div>
                  ))}
                </div>

                {/* Rows */}
                <div>
                  {liveTelemetry.map((row, i) => (
                    <div
                      key={i}
                      className="telem-row"
                      style={{
                        display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.1fr',
                        alignItems: 'center',
                        padding: '13px 24px',
                        borderBottom: i < liveTelemetry.length - 1 ? '0.5px solid var(--border-s)' : 'none',
                        cursor: 'default',
                        position: 'relative',
                      }}
                    >
                      <div>
                        <div className="num" style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--t1)', letterSpacing: '-0.015em' }}>{row.time}</div>
                        <div style={{ fontSize: '10.5px', color: 'var(--t3)', marginTop: '2px', fontWeight: 400 }}>{row.date}</div>
                      </div>
                      <div className="num" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t2)' }}>
                        {row.p} <span style={{ fontSize: '10px', color: 'var(--t3)', fontWeight: 400 }}>bar</span>
                      </div>
                      <div className="num" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t2)' }}>
                        {row.l} <span style={{ fontSize: '10px', color: 'var(--t3)', fontWeight: 400 }}>Liters</span>
                      </div>
                      <div className="num" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t2)' }}>
                        {row.t} <span style={{ fontSize: '10px', color: 'var(--t3)', fontWeight: 400 }}>°C</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                          padding: '3px 10px 3px 8px', borderRadius: '99px',
                          fontSize: '11.5px', fontWeight: 600,
                          background: row.status === 'Optimal' ? 'rgba(48,209,88,0.09)' : 'rgba(255,159,10,0.09)',
                          color: row.status === 'Optimal' ? '#1a8f3c' : '#b07800',
                          border: `0.5px solid ${row.status === 'Optimal' ? 'rgba(48,209,88,0.22)' : 'rgba(255,159,10,0.22)'}`,
                        }}>
                          <div style={{
                            width: '4px', height: '4px', borderRadius: '50%',
                            background: row.status === 'Optimal' ? '#30d158' : '#ff9f0a',
                          }} />
                          {row.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
              ANALYTICS TAB — Dark Premium
          ════════════════════════════════════════ */}
          {activeTab === 'analytics' && (
            <div className="animate-fade-up delay-1" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              
              {/* Header */}
              <div style={{ padding: '0 2px' }}>
                <h1 className="hero-greeting font-display" style={{ fontSize: '30px', fontWeight: 600, letterSpacing: '-0.04em', marginBottom: '4px' }}>
                  Analytics
                </h1>
                <p className="hero-subtitle" style={{ fontSize: '15px', color: 'var(--t3)', letterSpacing: '-0.01em' }}>Detailed parameter telemetry and historical trending.</p>
              </div>

              {/* ── Glowing Metric Cards ── */}
              <div className="animate-fade-up delay-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
                <GlowMetricCard
                  title="System Pressure" value={Math.max(0, liveData.P - 1.013).toFixed(2)} unit="bar"
                  color="#0A84FF" colorEnd="#0055D4" glowColor="#0A84FF"
                  icon={Gauge} dataKey="pressure" data={liveAnalytics}
                />
                <GlowMetricCard
                  title="Core Temperature" value={liveData.T.toFixed(0)} unit="°C"
                  color="#FF9F0A" colorEnd="#E67E00" glowColor="#FF9F0A"
                  icon={Thermometer} dataKey="temperature" data={liveAnalytics}
                />
                <GlowMetricCard
                  title="Water Level" value={(liveData.Water_Volume_Liters ?? 0.0).toFixed(2)} unit="L"
                  color="#5E5CE6" colorEnd="#4A48C9" glowColor="#5E5CE6"
                  icon={Droplets} dataKey="waterLevel" data={liveAnalytics}
                />
              </div>

              {/* ── Telemetry Overview Chart ── */}
              <div className="animate-fade-up delay-3" style={{
                padding: '28px 28px 16px',
                height: '460px',
                display: 'flex', flexDirection: 'column',
                position: 'relative', overflow: 'hidden',
                background: 'linear-gradient(165deg, rgba(39, 39, 42, 0.7) 0%, rgba(24, 24, 27, 0.8) 50%, rgba(9, 9, 11, 0.95) 100%)',
                backdropFilter: 'blur(12px)',
                borderRadius: 'var(--r-xl)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 12px 48px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 80px rgba(56,189,248,0.04)',
              }}>
                {/* Ambient glow orbs */}
                <div style={{
                  position: 'absolute', top: '-60px', left: '20%',
                  width: '300px', height: '200px',
                  background: 'radial-gradient(ellipse, rgba(10,132,255,0.06), transparent 70%)',
                  pointerEvents: 'none', filter: 'blur(30px)',
                }} />
                <div style={{
                  position: 'absolute', bottom: '-40px', right: '15%',
                  width: '250px', height: '180px',
                  background: 'radial-gradient(ellipse, rgba(94,92,230,0.05), transparent 70%)',
                  pointerEvents: 'none', filter: 'blur(25px)',
                }} />

                {/* Top accent line */}
                <div style={{
                  position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px',
                  background: 'linear-gradient(90deg, transparent, rgba(10,132,255,0.25), rgba(94,92,230,0.2), transparent)',
                }} />

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', zIndex: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <h3 className="font-display" style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.02em', color: '#fff' }}>Telemetry Overview</h3>
                    <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
                      {[
                        { label: 'Pressure', color: '#0A84FF' },
                        { label: 'Temperature', color: '#FF9F0A' },
                        { label: 'Water Level', color: '#5E5CE6' },
                      ].map(item => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: item.color, boxShadow: `0 0 8px ${item.color}50` }} />
                          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '3px', border: '1px solid rgba(255,255,255,0.04)' }}>
                     {['1H', '1D', '1W'].map(filter => (
                       <button key={filter} style={{
                         padding: '5px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                         background: filter === '1H' ? 'rgba(255,255,255,0.10)' : 'transparent',
                         color: filter === '1H' ? '#fff' : 'rgba(255,255,255,0.30)',
                         border: filter === '1H' ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
                         cursor: 'pointer',
                         transition: 'all 0.15s var(--ease-apple)',
                         letterSpacing: '0.04em',
                       }}>{filter}</button>
                     ))}
                  </div>
                </div>

                {/* Chart */}
                <div style={{ flex: 1, minHeight: 0, zIndex: 5 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={liveAnalytics} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        {/* Pressure gradient */}
                        <linearGradient id="darkStrokeP" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#0A84FF" />
                          <stop offset="100%" stopColor="#0055D4" />
                        </linearGradient>
                        <linearGradient id="darkFillP" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.25} />
                          <stop offset="50%" stopColor="#0A84FF" stopOpacity={0.08} />
                          <stop offset="100%" stopColor="#0A84FF" stopOpacity={0} />
                        </linearGradient>
                        {/* Temperature gradient */}
                        <linearGradient id="darkStrokeT" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#FF9F0A" />
                          <stop offset="100%" stopColor="#E67E00" />
                        </linearGradient>
                        <linearGradient id="darkFillT" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#FF9F0A" stopOpacity={0.20} />
                          <stop offset="50%" stopColor="#FF9F0A" stopOpacity={0.06} />
                          <stop offset="100%" stopColor="#FF9F0A" stopOpacity={0} />
                        </linearGradient>
                        {/* Water Level gradient */}
                        <linearGradient id="darkStrokeW" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#5E5CE6" />
                          <stop offset="100%" stopColor="#4A48C9" />
                        </linearGradient>
                        <linearGradient id="darkFillW" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#5E5CE6" stopOpacity={0.20} />
                          <stop offset="50%" stopColor="#5E5CE6" stopOpacity={0.06} />
                          <stop offset="100%" stopColor="#5E5CE6" stopOpacity={0} />
                        </linearGradient>
                        {/* Glow filters */}
                        <filter id="glowP" x="-30%" y="-30%" width="160%" height="160%">
                          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                          <feFlood floodColor="#0A84FF" floodOpacity="0.5" result="color" />
                          <feComposite in="color" in2="blur" operator="in" result="glow" />
                          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                        <filter id="glowT" x="-30%" y="-30%" width="160%" height="160%">
                          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                          <feFlood floodColor="#FF9F0A" floodOpacity="0.5" result="color" />
                          <feComposite in="color" in2="blur" operator="in" result="glow" />
                          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                        <filter id="glowW" x="-30%" y="-30%" width="160%" height="160%">
                          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                          <feFlood floodColor="#5E5CE6" floodOpacity="0.5" result="color" />
                          <feComposite in="color" in2="blur" operator="in" result="glow" />
                          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.25)', fontWeight: 400 }}
                        domain={[0, 100]}
                        dx={-8}
                      />
                      <XAxis 
                        dataKey="time" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.25)', fontWeight: 400 }}
                        dy={15}
                      />
                      <Tooltip content={<DarkTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }} />
                      
                      {/* Water Level — back layer */}
                      <Area type="monotone" dataKey="vW" stroke="url(#darkStrokeW)" strokeWidth={2.5} fill="url(#darkFillW)" dot={false} activeDot={{ r: 5, fill: '#5E5CE6', stroke: 'rgba(94,92,230,0.3)', strokeWidth: 4 }} filter="url(#glowW)" />
                      {/* Temperature — mid layer */}
                      <Area type="monotone" dataKey="vT" stroke="url(#darkStrokeT)" strokeWidth={2.5} fill="url(#darkFillT)" dot={false} activeDot={{ r: 5, fill: '#FF9F0A', stroke: 'rgba(255,159,10,0.3)', strokeWidth: 4 }} filter="url(#glowT)" />
                      {/* Pressure — front layer */}
                      <Area type="monotone" dataKey="vP" stroke="url(#darkStrokeP)" strokeWidth={2.5} fill="url(#darkFillP)" dot={false} activeDot={{ r: 5, fill: '#0A84FF', stroke: 'rgba(10,132,255,0.3)', strokeWidth: 4 }} filter="url(#glowP)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Thermal Heatmap ── */}
              <HeatGraphPanel liveData={liveData} />
            </div>
          )}

          {/* ════════════════════════════════════════
              SETTINGS TAB  — Premium
          ════════════════════════════════════════ */}
          {activeTab === 'settings' && (
            <div className="animate-fade-up delay-1" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' }}>
              
              {/* Header */}
              <div style={{ padding: '0 2px' }}>
                <h1 className="hero-greeting font-display" style={{ fontSize: '30px', fontWeight: 600, letterSpacing: '-0.04em', marginBottom: '4px' }}>
                  Settings
                </h1>
                <p className="hero-subtitle" style={{ fontSize: '15px', color: 'var(--t3)', letterSpacing: '-0.01em' }}>
                  Configure system preferences and monitoring parameters.
                </p>
              </div>

              {/* ── Appearance Section ── */}
              <div className="animate-fade-up delay-2">
                <p className="caps-label" style={{ marginBottom: '10px', padding: '0 4px' }}>Appearance</p>
                <div className="settings-card" style={{ overflow: 'hidden', marginBottom: '24px' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px',
                    transition: 'background 0.2s var(--ease-apple)',
                  }}
                    onMouseEnter={e => (e.currentTarget).style.background = 'rgba(120,120,128,0.04)'}
                    onMouseLeave={e => (e.currentTarget).style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
                      <div style={{
                        width: '34px', height: '34px', borderRadius: '10px',
                        background: 'rgba(94,92,230,0.07)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {settings.darkMode ? <Moon style={{ width: '15px', height: '15px', color: 'var(--indigo)' }} strokeWidth={1.8} /> : <Sun style={{ width: '15px', height: '15px', color: 'var(--indigo)' }} strokeWidth={1.8} />}
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.015em' }}>Dark Mode</div>
                        <div style={{ fontSize: '12px', fontWeight: 400, color: 'var(--t3)', marginTop: '2px', letterSpacing: '-0.005em' }}>Toggle premium dark mode aesthetics</div>
                      </div>
                    </div>
                    <ToggleSwitch active={settings.darkMode} onToggle={() => toggleSetting('darkMode')} />
                  </div>
                </div>
              </div>

              {/* ── Monitoring Section ── */}
              <div className="animate-fade-up delay-3">
                <p className="caps-label" style={{ marginBottom: '10px', padding: '0 4px' }}>Monitoring</p>
                <div className="settings-card" style={{ overflow: 'hidden' }}>
                  {[
                    { icon: Bell, label: 'Push Notifications', desc: 'Receive alerts for anomalies and threshold breaches', key: 'notifications' as const },
                    { icon: RefreshCw, label: 'Auto-Sync Data', desc: 'Automatically sync sensor data every 5 seconds', key: 'autoSync' as const },
                    { icon: Zap, label: 'High-Frequency Mode', desc: 'Increase polling rate to 1s intervals (higher CPU)', key: 'highFrequency' as const },
                  ].map((item, i, arr) => (
                    <div key={item.key} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '16px 20px',
                      borderBottom: i < arr.length - 1 ? '0.5px solid var(--border-s)' : 'none',
                      transition: 'background 0.2s var(--ease-apple)',
                    }}
                      onMouseEnter={e => (e.currentTarget).style.background = 'rgba(0,0,0,0.012)'}
                      onMouseLeave={e => (e.currentTarget).style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
                        <div style={{
                          width: '34px', height: '34px', borderRadius: '10px',
                          background: 'rgba(0,113,227,0.07)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <item.icon style={{ width: '15px', height: '15px', color: 'var(--blue)' }} strokeWidth={1.8} />
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.015em' }}>{item.label}</div>
                          <div style={{ fontSize: '12px', fontWeight: 400, color: 'var(--t3)', marginTop: '2px', letterSpacing: '-0.005em' }}>{item.desc}</div>
                        </div>
                      </div>
                      <ToggleSwitch active={settings[item.key]} onToggle={() => toggleSetting(item.key)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Safety Section ── */}
              <div className="animate-fade-up delay-3">
                <p className="caps-label" style={{ marginBottom: '10px', padding: '0 4px' }}>Safety & Security</p>
                <div className="settings-card" style={{ overflow: 'hidden' }}>
                  {[
                    { icon: Shield, label: 'Safety Alerts', desc: 'Critical alerts for overpressure, overtemp, low water', key: 'safetyAlerts' as const },
                    { icon: Database, label: 'Data Logging', desc: 'Store all telemetry data for post-analysis', key: 'dataLogging' as const },
                  ].map((item, i, arr) => (
                    <div key={item.key} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '16px 20px',
                      borderBottom: i < arr.length - 1 ? '0.5px solid var(--border-s)' : 'none',
                      transition: 'background 0.2s var(--ease-apple)',
                    }}
                      onMouseEnter={e => (e.currentTarget).style.background = 'rgba(0,0,0,0.012)'}
                      onMouseLeave={e => (e.currentTarget).style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
                        <div style={{
                          width: '34px', height: '34px', borderRadius: '10px',
                          background: 'rgba(48,209,88,0.07)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <item.icon style={{ width: '15px', height: '15px', color: 'var(--green)' }} strokeWidth={1.8} />
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.015em' }}>{item.label}</div>
                          <div style={{ fontSize: '12px', fontWeight: 400, color: 'var(--t3)', marginTop: '2px', letterSpacing: '-0.005em' }}>{item.desc}</div>
                        </div>
                      </div>
                      <ToggleSwitch active={settings[item.key]} onToggle={() => toggleSetting(item.key)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── System Info ── */}
              <div className="animate-fade-up delay-4">
                <p className="caps-label" style={{ marginBottom: '10px', padding: '0 4px' }}>System Information</p>
                <div className="settings-card" style={{ overflow: 'hidden' }}>
                  {[
                    { label: 'Simulation Engine', value: 'Radau IIA (5th order)' },
                    { label: 'Model Version', value: 'v2.4.1-stable' },
                    { label: 'Dashboard Version', value: 'v1.2.0' },
                    { label: 'Last Calibration', value: 'Apr 10, 2026' },
                    { label: 'Data Retention', value: '90 days' },
                  ].map((item, i, arr) => (
                    <div key={item.label} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '13px 20px',
                      borderBottom: i < arr.length - 1 ? '0.5px solid var(--border-s)' : 'none',
                    }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 400, color: 'var(--t2)', letterSpacing: '-0.01em' }}>{item.label}</span>
                      <span className="num" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.02em' }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Danger Zone ── */}
              <div className="animate-fade-up delay-5">
                <p className="caps-label" style={{ marginBottom: '10px', padding: '0 4px', color: 'var(--red)' }}>Danger Zone</p>
                <div className="settings-card" style={{ borderColor: 'rgba(255,59,48,0.15)' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px',
                  }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.015em' }}>Reset All Settings</div>
                      <div style={{ fontSize: '12px', fontWeight: 400, color: 'var(--t3)', marginTop: '2px' }}>Restore all configuration to factory defaults</div>
                    </div>
                    <button style={{
                      padding: '8px 16px', borderRadius: '8px',
                      background: 'rgba(255,59,48,0.08)',
                      border: '0.5px solid rgba(255,59,48,0.20)',
                      fontSize: '12.5px', fontWeight: 600, color: '#ff3b30',
                      cursor: 'pointer',
                      transition: 'all 0.15s var(--ease-apple)',
                    }}
                      onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(255,59,48,0.14)'; }}
                      onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(255,59,48,0.08)'; }}
                    >Reset</button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
