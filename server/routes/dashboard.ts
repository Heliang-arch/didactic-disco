import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

// 仪表盘数据
router.get('/api/dashboard', (_req: Request, res: Response) => {
  const db = getDb();

  // 今日配比执行概览
  const today = new Date().toISOString().split('T')[0];
  const todayPlans = db.prepare('SELECT COUNT(*) as cnt FROM ycpb WHERE date=?').get(today) as any;
  const latestPlan = db.prepare('SELECT * FROM ycpb ORDER BY date DESC, id DESC LIMIT 1').get() as any;

  // 库存预警（库存低于100吨视为预警）
  const lowStock = db.prepare(`
    SELECT cs.*, ck.name as kind_name 
    FROM coal_stock cs 
    LEFT JOIN coal_to_kind ctk ON cs.coal_name = ctk.coal_name 
    LEFT JOIN coal_kind ck ON ctk.kind_code = ck.code
    WHERE cs.stock < 100 
    ORDER BY cs.stock ASC 
    LIMIT 10
  `).all();

  // 近期合同质量趋势（最近7天）
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const qualityTrends = db.prepare(`
    SELECT * FROM contract_coke 
    WHERE date >= ? 
    ORDER BY date ASC, furnace_group
  `).all(sevenDaysAgo);

  // 统计各类煤种数量
  const coalKindStats = db.prepare(`
    SELECT ck.code, ck.name, COUNT(ctk.id) as coal_count
    FROM coal_kind ck
    LEFT JOIN coal_to_kind ctk ON ck.code = ctk.kind_code
    GROUP BY ck.code
    ORDER BY ck.code
  `).all();

  // 最近5条配比记录
  const recentPlans = db.prepare('SELECT * FROM ycpb ORDER BY date DESC, id DESC LIMIT 5').all();

  res.json({
    success: true,
    data: {
      todayPlanCount: todayPlans?.cnt || 0,
      latestPlan,
      lowStock,
      qualityTrends,
      coalKindStats,
      recentPlans,
    },
  });
});

export default router;