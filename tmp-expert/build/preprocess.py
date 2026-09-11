# -*- coding: utf-8 -*-
"""
焦化厂配煤专家系统 — 数据预处理 v9.3（9.11 决策落地）
输入: data/ 下 9.10库存（去虚拟库）、9.11质量、9.11船运、9.11铁运在途、
      9.9铁运进厂（带船名）、9.10铁运进厂、马尔凯洛去向、船运五天履历、
      历史船运完成情况、9.2~9.9旧口径库存序列(降级为仅参考)
输出: appdata/dataset.json — 系统主数据

v9.3 口径变更（2026-09-11 用户决策确认 + 上传《2026.9.10铁运进厂情况.csv》）:
  1. 库存锚点改用 9.10 去虚拟库快照(205.5万吨): 用户决策"这份9.10数据是对的，直接采用"
     （此前 v9.2 曾判异常排除, 现纠正）。9.9快照(24.87万吨, 与9.10差8.3倍且结构一致)
     疑为不完整导出, 连同 9.2~9.8 旧序列整体降级为仅参考。
  2. 台账关联改按采购订单号(用户决策"主要看采购订单号, 船名比较次要"):
     9.10台账无船名列, 订单号打通船-铁关联——马尔凯洛=订单450018958200010/450018597000010
     (9.9疏运3,016+9.10疏运3,730, 堆场余量30,000-6,746=23,254t);
     清水河=订单450018317200010(9.9疏运3,367+9.10疏运1,565, 9.11在途防城港3,221t为其续疏运,
     总待卸量未知); 吉利女神双航次按订单号4500187795/4500190072分别跟踪。
  3. 日耗校准升级为两日均值: 9.9到厂15,821t + 9.10到厂17,223t → 16,522t/天
     (两份全天完整台账, 库存平稳假设)。
  4. 9.10到厂17,223t/254车已计入9.10库存快照, 排程不重复计到货;
     排程自9-12起, 9.11按库存平稳假设净零桥接, 9.11在途6,272t计入9-12到货。

v9.2 口径变更（2026-09-11 用户上传 9.11船运/9.11铁运在途/9.11质量/9.10库存 四份文件）:
  1. 库存: 9.10库存（去虚拟库）总量205.5万吨=9.9锚点的8.3倍、各煤种膨胀5.4~15.8倍,
     与9.2~9.8序列及前一版9.10导出(95.6万)均矛盾, 判定异常导出; 用户确认"不更新了"
     ——不采用、不等重传, 库存继续沿用 9.9 锚点。
  2. 船运: 9.11清单3条在途——吉利女神双航次(8-14首航10,586t + 9-09新航次10,000t
     同时标"在途", 物理上不可能, 按状态均建模在途并标注矛盾待核实) + 皇家印象
     (8-26启运, 已超印尼线最长航程14天, 标注核实)。用户备注该清单数据可能滞后一天。
  3. 铁运在途: 换用 9.11铁运在途.csv(93车6,272t全部在途, 制表9-11 00:00, 当日到厂,
     检测1天后可用); 该文件无船名列, 按发站分类: 防城港3,221t=港口堆场疏运(承接
     清水河口径, 1级主焦煤), 瓦窑田/柏果/松河=矿山直达。
  4. 马尔凯洛堆场余量: 订单余额口径扣减仍截至9.9台账(30,000-3,016=26,984t),
     9.10起无带船名到厂台账, 未再扣减(实际余量应更低), 待台账补充。
  5. 日耗校准: 9.9带船名台账(15,821t/234车)仍为最新全天完整口径, 沿用。

v9.1 口径变更（用户 2026-09-10 上传"2026.9.9铁运进厂情况（带船名）.csv"确认
     "根据以上铁运信息完善逻辑"）:
  1. 日耗校准换用带船名全天完整台账: 9.9 实际到厂 15,821t/234车（旧文件 11,599t
     为不完整日内快照, 已废弃）。按船名/发站分解: 港口疏运 6,383t（清水河经防城港
     3,367t + 马尔凯洛经铁山港 3,016t, 均带船名）/ 矿山直达 9,438t（无船名,
     花家庄/宝丰/威箐等发站）。
  2. 港口堆场余量改订单余额口径: 履历最后待卸量 - 履历日后带该船名的实际铁路到厂量
     （马尔凯洛: 30,000 - 9.9实疏3,016 = 26,984t; 订单总 85,244 = 去向累计55,244
     + 履历待卸30,000, 至9.9累计交付58,260t）。替代旧"速率×天数"估算。
  3. 铁运在途以台账"在途状态"列驱动（只认制表_发出时间, 约1小时当日到厂）;
     9.9 台账 234 车全部已到厂, 无在途批。

v9 口径变更（用户 2026-09-10 确认）:
  1. 期初库存 = 2026.9.9（去虚拟库）库存.csv（13煤种合计约24.9万吨）。
     9.10 库存文件数据有误已废弃；库存只能读取前一天（T-1）快照。
     旧 9.2~9.8 快照序列为含虚拟库的另一口径（总量约为新口径 1/4），
     仅作 legacy 参考序列保留，不再用于消耗计算。
  2. 由此前口径推出的"毛消耗 185,303 t/天"作废。日耗改为到货校准估计:
     9.9 铁运到货台账全口径实测 11,599 t（171车，含防城港疏运 3,367t），
     按库存平稳假设 日耗 ≈ 11,599 t/天；煤种结构=近两个月到货台账净重占比。
     待持续到货台账校准。
  3. 质量档案 = 2026.9.10质量.csv（滚动窗口 7.10~9.8）。
  4. 船运在途 = 2026.9.10船运.csv（吉利女神 3级主焦煤 10,586t / 皇家印象 1级气煤 10,000t）;
     马尔凯洛清单消失=卸船完毕，堆场余量 30,000t 继续疏运。
  5. 铁运在途 = 无（9.9 在途清水河批已全部到厂并计入 9.10 快照）。
"""
import csv, json, collections, datetime, os
DATA = os.path.join(os.path.dirname(__file__), '..', 'data')
OUT = os.path.join(os.path.dirname(__file__), 'appdata')
os.makedirs(OUT, exist_ok=True)

TODAY = datetime.date(2026, 9, 11)
# 煤场代码 -> 名称（用户确认: 实际库存以煤场库存为准）
AREA_NAMES = {'LJM1': '一煤场', 'LJM4': '四煤场', 'LJM5': '五煤场', 'BFM5': 'A2料场'}
TEST_DAYS = 1   # 进厂后检测缓冲

# ---------------- 1. 库存 ----------------
# 1.1 当前口径: 9.10 去虚拟库（用户 2026-09-11 决策确认"这份9.10数据是对的，直接采用"）
SNAP = '2026-09-10'
INV_SUPERSEDED = {'date': '2026-09-09', 'totalT': 248690.6,
                  'reason': ('9.9快照24.87万吨与用户确认正确的9.10(205.5万吨)差8.3倍且库区结构一致, '
                             '疑9.9为不完整导出; 9.9连同9.2~9.8旧序列降级为仅参考')}
inv = {SNAP: collections.defaultdict(float)}   # date -> {coal: qty}
coal_a2 = {}      # coal -> A2 code
coal_areas = collections.defaultdict(lambda: collections.defaultdict(float))
with open(os.path.join(DATA, '2026.9.10库存（去虚拟库）.csv'), encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        name = r['品名中文'].strip()
        q = float(r['库存量'])
        inv[SNAP][name] += q
        coal_a2[name] = r['品名代码'].strip()
        coal_areas[name][r['库区代码'].strip()] += q
inv = {d: dict(v) for d, v in inv.items()}
coals = sorted(coal_a2)

# 1.2 旧口径序列 9.2~9.9（含虚拟库/疑不完整导出，仅参考）
legacy_dates = [f"2026-09-0{d}" for d in range(2, 10)]
legacy_inv = {}
for d, date in zip(range(2, 10), legacy_dates):
    fname = '2026.9.9（去虚拟库）库存.csv' if d == 9 else f"2026.9.{d}库存.csv"
    with open(os.path.join(DATA, fname), encoding='utf-8-sig') as f:
        dd = collections.defaultdict(float)
        for r in csv.DictReader(f):
            dd[r['品名中文'].strip()] += float(r['库存量'])
        legacy_inv[date] = dict(dd)

def coal_class(name):
    if '1/3焦' in name: return '1/3焦煤'
    if '主焦' in name: return '主焦煤'
    if '贫瘦' in name: return '贫瘦煤'
    if '瘦焦' in name: return '瘦焦煤'
    if '肥' in name: return '肥煤'
    if '气' in name: return '气煤'
    return '其他'

# ---------------- 2. 质量数据映射与加权聚合（与 v6 逻辑一致） ----------------
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

with open(os.path.join(DATA, '2026.9.11质量.csv'), encoding='utf-8-sig') as f:   # 滚动窗口 7.11~9.10
    qrows = list(csv.DictReader(f))

agg = collections.defaultdict(lambda: collections.defaultdict(lambda: [0.0, 0.0]))
cnt = collections.defaultdict(collections.Counter)
import_share = collections.defaultdict(lambda: [0.0, 0.0])
unmapped_cnt = collections.Counter()
for r in qrows:
    item, val, w = r['化验项目'].strip(), r['化验值'].strip(), r['净重'].strip()
    try:
        v = float(val)
    except (TypeError, ValueError):
        unmapped_cnt[f"化验值异常:{r['品名']}|{item}"] += 1
        continue
    try:
        wt = float(w)
    except (TypeError, ValueError):
        wt = 0.0
    key, cls = map_quality_name(r['品名'], r['品名编码'].strip())
    if key is None:
        unmapped_cnt[r['品名']] += 1
        continue
    if v == 0 or wt <= 0:
        cnt[key][item + '#剔除'] += 1
        continue
    a = agg[key][item]
    a[0] += wt * v; a[1] += wt
    cnt[key][item] += 1
    if '进口' in r['品名']:
        import_share[key][0] += 1
    import_share[key][1] += 1

def wavg(key, item):
    a = agg.get(key, {}).get(item)
    return round(a[0] / a[1], 3) if a and a[1] > 0 else None

quality_key = {}
for c in coals:
    if c in agg and not c.startswith('__'):
        quality_key[c] = c
    elif c == '1级肥煤' or c == '2级肥煤':
        quality_key[c] = '__肥煤'
    else:
        quality_key[c] = None

Q = {}
for c in coals:
    qk = quality_key.get(c)
    Q[c] = {it: wavg(qk, it) for it in ('水分', 'Ad', 'St.d', 'Vdaf')} if qk else {}

# ---------------- 3. 日耗估计（到货校准） ----------------
# 3.1 铁运进厂台账（全天完整口径, 现有 9.9带船名 + 9.10 两份; 9.11台账未提供）
#     港口疏运判据统一按发站: 防城港/铁山港=港口堆场疏运, 其余=矿山直达
#     船-铁关联按采购订单号(用户9-11决策"主要看采购订单号, 船名比较次要";
#     9.10台账无船名列, 订单号可精确关联到船)
A2_TO_COAL = {v: k for k, v in coal_a2.items()}
PORT_STATIONS = {'防城港', '铁山港'}
rail_rows = []      # 全量行(9.9+9.10), 供 4.2 堆场按订单号扣减
day_stats = {}      # date -> 当日到货统计
for _fname, _date in (('2026.9.9铁运进厂情况（带船名）.csv', '2026-09-09'),
                      ('2026.9.10铁运进厂情况.csv', '2026-09-10')):
    st = {'total': 0.0, 'cars': 0, 'byCoal': collections.defaultdict(float),
          'byStation': collections.defaultdict(float), 'byPO': collections.defaultdict(float),
          'port': 0.0, 'mine': 0.0}
    with open(os.path.join(DATA, _fname), encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            try:
                w = float(r['货票重量'] or 0)
            except ValueError:
                continue
            ship = (r.get('船名') or '').strip()
            stn = r['发站名称'].strip()
            a2 = r['采购物料代码'].strip()
            po = r['采购订单号'].strip()
            state = r['在途状态'].strip()
            try:
                arrive = datetime.datetime.strptime(r['到厂_进厂交接时间'], '%Y%m%d%H%M%S')
            except (TypeError, ValueError):
                arrive = None
            rail_rows.append({'ship': ship, 'station': stn, 'a2': a2, 'po': po, 'qty': w,
                              'state': state, 'arrive': arrive})
            if state != '已到厂':
                continue    # 在途批不计入当日到货
            st['total'] += w; st['cars'] += 1
            st['byCoal'][A2_TO_COAL.get(a2, a2)] += w
            st['byStation'][stn] += w
            st['byPO'][f"{po}|{stn}"] += w
            if stn in PORT_STATIONS:
                st['port'] += w
            else:
                st['mine'] += w
    day_stats[_date] = st
arr_days = sorted(day_stats)
DAILY_TOTAL = sum(day_stats[d]['total'] for d in arr_days) / len(arr_days)
# 兼容下游引用(最新一天)
arr_total = day_stats[arr_days[-1]]['total']; arr_cars = day_stats[arr_days[-1]]['cars']
arr_port = day_stats[arr_days[-1]]['port']; arr_mine = day_stats[arr_days[-1]]['mine']

# 3.2 煤种消耗结构 = 近两个月到货台账(7.11~9.10)净重占比
#     （库存平稳假设下长出到货结构≈消耗结构；与当前库存结构交叉印证：主焦煤类均约51%）
#     记录级去重（每条到货含多项化验行）；肥煤共享池按 1级/2级 当前库存比例拆分
_seen = set()
_mix_raw = collections.defaultdict(float)
for r in qrows:
    key = (r['单位'], r['品名'], r['船名'], r['发站'], r['进厂时间'], r['净重'], r['状态'])
    if key in _seen:
        continue
    _seen.add(key)
    try:
        w = float(r['净重'])
    except (TypeError, ValueError):
        continue
    k = map_quality_name(r['品名'], r['品名编码'].strip())[0]
    if k:
        _mix_raw[k] += w
_ffm_tot = inv[SNAP].get('1级肥煤', 0) + inv[SNAP].get('2级肥煤', 0)
_ffm1_share = inv[SNAP].get('1级肥煤', 0) / _ffm_tot if _ffm_tot > 0 else 0.5
mix = {c: 0.0 for c in coals}
for k, w in _mix_raw.items():
    if k == '__肥煤':
        mix['1级肥煤'] += w * _ffm1_share
        mix['2级肥煤'] += w * (1 - _ffm1_share)
    elif k in mix:
        mix[k] += w
    # 其余(如1级瘦焦煤, 库存无此煤种)不计入
_mix_tot = sum(mix.values())
mix = {c: w / _mix_tot * 100.0 for c, w in mix.items()}
daily_con = {c: DAILY_TOTAL * mix[c] / 100.0 for c in coals}

# ---------------- 4. 在途到货时间线（v6 模型，数据源更新至 9.10） ----------------
import math
def add_days(base, n):
    return (base + datetime.timedelta(days=n)).isoformat()

# 4.1 马尔凯洛去向 -> 实测疏运速率
hist_rows = []
with open(os.path.join(DATA, '马尔凯洛去向2026.9.8.csv'), encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        try:
            q = float(r['货票重量'])
            arr = datetime.datetime.strptime(r['到厂_进厂交接时间'], '%Y%m%d%H%M%S')
            dep = datetime.datetime.strptime(r['制表_发出时间'], '%Y%m%d%H%M%S')
        except (TypeError, ValueError):
            continue
        hist_rows.append({'carNo': r['铁路车号'], 'qty': q, 'depart': dep, 'arrive': arr,
                          'minutes': (arr - dep).total_seconds() / 60.0,
                          'po': r['采购订单号'].strip()})
hist_total = sum(h['qty'] for h in hist_rows)
span_days = (max(h['arrive'] for h in hist_rows).date()
             - min(h['arrive'] for h in hist_rows).date()).days or 1
RATE = hist_total / span_days
_mins = sorted(h['minutes'] for h in hist_rows)
RAIL_MIN_MED = _mins[len(_mins) // 2]
MK_POS = {h['po'] for h in hist_rows if h['po']}   # 马尔凯洛名下全部采购订单号

arrivals_history = {
    'shipName': '马尔凯洛', 'coal': '1级主焦煤',
    'totalIn': round(hist_total, 1), 'cars': len(hist_rows),
    'firstArrive': min(h['arrive'] for h in hist_rows).strftime('%Y-%m-%d'),
    'lastArrive': max(h['arrive'] for h in hist_rows).strftime('%Y-%m-%d'),
    'spanDays': span_days, 'dailyRailRate': round(RATE, 0),
    'railTransitMinutesMedian': round(RAIL_MIN_MED, 0),
}

# 4.2 船运: 9.11 清单在途(含吉利女神双航次) + 五天履历中消失的船(余量转港口堆场)
cur_rows = []
with open(os.path.join(DATA, '2026.9.11船运.csv'), encoding='utf-8-sig') as f:
    cur_rows = [r for r in csv.DictReader(f) if r['数据状态'].strip() == '在途']
cur_names = {r['船名'].strip() for r in cur_rows}
_voyage_cnt = collections.Counter(r['船名'].strip() for r in cur_rows)
last_seen = {}
with open(os.path.join(DATA, '船运五天内的履历时间.csv'), encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        nm, rt = r['船名'], r['履历时间'][:10]
        try: q = float(r['待卸量'])
        except (TypeError, ValueError): q = 0.0
        if nm not in last_seen or rt > last_seen[nm][0]:
            last_seen[nm] = (rt, q, r)

# 4.2 船运 v8 模型: 在途=船在海上未到港; 到港预测=启运日+分航线历史航程分布;
#     到港->首批进厂滞后 3~8 天(历史交叉验证); 到港后堆场疏运 RATE t/天; 检测 TEST_DAYS 天
_vgroups = collections.defaultdict(lambda: {'s': None, 'e': None, 'mat': ''})
with open(os.path.join(DATA, '历史船运完成情况.csv'), encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        key = (r['船名'], r['采购订单号_合同编码'], r['采购订单行项目号'])
        g = _vgroups[key]; g['mat'] = r['物料名称']
        if r['在途开始时间'] and (g['s'] is None or r['在途开始时间'] < g['s']):
            g['s'] = r['在途开始时间']
        if r['在途结束时间'] and (g['e'] is None or r['在途结束时间'] > g['e']):
            g['e'] = r['在途结束时间']

def _norm_country(mat):
    """从物料名称全文识别起运国（格式不统一: 主焦煤|3级|进口|澳洲|Daunia / 气煤|进口|印尼|KSM）"""
    for kw, c in (('澳大利亚', '澳洲'), ('澳洲', '澳洲'), ('加拿大', '加拿大'), ('印尼', '印尼'),
                  ('印度尼西亚', '印尼'), ('KSM', '印尼'), ('蒙古', '蒙古'), ('美国', '美国'),
                  ('哥伦', '哥伦比亚'), ('俄罗斯', '俄罗斯'), ('埃尔加', '俄罗斯')):
        if kw in mat:
            return c
    parts = {p.strip() for p in mat.split('|')}
    if parts & {'AEJ', 'E', 'GZHO', 'ZH', 'KZBS', 'YNL', 'PANACAPE GZH'}:
        return '俄罗斯E矿系'
    return '其他'

_vby = collections.defaultdict(list)
for (nm, po, ln), g in _vgroups.items():
    if not g['s'] or not g['e']: continue
    dd = (datetime.datetime.fromisoformat(g['e']) - datetime.datetime.fromisoformat(g['s'])).days
    parts = g['mat'].split('|')
    c = _norm_country(g['mat'])
    if 5 <= dd <= 40:      # 清洗: <5天=到港后才建单, >40天=多航次串扰
        _vby[c].append(dd)
VOYAGE_STATS = {}
for c, ds in _vby.items():
    ds.sort(); n = len(ds)
    VOYAGE_STATS[c] = {'n': n,
                       'median': round(ds[n // 2] if n % 2 else (ds[n // 2 - 1] + ds[n // 2]) / 2, 1),
                       'p25': ds[int(n * 0.25)], 'p75': ds[min(int(n * 0.75), n - 1)],
                       'min': ds[0], 'max': ds[-1]}
LAG_LO, LAG_HI = 3, 8    # 到港->首批进厂滞后(天)

ships = []
def push_ship_sea(nm, r, qty):
    a2 = r['采购物料代码'].strip()
    parts = r['物料名称'].split('|')
    country = _norm_country(r['物料名称'])
    start = datetime.datetime.fromisoformat(r['在途开始时间']).date()
    days_ship = int(math.ceil(qty / RATE)) if qty > 0 else 0
    rec = {'shipName': nm, 'material': r['物料名称'], 'qty': qty, 'phase': 'atSea',
           'po': (r.get('采购订单号_合同编码') or '').strip(),
           'g3': r['物料品名代码'], 'a2': a2, 'coal': A2_TO_COAL.get(a2),
           'country': country, 'mine': parts[4] if len(parts) > 4 else '',
           'depart': r['在途开始时间'], 'elapsedDays': (TODAY - start).days,
           'daysNeed': days_ship}
    st = VOYAGE_STATS.get(country)
    if st:
        eta_med = start + datetime.timedelta(days=int(st['median']))
        eta_max = start + datetime.timedelta(days=st['max'])
        port_ref = max(eta_med, TODAY)
        first_lo = port_ref + datetime.timedelta(days=LAG_LO)
        first_hi = max(eta_max, TODAY) + datetime.timedelta(days=LAG_HI)
        eta_plant = first_hi + datetime.timedelta(days=days_ship)   # 全部到厂日(首批+疏运天数)
        rec.update({
            'voyage': st,
            'etaPort': eta_med.isoformat(), 'etaPortMax': eta_max.isoformat(),
            'etaFirst': f'{first_lo.isoformat()}~{first_hi.isoformat()}',
            'etaPlant': eta_plant.isoformat(),
            'usableAll': (eta_plant + datetime.timedelta(days=TEST_DAYS)).isoformat(),
            'overMax': bool(TODAY > eta_max),
            'note': (f"v8: 在途=海上; {country}航线历史航程中位{st['median']}天/最长{st['max']}天"
                     f"(n={st['n']}); 到港后{LAG_LO}~{LAG_HI}天首批进厂; 疏运{days_ship}天+检测{TEST_DAYS}天"),
        })
        if TODAY > eta_max:
            rec['note'] = (f"已超{country}航线最长航程({st['max']}天)仍未标记到港, "
                           f"或因清单状态滞后(用户备注数据可能滞后一天), 待到港确认; " + rec['note'])
    else:
        rec.update({'etaFirst': None, 'etaPlant': None, 'usableAll': None,
                    'note': f'v8: 无{country}航线历史样本, 无法统计预测, 建议人工核实'})
    ships.append(rec)

def push_ship_yard(nm, r, qty, arrived, note):
    a2 = r['采购物料代码'].strip()
    # v9.3 堆场余量 = 订单余额口径(按采购订单号关联, 用户9-11确认"主要看采购订单号"):
    #   履历最后待卸量 - 履历日后该船名下各订单的实际铁路到厂量
    #   （马尔凯洛: 30,000 - 9.9实疏3,016 - 9.10实疏3,730 = 23,254t;
    #     去向文件9.7~9.8的3,699t已含在 85,244=55,244+30,000 恒等式内, 不重复扣减）
    po_own = (r.get('采购订单号_合同编码') or '').strip()
    po_set = MK_POS if nm == '马尔凯洛' else ({po_own} if po_own else set())
    if po_set:
        delivered_after = sum(h['qty'] for h in rail_rows
                              if h['po'] in po_set and h['state'] == '已到厂'
                              and h['arrive'] and h['arrive'].date() > arrived)
    else:   # 无订单号可用时退回船名匹配(仅9.9带船名台账)
        delivered_after = sum(h['qty'] for h in rail_rows
                              if h['ship'] == nm and h['state'] == '已到厂'
                              and h['arrive'] and h['arrive'].date() > arrived)
    remaining = max(0.0, qty - delivered_after)
    days_left = int(math.ceil(remaining / RATE)) if remaining > 0 else 0
    usable_all = TODAY + datetime.timedelta(days=days_left + TEST_DAYS)
    ships.append({'shipName': nm, 'material': r['物料名称'], 'qty': qty, 'phase': 'portYard',
                  'po': po_own, 'g3': r['物料品名代码'], 'a2': a2, 'coal': A2_TO_COAL.get(a2),
                  'arrived': arrived.isoformat(), 'shippedDays': (TODAY - arrived).days,
                  'deliveredAfter': round(delivered_after, 1),
                  'remaining': round(remaining, 1), 'daysLeft': days_left,
                  'etaFirst': TODAY.isoformat() if remaining > 0 else None,
                  'etaPlant': add_days(TODAY, days_left),
                  'usableAll': usable_all.isoformat(),
                  'note': note})

_po_by_ship = collections.defaultdict(list)
for r in cur_rows:
    _po_by_ship[r['船名'].strip()].append((r.get('采购订单号_合同编码') or '').strip())
for r in cur_rows:
    nm = r['船名'].strip()
    push_ship_sea(nm, r, float(r['待卸量']))
    if _voyage_cnt[nm] > 1:
        ships[-1]['multiVoyage'] = _voyage_cnt[nm]
        ships[-1]['note'] = (f"同船{_voyage_cnt[nm]}个航次, 按采购订单号分别跟踪"
                             f"(PO {'/'.join(p for p in _po_by_ship[nm] if p)}), "
                             f"船名仅参考(用户9-11确认); " + ships[-1]['note'])
for nm, (rt, qty, r) in sorted(last_seen.items()):
    if nm in cur_names or qty <= 0: continue
    push_ship_yard(nm, r, qty, datetime.date.fromisoformat(rt),
                   f'{rt}后从清单消失=已到港, 堆场疏运中; 余量=订单余额口径'
                   f'(履历待卸{qty:,.0f}t-按采购订单号关联的铁路实疏, 已扣至9.10台账), '
                   f'疏运速率约{RATE:.0f}t/天')

# 4.3 铁运在途（9.11台账驱动, 该文件无船名列, 按发站分类港口疏运/矿山直达）:
#     在途状态只认制表_发出时间, 港口→厂约40分钟~1小时当日到厂, 进厂后检测 TEST_DAYS 天可用
rails = []
with open(os.path.join(DATA, '2026.9.11铁运在途.csv'), encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        st = r['在途状态'].strip()
        if st == '已到厂':
            continue
        try:
            w = float(r['货票重量'] or 0)
            dep = datetime.datetime.strptime(r['制表_发出时间'], '%Y%m%d%H%M%S')
        except (TypeError, ValueError):
            continue
        stn = r['发站名称'].strip()
        a2 = r['采购物料代码'].strip()
        po = r['采购订单号'].strip()
        is_port = stn in PORT_STATIONS
        rails.append({
            'station': stn, 'a2': a2, 'po': po, 'coal': A2_TO_COAL.get(a2),
            'qty': w, 'state': st, 'depart': dep.isoformat(),
            'etaPlant': (dep + datetime.timedelta(minutes=round(RAIL_MIN_MED))).isoformat(),
            'usableAll': add_days(dep.date(), TEST_DAYS),
            'note': (f"在途({st}): 制表{dep.strftime('%m-%d %H:%M')}+约{RAIL_MIN_MED:.0f}分钟当日到厂, "
                     f"进厂+检测{TEST_DAYS}天可用, "
                     + (f"{stn}港口堆场疏运(PO {po}, 清水河订单续疏运)" if is_port else f"{stn}矿山直达")),
        })

# ---------------- 5. 汇总输出 ----------------
LVL = {'max': 25.0, 'warn': 15.0, 'safe': 10.0, 'min': 5.0}
def water_level(e):
    if e >= LVL['max']: return '最高库存线(胀库)'
    if e >= LVL['warn']: return '预警库存线(正常)'
    if e >= LVL['safe']: return '安全库存线(黄色预警)'
    return '最低库存线(红色断料)'

coal_list = []
for c in coals:
    qk = quality_key.get(c)
    q = dict(Q[c])
    if qk:
        for item in ('FCad', 'Mad'):
            q[item] = wavg(qk, item)
        q['_records'] = sum(cnt[qk].values())
        q['_weight_t'] = round(sum(v[1] for v in agg[qk].values()), 1)
        imp = import_share.get(qk)
        if imp and imp[1]:
            q['_importShare'] = round(imp[0] / imp[1] * 100, 1)
    else:
        q['_records'] = 0
    I0 = inv[SNAP].get(c, 0)
    d = daily_con[c]
    e = I0 / d if d > 0 else None
    coal_list.append({
        'name': c, 'a2': coal_a2[c], 'coalClass': coal_class(c),
        'inventoryByDate': {SNAP: round(I0, 1)},
        'latestInventory': round(I0, 1),
        'areas': {AREA_NAMES.get(k, k): round(v, 1) for k, v in sorted(coal_areas[c].items())},
        'dailyConsumption': round(d, 1),
        'stockDays': round(e, 2) if e is not None else None,
        'waterLevel': water_level(e) if e is not None else '无消耗记录',
        'quality': q,
        'qualitySource': ('品名等级直接匹配' if qk and not qk.startswith('__') else
                          ('同煤类共享池(等级缺失)' if qk else '无质量数据')),
    })

dataset = {
    'meta': {
        'inventoryDates': [SNAP],
        'latestSnapshot': SNAP,
        'inventoryCaliber': ('实际库存以煤场库存为准（一煤场LJM1/四煤场LJM4/五煤场LJM5/A2料场BFM5）；库存只能读取前一天(T-1)，期初=9.10快照205.5万吨(用户9-11确认采用)；虚拟库存=煤塔内存着的待使用煤（已配煤待用）。9.9快照(24.87万吨)经用户确认为不完整导出已废弃，连同9.2~9.8旧序列降级为仅参考，见 legacyInventorySeries'),
        'inventorySuperseded': INV_SUPERSEDED,
        'legacyInventorySeries': {d: {c: round(legacy_inv[d].get(c, 0), 1) for c in coals}
                                  for d in legacy_dates},
        'consumptionBasis': (f'日耗总量=两份全天完整到厂台账均值 {DAILY_TOTAL:,.0f} t/天'
                             f'（9.9: {day_stats["2026-09-09"]["total"]:,.0f}t/{day_stats["2026-09-09"]["cars"]}车 + '
                             f'9.10: {day_stats["2026-09-10"]["total"]:,.0f}t/{day_stats["2026-09-10"]["cars"]}车），'
                             '库存平稳假设下的到货校准估计；'
                             '煤种结构=近两个月到货台账(7.11~9.10)净重占比'
                             '（肥煤共享池按1级/2级库存比例拆分）；待持续到货台账校准'),
        'totalDailyConsumption': round(DAILY_TOTAL, 1),
        'totalLatestInventory': round(sum(inv[SNAP].values()), 1),
        'arrivalsDaily': {
            'note': ('9.9(带船名)与9.10(无船名)两份全天完整到厂台账; 9.10起台账无船名列, '
                     '船-铁关联改按采购订单号(用户9-11确认: 主要看订单号, 船名次要)'),
            'days': [{
                'date': d,
                'total': round(day_stats[d]['total'], 1),
                'cars': day_stats[d]['cars'],
                'portDredging': {
                    'total': round(day_stats[d]['port'], 1),
                    'caliber': '港口发站(防城港/铁山港)=港口堆场疏运',
                    'byPO': {k: round(v, 1) for k, v in sorted(day_stats[d]['byPO'].items(), key=lambda x: -x[1])
                             if k.split('|')[1] in PORT_STATIONS},
                },
                'mineDirect': {'total': round(day_stats[d]['mine'], 1), 'caliber': '非港口发站=矿山直达'},
                'byCoal': {k: round(v, 1) for k, v in sorted(day_stats[d]['byCoal'].items(), key=lambda x: -x[1])},
                'byStation': {k: round(v, 1) for k, v in sorted(day_stats[d]['byStation'].items(), key=lambda x: -x[1])},
            } for d in arr_days],
            'dailyTotal': round(DAILY_TOTAL, 1),
        },
        'consumptionMix': {k: round(v, 2) for k, v in sorted(mix.items(), key=lambda x: -x[1])},
        'waterLevelConfig': LVL,
        'etaModel': ('v9.3: 在途=船在海上未到港; 到港预测=启运日+分航线历史航程分布; 到港后3~8天首批进厂; '
                     '堆场余量=订单余额口径(履历待卸量-该船名下订单后续铁路实疏, 按采购订单号扣减, 扣至9.10台账); '
                     '疏运约4,250t/天; 进厂后检测1天可用; 铁运在途只认制表时间+约1小时当日到厂; '
                     '同船多航次按采购订单号分别跟踪, 船名仅展示参考(用户9-11确认)'),
        'voyageStats': VOYAGE_STATS,
        'voyageStatsCaliber': ('历史船运完成情况.csv按订单行「最早在途开始→最晚在途结束」, 清洗5~40天; '
                               '在途结束=实际到港(交叉验证: 结束后3~8天首批进厂)'),
        'asOf': TODAY.isoformat(),
        'dailyRailRate': round(RATE, 0),
        'railTransitMinutes': round(RAIL_MIN_MED, 0),
        'testDays': TEST_DAYS,
        'arrivalsHistory': arrivals_history,
        'unmappedQualityNames': dict(unmapped_cnt),
        'qualityRecordTotal': len(qrows),
        'assumptions': [
            '质量按净重加权平均，指标为0或净重缺失的记录不计入该项权重',
            '肥煤/贫瘦煤/国内气煤的质量数据未区分等级，1级/2级/国内共享同煤类加权值（标注共享池）',
            'v9.3库存口径(9-11用户决策): 9.10库存文件(205.5万吨)用户确认为正确数据直接采用为期初锚点; 9.9快照(24.87万吨)判定为不完整导出已废弃; 旧9.2~9.8序列仅参考; 库存只能读取前一天(T-1)快照',
            'v9.3船运关联口径(9-11用户决策): 船-铁关联与双航次拆分按采购订单号(主要看订单号, 船名比较次要); 吉利女神双航次=PO 4500187795(8-14启运10,586t)+PO 4500190072(9-09启运10,000t)分别跟踪; 皇家印象8-26启运已超印尼线最长航程14天(标注核实); 用户备注9.11清单数据可能滞后一天',
            'v9.3铁运在途口径(9-11): 93车6,272t全部在途(制表9-11 00:00, 当日到厂, 检测1天后可用); 防城港3,221t=港口堆场疏运(PO 450018317200010清水河订单续疏运,1级主焦煤), 瓦窑田1,346t(1级贫瘦煤)/柏果1,102t(1级肥煤)/松河603t(3级主焦煤)=矿山直达; 9.10台账无船名列, 按订单号关联',
            'v9.3排程桥接口径: 期初=9.10快照(9.10全天到厂17,223t已计入库存不重复计), 排程自9-12起从9.10库存水平推演; 9.11在途6,272t计入9-12到货',
            'v9.3日耗口径: 两日全天完整台账均值16,522t/天(9.9: 15,821t/234车 + 9.10: 17,223t/254车, 库存平稳假设)；煤种结构=近两月到货台账占比(肥煤按库存比例拆分)，待持续台账校准',
            'v9.3堆场余量口径: 订单余额=履历最后待卸量-履历日后该船名下订单的实际铁路到厂量(按采购订单号匹配, 扣减截至9.10台账; 马尔凯洛30,000-3,016-3,730=23,254t, 去向文件9.7~9.8的3,699t已含在85,244=55,244+30,000恒等式内不重复扣)；疏运速率参考实测约%dt/天' % round(RATE),
            'v9.1到货分解口径: 台账按发站分类——港口发站(防城港/铁山港)=港口堆场疏运, 非港口发站=矿山直达；9.9台账带船名可用船名交叉验证, 9.10起无船名列按订单号归属',
            'v9.1铁运口径: 在途状态以台账「在途状态」列驱动, 只认制表_发出时间, 港口→厂约1小时当日到厂, 进厂+检测1天可用；9.9台账234车全部已到厂, 无在途批',
            '煤名映射以库存端A2编码为锚(采购端G3仅展示)',
        ],
    },
    'coals': coal_list,
    'ships': ships,
    'rails': rails,
}
with open(os.path.join(OUT, 'dataset.json'), 'w', encoding='utf-8') as f:
    json.dump(dataset, f, ensure_ascii=False, indent=1)

# ---- 控制台校验输出 ----
print(f"煤种数: {len(coal_list)}, 总最新库存({SNAP} 快照, T-1): {dataset['meta']['totalLatestInventory']:,.0f} t")
print(f"日耗(到货校准估计, 两日均值): {dataset['meta']['totalDailyConsumption']:,.0f} t/天 "
      f"(9.9: {day_stats['2026-09-09']['total']:,.0f}t/{day_stats['2026-09-09']['cars']}车 "
      f"(港口疏运{day_stats['2026-09-09']['port']:,.0f}t/矿山直达{day_stats['2026-09-09']['mine']:,.0f}t) + "
      f"9.10: {day_stats['2026-09-10']['total']:,.0f}t/{day_stats['2026-09-10']['cars']}车 "
      f"(港口疏运{day_stats['2026-09-10']['port']:,.0f}t/矿山直达{day_stats['2026-09-10']['mine']:,.0f}t))")
print(f"消耗结构(近两月到货占比): {dataset['meta']['consumptionMix']}")
print(f"实测日均疏运速率: {RATE:,.0f} t/天, 制表->到厂中位 {RAIL_MIN_MED:.0f} 分钟")
print(f"{'煤名':10s} {SNAP+'库存':>12s} {'日耗估计':>10s} {'当量天':>8s} {'水位线':<14s} {'Ad':>6s} {'St.d':>6s} {'Vdaf':>6s}")
for c in coal_list:
    q = c['quality']
    print(f"{c['name']:10s} {c['latestInventory']:>12,.0f} {c['dailyConsumption']:>10,.0f} "
          f"{str(c['stockDays']):>8s} {c['waterLevel']:<14s} {str(q.get('Ad')):>6s} "
          f"{str(q.get('St.d')):>6s} {str(q.get('Vdaf')):>6s} [{c['qualitySource']}]")
print('\n船运到货时间线(v9.3: 在途=海上, 双航次按PO分列):')
for s in ships:
    if s['phase'] == 'atSea':
        print(f"  {s['shipName']}({s['country']}) {s.get('coal')} {s['qty']:,.0f}t [海上] 已航{s['elapsedDays']}天 "
              f"到港中位{s.get('etaPort')}/最迟{s.get('etaPortMax')} 首批进厂{s.get('etaFirst')} 全部可用{s.get('usableAll')}")
    else:
        print(f"  {s['shipName']} {s.get('coal')} {s['qty']:,.0f}t [堆场疏运] {s['arrived']}到港 剩余{s['remaining']:,.0f}t "
              f"约{s['daysLeft']}天 全部可用{s['usableAll']}")
print('分航线航程统计:', {k: f"n={v['n']}中位{v['median']}最长{v['max']}" for k, v in VOYAGE_STATS.items()})
_rl_st = collections.defaultdict(float)
for _r in rails: _rl_st[_r['station']] += _r['qty']
print('铁运在途:', f"{len(rails)}车 {sum(_r['qty'] for _r in rails):,.0f}t", dict((k, round(v)) for k, v in _rl_st.items()))
print('未映射质量品名:', dict(unmapped_cnt))
