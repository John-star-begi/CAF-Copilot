import { NextResponse } from "next/server";

type QuestionItem = {
  id: string;
  question: string;
  reason?: string;
};

type MediaItem = {
  url: string;
  contentType?: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const description: string = body.description || "";
    const questions: QuestionItem[] = body.questions_checklist || [];
    const answers: Record<string, string> = body.answers || {};
    const tenantText: string = body.tenant_text || "";
    const media: MediaItem[] = body.media || [];

    if (!description) {
      return NextResponse.json(
        { error: "Missing description" },
        { status: 400 }
      );
    }

    // Build Q&A summary text
    const qaText = questions
      .map((q) => {
        const ans = answers[q.id];
        const normalized =
          !ans || ans.trim() === "" || ans === "I_DONT_KNOW"
            ? "Unknown / not provided"
            : ans.trim();
        return `Q: ${q.question}\nA: ${normalized}`;
      })
      .join("\n\n");

    // Filter images for vision input
    const imageMedia = media.filter((m) =>
      (m.contentType || "").toLowerCase().startsWith("image/")
    );

    // Build multimodal content for Gemini
    const content: any[] = [
      {
        type: "text",
        text: `
You are CAF Copilot, an AI assistant for building maintenance triage.

You will receive:
- The original job description (from the property manager / tenant).
- Follow-up Q&A collected by the dispatcher.
- Tenant reply text.
- Photos showing the issue (image URLs).

Your tasks:
1. Use the TEXT + IMAGES together to understand what is happening.
2. Identify what seems to be the most likely root cause.
3. Propose alternative causes.
4. Rate your confidence (0–1).
5. Summarise what the images show.
6. Highlight any visible hazards.

Return your answer as VALID JSON ONLY, with this exact structure:

{
  "vision_summary": "Concise description of what the photos show.",
  "vision_hazards": ["Hazard 1", "Hazard 2"],
  "refined_diagnosis": {
    "most_likely": "Most likely cause",
    "alternatives": ["Alternative 1", "Alternative 2"],
    "confidence": 0.8,
    "notes": "Short notes for dispatcher on what to watch out for or confirm on site."
  }
}

Do not add any commentary outside JSON.

JOB DESCRIPTION:
${description}

DISPATCHER Q&A:
${qaText || "No Q&A provided."}

TENANT REPLY TEXT:
${tenantText || "No additional tenant reply text provided."}
        `.trim(),
      },
      // Images
      ...imageMedia.map((m) => ({
        type: "image_url",
        image_url: {
          url: m.url,
        },
      })),
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content,
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

    let parsed;
    try {
      parsed = JSON.parse(data.choices[0].message.content);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Invalid JSON from AI",
          raw: data.choices[0].message.content,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Server error in refine",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
