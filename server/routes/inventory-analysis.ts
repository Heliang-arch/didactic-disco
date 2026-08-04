// 库存分析API
import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

/**
 * 库存看板 - 实时库存水位
 * 当前库存 = 初始库存 - 累计发运量
 */
router.get('/api/inventory-analysis/board', (_req: Request, res: Response) => {
  const db = getDb();

  // 获取初始库存
  const initialStocks = db.prepare('SELECT * FROM initial_stock').all() as any[];

  // 获取累计发运量
  const totalShipments = db.prepare(`
    SELECT coal_name, SUM(quantity) as total_shipped
    FROM shipment GROUP BY coal_name
  `).all() as any[];

  const shipmentMap = new Map(totalShipments.map(s => [s.coal_name, s.total_shipped]));

  // 获取最新库存记录
  const latestStocks = db.prepare(`
    SELECT coal_name, stock FROM coal_stock
    WHERE date = (SELECT MAX(date) FROM coal_stock)
  `).all() as any[];
  const stockMap = new Map(latestStocks.map(s => [s.coal_name, s.stock]));

  // 获取煤种安全阈值
  const coalKinds = db.prepare(`
    SELECT ctk.coal_name, ck.safety_threshold, ck.name as kind_name
    FROM coal_to_kind ctk
    LEFT JOIN coal_kind ck ON ctk.kind_code = ck.code
  `).all() as any[];
  const thresholdMap = new Map(coalKinds.map(k => [k.coal_name, { threshold: k.safety_threshold || 0, kind_name: k.kind_name }]));

  // 计算各煤种当前库存
  const board = initialStocks.map(s => {
    const shipped = shipmentMap.get(s.coal_name) || 0;
    const currentStock = Math.max(0, s.initial_qty - shipped);
    const threshold = thresholdMap.get(s.coal_name)?.threshold || 0;
    const kindName = thresholdMap.get(s.coal_name)?.kind_name || '';
    const isLow = threshold > 0 && currentStock < threshold;
    const urgency = threshold > 0 ? currentStock / threshold : 1;

    return {
      coal_name: s.coal_name,
      kind_name: kindName,
      initial_qty: s.initial_qty,
      total_shipped: shipped,
      current_stock: currentStock,
      safety_threshold: threshold,
      is_low: isLow,
      urgency: Math.round(urgency * 100) / 100,
      latest_record_stock: stockMap.get(s.coal_name) || 0,
    };
  });

  // 按紧急程度排序（比值越低越紧急）
  board.sort((a, b) => a.urgency - b.urgency);

  // 汇总
  const totalStock = board.reduce((s, b) => s + b.current_stock, 0);
  const lowStockCount = board.filter(b => b.is_low).length;
  const safeCount = board.filter(b => !b.is_low).length;

  // 今日消耗（最近一天的发运量）
  const today = db.prepare('SELECT MAX(ship_date) as d FROM shipment').get() as any;
  const todayConsumption = today?.d
    ? (db.prepare('SELECT SUM(quantity) as total FROM shipment WHERE ship_date=?').get(today.d) as any)?.total || 0
    : 0;

  res.json({
    success: true,
    data: {
      summary: {
        total_stock: totalStock,
        low_stock_count: lowStockCount,
        safe_stock_count: safeCount,
        today_consumption: todayConsumption,
      },
      items: board,
    },
  });
});

/**
 * 低库存预警
 */
router.get('/api/inventory-analysis/alerts', (_req: Request, res: Response) => {
  const db = getDb();
  const initialStocks = db.prepare('SELECT * FROM initial_stock').all() as any[];
  const totalShipments = db.prepare('SELECT coal_name, SUM(quantity) as total_shipped FROM shipment GROUP BY coal_name').all() as any[];
  const shipmentMap = new Map(totalShipments.map(s => [s.coal_name, s.total_shipped]));
  const coalKinds = db.prepare(`
    SELECT ctk.coal_name, ck.safety_threshold, ck.name as kind_name
    FROM coal_to_kind ctk LEFT JOIN coal_kind ck ON ctk.kind_code = ck.code
  `).all() as any[];
  const thresholdMap = new Map(coalKinds.map(k => [k.coal_name, { threshold: k.safety_threshold || 0, kind_name: k.kind_name }]));

  const alerts = initialStocks.map(s => {
    const currentStock = Math.max(0, s.initial_qty - (shipmentMap.get(s.coal_name) || 0));
    const threshold = thresholdMap.get(s.coal_name)?.threshold || 0;
    const kindName = thresholdMap.get(s.coal_name)?.kind_name || '';
    const urgency = threshold > 0 ? currentStock / threshold : 1;
    return { coal_name: s.coal_name, kind_name: kindName, current_stock: currentStock, safety_threshold: threshold, urgency };
  }).filter(a => a.safety_threshold > 0 && a.current_stock < a.safety_threshold)
    .sort((a, b) => a.urgency - b.urgency);

  // 补货建议
  const suggestions = alerts.map(a => ({
    coal_name: a.coal_name,
    kind_name: a.kind_name,
    current_stock: a.current_stock,
    safety_threshold: a.safety_threshold,
    suggested_qty: Math.round(a.safety_threshold * 2 - a.current_stock),
    urgency_level: a.urgency < 0.3 ? '紧急' : a.urgency < 0.7 ? '较急' : '一般',
  }));

  res.json({ success: true, data: { alerts, suggestions } });
});

/**
 * 库存耗尽预测
 * 预测耗尽天数 = 当前库存 / 日均消耗量
 */
router.get('/api/inventory-analysis/depletion', (_req: Request, res: Response) => {
  const db = getDb();
  const initialStocks = db.prepare('SELECT * FROM initial_stock').all() as any[];
  const totalShipments = db.prepare('SELECT coal_name, SUM(quantity) as total_shipped FROM shipment GROUP BY coal_name').all() as any[];
  const shipmentMap = new Map(totalShipments.map(s => [s.coal_name, s.total_shipped]));

  // 计算日均消耗量
  const dateRange = db.prepare('SELECT MIN(ship_date) as min_d, MAX(ship_date) as max_d FROM shipment').get() as any;
  let totalDays = 1;
  if (dateRange?.min_d && dateRange?.max_d) {
    const d1 = new Date(dateRange.min_d);
    const d2 = new Date(dateRange.max_d);
    totalDays = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  }

  const predictions = initialStocks.map(s => {
    const currentStock = Math.max(0, s.initial_qty - (shipmentMap.get(s.coal_name) || 0));
    const totalShipped = shipmentMap.get(s.coal_name) || 0;
    const dailyConsumption = totalShipped / totalDays;
    const daysToDeplete = dailyConsumption > 0 ? Math.round(currentStock / dailyConsumption) : Infinity;

    return {
      coal_name: s.coal_name,
      current_stock: currentStock,
      daily_consumption: Math.round(dailyConsumption),
      days_to_deplete: daysToDeplete === Infinity ? -1 : daysToDeplete,
      risk_level: daysToDeplete <= 7 ? '高风险' : daysToDeplete <= 14 ? '中风险' : daysToDeplete <= 30 ? '低风险' : '安全',
    };
  });

  predictions.sort((a, b) => {
    if (a.days_to_deplete === -1) return 1;
    if (b.days_to_deplete === -1) return -1;
    return a.days_to_deplete - b.days_to_deplete;
  });

  res.json({ success: true, data: predictions });
});

/**
 * 库存结构变化趋势
 */
router.get('/api/inventory-analysis/structure-trend', (_req: Request, res: Response) => {
  const db = getDb();
  const initialStocks = db.prepare('SELECT * FROM initial_stock').all() as any[];
  const initMap = new Map(initialStocks.map(s => [s.coal_name, s.initial_qty]));

  // 按日期聚合发运量
  const dailyShipments = db.prepare(`
    SELECT ship_date, coal_name, SUM(quantity) as qty
    FROM shipment GROUP BY ship_date, coal_name ORDER BY ship_date
  `).all() as any[];

  // 按日期计算各煤种库存
  const dateMap = new Map<string, Map<string, number>>();
  const dates = [...new Set(dailyShipments.map(d => d.ship_date))].sort();

  // 初始化
  for (const date of dates) {
    const stockMap = new Map<string, number>();
    for (const s of initialStocks) {
      stockMap.set(s.coal_name, s.initial_qty);
    }
    dateMap.set(date, stockMap);
  }

  // 累计扣减
  const cumulative = new Map<string, number>();
  for (const date of dates) {
    const dayRecords = dailyShipments.filter(d => d.ship_date === date);
    for (const r of dayRecords) {
      cumulative.set(r.coal_name, (cumulative.get(r.coal_name) || 0) + r.qty);
    }
    const stockMap = dateMap.get(date)!;
    for (const [coal, initQty] of initMap) {
      stockMap.set(coal, Math.max(0, initQty - (cumulative.get(coal) || 0)));
    }
  }

  // 转为前端需要的格式
  const trend = dates.map(date => {
    const stockMap = dateMap.get(date)!;
    const total = [...stockMap.values()].reduce((s, v) => s + v, 0);
    const items: Record<string, number> = {};
    for (const [coal, qty] of stockMap) {
      items[coal] = qty;
    }
    return { date, total, items };
  });

  res.json({ success: true, data: trend });
});

/**
 * 质量风险预警
 */
router.get('/api/inventory-analysis/quality-risk', (_req: Request, res: Response) => {
  const db = getDb();

  // 获取最新配比
  const latestYcpb = db.prepare('SELECT * FROM ycpb ORDER BY date DESC LIMIT 1').get() as any;
  if (!latestYcpb) {
    res.json({ success: true, data: { risks: [], message: '暂无配比方案' } });
    return;
  }

  const details = db.prepare('SELECT * FROM ycpb_detail WHERE ycpb_id=?').all(latestYcpb.id) as any[];

  // 获取最新库存
  const initialStocks = db.prepare('SELECT * FROM initial_stock').all() as any[];
  const totalShipments = db.prepare('SELECT coal_name, SUM(quantity) as total_shipped FROM shipment GROUP BY coal_name').all() as any[];
  const shipmentMap = new Map(totalShipments.map(s => [s.coal_name, s.total_shipped]));
  const currentStockMap = new Map(initialStocks.map(s => [s.coal_name, Math.max(0, s.initial_qty - (shipmentMap.get(s.coal_name) || 0))]));

  // 计算预测质量
  const qualityIndicators = ['ad', 'v', 's', 'g', 'y', 'cri', 'csr'];
  const predicted: Record<string, number> = {};
  for (const key of qualityIndicators) {
    predicted[key] = details.reduce((sum, d) => sum + (d[key] || 0) * (d.ratio / 100), 0);
  }

  // 获取合同指标
  const contracts = db.prepare(`
    SELECT * FROM contract_coke WHERE furnace_group=? ORDER BY date DESC LIMIT 1
  `).all(latestYcpb.furnace_group) as any[];

  const risks: any[] = [];
  if (contracts.length > 0) {
    const contract = contracts[0];
    const thresholds = { ad: 0.5, s: 0.05, v: 1.0, cri: 2, csr: 2 };

    for (const [key, threshold] of Object.entries(thresholds)) {
      const contractVal = contract[key];
      const predictedVal = predicted[key];
      if (contractVal === undefined || predictedVal === undefined) continue;

      const deviation = Math.abs(predictedVal - contractVal);
      const isRisk = deviation > threshold;

      if (isRisk) {
        risks.push({
          indicator: key.toUpperCase(),
          predicted: Math.round(predictedVal * 100) / 100,
          contract: contractVal,
          deviation: Math.round(deviation * 100) / 100,
          threshold,
          status: '预警',
        });
      }
    }
  }

  // 检查库存是否足够支持配比
  for (const d of details) {
    const currentStock = currentStockMap.get(d.coal_name) || 0;
    const needed = d.ratio * 10; // 简化：假设日处理1000吨
    if (currentStock < needed) {
      risks.push({
        indicator: `${d.coal_name}库存`,
        predicted: currentStock,
        contract: needed,
        deviation: needed - currentStock,
        threshold: 0,
        status: '库存不足',
      });
    }
  }

  res.json({ success: true, data: { risks, predicted_quality: predicted } });
});

export default router;
