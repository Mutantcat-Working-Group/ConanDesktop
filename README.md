<div align=center>
<img src="icon.png" style="width:100px;" width="100"/>
<h2>Conan Desktop</h2>
<p>当前版本：1.0.20260920</p>
</div>

**简体中文** | [English](README.en.md)

### 一、产品概述

- 面向 Conan 2 的桌面管理工具，统一管理本机 Profile、远程仓库和项目配置，不硬编码 ConanCenter 的 HTTP API，全部通过本机 Conan CLI 执行。
- 查库页支持按引用与通配符搜索远程仓库，展示版本排序、配方 revision、二进制列表分页和完整 settings/options。
- 远程仓库抽屉支持添加、修改、重命名、启用/禁用、删除、登录、退出登录、只读连接检测和本地凭据状态查看。
- 配置 Profile 支持列表、原文编辑、新建、自动检测、重命名、删除、校验，以及"生效、暂存、失效"三段管理状态。
- 配置项目支持保存项目、原生目录选择、Conan/CMake 文件扫描、CMake 位置自动获取、读取缓存与预设、绑定 Profile、环境变量和参数。
- 兼容私有部署的 Conan 仓库，包括 JFrog Artifactory、conan_server 与反向代理入口，复用 Conan 的 CA、代理和客户端证书配置。
- 基于 Tauri 2、React、TypeScript 与 antd 构建，界面不依赖 WebView 之外的浏览器运行。

核心价值：

- 以本机 Conan CLI 为事实来源，应用只提供 UI、管理元数据与状态，不重复实现 Conan 协议，也不绕过 Conan 的认证、代理和证书体系。
- 开放私有仓库场景：Artifactory API、conan_server、反向代理均可配置，不强制锁死 ConanCenter。
- 三段式 Profile 状态把"本机全局设置"与"桌面端管理意图"解耦，避免应用隐式修改 Conan 的默认配置。
- 项目页自动定位 Conan/CMake 环境与缓存，降低手工填写路径的成本，同时保持扫描只读、不执行构建。
- 发布链路采用三平台独立安装包，推送版本标签即可完成校验、构建、签名检查、校验和与 Release 发布。
- 数据写入保持原子、串行、最小化，命令不经过 shell，凭据不落盘。

### 二、功能说明

#### 查库

- 按引用与通配符（如 `engine/*@team/stable`）搜索远程仓库。
- 版本排序、配方 revision、二进制列表分页、完整 settings/options 展示。

#### 远程仓库

- 添加、修改、重命名、启用/禁用、删除。
- 登录、退出登录、只读连接检测、本地凭据状态查看。

#### 配置 Profile

- 列表、原文编辑、新建、自动检测、重命名、删除、校验。
- "生效、暂存、失效"三段管理状态，只有生效状态可用于项目绑定。

#### 配置项目

- 保存项目、原生目录选择、Conan/CMake 文件扫描、CMake 位置自动获取。
- 读取缓存与预设、绑定 Profile、环境变量和参数管理。

#### 应用设置

- 指定 Conan 可执行文件与默认项目目录。

### 三、安装与下载

从 [Releases](https://github.com/Mutantcat-Working-Group/ConanDesktop/releases) 下载对应平台安装包：Windows NSIS `.exe`、macOS 双架构 `.dmg`（ad-hoc 签名）、Linux `.AppImage`。下载后可使用 Release 中的 `SHA256SUMS.txt` 校验。

本机环境要求：Node.js 22.12+、pnpm、Rust stable、对应平台的 Tauri 2 系统依赖，以及 Conan 2（当前实测版本 2.16.1，不随应用打包）；CMake（可选）用于项目配置页的自动位置检测。

开发模式运行与本地打包：

```sh
pnpm install
pnpm tauri dev          # 开发模式；仅预览前端可运行 pnpm dev（http://localhost:1420）
pnpm tauri build        # 本地打包
```

macOS 本地调试应用包运行 `pnpm tauri build --debug --bundles app`，产物位于 `src-tauri/target/debug/bundle/macos/Conan Desktop.app`。

正式发布：推送 `v*` 标签后，GitHub Actions 自动构建三平台安装包，全部成功后生成 `SHA256SUMS.txt` 并创建 Release：

```sh
git tag -a v1.0.20260920 -m "Conan Desktop 1.0.20260920"
git push origin v1.0.20260920
```

发布流程见[发布指南](docs/releasing.md)。

### 四、快速上手

1. 设置应用：在"应用设置"中指定 Conan 可执行文件与默认项目目录。
2. 添加并登录远程仓库：
    ```
    ConanCenter：https://center2.conan.io
    Artifactory：https://repo.example.com/artifactory/api/conan/team-local
    conan_server：http://127.0.0.1:9300（生产建议 HTTPS 反向代理）
    反向代理入口：https://packages.example.com/conan/team
    ```
    填写 Conan API 地址而非网页管理地址，默认开启 TLS 证书校验。点击登录后输入该服务接受的密码或 Token，再点击"检测连接"执行只读搜索探针。私有仓库的接入步骤、企业 CA/代理配置和兼容边界见[私有仓库文档](docs/private-repositories.md)。
3. 查库：选择远程仓库，输入引用或通配符（如 `engine/*@team/stable`），搜索后查看版本、revision 与二进制详情。
4. 配置 Profile：新建、自动检测或原文编辑 Profile，校验通过后可切换为"生效、暂存、失效"状态；只有生效状态可用于项目绑定。被项目引用的 Profile 不能直接删除、重命名或停用，须先解除绑定。
5. 配置项目：新建项目后选择本地目录，自动扫描 Conan/CMake 文件并获取 CMake 位置，绑定生效 Profile，按需补充环境变量与参数。扫描不执行 configure/install/build，也不写项目的 `CMakePresets.json`。

### 五、数据与安全说明

1. Profile 内容位于 `CONAN_HOME/profiles`，Remote 修改由 Conan CLI 完成；应用设置位于 Tauri app-data 的 `settings.json`、`profile-states.json`、`projects.json`。
2. JSON 与 Profile 使用同目录临时文件原子替换；项目和 Profile 元数据更新在应用进程内串行执行。
3. 命令使用参数数组，不通过 shell；执行有 90 秒超时、关闭 stdin，JSON 查询强制非交互模式。
4. 密码仅作为登录子进程环境变量传递，不写入应用设置或进程参数；Conan 自己负责保存认证 token。
5. 连接检测只执行只读搜索，不上传内容、不安装依赖、不运行配方；扫描不执行项目脚本或 CMakeCache 指定的任意工具。
6. Profile 校验使用 Conan 的解析逻辑，请只校验可信 Profile。
7. 编辑器草稿在当前会话保留，切页不会丢失；关闭应用时提示，尚不支持崩溃恢复。

### 六、开发进度

- [X] 应用基础框架与三页布局
- [X] 查库：引用搜索、版本排序、revision、二进制详情、settings/options
- [X] 远程仓库：增删改查、启用/禁用、登录/退出、连接检测、凭据状态
- [X] 配置 Profile：编辑、自动检测、校验、生效/暂存/失效
- [X] 配置项目：目录选择、Conan/CMake 扫描、CMake 自动定位、Profile 绑定、环境变量和参数
- [X] 应用设置：Conan 可执行文件与默认项目目录
- [X] 私有仓库兼容与只读安全边界
- [X] 前端 23 项测试、Rust 单测、发布脚本测试
- [X] GitHub Actions 发布：Windows NSIS、macOS 双架构 ad-hoc DMG、Linux AppImage
- [ ] 崩溃恢复与跨进程内容合并
- [ ] 完整 CMake 预设展开（继承、include、条件与环境宏）
- [ ] Windows/Linux 平台签名与实机安装验证

详细调研、验证记录与下一阶段工作见 `docs/conan-desktop-research.md`。
