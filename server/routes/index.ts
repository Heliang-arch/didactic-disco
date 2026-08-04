import { Router } from 'express';
import coalKindRouter from './coal-kind';
import blendingRouter from './blending';
import contractRouter from './contract';
import inventoryRouter from './inventory';
import dashboardRouter from './dashboard';
import shipmentRouter from './shipment';
import inventoryAnalysisRouter from './inventory-analysis';
import supplyAnalysisRouter from './supply-analysis';
import costOptimizationRouter from './cost-optimization';
import demandForecastRouter from './demand-forecast';

const router = Router();

// 注册所有路由
router.use(coalKindRouter);
router.use(blendingRouter);
router.use(contractRouter);
router.use(inventoryRouter);
router.use(dashboardRouter);
router.use(shipmentRouter);
router.use(inventoryAnalysisRouter);
router.use(supplyAnalysisRouter);
router.use(costOptimizationRouter);
router.use(demandForecastRouter);

// 健康检查
router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
