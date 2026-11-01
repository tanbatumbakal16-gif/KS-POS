
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    branchName: "",
    branchCode: "MAIN",
    branchAddress: "",
    branchPhone: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((old) => ({ ...old, [field]: value }));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Setup failed.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Cannot connect to KS POS. Check your internet connection.");
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    { key: "name", label: "Owner full name", placeholder: "Your full name", type: "text" },
    { key: "username", label: "Username", placeholder: "Create a username", type: "text" },
    { key: "password", label: "Password (minimum 12 characters)", placeholder: "Create a strong password", type: "password" },
    { key: "branchName", label: "Store / Branch name", placeholder: "Main Branch", type: "text" },
    { key: "branchCode", label: "Branch code", placeholder: "MAIN", type: "text" },
    { key: "branchAddress", label: "Branch address (optional)", placeholder: "Store address", type: "text" },
    { key: "branchPhone", label: "Branch phone (optional)", placeholder: "Phone number", type: "tel" },
  ];

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <section className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-9">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-2xl font-black text-slate-950">KS</div>
          <h1 className="text-3xl font-black text-white">KS POS</h1>
          <p className="mt-2 text-sm text-slate-400">Create your owner account and first branch</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {fields.map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-300">{field.label}</span>
              <input
                required={!["branchAddress", "branchPhone"].includes(field.key)}
                type={field.type}
                value={form[field.key as keyof typeof form]}
                onChange={(e) => update(field.key, e.target.value)}
                placeholder={field.placeholder}
                minLength={field.key === "password" ? 12 : undefined}
                maxLength={field.key === "password" ? 72 : undefined}
                autoComplete={field.key === "password" ? "new-password" : "off"}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
            </label>
          ))}

          {error && (
            <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-emerald-400 px-5 py-4 font-bold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50"
          >
            {loading ? "Creating owner account..." : "Create KS POS Owner Account"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          Initial setup can only be completed once.
        </p>
      </section>
    </main>
  );
}
