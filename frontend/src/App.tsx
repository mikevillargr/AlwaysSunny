import React, { useState } from 'react'
import {
  createTheme,
  ThemeProvider,
  CssBaseline,
  AppBar,
  Toolbar,
  Box,
  IconButton,
  Typography,
  Tab,
  Tabs,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import {
  Zap,
  LayoutDashboard,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Menu as MenuIcon,
  X,
} from 'lucide-react'
import { Dashboard } from './pages/Dashboard'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
// Create custom theme
const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0f1923',
      paper: '#162030',
    },
    primary: {
      main: '#f5c518',
    },
    secondary: {
      main: '#3b82f6',
    },
    success: {
      main: '#22c55e',
    },
    error: {
      main: '#ef4444',
    },
    warning: {
      main: '#f59e0b',
    },
    text: {
      primary: '#f0f4f8',
      secondary: '#8da4be',
    },
  },
  typography: {
    fontFamily: 'Inter, sans-serif',
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #2a3f57',
          backgroundImage: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#162030',
          borderBottom: '1px solid #2a3f57',
          backgroundImage: 'none',
          boxShadow: 'none',
        },
      },
    },
  },
})
export function App() {
  const [activeTab, setActiveTab] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue)
  }
  const navItems = [
    {
      label: 'Dashboard',
      icon: <LayoutDashboard size={20} />,
    },
    {
      label: 'History',
      icon: <HistoryIcon size={20} />,
    },
    {
      label: 'Settings',
      icon: <SettingsIcon size={20} />,
    },
  ]
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Navigation Bar */}
        <AppBar position="static">
          <Toolbar>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexGrow: 1,
              }}
            >
              <Zap color="#f5c518" fill="#f5c518" />
              <Typography variant="h6" fontWeight="700">
                Always Sunny
              </Typography>
            </Box>

            {/* Desktop Tabs */}
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              textColor="primary"
              indicatorColor="primary"
              sx={{
                minHeight: 64,
                display: {
                  xs: 'none',
                  md: 'flex',
                },
              }}
            >
              <Tab
                icon={<LayoutDashboard size={20} />}
                label="Dashboard"
                iconPosition="start"
              />
              <Tab
                icon={<HistoryIcon size={20} />}
                label="History"
                iconPosition="start"
              />
              <Tab
                icon={<SettingsIcon size={20} />}
                label="Settings"
                iconPosition="start"
              />
            </Tabs>

            {/* Mobile Hamburger */}
            <IconButton
              onClick={() => setMobileOpen(true)}
              sx={{
                display: {
                  xs: 'flex',
                  md: 'none',
                },
                color: 'text.primary',
              }}
            >
              <MenuIcon size={22} />
            </IconButton>
          </Toolbar>
        </AppBar>

        {/* Mobile Drawer */}
        <Drawer
          anchor="right"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          PaperProps={{
            sx: {
              width: 240,
              bgcolor: '#162030',
              borderLeft: '1px solid #2a3f57',
            },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 1.5,
              borderBottom: '1px solid #2a3f57',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Zap color="#f5c518" fill="#f5c518" size={18} />
              <Typography variant="subtitle1" fontWeight="700">
                Always Sunny
              </Typography>
            </Box>
            <IconButton
              onClick={() => setMobileOpen(false)}
              size="small"
              sx={{
                color: 'text.secondary',
              }}
            >
              <X size={18} />
            </IconButton>
          </Box>

          <List
            sx={{
              pt: 1,
            }}
          >
            {navItems.map((item, index) => (
              <ListItem key={item.label} disablePadding>
                <ListItemButton
                  selected={activeTab === index}
                  onClick={() => {
                    setActiveTab(index)
                    setMobileOpen(false)
                  }}
                  sx={{
                    mx: 1,
                    borderRadius: 2,
                    mb: 0.5,
                    '&.Mui-selected': {
                      bgcolor: 'rgba(245, 197, 24, 0.1)',
                      '& .MuiListItemIcon-root': {
                        color: '#f5c518',
                      },
                      '& .MuiListItemText-primary': {
                        color: '#f5c518',
                        fontWeight: 600,
                      },
                    },
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.05)',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 36,
                      color: activeTab === index ? '#f5c518' : '#8da4be',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: '0.95rem',
                      color: activeTab === index ? '#f5c518' : '#f0f4f8',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Drawer>

        {/* Main Content Area */}
        <Box
          sx={{
            flexGrow: 1,
            bgcolor: 'background.default',
          }}
        >
          {activeTab === 0 && <Dashboard />}
          {activeTab === 1 && <History />}
          {activeTab === 2 && <Settings />}
        </Box>
      </Box>
    </ThemeProvider>
  )
}
