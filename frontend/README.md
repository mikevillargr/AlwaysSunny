# AlwaysSunny — Frontend

React + TypeScript frontend for the AlwaysSunny solar EV charging optimizer.

## Tech Stack

- **React 18** with TypeScript
- **Material-UI (MUI) v5** — component library
- **Lucide React** — icons
- **Tailwind CSS** — utility styling
- **Recharts** — charts
- **Vite** — build tool

## Setup

```bash
cd frontend
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`.

API requests to `/api/*` are proxied to `http://localhost:8000` (FastAPI backend).

## Project Structure

```
src/
├── index.tsx           # React root
├── index.css           # Global styles + Tailwind
├── App.tsx             # Main app with MUI theme + navigation
├── types/api.ts        # TypeScript interfaces for API responses
├── hooks/              # Custom React hooks
│   ├── useStatus.ts    # Polls /api/status every 30s
│   └── useSettings.ts  # Settings management
├── utils/constants.ts  # Design tokens + sample data
├── components/         # Reusable UI components
│   ├── AIRecommendationStrip.tsx
│   ├── AmperageControl.tsx
│   ├── ChargerConnectionPill.tsx
│   ├── ChargingControls.tsx
│   ├── EnergyFlowPanel.tsx
│   ├── GridBudgetWeather.tsx
│   ├── SessionStats.tsx
│   ├── SolarForecastChart.tsx
│   └── StatusBar.tsx
└── pages/              # Page-level components
    ├── Dashboard.tsx
    ├── History.tsx
    └── Settings.tsx
```

## Design Reference

Magic Patterns design: https://www.magicpatterns.com/c/9chry93xuchicrfkq8z7ae
