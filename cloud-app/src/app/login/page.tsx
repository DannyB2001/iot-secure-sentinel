"use client";

import { Suspense, useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, Lock, Mail, ShieldCheck, Zap } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("from") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await signIn("credentials", {
      email,
      password,
      callbackUrl,
      redirect: false,
    });
    setPending(false);
    if (!res?.ok || res.error) {
      setError("Invalid email or password.");
      return;
    }
    router.replace(res.url ?? callbackUrl);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="flex items-center gap-3 lg:hidden">
        <LogoMark className="h-9 w-9" />
        <span className="text-xl font-semibold tracking-tight">Iris Gateway</span>
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to manage your gateway, devices, and alarms.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@iris.local"
              className="pl-9"
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <div className="relative">
            <Lock
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Enter your password"
              className="pl-9"
              required
            />
          </div>
        </div>
        {error ? (
          <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
      {process.env.NODE_ENV !== "production" ? (
        <p className="text-center text-xs text-muted-foreground">
          For development, the seed admin is{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">admin@iris.local</code>.
        </p>
      ) : null}
    </div>
  );
}

const HIGHLIGHTS = [
  { icon: Activity, title: "Live alarm feed", body: "Tamper, temperature, and battery events visible within 5 seconds." },
  { icon: Zap, title: "Edge to cloud in one path", body: "HARDWARIO Core Module to gateway to console, no glue scripts in between." },
  { icon: ShieldCheck, title: "Per-device bearer tokens", body: "Argon2id passwords, hashed device tokens, scoped roles." },
];

function BrandPanel() {
  return (
    <div className="iris-mesh relative hidden h-full flex-col justify-between overflow-hidden p-12 text-white lg:flex">
      <div className="flex items-center gap-3">
        <LogoMark className="h-8 w-8" />
        <span className="text-lg font-semibold tracking-tight">Iris Gateway</span>
      </div>
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
            Operator console
          </p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Watch your gateway,
            <br />
            answer to your alarms.
          </h2>
        </div>
        <ul className="space-y-4">
          {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-white/75">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-white/60">
        Iteration 1, tamper detection + temperature
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center px-6 py-12">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
