import {
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AutoComplete,
  Alert,
  Collapse,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { formatDate, shortenPath } from "../lib/format";
import { useAppStore } from "../lib/store";
import type { ProjectConfig, ProjectDetection } from "../lib/types";

const { Text, Title } = Typography;

interface EnvironmentEntry {
  key: string;
  value: string;
}

interface ProjectFormValues {
  name: string;
  path: string;
  conanProfile?: string;
  buildDir?: string;
  cmakeExecutable?: string;
  generator?: string;
  arguments: string[];
  environment: EnvironmentEntry[];
}

export default function ProjectsPage() {
  const profiles = useAppStore((state) => state.profiles);
  const settings = useAppStore((state) => state.settings);
  const refreshProfiles = useAppStore((state) => state.refreshProfiles);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<ProjectDetection | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [form] = Form.useForm<ProjectFormValues>();
  const detectionRequest = useRef(0);

  const loadProjects = async () => {
    setLoading(true);
    try {
      setProjects(await api.listProjects());
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
    void refreshProfiles();
    return () => { detectionRequest.current += 1; };
  }, [refreshProfiles]);

  const profileOptions = useMemo(
    () => profiles.map((profile) => ({ label: `${profile.name}${profile.state === "active" ? "" : profile.state === "staged" ? " (暂存)" : " (失效)"}`, value: profile.name, disabled: profile.state !== "active" })),
    [profiles],
  );

  const chooseProjectDirectory = async (newProject = false) => {
    if (!api.isTauriRuntime()) {
      if (newProject) openNewEditor();
      void message.info("浏览器预览中请手动输入路径。");
      return;
    }
    try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择 Conan / CMake 项目目录",
      defaultPath: settings?.defaultProjectDir ?? undefined,
    });
    if (typeof selected === "string") {
      if (newProject) openNewEditor();
      form.setFieldValue("path", selected);
      setDirty(true);
      await runDetection(selected);
    }
    } catch (error) { void message.error(String(error)); }
  };

  const runDetection = async (path: string) => {
    const normalized = (path || "").trim();
    if (!normalized) {
      void message.warning("请输入项目目录。");
      return;
    }

    const request = ++detectionRequest.current;
    setDetecting(true);
    setDetection(null);
    try {
      const result = await api.detectProject(normalized);
      if (request !== detectionRequest.current) return;
      setDetection(result);
      setDirty(true);
      const current = form.getFieldsValue();
      form.setFieldsValue({
        ...current,
        path: result.path,
        name: current.name || result.name,
        buildDir: current.buildDir || result.buildDirs[0],
        cmakeExecutable: current.cmakeExecutable || result.cmakeExecutable || undefined,
        generator: current.generator || result.cmakeGenerator || undefined,
      });
      setEditorOpen(true);
    } catch (error) {
      if (request === detectionRequest.current) void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      if (request === detectionRequest.current) setDetecting(false);
    }
  };

  const detectCmake = async () => {
    const request = ++detectionRequest.current;
    setDetecting(true);
    try {
      const executable = await api.detectCmakeExecutable();
      if (request !== detectionRequest.current) return;
      if (!executable) {
        void message.warning("未在 PATH 中找到 CMake 可执行文件。");
      } else {
        form.setFieldValue("cmakeExecutable", executable);
        setDirty(true);
        void message.success("已自动获取 CMake 可执行文件位置。");
      }
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      if (request === detectionRequest.current) setDetecting(false);
    }
  };

  const openNewEditor = () => {
    setDirty(false);
    detectionRequest.current += 1;
    setDetecting(false);
    setEditingId(null);
    setDetection(null);
    form.resetFields();
    form.setFieldsValue({
      name: "",
      path: settings?.defaultProjectDir || "",
      arguments: [],
      environment: [],
    });
    setEditorOpen(true);
  };

  const openExistingEditor = async (project: ProjectConfig) => {
    setDirty(false);
    const request = ++detectionRequest.current;
    form.resetFields();
    setEditingId(project.id);
    setDetection(null);
    setEditorOpen(true);
    form.setFieldsValue({
      name: project.name,
      path: project.path,
      conanProfile: project.conanProfile || undefined,
      buildDir: project.buildDir || undefined,
      cmakeExecutable: project.cmakeExecutable || undefined,
      generator: project.generator || undefined,
      arguments: project.arguments,
      environment: Object.entries(project.environment).map(([key, value]) => ({
        key,
        value,
      })),
    });

    if (project.path) {
      setDetecting(true);
      try {
        const detected = await api.detectProject(project.path);
        if (request === detectionRequest.current) setDetection(detected);
      } catch {
        if (request === detectionRequest.current) setDetection(null);
      } finally {
        if (request === detectionRequest.current) setDetecting(false);
      }
    }
  };

  const saveEditor = async () => {
    try {
    const values = await form.validateFields();
    const current = editingId
      ? projects.find((project) => project.id === editingId)
      : undefined;
    const environment = Object.fromEntries(
      values.environment
        .filter((entry) => entry.key.trim())
        .map((entry) => [entry.key.trim(), entry.value || ""]),
    );

    const project: ProjectConfig = {
      id: current?.id || "",
      name: values.name.trim(),
      path: values.path.trim(),
      conanProfile: values.conanProfile || null,
      buildDir: values.buildDir || null,
      cmakeExecutable: values.cmakeExecutable || null,
      generator: values.generator || null,
      arguments: values.arguments,
      environment,
      createdAt: current?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
      const saved = await api.saveProject(project);
      void message.success(`项目 ${saved.name} 已保存`);
      setDirty(false);
      detectionRequest.current += 1;
      setEditorOpen(false);
      await loadProjects();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async (id: string) => {
    try {
      await api.deleteProject(id);
      void message.success("项目已删除");
      await loadProjects();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="page">
      <section className="page-toolbar">
        <Space wrap>
          <Button
            type="primary"
            icon={<FolderAddOutlined />}
            onClick={() => void chooseProjectDirectory(true)}
          >
            添加项目
          </Button>
          <Button icon={<EditOutlined />} onClick={openNewEditor}>
            手动录入
          </Button>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void loadProjects()}
          >
            刷新
          </Button>
        </Space>
      </section>

      <Spin spinning={loading}>
        {projects.length === 0 ? (
          <Empty description="还没有已保存的项目" />
        ) : (
          <List
            grid={{
              gutter: 16,
              xs: 1,
              sm: 1,
              md: 2,
              lg: 2,
              xl: 3,
            }}
            dataSource={projects}
            renderItem={(project) => (
              <List.Item>
                <ProjectCard
                  project={project}
                  onEdit={() => void openExistingEditor(project)}
                  onDelete={() => void deleteProject(project.id)}
                />
              </List.Item>
            )}
          />
        )}
      </Spin>

      <Drawer
        title={editingId ? "编辑项目" : "添加项目"}
        size={720}
        open={editorOpen}
        onClose={() => {
          const close = () => { detectionRequest.current += 1; setEditorOpen(false); setDetecting(false); setDirty(false); };
          if (dirty) Modal.confirm({ title: "放弃未保存的项目修改？", okText: "放弃", cancelText: "继续编辑", onOk: close });
          else close();
        }}
        extra={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={detecting}
            onClick={() => void saveEditor()}
          >
            保存项目
          </Button>
        }
      >
        <Form<ProjectFormValues>
          form={form}
          layout="vertical"
          className="project-form"
          onValuesChange={() => setDirty(true)}
          initialValues={{
            name: "",
            path: "",
            arguments: [],
            environment: [],
          }}
        >
          <DetectionSummary detection={detection} loading={detecting} />
          {Boolean(detection?.configurePresets.length) && <Form.Item label="CMake 配置预设">
            <Select placeholder="选择检测到的预设" value={undefined} options={detection!.configurePresets.map((preset, index) => ({ label: `${preset.displayName} (${preset.name})`, value: index }))} onChange={(index) => {
              if (index === undefined) return;
              const preset = detection!.configurePresets[index];
              setDirty(true);
              if (preset.binaryDir) form.setFieldValue("buildDir", preset.binaryDir);
              if (preset.generator) form.setFieldValue("generator", preset.generator);
            }} />
          </Form.Item>}

          <Form.Item
            name="path"
            label="项目位置"
            rules={[{ required: true, message: "请输入项目目录。" }]}
          >
            <Input
              placeholder="/path/to/project"
              suffix={
                <Tooltip title="选择项目目录"><Button
                  type="text"
                  icon={<FolderOpenOutlined />}
                  aria-label="选择项目目录"
                  onClick={() => void chooseProjectDirectory()}
                /></Tooltip>
              }
            />
          </Form.Item>

          <div className="form-action-row">
            <Button
              icon={<ThunderboltOutlined />}
              loading={detecting}
              onClick={() => void runDetection(form.getFieldValue("path"))}
            >
              自动检测此路径
            </Button>
          </div>

          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: "请输入项目名称。" }]}
          >
            <Input placeholder="例如 my-application" />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="conanProfile" label="Conan Profile">
                <Select
                  allowClear
                  showSearch
                  placeholder="选择 profile"
                  options={profileOptions}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="buildDir" label="构建目录">
                <AutoComplete placeholder="build" options={detection?.buildDirs.map((value) => ({ value }))} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="cmakeExecutable" label="CMake 可执行文件">
            <Input
              placeholder="/opt/homebrew/bin/cmake"
              suffix={
                <Tooltip title="自动获取 CMake 位置"><Button
                  type="text"
                  icon={<ThunderboltOutlined />}
                  aria-label="自动获取 CMake 位置"
                  onClick={() => void detectCmake()}
                /></Tooltip>
              }
            />
          </Form.Item>

          <Form.Item name="generator" label="CMake Generator">
            <AutoComplete
              allowClear
              placeholder="例如 Ninja 或 Unix Makefiles"
              options={[
                { label: "Ninja", value: "Ninja" },
                { label: "Unix Makefiles", value: "Unix Makefiles" },
                { label: "Xcode", value: "Xcode" },
                { label: "Visual Studio 17 2022", value: "Visual Studio 17 2022" },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="arguments"
            label="额外参数"
            tooltip="按回车添加参数，空格会保留为单个参数。"
          >
            <Select
              mode="tags"
              open={false}
              placeholder="例如 --build=missing"
            />
          </Form.Item>

          <EnvironmentEditor />
        </Form>
      </Drawer>
    </div>
  );
}

function ProjectCard({
  project,
  onEdit,
  onDelete,
}: {
  project: ProjectConfig;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card
      className="project-card"
      title={
        <div className="project-card-title">
          <FolderOpenOutlined />
          <Text strong ellipsis title={project.name}>
            {project.name}
          </Text>
        </div>
      }
      extra={
        <Space size={0}>
          <Button
            type="text"
            icon={<EditOutlined />}
            aria-label={`编辑 ${project.name}`}
            onClick={onEdit}
          />
          <Popconfirm
            title="删除项目"
            description={`确认删除 ${project.name}？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={onDelete}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label={`删除 ${project.name}`}
            />
          </Popconfirm>
        </Space>
      }
    >
      <div className="project-card-meta">
        <Text type="secondary" title={project.path}>
          {shortenPath(project.path)}
        </Text>
        <Tag color="blue">{project.conanProfile || "无 Profile"}</Tag>
      </div>
      <Descriptions
        size="small"
        column={1}
        items={[
          {
            key: "cmake",
            label: "CMake",
            children: project.cmakeExecutable || "未设置",
          },
          {
            key: "build",
            label: "构建目录",
            children: project.buildDir || "未设置",
          },
          {
            key: "generator",
            label: "Generator",
            children: project.generator || "未设置",
          },
          {
            key: "updated",
            label: "更新时间",
            children: formatDate(project.updatedAt),
          },
        ]}
      />
    </Card>
  );
}

function DetectionSummary({
  detection,
  loading,
}: {
  detection: ProjectDetection | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="detection-summary">
        <Spin size="small" />
        <Text type="secondary">正在扫描项目...</Text>
      </div>
    );
  }

  if (!detection) return null;

  const summary = [
    ["CMake", detection.cmakeVersion || detection.cmakeExecutable || "未找到"],
    ["Generator", detection.cmakeGenerator || "未识别"],
    ["构建类型", detection.cmakeBuildType || "未识别"],
    ["C 编译器", detection.cCompiler || "未识别"],
    ["C++ 编译器", detection.cxxCompiler || "未识别"],
    ["Conan 文件", String(detection.conanfiles.length)],
    ["CMakeLists", String(detection.cmakeLists.length)],
    ["CMake Presets", String(detection.cmakePresets.length)],
  ];

  return (
    <div className="detection-summary detected">
      <div className="detection-summary-head">
        <Text strong>检测完成</Text>
        <Tag icon={<ApiOutlined />} color="cyan">
          {detection.name}
        </Tag>
      </div>
      <div className="detection-tags">
        {summary.map(([label, value]) => (
          <Tag key={label}>
            <Text type="secondary">{label}:</Text> {value}
          </Tag>
        ))}
      </div>
      {detection.warnings.map((warning) => <Alert key={warning} type="warning" title={warning} showIcon />)}
      <Collapse ghost items={[{ key: "files", label: "检测到的文件", children: <List size="small" dataSource={[...detection.conanfiles, ...detection.cmakeLists, ...detection.cmakePresets, ...detection.cmakeCacheFiles]} renderItem={(path) => <List.Item><Text className="mono-text" copyable>{path}</Text></List.Item>} /> }]} />
    </div>
  );
}

function EnvironmentEditor() {
  return (
    <Form.List name="environment">
      {(fields, { add, remove }) => (
        <div className="environment-editor">
          <div className="subsection-title">
            <Title level={5}>环境变量</Title>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => add({ key: "", value: "" })}
            >
              添加
            </Button>
          </div>
          {fields.length === 0 ? (
            <Text type="secondary">暂无额外环境变量。</Text>
          ) : (
            fields.map((field) => (
              <Space key={field.key} className="environment-row" align="start">
                <Form.Item
                  {...field}
                  name={[field.name, "key"]}
                  rules={[{ required: true, message: "请输入变量名。" }]}
                >
                  <Input placeholder="CONAN_REVISIONS_ENABLED" />
                </Form.Item>
                <Form.Item {...field} name={[field.name, "value"]}>
                  <Input placeholder="1" />
                </Form.Item>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label="删除环境变量"
                  onClick={() => remove(field.name)}
                />
              </Space>
            ))
          )}
        </div>
      )}
    </Form.List>
  );
}
