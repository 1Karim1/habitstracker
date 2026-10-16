# HabitFlow A55 — Android APK & PWA Installation Guide (Samsung Galaxy A55 5G)

## 1. Architecture & Storage Overview
- **Primary Database:** `IndexedDB` (`HabitTrackerDB` schema v2) with transactional writes (`habits`, `categories`, `completions`, `notes`, `settings`) and automatic local mirror fallback.
- **Weekly Convention:** Strictly **Saturday → Sunday → Monday → Tuesday → Wednesday → Thursday → Friday** across the GitHub-style heatmap, weekly calendar, streak calculations, and analytics.
- **Offline Operation:** 100% self-contained CSS, SVG/Canvas charts, and core logic with zero external network dependencies.

## 2. Option A — Direct Offline PWA Installation on Samsung Galaxy A55 5G
1. Serve the `www/` folder over HTTPS or `localhost` (or open `habit_tracker_galaxy_a55.html`).
2. Open in **Samsung Internet** or **Google Chrome** on your Samsung Galaxy A55 5G.
3. Tap the menu icon and choose **Add to Home screen / Install app**.
4. The Service Worker (`sw.js`) caches all assets for full offline operation, and `navigator.storage.persist()` requests persistent device storage.

## 3. Option B — Building a Native Android APK with Capacitor
1. Ensure **Node.js 18+**, **Java JDK 17+**, and **Android SDK** are installed on your build machine.
2. In this project root directory, run:
   ```bash
   npm install
   npx cap add android
   npx cap sync android
   ```
3. Build the installable Debug APK from the command line:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
4. Locate the generated APK at:
   `android/app/build/outputs/apk/debug/app-debug.apk`
5. Install onto your Samsung Galaxy A55 5G via USB Debugging (`adb`):
   ```bash
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
   *(Using `-r` replaces the application binary while preserving your existing IndexedDB database across version upgrades.)*

## 4. Running the Automated Verification Suite
Run the automated Saturday-first calendar, scheduling, streak, heatmap intensity, and backup validation test suite:
```bash
npm test
```
