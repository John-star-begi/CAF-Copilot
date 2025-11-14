"use client";

import { useState, useRef } from "react";

type Diagnosis = {
  most_likely?: string;
  alternatives?: string[];
  confidence?: number;
};

type QuestionItem = {
  id: string;
  question: string;
  reason?: string;
};

type TriageResult = {
  category?: string;
  hazards?: string[];
  summary?: string;
  questions_checklist?: QuestionItem[];
  diagnosis?: Diagnosis;
};

type MediaItem = {
  url: string;
  contentType?: string;
};

type RefinedResult = {
  vision_summary?: string;
  vision_hazards?: string[];
  refined_diagnosis?: {
    most_likely?: string;
    alternatives?: string[];
    confidence?: number;
    notes?: string;
  };
};

export default function Home() {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);

  // Phase 3
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [tenantMessage, setTenantMessage] = useState("");
  const [tenantText, setTenantText] = useState("");

  // Media uploads
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Refined diagnosis
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [refined, setRefined] = useState<RefinedResult | null>(null);

  // ------- INITIAL TRIAGE --------
  const runTriage = async () => {
    if (!description.trim()) {
      alert("Please paste a job description first.");
      return;
    }

    setLoading(true);
    setTriageResult(null);
    setAnswers({});
    setTenantMessage("");
    setRefined(null);
    setRefineError(null);

    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        body: JSON.stringify({ description }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (res.ok) {
        setTriageResult(data);
      } else {
        console.error("Triage error", data);
        alert("Error from triage API: " + (data.error || "Unknown"));
      }
    } catch (err) {
      console.error(err);
      alert("Error running triage");
    } finally {
      setLoading(false);
    }
  };

  // ------- CHECKLIST ANSWERS --------
  const handleAnswerChange = (id: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const generateTenantMessage = () => {
    if (!triageResult || !triageResult.questions_checklist) return;

    const unanswered = triageResult.questions_checklist.filter((q) => {
      const ans = answers[q.id];
      return !ans || ans.trim() === "" || ans === "I_DONT_KNOW";
    });

    if (unanswered.length === 0) {
      setTenantMessage(
        "All items have been answered — nothing extra to send to tenant."
      );
      return;
    }

    const message =
      "Hi, could you please clarify the following so we can diagnose the issue properly:\n\n" +
      unanswered.map((q) => `• ${q.question}`).join("\n") +
      "\n\nThank you!";

    setTenantMessage(message);
  };

  // ------- FILE UPLOADS (VERCEL BLOB) --------
  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setRefined(null); // clear previous refined when new media comes

    try {
      const newMedia: MediaItem[] = [];

      for (const file of Array.from(files)) {
        const res = await fetch(
          `/api/upload?filename=${encodeURIComponent(file.name)}`,
          {
            method: "POST",
            body: file,
          }
        );

        const data = await res.json();

        if (!res.ok) {
          console.error("Upload error", data);
          continue;
        }

        newMedia.push({
          url: data.url,
          contentType: data.contentType,
        });
      }

      if (newMedia.length > 0) {
        setMedia((prev) => [...prev, ...newMedia]);
      }
    } catch (err) {
      console.error("Upload failed", err);
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    uploadFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  // ------- REFINED DIAGNOSIS --------
  const runRefined = async () => {
    if (!triageResult) {
      alert("Run initial triage first.");
      return;
    }

    setRefineLoading(true);
    setRefined(null);
    setRefineError(null);

    try {
      const res = await fetch("/api/triage/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          questions_checklist: triageResult.questions_checklist || [],
          answers,
          tenant_text: tenantText,
          media,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Refine error", data);
        setRefineError(data.error || "Unknown refine error");
      } else {
        setRefined(data);
      }
    } catch (err: any) {
      console.error(err);
      setRefineError(err?.message || "Error calling refine API");
    } finally {
      setRefineLoading(false);
    }
  };

  const formatConfidence = (value?: number) => {
    if (value == null || Number.isNaN(value)) return "Unknown";
    const num = value <= 1 ? value * 100 : value;
    return `${Math.round(num)}%`;
  };

  return (
    <main className="p-8 max-w-5xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold mb-2">CAF Copilot – Triage</h1>
        <p className="text-gray-600">
          Paste a job, get a structured triage, checklist, tenant message, and a
          refined diagnosis based on tenant answers and photos.
        </p>
      </header>

      {/* STEP 1: DESCRIPTION + INITIAL TRIAGE */}
      <section className="border rounded-xl p-5 space-y-4 bg-white">
        <h2 className="text-xl font-semibold">Step 1 – Intake</h2>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Paste job description here..."
          className="w-full border p-3 rounded-md text-sm"
          rows={5}
        />
        <button
          onClick={runTriage}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? "Analyzing..." : "Run Triage"}
        </button>
      </section>

      {/* INITIAL TRIAGE OUTPUT */}
      {triageResult && (
        <section className="border rounded-xl p-5 space-y-6 bg-white">
          <h2 className="text-xl font-semibold">Step 2 – Triage Result</h2>

          {/* Category */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Category</h3>
            <p className="mt-1 inline-flex items-center px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-semibold">
              {triageResult.category || "Unknown"}
            </p>
          </div>

          {/* Hazards */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Hazards</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {triageResult.hazards && triageResult.hazards.length > 0 ? (
                triageResult.hazards.map((h, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs"
                  >
                    ⚠ {h}
                  </span>
                ))
              ) : (
                <p className="text-gray-500 text-sm">
                  No specific hazards detected.
                </p>
              )}
            </div>
          </div>

          {/* Summary */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Summary</h3>
            <p className="mt-1 text-gray-800 text-sm">
              {triageResult.summary || "No summary provided."}
            </p>
          </div>

          {/* Diagnosis */}
          {triageResult.diagnosis && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">
                Initial Diagnosis
              </h3>
              <p className="text-sm text-gray-800">
                <strong>Most likely:</strong>{" "}
                {triageResult.diagnosis.most_likely || "N/A"}
              </p>
              {triageResult.diagnosis.alternatives &&
                triageResult.diagnosis.alternatives.length > 0 && (
                  <p className="text-sm text-gray-800">
                    <strong>Alternatives:</strong>{" "}
                    {triageResult.diagnosis.alternatives.join(", ")}
                  </p>
                )}
              <p className="text-sm text-gray-800">
                <strong>Confidence:</strong>{" "}
                {formatConfidence(triageResult.diagnosis.confidence)}
              </p>
            </div>
          )}
        </section>
      )}

      {/* CHECKLIST + TENANT MESSAGE */}
      {triageResult?.questions_checklist && (
        <section className="border rounded-xl p-5 space-y-4 bg-white">
          <h2 className="text-xl font-semibold">
            Step 3 – Information Checklist
          </h2>
          <p className="text-sm text-gray-600">
            Answer what you can now. For anything you do not know, click{" "}
            <span className="font-semibold">“I don&apos;t know”</span>. The
            remaining items will be bundled into a message to the tenant.
          </p>

          <div className="space-y-3">
            {triageResult.questions_checklist.map((q) => (
              <div
                key={q.id}
                className="border rounded-lg p-3 bg-gray-50 space-y-2"
              >
                <p className="font-medium text-sm">{q.question}</p>
                {q.reason && (
                  <p className="text-xs text-gray-500">{q.reason}</p>
                )}

                <input
                  type="text"
                  className="w-full border p-2 rounded text-sm"
                  placeholder="Enter answer or leave empty"
                  value={answers[q.id] && answers[q.id] !== "I_DONT_KNOW" ? answers[q.id] : ""}
                  onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                />

                <button
                  type="button"
                  className="text-xs text-blue-600 underline"
                  onClick={() => handleAnswerChange(q.id, "I_DONT_KNOW")}
                >
                  I don&apos;t know
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={generateTenantMessage}
            className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700"
          >
            Confirm & Generate Tenant Message
          </button>

          {tenantMessage && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">
                Tenant Message (copy & send)
              </h3>
              <textarea
                readOnly
                value={tenantMessage}
                className="w-full border p-3 rounded bg-gray-50 text-sm"
                rows={5}
              />
            </div>
          )}
        </section>
      )}

      {/* TENANT REPLY + MEDIA UPLOAD + REFINED DIAGNOSIS */}
      {(tenantMessage || triageResult) && (
        <section className="border rounded-xl p-5 space-y-5 bg-white">
          <h2 className="text-xl font-semibold">
            Step 4 – Tenant Reply & Evidence
          </h2>

          {/* Tenant reply text */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Tenant Reply (text)
            </h3>
            <textarea
              value={tenantText}
              onChange={(e) => setTenantText(e.target.value)}
              placeholder="Paste the tenant's reply or your call notes here..."
              className="w-full border p-3 rounded text-sm"
              rows={4}
            />
          </div>

          {/* Unified dropzone */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Tenant Photos / Videos
            </h3>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer text-sm ${
                isDragging
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 bg-gray-50"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <p className="font-medium mb-1">
                Drag and drop files here, or click to select.
              </p>
              <p className="text-xs text-gray-500">
                Images and videos are accepted. For now, AI will only{" "}
                <span className="font-semibold">analyze images</span> directly;
                videos are stored for reference.
              </p>
              <input
                type="file"
                multiple
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => uploadFiles(e.target.files)}
                accept="image/*,video/*"
              />
            </div>

            {uploading && (
              <p className="text-xs text-gray-500 mt-1">
                Uploading files...
              </p>
            )}

            {media.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold text-gray-700">
                  Uploaded media:
                </p>
                <ul className="text-xs text-blue-700 space-y-1">
                  {media.map((m, i) => (
                    <li key={i}>
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline break-all"
                      >
                        {m.contentType?.startsWith("image/")
                          ? "Image"
                          : "File"}{" "}
                        {i + 1}
                      </a>
                      {m.contentType && (
                        <span className="text-gray-500 ml-1">
                          ({m.contentType})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Run refined analysis */}
          <div className="pt-2">
            <button
              type="button"
              onClick={runRefined}
              disabled={refineLoading}
              className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 disabled:bg-gray-400"
            >
              {refineLoading
                ? "Running refined analysis..."
                : "Run Refined Diagnosis"}
            </button>

            {refineError && (
              <p className="text-xs text-red-600 mt-2">{refineError}</p>
            )}
          </div>

          {/* Refined result */}
          {refined && (
            <div className="mt-4 border-t pt-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">
                  Vision Summary
                </h3>
                <p className="text-sm text-gray-800 mt-1">
                  {refined.vision_summary || "No vision summary provided."}
                </p>
              </div>

              {refined.vision_hazards && refined.vision_hazards.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">
                    Vision Hazards
                  </h3>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {refined.vision_hazards.map((h, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs"
                      >
                        ⚠ {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {refined.refined_diagnosis && (
                <div className="border rounded-lg p-3 bg-gray-50 space-y-1">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Refined Diagnosis
                  </h3>
                  <p className="text-sm text-gray-800">
                    <strong>Most likely:</strong>{" "}
                    {refined.refined_diagnosis.most_likely || "N/A"}
                  </p>
                  {refined.refined_diagnosis.alternatives &&
                    refined.refined_diagnosis.alternatives.length > 0 && (
                      <p className="text-sm text-gray-800">
                        <strong>Alternatives:</strong>{" "}
                        {refined.refined_diagnosis.alternatives.join(", ")}
                      </p>
                    )}
                  <p className="text-sm text-gray-800">
                    <strong>Confidence:</strong>{" "}
                    {formatConfidence(refined.refined_diagnosis.confidence)}
                  </p>
                  {refined.refined_diagnosis.notes && (
                    <p className="text-sm text-gray-700 mt-1">
                      <strong>Notes:</strong>{" "}
                      {refined.refined_diagnosis.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
