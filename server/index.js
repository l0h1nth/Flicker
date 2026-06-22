import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const jsonRules = `
Return valid JSON only. Do not include markdown, comments, or extra prose.
Keep language normal, modern, and human. Avoid fantasy roleplay.
Use the product vocabulary:
- Flicker = task at risk
- Nudge = action-oriented reminder
- Flare = request sent to a friend for help
- Last Light = emergency mode when time is almost gone
`;

function safeParseJson(text, fallback) {
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

async function generateJson(prompt, fallback) {
  if (!ai) return fallback;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `${jsonRules}\n\n${prompt}`,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.7
      }
    });

    return safeParseJson(response.text || '', fallback);
  } catch (error) {
    console.error('Gemini request failed:', error.message);
    return {
      ...fallback,
      offline: true,
      note: 'Gemini was unavailable, so Flicker used a local fallback.'
    };
  }
}

function summarizeTasks(tasks = []) {
  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    deadline: task.deadline,
    effortMinutes: Number(task.effortMinutes || 0),
    importance: Number(task.importance || 3),
    progress: Number(task.progress || 0),
    heat: task.heat,
    status: task.status,
    notes: task.notes || '',
    canAskFriend: Boolean(task.canAskFriend)
  }));
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: Boolean(ai), model });
});

app.post('/api/ai/brief', async (req, res) => {
  const { tasks = [], profile = {} } = req.body;
  const fallback = {
    headline: 'Today has a few moving parts. Start with the smallest risky task and build momentum.',
    lines: [
      'Clear anything due soon before touching flexible work.',
      'Use one short focus sprint to make visible progress.',
      'Send a flare if a task needs another human to unblock it.'
    ],
    firstMove: 'Pick one task that takes under 20 minutes and finish it now.'
  };

  const result = await generateJson(
    `Create a short daily brief for this user.
User profile: ${JSON.stringify(profile)}
Tasks: ${JSON.stringify(summarizeTasks(tasks))}

Schema:
{
  "headline": "one sentence",
  "lines": ["line 1", "line 2", "line 3"],
  "firstMove": "specific next action"
}`,
    fallback
  );

  res.json(result);
});

app.post('/api/ai/nudge', async (req, res) => {
  const { task, profile = {} } = req.body;
  const fallback = {
    type: 'Tiny Start',
    message: `Open ${task?.title || 'the task'} and do the first useful 5 minutes.`,
    actions: ['Start 15-minute sprint', 'Break it down', 'Snooze safely'],
    safeSnoozeMinutes: 25
  };

  const result = await generateJson(
    `Create one smart reminder nudge for this task.
User profile: ${JSON.stringify(profile)}
Task: ${JSON.stringify(task)}

Schema:
{
  "type": "Action Reminder | Reality Check | Tiny Start | Trade-Off | Mood-Aware",
  "message": "short direct nudge",
  "actions": ["button label", "button label", "button label"],
  "safeSnoozeMinutes": number
}`,
    fallback
  );

  res.json(result);
});

app.post('/api/ai/breakdown', async (req, res) => {
  const { task } = req.body;
  const fallback = {
    summary: 'This task is too large as one block. Split it into smaller wins.',
    steps: [
      { title: 'Define the minimum version', minutes: 10 },
      { title: 'Finish the main work', minutes: 35 },
      { title: 'Review and submit', minutes: 15 }
    ]
  };

  const result = await generateJson(
    `Break this task into practical mini-steps. Avoid playful creature names.
Task: ${JSON.stringify(task)}

Schema:
{
  "summary": "one sentence",
  "steps": [
    { "title": "specific step", "minutes": number }
  ]
}`,
    fallback
  );

  res.json(result);
});

app.post('/api/ai/last-light', async (req, res) => {
  const { task, minutesLeft, profile = {} } = req.body;
  const fallback = {
    headline: 'Planning time is over. Finish the smallest acceptable version.',
    moves: [
      'Open the work and remove every non-essential part.',
      'Complete the minimum version that can be submitted.',
      'Submit first, polish only if time remains.'
    ],
    drop: 'Anything not required for submission.'
  };

  const result = await generateJson(
    `The task is close to deadline. Create emergency triage.
Minutes left: ${minutesLeft}
User profile: ${JSON.stringify(profile)}
Task: ${JSON.stringify(task)}

Schema:
{
  "headline": "short urgent sentence",
  "moves": ["move 1", "move 2", "move 3"],
  "drop": "what to ignore"
}`,
    fallback
  );

  res.json(result);
});

app.post('/api/ai/replan', async (req, res) => {
  const { tasks = [], disruption, profile = {} } = req.body;
  const fallback = {
    headline: 'Plan adjusted. Protect the urgent task and move flexible work.',
    keep: ['Finish the soonest deadline first.'],
    move: ['Move lower-importance work to tomorrow.'],
    askForHelp: ['Send a flare for review or accountability if you are stuck.']
  };

  const result = await generateJson(
    `Replan the user's task board because life happened.
Disruption: ${disruption}
User profile: ${JSON.stringify(profile)}
Tasks: ${JSON.stringify(summarizeTasks(tasks))}

Schema:
{
  "headline": "one sentence",
  "keep": ["task/action to keep today"],
  "move": ["task/action to move or reduce"],
  "askForHelp": ["specific thing a friend could help with"]
}`,
    fallback
  );

  res.json(result);
});

app.post('/api/ai/victory', async (req, res) => {
  const { task, actualMinutes, profile = {} } = req.body;
  const fallback = {
    headline: 'Task saved.',
    insight: 'Notice how long this actually took. Use that as your next estimate.',
    nextTime: 'Add one buffer block if the task involved writing, review, or coordination.'
  };

  const result = await generateJson(
    `Create a completion reflection that helps the user learn their work pattern.
User profile: ${JSON.stringify(profile)}
Task: ${JSON.stringify(task)}
Actual minutes: ${actualMinutes}

Schema:
{
  "headline": "short celebratory line",
  "insight": "useful observation",
  "nextTime": "one recommendation for future planning"
}`,
    fallback
  );

  res.json(result);
});

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) res.status(404).send('Run npm run build first, or use npm run dev.');
  });
});

app.listen(port, () => {
  console.log(`Flicker server running on http://localhost:${port}`);
});
