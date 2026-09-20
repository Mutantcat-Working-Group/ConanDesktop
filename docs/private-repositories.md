# 私有 Conan 仓库

Conan Desktop 通过本机 Conan 2 CLI 访问仓库，不硬编码 ConanCenter 的 HTTP API。远程仓库配置、认证 token、代理与证书处理均由 Conan 管理。

## 地址与兼容范围

| 服务 | 仓库地址示例 | 注意事项 |
| --- | --- | --- |
| JFrog Artifactory | `https://repo.example.com/artifactory/api/conan/team-local` | 填写 Conan API 地址，不是网页管理地址；local/remote/virtual 仓库的可用能力和权限由服务端决定 |
| conan_server | `http://127.0.0.1:9300` | 使用支持 Conan 2 的服务版本；生产部署应通过 HTTPS 反向代理接入 |
| 反向代理入口 | `https://packages.example.com/conan/team` | 保留端口和路径前缀，代理必须正确转发 Conan API 和文件下载地址 |
| ConanCenter | `https://center2.conan.io` | 与私有仓库可同时配置，也可禁用或移除 |

其他服务以是否实现当前 Conan 2 客户端所需协议为准。普通制品目录、Git 仓库地址、仅支持 Conan 1 的服务、浏览器 SSO 登录页不能直接当作兼容仓库。`file://` 是 Conan 的本地配方仓库能力，不等同于完整远程制品服务。

## 接入步骤

1. 查库页打开“远程仓库”，添加名称和服务端提供的 Conan API 地址。默认开启 TLS 证书校验。
2. 点击登录，输入用户名与该服务接受的密码或 Token。Token 的类型、用户名要求与权限由私有服务决定，并非所有 Token 都兼容密码登录。
3. 点击“检测连接”。应用执行非交互的只读 `conan list conan-desktop-connectivity-probe-* -r <name> --format json`。
4. 查库页选中该仓库，搜索实际授权的引用，例如 `engine/*@team/stable`。引用和详情保留 `@user/channel`，版本列只显示版本号。

“本地凭据 / 已缓存”来自 `conan remote list-users`，不表示 Token 仍有效。状态读取失败显示“未知”，不阻塞仓库列表；空列表不会调用 list-users。退出登录清理由 Conan 保存的凭据。

连接检测成功仅表示这一时刻只读搜索请求成功，不保证有上传、下载、全部包读取权限。有些服务会隐藏无权读取的包，也可能允许匿名查询。请用实际私有引用确认权限。检测不会上传内容、安装依赖或运行配方。禁用仓库不会自动启用。

检测失败保留 Conan 错误，并按常见关键词提示认证、权限、证书、地址或网络问题。不同版本的错误文本可能不同，分类仅用于辅助判断，以原始错误为准。CLI 查询退出码为 0 但 JSON 内含 `error` 时仍视为失败。

## 企业网络

应用复用所选 Conan 可执行文件的 `CONAN_HOME/global.conf` 和进程环境，不另外维护代理或证书副本。可用 `conan config home` 确认目录。以下为 Conan 2.16.1 配置示例，按环境选择需要的项：

```ini
# Trusted CA bundle in PEM format; keep TLS verification enabled.
core.net.http:cacert_path=/absolute/path/company-ca-bundle.pem

# Optional corporate proxy.
core.net.http:proxies={"http": "http://proxy.example.com:8080", "https": "http://proxy.example.com:8080"}
core.net.http:no_proxy_match=["https://repo.internal/*"]

# Optional mutual TLS certificate/key pair.
core.net.http:client_cert=("/absolute/path/client.crt", "/absolute/path/client.key")
```

代理、CA、mTLS 的具体组合需要在目标网络验证。macOS 从 Finder 启动的应用不一定继承终端 shell 中导出的变量，优先使用 Conan 的持久化配置；配置文件与私钥应限制本机读取权限。不要为解决企业 CA 问题直接关闭 TLS 校验。HTTP 本身不提供传输加密，即使“TLS 校验”开关开启也不会把 HTTP 升级成 HTTPS。

## 凭据边界

- 新增或编辑仓库时，不允许 URL 内嵌用户名、密码、查询参数或片段，避免凭据进入仓库地址和界面。
- 登录密码或 Token 只传入 Conan 子进程环境变量，不放入 CLI 参数或应用 JSON 文件；不是操作系统密钥链集成，同一用户权限下的进程仍可能访问进程环境。
- Conan 负责持久化认证 Token。应用不自行加密或复制该 Token，不实现浏览器 SSO/OAuth 跳转。
- 错误区显示服务端/CLI 原始错误，分享截图或日志前应检查是否包含内部地址等敏感信息。

## 自动化验证

单元测试覆盖私有引用解析、URL 安全校验、缓存认证映射、连接 JSON 校验和错误分类；组件测试覆盖认证状态与实时结果的区别、禁用仓库、权限失败。浏览器演示模式不会伪造连接成功。

真实协议测试用临时 `CONAN_HOME` 和临时 conan_server 数据目录，仅监听 `127.0.0.1` 的随机端口。生成一次性账号和配方，结束后关闭服务并删除临时数据，不连接外网仓库、不改用户配置。

```sh
uv venv /tmp/conandesktop-private-repo-test
uv pip install --python /tmp/conandesktop-private-repo-test/bin/python conan-server==2.16.1
CONAN_TEST_EXECUTABLE=/opt/homebrew/bin/conan /tmp/conandesktop-private-repo-test/bin/python tests/private_repository.py
```

测试覆盖登录成功/错误密码、缓存用户、上传测试配方、带用户/频道的查询、revision、空探测、带路径前缀的代理、退出和拒绝读取。路径前缀测试使用本地 WSGI 代理，不代表真实 Artifactory 验证。尚未对企业 Artifactory 实例、企业 CA/代理/mTLS 或生产负载做端到端验证。
