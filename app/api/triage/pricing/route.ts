import { NextResponse } from "next/server";

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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const diagnosis: FinalDiagnosisItem | undefined = body.diagnosis;
    const description: string = body.description || "";

    if (!diagnosis) {
      return NextResponse.json(
        { error: "Missing diagnosis for pricing" },
        { status: 400 }
      );
    }

    // Build a short text summary for Llama
    const diagSummary = `
Title: ${diagnosis.title}
Description: ${diagnosis.description}
Trade required: ${diagnosis.trade_required}
Estimated labour minutes: ${diagnosis.estimated_labor_minutes}
Estimated material cost: ${diagnosis.estimated_material_cost}
Severity: ${diagnosis.severity}
Urgency (hours): ${diagnosis.urgency_hours}
Repair steps:
${(diagnosis.repair_steps || []).map((s, i) => `${i + 1}. ${s}`).join("\n")}
Materials needed:
${(diagnosis.materials_needed || []).join(", ") || "Not specified"}
`.trim();

    const systemPrompt = `
You are CAF Copilot, an AI pricing assistant for a property maintenance coordination company in Australia.

You will receive a single diagnosis object describing:
- The likely root cause
- Trade required
- Estimated labour time in minutes
- Estimated material cost
- Repair steps
- Severity and urgency

Your job:
- Suggest a practical price for this job in AUD for the property manager.
- Use realistic Australian residential maintenance pricing.
- Assume that callout, labour, travel, small consumables etc are bundled into the final labour figure.
- Do NOT try to perfectly mirror internal CAF rules; instead, give a solid professional estimate.

Guidelines to follow (approximate, not strict rules):
- Minimum charge: 1 hour of labour per job.
- After that, charge in 30-minute blocks.
- Typical hourly rate (guideline):
  - Plumber: ~120 AUD/hour
  - Electrician: ~110 AUD/hour
  - Handyman / General: ~85–95 AUD/hour
  - Carpenter: ~95 AUD/hour
- Materials:
  - Start from the estimated material cost.
  - Add around 5% buffer for misc small items.
  - Then add around 20% markup.
- Job-level markup:
  - You can add around 20% on the combined labour + materials to cover overhead and profit.
- Do NOT round to whole tens; keep exact decimal precision.
- Urgent or high-severity jobs may lean toward the higher end of a reasonable range.

Output:
You MUST respond with VALID JSON ONLY with this exact structure:

{
  "price_recommendation": {
    "currency": "AUD",
    "labour_minutes_estimated": 60,
    "labour_cost_estimated": 0,
    "materials_cost_estimated": 0,
    "materials_with_buffer": 0,
    "materials_with_markup": 0,
    "subtotal_before_markup": 0,
    "job_markup_percent": 20,
    "job_markup_amount": 0,
    "final_recommended_price": 0,
    "notes": "Short explanation of how you arrived at this price, in 1-3 sentences."
  }
}

Rules:
- JSON only.
- No markdown.
- No backticks.
- No extra keys.
- If you must approximate, still fill all numeric fields with your best estimate.
`.trim();

    const userContent = `
JOB DESCRIPTION (context):
${description || "No extra job description beyond the diagnosis."}

DIAGNOSIS DETAILS:
${diagSummary}
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
        max_tokens: 800,
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
        error: "Server error in pricing route",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
