import React from 'react'
import { Box, Card, Typography } from '@mui/material'
import { Sun, Home, Zap, Car } from 'lucide-react'

interface EnergyFlowPanelProps {
  solarW: number
  householdDemandW: number
  gridImportW: number
  teslaChargingAmps: number
  teslaChargingKw: number
  chargingState: string
  chargePortConnected: boolean
  tessieEnabled?: boolean
}

function fmt(w: number): string {
  return w >= 1000 ? `${(w / 1000).toFixed(1)}kW` : `${Math.round(w)}W`
}

function fmtComma(w: number): string {
  return Math.round(w).toLocaleString()
}

export function EnergyFlowPanel({
  solarW,
  householdDemandW,
  gridImportW,
  teslaChargingAmps,
  teslaChargingKw,
  chargingState,
  chargePortConnected,
  tessieEnabled = true,
}: EnergyFlowPanelProps) {
  const teslaW = teslaChargingKw * 1000
  const isCharging = chargingState === 'Charging' && chargePortConnected
  const teslaColor = tessieEnabled ? '#22c55e' : '#4a6382'
  const teslaOpacity = tessieEnabled ? 1 : 0.4
  return (
    <Card
      sx={{
        p: 3,
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
      className="pt-[24px] pb-[24px] pl-[24px] pr-[24px]"
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          textTransform: 'uppercase',
          letterSpacing: 1,
          mb: 3,
          display: 'block',
        }}
      >
        Solar → Tesla Live
      </Typography>

      <Box
        sx={{
          display: 'flex',
          alignItems: {
            xs: 'stretch',
            md: 'center',
          },
          flexDirection: {
            xs: 'column',
            md: 'row',
          },
          gap: 0,
        }}
      >
        {/* SVG: horizontal flow diagram */}
        <Box
          sx={{
            flexGrow: 1,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <svg
            width="100%"
            height="230"
            viewBox="0 -25 700 230"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <marker
                id="arrow-yellow"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L8,3 z" fill="#f5c518" opacity="0.7" />
              </marker>
              <marker
                id="arrow-green"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L8,3 z" fill="#22c55e" opacity="0.7" />
              </marker>
              <marker
                id="arrow-blue"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L8,3 z" fill="#3b82f6" opacity="0.7" />
              </marker>
              <filter
                id="glow-green"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* === NODES === */}

            {/* Solar — far left */}
            <g transform="translate(90, 90)">
              <circle
                cx="0"
                cy="0"
                r="38"
                fill="#1e2d40"
                stroke="#f5c518"
                strokeWidth="2"
              />
              <foreignObject x="-14" y="-14" width="28" height="28">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                  }}
                >
                  <Sun size={22} color="#f5c518" />
                </div>
              </foreignObject>
              <text
                x="0"
                y="-48"
                textAnchor="middle"
                fill="#8da4be"
                fontSize="10"
                letterSpacing="1"
              >
                SOLAR
              </text>
              <text
                x="0"
                y="54"
                textAnchor="middle"
                fill="#f5c518"
                fontSize="13"
                fontWeight="bold"
              >
                {fmtComma(solarW)}W
              </text>
            </g>

            {/* Solar → Home line */}
            <path
              d="M132 90 L238 90"
              stroke="#f5c518"
              strokeWidth="1.5"
              fill="none"
              opacity="0.2"
            />
            <path
              d="M132 90 L238 90"
              stroke="#f5c518"
              strokeWidth="1.5"
              fill="none"
              className="flow-line"
              markerEnd="url(#arrow-yellow)"
            />
            <text
              x="185"
              y="82"
              textAnchor="middle"
              fill="#f5c518"
              fontSize="10"
              opacity="0.8"
            >
              {fmt(solarW)}
            </text>

            {/* Home — center */}
            <g transform="translate(280, 90)">
              <circle
                cx="0"
                cy="0"
                r="38"
                fill="#1e2d40"
                stroke="#14b8a6"
                strokeWidth="2"
              />
              <foreignObject x="-14" y="-14" width="28" height="28">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                  }}
                >
                  <Home size={22} color="#14b8a6" />
                </div>
              </foreignObject>
              <text
                x="0"
                y="-48"
                textAnchor="middle"
                fill="#8da4be"
                fontSize="10"
                letterSpacing="1"
              >
                HOME
              </text>
              <text
                x="0"
                y="54"
                textAnchor="middle"
                fill="#14b8a6"
                fontSize="13"
                fontWeight="bold"
              >
                {fmtComma(householdDemandW)}W
              </text>
            </g>

            {/* Home → Tesla line (upper right) */}
            <path
              d="M312 68 L428 38"
              stroke={teslaColor}
              strokeWidth="1.5"
              fill="none"
              opacity={tessieEnabled ? 0.2 : 0.1}
            />
            <path
              d="M312 68 L428 38"
              stroke={teslaColor}
              strokeWidth="1.5"
              fill="none"
              className={tessieEnabled ? 'flow-line' : undefined}
              markerEnd={tessieEnabled ? 'url(#arrow-green)' : undefined}
              opacity={teslaOpacity}
            />
            <text
              x="375"
              y="42"
              textAnchor="middle"
              fill={teslaColor}
              fontSize="10"
              opacity={tessieEnabled ? 0.8 : 0.4}
            >
              {tessieEnabled ? `${fmt(teslaW)} · ${teslaChargingAmps}A` : '—'}
            </text>

            {/* Home → Grid line (lower right) */}
            <path
              d="M312 112 L428 142"
              stroke="#3b82f6"
              strokeWidth="1.5"
              fill="none"
              opacity="0.2"
            />
            <path
              d="M312 112 L428 142"
              stroke="#3b82f6"
              strokeWidth="1.5"
              fill="none"
              className="flow-line"
              markerEnd="url(#arrow-blue)"
            />
            <text
              x="375"
              y="140"
              textAnchor="middle"
              fill="#3b82f6"
              fontSize="10"
              opacity="0.8"
            >
              {gridImportW >= 0 ? '+' : ''}{fmt(Math.abs(gridImportW))}
            </text>

            {/* Tesla — upper right (HERO) */}
            <g transform="translate(470, 32)" opacity={teslaOpacity}>
              <circle
                className={tessieEnabled ? 'pulsing-dot' : undefined}
                cx="0"
                cy="0"
                r="38"
                fill="#1e2d40"
                stroke={teslaColor}
                strokeWidth="3"
                filter={tessieEnabled ? 'url(#glow-green)' : undefined}
              />
              <foreignObject x="-14" y="-14" width="28" height="28">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                  }}
                >
                  <Car size={22} color={teslaColor} />
                </div>
              </foreignObject>
              <text
                x="0"
                y="-48"
                textAnchor="middle"
                fill={teslaColor}
                fontSize="11"
                letterSpacing="1"
                fontWeight="bold"
              >
                TESLA
              </text>
              <text
                x="0"
                y="54"
                textAnchor="middle"
                fill={teslaColor}
                fontSize="13"
                fontWeight="bold"
              >
                {!tessieEnabled ? 'DISCONNECTED' : isCharging ? 'CHARGING' : chargePortConnected ? 'PLUGGED IN' : 'OFFLINE'}
              </text>
            </g>

            {/* Grid — lower right (Secondary) */}
            <g transform="translate(470, 148)">
              <circle
                cx="0"
                cy="0"
                r="28"
                fill="#1e2d40"
                stroke="#3b82f6"
                strokeWidth="1.5"
                opacity="0.7"
              />
              <foreignObject x="-11" y="-11" width="22" height="22">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                  }}
                >
                  <Zap size={18} color="#3b82f6" opacity={0.7} />
                </div>
              </foreignObject>
              <text
                x="0"
                y="-38"
                textAnchor="middle"
                fill="#8da4be"
                fontSize="10"
                letterSpacing="1"
              >
                GRID
              </text>
              <text
                x="0"
                y="42"
                textAnchor="middle"
                fill="#3b82f6"
                fontSize="11"
                fontWeight="bold"
              >
                {gridImportW >= 0 ? '+' : ''}{fmt(Math.abs(gridImportW))}
              </text>
            </g>
          </svg>
        </Box>

        {/* Stats: 4 columns on desktop, 2×2 grid on mobile */}
        <Box
          sx={{
            display: {
              xs: 'grid',
              md: 'flex',
            },
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: {
              xs: 0,
              md: 0,
            },
            borderLeft: {
              xs: 'none',
              md: '1px solid #2a3f57',
            },
            borderTop: {
              xs: '1px solid #2a3f57',
              md: 'none',
            },
            pt: {
              xs: 2,
              md: 0,
            },
            mt: {
              xs: 1,
              md: 0,
            },
            pl: {
              xs: 0,
              md: 4,
            },
            ml: {
              xs: 0,
              md: 2,
            },
            flexShrink: 0,
          }}
        >
          {[
            {
              label: 'SOLAR YIELD',
              value: fmtComma(solarW),
              unit: 'W',
              color: '#f5c518',
            },
            {
              label: 'HOME DEMAND',
              value: fmtComma(householdDemandW),
              unit: 'W',
              color: '#14b8a6',
            },
            {
              label: 'GRID IMPORT',
              value: `${gridImportW >= 0 ? '+' : ''}${fmtComma(Math.abs(gridImportW))}`,
              unit: 'W',
              color: '#3b82f6',
            },
            {
              label: 'CHARGING',
              value: tessieEnabled ? String(teslaChargingAmps) : '—',
              unit: tessieEnabled ? 'A' : '',
              color: teslaColor,
            },
          ].map((stat, i) => (
            <Box
              key={i}
              sx={{
                px: {
                  xs: 1.5,
                  md: 3,
                },
                py: {
                  xs: 1.5,
                  md: 0,
                },
                borderRight: {
                  xs: i % 2 === 0 ? '1px solid #2a3f57' : 'none',
                  md: i < 3 ? '1px solid #2a3f57' : 'none',
                },
                borderBottom: {
                  xs: i < 2 ? '1px solid #2a3f57' : 'none',
                  md: 'none',
                },
                textAlign: 'center',
                minWidth: {
                  xs: 0,
                  md: 90,
                },
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  display: 'block',
                  mb: 1,
                  fontSize: {
                    xs: '0.6rem',
                    md: undefined,
                  },
                }}
              >
                {stat.label}
              </Typography>
              <Typography
                variant="h5"
                fontWeight="700"
                color={stat.color}
                sx={{
                  lineHeight: 1,
                }}
              >
                {stat.value}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {stat.unit}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Card>
  )
}
