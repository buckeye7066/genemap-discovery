import * as React from "react";
import { cn } from "@/lib/utils";

const VARIANT_CLASSES = {
  default: "bg-blue-100 text-blue-700",
  secondary: "bg-slate-100 text-slate-700",
  outline: "border border-slate-200 text-slate-700",
  destructive: "bg-red-100 text-red-700",
  success: "bg-emerald-100 text-emerald-700",
};

export function Badge({ className, variant = "default", ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.default,
        className,
      )}
      {...props}
    />
  );
}

export const badgeVariants = ({ variant = "default", className } = {}) =>
  cn(VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.default, className);

export default Badge;
