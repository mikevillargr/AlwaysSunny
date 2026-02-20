import { useState } from 'react'
import {
  Box,
  Card,
  Typography,
  TextField,
  Button,
  Alert,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material'
import { Sun, Zap } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export function Login() {
  const { signIn, signUp } = useAuth()
  const [tab, setTab] = useState(0)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    if (tab === 0) {
      const { error } = await signIn(email, password)
      if (error) setError(error)
    } else {
      const { error } = await signUp(email, password)
      if (error) {
        setError(error)
      } else {
        setSuccess('Account created! Check your email to confirm, then sign in.')
      }
    }
    setLoading(false)
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#0b1929',
        px: 2,
      }}
    >
      <Card
        sx={{
          maxWidth: 420,
          width: '100%',
          p: 4,
        }}
      >
        {/* Logo / Title */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            mb: 3,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: '50%',
              bgcolor: 'rgba(245, 197, 24, 0.15)',
            }}
          >
            <Sun color="#f5c518" size={24} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} color="white">
              AlwaysSunny
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Solar EV Charging Optimizer
            </Typography>
          </Box>
        </Box>

        {/* Tabs */}
        <Tabs
          value={tab}
          onChange={(_, v) => {
            setTab(v)
            setError(null)
            setSuccess(null)
          }}
          variant="fullWidth"
          sx={{ mb: 3 }}
        >
          <Tab label="Sign In" />
          <Tab label="Sign Up" />
        </Tabs>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <TextField
            label="Email"
            type="email"
            fullWidth
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            sx={{ mb: 2 }}
            autoComplete="email"
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mb: 3 }}
            autoComplete={tab === 0 ? 'current-password' : 'new-password'}
            inputProps={{ minLength: 6 }}
          />

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading}
            sx={{
              py: 1.5,
              bgcolor: '#f5c518',
              color: '#0b1929',
              fontWeight: 700,
              '&:hover': { bgcolor: '#d4a912' },
            }}
          >
            {loading ? (
              <CircularProgress size={24} sx={{ color: '#0b1929' }} />
            ) : tab === 0 ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </Button>
        </form>

        {/* Footer */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
            mt: 3,
            pt: 2,
            borderTop: '1px solid #2a3f57',
          }}
        >
          <Zap size={12} color="#4a6382" />
          <Typography variant="caption" color="text.secondary">
            Maximize solar · Minimize grid · Save money
          </Typography>
        </Box>
      </Card>
    </Box>
  )
}
