import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, updates } = body;

    // Fetch existing case data
    const { data: existing, error: fetchError } = await supabase
      .from("cases")
      .select("eaco_id, triage")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    let autoTitle = null;

    // Use updated triage or existing triage
    const triageData = updates.triage || existing?.triage;

    // Only generate automatic title if triage has required fields
    if (triageData?.category && triageData?.summary && existing?.eaco_id) {
      autoTitle = `${triageData.category} — ${triageData.summary} — EACO #${existing.eaco_id}`;
    }

    const finalUpdate = autoTitle
      ? { ...updates, title: autoTitle }
      : updates;

    // Update case
    const { data, error } = await supabase
      .from("cases")
      .update(finalUpdate)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, case: data });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
