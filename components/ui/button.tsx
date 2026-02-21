import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold leading-5 transition-all duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tg-theme-link-color)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tg-theme-bg-color)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] shadow-sm hover:brightness-110",
        secondary:
          "bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-text-color)] hover:brightness-105",
        outline:
          "border border-[var(--tg-theme-hint-color)]/40 bg-transparent text-[var(--tg-theme-text-color)] hover:bg-[var(--tg-theme-secondary-bg-color)]",
      },
      size: {
        default: "h-11",
        lg: "h-12 px-6 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
