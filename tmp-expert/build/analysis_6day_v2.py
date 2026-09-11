# -*- coding: utf-8 -*-
"""六天配煤方案分析 v2（新数据口径，独立脚本，不改动 solver / preprocess / 系统数据）

与 v1 的差异（2026-09-10 用户提供新数据）:
  1. 期初库存 = 2026.9.10库存（去虚拟库）.csv —— 13 煤种合计 956,193 t
     （旧 9.2~9.8 快照序列与之差约 4 倍，系含虚拟库的另一口径；
       由此推出的"毛消耗 185,303 t/天"为口径假象，作废）
  2. 质量档案 = 2026.9.10质量.csv（滚动窗口 7.10~9.8，聚合逻辑与 preprocess 完全一致）
  3. 船运在途 = 2026.9.10船运.csv（吉利女神 3级主焦煤 10,586t / 皇家印象 1级气煤 10,000t，
       按实测疏运速率 4,250 t/天 自 9-10 起陆续到厂 + 1 天检测）
  4. 马尔凯洛堆场余量 30,000t（9.8 去向文件口径，其后无确认到厂记录）
       按 4,250 t/天 自 9-10 起疏运 + 1 天检测（假设，量级对结论无影响）
  5. 铁运在途 = 无（9.9 到货 171 车已全部到厂，计入 9.10 快照）

窗口: 2026-09-10 ~ 2026-09-15（6天）
模式: [6]六天一配 / [3,3]前三后三 / [2,2,2]三段各两天
严格约束: 配合煤 Ad≤10.5, Vdaf∈[24,30], St.d≤0.90（逐段）
          焦炭 Ad_c≤13.0, S_c≤0.70（LP保守K线性化 + 最优点精确K复核，逐段）
          结构: 主焦+肥≥45%, 气煤≤15%
"""
import csv, json, os, collections, datetime, math
import numpy as np
from scipy.optimize import linprog

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, '..', 'data')

# ---------------- 1. 期初库存（9.10 去虚拟库） ----------------
INV, coal_a2 = collections.defaultdict(float), {}
with open(os.path.join(DATA, '2026.9.10库存（去虚拟库）.csv'), encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        INV[r['品名中文'].strip()] += float(r['库存量'])
        coal_a2[r['品名中文'].strip()] = r['品名代码'].strip()
coals = sorted(coal_a2)

def coal_class(name):
    if '1/3焦' in name: return '1/3焦煤'
    if '主焦' in name: return '主焦煤'
    if '贫瘦' in name: return '贫瘦煤'
    if '瘦焦' in name: return '瘦焦煤'
    if '肥' in name: return '肥煤'
    if '气' in name: return '气煤'
    return '其他'

# ---------------- 2. 质量聚合（逻辑与 preprocess.py 逐字一致） ----------------
CODE_MAP = {'G3MMQQG': '1级气煤', 'G3MMZJN': '2级瘦焦煤'}
def map_quality_name(p, code):
    if code in CODE_MAP:
        return CODE_MAP[code], CODE_MAP[code][2:]
    parts = [x.strip() for x in p.split('|')]
    cls = parts[0].replace('炼焦', '')
    if code == 'G3MMJPS1':
        return '1级贫瘦煤', '贫瘦煤'
    if cls in ('配合煤', '烟煤', '烧结无烟煤', '炼铁无烟煤', '瘦煤'):
        return None, cls
    lvl = None
    for seg in parts[1:]:
        if seg in ('1级', '2级', '3级'):
            lvl = seg; break
    if lvl:
        return f"{lvl}{cls}", cls
    if cls == '贫瘦煤' and any(seg == '国内' for seg in parts):
        return '国内贫瘦煤', cls
    if cls == '肥煤':
        return f"__{cls}", cls
    return None, cls

with open(os.path.join(DATA, '2026.9.10质量.csv'), encoding='utf-8-sig') as f:
    qrows = list(csv.DictReader(f))
agg = collections.defaultdict(lambda: collections.defaultdict(lambda: [0.0, 0.0]))
for r in qrows:
    item, val, w = r['化验项目'].strip(), r['化验值'].strip(), r['净重'].strip()
    try: v = float(val)
    except (TypeError, ValueError): continue
    try: wt = float(w)
    except (TypeError, ValueError): wt = 0.0
    key, cls = map_quality_name(r['品名'], r['品名编码'].strip())
    if key is None: continue
    if v == 0 or wt <= 0: continue
    a = agg[key][item]; a[0] += wt * v; a[1] += wt

def wavg(key, item):
    a = agg.get(key, {}).get(item)
    return round(a[0] / a[1], 3) if a and a[1] > 0 else None

quality_key = {}
for c in coals:
    if c in agg and not c.startswith('__'): quality_key[c] = c
    elif c == '1级肥煤' or c == '2级肥煤': quality_key[c] = '__肥煤'
    else: quality_key[c] = None

Q = {}
for c in coals:
    qk = quality_key.get(c)
    q = {it: wavg(qk, it) for it in ('水分', 'Ad', 'St.d', 'Vdaf')} if qk else {}
    Q[c] = q
    assert all(q.get(k) is not None for k in ('水分', 'Ad', 'St.d', 'Vdaf')), f'{c} 质量缺失: {q}'

NAMES = coals
M = len(NAMES)
CLS = {c: coal_class(c) for c in NAMES}

# ---------------- 3. 供给模型 ----------------
RATE = 4250.0      # t/天 实测日均疏运速率（马尔凯洛 812 车）
TEST = 1           # 天 检测缓冲
W0 = datetime.date(2026, 9, 10)
DAYS = 6
DATES = [W0 + datetime.timedelta(days=i) for i in range(DAYS)]

A2_TO_COAL = {v: k for k, v in coal_a2.items()}
supply = {n: np.full(DAYS, float(INV[n])) for n in NAMES}

def add_flow(coal, qty, start_day):
    """start_day(W0起第几天)开始, 每日 RATE 吨到厂, 次日可用(检测1天)"""
    rem = qty
    d = 0
    while rem > 1e-9 and start_day + d < DAYS:
        q = min(RATE, rem)
        ud = start_day + d + TEST
        for i in range(DAYS):
            if i >= ud:
                supply[coal][i] += q
        rem -= q
        d += 1

# 9.10 船运在途（数据状态=在途）
with open(os.path.join(DATA, '2026.9.10船运.csv'), encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        if r['数据状态'].strip() != '在途': continue
        coal = A2_TO_COAL.get(r['采购物料代码'].strip())
        if coal: add_flow(coal, float(r['待卸量']), 0)
# 马尔凯洛堆场余量（假设: 自 9-10 起继续按实测速率疏运）
add_flow('1级主焦煤', 30000.0, 0)

for n in NAMES:
    supply[n] = np.maximum.accumulate(supply[n])

# ---------------- 4. LP（与 v1 相同的多时段模型） ----------------
BLEND_QUALITY = {'Ad': (None, 10.5), 'Vdaf': (24.0, 30.0), 'St.d': (None, 0.90)}
COKE = {'Ad_c': 13.0, 'S_c': 0.70}
STRUCTURE = [('主焦煤+肥煤合计', ['主焦煤', '肥煤'], 45.0, 100.0),
             ('气煤', ['气煤'], 0.0, 15.0)]
K_SULFUR = 0.7
PRICES_WET = {'1级主焦煤': 1650, '2级主焦煤': 1500, '3级主焦煤': 1350, '1级肥煤': 1450,
              '2级肥煤': 1350, '1级1/3焦煤': 1250, '2级1/3焦煤': 1150, '3级1/3焦煤': 1050,
              '1级贫瘦煤': 950, '国内贫瘦煤': 900, '2级瘦焦煤': 1300, '1级气煤': 1000, '2级气煤': 950}

def price_dry(n):
    return PRICES_WET[n] / (1 - Q[n]['水分'] / 100)

HIGH_S = [n for n in NAMES if Q[n]['St.d'] > BLEND_QUALITY['St.d'][1]]

def seg_bounds(pat):
    b, s = [], 0
    for k in pat:
        b.append((s, s + k)); s += k
    return b

def solve(pat, D):
    segs = seg_bounds(pat)
    S = len(segs)
    nv = S * M
    xi = lambda s, i: s * M + i
    A_ub, b_ub, labels = [], [], []
    v_hi = BLEND_QUALITY['Vdaf'][1]
    K_cons = (100 - v_hi * 0.91) / 0.989 + 0.9
    for s in range(S):
        for k, (lo, hi) in BLEND_QUALITY.items():
            row = np.zeros(nv)
            for i, n in enumerate(NAMES):
                row[xi(s, i)] = Q[n][k] / 100
            if hi is not None:
                A_ub.append(row.copy()); b_ub.append(hi); labels.append(f'段{s+1} 配合煤{k}≤{hi}')
            if lo is not None:
                A_ub.append(-row); b_ub.append(-lo); labels.append(f'段{s+1} 配合煤{k}≥{lo}')
        rowAd, rowS = np.zeros(nv), np.zeros(nv)
        for i, n in enumerate(NAMES):
            rowAd[xi(s, i)] = Q[n]['Ad'] / 100
            rowS[xi(s, i)] = Q[n]['St.d'] / 100
        A_ub.append(rowAd); b_ub.append(COKE['Ad_c'] * K_cons / 100); labels.append(f'段{s+1} 焦炭Ad_c≤{COKE["Ad_c"]}(保守K={K_cons:.1f})')
        A_ub.append(rowS); b_ub.append(COKE['S_c'] * K_cons / 100 / K_SULFUR); labels.append(f'段{s+1} 焦炭S_c≤{COKE["S_c"]}(保守K={K_cons:.1f})')
        for name, classes, lo, hi in STRUCTURE:
            row = np.zeros(nv)
            for i, n in enumerate(NAMES):
                if CLS[n] in classes:
                    row[xi(s, i)] = 1.0
            if hi is not None and hi < 100:
                A_ub.append(row.copy()); b_ub.append(hi); labels.append(f'段{s+1} 结构:{name}≤{hi}%')
            if lo is not None and lo > 0:
                A_ub.append(-row); b_ub.append(-lo); labels.append(f'段{s+1} 结构:{name}≥{lo}%')
    for i, n in enumerate(NAMES):
        for t in range(DAYS):
            row = np.zeros(nv)
            for s, (a, b) in enumerate(segs):
                e = max(0, min(t + 1, b) - a)
                if e > 0:
                    row[xi(s, i)] = e
            if np.all(row == 0):
                continue
            A_ub.append(row); b_ub.append(100 * supply[n][t] / D); labels.append(f'库存:{n}@{DATES[t].isoformat()}')
    A_eq = np.zeros((S, nv))
    for s in range(S):
        for i in range(M):
            A_eq[s, xi(s, i)] = 1.0
    c = np.zeros(nv)
    for s, (a, b) in enumerate(segs):
        for i, n in enumerate(NAMES):
            c[xi(s, i)] = price_dry(n) * (b - a) / DAYS / 100
    res = linprog(c, A_ub=np.array(A_ub), b_ub=np.array(b_ub), A_eq=A_eq,
                  b_eq=np.full(S, 100.0), bounds=[(0, 100)] * nv, method='highs')
    return res, segs, labels, (np.array(A_ub) if A_ub else None), (np.array(b_ub) if b_ub else None)

def verify(x, segs):
    out = []
    for s, (a, b) in enumerate(segs):
        xs = np.array([x[s * M + i] for i in range(M)])
        xs = xs / xs.sum() * 100
        wq = {k: float(np.dot([Q[n][k] for n in NAMES], xs)) / 100 for k in ('Ad', 'Vdaf', 'St.d', '水分')}
        v_d = wq['Vdaf'] * (1 - wq['Ad'] / 100)
        K = (100 - v_d) / 0.989 + 0.9
        Adc = wq['Ad'] / K * 100
        Sc = wq['St.d'] * K_SULFUR / K * 100
        TOL = 1e-4
        q_ok = ((wq['Ad'] <= 10.5 + TOL) and (24.0 - TOL <= wq['Vdaf'] <= 30.0 + TOL)
                and (wq['St.d'] <= 0.90 + TOL) and (Adc <= 13.0 + TOL) and (Sc <= 0.70 + TOL))
        st = [(nm, float(sum(xs[i] for i, n2 in enumerate(NAMES) if CLS[n2] in cl)), lo, hi)
              for nm, cl, lo, hi in STRUCTURE]
        s_ok = all((lo is None or v >= lo - TOL) and (hi is None or v <= hi + TOL) for _, v, lo, hi in st)
        out.append({'seg': s + 1, 'days': f'{DATES[a].isoformat()}~{DATES[b-1].isoformat()}',
                    'x': {n: round(float(xs[i]), 2) for i, n in enumerate(NAMES) if xs[i] > 1e-6},
                    'weighted': {k: round(v, 3) for k, v in wq.items()},
                    'coke': {'K': round(K, 3), 'Ad_c': round(Adc, 3), 'S_c': round(Sc, 3)},
                    'structure': [{'name': nm, 'value': round(v, 2)} for nm, v, _, _ in st],
                    'all_pass': bool(q_ok and s_ok)})
    return out

def max_D(pat, iters=40):
    lo, hi = 100.0, 2000000.0
    r, *_ = solve(pat, lo)
    if not r.success:
        return None, None
    for _ in range(iters):
        mid = (lo + hi) / 2
        r, *_ = solve(pat, mid)
        if r.success:
            lo = mid
        else:
            hi = mid
    return lo, solve(pat, lo)

PATTERNS = {'六天一配': (6,), '前三后三': (3, 3), '二二二': (2, 2, 2)}

pool = {DATES[t].isoformat(): round(float(sum(supply[n][t] for n in NAMES)), 0) for t in range(DAYS)}
print('期初库存(9.10去虚拟库): {:,.0f} t'.format(sum(INV.values())))
print('逐日累计可用供给(吨, 含期初+可用到货):')
for d, v in pool.items():
    print(f'  {d}: {v:>12,.0f}')
print('质量档案(净重加权):')
for n in NAMES:
    q = Q[n]
    print(f"  {n:10s} Ad={q['Ad']:6.2f} Vdaf={q['Vdaf']:6.2f} St.d={q['St.d']:5.3f} 水分={q['水分']:5.2f} [{('共享池' if quality_key[n].startswith('__') else quality_key[n])}]")
print(f'高硫煤(St.d>0.9): {HIGH_S}\n')

results = {}
for name, pat in PATTERNS.items():
    dmax, solved = max_D(pat)
    entry = {'pattern': list(pat), 'D_max': round(dmax, 0) if dmax else None}
    if dmax and solved:
        r, segs, labels, A, b = solved
        x = r.x
        entry['segments'] = verify(x, segs)
        cost = sum((bb - aa) * sum(price_dry(NAMES[i]) * x[s * M + i] for i in range(M)) / 100
                   for s, (aa, bb) in enumerate(segs)) / DAYS
        entry['avgCostDry'] = round(cost, 2)
        slack = b - A @ x
        entry['tight'] = [labels[i] for i, sv in enumerate(slack) if sv < 1e-3]
    results[name] = entry
    print(f'=== {name} {pat} ===')
    if dmax and solved:
        print(f"  严格约束下六天最大日均吞吐 D_max = {dmax:,.0f} t/天, 平均干基成本 {entry['avgCostDry']} 元/吨(示例价)")
        for sg in entry['segments']:
            print(f"  段{sg['seg']} {sg['days']}: {sg['x']}")
            print(f"        配合煤 Ad={sg['weighted']['Ad']} Vdaf={sg['weighted']['Vdaf']} St.d={sg['weighted']['St.d']}"
                  f" | 焦炭 K={sg['coke']['K']} Ad_c={sg['coke']['Ad_c']} S_c={sg['coke']['S_c']} 合格={sg['all_pass']}")
        print(f"  紧约束: {entry['tight'][:10]}")
    print()

# 静态最优参考配比（库存不约束, D 取小值）
r_st, segs_st, *_ = solve((6,), 100.0)
if r_st.success:
    sv = verify(r_st.x, segs_st)[0]
    print('=== 静态最优参考配比（不考虑库存耗竭，纯质量/结构/成本最优） ===')
    print(f"  {sv['x']}")
    print(f"  配合煤 Ad={sv['weighted']['Ad']} Vdaf={sv['weighted']['Vdaf']} St.d={sv['weighted']['St.d']}"
          f" | 焦炭 Ad_c={sv['coke']['Ad_c']} S_c={sv['coke']['S_c']} 合格={sv['all_pass']}")
    cost_st = sum(price_dry(NAMES[i]) * r_st.x[i] for i in range(M)) / 100
    print(f'  干基成本 {cost_st:.2f} 元/吨(示例价)')
    results['静态最优参考'] = {'pattern': [6], 'D_max': None, 'segments': [sv],
                             'avgCostDry': round(cost_st, 2),
                             'tight': ['(库存不参与约束)']}

with open(os.path.join(HERE, 'appdata', 'analysis_6day_v2.json'), 'w', encoding='utf-8') as f:
    json.dump({'window': f'{DATES[0].isoformat()}~{DATES[-1].isoformat()}',
               'initialInventory': round(sum(INV.values()), 0),
               'supply': pool, 'highSulfur': HIGH_S,
               'quality': {n: Q[n] for n in NAMES},
               'results': results}, f, ensure_ascii=False, indent=1)
print('已写入 appdata/analysis_6day_v2.json')
