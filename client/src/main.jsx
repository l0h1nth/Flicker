import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const apiBase = import.meta.env.VITE_API_BASE || '';
const tokenKey = 'flicker-token-v2';

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

function App() {
  const [token, setToken] = useState(localStorage.getItem(tokenKey) || '');
  const [dashboard, setDashboard] = useState(null);
  const [tab, setTab] = useState('live');
  const [panel, setPanel] = useState(null);
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const liveTasks = useMemo(
    () => (dashboard?.liveTasks || []).map(normalizeTask).sort((a, b) => b.heat.level - a.heat.level),
    [dashboard]
  );
  const completedTasks = useMemo(() => (dashboard?.completedTasks || []).map(normalizeTask), [dashboard]);
  const lastLight = liveTasks.find((task) => task.heat.label === 'Last Light');

  useEffect(() => {
    if (token) refresh();
  }, [token]);

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

  async function run(label, action) {
    setLoading(label);
    setError('');
    try {
      return await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading('');
    }
  }

  async function refresh() {
    await run('Loading Flicker', async () => {
      const data = await api('/api/dashboard');
      setDashboard(data);
    });
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
      setPanel({ title: data.headline, lines: data.lines, body: data.firstMove });
    });
  }

  async function aiAction(type, task) {
    const route = type === 'nudge' ? '/api/ai/nudge' : type === 'breakdown' ? '/api/ai/breakdown' : '/api/ai/last-light';
    await run('Asking Gemini', async () => {
      const data = await api(route, { method: 'POST', body: { taskId: task.id } });
      if (type === 'breakdown') {
        setPanel({ title: 'Break it down', body: data.summary, steps: data.steps });
      } else if (type === 'last') {
        setPanel({ title: data.headline, lines: data.moves, body: data.askFriend });
      } else {
        setPanel({ title: data.type, body: data.message, lines: [`Safe snooze: ${data.safeSnoozeMinutes} min`, data.friendHelp] });
      }
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
    });
  }

  if (!token || !dashboard) {
    return <Login onSubmit={login} error={error} loading={loading} />;
  }

  return (
    <main className={lastLight ? 'app alert' : 'app'}>
      {!dashboard.user.tutorialSeen && <Tutorial onDone={() => patchProfile({ tutorialSeen: true })} />}

      <header className="topbar">
        <div>
          <p className="eyebrow">AI deadline rescue</p>
          <h1>Flicker</h1>
          <p>Welcome, @{dashboard.user.username}. Keep live work simple. Move done work out of the way.</p>
        </div>
        <div className="top-actions">
          <label>
            Energy
            <select value={dashboard.user.energy} onChange={(event) => patchProfile({ energy: event.target.value })}>
              <option value="low">Low</option>
              <option value="okay">Okay</option>
              <option value="high">High</option>
            </select>
          </label>
          <button onClick={aiBrief}>Daily Signal</button>
          <button className="secondary" onClick={logout}>Logout</button>
        </div>
      </header>

      {lastLight && (
        <section className="banner">
          <strong>Last Light:</strong>
          <span>{lastLight.title} has {timeLeft(lastLight.heat.minutesLeft)}.</span>
          <button onClick={() => aiAction('last', lastLight)}>Show 3 moves</button>
        </section>
      )}

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">{loading}</div>}

      <nav className="tabs">
        {[
          ['live', `Live (${liveTasks.length})`],
          ['finished', `Finished (${completedTasks.length})`],
          ['crew', `Crew (${dashboard.friends.length})`],
          ['requests', `Requests (${dashboard.incomingHelpRequests.filter((r) => r.status === 'pending').length})`]
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      <section className="layout">
        <section className="main-panel">
          {tab === 'live' && (
            <LivePage
              tasks={liveTasks}
              friends={dashboard.friends}
              brief={brief}
              createTask={createTask}
              updateTask={updateTask}
              completeTask={completeTask}
              aiAction={aiAction}
              sendFlare={sendFlare}
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
        <h1>Stop letting reminders die quietly.</h1>
        <p>Create two accounts in two browser windows to test friend requests and task help requests manually.</p>
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
        </ol>
        <button onClick={onDone}>Got it</button>
      </section>
    </div>
  );
}

function LivePage({ tasks, friends, brief, createTask, updateTask, completeTask, aiAction, sendFlare }) {
  return (
    <div className="stack">
      <section className="card signal">
        <div>
          <p className="eyebrow">Daily Signal</p>
          <h2>{brief?.headline || 'Click Daily Signal for a simple plan.'}</h2>
          {brief?.firstMove && <p>{brief.firstMove}</p>}
        </div>
      </section>
      <TaskForm createTask={createTask} />
      <section className="stack">
        {tasks.length === 0 ? (
          <Empty title="No live tasks" body="Add one task, then use Smart Nudge or send a Flare if you get stuck." />
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
            />
          ))
        )}
      </section>
    </div>
  );
}

function TaskForm({ createTask }) {
  const [task, setTask] = useState({
    title: '',
    deadline: soon(24),
    effortMinutes: 30,
    importance: 3,
    category: 'General',
    notes: '',
    canAskFriend: true
  });

  function submit(event) {
    event.preventDefault();
    createTask(task);
    setTask({ ...task, title: '', notes: '' });
  }

  return (
    <form className="card form" onSubmit={submit}>
      <p className="eyebrow">Add live task</p>
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

function TaskCard({ task, friends, updateTask, completeTask, aiAction, sendFlare }) {
  const [friendId, setFriendId] = useState('');
  const [kind, setKind] = useState('Focus sprint');
  const [message, setMessage] = useState('');

  return (
    <article className={`card task ${task.heat.className}`}>
      <div className="task-head">
        <div>
          <span className="heat">{task.heat.label}</span>
          <h3>{task.title}</h3>
          <p>{task.category} · {timeLeft(task.heat.minutesLeft)} · {task.effortMinutes} min</p>
        </div>
        <button onClick={() => completeTask(task)}>Done</button>
      </div>
      <div className="progress"><span style={{ width: `${task.progress || 0}%` }} /></div>
      <label>
        Progress: {task.progress || 0}%
        <input type="range" min="0" max="100" value={task.progress || 0} onChange={(event) => updateTask(task.id, { progress: Number(event.target.value) })} />
      </label>
      {task.notes && <p className="muted">{task.notes}</p>}
      <div className="button-row">
        <button className="secondary" onClick={() => aiAction('nudge', task)}>Smart Nudge</button>
        <button className="secondary" onClick={() => aiAction('breakdown', task)}>Break Down</button>
        <button className="secondary danger-button" onClick={() => aiAction('last', task)}>Last Light</button>
      </div>
      {task.canAskFriend && (
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
              <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Short message for your friend" />
              <button
                className="secondary"
                disabled={!friendId}
                onClick={() => sendFlare(task, { friendId, kind, message })}
              >
                Send request
              </button>
            </>
          )}
        </div>
      )}
    </article>
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
      <p className="eyebrow">AI help</p>
      {!panel ? (
        <p className="muted">Use Daily Signal, Smart Nudge, Break Down, or Last Light.</p>
      ) : (
        <>
          <h3>{panel.title}</h3>
          {panel.body && <p>{panel.body}</p>}
          {panel.lines?.map((line) => <p className="muted" key={line}>{line}</p>)}
          {panel.steps?.map((step) => <p className="muted" key={step.title}>{step.title} · {step.minutes} min</p>)}
        </>
      )}
    </section>
  );
}

function Activity({ activity }) {
  return (
    <section className="card">
      <p className="eyebrow">Activity</p>
      {activity.length === 0 ? <p className="muted">No activity yet.</p> : activity.map((item) => (
        <p className="activity" key={item.id}>{item.message}</p>
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
