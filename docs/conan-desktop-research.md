# Conan Desktop 调研与实现记录

记录日期：2026-09-20。

## 1. 定位与技术方案

本地开发工具，不是包仓库服务。Conan 2 CLI 是 Conan 行为来源，React/antd 负责检索、配置和状态，Rust 负责进程与文件访问。

采用 CLI 而非嵌入 Python API，可以复用用户 Conan Home、Remote、认证和扩展，避免将 Python 运行环境及 Conan 内部 API 耦合到安装包。使用 JSON `--format json --out-file`，不解析终端表格。

| 模块 | 职责 |
| --- | --- |
| `src/pages` | 三个主页面 |
| `src/components` | Remote 与设置抽屉 |
| `src/lib/api.ts` | 类型化 IPC，显式只读演示模式 |
| `src/lib/store.ts` | 环境、配置、列表、会话草稿 |
| `src-tauri/src/commands` | 功能边界与参数校验 |
| `src-tauri/src/services/conan.rs` | 工具查找、进程、JSON 输出 |
| `src-tauri/src/state` | 原子持久化与元数据锁 |

## 2. 命令契约

| 需求 | Conan 2 命令 |
| --- | --- |
| 版本与 Home | `conan --version`、`conan config home` |
| 查询 | `conan list 'fmt/*' -r conancenter --format json` |
| 全部配方修订与二进制 | `conan list 'fmt/12.2.0#*:*' -r conancenter --format json` |
| Profile 名单 | `conan profile list --format json` |
| 自动生成 | `conan profile detect --name NAME`，不传 force |
| 校验 | `conan profile show -pr:h PATH -pr:b PATH --format json` |
| Remote | `remote list/add/update/remove/rename/enable/disable/login/logout` |

JSON 可能包含 `{remote: {error: "..."}}` 而非进程失败，需要显式识别。引用、revision、package ID 是不同层级，不将 recipe revision 当作语义版本。详情不截断 settings/options，二进制使用分页。

Conan 2.16.1 的 `RemoteCredentials._get_env` 按大写且 `-` 转 `_` 的远程名查找 `CONAN_PASSWORD_<REMOTE>`。登录使用此机制，credentials.json 与认证插件优先级仍由 Conan 决定。

## 3. Profile 状态语义

- 生效：允许项目选择。
- 暂存：文件已保存，尚未投入项目使用。
- 失效：保留文件，不允许新绑定。
- default 无显式状态时视为生效，显式元数据始终优先。
- 不通过删除文件模拟停用，也不声称状态会影响外部终端的 Conan 命令。
- 项目引用约束在 Rust 再次校验，而不只禁用前端选项。

## 4. 项目自动获取位置

从选定根目录扫描 `conanfile.py/txt`、`CMakeLists.txt`、`CMakePresets.json`、`CMakeUserPresets.json`、`CMakeCache.txt`。读取缓存的 `CMAKE_COMMAND`、`CMAKE_GENERATOR`、`CMAKE_BUILD_TYPE`、`CMAKE_HOME_DIRECTORY`、C/C++ compiler 字段；无工具路径时查 PATH 和常见 macOS 位置。

缓存路径是数据，不是执行授权。只有正常工具查找命中的 CMake 才运行 `--version`。预设使用 serde_json，不以正则解析结构化数据；继承/include 的部分支持会明确提示。

## 5. 验证策略与记录

- TypeScript 测试：JSON 异常、版本排序、路径缩略、草稿隔离、浏览器写入拒绝。
- Rust 测试：默认状态、CMakeCache、目录扫描、预设宏、原子写入。
- 显式启用 CLI 集成测试，以临时 Home 检查 Profile detect/show、Remote CRUD、JSON 输出和本地查询。
- 真实 macOS 桌面端已观察到 Conan 2.16.1、fmt 查询 22 个引用、fmt/12.2.0 的 1 个修订和 11 个二进制，以及 default Profile 成功校验。
- 临时 Home 的 CLI 集成测试已通过。真实桌面项目扫描识别测试项目中的 Conan 文件、CMakeLists、CMakePresets、展开后的 build/release 路径，以及 `/opt/homebrew/bin/cmake` 和 CMake 4.0.2。
- 已选择 Release (Ninja) 预设并保存 `cmake-project`，重启最新桌面包后确认项目、工具路径、构建目录和 Generator 保留。该项目指向仓库内 `tests/fixtures/cmake-project`，没有修改用户原有 Profile 或 Remote。
- 本轮最终验证：18 条前端测试、5 条 Rust 单元测试和 1 条显式 CLI 集成测试通过；`cargo fmt --check`、TypeScript 编译、Vite 生产构建及 macOS debug app 打包通过。共享前端 chunk 约 636 kB，有体积告警，尚未作为发布性能基线验收。
- 本机 Clang 21 超出 Conan 2.16.1 自带 settings 范围。测试仍检查 detect 生成文件，但 show 使用固定兼容 Profile，避免将宿主工具链年龄混入命令契约测试。
- Tabbit 在初次 diagnose 后失去实例路由，Playwright 桌面/移动视口检查未完成。原生桌面截图检查不等于完整跨视口自动化。

## 6. 下一阶段

1. host/build 双 Profile、构建类型与配置预设的完整持久化模型。
2. 预设继承/include/条件/宏解析，以及多缓存来源选择。
3. 独立执行队列：Conan install、CMake configure/build、取消、流式日志、失败重试。
4. 外部文件变更检测、冲突提示、草稿恢复、Profile 导入导出。
5. 私有仓库认证服务端测试，离线/代理/TLS 错误场景，Windows/Linux 打包实测。
6. 图标定制、签名、公证、更新分发。

## 参考资料

- 官网：https://conan.io/
- 正确源码仓库：https://github.com/conan-io/conan
- 原始第二个链接的主机仍为 conan.io，并非 GitHub 仓库地址。
- 查询：https://docs.conan.io/2/reference/commands/list.html
- Remote：https://docs.conan.io/2/reference/commands/remote.html
- Profile：https://docs.conan.io/2/reference/config_files/profiles.html
- CMakeToolchain：https://docs.conan.io/2/reference/tools/cmake/cmaketoolchain.html
- CMake Presets：https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html
- Tauri 2：https://v2.tauri.app/

命令契约由本地 CLI 帮助、已安装 Conan 源码及真实运行核实；在线文档列作参考，未声称在本轮浏览器会话中逐页读取。
