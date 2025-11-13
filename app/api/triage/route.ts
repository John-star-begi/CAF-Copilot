import { NextRequest, NextResponse } from "next/server";

// Extract JSON between the first { and last }
function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  return text.slice(start, end + 1);
}

// Try to fix small JSON formatting issues
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
You are CAF-Copilot, a maintenance triage AI.
Analyze the tenant description and return ONLY valid JSON.

JSON structure:
{
  "category": "string",
  "hazards": ["string"],
  "questions": ["string"],
  "summary": "string",
  "diagnosis": {
    "most_likely": "string",
    "alternatives": ["string"],
    "confidence": number
  }
}

Tenant description:
${description}

Respond with JSON only, no explanations.
`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://yourdomain.com",
        "X-Title": "CAF-Copilot"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct",
        messages: [
          { role: "system", content: "You output ONLY pure JSON. No text before or after." },
          { role: "user", content: prompt }
        ],
        max_tokens: 600,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      return NextResponse.json({
        error: `OpenRouter Error: ${response.status}`,
        details: await response.text()
      });
    }

    const data = await response.json();
    const output = data.choices?.[0]?.message?.content || "";

    const extracted = extractJson(output);
    if (!extracted) {
      return NextResponse.json({
        error: "Could not extract JSON",
        raw: output
      });
    }

    const repaired = tryRepairJson(extracted);
    if (!repaired) {
      return NextResponse.json({
        error: "Returned JSON invalid",
        extracted,
        full: output
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
