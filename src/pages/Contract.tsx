import { useEffect, useState } from 'react';
import {
  Card, Table, Button, Modal, Form, InputNumber, Select, DatePicker,
  Space, Typography, message, Tabs,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../api/client';

const { Text } = Typography;

const furnaceGroups = [
  { label: '一期 (1-2焦炉)', value: '一期' },
  { label: '二期 (3-4焦炉)', value: '二期' },
  { label: '小焦炉 (5-6焦炉)', value: '小焦炉' },
  { label: '7-8焦炉', value: '7-8焦炉' },
];

const indexFields = [
  { key: 'm40', label: 'M40(%)' },
  { key: 'm25', label: 'M25(%)' },
  { key: 'm10', label: 'M10(%)' },
  { key: 'csr', label: 'CSR(%)' },
  { key: 'cri', label: 'CRI(%)' },
  { key: 'ad', label: 'Ad(%)' },
  { key: 'v', label: 'V(%)' },
  { key: 's', label: 'S(%)' },
];

export default function Contract() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [form] = Form.useForm();

  const loadData = () => {
    api.getContracts().then(setContracts);
  };

  useEffect(() => { loadData(); }, []);

  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    { title: '炉组', dataIndex: 'furnace_group', key: 'furnace_group', width: 140 },
    ...indexFields.map(f => ({
      title: f.label, dataIndex: f.key, key: f.key, width: 90,
      render: (v: number) => v != null ? v.toFixed(1) : '-',
    })),
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, r: any) => (
        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => {
          Modal.confirm({ title: '确认删除', onOk: () => api.deleteContract(r.id).then(loadData) });
        }}>删除</Button>
      ),
    },
  ];

  const handleSubmit = async () => {
    const values = await form.validateFields();
    await api.createContract({
      date: values.date.format('YYYY-MM-DD'),
      furnace_group: values.furnace_group,
      m40: values.m40, m25: values.m25, m10: values.m10,
      csr: values.csr, cri: values.cri,
      ad: values.ad, v: values.v, s: values.s,
    });
    message.success('保存成功');
    setModal(false);
    loadData();
  };

  return (
    <div>
      <Card style={{ background: '#1a1a2e' }}>
        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            form.resetFields();
            form.setFieldsValue({ date: dayjs(), furnace_group: '一期' });
            setModal(true);
          }}>添加合同指标</Button>
        </Space>
        <Table
          dataSource={contracts}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title="添加/更新合同指标"
        open={modal}
        onCancel={() => setModal(false)}
        onOk={handleSubmit}
        width={700}
      >
        <Form form={form} layout="inline" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <Form.Item name="date" label="日期" rules={[{ required: true }]}>
            <DatePicker />
          </Form.Item>
          <Form.Item name="furnace_group" label="炉组" rules={[{ required: true }]}>
            <Select style={{ width: 180 }} options={furnaceGroups} />
          </Form.Item>
        </Form>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {indexFields.map(f => (
            <Form.Item key={f.key} name={f.key} label={f.label} style={{ marginBottom: 8 }}>
              <InputNumber step={0.1} style={{ width: 100 }} />
            </Form.Item>
          ))}
        </div>
      </Modal>
    </div>
  );
}