"use client";

import { useState } from "react";

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");

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
            <p>No camera connected yet.</p>
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
          <p>Ring integration: Not configured</p>
          <p>Cat recognition: Not configured</p>
          <p>Behavior alerts: Not configured</p>
        </section>
      )}
    </main>
  );
}
