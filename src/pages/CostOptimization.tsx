import { useState, useEffect } from 'react';
import { Card, Table, Typography, Row, Col, Select, Spin, Statistic, Tag, Button, InputNumber, message, Descriptions } from 'antd';
import ReactECharts from 'echarts-for-react';
import { api } from '../api/client';

const { Title, Text } = Typography;

const FURNACE_GROUPS = ['一期', '二期', '小焦炉'];

export default function CostOptimization() {
  const [loading, setLoading] = useState(true);
  const [costData, setCostData] = useState<any>(null);
  const [furnaceGroup, setFurnaceGroup] = useState('一期');
  const [optimizing, setOptimizing] = useState(false);
  const [optResult, setOptResult] = useState<any>(null);
  const [sensitivity, setSensitivity] = useState<any[]>([]);
  const [holdingRate, setHoldingRate] = useState<number>(0.001);

  useEffect(() => {
    loadCost();
  }, []);

  const loadCost = async () => {
    setLoading(true);
    try {
      const data = await api.getComprehensiveCost();
      setCostData(data);
      setHoldingRate(data.daily_rate || 0.001);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      const result = await api.optimizeByCost({
        furnace_group: furnaceGroup,
        constraints: {
          ad: { max: 12.5 },
          s: { max: 0.7 },
          csr: { min: 62 },
          cri: { max: 26 },
        },
        reliability_threshold: 50,
      });
      setOptResult(result);

      // 计算敏感性分析
      if (result.best_coals && result.best_coals.length > 0) {
        try {
          const sensData = await api.calcSensitivity({
            coals: result.best_coals.map((c: any) => ({ ...c, coal_name: c.coal_name })),
            furnace_group: furnaceGroup,
          });
          setSensitivity(sensData);
        } catch {
          // 敏感性分析失败不影响主流程
        }
      }
    } catch (err: any) {
      message.error(err.message || '优化失败');
    }
    setOptimizing(false);
  };

  const handleUpdateRate = async () => {
    try {
      await api.updateHoldingCostParams({ daily_rate: holdingRate });
      message.success('持有费率已更新');
      loadCost();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  if (loading) return <Spin size="large" style={{ display: 'flex', margin: '100px auto' }} />;

  const costs = costData?.costs || [];

  const costColumns = [
    { title: '煤名', dataIndex: 'coal_name', key: 'coal_name', render: (t: string) => <Text style={{ color: '#e0e0e0' }}>{t}</Text> },
    { title: '采购价(元/吨)', dataIndex: 'purchase_price', key: 'purchase_price', render: (v: number) => <Text style={{ color: '#e0e0e0' }}>{v?.toLocaleString()}</Text> },
    { title: '持有成本(元/吨)', dataIndex: 'holding_cost', key: 'holding_cost', render: (v: number) => <Text style={{ color: '#fa8c16' }}>{v?.toFixed(2)}</Text> },
    {
      title: '综合成本(元/吨)',
      dataIndex: 'total_cost',
      key: 'total_cost',
      sorter: (a: any, b: any) => a.total_cost - b.total_cost,
      render: (v: number) => <Text style={{ color: '#fa8c16', fontWeight: 600 }}>{v?.toLocaleString()}</Text>,
    },
  ];

  // 成本对比柱状图
  const costChart = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['采购价', '持有成本'], textStyle: { color: '#999' } },
    grid: { left: 80, right: 20, top: 30, bottom: 40 },
    xAxis: { type: 'category' as const, data: costs.map((c: any) => c.coal_name), axisLabel: { color: '#999', rotate: 30 } },
    yAxis: { type: 'value' as const, axisLabel: { color: '#999' }, splitLine: { lineStyle: { color: '#303045' } } },
    series: [
      { name: '采购价', type: 'bar', stack: 'cost', data: costs.map((c: any) => c.purchase_price), itemStyle: { color: '#1890ff' } },
      { name: '持有成本', type: 'bar', stack: 'cost', data: costs.map((c: any) => c.holding_cost), itemStyle: { color: '#fa8c16' } },
    ],
  };

  // 龙卷风图
  const tornadoChart = sensitivity.length > 0 ? {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 100, right: 40, top: 20, bottom: 30 },
    xAxis: { type: 'value' as const, axisLabel: { color: '#999', formatter: '{value}元' }, splitLine: { lineStyle: { color: '#303045' } } },
    yAxis: {
      type: 'category' as const,
      data: sensitivity.map((s: any) => s.coal_name),
      axisLabel: { color: '#999' },
      inverse: true,
    },
    series: [
      {
        name: '成本+20%',
        type: 'bar',
        data: sensitivity.map((s: any) => s.change_plus20?.change || 0),
        itemStyle: { color: '#ff4d4f' },
        label: { show: true, position: 'right' as const, color: '#ff4d4f', formatter: (p: any) => `+${p.value.toFixed(0)}` },
      },
      {
        name: '成本-20%',
        type: 'bar',
        data: sensitivity.map((s: any) => -(Math.abs(s.change_minus20?.change || 0))),
        itemStyle: { color: '#52c41a' },
        label: { show: true, position: 'left' as const, color: '#52c41a', formatter: (p: any) => `${p.value.toFixed(0)}` },
      },
    ],
  } : {};

  return (
    <div>
      <Title level={4} style={{ color: '#fa8c16', marginBottom: 16 }}>成本优化</Title>

      <Card title={<span style={{ color: '#fa8c16' }}>持有成本参数</span>} style={{ background: '#1a1a2e', border: '1px solid #303045', marginBottom: 16 }}
        headStyle={{ borderBottom: '1px solid #303045' }}>
        <Row gutter={16} align="middle">
          <Col>
            <Text style={{ color: '#999' }}>日持有费率：</Text>
            <InputNumber value={holdingRate} onChange={(v) => setHoldingRate(v || 0.001)} step={0.0001} min={0} max={0.01} precision={4}
              style={{ background: '#0f0f23', borderColor: '#303045', color: '#e0e0e0' }} />
          </Col>
          <Col>
            <Button type="primary" onClick={handleUpdateRate} style={{ background: '#fa8c16', borderColor: '#fa8c16' }}>保存</Button>
          </Col>
          <Col>
            <Text style={{ color: '#666' }}>说明：单位成本 = 采购价 + 采购价 x 持有天数 x 日持有费率</Text>
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card title={<span style={{ color: '#fa8c16' }}>各煤种综合成本</span>} style={{ background: '#1a1a2e', border: '1px solid #303045' }}
            headStyle={{ borderBottom: '1px solid #303045' }}>
            <Table columns={costColumns} dataSource={costs} rowKey="coal_name" pagination={false} size="small" />
          </Card>
        </Col>
        <Col span={10}>
          <Card title={<span style={{ color: '#fa8c16' }}>成本构成</span>} style={{ background: '#1a1a2e', border: '1px solid #303045' }}
            headStyle={{ borderBottom: '1px solid #303045' }}>
            <ReactECharts option={costChart} style={{ height: 280 }} />
          </Card>
        </Col>
      </Row>

      <Card title={<span style={{ color: '#fa8c16' }}>成本最优配比推荐</span>}
        extra={
          <Row gutter={8}>
            <Col>
              <Select value={furnaceGroup} onChange={setFurnaceGroup} style={{ width: 120 }}
                options={FURNACE_GROUPS.map(g => ({ label: g, value: g }))} />
            </Col>
            <Col>
              <Button type="primary" onClick={handleOptimize} loading={optimizing}
                style={{ background: '#fa8c16', borderColor: '#fa8c16' }}>
                开始优化
              </Button>
            </Col>
          </Row>
        }
        style={{ background: '#1a1a2e', border: '1px solid #303045', marginBottom: 16 }}
        headStyle={{ borderBottom: '1px solid #303045' }}>
        {optResult ? (
          <div>
            {optResult.best_coals && optResult.best_coals.length > 0 ? (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={6}>
                    <Statistic title={<span style={{ color: '#999' }}>当前成本(元/吨)</span>} value={optResult.current_cost} valueStyle={{ color: '#e0e0e0' }} />
                  </Col>
                  <Col span={6}>
                    <Statistic title={<span style={{ color: '#999' }}>优化成本(元/吨)</span>} value={optResult.best_cost} valueStyle={{ color: '#52c41a' }} />
                  </Col>
                  <Col span={6}>
                    <Statistic title={<span style={{ color: '#999' }}>节省金额</span>} value={optResult.saving} valueStyle={{ color: '#52c41a' }} precision={2} />
                  </Col>
                  <Col span={6}>
                    <Statistic title={<span style={{ color: '#999' }}>节省比例</span>} value={optResult.saving_percent} valueStyle={{ color: '#52c41a' }} suffix="%" />
                  </Col>
                </Row>
                <Table
                  size="small"
                  pagination={false}
                  dataSource={optResult.best_coals.map((c: any) => ({ ...c, key: c.coal_name }))}
                  columns={[
                    { title: '煤名', dataIndex: 'coal_name', render: (t: string) => <Text style={{ color: '#e0e0e0' }}>{t}</Text> },
                    { title: '配比(%)', dataIndex: 'ratio', render: (v: number) => <Tag color="orange">{v}%</Tag> },
                    { title: 'Ad', dataIndex: 'ad', render: (v: number) => <Text style={{ color: '#999' }}>{v}</Text> },
                    { title: 'V', dataIndex: 'v', render: (v: number) => <Text style={{ color: '#999' }}>{v}</Text> },
                    { title: 'S', dataIndex: 's', render: (v: number) => <Text style={{ color: '#999' }}>{v}</Text> },
                    { title: 'CSR', dataIndex: 'csr', render: (v: number) => <Text style={{ color: '#999' }}>{v}</Text> },
                    { title: 'CRI', dataIndex: 'cri', render: (v: number) => <Text style={{ color: '#999' }}>{v}</Text> },
                  ]}
                />
              </>
            ) : (
              <Text style={{ color: '#ff4d4f' }}>{optResult.message}</Text>
            )}
          </div>
        ) : (
          <Text style={{ color: '#666' }}>选择炉组后点击"开始优化"，系统将在满足质量约束下搜索成本最低的配比方案</Text>
        )}
      </Card>

      {sensitivity.length > 0 && (
        <Card title={<span style={{ color: '#fa8c16' }}>成本敏感性分析（龙卷风图）</span>} style={{ background: '#1a1a2e', border: '1px solid #303045' }}
          headStyle={{ borderBottom: '1px solid #303045' }}>
          <Row gutter={16}>
            <Col span={14}>
              <ReactECharts option={tornadoChart} style={{ height: 300 }} />
            </Col>
            <Col span={10}>
              <Table
                size="small"
                pagination={false}
                dataSource={sensitivity.map((s: any) => ({ ...s, key: s.coal_name }))}
                columns={[
                  { title: '煤名', dataIndex: 'coal_name', render: (t: string) => <Text style={{ color: '#e0e0e0' }}>{t}</Text> },
                  { title: '基准成本', dataIndex: 'base_cost', render: (v: number) => <Text style={{ color: '#e0e0e0' }}>{v?.toFixed(0)}</Text> },
                  { title: '+20%影响', key: 'plus20', render: (_: any, r: any) => <Text style={{ color: '#ff4d4f' }}>+{r.change_plus20?.change?.toFixed(0) || 0}</Text> },
                  { title: '-20%影响', key: 'minus20', render: (_: any, r: any) => <Text style={{ color: '#52c41a' }}>{r.change_minus20?.change?.toFixed(0) || 0}</Text> },
                  { title: '影响度', dataIndex: 'impact_score', render: (v: number) => <Tag color={v > 50 ? 'red' : v > 20 ? 'gold' : 'green'}>{v?.toFixed(0)}</Tag> },
                ]}
              />
            </Col>
          </Row>
        </Card>
      )}
    </div>
  );
}
