import React, { useEffect, useState, useRef } from "react";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";

export default function Dashboard() {
  const [machines, setMachines] = useState([]);
  const [users, setUsers] = useState([{ id: 1, name: "User1" }]);
  const [currentUserId, setCurrentUserId] = useState(1);
  const clientRef = useRef(null);

  useEffect(() => {
    const socket = new SockJS("http://localhost:8080/ws");
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
      onConnect: () => {
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
      }
    });
    client.activate();
    clientRef.current = client;

    fetchMachines();

    return () => {
      if (clientRef.current) clientRef.current.deactivate();
    };
    // eslint-disable-next-line
  }, []);

  function fetchMachines() {
    fetch("http://localhost:8080/api/machines")
      .then((r) => r.json())
      .then((data) => setMachines(data))
      .catch((e) => console.error("fetch machines", e));
  }

  function remainingSeconds(endTime) {
    if (!endTime) return 0;
    const diff = Math.floor(new Date(endTime).getTime() / 1000 - Date.now() / 1000);
    return diff > 0 ? diff : 0;
  }

  function fmtSeconds(totalSec) {
    if (totalSec <= 0) return "-";
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs}s`;
  }

  function handleNotification(payload) {
    if (!payload || payload.type !== "PRE_NOTIFY") return;
    if (Number(payload.userId) !== Number(currentUserId)) return;

    const mins = payload.minutesUntilStart;
    const machineName = payload.machineName || `Machine ${payload.machineId}`;
    alert(`🔔 Hey! Your turn on ${machineName} will start in about ${mins} minute(s). Get ready!`);
  }

  function addNewUser() {
    const name = prompt("Enter new username:");
    if (!name) return;
    if (users.some(u => u.name === name)) {
      alert("Username already exists!");
      return;
    }
    const id = Date.now();
    setUsers(prev => [...prev, { id, name }]);
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
    if (m.inUse && m.currentUserId) {
      if (m.currentUserId === userId) return remainingSeconds(m.endTime);
      total += remainingSeconds(m.endTime);
    }
    if (m.queue?.length) {
      for (let q of m.queue) {
        if (q.userId === userId) break;
        total += (q.minutes || 50) * 60;
      }
      if (m.queue.some(q => q.userId === userId)) {
        const qUser = m.queue.find(q => q.userId === userId);
        total += (qUser.minutes || 50) * 60;
      }
    }
    return total;
  }

  function getCurrentUserQueues() {
    return machines.filter(m =>
      m.currentUserId === currentUserId || (m.queue && m.queue.some(q => q.userId === currentUserId))
    );
  }

  async function joinQueue(machineId) {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;

    const userInAnyMachine = machines.some(mm =>
      Number(mm.currentUserId) === currentUserId ||
      (mm.queue && mm.queue.some(q => q.userId === currentUserId))
    );
    if (userInAnyMachine) {
      alert("You are already using or queued for another machine.");
      return;
    }

    const queueEntries = machine.queue || [];
    let queueStr = "";
    if (machine.inUse && machine.currentUserId) {
      const userObj = users.find(u => u.id === machine.currentUserId);
      queueStr += `Current: ${userObj ? userObj.name : "User" + machine.currentUserId} — remaining ${fmtSeconds(remainingSeconds(machine.endTime))}\n`;
    }
    queueEntries.forEach((q, idx) => {
      const userObj = users.find(u => u.id === q.userId);
      queueStr += `${idx + 1}. ${userObj ? userObj.name : "User" + q.userId} — ${q.minutes} min\n`;
    });

    const minutesStr = prompt(`Queue:\n${queueStr || "No queued users"}\n\nEnter your wash duration (minutes):`, "50");
    if (!minutesStr) return;
    const minutes = parseInt(minutesStr, 10) || 50;

    let totalWaitSec = 0;
    if (machine.inUse && machine.endTime) totalWaitSec += remainingSeconds(machine.endTime);
    queueEntries.forEach(q => totalWaitSec += (q.minutes || 50) * 60);

    const ok = window.confirm(`Total wait before your turn: ${Math.ceil(totalWaitSec/60)} minutes.\nJoin queue?`);
    if (!ok) return;

    const res = await fetch("http://localhost:8080/api/machines/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId, userId: currentUserId, minutes })
    });
    const j = await res.json();
    if (j.error) alert(j.error);
    else {
      alert(`Joined queue. Position: ${j.position}. You will be notified 2 minutes before your turn.`);
      fetchMachines();
    }
  }

  async function startWashing(machineId) {
    const minutesStr = prompt("Enter minutes for wash (minutes)", "50");
    if (!minutesStr) return;
    const minutes = parseInt(minutesStr, 10) || 50;

    const res = await fetch("http://localhost:8080/api/machines/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId, userId: currentUserId, minutes })
    });
    const j = await res.json();
    if (j.error) alert(j.error);
    else if (j.started) {
      alert("Started: ends at " + j.endTime);
      fetchMachines();
    }
  }

  return (
    <div className="container">
      {/* Header */}
      <div className="header" style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <div>
          <h3>WashSimple — User:</h3>
          <select
            value={currentUserId}
            onChange={(e) => setCurrentUserId(Number(e.target.value))}
            style={{marginRight:12, padding:4}}
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button onClick={addNewUser}>Add New User</button>

          {/* Top panel for current user's queues */}
          <div style={{marginTop:8, background:"#f1f1f1", padding:8, borderRadius:6}}>
            <b>Your Queue Info:</b>
            <ul style={{margin:4, paddingLeft:16}}>
              {getCurrentUserQueues().map(m => {
                const waitSec = remainingSecondsForUser(m, currentUserId);
                const isWashing = m.currentUserId === currentUserId && m.inUse;
                const queueIndex = m.queue?.findIndex(q => q.userId === currentUserId);
                return (
                  <li key={m.id}>
                    {m.name} — {isWashing ? `Currently Washing (${fmtSeconds(waitSec)})` :
                      `Queued at position ${queueIndex + 1} (wait ~${Math.ceil(waitSec/60)} min)` }
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* Machines list + Right Panel */}
      <div style={{display:"flex", gap:12, flexWrap:"wrap", marginTop:16}}>
        {machines.map(m => {
          const totalSec = totalRemainingSecondsForMachine(m);
          const occupied = totalSec > 0;
          const isOwner = Number(m.currentUserId) === currentUserId;
          const userInAnyMachine = machines.some(mm =>
            Number(mm.currentUserId) === currentUserId ||
            (mm.queue && mm.queue.some(q => q.userId === currentUserId))
          );

          return (
            <div key={m.id} className="card" style={{width:220, padding:12, border:"1px solid #ddd", borderRadius:6}}>
              <h4>{m.name}</h4>
              <div><b>Status:</b> {occupied ? "Occupied" : "Free"}</div>
              <div><b>Remaining:</b> {fmtSeconds(totalSec)}</div>
              <div><b>Queue:</b> {m.queue?.length || 0}</div>

              <div style={{marginTop:10}}>
                <button onClick={()=>joinQueue(m.id)} disabled={userInAnyMachine || isOwner}>Join Queue</button>
                <button
                  onClick={() => startWashing(m.id)}
                  disabled={(!isOwner && userInAnyMachine) || (m.inUse && !isOwner)}
                  style={{ marginLeft: 8 }}
                >
                  {isOwner ? "Start/Extend" : "Start"}
                </button>
              </div>
            </div>
          );
        })}

        {/* Right panel: machine list with queue */}
        <div style={{minWidth:250, border:"1px solid #ccc", padding:12, borderRadius:6, background:"#f9f9f9"}}>
          <h4>All Machines & Queues</h4>
          {machines.map(m => (
            <div key={m.id} style={{marginBottom:12, padding:6, background:"#fff", borderRadius:4, border:"1px solid #ddd"}}>
              <b>{m.name}</b>
              <ul style={{margin:4, paddingLeft:16}}>
                {m.inUse && <li>{users.find(u=>u.id===m.currentUserId)?.name || "User"+m.currentUserId} — currently washing ({fmtSeconds(remainingSeconds(m.endTime))})</li>}
                {m.queue?.map((q, idx) => (
                  <li key={q.userId}>{users.find(u=>u.id===q.userId)?.name || "User"+q.userId} — queued at position {idx+1} ({q.minutes} min)</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
