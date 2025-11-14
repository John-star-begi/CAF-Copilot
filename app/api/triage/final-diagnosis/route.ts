import { NextResponse } from "next/server";

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
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const description: string = body.description || "";
    const triage: TriageResult = body.triage || {};
    const answers: Record<string, string> = body.answers || {};
    const tenantText: string = body.tenant_text || "";
    const visionReconRaw: string = body.vision_recon_raw || "";

    if (!description.trim()) {
      return NextResponse.json(
        { error: "Missing description" },
        { status: 400 }
      );
    }

    if (!visionReconRaw.trim()) {
      return NextResponse.json(
        { error: "Missing vision recon JSON" },
        { status: 400 }
      );
    }

    // Build a Q&A summary for Llama
    const qaText =
      (triage.questions_checklist || [])
        .map((q) => {
          const ans = answers[q.id];
          const normalized =
            !ans || ans.trim() === "" || ans === "I_DONT_KNOW"
              ? "Unknown / not provided"
              : ans.trim();
          return `Q: ${q.question}\nA: ${normalized}`;
        })
        .join("\n\n") || "No structured Q&A available.";

    const triageSummaryText = `
Category: ${triage.category || "Unknown"}
Summary: ${triage.summary || "No summary"}
Hazards: ${(triage.hazards || []).join(", ") || "None listed"}
`.trim();

    const systemPrompt = `
You are CAF Copilot, an AI assistant for a property maintenance coordination company.

You will receive:
- A job description
- An initial triage summary (category, hazards, summary)
- Dispatcher Q&A (what is already known, what is unknown)
- Tenant reply text
- A visual recon report (JSON) generated from photos

Your task:
1. Propose between 1 and 4 plausible diagnoses (root causes) for the issue.
2. For EACH diagnosis, provide:
   - A clear title
   - A short description
   - Confidence (0–1)
   - Severity: "low", "medium", or "high"
   - Urgency in hours (how soon it should be attended to)
   - Safety concerns (list of strings)
   - Trade required (e.g. "plumber", "electrician", "carpenter", "roofer", "handyman")
   - Repair steps: high-level steps a tradesperson usually takes to fix this
   - Materials needed: list of typical materials or parts
   - Estimated labour time in minutes (integer)
   - Estimated material cost in local currency (numeric, rough estimate)

Important:
- Use ALL inputs together: description, triage, Q&A, tenant text, and vision recon JSON.
- Be realistic and practical for Australian residential property maintenance.
- Do NOT invent exotic repairs or unrealistic materials.
- If something is uncertain, reflect that in lower confidence.
- At least one diagnosis should be the most likely with highest confidence.

You MUST respond with VALID JSON ONLY, with this exact top-level structure:

{
  "diagnoses": [
    {
      "title": "string",
      "description": "string",
      "confidence": 0.82,
      "severity": "low" | "medium" | "high",
      "urgency_hours": 48,
      "safety_concerns": ["string"],
      "trade_required": "string",
      "repair_steps": ["string"],
      "materials_needed": ["string"],
      "estimated_labor_minutes": 60,
      "estimated_material_cost": 120
    }
  ]
}

Rules:
- No commentary before or after the JSON.
- No markdown.
- No code fences.
- If you are unsure about some fields, still fill them with your best professional estimate.
`.trim();

    const userContent = `
JOB DESCRIPTION:
${description}

TRIAGE SUMMARY:
${triageSummaryText}

DISPATCHER Q&A:
${qaText}

TENANT REPLY TEXT:
${tenantText || "No extra tenant text provided."}

VISION RECON JSON:
${visionReconRaw}
`.trim();

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct",
        temperature: 0.2,
        max_tokens: 1600,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userContent,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!data.choices || !data.choices[0]?.message?.content) {
      return NextResponse.json(
        { error: "Invalid AI response", details: data },
        { status: 500 }
      );
    }

    let raw = data.choices[0].message.content as string;
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      let cleaned = raw
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const firstBrace = cleaned.indexOf("{");
      if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
      const lastBrace = cleaned.lastIndexOf("}");
      if (lastBrace > 0) cleaned = cleaned.slice(0, lastBrace + 1);

      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return NextResponse.json(
          {
            error: "Invalid JSON from AI after cleaning",
            raw_original: raw,
            raw_cleaned: cleaned,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Server error in final diagnosis",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
