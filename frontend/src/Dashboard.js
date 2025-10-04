import React, { useEffect, useState, useRef } from "react";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";

export default function Dashboard() {
  const [machines, setMachines] = useState([]);
  const [users, setUsers] = useState([{ id: 1, name: "User1" }]);
  const [currentUserId, setCurrentUserId] = useState(1);
  const [notifications, setNotifications] = useState([]);
  const [completedWashes, setCompletedWashes] = useState(new Set());
  const clientRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    // Reset data on page load
    fetch("/api/machines/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }).catch(e => console.error("Reset failed", e));

    const socket = new SockJS("/ws");
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
      onConnect: () => {
        console.log("WebSocket connected");

        client.subscribe("/topic/machines", (msg) => {
          try {
            setMachines(JSON.parse(msg.body));
          } catch (e) {
            console.error("parse machines", e);
          }
        });

        client.subscribe("/topic/notifications", (msg) => {
          try {
            const payload = JSON.parse(msg.body);
            handleNotification(payload);
          } catch (e) {
            console.error("parse notification", e);
          }
        });

        client.subscribe("/topic/washHistory", (msg) => {
          try {
            const completedUsers = JSON.parse(msg.body);
            setCompletedWashes(new Set(completedUsers));
          } catch (e) {
            console.error("parse wash history", e);
          }
        });
      },
      onStompError: (frame) => {
        console.error('STOMP error', frame);
      }
    });
    client.activate();
    clientRef.current = client;

    fetchMachines();

    intervalRef.current = setInterval(() => {
      setMachines(prev => [...prev]);
    }, 1000);

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => {
      if (clientRef.current) clientRef.current.deactivate();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function fetchMachines() {
    fetch("/api/machines")
      .then((r) => {
        if (!r.ok) throw new Error('Network response was not ok');
        return r.json();
      })
      .then((data) => setMachines(data))
      .catch((e) => console.error("fetch machines", e));
  }

  function remainingSeconds(endTime) {
    if (!endTime) return 0;
    const diff = Math.floor(new Date(endTime).getTime() / 1000 - Date.now() / 1000);
    return diff > 0 ? diff : 0;
  }

  function fmtSeconds(totalSec) {
    if (totalSec <= 0) return "0m 0s";
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs}s`;
  }

  function handleNotification(payload) {
    if (!payload || payload.type !== "PRE_NOTIFY") return;
    if (Number(payload.userId) !== Number(currentUserId)) return;

    const mins = Math.ceil(payload.minutesUntilStart);
    const machineName = payload.machineName || `Machine ${payload.machineId}`;

    const notifMsg = `Your turn on ${machineName} starts in ${mins} minute(s)!`;

    setNotifications(prev => [...prev, {
      id: Date.now(),
      message: notifMsg,
      machineId: payload.machineId
    }]);

    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== Date.now()));
    }, 10000);

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("WashSimple", {
        body: notifMsg,
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='75' font-size='80'>💧</text></svg>"
      });
    }
  }

  function addNewUser() {
    const name = prompt("Enter new username:");
    if (!name || !name.trim()) return;
    if (users.some(u => u.name === name.trim())) {
      alert("Username already exists!");
      return;
    }
    const id = Date.now();
    setUsers(prev => [...prev, { id, name: name.trim() }]);
    setCurrentUserId(id);
  }

  function totalRemainingSecondsForMachine(m) {
    let total = 0;
    if (m.inUse && m.endTime) total += remainingSeconds(m.endTime);
    if (m.queue?.length) {
      m.queue.forEach(q => {
        total += (q.minutes || 50) * 60;
      });
    }
    return total;
  }

  function remainingSecondsForUser(m, userId) {
    let total = 0;

    if (m.inUse && Number(m.currentUserId) === Number(userId)) {
      return remainingSeconds(m.endTime);
    }

    if (m.inUse && m.endTime) {
      total += remainingSeconds(m.endTime);
    }

    if (m.queue?.length) {
      for (let q of m.queue) {
        if (Number(q.userId) === Number(userId)) break;
        total += (q.minutes || 50) * 60;
      }
    }

    return total;
  }

  function getCurrentUserQueues() {
    return machines.filter(m =>
      Number(m.currentUserId) === Number(currentUserId) ||
      (m.queue && m.queue.some(q => Number(q.userId) === Number(currentUserId)))
    );
  }

  async function joinQueue(machineId) {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;

    if (completedWashes.has(currentUserId)) {
      alert("You have already washed your clothes today!");
      return;
    }

    const userInAnyMachine = machines.some(mm =>
      Number(mm.currentUserId) === Number(currentUserId) ||
      (mm.queue && mm.queue.some(q => Number(q.userId) === Number(currentUserId)))
    );

    if (userInAnyMachine) {
      alert("You are already using or queued for another machine.");
      return;
    }

    const minutesStr = prompt("Enter your wash duration (minutes):", "50");
    if (!minutesStr) return;
    const minutes = parseInt(minutesStr, 10);
    if (isNaN(minutes) || minutes <= 0) {
      alert("Please enter a valid number of minutes.");
      return;
    }

    let totalWaitSec = 0;
    if (machine.inUse && machine.endTime) totalWaitSec += remainingSeconds(machine.endTime);
    machine.queue?.forEach(q => totalWaitSec += (q.minutes || 50) * 60);

    const ok = window.confirm(
      `Machine: ${machine.name}\n` +
      `Current queue: ${machine.queue?.length || 0} user(s)\n` +
      `Estimated wait: ${Math.ceil(totalWaitSec/60)} minutes\n\n` +
      `Join queue?`
    );
    if (!ok) return;

    try {
      const res = await fetch("/api/machines/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineId, userId: currentUserId, minutes })
      });
      if (!res.ok) throw new Error('Failed to join queue');
      const j = await res.json();
      if (j.error) {
        alert(j.error);
      } else {
        alert(`Joined queue at position ${j.position}. You'll be notified 2 minutes before your turn.`);
        fetchMachines();
      }
    } catch (error) {
      console.error("Error joining queue:", error);
      alert("Failed to join queue. Please try again.");
    }
  }

  async function startWashing(machineId) {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;

    if (completedWashes.has(currentUserId)) {
      alert("You have already washed your clothes today!");
      return;
    }

    const minutesStr = prompt("Enter minutes for wash:", "50");
    if (!minutesStr) return;
    const minutes = parseInt(minutesStr, 10);
    if (isNaN(minutes) || minutes <= 0) {
      alert("Please enter a valid number of minutes.");
      return;
    }

    try {
      const res = await fetch("/api/machines/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineId, userId: currentUserId, minutes })
      });
      if (!res.ok) throw new Error('Failed to start washing');
      const j = await res.json();
      if (j.error) {
        alert(j.error);
      } else if (j.started) {
        alert(`Wash started! Will end at ${new Date(j.endTime).toLocaleTimeString()}`);
        fetchMachines();
      }
    } catch (error) {
      console.error("Error starting wash:", error);
      alert("Failed to start washing. Please try again.");
    }
  }

  const currentUserQueues = getCurrentUserQueues();

  return (
    <div className="dashboard-wrapper">
      <div className="container">
        {notifications.length > 0 && (
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {notifications.map(notif => (
              <div key={notif.id} style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                padding: '16px 20px',
                borderRadius: '12px',
                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4)',
                maxWidth: '320px',
                animation: 'slideIn 0.3s ease-out',
                fontWeight: '600'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>🔔</span>
                  <span>{notif.message}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="header-card">
          <div className="header">
            <div className="header-title">
              <span className="header-title-icon">💧</span>
              <h1>WashSimple</h1>
            </div>
            <div className="header-controls">
              <span className="header-controls-icon">👤</span>
              <select
                value={currentUserId}
                onChange={(e) => setCurrentUserId(Number(e.target.value))}
                className="user-select"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <button onClick={addNewUser} className="add-user-btn">
                + Add User
              </button>
            </div>
          </div>

          {completedWashes.has(currentUserId) ? (
            <div style={{
              background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #10b981',
              textAlign: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '24px' }}>✅</span>
                <strong style={{ color: '#065f46', fontSize: '16px' }}>Wash Completed!</strong>
              </div>
              <div style={{ color: '#047857', fontSize: '14px', fontWeight: '500' }}>
                You have already washed your clothes today.
              </div>
            </div>
          ) : currentUserQueues.length > 0 ? (
            <div className="active-sessions">
              <div className="active-sessions-label">
                <span className="active-sessions-label-icon">🔔</span>
                <strong>Your Active Sessions:</strong>
              </div>
              {currentUserQueues.map(m => {
                const waitSec = remainingSecondsForUser(m, currentUserId);
                const isWashing = Number(m.currentUserId) === Number(currentUserId) && m.inUse;
                const queueIndex = m.queue?.findIndex(q => Number(q.userId) === Number(currentUserId));

                return (
                  <div key={m.id} className={`session-card ${isWashing ? 'session-card-washing' : 'session-card-queued'}`}>
                    <strong>{m.name}</strong>
                    <div className="session-card-details">
                      {isWashing ? (
                        <>🔄 Washing • {fmtSeconds(waitSec)} left</>
                      ) : (
                        <>⏳ Position {queueIndex + 1} • ~{Math.ceil(waitSec / 60)} min wait</>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="no-sessions">
              <span className="no-sessions-icon">😊</span>
              <div className="no-sessions-text">No active sessions. Start a wash or join a queue below!</div>
            </div>
          )}
        </div>

        <div className="main-content">
          <div className="machine-grid">
            {machines.map(m => {
              const totalSec = totalRemainingSecondsForMachine(m);
              const occupied = totalSec > 0;
              const isOwner = Number(m.currentUserId) === Number(currentUserId);
              const hasCompletedWash = completedWashes.has(currentUserId);
              const userInAnyMachine = machines.some(mm =>
                Number(mm.currentUserId) === Number(currentUserId) ||
                (mm.queue && mm.queue.some(q => Number(q.userId) === Number(currentUserId)))
              );

              return (
                <div key={m.id} className={`card ${isOwner ? 'card-owner' : ''}`}>
                  <h3>{m.name}</h3>

                  <div className="card-details">
                    <div className="status-row">
                      <div className={`status-indicator ${occupied ? 'status-indicator-occupied' : 'status-indicator-available'}`} />
                      <strong>{occupied ? "Occupied" : "Available"}</strong>
                    </div>

                    <div className="info-row">
                      <span className="info-icon">⏰</span>
                      <span>Remaining: <strong>{fmtSeconds(totalSec)}</strong></span>
                    </div>

                    <div className="info-row">
                      <span className="info-icon">👥</span>
                      <span>Queue: <strong>{m.queue?.length || 0} user(s)</strong></span>
                    </div>

                    {isOwner && m.inUse && (
                      <div className="info-row" style={{ color: '#10b981', fontWeight: 600 }}>
                        <span className="info-icon">✓</span>
                        <span>You're washing</span>
                      </div>
                    )}
                  </div>

                  <div className="card-actions">
                    <button
                      onClick={() => joinQueue(m.id)}
                      disabled={userInAnyMachine || hasCompletedWash}
                      className="btn-join-queue"
                      title={hasCompletedWash ? "You've already washed today" : ""}
                    >
                      Join Queue
                    </button>
                    <button
                      onClick={() => startWashing(m.id)}
                      disabled={(!isOwner && userInAnyMachine) || (m.inUse && !isOwner) || hasCompletedWash}
                      className="btn-start"
                      title={hasCompletedWash ? "You've already washed today" : ""}
                    >
                      {isOwner && m.inUse ? "Extend" : "Start"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="queue-panel">
            <h3>All Queues</h3>
            {machines.length === 0 ? (
              <div className="queue-empty">No machines available</div>
            ) : (
              machines.map(m => (
                <div key={m.id} className="queue-machine">
                  <strong>{m.name}</strong>
                  {!m.inUse && (!m.queue || m.queue.length === 0) ? (
                    <div className="queue-no-users">No active users</div>
                  ) : (
                    <div className="queue-details">
                      {m.inUse && (
                        <div className="queue-current-user">
                          🔄 {users.find(u => u.id === m.currentUserId)?.name || `User${m.currentUserId}`}
                          <div className="queue-current-user-time">
                            {fmtSeconds(remainingSeconds(m.endTime))} remaining
                          </div>
                        </div>
                      )}
                      {m.queue?.map((q, idx) => (
                        <div key={q.userId} className="queue-item">
                          #{idx + 1} {users.find(u => u.id === q.userId)?.name || `User${q.userId}`}
                          <div className="queue-item-time">
                            {q.minutes} minutes scheduled
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}