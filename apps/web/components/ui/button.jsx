import * as React from "react";
import { cn } from "@/lib/utils";

// Minimal Button matching the shadcn/ui surface area used elsewhere in this
// codebase (variant, size, asChild, className). The original button.jsx was
// missing from the repo and broke the production build; this implementation
// preserves the API so existing call-sites keep working without any changes.
const VARIANTS = {
  default: "bg-blue-600 text-white hover:bg-blue-700",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  outline: "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
  secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
  ghost: "hover:bg-slate-100 text-slate-900",
  link: "text-blue-600 underline-offset-4 hover:underline",
};

const SIZES = {
  default: "h-9 px-4 py-2 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-6 text-base",
  icon: "h-9 w-9",
};

export const Button = React.forwardRef(
  ({ className, variant = "default", size = "default", asChild = false, type, ...props }, ref) => {
    const classes = cn(
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      VARIANTS[variant] ?? VARIANTS.default,
      SIZES[size] ?? SIZES.default,
      className,
    );
    if (asChild && React.isValidElement(props.children)) {
      const child = React.Children.only(props.children);
      return React.cloneElement(child, { className: cn(classes, child.props.className), ref });
    }
    return <button ref={ref} type={type ?? "button"} className={classes} {...props} />;
  },
);

Button.displayName = "Button";

export const buttonVariants = ({ variant = "default", size = "default", className } = {}) =>
  cn(VARIANTS[variant] ?? VARIANTS.default, SIZES[size] ?? SIZES.default, className);

export default Button;
