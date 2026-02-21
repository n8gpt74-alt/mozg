import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full rounded-xl border border-[var(--tg-theme-hint-color)]/30 bg-[var(--tg-theme-bg-color)] px-3 py-2 text-sm outline-none transition focus-visible:border-[var(--tg-theme-link-color)] focus-visible:ring-2 focus-visible:ring-[var(--tg-theme-link-color)]/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
