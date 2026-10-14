import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "../lib/utils";

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-primary px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-primary dark:text-slate-950",
        className
      )}
      {...props}
    />
  );
}

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:bg-muted",
        className
      )}
      {...props}
    />
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-border bg-card", className)} {...props} />;
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border",
        className
      )}
      {...props}
    />
  );
}
