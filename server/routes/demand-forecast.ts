// 需求预测API
import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { forecastDemand } from '../services/demand-forecaster';

const router = Router();

/**
 * 需求预测 - 所有煤种未来7天
 */
router.get('/api/demand-forecast', (_req: Request, res: Response) => {
  const db = getDb();

  // 获取所有煤种
  const coalNames = db.prepare('SELECT DISTINCT coal_name FROM coal_to_kind ORDER BY coal_name').all() as any[];

  const forecasts = [];
  for (const cn of coalNames) {
    const historicalData = db.prepare(`
      SELECT ship_date as date, SUM(quantity) as quantity
      FROM shipment WHERE coal_name=? GROUP BY ship_date ORDER BY ship_date
    `).all(cn.coal_name) as any[];

    const forecast = forecastDemand(cn.coal_name, historicalData, 7);
    forecasts.push(forecast);
  }

  res.json({ success: true, data: forecasts });
});

/**
 * 需求预测汇总 - 用于库存规划 (must be before /:coalName)
 */
router.get('/api/demand-forecast/summary', (_req: Request, res: Response) => {
  const db = getDb();
  const coalNames = db.prepare('SELECT DISTINCT coal_name FROM coal_to_kind ORDER BY coal_name').all() as any[];

  const summary = [];
  for (const cn of coalNames) {
    const historicalData = db.prepare(`
      SELECT ship_date as date, SUM(quantity) as quantity
      FROM shipment WHERE coal_name=? GROUP BY ship_date ORDER BY ship_date
    `).all(cn.coal_name) as any[];

    const forecast = forecastDemand(cn.coal_name, historicalData, 7);
    const totalPredicted = forecast.predictions.reduce((s, p) => s + p.predicted, 0);
    const avgDaily = forecast.predictions.length > 0 ? Math.round(totalPredicted / forecast.predictions.length) : 0;

    // 当前库存
    const initialStock = (db.prepare('SELECT initial_qty FROM initial_stock WHERE coal_name=?').get(cn.coal_name) as any)?.initial_qty || 0;
    const totalShipped = (db.prepare('SELECT SUM(quantity) as total FROM shipment WHERE coal_name=?').get(cn.coal_name) as any)?.total || 0;
    const currentStock = Math.max(0, initialStock - totalShipped);

    summary.push({
      coal_name: cn.coal_name,
      current_stock: currentStock,
      avg_daily_demand: avgDaily,
      total_7day_demand: totalPredicted,
      stock_after_7days: Math.max(0, currentStock - totalPredicted),
      mape: forecast.mape,
    });
  }

  res.json({ success: true, data: summary });
});

/**
 * 单个煤种需求预测
 */
router.get('/api/demand-forecast/:coalName', (req: Request, res: Response) => {
  const db = getDb();
  const coalName = decodeURIComponent(req.params.coalName as string);

  const historicalData = db.prepare(`
    SELECT ship_date as date, SUM(quantity) as quantity
    FROM shipment WHERE coal_name=? GROUP BY ship_date ORDER BY ship_date
  `).all(coalName) as any[];

  const forecast = forecastDemand(coalName, historicalData, 7);
  res.json({ success: true, data: forecast });
});

export default router;
