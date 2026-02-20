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
import { Check, Globe, Sun, Car, Bot, Send } from 'lucide-react'
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

  // Load existing credentials on mount
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
          </Box>
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
          </Box>
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
          </Box>
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
