# Conan Desktop

使用 Tauri 2、React、TypeScript 和 antd 构建的 Conan 2 桌面管理工具。

当前版本：`1.0.20260920`。推送对应版本标签后，GitHub Actions 自动构建 Windows NSIS、macOS 双架构 DMG 和 Linux AppImage，并在全部成功后发布 Release。流程与签名限制见 [发布指南](docs/releasing.md)。

## 页面

| 页面 | 当前功能 |
| --- | --- |
| 查库 | 按引用与通配符搜索远程仓库，版本排序，配方 revision，分页二进制详情，完整 settings/options |
| 远程仓库抽屉 | 添加、修改 URL/TLS、重命名、启用/禁用、删除、登录、退出登录、本地凭据状态、只读连接检测 |
| 配置 Profile | 列表、原文编辑、新建、自动检测、重命名、删除、校验、生效/失效/暂存状态 |
| 配置项目 | 保存项目，原生目录选择，扫描 Conan/CMake 文件，自动获取 CMake 位置，读取缓存与预设，绑定 Profile，环境变量和参数 |
| 应用设置 | 指定 Conan 可执行文件与默认项目目录 |

Profile 状态属于本应用的管理元数据，不会改写 Conan 的全局默认配置。只有生效状态可用于项目绑定。被项目引用的 Profile 不能直接删除、重命名或停用，须先解除绑定。暂存状态不是编辑器未保存内容的同义词。

## 环境要求

支持 Conan 2 兼容的私有仓库地址，包括 Artifactory Conan API、conan_server 和反向代理入口；复用 Conan 的 CA、代理与客户端证书配置。接入说明、测试方法和兼容边界见 [私有仓库文档](docs/private-repositories.md)。

- Node.js 22.12+、pnpm、Rust stable，以及对应平台的 Tauri 2 系统依赖。
- Conan 2，当前实测版本 2.16.1。Conan 不打包进应用。
- CMake 可选，用于自动检测；项目配置页不会执行 configure/install/build。
- macOS GUI 启动会补充查找 `/opt/homebrew/bin`、`/usr/local/bin`、CMake.app 和 `~/.local/bin`。

## 运行

```sh
pnpm install
pnpm tauri dev
```

仅预览前端运行 `pnpm dev`，默认地址 `http://localhost:1420`。浏览器不能调用本地 Conan。开发模式显式使用 `http://localhost:1420/?demo=1#/packages` 可查看带标识的演示数据，写操作始终拒绝。生产构建不开放此演示回退。

当前开发机器使用独立 pnpm store；在此工作区安装或添加依赖时加上 `--store-dir /tmp/conan-desktop-pnpm-store`。

## 验证与打包

```sh
pnpm test
pnpm build
cd src-tauri
cargo fmt --check
cargo test
CONAN_TEST_EXECUTABLE=/opt/homebrew/bin/conan cargo test --test conan_cli -- --ignored --nocapture
```

最后一条集成测试使用临时 `CONAN_HOME`，不修改用户现有 Profile/Remote，也不需要联网。Windows 可先设置同名环境变量后执行 Cargo 命令。不要同时运行 Cargo 测试和 Tauri 打包，以免不同构建模式竞争同一 target 目录。

在项目根目录运行 `pnpm tauri build`；macOS 本地调试应用包运行 `pnpm tauri build --debug --bundles app`，产物位于 `src-tauri/target/debug/bundle/macos/Conan Desktop.app`。正式分发仍需平台签名与公证；Windows/Linux 尚未平台实测。

## 数据与安全边界

- Profile 内容位于 `CONAN_HOME/profiles`，Remote 修改由 Conan CLI 完成。
- 应用设置位于 Tauri app-data：`settings.json`、`profile-states.json`、`projects.json`。macOS 通常为 `~/Library/Application Support/com.mutantcat.conandesktop`。
- JSON 与 Profile 使用同目录临时文件原子替换。项目和 Profile 元数据更新在应用进程内串行执行。
- 命令使用参数数组，不通过 shell；执行有 90 秒超时、关闭 stdin，JSON 查询强制非交互模式。
- 密码仅作为登录子进程环境变量传递，不写入应用设置或进程参数。Conan 自己负责保存认证 token。
- 扫描不执行项目脚本或 CMakeCache 指定的任意工具。Profile 校验使用 Conan 的解析逻辑，请只校验可信 Profile。
- 编辑器草稿在当前会话保留，切页不会丢失；关闭应用时提示，尚不支持崩溃恢复。

## 当前限制

- 不执行依赖安装、CMake 配置或构建，也不写项目的 `CMakePresets.json`。
- 预设只读取直接字段，支持 `${sourceDir}`/`${presetName}`，尚不展开继承、include、条件与环境宏，界面会提示部分支持情况。
- 扫描深度最多 6 层，跳过 `.git`、`node_modules`、虚拟环境、`target`、`_deps`，不跟随符号链接。多个缓存时从排序后的首个缓存读取环境字段。
- Conan 版本较旧时，自动生成的编译器版本可能超出其 `settings.yml` 范围；需升级 Conan 或维护设置，应用不静默降级编译器版本。
- 外部进程同时修改 Conan 文件仍可能最后写入覆盖；暂不提供跨进程锁和内容合并。
- 详细调研、验证记录与下一阶段工作见 `docs/conan-desktop-research.md`。
