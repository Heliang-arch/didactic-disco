import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

// 获取所有煤种分类
router.get('/api/coal-kinds', (_req: Request, res: Response) => {
  const db = getDb();
  const kinds = db.prepare('SELECT * FROM coal_kind ORDER BY code').all();
  res.json({ success: true, data: kinds });
});

// 获取树形结构（两级）
router.get('/api/coal-kinds/tree', (_req: Request, res: Response) => {
  const db = getDb();
  const all = db.prepare('SELECT * FROM coal_kind ORDER BY code').all() as any[];
  const roots = all.filter(k => !k.parent_code);
  const tree = roots.map(r => ({
    ...r,
    children: all.filter(c => c.parent_code === r.code),
  }));
  res.json({ success: true, data: tree });
});

// 添加煤种分类
router.post('/api/coal-kinds', (req: Request, res: Response) => {
  const { code, name, parent_code, safety_threshold } = req.body;
  if (!code || !name) {
    res.status(400).json({ success: false, error: '编码和名称为必填项' });
    return;
  }
  const db = getDb();
  try {
    db.prepare('INSERT INTO coal_kind (code, name, parent_code, safety_threshold) VALUES (?, ?, ?, ?)')
      .run(code, name, parent_code || null, safety_threshold || 0);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 更新煤种分类
router.put('/api/coal-kinds/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { code, name, parent_code, safety_threshold } = req.body;
  const db = getDb();
  try {
    db.prepare(`UPDATE coal_kind SET code=?, name=?, parent_code=?, safety_threshold=?, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(code, name, parent_code || null, safety_threshold || 0, id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 删除煤种分类
router.delete('/api/coal-kinds/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = getDb();
  db.prepare('DELETE FROM coal_kind WHERE id=?').run(id);
  res.json({ success: true });
});

// === 煤名→煤种映射 ===

// 获取所有映射
router.get('/api/coal-to-kinds', (_req: Request, res: Response) => {
  const db = getDb();
  const list = db.prepare(`
    SELECT ctk.*, ck.name as kind_name 
    FROM coal_to_kind ctk 
    LEFT JOIN coal_kind ck ON ctk.kind_code = ck.code 
    ORDER BY ctk.coal_name
  `).all();
  res.json({ success: true, data: list });
});

// 添加映射
router.post('/api/coal-to-kinds', (req: Request, res: Response) => {
  const { coal_name, kind_code } = req.body;
  if (!coal_name || !kind_code) {
    res.status(400).json({ success: false, error: '煤名和煤种编码为必填项' });
    return;
  }
  const db = getDb();
  try {
    db.prepare('INSERT INTO coal_to_kind (coal_name, kind_code) VALUES (?, ?)').run(coal_name, kind_code);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 更新映射
router.put('/api/coal-to-kinds/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { coal_name, kind_code } = req.body;
  const db = getDb();
  db.prepare('UPDATE coal_to_kind SET coal_name=?, kind_code=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run(coal_name, kind_code, id);
  res.json({ success: true });
});

// 删除映射
router.delete('/api/coal-to-kinds/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = getDb();
  db.prepare('DELETE FROM coal_to_kind WHERE id=?').run(id);
  res.json({ success: true });
});

export default router;