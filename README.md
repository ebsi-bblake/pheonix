# Pheonix

> Pheonix is a voice-activated conversational assistant web app. It provides a browser-based interface where users interact via speech. Commands are recognized in-browser, sent to a Node.js backend, and routed to the Voiceflow API for AI responses returned as audio and text.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Installation

Ensure you have [Docker](https://www.docker.com/) and [Node.js](https://nodejs.org/) installed.

To install with Docker:

```bash
git clone https://github.com/ebsi-bblake/pheonix.git
cd pheonix
docker-compose up --build
```

To install manually (backend only):

```bash
cd pheonix/backend
npm install
```

## Usage

### Docker-based workflow

```bash
docker-compose up
```

### Manual backend start

```bash
cd backend
npm run dev    # or: node server.js
```

### Frontend (without Docker)

Open `frontend/index.html` in a browser or serve it via a static file server.

## Project Structure

```txt
pheonix/
├── backend/              # Node.js backend
│   ├── server.js         # Express + WebSocket server (Voiceflow integration)
│   ├── package.json      # Dependencies
│   ├── Dockerfile        # Backend Docker config
├── frontend/             # Static frontend (modular)
│   ├── index.html        # HTML entry point
│   ├── main.js           # App bootstrap: FSM loop, recognizer, socket
│   ├── audio-player.js   # Audio playback with TTS duration and timeout
│   ├── dispatcher.js     # FSM dispatcher (uses monoidal transition logic)
│   ├── mic.js            # Audio keep-alive module
│   ├── state.js          # Voice assistant runtime + FSM monoid
│   ├── speech.js         # Wake/command recognition with fuzzy matching
│   ├── ui.js             # DOM state toggling for active/listening/response
│   ├── ws-client.js      # WebSocket communication module
│   ├── main.css          # Styles for layout, transitions, mic animation
│   ├── noop-processor.js # AudioWorkletNode to keep mic stream open
│   └── images/           # UI assets
├── Caddyfile             # Caddy reverse proxy config
├── docker-compose.yml    # Docker orchestration
├── Dockerfile.caddy      # Caddy container
├── Dockerfile.bs         # BrowserSync container
└── README.md             # This file
```

## Overview

Pheonix enables voice-first AI interaction entirely in the browser, powered by a modular frontend and WebSocket-based backend. It features:

- **Frontend**
  - Wake word detection (e.g., "hey empyrean", "hey imperium", etc.)
  - Browser-native speech recognition via Web Speech API
  - State-driven flow (standby → listening → response)
  - WebSocket-based command dispatch and TTS response handling
  - Animated UI with mic control, dynamic text transcript

- **Backend**
  - Node.js + WebSocket (via `ws`)
  - Routes recognized user commands to the Voiceflow API
  - Responds with TTS audio and text
  - Environment-based Voiceflow authentication

**Tech Stack:**
- **Backend**: Node.js, Express, `ws`, node-fetch, dotenv, cors
- **Frontend**: Vanilla JS modules, Web Speech API, AudioContext, WebSockets
- **Infra**: Docker, Docker Compose, Caddy

## Contributing

1. Fork this repo
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push and open a pull request

Use consistent code style. Include tests or clear examples if relevant.

## License

**[No license specified — please add a LICENSE file or clarify usage terms]**

## Contact

- **Owner**: https://github.com/ebsi-bblake
- Open issues or PRs for questions or contributions
