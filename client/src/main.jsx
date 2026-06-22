import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const storageKey = 'flicker-state-v1';
const apiBase = import.meta.env.VITE_API_BASE || '';

const starterState = {
  profile: {
    username: 'you',
    energy: 'okay',
    publicMisses: false,
    showTaskNames: false
  },
  tasks: [
    {
      id: crypto.randomUUID(),
      title: 'Submit hackathon project doc',
      deadline: soon(26),
      effortMinutes: 90,
      importance: 5,
      category: 'Hackathon',
      notes: 'Need problem statement, solution overview, tech stack, Google tech used.',
      progress: 20,
      status: 'active',
      canAskFriend: true
    },
    {
      id: crypto.randomUUID(),
      title: 'Pay internet bill',
      deadline: soon(5),
      effortMinutes: 10,
      importance: 4,
      category: 'Life',
      notes: 'Quick payment, high consequence if forgotten.',
      progress: 0,
      status: 'active',
      canAskFriend: false
    }
  ],
  friends: [
    { id: crypto.randomUUID(), username: 'maya', points: 40 },
    { id: crypto.randomUUID(), username: 'arjun', points: 25 }
  ],
  flares: [],
  activity: [
    'Flicker created your first rescue board.',
    'Maya is available for focus sprint support.'
  ]
};

function soon(hours) {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return toDatetimeLocal(date);
}

function toDatetimeLocal(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || starterState;
  } catch {
    return starterState;
  }
}

function heatFor(task) {
  if (task.status === 'done') return { label: 'Saved', level: 0, className: 'saved' };
  const deadline = new Date(task.deadline).getTime();
  const rawMinutesLeft = Math.round((deadline - Date.now()) / 60000);
  if (rawMinutesLeft < 0) return { label: 'Missed', level: 6, className: 'missed', minutesLeft: rawMinutesLeft };
  const minutesLeft = Math.max(0, rawMinutesLeft);
  const remaining = Number(task.effortMinutes || 0) * (1 - Number(task.progress || 0) / 100);
  const importance = Number(task.importance || 3);
  const ratio = remaining ? minutesLeft / remaining : 99;

  if (minutesLeft <= 120) return { label: 'Last Light', level: 5, className: 'last', minutesLeft };
  if (ratio <= 1.2 || minutesLeft <= 360) return { label: 'Critical', level: 4, className: 'critical', minutesLeft };
  if (ratio <= 2 || importance >= 5) return { label: 'Hot', level: 3, className: 'hot', minutesLeft };
  if (ratio <= 4) return { label: 'Warming', level: 2, className: 'warm', minutesLeft };
  return { label: 'Calm', level: 1, className: 'calm', minutesLeft };
}

function formatTimeLeft(minutes = 0) {
  if (minutes < 0) return `${Math.abs(minutes)}m late`;
  if (minutes <= 0) return 'deadline passed';
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins ? `${mins}m` : ''} left`;
}

async function postJson(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error('AI request failed');
  return response.json();
}

function App() {
  const [state, setState] = useState(loadState);
  const [draft, setDraft] = useState({
    title: '',
    deadline: soon(24),
    effortMinutes: 45,
    importance: 3,
    category: 'Study',
    notes: '',
    canAskFriend: true
  });
  const [brief, setBrief] = useState(null);
  const [panel, setPanel] = useState({ type: 'brief' });
  const [loading, setLoading] = useState('');

  const tasksWithHeat = useMemo(
    () =>
      state.tasks
        .map((task) => ({ ...task, heat: heatFor(task) }))
        .sort((a, b) => b.heat.level - a.heat.level || new Date(a.deadline) - new Date(b.deadline)),
    [state.tasks]
  );

  const activeTasks = tasksWithHeat.filter((task) => task.status !== 'done');
  const lastLightTask = activeTasks.find((task) => task.heat.label === 'Last Light');
  const missedTasks = activeTasks.filter((task) => task.heat.label === 'Missed');

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    generateBrief();
  }, []);

  function patchState(updater) {
    setState((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      return next;
    });
  }

  async function runAi(label, action) {
    setLoading(label);
    try {
      await action();
    } finally {
      setLoading('');
    }
  }

  async function generateBrief() {
    await runAi('Generating daily brief', async () => {
      const data = await postJson('/api/ai/brief', {
        tasks: tasksWithHeat,
        profile: state.profile
      });
      setBrief(data);
      setPanel({ type: 'brief', data });
    });
  }

  function addTask(event) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    const task = {
      ...draft,
      id: crypto.randomUUID(),
      progress: 0,
      status: 'active',
      importance: Number(draft.importance),
      effortMinutes: Number(draft.effortMinutes)
    };
    patchState((current) => ({
      ...current,
      tasks: [task, ...current.tasks],
      activity: [`Added "${task.title}".`, ...current.activity].slice(0, 10)
    }));
    setDraft({ ...draft, title: '', notes: '' });
  }

  function updateTask(id, updates) {
    patchState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === id ? { ...task, ...updates } : task))
    }));
  }

  async function completeTask(task) {
    const actualMinutes = Math.max(5, Math.round(Number(task.effortMinutes || 30) * (Number(task.progress || 80) / 100)));
    updateTask(task.id, { status: 'done', progress: 100 });
    await runAi('Creating completion insight', async () => {
      const data = await postJson('/api/ai/victory', { task, actualMinutes, profile: state.profile });
      setPanel({ type: 'victory', task, data });
      patchState((current) => ({
        ...current,
        activity: [`Saved "${task.title}". +25 rescue points.`, ...current.activity].slice(0, 10)
      }));
    });
  }

  async function smartNudge(task) {
    await runAi('Writing smart nudge', async () => {
      const data = await postJson('/api/ai/nudge', { task, profile: state.profile });
      setPanel({ type: 'nudge', task, data });
    });
  }

  async function breakdown(task) {
    await runAi('Breaking task down', async () => {
      const data = await postJson('/api/ai/breakdown', { task });
      setPanel({ type: 'breakdown', task, data });
    });
  }

  async function lastLight(task) {
    await runAi('Entering Last Light', async () => {
      const data = await postJson('/api/ai/last-light', {
        task,
        minutesLeft: task.heat.minutesLeft,
        profile: state.profile
      });
      setPanel({ type: 'lastLight', task, data });
    });
  }

  async function replan(disruption) {
    await runAi('Replanning your board', async () => {
      const data = await postJson('/api/ai/replan', {
        tasks: tasksWithHeat,
        disruption,
        profile: state.profile
      });
      setPanel({ type: 'replan', data, disruption });
      patchState((current) => ({
        ...current,
        activity: [`Replanned after: ${disruption}.`, ...current.activity].slice(0, 10)
      }));
    });
  }

  function addFriend(username) {
    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!clean) return;
    patchState((current) => ({
      ...current,
      friends: [{ id: crypto.randomUUID(), username: clean, points: 0 }, ...current.friends]
    }));
  }

  function sendFlare(task, friend, kind) {
    const points = kind === 'Take over allowed subtask' ? 25 : 10;
    const flare = {
      id: crypto.randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      friend: friend.username,
      kind,
      status: 'sent',
      createdAt: new Date().toISOString()
    };
    patchState((current) => ({
      ...current,
      flares: [flare, ...current.flares],
      friends: current.friends.map((item) =>
        item.id === friend.id ? { ...item, points: item.points + points } : item
      ),
      activity: [`Sent a flare to ${friend.username}: ${kind}.`, ...current.activity].slice(0, 10)
    }));
  }

  return (
    <main className={lastLightTask ? 'app danger' : 'app'}>
      <header className="topbar">
        <div>
          <p className="eyebrow">AI deadline rescue companion</p>
          <h1>Flicker</h1>
        </div>
        <div className="profile">
          <label>
            Energy
            <select
              value={state.profile.energy}
              onChange={(event) =>
                patchState((current) => ({
                  ...current,
                  profile: { ...current.profile, energy: event.target.value }
                }))
              }
            >
              <option value="low">Low</option>
              <option value="okay">Okay</option>
              <option value="high">High</option>
            </select>
          </label>
          <button onClick={generateBrief}>Refresh brief</button>
        </div>
      </header>

      {lastLightTask && (
        <section className="last-banner">
          <strong>Last Light is active.</strong>
          <span>{lastLightTask.title} has {formatTimeLeft(lastLightTask.heat.minutesLeft)}.</span>
          <button onClick={() => lastLight(lastLightTask)}>Show 3 moves</button>
        </section>
      )}

      <section className="grid">
        <aside className="left">
          <section className="panel hero">
            <p className="eyebrow">Morning brief</p>
            <h2>{brief?.headline || 'Flicker is scanning your day.'}</h2>
            <ul>
              {(brief?.lines || ['Add tasks, set deadlines, and Flicker will turn reminders into action nudges.']).map(
                (line) => (
                  <li key={line}>{line}</li>
                )
              )}
            </ul>
            {brief?.firstMove && <p className="first-move">{brief.firstMove}</p>}
          </section>

          <TaskForm draft={draft} setDraft={setDraft} addTask={addTask} />
          <Friends
            friends={state.friends}
            flares={state.flares}
            profile={state.profile}
            missedTasks={missedTasks}
            addFriend={addFriend}
            patchState={patchState}
          />
        </aside>

        <section className="center">
          <div className="section-head">
            <div>
              <p className="eyebrow">Today board</p>
              <h2>Act before it burns out</h2>
            </div>
            <div className="loading">{loading}</div>
          </div>

          <div className="tasks">
            {tasksWithHeat.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                friends={state.friends}
                updateTask={updateTask}
                completeTask={completeTask}
                smartNudge={smartNudge}
                breakdown={breakdown}
                lastLight={lastLight}
                sendFlare={sendFlare}
              />
            ))}
          </div>
        </section>

        <aside className="right">
          <AiPanel panel={panel} />
          <section className="panel">
            <p className="eyebrow">Life happened</p>
            <h3>Replan without guilt</h3>
            {['Got sick', 'Meeting ran over', 'Lost motivation', 'Urgent work came up'].map((item) => (
              <button className="wide" key={item} onClick={() => replan(item)}>
                {item}
              </button>
            ))}
          </section>
          <section className="panel">
            <p className="eyebrow">Crew activity</p>
            <div className="feed">
              {state.activity.map((item, index) => (
                <p key={`${item}-${index}`}>{item}</p>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function TaskForm({ draft, setDraft, addTask }) {
  return (
    <form className="panel task-form" onSubmit={addTask}>
      <p className="eyebrow">Add task</p>
      <input
        value={draft.title}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        placeholder="What needs saving?"
      />
      <div className="two">
        <label>
          Deadline
          <input
            type="datetime-local"
            value={draft.deadline}
            onChange={(event) => setDraft({ ...draft, deadline: event.target.value })}
          />
        </label>
        <label>
          Effort
          <input
            type="number"
            min="5"
            step="5"
            value={draft.effortMinutes}
            onChange={(event) => setDraft({ ...draft, effortMinutes: event.target.value })}
          />
        </label>
      </div>
      <div className="two">
        <label>
          Importance
          <select
            value={draft.importance}
            onChange={(event) => setDraft({ ...draft, importance: event.target.value })}
          >
            <option value="1">1 - light</option>
            <option value="3">3 - normal</option>
            <option value="5">5 - serious</option>
          </select>
        </label>
        <label>
          Category
          <input
            value={draft.category}
            onChange={(event) => setDraft({ ...draft, category: event.target.value })}
          />
        </label>
      </div>
      <textarea
        value={draft.notes}
        onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
        placeholder="Notes, context, blockers..."
      />
      <label className="check">
        <input
          type="checkbox"
          checked={draft.canAskFriend}
          onChange={(event) => setDraft({ ...draft, canAskFriend: event.target.checked })}
        />
        Allow friend support
      </label>
      <button type="submit">Add to Flicker</button>
    </form>
  );
}

function TaskCard({ task, friends, updateTask, completeTask, smartNudge, breakdown, lastLight, sendFlare }) {
  const [showFlare, setShowFlare] = useState(false);

  return (
    <article className={`task ${task.heat.className}`}>
      <div className="task-top">
        <div>
          <span className="pill">{task.heat.label}</span>
          <h3>{task.title}</h3>
          <p>
            {task.category} · {task.status === 'done' ? 'completed' : formatTimeLeft(task.heat.minutesLeft)} ·{' '}
            {task.effortMinutes} min estimate
          </p>
        </div>
        <button className="ghost" onClick={() => completeTask(task)} disabled={task.status === 'done'}>
          {task.status === 'done' ? 'Saved' : 'Complete'}
        </button>
      </div>
      <div className="progress">
        <span style={{ width: `${task.progress}%` }} />
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={task.progress}
        onChange={(event) => updateTask(task.id, { progress: Number(event.target.value) })}
      />
      {task.notes && <p className="notes">{task.notes}</p>}
      <div className="actions">
        <button onClick={() => smartNudge(task)}>Smart nudge</button>
        <button onClick={() => breakdown(task)}>Break it down</button>
        <button onClick={() => lastLight(task)}>Last Light</button>
        <button onClick={() => setShowFlare(!showFlare)} disabled={!task.canAskFriend}>
          Send flare
        </button>
      </div>
      {showFlare && (
        <div className="flare-box">
          {friends.map((friend) => (
            <div key={friend.id} className="friend-row">
              <span>@{friend.username}</span>
              <button onClick={() => sendFlare(task, friend, 'Focus sprint')}>Focus</button>
              <button onClick={() => sendFlare(task, friend, 'Review / unblock')}>Review</button>
              <button onClick={() => sendFlare(task, friend, 'Reminder check-in')}>Remind</button>
              <button onClick={() => sendFlare(task, friend, 'Take over allowed subtask')}>Takeover</button>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function Friends({ friends, flares, profile, missedTasks, addFriend, patchState }) {
  const [username, setUsername] = useState('');
  return (
    <section className="panel">
      <p className="eyebrow">Panic Crew</p>
      <h3>Send a flare when stuck</h3>
      <div className="inline">
        <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="friend username" />
        <button
          onClick={() => {
            addFriend(username);
            setUsername('');
          }}
        >
          Add
        </button>
      </div>
      <div className="crew">
        {friends.map((friend) => (
          <span key={friend.id}>@{friend.username} · {friend.points} pts</span>
        ))}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={profile.publicMisses}
          onChange={(event) =>
            patchState((current) => ({
              ...current,
              profile: { ...current.profile, publicMisses: event.target.checked }
            }))
          }
        />
        Share missed-task activity
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={profile.showTaskNames}
          onChange={(event) =>
            patchState((current) => ({
              ...current,
              profile: { ...current.profile, showTaskNames: event.target.checked }
            }))
          }
        />
        Include task names in public activity
      </label>
      <div className="feed">
        {profile.publicMisses &&
          missedTasks.slice(0, 1).map((task) => (
            <p key={task.id}>
              Public activity: missed {profile.showTaskNames ? `"${task.title}"` : '1 task'}. Recovery plan ready.
            </p>
          ))}
        {flares.slice(0, 3).map((flare) => (
          <p key={flare.id}>Flare sent to @{flare.friend}: {flare.kind}</p>
        ))}
      </div>
    </section>
  );
}

function AiPanel({ panel }) {
  return (
    <section className="panel ai-panel">
      <p className="eyebrow">Gemini output</p>
      {panel.type === 'brief' && (
        <>
          <h3>Daily signal</h3>
          <p>{panel.data?.firstMove || 'Ask for a nudge, breakdown, replan, or Last Light rescue.'}</p>
        </>
      )}
      {panel.type === 'nudge' && (
        <>
          <h3>{panel.data.type}</h3>
          <p>{panel.data.message}</p>
          <div className="chips">
            {panel.data.actions?.map((action) => <span key={action}>{action}</span>)}
          </div>
          <p className="muted">Safe snooze: {panel.data.safeSnoozeMinutes} min</p>
        </>
      )}
      {panel.type === 'breakdown' && (
        <>
          <h3>Break it down</h3>
          <p>{panel.data.summary}</p>
          <ol>
            {panel.data.steps?.map((step) => (
              <li key={step.title}>{step.title} · {step.minutes} min</li>
            ))}
          </ol>
        </>
      )}
      {panel.type === 'lastLight' && (
        <>
          <h3>Last Light</h3>
          <p>{panel.data.headline}</p>
          <ol>
            {panel.data.moves?.map((move) => <li key={move}>{move}</li>)}
          </ol>
          <p className="muted">Drop: {panel.data.drop}</p>
        </>
      )}
      {panel.type === 'replan' && (
        <>
          <h3>New plan</h3>
          <p>{panel.data.headline}</p>
          <h4>Keep</h4>
          {panel.data.keep?.map((item) => <p key={item}>{item}</p>)}
          <h4>Move</h4>
          {panel.data.move?.map((item) => <p key={item}>{item}</p>)}
          <h4>Ask for help</h4>
          {panel.data.askForHelp?.map((item) => <p key={item}>{item}</p>)}
        </>
      )}
      {panel.type === 'victory' && (
        <>
          <h3>{panel.data.headline}</h3>
          <p>{panel.data.insight}</p>
          <p className="muted">{panel.data.nextTime}</p>
        </>
      )}
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
