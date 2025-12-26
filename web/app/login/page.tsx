"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await response.json();
        setError(data.error || "Invalid password");
      }
    } catch (err) {
      setError("Failed to login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--tartarus-void)] relative overflow-hidden">
      {/* Background gradient effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--tartarus-teal)]/5 via-transparent to-[var(--tartarus-gold)]/5" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-[var(--tartarus-teal)]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-[var(--tartarus-gold)]/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--tartarus-gold)]/5 rounded-full blur-3xl" />

      {/* Login card */}
      <div className="relative w-full max-w-md mx-4">
        <div className="rounded-2xl bg-[var(--tartarus-surface)]/80 border border-[var(--tartarus-border)] p-8 shadow-2xl backdrop-blur-md">
          {/* Logo & Title */}
          <div className="flex flex-col items-center mb-8">
            {/* Large Kronus Logo */}
            <div className="relative mb-6">
              {/* Glow effect behind logo */}
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--tartarus-gold)]/30 to-[var(--tartarus-teal)]/20 rounded-full blur-2xl scale-150" />
              <div className="relative h-32 w-32 rounded-full overflow-hidden ring-4 ring-[var(--tartarus-gold)]/30 ring-offset-4 ring-offset-[var(--tartarus-surface)] shadow-2xl">
                <Image
                  src="/chronus-logo.png"
                  alt="Kronus"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>

            <h1 className="text-3xl font-bold text-[var(--tartarus-ivory)] tracking-tight">
              Developer Journal
            </h1>
            <p className="mt-2 text-center text-[var(--tartarus-ivory-muted)]">
              Enter the realm of your code chronicles
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-[var(--tartarus-ivory-dim)]"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] px-4 py-3 pr-12 text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)] focus:border-[var(--tartarus-teal)] focus:ring-2 focus:ring-[var(--tartarus-teal)]/20 focus:outline-none transition-all"
                  placeholder="Enter your password"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--tartarus-ivory-faded)] hover:text-[var(--tartarus-ivory)] transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-[var(--tartarus-error)]/30 bg-[var(--tartarus-error)]/10 px-4 py-3 text-[var(--tartarus-error)] text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[var(--tartarus-gold)] to-[var(--tartarus-gold-bright)] px-4 py-3 font-semibold text-[var(--tartarus-void)] transition-all hover:opacity-90 hover:shadow-lg hover:shadow-[var(--tartarus-gold)]/20 focus:ring-2 focus:ring-[var(--tartarus-gold)] focus:ring-offset-2 focus:ring-offset-[var(--tartarus-surface)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Entering...
                </>
              ) : (
                "Enter the Journal"
              )}
            </button>
          </form>

          {/* Hint */}
          <div className="mt-6 pt-6 border-t border-[var(--tartarus-border)]">
            <p className="text-center text-xs text-[var(--tartarus-ivory-faded)]">
              Default: <code className="rounded bg-[var(--tartarus-deep)] px-2 py-1 text-[var(--tartarus-teal)]">admin</code>
            </p>
            <p className="mt-2 text-center text-xs text-[var(--tartarus-ivory-faded)]">
              Set <code className="rounded bg-[var(--tartarus-deep)] px-1.5 py-0.5 text-[var(--tartarus-gold)]">ADMIN_PASSWORD_HASH</code> to customize
            </p>
          </div>
        </div>

        {/* Subtle branding */}
        <p className="mt-6 text-center text-xs text-[var(--tartarus-ivory-faded)]">
          Tartarus Journal System
        </p>
      </div>
    </div>
  );
}
