import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { description } = await req.json();

  const prompt = `
Return ONLY valid JSON.

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

  const response = await fetch(
    "https://router.huggingface.co/hf-inference/models/google/flan-t5-base",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 300 }
      })
    }
  );

  if (!response.ok) {
    return NextResponse.json({
      error: `HF Error: ${response.status}`,
      details: await response.text()
    });
  }

  const data = await response.json();
  const output = data[0]?.generated_text || "";

  try {
    const json = JSON.parse(output);
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({
      error: "Invalid JSON returned by model",
      raw: output
    });
  }
}
