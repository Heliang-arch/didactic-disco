# -*- coding: utf-8 -*-
"""六天配煤方案分析（独立脚本，不改动 solver / 系统数据）
窗口: 2026-09-10 ~ 2026-09-15（6天，自今日起）
模式: [6]六天一配 / [3,3]前三后三 / [2,2,2]三段各两天
严格约束: 配合煤 Ad≤10.5, Vdaf∈[24,30], St.d≤0.90（逐段）
          焦炭 Ad_c≤13.0, S_c≤0.70（LP保守K线性化 + 最优点精确K复核，逐段）
库存约束: 逐煤种逐日累计  Σ_段 x_i·该段已耗天数 ≤ 100·累计可用供给/D
供给: 9.8快照为期初库存 + 窗口内可用到货
      （铁运清水河批 9-10 可用；三船按实测疏运速率 4,250t/天 自 9-10 起陆续到厂，+1天检测）
"""
import json, os, datetime
import numpy as np
from scipy.optimize import linprog

HERE = os.path.dirname(__file__)
DS = json.load(open(os.path.join(HERE, 'appdata', 'dataset.json'), encoding='utf-8'))

BLEND_QUALITY = {'Ad': (None, 10.5), 'Vdaf': (24.0, 30.0), 'St.d': (None, 0.90)}
COKE = {'Ad_c': 13.0, 'S_c': 0.70}
STRUCTURE = [('主焦煤+肥煤合计', ['主焦煤', '肥煤'], 45.0, 100.0),
             ('气煤', ['气煤'], 0.0, 15.0)]
K_SULFUR = 0.7
PRICES_WET = {'1级主焦煤': 1650, '2级主焦煤': 1500, '3级主焦煤': 1350, '1级肥煤': 1450,
              '2级肥煤': 1350, '1级1/3焦煤': 1250, '2级1/3焦煤': 1150, '3级1/3焦煤': 1050,
              '1级贫瘦煤': 950, '国内贫瘦煤': 900, '2级瘦焦煤': 1300, '1级气煤': 1000, '2级气煤': 950}

COALS = [c for c in DS['coals'] if all(c['quality'].get(k) is not None for k in ('Ad', 'Vdaf', 'St.d', '水分'))]
NAMES = [c['name'] for c in COALS]
M = len(COALS)
Q = {c['name']: c['quality'] for c in COALS}
INV = {c['name']: c['latestInventory'] for c in COALS}
CLS = {c['name']: c['coalClass'] for c in COALS}
RATE = DS['meta']['dailyRailRate']          # 4250 t/天 实测疏运速率
TEST = DS['meta']['testDays']               # 1 天检测
W0 = datetime.date(2026, 9, 10)
DAYS = 6
DATES = [W0 + datetime.timedelta(days=i) for i in range(DAYS)]

def price_dry(n):
    return PRICES_WET[n] / (1 - Q[n]['水分'] / 100)

# ---- 累计可用供给（期初 + 窗口内可用到货，逐日累计） ----
supply = {n: np.full(DAYS, float(INV[n])) for n in NAMES}
for r in DS['rails']:
    if not r.get('coal'):
        continue
    ud = datetime.date.fromisoformat(r['usableDate'])
    for i, d in enumerate(DATES):
        if d >= ud:
            supply[r['coal']][i] += r['qty']
for s in DS['ships']:
    if not s.get('coal'):
        continue
    rem, dd = s['qty'], W0
    while rem > 1e-9 and dd <= DATES[-1]:
        ud = dd + datetime.timedelta(days=TEST)
        q = min(RATE, rem)
        for i, d in enumerate(DATES):
            if d >= ud:
                supply[s['coal']][i] += q
        rem -= q
        dd += datetime.timedelta(days=1)
for n in NAMES:
    supply[n] = np.maximum.accumulate(supply[n])

HIGH_S = [n for n in NAMES if Q[n]['St.d'] > BLEND_QUALITY['St.d'][1]]

# ---- 多时段 LP ----
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
    lo, hi = 100.0, 400000.0
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
print('逐日累计可用供给(吨, 含期初+可用到货):')
for d, v in pool.items():
    print(f'  {d}: {v:>12,.0f}')
print(f'高硫煤(St.d>0.9, 仅可微量参与): {HIGH_S}')
print(f'日需求(毛口径): {DS["meta"]["totalDailyConsumption"]:,.0f} t/天\n')

results = {}
for name, pat in PATTERNS.items():
    r_gross, *_ = solve(pat, DS['meta']['totalDailyConsumption'])
    dmax, solved = max_D(pat)
    entry = {'pattern': list(pat), 'gross_feasible': bool(r_gross.success),
             'D_max': round(dmax, 0) if dmax else None}
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
    print(f"  毛口径185,303t/天可行: {r_gross.success}")
    if dmax and solved:
        print(f"  严格约束下六天最大日均吞吐 D_max = {dmax:,.0f} t/天, 平均干基成本 {entry['avgCostDry']} 元/吨(示例价)")
        for sg in entry['segments']:
            print(f"  段{sg['seg']} {sg['days']}: {sg['x']}")
            print(f"        配合煤 Ad={sg['weighted']['Ad']} Vdaf={sg['weighted']['Vdaf']} St.d={sg['weighted']['St.d']}"
                  f" | 焦炭 K={sg['coke']['K']} Ad_c={sg['coke']['Ad_c']} S_c={sg['coke']['S_c']} 合格={sg['all_pass']}")
        print(f"  紧约束: {entry['tight'][:10]}")
    print()

with open(os.path.join(HERE, 'appdata', 'analysis_6day.json'), 'w', encoding='utf-8') as f:
    json.dump({'window': f'{DATES[0].isoformat()}~{DATES[-1].isoformat()}',
               'supply': pool, 'highSulfur': HIGH_S, 'results': results}, f, ensure_ascii=False, indent=1)
print('已写入 appdata/analysis_6day.json')
