import { ResponsiveContainer, AreaChart, Area, CartesianGrid, YAxis, Tooltip } from 'recharts';

export function GlowMetricCard({ title, value, unit, data, dataKey, color, colorEnd, icon: Icon, glowColor }: any) {
  const values = data.map((d: any) => d[dataKey]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * 0.4;
  const gradId = `glow-grad-${dataKey}`;
  const filterId = `glow-filter-${dataKey}`;
  const strokeGradId = `stroke-grad-${dataKey}`;
  
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', height: '340px',
      display: 'flex', flexDirection: 'column',
      background: 'linear-gradient(165deg, rgba(39, 39, 42, 0.7) 0%, rgba(24, 24, 27, 0.8) 50%, rgba(9, 9, 11, 0.95) 100%)',
      backdropFilter: 'blur(12px)',
      borderRadius: 'var(--r-lg)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: `0 8px 40px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 60px ${glowColor}08`,
      transition: 'all 0.4s var(--ease-apple)',
    }}
      onMouseEnter={e => { (e.currentTarget).style.boxShadow = `0 12px 48px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.15), 0 0 80px ${glowColor}15`; (e.currentTarget).style.transform = 'translateY(-3px)'; }}
      onMouseLeave={e => { (e.currentTarget).style.boxShadow = `0 8px 40px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 60px ${glowColor}08`; (e.currentTarget).style.transform = 'translateY(0)'; }}
    >
      {/* Ambient glow orb */}
      <div style={{
        position: 'absolute', top: '-30px', right: '-30px',
        width: '180px', height: '180px',
        background: `radial-gradient(circle, ${glowColor}15, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: '15%', right: '15%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${color}60, transparent)`,
      }} />

      {/* Header */}
      <div style={{ padding: '22px 24px 0', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <div style={{
            padding: '5px', borderRadius: '7px',
            background: `${color}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 12px ${color}15`,
          }}>
            <Icon style={{ width: '14px', height: '14px', color: color }} strokeWidth={2} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.01em' }}>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span className="font-display" style={{
            fontSize: '38px', fontWeight: 600, letterSpacing: '-0.035em',
            color: '#fff', lineHeight: 1,
            textShadow: `0 0 30px ${glowColor}30`,
          }}>{value}</span>
          <span style={{ fontSize: '16px', fontWeight: 500, color: 'rgba(255,255,255,0.3)' }}>{unit}</span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, marginTop: '-10px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
            <defs>
              {/* Gradient stroke */}
              <linearGradient id={strokeGradId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={color} />
                <stop offset="100%" stopColor={colorEnd} />
              </linearGradient>
              {/* Fill gradient */}
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.30} />
                <stop offset="40%" stopColor={color} stopOpacity={0.12} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
              {/* Glow filter */}
              <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                <feFlood floodColor={color} floodOpacity="0.4" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
            <YAxis hide domain={[min - padding, max + padding]} />
            <Tooltip
              cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div style={{
                      background: 'rgba(15,15,25,0.92)', backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.08)', padding: '6px 14px', borderRadius: '8px',
                      boxShadow: `0 4px 20px rgba(0,0,0,0.3), 0 0 15px ${color}15`,
                      fontSize: '14px', fontWeight: 600, color: '#fff',
                    }}>
                      <span className="num">{parseFloat(payload[0].value as string).toFixed(2)}</span>
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginLeft: '4px' }}>{unit}</span>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={2.5}
              fill={`url(#${gradId})`}
              filter={`url(#${filterId})`}
              activeDot={{ r: 5, fill: color, stroke: '#fff', strokeWidth: 1.5, filter: `drop-shadow(0 0 6px ${color})` }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
