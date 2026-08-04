import { useState } from 'react';
import { Layout, Menu, Typography } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  ApartmentOutlined,
  SlidersOutlined,
  FileTextOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/coal-kind', icon: <ApartmentOutlined />, label: '煤种字典' },
  { key: '/blending', icon: <SlidersOutlined />, label: '配比管理' },
  { key: '/contract', icon: <FileTextOutlined />, label: '合同指标' },
  { key: '/inventory', icon: <ShoppingCartOutlined />, label: '库存价格' },
];

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        style={{
          background: 'linear-gradient(180deg, #0f0f23 0%, #1a1a2e 100%)',
          borderRight: '1px solid #303045',
        }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #303045',
        }}>
          <Text strong style={{ color: '#fa8c16', fontSize: collapsed ? 14 : 16, whiteSpace: 'nowrap' }}>
            {collapsed ? '配煤' : '配煤专家系统'}
          </Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', borderInlineEnd: 'none' }}
        />
      </Sider>
      <Layout>
        <Header style={{
          background: '#1a1a2e',
          borderBottom: '1px solid #303045',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}>
          <Text style={{ color: '#fa8c16', fontSize: 16, fontWeight: 600 }}>
            焦化厂配煤决策支持系统
          </Text>
          <Text style={{ color: '#666' }}>
            {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </Text>
        </Header>
        <Content style={{ padding: 24, background: '#0f0f23', minHeight: 360 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}