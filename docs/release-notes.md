## Installers

| Platform | Asset | Installation |
| --- | --- | --- |
| Windows 10/11 x64 | `windows-x64-setup.exe` | Run the NSIS installer. The WebView2 offline installer is included. |
| macOS 11+ Apple Silicon | `macos-arm64.dmg` | Open the DMG and drag Conan Desktop into Applications. |
| macOS 11+ Intel | `macos-x64.dmg` | Open the DMG and drag Conan Desktop into Applications. |
| Linux x64 | `linux-x64.AppImage` | Grant executable permission in file properties, then launch. Built on Ubuntu 22.04. |

SHA-256 hashes are provided in `SHA256SUMS.txt`.

## Requirements and Security

- The GUI does not require Node.js, Rust or a development environment. Install Conan 2 separately to manage packages and profiles; CMake is optional for project detection.
- Both the macOS app and DMG are ad-hoc signed, not Developer ID signed or notarized. Gatekeeper may block the first launch. Only for a verified download from this repository, use macOS System Settings > Privacy & Security > Open Anyway. Do not disable Gatekeeper globally.
- The Windows installer is not Authenticode signed; SmartScreen may warn about an unknown publisher.
- AppImage requires a compatible Linux desktop and may require FUSE 2. If unavailable, use `./ConanDesktop_...AppImage --appimage-extract-and-run`. AppImage is not a guarantee of compatibility with every Linux distribution.
- Private repositories, credentials, profiles and projects continue using your local Conan configuration. Conan and CMake are not bundled.
