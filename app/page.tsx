"use client";

import { useState, useRef, useEffect } from "react";

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

type VisionRecon = {
  vision_summary?: string;
  objects?: string[];
  visible_damage?: Record<string, any>;
  hazards?: string[];
  materials?: Record<string, any>;
  labels_or_text?: string[];
  measurements?: Record<string, any>;
  location_hint?: string;
};

export default function Home() {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);

  // Phase 3 – checklist + tenant message
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [tenantMessage, setTenantMessage] = useState("");
  const [tenantText, setTenantText] = useState("");

  // Media uploads
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Vision recon (Phase 4A)
  const [visionContext, setVisionContext] = useState("");
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [visionRecon, setVisionRecon] = useState<VisionRecon | null>(null);
  const [visionReconRaw, setVisionReconRaw] = useState(""); // editable JSON

  // Auto-generate short context after triage
  useEffect(() => {
    if (!triageResult) return;
    if (visionContext.trim()) return;

    const baseDesc = description.trim().slice(0, 240);
    const summary = triageResult.summary || "";
    const cat = triageResult.category || "";

    const auto = [
      baseDesc && `Job description: ${baseDesc}`,
      summary && `Initial AI summary: ${summary}`,
      cat && `Initial AI category: ${cat}`,
    ]
      .filter(Boolean)
      .join("\n");

    const finalContext =
      auto +
      "\n\nFocus your visual description on anything relevant to property maintenance, damage, safety risks, materials, and condition.";

    setVisionContext(finalContext.trim());
  }, [triageResult, description, visionContext]);

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
    setVisionRecon(null);
    setVisionReconRaw("");
    setVisionError(null);

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

  // ------- RUN VISION RECON (GEMINI) --------
  const runVisionRecon = async () => {
    if (!media || media.length === 0) {
      alert("Please upload at least one photo first.");
      return;
    }

    if (!visionContext.trim()) {
      alert("Please provide a short context for vision analysis.");
      return;
    }

    setVisionLoading(true);
    setVisionError(null);
    setVisionRecon(null);
    setVisionReconRaw("");

    try {
      const res = await fetch("/api/vision/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: visionContext,
          media,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Vision error", data);
        setVisionError(data.error || "Unknown vision error");
      } else {
        setVisionRecon(data);
        setVisionReconRaw(JSON.stringify(data, null, 2));
      }
    } catch (err: any) {
      console.error(err);
      setVisionError(err?.message || "Error calling vision API");
    } finally {
      setVisionLoading(false);
    }
  };

  const formatConfidence = (value?: number) => {
    if (value == null || Number.isNaN(value)) return "Unknown";
    const num = value <= 1 ? value * 100 : value;
    return `${Math.round(num)}%`;
  };

  return (
    <main className="p-8 max-w-5xl mx-auto space-y-8 bg-slate-50 min-h-screen">
      <header>
        <h1 className="text-3xl font-bold mb-2">CAF Copilot – Triage</h1>
        <p className="text-gray-600 text-sm">
          Step 1: Run triage (Llama). Step 2: Run vision recon (Gemini). Step 3
          (next phase): confirm & run final diagnosis.
        </p>
      </header>

      {/* STEP 1: DESCRIPTION + INITIAL TRIAGE */}
      <section className="border rounded-xl p-5 space-y-4 bg-white">
        <h2 className="text-xl font-semibold">Step 1 – Intake & Triage</h2>
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
          <h2 className="text-xl font-semibold">Triage Result</h2>

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
                Initial Diagnosis (preliminary)
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
            Step 2 – Information Checklist
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
                  value={
                    answers[q.id] && answers[q.id] !== "I_DONT_KNOW"
                      ? answers[q.id]
                      : ""
                  }
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

          {/* Tenant message */}
          {tenantMessage && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">
                Tenant Message (copy & send)
              </h3>
              <textarea
                readOnly
                value={tenantMessage}
                className="w-full border p-3 rounded bg-gray-50 text-sm"
                rows={4}
              />
            </div>
          )}

          {/* Tenant reply text */}
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Tenant Reply / Call Notes (text)
            </h3>
            <textarea
              value={tenantText}
              onChange={(e) => setTenantText(e.target.value)}
              placeholder="Later, paste the tenant's reply or your call notes here..."
              className="w-full border p-3 rounded text-sm"
              rows={3}
            />
          </div>
        </section>
      )}

      {/* MEDIA UPLOAD + VISION RECON */}
      {(triageResult || tenantText || tenantMessage) && (
        <section className="border rounded-xl p-5 space-y-5 bg-white">
          <h2 className="text-xl font-semibold">Step 3 – Vision Recon (Gemini)</h2>
          <p className="text-sm text-gray-600">
            Upload tenant photos / videos below, review or edit the short context,
            then run vision recon. Gemini will describe what it sees in detail,
            without diagnosing. You can edit the recon JSON before we use it in
            the final diagnosis phase.
          </p>

          {/* Upload area */}
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
                Images and videos are accepted. For now, AI will only analyze{" "}
                <span className="font-semibold">images</span> directly; videos are
                stored for reference.
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
              <p className="text-xs text-gray-500 mt-1">Uploading files...</p>
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
                        {m.contentType?.startsWith("image/") ? "Image" : "File"}{" "}
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

          {/* Vision context */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Short Context for Vision
            </h3>
            <p className="text-xs text-gray-500 mb-1">
              Copilot auto-generates this from the job and triage. You can edit it
              before running vision recon.
            </p>
            <textarea
              value={visionContext}
              onChange={(e) => setVisionContext(e.target.value)}
              className="w-full border p-3 rounded text-sm"
              rows={4}
              placeholder="Short description of the job for Gemini to focus its visual analysis..."
            />
          </div>

          {/* Run Vision Recon */}
          <div>
            <button
              type="button"
              onClick={runVisionRecon}
              disabled={visionLoading}
              className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 disabled:bg-gray-400"
            >
              {visionLoading ? "Running vision recon..." : "Run Vision Recon"}
            </button>
            {visionError && (
              <p className="text-xs text-red-600 mt-2">{visionError}</p>
            )}
          </div>

          {/* Vision recon output */}
          {visionRecon && (
            <div className="mt-4 border-t pt-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">
                  Vision Summary
                </h3>
                <p className="text-sm text-gray-800 mt-1">
                  {visionRecon.vision_summary || "No vision summary provided."}
                </p>
              </div>

              {visionRecon.hazards && visionRecon.hazards.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">
                    Vision Hazards
                  </h3>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {visionRecon.hazards.map((h, i) => (
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

              {visionRecon.objects && visionRecon.objects.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">
                    Key Objects
                  </h3>
                  <p className="text-sm text-gray-800 mt-1">
                    {visionRecon.objects.join(", ")}
                  </p>
                </div>
              )}

              {/* Editable raw JSON */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">
                  Recon JSON (editable)
                </h3>
                <p className="text-xs text-gray-500 mb-1">
                  This is the full recon report from Gemini. You can edit this
                  before we send it into the final diagnosis step in the next
                  phase.
                </p>
                <textarea
                  value={visionReconRaw}
                  onChange={(e) => setVisionReconRaw(e.target.value)}
                  className="w-full border p-3 rounded text-xs font-mono bg-gray-50"
                  rows={12}
                />
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled
                  className="bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium cursor-not-allowed"
                >
                  Confirm & Run Final Diagnosis (coming in Phase 4B)
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
