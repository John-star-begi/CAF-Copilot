import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Auto-generate a title from triage result
function generateTitleFromTriage(triage: any): string {
  if (!triage) return "Untitled Case";

  const category = triage.category || "General";
  const summary = triage.summary
    ? triage.summary.slice(0, 60)
    : "No summary";

  return `${category}: ${summary}`;
}

export async function POST(req: Request) {
  try {
    const { id, updates } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Missing case ID" },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== "object") {
      return NextResponse.json(
        { error: "Invalid updates object" },
        { status: 400 }
      );
    }

    // If triage was updated -> auto-generate title
    if (updates.triage) {
      updates.title = generateTitleFromTriage(updates.triage);
    }

    // Update DB
    const { data, error } = await supabase
      .from("cases")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ case: data });
  } catch (err: any) {
    console.error("Unexpected update error:", err);
    return NextResponse.json(
      { error: err.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}
