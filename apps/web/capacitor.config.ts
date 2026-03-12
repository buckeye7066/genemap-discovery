import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.genemap.discovery',
  appName: 'GeneMap Discovery',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1e3a8a',
      showSpinner: true,
      spinnerColor: '#ffffff',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1e3a8a',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
