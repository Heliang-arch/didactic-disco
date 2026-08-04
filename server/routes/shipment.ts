// 发运记录管理
import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

// 获取发运记录列表
router.get('/api/shipments', (req: Request, res: Response) => {
  const db = getDb();
  const { coal_name, start_date, end_date } = req.query;
  let sql = 'SELECT * FROM shipment WHERE 1=1';
  const params: any[] = [];

  if (coal_name) { sql += ' AND coal_name=?'; params.push(coal_name); }
  if (start_date) { sql += ' AND ship_date>=?'; params.push(start_date); }
  if (end_date) { sql += ' AND ship_date<=?'; params.push(end_date); }
  sql += ' ORDER BY ship_date DESC, coal_name';

  const list = db.prepare(sql).all(...params);
  res.json({ success: true, data: list });
});

// 添加发运记录
router.post('/api/shipments', (req: Request, res: Response) => {
  const { coal_name, ship_date, quantity, batch_no } = req.body;
  if (!coal_name || !ship_date || !quantity) {
    res.status(400).json({ success: false, error: '煤名、日期和数量为必填项' });
    return;
  }
  const db = getDb();
  const result = db.prepare('INSERT INTO shipment (coal_name, ship_date, quantity, batch_no) VALUES (?, ?, ?, ?)')
    .run(coal_name, ship_date, quantity, batch_no || null);
  res.json({ success: true, data: { id: result.lastInsertRowid } });
});

// 批量添加发运记录
router.post('/api/shipments/batch', (req: Request, res: Response) => {
  const { records } = req.body;
  if (!records || !Array.isArray(records) || records.length === 0) {
    res.status(400).json({ success: false, error: '请提供发运记录列表' });
    return;
  }
  const db = getDb();
  const insert = db.prepare('INSERT INTO shipment (coal_name, ship_date, quantity, batch_no) VALUES (?, ?, ?, ?)');
  const insertMany = db.transaction((items: any[]) => {
    for (const r of items) {
      insert.run(r.coal_name, r.ship_date, r.quantity, r.batch_no || null);
    }
  });
  insertMany(records);
  res.json({ success: true, data: { count: records.length } });
});

// 删除发运记录
router.delete('/api/shipments/:id', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('DELETE FROM shipment WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// === 初始库存 ===
router.get('/api/initial-stocks', (_req: Request, res: Response) => {
  const db = getDb();
  const list = db.prepare('SELECT * FROM initial_stock ORDER BY coal_name').all();
  res.json({ success: true, data: list });
});

router.post('/api/initial-stocks', (req: Request, res: Response) => {
  const { coal_name, initial_qty } = req.body;
  if (!coal_name || initial_qty === undefined) {
    res.status(400).json({ success: false, error: '煤名和初始库存量为必填项' });
    return;
  }
  const db = getDb();
  const existing = db.prepare('SELECT id FROM initial_stock WHERE coal_name=?').get(coal_name) as any;
  if (existing) {
    db.prepare('UPDATE initial_stock SET initial_qty=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
      .run(initial_qty, existing.id);
    res.json({ success: true, data: { id: existing.id, updated: true } });
  } else {
    const result = db.prepare('INSERT INTO initial_stock (coal_name, initial_qty) VALUES (?, ?)')
      .run(coal_name, initial_qty);
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  }
});

// === 持有成本参数 ===
router.get('/api/holding-cost-params', (_req: Request, res: Response) => {
  const db = getDb();
  const params = db.prepare('SELECT * FROM holding_cost_params ORDER BY id DESC LIMIT 1').get();
  res.json({ success: true, data: params || { daily_rate: 0.001 } });
});

router.post('/api/holding-cost-params', (req: Request, res: Response) => {
  const { daily_rate } = req.body;
  if (daily_rate === undefined) {
    res.status(400).json({ success: false, error: '日持有费率为必填项' });
    return;
  }
  const db = getDb();
  db.prepare('UPDATE holding_cost_params SET daily_rate=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=1')
    .run(daily_rate);
  res.json({ success: true });
});

export default router;
