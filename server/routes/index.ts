import { Router } from 'express';
import coalKindRouter from './coal-kind';
import blendingRouter from './blending';
import contractRouter from './contract';
import inventoryRouter from './inventory';
import dashboardRouter from './dashboard';

const router = Router();

// 注册所有路由
router.use(coalKindRouter);
router.use(blendingRouter);
router.use(contractRouter);
router.use(inventoryRouter);
router.use(dashboardRouter);

// 健康检查
router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;