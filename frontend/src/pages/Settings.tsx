import React, { useState } from 'react'
import {
  Box,
  Card,
  Typography,
  TextField,
  FormControlLabel,
  Button,
  Switch,
  Divider,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Fade,
  Chip,
} from '@mui/material'
import { Check, Globe } from 'lucide-react'
export function Settings() {
  const [currency, setCurrency] = useState('PHP')
  const [unit, setUnit] = useState('kWh')
  const [effectiveRate, setEffectiveRate] = useState('10.83')
  const [savedTariff, setSavedTariff] = useState({
    currency: 'PHP',
    unit: 'kWh',
    rate: '10.83',
  })
  const [tariffSaved, setTariffSaved] = useState(false)
  const tariffDirty =
    currency !== savedTariff.currency ||
    unit !== savedTariff.unit ||
    effectiveRate !== savedTariff.rate
  const handleSaveTariff = () => {
    setSavedTariff({
      currency,
      unit,
      rate: effectiveRate,
    })
    setTariffSaved(true)
    setTimeout(() => setTariffSaved(false), 2500)
  }
  // Timezone
  const [timezone, setTimezone] = useState('Asia/Manila')
  const [savedTimezone, setSavedTimezone] = useState('Asia/Manila')
  const [timezoneSaved, setTimezoneSaved] = useState(false)
  const timezoneDirty = timezone !== savedTimezone
  const handleSaveTimezone = () => {
    setSavedTimezone(timezone)
    setTimezoneSaved(true)
    setTimeout(() => setTimezoneSaved(false), 2500)
  }
  // Notification switches — controlled state
  const [notifGridBudget, setNotifGridBudget] = useState(true)
  const [notifSessionComplete, setNotifSessionComplete] = useState(true)
  const [notifAIOverride, setNotifAIOverride] = useState(false)
  const [notifRateReminder, setNotifRateReminder] = useState(true)
  const [telegramId, setTelegramId] = useState('')
  const [savedNotif, setSavedNotif] = useState({
    gridBudget: true,
    sessionComplete: true,
    aiOverride: false,
    rateReminder: true,
    telegramId: '',
  })
  const [notifSaved, setNotifSaved] = useState(false)
  const notifDirty =
    notifGridBudget !== savedNotif.gridBudget ||
    notifSessionComplete !== savedNotif.sessionComplete ||
    notifAIOverride !== savedNotif.aiOverride ||
    notifRateReminder !== savedNotif.rateReminder ||
    telegramId !== savedNotif.telegramId
  const handleSaveNotif = () => {
    setSavedNotif({
      gridBudget: notifGridBudget,
      sessionComplete: notifSessionComplete,
      aiOverride: notifAIOverride,
      rateReminder: notifRateReminder,
      telegramId,
    })
    setNotifSaved(true)
    setTimeout(() => setNotifSaved(false), 2500)
  }
  return (
    <Box
      sx={{
        maxWidth: 800,
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
        Settings
      </Typography>

      {/* Electricity Tariff */}
      <Card
        sx={{
          p: 3,
          mb: 3,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 3,
          }}
        >
          <Typography variant="h6" fontWeight="600">
            Electricity Tariff
          </Typography>
          <Fade in={tariffSaved}>
            <Chip
              icon={<Check size={14} />}
              label="Saved"
              size="small"
              sx={{
                bgcolor: 'rgba(34,197,94,0.12)',
                color: '#22c55e',
                border: '1px solid rgba(34,197,94,0.3)',
                fontWeight: 600,
                '& .MuiChip-icon': {
                  color: '#22c55e',
                },
              }}
            />
          </Fade>
        </Box>

        <Box
          sx={{
            display: 'flex',
            gap: 2,
            flexWrap: 'wrap',
            mb: 3,
          }}
        >
          <FormControl
            sx={{
              minWidth: 140,
            }}
          >
            <InputLabel>Currency</InputLabel>
            <Select
              value={currency}
              label="Currency"
              onChange={(e) => setCurrency(e.target.value)}
            >
              <MenuItem value="PHP">₱ PHP</MenuItem>
              <MenuItem value="USD">$ USD</MenuItem>
              <MenuItem value="EUR">€ EUR</MenuItem>
              <MenuItem value="GBP">£ GBP</MenuItem>
              <MenuItem value="AUD">A$ AUD</MenuItem>
              <MenuItem value="SGD">S$ SGD</MenuItem>
              <MenuItem value="JPY">¥ JPY</MenuItem>
            </Select>
          </FormControl>

          <FormControl
            sx={{
              minWidth: 140,
            }}
          >
            <InputLabel>Unit</InputLabel>
            <Select
              value={unit}
              label="Unit"
              onChange={(e) => setUnit(e.target.value)}
            >
              <MenuItem value="kWh">kWh</MenuItem>
              <MenuItem value="MWh">MWh</MenuItem>
              <MenuItem value="Wh">Wh</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Effective Rate"
            value={effectiveRate}
            onChange={(e) => setEffectiveRate(e.target.value)}
            InputProps={{
              endAdornment: (
                <Typography variant="caption" color="text.secondary">
                  {currency}/{unit}
                </Typography>
              ),
            }}
            sx={{
              width: 180,
            }}
          />
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Set your electricity provider's rate manually. This is used to
            calculate charging costs.
          </Typography>
          <Button
            variant="contained"
            size="small"
            disabled={!tariffDirty}
            onClick={handleSaveTariff}
            sx={{
              ml: 2,
              flexShrink: 0,
              opacity: tariffDirty ? 1 : 0.4,
              transition: 'opacity 0.2s',
            }}
          >
            Save
          </Button>
        </Box>
      </Card>

      {/* Regional Settings */}
      <Card
        sx={{
          p: 3,
          mb: 3,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 3,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Globe size={18} color="#8da4be" />
            <Typography variant="h6" fontWeight="600">
              Regional Settings
            </Typography>
          </Box>
          <Fade in={timezoneSaved}>
            <Chip
              icon={<Check size={14} />}
              label="Saved"
              size="small"
              sx={{
                bgcolor: 'rgba(34,197,94,0.12)',
                color: '#22c55e',
                border: '1px solid rgba(34,197,94,0.3)',
                fontWeight: 600,
                '& .MuiChip-icon': {
                  color: '#22c55e',
                },
              }}
            />
          </Fade>
        </Box>

        <FormControl
          sx={{
            minWidth: 260,
            mb: 3,
          }}
        >
          <InputLabel>Timezone</InputLabel>
          <Select
            value={timezone}
            label="Timezone"
            onChange={(e) => setTimezone(e.target.value)}
          >
            <MenuItem value="Asia/Manila">Asia/Manila (PHT +8)</MenuItem>
            <MenuItem value="Asia/Singapore">Asia/Singapore (SGT +8)</MenuItem>
            <MenuItem value="Asia/Tokyo">Asia/Tokyo (JST +9)</MenuItem>
            <MenuItem value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</MenuItem>
            <MenuItem value="Asia/Dubai">Asia/Dubai (GST +4)</MenuItem>
            <MenuItem value="Europe/London">Europe/London (GMT/BST)</MenuItem>
            <MenuItem value="Europe/Paris">Europe/Paris (CET +1)</MenuItem>
            <MenuItem value="Europe/Berlin">Europe/Berlin (CET +1)</MenuItem>
            <MenuItem value="America/New_York">America/New_York (ET)</MenuItem>
            <MenuItem value="America/Chicago">America/Chicago (CT)</MenuItem>
            <MenuItem value="America/Denver">America/Denver (MT)</MenuItem>
            <MenuItem value="America/Los_Angeles">
              America/Los_Angeles (PT)
            </MenuItem>
            <MenuItem value="America/Sao_Paulo">
              America/Sao_Paulo (BRT −3)
            </MenuItem>
            <MenuItem value="Australia/Sydney">
              Australia/Sydney (AEST +10)
            </MenuItem>
            <MenuItem value="Pacific/Auckland">
              Pacific/Auckland (NZST +12)
            </MenuItem>
            <MenuItem value="UTC">UTC</MenuItem>
          </Select>
        </FormControl>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Used for session timestamps, midnight budget resets, and departure
            scheduling.
          </Typography>
          <Button
            variant="contained"
            size="small"
            disabled={!timezoneDirty}
            onClick={handleSaveTimezone}
            sx={{
              ml: 2,
              flexShrink: 0,
              opacity: timezoneDirty ? 1 : 0.4,
              transition: 'opacity 0.2s',
            }}
          >
            Save
          </Button>
        </Box>
      </Card>

      {/* Notifications */}
      <Card
        sx={{
          p: 3,
          mb: 3,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 2,
          }}
        >
          <Typography variant="h6" fontWeight="600">
            Notifications
          </Typography>
          <Fade in={notifSaved}>
            <Chip
              icon={<Check size={14} />}
              label="Saved"
              size="small"
              sx={{
                bgcolor: 'rgba(34,197,94,0.12)',
                color: '#22c55e',
                border: '1px solid rgba(34,197,94,0.3)',
                fontWeight: 600,
                '& .MuiChip-icon': {
                  color: '#22c55e',
                },
              }}
            />
          </Fade>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            mb: 3,
          }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={notifGridBudget}
                onChange={(e) => setNotifGridBudget(e.target.checked)}
              />
            }
            label="Grid budget reached"
          />
          <FormControlLabel
            control={
              <Switch
                checked={notifSessionComplete}
                onChange={(e) => setNotifSessionComplete(e.target.checked)}
              />
            }
            label="Session complete with summary"
          />
          <FormControlLabel
            control={
              <Switch
                checked={notifAIOverride}
                onChange={(e) => setNotifAIOverride(e.target.checked)}
              />
            }
            label="AI override events"
          />
          <FormControlLabel
            control={
              <Switch
                checked={notifRateReminder}
                onChange={(e) => setNotifRateReminder(e.target.checked)}
              />
            }
            label="Electricity rate reminder (monthly)"
          />
        </Box>

        <TextField
          label="Telegram Chat ID"
          fullWidth
          placeholder="123456789"
          value={telegramId}
          onChange={(e) => setTelegramId(e.target.value)}
          sx={{
            mb: 2,
          }}
        />

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button
            variant="contained"
            size="small"
            disabled={!notifDirty}
            onClick={handleSaveNotif}
            sx={{
              opacity: notifDirty ? 1 : 0.4,
              transition: 'opacity 0.2s',
            }}
          >
            Save preferences
          </Button>
        </Box>
      </Card>

      {/* API Connections */}
      <Card
        sx={{
          p: 3,
          mb: 3,
        }}
      >
        <Typography
          variant="h6"
          fontWeight="600"
          sx={{
            mb: 3,
          }}
        >
          API Connections
        </Typography>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {[
            {
              name: 'Solax Cloud',
              status: 'Connected',
              time: 'last data 45s ago',
            },
            {
              name: 'Tessie (Tesla)',
              status: 'Connected',
              time: 'Tesla plugged in',
            },
            {
              name: 'Ollama AI',
              status: 'Connected',
              time: 'llama3.1:8b',
            },
            {
              name: 'Open-Meteo',
              status: 'Active',
              time: 'forecast updated 12m ago',
            },
          ].map((api, i, arr) => (
            <Box key={i}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography variant="subtitle2">{api.name}</Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: '#22c55e',
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {api.status} · {api.time}
                    </Typography>
                  </Box>
                </Box>
                <Button size="small" variant="outlined">
                  Reconnect
                </Button>
              </Box>
              {i < arr.length - 1 && (
                <Divider
                  sx={{
                    mt: 2,
                  }}
                />
              )}
            </Box>
          ))}
        </Box>
      </Card>

      {/* Tessie API Key */}
      <Card
        sx={{
          p: 3,
        }}
      >
        <Typography
          variant="h6"
          fontWeight="600"
          sx={{
            mb: 1,
          }}
        >
          Tessie API Key
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{
            mb: 2,
          }}
        >
          Required to read Tesla state and control charging via Tessie.
        </Typography>
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            alignItems: 'center',
          }}
        >
          <TextField
            label="API Key"
            type="password"
            placeholder="tss_••••••••••••••••"
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                fontFamily: 'monospace',
              },
            }}
          />
          <Button
            variant="contained"
            color="primary"
            sx={{
              whiteSpace: 'nowrap',
            }}
          >
            Save Key
          </Button>
        </Box>
        <Typography
          variant="caption"
          sx={{
            color: '#4a6382',
            display: 'block',
            mt: 1,
          }}
        >
          Get your key at tessie.com/settings → API
        </Typography>
      </Card>
    </Box>
  )
}
