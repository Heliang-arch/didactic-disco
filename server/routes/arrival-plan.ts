// 到货计划管理路由
import { Router } from 'express';
import { getDb } from '../db/database';

const router = Router();

// 获取到货计划列表
router.get('/api/arrival-plan', (req, res) => {
  try {
    const db = getDb();
    const { start_date, end_date, coal_name } = req.query;
    let sql = 'SELECT * FROM coal_arrival_plan WHERE 1=1';
    const params: any[] = [];

    if (start_date) { sql += ' AND arrival_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND arrival_date <= ?'; params.push(end_date); }
    if (coal_name) { sql += ' AND coal_name = ?'; params.push(coal_name); }
    sql += ' ORDER BY arrival_date DESC, coal_name';

    const rows = db.prepare(sql).all(...params);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 新增到货计划
router.post('/api/arrival-plan', (req, res) => {
  try {
    const db = getDb();
    const { coal_name, arrival_date, quantity, source = 'manual' } = req.body;
    if (!coal_name || !arrival_date || !quantity) {
      return res.status(400).json({ success: false, error: '缺少必填参数' });
    }
    const result = db.prepare(
      'INSERT INTO coal_arrival_plan (coal_name, arrival_date, quantity, source, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now","localtime"), datetime("now","localtime"))'
    ).run(coal_name, arrival_date, quantity, source);
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除到货计划
router.delete('/api/arrival-plan/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM coal_arrival_plan WHERE id = ?').run(req.params.id);
    res.json({ success: true, data: { message: '已删除' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 批量导入到货计划
router.post('/api/arrival-plan/import', (req, res) => {
  try {
    const db = getDb();
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, error: '缺少导入数据' });
    }
    const insert = db.prepare(
      'INSERT INTO coal_arrival_plan (coal_name, arrival_date, quantity, source, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now","localtime"), datetime("now","localtime"))'
    );
    const insertMany = db.transaction((list: any[]) => {
      for (const item of list) {
        insert.run(item.coal_name, item.arrival_date, item.quantity, item.source || 'import');
      }
    });
    insertMany(items);
    res.json({ success: true, data: { count: items.length } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
