// 供应分析API
import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { analyzeReliability, ShipmentRecord } from '../services/supply-reliability';

const router = Router();

/**
 * 供应可靠性分析 - 所有煤种
 */
router.get('/api/supply-analysis/reliability', (_req: Request, res: Response) => {
  const db = getDb();

  // 获取所有发运记录
  const allRecords = db.prepare('SELECT * FROM shipment ORDER BY ship_date').all() as ShipmentRecord[];
  if (allRecords.length === 0) {
    res.json({ success: true, data: [] });
    return;
  }

  // 计算总天数
  const dates = [...new Set(allRecords.map(r => r.ship_date))].sort();
  const totalDays = dates.length;

  // 按煤种分组
  const grouped = new Map<string, ShipmentRecord[]>();
  for (const r of allRecords) {
    if (!grouped.has(r.coal_name)) grouped.set(r.coal_name, []);
    grouped.get(r.coal_name)!.push(r);
  }

  // 分析每个煤种
  const results = [];
  for (const [coalName, records] of grouped) {
    const analysis = analyzeReliability(records, totalDays);
    analysis.coal_name = coalName;
    results.push(analysis);
  }

  // 按评分排序
  results.sort((a, b) => b.score - a.score);

  res.json({ success: true, data: results });
});

/**
 * 单个煤种的发运趋势
 */
router.get('/api/supply-analysis/trend/:coalName', (req: Request, res: Response) => {
  const db = getDb();
  const coalName = decodeURIComponent(req.params.coalName as string);

  const records = db.prepare('SELECT * FROM shipment WHERE coal_name=? ORDER BY ship_date').all(coalName) as any[];

  // 按日期聚合
  const dailyMap = new Map<string, number>();
  for (const r of records) {
    dailyMap.set(r.ship_date, (dailyMap.get(r.ship_date) || 0) + r.quantity);
  }
  const sortedDates = [...dailyMap.keys()].sort();
  const dailyData = sortedDates.map(d => ({ date: d, quantity: dailyMap.get(d) || 0 }));

  // 7天移动平均
  const movingAvg: { date: string; value: number }[] = [];
  for (let i = 0; i < sortedDates.length; i++) {
    const start = Math.max(0, i - 6);
    const window = dailyData.slice(start, i + 1);
    const avg = window.reduce((s, d) => s + d.quantity, 0) / window.length;
    movingAvg.push({ date: sortedDates[i], value: Math.round(avg) });
  }

  // 趋势线（线性回归）
  const n = dailyData.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += dailyData[i].quantity;
    sumXY += i * dailyData[i].quantity;
    sumX2 += i * i;
  }
  const slope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0;
  const intercept = n > 0 ? (sumY - slope * sumX) / n : 0;
  const trendLine = dailyData.map((_, i) => ({ date: sortedDates[i], value: Math.round(slope * i + intercept) }));

  // 工作日 vs 周末
  let weekdaySum = 0, weekdayCount = 0, weekendSum = 0, weekendCount = 0;
  for (const d of dailyData) {
    const day = new Date(d.date).getDay();
    if (day === 0 || day === 6) { weekendSum += d.quantity; weekendCount++; }
    else { weekdaySum += d.quantity; weekdayCount++; }
  }

  res.json({
    success: true,
    data: {
      daily: dailyData,
      moving_avg: movingAvg,
      trend_line: trendLine,
      trend_slope: Math.round(slope * 100) / 100,
      weekday_avg: weekdayCount > 0 ? Math.round(weekdaySum / weekdayCount) : 0,
      weekend_avg: weekendCount > 0 ? Math.round(weekendSum / weekendCount) : 0,
    },
  });
});

/**
 * 发运频率分析
 */
router.get('/api/supply-analysis/frequency', (_req: Request, res: Response) => {
  const db = getDb();
  const allRecords = db.prepare('SELECT * FROM shipment ORDER BY ship_date').all() as any[];
  if (allRecords.length === 0) {
    res.json({ success: true, data: [] });
    return;
  }

  const dates = [...new Set(allRecords.map(r => r.ship_date))].sort();
  const totalDays = dates.length;

  // 按煤种分组
  const grouped = new Map<string, Set<string>>();
  for (const r of allRecords) {
    if (!grouped.has(r.coal_name)) grouped.set(r.coal_name, new Set());
    grouped.get(r.coal_name)!.add(r.ship_date);
  }

  const results = [];
  for (const [coalName, shipDays] of grouped) {
    const frequency = shipDays.size / totalDays;
    const intervals: number[] = [];
    const sortedDays = [...shipDays].sort();
    for (let i = 1; i < sortedDays.length; i++) {
      const d1 = new Date(sortedDays[i - 1]);
      const d2 = new Date(sortedDays[i]);
      intervals.push((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    }
    const avgInterval = intervals.length > 0 ? intervals.reduce((s, v) => s + v, 0) / intervals.length : totalDays;

    results.push({
      coal_name: coalName,
      ship_days: shipDays.size,
      total_days: totalDays,
      frequency: Math.round(frequency * 100) / 100,
      avg_interval: Math.round(avgInterval * 100) / 100,
      is_low_freq: frequency < 0.5,
    });
  }

  results.sort((a, b) => b.frequency - a.frequency);
  res.json({ success: true, data: results });
});

export default router;
