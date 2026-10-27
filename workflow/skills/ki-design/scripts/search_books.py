#!/usr/bin/env python3
"""Find short, traceable passages in imported private documents, not training weights."""
from __future__ import annotations
import argparse,json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main()->int:
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('query');p.add_argument('--book',default='');p.add_argument('--limit',type=int,default=8)
    a=p.parse_args();tokens=[x.casefold() for x in a.query.split() if x.strip()]
    if not tokens:print('请输入至少一个检索词。',file=sys.stderr);return 2
    if a.book and not re.fullmatch(r'[A-Z0-9_-]+',a.book):print('无效书籍ID。',file=sys.stderr);return 2
    results=[]
    files=sorted((ROOT/'private_corpus').glob('*/*/text_units.jsonl'))
    for path in files:
        if a.book and path.parent.parent.name!=a.book:continue
        for line in path.read_text(encoding='utf8').splitlines():
            r=json.loads(line);text=r['text'];low=text.casefold();score=sum(low.count(t) for t in tokens)
            if not score:continue
            start=min(low.find(t) for t in tokens if t in low);snippet=text[max(0,start-45):start+140].replace('\n',' ')
            results.append({'score':score,'book_id':r['book_id'],'scope':r['scope'],'locator':r['locator'],
                'sha256':r['source_sha256'],'text_review':r['text_review_status'],'visual_review':r['visual_review_status'],'snippet':snippet})
    if not files:print('没有已导入正文。可先运行 query_skill.py 检索公开研究摘要；不能据此回答书内未读内容。');return 0
    for r in sorted(results,key=lambda x:x['score'],reverse=True)[:max(1,min(a.limit,30))]:print(json.dumps(r,ensure_ascii=False))
    if not results:print('没有匹配片段；这不证明书中不存在相关概念。')
    return 0
if __name__=='__main__':raise SystemExit(main())
