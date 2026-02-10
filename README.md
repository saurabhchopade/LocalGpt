# Local GPT (React + FastAPI + Ollama)

ChatGPT-style local assistant designed for CPU-only machines with 8 GB RAM.

## Tech Stack

- Frontend: React (Vite build, served by Nginx)
- Backend: FastAPI
- Model runtime: Ollama (local)
- Orchestration: Docker Compose
- Default model: `qwen2.5:1.5b` (small, ~1 GB class)

## Folder Structure

```text
localGpt/
├─ backend/
│  ├─ app/
│  │  └─ main.py
│  ├─ Dockerfile
│  └─ requirements.txt
├─ nginx/
│  └─ default.conf
├─ src/
│  ├─ App.jsx
│  ├─ App.css
│  ├─ index.css
│  └─ main.jsx
├─ frontend.Dockerfile
├─ docker-compose.yml
└─ .dockerignore
```

## Features

- Chat UI with message history
- User input box
- Streaming model responses
- `/chat` backend endpoint
- Local Ollama integration, no cloud APIs
- Memory-aware defaults for low-RAM systems

## Run Locally

1. Start Docker Desktop.
2. Build and start services:

```bash
docker compose up --build
```

3. Open the app:

```text
http://localhost:3000
```

4. First startup pulls the model:
   - `qwen2.5:1.5b`
   - This can take time depending on your network speed.

## API

- Health check: `GET /health`
- Chat stream: `POST /chat`

Request body:

```json
{
  "model": "qwen2.5:1.5b",
  "messages": [
    { "role": "user", "content": "Write a Python function for quicksort." }
  ]
}
```

## 8 GB RAM Notes

- Context window is capped to keep memory low:
  - `MODEL_NUM_CTX=1024`
  - `MAX_HISTORY_MESSAGES=12`
- Ollama is configured for single-model, single-parallel execution.
- If memory is tight, use a smaller model in UI model input (for example `qwen2.5:3b` after pulling it in Ollama).

## Stop Services

```bash
docker compose down
```
