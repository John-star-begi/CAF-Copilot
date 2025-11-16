import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { eaco_id, description } = body;

    const { data, error } = await supabase
      .from("cases")
      .insert({
        eaco_id,
        description,
        title: "Untitled Case",
        status: "new"
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, case: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
