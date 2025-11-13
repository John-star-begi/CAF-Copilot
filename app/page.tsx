"use client";

import { useState } from "react";

export default function Home() {
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function runTriage() {
    setLoading(true);
    setResult(null);

    const res = await fetch("/api/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description })
    });

    const data = await res.json();
    setLoading(false);
    setResult(data);
  }

  return (
    <main>
      <h1>CAF Copilot</h1>
      <p>Paste tenant description:</p>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Tenant message..."
      />

      <button onClick={runTriage} disabled={!description.trim()}>
        {loading ? "Analyzing..." : "Run Triage"}
      </button>

      {result && (
        <pre
          style={{
            marginTop: "20px",
            background: "white",
            padding: "10px",
            border: "1px solid #ccc"
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}

