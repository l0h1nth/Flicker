import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 8080;
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ttsModel = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const fallbackModels = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-2.0-flash')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const dataDir = path.join(__dirname, 'data');
const dbPath = process.env.SQLITE_PATH || path.join(dataDir, 'flicker.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    energy TEXT DEFAULT 'okay',
    tutorial_seen INTEGER DEFAULT 0,
    public_misses INTEGER DEFAULT 0,
    show_task_names INTEGER DEFAULT 0,
    voice_reminders INTEGER DEFAULT 0,
    rescue_points INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    title TEXT NOT NULL,
    deadline TEXT NOT NULL,
    effort_minutes INTEGER NOT NULL,
    importance INTEGER NOT NULL,
    category TEXT DEFAULT 'General',
    notes TEXT DEFAULT '',
    progress INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    can_ask_friend INTEGER DEFAULT 1,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL,
    addressee_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (requester_id, addressee_id),
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS help_requests (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    message TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    escalation_minutes INTEGER DEFAULT 0,
    escalation_due_at TEXT,
    escalation_sent INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    target_count INTEGER DEFAULT 1,
    current_count INTEGER DEFAULT 0,
    period TEXT DEFAULT 'daily',
    streak INTEGER DEFAULT 0,
    last_completed_at TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

for (const migration of [
  'ALTER TABLE tasks ADD COLUMN completed_by TEXT',
  'ALTER TABLE users ADD COLUMN voice_reminders INTEGER DEFAULT 0',
  'ALTER TABLE help_requests ADD COLUMN escalation_minutes INTEGER DEFAULT 0',
  'ALTER TABLE help_requests ADD COLUMN escalation_due_at TEXT',
  'ALTER TABLE help_requests ADD COLUMN escalation_sent INTEGER DEFAULT 0'
]) {
  try {
    db.exec(migration);
  } catch (error) {
    if (!String(error.message).includes('duplicate column')) {
      throw error;
    }
  }
}

const geminiApiKeySource = process.env.GEMINI_API_KEY
  ? 'GEMINI_API_KEY'
  : process.env.GOOGLE_API_KEY
    ? 'GOOGLE_API_KEY'
    : null;
const geminiApiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const jsonRules = `
Return valid JSON only. Do not include markdown, comments, or extra prose.
Keep language simple and practical. Flicker should feel friendly, not confusing.
Use these terms only when helpful:
- Smart Nudge: one useful next action
- Flare: a help request sent to a friend
- Last Light: emergency mode when time is nearly gone
`;

function id() {
  return randomBytes(16).toString('hex');
}

function now() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return {
    salt,
    hash: scryptSync(password, salt, 64).toString('hex')
  };
}

function verifyPassword(password, user) {
  const attempt = scryptSync(password, user.salt, 64);
  const stored = Buffer.from(user.password_hash, 'hex');
  return stored.length === attempt.length && timingSafeEqual(stored, attempt);
}

function userView(user) {
  return {
    id: user.id,
    username: user.username,
    energy: user.energy,
    tutorialSeen: Boolean(user.tutorial_seen),
    publicMisses: Boolean(user.public_misses),
    showTaskNames: Boolean(user.show_task_names),
    voiceReminders: Boolean(user.voice_reminders),
    rescuePoints: Number(user.rescue_points || 0)
  };
}

function addActivity(userId, message) {
  db.prepare('INSERT INTO activity (id, user_id, message, created_at) VALUES (?, ?, ?, ?)')
    .run(id(), userId, message, now());
}

function processEscalations(userId) {
  const dueRequests = db.prepare(`
    SELECT help_requests.*, tasks.title, tasks.progress, friend.username AS friendUsername, owner.username AS ownerUsername
    FROM help_requests
    JOIN tasks ON tasks.id = help_requests.task_id
    JOIN users AS friend ON friend.id = help_requests.friend_id
    JOIN users AS owner ON owner.id = help_requests.owner_id
    WHERE help_requests.owner_id = ?
      AND help_requests.status = 'accepted'
      AND help_requests.escalation_minutes > 0
      AND help_requests.escalation_sent = 0
      AND help_requests.escalation_due_at IS NOT NULL
      AND datetime(help_requests.escalation_due_at) <= datetime('now')
      AND tasks.status = 'active'
      AND tasks.progress < 100
  `).all(userId);

  for (const request of dueRequests) {
    db.prepare('UPDATE help_requests SET escalation_sent = 1, updated_at = ? WHERE id = ?')
      .run(now(), request.id);
    addActivity(request.friend_id, `Check in with @${request.ownerUsername}: "${request.title}" still needs progress.`);
    addActivity(request.owner_id, `Escalated reminder check-in to @${request.friendUsername} for "${request.title}".`);
  }
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const row = db.prepare(`
    SELECT users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token);

  if (!row) return res.status(401).json({ error: 'Invalid token' });
  req.user = row;
  req.token = token;
  next();
}

function friendshipBetween(userA, userB) {
  return db.prepare(`
    SELECT * FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?)
       OR (requester_id = ? AND addressee_id = ?)
  `).get(userA, userB, userB, userA);
}

function safeParseJson(text, fallback) {
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

function wavFromPcm(pcmBuffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

async function generateJson(prompt, fallback) {
  if (!ai) {
    return {
      ...fallback,
      offline: true,
      note: 'Gemini API key is not configured, so Flicker used a local fallback.'
    };
  }

  const modelsToTry = [...new Set([model, ...fallbackModels])];
  let lastError = null;

  for (const modelName of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: `${jsonRules}\n\n${prompt}`,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.65
          }
        });

        const text = typeof response.text === 'function' ? response.text() : response.text;
        return {
          ...safeParseJson(text || '', fallback),
          modelUsed: modelName
        };
      } catch (error) {
        lastError = error;
        const message = String(error.message || '');
        const retryable = message.includes('"code":503') || message.includes('UNAVAILABLE') || message.includes('RESOURCE_EXHAUSTED');
        if (!retryable) break;
        await sleep(450 * attempt);
      }
    }
  }

  console.error('Gemini request failed:', lastError?.message || lastError);
  return {
    ...fallback,
    offline: true,
    note: 'Gemini was unavailable, so Flicker used a local fallback.'
  };
}

function tasksFor(userId, status) {
  return db.prepare(`
    SELECT
      tasks.*,
      users.username AS owner_username,
      'owner' AS role,
      NULL AS help_request_id,
      NULL AS support_kind
    FROM tasks
    JOIN users ON users.id = tasks.owner_id
    WHERE tasks.owner_id = ? AND tasks.status = ?
    ORDER BY datetime(tasks.deadline) ASC
  `).all(userId, status);
}

function sharedTasksFor(userId, status) {
  return db.prepare(`
    SELECT
      tasks.*,
      users.username AS owner_username,
      'helper' AS role,
      help_requests.id AS help_request_id,
      help_requests.kind AS support_kind
    FROM help_requests
    JOIN tasks ON tasks.id = help_requests.task_id
    JOIN users ON users.id = tasks.owner_id
    WHERE help_requests.friend_id = ?
      AND help_requests.status = 'accepted'
      AND tasks.status = ?
    ORDER BY datetime(tasks.deadline) ASC
  `).all(userId, status);
}

function taskForUser(taskId, userId) {
  const owned = db.prepare(`
    SELECT tasks.*, users.username AS owner_username, 'owner' AS role, NULL AS helper_id
    FROM tasks
    JOIN users ON users.id = tasks.owner_id
    WHERE tasks.id = ? AND tasks.owner_id = ?
  `).get(taskId, userId);
  if (owned) return owned;

  return db.prepare(`
    SELECT tasks.*, users.username AS owner_username, 'helper' AS role, help_requests.friend_id AS helper_id
    FROM help_requests
    JOIN tasks ON tasks.id = help_requests.task_id
    JOIN users ON users.id = tasks.owner_id
    WHERE tasks.id = ?
      AND help_requests.friend_id = ?
      AND help_requests.status = 'accepted'
  `).get(taskId, userId);
}

function minutesUntil(deadline) {
  return Math.round((new Date(deadline).getTime() - Date.now()) / 60000);
}

function completionPoints(task) {
  const minutesLeft = minutesUntil(task.deadline);
  if (minutesLeft < 0) return 10;
  if (minutesLeft <= 120) return 50;
  if (minutesLeft <= 360) return 40;
  return 30;
}

function formatWindow(minutes) {
  if (minutes < 0) return `${Math.abs(minutes)} minutes late`;
  if (minutes < 60) return `${minutes} minutes left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} hour${hours === 1 ? '' : 's'}${rest ? ` ${rest} minutes` : ''} left`;
}

function briefFallback(tasks, user) {
  const ordered = [...tasks].sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const first = ordered[0];
  if (!first) {
    return {
      headline: 'Your board is clear.',
      lines: [
        'Add one task that matters today.',
        'Use Smart Nudge when you need a first step.',
        'Send a Flare only when another person can genuinely help.'
      ],
      firstMove: 'Add your next real deadline.'
    };
  }

  const window = formatWindow(minutesUntil(first.deadline));
  const sharedCount = ordered.filter((task) => task.role === 'helper').length;
  return {
    headline: `${ordered.length} live task${ordered.length === 1 ? '' : 's'}. Start with "${first.title}".`,
    lines: [
      `"${first.title}" has ${window}.`,
      user.energy === 'low' ? 'Keep the first move small: 10 focused minutes.' : 'Use one focused block before checking anything else.',
      sharedCount ? `${sharedCount} shared task${sharedCount === 1 ? ' is' : 's are'} on your board.` : 'Send a Flare if a task needs review, accountability, or a shared subtask.'
    ],
    firstMove: `Open "${first.title}" and make visible progress for 10 minutes.`
  };
}

function nudgeFallback(task, user) {
  const window = formatWindow(minutesUntil(task.deadline));
  const lowEnergy = user.energy === 'low';
  return {
    type: lowEnergy ? 'Tiny Start' : 'Reality Check',
    message: lowEnergy
      ? `Do the smallest useful step for "${task.title}" for 10 minutes. Stop after that if needed.`
      : `"${task.title}" has ${window}. Start now with the part that makes the task easier to finish later.`,
    safeSnoozeMinutes: minutesUntil(task.deadline) <= 120 ? 10 : 25,
    friendHelp: task.can_ask_friend
      ? 'If you are stuck, send a Flare for review, reminder, or a focus sprint.'
      : 'Friend support is off for this task.'
  };
}

function breakdownFallback(task) {
  const effort = Number(task.effort_minutes || 30);
  const first = Math.max(5, Math.round(effort * 0.2));
  const second = Math.max(10, Math.round(effort * 0.55));
  const third = Math.max(5, effort - first - second);
  return {
    summary: `"${task.title}" is easier if you split it into start, finish, and send.`,
    steps: [
      { title: 'Set up the file, tab, or materials', minutes: first },
      { title: 'Finish the minimum useful version', minutes: second },
      { title: 'Check once and submit or mark done', minutes: third }
    ]
  };
}

function lastLightFallback(task) {
  return {
    headline: `"${task.title}" is in Last Light. Ignore perfection.`,
    moves: [
      'Open the task and remove anything optional.',
      'Complete the smallest version that counts.',
      'Submit, send, or mark it done before polishing.'
    ],
    askFriend: task.can_ask_friend
      ? 'Send a Flare only if the friend can help immediately.'
      : 'Friend support is off, so keep this solo and simple.'
  };
}

function planDayFallback(tasks, user) {
  const ordered = [...tasks].sort((a, b) => {
    const urgency = new Date(a.deadline) - new Date(b.deadline);
    if (urgency !== 0) return urgency;
    return Number(b.importance || 3) - Number(a.importance || 3);
  });
  const top = ordered.slice(0, 3);
  return {
    summary: top.length ? `Protect ${top.length} task${top.length === 1 ? '' : 's'} first.` : 'Your board is clear.',
    doFirst: top.map((task) => ({
      taskId: task.id,
      title: task.title,
      why: `${formatWindow(minutesUntil(task.deadline))}, importance ${task.importance}.`,
      nextAction: `Work on "${task.title}" for 15 minutes.`
    })),
    delay: ordered.slice(3).map((task) => task.title),
    askFriend: ordered
      .filter((task) => task.can_ask_friend && task.role !== 'helper')
      .slice(0, 2)
      .map((task) => `Send a Flare for "${task.title}" if review or accountability would unblock it.`),
    note: user.energy === 'low' ? 'Low energy detected. Keep the first block small.' : 'Use one focused block before switching tasks.'
  };
}

function scheduleFallback(tasks, availableMinutes = 120, startTime = '') {
  const ordered = [...tasks].sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  let remaining = Number(availableMinutes || 120);
  const blocks = [];

  for (const task of ordered) {
    if (remaining <= 0) break;
    const needed = Number(task.effort_minutes || 30) * (1 - Number(task.progress || 0) / 100);
    const minutes = Math.min(Math.max(15, needed), remaining, 45);
    blocks.push({
      title: task.title,
      minutes: Math.round(minutes),
      action: `Make visible progress on "${task.title}".`
    });
    remaining -= minutes;
    if (remaining >= 10) {
      blocks.push({ title: 'Reset break', minutes: 5, action: 'Stand up, breathe, and return.' });
      remaining -= 5;
    }
  }

  return {
    headline: `A ${availableMinutes}-minute plan${startTime ? ` starting ${startTime}` : ''}.`,
    blocks: blocks.length ? blocks : [{ title: 'Add a task', minutes: 10, action: 'Capture one deadline you need to protect.' }],
    warning: remaining < 0 ? 'This schedule is overloaded.' : 'Keep blocks short and update progress after each one.'
  };
}

function parseVoiceFallback(transcript) {
  const text = String(transcript || '').trim();
  const lower = text.toLowerCase();
  const date = new Date();
  if (lower.includes('tomorrow')) date.setDate(date.getDate() + 1);
  if (lower.includes('today')) date.setDate(date.getDate());
  date.setHours(lower.includes('morning') ? 10 : lower.includes('night') ? 21 : 18, 0, 0, 0);

  const minutesMatch = lower.match(/(\d+)\s*(minute|min|hour|hr|hours)/);
  let effortMinutes = 30;
  if (minutesMatch) {
    effortMinutes = Number(minutesMatch[1]) * (minutesMatch[2].startsWith('hour') || minutesMatch[2] === 'hr' ? 60 : 1);
  }

  return {
    title: text.replace(/\b(due|tomorrow|today|morning|night|takes?|hours?|minutes?|mins?|hrs?)\b/gi, '').replace(/\s+/g, ' ').trim() || text || 'Voice task',
    deadline: date.toISOString(),
    effortMinutes,
    importance: lower.includes('important') || lower.includes('urgent') ? 5 : 3,
    category: 'Voice',
    notes: text
  };
}

function dashboard(userId) {
  processEscalations(userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const liveTasks = [...tasksFor(userId, 'active'), ...sharedTasksFor(userId, 'active')]
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const completedTasks = [...tasksFor(userId, 'done'), ...sharedTasksFor(userId, 'done')]
    .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0));

  const friends = db.prepare(`
    SELECT users.id, users.username, users.rescue_points AS rescuePoints
    FROM friendships
    JOIN users ON users.id = CASE
      WHEN friendships.requester_id = ? THEN friendships.addressee_id
      ELSE friendships.requester_id
    END
    WHERE (friendships.requester_id = ? OR friendships.addressee_id = ?)
      AND friendships.status = 'accepted'
    ORDER BY users.username ASC
  `).all(userId, userId, userId);

  const incomingFriendRequests = db.prepare(`
    SELECT friendships.id, users.username, friendships.created_at AS createdAt
    FROM friendships
    JOIN users ON users.id = friendships.requester_id
    WHERE friendships.addressee_id = ? AND friendships.status = 'pending'
    ORDER BY datetime(friendships.created_at) DESC
  `).all(userId);

  const outgoingFriendRequests = db.prepare(`
    SELECT friendships.id, users.username, friendships.created_at AS createdAt
    FROM friendships
    JOIN users ON users.id = friendships.addressee_id
    WHERE friendships.requester_id = ? AND friendships.status = 'pending'
    ORDER BY datetime(friendships.created_at) DESC
  `).all(userId);

  const incomingHelpRequests = db.prepare(`
    SELECT
      help_requests.*,
      tasks.title AS taskTitle,
      tasks.deadline,
      tasks.effort_minutes AS effortMinutes,
      users.username AS ownerUsername
    FROM help_requests
    JOIN tasks ON tasks.id = help_requests.task_id
    JOIN users ON users.id = help_requests.owner_id
    WHERE help_requests.friend_id = ?
    ORDER BY datetime(help_requests.created_at) DESC
  `).all(userId);

  const outgoingHelpRequests = db.prepare(`
    SELECT
      help_requests.*,
      tasks.title AS taskTitle,
      users.username AS friendUsername
    FROM help_requests
    JOIN tasks ON tasks.id = help_requests.task_id
    JOIN users ON users.id = help_requests.friend_id
    WHERE help_requests.owner_id = ?
    ORDER BY datetime(help_requests.created_at) DESC
  `).all(userId);

  const activity = db.prepare(`
    SELECT id, message, created_at AS createdAt
    FROM activity
    WHERE user_id = ?
    ORDER BY rowid DESC
    LIMIT 12
  `).all(userId);

  const habits = db.prepare(`
    SELECT
      id,
      title,
      target_count AS targetCount,
      current_count AS currentCount,
      period,
      streak,
      last_completed_at AS lastCompletedAt,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM habits
    WHERE user_id = ? AND status = 'active'
    ORDER BY datetime(created_at) DESC
  `).all(userId);

  return {
    user: userView(user),
    ai: {
      configured: Boolean(ai),
      model
    },
    liveTasks,
    completedTasks,
    friends,
    incomingFriendRequests,
    outgoingFriendRequests,
    incomingHelpRequests,
    outgoingHelpRequests,
    habits,
    activity
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: Boolean(ai), keySource: geminiApiKeySource, model, fallbackModels, database: dbPath });
});

app.post('/api/auth/register', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const password = String(req.body.password || '');
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters.' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already exists. Try logging in.' });

  const passwordData = hashPassword(password);
  const userId = id();
  db.prepare(`
    INSERT INTO users (id, username, password_hash, salt, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, username, passwordData.hash, passwordData.salt, now());
  addActivity(userId, 'Welcome to Flicker. Your live tasks will appear here.');

  const token = id();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, now());
  res.json({ token, dashboard: dashboard(userId) });
});

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = id();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, user.id, now());
  res.json({ token, dashboard: dashboard(user.id) });
});

app.post('/api/auth/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

app.get('/api/dashboard', auth, (req, res) => {
  res.json(dashboard(req.user.id));
});

app.patch('/api/profile', auth, (req, res) => {
  const energy = ['low', 'okay', 'high'].includes(req.body.energy) ? req.body.energy : req.user.energy;
  const tutorialSeen = req.body.tutorialSeen === undefined ? req.user.tutorial_seen : Number(Boolean(req.body.tutorialSeen));
  const publicMisses = req.body.publicMisses === undefined ? req.user.public_misses : Number(Boolean(req.body.publicMisses));
  const showTaskNames = req.body.showTaskNames === undefined ? req.user.show_task_names : Number(Boolean(req.body.showTaskNames));
  const voiceReminders = req.body.voiceReminders === undefined ? req.user.voice_reminders : Number(Boolean(req.body.voiceReminders));

  db.prepare(`
    UPDATE users
    SET energy = ?, tutorial_seen = ?, public_misses = ?, show_task_names = ?, voice_reminders = ?
    WHERE id = ?
  `).run(energy, tutorialSeen, publicMisses, showTaskNames, voiceReminders, req.user.id);

  res.json(dashboard(req.user.id));
});

app.post('/api/tasks', auth, (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Task title is required.' });

  const taskId = id();
  db.prepare(`
    INSERT INTO tasks (
      id, owner_id, title, deadline, effort_minutes, importance, category, notes,
      progress, status, can_ask_friend, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?)
  `).run(
    taskId,
    req.user.id,
    title,
    req.body.deadline,
    Number(req.body.effortMinutes || 30),
    Number(req.body.importance || 3),
    String(req.body.category || 'General'),
    String(req.body.notes || ''),
    Number(Boolean(req.body.canAskFriend ?? true)),
    now(),
    now()
  );
  addActivity(req.user.id, `Added "${title}" to live tasks.`);
  res.json(dashboard(req.user.id));
});

app.patch('/api/tasks/:taskId', auth, (req, res) => {
  const task = taskForUser(req.params.taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  db.prepare(`
    UPDATE tasks
    SET progress = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    Number(req.body.progress ?? task.progress),
    String(req.body.notes ?? task.notes),
    now(),
    req.params.taskId
  );
  if (task.role === 'helper') {
    addActivity(task.owner_id, `@${req.user.username} updated progress on "${task.title}".`);
  }
  res.json(dashboard(req.user.id));
});

app.post('/api/tasks/:taskId/complete', auth, (req, res) => {
  const task = taskForUser(req.params.taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (task.status === 'done') return res.json(dashboard(req.user.id));

  const points = completionPoints(task);

  db.prepare(`
    UPDATE tasks
    SET status = 'done', progress = 100, completed_at = ?, completed_by = ?, updated_at = ?
    WHERE id = ?
  `).run(now(), req.user.id, now(), req.params.taskId);

  if (task.role === 'helper') {
    db.prepare('UPDATE users SET rescue_points = rescue_points + ? WHERE id = ?').run(points + 15, req.user.id);
    db.prepare('UPDATE users SET rescue_points = rescue_points + ? WHERE id = ?').run(Math.max(15, Math.floor(points / 2)), task.owner_id);
    addActivity(req.user.id, `You completed @${task.owner_username || 'your friend'}'s task "${task.title}". +${points + 15} rescue points.`);
    addActivity(task.owner_id, `@${req.user.username} completed "${task.title}". Moved to Finished. +${Math.max(15, Math.floor(points / 2))} rescue points.`);
  } else {
    db.prepare('UPDATE users SET rescue_points = rescue_points + ? WHERE id = ?').run(points, req.user.id);
    addActivity(req.user.id, `Completed "${task.title}". Moved to Finished. +${points} rescue points.`);
  }
  res.json(dashboard(req.user.id));
});

app.post('/api/habits', auth, (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Habit title is required.' });

  db.prepare(`
    INSERT INTO habits (
      id, user_id, title, target_count, current_count, period, streak, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, 0, ?, 0, 'active', ?, ?)
  `).run(
    id(),
    req.user.id,
    title,
    Math.max(1, Number(req.body.targetCount || 1)),
    ['daily', 'weekly'].includes(req.body.period) ? req.body.period : 'daily',
    now(),
    now()
  );
  addActivity(req.user.id, `Added habit "${title}".`);
  res.json(dashboard(req.user.id));
});

app.post('/api/habits/:habitId/check-in', auth, (req, res) => {
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ? AND status = ?')
    .get(req.params.habitId, req.user.id, 'active');
  if (!habit) return res.status(404).json({ error: 'Habit not found.' });

  const nextCount = Math.min(Number(habit.current_count || 0) + 1, Number(habit.target_count || 1));
  const completedNow = nextCount >= Number(habit.target_count || 1);
  db.prepare(`
    UPDATE habits
    SET current_count = ?, streak = ?, last_completed_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    nextCount,
    completedNow ? Number(habit.streak || 0) + 1 : Number(habit.streak || 0),
    completedNow ? now() : habit.last_completed_at,
    now(),
    req.params.habitId,
    req.user.id
  );
  addActivity(req.user.id, completedNow ? `Hit habit goal "${habit.title}".` : `Checked in habit "${habit.title}".`);
  res.json(dashboard(req.user.id));
});

app.post('/api/habits/:habitId/reset', auth, (req, res) => {
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ? AND status = ?')
    .get(req.params.habitId, req.user.id, 'active');
  if (!habit) return res.status(404).json({ error: 'Habit not found.' });

  db.prepare('UPDATE habits SET current_count = 0, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(now(), req.params.habitId, req.user.id);
  addActivity(req.user.id, `Reset habit "${habit.title}".`);
  res.json(dashboard(req.user.id));
});

app.delete('/api/habits/:habitId', auth, (req, res) => {
  db.prepare('UPDATE habits SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run('archived', now(), req.params.habitId, req.user.id);
  res.json(dashboard(req.user.id));
});

app.post('/api/friends/request', auth, (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const friend = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
  if (!friend) return res.status(404).json({ error: 'No user found with that username.' });
  if (friend.id === req.user.id) return res.status(400).json({ error: 'You cannot add yourself.' });

  const existing = friendshipBetween(req.user.id, friend.id);
  if (existing) return res.status(409).json({ error: `Friend request already ${existing.status}.` });

  db.prepare(`
    INSERT INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(id(), req.user.id, friend.id, now(), now());
  addActivity(req.user.id, `Sent friend request to @${friend.username}.`);
  addActivity(friend.id, `@${req.user.username} sent you a friend request.`);
  res.json(dashboard(req.user.id));
});

app.post('/api/friends/:requestId/respond', auth, (req, res) => {
  const action = req.body.action === 'accept' ? 'accepted' : 'rejected';
  const request = db.prepare(`
    SELECT friendships.*, users.username AS requesterUsername
    FROM friendships
    JOIN users ON users.id = friendships.requester_id
    WHERE friendships.id = ? AND friendships.addressee_id = ? AND friendships.status = 'pending'
  `).get(req.params.requestId, req.user.id);
  if (!request) return res.status(404).json({ error: 'Friend request not found.' });

  db.prepare('UPDATE friendships SET status = ?, updated_at = ? WHERE id = ?')
    .run(action, now(), req.params.requestId);
  addActivity(req.user.id, `${action === 'accepted' ? 'Accepted' : 'Rejected'} @${request.requesterUsername}'s friend request.`);
  addActivity(request.requester_id, `@${req.user.username} ${action === 'accepted' ? 'accepted' : 'rejected'} your friend request.`);
  res.json(dashboard(req.user.id));
});

app.post('/api/tasks/:taskId/flares', auth, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND owner_id = ?').get(req.params.taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!task.can_ask_friend) return res.status(400).json({ error: 'Friend support is disabled for this task.' });

  const friend = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.body.friendId);
  if (!friend) return res.status(404).json({ error: 'Friend not found.' });

  const friendship = friendshipBetween(req.user.id, friend.id);
  if (!friendship || friendship.status !== 'accepted') {
    return res.status(403).json({ error: 'You can only send flares to accepted friends.' });
  }

  const requestId = id();
  const kind = String(req.body.kind || 'Focus sprint');
  const escalationMinutes = Math.max(0, Number(req.body.escalationMinutes || 0));
  const escalationDueAt = escalationMinutes ? new Date(Date.now() + escalationMinutes * 60000).toISOString() : null;
  db.prepare(`
    INSERT INTO help_requests (
      id, task_id, owner_id, friend_id, kind, message, status,
      escalation_minutes, escalation_due_at, escalation_sent, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, 0, ?, ?)
  `).run(requestId, task.id, req.user.id, friend.id, kind, String(req.body.message || ''), escalationMinutes, escalationDueAt, now(), now());
  addActivity(req.user.id, `Sent @${friend.username} a flare for "${task.title}".`);
  addActivity(friend.id, `@${req.user.username} asked for help: ${kind} on "${task.title}".${escalationMinutes ? ` Check in after ${escalationMinutes} minutes if progress stalls.` : ''}`);
  res.json(dashboard(req.user.id));
});

app.post('/api/flares/:requestId/respond', auth, (req, res) => {
  const action = req.body.action === 'accept' ? 'accepted' : 'rejected';
  const request = db.prepare(`
    SELECT help_requests.*, tasks.title, users.username AS ownerUsername
    FROM help_requests
    JOIN tasks ON tasks.id = help_requests.task_id
    JOIN users ON users.id = help_requests.owner_id
    WHERE help_requests.id = ? AND help_requests.friend_id = ? AND help_requests.status = 'pending'
  `).get(req.params.requestId, req.user.id);
  if (!request) return res.status(404).json({ error: 'Flare not found.' });

  db.prepare('UPDATE help_requests SET status = ?, updated_at = ? WHERE id = ?')
    .run(action, now(), req.params.requestId);
  if (action === 'accepted') {
    db.prepare('UPDATE users SET rescue_points = rescue_points + 25 WHERE id = ?').run(req.user.id);
  }
  addActivity(req.user.id, `${action === 'accepted' ? 'Accepted' : 'Rejected'} flare: ${request.kind} for "${request.title}".`);
  addActivity(request.owner_id, `@${req.user.username} ${action === 'accepted' ? 'accepted' : 'rejected'} your flare for "${request.title}".`);
  res.json(dashboard(req.user.id));
});

app.post('/api/ai/brief', auth, async (req, res) => {
  const tasks = [...tasksFor(req.user.id, 'active'), ...sharedTasksFor(req.user.id, 'active')];
  const fallback = briefFallback(tasks, req.user);

  const result = await generateJson(
    `Create a short daily brief for @${req.user.username}.
Energy: ${req.user.energy}
Live tasks: ${JSON.stringify(tasks)}

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

app.post('/api/ai/nudge', auth, async (req, res) => {
  const task = taskForUser(req.body.taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const fallback = nudgeFallback(task, req.user);

  const result = await generateJson(
    `Create one simple smart reminder for this task.
User energy: ${req.user.energy}
Task: ${JSON.stringify(task)}

Schema:
{
  "type": "Tiny Start | Reality Check | Trade-Off | Last Light",
  "message": "short direct nudge",
  "safeSnoozeMinutes": number,
  "friendHelp": "one sentence"
}`,
    fallback
  );

  res.json(result);
});

app.post('/api/ai/breakdown', auth, async (req, res) => {
  const task = taskForUser(req.body.taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const fallback = breakdownFallback(task);

  const result = await generateJson(
    `Break this task into small practical steps.
Task: ${JSON.stringify(task)}

Schema:
{
  "summary": "one sentence",
  "steps": [{ "title": "specific step", "minutes": number }]
}`,
    fallback
  );

  res.json(result);
});

app.post('/api/ai/last-light', auth, async (req, res) => {
  const task = taskForUser(req.body.taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const fallback = lastLightFallback(task);

  const result = await generateJson(
    `Create Last Light triage for this task.
Task: ${JSON.stringify(task)}
Energy: ${req.user.energy}

Schema:
{
  "headline": "short urgent sentence",
  "moves": ["move 1", "move 2", "move 3"],
  "askFriend": "one sentence"
}`,
    fallback
  );

  res.json(result);
});

app.post('/api/ai/plan-day', auth, async (req, res) => {
  const tasks = [...tasksFor(req.user.id, 'active'), ...sharedTasksFor(req.user.id, 'active')];
  const fallback = planDayFallback(tasks, req.user);

  const result = await generateJson(
    `Prioritize this user's live task board. Be decisive and explain briefly.
User: @${req.user.username}
Energy: ${req.user.energy}
Available minutes today: ${Number(req.body.availableMinutes || 120)}
Tasks: ${JSON.stringify(tasks)}

Schema:
{
  "summary": "one sentence",
  "doFirst": [
    { "taskId": "task id", "title": "task title", "why": "short reason", "nextAction": "specific next action" }
  ],
  "delay": ["task title to delay"],
  "askFriend": ["specific friend-help suggestion"],
  "note": "one coaching note"
}`,
    fallback
  );

  res.json(result);
});

app.post('/api/ai/schedule', auth, async (req, res) => {
  const tasks = [...tasksFor(req.user.id, 'active'), ...sharedTasksFor(req.user.id, 'active')];
  const availableMinutes = Number(req.body.availableMinutes || 120);
  const startTime = String(req.body.startTime || '');
  const fallback = scheduleFallback(tasks, availableMinutes, startTime);

  const result = await generateJson(
    `Create a realistic time-block schedule. Keep blocks short and action-oriented.
Available minutes: ${availableMinutes}
Start time label: ${startTime}
User energy: ${req.user.energy}
Tasks: ${JSON.stringify(tasks)}

Schema:
{
  "headline": "one sentence",
  "blocks": [
    { "title": "task or break title", "minutes": number, "action": "what to do during this block" }
  ],
  "warning": "one sentence if schedule is risky, otherwise encouragement"
}`,
    fallback
  );

  res.json(result);
});

app.post('/api/ai/parse-voice', auth, async (req, res) => {
  const transcript = String(req.body.transcript || '').trim();
  if (!transcript) return res.status(400).json({ error: 'Transcript is required.' });

  const fallback = parseVoiceFallback(transcript);
  const result = await generateJson(
    `Parse this spoken task into task form fields. If date/time is vague, choose a reasonable upcoming deadline.
Current ISO time: ${now()}
Transcript: ${transcript}

Schema:
{
  "title": "short task title",
  "deadline": "ISO datetime string",
  "effortMinutes": number,
  "importance": 1 | 3 | 5,
  "category": "short category",
  "notes": "original useful context"
}`,
    fallback
  );

  res.json(result);
});

app.post('/api/ai/tts', auth, async (req, res) => {
  if (!ai) return res.status(503).json({ error: 'Gemini API key is not configured.' });

  const text = String(req.body.text || '').replace(/\s+/g, ' ').trim().slice(0, 420);
  if (!text) return res.status(400).json({ error: 'Text is required.' });

  try {
    const response = await ai.models.generateContent({
      model: ttsModel,
      contents: [{
        parts: [{
          text: `Say in a warm, natural, calm human voice. Keep it conversational and clear, like a helpful friend beside the user. Text: ${text}`
        }]
      }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: String(req.body.voiceName || 'Kore')
            }
          }
        }
      }
    });

    const inlineData = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData;
    if (!inlineData?.data) throw new Error('No audio returned from Gemini TTS.');

    const audioBuffer = Buffer.from(inlineData.data, 'base64');
    const mimeType = inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000';
    const rateMatch = mimeType.match(/rate=(\d+)/i);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    const body = mimeType.includes('wav') ? audioBuffer : wavFromPcm(audioBuffer, sampleRate);

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  } catch (error) {
    console.error('Gemini TTS failed:', error.message || error);
    res.status(503).json({ error: 'Human voice is unavailable right now.' });
  }
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
  console.log(`SQLite database: ${dbPath}`);
});
