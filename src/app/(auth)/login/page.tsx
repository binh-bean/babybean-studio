"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

/**
 * useSearchParams() opts the subtree out of static rendering, so it has to sit
 * inside a Suspense boundary or `next build` fails while prerendering /login.
 */
function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      return;
    }

    // `next` comes from the middleware redirect. Only accept a path on this
    // site — an absolute URL here would turn login into an open redirect.
    const next = searchParams.get("next");
    const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";

    router.push(target);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleLogin}
      style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}
    >
      {error && <div style={{ color: "red" }}>{error}</div>}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={{ padding: "0.5rem" }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        style={{ padding: "0.5rem" }}
      />
      <button type="submit" style={{ padding: "0.5rem" }}>
        Login
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div style={{ padding: "2rem", maxWidth: "400px", margin: "0 auto" }}>
      <h1>BabyBean Staff Login</h1>
      <Suspense fallback={<p>Đang tải…</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
