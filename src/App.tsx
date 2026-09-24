import {
  AppstoreOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
  FolderOpenOutlined,
  MenuOutlined,
  ProfileOutlined,
  ReloadOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  ConfigProvider,
  Drawer,
  Layout,
  Menu,
  Modal,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme,
} from "antd";
import type { MenuProps } from "antd";
import { lazy, Suspense, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { version as appVersion } from "../package.json";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import "./App.css";
import SettingsDrawer from "./components/SettingsDrawer";
import { isTauriRuntime } from "./lib/api";
import { useAppStore } from "./lib/store";
const PackagesPage = lazy(() => import("./pages/PackagesPage"));
const ProfilesPage = lazy(() => import("./pages/ProfilesPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  "/packages": {
    title: "查库",
    subtitle: "搜索 Conan 远程仓库中的包与版本",
  },
  "/profiles": {
    title: "配置 Profile",
    subtitle: "管理本地 Conan profile 与生效状态",
  },
  "/projects": {
    title: "配置项目",
    subtitle: "维护本地项目并自动识别 CMake 环境",
  },
};

const menuItems: MenuProps["items"] = [
  {
    key: "/packages",
    icon: <AppstoreOutlined />,
    label: "查库",
  },
  {
    key: "/profiles",
    icon: <ProfileOutlined />,
    label: "配置 Profile",
  },
  {
    key: "/projects",
    icon: <FolderOpenOutlined />,
    label: "配置项目",
  },
];

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [broken, setBroken] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const environment = useAppStore((state) => state.environment);
  const environmentLoading = useAppStore((state) => state.environmentLoading);
  const error = useAppStore((state) => state.error);
  const setError = useAppStore((state) => state.setError);
  const refreshEnvironment = useAppStore((state) => state.refreshEnvironment);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const refreshRemotes = useAppStore((state) => state.refreshRemotes);

  useEffect(() => {
    const hasDrafts = () => Object.keys(useAppStore.getState().profileDrafts).length > 0;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (hasDrafts()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (isTauriRuntime()) void getCurrentWindow().onCloseRequested((event) => {
      if (!hasDrafts()) return;
      event.preventDefault();
      Modal.confirm({ title: "Profile 有未保存修改", content: "关闭应用将放弃这些修改。", okText: "放弃并关闭", cancelText: "返回编辑", onOk: () => getCurrentWindow().destroy() });
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch((error) => setError(String(error)));
    return () => { disposed = true; unlisten?.(); window.removeEventListener("beforeunload", beforeUnload); };
  }, [setError]);

  useEffect(() => {
    void refreshEnvironment();
    void refreshSettings();
    void refreshRemotes();
  }, [refreshEnvironment, refreshSettings, refreshRemotes]);

  const currentMeta = pageMeta[location.pathname] ?? pageMeta["/packages"];

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 8,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Layout: {
            bodyBg: "#f5f7fa",
            headerBg: "#ffffff",
            siderBg: "#ffffff",
          },
          Menu: {
            itemSelectedBg: "#e6f4ff",
          },
        },
      }}
    >
      <Layout className="app-shell">
        <Sider
          className="app-sider"
          width={228}
          collapsible
          collapsed={collapsed}
          collapsedWidth={broken ? 0 : 72}
          trigger={null}
          breakpoint="lg"
          onBreakpoint={(value) => { setBroken(value); setCollapsed(value); }}
        >
          <div className="brand">
            <img className="brand-mark" src="/conan-icon.png" alt="Conan" width={36} height={36} />
            {!collapsed && !broken && (
              <div className="brand-text">
                <strong>Conan Desktop</strong>
              </div>
            )}
          </div>
          <Menu
            theme="light"
            mode="inline"
            selectedKeys={[currentMeta ? location.pathname : "/packages"]}
            items={menuItems}
            onClick={({ key }) => { navigate(key); if (broken) setCollapsed(true); }}
          />
          <div className="sider-spacer" />
          <div className="sider-footer">
            {!collapsed && !broken && (
              <>
                <Text className="sider-version">Conan Desktop {appVersion}</Text>
                {/* 发行方信息：由异猫工作群（mutantcat.org）发行。 */}
                <div className="sider-publisher">
                  发行方：异猫工作群（mutantcat.org）
                  <br />
                  <a href="https://github.com/Mutantcat-Working-Group" target="_blank" rel="noreferrer">
                    github.com/Mutantcat-Working-Group
                  </a>
                </div>
              </>
            )}
          </div>
        </Sider>

        <Layout>
          <Header className="app-header">
            <div className="header-left">
              <Button
                type="text"
                icon={<MenuOutlined />}
                aria-label={broken ? "打开导航" : "折叠导航"}
                onClick={() => setCollapsed((value) => !value)}
              />
              <div className="header-title">
                <Title level={3}>{currentMeta?.title}</Title>
              </div>
            </div>

            <Space size={12}>
              <div className="environment-pill">
                {environmentLoading ? (
                  <Tag color="processing">检测 Conan</Tag>
                ) : environment?.detected ? (
                  <Tooltip title={environment.conanHome || "Conan Home 已识别"}>
                    <Tag icon={<CheckCircleFilled />} color="success">
                      {environment.version?.replace("Conan version ", "") || "Conan"}
                    </Tag>
                  </Tooltip>
                ) : (
                  <Tag icon={<ExclamationCircleFilled />} color="warning">
                    Conan 未就绪
                  </Tag>
                )}
              </div>
              <Tooltip title="重新检测 Conan">
                <Button
                  icon={<ReloadOutlined />}
                  aria-label="重新检测 Conan"
                  loading={environmentLoading}
                  onClick={() => void refreshEnvironment()}
                />
              </Tooltip>
              <Tooltip title="应用设置">
                <Button
                  icon={<SettingOutlined />}
                  aria-label="应用设置"
                  onClick={() => setSettingsOpen(true)}
                />
              </Tooltip>
            </Space>
          </Header>

          {error && (
            <div className="global-alert">
              <Alert
                type="error"
                showIcon
                message="操作未完成"
                description={error}
                closable
                onClose={() => setError(null)}
              />
            </div>
          )}

          <Content className="app-content">
            {!isTauriRuntime() && <Alert className="validation-alert" type="warning" showIcon message={new URLSearchParams(window.location.search).get("demo") === "1" ? "演示数据 · 不连接本地 Conan，写操作不可用" : "浏览器预览 · 未连接本地 Conan"} />}
            <Suspense fallback={<div className="detail-loading">加载中...</div>}><Routes>
              <Route path="/" element={<Navigate to="/packages" replace />} />
              <Route path="/packages" element={<PackagesPage />} />
              <Route path="/profiles" element={<ProfilesPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="*" element={<Navigate to="/packages" replace />} />
            </Routes></Suspense>
          </Content>
        </Layout>
      </Layout>

      <Drawer
        title="应用设置"
        width={broken ? "100%" : 460}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      >
        <SettingsDrawer
          onSaved={() => {
            setSettingsOpen(false);
            void refreshEnvironment();
            void refreshSettings();
            void refreshRemotes();
          }}
        />
      </Drawer>
    </ConfigProvider>
  );
}

export default App;
