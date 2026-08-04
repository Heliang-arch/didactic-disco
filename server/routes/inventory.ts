import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

// === 煤库存 ===

// 获取库存列表
router.get('/api/coal-stocks', (req: Request, res: Response) => {
  const db = getDb();
  const { date, coal_name } = req.query;
  let sql = 'SELECT * FROM coal_stock WHERE 1=1';
  const params: any[] = [];

  if (date) {
    sql += ' AND date=?';
    params.push(date);
  }
  if (coal_name) {
    sql += ' AND coal_name=?';
    params.push(coal_name);
  }
  sql += ' ORDER BY date DESC, coal_name';

  const list = db.prepare(sql).all(...params);
  res.json({ success: true, data: list });
});

// 添加/更新库存
router.post('/api/coal-stocks', (req: Request, res: Response) => {
  const { date, coal_name, stock } = req.body;
  if (!date || !coal_name || stock === undefined) {
    res.status(400).json({ success: false, error: '日期、煤名和库存量为必填项' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM coal_stock WHERE date=? AND coal_name=?')
    .get(date, coal_name) as any;

  if (existing) {
    db.prepare('UPDATE coal_stock SET stock=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
      .run(stock, existing.id);
    res.json({ success: true, data: { id: existing.id, updated: true } });
  } else {
    const result = db.prepare('INSERT INTO coal_stock (date, coal_name, stock) VALUES (?, ?, ?)')
      .run(date, coal_name, stock);
    res.json({ success: true, data: { id: result.lastInsertRowid, updated: false } });
  }
});

// 删除库存
router.delete('/api/coal-stocks/:id', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('DELETE FROM coal_stock WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// === 煤价格 ===

// 获取价格列表
router.get('/api/coal-prices', (req: Request, res: Response) => {
  const db = getDb();
  const { date, coal_name } = req.query;
  let sql = 'SELECT * FROM coal_price WHERE 1=1';
  const params: any[] = [];

  if (date) {
    sql += ' AND date=?';
    params.push(date);
  }
  if (coal_name) {
    sql += ' AND coal_name=?';
    params.push(coal_name);
  }
  sql += ' ORDER BY date DESC, coal_name';

  const list = db.prepare(sql).all(...params);
  res.json({ success: true, data: list });
});

// 添加/更新价格
router.post('/api/coal-prices', (req: Request, res: Response) => {
  const { date, coal_name, financial_price, arrival_price } = req.body;
  if (!date || !coal_name) {
    res.status(400).json({ success: false, error: '日期和煤名为必填项' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM coal_price WHERE date=? AND coal_name=?')
    .get(date, coal_name) as any;

  if (existing) {
    db.prepare('UPDATE coal_price SET financial_price=?, arrival_price=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
      .run(financial_price || 0, arrival_price || 0, existing.id);
    res.json({ success: true, data: { id: existing.id, updated: true } });
  } else {
    const result = db.prepare('INSERT INTO coal_price (date, coal_name, financial_price, arrival_price) VALUES (?, ?, ?, ?)')
      .run(date, coal_name, financial_price || 0, arrival_price || 0);
    res.json({ success: true, data: { id: result.lastInsertRowid, updated: false } });
  }
});

// 删除价格
router.delete('/api/coal-prices/:id', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('DELETE FROM coal_price WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// === 化产品价格 ===

// 获取化产品价格列表
router.get('/api/chem-prices', (req: Request, res: Response) => {
  const db = getDb();
  const list = db.prepare('SELECT * FROM chem_price ORDER BY date DESC').all();
  res.json({ success: true, data: list });
});

// 添加/更新化产品价格
router.post('/api/chem-prices', (req: Request, res: Response) => {
  const { date, electricity, tar, crude_benzene, ammonium_sulfate, gas, coke_powder, coke_nut, coke } = req.body;
  if (!date) {
    res.status(400).json({ success: false, error: '日期为必填项' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM chem_price WHERE date=?').get(date) as any;

  const data = { electricity, tar, crude_benzene, ammonium_sulfate, gas, coke_powder, coke_nut, coke };

  if (existing) {
    db.prepare(`
      UPDATE chem_price SET electricity=?, tar=?, crude_benzene=?, ammonium_sulfate=?,
        gas=?, coke_powder=?, coke_nut=?, coke=?, updated_at=datetime('now','localtime') WHERE id=?
    `).run(
      data.electricity || 0, data.tar || 0, data.crude_benzene || 0, data.ammonium_sulfate || 0,
      data.gas || 0, data.coke_powder || 0, data.coke_nut || 0, data.coke || 0, existing.id
    );
    res.json({ success: true, data: { id: existing.id, updated: true } });
  } else {
    const result = db.prepare(`
      INSERT INTO chem_price (date, electricity, tar, crude_benzene, ammonium_sulfate, gas, coke_powder, coke_nut, coke)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      date, data.electricity || 0, data.tar || 0, data.crude_benzene || 0, data.ammonium_sulfate || 0,
      data.gas || 0, data.coke_powder || 0, data.coke_nut || 0, data.coke || 0
    );
    res.json({ success: true, data: { id: result.lastInsertRowid, updated: false } });
  }
});

// 删除化产品价格
router.delete('/api/chem-prices/:id', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('DELETE FROM chem_price WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

export default router;