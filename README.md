# Flicker

**Flicker** is an AI-powered productivity companion for the **Last-Minute Life Saver** hackathon problem statement.

Most productivity apps stop at passive reminders. Flicker helps users decide what to do next, start focused work, ask friends for support, schedule realistic focus blocks, and complete tasks before deadlines are missed.

## Problem Statement

**The Last-Minute Life Saver**

Students, professionals, and entrepreneurs often miss assignments, meetings, bill payments, interviews, and commitments. Existing tools usually remind users, but they do not help users complete the work.

Flicker turns reminders into action.

## Live Demo And Submission Links

Add these before final submission:

- **Deployed application:** `PASTE_GOOGLE_CLOUD_URL_HERE`
- **GitHub repository:** `PASTE_GITHUB_REPOSITORY_URL_HERE`
- **Project description Google Doc:** `PASTE_GOOGLE_DOC_URL_HERE`

## What Flicker Does

Flicker watches a user's task board and helps them move from panic to action:

- It prioritizes tasks using deadline, effort, progress, importance, and user energy.
- It creates a short AI daily plan called **Daily Signal**.
- It turns risky tasks into specific next actions through **Smart Nudge**.
- It splits large tasks through **Break Down**.
- It opens emergency triage through **Last Light**.
- It starts focused work through **Action Lock**.
- It creates calendar-ready schedules.
- It lets users ask friends for help through **Flares**.
- It rewards completed action with **Rescue Points**.
- It supports spoken reminders through browser voice and optional Gemini Human Voice.

## Key Features

### AI Productivity

- **Daily Signal:** Gemini summarizes the current board and suggests the first move.
- **Smart Nudge:** Gemini gives one practical next action for a task.
- **Break Down:** Gemini splits an overwhelming task into small steps.
- **Last Light:** Gemini gives emergency moves when time is nearly gone.
- **Planner:** Gemini ranks tasks and explains what to do first, delay, or ask help for.
- **Schedule Builder:** Gemini turns available time into focus blocks.
- **Voice Task Parsing:** Gemini converts spoken task text into structured task fields.

### Action And Accountability

- **Action Lock:** a focused timer with progress update, blocker help, snooze consequence, and friend escalation.
- **Deadline Heat:** tasks are labeled Calm, Warming, Hot, Critical, Last Light, Missed, or Done.
- **Friend Flares:** users can ask friends for focus sprint, review/unblock, reminder check-in, or allowed subtask support.
- **Shared Live Tasks:** accepted Flares appear on the friend's Live board; progress and completion sync for both users.
- **Friend Check-In Escalation:** reminder check-ins can escalate if progress stalls.

### Experience

- **Human Voice Mode:** optional Gemini TTS for more natural spoken reminders.
- **Browser Voice Fallback:** works even if Gemini TTS is unavailable.
- **Notifications:** browser notifications for urgent tasks and friend requests.
- **Calendar Export:** tasks and generated schedules export as `.ics` files.
- **Goal And Habit Tracking:** daily or weekly habits that reduce future deadline panic.
- **Rescue / Chaos Points:** completion rewards; Fun Mode renames Rescue Points to Chaos Points.
- **Night Mode:** persistent light/dark UI.
- **Demo Mode:** loads realistic sample tasks and a habit for fast judging.

## Rescue Points

Flicker rewards completed action:

- Late completion: `+10`
- Normal completion: `+30`
- Due within 6 hours: `+40`
- Due within 2 hours: `+50`
- Accepting a Flare: `+25`
- Completing a friend's shared task: completion points plus a helper bonus

When Fun Mode is enabled, the same score is displayed as **Chaos Points**.

## Demo Flow

Use the **Load demo** button after login.

Suggested judge walkthrough:

1. Click **Load demo**.
2. Click **Daily Signal** to show Gemini's daily plan.
3. Open the bill task and show **Last Light**.
4. Open the assignment task and show **Break Down**.
5. Start **Action Lock** and show blocker help.
6. Turn on **Human Voice** and click **Test voice**.
7. Go to **Planner** and build a schedule.
8. Download the schedule as a calendar file.
9. Add a second user from **Crew**.
10. Send a **Flare** and accept it from the second account.
11. Update or complete the shared task and show both dashboards updating.

## Tech Stack

- React
- Vite
- Express.js
- Node.js
- SQLite through `node:sqlite`
- `@google/genai`
- Browser Notifications API
- Browser Speech Recognition API
- Browser Speech Synthesis API
- Google Cloud deployment

## Google Technologies Utilized

- **Gemini API** for planning, nudges, breakdowns, emergency triage, scheduling, and voice task parsing.
- **Gemini TTS** for optional human-style spoken reminders.
- **Google AI Studio** as the Gemini build/testing surface and deployment reference.
- **Google Cloud Run** for the deployed web application.

## Architecture

```text
React + Vite frontend
        |
        | REST API
        v
Express server
        |
        | SQLite local database
        v
Users, sessions, tasks, habits, friends, flares, activity
        |
        | Gemini API
        v
AI planning, task parsing, schedule generation, TTS
```

The Express server also serves the production frontend from `dist/`.

## Local Setup

Install dependencies:

```bash
npm install
```

Create environment file:

```bash
cp .env.example .env
```

Add your Gemini key:

```bash
GEMINI_API_KEY=your_key_here
```

Run development mode:

```bash
npm run dev
```

Local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8080`

Build production:

```bash
npm run build
```

Serve production:

```bash
npm start
```

Production URL:

```text
http://localhost:8080
```

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes for AI | Gemini API key |
| `GOOGLE_API_KEY` | Optional | Alternative Gemini key name |
| `GEMINI_MODEL` | Optional | Default text model, currently `gemini-2.5-flash` |
| `GEMINI_FALLBACK_MODELS` | Optional | Comma-separated fallback text models |
| `GEMINI_TTS_MODEL` | Optional | TTS model, currently `gemini-2.5-flash-preview-tts` |
| `PORT` | Cloud Run provides this | Server port |
| `SQLITE_PATH` | Optional | SQLite database path |

## AI Fallback Behavior

If Gemini is unavailable or the key is missing, Flicker still runs with local fallback responses. The UI shows fallback mode so the demo does not break.

Human Voice Mode falls back to browser speech when Gemini TTS is unavailable.

## Manual Two-User Test

1. Create account `alice`.
2. Open another browser or incognito window and create account `bob`.
3. As Alice, go to **Crew** and send a friend request to Bob.
4. As Bob, accept the request.
5. As Alice, add a task and send a Flare to Bob.
6. As Bob, accept the Flare from **Requests**.
7. Confirm the shared task appears on Bob's **Live** page.
8. As Bob, update progress or complete the task.
9. Confirm Alice's dashboard updates and the task moves to **Finished**.

## Google Cloud Deployment

Short Cloud Run path:

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud run deploy flicker \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=YOUR_GEMINI_KEY,GEMINI_MODEL=gemini-2.5-flash,GEMINI_FALLBACK_MODELS=gemini-2.0-flash,GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
```

## Submission Documents

Google Doc-ready project description:

- [`docs/project-description.md`](docs/project-description.md)

## Important Deployment Note

This MVP uses SQLite for a simple hackathon deployment. On Cloud Run, the container filesystem is ephemeral, so data may reset when a container instance is replaced. For a production version, replace SQLite with Cloud SQL or Firestore.

For hackathon evaluation, Flicker includes **Demo Mode** so judges can quickly create a full sample board even if the runtime starts fresh.

## License

Hackathon MVP. Add a license before public production use.
