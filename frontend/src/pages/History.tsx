import React, { useState } from 'react'
import {
  Box,
  Card,
  Typography,
  Grid,
  Tabs,
  Tab,
  Collapse,
  IconButton,
} from '@mui/material'
import { ChevronDown, ChevronUp } from 'lucide-react'
const sessions = [
  {
    id: 1,
    date: 'Thu Feb 19, 2026',
    time: '9:14am → 1:32pm',
    duration: '4h 18m',
    charged: 22.4,
    solar: 18.6,
    grid: 3.8,
    solarPct: 83,
    saved: 186,
    hourly: [
      {
        hour: '9am – 10am',
        solar: 2.8,
        grid: 1.2,
        amps: 6,
        saved: 28,
      },
      {
        hour: '10am – 11am',
        solar: 4.1,
        grid: 0.9,
        amps: 8,
        saved: 41,
      },
      {
        hour: '11am – 12pm',
        solar: 4.8,
        grid: 0.5,
        amps: 10,
        saved: 48,
      },
      {
        hour: '12pm – 1pm',
        solar: 4.6,
        grid: 0.7,
        amps: 9,
        saved: 46,
      },
      {
        hour: '1pm – 1:32pm',
        solar: 2.3,
        grid: 0.5,
        amps: 8,
        saved: 23,
      },
    ],
  },
  {
    id: 2,
    date: 'Wed Feb 18, 2026',
    time: '8:45am → 12:10pm',
    duration: '3h 25m',
    charged: 17.8,
    solar: 16.1,
    grid: 1.7,
    solarPct: 90,
    saved: 174,
    hourly: [
      {
        hour: '8am – 9am',
        solar: 2.1,
        grid: 0.6,
        amps: 6,
        saved: 21,
      },
      {
        hour: '9am – 10am',
        solar: 4.2,
        grid: 0.4,
        amps: 9,
        saved: 42,
      },
      {
        hour: '10am – 11am',
        solar: 5.1,
        grid: 0.3,
        amps: 11,
        saved: 51,
      },
      {
        hour: '11am – 12pm',
        solar: 4.7,
        grid: 0.4,
        amps: 10,
        saved: 47,
      },
      {
        hour: '12pm – 12:10pm',
        solar: 0.0,
        grid: 0.0,
        amps: 0,
        saved: 13,
      },
    ],
  },
  {
    id: 3,
    date: 'Tue Feb 17, 2026',
    time: '10:20am → 2:45pm',
    duration: '4h 25m',
    charged: 24.1,
    solar: 17.9,
    grid: 6.2,
    solarPct: 74,
    saved: 194,
    hourly: [
      {
        hour: '10am – 11am',
        solar: 2.9,
        grid: 1.8,
        amps: 7,
        saved: 29,
      },
      {
        hour: '11am – 12pm',
        solar: 4.3,
        grid: 1.4,
        amps: 9,
        saved: 43,
      },
      {
        hour: '12pm – 1pm',
        solar: 4.6,
        grid: 1.2,
        amps: 10,
        saved: 46,
      },
      {
        hour: '1pm – 2pm',
        solar: 3.8,
        grid: 1.3,
        amps: 8,
        saved: 38,
      },
      {
        hour: '2pm – 2:45pm',
        solar: 2.3,
        grid: 0.5,
        amps: 6,
        saved: 38,
      },
    ],
  },
  {
    id: 4,
    date: 'Mon Feb 16, 2026',
    time: '9:00am → 1:15pm',
    duration: '4h 15m',
    charged: 21.6,
    solar: 19.4,
    grid: 2.2,
    solarPct: 90,
    saved: 210,
    hourly: [
      {
        hour: '9am – 10am',
        solar: 3.2,
        grid: 0.8,
        amps: 7,
        saved: 32,
      },
      {
        hour: '10am – 11am',
        solar: 4.9,
        grid: 0.4,
        amps: 10,
        saved: 49,
      },
      {
        hour: '11am – 12pm',
        solar: 5.4,
        grid: 0.3,
        amps: 12,
        saved: 54,
      },
      {
        hour: '12pm – 1pm',
        solar: 4.8,
        grid: 0.5,
        amps: 10,
        saved: 48,
      },
      {
        hour: '1pm – 1:15pm',
        solar: 1.1,
        grid: 0.2,
        amps: 8,
        saved: 27,
      },
    ],
  },
  {
    id: 5,
    date: 'Sun Feb 15, 2026',
    time: '11:30am → 3:00pm',
    duration: '3h 30m',
    charged: 16.2,
    solar: 10.5,
    grid: 5.7,
    solarPct: 65,
    saved: 114,
    hourly: [
      {
        hour: '11am – 12pm',
        solar: 1.8,
        grid: 1.8,
        amps: 6,
        saved: 18,
      },
      {
        hour: '12pm – 1pm',
        solar: 3.2,
        grid: 1.4,
        amps: 8,
        saved: 32,
      },
      {
        hour: '1pm – 2pm',
        solar: 3.1,
        grid: 1.5,
        amps: 7,
        saved: 31,
      },
      {
        hour: '2pm – 3pm',
        solar: 2.4,
        grid: 1.0,
        amps: 6,
        saved: 33,
      },
    ],
  },
  {
    id: 6,
    date: 'Sat Feb 14, 2026',
    time: '8:30am → 1:45pm',
    duration: '5h 15m',
    charged: 28.3,
    solar: 25.1,
    grid: 3.2,
    solarPct: 89,
    saved: 272,
    hourly: [
      {
        hour: '8am – 9am',
        solar: 2.4,
        grid: 1.0,
        amps: 6,
        saved: 24,
      },
      {
        hour: '9am – 10am',
        solar: 4.6,
        grid: 0.6,
        amps: 9,
        saved: 46,
      },
      {
        hour: '10am – 11am',
        solar: 5.8,
        grid: 0.4,
        amps: 12,
        saved: 58,
      },
      {
        hour: '11am – 12pm',
        solar: 5.9,
        grid: 0.3,
        amps: 13,
        saved: 59,
      },
      {
        hour: '12pm – 1pm',
        solar: 4.8,
        grid: 0.6,
        amps: 10,
        saved: 48,
      },
      {
        hour: '1pm – 1:45pm',
        solar: 1.6,
        grid: 0.3,
        amps: 7,
        saved: 37,
      },
    ],
  },
]
function SessionCard({ session }: { session: any }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <Card
      sx={{
        mb: 2,
        p: 2,
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight="600" color="text.primary">
            {session.date}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {session.time} · {session.duration}
          </Typography>
        </Box>
        <Box
          sx={{
            textAlign: 'right',
          }}
        >
          <Typography variant="h6" fontWeight="700" color="#22c55e">
            ₱{session.saved}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Saved
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          mb: 1,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            mb: 0.5,
          }}
        >
          <Typography variant="body2" color="text.primary">
            Charged: {session.charged} kWh
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {session.solarPct}% Solar
          </Typography>
        </Box>

        {/* Progress Bar */}
        <Box
          sx={{
            display: 'flex',
            height: 8,
            borderRadius: 4,
            overflow: 'hidden',
            width: '100%',
          }}
        >
          <Box
            sx={{
              width: `${session.solarPct}%`,
              bgcolor: '#f5c518',
            }}
          />
          <Box
            sx={{
              flexGrow: 1,
              bgcolor: '#3b82f6',
            }}
          />
        </Box>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            mt: 0.5,
          }}
        >
          <Typography variant="caption" color="#f5c518">
            Solar: {session.solar} kWh
          </Typography>
          <Typography variant="caption" color="#3b82f6">
            Grid: {session.grid} kWh
          </Typography>
        </Box>
      </Box>

      <Collapse in={expanded}>
        <Box
          sx={{
            mt: 2,
            pt: 2,
            borderTop: '1px solid #2a3f57',
          }}
        >
          {/* Column headers */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              mb: 1,
              px: 0.5,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                flex: '0 0 110px',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Hour
            </Typography>
            <Box
              sx={{
                flex: 1,
                mr: 1,
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Solar / Grid
              </Typography>
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                flex: '0 0 44px',
                textAlign: 'right',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Amps
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                flex: '0 0 60px',
                textAlign: 'right',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Saved
            </Typography>
          </Box>

          {session.hourly.map((row: any, i: number) => {
            const total = row.solar + row.grid || 1
            const solarPct = Math.round((row.solar / total) * 100)
            return (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  py: 0.75,
                  px: 0.5,
                  borderRadius: 1,
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.03)',
                  },
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    flex: '0 0 110px',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.hour}
                </Typography>

                {/* Mini stacked bar */}
                <Box
                  sx={{
                    flex: 1,
                    mr: 1,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      height: 6,
                      borderRadius: 3,
                      overflow: 'hidden',
                      bgcolor: '#1e2d40',
                      mb: 0.4,
                    }}
                  >
                    <Box
                      sx={{
                        width: `${solarPct}%`,
                        bgcolor: '#f5c518',
                        transition: 'width 0.3s',
                      }}
                    />
                    <Box
                      sx={{
                        flexGrow: 1,
                        bgcolor: '#3b82f6',
                      }}
                    />
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 1.5,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#f5c518',
                        fontSize: '0.65rem',
                      }}
                    >
                      ☀ {row.solar} kWh
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#3b82f6',
                        fontSize: '0.65rem',
                      }}
                    >
                      ⚡ {row.grid} kWh
                    </Typography>
                  </Box>
                </Box>

                <Typography
                  variant="caption"
                  color="text.primary"
                  sx={{
                    flex: '0 0 44px',
                    textAlign: 'right',
                    fontWeight: 600,
                  }}
                >
                  {row.amps}A
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    flex: '0 0 60px',
                    textAlign: 'right',
                    color: '#22c55e',
                    fontWeight: 600,
                  }}
                >
                  ₱{row.saved}
                </Typography>
              </Box>
            )
          })}
        </Box>
      </Collapse>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          mt: -1,
        }}
      >
        {expanded ? (
          <ChevronUp size={16} color="#4a6382" />
        ) : (
          <ChevronDown size={16} color="#4a6382" />
        )}
      </Box>
    </Card>
  )
}
export function History() {
  const [tabValue, setTabValue] = useState(0)
  return (
    <Box
      sx={{
        maxWidth: 1000,
        mx: 'auto',
        p: {
          xs: 2,
          md: 3,
        },
      }}
    >
      <Typography
        variant="h4"
        fontWeight="700"
        sx={{
          mb: 3,
        }}
      >
        Session History
      </Typography>

      {/* Summary Stats */}
      <Grid
        container
        spacing={2}
        justifyContent="center"
        sx={{
          mb: 4,
        }}
      >
        {[
          {
            label: 'All-time solar charged',
            value: '284 kWh',
          },
          {
            label: 'All-time saved',
            value: '₱2,840',
            color: '#22c55e',
          },
          {
            label: 'Avg solar subsidy',
            value: '79%',
            color: '#f5c518',
          },
          {
            label: 'Sessions this month',
            value: '14',
          },
        ].map((stat, index) => (
          <Grid item xs={6} sm={3} md={2.5} key={index}>
            <Card
              sx={{
                p: 2,
                textAlign: 'center',
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  textTransform: 'uppercase',
                }}
              >
                {stat.label}
              </Typography>
              <Typography
                variant="h5"
                fontWeight="700"
                color={stat.color || 'text.primary'}
                sx={{
                  mt: 1,
                }}
              >
                {stat.value}
              </Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Tabs */}
      <Box
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          mb: 3,
        }}
      >
        <Tabs
          value={tabValue}
          onChange={(e, v) => setTabValue(v)}
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab label="This Month" />
          <Tab label="Last Month" />
          <Tab label="All Time" />
        </Tabs>
      </Box>

      {/* Session List */}
      <Box>
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} />
        ))}
      </Box>
    </Box>
  )
}
