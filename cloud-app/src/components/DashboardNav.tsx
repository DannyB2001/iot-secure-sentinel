"use client";

import { Bell, Cpu, LayoutDashboard, type LucideIcon } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const LINKS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/devices", label: "Devices", icon: Cpu },
  { href: "/alarms", label: "Alarms", icon: Bell },
];

export function DashboardNav({ variant }: { variant: "desktop" | "mobile" }) {
  return (
    <nav
      className={
        variant === "desktop"
          ? "hidden items-center gap-1 md:flex"
          : "flex items-center gap-1 border-t border-border px-4 py-2 md:hidden"
      }
    >
      {LINKS.map((link) => (
        <NavLink key={link.href} href={link.href} icon={link.icon}>
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
