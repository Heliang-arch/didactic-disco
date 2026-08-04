import { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Space, Tag, Typography, message, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '../api/client';

const { Text } = Typography;

export default function CoalKind() {
  const [kinds, setKinds] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [kindModal, setKindModal] = useState(false);
  const [mapModal, setMapModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [mapForm] = Form.useForm();

  const loadData = () => {
    api.getCoalKinds().then(setKinds);
    api.getCoalToKinds().then(setMappings);
  };

  useEffect(() => { loadData(); }, []);

  // 煤种分类列
  const kindColumns = [
    { title: '编码', dataIndex: 'code', key: 'code', render: (v: string) => <Tag color="orange">{v}</Tag> },
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '上级编码', dataIndex: 'parent_code', key: 'parent_code',
      render: (v: string) => v ? <Tag>{v}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: '级别', key: 'level',
      render: (_: any, r: any) => r.parent_code ? <Tag color="blue">二级</Tag> : <Tag color="green">一级</Tag>,
    },
    {
      title: '操作', key: 'action',
      render: (_: any, r: any) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => {
            setEditing(r);
            form.setFieldsValue(r);
            setKindModal(true);
          }}>编辑</Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => {
            Modal.confirm({ title: '确认删除', content: `删除"${r.name}"？`, onOk: () => api.deleteCoalKind(r.id).then(loadData) });
          }}>删除</Button>
        </Space>
      ),
    },
  ];

  // 煤名映射列
  const mapColumns = [
    { title: '煤名', dataIndex: 'coal_name', key: 'coal_name' },
    { title: '对应煤种编码', dataIndex: 'kind_code', key: 'kind_code' },
    { title: '煤种名称', dataIndex: 'kind_name', key: 'kind_name' },
    {
      title: '操作', key: 'action',
      render: (_: any, r: any) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => {
            setEditing(r);
            mapForm.setFieldsValue(r);
            setMapModal(true);
          }}>编辑</Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => {
            Modal.confirm({ title: '确认删除', content: `删除"${r.coal_name}"映射？`, onOk: () => api.deleteCoalToKind(r.id).then(loadData) });
          }}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Tabs
        items={[
          {
            key: 'kinds',
            label: '煤种分类',
            children: (
              <Card style={{ background: '#1a1a2e' }}>
                <Space style={{ marginBottom: 16 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                    setEditing(null);
                    form.resetFields();
                    setKindModal(true);
                  }}>添加煤种</Button>
                </Space>
                <Table
                  dataSource={kinds}
                  columns={kindColumns}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  expandable={{
                    rowExpandable: (r) => !r.parent_code,
                    expandedRowRender: (r) => {
                      const children = kinds.filter(k => k.parent_code === r.code);
                      return (
                        <Table
                          dataSource={children}
                          columns={kindColumns}
                          rowKey="id"
                          size="small"
                          pagination={false}
                          style={{ background: 'transparent' }}
                        />
                      );
                    },
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'mappings',
            label: '煤名映射',
            children: (
              <Card style={{ background: '#1a1a2e' }}>
                <Space style={{ marginBottom: 16 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                    setEditing(null);
                    mapForm.resetFields();
                    setMapModal(true);
                  }}>添加映射</Button>
                </Space>
                <Table dataSource={mappings} columns={mapColumns} rowKey="id" size="small" pagination={false} />
              </Card>
            ),
          },
        ]}
      />

      {/* 煤种分类弹窗 */}
      <Modal
        title={editing ? '编辑煤种' : '添加煤种'}
        open={kindModal}
        onCancel={() => setKindModal(false)}
        onOk={() => form.validateFields().then(async (values) => {
          if (editing) {
            await api.updateCoalKind(editing.id, values);
          } else {
            await api.createCoalKind(values);
          }
          message.success(editing ? '更新成功' : '添加成功');
          setKindModal(false);
          loadData();
        })}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="煤种编码" rules={[{ required: true, message: '请输入编码' }]}>
            <Input placeholder="如：A01" />
          </Form.Item>
          <Form.Item name="name" label="煤种名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：主焦煤" />
          </Form.Item>
          <Form.Item name="parent_code" label="上级编码">
            <Select
              allowClear
              placeholder="留空为一级分类"
              options={kinds.filter(k => !k.parent_code).map(k => ({ label: `${k.code} - ${k.name}`, value: k.code }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 煤名映射弹窗 */}
      <Modal
        title={editing ? '编辑映射' : '添加映射'}
        open={mapModal}
        onCancel={() => setMapModal(false)}
        onOk={() => mapForm.validateFields().then(async (values) => {
          if (editing) {
            await api.updateCoalToKind(editing.id, values);
          } else {
            await api.createCoalToKind(values);
          }
          message.success('操作成功');
          setMapModal(false);
          loadData();
        })}
      >
        <Form form={mapForm} layout="vertical">
          <Form.Item name="coal_name" label="煤名" rules={[{ required: true, message: '请输入煤名' }]}>
            <Input placeholder="如：山西焦煤" />
          </Form.Item>
          <Form.Item name="kind_code" label="对应煤种编码" rules={[{ required: true, message: '请选择煤种' }]}>
            <Select
              placeholder="选择煤种"
              options={kinds.map(k => ({ label: `${k.code} - ${k.name}`, value: k.code }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}