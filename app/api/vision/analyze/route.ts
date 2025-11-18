import { NextResponse } from "next/server";

type IncomingDiagnosis = any;

export async function POST(req: Request) {
  try {
    const diagnosis: IncomingDiagnosis = await req.json();

    if (!diagnosis) {
      return NextResponse.json(
        { error: "No diagnosis or quote data provided" },
        { status: 400 }
      );
    }

    const systemPrompt = `
You are the unified PRICING CONSULTANT BRAIN for CLASS A FIX.

Context:
- CLASS A FIX manages maintenance for real estate agencies in Melbourne, Australia.
- They receive quotes from subcontractors and need to add a markup before sending a quote to the agency.
- Sometimes CLASS A FIX has only a short internal description like "Replace kitchen tap" and no subcontractor quote yet.
- Sometimes they paste a full subcontractor quote with a total price.
- Your job is to understand the job, estimate fair market pricing, and recommend a CAF sell price and markup strategy.

You will receive ONE JSON object or a short free-text description. It may be:
- A simple CAF description (e.g. "Replace kitchen tap").
- A structured diagnosis with fields like:
  - "title"
  - "description"
  - "trade_required"
  - "subbie_quote_incl_gst" or "quote_total_incl_gst"
- A pasted subcontractor quote, including scope and a numeric quote amount.
All work is in Melbourne, Australia. All amounts are AUD.

Your internal process (do this silently):

1. Understand the scope.
   - Identify what work is actually included.
   - Identify trades involved (plumber, electrician, handyman, carpenter, painter, roofer, gardener, etc.).
   - Break the work into clear components: e.g. call-out, investigation, supply & install, paint, rubbish removal, etc.

2. Build a baseline cost build-up.
   Use your knowledge of typical Melbourne market rates to estimate:
   - Labour time per component (in hours).
   - Reasonable hourly labour rate by trade (for example):
     - Plumber: around 130–150 AUD/hr
     - Electrician: around 130–150 AUD/hr
     - Carpenter: around 110–130 AUD/hr
     - Painter: around 100–120 AUD/hr
     - Handyman / general maintenance: around 100–120 AUD/hr
     - Gardener / rubbish removal: around 70–100 AUD/hr
   - Minimum charge is 1 full hour even for short jobs. Never use 0.25 hour blocks.
   - Realistic materials list for the described job with typical retail pricing (similar to Bunnings-level pricing).
   - Overheads such as call-out, travel, consumables, and disposal where relevant.

   Combine these into a baseline cost build-up and a baseline estimate (ex-GST) for the whole job.

3. Construct a fair market range.
   - Simulate thorough research using your training data: think in terms of trade price lists, retailers, forums, and historical outcomes for similar jobs in Melbourne.
   - From this, derive a realistic LOWER and UPPER bound for the full job (including labour, materials, overheads), ex-GST.
   - Convert that to a fair range including GST.
   - Do NOT give huge vague ranges. Keep the range reasonably tight.

4. Detect subcontractor quote (if present).
   - If the input includes a numeric field that clearly represents a subcontractor's quote including GST (such as "subbie_quote_incl_gst", "quote_total_incl_gst", "total_incl_gst", or text like "2200+GST"), extract that number.
   - If no subcontractor quote is present, treat this as a direct CAF pricing case. In that case:
     - Set "subcontractor_quote_incl_gst" to null.
     - "position_vs_market" should be "n/a".
     - You will still recommend a CAF sell price based on the fair market range.

5. Compare subcontractor quote to the market range (when a quote exists).
   - Place the subcontractor quote within the fair range:
     - below_range
     - lower_mid_range
     - mid_range
     - upper_mid_range
     - above_range
   - If the quote is above the fair range or at the very top, explain that markup room is limited or negotiation is required.

6. Recommend a markup and CAF sell price.
   - For cases WITH a subcontractor quote:
     - Propose a markup percent that keeps the final CAF quote within the fair market range (ideally mid-range).
     - If the subcontractor quote is already high, keep markup small or recommend negotiation/alternative subcontractor.
   - For cases WITHOUT a subcontractor quote:
     - Recommend a fair CAF sell price directly within the fair market range.
     - Treat "recommended_markup_percent" as the margin of CAF over your internal baseline build-up.
   - "caf_position_after_markup" should again be one of:
     - below_range, lower_mid_range, mid_range, upper_mid_range, above_range, or "n/a" if not applicable.

Output format (you MUST follow this):

Return a single JSON object of the form:

{
  "currency": "AUD",

  "fair_range_low": number,                 // Fair lower bound including GST for the whole job
  "fair_range_high": number,                // Fair upper bound including GST for the whole job

  "subcontractor_quote_incl_gst": number | null,
  "position_vs_market": "below_range" | "lower_mid_range" | "mid_range" | "upper_mid_range" | "above_range" | "n/a",

  "recommended_markup_percent": number,
  "recommended_markup_amount": number,
  "caf_recommended_sell_price": number,
  "caf_position_after_markup": "below_range" | "lower_mid_range" | "mid_range" | "upper_mid_range" | "above_range" | "n/a",

  "should_negotiate_or_change_subbie": boolean,

  "breakdown": {
    "scope_summary": string,
    "baseline_costs": [
      {
        "item": string,
        "estimated_cost_ex_gst": number,
        "notes": string
      }
    ],
    "market_benchmarks": string[],
    "comparison_summary": string,
    "markup_strategy": string
  }
}

Further rules:
- All numeric fields must be numbers, not strings.
- Do not put "AUD" or "$" inside numeric values.
- "currency" must always be "AUD".
- For simple internal jobs without a clear subcontractor quote, set "subcontractor_quote_incl_gst" to null and use "n/a" for market position fields.
- Explanations in "breakdown" should be medium length: informative and structured, without being walls of text.
- Respond with JSON only. No markdown, no backticks, no extra commentary.
`;

    const userContent =
      typeof diagnosis === "string"
        ? diagnosis
        : JSON.stringify(diagnosis, null, 2);

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.3-70b-instruct",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          temperature: 0.2,
          max_tokens: 1200,
        }),
      }
    );

    const json = await response.json();

    const rawContent: string =
      json?.choices?.[0]?.message?.content || "";

    if (!rawContent) {
      return NextResponse.json(
        {
          error: "Empty response from Pricing model",
          details: json,
        },
        { status: 500 }
      );
    }

    // Try parse JSON directly first
    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      // Clean common wrappers such as ```json ... ```
      let cleaned = rawContent
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
            error: "Invalid JSON from Pricing model after cleaning",
            raw_original: rawContent,
            raw_cleaned: cleaned,
          },
          { status: 500 }
        );
      }
    }

    // Basic sanity check on required fields
    const requiredFields = [
      "currency",
      "fair_range_low",
      "fair_range_high",
      "subcontractor_quote_incl_gst",
      "position_vs_market",
      "recommended_markup_percent",
      "recommended_markup_amount",
      "caf_recommended_sell_price",
      "caf_position_after_markup",
      "should_negotiate_or_change_subbie",
      "breakdown",
    ] as const;

    for (const field of requiredFields) {
      if (parsed[field] === undefined) {
        return NextResponse.json(
          {
            error: `Pricing model response missing required field: ${field}`,
            raw: parsed,
          },
          { status: 500 }
        );
      }
    }

    if (
      !parsed.breakdown ||
      typeof parsed.breakdown.scope_summary !== "string" ||
      !Array.isArray(parsed.breakdown.baseline_costs) ||
      !Array.isArray(parsed.breakdown.market_benchmarks) ||
      typeof parsed.breakdown.comparison_summary !== "string" ||
      typeof parsed.breakdown.markup_strategy !== "string"
    ) {
      return NextResponse.json(
        {
          error:
            "Pricing model response has invalid or incomplete breakdown section",
          raw: parsed,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error in pricing analysis" },
      { status: 500 }
    );
  }
}
