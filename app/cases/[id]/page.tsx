"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type TriageDiagnosis = {
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
  diagnosis?: TriageDiagnosis;
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

type FinalDiagnosisItem = {
  title: string;
  description: string;
  confidence: number;
  severity: string;
  urgency_hours: number;
  safety_concerns: string[];
  trade_required: string;
  repair_steps: string[];
  materials_needed: string[];
  estimated_labor_minutes: number;
  estimated_material_cost: number;
};

type FinalDiagnosisResult = {
  diagnoses: FinalDiagnosisItem[];
};

type PricingBreakdown = {
  currency: string;
  labour_minutes_estimated: number;
  labour_cost_estimated: number;
  materials_cost_estimated: number;
  materials_with_buffer: number;
  materials_with_markup: number;
  subtotal_before_markup: number;
  job_markup_percent: number;
  job_markup_amount: number;
  final_recommended_price: number;
  notes: string;
};

type PricingResult = {
  price_recommendation: PricingBreakdown;
};

type CaseRecord = {
  id: string;
  eaco_id: string | null;
  title: string | null;
  description: string | null;
  triage: TriageResult | null;
  vision: VisionRecon | null;
  diagnosis: FinalDiagnosisResult | null;
  pricing: PricingResult | null;
  media: MediaItem[] | null;
  status: string | null;
  created_at: string;
};

export default function CaseWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params?.id as string;

  const [caseData, setCaseData] = useState<CaseRecord | null>(null);
  const [caseLoading, setCaseLoading] = useState(true);
  const [caseError, setCaseError] = useState<string | null>(null);

  // Local editable fields
  const [description, setDescription] = useState("");
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [tenantMessage, setTenantMessage] = useState("");
  const [tenantText, setTenantText] = useState("");

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [visionContext, setVisionContext] = useState("");
  const [visionRecon, setVisionRecon] = useState<VisionRecon | null>(null);
  const [visionReconRaw, setVisionReconRaw] = useState("");
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);

  const [finalDiagResult, setFinalDiagResult] =
    useState<FinalDiagnosisResult | null>(null);
  const [finalDiagLoading, setFinalDiagLoading] = useState(false);
  const [finalDiagError, setFinalDiagError] = useState<string | null>(null);
  const [selectedDiagIndex, setSelectedDiagIndex] = useState<number | null>(
    null
  );

  const [pricingByIndex, setPricingByIndex] = useState<
    Record<number, PricingBreakdown>
  >({});
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const [triageLoading, setTriageLoading] = useState(false);

  // -------- LOAD CASE FROM SUPABASE --------
  const loadCase = async () => {
    setCaseLoading(true);
    setCaseError(null);
    try {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .single();
      if (error) throw error;

      const c = data as CaseRecord;
      setCaseData(c);
      setDescription(c.description || "");
      setTriageResult(c.triage || null);
      setVisionRecon(c.vision || null);
      setFinalDiagResult(c.diagnosis || null);
      setMedia(c.media || []);
      setPricingByIndex(() => {
        const result: Record<number, PricingBreakdown> = {};
        if (c.diagnosis && c.pricing && c.pricing.price_recommendation) {
          // We will apply pricing per selected diagnosis later,
          // for now we store last recommendation globally.
          result[0] = c.pricing.price_recommendation;
        }
        return result;
      });

      // Auto-generate a default vision context if missing
      if (!visionContext) {
        const baseDesc = (c.description || "").trim().slice(0, 240);
        const summary = c.triage?.summary || "";
        const cat = c.triage?.category || "";
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
      }

      if (c.vision) {
        setVisionReconRaw(JSON.stringify(c.vision, null, 2));
      }
    } catch (err: any) {
      console.error(err);
      setCaseError(err.message || "Failed to load case");
    } finally {
      setCaseLoading(false);
    }
  };

  useEffect(() => {
    if (caseId) {
      loadCase();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  // -------- HELPERS --------
  const formatConfidence = (value?: number) => {
    if (value == null || Number.isNaN(value)) return "Unknown";
    const num = value <= 1 ? value * 100 : value;
    return `${Math.round(num)}%`;
  };

  const formatUrgency = (hours: number | undefined) => {
    if (hours == null || Number.isNaN(hours)) return "Not specified";
    if (hours <= 4) return "Attend within 4 hours";
    if (hours <= 24) return "Attend within 24 hours";
    if (hours <= 72) return "Attend within 3 days";
    return `Attend within ${hours} hours`;
  };

  const severityColor = (severity: string | undefined) => {
    const s = (severity || "").toLowerCase();
    if (s === "high") return "bg-red-100 text-red-800";
    if (s === "medium") return "bg-amber-100 text-amber-800";
    if (s === "low") return "bg-emerald-100 text-emerald-800";
    return "bg-gray-100 text-gray-700";
  };

  // -------- TRIAGE --------
  const runTriage = async () => {
    if (!description.trim()) {
      alert("Please enter a description first.");
      return;
    }

    setTriageLoading(true);
    setFinalDiagResult(null);
    setFinalDiagError(null);
    setVisionRecon(null);
    setVisionReconRaw("");
    setVisionError(null);
    setSelectedDiagIndex(null);
    setPricingByIndex({});
    setPricingError(null);

    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Triage API error", data);
        alert(data.error || "Error from triage API");
        return;
      }

      setTriageResult(data);

      // Save to Supabase and let backend auto-generate title based on triage
      const updateRes = await fetch("/api/cases/update", {
        method: "POST",
        body: JSON.stringify({
          id: caseId,
          updates: {
            triage: data,
            description,
            status: "triaged",
          },
        }),
      });

      const updateJson = await updateRes.json();
      if (!updateRes.ok) {
        console.error("Case update error after triage", updateJson);
      } else if (updateJson.case) {
        setCaseData(updateJson.case);
      }
    } catch (err) {
      console.error(err);
      alert("Error running triage");
    } finally {
      setTriageLoading(false);
    }
  };

  // -------- CHECKLIST ANSWERS --------
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

  // -------- MEDIA UPLOADS --------
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
        const updatedMedia = [...media, ...newMedia];
        setMedia(updatedMedia);

        // Save media to Supabase
        const updateRes = await fetch("/api/cases/update", {
          method: "POST",
          body: JSON.stringify({
            id: caseId,
            updates: {
              media: updatedMedia,
            },
          }),
        });
        const updateJson = await updateRes.json();
        if (!updateRes.ok) {
          console.error("Case update error after media upload", updateJson);
        } else if (updateJson.case) {
          setCaseData(updateJson.case);
        }
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

  // -------- VISION RECON --------
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
    setFinalDiagResult(null);
    setFinalDiagError(null);
    setSelectedDiagIndex(null);
    setPricingByIndex({});
    setPricingError(null);

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

        // Save to Supabase
        const updateRes = await fetch("/api/cases/update", {
          method: "POST",
          body: JSON.stringify({
            id: caseId,
            updates: {
              vision: data,
              status: "visioned",
            },
          }),
        });
        const updateJson = await updateRes.json();
        if (!updateRes.ok) {
          console.error("Case update error after vision", updateJson);
        } else if (updateJson.case) {
          setCaseData(updateJson.case);
        }
      }
    } catch (err: any) {
      console.error(err);
      setVisionError(err?.message || "Error calling vision API");
    } finally {
      setVisionLoading(false);
    }
  };

  // -------- FINAL DIAGNOSIS --------
  const runFinalDiagnosis = async () => {
    if (!triageResult) {
      alert("Run triage first.");
      return;
    }
    if (!visionReconRaw.trim()) {
      alert("Run vision recon first (and ensure recon JSON is present).");
      return;
    }

    setFinalDiagLoading(true);
    setFinalDiagError(null);
    setFinalDiagResult(null);
    setSelectedDiagIndex(null);
    setPricingByIndex({});
    setPricingError(null);

    try {
      const res = await fetch("/api/triage/final-diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          triage: triageResult,
          answers,
          tenant_text: tenantText,
          vision_recon_raw: visionReconRaw,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Final diagnosis error", data);
        setFinalDiagError(data.error || "Unknown final diagnosis error");
      } else {
        setFinalDiagResult(data);
        if (data.diagnoses && data.diagnoses.length > 0) {
          setSelectedDiagIndex(0);
        }

        // Save to Supabase
        const updateRes = await fetch("/api/cases/update", {
          method: "POST",
          body: JSON.stringify({
            id: caseId,
            updates: {
              diagnosis: data,
              status: "diagnosed",
            },
          }),
        });
        const updateJson = await updateRes.json();
        if (!updateRes.ok) {
          console.error("Case update error after diagnosis", updateJson);
        } else if (updateJson.case) {
          setCaseData(updateJson.case);
        }
      }
    } catch (err: any) {
      console.error(err);
      setFinalDiagError(err?.message || "Error calling final diagnosis API");
    } finally {
      setFinalDiagLoading(false);
    }
  };

  // -------- PRICING --------
  const runPricing = async () => {
    if (selectedDiagIndex == null || !finalDiagResult) {
      alert("Select a diagnosis card first.");
      return;
    }

    const diag = finalDiagResult.diagnoses?.[selectedDiagIndex];
    if (!diag) {
      alert("Invalid diagnosis selection.");
      return;
    }

    setPricingLoading(true);
    setPricingError(null);

    try {
      const res = await fetch("/api/triage/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnosis: diag,
          description,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Pricing error", data);
        setPricingError(data.error || "Unknown pricing error");
      } else {
        const rec = data.price_recommendation as PricingBreakdown | undefined;
        if (!rec) {
          setPricingError("Pricing response missing price_recommendation");
        } else {
          setPricingByIndex((prev) => ({
            ...prev,
            [selectedDiagIndex]: rec,
          }));

          // Save to Supabase
          const updateRes = await fetch("/api/cases/update", {
            method: "POST",
            body: JSON.stringify({
              id: caseId,
              updates: {
                pricing: data,
                status: "priced",
              },
            }),
          });
          const updateJson = await updateRes.json();
          if (!updateRes.ok) {
            console.error("Case update error after pricing", updateJson);
          } else if (updateJson.case) {
            setCaseData(updateJson.case);
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setPricingError(err?.message || "Error calling pricing API");
    } finally {
      setPricingLoading(false);
    }
  };

  const selectedDiagnosis: FinalDiagnosisItem | null =
    finalDiagResult && selectedDiagIndex != null
      ? finalDiagResult.diagnoses?.[selectedDiagIndex] || null
      : null;

  const selectedPricing: PricingBreakdown | undefined =
    selectedDiagIndex != null ? pricingByIndex[selectedDiagIndex] : undefined;

  if (caseLoading) {
    return (
      <main className="p-8">
        <p>Loading case...</p>
      </main>
    );
  }

  if (caseError || !caseData) {
    return (
      <main className="p-8">
        <p className="text-red-600">
          {caseError || "Case not found or failed to load."}
        </p>
      </main>
    );
  }

  return (
    <main className="p-8 max-w-5xl mx-auto space-y-8 bg-slate-50 min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">
            {caseData.title || "CAF Case Workspace"}
          </h1>
          <p className="text-gray-600 text-sm">
            EACO Job:{" "}
            <span className="font-semibold">
              {caseData.eaco_id || "Not set"}
            </span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Created: {new Date(caseData.created_at).toLocaleString()}
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="text-sm text-blue-600 underline"
        >
          ← Back to cases list
        </button>
      </header>

      {/* STATUS BAR */}
      <section className="border rounded-xl p-4 bg-white flex flex-wrap items-center gap-3 text-xs">
        <span className="px-3 py-1 rounded-full bg-slate-900 text-white">
          Status: {caseData.status || "new"}
        </span>
        {triageResult && (
          <span className="px-3 py-1 rounded-full bg-sky-100 text-sky-800">
            Triage done
          </span>
        )}
        {visionRecon && (
          <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800">
            Vision analyzed
          </span>
        )}
        {finalDiagResult && (
          <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
            Diagnosis ready
          </span>
        )}
        {Object.keys(pricingByIndex).length > 0 && (
          <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800">
            Pricing suggested
          </span>
        )}
      </section>

      {/* STEP 1: DESCRIPTION + TRIAGE */}
      <section className="border rounded-xl p-5 space-y-4 bg-white">
        <h2 className="text-xl font-semibold">Step 1 – Intake & Triage</h2>
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Job description (from EACO)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Paste job description here..."
          className="w-full border p-3 rounded-md text-sm"
          rows={5}
        />
        <button
          onClick={runTriage}
          disabled={triageLoading}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400"
        >
          {triageLoading ? "Analyzing..." : "Run Triage"}
        </button>
      </section>

      {/* TRIAGE RESULT */}
      {triageResult && (
        <section className="border rounded-xl p-5 space-y-6 bg-white">
          <h2 className="text-xl font-semibold">Triage Result</h2>

          <div>
            <h3 className="text-sm font-semibold text-gray-700">Category</h3>
            <p className="mt-1 inline-flex items-center px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-semibold">
              {triageResult.category || "Unknown"}
            </p>
          </div>

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

          <div>
            <h3 className="text-sm font-semibold text-gray-700">Summary</h3>
            <p className="mt-1 text-gray-800 text-sm">
              {triageResult.summary || "No summary provided."}
            </p>
          </div>

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

      {/* MEDIA + VISION + FINAL DIAGNOSIS */}
      {(triageResult || tenantText || tenantMessage) && (
        <section className="border rounded-xl p-5 space-y-5 bg-white">
          <h2 className="text-xl font-semibold">
            Step 3 – Vision Recon & Final Diagnosis
          </h2>
          <p className="text-sm text-gray-600">
            Upload tenant photos / videos, run vision recon (Gemini) to get a
            detailed visual description, then run final diagnosis (Llama) to get
            multiple diagnosis cards and price suggestions.
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

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">
                  Recon JSON (editable)
                </h3>
                <p className="text-xs text-gray-500 mb-1">
                  This is the full recon report from Gemini. You can edit this
                  before we send it into the final diagnosis step.
                </p>
                <textarea
                  value={visionReconRaw}
                  onChange={(e) => setVisionReconRaw(e.target.value)}
                  className="w-full border p-3 rounded text-xs font-mono bg-gray-50"
                  rows={10}
                />
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={runFinalDiagnosis}
                  disabled={finalDiagLoading}
                  className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-black disabled:bg-gray-400"
                >
                  {finalDiagLoading
                    ? "Running final diagnosis..."
                    : "Confirm & Run Final Diagnosis"}
                </button>
                {finalDiagError && (
                  <p className="text-xs text-red-600 mt-2">
                    {finalDiagError}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Diagnosis cards */}
          {finalDiagResult && finalDiagResult.diagnoses && (
            <div className="mt-6 border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Diagnosis Options
              </h3>
              <p className="text-xs text-gray-500">
                Click a card to view the full repair process and pricing
                suggestion.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                {finalDiagResult.diagnoses.map((d, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedDiagIndex(idx)}
                    className={`text-left border rounded-lg p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition cursor-pointer ${
                      selectedDiagIndex === idx ? "ring-2 ring-slate-900" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-900">
                        {d.title || `Diagnosis ${idx + 1}`}
                      </h4>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${severityColor(
                          d.severity
                        )}`}
                      >
                        {d.severity || "unknown"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 mb-2 line-clamp-2">
                      {d.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <span>
                        Confidence: {formatConfidence(d.confidence)}
                      </span>
                      <span>•</span>
                      <span>{formatUrgency(d.urgency_hours)}</span>
                      {d.trade_required && (
                        <>
                          <span>•</span>
                          <span>Trade: {d.trade_required}</span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* MODAL FOR SELECTED DIAGNOSIS + PRICING */}
      {selectedDiagnosis && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-auto p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedDiagnosis.title}
                </h2>
                <p className="text-xs text-gray-600 mt-1">
                  Confidence: {formatConfidence(selectedDiagnosis.confidence)} •{" "}
                  {formatUrgency(selectedDiagnosis.urgency_hours)} • Trade:{" "}
                  {selectedDiagnosis.trade_required || "N/A"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDiagIndex(null)}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                Close ✕
              </button>
            </div>

            <span
              className={`inline-flex px-3 py-1 rounded-full text-xs ${severityColor(
                selectedDiagnosis.severity
              )}`}
            >
              Severity: {selectedDiagnosis.severity || "unknown"}
            </span>

            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">
                Description
              </h3>
              <p className="text-sm text-gray-800">
                {selectedDiagnosis.description}
              </p>
            </div>

            {selectedDiagnosis.safety_concerns &&
              selectedDiagnosis.safety_concerns.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">
                    Safety Concerns
                  </h3>
                  <ul className="list-disc list-inside text-sm text-gray-800">
                    {selectedDiagnosis.safety_concerns.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">
                Typical Repair Process (Tradesperson)
              </h3>
              {selectedDiagnosis.repair_steps &&
              selectedDiagnosis.repair_steps.length > 0 ? (
                <ol className="list-decimal list-inside text-sm text-gray-800 space-y-1">
                  {selectedDiagnosis.repair_steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-gray-600">
                  No repair steps provided.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">
                  Materials Needed
                </h3>
                {selectedDiagnosis.materials_needed &&
                selectedDiagnosis.materials_needed.length > 0 ? (
                  <ul className="list-disc list-inside text-sm text-gray-800">
                    {selectedDiagnosis.materials_needed.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-600">
                    No specific materials listed.
                  </p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">
                  Estimated Effort
                </h3>
                <p className="text-sm text-gray-800">
                  Labour:{" "}
                  {selectedDiagnosis.estimated_labor_minutes || "N/A"} minutes
                </p>
                <p className="text-sm text-gray-800">
                  Material cost (est):{" "}
                  {selectedDiagnosis.estimated_material_cost != null
                    ? `$${selectedDiagnosis.estimated_material_cost}`
                    : "N/A"}
                </p>
              </div>
            </div>

            {/* Pricing section */}
            <div className="pt-3 border-t mt-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-800">
                  Pricing Suggestion (AI)
                </h3>
                <button
                  type="button"
                  onClick={runPricing}
                  disabled={pricingLoading}
                  className="bg-slate-900 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-black disabled:bg-gray-400"
                >
                  {pricingLoading ? "Calculating..." : "Calculate Price"}
                </button>
              </div>
              {pricingError && (
                <p className="text-xs text-red-600">{pricingError}</p>
              )}

              {selectedPricing && (
                <div className="text-sm text-gray-800 space-y-1 bg-gray-50 rounded-lg p-3">
                  <p className="font-semibold">
                    Recommended quote:{" "}
                    <span className="text-slate-900">
                      {selectedPricing.currency}{" "}
                      {selectedPricing.final_recommended_price.toFixed(2)}
                    </span>
                  </p>
                  <p className="text-xs text-gray-600">
                    (AI suggestion only – final price is at dispatcher&apos;s
                    discretion.)
                  </p>

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <p>
                        Labour est: {selectedPricing.labour_minutes_estimated}{" "}
                        minutes
                      </p>
                      <p>
                        Labour cost: {selectedPricing.currency}{" "}
                        {selectedPricing.labour_cost_estimated.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p>
                        Materials (base): {selectedPricing.currency}{" "}
                        {selectedPricing.materials_cost_estimated.toFixed(2)}
                      </p>
                      <p>
                        Materials + buffer + markup: {selectedPricing.currency}{" "}
                        {selectedPricing.materials_with_markup.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-gray-700 mt-2">
                    Subtotal before markup: {selectedPricing.currency}{" "}
                    {selectedPricing.subtotal_before_markup.toFixed(2)} • Job
                    markup: {selectedPricing.job_markup_percent}% (
                    {selectedPricing.currency}{" "}
                    {selectedPricing.job_markup_amount.toFixed(2)})
                  </p>

                  {selectedPricing.notes && (
                    <p className="text-xs text-gray-600 mt-1">
                      Notes: {selectedPricing.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
