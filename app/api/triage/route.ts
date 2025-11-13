import { NextRequest, NextResponse } from "next/server";

// Extract JSON between first { and last }
function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  return text.slice(start, end + 1);
}

// Attempt to fix minor JSON mistakes from the model
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
  try {
    const { description } = await req.json();

    const prompt = `
Return ONLY valid JSON in this exact structure:

{
  "category": string,
  "hazards": string[],
  "questions": string[],
  "summary": string,
  "diagnosis": {
    "most_likely": string,
    "alternatives": string[],
    "confidence": number
  }
}

Tenant description:
${description}
`;

    // THE FREE HUGGINGFACE ENDPOINT
    const response = await fetch(
      "https://api-inference.huggingface.co/models/google/flan-t5-base",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: prompt
        })
      }
    );

    if (!response.ok) {
      return NextResponse.json({
        error: `HF Error: ${response.status}`,
        details: await response.text()
      });
    }

    const result = await response.json();

    const aiOutput =
      result[0]?.generated_text ||
      result.generated_text ||
      result.text ||
      "";

    // Extract JSON
    const extracted = extractJson(aiOutput);
    if (!extracted) {
      return NextResponse.json({
        error: "Could not extract JSON",
        raw: aiOutput
      });
    }

    const repaired = tryRepairJson(extracted);
    if (!repaired) {
      return NextResponse.json({
        error: "Model returned broken JSON",
        extracted,
        full: aiOutput
      });
    }

    return NextResponse.json(repaired);
  } catch (err: any) {
    return NextResponse.json({
      error: "Server error",
      message: err.message
    });
  }
}
