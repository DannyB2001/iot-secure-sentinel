"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "./ui/button";

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => signOut({ callbackUrl: "/login" })}
      aria-label="Sign out"
    >
      <LogOut />
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}
