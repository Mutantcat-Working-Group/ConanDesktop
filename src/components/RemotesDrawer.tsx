import { ApiOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, LoginOutlined, LogoutOutlined, FormOutlined } from "@ant-design/icons";
import { Alert, Button, Drawer, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tag, Tooltip, message } from "antd";
import { useState } from "react";
import { api } from "../lib/api";
import { useAppStore } from "../lib/store";
import { isValidRemoteName, isValidRemoteUrl } from "../lib/validation";
import type { RemoteConnection, RemoteSummary } from "../lib/types";

const connectionLabels: Record<RemoteConnection["kind"], string> = {
  ok: "查询正常", disabled: "仓库已禁用", authentication: "需要认证", permission: "访问被拒绝",
  tls: "证书校验失败", endpoint: "请检查 Conan API 地址", network: "网络连接失败", unknown: "检测失败",
};

export default function RemotesDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { remotes, remotesLoading, refreshRemotes } = useAppStore();
  const [editing, setEditing] = useState<RemoteSummary | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loginTarget, setLoginTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [connection, setConnection] = useState<(RemoteConnection & { name: string }) | null>(null);
  const locked = busy || checking !== null;
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [form] = Form.useForm<{ name: string; url: string; verifySsl: boolean }>();
  const [login] = Form.useForm<{ username: string; password: string }>();

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setConnection(null);
    try { await action(); await refreshRemotes(); message.success("仓库配置已更新"); }
    catch (error) { message.error(String(error)); }
    finally { setBusy(false); }
  }

  async function check(name: string) {
    setChecking(name);
    setConnection(null);
    try { setConnection({ ...await api.checkRemote(name), name }); }
    catch (error) { setConnection({ name, success: false, kind: "unknown", message: String(error) }); }
    finally { setChecking(null); }
  }

  async function save() {
    try {
      const values = await form.validateFields();
      await mutate(async () => {
        if (editing) await api.updateRemote(editing.name, values.url, values.verifySsl);
        else await api.addRemote(values.name, values.url, values.verifySsl);
        setEditorOpen(false);
      });
    } catch { /* Form displays field validation errors. */ }
  }

  return <>
    <Drawer title="远程仓库" open={open} onClose={onClose} size={1080} extra={<Space>
      <Tooltip title="刷新仓库"><Button icon={<ReloadOutlined />} aria-label="刷新仓库" disabled={locked} loading={remotesLoading} onClick={() => { setConnection(null); void refreshRemotes(); }} /></Tooltip>
      <Button type="primary" icon={<PlusOutlined />} disabled={locked} onClick={() => { setEditing(null); form.resetFields(); setEditorOpen(true); }}>添加仓库</Button>
    </Space>}>
      {connection && <Alert style={{ marginBottom: 16 }} showIcon type={connection.success ? "success" : "error"} title={`${connection.name} · ${connectionLabels[connection.kind]}`} description={<div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{connection.message}</div>} />}
      <Table rowKey="name" size="small" dataSource={remotes} loading={busy || remotesLoading} pagination={false} scroll={{ x: 950 }} columns={[
        { title: "名称", dataIndex: "name", width: 150 },
        { title: "地址", dataIndex: "url", render: (url: string) => <span className="mono-text" style={{ overflowWrap: "anywhere" }}>{url}</span> },
        { title: "本地凭据", width: 150, render: (_, item) => <div><Tag color={item.authenticated ? "green" : "default"}>{item.authenticated == null ? "未知" : item.authenticated ? "已缓存" : "未缓存"}</Tag>{item.username && <div style={{ overflowWrap: "anywhere" }}>{item.username}</div>}</div> },
        { title: "启用", width: 70, render: (_, item) => <Switch size="small" checked={item.enabled} disabled={locked} onChange={(enabled) => void mutate(() => api.setRemoteEnabled(item.name, enabled))} /> },
        { title: "TLS", width: 80, render: (_, item) => item.verifySsl ? "校验" : <Tag color="warning">不校验</Tag> },
        { title: "操作", width: 210, render: (_, item) => <Space size={0}>
          <Tooltip title="检测连接"><Button type="text" icon={<ApiOutlined />} loading={checking === item.name} disabled={locked || !item.enabled} aria-label={`检测连接 ${item.name}`} onClick={() => void check(item.name)} /></Tooltip>
          <Tooltip title="编辑仓库"><Button disabled={locked} type="text" icon={<EditOutlined />} aria-label={`编辑仓库 ${item.name}`} onClick={() => { setEditing(item); form.setFieldsValue(item); setEditorOpen(true); }} /></Tooltip>
          <Tooltip title="登录"><Button disabled={locked} type="text" icon={<LoginOutlined />} aria-label={`登录 ${item.name}`} onClick={() => { login.resetFields(); login.setFieldsValue({ username: item.username || "" }); setLoginTarget(item.name); }} /></Tooltip>
          <Tooltip title="重命名"><Button disabled={locked} type="text" icon={<FormOutlined />} aria-label={`重命名仓库 ${item.name}`} onClick={() => { setRenameTarget(item.name); setNewName(item.name); }} /></Tooltip>
          <Popconfirm disabled={locked} title={`退出 ${item.name} 登录？`} onConfirm={() => mutate(() => api.logoutRemote(item.name))}><Button disabled={locked} type="text" icon={<LogoutOutlined />} aria-label={`退出 ${item.name}`} /></Popconfirm>
          <Popconfirm disabled={locked} title={`移除仓库 ${item.name}？`} onConfirm={() => mutate(() => api.removeRemote(item.name))}><Button disabled={locked} danger type="text" icon={<DeleteOutlined />} aria-label={`移除 ${item.name}`} /></Popconfirm>
        </Space> },
      ]} />
    </Drawer>
    <Modal title="重命名仓库" open={Boolean(renameTarget)} confirmLoading={busy} okText="重命名" cancelText="取消" onCancel={() => setRenameTarget(null)} onOk={() => {
      if (!isValidRemoteName(newName.trim())) { void message.warning("仓库名称无效"); return; }
      void mutate(async () => { await api.renameRemote(renameTarget!, newName.trim()); setRenameTarget(null); });
    }}><Input value={newName} onChange={(event) => setNewName(event.target.value)} aria-label="新仓库名称" /></Modal>
    <Modal title={editing ? "编辑仓库" : "添加仓库"} open={editorOpen} onCancel={() => setEditorOpen(false)} onOk={() => void save()} confirmLoading={busy} okText="保存" cancelText="取消">
      <Form form={form} layout="vertical" initialValues={{ verifySsl: true }}>
        <Form.Item name="name" label="名称" rules={[{ validator: (_, value) => isValidRemoteName(value || "") ? Promise.resolve() : Promise.reject(new Error("名称只能包含字母、数字、点、下划线和连字符")) }]}><Input disabled={Boolean(editing)} /></Form.Item>
        <Form.Item name="url" label="仓库地址" rules={[{ validator: (_, value) => isValidRemoteUrl(value || "") ? Promise.resolve() : Promise.reject(new Error("请输入 HTTP(S) 或 file 地址，不可包含账号、密码、查询参数或片段")) }]}><Input placeholder="https://repo.example.com/artifactory/api/conan/team" /></Form.Item>
        <Form.Item name="verifySsl" label="校验 TLS 证书" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item noStyle shouldUpdate={(previous, current) => previous.verifySsl !== current.verifySsl}>{({ getFieldValue }) => getFieldValue("verifySsl") === false ? <Alert type="warning" showIcon title="证书校验已关闭，存在连接被冒充的风险。" /> : null}</Form.Item>
      </Form>
    </Modal>
    <Modal title={`登录 ${loginTarget || ""}`} open={Boolean(loginTarget)} onCancel={() => { setLoginTarget(null); login.resetFields(); }} confirmLoading={busy} okText="登录" cancelText="取消" onOk={async () => {
      try { const values = await login.validateFields(); await mutate(async () => { await api.loginRemote(loginTarget!, values.username, values.password); login.resetFields(); setLoginTarget(null); }); } catch { /* Field errors remain visible. */ }
    }}>
      <Form form={login} layout="vertical">
        <Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input autoComplete="username" /></Form.Item>
        <Form.Item name="password" label="密码 / Token" rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item>
      </Form>
    </Modal>
  </>;
}
