import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Typography, Alert, Spin } from 'antd';
import {
  FileTextOutlined, WarningOutlined, ApartmentOutlined,
  RiseOutlined, FallOutlined,
} from '@ant-design/icons';
import ReactEChartsCore from 'echarts-for-react';
import { api } from '../api/client';

const { Text } = Typography;

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboard().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'flex', justifyContent: 'center', marginTop: 100 }} />;
  if (!data) return null;

  const lowStockColumns = [
    { title: '煤名', dataIndex: 'coal_name', key: 'coal_name' },
    { title: '库存量(吨)', dataIndex: 'stock', key: 'stock', render: (v: number) => <Text style={{ color: '#ff4d4f' }}>{v.toFixed(0)}</Text> },
    { title: '煤种', dataIndex: 'kind_name', key: 'kind_name', render: (v: string) => v || '-' },
  ];

  // 质量趋势图
  const qualityChartOption = () => {
    const trends = data.qualityTrends || [];
    const dates = [...new Set(trends.map((t: any) => t.date))] as string[];
    const groups = [...new Set(trends.map((t: any) => t.furnace_group))] as string[];

    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: { data: groups.map(g => `${g}-M40`), textStyle: { color: '#999' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: dates, axisLabel: { color: '#999' } },
      yAxis: { type: 'value', axisLabel: { color: '#999' } },
      series: groups.map((g, i) => ({
        name: `${g}-M40`,
        type: 'line',
        data: dates.map(d => {
          const item = trends.find((t: any) => t.date === d && t.furnace_group === g);
          return item?.m40 ?? null;
        }),
        smooth: true,
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 6,
      })),
    };
  };

  // 煤种分布图
  const kindChartOption = () => {
    const stats = data.coalKindStats || [];
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}: {c}种 ({d}%)' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '50%'],
        data: stats.map((s: any) => ({ name: s.name, value: s.coal_count })),
        label: { color: '#ccc', formatter: '{b}' },
        itemStyle: { borderRadius: 4 },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
      }],
    };
  };

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
            <Statistic
              title={<Text style={{ color: '#999' }}>今日配比方案</Text>}
              value={data.todayPlanCount}
              prefix={<FileTextOutlined style={{ color: '#fa8c16' }} />}
              styles={{ content: { color: '#fa8c16' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
            <Statistic
              title={<Text style={{ color: '#999' }}>煤种分类</Text>}
              value={data.coalKindStats?.length || 0}
              prefix={<ApartmentOutlined style={{ color: '#52c41a' }} />}
              styles={{ content: { color: '#52c41a' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
            <Statistic
              title={<Text style={{ color: '#999' }}>库存预警</Text>}
              value={data.lowStock?.length || 0}
              prefix={<WarningOutlined style={{ color: '#ff4d4f' }} />}
              styles={{ content: { color: '#ff4d4f' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
            <Statistic
              title={<Text style={{ color: '#999' }}>最新方案</Text>}
              value={data.latestPlan?.plan_name || '无'}
              styles={{ content: { color: '#1890ff', fontSize: 14 } }}
            />
          </Card>
        </Col>
      </Row>

      {data.lowStock?.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`库存预警：${data.lowStock.length}种煤库存低于安全阈值（100吨）`}
          style={{ marginTop: 16, background: '#2a1f1f', border: '1px solid #5a3a3a' }}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={16}>
          <Card title={<Text style={{ color: '#fa8c16' }}>近期M40质量趋势</Text>} style={{ background: '#1a1a2e' }}>
            <ReactEChartsCore option={qualityChartOption()} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title={<Text style={{ color: '#fa8c16' }}>煤种分布</Text>} style={{ background: '#1a1a2e' }}>
            <ReactEChartsCore option={kindChartOption()} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title={<Text style={{ color: '#fa8c16' }}>库存预警列表</Text>} style={{ background: '#1a1a2e' }}>
            <Table
              dataSource={data.lowStock}
              columns={lowStockColumns}
              rowKey="id"
              size="small"
              pagination={false}
              style={{ background: 'transparent' }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title={<Text style={{ color: '#fa8c16' }}>最近配比方案</Text>} style={{ background: '#1a1a2e' }}>
            <Table
              dataSource={data.recentPlans}
              columns={[
                { title: '日期', dataIndex: 'date', key: 'date' },
                { title: '方案名称', dataIndex: 'plan_name', key: 'plan_name' },
                { title: '炉组', dataIndex: 'furnace_group', key: 'furnace_group' },
                { title: '配比合计', dataIndex: 'total_ratio', key: 'total_ratio', render: (v: number) => `${v?.toFixed(1) || 0}%` },
                { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => v === 'completed' ? '已保存' : v === 'predicted' ? '已预测' : '草稿' },
              ]}
              rowKey="id"
              size="small"
              pagination={false}
              style={{ background: 'transparent' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}