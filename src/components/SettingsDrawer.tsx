import { FolderOpenOutlined, SaveOutlined } from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { Alert, Button, Form, Input, Space, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AppSettings } from "../lib/types";

const { Text } = Typography;

interface SettingsDrawerProps {
  onSaved: () => void;
}

export default function SettingsDrawer({ onSaved }: SettingsDrawerProps) {
  const [form] = Form.useForm<AppSettings>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getAppSettings()
      .then((settings) => {
        if (active) {
          form.setFieldsValue(settings);
        }
      })
      .catch((error) => { void message.error(String(error)); })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [form]);

  const pickConanExecutable = async () => {
    if (!api.isTauriRuntime()) {
      void message.info("浏览器演示模式：请直接输入 Conan 可执行文件路径。");
      return;
    }

    const selected = await open({
      multiple: false,
      directory: false,
      title: "选择 Conan 可执行文件",
    });
    if (typeof selected === "string") {
      form.setFieldValue("conanExecutable", selected);
    }
  };

  const pickDefaultProjectDir = async () => {
    if (!api.isTauriRuntime()) {
      void message.info("浏览器演示模式：请直接输入默认项目目录。");
      return;
    }

    const selected = await open({
      multiple: false,
      directory: true,
      title: "选择默认项目目录",
    });
    if (typeof selected === "string") {
      form.setFieldValue("defaultProjectDir", selected);
    }
  };

  const submit = async (values: AppSettings) => {
    setSaving(true);
    try {
      await api.saveAppSettings(values);
      void message.success("设置已保存");
      onSaved();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form<AppSettings>
      form={form}
      layout="vertical"
      onFinish={submit}
      disabled={loading}
    >
      <Alert
        type="info"
        showIcon
        message="Conan 可执行文件用于所有命令行操作。"
      />
      <Form.Item
        name="conanExecutable"
        label="Conan 可执行文件"
        extra="留空时自动从 PATH 查找。"
      >
        <Input
          placeholder="/opt/homebrew/bin/conan"
          suffix={
            <Button
              type="text"
              size="small"
              icon={<FolderOpenOutlined />}
              aria-label="选择 Conan 可执行文件"
              onClick={pickConanExecutable}
            />
          }
        />
      </Form.Item>

      <Form.Item
        name="defaultProjectDir"
        label="默认项目目录"
        extra="新建项目时优先打开此目录。"
      >
        <Input
          placeholder="/path/to/workspace"
          suffix={
            <Button
              type="text"
              size="small"
              icon={<FolderOpenOutlined />}
              aria-label="选择默认项目目录"
              onClick={pickDefaultProjectDir}
            />
          }
        />
      </Form.Item>

      <div className="settings-actions">
        <Space>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saving}
          >
            保存设置
          </Button>
          <Text type="secondary">修改后需重新检测 Conan 环境。</Text>
        </Space>
      </div>
    </Form>
  );
}
