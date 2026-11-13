# Vivo-v40e

Mobile app built with React Native and Expo (SDK 58, Expo Router, TypeScript).

## Run it

```bash
npm install
npx expo start
```

Then scan the QR code with the **Expo Go** app on your phone, or press `w` to open it in the browser.

## Checks

```bash
npx tsc --noEmit   # typecheck
npx expo lint      # lint
```

## Structure

- `src/app/` — screens (every file is a route; `_layout.tsx` defines navigation)
- `src/constants/theme.ts` — colors, spacing, radius, fonts (light and dark)
- `src/hooks/` — shared hooks
- `assets/` — icons and splash images
