"use client";

import React, { useState } from "react";

type Diagnosis = {
  most_likely?: string;
  alternatives?: string[];
  confidence?: number; // can be 0–1 or 0–100
};

type TriageResult = {
  category?: string;
  hazards?: string[];
  questions?: string[];
  summary?: string;
  diagnosis?: Diagnosis;
};

export default function HomePage() {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);

  async function runTriage() {
    if (!description.trim()) {
      setError("Please paste a job description first.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setRawJson(null);

    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description }),
      });

      if (!res.ok) {
        const text = await res.text();
        setError(`Server error: ${res.status} – ${text}`);
        return;
      }

      const data = await res.json();
      setRawJson(JSON.stringify(data, null, 2));

      // We assume backend returns something like:
      // {
      //   category: "Plumbing",
      //   hazards: [...],
      //   questions: [...],
      //   summary: "...",
      //   diagnosis: { most_likely, alternatives, confidence }
      // }
      setResult({
        category: data.category,
        hazards: data.hazards || [],
        questions: data.questions || [],
        summary: data.summary,
        diagnosis: data.diagnosis || {},
      });
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function getCategoryColor(category?: string): string {
    const c = (category || "").toLowerCase();
    if (c.includes("plumb")) return "#2563eb"; // blue
    if (c.includes("electric")) return "#eab308"; // yellow
    if (c.includes("carp")) return "#16a34a"; // green
    if (c.includes("hvac") || c.includes("heat") || c.includes("cool"))
      return "#ec4899"; // pink
    return "#6b7280"; // gray
  }

  function formatConfidence(confidence?: number): { label: string; percent: number } {
    if (confidence == null || isNaN(confidence)) {
      return { label: "Unknown", percent: 0 };
    }

    // If model returns 0–1 convert to %, if 0–100 keep it
    let value = confidence;
    if (confidence <= 1) {
      value = confidence * 100;
    }
    const percent = Math.max(0, Math.min(100, Math.round(value)));
    let label = `${percent}%`;

    if (percent >= 80) label += " (High)";
    else if (percent >= 60) label += " (Medium)";
    else label += " (Low)";

    return { label, percent };
  }

  const confidenceInfo = formatConfidence(result?.diagnosis?.confidence);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "24px",
        maxWidth: "900px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px" }}>
        CAF Copilot – Triage
      </h1>
      <p style={{ color: "#4b5563", marginBottom: "24px" }}>
        Paste the job description below. Copilot will analyze it and show a structured triage
        summary for the dispatcher.
      </p>

      {/* Input area */}
      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "24px",
        }}
      >
        <label
          htmlFor="description"
          style={{ display: "block", fontWeight: 600, marginBottom: "8px" }}
        >
          Tenant / PM Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="Paste the job description here..."
          style={{
            width: "100%",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            padding: "8px",
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />

        <button
          onClick={runTriage}
          disabled={loading}
          style={{
            marginTop: "12px",
            padding: "8px 16px",
            borderRadius: "999px",
            border: "none",
            backgroundColor: loading ? "#9ca3af" : "#111827",
            color: "#f9fafb",
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Analyzing..." : "Run Triage"}
        </button>

        {error && (
          <p style={{ marginTop: "8px", color: "#b91c1c", fontSize: "14px" }}>{error}</p>
        )}
      </section>

      {/* Structured result */}
      {result && (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "24px",
          }}
        >
          <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>
            Triage Result
          </h2>

          {/* Category */}
          <div style={{ marginBottom: "12px" }}>
            <span style={{ fontWeight: 600 }}>Category: </span>
            <span
              style={{
                display: "inline-block",
                padding: "4px 10px",
                borderRadius: "999px",
                backgroundColor: getCategoryColor(result.category),
                color: "white",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              {result.category || "Unknown"}
            </span>
          </div>

          {/* Hazards */}
          <div style={{ marginBottom: "12px" }}>
            <span style={{ fontWeight: 600, display: "block", marginBottom: "4px" }}>
              Hazards:
            </span>
            {result.hazards && result.hazards.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {result.hazards.map((hazard, idx) => (
                  <span
                    key={idx}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "999px",
                      border: "1px solid #f97316",
                      color: "#9a3412",
                      backgroundColor: "#fff7ed",
                      fontSize: "13px",
                    }}
                  >
                    ⚠ {hazard}
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ color: "#6b7280", fontSize: "14px" }}>
                No specific hazards detected.
              </span>
            )}
          </div>

          {/* Summary */}
          <div style={{ marginBottom: "12px" }}>
            <span style={{ fontWeight: 600, display: "block", marginBottom: "4px" }}>
              Summary:
            </span>
            <p style={{ margin: 0, color: "#374151" }}>
              {result.summary || "No summary provided by AI."}
            </p>
          </div>

          {/* Questions */}
          <div style={{ marginBottom: "12px" }}>
            <span style={{ fontWeight: 600, display: "block", marginBottom: "4px" }}>
              Questions to clarify:
            </span>
            {result.questions && result.questions.length > 0 ? (
              <ul style={{ paddingLeft: "20px", margin: 0, color: "#374151" }}>
                {result.questions.map((q, idx) => (
                  <li key={idx} style={{ marginBottom: "4px" }}>
                    {q}
                  </li>
                ))}
              </ul>
            ) : (
              <span style={{ color: "#6b7280", fontSize: "14px" }}>
                No follow up questions were generated.
              </span>
            )}
          </div>

          {/* Diagnosis */}
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#f9fafb",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
              Diagnosis
            </h3>
            <p style={{ margin: 0, marginBottom: "6px" }}>
              <strong>Most likely:</strong>{" "}
              {result.diagnosis?.most_likely || "Not specified"}
            </p>

            {result.diagnosis?.alternatives &&
              result.diagnosis.alternatives.length > 0 && (
                <p style={{ margin: 0, marginBottom: "6px" }}>
                  <strong>Alternatives:</strong>{" "}
                  {result.diagnosis.alternatives.join(", ")}
                </p>
              )}

            {/* Confidence bar */}
            <div style={{ marginTop: "8px" }}>
              <span style={{ fontWeight: 600, fontSize: "14px" }}>Confidence:</span>
              <div
                style={{
                  marginTop: "4px",
                  width: "100%",
                  height: "10px",
                  borderRadius: "999px",
                  backgroundColor: "#e5e7eb",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${confidenceInfo.percent}%`,
                    height: "100%",
                    backgroundColor:
                      confidenceInfo.percent >= 80
                        ? "#16a34a"
                        : confidenceInfo.percent >= 60
                        ? "#eab308"
                        : "#dc2626",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: "13px",
                  color: "#374151",
                  display: "inline-block",
                  marginTop: "4px",
                }}
              >
                {confidenceInfo.label}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Optional raw JSON for debugging */}
      {rawJson && (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "24px",
          }}
        >
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              Raw JSON (debug)
            </summary>
            <pre
              style={{
                marginTop: "8px",
                fontSize: "12px",
                backgroundColor: "#111827",
                color: "#e5e7eb",
                padding: "12px",
                borderRadius: "8px",
                overflowX: "auto",
              }}
            >
              {rawJson}
            </pre>
          </details>
        </section>
      )}
    </main>
  );
}
