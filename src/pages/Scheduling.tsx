import { useState, useEffect } from 'react';
import { Card, Table, Button, DatePicker, Select, Space, Tag, Descriptions, Alert, Row, Col, Statistic, Spin, message, Typography, Progress } from 'antd';
import { PlayCircleOutlined, CheckCircleOutlined, WarningOutlined, DollarOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { schedulingApi } from '../api/client';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

interface ScheduleItem {
  date: string;
  formula: Record<string, number>;
  total_cost: number;
  conversion_cost: number;
  is_converted: boolean;
  conversion_similarity: number;
  inventory_risk: Record<string, string>;
  quality_prediction: Record<string, number>;
  meets_contract: boolean;
}

interface ScheduleResult {
  schedule: ScheduleItem[];
  total_cost: number;
  total_conversion_cost: number;
  total_conversion_count: number;
  avg_similarity: number;
  inventory_risk_summary: Record<string, number>;
  quality_summary: Record<string, number>;
  all_meet_contract: boolean;
  optimization_time_ms: number;
}

export default function Scheduling() {
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs(),
    dayjs().add(6, 'day'),
  ]);
  const [furnaceGroup, setFurnaceGroup] = useState('一期');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const handleOptimize = async () => {
    setLoading(true);
    try {
      const res = await schedulingApi.run({
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        furnaceGroup,
      });
      if (res.success) {
        setResult(res.data);
        message.success('排程优化完成');
      } else {
        message.error(res.error || '优化失败');
      }
    } catch (err) {
      message.error('优化请求失败');
    }
    setLoading(false);
  };

  const selectedDay = result?.schedule.find(s => s.date === selectedDate);

  const costChartOption = result ? {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['总成本', '转换代价'], textStyle: { color: '#e0e0e0' } },
    xAxis: {
      type: 'category',
      data: result.schedule.map(s => s.date.slice(5)),
      axisLabel: { color: '#999' },
    },
    yAxis: { type: 'value', axisLabel: { color: '#999' }, splitLine: { lineStyle: { color: '#303045' } } },
    series: [
      {
        name: '总成本',
        type: 'bar',
        data: result.schedule.map(s => Math.round(s.total_cost)),
        itemStyle: { color: '#fa8c16' },
      },
      {
        name: '转换代价',
        type: 'bar',
        data: result.schedule.map(s => Math.round(s.conversion_cost)),
        itemStyle: { color: '#ff4d4f' },
      },
    ],
  } : {};

  const formulaChartOption = selectedDay ? {
    tooltip: { trigger: 'item' as const },
    legend: { type: 'scroll' as const, textStyle: { color: '#e0e0e0' } },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      data: Object.entries(selectedDay.formula)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: k, value: v })),
      label: { color: '#e0e0e0', formatter: '{b}: {c}%' },
    }],
  } : {};

  return (
    <div>
      <Card style={{ background: '#1a1a2e', border: '1px solid #303045', marginBottom: 16 }}>
        <Title level={5} style={{ color: '#fa8c16', margin: 0 }}>多周期排程优化</Title>
        <Space style={{ marginTop: 16 }} wrap>
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) setDateRange([dates[0], dates[1]]);
            }}
            style={{ background: '#0f0f23', borderColor: '#303045' }}
          />
          <Select
            value={furnaceGroup}
            onChange={setFurnaceGroup}
            style={{ width: 120 }}
            options={[
              { value: '一期', label: '一期' },
              { value: '二期', label: '二期' },
              { value: '小焦炉', label: '小焦炉' },
            ]}
          />
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleOptimize} loading={loading}>
            执行排程优化
          </Button>
        </Space>
      </Card>

      {result && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card style={{ background: '#1a1a2e', border: '1px solid #303045' }}>
                <Statistic title="总成本(元)" value={result.total_cost} precision={0} valueStyle={{ color: '#fa8c16' }} prefix={<DollarOutlined />} />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={{ background: '#1a1a2e', border: '1px solid #303045' }}>
                <Statistic title="转换总代价" value={result.total_conversion_cost} precision={0} valueStyle={{ color: result.total_conversion_cost > 10000 ? '#ff4d4f' : '#52c41a' }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={{ background: '#1a1a2e', border: '1px solid #303045' }}>
                <Statistic title="配方转换次数" value={result.total_conversion_count} valueStyle={{ color: '#fa8c16' }} suffix={`/ ${result.schedule.length} 天`} />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={{ background: '#1a1a2e', border: '1px solid #303045' }}>
                <Statistic title="质量达标" value={result.all_meet_contract ? '是' : '否'} valueStyle={{ color: result.all_meet_contract ? '#52c41a' : '#ff4d4f' }} prefix={result.all_meet_contract ? <CheckCircleOutlined /> : <WarningOutlined />} />
              </Card>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card title="每日成本趋势" style={{ background: '#1a1a2e', border: '1px solid #303045' }}
                headStyle={{ color: '#fa8c16', borderColor: '#303045' }} bodyStyle={{ color: '#e0e0e0' }}>
                <ReactECharts option={costChartOption} style={{ height: 300 }} />
              </Card>
            </Col>
            <Col span={12}>
              <Card title={selectedDate ? `${selectedDate} 配方` : '点击日期查看配方'} style={{ background: '#1a1a2e', border: '1px solid #303045' }}
                headStyle={{ color: '#fa8c16', borderColor: '#303045' }} bodyStyle={{ color: '#e0e0e0' }}>
                {selectedDay ? (
                  <ReactECharts option={formulaChartOption} style={{ height: 300 }} />
                ) : (
                  <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>请在下方表格中点击日期查看配方详情</div>
                )}
              </Card>
            </Col>
          </Row>

          <Card title="排程明细" style={{ background: '#1a1a2e', border: '1px solid #303045' }}
            headStyle={{ color: '#fa8c16', borderColor: '#303045' }} bodyStyle={{ color: '#e0e0e0' }}>
            <Table
              dataSource={result.schedule}
              rowKey="date"
              pagination={false}
              size="small"
              onRow={(record) => ({
                onClick: () => setSelectedDate(record.date),
                style: { cursor: 'pointer', background: selectedDate === record.date ? '#16213e' : undefined },
              })}
              columns={[
                { title: '日期', dataIndex: 'date', width: 110, render: (v: string) => <Text style={{ color: '#fa8c16' }}>{v}</Text> },
                {
                  title: '主要煤种(%)', dataIndex: 'formula', width: 300,
                  render: (f: Record<string, number>) => (
                    <Space wrap size={2}>
                      {Object.entries(f).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => (
                        <Tag key={k} color="blue" style={{ margin: 0 }}>{k}:{v}%</Tag>
                      ))}
                    </Space>
                  ),
                },
                { title: '总成本', dataIndex: 'total_cost', width: 100, render: (v: number) => <Text style={{ color: '#fa8c16' }}>{Math.round(v)}</Text> },
                {
                  title: '转换', dataIndex: 'is_converted', width: 80,
                  render: (v: boolean, r: ScheduleItem) => v ? <Tag color="red">转换({(r.conversion_similarity * 100).toFixed(0)}%)</Tag> : <Tag color="green">连续</Tag>,
                },
                {
                  title: '质量达标', dataIndex: 'meets_contract', width: 80,
                  render: (v: boolean) => v ? <Tag color="green">达标</Tag> : <Tag color="red">不达标</Tag>,
                },
                {
                  title: '库存风险', dataIndex: 'inventory_risk', width: 200,
                  render: (r: Record<string, string>) => (
                    <Space wrap size={2}>
                      {Object.entries(r).filter(([, v]) => v !== 'NORMAL').map(([k, v]) => (
                        <Tag key={k} color={v === 'CRITICAL' ? 'red' : 'orange'} style={{ margin: 0 }}>{k}:{v}</Tag>
                      ))}
                      {Object.values(r).every(v => v === 'NORMAL') && <Text style={{ color: '#52c41a', fontSize: 12 }}>正常</Text>}
                    </Space>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}
