import React, { useEffect, useState, useRef } from "react";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";

export default function Dashboard() {
  const [machines, setMachines] = useState([]);
  const [users, setUsers] = useState([{ id: 1, name: "User1" }]);
  const [currentUserId, setCurrentUserId] = useState(1);
  const clientRef = useRef(null);

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS("http://localhost:8080/ws"),
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe("/topic/machines", (msg) => {
          try {
            const body = JSON.parse(msg.body);
            setMachines(body);
          } catch (e) {
            console.error(e);
          }
        });
      }
    });
    client.activate();
    clientRef.current = client;

    fetch("http://localhost:8080/api/machines")
      .then((r) => r.json())
      .then((data) => setMachines(data))
      .catch((e) => console.error("fetch machines", e));

    return () => {
      if (clientRef.current) clientRef.current.deactivate();
    };
  }, []);

  function remainingSeconds(endTime) {
    if (!endTime) return 0;
    const diff = Math.floor(new Date(endTime).getTime() / 1000 - Date.now() / 1000);
    return diff > 0 ? diff : 0;
  }

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  }

  function addNewUser() {
    const name = prompt("Enter new username:");
    if (!name) return;
    if (users.find(u => u.name === name)) {
      alert("Username already exists!");
      return;
    }
    const newUser = { id: Date.now(), name };
    setUsers(prev => [...prev, newUser]);
    setCurrentUserId(newUser.id);
  }

  async function joinQueue(machineId) {
    const minutesStr = prompt("Enter minutes for wash (e.g., 50):", "50");
    if (!minutesStr) return;
    const minutes = parseInt(minutesStr || "50", 10) || 50;

    const machine = machines.find(m => m.id === machineId);

    const userInAnyMachine = machines.some(mm => Number(mm.currentUserId) === currentUserId ||
      (mm.queue && mm.queue.some(q => q.userId === currentUserId)));
    if (userInAnyMachine) {
      alert("You are already in a machine or queue!");
      return;
    }

    let totalWait = 0;
    let queueInfo = [];

    if (machine.inUse) {
      const rem = Math.ceil(remainingSeconds(machine.endTime)/60);
      totalWait += rem;
      queueInfo.push({ user: machine.currentUserId, minutes: rem });
    }

    if (machine.queue?.length) {
      machine.queue.forEach(q => {
        totalWait += q.minutes;
        queueInfo.push({ user: q.userId, minutes: q.minutes });
      });
    }

    let queueStr = queueInfo.map((q) => {
      const u = users.find(u => u.id === q.user);
      return `${u ? u.name : "User "+q.user} — ${q.minutes} min`;
    }).join("\n");

    const ok = window.confirm(`Total wait time before your turn: ${totalWait} minutes.\nQueue:\n${queueStr}\nJoin queue?`);
    if (!ok) return;

    const res = await fetch("http://localhost:8080/api/machines/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId, userId: currentUserId, minutes })
    });

    const j = await res.json();
    if(j.error) alert(j.error);
    else alert(`You joined the queue! Position: ${j.position}, Your time: ${minutes} min`);
  }

  async function startWashing(machineId) {
    const machine = machines.find(m => m.id === machineId);
    const isOwner = Number(machine.currentUserId) === currentUserId;

    const minutesStr = prompt("Enter minutes for wash (e.g., 50):", "50");
    if (!minutesStr) return;
    const minutes = parseInt(minutesStr || "50", 10) || 50;

    const res = await fetch("http://localhost:8080/api/machines/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId, userId: currentUserId, minutes })
    });
    const j = await res.json();
    if (res.ok) {
      if (j.started) alert("Started until: " + j.endTime);
      else if (j.error) alert("Error: " + j.error);
    } else alert("Error: " + JSON.stringify(j));
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h3>WashSimple — user: {users.find(u => u.id === currentUserId)?.name}</h3>
        </div>
        <div>
          <button onClick={addNewUser}>Add New User</button>
        </div>
      </div>

      <div className="machine-grid">
        {machines.map((m) => {
          const isOwner = Number(m.currentUserId) === currentUserId;

          // Total remaining time
          let totalMachineMinutes = 0;
          if (m.inUse) totalMachineMinutes += Math.ceil(remainingSeconds(m.endTime)/60);
          if (m.queue?.length) {
            m.queue.forEach(q => totalMachineMinutes += q.minutes);
          }

          // Check if machine is occupied
          const machineOccupied = m.inUse || (m.endTime && remainingSeconds(m.endTime) > 0);

          const userInAnyMachine = machines.some(mm => Number(mm.currentUserId) === currentUserId ||
            (mm.queue && mm.queue.some(q => q.userId === currentUserId)));

          return (
            <div className="card" key={m.id}>
              <h4>{m.name}</h4>
              <div><b>Status:</b> {machineOccupied ? "Occupied" : "Free"}</div>
              <div><b>Remaining:</b> {totalMachineMinutes > 0 ? `${totalMachineMinutes} min` : "-"}</div>
              <div><b>Queue:</b> {m.queue?.length || 0}</div>
              <div style={{ marginTop: 10 }}>
                <button onClick={() => joinQueue(m.id)} disabled={userInAnyMachine || isOwner}>Join Queue</button>
                <span style={{ marginLeft: 8 }} />
                <button onClick={() => startWashing(m.id)} disabled={userInAnyMachine && !isOwner}>
                  {isOwner ? "Start/Extend" : "Start"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
