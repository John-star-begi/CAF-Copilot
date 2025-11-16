"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewCasePage() {
  const router = useRouter();

  const [eacoId, setEacoId] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function createCase() {
    setLoading(true);

    const res = await fetch("/api/cases/create", {
      method: "POST",
      body: JSON.stringify({
        eaco_id: eacoId,
        description
      }),
    });

    const data = await res.json();

    if (data?.case?.id) {
      router.push(`/cases/${data.case.id}`);
    } else {
      alert("Failed to create case");
    }

    setLoading(false);
  }

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">New Case</h1>

      <div className="space-y-4">
        <div>
          <label className="block font-semibold mb-1">EACO Job ID</label>
          <input
            className="border rounded w-full p-2"
            placeholder="Example: WO-391241"
            value={eacoId}
            onChange={(e) => setEacoId(e.target.value)}
          />
        </div>

        <div>
          <label className="block font-semibold mb-1">Job Description</label>
          <textarea
            className="border rounded w-full p-2"
            rows={5}
            placeholder="Enter tenant's description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <button
          onClick={createCase}
          disabled={loading || !eacoId || !description}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Case"}
        </button>
      </div>
    </main>
  );
}
