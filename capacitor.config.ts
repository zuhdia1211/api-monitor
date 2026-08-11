import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.apimonitor.pulse',
  appName: 'API & LLM Pulse',
  webDir: 'dist',
  android: {
    // The app talks to third-party APIs over HTTPS; plain HTTP is not needed.
    allowMixedContent: false,
  },
  plugins: {
    CapacitorSQLite: {
      // The app never encrypts its databases. The plugin's default flips
      // androidIsEncryption on and then instantiates a MasterKey /
      // EncryptedSharedPreferences chain that can fail on devices without a
      // lock screen, taking down startup with a "CapacitorSQLitePlugin: null"
      // load error. Keys must sit flat under CapacitorSQLite (not nested under
      // android) or the native side never sees them.
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login for capacitor sqlite',
        biometricSubTitle: 'Log in using your Biometric credential',
      },
      databaseLocation: 'default',
    },
  },
};

export default config;
