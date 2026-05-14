// Minimal Sidebar primitives. The original repo referenced a richer
// shadcn/ui sidebar implementation (with collapsible state, keyboard
// shortcuts, etc.) that was missing. We ship a layout-only set of
// primitives so Layout.jsx renders correctly. Replace with the original
// implementation if it's recovered from history.
import * as React from "react";
import { cn } from "@/lib/utils";

const SidebarContext = React.createContext({ open: true, setOpen: () => {} });

export function SidebarProvider({ children, defaultOpen = true }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const value = React.useMemo(() => ({ open, setOpen }), [open]);
  return (
    <SidebarContext.Provider value={value}>
      <div className="flex min-h-screen w-full">{children}</div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ className, children, ...props }) {
  const { open } = React.useContext(SidebarContext);
  return (
    <aside
      data-state={open ? "open" : "closed"}
      className={cn(
        "border-r border-slate-200 bg-white text-slate-900 transition-[width]",
        open ? "w-64" : "w-0 overflow-hidden",
        "hidden md:flex md:flex-col",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

export const SidebarHeader = ({ className, ...props }) => (
  <div className={cn("p-4 border-b border-slate-200", className)} {...props} />
);
export const SidebarFooter = ({ className, ...props }) => (
  <div className={cn("p-4 border-t border-slate-200 mt-auto", className)} {...props} />
);
export const SidebarContent = ({ className, ...props }) => (
  <div className={cn("flex-1 overflow-y-auto p-2", className)} {...props} />
);
export const SidebarGroup = ({ className, ...props }) => (
  <div className={cn("py-2", className)} {...props} />
);
export const SidebarGroupLabel = ({ className, ...props }) => (
  <div className={cn("px-2 pb-1 text-xs font-medium uppercase tracking-wide text-slate-500", className)} {...props} />
);
export const SidebarGroupContent = ({ className, ...props }) => (
  <div className={cn("space-y-0.5", className)} {...props} />
);
export const SidebarMenu = ({ className, ...props }) => (
  <ul className={cn("space-y-0.5", className)} {...props} />
);
export const SidebarMenuItem = ({ className, ...props }) => (
  <li className={cn("", className)} {...props} />
);

export const SidebarMenuButton = React.forwardRef(
  ({ className, asChild = false, isActive = false, children, ...props }, ref) => {
    const classes = cn(
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
      isActive ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-700 hover:bg-slate-50",
      className,
    );
    if (asChild && React.isValidElement(children)) {
      const child = React.Children.only(children);
      return React.cloneElement(child, { className: cn(classes, child.props.className), ref });
    }
    return (
      <button ref={ref} type="button" className={classes} {...props}>
        {children}
      </button>
    );
  },
);
SidebarMenuButton.displayName = "SidebarMenuButton";

export function SidebarTrigger({ className, ...props }) {
  const { open, setOpen } = React.useContext(SidebarContext);
  return (
    <button
      type="button"
      aria-label="Toggle sidebar"
      onClick={() => setOpen(!open)}
      className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100", className)}
      {...props}
    >
      <span aria-hidden="true">≡</span>
    </button>
  );
}
