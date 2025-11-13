import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { description } = await req.json();

    if (!description || description.trim().length === 0) {
      return NextResponse.json({ error: "No description provided" }, { status: 400 });
    }

    // Call OpenRouter Llama 3.3 70B Instruct
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct",
        temperature: 0.2,
        max_tokens: 1200,

        messages: [
          {
            role: "system",
            content: `
You are CAF Copilot, an AI assistant for a maintenance coordination company.
Always respond in CLEAN VALID JSON ONLY. Never add commentary.

Your job:

1. Analyze the job description for trade category and hazards.
2. Produce a short, clear summary.
3. Generate a unified checklist: all questions needed before diagnosis.
4. Generate a tenant message containing ONLY the unanswered or unknown items.
5. Produce a simple diagnosis with confidence.

STRUCTURE YOUR RESPONSE EXACTLY LIKE THIS:

{
  "category": "Plumbing",
  "hazards": ["Water damage", "Slip hazard"],
  "summary": "Short issue summary...",
  "questions_checklist": [
    {
      "id": "unique_id_here",
      "question": "What type of tap is it?",
      "reason": "Needed to determine cartridge type"
    }
  ],
  "tenant_message": "Full message to tenant asking ONLY unanswered items.",
  "diagnosis": {
    "most_likely": "Worn mixer cartridge",
    "alternatives": ["Loose connection", "High water pressure"],
    "confidence": 0.82
  }
}

RULES:
- ALWAYS RETURN VALID JSON.
- NO NOTES OR COMMENTARY OUTSIDE JSON.
- Checklist must be 3 to 10 items.
- Tenant message must be polite and grouped into a single message, not bullets.
            `
          },
          {
            role: "user",
            content: description
          }
        ]
      }),
    });

    const data = await response.json();

    if (!data.choices || !data.choices[0]?.message?.content) {
      return NextResponse.json(
        { error: "Invalid AI response", details: data },
        { status: 500 }
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(data.choices[0].message.content);
    } catch (err) {
      return NextResponse.json(
        { error: "Invalid JSON from AI", raw: data.choices[0].message.content },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);

  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Server error",
        details: error?.message || error,
      },
      { status: 500 }
    );
  }
}
