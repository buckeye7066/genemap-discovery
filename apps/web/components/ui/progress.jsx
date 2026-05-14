import * as React from "react";
import { cn } from "@/lib/utils";

// Minimal Progress (matching the shadcn/ui surface) — original was missing
// from the repo. Accepts `value` (0–100) and an optional `max`.
export const Progress = React.forwardRef(({ className, value = 0, max = 100, ...props }, ref) => {
  const pct = Math.max(0, Math.min(100, (Number(value) / Number(max)) * 100));
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Number(value)}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-slate-200", className)}
      {...props}
    >
      <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
});
Progress.displayName = "Progress";

export default Progress;
