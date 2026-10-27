from pathlib import Path
import json, math, sys
p=Path(sys.argv[1]); g=json.loads(p.read_text())
def inside(pt):
 x,y=pt;return x>=-1e-6 and y<=200+1e-6 and x<=1.3*y+1e-6
checks=[]
for group in ('masses','outdoor'):
 for m in g[group]:
  x0,y0,x1,y1=m['rect']; corners=[(x0,y0),(x1,y0),(x1,y1),(x0,y1)]
  checks.append({'id':m['id'],'within_assumed_site':all(inside(c) for c in corners),'outside_corners':[c for c in corners if not inside(c)]})
p0=g['paths']['P0_public']; hits=[]
for a,b in zip(p0,p0[1:]):
 for i in range(101):
  t=i/100; x=a[0]+t*(b[0]-a[0]);y=a[1]+t*(b[1]-a[1])
  for m in g['masses']:
   x0,y0,x1,y1=m['rect']
   if x0<x<x1 and y0<y<y1:
    v=m.get('ground_void'); ok=v and v[0]<=x<=v[2] and v[1]<=y<=v[3]
    if not ok:hits.append([m['id'],x,y])
checks.append({'P0_blocked_by_ground_enclosure':bool(hits),'hits':hits[:5]})
checks.append({'gfa_sum':sum(m['gfa_m2'] for m in g['masses']),'declared_gfa':g['areas']['gfa_total_m2']})
checks.append({'alternative_gfa_sum':sum(g['alternative']['floor_areas']),'declared_alt_gfa':g['alternative']['gfa_total_m2']})
print(json.dumps({'geometry':str(p),'checks':checks,'scope':'Independent concept-only containment, sampled P0 collision, arithmetic checks; no engineering or regulatory validation'},ensure_ascii=False,indent=2))
