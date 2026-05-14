// Minimal Toaster stub. The previous codebase referenced @/components/ui/toaster
// but the file was missing, breaking the production Vite build. We render a
// host element so any future portal-based toaster has somewhere to mount, but
// today this exports a no-op component to keep the build green and the bundle
// small. Replace with a real toast implementation (e.g. shadcn/ui or sonner)
// when a notification UX is wired up.
export function Toaster() {
  return null;
}

export default Toaster;
