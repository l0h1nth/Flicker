# Flicker

Flicker is an AI-powered deadline rescue companion built for the **Last-Minute Life Saver** hackathon problem statement.

Most reminder apps only say, "You have something due." Flicker focuses on what happens next: deciding what matters, starting the smallest useful action, asking for help when needed, and moving finished work out of the way.

## Problem Statement

Students, professionals, and entrepreneurs often miss assignments, meetings, bill payments, interviews, and commitments because reminders are passive and easy to ignore.

Flicker solves this by combining AI planning, deadline triage, voice assistance, calendar-ready schedules, focused action sessions, habits, and lightweight friend support.

## Key Features

- **Daily Signal:** Gemini creates a short plan for the current task board.
- **Deadline Heat:** tasks are automatically labeled Calm, Warming, Hot, Critical, Last Light, or Missed.
- **Last Light Mode:** emergency triage for tasks close to deadline.
- **Smart Nudge:** one practical next step instead of a passive reminder.
- **Break Down:** splits overwhelming tasks into smaller steps.
- **Action Lock:** a focused timer screen with blocker help, progress updates, snooze consequence, and friend escalation.
- **Planner:** ranks live tasks and explains what to do first, delay, or ask help for.
- **Schedule Builder:** creates short focus blocks and exports them as `.ics` calendar files.
- **Voice Task Capture:** lets users speak a task and convert it into a task draft.
- **Voice Reminders:** speaks urgent reminders when enabled.
- **Human Voice Mode:** optional Gemini TTS audio for more natural spoken reminders, with browser voice fallback.
- **Friends and Flares:** add friends by username and request focus, review, reminder check-ins, or allowed subtask support.
- **Shared Live Tasks:** accepted Flares appear on a friend's Live board, and progress/completion updates both users.
- **Goal and Habit Tracking:** tracks repeatable actions that reduce future deadline panic.
- **Rescue Points:** rewards completed work, with bonuses for urgent saves and shared task help.
- **Demo Mode:** loads sample tasks and a habit so judges can test the full workflow instantly.
- **Night Mode:** persistent light/dark UI toggle.

## Why Flicker Goes Beyond Reminders

Flicker does not only notify the user. It helps the user take action.

When a task becomes risky, Flicker can:

- decide what should be done first
- turn the task into smaller steps
- start a focused Action Lock session
- suggest whether a safe snooze is possible
- ask a friend to check in
- build calendar-ready focus blocks
- speak the reminder out loud
- move completed work to Finished so the Live board stays clean

## Demo Flow

Use **Load demo** after logging in to create a realistic sample board.

Suggested judge demo:

1. Click **Load demo**.
2. Click **Daily Signal** to show Gemini's daily plan.
3. Open the urgent bill task and show **Last Light**.
4. Open the assignment task and show **Break Down**.
5. Start **Action Lock** and show blocker help.
6. Turn on **Human voice** and click **Test voice**.
7. Go to **Planner** and build a schedule.
8. Download the schedule as a calendar file.
9. Add a friend from **Crew** and send a Flare.
10. Accept the Flare from a second account to show shared task updates.

## Google Technologies Used

- **Google Gemini API** through `@google/genai`
- **Gemini text generation** for Daily Signal, Smart Nudge, Break Down, Last Light, planning, scheduling, and voice task parsing
- **Gemini TTS** for optional human-style voice reminders
- **Google AI Studio deployment path** for the public hackathon application

## Tech Stack

- React + Vite frontend
- Express backend
- Node built-in SQLite through `node:sqlite`
- Gemini API through `@google/genai`
- Browser Notifications API
- Browser Speech Recognition API
- Browser Speech Synthesis API fallback
- `.ics` calendar export

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env`:

```bash
cp .env.example .env
```

Add a Gemini API key:

```bash
GEMINI_API_KEY=your_key_here
```

Run locally:

```bash
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:8080`

Build production:

```bash
npm run build
```

Serve production:

```bash
npm start
```

## Manual Two-User Test

1. Open the app and create account `alice`.
2. Open another browser window or incognito window and create account `bob`.
3. As `alice`, go to **Crew** and send a friend request to `bob`.
4. As `bob`, accept the friend request.
5. As `alice`, add a task and send a Flare to `bob`.
6. As `bob`, accept the Flare from **Requests**.
7. Confirm the shared task appears on Bob's **Live** page.
8. As `bob`, update progress or mark it done.
9. Confirm Alice's dashboard updates automatically and the task moves to **Finished**.

## AI Fallback Behavior

If `GEMINI_API_KEY` is missing or Gemini is temporarily unavailable, Flicker keeps working with local fallback responses for planning and task help. The UI shows whether Gemini is active or fallback mode is being used.

Human Voice Mode also falls back to browser speech if Gemini TTS is unavailable.

## Data Storage

Flicker stores local development data in SQLite:

- users
- sessions
- tasks
- friendships
- help requests
- activity
- habits

The database and environment files are ignored by Git.

## Submission Checklist

- Public deployed application link
- GitHub repository link
- Google Doc project description with:
  - Problem Statement Selected
  - Solution Overview
  - Key Features
  - Technologies Used
  - Google Technologies Utilized

## Project Positioning

Flicker is a productivity companion for the moment when ordinary reminders are not enough. It helps users choose, start, escalate, schedule, and finish tasks before deadlines are missed.
