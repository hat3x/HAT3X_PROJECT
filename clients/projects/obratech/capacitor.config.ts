import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hat3x.projectcanvas',
  appName: 'ProjectCanvas',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
