'use client';

import { useState, useEffect, useRef } from "react";
import { Activity, ArrowUpRight, ArrowDownRight, ChevronRight, Droplets, Thermometer, Gauge, Zap, CircleDot, Cpu, BarChart2, Shield, Bell, Sliders, Moon, Sun, Clock, Database, Wifi, Lock, Eye, Download, RefreshCw } from "lucide-react";
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
  const [predictedData, setPredictedData] = useState<any>(null);
  const [liveAnalytics, setLiveAnalytics] = useState<any[]>([]);
  const [liveTelemetry, setLiveTelemetry] = useState<any[]>([]);
  const [lastSync, setLastSync] = useState("Just now");
  const [isHeaterLoading, setIsHeaterLoading] = useState(false);

  const handleHeaterToggle = async () => {
    if (!liveData.connected) return;
    
    setIsHeaterLoading(true);
    const newStatus = liveData.Q > 0 ? "OFF" : "ON";
    const command = `HEATER:${newStatus}`;
    
    try {
      const res = await fetch('/api/arduino', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command })
      });
      
      if (!res.ok) throw new Error("Failed to send command");
      console.log(`Heater command sent: ${command}`);
    } catch (e) {
      console.error("Heater control error:", e);
    } finally {
      // Small delay to let hardware respond before UI settles
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

  // Polling loop for Arduino Data
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchArduinoData = async () => {
      try {
        const res = await fetch('/api/arduino');
        if (!res.ok) throw new Error("Failed to fetch telemetry");
        const data: LiveData = await res.json();
        setLiveData(data);

        // Fetch prediction (T+300s)
        const predRes = await fetch('/api/arduino?predict=true');
        if (predRes.ok) {
          const pData = await predRes.json();
          setPredictedData(pData);
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
            l: (data.mw * 10).toFixed(1), // Flow L/min
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
            waterLevel: data.mw * 10,
            // Map actual metrics to the 0-100 layout domain for AreaChart
            vP: data.connected ? Math.min(100, Math.max(0, (pGauge / 0.3) * 100)) : 0, 
            vT: data.connected ? Math.min(100, Math.max(0, (data.T / 150) * 100)) : 0, 
            vW: data.connected ? Math.min(100, Math.max(0, data.mw * 10)) : 0 
          }];
          if (next.length > 50) next.shift();
          return next;
        });
        
      } catch (e) {
        console.error("Arduino polling error:", e);
        setLiveData(prev => ({ ...prev, connected: false }));
      }
    };

    if (settings.autoSync) {
      interval = setInterval(fetchArduinoData, 2000);
      fetchArduinoData(); // Fetch immediately
    }

    return () => clearInterval(interval);
  }, [settings.autoSync]);

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

  // Generate dynamic PREDICTED_STAT_CARDS from physics model results
  const PREDICTED_STAT_CARDS = CURRENT_STAT_CARDS.map(card => {
    // Fallback to mock scale if prediction hasn't loaded yet
    const hasPred = predictedData && liveData.connected;
    let predValue: number;
    let desc = "Prediction at t + 300s";

    if (hasPred) {
      if (card.label === 'Pressure') predValue = predictedData.P - 1.013;
      else if (card.label === 'Temperature') predValue = predictedData.T;
      else if (card.label === 'Flow Rate') predValue = predictedData.mw;
      else if (card.label === 'Heat Power') predValue = predictedData.Q / 1000;
      else predValue = parseFloat(card.value as string);
    } else {
      predValue = parseFloat(card.value as string) * 1.0; // Identity if no data
      desc = liveData.connected ? "Calculating..." : "Offline";
    }

    return {
      ...card,
      value: Math.max(0, predValue).toFixed(card.label === 'Temperature' || card.label === 'Flow Rate' || card.label === 'Heat Power' ? 1 : 2),
      description: desc,
      bar: card.label === 'Pressure' ? Math.min(100, Math.max(0, (predValue / 0.3) * 100)) : 
           card.label === 'Temperature' ? Math.min(100, Math.max(0, (predValue / 150) * 100)) : card.bar,
      sparkData: card.sparkData // Keep current spark for UI consistency
    };
  });

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

          {/* ── Stat Cards (Predicted State) ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <p className="caps-label" style={{ margin: 0 }}>Predicted State (t + 300s)</p>
          </div>
          <div
            className="stat-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '12px' }}
          >
            {PREDICTED_STAT_CARDS.map((card, i) => (
              <StatCard key={`${card.id}_pred`} card={card} index={i} />
            ))}
          </div>

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
                <BoilerSchematic />
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

              {/* Quick Actions */}
              <div className="card" style={{ padding: '18px 20px' }}>
                <p className="caps-label" style={{ marginBottom: '14px' }}>Quick Actions</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {/* Heater Control Button */}
                  <button 
                    onClick={handleHeaterToggle}
                    disabled={!liveData.connected || isHeaterLoading}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', borderRadius: '11px',
                      background: !liveData.connected ? 'rgba(0,0,0,0.05)' : (liveData.Q > 0 ? 'linear-gradient(135deg, #FF3B30 0%, #D70015 100%)' : 'linear-gradient(135deg, #34C759 0%, #248A3D 100%)'),
                      fontSize: '13.5px', fontWeight: 600, color: '#fff', letterSpacing: '-0.015em',
                      boxShadow: !liveData.connected ? 'none' : (liveData.Q > 0 ? '0 4px 16px rgba(255,59,48,0.30)' : '0 4px 16px rgba(52,199,89,0.30)'),
                      transition: 'all 0.18s var(--ease-apple)',
                      cursor: liveData.connected && !isHeaterLoading ? 'pointer' : 'not-allowed',
                      border: 'none',
                      opacity: liveData.connected ? 1 : 0.5,
                    }}
                    onMouseEnter={e => { if(liveData.connected && !isHeaterLoading) { (e.currentTarget).style.transform = 'translateY(-1px)'; (e.currentTarget).style.filter = 'brightness(1.1)'; } }}
                    onMouseLeave={e => { if(liveData.connected && !isHeaterLoading) { (e.currentTarget).style.transform = 'translateY(0)'; (e.currentTarget).style.filter = 'none'; } }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isHeaterLoading ? <RefreshCw className="animate-spin" size={14} /> : <Zap size={14} />}
                      {liveData.Q > 0 ? 'Stop Heater' : 'Start Heater'}
                    </div>
                    <ChevronRight style={{ width: '14px', height: '14px', opacity: 0.75 }} />
                  </button>

                  <button className="btn-primary-premium" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: '11px',
                    background: 'linear-gradient(135deg, #0077ed 0%, #0051a8 100%)',
                    fontSize: '13.5px', fontWeight: 600, color: '#fff', letterSpacing: '-0.015em',
                    boxShadow: '0 4px 16px rgba(0,113,227,0.30), inset 0 1px 0 rgba(255,255,255,0.12)',
                    transition: 'all 0.18s var(--ease-apple)',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                    onMouseEnter={e => { (e.currentTarget).style.boxShadow = '0 6px 24px rgba(0,113,227,0.45)'; (e.currentTarget).style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { (e.currentTarget).style.boxShadow = '0 4px 16px rgba(0,113,227,0.30)'; (e.currentTarget).style.transform = 'translateY(0)'; }}
                  >
                    Run Simulation
                    <ChevronRight style={{ width: '14px', height: '14px', opacity: 0.75 }} />
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
                    {row.l} <span style={{ fontSize: '10px', color: 'var(--t3)', fontWeight: 400 }}>%</span>
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
                        {row.l} <span style={{ fontSize: '10px', color: 'var(--t3)', fontWeight: 400 }}>%</span>
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
                  title="Water Level" value={(liveData.mw * 10).toFixed(1)} unit="%"
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
