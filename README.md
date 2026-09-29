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

## Export to Android and iOS

Expo is the interpreter and the native build path. You do not rewrite the app for each store.

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
```

`preview` produces an installable Android APK and an iOS build you can put on TestFlight. `production` is the store profile. Store builds need an Apple Developer account and a Google Play account. Face ID is limited inside Expo Go; use a development or store build to bind the vault key to biometrics in the device keychain.

```bash
npx eas-cli@latest build --profile development --platform android
```

## Checks

```bash
npm test
npm run typecheck
```

Photo text recognition runs in the web app. PDF text extraction runs everywhere. The phone build still seals photos and reads digital PDFs.
