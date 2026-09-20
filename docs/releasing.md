# GitHub Actions 发布

工作流位于 `.github/workflows/release.yml`。推送 `vMAJOR.MINOR.YYYYMMDD` 标签触发构建，标签必须与该提交中的项目版本一致。普通代码推送不会发布。也可在 Actions 的 Release Installers 中手动输入一个已存在的版本标签重新构建。

## 当前产物

| 平台 | Runner | Release 文件 |
| --- | --- | --- |
| Windows x64 | windows-2022 | `ConanDesktop_1.0.20260920_windows-x64-setup.exe` |
| macOS Apple Silicon | macos-15 | `ConanDesktop_1.0.20260920_macos-arm64.dmg` |
| macOS Intel | macos-15-intel | `ConanDesktop_1.0.20260920_macos-x64.dmg` |
| Linux x64 | ubuntu-22.04 | `ConanDesktop_1.0.20260920_linux-x64.AppImage` |

另附 `SHA256SUMS.txt`。不生成 MSI、DEB、RPM 或自动更新包。Windows/Linux 暂只构建 x64，macOS 提供两个独立架构包。

## 触发发布

先把本次代码和工作流提交、推送到 GitHub，再对希望发布的提交打标签：

```sh
git tag -a v1.0.20260920 -m "Conan Desktop 1.0.20260920"
git push origin v1.0.20260920
```

不要预先在网页上发布同名 Release；此流程会自动创建并公开 Release。创建草稿可以，但已经公开的 Release 不会被重新上传覆盖。

构建前校验版本、运行前端和 Rust 测试，使用锁定的依赖。四个平台任务均成功后，下载本轮构建资产并校验文件集合，创建草稿、上传安装包和校验和，最后公开。任一构建失败不会发布不完整版本；上传中断只留下草稿，可重新运行失败任务。权限默认只读，仅发布任务获得 `contents: write`，使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需个人 PAT 或 Apple 证书 Secret。仓库/组织必须允许 Actions 使用写入 Release 的权限。

## 版本管理

升级时保持以下文件同步，日期必须有效：

- `package.json`：产品版本，界面直接读取它。
- `src-tauri/Cargo.toml` 与 `src-tauri/Cargo.lock`：应用包版本。
- `src-tauri/tauri.conf.json`：产品版本；`bundle.macOS.bundleVersion` 使用 `YYYY.M.D`。
- `src-tauri/tauri.windows.conf.json`：Windows 打包版本，映射规则如下。

Windows 原生四段版本字段每段不超过 65535，日期不能直接作为第三段。`1.0.20260920` 映射为 Tauri Windows 版本 `1.0.2026+920`，NSIS 数字资源版本为 `1.0.2026.920`。代码/Cargo、界面、Git 标签与发布文件名仍使用 `1.0.20260920`；Windows 安装器、注册表或原生产品元数据可能显示映射后的版本。Tauri 会自动合并 `tauri.windows.conf.json`，不用人工传入配置。不要随意更改这套映射，以免影响已安装版本识别。

本地验证：

```sh
python3 scripts/release.py validate --tag v1.0.20260920
python3 -m unittest discover -s tests -p test_release.py
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

脚本需要 Python 3.11+，CI 使用 Python 3.12、Node 24、packageManager 固定的 pnpm 和 Rust stable。

## 安装和签名边界

- Windows NSIS 按当前用户安装，提供中英文，包含 WebView2 离线安装器，无需用户手动安装 WebView2。未配置 Authenticode 签名，SmartScreen 仍可能提示未知发布者。
- macOS 的 `signingIdentity: "-"` 对 `.app` 作 ad-hoc 签名。CI 验证该签名后再次对最终 DMG 作 ad-hoc 签名，并执行 `codesign --verify` 与 `hdiutil verify`。这不是 Apple Developer ID 签名或公证，不能承诺首次下载双击无 Gatekeeper 提示。
- Linux AppImage 在 Ubuntu 22.04 构建，CI 解包确认 AppRun 存在且可执行。下载后执行位可能丢失，需要在文件属性中允许执行；无 FUSE 2 时可使用 `--appimage-extract-and-run`。不承诺兼容所有 Linux 发行版。
- GUI 安装后不需要 Node、Rust 或前端开发服务器。管理功能仍需要本机 Conan 2，CMake 自动检测需要本机 CMake。本次不捆绑 Python/Conan/CMake，也不自动修改它们。

发布正文来源于 `docs/release-notes.md`，发版前可在其中补充更新说明。对企业分发有无提示启动要求时，需要另行配置 Windows 代码签名和 Apple Developer ID + notarization。
