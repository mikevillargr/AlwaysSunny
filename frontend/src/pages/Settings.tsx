import React, { useState, useEffect } from 'react'
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
  Alert,
  CircularProgress,
} from '@mui/material'
import { Check, Globe, Sun, Car, Bot, Send, MapPin, Zap } from 'lucide-react'
import { apiFetch } from '../lib/api'
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
  const handleSaveTariff = async () => {
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify({
          electricity_rate: parseFloat(effectiveRate) || 10.83,
        }),
      })
    } catch (e) {
      console.warn('[Settings] Failed to save tariff:', e)
    }
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
  const [savedNotif, setSavedNotif] = useState({
    gridBudget: true,
    sessionComplete: true,
    aiOverride: false,
    rateReminder: true,
  })
  const [notifSaved, setNotifSaved] = useState(false)
  const notifDirty =
    notifGridBudget !== savedNotif.gridBudget ||
    notifSessionComplete !== savedNotif.sessionComplete ||
    notifAIOverride !== savedNotif.aiOverride ||
    notifRateReminder !== savedNotif.rateReminder
  const handleSaveNotif = async () => {
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify({
          notif_grid_budget: notifGridBudget,
          notif_session_complete: notifSessionComplete,
          notif_ai_override: notifAIOverride,
          notif_rate_reminder: notifRateReminder,
        }),
      })
    } catch (e) {
      console.warn('[Settings] Failed to save notification prefs:', e)
    }
    setSavedNotif({
      gridBudget: notifGridBudget,
      sessionComplete: notifSessionComplete,
      aiOverride: notifAIOverride,
      rateReminder: notifRateReminder,
    })
    setNotifSaved(true)
    setTimeout(() => setNotifSaved(false), 2500)
  }

  // Inverter / Solar Setup state
  const [panelCapacityW, setPanelCapacityW] = useState('0')
  const [hasHomeBattery, setHasHomeBattery] = useState(false)
  const [hasNetMetering, setHasNetMetering] = useState(false)
  const [savedInverter, setSavedInverter] = useState({ panelCapacityW: '0', hasHomeBattery: false, hasNetMetering: false })
  const [inverterSaved, setInverterSaved] = useState(false)
  const inverterDirty =
    panelCapacityW !== savedInverter.panelCapacityW ||
    hasHomeBattery !== savedInverter.hasHomeBattery ||
    hasNetMetering !== savedInverter.hasNetMetering
  const handleSaveInverter = async () => {
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify({
          panel_capacity_w: parseInt(panelCapacityW) || 0,
          has_home_battery: hasHomeBattery,
          has_net_metering: hasNetMetering,
        }),
      })
    } catch (e) {
      console.warn('[Settings] Failed to save inverter settings:', e)
    }
    setSavedInverter({ panelCapacityW, hasHomeBattery, hasNetMetering })
    setInverterSaved(true)
    setTimeout(() => setInverterSaved(false), 2500)
  }

  // Home Location state
  const [homeLat, setHomeLat] = useState('')
  const [homeLon, setHomeLon] = useState('')
  const [savedLocation, setSavedLocation] = useState({ lat: '', lon: '' })
  const [locationSaved, setLocationSaved] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const locationDirty = homeLat !== savedLocation.lat || homeLon !== savedLocation.lon

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser')
      return
    }
    setGeoLoading(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHomeLat(pos.coords.latitude.toFixed(6))
        setHomeLon(pos.coords.longitude.toFixed(6))
        setGeoLoading(false)
      },
      (err) => {
        setGeoError(`Location access denied: ${err.message}`)
        setGeoLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleSaveLocation = async () => {
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify({
          home_lat: parseFloat(homeLat),
          home_lon: parseFloat(homeLon),
        }),
      })
      setSavedLocation({ lat: homeLat, lon: homeLon })
      setLocationSaved(true)
      setTimeout(() => setLocationSaved(false), 2500)
    } catch (e) {
      console.warn('[Settings] Failed to save location:', e)
    }
  }

  // Load all settings from backend on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await apiFetch('/api/settings')
        if (res.ok) {
          const data = await res.json()
          if (data.home_lat) {
            setHomeLat(String(data.home_lat))
            setSavedLocation((prev) => ({ ...prev, lat: String(data.home_lat) }))
          }
          if (data.home_lon) {
            setHomeLon(String(data.home_lon))
            setSavedLocation((prev) => ({ ...prev, lon: String(data.home_lon) }))
          }
          // Electricity tariff
          if (data.electricity_rate != null) {
            const rateStr = String(data.electricity_rate)
            setEffectiveRate(rateStr)
            setSavedTariff((prev) => ({ ...prev, rate: rateStr }))
          }
          // Timezone
          if (data.timezone) {
            setTimezone(data.timezone)
            setSavedTimezone(data.timezone)
          }
          // Inverter settings
          if (data.panel_capacity_w != null) {
            const capStr = String(data.panel_capacity_w)
            setPanelCapacityW(capStr)
            setSavedInverter((prev) => ({ ...prev, panelCapacityW: capStr }))
          }
          if (data.has_home_battery != null) {
            setHasHomeBattery(data.has_home_battery)
            setSavedInverter((prev) => ({ ...prev, hasHomeBattery: data.has_home_battery }))
          }
          if (data.has_net_metering != null) {
            setHasNetMetering(data.has_net_metering)
            setSavedInverter((prev) => ({ ...prev, hasNetMetering: data.has_net_metering }))
          }
          // Notification prefs
          if (data.notif_grid_budget != null) setNotifGridBudget(data.notif_grid_budget)
          if (data.notif_session_complete != null) setNotifSessionComplete(data.notif_session_complete)
          if (data.notif_ai_override != null) setNotifAIOverride(data.notif_ai_override)
          if (data.notif_rate_reminder != null) setNotifRateReminder(data.notif_rate_reminder)
          setSavedNotif({
            gridBudget: data.notif_grid_budget ?? true,
            sessionComplete: data.notif_session_complete ?? true,
            aiOverride: data.notif_ai_override ?? false,
            rateReminder: data.notif_rate_reminder ?? true,
          })
        }
      } catch (e) {
        console.warn('[Settings] Failed to load settings:', e)
      }
    }
    loadSettings()
  }, [])

  // API Credentials state
  const [solaxTokenId, setSolaxTokenId] = useState('202508151014313779537711')
  const [solaxDongleSn, setSolaxDongleSn] = useState('SS7ZQUQNRA')
  const [tessieApiKey, setTessieApiKey] = useState('')
  const [tessieVin, setTessieVin] = useState('')
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')

  const [credsSaving, setCredsSaving] = useState(false)
  const [credsSaved, setCredsSaved] = useState(false)
  const [credsError, setCredsError] = useState<string | null>(null)
  const [credsLoaded, setCredsLoaded] = useState(false)

  // Connection status per service (null = untested, true = ok, false = error)
  const [connStatus, setConnStatus] = useState<Record<string, { ok: boolean; detail: string } | null>>({
    solax: null,
    tessie: null,
    telegram: null,
  })
  const [testing, setTesting] = useState(false)

  // Load existing credentials on mount, then auto-test connections
  useEffect(() => {
    async function loadCreds() {
      try {
        const res = await apiFetch('/api/credentials')
        if (res.ok) {
          const data = await res.json()
          if (data.solax_token_id) setSolaxTokenId(data.solax_token_id)
          if (data.solax_dongle_sn) setSolaxDongleSn(data.solax_dongle_sn)
          if (data.tessie_api_key && !data.tessie_api_key.startsWith('•'))
            setTessieApiKey(data.tessie_api_key)
          if (data.tessie_vin) setTessieVin(data.tessie_vin)
          if (data.telegram_bot_token && !data.telegram_bot_token.startsWith('•'))
            setTelegramBotToken(data.telegram_bot_token)
          if (data.telegram_chat_id) setTelegramChatId(data.telegram_chat_id)
        }
      } catch (e) {
        console.warn('[Settings] Failed to load credentials:', e)
      }
      setCredsLoaded(true)

      // Auto-test connections after loading credentials
      setTesting(true)
      try {
        const testRes = await apiFetch('/api/credentials/test', { method: 'POST' })
        if (testRes.ok) {
          setConnStatus(await testRes.json())
        }
      } catch (e) {
        console.warn('[Settings] Auto connection test failed:', e)
      } finally {
        setTesting(false)
      }
    }
    loadCreds()
  }, [])

  const handleSaveCredentials = async () => {
    setCredsSaving(true)
    setCredsError(null)
    try {
      const body: Record<string, string> = {}
      if (solaxTokenId) body.solax_token_id = solaxTokenId
      if (solaxDongleSn) body.solax_dongle_sn = solaxDongleSn
      if (tessieApiKey && !tessieApiKey.startsWith('•')) body.tessie_api_key = tessieApiKey
      if (tessieVin) body.tessie_vin = tessieVin
      if (telegramBotToken && !telegramBotToken.startsWith('•'))
        body.telegram_bot_token = telegramBotToken
      if (telegramChatId) body.telegram_chat_id = telegramChatId

      const res = await apiFetch('/api/credentials', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Failed to save: ${res.status}`)
      setCredsSaved(true)
      setTimeout(() => setCredsSaved(false), 3000)

      // Test connections after successful save
      setTesting(true)
      try {
        const testRes = await apiFetch('/api/credentials/test', { method: 'POST' })
        if (testRes.ok) {
          const results = await testRes.json()
          setConnStatus(results)
        }
      } catch (e) {
        console.warn('[Settings] Connection test failed:', e)
      } finally {
        setTesting(false)
      }
    } catch (e) {
      setCredsError(e instanceof Error ? e.message : 'Failed to save credentials')
    } finally {
      setCredsSaving(false)
    }
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

      {/* Solar / Inverter Setup */}
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
            <Zap size={18} color="#f5c518" />
            <Typography variant="h6" fontWeight="600">
              Solar / Inverter Setup
            </Typography>
          </Box>
          <Fade in={inverterSaved}>
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

        <TextField
          label="Installed Panel Capacity"
          value={panelCapacityW}
          onChange={(e) => setPanelCapacityW(e.target.value)}
          placeholder="0"
          type="number"
          InputProps={{
            endAdornment: (
              <Typography variant="caption" color="text.secondary">
                watts
              </Typography>
            ),
          }}
          sx={{ width: 220, mb: 3 }}
        />

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Total rated capacity of all solar panels. Set to 0 if unknown. Used to estimate true solar availability when the inverter self-limits output.
        </Typography>

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
                checked={hasHomeBattery}
                onChange={(e) => setHasHomeBattery(e.target.checked)}
              />
            }
            label="Home battery installed"
          />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 7, mt: -1 }}>
            Enable if you have a home battery (e.g. Solax Triple Power). Affects how solar subsidy is calculated.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={hasNetMetering}
                onChange={(e) => setHasNetMetering(e.target.checked)}
              />
            }
            label="Net metering enabled"
          />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 7, mt: -1 }}>
            Enable if your utility credits you for exporting surplus solar to the grid.
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <Button
            variant="contained"
            size="small"
            disabled={!inverterDirty}
            onClick={handleSaveInverter}
            sx={{
              opacity: inverterDirty ? 1 : 0.4,
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

      {/* Home Location */}
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
            <MapPin size={18} color="#22c55e" />
            <Typography variant="h6" fontWeight="600">
              Home Location
            </Typography>
          </Box>
          <Fade in={locationSaved}>
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

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Used for solar forecasts (Open-Meteo), home detection (GPS fallback), and sunrise/sunset times.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2, alignItems: 'flex-start' }}>
          <Button
            variant="outlined"
            onClick={handleUseMyLocation}
            disabled={geoLoading}
            startIcon={geoLoading ? <CircularProgress size={16} /> : <MapPin size={16} />}
            sx={{ flexShrink: 0, height: 56 }}
          >
            {geoLoading ? 'Getting location...' : 'Use My Location'}
          </Button>
          <TextField
            label="Latitude"
            value={homeLat}
            onChange={(e) => setHomeLat(e.target.value)}
            placeholder="14.5995"
            sx={{ width: 160, '& .MuiOutlinedInput-root': { fontFamily: 'monospace' } }}
          />
          <TextField
            label="Longitude"
            value={homeLon}
            onChange={(e) => setHomeLon(e.target.value)}
            placeholder="120.9842"
            sx={{ width: 160, '& .MuiOutlinedInput-root': { fontFamily: 'monospace' } }}
          />
        </Box>

        {geoError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {geoError}
          </Alert>
        )}

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {homeLat && homeLon
              ? `📍 ${homeLat}, ${homeLon}`
              : 'No location set — solar forecast and home detection require this.'}
          </Typography>
          <Button
            variant="contained"
            size="small"
            disabled={!locationDirty || !homeLat || !homeLon}
            onClick={handleSaveLocation}
            sx={{
              ml: 2,
              flexShrink: 0,
              opacity: locationDirty && homeLat && homeLon ? 1 : 0.4,
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

      {/* API Credentials */}
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
            API Connections
          </Typography>
          <Fade in={credsSaved}>
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

        {credsError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {credsError}
          </Alert>
        )}

        {/* Solax Cloud */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Sun size={16} color="#f5c518" />
            <Typography variant="subtitle1" fontWeight="600">
              Solax Cloud
            </Typography>
            {connStatus.solax && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: connStatus.solax.ok ? '#22c55e' : '#ef4444',
                    boxShadow: connStatus.solax.ok ? '0 0 6px #22c55e' : '0 0 6px #ef4444',
                  }}
                />
                <Typography variant="caption" color={connStatus.solax.ok ? '#22c55e' : '#ef4444'}>
                  {connStatus.solax.ok ? 'Connected' : 'Error'}
                </Typography>
              </Box>
            )}
            {testing && !connStatus.solax && (
              <CircularProgress size={14} sx={{ ml: 1, color: '#8da4be' }} />
            )}
          </Box>
          {connStatus.solax && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, ml: 3.5 }}>
              {connStatus.solax.detail}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            Connects to your solar inverter for real-time energy data. Get credentials from solaxcloud.com.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Token ID"
              value={solaxTokenId}
              onChange={(e) => setSolaxTokenId(e.target.value)}
              placeholder="Your SolaxCloud API token"
              sx={{ flex: 1, minWidth: 240, '& .MuiOutlinedInput-root': { fontFamily: 'monospace' } }}
            />
            <TextField
              label="Dongle SN (Registration No.)"
              value={solaxDongleSn}
              onChange={(e) => setSolaxDongleSn(e.target.value)}
              placeholder="WiFi dongle registration number"
              sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { fontFamily: 'monospace' } }}
            />
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Tessie (Tesla) */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Car size={16} color="#3b82f6" />
            <Typography variant="subtitle1" fontWeight="600">
              Tessie (Tesla)
            </Typography>
            {connStatus.tessie && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: connStatus.tessie.ok ? '#22c55e' : '#ef4444',
                    boxShadow: connStatus.tessie.ok ? '0 0 6px #22c55e' : '0 0 6px #ef4444',
                  }}
                />
                <Typography variant="caption" color={connStatus.tessie.ok ? '#22c55e' : '#ef4444'}>
                  {connStatus.tessie.ok ? 'Connected' : 'Error'}
                </Typography>
              </Box>
            )}
            {testing && !connStatus.tessie && (
              <CircularProgress size={14} sx={{ ml: 1, color: '#8da4be' }} />
            )}
          </Box>
          {connStatus.tessie && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, ml: 3.5 }}>
              {connStatus.tessie.detail}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            Required to read Tesla state and control charging. Get your API key at tessie.com → Settings → API.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="API Key"
              type="password"
              value={tessieApiKey}
              onChange={(e) => setTessieApiKey(e.target.value)}
              placeholder="tss_••••••••••••••••"
              sx={{ flex: 1, minWidth: 240, '& .MuiOutlinedInput-root': { fontFamily: 'monospace' } }}
            />
            <TextField
              label="Tesla VIN"
              value={tessieVin}
              onChange={(e) => setTessieVin(e.target.value)}
              placeholder="5YJ3E1EA1NF000000"
              sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { fontFamily: 'monospace' } }}
            />
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Telegram (Optional) */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Send size={16} color="#8da4be" />
            <Typography variant="subtitle1" fontWeight="600">
              Telegram Notifications
            </Typography>
            <Chip label="Optional" size="small" sx={{ fontSize: '0.65rem', height: 20, bgcolor: 'rgba(255,255,255,0.05)' }} />
            {connStatus.telegram && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: connStatus.telegram.ok ? '#22c55e' : '#ef4444',
                    boxShadow: connStatus.telegram.ok ? '0 0 6px #22c55e' : '0 0 6px #ef4444',
                  }}
                />
                <Typography variant="caption" color={connStatus.telegram.ok ? '#22c55e' : '#ef4444'}>
                  {connStatus.telegram.ok ? 'Connected' : 'Error'}
                </Typography>
              </Box>
            )}
            {testing && !connStatus.telegram && (
              <CircularProgress size={14} sx={{ ml: 1, color: '#8da4be' }} />
            )}
          </Box>
          {connStatus.telegram && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, ml: 3.5 }}>
              {connStatus.telegram.detail}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            Get push notifications for grid budget, session complete, and AI events. Create a bot via @BotFather on Telegram.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Bot Token"
              type="password"
              value={telegramBotToken}
              onChange={(e) => setTelegramBotToken(e.target.value)}
              placeholder="123456:ABC-DEF..."
              sx={{ flex: 1, minWidth: 240, '& .MuiOutlinedInput-root': { fontFamily: 'monospace' } }}
            />
            <TextField
              label="Chat ID"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="123456789"
              sx={{ width: 160, '& .MuiOutlinedInput-root': { fontFamily: 'monospace' } }}
            />
          </Box>
        </Box>

        {/* Save button */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            onClick={handleSaveCredentials}
            disabled={credsSaving}
            sx={{
              px: 4,
            }}
          >
            {credsSaving ? (
              <CircularProgress size={20} sx={{ color: '#0b1929' }} />
            ) : (
              'Save All Credentials'
            )}
          </Button>
        </Box>
      </Card>
    </Box>
  )
}
