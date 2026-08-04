import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

// 获取合同指标列表
router.get('/api/contracts', (req: Request, res: Response) => {
  const db = getDb();
  const { date, furnace_group } = req.query;
  let sql = 'SELECT * FROM contract_coke WHERE 1=1';
  const params: any[] = [];

  if (date) {
    sql += ' AND date=?';
    params.push(date);
  }
  if (furnace_group) {
    sql += ' AND furnace_group=?';
    params.push(furnace_group);
  }
  sql += ' ORDER BY date DESC, furnace_group';

  const list = db.prepare(sql).all(...params);
  res.json({ success: true, data: list });
});

// 获取单条
router.get('/api/contracts/:id', (req: Request, res: Response) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM contract_coke WHERE id=?').get(req.params.id);
  if (!item) {
    res.status(404).json({ success: false, error: '未找到合同指标' });
    return;
  }
  res.json({ success: true, data: item });
});

// 添加/更新合同指标
router.post('/api/contracts', (req: Request, res: Response) => {
  const { date, furnace_group, m40, m25, m10, csr, cri, ad, v, s } = req.body;
  if (!date || !furnace_group) {
    res.status(400).json({ success: false, error: '日期和炉组为必填项' });
    return;
  }

  const db = getDb();
  // 检查是否已存在同日期同炉组
  const existing = db.prepare('SELECT id FROM contract_coke WHERE date=? AND furnace_group=?')
    .get(date, furnace_group) as any;

  if (existing) {
    db.prepare(`
      UPDATE contract_coke SET m40=?, m25=?, m10=?, csr=?, cri=?, ad=?, v=?, s=?,
        updated_at=datetime('now','localtime') WHERE id=?
    `).run(m40, m25, m10, csr, cri, ad, v, s, existing.id);
    res.json({ success: true, data: { id: existing.id, updated: true } });
  } else {
    const result = db.prepare(`
      INSERT INTO contract_coke (date, furnace_group, m40, m25, m10, csr, cri, ad, v, s)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(date, furnace_group, m40, m25, m10, csr, cri, ad, v, s);
    res.json({ success: true, data: { id: result.lastInsertRowid, updated: false } });
  }
});

// 删除合同指标
router.delete('/api/contracts/:id', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('DELETE FROM contract_coke WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

export default router;