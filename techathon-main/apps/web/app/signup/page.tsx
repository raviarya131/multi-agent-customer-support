"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthBackground } from "@/components/auth-background";
import { AuthBrandHero } from "@/components/auth-brand-hero";
import { ThemeToggle } from "@/components/theme-toggle";
import { TypedBrand } from "@/components/typed-brand";
import { useAuth, homeForRole } from "@/lib/auth";

export default function SignupPage() {
  const { account, loading, signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && account) router.replace(homeForRole(account.role));
  }, [account, loading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await signup(name.trim(), email.trim(), password);
    setBusy(false);
    if (res.ok && res.account) {
      router.replace(homeForRole(res.account.role));
    } else {
      setError(res.error || "Sign up failed");
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

        <h1 className="text-lg font-medium">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign up with your email and a password to start a conversation with support.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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
              placeholder="At least 6 characters"
              autoComplete="new-password"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" className="w-full gap-2" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Create account
          </Button>
        </form>

        <p className="mt-4 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
