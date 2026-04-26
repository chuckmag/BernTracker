# Web static assets

Files placed here are served by Vite at the site root (e.g. `public/favicon.ico` → `https://yourdomain/favicon.ico`).

## Favicon set — drop these files in here

The `<link>` tags in `apps/web/index.html` already reference the names below. Once you drop the files into this folder and redeploy, browsers pick them up automatically.

| Filename | Size (px) | Format | Purpose |
|---|---|---|---|
| `favicon.ico` | 32×32 (multi-res ok: 16/32/48) | ICO | Legacy browsers, Windows tabs |
| `favicon.svg` | scalable | SVG | Modern browsers (Chrome, Firefox, Safari) — preferred |
| `apple-touch-icon.png` | 180×180 | PNG | iOS home screen icon |
| `android-chrome-192x192.png` | 192×192 | PNG | Android home screen / PWA |
| `android-chrome-512x512.png` | 512×512 | PNG | Android splash / PWA install |

Already wired up:
- `site.webmanifest` references both Android PNGs and is linked from `index.html`.
- `<meta name="theme-color">` in `index.html` is set to `#030712` (the app's `bg-gray-950`); update it there if the brand colour changes.

## Mobile app icons (separate folder)

The Expo mobile app reads its icons from `apps/mobile/assets/`, not from here. Replace the existing files in place — keep the same filenames so `apps/mobile/app.json` does not need to change:

| Filename | Size (px) | Notes |
|---|---|---|
| `icon.png` | 1024×1024 | Master app icon (App Store / Play Store) |
| `splash-icon.png` | 1242×2688 (or square 1024×1024) | Splash screen |
| `favicon.png` | 48×48 | Expo web export favicon |
| `android-icon-foreground.png` | 432×432 | Adaptive icon, foreground (keep important content within centre 264×264 safe zone) |
| `android-icon-background.png` | 432×432 | Adaptive icon, background |
| `android-icon-monochrome.png` | 432×432 | Themed icon (Android 13+) |

## Generating the set

If you have a single source SVG/PNG, [realfavicongenerator.net](https://realfavicongenerator.net) produces the entire web set (everything in the table above) for free. For the mobile set, Expo's [adaptive icon docs](https://docs.expo.dev/develop/user-interface/app-icons/) cover sizes and safe zones.

## Where to host

Free path (recommended): commit the files to this folder. Vite ships them with the build and Railway serves them from the same origin as the app — no extra service, no CDN config, no extra cost. For favicons specifically, same-origin is also the most compatible across browsers.
