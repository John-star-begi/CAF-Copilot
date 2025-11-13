import { NextRequest, NextResponse } from "next/server";

function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  return text.slice(start, end + 1);
}

function tryRepairJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    let fixed = text;

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
You are CAF Copilot.

You MUST return STRICT JSON in the following format:

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

No explanations. No extra text. JSON only.

Tenant description:
${description}
`;

  const response = await fetch(
    "https://router.huggingface.co/hf-inference/models/microsoft/Phi-3-mini-4k-instruct",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 400,
          temperature: 0.2
        }
      })
    }
  );

  if (!response.ok) {
    return NextResponse.json({
      error: `HuggingFace Error: ${response.status}`,
      details: await response.text()
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
      error: "Could not extract JSON",
      raw: aiText,
    });
  }

  const repaired = tryRepairJson(extracted);

  if (!repaired) {
    return NextResponse.json({
      error: "JSON repair failed",
      json: extracted,
      raw: aiText
    });
  }

  return NextResponse.json(repaired);
}
