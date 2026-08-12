import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.junrong.huang.tradeview.app',
  appName: 'TradeView',
  webDir: 'dist',
  ios: {
    backgroundColor: '#f8fafc',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
