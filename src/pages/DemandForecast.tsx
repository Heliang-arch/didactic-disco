import { useState, useEffect } from 'react';
import { Card, Table, Typography, Row, Col, Select, Spin, Tag } from 'antd';
import ReactECharts from 'echarts-for-react';
import { api } from '../api/client';

const { Title, Text } = Typography;

export default function DemandForecast() {
  const [loading, setLoading] = useState(true);
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [selectedCoal, setSelectedCoal] = useState<string>('');
  const [singleForecast, setSingleForecast] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedCoal) loadSingleForecast(selectedCoal);
  }, [selectedCoal]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fc, sm] = await Promise.all([
        api.getDemandForecast(),
        api.getDemandForecastSummary(),
      ]);
      setForecasts(fc);
      setSummary(sm);
      if (fc.length > 0 && !selectedCoal) setSelectedCoal(fc[0].coal_name);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const loadSingleForecast = async (coalName: string) => {
    try {
      const data = await api.getDemandForecastByCoal(coalName);
      setSingleForecast(data);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <Spin size="large" style={{ display: 'flex', margin: '100px auto' }} />;

  // 所有煤种预测趋势图
  const allForecastChart = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: forecasts.map((f: any) => f.coal_name), textStyle: { color: '#999' }, top: 0 },
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: forecasts[0]?.predictions.map((p: any) => p.date) || [],
      axisLabel: { color: '#999' },
    },
    yAxis: { type: 'value' as const, axisLabel: { color: '#999' }, splitLine: { lineStyle: { color: '#303045' } } },
    series: forecasts.map((f: any, idx: number) => ({
      name: f.coal_name,
      type: 'line',
      data: f.predictions.map((p: any) => p.predicted),
      itemStyle: { color: ['#fa8c16', '#1890ff', '#52c41a', '#722ed1', '#eb2f96', '#13c2c2'][idx % 6] },
      smooth: true,
    })),
  };

  // 单个煤种预测（含置信区间）
  const singleChart = singleForecast ? {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['预测值', '95%置信上限', '95%置信下限'], textStyle: { color: '#999' } },
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: singleForecast.predictions.map((p: any) => p.date),
      axisLabel: { color: '#999' },
    },
    yAxis: { type: 'value' as const, axisLabel: { color: '#999' }, splitLine: { lineStyle: { color: '#303045' } } },
    series: [
      {
        name: '95%置信上限',
        type: 'line',
        data: singleForecast.predictions.map((p: any) => p.upper),
        lineStyle: { opacity: 0 },
        stack: 'confidence',
        symbol: 'none',
        itemStyle: { color: 'rgba(250, 140, 22, 0.2)' },
      },
      {
        name: '95%置信下限',
        type: 'line',
        data: singleForecast.predictions.map((p: any) => p.lower),
        lineStyle: { opacity: 0 },
        stack: 'confidence',
        symbol: 'none',
        areaStyle: { color: 'rgba(250, 140, 22, 0.2)' },
        itemStyle: { color: 'rgba(250, 140, 22, 0.2)' },
      },
      {
        name: '预测值',
        type: 'line',
        data: singleForecast.predictions.map((p: any) => p.predicted),
        lineStyle: { color: '#fa8c16', width: 3 },
        itemStyle: { color: '#fa8c16' },
        symbol: 'circle',
        symbolSize: 8,
      },
    ],
  } : {};

  const summaryColumns = [
    { title: '煤名', dataIndex: 'coal_name', key: 'coal_name', render: (t: string) => <Text style={{ color: '#e0e0e0' }}>{t}</Text> },
    { title: '当前库存(吨)', dataIndex: 'current_stock', key: 'current_stock', render: (v: number) => <Text style={{ color: '#e0e0e0' }}>{v?.toLocaleString()}</Text> },
    { title: '日均需求(吨)', dataIndex: 'avg_daily_demand', key: 'avg_daily_demand', render: (v: number) => <Text style={{ color: '#fa8c16' }}>{v?.toLocaleString()}</Text> },
    { title: '7天总需求(吨)', dataIndex: 'total_7day_demand', key: 'total_7day_demand', render: (v: number) => <Text style={{ color: '#1890ff' }}>{v?.toLocaleString()}</Text> },
    {
      title: '7天后库存',
      dataIndex: 'stock_after_7days',
      key: 'stock_after_7days',
      render: (v: number) => <Text style={{ color: v <= 0 ? '#ff4d4f' : v < 1000 ? '#faad14' : '#52c41a', fontWeight: 600 }}>{v?.toLocaleString()}</Text>,
    },
    {
      title: '预测精度',
      dataIndex: 'mape',
      key: 'mape',
      render: (v: number) => {
        const accuracy = Math.max(0, 100 - v);
        return <Tag color={accuracy >= 80 ? 'green' : accuracy >= 60 ? 'gold' : 'red'}>{accuracy.toFixed(0)}%</Tag>;
      },
    },
    {
      title: '库存状态',
      key: 'status',
      render: (_: any, record: any) => {
        if (record.stock_after_7days <= 0) return <Tag color="red">将耗尽</Tag>;
        if (record.stock_after_7days < 1000) return <Tag color="orange">偏低</Tag>;
        return <Tag color="green">充足</Tag>;
      },
    },
  ];

  // 预测明细表
  const detailColumns = singleForecast ? [
    { title: '日期', dataIndex: 'date', key: 'date', render: (t: string) => <Text style={{ color: '#e0e0e0' }}>{t}</Text> },
    { title: '预测发运量(吨)', dataIndex: 'predicted', key: 'predicted', render: (v: number) => <Text style={{ color: '#fa8c16', fontWeight: 600 }}>{v?.toLocaleString()}</Text> },
    { title: '置信下限', dataIndex: 'lower', key: 'lower', render: (v: number) => <Text style={{ color: '#999' }}>{v?.toLocaleString()}</Text> },
    { title: '置信上限', dataIndex: 'upper', key: 'upper', render: (v: number) => <Text style={{ color: '#999' }}>{v?.toLocaleString()}</Text> },
    {
      title: '置信区间宽度',
      key: 'range',
      render: (_: any, record: any) => <Text style={{ color: '#666' }}>{(record.upper - record.lower).toLocaleString()}</Text>,
    },
  ] : [];

  return (
    <div>
      <Title level={4} style={{ color: '#fa8c16', marginBottom: 16 }}>需求预测</Title>

      <Card title={<span style={{ color: '#fa8c16' }}>未来7天分煤种发运量预测</span>} style={{ background: '#1a1a2e', border: '1px solid #303045', marginBottom: 16 }}
        headStyle={{ borderBottom: '1px solid #303045' }}>
        <ReactECharts option={allForecastChart} style={{ height: 300 }} />
      </Card>

      <Card title={<span style={{ color: '#fa8c16' }}>库存与需求汇总</span>} style={{ background: '#1a1a2e', border: '1px solid #303045', marginBottom: 16 }}
        headStyle={{ borderBottom: '1px solid #303045' }}>
        <Table columns={summaryColumns} dataSource={summary} rowKey="coal_name" pagination={false} size="small" />
      </Card>

      <Row gutter={16}>
        <Col span={14}>
          <Card
            title={<span style={{ color: '#fa8c16' }}>单煤种预测趋势（含置信区间）</span>}
            extra={
              <Select value={selectedCoal} onChange={setSelectedCoal} style={{ width: 150 }}
                options={forecasts.map((f: any) => ({ label: f.coal_name, value: f.coal_name }))} />
            }
            style={{ background: '#1a1a2e', border: '1px solid #303045' }}
            headStyle={{ borderBottom: '1px solid #303045' }}>
            {singleForecast && (
              <>
                <ReactECharts option={singleChart} style={{ height: 280 }} />
                <div style={{ marginTop: 8, textAlign: 'center' }}>
                  <Text style={{ color: '#666' }}>
                    预测精度(MAPE): {singleForecast.mape?.toFixed(1)}% |
                    模型: 指数平滑 + 移动平均组合
                  </Text>
                </div>
              </>
            )}
          </Card>
        </Col>
        <Col span={10}>
          <Card title={<span style={{ color: '#fa8c16' }}>预测明细</span>} style={{ background: '#1a1a2e', border: '1px solid #303045' }}
            headStyle={{ borderBottom: '1px solid #303045' }}>
            {singleForecast && (
              <Table columns={detailColumns} dataSource={singleForecast.predictions.map((p: any, i: number) => ({ ...p, key: i }))}
                pagination={false} size="small" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
