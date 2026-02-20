# AlwaysSunny

A personal web app that optimizes Tesla EV charging to maximize solar self-consumption and minimize grid draw.

## Overview

AlwaysSunny bridges:
- **Solax solar inverter** (via SolaxCloud API)
- **Tesla vehicle** (via Tessie API)
- **Weather forecasting** (Open-Meteo)
- **AI optimization layer** (Ollama, self-hosted)

The app tracks "solar subsidy" — how much of each charging session was free solar vs. paid grid power — and calculates money saved using the Meralco effective tariff rate.

## Tech Stack

### Frontend
- React 18 + TypeScript
- Material-UI (MUI) v5
- Tailwind CSS
- Recharts
- Vite

### Backend (Future)
- Python FastAPI
- SQLite → PostgreSQL
- APScheduler (control loop)
- Ollama REST API (Qwen2.5:7b)

## Project Structure

```
AlwaysSunny/
├── PROJECT.md              # Project overview
├── SPEC.md                 # Full feature specification
├── ARCHITECTURE.md         # System architecture & data flows
├── DATA_FLOWS.md          # Detailed data flow documentation
├── API_REFERENCE.md       # External API details
├── UI_SPEC.md             # UI components & design tokens
├── DECISIONS.md           # Design decisions log
├── ONBOARDING.md          # Onboarding flow
├── WINDSURF_PROMPT.md     # Initial setup prompt
├── frontend/              # React app
│   ├── src/
│   │   ├── components/    # UI components (9 files)
│   │   ├── pages/         # Page components (3 files)
│   │   ├── hooks/         # Custom React hooks
│   │   ├── types/         # TypeScript interfaces
│   │   └── utils/         # Constants & utilities
│   └── package.json
└── backend/               # FastAPI app (future)
```

## Getting Started

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`.

### Design Reference

Magic Patterns design: https://www.magicpatterns.com/c/9chry93xuchicrfkq8z7ae

## Features

- **Live Dashboard** — Real-time energy flow visualization
- **AI Optimization** — Dynamic charging rate recommendations
- **Solar Subsidy Tracking** — Calculate money saved per session
- **Grid Budget Management** — Hard cutoff when daily limit reached
- **Weather & Solar Forecast** — Hourly irradiance predictions
- **Session History** — Track all charging sessions with detailed stats

## License

Personal use project.
