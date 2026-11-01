"use client";

import { useEffect, useState } from "react";

type RingDevice = { id: string; name: string; type: string };
type DevicesResult = { connected?: boolean; devices?: RingDevice[]; message?: string; error?: string };

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [ringDevices, setRingDevices] = useState<RingDevice[]>([]);
  const [ringConnected, setRingConnected] = useState(false);
  const [ringMessage, setRingMessage] = useState("Checking Ring connection...");
  const [ringLoading, setRingLoading] = useState(true);
  const [reloadCount, setReloadCount] = useState(0);
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>([]);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("ring-pet-watch-camera-ids");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setSelectedCameraIds(parsed.filter((id): id is string => typeof id === "string"));
        }
      }
    } catch {
      // Browser storage can be unavailable; the app still works without it.
    }
    setPreferencesLoaded(true);
  }, []);

  function toggleCamera(id: string) {
    setSelectedCameraIds((previous) => {
      const next = previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id];
      try {
        window.localStorage.setItem("ring-pet-watch-camera-ids", JSON.stringify(next));
      } catch {
        // Browser-only preference; not a Ring authorization change.
      }
      return next;
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    async function loadDevices() {
      try {
        const response = await fetch("/api/ring/devices", {
          signal: controller.signal, cache: "no-store"
        });
        const result = (await response.json()) as DevicesResult;
        if (!response.ok) {
          setRingMessage(result.error || "Unable to load Ring cameras.");
          return;
        }
        setRingConnected(Boolean(result.connected));
        setRingDevices(result.devices || []);
        setRingMessage(result.message ||
          (result.connected ? "Devices authorized through Ring" : "Ring is not linked yet."));
      } catch {
        if (!controller.signal.aborted) {
          setRingMessage("Unable to contact Ring Pet Watch. Try refreshing the page.");
        }
      } finally {
        if (!controller.signal.aborted) setRingLoading(false);
      }
    }
    void loadDevices();
    return () => controller.abort();
  }, [reloadCount]);

  const cats = [
    {
      name: "Oliver",
      color: "Orange",
      emoji: "🐈",
      status: "Not connected",
    },
    {
      name: "Skittles",
      color: "Dark",
      emoji: "🐈‍⬛",
      status: "Not connected",
    },
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#101827",
        color: "white",
        fontFamily: "Arial, sans-serif",
        padding: "30px",
      }}
    >
      <header style={{ marginBottom: "30px" }}>
        <h1>🐾 Ring Pet Watch</h1>
        <p>AI-Powered Cat Recognition & Behavior Monitoring</p>
      </header>

      <nav style={{ marginBottom: "30px" }}>
        {["dashboard", "activity", "settings"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "12px 18px",
              marginRight: "10px",
              marginBottom: "10px",
              background:
                activeTab === tab ? "#2563eb" : "#273449",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "dashboard" && (
        <>
          <h2>My Cats</h2>

          <div
            style={{
              display: "flex",
              gap: "20px",
              flexWrap: "wrap",
            }}
          >
            {cats.map((cat) => (
              <section
                key={cat.name}
                style={{
                  background: "#1e293b",
                  padding: "25px",
                  borderRadius: "12px",
                  width: "260px",
                }}
              >
                <div style={{ fontSize: "50px" }}>
                  {cat.emoji}
                </div>

                <h2>{cat.name}</h2>
                <p>Coat: {cat.color}</p>
                <p>Recognition: {cat.status}</p>
                <p>Behavior monitoring: Pending</p>
              </section>
            ))}
          </div>

          <section style={{ marginTop: "35px" }}>
            <h2>📹 Ring Camera</h2>
            <p>{ringMessage}</p>
            {ringLoading ? (
              <p>Loading devices...</p>
            ) : ringDevices.length ? (
              <ul style={{ paddingLeft: "22px", lineHeight: "2" }}>
                {ringDevices.map((device) => (
                  <li key={device.id}>{device.name}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section style={{ marginTop: "35px" }}>
            <h2>🧠 Behavior Analysis</h2>
            <p>
              Behavior monitoring will become available
              after camera integration and recognition
              are configured.
            </p>
          </section>
        </>
      )}

      {activeTab === "activity" && (
        <section>
          <h2>Activity History</h2>
          <p>No activity recorded yet.</p>
        </section>
      )}

      {activeTab === "settings" && (
        <section>
          <h2>Settings</h2>
          <div style={{ background: "#1e293b", padding: "22px", borderRadius: "12px", maxWidth: "640px" }}>
            <h3>Ring account connection</h3>
            <p><strong>Status:</strong> {ringLoading ? "Checking..." : ringConnected ? "Linked in Ring Pet Watch" : "Not linked in Ring Pet Watch"}</p>
            <p>{ringMessage}</p>
            <p>Ring authorization is initiated through Ring. Approving this app in the developer console alone does not necessarily finish the token exchange and account claim required by this dashboard.</p>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => {
                setRingLoading(true);
                setRingMessage("Checking Ring connection...");
                setReloadCount((n) => n + 1);
              }} style={{ background: "#2563eb", color: "white", border: 0, padding: "12px 16px", borderRadius: "8px", cursor: "pointer" }}>
                Recheck Ring connection
              </button>
              <a href="https://developer.amazon.com/ring/console/apps" target="_blank" rel="noopener noreferrer"
                style={{ background: "#334155", color: "white", padding: "12px 16px", borderRadius: "8px", textDecoration: "none" }}>
                Open Ring Developer Console
              </a>
            </div>
          </div>
          <div style={{ background: "#1e293b", padding: "22px", borderRadius: "12px", maxWidth: "640px", marginTop: "20px" }}>
            <h3>Choose cameras for Pet Watch</h3>
            <p>Only cameras authorized by Ring can appear here. Selecting a camera saves a preference in this browser; animal monitoring is not active yet.</p>
            {ringLoading ? <p>Loading available cameras...</p> : ringDevices.length ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {ringDevices.map((camera) => (
                  <label key={camera.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input type="checkbox" disabled={!preferencesLoaded}
                      checked={selectedCameraIds.includes(camera.id)}
                      onChange={() => toggleCamera(camera.id)} />
                    {camera.name}
                  </label>
                ))}
              </div>
            ) : <p>No cameras available yet. Complete Ring account linking first, then select Recheck Ring connection.</p>}
            <p><small>Saved in this browser only. This does not grant or revoke Ring permissions.</small></p>
          </div>
          <p>Cat recognition: Not configured</p>
          <p>Behavior alerts: Not configured</p>
        </section>
      )}
    </main>
  );
}
