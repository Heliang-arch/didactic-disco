// 成本优化API
import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { calcComprehensiveCost, optimizeByCost, calcSensitivity, CoalData } from '../services/cost-optimizer';
import { analyzeReliability, ShipmentRecord } from '../services/supply-reliability';

const router = Router();

/**
 * 综合成本列表
 */
router.get('/api/cost-optimization/comprehensive', (_req: Request, res: Response) => {
  const db = getDb();

  // 获取持有成本参数
  const params = db.prepare('SELECT * FROM holding_cost_params ORDER BY id DESC LIMIT 1').get() as any;
  const dailyRate = params?.daily_rate || 0.001;

  // 获取最新价格
  const latestPrices = db.prepare(`
    SELECT coal_name, financial_price, arrival_price FROM coal_price
    WHERE date = (SELECT MAX(date) FROM coal_price)
  `).all() as any[];

  // 获取库存天数（基于发运记录）
  const initialStocks = db.prepare('SELECT * FROM initial_stock').all() as any[];
  const totalShipments = db.prepare('SELECT coal_name, SUM(quantity) as total FROM shipment GROUP BY coal_name').all() as any[];
  const shipmentMap = new Map(totalShipments.map(s => [s.coal_name, s.total]));
  const initMap = new Map(initialStocks.map(s => [s.coal_name, s.initial_qty]));

  const dateRange = db.prepare('SELECT MIN(ship_date) as min_d, MAX(ship_date) as max_d FROM shipment').get() as any;
  let totalDays = 30;
  if (dateRange?.min_d && dateRange?.max_d) {
    const d1 = new Date(dateRange.min_d);
    const d2 = new Date(dateRange.max_d);
    totalDays = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  }

  const costs = latestPrices.map(p => {
    const currentStock = Math.max(0, (initMap.get(p.coal_name) || 0) - (shipmentMap.get(p.coal_name) || 0));
    const dailyConsumption = (shipmentMap.get(p.coal_name) || 0) / totalDays;
    const holdingDays = dailyConsumption > 0 ? currentStock / dailyConsumption : 30;
    const purchasePrice = p.arrival_price || p.financial_price || 0;

    return calcComprehensiveCost(p.coal_name, purchasePrice, Math.min(holdingDays, 90), dailyRate);
  });

  res.json({
    success: true,
    data: {
      daily_rate: dailyRate,
      costs,
    },
  });
});

/**
 * 成本优化 - 最小化配煤总成本
 */
router.post('/api/cost-optimization/optimize', (req: Request, res: Response) => {
  const { furnace_group, constraints, reliability_threshold } = req.body;
  if (!furnace_group) {
    res.status(400).json({ success: false, error: '请指定炉组' });
    return;
  }

  try {
    const db = getDb();

    // 获取持有成本参数
    const params = db.prepare('SELECT * FROM holding_cost_params ORDER BY id DESC LIMIT 1').get() as any;
    const dailyRate = params?.daily_rate || 0.001;

    // 获取价格
    const latestPrices = db.prepare(`
      SELECT coal_name, financial_price, arrival_price FROM coal_price
      WHERE date = (SELECT MAX(date) FROM coal_price)
    `).all() as any[];

    // 获取库存
    const initialStocks = db.prepare('SELECT * FROM initial_stock').all() as any[];
    const totalShipments = db.prepare('SELECT coal_name, SUM(quantity) as total FROM shipment GROUP BY coal_name').all() as any[];
    const shipmentMap = new Map(totalShipments.map(s => [s.coal_name, s.total]));
    const initMap = new Map(initialStocks.map(s => [s.coal_name, s.initial_qty]));

    // 计算综合成本
    const costMap = new Map<string, number>();
    for (const p of latestPrices) {
      const currentStock = Math.max(0, (initMap.get(p.coal_name) || 0) - (shipmentMap.get(p.coal_name) || 0));
      const dateRange = db.prepare('SELECT MIN(ship_date) as min_d, MAX(ship_date) as max_d FROM shipment').get() as any;
      let totalDays = 30;
      if (dateRange?.min_d && dateRange?.max_d) {
        const d1 = new Date(dateRange.min_d);
        const d2 = new Date(dateRange.max_d);
        totalDays = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      }
      const dailyConsumption = (shipmentMap.get(p.coal_name) || 0) / totalDays;
      const holdingDays = dailyConsumption > 0 ? currentStock / dailyConsumption : 30;
      const purchasePrice = p.arrival_price || p.financial_price || 0;
      const result = calcComprehensiveCost(p.coal_name, purchasePrice, Math.min(holdingDays, 90), dailyRate);
      costMap.set(p.coal_name, result.total_cost);
    }

    // 获取供应可靠性
    const allRecords = db.prepare('SELECT * FROM shipment ORDER BY ship_date').all() as ShipmentRecord[];
    const dates = [...new Set(allRecords.map(r => r.ship_date))].sort();
    const totalDaysForReliability = dates.length;
    const grouped = new Map<string, ShipmentRecord[]>();
    for (const r of allRecords) {
      if (!grouped.has(r.coal_name)) grouped.set(r.coal_name, []);
      grouped.get(r.coal_name)!.push(r);
    }
    const reliabilityMap = new Map<string, number>();
    for (const [coalName, records] of grouped) {
      const analysis = analyzeReliability(records, totalDaysForReliability);
      reliabilityMap.set(coalName, analysis.score);
    }

    // 获取煤指标（从最近的配比明细中获取，或使用默认值）
    const coalIndicators = new Map<string, Partial<CoalData>>();
    const recentDetails = db.prepare(`
      SELECT DISTINCT coal_name, ad, v, s, g, y, x, b, r, m, cri, csr, financial_price, arrival_price
      FROM ycpb_detail ORDER BY id DESC
    `).all() as any[];
    for (const d of recentDetails) {
      if (!coalIndicators.has(d.coal_name)) {
        coalIndicators.set(d.coal_name, {
          ad: d.ad, v: d.v, s: d.s, g: d.g, y: d.y,
          x: d.x, b: d.b, r: d.r, m: d.m, cri: d.cri, csr: d.csr,
          financial_price: d.financial_price, arrival_price: d.arrival_price,
        });
      }
    }

    // 构建候选煤种
    const candidateCoals = latestPrices.map(p => {
      const indicators = coalIndicators.get(p.coal_name) || {};
      return {
        coal_name: p.coal_name,
        comprehensive_cost: costMap.get(p.coal_name) || p.arrival_price || 0,
        available_stock: Math.max(0, (initMap.get(p.coal_name) || 0) - (shipmentMap.get(p.coal_name) || 0)),
        reliability_score: reliabilityMap.get(p.coal_name) || 50,
        ad: indicators.ad || 10,
        v: indicators.v || 28,
        s: indicators.s || 0.7,
        g: indicators.g || 75,
        y: indicators.y || 15,
        x: indicators.x || 30,
        b: indicators.b || 15,
        r: indicators.r || 55,
        m: indicators.m || 80,
        cri: indicators.cri || 26,
        csr: indicators.csr || 62,
        financial_price: indicators.financial_price || p.financial_price || 0,
        arrival_price: indicators.arrival_price || p.arrival_price || 0,
        ratio: 0,
      };
    });

    const result = optimizeByCost(
      candidateCoals,
      furnace_group,
      constraints || {},
      reliability_threshold || 50,
    );

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * 成本敏感性分析
 */
router.post('/api/cost-optimization/sensitivity', (req: Request, res: Response) => {
  const { coals, furnace_group } = req.body;
  if (!coals || !Array.isArray(coals) || !furnace_group) {
    res.status(400).json({ success: false, error: '请提供配煤数据和炉组' });
    return;
  }

  try {
    const db = getDb();
    const params = db.prepare('SELECT * FROM holding_cost_params ORDER BY id DESC LIMIT 1').get() as any;
    const dailyRate = params?.daily_rate || 0.001;

    const latestPrices = db.prepare(`
      SELECT coal_name, arrival_price FROM coal_price
      WHERE date = (SELECT MAX(date) FROM coal_price)
    `).all() as any[];
    const priceMap = new Map(latestPrices.map(p => [p.coal_name, p.arrival_price || 0]));

    const coalCosts = coals.map((c: any) => {
      const purchasePrice = priceMap.get(c.coal_name) || c.arrival_price || 1500;
      const result = calcComprehensiveCost(c.coal_name, purchasePrice, 30, dailyRate);
      return { coal_name: c.coal_name, total_cost: result.total_cost };
    });

    const results = calcSensitivity(coals as CoalData[], coalCosts, furnace_group);
    res.json({ success: true, data: results });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
