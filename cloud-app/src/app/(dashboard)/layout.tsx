import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardNav } from "@/components/DashboardNav";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const initial = session.user.name?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3">
          <Logo />
          <DashboardNav variant="desktop" />
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
              >
                {initial}
              </span>
              <div className="leading-tight">
                <p className="text-sm font-medium">{session.user.name}</p>
                <p className="text-xs text-muted-foreground">{session.user.role}</p>
              </div>
            </div>
            <SignOutButton />
          </div>
        </div>
        <DashboardNav variant="mobile" />
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
