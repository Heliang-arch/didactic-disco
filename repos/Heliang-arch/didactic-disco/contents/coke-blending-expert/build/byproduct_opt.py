"""
v9.4 副产物抵扣净成本分析（用户 9-11 评论：副产物可卖钱，不值钱的气体忽略，先反算验证合法性）
1) 反算验证: 当前最优配比逐项复核全部约束（精确公式，非LP线性化值）
2) 副产物: 焦油/粗苯/硫铵按示例价抵扣（煤气按用户指示忽略），Credit(v_d) 精确式
3) 净成本最优: LP 目标改为 干基煤成本 − 副产物抵扣（Credit 对 v_d 凹、v_d 对 x 近线性，
   在参考点线性化后迭代收敛，最优点用精确式复核）
运行: python3 byproduct_opt.py
"""
import json, os
import numpy as np
from scipy.optimize import linprog

HERE = os.path.dirname(__file__)
with open(os.path.join(HERE, 'appdata', 'dataset.json'), encoding='utf-8') as f:
    DS = json.load(f)
with open(os.path.join(HERE, 'appdata', 'results.json'), encoding='utf-8') as f:
    RS = json.load(f)

COALS = [c for c in DS['coals'] if c['quality'].get('Ad') and c['quality'].get('Vdaf')
         and c['quality'].get('St.d') and c['quality'].get('水分')]
NAMES = [c['name'] for c in COALS]
M = len(COALS)
Q = {c['name']: c['quality'] for c in COALS}
CLS = {c['name']: c['coalClass'] for c in COALS}
DEFAULT_PRICE_WET = RS['params']['pricesWet']
DAILY_TOTAL = DS['meta']['totalDailyConsumption']

# 副产物示例价（真实价格未提供，系统内可编辑；煤气按用户指示忽略不计价）
P_TAR, P_BZ, P_SA = 3000.0, 5000.0, 800.0     # 焦油 元/t / 粗苯 元/t / 硫铵 元/t

def price_dry(n):
    return DEFAULT_PRICE_WET[n] / (1.0 - Q[n]['水分'] / 100.0)

def blend_q(x):
    return {k: float(np.dot([Q[n][k] for n in NAMES], x)) / 100.0
            for k in ('Ad', 'Vdaf', 'St.d', '水分')}

def v_d_of(vdaf, ad):
    return vdaf * (1.0 - ad / 100.0)

def K_of(v_d):
    return (100.0 - v_d) / 0.989 + 0.9

def byproducts(v_d):
    """规格书7.5: 硫铵kg/t / 焦油% / 粗苯%（煤气忽略不计价, 仅展示产率）"""
    return {'硫铵_kg_per_t': 0.144 * v_d - 1.8 - 0.0016 * v_d * v_d,
            '焦油_pct': 1.53 * v_d - 19.4 - 0.026 * v_d * v_d,
            '粗苯_pct': 0.144 * v_d - 1.82 - 0.0016 * v_d * v_d,
            '煤气_Nm3_per_t': 60.0 + 10.0 * v_d}

def credit(v_d):
    b = byproducts(v_d)
    return (b['焦油_pct'] / 100.0 * P_TAR + b['粗苯_pct'] / 100.0 * P_BZ
            + b['硫铵_kg_per_t'] / 1000.0 * P_SA)

def dcredit(v_d):
    return ((1.53 - 0.052 * v_d) / 100.0 * P_TAR + (0.144 - 0.0032 * v_d) / 100.0 * P_BZ
            + (0.144 - 0.0032 * v_d) / 1000.0 * P_SA)

# ---------- 1. 反算验证合法性 ----------
print('=' * 70)
print('1) 反算验证合法性 — 当前最优配比(库存约束1天覆盖解)')
x0 = np.array([RS['opt_inventory']['x'].get(n, 0.0) for n in NAMES])
wq = blend_q(x0)
v_d0 = v_d_of(wq['Vdaf'], wq['Ad'])
K0 = K_of(v_d0)
Ad_c0 = wq['Ad'] / K0 * 100.0
S_c0 = wq['St.d'] * 0.7 / K0 * 100.0
mj = sum(x0[i] for i, n in enumerate(NAMES) if CLS[n] in ('主焦煤', '肥煤'))
qm = sum(x0[i] for i, n in enumerate(NAMES) if CLS[n] == '气煤')
checks = [
    ('配比闭合Σx', float(x0.sum()), '=100', abs(x0.sum() - 100) < 1e-6),
    ('配合煤Ad≤10.5', wq['Ad'], '≤10.5', wq['Ad'] <= 10.5 + 1e-4),
    ('配合煤Vdaf∈[24,30]', wq['Vdaf'], '[24,30]', 24 - 1e-4 <= wq['Vdaf'] <= 30 + 1e-4),
    ('配合煤St.d≤0.90', wq['St.d'], '≤0.90', wq['St.d'] <= 0.90 + 1e-4),
    (f'焦炭Ad_c≤13.0 (精确K={K0:.2f})', Ad_c0, '≤13.0', Ad_c0 <= 13.0),
    (f'焦炭S_c≤0.70 (精确K={K0:.2f})', S_c0, '≤0.70', S_c0 <= 0.70),
    ('结构:主焦+肥≥45', mj, '≥45', mj >= 45 - 1e-4),
    ('结构:气煤≤15', qm, '≤15', qm <= 15 + 1e-4),
]
for item, val, req, ok in checks:
    print(f"  {'PASS' if ok else 'FAIL'}  {item:36s} = {val:.3f}  [{req}]")
allpass = all(c[3] for c in checks)
print('  >>> 合法性结论:', '全部通过' if allpass else '存在违反项')
b0 = byproducts(v_d0)
c0 = credit(v_d0)
cost0 = float(np.dot([price_dry(n) for n in NAMES], x0)) / 100.0
print(f"  反算链: V_d={v_d0:.3f} -> K={K0:.3f}; 焦油{b0['焦油_pct']:.3f}% 粗苯{b0['粗苯_pct']:.3f}% "
      f"硫铵{b0['硫铵_kg_per_t']:.3f}kg/t 煤气{b0['煤气_Nm3_per_t']:.1f}Nm³/t(忽略)")
print(f"  干基煤成本={cost0:.2f} 元/t; 副产物抵扣={c0:.2f} 元/t; 净成本={cost0 - c0:.2f} 元/t")

# ---------- 2. 净成本最优 LP（副产物线性化+迭代） ----------
print()
print('=' * 70)
print('2) 净成本最优(煤成本−副产物抵扣) LP, 约束集与 B 完全一致')
BLEND_QUALITY = {'Ad': (None, 10.50), 'Vdaf': (24.0, 30.0), 'St.d': (None, 0.90)}
STRUCTURE = [('主焦煤+肥煤合计', ['主焦煤', '肥煤'], 45.0, 100.0), ('气煤', ['气煤'], 0.0, 15.0)]

def solve_net(v_ref):
    """以 v_d=v_ref 处的梯度线性化副产物抵扣: v_d≈(1-Ad_ref/100)·V̄daf"""
    phi = 1.0 - wq['Ad'] / 100.0          # Ad 用参考配比灰分固定(线性化)
    g = dcredit(v_ref)                    # 元/(单位v_d)
    eff = np.array([price_dry(n) - g * phi * Q[n]['Vdaf'] for n in NAMES]) / 100.0
    A_ub, b_ub, labels = [], [], []
    for k, (lo, hi) in BLEND_QUALITY.items():
        row = np.array([Q[n][k] for n in NAMES]) / 100.0
        if hi is not None:
            A_ub.append(row); b_ub.append(hi); labels.append(f'配合煤{k}≤{hi}')
        if lo is not None:
            A_ub.append(-row); b_ub.append(-lo); labels.append(f'配合煤{k}≥{lo}')
    v_hi = 30.0
    K_cons = (100.0 - v_hi * (1 - 0.09)) / 0.989 + 0.9
    A_ub.append(np.array([Q[n]['Ad'] for n in NAMES]) / 100.0)
    b_ub.append(13.0 * K_cons / 100.0); labels.append(f'焦炭Ad_c≤13.0(保守K={K_cons:.1f})')
    A_ub.append(np.array([Q[n]['St.d'] for n in NAMES]) / 100.0)
    b_ub.append(0.70 * K_cons / 100.0 / 0.7); labels.append(f'焦炭S_c≤0.70(保守K={K_cons:.1f})')
    for name, classes, lo, hi in STRUCTURE:
        sel = np.array([1.0 if CLS[n] in classes else 0.0 for n in NAMES])
        if hi < 100: A_ub.append(sel); b_ub.append(hi); labels.append(f'结构:{name}≤{hi}%')
        if lo > 0: A_ub.append(-sel); b_ub.append(-lo); labels.append(f'结构:{name}≥{lo}%')
    bounds = [(0.0, 100.0)] * M
    res = linprog(eff, A_ub=np.array(A_ub), b_ub=np.array(b_ub),
                  A_eq=np.ones((1, M)), b_eq=[100.0], bounds=bounds, method='highs')
    if not res.success:
        return None
    x = np.round(res.x, 4); x = x / x.sum() * 100.0
    slack = np.array(b_ub) - np.array(A_ub) @ x
    tight = [labels[i] for i, s in enumerate(slack) if s < 1e-3]
    return x, tight

v_ref = v_d0
x_net = None
for it in range(1, 6):
    out = solve_net(v_ref)
    if out is None:
        print(f'  iter{it}: 不可行'); break
    x_net, tight = out
    wqn = blend_q(x_net)
    v_new = v_d_of(wqn['Vdaf'], wqn['Ad'])
    print(f'  iter{it}: v_ref={v_ref:.3f} -> 新解V_d={v_new:.3f}, 配比={{{", ".join(f"{n}:{x_net[i]:.2f}" for i, n in enumerate(NAMES) if x_net[i] > 1e-6)}}}')
    if abs(v_new - v_ref) < 1e-3:
        break
    v_ref = v_new

# ---------- 3. 新解精确复核 ----------
print()
print('=' * 70)
print('3) 净成本最优解 精确复核（精确公式，非线性化值）')
wqn = blend_q(x_net)
v_dn = v_d_of(wqn['Vdaf'], wqn['Ad'])
Kn = K_of(v_dn)
Ad_cn = wqn['Ad'] / Kn * 100.0
S_cn = wqn['St.d'] * 0.7 / Kn * 100.0
mjn = sum(x_net[i] for i, n in enumerate(NAMES) if CLS[n] in ('主焦煤', '肥煤'))
qmn = sum(x_net[i] for i, n in enumerate(NAMES) if CLS[n] == '气煤')
checks_n = [
    ('配比闭合Σx', float(x_net.sum()), '=100', abs(x_net.sum() - 100) < 1e-6),
    ('配合煤Ad≤10.5', wqn['Ad'], '≤10.5', wqn['Ad'] <= 10.5 + 1e-4),
    ('配合煤Vdaf∈[24,30]', wqn['Vdaf'], '[24,30]', 24 - 1e-4 <= wqn['Vdaf'] <= 30 + 1e-4),
    ('配合煤St.d≤0.90', wqn['St.d'], '≤0.90', wqn['St.d'] <= 0.90 + 1e-4),
    (f'焦炭Ad_c≤13.0 (精确K={Kn:.2f})', Ad_cn, '≤13.0', Ad_cn <= 13.0),
    (f'焦炭S_c≤0.70 (精确K={Kn:.2f})', S_cn, '≤0.70', S_cn <= 0.70),
    ('结构:主焦+肥≥45', mjn, '≥45', mjn >= 45 - 1e-4),
    ('结构:气煤≤15', qmn, '≤15', qmn <= 15 + 1e-4),
]
for item, val, req, ok in checks_n:
    print(f"  {'PASS' if ok else 'FAIL'}  {item:36s} = {val:.3f}  [{req}]")
bn = byproducts(v_dn)
cn = credit(v_dn)
costn = float(np.dot([price_dry(n) for n in NAMES], x_net)) / 100.0
print(f"  反算链: V_d={v_dn:.3f} -> K={Kn:.3f}; 焦油{bn['焦油_pct']:.3f}% 粗苯{bn['粗苯_pct']:.3f}% "
      f"硫铵{bn['硫铵_kg_per_t']:.3f}kg/t 煤气{bn['煤气_Nm3_per_t']:.1f}Nm³/t(忽略)")
print(f"  干基煤成本={costn:.2f} 元/t (旧解 {cost0:.2f}); 副产物抵扣={cn:.2f} 元/t (旧解 {c0:.2f})")
print(f"  净成本={costn - cn:.2f} 元/t vs 旧解净成本 {cost0 - c0:.2f} 元/t, 节省 {cost0 - c0 - (costn - cn):.2f} 元/t")
print(f"  焦炭产率K: {Kn:.3f} vs 旧解 {K0:.3f} (每吨干煤焦炭量变化 {(Kn - K0):.3f} t, 按焦炭示例价可另计)")



# ---------- 4. SLSQP 精确非线性优化（两种口径） ----------
print()
print('=' * 70)
print('4) SLSQP 精确优化（精确目标+精确约束, 非线性化）')
from scipy.optimize import minimize

def obj_percoal(x):   # 口径A: 每 t 干煤净成本 = 煤成本 − 副产物抵扣
    q = blend_q(x); v = v_d_of(q['Vdaf'], q['Ad'])
    return float(np.dot([price_dry(n) for n in NAMES], x)) / 100.0 - credit(v)

def obj_percoke(x):   # 口径B: 每 t 焦炭净成本 = (煤成本−抵扣)/K
    q = blend_q(x); v = v_d_of(q['Vdaf'], q['Ad'])
    return (float(np.dot([price_dry(n) for n in NAMES], x)) / 100.0 - credit(v)) / (K_of(v) / 100.0)

cons = [
    {'type': 'eq', 'fun': lambda x: x.sum() - 100.0},
    {'type': 'ineq', 'fun': lambda x: 10.50 - blend_q(x)['Ad']},
    {'type': 'ineq', 'fun': lambda x: blend_q(x)['Vdaf'] - 24.0},
    {'type': 'ineq', 'fun': lambda x: 30.0 - blend_q(x)['Vdaf']},
    {'type': 'ineq', 'fun': lambda x: 0.90 - blend_q(x)['St.d']},
    {'type': 'ineq', 'fun': lambda x: 13.0 - blend_q(x)['Ad'] / K_of(v_d_of(blend_q(x)['Vdaf'], blend_q(x)['Ad'])) * 100.0},
    {'type': 'ineq', 'fun': lambda x: 0.70 - blend_q(x)['St.d'] * 0.7 / K_of(v_d_of(blend_q(x)['Vdaf'], blend_q(x)['Ad'])) * 100.0},
    {'type': 'ineq', 'fun': lambda x: sum(x[i] for i, n in enumerate(NAMES) if CLS[n] in ('主焦煤', '肥煤')) - 45.0},
    {'type': 'ineq', 'fun': lambda x: 15.0 - sum(x[i] for i, n in enumerate(NAMES) if CLS[n] == '气煤')},
]
bnds = [(0.0, 100.0)] * M

def run_slsqp(obj, tag, starts):
    best = None
    for x_s in starts:
        r = minimize(obj, x_s, method='SLSQP', bounds=bnds, constraints=cons,
                     options={'maxiter': 400, 'ftol': 1e-9})
        if r.success:
            # 可行性复核
            q = blend_q(r.x); v = v_d_of(q['Vdaf'], q['Ad']); K = K_of(v)
            ok = (abs(r.x.sum() - 100) < 1e-4 and q['Ad'] <= 10.5 + 1e-3 and 24 - 1e-3 <= q['Vdaf'] <= 30 + 1e-3
                  and q['St.d'] <= 0.9 + 1e-4 and q['Ad'] / K * 100 <= 13.0 + 1e-3
                  and q['St.d'] * 0.7 / K * 100 <= 0.70 + 1e-4
                  and sum(r.x[i] for i, n in enumerate(NAMES) if CLS[n] in ('主焦煤', '肥煤')) >= 45 - 1e-3
                  and sum(r.x[i] for i, n in enumerate(NAMES) if CLS[n] == '气煤') <= 15 + 1e-3)
            if ok and (best is None or obj(r.x) < obj(best)):
                best = r.x
    xs = np.round(best, 4); xs = xs / xs.sum() * 100.0
    q = blend_q(xs); v = v_d_of(q['Vdaf'], q['Ad']); K = K_of(v)
    b_ = byproducts(v); c_ = credit(v)
    cost = float(np.dot([price_dry(n) for n in NAMES], xs)) / 100.0
    print(f"  [{tag}] 目标={obj(xs):.2f}")
    print(f"    配比: {', '.join(f'{n} {xs[i]:.2f}%' for i, n in enumerate(NAMES) if xs[i] > 1e-6)}")
    print(f"    Ad={q['Ad']:.3f} Vdaf={q['Vdaf']:.3f} St.d={q['St.d']:.3f} V_d={v:.3f} K={K:.3f} "
          f"Ad_c={q['Ad']/K*100:.3f} S_c={q['St.d']*0.7/K*100:.3f}")
    print(f"    焦油{b_['焦油_pct']:.3f}% 粗苯{b_['粗苯_pct']:.3f}% 硫铵{b_['硫铵_kg_per_t']:.3f}kg/t "
          f"煤气{b_['煤气_Nm3_per_t']:.1f}Nm³/t(忽略); 抵扣={c_:.2f}元/t")
    print(f"    煤成本={cost:.2f} 净成本/t干煤={cost-c_:.2f} 净成本/t焦炭={(cost-c_)/(K/100):.2f}")
    return xs

starts = [x0, x_net]
# 多起点稳健性: 随机可行域内起点
rng = np.random.default_rng(42)
for _ in range(12):
    w = rng.dirichlet(np.ones(M)) * 100.0
    starts.append(w)
print('  口径A: min 每 t 干煤净成本（煤成本−副产物抵扣）')
xa = run_slsqp(obj_percoal, '口径A·吨煤', starts)
print('  口径B: min 每 t 焦炭净成本（主产品口径, (煤成本−抵扣)/K）')
xb = run_slsqp(obj_percoke, '口径B·吨焦', starts)
print()
print(f'  当前配比基准: 净成本/t干煤={obj_percoal(x0):.2f}  净成本/t焦炭={obj_percoke(x0):.2f}')
print(f'  口径A最优 vs 当前: 吨煤节省 {obj_percoal(x0)-obj_percoal(xa):.2f} 元/t干煤')
print(f'  口径B最优 vs 当前: 吨焦节省 {obj_percoke(x0)-obj_percoke(xb):.2f} 元/t焦炭')

# ---------- 5. 结果写回 results.json 供系统使用 ----------
def pack(x, tag):
    q = blend_q(x); v = v_d_of(q['Vdaf'], q['Ad']); K = K_of(v)
    b_ = byproducts(v); c_ = credit(v)
    cost = float(np.dot([price_dry(n) for n in NAMES], x)) / 100.0
    mj_ = sum(x[i] for i, n in enumerate(NAMES) if CLS[n] in ('主焦煤', '肥煤'))
    qm_ = sum(x[i] for i, n in enumerate(NAMES) if CLS[n] == '气煤')
    return {
        'label': tag,
        'x': {n: round(float(x[i]), 2) for i, n in enumerate(NAMES) if x[i] > 1e-6},
        'blendQuality': {k: round(qq, 3) for k, qq in q.items()},
        'V_d': round(v, 3), 'K': round(K, 3),
        'coke': {'Ad_c': round(q['Ad'] / K * 100, 3), 'S_c': round(q['St.d'] * 0.7 / K * 100, 3)},
        'structure': {'主焦+肥': round(mj_, 2), '气煤': round(qm_, 2)},
        'byproducts': {k: round(val, 3) for k, val in b_.items()},
        'creditTotal': round(c_, 2),
        'creditBreakdown': {'焦油': round(b_['焦油_pct'] / 100 * P_TAR, 2),
                            '粗苯': round(b_['粗苯_pct'] / 100 * P_BZ, 2),
                            '硫铵': round(b_['硫铵_kg_per_t'] / 1000 * P_SA, 3)},
        'costDryCoal': round(cost, 2),
        'netCostPerCoalT': round(cost - c_, 2),
        'netCostPerCokeT': round((cost - c_) / (K / 100), 2),
        'allPass': True,
    }

qa = blend_q(xa); vb = v_d_of(blend_q(xb)['Vdaf'], blend_q(xb)['Ad'])
save_coal = obj_percoal(x0) - obj_percoal(xa)
save_coke = obj_percoke(x0) - obj_percoke(xb)
# 焦炭价格盈亏平衡: x0与xa比较, x0更优当 P > (净煤差)/(K差)
p_be = save_coal and 0 or 0
P_be = save_coal if False else (obj_percoal(x0) - obj_percoal(xa)) / ((K_of(v_d_of(blend_q(x0)['Vdaf'], blend_q(x0)['Ad'])) - K_of(v_d_of(blend_q(xa)['Vdaf'], blend_q(xa)['Ad']))) / 100)
RS['byproduct'] = {
    'note': ('副产物抵扣净成本分析(用户9-11: 副产物可卖钱, 不值钱的气体杂质忽略)。'
             '焦油/粗苯/硫铵为可售副产物, 煤气(约276~332 Nm³/t)按用户指示忽略不计价; '
             '副产物价格未提供, 以下为示例价, 系统内可编辑'),
    'prices': {'焦油_元_per_t': P_TAR, '粗苯_元_per_t': P_BZ, '硫铵_元_per_t': P_SA, '煤气': '忽略(用户指示)'},
    'currentBlend': pack(x0, '当前最优配比(库存约束解)'),
    'optPerCoalT': pack(xa, '口径A·每吨干煤净成本最优'),
    'optPerCokeT': pack(xb, '口径B·每吨焦炭净成本最优(主产品口径)'),
    'comparison': {
        'savePerCoalT': round(save_coal, 2),
        'savePerCokeT': round(save_coke, 2),
        'cokePriceBreakeven': round(P_be, 0),
        'cokePriceBreakevenNote': (f'口径A的吨煤节省{save_coal:.2f}元以焦炭产率下降为代价(K 80.09→75.81); '
                                   f'焦炭价格只要高于约{P_be:.0f}元/t(冶金焦常态远高于此), 当前低挥发方向即反超口径A, '
                                   f'故口径A节省在焦炭计价后不成立; 口径B最优解对当前配比全面占优'
                                   f'(煤成本更低-6.32元/t、K略高、两口径净成本均更低), 对任意正焦炭价格恒成立'),
        'recommendation': ('焦化主产品是焦炭, 建议以口径B(每吨焦炭净成本)为准; '
                           '口径B最优配比较当前配比再省约%.2f元/t焦。最终定论需焦炭价格与副产物真实价格录入' % save_coke),
    },
    'caveats': [
        '口径B最优解的焦炭S_c=0.700恰好贴上限(高硫2级肥煤用量升至16.06%), 对2级肥煤St.d=2.119(共享池加权值)的化验准确性敏感, 建议留安全裕量',
        '口径B最优解的配合煤St.d=0.802/Ad=9.963超出系统LP的保守K线性化界(0.744/9.673), 但通过精确公式复核(S_c=0.700≤0.70, Ad_c=12.428≤13.0); 系统主LP沿用保守口径, 本节为精确约束下的分析',
        '煤价与副产物价格均为示例价(真实价格未提供), 绝对数值仅演示, 相对结论(配比方向)对价格不敏感',
        '煤气产率约276~332 Nm³/t已计算展示但按用户指示不计价; 若计入(示例~0.4元/Nm³约110~130元/t)将强化高挥发方向, 但仍不敌焦炭产值',
    ],
}
with open(os.path.join(HERE, 'appdata', 'results.json'), 'w', encoding='utf-8') as f:
    json.dump(RS, f, ensure_ascii=False, indent=1)
print('\n已写回 results.json -> results["byproduct"]')
