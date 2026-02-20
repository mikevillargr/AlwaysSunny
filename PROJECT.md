# AlwaysSunny — Project Overview

## What this is
A personal web app that optimizes Tesla EV charging to maximize solar self-consumption and minimize grid draw. It bridges a Solax solar inverter (via SolaxCloud API) and a Tesla vehicle (via Tessie API), uses weather forecasting (Open-Meteo), and an AI layer (Ollama, self-hosted) to dynamically recommend charging amperage in real time.

The app also tracks "solar subsidy" — how much of each charging session was free solar vs. paid grid power — and calculates money saved using the Meralco effective tariff rate.

## Core value proposition
- Never waste solar by exporting cheaply while simultaneously paying to charge your car
- Never blow your daily grid import budget on EV charging
- Know exactly how much money solar saved you per session and all-time

## Owner
Mike — personal use, Philippines (Meralco grid, Solax inverter, Tesla via Tessie)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Tailwind CSS |
| Backend | Python (FastAPI) |
| Scheduler / control loop | APScheduler |
| Database | SQLite (dev) → PostgreSQL (prod) |
| AI layer | Ollama REST API (self-hosted VPS) — Qwen2.5:7b |
| Solar data | SolaxCloud API |
| EV data & control | Tessie API (Tesla) |
| Weather & forecast | Open-Meteo API (free, no key) |
| Notifications | Telegram bot |
| Hosting | VPS (same server as Ollama) or Raspberry Pi |

---

## Repository Structure

```
alwayssunny/
├── PROJECT.md              ← This file
├── SPEC.md                 ← Full feature specification
├── ARCHITECTURE.md         ← System architecture & data flows
├── API_REFERENCE.md        ← All external API details
├── UI_SPEC.md              ← UI components, screens, design tokens
├── frontend/               ← React app
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── utils/
│   └── package.json
├── backend/                ← FastAPI app
│   ├── main.py
│   ├── config.py
│   ├── services/
│   │   ├── solax.py
│   │   ├── tessie.py
│   │   ├── weather.py
│   │   ├── ollama.py
│   │   └── session_tracker.py
│   ├── scheduler/
│   │   └── control_loop.py
│   ├── models/
│   │   └── database.py
│   └── requirements.txt
└── .env.example
```
