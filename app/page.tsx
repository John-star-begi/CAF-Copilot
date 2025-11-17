import Link from "next/link";

export const revalidate = 0; // Always fetch fresh data

async function loadCases() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/cases/list`, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) return [];
  const json = await res.json();
  return json.cases || [];
}

export default async function HomePage() {
  const cases = await loadCases();

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">CAF Copilot Cases</h1>

        <Link
          href="/cases/new"
          className="bg-blue-600 text-white px-3 py-2 rounded-md text-sm hover:bg-blue-700"
        >
          + New Case
        </Link>
      </header>

      {/* CASE LIST */}
      <div className="space-y-3 max-h-[80vh] overflow-y-auto pr-1">
        {cases.length > 0 ? (
          cases.map((c: any) => (
            <Link
              key={c.id}
              href={`/cases/${c.id}`}
              className="block border rounded-lg p-4 bg-white hover:bg-gray-50 shadow-sm"
            >
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-gray-900">
                  {c.title || "Untitled Case"}
                </h2>

                <span
                  className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    c.status === "priced"
                      ? "bg-emerald-100 text-emerald-800"
                      : c.status === "diagnosed"
                      ? "bg-sky-100 text-sky-800"
                      : c.status === "visioned"
                      ? "bg-purple-100 text-purple-800"
                      : c.status === "triaged"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {c.status || "new"}
                </span>
              </div>

              <p className="text-sm text-gray-600">
                EACO: <span className="font-medium">{c.eaco_id || "N/A"}</span>
              </p>

              {c.triage?.category && (
                <p className="text-xs text-gray-500 mt-1">
                  Category: {c.triage.category}
                </p>
              )}

              <p className="text-xs text-gray-400 mt-1">
                {new Date(c.created_at).toLocaleString()}
              </p>
            </Link>
          ))
        ) : (
          <p className="text-gray-500 text-sm">No cases yet.</p>
        )}
      </div>
    </main>
  );
}
