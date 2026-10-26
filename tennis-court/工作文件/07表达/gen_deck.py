# 生成 07.1 策划文本全本 16 页（D 玉子·藍，表达基准 v0.1）
import os, math
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../成果输出/07.1_策划文本/slides")

BG = '#F8F7F2'; Y = '#F9BF45'; DK = '#0B252A'; TX = '#3A4547'; L1 = '#E6E6E1'; L2 = '#D9D8D0'
COURT = '#1E7FA8'; RUN = '#78C2C4'; GRN = '#86C166'; COR = '#F7C242'; CAR = '#58B2DC'; FIRE = '#DB4D6D'
CARL = '#A9D6EE'; ROAD = '#C9C8C0'; WATER = '#B7C9CB'; WH = '#FFFFFF'
SANS = "'Noto Sans SC', Arial, sans-serif"
NUM = "'DM Sans', 'Noto Sans SC', Arial, sans-serif"
FOOT = '通州16片网球训练中心 · 项目策划文本'


def f(v):
    return ('%.2f' % v).rstrip('0').rstrip('.')


def P(x, y, w, text, size=24, color=DK, weight=400, lh=1.4, font=None, ls=None, align=None, extra='', build=None, tag='p'):
    st = f'position:absolute;left:{f(x)}px;top:{f(y)}px;width:{f(w)}px;'
    if font:
        st += f'font-family:{font};'
    st += f'font-size:{size}px;font-weight:{weight};line-height:{lh};color:{color};'
    if ls is not None:
        st += f'letter-spacing:{ls}px;'
    if align:
        st += f'text-align:{align};'
    st += extra
    b = f' data-build-in="fade {build}"' if build else ''
    return f'<{tag} style="{st}"{b}>{text}</{tag}>'


def R(x, y, w, h, bg=None, extra='', inner='', build=None):
    st = f'position:absolute;left:{f(x)}px;top:{f(y)}px;width:{f(w)}px;height:{f(h)}px;'
    if bg:
        st += f'background:{bg};'
    st += extra
    b = f' data-build-in="fade {build}"' if build else ''
    return f'<div style="{st}"{b}>{inner}</div>'


def T(text, size=24, color=DK, weight=400, lh=1.4, font=None, ls=None, align=None, extra=''):
    """流式文字（不绝对定位）"""
    st = ''
    if font:
        st += f'font-family:{font};'
    st += f'font-size:{size}px;font-weight:{weight};line-height:{lh};color:{color};'
    if ls is not None:
        st += f'letter-spacing:{ls}px;'
    if align:
        st += f'text-align:{align};'
    st += extra
    return f'<p style="{st}">{text}</p>'


def section(sid, body, trans='push', footer=True, bg=BG):
    pad = '128px 128px 160px' if footer else '128px'
    return (f'<section id="{sid}" data-transition="{trans}" style="position:relative;width:1920px;height:1080px;overflow:hidden;'
            f'background:{bg};font-family:{SANS};color:{TX};display:flex;flex-direction:column;gap:32px;padding:{pad};">\n'
            + '\n'.join(body) + '\n</section>\n')


def header(eyebrow, title):
    return [P(128, 72, 1200, eyebrow, 24, DK, 400, 1, ls=4),
            P(128, 120, 1664, title, 72, DK, 300, 1.1, tag='h2'),
            R(128, 216, 96, 8, Y)]


def footer(n, plate=False):
    ex = f'background:{BG};padding:4px 8px;' if plate else ''
    return [P(128, 1016, 900, FOOT, 24, TX, 400, 1, ls=2),
            P(1392 if not plate else 1584, 1016, 400 if not plate else 208, f'{n:02d} / 16', 24, TX, 400, 1, ls=2, align='right', extra=ex)]


def rp(x, y, w, h):
    return f'M{f(x)} {f(y)}h{f(w)}v{f(h)}h{f(-w)}Z'


def svg(label, x, y, w, h, inner):
    return (f'<svg aria-label="{label}" width="{f(w)}" height="{f(h)}" viewBox="0 0 {f(w)} {f(h)}" '
            f'style="position:absolute;left:{f(x)}px;top:{f(y)}px;width:{f(w)}px;height:{f(h)}px;">' + ''.join(inner) + '</svg>')


def path(d, fill='none', stroke=None, sw=None, extra=''):
    s = f'<path d="{d}" fill="{fill}"'
    if stroke:
        s += f' stroke="{stroke}" stroke-width="{sw}"'
    return s + extra + '/>'


def write(sid, html):
    with open(os.path.join(D, sid + '.html'), 'w', encoding='utf-8') as fh:
        fh.write(html)


# ------------------------------------------------------------------ 01 封面
def cover():
    court = ('M8 24L8 100.79M8 100.79L174.39 100.79M174.39 100.79L174.39 24M174.39 24L8 24M8 33.59L174.39 33.59M8 91.2L174.39 91.2'
             'M46.4 33.59L46.4 91.2M136 33.59L136 91.2M46.4 62.4L136 62.4M222.39 24L222.39 100.79M222.39 100.79L388.78 100.79'
             'M388.78 100.79L388.78 24M388.78 24L222.39 24M222.39 33.59L388.78 33.59M222.39 91.2L388.78 91.2M260.78 33.59L260.78 91.2'
             'M350.39 33.59L350.39 91.2M260.78 62.4L350.39 62.4M91.2 17.6L91.2 107.19M305.58 17.6L305.58 107.19')
    b = [
        R(64, 640, 1792, 376, DK),
        R(64, 64, 1792, 736, Y),
        R(1440, 64, 352, 160, DK, 'display:flex;flex-direction:column;justify-content:center;padding:0px 40px;',
          T('PHASE A', 24, Y, 400, 1.4, NUM, 6) + T('a 阶段 · 2026.10', 32, BG, 300, 1.4)),
        P(224, 296, 1100, 'TONGZHOU TENNIS CENTRE', 24, DK, 400, 1, NUM, 14),
        P(224, 344, 1500, '通州16片网球训练中心', 120, DK, 300, 1.2, ls=4, tag='h1'),
        P(224, 512, 900, '项目策划文本', 44, DK, 300, 1.3, ls=16),
        R(224, 604, 96, 2, DK),
        P(224, 632, 1200, '北京城市副中心 · 通州潞邑街道孙各庄片区（区位参考）', 32, DK, 400, 1.4, ls=2),
        P(224, 840, 900, f'25<span style="color:{Y};">亩</span> · 16<span style="color:{Y};">片</span>', 72, BG, 300, 1, NUM),
        P(224, 944, 1000, '用地 16,667 ㎡ · 全部室外硬地标准训练场', 24, L2, 400, 1, ls=4),
        ('<svg aria-label="网球场线稿" width="416" height="131" viewBox="0 0 397 125" style="position:absolute;left:1376px;top:836px;width:416px;height:131px;">'
         + path(court, 'none', '#8FA3A6', 1.5) + '</svg>'),
    ]
    write('cover', section('cover', b, 'fade', footer=False))


# ------------------------------------------------------------------ 02 目录
def toc():
    rows = [('01', '项目前提与条件', '前提 · 区位 · 需求', '03–06'),
            ('02', '总平面与功能', '容量试排 · 单片大样 · 走廊与用房 · 指标', '07–11'),
            ('03', '投资与运营', '投资估算 · 三情景 · 改善抓手', '12–15'),
            ('04', '待定项与下一步', '拿地前要定的事', '16')]
    b = [R(1344, 0, 576, 1080, Y),
         P(1408, 128, 448, 'TONGZHOU TENNIS CENTRE', 24, DK, 400, 1, NUM, 4),
         P(1408, 632, 448, '16', 280, DK, 300, 1, NUM, -6),
         P(1408, 928, 448, '页 · 横版 16:9 · a 阶段', 24, DK, 400, 1, ls=2)]
    b += [P(128, 72, 1200, 'CONTENTS', 24, DK, 400, 1, NUM, 4),
          P(128, 120, 1100, '目录', 72, DK, 300, 1.1, tag='h2'),
          R(128, 216, 96, 8, Y)]
    for i, (n, name, desc, pg) in enumerate(rows):
        inner = (T(n, 120, DK, 300, 1, NUM, -2)
                 + f'<div style="display:flex;flex-direction:column;gap:8px;">' + T(name, 44, DK, 300, 1.2, ls=2) + T(desc, 24, TX, 400, 1.3) + '</div>'
                 + T(pg, 32, TX, 300, 1, NUM, align='right'))
        b.append(R(128, 296 + i * 168, 1120, 152, None,
                   f'display:grid;grid-template-columns:200px 1fr 160px;align-items:center;padding:16px 0px 0px 0px;border-top:2px solid {DK};',
                   inner, build=i + 1))
    b += footer(2)
    write('toc', section('toc', b, 'fade'))


# ------------------------------------------------------------------ 章节页（统一版式）
def chapter(sid, num, en, name, lines, left_html, vertical):
    b = [R(760, 232, 1160, 688, Y), left_html,
         P(944, 72, 520, num, 280, DK, 300, 1, NUM, -6),
         P(1000, 400, 760, en, 24, DK, 400, 1, NUM, 10),
         P(1000, 448, 760, name, 72, DK, 300, 1.2, ls=4, tag='h2'),
         R(1000, 560, 96, 2, DK),
         R(1000, 600, 640, 260, None, 'display:flex;flex-direction:column;gap:22px;',
           ''.join(T(f'<span style="color:{DK};">0{i + 1}　</span>{t}', 32, DK, 400, 1.4) for i, t in enumerate(lines)), build=1),
         P(1560, 560, 400, vertical, 24, DK, 400, 1, NUM, 8, extra='transform:rotate(90deg);')]
    write(sid, section(sid, b, 'fade', footer=False))


def placeholder(x, y, w, h, title, build=None):
    return R(x, y, w, h, L1, f'border:2px dashed #B9B8B0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;',
             T('[意向图 · 待 GPT 出图]', 32, TX, 400, 1.6, align='center') + T(title, 32, TX, 400, 1.6, align='center'), build)


def s01():
    chapter('s01', '01', 'SECTION 01 · PREMISE', '项目前提与条件',
            ['策划项目，无具体用地', '25 亩 · 16 片 · 全部室外', '区位参考：通州孙各庄片区'],
            placeholder(0, 160, 880, 720, '场地鸟瞰 · 意向'), 'PREMISE · SITE')


def s02():
    chapter('s02', '02', 'SECTION 02 · MASTER PLAN', '总平面与功能',
            ['每区两排之间设 4 m 休息走廊', '中部装配式配套用房 594 ㎡', '南侧两排停车 92 位'],
            placeholder(0, 160, 880, 720, '东西两区与中部配套 · 意向'), 'LAYOUT · FUNCTION')


def s03():
    s = 22.0
    W, H = 36.57 * s, 18.29 * s
    ox, oy = (880 - W) / 2, (720 - H) / 2
    cx0, cy0 = ox + 6.40 * s, oy + 3.66 * s
    cw, ch = 23.77 * s, 10.97 * s
    nx = cx0 + 11.885 * s
    d = rp(ox, oy, W, H) + rp(cx0, cy0, cw, ch)
    d += f'M{f(cx0)} {f(cy0 + 1.37 * s)}h{f(cw)}M{f(cx0)} {f(cy0 + 9.6 * s)}h{f(cw)}'
    d += f'M{f(nx - 6.4 * s)} {f(cy0 + 1.37 * s)}v{f(8.23 * s)}M{f(nx + 6.4 * s)} {f(cy0 + 1.37 * s)}v{f(8.23 * s)}'
    d += f'M{f(nx - 6.4 * s)} {f(cy0 + 5.485 * s)}h{f(12.8 * s)}'
    net = f'M{f(nx)} {f(cy0 - 0.914 * s)}v{f(ch + 1.828 * s)}'
    left = R(0, 160, 880, 720, DK, inner=svg('网球场线稿', 0, 0, 880, 720, [path(d, 'none', '#6E8589', 2), path(net, 'none', Y, 3)]))
    chapter('s03', '03', 'SECTION 03 · INVESTMENT', '投资与运营',
            ['总投资约 1,163 万元 ◐', '基准情景只够保本', '盈利取决于租金与教学占比'],
            left, 'CAPEX · OPERATION')


# ------------------------------------------------------------------ 04 前提
def premise():
    def panel(x, bg, head, rows, build=None):
        hd = (f'<div style="display:flex;flex-direction:row;justify-content:space-between;align-items:center;">'
              + T(head, 32, DK, 400, 1.3)
              + f'<p style="font-size:24px;font-weight:400;line-height:1.3;color:{BG};background:{DK};padding:4px 14px;">✔ 用户确定</p></div>')
        rs = ''.join(f'<div style="display:grid;grid-template-columns:220px 1fr;align-items:center;border-top:2px solid {BG};padding:18px 0px 0px 0px;">'
                     + T(k, 44, DK, 300, 1.2) + T(v, 24, DK, 400, 1.4) + '</div>' for k, v in rows)
        return R(x, 296, 800, 656, bg, 'display:flex;flex-direction:column;gap:22px;padding:44px 48px;', hd + rs, build)
    b = header('01 项目前提与条件', '前提已定：25 亩放 16 片，全部室外')
    b.append(panel(128, L1, '用户给定条件', [('25 亩', '用地 16,667 ㎡，暂无具体红线'), ('16 片', '标准网球训练场'),
                                         ('东西两区', '用户原话“左右两区”，每区 8 片'), ('中部配套', '更衣室等配套设施'), ('场内停车', '停车场设在用地内')]))
    b.append(panel(992, Y, '变更 01 · 报告页批注', [('不做气膜', '16 片全部室外硬地'), ('休息走廊', '每区两排场地之间加一排'),
                                              ('装配式', '配套可移动，不设门厅和观赛席'), ('两排停车', '不做环形，不设大巴位')], build=1))
    b += footer(4)
    write('premise', section('premise', b))


# ------------------------------------------------------------------ 05 区位
def site():
    k = 170.0  # px / km
    cx, cy = 640.0, 420.0
    SX, SY = 0, 248
    inner = []
    inner.append(path(rp(cx + 0.2 * k, 0, 0.2 * k, 832), GRN))                      # 六环高线公园
    inner.append(path('M784 564H1000V832H784Z', L2))                                   # 行政办公区
    inner.append(path('M200 340Q440 560 720 860', 'none', WATER, 22, ' stroke-linecap="round"'))  # 北运河
    inner.append(path(f'M{f(cx)} 0V832', 'none', ROAD, 10))                            # 通运路
    for r in (0.5, 1.0, 2.0):
        inner.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * k)}" fill="none" stroke="#B9B8B0" stroke-width="1.5" stroke-dasharray="8 8"/>')
    inner.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(1.5 * k)}" fill="none" stroke="{DK}" stroke-width="2.5"/>')
    a = math.radians(135)
    px, py = cx + 1.5 * k * math.cos(a), cy - 1.5 * k * math.sin(a)
    inner.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="7" fill="{DK}"/>')
    inner.append(path(f'M{f(px)} {f(py)}L{f(px - 40)} {f(py - 40)}', 'none', DK, 2))
    inner.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="20" fill="{Y}" stroke="{DK}" stroke-width="4"/>')
    inner.append(path('M1200 40L1216 96L1200 86L1184 96Z', DK))                       # 指北
    b = header('01 项目前提与条件', '区位参考：学校与新居住区就在身边')
    b.append(svg('区位关系示意（非地图）', SX, SY, 1280, 832, inner))
    plate = f'background:{BG};padding:2px 8px;'
    b += [P(1172, 248 + 104, 72, 'N', 24, DK, 400, 1, NUM, align='center'),
          P(532, SY + cy - k - 32, 96, '1 km', 24, TX, 400, 1, NUM, align='right'),
          P(532, SY + cy - 2 * k - 32, 96, '2 km', 24, TX, 400, 1, NUM, align='right'),
          P(140, SY + py - 96, 296, '1.5 km 内至少 4 所中小学', 24, DK, 500, 1.3, extra=plate, build=1),
          P(616 - 188, SY + cy - 34, 188, '选址点（KML）', 24, DK, 500, 1.3, align='right', extra=plate),
          P(616 - 244, SY + cy + 4, 244, '周边为新建居住区 ◐', 24, TX, 400, 1.3, align='right', extra=plate),
          P(724, SY + 92, 168, '六环高线公园', 24, DK, 500, 1.3, extra=plate, build=2),
          P(724, SY + 126, 330, '地下为东六环 · 200–400 m', 24, TX, 400, 1.3, extra=plate, build=2),
          P(808, SY + 650, 192, '副中心行政办公区北缘 ≈1.2 km ◐', 24, DK, 400, 1.3, build=3),
          P(128, SY + 268, 220, '北运河 ≈1.5–2 km', 24, TX, 400, 1.3, extra=plate),
          P(630 - 286, 256, 286, '通运路 · 南北向次干路', 24, TX, 400, 1.2, align='right', extra=plate)]
    items = [('F03.1-4 ●', '1.5 km 内至少 4 所中小学，培训生源足'),
             ('F03.1-6 ◐', '潞邑方向缺少直接竞品'),
             ('F03.1-3 ◐', '行政办公区的风貌与夜景管控，可能影响夜场灯光')]
    for i, (tg, tx) in enumerate(items):
        b.append(R(1344, 296 + i * 196, 448, 176, None, f'display:flex;flex-direction:column;gap:10px;border-top:2px solid {DK};padding:16px 0px 0px 0px;',
                   T(tg, 24, TX, 400, 1.2, NUM, 2) + T(tx, 32, DK, 300, 1.4), build=i + 1))
    b.append(P(1344, 900, 448, '本项目无具体用地，区位只作参考', 24, TX, 400, 1.4))
    b += footer(5, plate=True)
    write('site', section('site', b))


# ------------------------------------------------------------------ 06 需求
def demand():
    cols = ['工作日白天', '放学后', '工作日晚', '周末', '暑假']
    rows = [('周边居民', '订场、约球', [2, 3]),
            ('青少年与学校', '培训课、暑期营、校企共享', [1, 3, 4]),
            ('机关与企业员工', '夜场、团建、会员', [2]),
            ('教练与俱乐部', '包场、驻场教学，≤35% 场时', [0, 1, 2, 3, 4])]
    X0, CW, Y0, HH, RH = 712, 216, 352, 56, 128
    b = header('01 项目前提与条件', '需求集中在工作日晚和周末')
    b.append(P(128, 256, 1664, '定位：社区级网球训练中心，以青少年培训和夜场订场为主 ◐', 32, TX, 300, 1.2))
    b.append(R(X0 + 2 * CW, Y0, 2 * CW, HH + 4 * RH, Y, build=1))
    for j, c in enumerate(cols):
        b.append(P(X0 + j * CW, Y0 + 14, CW, c, 24, DK, 500 if j in (2, 3) else 400, 1.2, align='center'))
    b.append(P(128, Y0 + 14, 560, '使用者 · 需求', 24, TX, 400, 1.2, ls=2))
    for i, (name, need, on) in enumerate(rows):
        y = Y0 + HH + i * RH
        b.append(R(128, y, 1664, 2, DK if i == 0 else L2))
        b.append(P(128, y + 22, 560, name, 32, DK, 400, 1.3))
        b.append(P(128, y + 70, 560, need, 24, TX, 400, 1.3))
        for j in range(5):
            if j in on:
                b.append(R(X0 + j * CW + 28, y + 40, CW - 56, 48, COURT))
            else:
                b.append(R(X0 + j * CW + CW / 2 - 16, y + 62, 32, 4, '#B9B8B0'))
    b.append(R(128, Y0 + HH + 4 * RH, 1664, 2, DK))
    b.append(P(128, 944, 1664, f'<span style="color:{COURT};">■</span> 主要使用时段 · ◐ 推断 · 冬季 12–2 月室外基本停打；黄金时段教学与散客相争', 24, TX, 400, 1.3))
    b += footer(6)
    write('demand', section('demand', b))


# ------------------------------------------------------------------ 08 总平面
def plan():
    k = 7.5
    SX, SY = 680, 248
    W, H = 156.4, 106.57
    Y1, YC, Y2, YS, YP1, YA, YP2, YB = 3, 39.57, 43.57, 80.14, 82.14, 87.64, 93.64, 99.14

    def r(x, y, w, h):
        return rp(x * k, y * k, w * k, h * k)
    g = {}

    def add(col, d):
        g.setdefault(col, []).append(d)
    add(L1, r(0, 0, W, H))
    for a in [(0, 0, W, 3), (0, 3, 3, H - 3), (153.4, 3, 3, H - 3), (9, YB, 57.2, H - YB), (90.2, YB, 57.2, H - YB), (70.2, 18, 20, YC - 18),
              (3, YP1, 2, 5.5), (151.4, YP1, 2, 5.5), (64, YP2, 2.2, 5.5), (90.2, YP2, 2.2, 5.5)]:
        add(GRN, r(*a))
    for a in [(66.2, 3, 4, YA - 3), (70.2, 3, 20, 15), (70.2, Y2, 20, 1), (70.2, 44.57, 1, 33), (89.2, 44.57, 1, 33), (70.2, 77.57, 20, YS - 77.57),
              (3, YS, 63.2, 2), (70.2, YS, 83.2, 2), (70.2, YP1, 20, 5.5), (66.2, YP2, 24, H - YP2)]:
        add(L2, r(*a))
    for a in [(3, YA, 150.4, 6), (3, YP2, 6, H - YP2), (147.4, YP2, 6, H - YP2)]:
        add(CAR, r(*a))
    for a in [(5, YP1, 57.5, 5.5), (93.9, YP1, 57.5, 5.5), (62.5, YP1, 3.7, 5.5), (90.2, YP1, 3.7, 5.5), (9, YP2, 55, 5.5), (92.4, YP2, 55, 5.5)]:
        add(CARL, r(*a))
    lines = ''
    netd = ''
    for zx in (3, 90.2):
        for ry in (Y1, Y2):
            add(RUN, r(zx, ry, 63.2, 36.57))
            for i in range(4):
                cx, cy = zx + 3.66 + i * 14.97, ry + 6.4
                add(COURT, r(cx, cy, 10.97, 23.77))
                ny = cy + 11.885
                lines += r(cx, cy, 10.97, 23.77)
                lines += f'M{f((cx + 1.37) * k)} {f(cy * k)}v{f(23.77 * k)}M{f((cx + 9.6) * k)} {f(cy * k)}v{f(23.77 * k)}'
                lines += f'M{f((cx + 1.37) * k)} {f((ny - 6.4) * k)}h{f(8.23 * k)}M{f((cx + 1.37) * k)} {f((ny + 6.4) * k)}h{f(8.23 * k)}'
                lines += f'M{f((cx + 5.485) * k)} {f((ny - 6.4) * k)}v{f(12.8 * k)}'
                netd += f'M{f((cx - 0.914) * k)} {f(ny * k)}h{f(12.8 * k)}'
    add(COR, r(3, YC, 150.4, 4))
    add(DK, r(71.2, 44.57, 18, 33))
    for zc in range(6):
        add(WH, r(74.7 + zc * 1.2, YA + 0.4, 0.6, 5.2))
    stalls = ''
    for kk in range(24):
        stalls += f'M{f((5 + kk * 2.5) * k)} {f(YP1 * k)}v{f(5.5 * k)}M{f((93.9 + kk * 2.5) * k)} {f(YP1 * k)}v{f(5.5 * k)}'
    for kk in range(23):
        stalls += f'M{f((9 + kk * 2.5) * k)} {f(YP2 * k)}v{f(5.5 * k)}M{f((92.4 + kk * 2.5) * k)} {f(YP2 * k)}v{f(5.5 * k)}'
    fence = ''.join(r(zx, ry, 63.2, 36.57) for zx in (3, 90.2) for ry in (Y1, Y2))
    inner = [path(''.join(v), c) for c, v in g.items()]
    inner += [path(lines, 'none', WH, 1.2), path(netd, 'none', DK, 1.6), path(stalls, 'none', WH, 1.2), path(fence, 'none', DK, 1.4),
              path(f'M{f(68.2 * k)} {f(18 * k)}V{f(YA * k)}', 'none', FIRE, 2, ' stroke-dasharray="10 8"'),
              path(r(0, 0, W, H), 'none', DK, 2, ' stroke-dasharray="16 6 3 6"')]
    b = header('02 总平面与功能', '25 亩放得下 16 片标准场')
    b.append(svg('总平面容量试排', SX, SY, W * k, H * k, inner))
    tag = f'background:{DK};padding:6px 14px;'
    b += [P(SX + 3 * k + 14, SY + 3 * k + 6, 170, '西区 · 8 片', 24, BG, 400, 1, extra=tag, build=1),
          P(SX + 90.2 * k + 14, SY + 3 * k + 6, 170, '东区 · 8 片', 24, BG, 400, 1, extra=tag, build=1),
          P(SX + 3 * k + 24, SY + YC * k + 3, 440, '休息走廊 4 m · 东西贯通 150.4 m', 24, DK, 500, 1, build=2),
          P(SX + 71.2 * k, SY + 44.57 * k + 64, 18 * k, '配套用房', 24, BG, 400, 1.4, align='center', build=3),
          P(SX + 71.2 * k, SY + 44.57 * k + 100, 18 * k, '594 ㎡', 24, BG, 400, 1.4, NUM, align='center', build=3),
          P(SX + 71.2 * k, SY + 44.57 * k + 136, 18 * k, '装配式', 24, BG, 400, 1.4, align='center', build=3),
          P(SX + 9 * k + 8, SY + YA * k + 10, 420, '停车 92 位 · 一条通道两排', 24, DK, 500, 1, build=4),
          P(SX + 66.2 * k, SY + YP2 * k + 34, 24 * k, '入口广场', 24, DK, 400, 1, align='center')]
    notes = ['ITF 标准尺寸，缓冲不压缩', '两区对称，配套居中，人车分流', '绿地率 14.5%，或低于控规 ◐']
    b.append(R(128, 296, 520, 400, None, 'display:flex;flex-direction:column;gap:28px;',
               ''.join(T(f'<span style="color:{DK};">0{i + 1}　</span>{t}', 32, DK, 300, 1.4) for i, t in enumerate(notes))))
    b.append(P(128, 728, 480, '用地 156.40 × 106.57 m', 24, TX, 400, 1.3, NUM))
    b.append(P(128, 764, 480, '长轴南北 · 北在上', 24, TX, 400, 1.3))
    b.append(svg('指北针与比例尺', 128, 820, 260, 150,
                 [path('M24 0L44 64L24 52L4 64Z', DK),
                  path('M0 120h75v14h-75Z', DK), path('M75 120h75v14h-75Z', BG, DK, 2)]))
    b += [P(176, 832, 60, 'N', 24, DK, 400, 1, NUM),
          P(116, 958, 40, '0', 24, TX, 400, 1, NUM, align='center'),
          P(183, 958, 60, '10', 24, TX, 400, 1, NUM, align='center'),
          P(258, 958, 80, '20 m', 24, TX, 400, 1, NUM, align='center')]
    b += footer(8, plate=True)
    write('plan', section('plan', b))


# ------------------------------------------------------------------ 09 单片大样
def court():
    s = 28.0
    SX, SY = 128, 264
    ox, oy = 150.0, 110.0
    EW, EH = 36.57 * s, 18.29 * s
    x0, y0 = ox + 6.40 * s, oy + 3.66 * s
    cw, ch = 23.77 * s, 10.97 * s
    x1, y1 = x0 + cw, y0 + ch
    ys1, ys2 = y0 + 1.37 * s, y0 + 9.6 * s
    nx = x0 + 11.885 * s
    sv1, sv2 = nx - 6.40 * s, nx + 6.40 * s
    yc = y0 + 5.485 * s
    lines = rp(x0, y0, cw, ch) + f'M{f(x0)} {f(ys1)}H{f(x1)}M{f(x0)} {f(ys2)}H{f(x1)}'
    lines += f'M{f(sv1)} {f(ys1)}V{f(ys2)}M{f(sv2)} {f(ys1)}V{f(ys2)}M{f(sv1)} {f(yc)}H{f(sv2)}'
    lines += f'M{f(x0)} {f(yc)}h12M{f(x1)} {f(yc)}h-12'
    pt, pb = y0 - 0.914 * s, y1 + 0.914 * s
    dims = ''
    for yy, xs in ((72, [ox, x0, x1, ox + EW]), (28, [ox, ox + EW])):
        dims += f'M{f(xs[0])} {yy}H{f(xs[-1])}'
        for xv in xs:
            dims += f'M{f(xv)} {yy - 10}v20'
    for xx, ys in ((104, [oy, y0, y1, oy + EH]), (56, [oy, oy + EH])):
        dims += f'M{xx} {f(ys[0])}V{f(ys[-1])}'
        for yv in ys:
            dims += f'M{xx - 10} {f(yv)}h20'
    ext = f'M{f(ox)} 18V{f(oy)}M{f(ox + EW)} 18V{f(oy)}M{f(x0)} 62V{f(oy)}M{f(x1)} 62V{f(oy)}'
    ext += f'M46 {f(oy)}H{f(ox)}M46 {f(oy + EH)}H{f(ox)}M94 {f(y0)}H{f(ox)}M94 {f(y1)}H{f(ox)}'
    inner_dims = f'M{f(nx)} 440H{f(sv2)}M{f(nx)} 430v20M{f(sv2)} 430v20M960 {f(ys1)}V{f(ys2)}M950 {f(ys1)}h20M950 {f(ys2)}h20'
    inner = [path(rp(ox, oy, EW, EH), RUN), path(rp(x0, y0, cw, ch), COURT),
             path(lines, 'none', WH, 3), path(f'M{f(nx)} {f(pt)}V{f(pb)}', 'none', DK, 5),
             f'<circle cx="{f(nx)}" cy="{f(pt)}" r="7" fill="{DK}"/>', f'<circle cx="{f(nx)}" cy="{f(pb)}" r="7" fill="{DK}"/>',
             path(rp(ox, oy, EW, EH), 'none', DK, 2),
             path(dims, 'none', DK, 2), path(ext, 'none', '#8FA3A6', 1, ' stroke-dasharray="4 4"'),
             path(inner_dims, 'none', WH, 2)]
    b = header('02 总平面与功能', '每片按 ITF 推荐尺寸，缓冲不压缩')
    b.append(svg('单片标准网球场大样', SX, SY, 1200, 700, inner))
    num = NUM
    b += [P(SX + ox + EW / 2 - 80, SY - 2, 160, '36.57', 24, DK, 400, 1, num, align='center', extra=f'background:{BG};'),
          P(SX + (ox + x0) / 2 - 50, SY + 42, 100, '6.40', 24, DK, 400, 1, num, align='center', extra=f'background:{BG};'),
          P(SX + nx - 60, SY + 42, 120, '23.77', 24, DK, 400, 1, num, align='center', extra=f'background:{BG};'),
          P(SX + (x1 + ox + EW) / 2 - 50, SY + 42, 100, '6.40', 24, DK, 400, 1, num, align='center', extra=f'background:{BG};')]
    for cxp, cyp, t in ((SX + 30, SY + oy + EH / 2, '18.29'), (SX + 78, SY + (oy + y0) / 2, '3.66'),
                        (SX + 78, SY + (y0 + y1) / 2, '10.97'), (SX + 78, SY + (y1 + oy + EH) / 2, '3.66')):
        b.append(P(cxp - 50, cyp - 12, 100, t, 24, DK, 400, 1, num, align='center', extra=f'background:{BG};transform:rotate(-90deg);'))
    b += [P(SX + (nx + sv2) / 2 - 60, SY + 400, 120, '6.40', 24, WH, 400, 1, num, align='center', build=1),
          P(SX + 900 - 40, SY + yc - 30, 80, '单打', 24, WH, 400, 1.25, align='center', build=1),
          P(SX + 900 - 40, SY + yc, 80, '8.23', 24, WH, 400, 1.25, num, align='center', build=1),
          P(SX + nx - 120, SY + pb + 20, 240, '网柱间距 12.80', 24, DK, 400, 1, align='center', build=2)]
    spec = [('双打场地', '23.77 × 10.97'), ('单打宽', '8.23'), ('发球线距网', '6.40'), ('网柱间距', '12.80'),
            ('端线外 / 边线外缓冲', '6.40 / 3.66'), ('多片并列场间净距', '4.00'), ('围网内（单片）', '36.57 × 18.29')]
    rows = ''.join(f'<div style="display:flex;flex-direction:column;gap:2px;">' + T(a, 24, TX, 400, 1.3) + T(v, 32, DK, 400, 1.2, NUM) + '</div>' for a, v in spec)
    b.append(R(1376, 264, 416, 736, L1, 'display:flex;flex-direction:column;gap:14px;padding:36px 40px;',
               T('关键尺寸（m）', 24, DK, 500, 1.3, ls=4) + rows + T('ITF 规则 · 长轴南北（JGJ 31）', 24, TX, 400, 1.3)))
    b.append(P(128, 964, 1200, '图中长轴横置；实际布置长轴南北，北偏西 ≤10°', 24, TX, 400, 1.3))
    b += footer(9)
    write('court', section('court', b))


# ------------------------------------------------------------------ 10 功能
def func():
    k = 20.0
    BX, BY = 1104, 296
    rooms = [(0, 0, 3, 2, ['休息补给', '饮水 · 售货']), (0, 2, 1, 4, ['男更衣', '淋浴']), (1, 2, 1, 4, ['卫生间']),
             (2, 2, 1, 4, ['女更衣', '淋浴']), (0, 6, 2, 2, ['器材 · 穿线', '零售']), (2, 6, 1, 2, ['教练', '办公']),
             (0, 8, 1, 3, ['配电', '设备']), (1, 8, 2, 1, ['储物 · 值班']), (1, 9, 2, 2, ['服务前台'])]
    grid = ''
    for c in (1, 2):
        grid += f'M{f(c * 6 * k)} 0V{f(33 * k)}'
    for rr in range(1, 11):
        grid += f'M0 {f(rr * 3 * k)}H{f(18 * k)}'
    walls = ''.join(rp(c * 6 * k, r_ * 3 * k, cs * 6 * k, rs * 3 * k) for c, r_, cs, rs, _ in rooms)
    inner = [path(rp(0, 0, 18 * k, 33 * k), DK), path(grid, 'none', '#4A6266', 1, ' stroke-dasharray="6 6"'),
             path(walls, 'none', BG, 3)]
    b = header('02 总平面与功能', '走廊连起两区，用房可整体搬迁')
    b.append(placeholder(0, 264, 800, 736, '休息走廊 · 意向'))
    card = (T('休息走廊', 32, DK, 400, 1.3) +
            T('宽 4.0 m · 贯通 150.4 m · 601.6 ㎡', 24, DK, 400, 1.4) +
            T('轻钢廊架：遮阳、座椅、直饮水', 24, DK, 400, 1.4) +
            T('跨消防车道处净高 ≥4.5 m ◐', 24, DK, 400, 1.4))
    b.append(R(560, 704, 496, 248, Y, 'display:flex;flex-direction:column;gap:10px;padding:32px 40px;', card, build=1))
    b.append(svg('装配式模块用房平面', BX, BY, 18 * k, 33 * k, inner))
    for c, r_, cs, rs, ls in rooms:
        x, y, w, h = BX + c * 6 * k, BY + r_ * 3 * k, cs * 6 * k, rs * 3 * k
        top = y + h / 2 - len(ls) * 15
        for i, t in enumerate(ls):
            b.append(P(x, top + i * 30, w, t, 24, BG, 400, 1.25, align='center', build=2))
    b += [P(BX, BY - 40, 18 * k, '▲ 北 · 接休息走廊', 24, TX, 400, 1.2, align='center'),
          P(BX, BY + 33 * k + 12, 18 * k, '南 · 入口广场', 24, TX, 400, 1.2, align='center')]
    notes = (T('配套用房', 24, TX, 400, 1.3, ls=4) + T('18 × 33 m', 44, DK, 300, 1.2, NUM) +
             T('约 594 ㎡ · 单层装配式', 24, DK, 400, 1.4) + T('33 个 6 × 3 m 模块', 24, DK, 400, 1.4) +
             T('无门厅、无观赛席', 24, DK, 400, 1.4) + T('可整体搬迁', 24, DK, 400, 1.4))
    b.append(R(1520, 296, 272, 420, None, f'display:flex;flex-direction:column;gap:12px;border-top:2px solid {DK};padding:16px 0px 0px 0px;', notes, build=3))
    b += footer(10)
    write('func', section('func', b))


# ------------------------------------------------------------------ 11 指标
def metrics():
    b = header('02 总平面与功能', '场地占 55%，绿地率 14.5% 偏低')
    segs = [(9244.9, COURT, '场地', '55.5%'), (601.6, COR, '休息走廊', '3.6%'), (594.0, DK, '配套基底', '3.6%'),
            (2658.3, CAR, '道路停车', '15.9%'), (1150.5, L2, '广场步道', '6.9%'), (2418.2, GRN, '绿化', '14.5%')]
    tot = sum(s[0] for s in segs)
    W = 1664
    x = 0.0
    parts = []
    gap = 4
    for v, c, n, pct in segs:
        w = v / tot * (W - gap * 5)
        parts.append(path(rp(x, 0, w, 48), c))
        x += w + gap
    b.append(svg('用地分配比例条', 128, 264, W, 48, parts))
    b.append(R(128, 328, 1664, 64, None, 'display:grid;grid-template-columns:repeat(6, 1fr);gap:16px;',
               ''.join(f'<p style="font-size:24px;font-weight:400;line-height:1.3;color:{DK};border-top:4px solid {c};padding:8px 0px 0px 0px;">{n} <span style="color:{TX};">{pct}</span></p>'
                       for v, c, n, pct in segs)))
    rows = [('用地面积', '16,667 ㎡（25 亩）', '甲方目标 ●', '待核'),
            ('网球场（围网内）', '9,244.9 ㎡ · 16 片', '设计结果', '待核'),
            ('休息走廊', '601.6 ㎡ · 4.0 × 150.4 m', '设计结果', '待核'),
            ('配套用房', '594 ㎡ · 单层装配式', '设计结果', '待核'),
            ('停车', '92 位（无障碍 2、充电 9）', '设计结果', '待核'),
            ('绿地率', '14.5%', '规划硬性', '○ 缺'),
            ('建筑密度 / 容积率', '3.6%（含廊架约 7.2%）/ 约 0.036', '规划硬性', '○ 缺'),
            ('灯杆 / 外围网', '64 根 / 798.2 m', '设计结果', '待核')]
    th = ''.join(f'<th style="width:{w}%;font-size:24px;font-weight:500;line-height:2.1;color:{DK};text-align:left;border-bottom:2px solid {DK};padding:0px 16px;">{t}</th>'
                 for t, w in (('指标', 26), ('数值', 44), ('性质', 16), ('状态', 14)))
    trs = ''
    for i, (a, v, n, st) in enumerate(rows):
        bg = f'background:{Y};' if a == '绿地率' else ''
        cells = ''
        for j, t in enumerate((a, v, n, st)):
            ff = f'font-family:{NUM};' if j == 1 else ''
            cells += f'<td style="{bg}{ff}font-size:24px;font-weight:400;line-height:2.1;color:{DK if j < 2 else TX};border-bottom:1px solid {L2};padding:0px 16px;">{t}</td>'
        trs += f'<tr>{cells}</tr>'
    b.append(f'<table style="position:absolute;left:128px;top:432px;width:1664px;border-collapse:collapse;"><tr>{th}</tr>{trs}</table>')
    b.append(P(128, 944, 1664, '来源：指标表 v2（02.S1 容量试排，变更01 后）· 规划硬性指标均待规划条件', 24, TX, 400, 1.3))
    b += footer(11)
    write('metrics', section('metrics', b))


# ------------------------------------------------------------------ 13 投资
def capex():
    b = header('03 投资与运营', '总投资约 1,163 万元，比变更前少 189 万')
    b.append(R(128, 296, 480, 464, Y, 'display:flex;flex-direction:column;justify-content:space-between;padding:44px 48px;',
               T('总投资 ◐ 速算', 24, DK, 400, 1.3, ls=4) +
               f'<div style="display:flex;flex-direction:column;gap:8px;">' + T('1,163', 120, DK, 300, 1, NUM) + T('万元', 32, DK, 300, 1.2) + '</div>' +
               T('北京 2025–2026 公开报价中值，含其他费 10%、预备费 8%', 24, DK, 400, 1.4)))
    sc = 360 / 1352.0
    base = 400
    bars = [(0, 1352, L2, '变更前（方案一）', '1,352'), (1352, 1097, Y, '配套改装配式', '−255'),
            (1097, 1157, COR, '增加休息走廊', '+60'), (1157, 1163, L2, '其他调整 ◐', '+6'), (0, 1163, Y, '本方案', '1,163')]
    SX, SY = 704, 296
    inner = []
    cw, step = 152, 220
    for i, (a, bb, c, n, v) in enumerate(bars):
        top = base - max(a, bb) * sc
        h = max(abs(bb - a) * sc, 3)
        inner.append(path(rp(i * step, top, cw, h), c))
        if i < 4:
            yv = base - bb * sc
            inner.append(path(f'M{f(i * step + cw)} {f(yv)}H{f((i + 1) * step)}', 'none', TX, 1.5, ' stroke-dasharray="4 4"'))
    inner.append(path(f'M0 {base}H{f(4 * step + cw)}', 'none', DK, 2))
    b.append(svg('投资变化瀑布图', SX, SY, 4 * step + cw, 420, inner))
    for i, (a, bb, c, n, v) in enumerate(bars):
        top = base - max(a, bb) * sc
        b.append(P(SX + i * step - 24, SY + top - 40, cw + 48, v, 32, DK, 400, 1.1, NUM, align='center', build=i + 1 if 0 < i < 4 else None))
        b.append(P(SX + i * step - 24, SY + base + 14, cw + 48, n, 24, TX, 400, 1.3, align='center'))
    cards = [('约 133 万元', '可搬迁部分：走廊、模块用房及基础'), ('约 40–66 万元', '到期搬迁残值，未计入现金流 ◐')]
    for i, (v, t) in enumerate(cards):
        b.append(R(128 + i * 848, 808, 816, 144, L1, 'display:flex;flex-direction:column;justify-content:center;gap:6px;padding:0px 40px;',
                   T(v, 44, DK, 300, 1.2, NUM) + T(t, 24, TX, 400, 1.3)))
    b += footer(13)
    write('capex', section('capex', b))


# ------------------------------------------------------------------ 14 运营
def ops():
    b = header('03 投资与运营', '基准情景只够保本，利用率要过 52%')
    SX, SY, W, H = 128, 280, 1080, 640
    x0, x1 = 120, 1040
    ux = lambda u: x0 + (u - 30) * (x1 - x0) / 50.0
    y_top, y_bot = 30, 560
    vy = lambda v: y_top + (200 - v) * (y_bot - y_top) / 350.0
    inner = []
    grid = ''
    for v in (-100, 100, 200):
        grid += f'M{x0} {f(vy(v))}H{x1}'
    inner.append(path(grid, 'none', L2, 1))
    inner.append(path(f'M{x0} {f(vy(0))}H{x1}', 'none', TX, 2))
    inner.append(path(f'M{x0} {f(vy(116.3))}H{x1}', 'none', TX, 1.5, ' stroke-dasharray="6 6"'))
    inner.append(path(f'M{f(ux(52))} {y_top}V{y_bot}', 'none', Y, 3, ' stroke-dasharray="8 6"'))
    pts = [(40, -104), (55, 21), (70, 147)]
    inner.append(path('M' + 'L'.join(f'{f(ux(u))} {f(vy(v))}' for u, v in pts), 'none', DK, 3))
    for u, v in pts:
        r_ = 12 if u == 55 else 8
        inner.append(f'<circle cx="{f(ux(u))}" cy="{f(vy(v))}" r="{r_}" fill="{Y if u == 55 else DK}" stroke="{BG}" stroke-width="2"/>')
    inner.append(path(f'M{x0} {y_bot}H{x1}', 'none', TX, 1.5))
    b.append(svg('EBITDA 与利用率', SX, SY, W, H, inner))
    for v in (-100, 0, 100, 200):
        b.append(P(SX, SY + vy(v) - 12, x0 - 16, (f'{v:+d}' if v else '0').replace('-', '−'), 24, TX, 400, 1, NUM, align='right'))
    for u in (30, 40, 50, 60, 70, 80):
        b.append(P(SX + ux(u) - 40, SY + y_bot + 12, 80, f'{u}%', 24, TX, 400, 1, NUM, align='center'))
    b += [P(SX + x0, SY + y_bot + 48, 600, '利用率 →　EBITDA（万元/年）↑', 24, TX, 400, 1),
          P(SX + ux(40) + 16, SY + vy(-104) - 8, 260, '保守 40% · −104', 24, DK, 400, 1),
          P(SX + ux(55) + 20, SY + vy(21) + 6, 240, '基准 55% · 21', 24, DK, 500, 1),
          P(SX + ux(70) - 300, SY + vy(147) - 34, 280, '乐观 70% · 147', 24, DK, 400, 1, align='right'),
          P(SX + ux(52) + 12, SY + vy(-135) - 12, 220, '盈亏平衡 52%', 24, DK, 500, 1, build=1),
          P(SX + x0 + 8, SY + vy(116.3) - 34, 560, '10 年回本需约 116 万元/年（利用率约 68%）', 24, TX, 400, 1, extra=f'background:{BG};', build=2)]
    th = ''.join(f'<th style="width:{w}%;font-size:24px;font-weight:500;line-height:2.1;color:{DK};text-align:{"left" if i == 0 else "right"};border-bottom:2px solid {DK};padding:0px 8px;">{t}</th>'
                 for i, (t, w) in enumerate((('万元', 34), ('保守', 22), ('基准', 22), ('乐观', 22))))
    rows = [('利用率', '40%', '55%', '70%'), ('年收入', '608', '847', '1,085'), ('年成本', '713', '826', '939'),
            ('EBITDA', '−104', '21', '147'), ('回收期', '不回本', '55 年', '7.9 年'), ('10 年累计', '−2,320', '−1,108', '+104')]
    trs = ''
    for a, *vs in rows:
        cells = f'<td style="font-size:24px;line-height:2.1;color:{TX};border-bottom:1px solid {L2};padding:0px 8px;">{a}</td>'
        for j, v in enumerate(vs):
            bg = f'background:{Y};' if j == 1 else ''
            cells += f'<td style="{bg}font-family:{NUM};font-size:24px;line-height:2.1;color:{DK};text-align:right;border-bottom:1px solid {L2};padding:0px 8px;">{v}</td>'
        trs += f'<tr>{cells}</tr>'
    b.append(f'<table style="position:absolute;left:1280px;top:296px;width:512px;border-collapse:collapse;"><tr>{th}</tr>{trs}</table>')
    b.append(R(1280, 736, 512, 184, Y, 'display:flex;flex-direction:column;justify-content:center;gap:6px;padding:0px 32px;',
               T('盈亏平衡租金', 24, DK, 400, 1.3) + T('≤ 5.85 万元/亩/年', 44, DK, 300, 1.2, NUM) + T('利用率 55% 时；租金每变 1 万，EBITDA 变约 25 万', 24, DK, 400, 1.3), build=3))
    b.append(P(128, 952, 1664, '假设 ◐：每片每日 15 可售小时 · 室外 240 天/年 · 80/120 元/时 + 夜灯 20 元 · 租金 5 万元/亩/年 · 不含税、折旧、融资', 24, TX, 400, 1.3))
    b += footer(14)
    write('ops', section('ops', b))


# ------------------------------------------------------------------ 15 抓手
def levers():
    b = header('03 投资与运营', '教学占比和租金，是最大的两个抓手')
    b.append(P(128, 248, 1664, '基准情景 EBITDA 21 万元/年之上的增量（万元/年）◐ · 合计按联动重算，不等于逐项相加', 24, TX, 400, 1.3))
    items = [('提高教学占比', '已售场时 40% → 60%（仍在 35% 上限内）', 56), ('租金谈判', '5 → 3 万元/亩/年', 50),
             ('黄金时段提价', '120 → 140 元/时', 21), ('冬季减员降耗', '12–2 月两类岗位减员 50%', 16),
             ('夜灯费提价', '20 → 30 元/时', 5), ('会员储值替代平台', '平台订场 40% → 15%', -1)]
    x0 = 760
    sc = 15.0
    SY = 304
    RH = 88
    inner = []
    for i, (n, d, v) in enumerate(items):
        y = i * RH + 20
        w = abs(v) * sc
        inner.append(path(rp(x0 - 128 if v >= 0 else x0 - 128 - w, y, max(w, 3), 44), Y if v >= 0 else '#B9B8B0'))
    inner.append(path(f'M{x0 - 128} 0V{6 * RH}', 'none', DK, 2))
    b.append(svg('改善收益的抓手', 128, SY, 1664, 6 * RH, inner))
    for i, (n, d, v) in enumerate(items):
        y = SY + i * RH
        b.append(P(128, y + 6, 580, n, 32, DK, 400, 1.2))
        b.append(P(128, y + 48, 580, d, 24, TX, 400, 1.2))
        xe = x0 + abs(v) * sc if v >= 0 else x0 + 8
        b.append(P(xe + 16, y + 24, 160, f'{v:+d}'.replace('-', '−'), 32, DK, 400, 1.2, NUM, build=1 if i < 2 else None))
    cards = [(L1, '五项经营抓手（不含租金）', 'EBITDA 约 111 万元/年 · 回收期约 10.5 年'),
             (Y, '再谈下租金（六项合计）', 'EBITDA 约 161 万元/年 · 回收期约 7.2 年')]
    for i, (c, h, v) in enumerate(cards):
        b.append(R(128 + i * 848, 856, 816, 120, c, 'display:flex;flex-direction:column;justify-content:center;gap:4px;padding:0px 40px;',
                   T(h, 24, DK if i else TX, 400, 1.3) + T(v, 32, DK, 400, 1.3), build=2 + i))
    b += footer(15)
    write('levers', section('levers', b))


# ------------------------------------------------------------------ 16 待定项
def nextp():
    b = header('04 待定项与下一步', '拿地前，先谈定租金和教学合作方')
    rows = [('用地红线、性质、权属、使用年限', '总平面、投资', '甲方', ''),
            ('控规指标（绿地率、限高、退线）', '场地数、停车', '规划条件', ''),
            ('租金水平（建议 ≤3–4 万元/亩/年）', '收益', '甲方 / 土地方', '拿地前'),
            ('定位与教学合作方', '收益', '甲方', '拿地前'),
            ('投资上限与回收期目标', '方案取舍', '甲方', ''),
            ('运营模式', '收益', '甲方', ''),
            ('电力容量与市政接入', '夜场照明', '供电 / 市政', ''),
            ('道路开口与消防（走廊跨消防车道净高）', '出入口、走廊', '规划 / 消防', '')]
    th = ''.join(f'<th style="width:{w}%;font-size:24px;font-weight:500;line-height:2.1;color:{DK};text-align:left;border-bottom:2px solid {DK};padding:0px 16px;">{t}</th>'
                 for t, w in (('待定项', 48), ('影响', 20), ('找谁定', 18), ('前置条件', 14)))
    trs = ''
    for a, *rest in rows:
        hi = rest[2] == '拿地前'
        bg = f'background:{Y};' if hi else ''
        cells = ''
        for j, t in enumerate((a, *rest)):
            cells += f'<td style="{bg}font-size:24px;font-weight:{500 if (hi and j == 3) else 400};line-height:2.1;color:{DK if j in (0, 3) else TX};border-bottom:1px solid {L2};padding:0px 16px;">{t}</td>'
        trs += f'<tr>{cells}</tr>'
    b.append(f'<table style="position:absolute;left:128px;top:264px;width:1664px;border-collapse:collapse;"><tr>{th}</tr>{trs}</table>')
    steps = ['确认 01.5 与 02.7', '建主线卡 v0.1', '补用地与规划条件', '进入 b 阶段概念方案']
    b.append(P(128, 820, 300, '下一步', 24, DK, 500, 1.3, ls=4))
    for i, t in enumerate(steps):
        b.append(R(128 + i * 424, 860, 392, 96, L1 if i else DK, 'display:flex;align-items:center;padding:0px 32px;',
                   T(f'<span style="color:{Y if i == 0 else DK};">0{i + 1}　</span>{t}', 24, BG if i == 0 else DK, 400, 1.3), build=i + 1))
        if i < 3:
            b.append(P(128 + i * 424 + 392, 890, 32, '›', 32, TX, 300, 1, align='center'))
    b += footer(16)
    write('next', section('next', b))


if __name__ == '__main__':
    for fn in (cover, toc, s01, premise, site, demand, s02, plan, court, func, metrics, s03, capex, ops, levers, nextp):
        fn()
    print('ok')
