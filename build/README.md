# Build Icon Assets

This directory contains icon assets for packaging with `electron-builder`:
- `icon.ico` (Windows installer / application icon, minimum 256x256 ICO format)
- `icon.icns` (macOS DMG / application icon, ICNS format)

## Code Signing & Environment Placeholders (Signing Warning Note)

Unsigned builds will trigger Windows SmartScreen ("Unknown Publisher") and macOS Gatekeeper ("App from an unidentified developer") warnings on first launch.

To enable code signing for release builds, populate the following environment variables prior to running `npm run build:all`:

### Windows Signing:
```bash
export CSC_LINK="path/to/windows_certificate.pfx"
export CSC_KEY_PASSWORD="your_pfx_password"
```

### macOS Signing & Notarization:
```bash
export CSC_LINK="path/to/mac_certificate.p12"
export CSC_KEY_PASSWORD="your_p12_password"
export APPLE_ID="developer@yourcompany.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="YOURTEAMID"
```
