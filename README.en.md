<div align="center">
<img src="icon.png" style="width:100px;" width="100"/>
<h2>Conan Desktop</h2>
<p>Current version: 1.0.20260920</p>
</div>

[简体中文](README.md) | **English**

### 1. Overview
- A desktop management tool for Conan 2 that manages local profiles, remote repositories, and project configuration in one place. It does not hard-code the ConanCenter HTTP API and delegates all operations to the local Conan CLI.
- The package browser searches remote repositories by reference or wildcard and shows version ordering, recipe revisions, paginated binary details, and full settings/options.
- The remote repository drawer supports add, edit, rename, enable/disable, delete, login, logout, read-only connectivity checks, and cached credential status.
- Profile management supports listing, raw editing, creating, auto-detection, renaming, deletion, validation, and the three-state lifecycle: active, staged, and inactive.
- Project configuration supports saved projects, native directory selection, Conan/CMake file scanning, automatic CMake location detection, cache and preset reading, profile binding, environment variables, and arguments.
- Works with privately deployed Conan repositories, including JFrog Artifactory, conan_server, and reverse-proxy entry points, while reusing Conan's CA, proxy, and client certificate configuration.
- Built with Tauri 2, React, TypeScript, and antd; the desktop UI does not depend on a separate browser.

Core value:

- Treat the local Conan CLI as the source of truth. The app provides UI, management metadata, and state without reimplementing the Conan protocol or bypassing Conan's authentication, proxy, and certificate handling.
- Support private repository scenarios: Artifactory APIs, conan_server, and reverse proxies can all be configured without locking users into ConanCenter.
- Separate the three-state profile lifecycle from the machine's global settings so the app never silently changes Conan's default configuration.
- Auto-locate Conan/CMake environments and caches on the project page to reduce manual path entry, while keeping scanning read-only and avoiding builds.
- Ship independent installers for three platforms: pushing a version tag triggers validation, building, signature checks, checksums, and Release publishing.
- Keep data writes atomic, serialized, and minimal; never route commands through a shell; never persist credentials.

### 2. Features

#### Package browser

- Search remote repositories by reference or wildcard (e.g. `engine/*@team/stable`).
- Version ordering, recipe revisions, paginated binary details, and full settings/options.

#### Remote repositories

- Add, edit, rename, enable/disable, and delete repositories.
- Login, logout, read-only connectivity checks, and cached credential status.

#### Profile management

- Listing, raw editing, creating, auto-detection, renaming, deletion, and validation.
- Three-state lifecycle: active, staged, inactive. Only the active state can be bound to a project.

#### Project configuration

- Saved projects, native directory selection, Conan/CMake file scanning, and automatic CMake location detection.
- Cache and preset reading, profile binding, environment variables, and arguments.

#### App settings

- Set the Conan executable and the default project directory.

### 3. Installation & Downloads

Download the installer for your platform from [Releases](https://github.com/Mutantcat-Working-Group/ConanDesktop/releases): Windows NSIS `.exe`, macOS dual-architecture `.dmg` (ad-hoc signed), and Linux `.AppImage`. Verify downloads with `SHA256SUMS.txt` from the Release.

Local prerequisites: Node.js 22.12+, pnpm, Rust stable, the Tauri 2 system dependencies for the platform, and Conan 2 (currently tested with 2.16.1, not bundled with the app); CMake (optional) is used for automatic location detection on the project page.

Development mode and local packaging:

```sh
pnpm install
pnpm tauri dev          # development mode; run pnpm dev (http://localhost:1420) to preview the frontend only
pnpm tauri build        # package locally
```

For a local macOS debug app bundle, run `pnpm tauri build --debug --bundles app`; the output is `src-tauri/target/debug/bundle/macos/Conan Desktop.app`.

Publishing a release: pushing a `v*` tag makes GitHub Actions build the three-platform installers, then generate `SHA256SUMS.txt` and publish the Release:

```sh
git tag -a v1.0.20260920 -m "Conan Desktop 1.0.20260920"
git push origin v1.0.20260920
```

See the [release guide](docs/releasing.md).

### 4. Quick Start

1. Configure the application: set the Conan executable and the default project directory in "App Settings".
2. Add and log in to remote repositories:
    ```
    ConanCenter: https://center2.conan.io
    Artifactory: https://repo.example.com/artifactory/api/conan/team-local
    conan_server: http://127.0.0.1:9300 (use HTTPS behind a reverse proxy in production)
    Reverse proxy entry: https://packages.example.com/conan/team
    ```
    Enter the Conan API address rather than the web admin address, with TLS verification enabled by default. Click login, enter the password or token accepted by that service, then click "Check Connection" to run a read-only search probe. Private repository setup, enterprise CA/proxy configuration, and compatibility boundaries are documented in [private repositories](docs/private-repositories.md).
3. Browse packages: select a remote repository, enter a reference or wildcard such as `engine/*@team/stable`, then inspect versions, revisions, and binary details.
4. Configure profiles: create, auto-detect, or edit a profile in raw text. After validation, switch it to active, staged, or inactive. A profile referenced by a project cannot be deleted, renamed, or deactivated until that binding is removed.
5. Configure projects: create a project, select a local directory, automatically scan Conan/CMake files to locate CMake, bind an active profile, then add environment variables and arguments as needed. Scanning never runs configure/install/build and does not write the project's `CMakePresets.json`.

### 5. Data and Security Notes

1. Profiles live in `CONAN_HOME/profiles`; remote changes are made by the Conan CLI. App settings are stored in Tauri app-data as `settings.json`, `profile-states.json`, and `projects.json`.
2. JSON and profiles are atomically replaced using temporary files in the same directory; project and profile metadata updates run serially inside the app process.
3. Commands use argument arrays, never a shell; execution has a 90-second timeout, stdin is closed, and JSON queries force non-interactive mode.
4. Passwords are passed only as login subprocess environment variables, never written to app settings or process arguments. Conan itself persists authentication tokens.
5. Connectivity checks perform read-only searches only; they never upload content, install dependencies, or run recipes. Scanning never executes project scripts or arbitrary tools named by CMakeCache.
6. Profile validation uses Conan's own parsing logic, so only validate profiles you trust.
7. Editor drafts survive page changes within the current session; closing the app shows a prompt. Crash recovery is not supported yet.

### 6. Development Progress

- [X] Application shell and three-page layout
- [X] Package browser: reference search, version ordering, revisions, binary details, settings/options
- [X] Remote repositories: CRUD, enable/disable, login/logout, connectivity checks, credential status
- [X] Profile management: editing, auto-detection, validation, active/staged/inactive states
- [X] Project configuration: directory selection, Conan/CMake scanning, CMake auto-location, profile binding, environment variables and arguments
- [X] App settings: Conan executable and default project directory
- [X] Private repository compatibility and read-only security boundaries
- [X] 23 frontend tests, Rust unit tests, and release script tests
- [X] GitHub Actions releases: Windows NSIS, macOS dual-architecture ad-hoc DMG, Linux AppImage
- [ ] Crash recovery and cross-process content merging
- [ ] Full CMake preset expansion (inheritance, include, conditionals, environment macros)
- [ ] Windows/Linux signing and real-machine installer verification

Detailed research, verification records, and next steps are in `docs/conan-desktop-research.md`.
