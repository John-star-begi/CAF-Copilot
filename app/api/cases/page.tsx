import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default async function CasesListPage() {
  const { data: cases } = await supabase.from("cases").select("*").order("created_at", { ascending: false });

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">All Cases</h1>
        <Link
          href="/cases/new"
          className="bg-blue-600 text-white px-3 py-2 rounded-md text-sm"
        >
          + New Case
        </Link>
      </div>

      <div className="space-y-3">
        {cases?.map((c) => (
          <Link
            key={c.id}
            href={`/cases/${c.id}`}
            className="block border rounded-lg p-4 bg-white hover:bg-gray-50"
          >
            <h2 className="font-semibold">{c.title || "Untitled"}</h2>
            <p className="text-sm text-gray-600">
              EACO: {c.eaco_id || "N/A"}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
