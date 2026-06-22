# Flicker: AI Deadline Rescue Companion

Flicker is a hackathon MVP for **The Last-Minute Life Saver** problem statement.

It turns passive reminders into action nudges, detects deadline heat, and lets users send a **Flare** to friends when a task becomes risky. Gemini powers the daily brief, smart reminders, emergency Last Light mode, replanning, task breakdowns, and completion insights.

## Features

- AI daily brief for the user's current task board
- Deadline Heat: Calm, Warming, Hot, Critical, Last Light
- Smart Nudges instead of passive reminders
- Last Light emergency mode for deadlines under 2 hours
- Break It Down for overwhelming tasks
- Life Happened replanning
- Friends by username
- Send a Flare for focus sprint, review, reminder support, or allowed subtask takeover
- Rescue points and crew activity feed
- Privacy toggles for missed-task sharing

## Tech Stack

- React + Vite frontend
- Express backend
- Gemini API through `@google/genai`
- LocalStorage for MVP persistence
- Deployable through Google AI Studio / Cloud Run style Node hosting

## Setup

```bash
npm install
cp .env.example .env
```

Add your Gemini key:

```bash
GEMINI_API_KEY=your_key_here
```

Run locally:

```bash
npm run dev
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:8080`

Build and serve production:

```bash
npm run build
npm start
```

Production app: `http://localhost:8080`

## Google AI Studio Submission Notes

Use Google AI Studio Build Mode as the core build/deploy tool and deploy the functional solution publicly. Keep the deployed link active through evaluation.

Mandatory submission items:

- Public deployed application link
- GitHub repository link
- Google Doc project description with:
  - Problem Statement Selected
  - Solution Overview
  - Key Features
  - Technologies Used
  - Google Technologies Utilized

## Project Positioning

Flicker helps users catch deadlines before they collapse. It combines AI planning, smart reminders, deadline triage, and lightweight friend support so users can take meaningful action instead of ignoring passive notifications.
