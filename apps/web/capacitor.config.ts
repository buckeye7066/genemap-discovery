import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.genemap.discovery',
  appName: 'GeneMap Discovery',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
  plugins: {
    // Manual OTA web-bundle updates only, driven by the Settings "App Updates"
    // card and the launch/resume checker. No Capgo cloud service: autoUpdate
    // is off and the stats/update endpoints are cleared, so the plugin never
    // talks to anything but our own pinned feed.
    CapacitorUpdater: {
      autoUpdate: false,
      statsUrl: '',
      updateUrl: '',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ba0c2f',
      showSpinner: true,
      spinnerColor: '#ffffff',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ba0c2f',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
