"use client";
import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSignup = searchParams.get("signup") === "true";

  const [mode, setMode] = useState<"login" | "signup">(isSignup ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: businessName },
          },
        });
        if (error) throw error;
        setMessage("Check your email for a confirmation link!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0F1C] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center justify-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-sm font-bold text-white">S</div>
          <span className="text-xl font-bold text-white tracking-tight">ShelfKeeper</span>
        </Link>

        <div className="bg-[#111827] border border-gray-800 rounded-xl p-6">
          <div className="flex gap-2 mb-6">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); setMessage(""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  mode === m ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {m === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Business Name</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your Amazon Business"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                minLength={6}
                required
              />
            </div>

            {error && <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>}
            {message && <div className="text-sm text-green-400 bg-green-400/10 rounded-lg px-3 py-2">{message}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg font-medium text-sm text-white transition"
            >
              {loading ? "Loading..." : mode === "login" ? "Log In" : "Create Account"}
            </button>
          </form>

          {mode === "signup" && (
            <p className="text-xs text-gray-500 text-center mt-4">
              14-day free trial. No credit card required.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0F1C] flex items-center justify-center text-gray-500">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}