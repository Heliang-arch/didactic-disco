import { useState, useEffect } from 'react';
import { Card, Table, Tag, Typography, Row, Col, Statistic, Alert, Spin, Progress } from 'antd';
import { WarningOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { api } from '../api/client';

const { Title, Text } = Typography;

export default function InventoryBoard() {
  const [loading, setLoading] = useState(true);
  const [boardData, setBoardData] = useState<any>(null);
  const [alerts, setAlerts] = useState<any>(null);
  const [depletion, setDepletion] = useState<any[]>([]);
  const [structureTrend, setStructureTrend] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [board, alertData, deplData, trendData] = await Promise.all([
        api.getInventoryBoard(),
        api.getInventoryAlerts(),
        api.getInventoryDepletion(),
        api.getInventoryStructureTrend(),
      ]);
      setBoardData(board);
      setAlerts(alertData);
      setDepletion(deplData);
      setStructureTrend(trendData);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  if (loading) return <Spin size="large" style={{ display: 'flex', margin: '100px auto' }} />;

  const summary = boardData?.summary || {};
  const items = boardData?.items || [];
  const suggestions = alerts?.suggestions || [];

  const columns = [
    {
      title: '煤名',
      dataIndex: 'coal_name',
      key: 'coal_name',
      render: (text: string, record: any) => (
        <span>
          <Text style={{ color: '#e0e0e0' }}>{text}</Text>
          {record.is_low && <WarningOutlined style={{ color: '#ff4d4f', marginLeft: 6 }} />}
        </span>
      ),
    },
    { title: '煤种', dataIndex: 'kind_name', key: 'kind_name', render: (t: string) => <Text style={{ color: '#999' }}>{t}</Text> },
    {
      title: '初始库存(吨)',
      dataIndex: 'initial_qty',
      key: 'initial_qty',
      render: (v: number) => <Text style={{ color: '#e0e0e0' }}>{v?.toLocaleString()}</Text>,
    },
    {
      title: '累计消耗(吨)',
      dataIndex: 'total_shipped',
      key: 'total_shipped',
      render: (v: number) => <Text style={{ color: '#fa8c16' }}>{v?.toLocaleString()}</Text>,
    },
    {
      title: '当前库存(吨)',
      dataIndex: 'current_stock',
      key: 'current_stock',
      render: (v: number, record: any) => (
        <Text style={{ color: record.is_low ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
          {v?.toLocaleString()}
        </Text>
      ),
    },
    {
      title: '安全阈值(吨)',
      dataIndex: 'safety_threshold',
      key: 'safety_threshold',
      render: (v: number) => <Text style={{ color: '#999' }}>{v?.toLocaleString()}</Text>,
    },
    {
      title: '库存/阈值',
      dataIndex: 'urgency',
      key: 'urgency',
      render: (v: number, record: any) => {
        if (record.safety_threshold === 0) return <Text style={{ color: '#999' }}>-</Text>;
        const percent = Math.min(v * 100, 200);
        const color = v < 0.5 ? '#ff4d4f' : v < 1 ? '#faad14' : '#52c41a';
        return (
          <span>
            <Progress percent={Math.round(percent)} size="small" strokeColor={color} style={{ width: 80, display: 'inline-flex' }} />
          </span>
        );
      },
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: any) => record.is_low
        ? <Tag color="red">低库存</Tag>
        : <Tag color="green">正常</Tag>,
    },
  ];

  const depletionColumns = [
    { title: '煤名', dataIndex: 'coal_name', key: 'coal_name', render: (t: string) => <Text style={{ color: '#e0e0e0' }}>{t}</Text> },
    { title: '当前库存(吨)', dataIndex: 'current_stock', key: 'current_stock', render: (v: number) => <Text style={{ color: '#e0e0e0' }}>{v?.toLocaleString()}</Text> },
    { title: '日均消耗(吨)', dataIndex: 'daily_consumption', key: 'daily_consumption', render: (v: number) => <Text style={{ color: '#fa8c16' }}>{v?.toLocaleString()}</Text> },
    {
      title: '预计耗尽天数',
      dataIndex: 'days_to_deplete',
      key: 'days_to_deplete',
      render: (v: number) => v === -1
        ? <Tag color="green">充足</Tag>
        : <Text style={{ color: v <= 7 ? '#ff4d4f' : v <= 14 ? '#faad14' : '#52c41a', fontWeight: 600 }}>{v} 天</Text>,
    },
    {
      title: '风险等级',
      dataIndex: 'risk_level',
      key: 'risk_level',
      render: (v: string) => {
        const colorMap: Record<string, string> = { '高风险': 'red', '中风险': 'orange', '低风险': 'green', '安全': 'blue' };
        return <Tag color={colorMap[v] || 'default'}>{v}</Tag>;
      },
    },
  ];

  // 库存结构趋势图
  const coalNames = items.map((i: any) => i.coal_name);
  const structureChart = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: coalNames, textStyle: { color: '#999' }, top: 0 },
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category' as const, data: structureTrend.map((t: any) => t.date), axisLabel: { color: '#999' } },
    yAxis: { type: 'value' as const, axisLabel: { color: '#999' }, splitLine: { lineStyle: { color: '#303045' } } },
    series: coalNames.map((name: string, idx: number) => ({
      name,
      type: 'line',
      stack: 'total',
      areaStyle: { opacity: 0.3 },
      data: structureTrend.map((t: any) => t.items[name] || 0),
      itemStyle: { color: ['#fa8c16', '#1890ff', '#52c41a', '#722ed1', '#eb2f96', '#13c2c2'][idx % 6] },
    })),
  };

  return (
    <div>
      <Title level={4} style={{ color: '#fa8c16', marginBottom: 16 }}>库存看板</Title>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card style={{ background: '#1a1a2e', border: '1px solid #303045' }}>
            <Statistic title={<span style={{ color: '#999' }}>总库存(吨)</span>} value={summary.total_stock || 0} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: '#1a1a2e', border: '1px solid #303045' }}>
            <Statistic title={<span style={{ color: '#999' }}>预警煤种</span>} value={summary.low_stock_count || 0} valueStyle={{ color: '#ff4d4f' }} prefix={<WarningOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: '#1a1a2e', border: '1px solid #303045' }}>
            <Statistic title={<span style={{ color: '#999' }}>今日消耗(吨)</span>} value={summary.today_consumption || 0} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: '#1a1a2e', border: '1px solid #303045' }}>
            <Statistic title={<span style={{ color: '#999' }}>安全煤种</span>} value={summary.safe_stock_count || 0} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      {suggestions.length > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
          style={{ marginBottom: 16, background: '#1a1a2e', border: '1px solid #303045' }}
          message={<span style={{ color: '#faad14' }}>补货建议</span>}
          description={
            <div>
              {suggestions.map((s: any, i: number) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  <Tag color={s.urgency_level === '紧急' ? 'red' : s.urgency_level === '较急' ? 'orange' : 'gold'}>{s.urgency_level}</Tag>
                  <Text style={{ color: '#e0e0e0' }}>{s.coal_name}</Text>
                  <Text style={{ color: '#999', marginLeft: 8 }}>当前 {s.current_stock}吨 / 阈值 {s.safety_threshold}吨</Text>
                  <Text style={{ color: '#fa8c16', marginLeft: 8 }}>建议补货 {s.suggested_qty}吨</Text>
                </div>
              ))}
            </div>
          }
        />
      )}

      <Card title={<span style={{ color: '#fa8c16' }}>实时库存水位</span>} style={{ background: '#1a1a2e', border: '1px solid #303045', marginBottom: 16 }}
        headStyle={{ borderBottom: '1px solid #303045' }}>
        <Table columns={columns} dataSource={items} rowKey="coal_name" pagination={false} size="small" />
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title={<span style={{ color: '#fa8c16' }}>库存耗尽预测</span>} style={{ background: '#1a1a2e', border: '1px solid #303045' }}
            headStyle={{ borderBottom: '1px solid #303045' }}>
            <Table columns={depletionColumns} dataSource={depletion} rowKey="coal_name" pagination={false} size="small" />
          </Card>
        </Col>
        <Col span={12}>
          <Card title={<span style={{ color: '#fa8c16' }}>库存结构变化趋势</span>} style={{ background: '#1a1a2e', border: '1px solid #303045' }}
            headStyle={{ borderBottom: '1px solid #303045' }}>
            <ReactECharts option={structureChart} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
