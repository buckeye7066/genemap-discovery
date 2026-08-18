export {};

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
    readonly VITE_STRIPE_PUBLIC_KEY?: string;
    readonly VITE_NATIVE_VERSION?: string;
    readonly VITE_ENABLE_UNIVERSAL_LINK_HANDLER?: string;
    readonly VITE_ENABLE_PLATFORM_COMPATIBILITY?: string;
    readonly VITE_ENABLE_MOBILE_OPTIMIZATION?: string;
    readonly MODE: string;
    readonly DEV: boolean;
    readonly PROD: boolean;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
