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
  }, []);

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
          <p>Ring integration: {ringConnected ? "Account linked" : "Not linked or unavailable"}</p>
          <p>Devices discovered: {ringDevices.length}</p>
          <p>Cat recognition: Not configured</p>
          <p>Behavior alerts: Not configured</p>
        </section>
      )}
    </main>
  );
}
