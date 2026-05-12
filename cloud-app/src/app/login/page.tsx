"use client";

import { Suspense, useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, Cpu, KeyRound, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
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
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Watch alarms from your gateway and acknowledge them once an operator has reviewed.
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
          <p
            role="alert"
            className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Signing in
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
      {process.env.NODE_ENV !== "production" ? (
        <p className="text-center text-xs text-muted-foreground">
          Dev seed account:{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
            admin@iris.local
          </code>
        </p>
      ) : null}
    </div>
  );
}

const HIGHLIGHTS = [
  {
    icon: Bell,
    title: "Sub-5s alarm latency",
    body: "Open alarms appear here as soon as the gateway forwards an event from the Core Module.",
  },
  {
    icon: Cpu,
    title: "Tamper and temperature sensors",
    body: "Built around the HARDWARIO Core Module talking to a Raspberry Pi gateway over MQTT.",
  },
  {
    icon: KeyRound,
    title: "Per-device bearer tokens",
    body: "Each gateway and sensor node carries its own scoped token, hashed with SHA-256 at rest.",
  },
  {
    icon: ShieldCheck,
    title: "Argon2id operator passwords",
    body: "Memory-hard hashing for human accounts, separate from device authentication.",
  },
];

function BrandPanel() {
  return (
    <div className="iris-mesh relative hidden h-full flex-col justify-between overflow-hidden p-12 text-white lg:flex">
      <div className="flex items-center gap-3">
        <LogoMark className="h-8 w-8" />
        <span className="text-lg font-semibold tracking-tight">Iris Gateway</span>
      </div>
      <div className="space-y-8">
        <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
          Iris keeps an eye on the gateway, so an operator can stay on the floor.
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
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
        iris-gateway.cz, built for HARDWARIO Core Module on a Raspberry Pi gateway
      </p>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading sign-in form"
      className="flex w-full max-w-sm flex-col items-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span>Preparing sign-in</span>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center px-6 py-12">
        <Suspense fallback={<FormSkeleton />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
