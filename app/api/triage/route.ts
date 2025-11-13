import { NextRequest, NextResponse } from "next/server";

// Extract JSON from a messy LLM response
function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  return text.slice(start, end + 1);
}

// Fix common JSON errors from LLMs
function tryRepairJson(jsonString: string): any {
  try {
    return JSON.parse(jsonString);
  } catch {
    let fixed = jsonString;

    // Remove trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, "$1");

    // Replace fancy quotes with normal quotes
    fixed = fixed.replace(/[“”]/g, '"');

    // Replace single quotes with double quotes
    fixed = fixed.replace(/'/g, '"');

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
    "https://router.huggingface.co/hf-inference/models/Qwen/Qwen2.5-7B-Instruct",
    {
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      method: "POST",
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 400
        }
      })
    }
  );

  const data = await response.json();

  // HuggingFace returns different formats depending on the model:
  const aiText =
    data[0]?.generated_text ||
    data.generated_text ||
    data.text ||
    JSON.stringify(data);

  const extracted = extractJson(aiText);

  if (!extracted) {
    return NextResponse.json({
      error: "Could not extract JSON from AI response.",
      raw: aiText
    });
  }

  const repaired = tryRepairJson(extracted);

  if (!repaired) {
    return NextResponse.json({
      error: "Could not repair JSON.",
      raw: extracted,
      full: aiText
    });
  }

  return NextResponse.json(repaired);
}
