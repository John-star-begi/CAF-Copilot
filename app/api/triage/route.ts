import { NextRequest, NextResponse } from "next/server";

function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  return text.slice(start, end + 1);
}

function tryRepairJson(jsonString: string): any {
  try {
    return JSON.parse(jsonString);
  } catch {
    // Fix common JSON mistakes from LLMs
    let fixed = jsonString;

    // Remove trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, "$1");

    // Replace single quotes with double quotes
    fixed = fixed.replace(/'/g, '"');

    // Remove weird characters
    fixed = fixed.replace(/[“”]/g, '"');

    try {
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

export async function POST(req: NextRequest) {
  const { description } = await req.json();

  const prompt = `
You are CAF Copilot, an AI system for maintenance triage.

Analyze the tenant message and return STRICT JSON only:

{
  "category": string,
  "hazards": string[],
  "questions": string[],
  "summary": string,
  "diagnosis": {
    "most_likely": string,
    "alternatives": string[],
    "confidence": number,
    "reasoning": string
  }
}

Tenant message:
${description}

Return ONLY JSON.
  `;

  const response = await fetch(
    "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-7B-Instruct",
    {
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({ inputs: prompt }),
    }
  );

  const data = await response.json();

  const aiText =
    data[0]?.generated_text ??
    data.generated_text ??
    data.output_text ??
    JSON.stringify(data);

  // 1. Extract JSON block
  const extracted = extractJson(aiText);
  if (!extracted) {
    return NextResponse.json({
      error: "Could not extract JSON",
      raw: aiText,
    });
  }

  // 2. Try parsing or repairing
  const repaired = tryRepairJson(extracted);
  if (!repaired) {
    return NextResponse.json({
      error: "Could not repair JSON",
      raw: extracted,
      full: aiText,
    });
  }

  return NextResponse.json(repaired);
}
