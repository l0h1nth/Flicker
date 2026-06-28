# Flicker: Project Description

This document is written in a Google Doc-ready format for the hackathon submission.

## Problem Statement Selected

**The Last-Minute Life Saver**

## Solution Overview

Flicker is an AI-powered productivity companion that helps students, professionals, and entrepreneurs complete important tasks before deadlines are missed.

Traditional reminder apps are passive. They show a notification, but they do not help the user decide what to do next. Flicker moves beyond reminders by combining AI planning, deadline-aware prioritization, focused action sessions, voice assistance, friend support, calendar scheduling, habits, and completion rewards.

The core idea is simple:

> Flicker does not just remind users that something is due. It helps them take the next meaningful action.

Users add tasks with deadlines, effort estimates, importance, notes, and optional friend-help permission. Flicker calculates each task's deadline heat and helps the user through Daily Signal, Smart Nudge, Break Down, Last Light, Planner, Action Lock, Human Voice reminders, and Flares.

If a task becomes risky, Flicker can:

- tell the user what to do first
- split the task into smaller steps
- start a focused Action Lock timer
- warn about snooze consequences
- create calendar-ready focus blocks
- ask a friend to check in
- speak the reminder out loud
- reward completion through Rescue Points

## Key Features

### 1. Daily Signal

Gemini creates a short daily brief based on the user's current task board. It highlights what matters most and gives one practical first move.

### 2. Deadline Heat

Every live task is classified using deadline, effort, progress, and importance:

- Calm
- Warming
- Hot
- Critical
- Last Light
- Missed
- Done

This helps users understand urgency without manually sorting tasks.

### 3. Smart Nudge

Instead of a generic reminder, Gemini gives one specific action the user can take immediately. It may include a safe snooze estimate and a suggestion for friend help.

### 4. Break Down

Gemini splits large or overwhelming tasks into smaller steps with estimated minutes.

### 5. Last Light

When time is very limited, Flicker activates emergency triage. Gemini gives the user a short, decisive plan instead of long planning.

### 6. Planner

Gemini ranks live tasks based on urgency, effort, importance, progress, and user energy. It explains what to do first, what can be delayed, and where friend help may be useful.

### 7. Schedule Builder And Calendar Export

Gemini converts available time into short focus blocks. Users can export the generated schedule as an `.ics` calendar file.

### 8. Action Lock

Action Lock is a focused rescue mode. It includes:

- countdown timer
- minimum-save guidance
- progress update
- blocker help
- snooze consequence
- friend check-in escalation
- voice milestones

This feature directly supports task completion instead of passive reminding.

### 9. Human Voice Reminders

Flicker supports spoken reminders. Users can choose:

- browser speech synthesis
- Gemini TTS Human Voice Mode

If Gemini TTS fails, Flicker falls back to browser speech.

### 10. Voice Task Capture

Users can speak a task, and Gemini parses it into:

- task title
- deadline
- effort estimate
- importance
- category
- notes

### 11. Friends And Flares

Users can add friends by username and send a Flare when they need help. A Flare can request:

- focus sprint
- review/unblock
- reminder check-in
- allowed shared subtask support

Friends can accept or reject the request.

### 12. Shared Live Tasks

When a friend accepts a Flare, the task appears on the friend's Live board. Progress and completion update both dashboards automatically.

### 13. Friend Check-In Escalation

For reminder check-ins, Flicker can escalate to the friend if the user does not update progress after a selected time.

### 14. Goal And Habit Tracking

Users can track daily or weekly habits that reduce future deadline pressure.

### 15. Rescue Points / Chaos Points

Flicker rewards completed action:

- late completion: +10
- normal completion: +30
- due within 6 hours: +40
- due within 2 hours: +50
- accepting a Flare: +25
- completing a friend's task: completion points plus helper bonus

In Fun Mode, the same score is displayed as Chaos Points.

### 16. Demo Mode

Demo Mode loads realistic sample tasks and one habit so judges can test the full workflow quickly.

### 17. Night Mode

Users can toggle a persistent dark UI.

## Technologies Used

- React
- Vite
- Express.js
- Node.js
- SQLite through `node:sqlite`
- Gemini API through `@google/genai`
- Browser Notifications API
- Browser Speech Recognition API
- Browser Speech Synthesis API
- `.ics` calendar export
- Google Cloud Run deployment

## Google Technologies Utilized

### Gemini API

Flicker uses Gemini for:

- Daily Signal
- Smart Nudge
- Break Down
- Last Light
- Planner
- Schedule Builder
- Voice Task Parsing

### Gemini TTS

Flicker uses Gemini TTS for optional Human Voice reminders.

### Google AI Studio

Google AI Studio is used as the Gemini development and deployment reference surface for building and testing Gemini-powered app behavior.

### Google Cloud

The final web application is deployed publicly on Google Cloud, using Cloud Run compatible Node hosting.

## How Flicker Demonstrates AI Productivity

Flicker demonstrates AI productivity in three layers:

1. **Decision support:** Gemini helps users decide what matters most.
2. **Action support:** Gemini turns tasks into next steps, focus blocks, and emergency plans.
3. **Completion support:** Flicker encourages progress through Action Lock, Flares, habits, voice reminders, and Rescue Points.

This makes Flicker more than a to-do list. It is a companion that helps users make better decisions and complete tasks more effectively.

## Suggested Demo Script

1. Login or create an account.
2. Click **Load demo**.
3. Click **Daily Signal**.
4. Open the urgent bill task and show **Last Light**.
5. Open the assignment task and show **Break Down**.
6. Start **Action Lock**.
7. Turn on **Human Voice** and click **Test voice**.
8. Go to **Planner** and generate a schedule.
9. Download the schedule as a calendar file.
10. Add a second user as a friend.
11. Send and accept a Flare.
12. Complete the shared task and show Rescue Points increasing.

## Deployment Link

Paste deployed application link here:

`PASTE_DEPLOYED_APPLICATION_LINK_HERE`

## GitHub Repository Link

Paste GitHub repository link here:

`PASTE_GITHUB_REPOSITORY_LINK_HERE`
