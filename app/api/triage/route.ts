import { NextRequest, NextResponse } from "next/server";

// Extract JSON from LLM output
function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  return text.slice(start, end + 1);
}

// Try to repair JSON if invalid
function tryRepairJson(jsonString: string): any {
  try {
    return JSON.parse(jsonString);
  } catch {
    let fixed = jsonString;

    fixed = fixed.replace(/,(\s*[}\]])/g, "$1");
    fixed = fixed.replace(/[“”]/g, '"');
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
You are CAF Copilot, an AI triage system.

Return STRICT JSON ONLY:

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
`;

  const response = await fetch(
    "https://router.huggingface.co/hf-inference/models/meta-llama/Llama-3.2-3B-Instruct",
    {
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      method: "POST",
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 400 }
      })
    }
  );

  if (!response.ok) {
    return NextResponse.json({
      error: `HF Error: ${response.status}`,
      message: await response.text()
    });
  }

  const data = await response.json();

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
