import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './Layout';
import Dashboard from './pages/Dashboard';
import CoalKind from './pages/CoalKind';
import Blending from './pages/Blending';
import Scheduling from './pages/Scheduling';
import Contract from './pages/Contract';
import Inventory from './pages/Inventory';
import ArrivalPlan from './pages/ArrivalPlan';
import InventoryBoard from './pages/InventoryBoard';
import SupplyAnalysis from './pages/SupplyAnalysis';
import CostOptimization from './pages/CostOptimization';
import DemandForecast from './pages/DemandForecast';

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="coal-kind" element={<CoalKind />} />
        <Route path="blending" element={<Blending />} />
        <Route path="scheduling" element={<Scheduling />} />
        <Route path="contract" element={<Contract />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="arrival-plan" element={<ArrivalPlan />} />
        <Route path="inventory-board" element={<InventoryBoard />} />
        <Route path="supply-analysis" element={<SupplyAnalysis />} />
        <Route path="cost-optimization" element={<CostOptimization />} />
        <Route path="demand-forecast" element={<DemandForecast />} />
      </Route>
    </Routes>
  );
}

export default App;
