import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './Layout';
import Dashboard from './pages/Dashboard';
import CoalKind from './pages/CoalKind';
import Blending from './pages/Blending';
import Contract from './pages/Contract';
import Inventory from './pages/Inventory';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="coal-kind" element={<CoalKind />} />
        <Route path="blending" element={<Blending />} />
        <Route path="contract" element={<Contract />} />
        <Route path="inventory" element={<Inventory />} />
      </Route>
    </Routes>
  );
}