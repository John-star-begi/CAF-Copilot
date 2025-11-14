import { NextResponse } from "next/server";

type MediaItem = {
  url: string;
  contentType?: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const context: string = body.context || "";
    const media: MediaItem[] = body.media || [];

    if (!context.trim()) {
      return NextResponse.json(
        { error: "Missing context for vision analysis" },
        { status: 400 }
      );
    }

    if (!media || media.length === 0) {
      return NextResponse.json(
        { error: "No media provided for vision analysis" },
        { status: 400 }
      );
    }

    // Filter to images only for now – videos are stored but not analyzed yet
    const imageMedia = media.filter((m) =>
      (m.contentType || "").toLowerCase().startsWith("image/")
    );

    if (imageMedia.length === 0) {
      return NextResponse.json(
        { error: "No image files available for vision analysis" },
        { status: 400 }
      );
    }

    // Build multimodal content: short context + images
    const content: any[] = [
      {
        type: "text",
        text: `
You are a property maintenance visual reconnaissance specialist.

Your job:
- ONLY describe what is visible in the images.
- Be objective, detailed, and neutral.
- Do NOT diagnose or guess causes.
- Do NOT suggest repairs or prices.
- Think like a sniper on a recon mission reporting what they see.

You will receive a SHORT CONTEXT describing the job, then several photos.
Use the context to focus on relevant details, but keep your description strictly visual.

Short context about this job:
${context}

You must return a single JSON object with this exact structure:

{
  "vision_summary": "Short paragraph summarising what the photos show.",
  "objects": ["list", "of", "key", "objects"],
  "visible_damage": {
    "water_present": true,
    "water_location": "string description",
    "cracks": "string or empty if none",
    "stains": "string or empty if none",
    "rust_or_corrosion": "string or empty if none",
    "swelling_or_warping": "string or empty if none",
    "other_damage": "string or empty if none"
  },
  "hazards": ["list of hazards like slip risk, electrical risk, structural risk"],
  "materials": {
    "surfaces": "e.g. tiles, plasterboard, timber, laminate",
    "fittings": "e.g. brass tapware, plastic waste pipe"
  },
  "labels_or_text": ["any readable text or brand names in the images"],
  "measurements": {
    "approx_leak_spread_cm": "numeric or string",
    "approx_distance_to_risk_area_cm": "numeric or string"
  },
  "location_hint": "Best guess of location in the property, like kitchen, bathroom vanity, balcony, roof edge"
}

Rules:
- ALWAYS respond with VALID JSON ONLY.
- NO markdown.
- NO backticks.
- NO commentary before or after JSON.
- If something is unknown, still include the field but use false, null, "" or [] as appropriate.
      `.trim(),
      },
      ...imageMedia.map((m) => ({
        type: "image_url",
        image_url: { url: m.url },
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
        temperature: 0.1,
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

    let raw = data.choices[0].message.content as string;
    let parsed;

    try {
      // First attempt: direct JSON parse
      parsed = JSON.parse(raw);
    } catch {
      // Try to clean common wrappers: ```json ... ```
      let cleaned = raw
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const firstBrace = cleaned.indexOf("{");
      if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
      const lastBrace = cleaned.lastIndexOf("}");
      if (lastBrace > 0) cleaned = cleaned.slice(0, lastBrace + 1);

      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return NextResponse.json(
          {
            error: "Invalid JSON from AI after cleaning",
            raw_original: raw,
            raw_cleaned: cleaned,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Server error in vision analysis",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
