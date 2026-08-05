// 排程优化路由（2.0核心）
import { Router } from 'express';
import { optimizeSchedule, saveSchedule, formulaSimilarity } from '../services/scheduling-optimizer';
import { getDb } from '../db/database';

const router = Router();

// 执行排程优化
router.post('/api/scheduling/optimize', (req, res) => {
  try {
    const { furnace_group = '一期' } = req.body;
    const result = optimizeSchedule(furnace_group);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 保存排程结果
router.post('/api/scheduling/save', (req, res) => {
  try {
    const { schedule } = req.body;
    if (!schedule || !Array.isArray(schedule)) {
      return res.status(400).json({ success: false, error: '缺少排程数据' });
    }
    saveSchedule({ schedule, total_cost: 0, total_conversion_cost: 0, avg_inventory_risk: 0, conversion_count: 0, warnings: [] });
    res.json({ success: true, data: { message: '排程已保存' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取排程历史
router.get('/api/scheduling/history', (req, res) => {
  try {
    const db = getDb();
    const { furnace_group, days = 7 } = req.query;
    let sql = 'SELECT * FROM schedule_history';
    const params: any[] = [];
    if (furnace_group) {
      sql += ' WHERE furnace_group = ?';
      params.push(furnace_group);
    }
    sql += ' ORDER BY schedule_date DESC LIMIT ?';
    params.push(parseInt(days as string) || 7);

    const rows = db.prepare(sql).all(...params) as any[];
    const data = rows.map(r => ({
      ...r,
      formula: JSON.parse(r.formula_json || '{}'),
    }));
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取排程配置
router.get('/api/scheduling/config', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM schedule_config').all() as any[];
    const config: Record<string, any> = {};
    for (const r of rows) {
      config[r.key] = { value: r.value, description: r.description };
    }
    res.json({ success: true, data: config });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新排程配置
router.put('/api/scheduling/config', (req, res) => {
  try {
    const db = getDb();
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ success: false, error: '缺少参数' });
    }
    db.prepare('UPDATE schedule_config SET value = ?, updated_at = datetime("now","localtime") WHERE key = ?').run(String(value), key);
    res.json({ success: true, data: { message: '配置已更新' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 配方相似度对比
router.post('/api/scheduling/similarity', (req, res) => {
  try {
    const { formula1, formula2 } = req.body;
    if (!formula1 || !formula2) {
      return res.status(400).json({ success: false, error: '缺少配方数据' });
    }
    const similarity = formulaSimilarity(formula1, formula2);
    res.json({ success: true, data: { similarity, is_similar: similarity >= 0.85 } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
