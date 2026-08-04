import { useEffect, useState } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  Space, Typography, message, Tabs, Descriptions, Divider, Alert, Collapse, Tag,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ThunderboltOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../api/client';

const { Text, Title } = Typography;

// 默认煤指标值
const defaultCoalIndices = {
  ad: 10, v: 28, s: 0.7, g: 75, y: 15, x: 30, b: 15, r: 55, m: 80, cri: 26, csr: 62,
  financial_price: 0, arrival_price: 0,
};

export default function Blending() {
  const [plans, setPlans] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [planModal, setPlanModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [details, setDetails] = useState<any[]>([]);
  const [coalToKinds, setCoalToKinds] = useState<any[]>([]);
  const [predictionResult, setPredictionResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optResult, setOptResult] = useState<any>(null);
  const [optModal, setOptModal] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);

  const loadPlans = () => {
    api.getYcpbList(page, 20).then((res) => {
      setPlans(res.list);
      setTotal(res.total);
    });
  };

  useEffect(() => {
    loadPlans();
    api.getCoalToKinds().then(setCoalToKinds);
    api.getContracts().then(setContracts);
  }, [page]);

  const openCreate = () => {
    setEditing(null);
    setPredictionResult(null);
    setDetails([{ bin_no: 1, ratio: 0, ...defaultCoalIndices }]);
    form.resetFields();
    form.setFieldsValue({ date: dayjs(), furnace_group: '一期' });
    setPlanModal(true);
  };

  const openEdit = async (id: number) => {
    const data = await api.getYcpb(id);
    setEditing(data);
    setPredictionResult(data.predicted_json ? JSON.parse(data.predicted_json) : null);
    form.setFieldsValue({ ...data, date: dayjs(data.date) });
    setDetails(data.details || []);
    setPlanModal(true);
  };

  const addDetail = () => {
    setDetails([...details, { bin_no: details.length + 1, ratio: 0, ...defaultCoalIndices }]);
  };

  const updateDetail = (index: number, key: string, value: any) => {
    const newDetails = [...details];
    newDetails[index] = { ...newDetails[index], [key]: value };
    // 自动带出煤种
    if (key === 'coal_name') {
      const mapping = coalToKinds.find(c => c.coal_name === value);
      if (mapping) {
        newDetails[index].kind_code = mapping.kind_code;
      }
    }
    setDetails(newDetails);
  };

  const removeDetail = (index: number) => {
    if (details.length <= 1) return;
    setDetails(details.filter((_, i) => i !== index));
  };

  const totalRatio = details.reduce((s, d) => s + (d.ratio || 0), 0);
  const isValidRatio = Math.abs(totalRatio - 100) < 0.01;

  // 预测
  const handlePredict = async () => {
    const values = await form.validateFields();
    const coals = details.map(d => ({
      ad: d.ad || 0, v: d.v || 0, s: d.s || 0, g: d.g || 0, y: d.y || 0,
      x: d.x || 0, b: d.b || 0, r: d.r || 0, m: d.m || 0, cri: d.cri || 0, csr: d.csr || 0,
      financial_price: d.financial_price || 0, arrival_price: d.arrival_price || 0,
      ratio: d.ratio || 0,
    }));

    setPredicting(true);
    try {
      const result = await api.predict({
        coals,
        furnace_group: values.furnace_group,
        ycpb_id: editing?.id,
      });
      setPredictionResult(result);
      message.success('预测完成');
    } catch (err: any) {
      message.error(err.message);
    }
    setPredicting(false);
  };

  // 保存
  const handleSave = async () => {
    const values = await form.validateFields();
    if (!isValidRatio) {
      message.error('配比合计必须等于100%');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date: values.date.format('YYYY-MM-DD'),
        furnace_group: values.furnace_group,
        plan_name: values.plan_name,
        details: details.map(d => ({ ...d, ratio: d.ratio || 0 })),
      };

      if (editing) {
        await api.updateYcpb(editing.id, payload);
        message.success('更新成功');
      } else {
        await api.createYcpb(payload);
        message.success('创建成功');
      }
      setPlanModal(false);
      loadPlans();
    } catch (err: any) {
      message.error(err.message);
    }
    setSaving(false);
  };

  // 配比优化
  const handleOptimize = async () => {
    const values = await form.validateFields();
    if (details.length < 2) {
      message.error('至少需要2种煤参与优化');
      return;
    }

    setOptimizing(true);
    try {
      // 获取合同约束
      const today = values.date.format('YYYY-MM-DD');
      const contract = contracts.find(c => c.date === today && c.furnace_group === values.furnace_group);

      const constraints: Record<string, { min?: number; max?: number }> = {};
      if (contract) {
        if (contract.m40) constraints.m40 = { min: contract.m40 };
        if (contract.m25) constraints.m25 = { min: contract.m25 };
        if (contract.m10) constraints.m10 = { max: contract.m10 };
        if (contract.csr) constraints.csr = { min: contract.csr };
        if (contract.cri) constraints.cri = { max: contract.cri };
        if (contract.ad) constraints.ad = { max: contract.ad };
        if (contract.s) constraints.s = { max: contract.s };
      }

      const coals = details.map(d => ({
        ad: d.ad || 0, v: d.v || 0, s: d.s || 0, g: d.g || 0, y: d.y || 0,
        x: d.x || 0, b: d.b || 0, r: d.r || 0, m: d.m || 0, cri: d.cri || 0, csr: d.csr || 0,
        financial_price: d.financial_price || 0, arrival_price: d.arrival_price || 0,
        ratio: d.ratio || 0,
      }));

      const result = await api.optimize({ coals, furnace_group: values.furnace_group, constraints });
      setOptResult(result);
      setOptModal(true);

      if (result.best) {
        // 更新配比
        const newDetails = result.coals.map((c: any, i: number) => ({
          ...details[i],
          ratio: c.ratio,
        }));
        setDetails(newDetails);
        setPredictionResult(result.best);
        message.success(result.message);
      } else {
        message.warning(result.message);
      }
    } catch (err: any) {
      message.error(err.message);
    }
    setOptimizing(false);
  };

  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    { title: '方案名称', dataIndex: 'plan_name', key: 'plan_name' },
    { title: '炉组', dataIndex: 'furnace_group', key: 'furnace_group', width: 80 },
    { title: '配比合计', dataIndex: 'total_ratio', key: 'total_ratio', width: 100, render: (v: number) => `${v?.toFixed(1) || 0}%` },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (v: string) => {
      const map: Record<string, { color: string; text: string }> = {
        draft: { color: 'default', text: '草稿' },
        predicted: { color: 'processing', text: '已预测' },
        completed: { color: 'success', text: '已保存' },
      };
      return <Tag color={map[v]?.color}>{map[v]?.text || v}</Tag>;
    }},
    {
      title: '操作', key: 'action', width: 150,
      render: (_: any, r: any) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r.id)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => {
            Modal.confirm({ title: '确认删除', content: `删除方案"${r.plan_name}"？`, onOk: () => api.deleteYcpb(r.id).then(loadPlans) });
          }}>删除</Button>
        </Space>
      ),
    },
  ];

  const detailColumns = [
    { title: '仓号', dataIndex: 'bin_no', key: 'bin_no', width: 60 },
    {
      title: '煤名', key: 'coal_name', width: 130,
      render: (_: any, __: any, i: number) => (
        <Select
          showSearch
          value={details[i]?.coal_name}
          onChange={(v) => updateDetail(i, 'coal_name', v)}
          style={{ width: 120 }}
          placeholder="选煤名"
          options={coalToKinds.map(c => ({ label: c.coal_name, value: c.coal_name }))}
        />
      ),
    },
    {
      title: '煤种', key: 'kind_code', width: 80,
      render: (_: any, __: any, i: number) => <Text>{details[i]?.kind_code || '-'}</Text>,
    },
    {
      title: '配比%', key: 'ratio', width: 80,
      render: (_: any, __: any, i: number) => (
        <InputNumber
          value={details[i]?.ratio}
          onChange={(v) => updateDetail(i, 'ratio', v || 0)}
          min={0} max={100} step={1}
          style={{ width: 70 }}
          addonAfter="%"
        />
      ),
    },
    { title: 'Ad', key: 'ad', width: 60, render: (_: any, __: any, i: number) => <InputNumber value={details[i]?.ad} onChange={(v) => updateDetail(i, 'ad', v)} size="small" style={{ width: 55 }} step={0.1} /> },
    { title: 'V', key: 'v', width: 55, render: (_: any, __: any, i: number) => <InputNumber value={details[i]?.v} onChange={(v) => updateDetail(i, 'v', v)} size="small" style={{ width: 55 }} step={0.1} /> },
    { title: 'S', key: 's', width: 50, render: (_: any, __: any, i: number) => <InputNumber value={details[i]?.s} onChange={(v) => updateDetail(i, 's', v)} size="small" style={{ width: 50 }} step={0.01} /> },
    { title: 'G', key: 'g', width: 50, render: (_: any, __: any, i: number) => <InputNumber value={details[i]?.g} onChange={(v) => updateDetail(i, 'g', v)} size="small" style={{ width: 50 }} /> },
    { title: 'Y', key: 'y', width: 50, render: (_: any, __: any, i: number) => <InputNumber value={details[i]?.y} onChange={(v) => updateDetail(i, 'y', v)} size="small" style={{ width: 50 }} /> },
    { title: 'CSR', key: 'csr', width: 60, render: (_: any, __: any, i: number) => <InputNumber value={details[i]?.csr} onChange={(v) => updateDetail(i, 'csr', v)} size="small" style={{ width: 55 }} step={0.1} /> },
    { title: '财务价', key: 'financial_price', width: 80, render: (_: any, __: any, i: number) => <InputNumber value={details[i]?.financial_price} onChange={(v) => updateDetail(i, 'financial_price', v)} size="small" style={{ width: 75 }} /> },
    { title: '到场价', key: 'arrival_price', width: 80, render: (_: any, __: any, i: number) => <InputNumber value={details[i]?.arrival_price} onChange={(v) => updateDetail(i, 'arrival_price', v)} size="small" style={{ width: 75 }} /> },
    {
      title: '操作', key: 'action', width: 50,
      render: (_: any, __: any, i: number) => (
        <Button type="link" size="small" danger onClick={() => removeDetail(i)}>删</Button>
      ),
    },
  ];

  // 预测结果显示
  const renderPrediction = () => {
    if (!predictionResult) return null;
    const { weighted, ovenCoal, coke, chemical, economics } = predictionResult;

    return (
      <div style={{ marginTop: 16 }}>
        <Divider style={{ borderColor: '#303045' }}>预测结果</Divider>
        <Collapse
          defaultActiveKey={['coke', 'economics']}
          items={[
            {
              key: 'weighted',
              label: '第一步：配合煤加权指标',
              children: (
                <Descriptions column={4} size="small" bordered>
                  {Object.entries(weighted).map(([k, v]) => (
                    <Descriptions.Item key={k} label={<Text style={{ color: '#fa8c16' }}>{k.toUpperCase()}</Text>}>
                      <Text>{(v as number).toFixed(2)}</Text>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ),
            },
            {
              key: 'oven',
              label: '第二步：入炉煤预测值（线性校正）',
              children: (
                <Descriptions column={4} size="small" bordered>
                  {Object.entries(ovenCoal).map(([k, v]) => (
                    <Descriptions.Item key={k} label={<Text style={{ color: '#52c41a' }}>{k.toUpperCase()}</Text>}>
                      <Text>{(v as number).toFixed(2)}</Text>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ),
            },
            {
              key: 'coke',
              label: '第三步：焦炭预测',
              children: (
                <Descriptions column={4} size="small" bordered>
                  {Object.entries(coke).map(([k, v]) => (
                    <Descriptions.Item key={k} label={<Text strong style={{ color: '#1890ff' }}>{k.toUpperCase()}</Text>}>
                      <Text strong>{(v as number).toFixed(2)}</Text>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ),
            },
            {
              key: 'chemical',
              label: '第四步：化产品预测',
              children: (
                <Descriptions column={3} size="small" bordered>
                  {Object.entries(chemical).map(([k, v]) => (
                    <Descriptions.Item key={k} label={<Text style={{ color: '#722ed1' }}>{k}</Text>}>
                      <Text>{(v as number).toFixed(4)}</Text>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ),
            },
            {
              key: 'economics',
              label: '综合经济指标',
              children: (
                <Descriptions column={3} size="small" bordered>
                  <Descriptions.Item label="吨煤成本"><Text style={{ color: '#ff4d4f' }}>¥{economics.costPerTon.toFixed(2)}</Text></Descriptions.Item>
                  <Descriptions.Item label="化产品产值"><Text style={{ color: '#52c41a' }}>¥{economics.chemRevenue.toFixed(2)}</Text></Descriptions.Item>
                  <Descriptions.Item label="焦炭产值"><Text style={{ color: '#52c41a' }}>¥{economics.cokeRevenue.toFixed(2)}</Text></Descriptions.Item>
                  <Descriptions.Item label="总收入"><Text>¥{economics.totalRevenue.toFixed(2)}</Text></Descriptions.Item>
                  <Descriptions.Item label="利润"><Text style={{ color: economics.profit > 0 ? '#52c41a' : '#ff4d4f' }}>¥{economics.profit.toFixed(2)}</Text></Descriptions.Item>
                </Descriptions>
              ),
            },
          ]}
        />
      </div>
    );
  };

  return (
    <div>
      <Card style={{ background: '#1a1a2e' }}>
        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建配比方案</Button>
        </Space>
        <Table
          dataSource={plans}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{
            current: page, total, pageSize: 20,
            onChange: setPage,
            style: { marginTop: 16 },
          }}
        />
      </Card>

      {/* 配比编辑弹窗 */}
      <Modal
        title={editing ? '编辑配比方案' : '新建配比方案'}
        open={planModal}
        onCancel={() => setPlanModal(false)}
        width={1400}
        footer={null}
      >
        <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item name="date" label="日期" rules={[{ required: true }]}>
            <DatePicker />
          </Form.Item>
          <Form.Item name="furnace_group" label="炉组" rules={[{ required: true }]}>
            <Select style={{ width: 120 }} options={[
              { label: '一期', value: '一期' },
              { label: '二期', value: '二期' },
              { label: '小焦炉', value: '小焦炉' },
            ]} />
          </Form.Item>
          <Form.Item name="plan_name" label="方案名称" rules={[{ required: true }]}>
            <Input placeholder="输入方案名称" style={{ width: 200 }} />
          </Form.Item>
        </Form>

        <Alert
          message={`配比合计：${totalRatio.toFixed(2)}% ${isValidRatio ? '✅ 合格' : '❌ 必须等于100%'}`}
          type={isValidRatio ? 'success' : 'warning'}
          showIcon
          style={{ marginBottom: 12, background: isValidRatio ? '#162312' : '#2a1f1f', border: `1px solid ${isValidRatio ? '#274916' : '#5a3a3a'}` }}
        />

        <Table
          dataSource={details}
          columns={detailColumns}
          rowKey="bin_no"
          size="small"
          pagination={false}
          footer={() => (
            <Space>
              <Button type="dashed" onClick={addDetail}>添加煤种</Button>
            </Space>
          )}
        />

        <Space style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={handlePredict}
            loading={predicting}
            disabled={!isValidRatio}
          >
            预测
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            onClick={handleOptimize}
            loading={optimizing}
            disabled={!isValidRatio}
          >
            配比优化
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
            disabled={!isValidRatio}
          >
            保存
          </Button>
        </Space>

        {renderPrediction()}
      </Modal>

      {/* 优化结果弹窗 */}
      <Modal
        title="配比优化结果"
        open={optModal}
        onCancel={() => setOptModal(false)}
        footer={null}
        width={600}
      >
        {optResult && (
          <div>
            <Alert
              message={optResult.message}
              type={optResult.best ? 'success' : 'warning'}
              showIcon
              style={{ marginBottom: 16 }}
            />
            {optResult.best && (
              <>
                <Descriptions column={2} bordered size="small">
                  <Descriptions.Item label="优化后利润"><Text style={{ color: '#52c41a' }}>¥{optResult.best.economics.profit.toFixed(2)}</Text></Descriptions.Item>
                  <Descriptions.Item label="吨煤成本">¥{optResult.best.economics.costPerTon.toFixed(2)}</Descriptions.Item>
                  <Descriptions.Item label="化产品产值">¥{optResult.best.economics.chemRevenue.toFixed(2)}</Descriptions.Item>
                  <Descriptions.Item label="焦炭产值">¥{optResult.best.economics.cokeRevenue.toFixed(2)}</Descriptions.Item>
                </Descriptions>
                <Divider />
                <Text strong>优化后焦炭质量：</Text>
                <Descriptions column={4} size="small" bordered style={{ marginTop: 8 }}>
                  {Object.entries(optResult.best.coke).map(([k, v]) => (
                    <Descriptions.Item key={k} label={k.toUpperCase()}>
                      <Text>{(v as number).toFixed(2)}</Text>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}