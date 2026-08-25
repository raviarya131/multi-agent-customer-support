"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthBackground } from "@/components/auth-background";
import { AuthBrandHero } from "@/components/auth-brand-hero";
import { ThemeToggle } from "@/components/theme-toggle";
import { TypedBrand } from "@/components/typed-brand";
import { useAuth, homeForRole } from "@/lib/auth";

const DEMO_ACCOUNTS = [
  { label: "Customer", email: "avery.chen@demo.test" },
  { label: "Admin / Developer", email: "admin@demo.test" },
  { label: "Support agent", email: "maya.fernandez@demo.test" },
];

export default function LoginPage() {
  const { account, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in → bounce to the role's home.
  useEffect(() => {
    if (!loading && account) router.replace(homeForRole(account.role));
  }, [account, loading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await login(email.trim(), password);
    setBusy(false);
    if (res.ok && res.account) {
      router.replace(homeForRole(res.account.role));
    } else {
      setError(res.error || "Login failed");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 text-foreground sm:px-8 lg:justify-end lg:px-0 lg:pr-[12vw]">
      <AuthBackground />
      <AuthBrandHero />
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className="relative w-full max-w-sm rounded-2xl border border-border/80 bg-card/80 p-6 shadow-2xl shadow-black/10 backdrop-blur-md dark:border-border/60 dark:bg-card/70 dark:shadow-black/20 sm:p-8">
        <div className="mb-8 lg:hidden">
          <TypedBrand text="Support Engine" className="font-serif text-2xl font-semibold tracking-tight" />
        </div>

        <h1 className="text-lg font-medium">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use a demo account below. The password for all of them is{" "}
          <span className="font-mono text-foreground">demo1234</span>.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@demo.test"
              autoComplete="username"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" className="w-full gap-2" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
            Sign in
          </Button>
        </form>

        <p className="mt-4 text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-medium text-foreground underline-offset-2 hover:underline">
            Create an account
          </Link>
        </p>

        <div className="mt-6 rounded-lg border border-border bg-card/50 p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Quick demo logins
          </p>
          <div className="space-y-1">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => setEmail(a.email)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary/60"
              >
                <span>{a.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{a.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
