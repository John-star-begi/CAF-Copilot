import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";

export const revalidate = 0;

export default async function NewCasePage() {
  // 1. Create empty case
  const { data, error } = await supabase
    .from("cases")
    .insert([
      {
        title: null,
        description: "",
        eaco_id: null,
        triage: null,
        vision: null,
        diagnosis: null,
        pricing: null,
        media: [],
        status: "new",
      },
    ])
    .select()
    .single();

  if (error) {
    console.error(error);
    return <p>Error creating case.</p>;
  }

  // 2. Redirect to workspace
  redirect(`/cases/${data.id}`);
}
