#!/usr/bin/env python3
"""Reconstruct all three concept views from one geometry file.
Each run creates a fresh render-rNN folder; previous renders are preserved.
Source geometry is speculative design geometry, never survey information.
"""
import json, math
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Polygon, Circle, FancyArrowPatch
from matplotlib.font_manager import FontProperties
import numpy as np

ROOT=Path(__file__).parent
G=json.loads((ROOT/'geometry.json').read_text())
for i in range(1000):
    OUT=ROOT/f'render-r{i:02d}'
    if not OUT.exists(): OUT.mkdir(); break
FONT=FontProperties(fname='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
BOLD=FontProperties(fname='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc')
matplotlib.rcParams['font.family']=FONT.get_name()
matplotlib.rcParams['svg.fonttype']='path'
matplotlib.rcParams['axes.unicode_minus']=False
BG='#F6F3EC'; INK='#263B36'; MUTE='#6E7A70'; EDGE='#64786F'; GREEN='#E2E8D8'
COL={'B1':'#C8DAD1','B2':'#DCD0B4','B3':'#B7CACB','B4':'#EBDCC3'}
ORANGE='#BD633D'; BLUE='#547592'; GREY='#909487'; RED='#A3473C'

def text(ax,x,y,s,size=10,color=INK,weight=False,ha='left',va='center',**kw):
    return ax.text(x,y,s,fontsize=size,color=color,fontproperties=BOLD if weight else FONT,ha=ha,va=va,**kw)
def rect(ax,r,fc='none',ec=EDGE,lw=1,**kw):
    x0,y0,x1,y1=r
    p=Rectangle((x0,y0),x1-x0,y1-y0,facecolor=fc,edgecolor=ec,linewidth=lw,**kw); ax.add_patch(p); return p
def line(ax,pts,c=INK,lw=1,**kw):
    a=np.array(pts); return ax.plot(a[:,0],a[:,1],color=c,lw=lw,**kw)
def arrow(ax,pts,c=ORANGE,lw=2,style='-',head=10):
    line(ax,pts,c,lw,ls=style)
    ax.add_patch(FancyArrowPatch(pts[-2],pts[-1],arrowstyle='-|>',mutation_scale=head,color=c,lw=lw))
def dim(ax,a,b,label,offset=0,vertical=False):
    if not vertical:
        y=a[1]+offset; x0=a[0]; x1=b[0]
        line(ax,[(x0,y),(x1,y)],MUTE,.65)
        for x in [x0,x1]:line(ax,[(x,y-1.3),(x,y+1.3)],MUTE,.65)
        text(ax,(x0+x1)/2,y+2.5,label,7.5,MUTE,ha='center')
    else:
        x=a[0]+offset; y0=a[1]; y1=b[1]
        line(ax,[(x,y0),(x,y1)],MUTE,.65)
        for y in [y0,y1]:line(ax,[(x-1.3,y),(x+1.3,y)],MUTE,.65)
        text(ax,x+2,(y0+y1)/2,label,7.5,MUTE,rotation=90,ha='center')
def base(number,title,sub):
    fig=plt.figure(figsize=(16,11),facecolor=BG)
    a=fig.add_axes([0,0,1,1]);a.set(xlim=(0,1600),ylim=(0,1100));a.axis('off')
    text(a,62,1052,'UIA BEIJING / CONCEPT EXERCISE',11,MUTE)
    text(a,62,988,title,29,INK,True)
    text(a,64,940,sub,11,MUTE)
    text(a,1535,1025,number,35,ORANGE,True,ha='right')
    line(a,[(62,910),(1536,910)],EDGE,.7)
    line(a,[(62,75),(1536,75)],EDGE,.6)
    text(a,64,45,'概念练习 · 边界、面积、容量、层高均为可撤回假设 · 非实际 UIA 委托或规划确认',9,MUTE)
    text(a,1535,45,'A / v1 · 2026.10.10',9,MUTE,ha='right')
    return fig,a
def save(fig,name):
    for ext in ['svg','png','pdf']:
        fig.savefig(OUT/f'{name}.{ext}',dpi=180,facecolor=BG)
    plt.close(fig)

# 01. PLAN, consistent true north +Y.
fig,board=base('01','河岸公共厅｜平面关系','把不需入场证的地面路径留出来；把大跨度和冬季使用放回清楚的建筑边界。')
ax=fig.add_axes([.035,.11,.715,.70]);ax.set_aspect('equal');ax.set(xlim=(-42,278),ylim=(-5,224));ax.axis('off')
rect(ax,[-38,-5,-12,209],'#D8E5E3','none')
for xx in [-31,-24,-17]:line(ax,[(xx,-5),(xx,206)],'#BDD4D0',.7)
text(ax,-25,65,'永定河方向\n位置仅示意',8,MUTE,ha='center',rotation=90)
ax.add_patch(Polygon(G['site']['polygon'],closed=True,facecolor=GREEN,edgecolor=EDGE,lw=1.1,ls=(0,(5,3))))
line(ax,[(-35,216),(76,216)],'#B1B5AB',6)
line(ax,[(-35,216),(76,216)],BG,1)
text(ax,82,215,'首钢桥方向（不表示实际线位）',8,MUTE)
line(ax,[(15,0),(275,200)],'#CDD0C5',8)
text(ax,222,150,'假设城市到达边',8,MUTE,rotation=37)
rect(ax,[0,0,24,200],'#D9E2CF','none',alpha=.65)
line(ax,[(18,8),(18,194)],'#9BB39E',1.5,ls=(0,(3,3)))
text(ax,7,32,'河侧留白\n宽度待核',7.5,MUTE)
rect(ax,G['outdoor'][0]['rect'],'#EEE5CC','none')
text(ax,82,99,'C1  开放论坛',12,INK,True,ha='center')
text(ax,82,93,'72 × 38 m · 东南开敞',8,MUTE,ha='center')
for m in G['masses']:rect(ax,m['rect'],COL[m['id']],INK,1.1)
rect(ax,G['masses'][0]['ground_void'],GREEN,'none')
for yy in [108,120]:line(ax,[(30,yy),(48,yy)],INK,1,ls=(0,(4,3)))
text(ax,39,144,'B1  展览 / 公共翼',8.5,INK,True,ha='center',rotation=90)
text(ax,39,94,'咖啡',8,INK,ha='center',rotation=90)
rect(ax,[30,154,36,166],BG,EDGE,.6)
for yy in range(155,166,2):line(ax,[(30,yy),(36,yy)],EDGE,.4)
rect(ax,[36,158,42,164],BG,EDGE,.6)
text(ax,39,161,'L',5,MUTE,ha='center')
rect(ax,[30,82,36,90],BG,EDGE,.6)
text(ax,33,86,'S',5,MUTE,ha='center')
line(ax,[(102,138),(102,174)],INK,.8)
rect(ax,[60,166,102,174],'#C1AD87',INK,.6)
text(ax,81,170,'舞台 / 设备边',7.2,INK,ha='center')
for yy in [146,150,154,158,162]:
    for xx in np.arange(65,100,4):line(ax,[(xx,yy),(xx+2.2,yy)],'#B09E7B',1.4)
text(ax,81,156,'B2 大会堂',10.5,INK,True,ha='center',bbox=dict(facecolor=COL['B2'],edgecolor='none',pad=2))
text(ax,81,149,'600 席假设',8,INK,ha='center',bbox=dict(facecolor=COL['B2'],edgecolor='none',pad=2))
text(ax,111,157,'后勤 / 技术',7.5,INK,ha='center',rotation=90)
text(ax,90,131.8,'B4  冬季门厅',9.5,INK,True,ha='center')
text(ax,144,151,'B3  分会 / 办公',8.5,INK,True,ha='center',rotation=90)
line(ax,[(144,138),(144,174)],EDGE,.7)
for yy in [138,150,162]:line(ax,[(132,yy),(156,yy)],EDGE,.6)
rect(ax,[132,126,138,138],BG,EDGE,.6)
text(ax,135,132,'S/L',4.5,MUTE,ha='center',rotation=90)
rect(ax,[150,166,156,174],BG,EDGE,.6)
text(ax,153,170,'S',5,MUTE,ha='center')
# Exterior traffic, indoor traffic, and management thresholds.
arrow(ax,G['paths']['P0_public'],ORANGE,2.8,head=11)
arrow(ax,G['paths']['P1_conference'],BLUE,1.8,head=9)
arrow(ax,G['paths']['P2_office'],BLUE,1.6,head=9)
arrow(ax,G['paths']['S1_staff'],GREY,1.5,'--',8)
arrow(ax,G['paths']['S2_delivery'],GREY,1.5,'--',8)
for pts in G['management'].values():
    if isinstance(pts,list):line(ax,pts,RED,2,ls=(0,(3,2)))
for id,p in G['entries'].items():
    ax.add_patch(Circle(p,2.5,facecolor=BG,edgecolor=ORANGE if id in ['E0_city','E1_river'] else GREY,lw=1.2))
text(ax,182,132,'E0 城市入口',8,ORANGE)
text(ax,18,106,'E1',8,ORANGE,ha='center')
text(ax,237,179,'E2',7,MUTE)
text(ax,236,192,'E3',7,MUTE)
text(ax,176,201,'后勤仅从北 / 东侧到达',8,MUTE,ha='center')
line(ax,[(48,180),(30,180),(30,167)],MUTE,.6)
text(ax,47,184,'公共翼：2 层 / 9.6 m',8,MUTE,ha='right')
dim(ax,(60,174),(120,174),'60 m',offset=9)
dim(ax,(120,138),(120,174),'36 m 主跨',offset=6,vertical=True)
dim(ax,(30,82),(48,82),'18 m',offset=-8)
text(ax,36,121.8,'局部穿堂',7,ORANGE,ha='center')
# Section positions: AA x84, BB y114.
line(ax,[(84,83),(84,187)],RED,.8,ls=(0,(6,3,1,3)))
for yy,label in [(83,'A'),(187,'A')]:
    arrow(ax,[(84,yy),(79,yy)],RED,.9,head=7);text(ax,86,yy,label,8,RED)
line(ax,[(20,114),(60,114)],RED,.7,ls=(0,(6,3,1,3)))
for xx in [20,60]:arrow(ax,[(xx,114),(xx,119)],RED,.8,head=6);text(ax,xx,122,'B',7,RED,ha='center')
# North, scale.
arrow(ax,[(241,32),(241,53)],INK,1.2,head=9);text(ax,241,59,'N',10,INK,True,ha='center')
line(ax,[(58,14),(108,14)],INK,2)
for xx in [58,83,108]:line(ax,[(xx,13),(xx,15)],INK,1)
text(ax,58,7,'0',7,MUTE,ha='center');text(ax,83,7,'25',7,MUTE,ha='center');text(ax,108,7,'50 m',7,MUTE,ha='center')
text(ax,135,36,'三角形只是一张工作底稿\n无比例对应实际地籍',9,MUTE)
# Notes column.
sx=1222
text(board,sx,849,'四个相连的功能块',16,INK,True)
notes=[('B1  公共翼','18 × 84 m；局部穿堂\n首层开放功能，二层图书与工作坊。'),('B2  连续大会堂','60 × 36 m；净厅 42 × 36 m\n不为造院而拆分大会议空间。'),('B3  会议办公翼','24 × 48 m；三层\n受控会议、办公室与研究空间。'),('B4  冬季门厅','84 × 12 m；单层\n连接三翼，承担室内等候。')]
yy=797
for title,body in notes:
    text(board,sx,yy,title,12,INK,True);text(board,sx,yy-36,body,10,MUTE,va='top',linespacing=1.8);yy-=117
text(board,sx,307,'10,080 m²',24,INK,True)
text(board,sx,273,'暂定地上室内面积；未设地下室',9.3,MUTE)
text(board,sx,229,'橙：公众地面路径\n蓝：室内登记与受控访问\n灰虚线：员工与货运\n红虚线：会议 / 办公管理线',10,MUTE,va='top',linespacing=1.8)
text(board,sx,121,'首层 S / L 为楼梯、电梯预留；\n出口、车行、无障碍仍需专项校核。',8.5,MUTE,va='top')
save(fig,'01_plan_v1')

# 02. AA true section; BB supplemental section through public opening.
fig,board=base('02','一条公共路径，两种气候边界｜关键剖面','A—A 沿 x = 84 m，向西看：开放论坛 → 冬季门厅 → 受控大会堂。标高均相对假设地面。')
ax=fig.add_axes([.055,.45,.90,.35]);ax.set_aspect('equal');ax.set(xlim=(80,191),ylim=(-4,26));ax.axis('off')
rect(ax,[80,-1.5,191,0],'#D5D8CB','none')
line(ax,[(80,0),(191,0)],INK,1.8)
rect(ax,[126,0,138,4.8],COL['B4'],INK,1.2)
rect(ax,[138,0,174,12],COL['B2'],INK,1.2)
rect(ax,[138,10.2,174,12],'#B7A27A',INK,.8)
for yy in range(138,174,6):line(ax,[(yy,10.2),(yy+3,12),(yy+6,10.2)],INK,.65)
for yy in [138,174]:rect(ax,[yy-.25,0,yy+.25,10.2],INK,INK,.6)
rect(ax,[138,8.2,138.15,10.2],BLUE,BLUE,1.4)
rect(ax,[166,0,174,.8],'#AA9268',INK,.6)
for p in np.arange(143,165,3):
    ax.add_patch(Circle((p,1.3),.18,facecolor=INK,edgecolor='none'))
    line(ax,[(p,1.1),(p,.55),(p+.45,.55),(p+.45,.1)],INK,.65)
    line(ax,[(p-.2,.75),(p-.2,.05)],INK,.55)
text(ax,108,2.5,'C1  开放论坛',13,INK,True,ha='center')
text(ax,132,2.4,'B4\n冬季门厅',9,INK,True,ha='center',linespacing=1.6)
text(ax,155.5,6.4,'B2  600 席大会堂',13,INK,True,ha='center')
text(ax,155.5,4.5,'无中柱主体 · 座席仅示意',9,MUTE,ha='center')
text(ax,171,1.7,'舞台',7,INK,ha='center')
arrow(ax,[(88,.45),(117,.45)],ORANGE,2.1,head=11)
arrow(ax,[(122,.45),(130,.45),(141,.45)],BLUE,1.9,head=10)
line(ax,[(138,0),(138,4.3)],RED,2,ls=(0,(3,2)))
text(ax,138,-3.3,'会议管理线',8,RED,ha='center')
text(ax,126,-3.3,'室内外门槛',8,MUTE,ha='center')
line(ax,[(126,0),(126,4.8),(138,4.8),(138,12),(174,12),(174,0)],ORANGE,1.3,ls=(0,(3,2)))
text(ax,161,19.8,'36 m 概念钢桁架；构件尺寸待算',10,INK,ha='center')
line(ax,[(150,18),(156,12.2)],MUTE,.7)
dim(ax,(138,12),(174,12),'36 m',offset=3)
for zz,label,xstart in [(0,'±0.00',174),(4.8,'+4.80',138),(10.2,'+10.20 净空上缘',174),(12,'+12.00',174)]:
    xx=179 if zz!=4.8 else 121
    line(ax,[(xstart,zz),(xx,zz)],MUTE,.6)
    text(ax,xx+.6,zz+.2,label,7.5,MUTE,ha='left' if zz!=4.8 else 'right')
text(ax,118,21,'冬季活动回到室内门厅；\n室外论坛按季节与活动使用。',9,MUTE,ha='center')
line(ax,[(125,18),(131,5)],MUTE,.6)
text(ax,94,8.5,'公众穿行 P0 从此处\n向西穿过 B1（见 B—B）',9,ORANGE)
text(ax,181,21,'北 N',9,MUTE,ha='center')
text(ax,89,21,'南 S',9,MUTE,ha='center')
text(board,68,458,'B—B｜公共翼穿堂，向北看',15,INK,True)
bx=fig.add_axes([.055,.13,.34,.25]);bx.set_aspect('equal');bx.set(xlim=(18,65),ylim=(-3,18));bx.axis('off')
line(bx,[(18,0),(65,0)],INK,1.4)
rect(bx,[30,4.8,48,9.6],COL['B1'],INK,1.2)
rect(bx,[30,4.2,48,4.8],'#8C9A8C',INK,.65)
for xx in [30,48]:line(bx,[(xx,0),(xx,9.6)],GREY,.8,ls=(0,(4,3)))
text(bx,39,7.3,'B1 二层图书 / 工作坊',8,INK,ha='center')
text(bx,39,2.3,'公共穿堂 · 净高约 4.2 m',8,ORANGE,ha='center')
arrow(bx,[(62,.6),(50,.6),(29,.6),(20,.6)],ORANGE,1.7,head=9)
text(bx,19,-1.7,'河侧',8,MUTE);text(bx,63,-1.7,'论坛',8,MUTE,ha='right')
text(bx,39,14.3,'跨越方向为南北 12 m；支承在 y = 108 / 120。\n灰虚线是剖面后方的支承，不是悬浮楼板。',8,MUTE,ha='center',linespacing=1.6)
text(board,668,431,'结构与边界来自同一项选择',15,INK,True)
text(board,669,381,'1  大会堂保留连续大跨，两端落地承重。\n2  公共翼只在一处跨过步行道；穿堂顶板连续保温待深化。\n3  单层门厅将三个功能块接起来，接缝与设备边界分别解决。\n4  闭馆时关闭室内入口，地块内 P0 可独立保留。',11,MUTE,va='top',linespacing=2)
text(board,669,192,'未验证：防洪与绝对标高、结构截面、抗震、热桥、\n冬季风、遮阳、消防疏散及河侧通行权。\n橙色虚线为拟议连续热边界；不代表性能模拟已完成。',10,MUTE,va='top',linespacing=1.8)
save(fig,'02_sections_v1')

# 03. Simple deterministic mass axon, viewed from southwest.
fig,board=base('03','低门厅，把三种尺度连成一所公共建筑｜体量轴测','西南向东北看；轴测直接使用 01 平面与 02 剖面的同一坐标和高度。无虚构地形、覆土或工业遗存。')
ax=fig.add_axes([.02,.10,.73,.72]);ax.axis('off');ax.set_aspect('equal');ax.set(xlim=(-70,900),ylim=(70,850))
def proj(x,y,z=0):return np.array([420+2.5*x-2.5*y,100+1.3*x+1.3*y+4.5*z])
def poly3(points,fc,ec=EDGE,lw=.7,**kw):
    p=Polygon([proj(*p) for p in points],facecolor=fc,edgecolor=ec,lw=lw,closed=True,**kw);ax.add_patch(p);return p
def line3(points,c=EDGE,lw=.7,**kw):
    q=np.array([proj(*p) for p in points]);line(ax,q,c,lw,**kw)
def shade(c,f):
    from matplotlib.colors import to_rgb,to_hex
    return to_hex([max(0,min(1,a*f)) for a in to_rgb(c)])
def box(r,z0,z1,c):
    x0,y0,x1,y1=r
    # Visible west and south faces, then top.
    poly3([(x0,y0,z0),(x0,y1,z0),(x0,y1,z1),(x0,y0,z1)],shade(c,.79),INK,.6)
    poly3([(x0,y0,z0),(x1,y0,z0),(x1,y0,z1),(x0,y0,z1)],shade(c,.92),INK,.6)
    poly3([(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)],c,INK,.7)
poly3([(-34,0,0),(-12,0,0),(-12,210,0),(-34,210,0)],'#D8E5E3','none')
poly3([(x,y,0) for x,y in G['site']['polygon']],GREEN,EDGE,.9)
line3([(-35,216,0),(76,216,0)],'#ADB1A6',5)
poly3([(48,88,.05),(120,88,.05),(120,126,.05),(48,126,.05)],'#EEE5CC','none')
q=np.array([proj(x,y,.15) for x,y in G['paths']['P0_public']]);line(ax,q,ORANGE,3)
ax.add_patch(FancyArrowPatch(q[-2],q[-1],arrowstyle='-|>',mutation_scale=10,color=ORANGE,lw=2))
# Far to near composition from the southwest viewpoint.
box([132,126,156,174],0,14.4,COL['B3'])
for z in [4.8,9.6]:
    line3([(132,126,z),(156,126,z)],'#758F8F',.65)
    line3([(132,126,z),(132,174,z)],'#758F8F',.65)
box([60,138,120,174],0,12,COL['B2'])
for xx in range(60,121,6):line3([(xx,138,12.05),(xx,174,12.05)],'#B9A784',.7)
line3([(102,138,12.08),(102,174,12.08)],INK,.8,ls=(0,(3,2)))
box([48,126,132,138],0,4.8,COL['B4'])
for xx in range(54,132,6):line3([(xx,126,0),(xx,126,4.8)],'#A68C66',.55)
box([30,120,48,166],0,9.6,COL['B1'])
box([30,108,48,120],4.8,9.6,COL['B1'])
box([30,82,48,108],0,9.6,COL['B1'])
line3([(30,82,4.8),(30,108,4.8)],'#849B8D',.7)
line3([(30,120,4.8),(30,166,4.8)],'#849B8D',.7)
# Route remains visible through portal; show a short foreground arrow.
q=np.array([proj(x,y,.2) for x,y in [(30,114),(18,114)]]);arrow(ax,q,ORANGE,2,head=8)
# The north and east axes are projected, not redrawn with arbitrary orientation.
o=proj(215,55,0)
for target,label in [(proj(215,80,0),'N'),(proj(240,55,0),'E')]:
    arrow(ax,[o,target],INK,1,head=8);text(ax,target[0],target[1]+10,label,9,INK,True,ha='center')
def callout(p,elbow,end,label):
    xy=proj(*p);line(ax,[xy,elbow,end],MUTE,.6);text(ax,end[0]+(4 if end[0]>elbow[0] else -4),end[1],label,9,INK,ha='left' if end[0]>elbow[0] else 'right')
callout((36,142,9.6),(77,536),(-32,536),'B1 / 2 层 / 9.6 m')
callout((80,155,12),(270,663),(98,663),'B2 / 12 m / 连续大跨')
callout((144,150,14.4),(524,680),(631,680),'B3 / 3 层 / 14.4 m')
callout((102,126,4.8),(552,458),(696,458),'B4 / 单层 / 4.8 m')
callout((30,114,2.4),(140,384),(17,384),'穿堂：局部跨越，地面连续')
xy=proj(84,104,.1);text(ax,xy[0]+20,xy[1]-22,'C1  开放论坛',10,INK,True,ha='center')
text(ax,270,238,'P0  城市 → 论坛 → 河侧',10,ORANGE,ha='center')
text(ax,149,735,'首钢桥方向仅为符号',8,MUTE,ha='center')
text(ax,-20,195,'河侧方向仅为符号',8,MUTE)
sx=1225
text(board,sx,845,'体量不变量',16,INK,True)
text(board,sx,793,'公共翼在西；大会堂在北；\n办公翼在东；单层门厅居中。\n同一组坐标生成三张图。',11,MUTE,va='top',linespacing=1.8)
text(board,sx,669,'一处有理由的“空”',15,INK,True)
text(board,sx,620,'只有公共翼跨过地面路径。\n办公和大会堂落地，避免\n把整个建筑变成大面积架空。',11,MUTE,va='top',linespacing=1.8)
text(board,sx,493,'承担的代价',15,INK,True)
text(board,sx,444,'较紧凑叠层备选多占地；\n分翼使围护与连接面增多。\n论坛的户外使用具有季节性。',11,MUTE,va='top',linespacing=1.8)
text(board,sx,316,'可能推翻主案的事实',15,INK,True)
text(board,sx,267,'若获批可建区明显收缩，\n或河侧通行接口不能成立，\n应转向紧凑叠层并重新比较。',11,MUTE,va='top',linespacing=1.8)
text(board,sx,136,'平屋面排水、设备位置、立面\n与绿化属于后续验证，不以\n这张体量图冒充工程定案。',8.5,MUTE,va='top',linespacing=1.6)
save(fig,'03_axon_v1')

# Numeric checks are intentionally geometric, not code-compliance checks.
issues=[]
for m in G['masses']:
    x0,y0,x1,y1=m['rect']
    for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]:
        if not (x>=0 and y<=200 and x<=1.3*y):issues.append(f"Outside assumed triangle: {m['id']} {x,y}")
assert sum(m['gfa_m2'] for m in G['masses'])==G['areas']['gfa_total_m2']
assert sum(G['alternative']['floor_areas'])==10080
assert G['masses'][3]['rect'][3]==G['masses'][1]['rect'][1]
assert not issues,issues
(OUT/'numeric_checks.json').write_text(json.dumps({'checked':['all rectangle corners inside assumed triangle','sum primary floor areas = 10080 m²','alternative floor areas = 10080 m²','B4 north edge meets B2 south edge at y138'],'issues':issues,'does_not_check':['real cadastral boundary','flood planning','building codes','engineering calculations','visual consistency until images actually opened']},ensure_ascii=False,indent=2))
print(OUT)
