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

function formatConfidence(value?: number) {
  if (value == null || Number.isNaN(value)) return "Unknown";
  const num = value <= 1 ? value * 100 : value;
  return `${Math.round(num)}%`;
}

function formatUrgency(hours?: number) {
  if (hours == null || Number.isNaN(hours)) return "Not specified";
  if (hours <= 4) return "Attend within 4 hours";
  if (hours <= 24) return "Attend within 24 hours";
  if (hours <= 72) return "Attend within 3 days";
  return `Attend within ${hours} hours`;
}

function severityColor(severity?: string) {
  const s = (severity || "").toLowerCase();
  if (s === "high") return "bg-red-100 text-red-800";
  if (s === "medium") return "bg-amber-100 text-amber-800";
  if (s === "low") return "bg-emerald-100 text-emerald-800";
  return "bg-gray-100 text-gray-700";
}

export default function CaseWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params?.id as string;

  const [caseData, setCaseData] = useState<CaseRecord | null>(null);
  const [caseLoading, setCaseLoading] = useState(true);
  const [caseError, setCaseError] = useState<string | null>(null);

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

  // load case from supabase
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
          result[0] = c.pricing.price_recommendation;
        }
        return result;
      });

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
        "All items have been answered. Nothing extra to send to tenant."
      );
      return;
    }

    const message =
      "Hi, could you please clarify the following so we can diagnose the issue properly:\n\n" +
      unanswered.map((q) => `• ${q.question}`).join("\n") +
      "\n\nThank you";

    setTenantMessage(message);
  };

  // triage
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

  // media upload
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

  // vision recon
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

  // final diagnosis
  const runFinalDiagnosis = async () => {
    if (!triageResult) {
      alert("Run triage first.");
      return;
    }
    if (!visionReconRaw.trim()) {
      alert("Run vision recon first and make sure the recon JSON is present.");
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

  // pricing
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
      <main className="p-8 min-h-screen bg-slate-50">
        <p>Loading case…</p>
      </main>
    );
  }

  if (caseError || !caseData) {
    return (
      <main className="p-8 min-h-screen bg-slate-50">
        <p className="text-red-600">
          {caseError || "Case not found or failed to load."}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Top header */}
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {caseData.title || "CAF Case Workspace"}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
              <span>
                EACO job:{" "}
                <span className="font-semibold">
                  {caseData.eaco_id || "Not set"}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 text-white px-3 py-1 text-xs font-medium">
                Status: {caseData.status || "new"}
              </span>
              <span className="text-gray-500">
                Created:{" "}
                {new Date(caseData.created_at).toLocaleString()}
              </span>
            </div>
          </div>

          <button
            onClick={() => router.push("/")}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to cases list
          </button>
        </header>

        {/* main two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.3fr)] gap-6 items-start">
          {/* LEFT COLUMN */}
          <div className="space-y-4">
            {/* description + triage button */}
            <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Step 1 – Job description and triage
                </h2>
                <button
                  onClick={runTriage}
                  disabled={triageLoading}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {triageLoading ? "Analyzing…" : "Run triage"}
                </button>
              </div>

              <label className="text-xs font-medium text-gray-600">
                Job description from EACO
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full border border-slate-200 rounded-md text-sm p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Paste job description here…"
              />
            </section>

            {/* triage summary */}
            {triageResult && (
              <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Triage summary
                  </h2>
                  {triageResult.category && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-semibold">
                      {triageResult.category}
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-sm text-gray-800">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-0.5">
                      Hazards
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {triageResult.hazards && triageResult.hazards.length > 0 ? (
                        triageResult.hazards.map((h, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs"
                          >
                            ⚠ {h}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-500">
                          No specific hazards flagged.
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-0.5">
                      Summary
                    </p>
                    <p>{triageResult.summary || "No summary from AI."}</p>
                  </div>

                  {triageResult.diagnosis && (
                    <div className="border-t pt-2 mt-1 space-y-1">
                      <p className="text-xs font-semibold text-gray-600">
                        Early diagnosis (preliminary)
                      </p>
                      <p>
                        <span className="font-semibold">Most likely:</span>{" "}
                        {triageResult.diagnosis.most_likely || "N/A"}
                      </p>
                      {triageResult.diagnosis.alternatives &&
                        triageResult.diagnosis.alternatives.length > 0 && (
                          <p>
                            <span className="font-semibold">
                              Alternatives:
                            </span>{" "}
                            {triageResult.diagnosis.alternatives.join(", ")}
                          </p>
                        )}
                      <p>
                        <span className="font-semibold">Confidence:</span>{" "}
                        {formatConfidence(triageResult.diagnosis.confidence)}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* questions checklist */}
            {triageResult?.questions_checklist && (
              <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">
                  Step 2 – Information checklist
                </h2>
                <p className="text-xs text-gray-600">
                  Answer what you can now. Use “I do not know” for anything that
                  should go to the tenant. The remaining items will be bundled
                  into a message.
                </p>

                <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                  {triageResult.questions_checklist.map((q) => (
                    <div
                      key={q.id}
                      className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {q.question}
                      </p>
                      {q.reason && (
                        <p className="text-xs text-gray-500">{q.reason}</p>
                      )}

                      <input
                        type="text"
                        className="w-full border border-slate-200 rounded-md text-sm p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        placeholder="Enter answer or leave empty"
                        value={
                          answers[q.id] && answers[q.id] !== "I_DONT_KNOW"
                            ? answers[q.id]
                            : ""
                        }
                        onChange={(e) =>
                          handleAnswerChange(q.id, e.target.value)
                        }
                      />

                      <button
                        type="button"
                        onClick={() => handleAnswerChange(q.id, "I_DONT_KNOW")}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        I do not know
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={generateTenantMessage}
                    className="self-start bg-emerald-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-emerald-700"
                  >
                    Confirm and build tenant message
                  </button>

                  {tenantMessage && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-700">
                        Tenant message (copy and send)
                      </p>
                      <textarea
                        readOnly
                        value={tenantMessage}
                        className="w-full border border-slate-200 rounded-md text-xs p-2 bg-slate-50 font-mono"
                        rows={4}
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-700">
                      Tenant reply or call notes
                    </p>
                    <textarea
                      value={tenantText}
                      onChange={(e) => setTenantText(e.target.value)}
                      className="w-full border border-slate-200 rounded-md text-sm p-2"
                      rows={3}
                      placeholder="Paste the tenant reply or your call notes here…"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* media + vision */}
            {(triageResult || tenantText || tenantMessage) && (
              <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">
                  Step 3 – Photos and vision analysis
                </h2>
                <p className="text-xs text-gray-600">
                  Upload tenant photos and videos. AI will inspect images,
                  describe damage in detail, then feed that into the final
                  diagnosis.
                </p>

                {/* upload */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-700">
                    Tenant media
                  </p>
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer text-xs ${
                      isDragging
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <p className="font-medium mb-1 text-slate-800">
                      Drag and drop files here, or click to browse
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Images and videos accepted. For now, AI reads images
                      directly. Videos are stored for reference.
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
                    <p className="text-[11px] text-gray-500">
                      Uploading files…
                    </p>
                  )}
                  {media.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-gray-700">
                        Uploaded media
                      </p>
                      <ul className="text-[11px] text-blue-700 space-y-1">
                        {media.map((m, idx) => (
                          <li key={idx}>
                            <a
                              href={m.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline break-all"
                            >
                              {m.contentType?.startsWith("image/")
                                ? "Image"
                                : "File"}{" "}
                              {idx + 1}
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

                {/* vision context */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-700">
                    Short context for vision AI
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Copilot auto builds this from the job and triage. You can
                    refine it before running vision.
                  </p>
                  <textarea
                    value={visionContext}
                    onChange={(e) => setVisionContext(e.target.value)}
                    rows={4}
                    className="w-full border border-slate-200 rounded-md text-xs p-2"
                    placeholder="Short description of the case, for Gemini to know what to look for…"
                  />
                </div>

                <div>
                  <button
                    type="button"
                    onClick={runVisionRecon}
                    disabled={visionLoading}
                    className="bg-purple-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-purple-700 disabled:bg-gray-400"
                  >
                    {visionLoading
                      ? "Running vision analysis…"
                      : "Run vision analysis"}
                  </button>
                  {visionError && (
                    <p className="mt-2 text-[11px] text-red-600">
                      {visionError}
                    </p>
                  )}
                </div>

                {visionRecon && (
                  <div className="border-t border-slate-200 pt-3 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-700">
                        Visual summary
                      </p>
                      <p className="text-sm text-gray-800 mt-0.5">
                        {visionRecon.vision_summary ||
                          "No summary from vision model."}
                      </p>
                    </div>

                    {visionRecon.hazards && visionRecon.hazards.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-1">
                          Hazards spotted in photos
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {visionRecon.hazards.map((h, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs"
                            >
                              ⚠ {h}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {visionRecon.objects && visionRecon.objects.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-1">
                          Key objects
                        </p>
                        <p className="text-xs text-gray-800">
                          {visionRecon.objects.join(", ")}
                        </p>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-1">
                        Full recon JSON (editable before final diagnosis)
                      </p>
                      <textarea
                        value={visionReconRaw}
                        onChange={(e) => setVisionReconRaw(e.target.value)}
                        rows={8}
                        className="w-full border border-slate-200 rounded-md text-[11px] p-2 font-mono bg-slate-50"
                      />
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={runFinalDiagnosis}
                        disabled={finalDiagLoading}
                        className="bg-slate-900 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-black disabled:bg-gray-400"
                      >
                        {finalDiagLoading
                          ? "Running final diagnosis…"
                          : "Confirm and run final diagnosis"}
                      </button>
                      {finalDiagError && (
                        <p className="mt-2 text-[11px] text-red-600">
                          {finalDiagError}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* RIGHT COLUMN (sticky diagnosis) */}
          <aside className="space-y-4 lg:sticky lg:top-6 self-start">
            <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900 mb-2">
                Diagnosis options
              </h2>
              <p className="text-[11px] text-gray-500 mb-3">
                Each card is a possible cause. Click a card to see the full
                repair plan and pricing suggestion.
              </p>

              {finalDiagResult && finalDiagResult.diagnoses?.length > 0 ? (
                <div className="space-y-3">
                  {finalDiagResult.diagnoses.map((d, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedDiagIndex(idx)}
                      className={`w-full text-left border rounded-lg p-3 bg-slate-50 hover:bg-white hover:shadow-md transition cursor-pointer ${
                        selectedDiagIndex === idx
                          ? "ring-2 ring-slate-900"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-xs font-semibold text-slate-900">
                          {d.title || `Diagnosis ${idx + 1}`}
                        </h3>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${severityColor(
                            d.severity
                          )}`}
                        >
                          {d.severity || "unknown"}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-700 line-clamp-2 mb-1">
                        {d.description}
                      </p>
                      <div className="flex flex-wrap gap-2 text-[10px] text-gray-600">
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
              ) : (
                <p className="text-xs text-gray-500">
                  No diagnosis yet. Run triage, vision, then final diagnosis to
                  see options here.
                </p>
              )}
            </section>

            {/* tiny status summary */}
            <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-xs font-semibold text-slate-900 mb-2">
                Case progress
              </h3>
              <div className="flex flex-col gap-1 text-[11px] text-gray-700">
                <span>
                  Triage:{" "}
                  {triageResult ? (
                    <span className="text-emerald-700 font-semibold">
                      complete
                    </span>
                  ) : (
                    <span className="text-gray-500">not run</span>
                  )}
                </span>
                <span>
                  Vision:{" "}
                  {visionRecon ? (
                    <span className="text-emerald-700 font-semibold">
                      complete
                    </span>
                  ) : (
                    <span className="text-gray-500">not run</span>
                  )}
                </span>
                <span>
                  Diagnosis:{" "}
                  {finalDiagResult ? (
                    <span className="text-emerald-700 font-semibold">
                      ready
                    </span>
                  ) : (
                    <span className="text-gray-500">not ready</span>
                  )}
                </span>
                <span>
                  Pricing:{" "}
                  {Object.keys(pricingByIndex).length > 0 ? (
                    <span className="text-emerald-700 font-semibold">
                      suggested
                    </span>
                  ) : (
                    <span className="text-gray-500">not calculated</span>
                  )}
                </span>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* MODAL */}
      {selectedDiagnosis && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-auto p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
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
                    Safety concerns
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
                Typical repair process
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
                  Materials needed
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
                  Estimated effort
                </h3>
                <p className="text-sm text-gray-800">
                  Labour:{" "}
                  {selectedDiagnosis.estimated_labor_minutes || "N/A"} minutes
                </p>
                <p className="text-sm text-gray-800">
                  Material cost estimate:{" "}
                  {selectedDiagnosis.estimated_material_cost != null
                    ? `$${selectedDiagnosis.estimated_material_cost}`
                    : "N/A"}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t mt-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-800">
                  Pricing suggestion
                </h3>
                <button
                  type="button"
                  onClick={runPricing}
                  disabled={pricingLoading}
                  className="bg-slate-900 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-black disabled:bg-gray-400"
                >
                  {pricingLoading ? "Calculating…" : "Calculate price"}
                </button>
              </div>
              {pricingError && (
                <p className="text-xs text-red-600">{pricingError}</p>
              )}

              {selectedPricing && (
                <div className="text-sm text-gray-800 space-y-1 bg-slate-50 rounded-lg p-3">
                  <p className="font-semibold">
                    Recommended quote:{" "}
                    <span className="text-slate-900">
                      {selectedPricing.currency}{" "}
                      {selectedPricing.final_recommended_price.toFixed(2)}
                    </span>
                  </p>
                  <p className="text-xs text-gray-600">
                    AI suggestion only. Final number is at dispatcher
                    discretion.
                  </p>

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <p>
                        Labour estimate:{" "}
                        {selectedPricing.labour_minutes_estimated} minutes
                      </p>
                      <p>
                        Labour cost: {selectedPricing.currency}{" "}
                        {selectedPricing.labour_cost_estimated.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p>
                        Materials base: {selectedPricing.currency}{" "}
                        {selectedPricing.materials_cost_estimated.toFixed(2)}
                      </p>
                      <p>
                        Materials with buffer and markup:{" "}
                        {selectedPricing.currency}{" "}
                        {selectedPricing.materials_with_markup.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-gray-700 mt-2">
                    Subtotal before markup: {selectedPricing.currency}{" "}
                    {selectedPricing.subtotal_before_markup.toFixed(2)}.
                    Markup: {selectedPricing.job_markup_percent}% (
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
