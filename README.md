# MODO

A local-first document vault for web, Android, and iOS. One Expo (JavaScript) codebase stores the original file, seals it on the device, and reads what it can from the document.

## What it does

- Create a 6-digit PIN. The PIN wraps a random AES-256-GCM vault key with PBKDF2-HMAC-SHA256 (210,000 rounds). The PIN is not stored.
- Seal PDFs, images, and text files. On a phone the ciphertext lives in the app documents folder. In the browser it lives in IndexedDB. The wrapped key lives in the iOS Keychain or Android Keystore, and in local storage on the web.
- Read digital text out of PDFs, including compressed text streams. In the browser, photos can be recognized with an on-device English text engine. Structured fields (passport numbers, dates, names, and similar labels) are pulled out of that text for you to review before sealing.
- Check integrity on open: the GCM tag must verify, and the SHA-256 of the file must match the hash saved at seal time.
- Optional Face ID or fingerprint on iOS and Android. Lock when the app leaves the foreground, export an encrypted backup, or destroy the vault on this device.

A 6-digit PIN stops someone holding the phone. It is not a strong password if a backup file is copied off the device. The backup opens with the same PIN.

## Run it

```bash
npm install
npm run web
npm run android
npm run ios
```

`npm run ios` needs macOS. On Windows or Linux, use Expo Go for a quick look, or build in the cloud.

## Deploy

One Expo project ships the website, the Android app, and the iOS app. Cloud builds do not need a Mac.

Do this once:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest credentials:configure-build -p android -e production
npx eas-cli@latest credentials:configure-build -p ios -e production
```

`eas init` links this repo to an Expo project. The credential commands create the Android keystore and the iOS distribution certificate. iOS needs an Apple Developer account. Play Store submission needs a Google Play account.

Then deploy all three:

```bash
npm run deploy
```

That publishes the website on [EAS Hosting](https://docs.expo.dev/eas/hosting/workflows/) and starts production Android and iOS builds. Install those builds from the Expo dashboard. `npm run deploy:preview` does the same with an installable Android APK, an internal iOS build, and a preview website.

`npm run release` deploys the website and submits the store builds to Google Play and App Store Connect. Store submission needs the [Play CI/CD setup](https://docs.expo.dev/submit/android/) and the [App Store CI/CD setup](https://docs.expo.dev/submit/ios/) completed once.

From GitHub, open Actions, choose Deploy, and run it. Add an [Expo access token](https://expo.dev/settings/access-tokens) as the repository secret `EXPO_TOKEN` first. The web job also saves the static site as an artifact. `npm run export:web` writes that same site to `dist/` if you want to host it somewhere else.

Face ID is limited inside Expo Go. A preview, development, or store build binds the vault key to biometrics in the device keychain.

## Checks

```bash
npm test
npm run typecheck
```

Photo text recognition runs in the web app. PDF text extraction runs everywhere. The phone build still seals photos and reads digital PDFs.
