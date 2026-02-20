# AlwaysSunny — Initial Windsurf Prompt

Paste this as your first message to Windsurf Cascade when starting the project.

---

## PROMPT

I'm building a personal web app called **AlwaysSunny** — a solar EV charging optimizer that maximizes solar self-consumption when charging my Tesla at home.

I have four markdown files in this project folder that contain everything you need:
- `PROJECT.md` — overview, tech stack, folder structure
- `SPEC.md` — full feature specification and control logic
- `ARCHITECTURE.md` — system architecture, database schema, API endpoints, control loop pseudocode
- `API_REFERENCE.md` — all external APIs (Solax, Tessie, Open-Meteo, Ollama, Telegram) with exact endpoints and field names
- `UI_SPEC.md` — all screens, components, design tokens, and sample data state

Please read all five files before writing any code.

---

### What I want you to build first (Phase 1)

**Goal:** A working scaffold with live data flowing end-to-end, enough to see real solar and Tesla data on a dashboard.

#### Backend (FastAPI + Python)

1. Set up the FastAPI project structure as defined in `PROJECT.md`
2. Create `config.py` that loads all env vars from `.env` (use `python-dotenv`)
3. Create `services/solax.py`:
   - `get_realtime_data()` — polls SolaxCloud API, returns parsed dict with all fields from `API_REFERENCE.md`
   - Derive `solar_yield_w`, `household_demand_w`, `grid_import_w` from raw fields
4. Create `services/tessie.py`:
   - `get_vehicle_state()` — cached state poll, returns charge port status, SoC, amps, location
   - `get_location()` — returns lat, lon, saved_location
   - `set_charging_amps(amps)` — sends command
   - `start_charging()` and `stop_charging()`
5. Create `services/weather.py`:
   - `get_forecast(lat, lon)` — fetches from Open-Meteo, returns sunrise, sunset, hourly irradiance curve
6. Create the SQLite database with schema from `ARCHITECTURE.md`
7. Create `GET /api/status` endpoint that returns a combined live snapshot (Solax + Tessie + weather + current mode)
8. Create `GET /api/health` endpoint showing connection status of each service

#### Frontend (React + Tailwind)

1. Set up React project with Tailwind CSS
2. Implement the Dashboard screen (`/`) using the design from the Magic Patterns reference (https://www.magicpatterns.com/c/9chry93xuchicrfkq8z7ae/preview) and detailed spec in `UI_SPEC.md`
3. Wire the dashboard to `GET /api/status` — poll every 30 seconds
4. Use the sample data from `UI_SPEC.md` as the initial/loading state so the UI looks complete immediately
5. Implement the color tokens and typography from `UI_SPEC.md`
6. Energy flow panel with 4 nodes (Solar, Home, Grid, Tesla) — static layout first, animation later
7. Session stats card — show sample data state
8. Grid budget progress bar
9. Mode status pill in header

#### Not in Phase 1 (do later)
- The control loop / APScheduler (Phase 2)
- AI/Ollama integration (Phase 2)
- Session tracking and subsidy calculation (Phase 2)
- History screen (Phase 3)
- Settings screen (Phase 3)
- Telegram notifications (Phase 3)

---

### Environment setup

Create a `.env.example` file with all required variables (from `ARCHITECTURE.md`). I will fill in real values.

Create a `README.md` with:
- How to install and run backend (pip install, uvicorn)
- How to install and run frontend (npm install, npm run dev)
- How to configure `.env`

---

### Code quality expectations
- Python: type hints throughout, docstrings on all service functions
- React: functional components only, hooks for state/effects
- No hardcoded credentials anywhere — always from env
- Error handling on all API calls with appropriate fallbacks
- Console log important events (API calls, errors, state changes)

Start by reading all the markdown files, then confirm your plan before writing code.
