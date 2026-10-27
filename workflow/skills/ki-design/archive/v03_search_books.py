#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Simple offline locator-based search over already imported private book text."""
import argparse,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser();p.add_argument('query');p.add_argument('--book',default='');p.add_argument('--limit',type=int,default=12);a=p.parse_args()
 tokens=[s for s in a.query.strip().split() if s];results=[]
 paths=sorted((ROOT/'private_corpus').glob('*/fulltext_units.jsonl'))
 if a.book: paths=[p for p in paths if p.parent.name==a.book]
 if not paths: print('无已导入正文：请先使用 scripts/import_books.py 导入有权使用的电子书。');return
 for path in paths:
  for line in path.open(encoding='utf8'):
   r=json.loads(line);content=r['text'];score=sum(content.lower().count(t.lower()) for t in tokens)
   if not score:continue
   first=min((content.lower().find(t.lower()) for t in tokens if t.lower() in content.lower()),default=0)
   preview=content[max(0,first-60):first+160].replace('\n',' ')
   results.append((score,r['book_id'],r['locator'],preview))
 for score,book,loc,preview in sorted(results,reverse=True)[:max(1,a.limit)]:
  print(f'[{book} / {loc} / 命中={score}] {preview}')
if __name__=='__main__':main()
