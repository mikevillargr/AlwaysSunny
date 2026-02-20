import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Card,
  Box,
  Typography,
  Slider,
  TextField,
  LinearProgress,
  Divider,
  InputAdornment,
} from '@mui/material'
import {
  BatteryCharging,
  Zap,
  Clock,
  Sun,
  Activity,
  Infinity,
} from 'lucide-react'
import { apiFetch } from '../lib/api'

interface ChargingControlsProps {
  teslaSoc: number
  gridImportW: number
  gridBudgetTotalKwh: number
  gridBudgetUsedKwh: number
  gridBudgetPct: number
}

export function ChargingControls({
  teslaSoc,
  gridImportW,
  gridBudgetTotalKwh,
  gridBudgetUsedKwh,
  gridBudgetPct,
}: ChargingControlsProps) {
  const [targetSoC, setTargetSoC] = useState<number>(80)
  const [gridBudget, setGridBudget] = useState<number>(25)
  const [gridImportLimit, setGridImportLimit] = useState<number>(4000)
  const [departureTime, setDepartureTime] = useState<string>('07:00')
  const [departurePeriod, setDeparturePeriod] = useState<'AM' | 'PM'>('AM')
  const [chargingMode, setChargingMode] = useState<'departure' | 'solar'>(
    'departure',
  )
  const [noBudget, setNoBudget] = useState<boolean>(false)
  const [noLimit, setNoLimit] = useState<boolean>(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load settings from backend on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await apiFetch('/api/settings')
        if (res.ok) {
          const data = await res.json()
          if (data.target_soc) setTargetSoC(data.target_soc)
          if (data.daily_grid_budget_kwh !== undefined) {
            const budget = parseFloat(data.daily_grid_budget_kwh)
            if (budget <= 0) {
              setNoBudget(true)
              setGridBudget(25) // default when re-enabling
            } else {
              setNoBudget(false)
              setGridBudget(budget)
            }
          }
          if (data.max_grid_import_w !== undefined) {
            const limit = parseFloat(data.max_grid_import_w)
            if (limit <= 0) {
              setNoLimit(true)
              setGridImportLimit(4000) // default when re-enabling
            } else {
              setNoLimit(false)
              setGridImportLimit(limit)
            }
          }
          if (data.departure_time) setDepartureTime(data.departure_time)
          if (data.charging_strategy) setChargingMode(data.charging_strategy)
        }
      } catch (e) {
        console.warn('[ChargingControls] Failed to load settings:', e)
      }
      setSettingsLoaded(true)
    }
    loadSettings()
  }, [])

  // Immediate save to backend (for slider commits, pill clicks)
  const saveSettingsNow = useCallback(async (updates: Record<string, unknown>) => {
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify(updates),
      })
    } catch (e) {
      console.warn('[ChargingControls] Failed to save:', e)
    }
  }, [])

  // Debounced save for text inputs
  const saveSettings = useCallback((updates: Record<string, unknown>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => saveSettingsNow(updates), 400)
  }, [saveSettingsNow])
  return (
    <Card
      sx={{
        p: 3,
        mb: 3,
      }}
    >
      {/* Header */}
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
        Charging Controls
      </Typography>

      {/* Horizontal controls row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          flexDirection: {
            xs: 'column',
            md: 'row',
          },
          gap: 0,
        }}
      >
        {/* 1. Charging Strategy */}
        <Box
          sx={{
            flex: 1,
            width: {
              xs: '100%',
              md: 'auto',
            },
            pr: {
              xs: 0,
              md: 3,
            },
            pb: {
              xs: 2.5,
              md: 0,
            },
            borderBottom: {
              xs: '1px solid #2a3f57',
              md: 'none',
            },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mb: 1.5,
            }}
          >
            <Clock size={16} color="#8da4be" />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              Charging Strategy
            </Typography>
          </Box>

          {/* Strategy pill selector */}
          <Box
            sx={{
              display: 'flex',
              gap: 0.75,
              mb: 2,
            }}
          >
            {[
              {
                key: 'departure',
                icon: <Clock size={12} />,
                label: 'Ready by departure',
              },
              {
                key: 'solar',
                icon: <Sun size={12} />,
                label: 'Solar-first',
              },
            ].map(({ key, icon, label }) => {
              const active = chargingMode === key
              return (
                <Box
                  key={key}
                  onClick={() => {
                    setChargingMode(key as 'departure' | 'solar')
                    saveSettingsNow({ charging_strategy: key })
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1.5,
                    py: 0.75,
                    borderRadius: '20px',
                    border: active ? '1px solid #a855f7' : '1px solid #2a3f57',
                    backgroundColor: active
                      ? 'rgba(168,85,247,0.1)'
                      : 'transparent',
                    color: active ? '#a855f7' : '#4a6382',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    userSelect: 'none',
                    '&:hover': {
                      borderColor: active ? '#a855f7' : '#3d5a78',
                      color: active ? '#a855f7' : '#8da4be',
                    },
                  }}
                >
                  {icon}
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.7rem',
                      fontWeight: active ? 600 : 400,
                      letterSpacing: 0.3,
                      color: 'inherit',
                    }}
                  >
                    {label}
                  </Typography>
                </Box>
              )
            })}
          </Box>

          {/* Time picker — only shown in departure mode */}
          <Box
            sx={{
              overflow: 'hidden',
              maxHeight: chargingMode === 'departure' ? '90px' : '0px',
              opacity: chargingMode === 'departure' ? 1 : 0,
              transition: 'max-height 0.25s ease, opacity 0.2s ease',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 0.5,
              }}
            >
              <TextField
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                variant="outlined"
                size="small"
                sx={{
                  width: 120,
                  '& .MuiOutlinedInput-root': {
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    '& fieldset': {
                      borderColor: '#2a3f57',
                    },
                    '&:hover fieldset': {
                      borderColor: '#f0f4f8',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#f0f4f8',
                    },
                  },
                  '& input': {
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    color: '#f0f4f8',
                  },
                  '& input::-webkit-calendar-picker-indicator': {
                    filter: 'invert(0.5)',
                  },
                }}
              />
              {/* AM / PM pill toggle */}
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.5,
                }}
              >
                {(['AM', 'PM'] as const).map((p) => {
                  const active = departurePeriod === p
                  return (
                    <Box
                      key={p}
                      onClick={() => setDeparturePeriod(p)}
                      sx={{
                        px: 1.25,
                        py: 0.5,
                        borderRadius: '12px',
                        cursor: 'pointer',
                        border: active
                          ? '1px solid #f0f4f8'
                          : '1px solid #2a3f57',
                        backgroundColor: active
                          ? 'rgba(240,244,248,0.1)'
                          : 'transparent',
                        color: active ? '#f0f4f8' : '#4a6382',
                        transition: 'all 0.15s ease',
                        userSelect: 'none',
                        '&:hover': {
                          borderColor: '#f0f4f8',
                          color: '#f0f4f8',
                        },
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: active ? 700 : 400,
                          color: 'inherit',
                        }}
                      >
                        {p}
                      </Typography>
                    </Box>
                  )
                })}
              </Box>
            </Box>
            <Typography variant="body2" color="text.secondary">
              leaving in 21h 8m
            </Typography>
          </Box>

          {/* AI intent line */}
          <Typography
            variant="caption"
            sx={{
              color: '#a855f7',
              fontStyle: 'italic',
              display: 'block',
              mt: chargingMode === 'departure' ? 1 : 0,
              transition: 'margin 0.2s',
            }}
          >
            {'Maximize Solar Efficiency'}
          </Typography>
        </Box>

        <Divider
          orientation="vertical"
          flexItem
          sx={{
            borderColor: '#2a3f57',
            display: {
              xs: 'none',
              md: 'block',
            },
          }}
        />

        {/* 2. Target SoC */}
        <Box
          sx={{
            flex: 1,
            width: {
              xs: '100%',
              md: 'auto',
            },
            px: {
              xs: 0,
              md: 3,
            },
            pt: {
              xs: 2.5,
              md: 0,
            },
            pb: {
              xs: 2.5,
              md: 0,
            },
            borderBottom: {
              xs: '1px solid #2a3f57',
              md: 'none',
            },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mb: 1,
            }}
          >
            <BatteryCharging size={16} color="#22c55e" />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              Target SoC
            </Typography>
          </Box>
          <Typography
            variant="h5"
            fontWeight="700"
            color="#22c55e"
            sx={{
              mb: 0.5,
            }}
          >
            {targetSoC}%
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              mb: 1.5,
            }}
          >
            Currently at {teslaSoc}%
          </Typography>
          <Slider
            value={targetSoC}
            onChange={(_, val) => setTargetSoC(val as number)}
            onChangeCommitted={(_, val) => {
              const v = val as number
              setTargetSoC(v)
              saveSettingsNow({ target_soc: v })
            }}
            min={50}
            max={100}
            step={5}
            valueLabelDisplay="auto"
            sx={{
              color: '#22c55e',
              padding: '6px 0',
              '& .MuiSlider-thumb': {
                boxShadow: '0 0 0 8px rgba(34, 197, 94, 0.16)',
              },
              '& .MuiSlider-rail': {
                opacity: 0.2,
              },
            }}
          />
        </Box>

        <Divider
          orientation="vertical"
          flexItem
          sx={{
            borderColor: '#2a3f57',
            display: {
              xs: 'none',
              md: 'block',
            },
          }}
        />

        {/* 3. Grid Budget */}
        <Box
          sx={{
            flex: 1,
            width: {
              xs: '100%',
              md: 'auto',
            },
            px: {
              xs: 0,
              md: 3,
            },
            pt: {
              xs: 2.5,
              md: 0,
            },
            pb: {
              xs: 2.5,
              md: 0,
            },
            borderBottom: {
              xs: '1px solid #2a3f57',
              md: 'none',
            },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              mb: 1,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Zap size={16} color="#3b82f6" />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                }}
              >
                Daily Grid Budget
              </Typography>
            </Box>
            {/* No Budget toggle pill */}
            <Box
              onClick={() => {
                const next = !noBudget
                setNoBudget(next)
                if (next) {
                  // Disable budget → save 0
                  saveSettingsNow({ daily_grid_budget_kwh: 0 })
                } else {
                  // Re-enable → save current value
                  saveSettingsNow({ daily_grid_budget_kwh: gridBudget })
                }
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1.25,
                py: 0.4,
                borderRadius: '20px',
                border: noBudget ? '1px solid #3b82f6' : '1px solid #2a3f57',
                backgroundColor: noBudget
                  ? 'rgba(59,130,246,0.12)'
                  : 'transparent',
                color: noBudget ? '#3b82f6' : '#4a6382',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                userSelect: 'none',
                flexShrink: 0,
                '&:hover': {
                  borderColor: '#3b82f6',
                  color: '#3b82f6',
                },
              }}
            >
              <Infinity size={11} />
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.65rem',
                  fontWeight: noBudget ? 600 : 400,
                  color: 'inherit',
                  letterSpacing: 0.3,
                }}
              >
                No Budget
              </Typography>
            </Box>
          </Box>

          {noBudget ? (
            <Box
              sx={{
                py: 0.5,
              }}
            >
              <Typography
                variant="h5"
                fontWeight="700"
                color="#3b82f6"
                sx={{
                  mb: 0.5,
                  opacity: 0.5,
                }}
              >
                ∞
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: '#4a6382',
                  display: 'block',
                }}
              >
                No daily grid limit set
              </Typography>
            </Box>
          ) : (
            <>
              <TextField
                type="number"
                value={gridBudget}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  setGridBudget(v)
                  saveSettings({ daily_grid_budget_kwh: v })
                }}
                variant="outlined"
                size="small"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Typography variant="caption" color="text.secondary">
                        KW
                      </Typography>
                    </InputAdornment>
                  ),
                  inputProps: {
                    min: 0,
                    max: 20,
                    step: 0.5,
                  },
                }}
                sx={{
                  width: 100,
                  mb: 1.5,
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: '#2a3f57',
                    },
                    '&:hover fieldset': {
                      borderColor: '#3b82f6',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#3b82f6',
                    },
                  },
                }}
              />
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  mb: 0.5,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {gridBudgetUsedKwh.toFixed(1)} kWh used
                </Typography>
                <Typography variant="caption" fontWeight="600" color="#3b82f6">
                  {Math.round(gridBudgetPct)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, gridBudgetPct)}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: '#1e2d40',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: '#3b82f6',
                    borderRadius: 3,
                  },
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  color: '#4a6382',
                  display: 'block',
                  mt: 0.5,
                }}
              >
                Resets at midnight
              </Typography>
            </>
          )}
        </Box>

        <Divider
          orientation="vertical"
          flexItem
          sx={{
            borderColor: '#2a3f57',
            display: {
              xs: 'none',
              md: 'block',
            },
          }}
        />

        {/* 4. Grid Import Limit */}
        <Box
          sx={{
            flex: 1,
            width: {
              xs: '100%',
              md: 'auto',
            },
            pl: {
              xs: 0,
              md: 3,
            },
            pt: {
              xs: 2.5,
              md: 0,
            },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              mb: 1,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Activity size={16} color="#f59e0b" />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                }}
              >
                Grid Import Limit
              </Typography>
            </Box>
            {/* No Limit toggle pill */}
            <Box
              onClick={() => {
                const next = !noLimit
                setNoLimit(next)
                if (next) {
                  // Disable limit → save 0
                  saveSettingsNow({ max_grid_import_w: 0 })
                } else {
                  // Re-enable → save current value
                  saveSettingsNow({ max_grid_import_w: gridImportLimit })
                }
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1.25,
                py: 0.4,
                borderRadius: '20px',
                border: noLimit ? '1px solid #f59e0b' : '1px solid #2a3f57',
                backgroundColor: noLimit
                  ? 'rgba(245,158,11,0.12)'
                  : 'transparent',
                color: noLimit ? '#f59e0b' : '#4a6382',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                userSelect: 'none',
                flexShrink: 0,
                '&:hover': {
                  borderColor: '#f59e0b',
                  color: '#f59e0b',
                },
              }}
            >
              <Infinity size={11} />
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.65rem',
                  fontWeight: noLimit ? 600 : 400,
                  color: 'inherit',
                  letterSpacing: 0.3,
                }}
              >
                No Limit
              </Typography>
            </Box>
          </Box>

          {noLimit ? (
            <Box
              sx={{
                py: 0.5,
              }}
            >
              <Typography
                variant="h5"
                fontWeight="700"
                color="#f59e0b"
                sx={{
                  mb: 0.5,
                  opacity: 0.5,
                }}
              >
                ∞
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: '#4a6382',
                  display: 'block',
                }}
              >
                Unrestricted grid import
              </Typography>
            </Box>
          ) : (
            <>
              <TextField
                type="number"
                value={gridImportLimit}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  setGridImportLimit(v)
                  saveSettings({ max_grid_import_w: v })
                }}
                variant="outlined"
                size="small"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Typography variant="caption" color="text.secondary">
                        W
                      </Typography>
                    </InputAdornment>
                  ),
                  inputProps: {
                    min: 0,
                    max: 20000,
                    step: 50,
                  },
                }}
                sx={{
                  width: 110,
                  mb: 1.5,
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: '#2a3f57',
                    },
                    '&:hover fieldset': {
                      borderColor: '#f59e0b',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#f59e0b',
                    },
                  },
                }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: 'block',
                  mb: 0.5,
                }}
              >
                Currently importing {Math.round(gridImportW)}W
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: '#4a6382',
                  display: 'block',
                }}
              >
                Tesla throttles to stay under limit
              </Typography>
            </>
          )}
        </Box>
      </Box>
    </Card>
  )
}
