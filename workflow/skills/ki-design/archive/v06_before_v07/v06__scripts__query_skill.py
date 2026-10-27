#!/usr/bin/env python3
"""Offline keyword lookup over public research notes only; no network or full books."""
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('query');p.add_argument('--limit',type=int,default=6);a=p.parse_args()
    tokens=[x.casefold() for x in a.query.split() if x.strip()]
    if not tokens:print('请输入检索词，可用空格分隔。',file=sys.stderr);return 2
    paths=list((ROOT/'method/operations').glob('*.md'))+list((ROOT/'references/reading').glob('*.md'))+list((ROOT/'references/cases').glob('*.md'))
    found=[]
    for path in paths:
        text=path.read_text(encoding='utf8');low=text.casefold();score=sum(low.count(t) for t in tokens)
        if not score:continue
        first=min(low.find(t) for t in tokens if t in low)
        found.append({'score':score,'path':str(path.relative_to(ROOT)),'status':'PUBLIC_RESEARCH_NOTE_NOT_FULL_BOOK',
                      'preview':text[max(0,first-40):first+170].replace('\n',' ')})
    for r in sorted(found,key=lambda x:x['score'],reverse=True)[:max(1,min(30,a.limit))]:print(json.dumps(r,ensure_ascii=False))
    if not found:print('未命中公开研究摘要；请改变检索词，不得推断全书无此内容。')
    return 0
if __name__=='__main__':raise SystemExit(main())
