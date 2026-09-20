import {
  DeleteOutlined,
  EditOutlined,
  FileSearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  FormOutlined,
} from "@ant-design/icons";
import { StreamLanguage } from "@codemirror/language";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import CodeMirror from "@uiw/react-codemirror";
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Tooltip,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { formatBytes, formatDate } from "../lib/format";
import { useAppStore } from "../lib/store";
import { isValidProfileName } from "../lib/validation";
import type {
  ProfileDetail,
  ProfileState,
  ProfileSummary,
  ProfileValidation,
} from "../lib/types";

const { Text, Title } = Typography;

const stateOptions: { label: string; value: ProfileState }[] = [
  { label: "生效", value: "active" },
  { label: "暂存", value: "staged" },
  { label: "失效", value: "inactive" },
];

export default function ProfilesPage() {
  const profiles = useAppStore((state) => state.profiles);
  const profilesLoading = useAppStore((state) => state.profilesLoading);
  const refreshProfiles = useAppStore((state) => state.refreshProfiles);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProfileDetail | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<ProfileValidation | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detectOpen, setDetectOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState<ProfileSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [mutating, setMutating] = useState(false);
  const setDraft = useAppStore((state) => state.setProfileDraft);
  const drafts = useAppStore((state) => state.profileDrafts);
  const selectedRef = useRef(selectedName);
  selectedRef.current = selectedName;
  const dirty = Boolean(detail && editorContent !== detail.content);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  useEffect(() => {
    if (!selectedName) {
      setDetail(null);
      setEditorContent("");
      setDetailLoading(false);
      return;
    }

    let active = true;
    setDetail(null);
    setDetailLoading(true);
    setValidation(null);
    api
      .getProfile(selectedName)
      .then((nextDetail) => {
        if (active) {
          setDetail(nextDetail);
          setEditorContent(useAppStore.getState().profileDrafts[selectedName] ?? nextDetail.content);
        }
      })
      .catch((error) => {
        if (active) {
          void message.error(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (active) {
          setDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedName]);

  const handleRefresh = async () => {
    await refreshProfiles();
    if (selectedName && !useAppStore.getState().profiles.some((profile) => profile.name === selectedName)) {
      setSelectedName(null);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!isValidProfileName(name)) {
      void message.warning("名称须以字母或数字开头，仅允许字母、数字、点、下划线、连字符，最多 128 字符。");
      return;
    }
    setMutating(true);
    try {
      await api.createProfile(name);
      void message.success(`Profile ${name} 已创建`);
      setCreateOpen(false);
      setNewName("");
      await refreshProfiles();
      setSelectedName(name);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setMutating(false);
    }
  };

  const handleDetect = async () => {
    const name = newName.trim();
    if (!isValidProfileName(name)) {
      void message.warning("请输入自动检测后保存的 profile 名称。");
      return;
    }
    setMutating(true);
    try {
      await api.detectProfile(name);
      void message.success(`Profile ${name} 已根据当前环境生成`);
      setDetectOpen(false);
      setNewName("");
      await refreshProfiles();
      setSelectedName(name);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setMutating(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget) {
      return;
    }
    const nextName = renameValue.trim();
    if (drafts[renameTarget.name] !== undefined) {
      void message.warning("请先保存或放弃该 Profile 的未保存修改。");
      return;
    }
    if (!isValidProfileName(nextName)) {
      void message.warning("请输入新的 profile 名称。");
      return;
    }

    setMutating(true);
    try {
      await api.renameProfile(renameTarget.name, nextName);
      void message.success("Profile 已重命名");
      setRenameTarget(null);
      setRenameValue("");
      await refreshProfiles();
      setSelectedName(nextName);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setMutating(false);
    }
  };

  const handleDelete = async (name: string) => {
    setMutating(true);
    try {
      await api.deleteProfile(name);
      setDraft(name, null);
      void message.success(`Profile ${name} 已删除`);
      if (selectedName === name) {
        setSelectedName(null);
      }
      await refreshProfiles();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setMutating(false);
    }
  };

  const handleStateChange = async (name: string, state: ProfileState) => {
    try {
      await api.setProfileState(name, state);
      void message.success(`Profile ${name} 已标记为${stateLabel(state)}`);
      await refreshProfiles();
      if (selectedRef.current === name) {
        setDetail((current) => current?.name === name ? { ...current, state } : current);
      }
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSave = async () => {
    if (!selectedName) {
      return;
    }
    setSaving(true);
    try {
      await api.saveProfile(selectedName, editorContent);
      setDraft(selectedName, null);
      if (selectedRef.current === selectedName) setDetail((current) => current ? { ...current, content: editorContent } : current);
      void message.success(`Profile ${selectedName} 已保存`);
      await refreshProfiles();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async (name = selectedName) => {
    if (!name) {
      return;
    }
    if (drafts[name] !== undefined) {
      void message.warning("请先保存修改，再校验磁盘中的 Profile。");
      return;
    }
    setValidation(null);
    try {
      const result = await api.validateProfile(name);
      if (selectedRef.current === name) setValidation(result);
      else void message[result.valid ? "success" : "error"](`${name}: ${result.message}`);
    } catch (error) {
      if (selectedRef.current === name) setValidation({
        valid: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const columns: ColumnsType<ProfileSummary> = [
    {
      title: "Profile",
      dataIndex: "name",
      key: "name",
      render: (name: string, record) => (
        <Space>
          <Text strong>{name}{drafts[name] !== undefined ? " *" : ""}</Text>
          {record.isDefault && <Tag color="gold">默认</Tag>}
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "state",
      key: "state",
      width: 280,
      render: (state: ProfileState, record) => (
        <span onClick={(event) => event.stopPropagation()}><Segmented
          size="small"
          value={state}
          options={stateOptions}
          onChange={(value) => void handleStateChange(record.name, value as ProfileState)}
        /></span>
      ),
    },
    {
      title: "大小",
      dataIndex: "sizeBytes",
      key: "sizeBytes",
      width: 100,
      render: (size: number) => formatBytes(size),
    },
    {
      title: "修改时间",
      dataIndex: "modifiedAt",
      key: "modifiedAt",
      width: 150,
      render: (value: string | null) => formatDate(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 190,
      render: (_, record) => (
        <Space size={0} onClick={(event) => event.stopPropagation()}>
          <Tooltip title="编辑"><Button
            type="text"
            icon={<EditOutlined />}
            aria-label={`编辑 ${record.name}`}
            onClick={() => setSelectedName(record.name)}
          /></Tooltip>
          <Tooltip title="校验已保存文件"><Button
            type="text"
            icon={<FileSearchOutlined />}
            aria-label={`校验 ${record.name}`}
            onClick={() => void handleValidate(record.name)}
          /></Tooltip>
          <Tooltip title="重命名"><Button
            type="text"
            icon={<FormOutlined />}
            aria-label={`重命名 ${record.name}`}
            onClick={() => {
              setRenameTarget(record);
              setRenameValue(record.name);
            }}
          /></Tooltip>
          <Popconfirm
            title="删除 Profile"
            description={`确认删除 ${record.name}？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => void handleDelete(record.name)}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label={`删除 ${record.name}`}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="page">
      <section className="page-toolbar">
        <Space wrap>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setCreateOpen(true);
              setNewName("");
            }}
          >
            新建 Profile
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            onClick={() => {
              setDetectOpen(true);
              setNewName("");
            }}
          >
            自动检测
          </Button>
          <Button
            icon={<ReloadOutlined />}
            loading={profilesLoading}
            onClick={() => void handleRefresh()}
          >
            刷新
          </Button>
        </Space>
        <Text type="secondary">生效、暂存、失效状态仅由本应用维护。</Text>
      </section>

      <Spin spinning={profilesLoading}>
        {profiles.length === 0 ? (
          <Empty description="本地还没有 Conan profile" />
        ) : (
          <div className="table-frame">
            <Table<ProfileSummary>
              rowKey="name"
              columns={columns}
              dataSource={profiles}
              pagination={false}
              size="middle"
              rowClassName={(record) =>
                record.name === selectedName ? "selected-table-row" : ""
              }
              onRow={(record) => ({
                onClick: () => setSelectedName(record.name),
                className: "clickable-row",
              })}
              scroll={{ x: 900 }}
            />
          </div>
        )}
      </Spin>

      <div className="profile-editor-section">
        <div className="editor-head">
          <div>
            <Title level={4}>{selectedName || "选择 Profile"}</Title>
            <Text type="secondary">
              {dirty ? "未保存" : detail ? "已保存" : ""}
            </Text>
          </div>
          <Space wrap>
            {dirty && <Button onClick={() => { if (detail) { setEditorContent(detail.content); setDraft(detail.name, null); } }}>放弃修改</Button>}
            {detail && (
              <Segmented
                size="small"
                value={detail.state}
                options={stateOptions}
                onChange={(value) => void handleStateChange(selectedName!, value as ProfileState)}
              />
            )}
            <Button
              icon={<FileSearchOutlined />}
              disabled={!detail || detailLoading || dirty || saving}
              onClick={() => void handleValidate()}
            >
              校验
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              disabled={!detail || detailLoading || !dirty}
              loading={saving}
              onClick={() => void handleSave()}
            >
              保存
            </Button>
          </Space>
        </div>

        {validation && (
          <Alert
            className="validation-alert"
            type={validation.valid ? "success" : "error"}
            showIcon
            message={validation.valid ? "Profile 有效" : "Profile 校验失败"}
            description={validation.message}
            closable
            onClose={() => setValidation(null)}
          />
        )}

        <Spin spinning={detailLoading}>
          <div className="editor-frame">
            {detail ? (
              <CodeMirror
                value={editorContent}
                height="360px"
                extensions={[StreamLanguage.define(properties)]}
                editable={!saving}
                onChange={(value) => { setEditorContent(value); setValidation(null); setDraft(detail.name, value === detail.content ? null : value); }}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  autocompletion: false,
                  highlightActiveLine: true,
                }}
              />
            ) : (
              <Empty description="暂无 profile 内容" />
            )}
          </div>
        </Spin>
      </div>

      <Modal
        title="新建 Profile"
        open={createOpen}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={mutating}
        okText="创建"
        cancelText="取消"
      >
        <Input
          autoFocus
          value={newName}
          placeholder="例如 release"
          onChange={(event) => setNewName(event.currentTarget.value)}
          onPressEnter={() => void handleCreate()}
        />
      </Modal>

      <Modal
        title="自动检测 Profile"
        open={detectOpen}
        onOk={() => void handleDetect()}
        onCancel={() => setDetectOpen(false)}
        confirmLoading={mutating}
        okText="检测并保存"
        cancelText="取消"
      >
        <Alert
          type="info"
          showIcon
          message="将使用 conan profile detect 根据当前系统与工具链生成 profile。"
        />
        <Input
          className="modal-input"
          value={newName}
          placeholder="例如 detected"
          onChange={(event) => setNewName(event.currentTarget.value)}
          onPressEnter={() => void handleDetect()}
        />
      </Modal>

      <Modal
        title="重命名 Profile"
        open={Boolean(renameTarget)}
        onOk={() => void handleRename()}
        onCancel={() => setRenameTarget(null)}
        confirmLoading={mutating}
        okText="重命名"
        cancelText="取消"
      >
        <Input
          value={renameValue}
          placeholder="新的 profile 名称"
          onChange={(event) => setRenameValue(event.currentTarget.value)}
          onPressEnter={() => void handleRename()}
        />
      </Modal>
    </div>
  );
}

function stateLabel(state: ProfileState): string {
  return stateOptions.find((item) => item.value === state)?.label || state;
}
