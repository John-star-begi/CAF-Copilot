import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { description } = await req.json();

  const prompt = `
You are CAF Copilot, an AI system for maintenance triage.

Analyze the tenant message and return STRICT JSON:

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

Return JSON ONLY.
`;

  const response = await fetch(
    "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-7B-Instruct",
    {
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      method: "POST",
      body: JSON.stringify({
        inputs: prompt
      })
    }
  );

  const data = await response.json();

  const aiText = data[0]?.generated_text ?? data.generated_text;

  try {
    return NextResponse.json(JSON.parse(aiText));
  } catch {
    return NextResponse.json({
      error: "Invalid JSON from AI",
      raw: aiText
    });
  }
}
