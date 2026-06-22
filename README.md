# Flicker: AI Deadline Rescue Companion

Flicker is a hackathon MVP for **The Last-Minute Life Saver** problem statement.

It turns passive reminders into action nudges, detects deadline heat, and lets users send a **Flare** to friends when a task becomes risky. Gemini powers the daily brief, smart reminders, emergency Last Light mode, and task breakdowns.

## Features

- AI daily brief for the user's current task board
- Username/password login
- SQLite database for users, tasks, friendships, help requests, and activity
- Deadline Heat: Calm, Warming, Hot, Critical, Last Light
- Smart Nudges instead of passive reminders
- Last Light emergency mode for deadlines under 2 hours
- Break It Down for overwhelming tasks
- Friends by username
- Friend request accept/reject flow
- Send a Flare for focus sprint, review, reminder support, or allowed subtask takeover
- Friend volunteer/reject flow for task help requests
- Live page for current work and Finished page for completed work
- First-login tutorial
- Rescue points and crew activity feed
- Privacy toggles for missed-task sharing

## Tech Stack

- React + Vite frontend
- Express backend
- Gemini API through `@google/genai`
- Built-in Node SQLite database through `node:sqlite`
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

## Manual Two-User Test

1. Open the app in one browser and create account `alice`.
2. Open the app in another browser or incognito window and create account `bob`.
3. As `alice`, go to Crew and send a friend request to `bob`.
4. As `bob`, accept the friend request.
5. As `alice`, add a live task and send a Flare to `bob`.
6. As `bob`, go to Requests and choose Volunteer or Reject.
7. As `alice`, mark the task Done and confirm it moves to Finished.

Build and serve production:

```bash
npm run build
npm start
```

Production app: `http://localhost:8080`

## Push To GitHub

```bash
git init
git add .
git commit -m "Build Flicker deadline rescue app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/flicker.git
git push -u origin main
```

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
