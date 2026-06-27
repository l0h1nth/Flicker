/*
  CHANGES:
  - Added client-persistent Fun Mode with roast voice lines and optional chaos styling.
  - Kept normal/professional mode intact while upgrading voice alerts, missed-task roasts, and Action Lock milestones.
  - Added Rescue/Chaos Points, voice status/test polish, Daily Signal read-aloud, confetti, and activity timeline styling hooks.
  - Preserved all existing API calls and backend compatibility; no server or package changes required.
*/
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const apiBase = import.meta.env.VITE_API_BASE || '';
const tokenKey = 'flicker-token-v2';
const funModeKey = 'flicker-fun-mode-v1';
const darkModeKey = 'flicker-night-mode-v1';
const flareHelp = {
  'Focus sprint': 'Your friend agrees to work alongside you for a short focused session.',
  'Review / unblock': 'Your friend helps check, explain, or unblock the task. They are not doing dishonest work for you.',
  'Reminder check-in': 'Your friend manually checks on you later so the task does not disappear.',
  'Take over allowed subtask': 'Use this only for shared or appropriate tasks, like booking, pickup, formatting, or admin work.'
};

const ROAST_LINES = {
  warming: [
    "Hey genius, this task isn't going to do itself.",
    'Still ignoring it? Bold strategy.',
    "The deadline called. It's concerned."
  ],
  hot: [
    'You are cooked. Mildly. For now.',
    'Your procrastination is becoming a personality.',
    "Clock's ticking and you're... what exactly?",
    'This task filed a missing person report on you.'
  ],
  critical: [
    "Okay we are in the danger zone and you still haven't started. Classic.",
    "Your deadline is laughing at you. It's not a good laugh.",
    'Bold of you to assume this will sort itself out.',
    'You are the reason procrastination has a Wikipedia page.'
  ],
  lastLight: [
    'This is genuinely impressive levels of waiting until the last second.',
    'Future you is going to have WORDS with current you.',
    'There are five stages of grief and you are speed-running all of them.',
    'The audacity to still be calm right now is actually insane.',
    'I have seen disasters unfold slower than this deadline approaching.'
  ],
  missed: [
    "You missed it. I'm not mad. I'm disappointed. Actually I'm a little mad.",
    'Congrats on the new skill: deadline archaeology.',
    'The deadline left. It took your hopes with it.',
    'This is going in the hall of fame of unfortunate choices.'
  ],
  actionLockStart: [
    'Okay okay okay. We are doing this NOW.',
    'Finally. The task was starting to think you forgot its name.',
    'Hero arc begins. Possibly.'
  ],
  actionLockEnd: [
    "That's it. Was that so hard? Don't answer that.",
    'Timer done. Update your progress before you forget and we have to do this again.',
    'You survived. Barely.'
  ],
  snooze: [
    'Snoozing. Again. The timeline is not in your favour.',
    'Each snooze is a little betrayal of future you.'
  ]
};

function soon(hours) {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

function heatFor(task) {
  if (task.status === 'done') return { label: 'Done', className: 'done', level: 0, minutesLeft: 0 };

  const rawMinutesLeft = Math.round((new Date(task.deadline).getTime() - Date.now()) / 60000);
  if (rawMinutesLeft < 0) return { label: 'Missed', className: 'missed', level: 6, minutesLeft: rawMinutesLeft };

  const remaining = Number(task.effort_minutes || task.effortMinutes || 30) * (1 - Number(task.progress || 0) / 100);
  const ratio = remaining ? rawMinutesLeft / remaining : 99;

  if (rawMinutesLeft <= 120) return { label: 'Last Light', className: 'last', level: 5, minutesLeft: rawMinutesLeft };
  if (ratio <= 1.2 || rawMinutesLeft <= 360) return { label: 'Critical', className: 'critical', level: 4, minutesLeft: rawMinutesLeft };
  if (ratio <= 2 || Number(task.importance || 3) >= 5) return { label: 'Hot', className: 'hot', level: 3, minutesLeft: rawMinutesLeft };
  if (ratio <= 4) return { label: 'Warming', className: 'warm', level: 2, minutesLeft: rawMinutesLeft };
  return { label: 'Calm', className: 'calm', level: 1, minutesLeft: rawMinutesLeft };
}

function timeLeft(minutes) {
  if (minutes < 0) return `${Math.abs(minutes)}m late`;
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins ? `${mins}m` : ''} left`;
}

function normalizeTask(task) {
  return {
    ...task,
    effortMinutes: task.effort_minutes ?? task.effortMinutes,
    canAskFriend: Boolean(task.can_ask_friend ?? task.canAskFriend),
    heat: heatFor(task)
  };
}

function canNotify() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function showBrowserNotification(title, body) {
  if (!canNotify() || Notification.permission !== 'granted') return;
  new Notification(title, {
    body,
    tag: `flicker-${title}-${body}`,
    renotify: false
  });
}

function speak(text, enabled = true) {
  if (!enabled || !canSpeak()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function roast(category, enabled) {
  if (!enabled) return;
  const lines = ROAST_LINES[category] || [];
  const line = lines[Math.floor(Math.random() * lines.length)];
  if (line) speak(line, true);
}

function voiceScriptFor(task) {
  const left = timeLeft(task.heat.minutesLeft);
  if (task.heat.label === 'Warming') {
    return `Heads up. ${task.title} is warming up. You have ${left} — consider planning your next step.`;
  }
  if (task.heat.label === 'Hot') {
    return `Warning. ${task.title} is getting hot. Only ${left} remaining. Open it now.`;
  }
  if (task.heat.label === 'Critical') {
    return `Critical alert. ${task.title} needs your attention right now. ${left} left. Start an action lock immediately.`;
  }
  if (task.heat.label === 'Last Light') {
    return `Emergency. ${task.title} is in last light. You have ${left}. This is your final window. Go now.`;
  }
  return '';
}

function briefSpeechText(briefData) {
  return [
    briefData?.headline,
    ...(briefData?.lines || []),
    briefData?.firstMove
  ]
    .filter(Boolean)
    .join('. ')
    .replace(/<[^>]*>/g, '');
}

function fireConfetti() {
  if (typeof document === 'undefined') return;
  const colors = ['#ff4d6d', '#ff8c42', '#7c5cff', '#22d3ee', '#22c55e'];
  for (let index = 0; index < 20; index += 1) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${45 + Math.random() * 10}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty('--tx', `${Math.random() * 240 - 120}px`);
    piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 2000);
  }
}

function toLocalInputValue(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return soon(24);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

function downloadIcs(blocks, startLabel = '') {
  const start = new Date();
  let cursor = new Date(start);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const events = blocks.map((block, index) => {
    const eventStart = new Date(cursor);
    cursor = new Date(cursor.getTime() + Number(block.minutes || 15) * 60000);
    const format = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    return [
      'BEGIN:VEVENT',
      `UID:flicker-${Date.now()}-${index}@local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${format(eventStart)}`,
      `DTEND:${format(cursor)}`,
      `SUMMARY:${String(block.title || 'Flicker block').replace(/\n/g, ' ')}`,
      `DESCRIPTION:${String(block.action || startLabel || 'Flicker schedule block').replace(/\n/g, ' ')}`,
      'END:VEVENT'
    ].join('\r\n');
  });

  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Flicker//Deadline Rescue//EN', ...events, 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'flicker-schedule.ics';
  link.click();
  URL.revokeObjectURL(url);
}

function downloadTaskIcs(task) {
  const end = new Date(task.deadline);
  const start = new Date(end.getTime() - Number(task.effortMinutes || 30) * 60000);
  const format = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const stamp = format(new Date());
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flicker//Deadline Rescue//EN',
    'BEGIN:VEVENT',
    `UID:flicker-task-${task.id}@local`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${format(start)}`,
    `DTEND:${format(end)}`,
    `SUMMARY:${String(task.title || 'Flicker task').replace(/\n/g, ' ')}`,
    `DESCRIPTION:${String(task.notes || 'Deadline protected by Flicker').replace(/\n/g, ' ')}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${String(task.title || 'flicker-task').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [token, setToken] = useState(localStorage.getItem(tokenKey) || '');
  const [dashboard, setDashboard] = useState(null);
  const [tab, setTab] = useState('live');
  const [panel, setPanel] = useState(null);
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [actionTask, setActionTask] = useState(null);
  const [funMode, setFunModeState] = useState(() => localStorage.getItem(funModeKey) === 'true');
  const [darkMode, setDarkModeState] = useState(() => localStorage.getItem(darkModeKey) === 'true');
  const [notificationsEnabled, setNotificationsEnabled] = useState(canNotify() && Notification.permission === 'granted');
  const notifiedRef = useRef(new Set());
  const spokenStageRef = useRef(new Set());
  const lastSpokenRef = useRef(new Map());
  const actionLockStartedRef = useRef(new Set());
  const latestDashboardRef = useRef(null);
  const voiceIntervalRef = useRef(null);
  const dashboardReadyRef = useRef(false);

  const liveTasks = useMemo(
    () => (dashboard?.liveTasks || []).map(normalizeTask).sort((a, b) => b.heat.level - a.heat.level),
    [dashboard]
  );
  const completedTasks = useMemo(() => (dashboard?.completedTasks || []).map(normalizeTask), [dashboard]);
  const lastLight = liveTasks.find((task) => task.heat.label === 'Last Light');

  function setFunMode(nextValue) {
    setFunModeState(nextValue);
    localStorage.setItem(funModeKey, String(nextValue));
  }

  function setDarkMode(nextValue) {
    setDarkModeState(nextValue);
    localStorage.setItem(darkModeKey, String(nextValue));
  }

  useEffect(() => {
    if (!token) return undefined;
    refresh(true);
    const timer = setInterval(() => {
      refresh(true);
    }, 3500);
    return () => clearInterval(timer);
  }, [token, funMode]);

  useEffect(() => {
    latestDashboardRef.current = dashboard;
  }, [dashboard]);

  useEffect(() => {
    if (!token) return undefined;
    voiceIntervalRef.current = setInterval(() => {
      const current = latestDashboardRef.current;
      if (current?.user?.voiceReminders) {
        maybeSpeak(current, true, funMode, true);
      }
    }, 60000);
    return () => clearInterval(voiceIntervalRef.current);
  }, [token, funMode]);

  async function api(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  async function run(label, action, silent = false) {
    if (!silent) setLoading(label);
    setError('');
    try {
      return await action();
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading('');
    }
  }

  async function refresh(silent = false) {
    await run('Loading Flicker', async () => {
      const data = await api('/api/dashboard');
      maybeNotify(data, data.user?.voiceReminders, funMode);
      setDashboard(data);
    }, silent);
  }

  function maybeNotify(data, voiceEnabled = false, roastEnabled = false) {
    if (!dashboardReadyRef.current) {
      dashboardReadyRef.current = true;
      return;
    }

    if (canNotify() && Notification.permission === 'granted') {
      for (const request of data.incomingHelpRequests || []) {
        const key = `flare-${request.id}-${request.status}`;
        if (request.status === 'pending' && !notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);
          showBrowserNotification(
            request.kind === 'Reminder check-in' ? 'Reminder check-in request' : 'New Flare request',
            `@${request.ownerUsername} needs ${request.kind} for "${request.taskTitle}".`
          );
          speak(`Flicker check-in. ${request.ownerUsername} needs ${request.kind} for ${request.taskTitle}.`, voiceEnabled);
        }
      }

      for (const task of (data.liveTasks || []).map(normalizeTask)) {
        const key = `notif-${task.id}-${task.heat.label}`;
        if (task.heat.minutesLeft >= 0 && task.heat.level >= 4 && !notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);
          showBrowserNotification('Task needs action', `"${task.title}" has ${timeLeft(task.heat.minutesLeft)}.`);
        }
      }
    }

    maybeSpeak(data, voiceEnabled, roastEnabled, false);
  }

  function maybeSpeak(data, voiceEnabled = false, roastEnabled = false, allowRepeats = false) {
    if (!voiceEnabled || !canSpeak()) return;
    const nowMs = Date.now();

    for (const task of (data.liveTasks || []).map(normalizeTask)) {
      if (actionLockStartedRef.current.has(task.id)) continue;
      if (task.heat.label === 'Missed' && roastEnabled) {
        const missedKey = `speak-${task.id}-Missed`;
        if (!spokenStageRef.current.has(missedKey)) {
          spokenStageRef.current.add(missedKey);
          roast('missed', true);
        }
        continue;
      }
      if (task.heat.level < 2 || task.heat.minutesLeft < 0) continue;

      const stageKey = `speak-${task.id}-${task.heat.label}`;
      const script = voiceScriptFor(task);
      if (!script) continue;

      if (!spokenStageRef.current.has(stageKey)) {
        spokenStageRef.current.add(stageKey);
        lastSpokenRef.current.set(task.id, nowMs);
        if (roastEnabled) {
          const category = task.heat.label === 'Last Light' ? 'lastLight' : task.heat.label.toLowerCase();
          roast(category, true);
        } else {
          speak(script, true);
        }
        continue;
      }

      if (!allowRepeats) continue;
      const repeatMs = task.heat.label === 'Last Light' ? 20 * 60 * 1000 : task.heat.label === 'Critical' ? 45 * 60 * 1000 : 0;
      if (!repeatMs) continue;

      const lastSpoken = lastSpokenRef.current.get(task.id) || 0;
      if (nowMs - lastSpoken >= repeatMs) {
        lastSpokenRef.current.set(task.id, nowMs);
        if (roastEnabled) {
          roast(task.heat.label === 'Last Light' ? 'lastLight' : 'critical', true);
        } else {
          speak(script, true);
        }
      }
    }
  }

  async function enableNotifications() {
    if (!canNotify()) {
      setError('Browser notifications are not supported here.');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
    if (permission === 'granted') {
      showBrowserNotification('Flicker notifications enabled', 'You will get alerts for urgent tasks and reminder check-ins while Flicker is open.');
    }
  }

  async function login(mode, username, password) {
    await run(mode === 'register' ? 'Creating account' : 'Logging in', async () => {
      const data = await fetch(`${apiBase}/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      }).then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Login failed.');
        return payload;
      });
      localStorage.setItem(tokenKey, data.token);
      setToken(data.token);
      setDashboard(data.dashboard);
    });
  }

  async function logout() {
    await run('Logging out', async () => {
      await api('/api/auth/logout', { method: 'POST' });
    });
    localStorage.removeItem(tokenKey);
    setToken('');
    setDashboard(null);
    setPanel(null);
    setBrief(null);
  }

  async function patchProfile(body) {
    await run('Saving profile', async () => {
      const data = await api('/api/profile', { method: 'PATCH', body });
      setDashboard(data);
    });
  }

  async function createTask(task) {
    await run('Adding task', async () => {
      const data = await api('/api/tasks', { method: 'POST', body: task });
      setDashboard(data);
    });
  }

  async function updateTask(taskId, body) {
    await run('Updating task', async () => {
      const data = await api(`/api/tasks/${taskId}`, { method: 'PATCH', body });
      setDashboard(data);
    });
  }

  async function completeTask(task) {
    await run('Moving task to Finished', async () => {
      const data = await api(`/api/tasks/${task.id}/complete`, { method: 'POST' });
      setDashboard(data);
      setTab('finished');
      if (funMode) fireConfetti();
      setPanel({
        title: 'Moved to Finished',
        body: `"${task.title}" is no longer on your live board. Clean board, clean brain.`
      });
    });
  }

  async function aiBrief() {
    await run('Creating daily signal', async () => {
      const data = await api('/api/ai/brief', { method: 'POST' });
      setBrief(data);
      const speechText = `${funMode ? 'Alright, pay attention: ' : ''}${briefSpeechText(data)}`;
      setPanel({ title: data.headline, lines: data.lines, body: data.firstMove, note: data.note, offline: data.offline, modelUsed: data.modelUsed, speechText });
      speak(speechText, dashboard?.user?.voiceReminders);
    });
  }

  function readBriefAloud() {
    if (brief) speak(`${funMode ? 'Alright, pay attention: ' : ''}${briefSpeechText(brief)}`, true);
  }

  function openActionLock(task) {
    actionLockStartedRef.current.add(task.id);
    setActionTask(task);
  }

  async function aiAction(type, task) {
    const route = type === 'nudge' ? '/api/ai/nudge' : type === 'breakdown' ? '/api/ai/breakdown' : '/api/ai/last-light';
    await run('Asking Gemini', async () => {
      const data = await api(route, { method: 'POST', body: { taskId: task.id } });
      if (type === 'breakdown') {
        setPanel({ title: 'Break it down', body: data.summary, steps: data.steps, note: data.note, offline: data.offline, modelUsed: data.modelUsed });
      } else if (type === 'last') {
        setPanel({ title: data.headline, lines: data.moves, body: data.askFriend, note: data.note, offline: data.offline, modelUsed: data.modelUsed });
      } else {
        setPanel({ title: data.type, body: data.message, lines: [`Safe snooze: ${data.safeSnoozeMinutes} min`, data.friendHelp], note: data.note, offline: data.offline, modelUsed: data.modelUsed });
      }
    });
  }

  async function planDay(availableMinutes) {
    await run('Planning your day', async () => {
      const data = await api('/api/ai/plan-day', { method: 'POST', body: { availableMinutes } });
      setPanel({
        title: data.summary,
        body: data.note,
        lines: [
          ...(data.doFirst || []).map((item) => `${item.title}: ${item.nextAction} (${item.why})`),
          ...(data.askFriend || []),
          ...(data.delay || []).map((item) => `Delay: ${item}`)
        ],
        note: data.note,
        offline: data.offline,
        modelUsed: data.modelUsed
      });
      return data;
    });
  }

  async function scheduleDay(availableMinutes, startTime) {
    return run('Building schedule', async () => {
      const data = await api('/api/ai/schedule', { method: 'POST', body: { availableMinutes, startTime } });
      setPanel({
        title: data.headline,
        body: data.warning,
        lines: (data.blocks || []).map((block) => `${block.title} · ${block.minutes} min · ${block.action}`),
        note: data.note,
        offline: data.offline,
        modelUsed: data.modelUsed
      });
      return data;
    });
  }

  async function parseVoice(transcript) {
    return run('Parsing voice task', async () => {
      return api('/api/ai/parse-voice', { method: 'POST', body: { transcript } });
    });
  }

  async function createHabit(habit) {
    await run('Adding habit', async () => {
      const data = await api('/api/habits', { method: 'POST', body: habit });
      setDashboard(data);
    });
  }

  async function checkHabit(habitId) {
    await run('Checking in habit', async () => {
      const data = await api(`/api/habits/${habitId}/check-in`, { method: 'POST' });
      setDashboard(data);
    });
  }

  async function resetHabit(habitId) {
    await run('Resetting habit', async () => {
      const data = await api(`/api/habits/${habitId}/reset`, { method: 'POST' });
      setDashboard(data);
    });
  }

  async function deleteHabit(habitId) {
    await run('Removing habit', async () => {
      const data = await api(`/api/habits/${habitId}`, { method: 'DELETE' });
      setDashboard(data);
    });
  }

  async function sendFriendRequest(username) {
    await run('Sending friend request', async () => {
      const data = await api('/api/friends/request', { method: 'POST', body: { username } });
      setDashboard(data);
    });
  }

  async function respondFriend(requestId, action) {
    await run('Updating friend request', async () => {
      const data = await api(`/api/friends/${requestId}/respond`, { method: 'POST', body: { action } });
      setDashboard(data);
    });
  }

  async function sendFlare(task, body) {
    await run('Sending flare', async () => {
      const data = await api(`/api/tasks/${task.id}/flares`, { method: 'POST', body });
      setDashboard(data);
      setPanel({ title: 'Flare sent', body: `Your request for "${task.title}" is waiting for a friend to accept or reject.` });
    });
  }

  async function respondFlare(requestId, action) {
    await run('Updating flare', async () => {
      const data = await api(`/api/flares/${requestId}/respond`, { method: 'POST', body: { action } });
      setDashboard(data);
      if (action === 'accept') {
        setTab('live');
        setPanel({ title: 'Shared task added', body: 'This task is now on your Live page. You can update progress or mark it done.' });
      }
    });
  }

  if (!token || !dashboard) {
    return <Login onSubmit={login} error={error} loading={loading} />;
  }

  const tabs = [
    ['live', `Live (${liveTasks.length})`, 'Tasks that still need action.'],
    ['planner', 'Planner', 'Prioritize tasks and create schedule blocks.'],
    ['habits', `Habits (${dashboard.habits?.length || 0})`, 'Repeatable goals that prevent future panic.'],
    ['finished', `Finished (${completedTasks.length})`, 'Completed work moved out of your way.'],
    ['crew', `Crew (${dashboard.friends.length})`, 'Friends who can check in or help.'],
    ['requests', `Requests (${dashboard.incomingHelpRequests.filter((r) => r.status === 'pending').length})`, 'Incoming and outgoing flares.']
  ];
  const activeTab = tabs.find(([key]) => key === tab) || tabs[0];

  return (
    <main className={`${lastLight ? 'app alert' : 'app'}${funMode ? ' fun-mode' : ''}${darkMode ? ' dark-mode' : ''}`}>
      {!dashboard.user.tutorialSeen && <Tutorial onDone={() => patchProfile({ tutorialSeen: true })} />}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
      {actionTask && (
        <ActionLock
          task={actionTask}
          friends={dashboard.friends}
          voiceEnabled={dashboard.user.voiceReminders}
          funMode={funMode}
          aiAction={aiAction}
          updateTask={updateTask}
          completeTask={completeTask}
          sendFlare={sendFlare}
          onClose={() => setActionTask(null)}
        />
      )}

      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <p className="eyebrow">Deadline companion</p>
            <h1>Flicker</h1>
            <p>@{dashboard.user.username}</p>
          </div>

          <div className="profile-card">
            <span>{funMode ? 'Chaos points' : 'Rescue points'}</span>
            <strong>{dashboard.user.rescuePoints || 0}</strong>
          </div>

          <nav className="side-nav">
            {tabs.map(([key, label]) => (
              <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </nav>

          <div className="sidebar-status">
            <VoiceStatus enabled={dashboard.user.voiceReminders} funMode={funMode} />
            <span className={dashboard.ai?.configured ? 'ai-status live' : 'ai-status'}>
              {dashboard.ai?.configured ? 'Gemini on' : 'Fallback mode'}
            </span>
          </div>

          <button className="secondary logout-button" onClick={logout}>Logout</button>
        </aside>

        <section className="workspace">
          <header className="workspace-top">
            <div>
              <p className="eyebrow">Current view</p>
              <h2>{activeTab[1]}</h2>
              <p>{activeTab[2]}</p>
            </div>
            <div className="quick-actions">
              <button onClick={aiBrief}>Daily Signal</button>
              <button className="secondary" onClick={() => setGuideOpen(true)}>Guide</button>
              <button className="secondary" onClick={() => speak(funMode ? "I'm watching you. The deadlines are watching you. We're all watching." : 'Flicker voice is active. Deadline rescue standing by.', true)}>
                Test voice
              </button>
              <button className={darkMode ? 'mode-toggle active' : 'mode-toggle'} onClick={() => setDarkMode(!darkMode)}>
                {darkMode ? 'Night on' : 'Night mode'}
              </button>
            </div>
          </header>

          <section className="control-strip">
            <label className="energy-control">
              <span>Energy</span>
              <select value={dashboard.user.energy} onChange={(event) => patchProfile({ energy: event.target.value })}>
                <option value="low">Low</option>
                <option value="okay">Okay</option>
                <option value="high">High</option>
              </select>
            </label>
            <button className="secondary" onClick={enableNotifications}>
              {notificationsEnabled ? 'Notifications on' : 'Enable notifications'}
            </button>
            <label className="voice-toggle">
              <input
                type="checkbox"
                checked={dashboard.user.voiceReminders}
                onChange={(event) => patchProfile({ voiceReminders: event.target.checked })}
              />
              Voice reminders
            </label>
            <button className={funMode ? 'fun-toggle active' : 'fun-toggle'} onClick={() => setFunMode(!funMode)}>
              {funMode ? 'Fun mode on' : 'Fun mode'}
            </button>
          </section>

          {lastLight && (
            <section className="banner">
              <strong>Last Light:</strong>
              <span>{lastLight.title} has {timeLeft(lastLight.heat.minutesLeft)}.</span>
              <button onClick={() => aiAction('last', lastLight)}>Show 3 moves</button>
            </section>
          )}

          {error && <div className="error">{error}</div>}
          {loading && <div className="loading">{loading}</div>}

          <section className="pulse-row">
            <div className="pulse-card">
              <span>Live</span>
              <strong>{liveTasks.length}</strong>
            </div>
            <div className="pulse-card hot">
              <span>Urgent</span>
              <strong>{liveTasks.filter((task) => task.heat.level >= 4).length}</strong>
            </div>
            <div className="pulse-card">
              <span>Shared</span>
              <strong>{liveTasks.filter((task) => task.role === 'helper').length}</strong>
            </div>
            <div className="pulse-card">
              <span>Habits</span>
              <strong>{dashboard.habits?.length || 0}</strong>
            </div>
          </section>

          <section className="layout">
            <section className="main-panel">
              {tab === 'live' && (
                <LivePage
                  tasks={liveTasks}
                  friends={dashboard.friends}
                  brief={brief}
                  funMode={funMode}
                  readBriefAloud={readBriefAloud}
                  createTask={createTask}
                  updateTask={updateTask}
                  completeTask={completeTask}
                  aiAction={aiAction}
                  sendFlare={sendFlare}
                  parseVoice={parseVoice}
                  startActionLock={openActionLock}
                />
              )}
              {tab === 'planner' && (
                <PlannerPage
                  tasks={liveTasks}
                  planDay={planDay}
                  scheduleDay={scheduleDay}
                />
              )}
              {tab === 'habits' && (
                <HabitsPage
                  habits={dashboard.habits || []}
                  createHabit={createHabit}
                  checkHabit={checkHabit}
                  resetHabit={resetHabit}
                  deleteHabit={deleteHabit}
                />
              )}
              {tab === 'finished' && <FinishedPage tasks={completedTasks} />}
              {tab === 'crew' && (
                <CrewPage
                  dashboard={dashboard}
                  sendFriendRequest={sendFriendRequest}
                  respondFriend={respondFriend}
                  patchProfile={patchProfile}
                />
              )}
              {tab === 'requests' && (
                <RequestsPage
                  incoming={dashboard.incomingHelpRequests}
                  outgoing={dashboard.outgoingHelpRequests}
                  respondFlare={respondFlare}
                />
              )}
            </section>

            <aside className="side">
              <AiPanel panel={panel} />
              <Activity activity={dashboard.activity} />
            </aside>
          </section>
        </section>
      </div>
    </main>
  );
}

function Login({ onSubmit, error, loading }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function submit(event) {
    event.preventDefault();
    onSubmit(mode, username, password);
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">Flicker</p>
        <h1>Plan tasks, get help, finish before deadlines.</h1>
        <p>Use one account for yourself, or open a second browser window to test friend requests.</p>
        <form onSubmit={submit}>
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="username" />
          <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="password" type="password" />
          <button type="submit">{mode === 'login' ? 'Login' : 'Create account'}</button>
        </form>
        <button className="text-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Login'}
        </button>
        {loading && <p className="loading">{loading}</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}

function Tutorial({ onDone }) {
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <p className="eyebrow">Quick tour</p>
        <h2>Flicker is simple.</h2>
        <ol>
          <li><strong>Live</strong> is only for tasks you still need to finish.</li>
          <li><strong>Finished</strong> keeps completed tasks away from today’s noise.</li>
          <li><strong>Crew</strong> lets you add friends by username.</li>
          <li><strong>Requests</strong> is where friends accept or reject your flares.</li>
          <li><strong>Planner</strong> creates priorities, schedule blocks, and calendar files.</li>
          <li><strong>Habits</strong> tracks repeatable goals that prevent deadline panic.</li>
          <li><strong>Action Lock</strong> starts a focused rescue timer with blocker help and escalation.</li>
          <li><strong>Voice reminders</strong> speak urgent reminders when enabled.</li>
          <li><strong>Smart Nudge</strong> gives one next action. <strong>Break Down</strong> splits a task. <strong>Last Light</strong> gives emergency steps.</li>
        </ol>
        <button onClick={onDone}>Got it</button>
      </section>
    </div>
  );
}

function VoiceStatus({ enabled, funMode }) {
  if (!canSpeak()) return <span className="voice-status unavailable">No audio</span>;
  if (enabled && funMode) return <span className="voice-status roast">Voice + fun</span>;
  return enabled ? <span className="voice-status on">Voice on</span> : <span className="voice-status off">Voice off</span>;
}

function LivePage({ tasks, friends, brief, funMode, readBriefAloud, createTask, updateTask, completeTask, aiAction, sendFlare, parseVoice, startActionLock }) {
  return (
    <div className="stack">
      <section className="card signal">
        <div>
          <p className="eyebrow">Daily Signal</p>
          <h2>{brief?.headline || 'Click Daily Signal for a simple plan.'}</h2>
          {brief?.firstMove && <p>{brief.firstMove}</p>}
          {brief && <button className="read-aloud" onClick={readBriefAloud}>Read aloud</button>}
        </div>
      </section>
      <TaskForm createTask={createTask} parseVoice={parseVoice} />
      <section className="stack">
        {tasks.length === 0 ? (
          <Empty
            title={funMode ? 'No live tasks. Suspiciously peaceful.' : 'No live tasks yet.'}
            body={funMode ? 'Add one task and Flicker will start watching the clock.' : 'Add a task to start planning, reminders, and friend help.'}
          />
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              friends={friends}
              updateTask={updateTask}
              completeTask={completeTask}
              aiAction={aiAction}
              sendFlare={sendFlare}
              startActionLock={startActionLock}
              funMode={funMode}
            />
          ))
        )}
      </section>
    </div>
  );
}

function TaskForm({ createTask, parseVoice }) {
  const [task, setTask] = useState({
    title: '',
    deadline: soon(24),
    effortMinutes: 30,
    importance: 3,
    category: 'General',
    notes: '',
    canAskFriend: true
  });
  const [voiceStatus, setVoiceStatus] = useState('');

  function submit(event) {
    event.preventDefault();
    createTask(task);
    setTask({ ...task, title: '', notes: '' });
  }

  function startVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus('Voice input is not supported in this browser.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setVoiceStatus('Listening...');
    recognition.onresult = async (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      setVoiceStatus(`Heard: ${transcript}`);
      const parsed = await parseVoice(transcript);
      if (parsed) {
        setTask({
          title: parsed.title || transcript,
          deadline: toLocalInputValue(parsed.deadline),
          effortMinutes: parsed.effortMinutes || 30,
          importance: parsed.importance || 3,
          category: parsed.category || 'Voice',
          notes: parsed.notes || transcript,
          canAskFriend: true
        });
        setVoiceStatus('Voice task filled. Review and add it.');
      }
    };
    recognition.onerror = () => setVoiceStatus('Could not capture voice. Try typing it.');
    recognition.start();
  }

  return (
    <form className="card form" onSubmit={submit}>
      <p className="eyebrow">Add live task</p>
      <div className="button-row compact-row">
        <button type="button" className="secondary" onClick={startVoice}>Speak task</button>
        {voiceStatus && <span className="inline-note">{voiceStatus}</span>}
      </div>
      <input value={task.title} onChange={(event) => setTask({ ...task, title: event.target.value })} placeholder="Task name" />
      <div className="form-grid">
        <label>
          Deadline
          <input type="datetime-local" value={task.deadline} onChange={(event) => setTask({ ...task, deadline: event.target.value })} />
        </label>
        <label>
          Effort minutes
          <input type="number" min="5" step="5" value={task.effortMinutes} onChange={(event) => setTask({ ...task, effortMinutes: event.target.value })} />
        </label>
        <label>
          Importance
          <select value={task.importance} onChange={(event) => setTask({ ...task, importance: event.target.value })}>
            <option value="1">Low</option>
            <option value="3">Normal</option>
            <option value="5">High</option>
          </select>
        </label>
        <label>
          Category
          <input value={task.category} onChange={(event) => setTask({ ...task, category: event.target.value })} />
        </label>
      </div>
      <textarea value={task.notes} onChange={(event) => setTask({ ...task, notes: event.target.value })} placeholder="Optional notes" />
      <label className="check">
        <input type="checkbox" checked={task.canAskFriend} onChange={(event) => setTask({ ...task, canAskFriend: event.target.checked })} />
        Allow friend help for this task
      </label>
      <button type="submit">Add task</button>
    </form>
  );
}

function TaskCard({ task, friends, updateTask, completeTask, aiAction, sendFlare, startActionLock, funMode }) {
  const [friendId, setFriendId] = useState('');
  const [kind, setKind] = useState('Focus sprint');
  const [message, setMessage] = useState('');
  const [escalationMinutes, setEscalationMinutes] = useState(kind === 'Reminder check-in' ? 30 : 0);
  const [countdownSeconds, setCountdownSeconds] = useState(() =>
    Math.max(0, Math.floor((new Date(task.deadline).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    if (kind === 'Reminder check-in' && !escalationMinutes) setEscalationMinutes(30);
    if (kind !== 'Reminder check-in' && escalationMinutes) setEscalationMinutes(0);
  }, [kind]);

  useEffect(() => {
    if (task.heat.label !== 'Last Light') return undefined;
    const timer = setInterval(() => {
      setCountdownSeconds(Math.max(0, Math.floor((new Date(task.deadline).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [task.deadline, task.heat.label]);

  const countdownMinutes = Math.floor(countdownSeconds / 60);
  const countdownRemainder = String(countdownSeconds % 60).padStart(2, '0');
  const timeDisplay = task.heat.label === 'Last Light' ? `${countdownMinutes}:${countdownRemainder}` : timeLeft(task.heat.minutesLeft);

  return (
    <article className={`card task ${task.heat.className}`}>
      <div className="task-head">
        <div>
          <span className={`heat ${task.heat.className}`}>{task.heat.label}</span>
          {task.role === 'helper' && <span className="shared-pill">Shared by @{task.owner_username}</span>}
          {funMode && task.heat.label === 'Missed' && <span className="roast-badge">Fun mode noted this</span>}
          <h3>{task.title}</h3>
          <p>
            {task.category} · <span className={task.heat.label === 'Last Light' && countdownSeconds < 30 * 60 ? 'countdown-danger' : ''}>{timeDisplay}</span> · {task.effortMinutes} min
            {task.support_kind ? ` · ${task.support_kind}` : ''}
          </p>
        </div>
        <button onClick={() => completeTask(task)}>{task.role === 'helper' ? 'Complete for friend' : 'Done'}</button>
      </div>
      <div className="progress"><span style={{ width: `${task.progress || 0}%` }} /></div>
      <label>
        Progress: {task.progress || 0}%
        <input type="range" min="0" max="100" value={task.progress || 0} onChange={(event) => updateTask(task.id, { progress: Number(event.target.value) })} />
      </label>
      {task.notes && <p className="muted">{task.notes}</p>}
      <div className="button-row">
        <button onClick={() => startActionLock(task)}>Action Lock</button>
        <button className="secondary" onClick={() => aiAction('nudge', task)}>Smart Nudge</button>
        <button className="secondary" onClick={() => aiAction('breakdown', task)}>Break Down</button>
        <button className="secondary danger-button" onClick={() => aiAction('last', task)}>Last Light</button>
        <button className="secondary" onClick={() => downloadTaskIcs(task)}>Calendar</button>
      </div>
      {task.role !== 'helper' && task.canAskFriend && (
        <div className="flare-box">
          <p className="eyebrow">Send a Flare</p>
          {friends.length === 0 ? (
            <p className="muted">Add a friend in Crew first.</p>
          ) : (
            <>
              <div className="form-grid compact">
                <select value={friendId} onChange={(event) => setFriendId(event.target.value)}>
                  <option value="">Choose friend</option>
                  {friends.map((friend) => <option key={friend.id} value={friend.id}>@{friend.username}</option>)}
                </select>
                <select value={kind} onChange={(event) => setKind(event.target.value)}>
                  <option>Focus sprint</option>
                  <option>Review / unblock</option>
                  <option>Reminder check-in</option>
                  <option>Take over allowed subtask</option>
                </select>
              </div>
              <p className="preview"><strong>Preview:</strong> {flareHelp[kind]}</p>
              {kind === 'Reminder check-in' && (
                <label>
                  Escalate if I do not progress in
                  <select value={escalationMinutes} onChange={(event) => setEscalationMinutes(Number(event.target.value))}>
                    <option value="0">No escalation</option>
                    <option value="5">5 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                  </select>
                </label>
              )}
              <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Short message for your friend" />
              <button
                className="secondary"
                disabled={!friendId}
                onClick={() => sendFlare(task, { friendId, kind, message, escalationMinutes: kind === 'Reminder check-in' ? escalationMinutes : 0 })}
              >
                Send request
              </button>
            </>
          )}
        </div>
      )}
      {task.role === 'helper' && (
        <p className="preview">You accepted this Flare. Updating progress or completing it will update both dashboards.</p>
      )}
    </article>
  );
}

function ActionLock({ task, friends, voiceEnabled, funMode, aiAction, updateTask, completeTask, sendFlare, onClose }) {
  const [secondsLeft, setSecondsLeft] = useState(12 * 60);
  const [running, setRunning] = useState(false);
  const [friendId, setFriendId] = useState(friends[0]?.id || '');
  const [blocker, setBlocker] = useState('');
  const [roastQuote, setRoastQuote] = useState(ROAST_LINES.critical[0]);
  const spokenMilestonesRef = useRef(new Set());
  const nextProgress = Math.min(100, Number(task.progress || 0) + 20);

  useEffect(() => {
    if (funMode) roast('actionLockStart', voiceEnabled);
    else speak(`Action lock for ${task.title}. Stay focused for ${Math.min(task.effortMinutes || 30, 25)} minutes. Close all distractions.`, voiceEnabled);
  }, [funMode, task.title, task.effortMinutes, voiceEnabled]);

  useEffect(() => {
    if (!funMode) return undefined;
    const timer = setInterval(() => {
      setRoastQuote(ROAST_LINES.critical[Math.floor(Math.random() * ROAST_LINES.critical.length)]);
    }, 30000);
    return () => clearInterval(timer);
  }, [funMode]);

  useEffect(() => {
    if (!running || secondsLeft <= 0) return undefined;
    const timer = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [running, secondsLeft]);

  useEffect(() => {
    if (!running) return;
    if (secondsLeft === 5 * 60 && !spokenMilestonesRef.current.has('5min')) {
      spokenMilestonesRef.current.add('5min');
      if (funMode) speak('Five minutes left. The roast is almost ready.', voiceEnabled);
      else speak(`5 minutes left in your action lock for ${task.title}. Keep going.`, voiceEnabled);
    }
    if (secondsLeft === 60 && !spokenMilestonesRef.current.has('1min')) {
      spokenMilestonesRef.current.add('1min');
      if (funMode) speak('One minute left. Wrap it up or explain yourself.', voiceEnabled);
      else speak('1 minute left. Wrap up and note where you stopped.', voiceEnabled);
    }
    if (secondsLeft === 0 && !spokenMilestonesRef.current.has('done')) {
      spokenMilestonesRef.current.add('done');
      if (funMode) roast('actionLockEnd', voiceEnabled);
      else speak(`Time's up. Update your progress on ${task.title} right now.`, voiceEnabled);
    }
  }, [secondsLeft, running, funMode, voiceEnabled, task.title]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');
  const progress = ((12 * 60 - secondsLeft) / (12 * 60)) * 283;
  const ringColor = secondsLeft <= 180 ? 'var(--red)' : secondsLeft <= 480 ? 'var(--yellow)' : 'var(--green)';
  const snoozeTime = new Date(Date.now() + 30 * 60000);
  const finishTime = new Date(snoozeTime.getTime() + Number(task.effortMinutes || 30) * 60000);

  async function saveProgress() {
    await updateTask(task.id, { progress: nextProgress });
    onClose();
  }

  async function askFriendNow() {
    if (!friendId) return;
    await sendFlare(task, {
      friendId,
      kind: 'Reminder check-in',
      message: 'I am in Action Lock. Please check in if I do not update progress soon.',
      escalationMinutes: 15
    });
  }

  function handleBlocker(value) {
    setBlocker(value);
    if (value === 'too-big') aiAction('breakdown', task);
    if (value === 'stuck-starting') aiAction('nudge', task);
    if (value === 'out-of-time') aiAction('last', task);
  }

  return (
    <div className="modal-backdrop">
      <section className="modal action-lock">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Action Lock</p>
            <h2>{task.title}</h2>
          </div>
          <button className="secondary" onClick={onClose}>Exit</button>
        </div>

        <div className="lock-timer-wrap">
          <svg className="lock-ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle className="lock-ring-bg" cx="60" cy="60" r="45" />
            <circle className="lock-ring-fg" cx="60" cy="60" r="45" style={{ strokeDashoffset: 283 - progress, stroke: ringColor }} />
          </svg>
          <div className={`lock-timer ${secondsLeft <= 180 ? 'danger' : secondsLeft <= 480 ? 'warn' : 'safe'}`}>{minutes}:{seconds}</div>
        </div>
        {funMode && <p className="roast-quote">{roastQuote}</p>}
        <p className="lock-copy">No full planning now. Do one visible action, then update progress.</p>

        <div className="button-row">
          <button onClick={() => setRunning(true)}>Start</button>
          <button className="secondary" onClick={() => setRunning(false)}>Pause</button>
          <button className="secondary" onClick={saveProgress}>{funMode ? 'Progress made' : 'I made progress'}</button>
          <button className="secondary" onClick={() => completeTask(task)}>{funMode ? 'Done, finally' : 'Complete task'}</button>
        </div>

        <section className="lock-section">
          <p className="eyebrow">Minimum save</p>
          <p>Make the smallest version that counts. If you cannot finish, leave behind proof of progress: outline, draft, payment step, notes, or a sent message.</p>
        </section>

        <section className="lock-section">
          <p className="eyebrow">I am blocked</p>
          <div className="button-row">
            <button className={blocker === 'too-big' ? '' : 'secondary'} onClick={() => handleBlocker('too-big')}>Too big</button>
            <button className={blocker === 'stuck-starting' ? '' : 'secondary'} onClick={() => handleBlocker('stuck-starting')}>Cannot start</button>
            <button className={blocker === 'out-of-time' ? '' : 'secondary'} onClick={() => handleBlocker('out-of-time')}>Out of time</button>
          </div>
        </section>

        <section className="lock-section">
          <p className="eyebrow">Snooze consequence</p>
          <p className="preview">If you snooze 30 minutes, your likely finish moves to {finishTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Start a short lock instead if this task matters.</p>
        </section>

        {!!friends.length && (
          <section className="lock-section">
            <p className="eyebrow">Escalate to friend</p>
            <div className="form-grid compact">
              <select value={friendId} onChange={(event) => setFriendId(event.target.value)}>
                {friends.map((friend) => <option key={friend.id} value={friend.id}>@{friend.username}</option>)}
              </select>
              <button className="secondary" onClick={askFriendNow}>Check in if I stall</button>
            </div>
          </section>
        )}
      </section>
    </div>
  );
}

function PlannerPage({ tasks, planDay, scheduleDay }) {
  const [availableMinutes, setAvailableMinutes] = useState(120);
  const [startTime, setStartTime] = useState('now');
  const [plan, setPlan] = useState(null);
  const [schedule, setSchedule] = useState(null);

  async function runPlan() {
    const data = await planDay(availableMinutes);
    if (data) setPlan(data);
  }

  async function runSchedule() {
    const data = await scheduleDay(availableMinutes, startTime);
    if (data) setSchedule(data);
  }

  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Priority planner</p>
        <h2>Plan the next useful block</h2>
        <div className="form-grid compact">
          <label>
            Available minutes
            <input type="number" min="15" step="15" value={availableMinutes} onChange={(event) => setAvailableMinutes(event.target.value)} />
          </label>
          <label>
            Start label
            <input value={startTime} onChange={(event) => setStartTime(event.target.value)} placeholder="now, 4pm, after lunch" />
          </label>
        </div>
        <div className="button-row">
          <button onClick={runPlan}>Plan My Day</button>
          <button className="secondary" onClick={runSchedule}>Build Schedule</button>
          <button className="secondary" disabled={!schedule?.blocks?.length} onClick={() => downloadIcs(schedule.blocks, startTime)}>Download Calendar</button>
        </div>
      </section>

      {plan && (
        <section className="card">
          <p className="eyebrow">Priority plan</p>
          <h3>{plan.summary}</h3>
          {(plan.doFirst || []).map((item) => (
            <div className="plan-item" key={`${item.taskId}-${item.title}`}>
              <strong>{item.title}</strong>
              <p>{item.nextAction}</p>
              <p className="muted">{item.why}</p>
            </div>
          ))}
          {!!plan.askFriend?.length && <p className="eyebrow">Ask friend</p>}
          {plan.askFriend?.map((item) => <p className="muted" key={item}>{item}</p>)}
          {!!plan.delay?.length && <p className="eyebrow">Delay</p>}
          {plan.delay?.map((item) => <p className="muted" key={item}>{item}</p>)}
        </section>
      )}

      {schedule && (
        <section className="card">
          <p className="eyebrow">Schedule blocks</p>
          <h3>{schedule.headline}</h3>
          {(schedule.blocks || []).map((block, index) => (
            <div className="schedule-block" key={`${block.title}-${index}`}>
              <strong>{block.minutes} min · {block.title}</strong>
              <p>{block.action}</p>
            </div>
          ))}
          {schedule.warning && <p className="preview">{schedule.warning}</p>}
        </section>
      )}

      {!tasks.length && <Empty title="No tasks to plan" body="Add live tasks first, then come back for prioritization and schedule blocks." />}
    </div>
  );
}

function HabitsPage({ habits, createHabit, checkHabit, resetHabit, deleteHabit }) {
  const [draft, setDraft] = useState({ title: '', targetCount: 1, period: 'daily' });

  function submit(event) {
    event.preventDefault();
    createHabit(draft);
    setDraft({ title: '', targetCount: 1, period: 'daily' });
  }

  return (
    <div className="stack">
      <form className="card form" onSubmit={submit}>
        <p className="eyebrow">Goal and habit tracking</p>
        <h2>Build the habit before the deadline</h2>
        <div className="form-grid compact">
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Study 30 minutes, apply to jobs..." />
          <select value={draft.period} onChange={(event) => setDraft({ ...draft, period: event.target.value })}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <label>
          Target check-ins
          <input type="number" min="1" value={draft.targetCount} onChange={(event) => setDraft({ ...draft, targetCount: event.target.value })} />
        </label>
        <button type="submit">Add habit</button>
      </form>

      {habits.length === 0 ? (
        <Empty title="No habits yet" body="Add one repeatable action that prevents future panic." />
      ) : (
        habits.map((habit) => {
          const percent = Math.min(100, Math.round((Number(habit.currentCount || 0) / Number(habit.targetCount || 1)) * 100));
          return (
            <article className="card habit" key={habit.id}>
              <div className="task-head">
                <div>
                  <span className="heat">{habit.period}</span>
                  <h3>{habit.title}</h3>
                  <p>{habit.currentCount}/{habit.targetCount} check-ins · streak {habit.streak}</p>
                </div>
                <button onClick={() => checkHabit(habit.id)}>Check in</button>
              </div>
              <div className="progress"><span style={{ width: `${percent}%` }} /></div>
              <div className="button-row">
                <button className="secondary" onClick={() => resetHabit(habit.id)}>Reset</button>
                <button className="secondary danger-button" onClick={() => deleteHabit(habit.id)}>Archive</button>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}

function FinishedPage({ tasks }) {
  return (
    <div className="stack">
      {tasks.length === 0 ? (
        <Empty title="Nothing finished yet" body="When you mark a live task done, it moves here." />
      ) : (
        tasks.map((task) => (
          <article className="card finished" key={task.id}>
            <span className="heat done">Finished</span>
            <h3>{task.title}</h3>
            <p>{task.category} · completed {new Date(task.completed_at).toLocaleString()}</p>
          </article>
        ))
      )}
    </div>
  );
}

function CrewPage({ dashboard, sendFriendRequest, respondFriend, patchProfile }) {
  const [username, setUsername] = useState('');

  return (
    <div className="stack">
      <section className="card form">
        <p className="eyebrow">Add friend</p>
        <div className="inline">
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="friend username" />
          <button onClick={() => { sendFriendRequest(username); setUsername(''); }}>Send request</button>
        </div>
      </section>

      <section className="card">
        <p className="eyebrow">Friends</p>
        {dashboard.friends.length === 0 ? <p className="muted">No friends yet.</p> : dashboard.friends.map((friend) => (
          <p key={friend.id}>@{friend.username} · {friend.rescuePoints || 0} rescue points</p>
        ))}
      </section>

      <section className="card">
        <p className="eyebrow">Friend requests</p>
        {dashboard.incomingFriendRequests.length === 0 && dashboard.outgoingFriendRequests.length === 0 && <p className="muted">No friend requests.</p>}
        {dashboard.incomingFriendRequests.map((request) => (
          <div className="request" key={request.id}>
            <span>@{request.username} wants to connect.</span>
            <button onClick={() => respondFriend(request.id, 'accept')}>Accept</button>
            <button className="secondary" onClick={() => respondFriend(request.id, 'reject')}>Reject</button>
          </div>
        ))}
        {dashboard.outgoingFriendRequests.map((request) => (
          <p className="muted" key={request.id}>Waiting for @{request.username} to accept.</p>
        ))}
      </section>

      <section className="card">
        <p className="eyebrow">Privacy</p>
        <label className="check">
          <input type="checkbox" checked={dashboard.user.publicMisses} onChange={(event) => patchProfile({ publicMisses: event.target.checked })} />
          Let friends see that I missed one task
        </label>
        <label className="check">
          <input type="checkbox" checked={dashboard.user.showTaskNames} onChange={(event) => patchProfile({ showTaskNames: event.target.checked })} />
          Include task names in shared activity
        </label>
      </section>
    </div>
  );
}

function RequestsPage({ incoming, outgoing, respondFlare }) {
  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Requests for you</p>
        {incoming.length === 0 ? <p className="muted">No incoming flares.</p> : incoming.map((request) => (
          <div className="request vertical" key={request.id}>
            <div>
              <h3>{request.taskTitle}</h3>
              <p>@{request.ownerUsername} needs: {request.kind}</p>
              {request.message && <p className="muted">{request.message}</p>}
              <span className={`status ${request.status}`}>{request.status}</span>
            </div>
            {request.status === 'pending' && (
              <div className="button-row">
                <button onClick={() => respondFlare(request.id, 'accept')}>Volunteer</button>
                <button className="secondary" onClick={() => respondFlare(request.id, 'reject')}>Reject</button>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="card">
        <p className="eyebrow">Requests you sent</p>
        {outgoing.length === 0 ? <p className="muted">No sent flares.</p> : outgoing.map((request) => (
          <p key={request.id}>
            @{request.friendUsername}: {request.kind} for "{request.taskTitle}" · <span className={`status ${request.status}`}>{request.status}</span>
          </p>
        ))}
      </section>
    </div>
  );
}

function AiPanel({ panel }) {
  return (
    <section className="card ai">
      <p className="eyebrow">Assistant</p>
      {!panel ? (
        <p className="muted">Use Daily Signal, Smart Nudge, Break Down, or Last Light.</p>
      ) : (
        <>
          <h3>{panel.title}</h3>
          {panel.offline && <span className="status rejected">Fallback used</span>}
          {panel.modelUsed && <span className="status accepted">Gemini: {panel.modelUsed}</span>}
          {panel.body && <p>{panel.body}</p>}
          {panel.speechText && <button className="read-aloud ai-read" onClick={() => speak(panel.speechText, true)}>Read aloud</button>}
          {panel.lines?.map((line) => <p className="muted" key={line}>{line}</p>)}
          {panel.steps?.map((step) => <p className="muted" key={step.title}>{step.title} · {step.minutes} min</p>)}
          {panel.note && <p className="preview">{panel.note}</p>}
        </>
      )}
    </section>
  );
}

function GuideModal({ onClose }) {
  return (
    <div className="modal-backdrop">
      <section className="modal guide-modal">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Quick guide</p>
            <h2>What everything does</h2>
          </div>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
        <div className="guide-grid">
          <p><strong>Daily Signal</strong><span>A simple plan for your current board.</span></p>
          <p><strong>Action Lock</strong><span>A focused rescue screen with timer, blocker help, and friend escalation.</span></p>
          <p><strong>Smart Nudge</strong><span>One small action to start or recover a task.</span></p>
          <p><strong>Break Down</strong><span>Splits a task into short steps.</span></p>
          <p><strong>Last Light</strong><span>Emergency mode when time is tight.</span></p>
          <p><strong>Planner</strong><span>Ranks tasks and builds calendar-ready focus blocks.</span></p>
          <p><strong>Habits</strong><span>Tracks repeatable actions like study or applications.</span></p>
          <p><strong>Voice reminders</strong><span>When enabled, Flicker speaks urgent reminders out loud.</span></p>
          <p><strong>Notifications</strong><span>Alerts for urgent tasks and reminder check-ins while Flicker is open.</span></p>
          <p><strong>Send a Flare</strong><span>Ask a friend to volunteer for focus, review, reminders, or an allowed shared subtask.</span></p>
        </div>
      </section>
    </div>
  );
}

function Activity({ activity }) {
  function activityTone(message = '') {
    const lower = message.toLowerCase();
    if (lower.includes('completed') || lower.includes('done')) return 'good';
    if (lower.includes('missed')) return 'bad';
    if (lower.includes('flare') || lower.includes('help')) return 'info';
    return 'warn';
  }

  return (
    <section className="card">
      <p className="eyebrow">Activity</p>
      {activity.length === 0 ? <p className="muted">No activity yet.</p> : activity.map((item) => (
        <p className={`activity ${activityTone(item.message)}`} key={item.id}>{item.message}</p>
      ))}
    </section>
  );
}

function Empty({ title, body }) {
  return (
    <section className="card empty">
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
