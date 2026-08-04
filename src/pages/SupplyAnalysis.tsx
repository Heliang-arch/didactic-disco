import { useState, useEffect } from 'react';
import { Card, Table, Tag, Typography, Row, Col, Select, Spin, Descriptions } from 'antd';
import ReactECharts from 'echarts-for-react';
import { api } from '../api/client';

const { Title, Text } = Typography;

export default function SupplyAnalysis() {
  const [loading, setLoading] = useState(true);
  const [reliability, setReliability] = useState<any[]>([]);
  const [selectedCoal, setSelectedCoal] = useState<string>('');
  const [trendData, setTrendData] = useState<any>(null);

  useEffect(() => {
    loadReliability();
  }, []);

  useEffect(() => {
    if (selectedCoal) loadTrend(selectedCoal);
  }, [selectedCoal]);

  const loadReliability = async () => {
    setLoading(true);
    try {
      const data = await api.getSupplyReliability();
      setReliability(data);
      if (data.length > 0 && !selectedCoal) setSelectedCoal(data[0].coal_name);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const loadTrend = async (coalName: string) => {
    try {
      const data = await api.getSupplyTrend(coalName);
      setTrendData(data);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <Spin size="large" style={{ display: 'flex', margin: '100px auto' }} />;

  const columns = [
    {
      title: '煤名',
      dataIndex: 'coal_name',
      key: 'coal_name',
      render: (t: string) => <Text style={{ color: '#e0e0e0' }}>{t}</Text>,
    },
    {
      title: '可靠性评分',
      dataIndex: 'score',
      key: 'score',
      sorter: (a: any, b: any) => a.score - b.score,
      render: (v: number) => {
        const color = v >= 80 ? '#52c41a' : v >= 60 ? '#faad14' : '#ff4d4f';
        return <Text style={{ color, fontWeight: 700, fontSize: 16 }}>{v}</Text>;
      },
    },
    {
      title: '等级',
      dataIndex: 'level',
      key: 'level',
      render: (v: string) => {
        const colorMap: Record<string, string> = { '可靠': 'green', '一般': 'gold', '不稳定': 'red' };
        return <Tag color={colorMap[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: '发运频率',
      dataIndex: 'frequency',
      key: 'frequency',
      render: (v: number) => <Text style={{ color: v < 0.5 ? '#ff4d4f' : '#e0e0e0' }}>{(v * 100).toFixed(0)}%</Text>,
    },
    {
      title: '波动系数CV',
      dataIndex: 'cv',
      key: 'cv',
      render: (v: number) => <Text style={{ color: v > 0.5 ? '#ff4d4f' : '#e0e0e0' }}>{v.toFixed(2)}</Text>,
    },
    {
      title: '平均间隔(天)',
      dataIndex: 'avgInterval',
      key: 'avgInterval',
      render: (v: number) => <Text style={{ color: '#e0e0e0' }}>{v.toFixed(1)}</Text>,
    },
    {
      title: '趋势',
      dataIndex: 'trendSlope',
      key: 'trendSlope',
      render: (v: number) => (
        <Text style={{ color: v > 0 ? '#52c41a' : v < 0 ? '#ff4d4f' : '#999' }}>
          {v > 0 ? '+' : ''}{v.toFixed(1)}
        </Text>
      ),
    },
    {
      title: '工作日/周末',
      key: 'weekday_weekend',
      render: (_: any, record: any) => (
        <Text style={{ color: '#999' }}>
          {record.weekdayAvg} / {record.weekendAvg}
        </Text>
      ),
    },
    {
      title: '不稳定标记',
      dataIndex: 'isUnstable',
      key: 'isUnstable',
      render: (v: boolean) => v ? <Tag color="red">不稳定</Tag> : <Tag color="green">稳定</Tag>,
    },
  ];

  // 发运趋势图
  const trendChart = trendData ? {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['日发运量', '7天移动平均', '趋势线'], textStyle: { color: '#999' } },
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category' as const, data: trendData.daily.map((d: any) => d.date), axisLabel: { color: '#999', rotate: 45 } },
    yAxis: { type: 'value' as const, axisLabel: { color: '#999' }, splitLine: { lineStyle: { color: '#303045' } } },
    series: [
      {
        name: '日发运量',
        type: 'bar',
        data: trendData.daily.map((d: any) => d.quantity),
        itemStyle: { color: 'rgba(250, 140, 22, 0.6)' },
      },
      {
        name: '7天移动平均',
        type: 'line',
        data: trendData.moving_avg.map((d: any) => d.value),
        lineStyle: { color: '#1890ff', width: 2 },
        itemStyle: { color: '#1890ff' },
        smooth: true,
      },
      {
        name: '趋势线',
        type: 'line',
        data: trendData.trend_line.map((d: any) => d.value),
        lineStyle: { color: '#ff4d4f', type: 'dashed' as const, width: 2 },
        itemStyle: { color: '#ff4d4f' },
      },
    ],
  } : {};

  // 评分分布图
  const scoreChart = {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 60, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category' as const, data: reliability.map(r => r.coal_name), axisLabel: { color: '#999', rotate: 30 } },
    yAxis: { type: 'value' as const, max: 100, axisLabel: { color: '#999' }, splitLine: { lineStyle: { color: '#303045' } } },
    series: [{
      type: 'bar',
      data: reliability.map(r => ({
        value: r.score,
        itemStyle: { color: r.score >= 80 ? '#52c41a' : r.score >= 60 ? '#faad14' : '#ff4d4f' },
      })),
      barWidth: '40%',
    }],
    visualMap: {
      show: false,
      pieces: [
        { gte: 80, color: '#52c41a' },
        { gte: 60, lt: 80, color: '#faad14' },
        { lt: 60, color: '#ff4d4f' },
      ],
    },
  };

  return (
    <div>
      <Title level={4} style={{ color: '#fa8c16', marginBottom: 16 }}>供应可靠性分析</Title>

      <Card title={<span style={{ color: '#fa8c16' }}>煤种可靠性评分</span>} style={{ background: '#1a1a2e', border: '1px solid #303045', marginBottom: 16 }}
        headStyle={{ borderBottom: '1px solid #303045' }}>
        <Table columns={columns} dataSource={reliability} rowKey="coal_name" pagination={false} size="small" />
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title={<span style={{ color: '#fa8c16' }}>评分分布</span>} style={{ background: '#1a1a2e', border: '1px solid #303045' }}
            headStyle={{ borderBottom: '1px solid #303045' }}>
            <ReactECharts option={scoreChart} style={{ height: 250 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title={<span style={{ color: '#fa8c16' }}>发运趋势</span>}
            extra={
              <Select value={selectedCoal} onChange={setSelectedCoal} style={{ width: 150 }}
                options={reliability.map(r => ({ label: r.coal_name, value: r.coal_name }))} />
            }
            style={{ background: '#1a1a2e', border: '1px solid #303045' }}
            headStyle={{ borderBottom: '1px solid #303045' }}>
            {trendData && (
              <>
                <ReactECharts option={trendChart} style={{ height: 200 }} />
                <Descriptions size="small" column={3} style={{ marginTop: 8 }}>
                  <Descriptions.Item label={<span style={{ color: '#999' }}>趋势斜率</span>}>
                    <Text style={{ color: trendData.trend_slope > 0 ? '#52c41a' : '#ff4d4f' }}>
                      {trendData.trend_slope > 0 ? '+' : ''}{trendData.trend_slope}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={<span style={{ color: '#999' }}>工作日均量</span>}>
                    <Text style={{ color: '#e0e0e0' }}>{trendData.weekday_avg}吨</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={<span style={{ color: '#999' }}>周末均量</span>}>
                    <Text style={{ color: '#e0e0e0' }}>{trendData.weekend_avg}吨</Text>
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
