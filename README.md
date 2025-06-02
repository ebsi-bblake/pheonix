# Pheonix

> _Project Description_: **Pheonix is a voice-activated conversational assistant web app. The project provides a browser-based interface for users to interact via speech. Spoken commands are recognized in the browser, sent to a Node.js backend, and routed to the Voiceflow conversational AI API to generate responses, which are returned as spoken audio.**

## Table of Contents

- [Overview](#pheonix)
- [Installation](#installation)
- [Usage](#usage)
- [Project-Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Installation

Ensure you have [Docker](https://www.docker.com/) and [Node.js](https://nodejs.org/) installed.

To install with Docker:

    git clone https://github.com/ebsi-bblake/pheonix.git
    cd pheonix
    docker-compose up --build

To install manually (backend only):

    cd pheonix/backend
    npm install

## Usage

### Docker-based workflow

    docker-compose up

### Manual backend start

    cd backend
    npm run dev    # or: node server.js

### Frontend (without Docker)

Open `frontend/index.html` in a browser, or serve it via a static file server.

## Project Structure

    pheonix/
    ├── backend/              # Node.js backend
    │   ├── server.js         # Backend entry point (Express, Socket.IO, routes to Voiceflow API)
    │   ├── package.json      # Dependencies
    │   ├── Dockerfile        # Backend Docker config
    │   └── node_modules/     # Installed dependencies
    ├── frontend/             # Static frontend
    │   ├── index.html        # HTML entry point
    │   ├── main.js           # JS logic (speech recognition, UI, socket communication)
    │   ├── main.css          # Styles (animated, voice UI inspired)
    │   ├── dispatcher.js     # State/event system for UI state transitions
    │   ├── state.js          # State machine for voice flow
    │   ├── noop-processor.js # Audio worklet to keep microphone stream alive
    │   └── images/           # Assets
    ├── Caddyfile             # Caddy reverse proxy config
    ├── docker-compose.yml    # Docker orchestration
    ├── Dockerfile.caddy      # Caddy Docker config
    ├── Dockerfile.bs         # BrowserSync Docker config
    └── README.md             # Documentation

## Overview

Pheonix enables browser-based, voice-first interaction with a conversational AI by combining:

- **Frontend**: A minimal web page with a microphone button, animated UI, and scripts for:
  - Wake word detection (e.g., "hey anthony", "hey empyrean", etc.)
  - Speech recognition using the Web Speech API
  - Sending recognized commands to the backend via Socket.IO
  - Receiving spoken audio (TTS) and text responses from the backend
  - State transitions for listening, processing, and playback

- **Backend**: A Node.js Express server using Socket.IO:
  - Receives commands from the frontend and proxies them to the Voiceflow API
  - Handles API authentication via environment variables
  - Returns TTS audio and text messages to the frontend for playback

**Technologies & Frameworks:**
- Node.js, Express, Socket.IO, node-fetch, dotenv, cors (backend)
- Vanilla JS, Web Speech API, Socket.IO-client, AudioContext/AudioWorklet (frontend)
- Docker & Docker Compose for local orchestration
- Caddy for optional reverse proxy/static serving

## Contributing

1. Fork this repo
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push and open a pull request

Please use consistent code style and include tests if applicable.

## License

**[No license specified — add a LICENSE file or clarify usage terms here]**

## Contact

- **Owner**: https://github.com/ebsi-bblake
- Open issues or PRs for questions or contributions
