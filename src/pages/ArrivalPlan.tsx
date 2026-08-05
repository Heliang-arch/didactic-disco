import { useState, useEffect } from 'react';
import { Card, Table, Button, DatePicker, InputNumber, Select, Space, Modal, Form, message, Typography, Tag, Row, Col, Statistic } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { arrivalPlanApi, apiClient } from '../api/client';

const { Text, Title } = Typography;

export default function ArrivalPlan() {
  const [plans, setPlans] = useState<any[]>([]);
  const [coalNames, setCoalNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [planData, coalData] = await Promise.all([
        arrivalPlanApi.list(),
        apiClient.get('/coal-to-kinds'),
      ]);
      setPlans(planData as any[]);
      setCoalNames((coalData as any[]).map((c: any) => c.coal_name));
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const data = { ...values, date: values.date.format('YYYY-MM-DD') };
      if (editingId) {
        await arrivalPlanApi.update(editingId, data);
        message.success('更新成功');
      } else {
        await arrivalPlanApi.create(data);
        message.success('新增成功');
      }
      setModalOpen(false);
      form.resetFields();
      setEditingId(null);
      fetchData();
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: number) => {
    await arrivalPlanApi.delete(id);
    message.success('删除成功');
    fetchData();
  };

  const today = dayjs().format('YYYY-MM-DD');
  const futurePlans = plans.filter(p => p.date >= today);
  const totalArrival = futurePlans.reduce((s, p) => s + p.quantity, 0);

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card style={{ background: '#1a1a2e', border: '1px solid #303045' }}>
            <Statistic title="今日计划到货" value={plans.filter(p => p.date === today).reduce((s, p) => s + p.quantity, 0)} suffix="吨" valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ background: '#1a1a2e', border: '1px solid #303045' }}>
            <Statistic title="未来7天计划到货" value={totalArrival} suffix="吨" valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ background: '#1a1a2e', border: '1px solid #303045' }}>
            <Statistic title="计划记录数" value={plans.length} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
      </Row>

      <Card
        title="到货计划管理"
        style={{ background: '#1a1a2e', border: '1px solid #303045' }}
        headStyle={{ color: '#fa8c16', borderColor: '#303045' }}
        bodyStyle={{ color: '#e0e0e0' }}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            setEditingId(null);
            form.resetFields();
            form.setFieldsValue({ date: dayjs() });
            setModalOpen(true);
          }}>
            新增计划
          </Button>
        }
      >
        <Table
          dataSource={plans}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
          size="small"
          columns={[
            { title: '日期', dataIndex: 'date', width: 120, sorter: (a, b) => a.date.localeCompare(b.date) },
            { title: '煤种', dataIndex: 'coal_name', width: 120 },
            { title: '计划到货量(吨)', dataIndex: 'quantity', width: 130, render: (v: number) => <Text style={{ color: '#52c41a' }}>{v}</Text> },
            { title: '备注', dataIndex: 'remark', ellipsis: true },
            {
              title: '操作', width: 120,
              render: (_, record) => (
                <Space>
                  <Button type="link" size="small" icon={<EditOutlined />} onClick={() => {
                    setEditingId(record.id);
                    form.setFieldsValue({ ...record, date: dayjs(record.date) });
                    setModalOpen(true);
                  }} />
                  <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editingId ? '编辑到货计划' : '新增到货计划'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); setEditingId(null); }}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="date" label="日期" rules={[{ required: true, message: '请选择日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="coal_name" label="煤种" rules={[{ required: true, message: '请选择煤种' }]}>
            <Select showSearch options={coalNames.map(n => ({ value: n, label: n }))} />
          </Form.Item>
          <Form.Item name="quantity" label="计划到货量(吨)" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <InputNumber style={{ width: '100%' }} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
