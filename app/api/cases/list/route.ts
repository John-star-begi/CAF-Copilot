import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const revalidate = 0;

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase list error:", error);
      return NextResponse.json(
        { error: "Failed to load cases." },
        { status: 500 }
      );
    }

    return NextResponse.json({ cases: data || [] });
  } catch (err: any) {
    console.error("List endpoint error:", err);
    return NextResponse.json(
      { error: "Unexpected error loading cases." },
      { status: 500 }
    );
  }
}
