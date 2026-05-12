"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/components/ThemeProvider";

export function AppToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      theme={theme}
      toastOptions={{
        classNames: {
          toast: "rounded-lg border-border",
        },
      }}
    />
  );
}
