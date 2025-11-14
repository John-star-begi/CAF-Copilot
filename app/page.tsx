"use client";
import { useState } from "react";

export default function Home() {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // For Phase 3 answers
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [tenantMessage, setTenantMessage] = useState("");

  const runTriage = async () => {
    setLoading(true);
    setResult(null);
    setAnswers({});
    setTenantMessage("");

    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        body: JSON.stringify({ description }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      alert("Error running triage");
    }

    setLoading(false);
  };

  const handleAnswerChange = (id: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const generateTenantMessage = () => {
    if (!result) return;

    // Collect all unanswered ones
    const unanswered = result.questions_checklist.filter((q: any) => {
      const ans = answers[q.id];
      return !ans || ans.trim() === "" || ans === "I_DONT_KNOW";
    });

    if (unanswered.length === 0) {
      setTenantMessage("All items have been answered — nothing to send to tenant.");
      return;
    }

    // Build a simple tenant message
    const message =
      "Hi, could you please clarify the following so we can diagnose the issue:\n\n" +
      unanswered.map((q: any) => `• ${q.question}`).join("\n") +
      "\n\nThank you!";

    setTenantMessage(message);
  };

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">CAF Copilot</h1>

      {/* INPUT FIELD */}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Paste job description here..."
        className="w-full border p-4 rounded mb-4"
        rows={5}
      />

      <button
        onClick={runTriage}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        {loading ? "Analyzing..." : "Run Triage"}
      </button>

      {/* AI OUTPUT SECTION */}
      {result && (
        <div className="mt-10 space-y-6">

          {/* CATEGORY */}
          <div>
            <h2 className="font-semibold text-lg">Category</h2>
            <p className="text-gray-700">{result.category}</p>
          </div>

          {/* HAZARDS */}
          <div>
            <h2 className="font-semibold text-lg">Hazards</h2>
            <div className="flex flex-wrap gap-2">
              {result.hazards.map((h: string, idx: number) => (
                <span
                  key={idx}
                  className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm"
                >
                  {h}
                </span>
              ))}
            </div>
          </div>

          {/* SUMMARY */}
          <div>
            <h2 className="font-semibold text-lg">Summary</h2>
            <p className="text-gray-700">{result.summary}</p>
          </div>

          {/* CHECKLIST */}
          <div className="border-t pt-6">
            <h2 className="font-semibold text-lg mb-2">Information Needed</h2>

            {result.questions_checklist.map((q: any) => (
              <div key={q.id} className="mb-4 p-3 border rounded bg-gray-50">
                <p className="font-medium">{q.question}</p>
                <p className="text-sm text-gray-500 mb-2">{q.reason}</p>

                <input
                  type="text"
                  className="w-full border p-2 rounded"
                  placeholder="Enter answer or leave empty"
                  onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                />

                {/* I DON'T KNOW BUTTON */}
                <button
                  className="mt-2 text-sm text-blue-600 underline"
                  onClick={() => handleAnswerChange(q.id, "I_DONT_KNOW")}
                >
                  I don't know
                </button>
              </div>
            ))}
          </div>

          {/* GENERATE TENANT MESSAGE BUTTON */}
          <button
            onClick={generateTenantMessage}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 mt-4"
          >
            Confirm & Generate Tenant Message
          </button>

          {/* TENANT MESSAGE OUTPUT */}
          {tenantMessage && (
            <div className="mt-6">
              <h2 className="font-semibold text-lg">Tenant Message</h2>
              <textarea
                readOnly
                value={tenantMessage}
                className="w-full border p-4 rounded bg-gray-50"
                rows={6}
              />
            </div>
          )}

          {/* DIAGNOSIS */}
          <div className="border-t pt-6">
            <h2 className="font-semibold text-lg mb-2">Diagnosis</h2>
            <p className="text-gray-800"><strong>Most likely:</strong> {result.diagnosis.most_likely}</p>
            <p className="text-gray-800"><strong>Confidence:</strong> {(result.diagnosis.confidence * 100).toFixed(0)}%</p>

            <h3 className="font-medium mt-2">Alternatives:</h3>
            <ul className="list-disc ml-6 text-gray-700">
              {result.diagnosis.alternatives.map((alt: string, idx: number) => (
                <li key={idx}>{alt}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}
