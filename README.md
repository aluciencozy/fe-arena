# 🎵 Guess the OST

> 🚧 **Work in Progress**: This project is currently in active development. Features, UI, and socket events are subject to change.

A real-time multiplayer music guessing game where players compete to identify video game original soundtracks (OSTs). Built to handle complex synchronized game states across active lobbies with low-latency bidirectional communication.

## 💻 Tech Stack

**Frontend:**
- React (Vite)
- TypeScript
- Socket.io-client
- Zustand (Global State Management)
- Tailwind **CSS** & shadcn/ui
- Motion (UI Animations)

**Backend:**
- Node.js
- TypeScript
- Socket.io
- Express

## ✨ Features (Current & Planned)

- **Real-Time Multiplayer Lobbies:** Create and join synchronized game rooms.
- **Live Chat & Guessing System:** Low-latency chat where guesses are processed and validated in real-time.
- **Audio Synchronization:** Concurrent audio playback events managed seamlessly between the server and all connected clients.
- **Custom UI Animations:** Smooth transitions and game state feedback powered by Motion.

## 🚀 Local Development Setup

This repository is split into two main directories: `frontend` and `backend`. You will need to run both concurrently for the application to work.

### Prerequisites

- Node.js (v18+ recommended)
- npm or pnpm

### 1. Clone the Repository

```bash git clone [https://github.com/aluciencozy/guess-the-ost.git](https://github.com/aluciencozy/guess-the-ost.git) cd guess-the-ost ## Setup the Backend Open a terminal and navigate to the backend directory:

Bash cd backend npm install npm run dev The backend server will typically start on [http://localhost:**3000**](http://localhost:**3000**) (or your configured **PORT**).

### Refreshing the anime catalog

The catalog refresh is approval-gated. First generate the proposed AniList franchise checklist:

```bash
cd backend
npm run generate:franchise-checklist
```

Review `data/anime-franchise-checklist.json`, correct the groups or primary entries if needed, and set `approved` to `true`. Copy `data/youtube-playlist-mapping.template.json` to `data/youtube-playlist-mapping.local.json` and replace the placeholders with explicitly categorized playlists. The template shows `ost`, `opening`, and `ending` rows for every approved canonical anime; delete rows for categories you do not have. To intentionally leave an anime out of the game, add its exact checklist name to `excludedAnime`; do not silently omit it from `entries`. Use the prefilled human-readable anime names; AniList IDs are not required. Then run:

```bash
npm run refresh:catalog
```

The importer uses `yt-dlp` metadata only, regenerates the ignored TypeScript catalog, writes a local report, and leaves the tracked JSON catalog unchanged if checklist approval, playlist coverage, or any required playlist extraction fails.

## Setup the Frontend

Open a new, separate terminal and navigate to the frontend directory:

Bash cd frontend npm install npm run dev The frontend will start via Vite, typically on [http://localhost:**5173**.](http://localhost:**5173**.)

📂 Project Structure
Plaintext
guess-the-ost/
├── backend/
│   ├── src/
│   │   ├── services/      # Game and Room state management
│   │   ├── sockets/       # Socket.io event handlers
│   │   └── types/         # Shared TypeScript definitions
│   └── index.ts           # Server entry point
└── frontend/
    ├── src/
    │   ├── components/    # Reusable React components & shadcn UI
    │   ├── hooks/         # Custom hooks (e.g., useSocket)
    │   ├── pages/         # Route views (Home, Room)
    │   ├── store/         # Zustand gameStore
    │   └── types/         # Frontend TypeScript definitions
    └── vite.config.ts
