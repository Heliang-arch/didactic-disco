import { useEffect, useState } from 'react';
import {
  Card, Table, Button, Modal, Form, InputNumber, Input, Select, DatePicker,
  Space, Typography, message, Tabs,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../api/client';

const { Text } = Typography;

function Inventory() {
  // 煤库存
  const [stocks, setStocks] = useState<any[]>([]);
  const [stockModal, setStockModal] = useState(false);
  const [stockForm] = Form.useForm();

  // 煤价格
  const [prices, setPrices] = useState<any[]>([]);
  const [priceModal, setPriceModal] = useState(false);
  const [priceForm] = Form.useForm();

  // 化产品价格
  const [chemPrices, setChemPrices] = useState<any[]>([]);
  const [chemModal, setChemModal] = useState(false);
  const [chemForm] = Form.useForm();

  const [coalToKinds, setCoalToKinds] = useState<any[]>([]);

  const loadData = () => {
    api.getCoalStocks().then(setStocks);
    api.getCoalPrices().then(setPrices);
    api.getChemPrices().then(setChemPrices);
    api.getCoalToKinds().then(setCoalToKinds);
  };

  useEffect(() => { loadData(); }, []);

  const coalNames = [...new Set(coalToKinds.map(c => c.coal_name))];

  const stockColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    { title: '煤名', dataIndex: 'coal_name', key: 'coal_name' },
    { title: '库存量(吨)', dataIndex: 'stock', key: 'stock', render: (v: number) => (
      <Text style={{ color: v < 100 ? '#ff4d4f' : '#52c41a' }}>{v.toFixed(0)}</Text>
    )},
    { title: '操作', key: 'action', width: 80, render: (_: any, r: any) => (
      <Button type="link" danger icon={<DeleteOutlined />} onClick={() => {
        Modal.confirm({ title: '确认删除', onOk: () => api.deleteCoalStock(r.id).then(loadData) });
      }}>删除</Button>
    )},
  ];

  const priceColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    { title: '煤名', dataIndex: 'coal_name', key: 'coal_name' },
    { title: '财务价', dataIndex: 'financial_price', key: 'financial_price', render: (v: number) => `¥${v?.toFixed(0) || 0}` },
    { title: '到场价', dataIndex: 'arrival_price', key: 'arrival_price', render: (v: number) => `¥${v?.toFixed(0) || 0}` },
    { title: '操作', key: 'action', width: 80, render: (_: any, r: any) => (
      <Button type="link" danger icon={<DeleteOutlined />} onClick={() => {
        Modal.confirm({ title: '确认删除', onOk: () => api.deleteCoalPrice(r.id).then(loadData) });
      }}>删除</Button>
    )},
  ];

  const chemFields = [
    { key: 'electricity', label: '电(元/度)' },
    { key: 'tar', label: '焦油(元/吨)' },
    { key: 'crude_benzene', label: '粗苯(元/吨)' },
    { key: 'ammonium_sulfate', label: '硫铵(元/吨)' },
    { key: 'gas', label: '煤气(元/m³)' },
    { key: 'coke_powder', label: '焦粉(元/吨)' },
    { key: 'coke_nut', label: '焦丁(元/吨)' },
    { key: 'coke', label: '焦炭(元/吨)' },
  ];

  const chemColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    ...chemFields.map(f => ({
      title: f.label, dataIndex: f.key, key: f.key, width: 120,
      render: (v: number) => `¥${v?.toFixed(2) || 0}`,
    })),
    { title: '操作', key: 'action', width: 80, render: (_: any, r: any) => (
      <Button type="link" danger icon={<DeleteOutlined />} onClick={() => {
        Modal.confirm({ title: '确认删除', onOk: () => api.deleteChemPrice(r.id).then(loadData) });
      }}>删除</Button>
    )},
  ];

  return (
    <div>
      <Tabs
        items={[
          {
            key: 'stock',
            label: '煤库存',
            children: (
              <Card style={{ background: '#1a1a2e' }}>
                <Space style={{ marginBottom: 16 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                    stockForm.resetFields();
                    stockForm.setFieldsValue({ date: dayjs() });
                    setStockModal(true);
                  }}>添加库存</Button>
                </Space>
                <Table dataSource={stocks} columns={stockColumns} rowKey="id" size="small" pagination={false} />
              </Card>
            ),
          },
          {
            key: 'price',
            label: '煤价格',
            children: (
              <Card style={{ background: '#1a1a2e' }}>
                <Space style={{ marginBottom: 16 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                    priceForm.resetFields();
                    priceForm.setFieldsValue({ date: dayjs() });
                    setPriceModal(true);
                  }}>添加价格</Button>
                </Space>
                <Table dataSource={prices} columns={priceColumns} rowKey="id" size="small" pagination={false} />
              </Card>
            ),
          },
          {
            key: 'chem',
            label: '化产品价格',
            children: (
              <Card style={{ background: '#1a1a2e' }}>
                <Space style={{ marginBottom: 16 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                    chemForm.resetFields();
                    chemForm.setFieldsValue({ date: dayjs() });
                    setChemModal(true);
                  }}>添加化产品价格</Button>
                </Space>
                <Table
                  dataSource={chemPrices}
                  columns={chemColumns}
                  rowKey="id"
                  size="small"
                  scroll={{ x: 1200 }}
                  pagination={false}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* 库存弹窗 */}
      <Modal title="添加库存" open={stockModal} onCancel={() => setStockModal(false)} onOk={() => {
        stockForm.validateFields().then(async (values) => {
          await api.createCoalStock({
            date: values.date.format('YYYY-MM-DD'),
            coal_name: values.coal_name,
            stock: values.stock,
          });
          message.success('添加成功');
          setStockModal(false);
          loadData();
        });
      }}>
        <Form form={stockForm} layout="vertical">
          <Form.Item name="date" label="日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="coal_name" label="煤名" rules={[{ required: true }]}>
            <Select showSearch placeholder="选择煤名" options={coalNames.map(n => ({ label: n, value: n }))} />
          </Form.Item>
          <Form.Item name="stock" label="库存量(吨)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 价格弹窗 */}
      <Modal title="添加价格" open={priceModal} onCancel={() => setPriceModal(false)} onOk={() => {
        priceForm.validateFields().then(async (values) => {
          await api.createCoalPrice({
            date: values.date.format('YYYY-MM-DD'),
            coal_name: values.coal_name,
            financial_price: values.financial_price,
            arrival_price: values.arrival_price,
          });
          message.success('添加成功');
          setPriceModal(false);
          loadData();
        });
      }}>
        <Form form={priceForm} layout="vertical">
          <Form.Item name="date" label="日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="coal_name" label="煤名" rules={[{ required: true }]}>
            <Select showSearch placeholder="选择煤名" options={coalNames.map(n => ({ label: n, value: n }))} />
          </Form.Item>
          <Form.Item name="financial_price" label="财务价(元/吨)">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="arrival_price" label="到场价(元/吨)">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 化产品价格弹窗 */}
      <Modal title="添加化产品价格" open={chemModal} onCancel={() => setChemModal(false)} width={600} onOk={() => {
        chemForm.validateFields().then(async (values) => {
          const data: any = { date: values.date.format('YYYY-MM-DD') };
          for (const f of chemFields) {
            data[f.key] = values[f.key] || 0;
          }
          await api.createChemPrice(data);
          message.success('添加成功');
          setChemModal(false);
          loadData();
        });
      }}>
        <Form form={chemForm} layout="vertical">
          <Form.Item name="date" label="日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {chemFields.map(f => (
              <Form.Item key={f.key} name={f.key} label={f.label} style={{ marginBottom: 8 }}>
                <InputNumber step={0.01} style={{ width: 150 }} />
              </Form.Item>
            ))}
          </div>
        </Form>
      </Modal>
    </div>
  );
}

export default Inventory;