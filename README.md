Phoenix
-------

Phoenix is a voice-activated conversational assistant web app. It provides a browser-based interface where users interact via speech. Commands are recognized in-browser, sent to a Node.js backend, and routed to the Voiceflow API for AI responses returned as audio and text.

Table of Contents
-----------------
- Overview
- Installation
- Usage
  - Linux/macOS
  - Windows
- Project Structure
- Development Environment
- Contributing
- License
- Contact

Overview
--------
Phoenix enables voice-first AI interaction entirely in the browser, powered by a modular frontend and WebSocket-based backend. It features:

Frontend:
- Browser-native speech recognition (Web Speech API)
- Finite State Machine (standby → listening → response)
- WebSocket command dispatch and TTS playback
- Animated UI with mic control and live transcript

Backend:
- Node.js + Express + WebSocket (ws)
- Routes user commands to the Voiceflow Streaming API
- Responds with real-time TTS audio and text
- Optional Delcom USB button or spacebar fallback

Tech Stack:
- Backend: Node.js, Express, WebSockets, Voiceflow Streaming API
- Frontend: Vanilla JS modules, Web Speech API, Audio API
- Infra: Nix dev shell, cross-platform start/stop scripts

Installation
------------
Clone the repo:

  git clone https://github.com/ebsi-bblake/pheonix.git
  cd pheonix

Backend setup:

  cd backend
  npm install

Frontend setup:

  cd frontend
  npm install --save-dev serve

Usage
-----
Linux/macOS:

  ./dev.sh start     # Start frontend (8080) and backend (3001)
  ./dev.sh stop      # Stop both
  ./dev.sh restart   # Restart both
  ./dev.sh status    # Show status of processes
  ./dev.sh logs      # Tail logs

Windows:

  powershell -File .\dev.ps1 start     # Start frontend + backend
  powershell -File .\dev.ps1 stop      # Stop both
  powershell -File .\dev.ps1 restart   # Restart both
  powershell -File .\dev.ps1 status    # Show status
  powershell -File .\dev.ps1 logs      # Tail logs

Project Structure
-----------------
pheonix/
├── backend/              # Node.js backend
│   ├── server.js         # Express + WebSocket server (Voiceflow streaming)
│   ├── delcom.js         # Delcom button integration (with keyboard fallback)
│   └── package.json
├── frontend/             # Static frontend (vanilla JS modules)
│   ├── index.html
│   ├── main.js
│   ├── ws-client.js      # WebSocket client logic
│   ├── speech.js         # Speech recognition wrapper
│   ├── audio-player.js   # TTS playback
│   ├── ui.js             # UI state transitions
│   └── state.js          # FSM + runtime state
├── dev.sh                # Linux/macOS start/stop script
├── dev.ps1               # Windows PowerShell start/stop script
├── default.nix           # Nix development environment
├── flake.nix             # Flake config for devShell
└── README.md             # This file

Development Environment
-----------------------
Phoenix provides a Nix flake (flake.nix) for consistent dev environments across Linux/macOS:

  nix develop

The shell provides:
- Node.js 20
- Python3
- libusb (for Delcom USB button support)

On entering the shell you’ll see guidance to run ./dev.sh start.

Contributing
------------
1. Fork the repo
2. Create a new branch (git checkout -b feature/my-feature)
3. Commit changes
4. Push and open a pull request

Maintain consistent code style and add tests/examples where useful.

License
-------
[No license specified — please add a LICENSE file or clarify usage terms]

Contact
-------
Owner: Boaz Blake (https://github.com/ebsi-bblake)
Open issues or PRs for questions or contributions
