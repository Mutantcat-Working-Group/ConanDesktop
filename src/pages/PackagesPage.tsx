import {
  CloudServerOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Input,
  List,
  Select,
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
import RemotesDrawer from "../components/RemotesDrawer";
import { formatDate } from "../lib/format";
import {
  extractPackageInfos,
  parsePackageDetails,
  parsePackageSearch,
} from "../lib/packageParsing";
import { useAppStore } from "../lib/store";
import type { PackageDetail, PackageRow } from "../lib/types";

const { Text, Title } = Typography;

export default function PackagesPage() {
  const remotes = useAppStore((state) => state.remotes);
  const remotesLoading = useAppStore((state) => state.remotesLoading);
  const refreshRemotes = useAppStore((state) => state.refreshRemotes);
  const [pattern, setPattern] = useState("fmt/*");
  const [remotesOpen, setRemotesOpen] = useState(false);
  const [remote, setRemote] = useState("conancenter");
  const [rows, setRows] = useState<PackageRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [rawDetail, setRawDetail] = useState<unknown>(null);
  const searchRequest = useRef(0);
  const detailRequest = useRef(0);
  useEffect(() => () => { searchRequest.current += 1; detailRequest.current += 1; }, []);

  useEffect(() => {
    if (!remotes.some((item) => item.name === remote && item.enabled)) {
      setRemote(remotes.find((item) => item.enabled)?.name || "");
    }
  }, [remote, remotes]);

  const runSearch = async (nextPattern = pattern) => {
    const trimmed = nextPattern.trim();
    if (!trimmed) {
      void message.warning("请输入包名或通配符。");
      return;
    }
    if (!remote) {
      void message.warning("请选择远程仓库。");
      return;
    }

    const request = ++searchRequest.current;
    setSearching(true);
    try {
      const value = await api.searchPackages(trimmed, remote);
      if (request !== searchRequest.current) return;
      const parsed = parsePackageSearch(value, remote);
      setRows(parsed);
      if (parsed.length === 0) {
        void message.info(`在 ${remote} 中没有匹配的包。`);
      }
    } catch (error) {
      if (request !== searchRequest.current) return;
      setRows([]);
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
  };

  const openDetail = async (record: PackageRow) => {
    const request = ++detailRequest.current;
    setDetail({ reference: record.reference, remote: record.remote, revisions: [] });
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setRawDetail(null);

    try {
      const value = await api.getPackageDetails(record.reference, record.remote);
      if (request !== detailRequest.current) return;
      const parsed = parsePackageDetails(value);
      if (!parsed) {
        setDetailError("无法解析该包的版本与二进制包信息。");
        return;
      }
      setDetail(parsed);
      setRawDetail(value);
    } catch (error) {
      if (request !== detailRequest.current) return;
      setDetailError(error instanceof Error ? error.message : String(error));
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  };

  const columns: ColumnsType<PackageRow> = [
    {
      title: "包引用",
      dataIndex: "reference",
      key: "reference",
      render: (reference: string) => (
        <Text strong className="mono-text">
          {reference}
        </Text>
      ),
    },
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      width: 180,
      render: (name: string) => <Text>{name}</Text>,
    },
    {
      title: "版本",
      dataIndex: "version",
      key: "version",
      width: 160,
      render: (version: string) => <Tag color="blue">{version}</Tag>,
    },
    {
      title: "远程仓库",
      dataIndex: "remote",
      key: "remote",
      width: 180,
      render: (name: string) => (
        <Space size={4}>
          <CloudServerOutlined />
          <Text>{name}</Text>
        </Space>
      ),
    },
  ];

  return (
    <div className="page">
      <section className="page-toolbar">
        <Button icon={<CloudServerOutlined />} onClick={() => setRemotesOpen(true)}>远程仓库</Button>
        <div className="search-controls">
          <Input.Search
            className="package-search"
            value={pattern}
            placeholder="包名、版本或通配符，例如 fmt/*"
            enterButton={
              <Button type="primary" icon={<SearchOutlined />}>
                查库
              </Button>
            }
            allowClear
            loading={searching}
            onChange={(event) => setPattern(event.currentTarget.value)}
            onSearch={(value) => void runSearch(value)}
          />
          <Select
            className="remote-select"
            value={remote || undefined}
            placeholder="选择远程仓库"
            loading={remotesLoading}
            options={remotes.map((item) => ({
              label: item.name,
              value: item.name,
              disabled: !item.enabled,
            }))}
            onChange={(value) => { searchRequest.current += 1; setSearching(false); setRows([]); setRemote(value); }}
          />
          <TooltipButton
            title="刷新远程仓库"
            loading={remotesLoading}
            onClick={() => void refreshRemotes()}
          />
        </div>
        <Text type="secondary">
          当前显示 {rows.length} 个包引用
        </Text>
      </section>

      {remotes.length === 0 && !remotesLoading ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="尚未检测到 Conan 远程仓库"
        />
      ) : (
        <Spin spinning={searching || remotesLoading}>
          <div className="table-frame">
            <Table<PackageRow>
              rowKey={(record) => `${record.remote}:${record.reference}`}
              columns={columns}
              dataSource={rows}
              pagination={{ pageSize: 50, hideOnSinglePage: true }}
              size="middle"
              scroll={{ x: 680 }}
              onRow={(record) => ({
                onClick: () => void openDetail(record),
                className: "clickable-row",
              })}
              locale={{
                emptyText: searching
                  ? "正在搜索..."
                  : "输入包名后点击查库",
              }}
            />
          </div>
        </Spin>
      )}

      <Drawer
        title={
          <Space>
            <Text strong>{detail?.reference || "包详情"}</Text>
            <Tag color="blue">{detail?.remote}</Tag>
          </Space>
        }
        width={680}
        open={detailOpen}
        onClose={() => { detailRequest.current += 1; setDetailOpen(false); }}
      >
        <PackageDetailContent
          detail={detail}
          loading={detailLoading}
          error={detailError}
          rawValue={rawDetail}
        />
      </Drawer>
      <RemotesDrawer open={remotesOpen} onClose={() => setRemotesOpen(false)} />
    </div>
  );
}

function TooltipButton({
  title,
  loading,
  onClick,
}: {
  title: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip title={title}><Button
      icon={<ReloadOutlined />}
      aria-label={title}
      loading={loading}
      onClick={onClick}
    /></Tooltip>
  );
}

function PackageDetailContent({
  detail,
  loading,
  error,
  rawValue,
}: {
  detail: PackageDetail | null;
  loading: boolean;
  error: string | null;
  rawValue: unknown;
}) {
  if (loading) {
    return (
      <div className="detail-loading">
        <Spin tip="正在读取版本与二进制包..." />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" showIcon message="包详情读取失败" description={error} />;
  }

  if (!detail) {
    return <Empty description="暂无包详情" />;
  }

  const infos = extractPackageInfos(rawValue);

  return (
    <div className="package-detail">
      <Descriptions
        size="small"
        column={2}
        items={[
          {
            key: "reference",
            label: "包引用",
            children: <Text className="mono-text">{detail.reference}</Text>,
          },
          {
            key: "remote",
            label: "远程仓库",
            children: detail.remote,
          },
          {
            key: "revisionCount",
            label: "配方修订数量",
            children: detail.revisions.length,
          },
          {
            key: "binaryCount",
            label: "二进制包数量",
            children: infos.length,
          },
        ]}
      />

      <div className="subsection-title">
        <Title level={5}>版本记录</Title>
      </div>

      <div className="table-frame">
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          columns={[
            {
              title: "Revision",
              dataIndex: "id",
              key: "id",
              render: (id: string) => <Text className="mono-text">{id}</Text>,
            },
            {
              title: "时间",
              dataIndex: "timestamp",
              key: "timestamp",
              width: 160,
              render: (value: string | null) => formatDate(value),
            },
            {
              title: "二进制包",
              dataIndex: "packageCount",
              key: "packageCount",
              width: 120,
              render: (count: number) => <Tag color="geekblue">{count}</Tag>,
            },
          ]}
          dataSource={detail.revisions}
          locale={{ emptyText: "该引用没有版本信息" }}
        />
      </div>

      {infos.length > 0 && (
        <>
          <div className="subsection-title">
            <Title level={5}>二进制包信息</Title>
          </div>
          <List dataSource={infos} pagination={{ pageSize: 12, hideOnSinglePage: true }} renderItem={(info) => (
            <List.Item>
              <div className="package-info-item" key={`${info.revisionId}-${info.packageId}`}>
                <div className="package-info-head">
                  <Text strong copyable className="mono-text">{info.packageId}</Text>
                  <Tooltip title={info.revisionId}><Text type="secondary">{info.revisionId.slice(0, 12)}</Text></Tooltip>
                </div>
                <div className="package-info-tags">
                  {info.settings.map((item) => (
                    <Tag key={item.key}>
                      {item.key}={item.value}
                    </Tag>
                  ))}
                  {info.options.map((item) => (
                    <Tag key={item.key} color="cyan">
                      {item.key}={item.value}
                    </Tag>
                  ))}
                </div>
              </div>
            </List.Item>
          )} />
        </>
      )}
    </div>
  );
}
