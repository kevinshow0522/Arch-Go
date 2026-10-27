#!/usr/bin/env python3
"""Static integrity checks only; not an architectural quality or authorship certificate."""
from pathlib import Path
import json,re,sys
ROOT=Path(__file__).resolve().parents[1]
def isbn_valid(s):
    return bool(re.fullmatch(r'\d{13}',s)) and sum(int(x)*(1 if i%2==0 else 3) for i,x in enumerate(s))%10==0

def validate(root):
    checks=[]
    def add(name,passed,detail=''):checks.append({'check':name,'pass':bool(passed),'detail':detail})
    main=(root/'SKILL.md').read_text(encoding='utf8')
    parts=main.split('---',2);add('YAML frontmatter boundaries',len(parts)==3 and not parts[0].strip())
    front=parts[1] if len(parts)==3 else ''
    m=re.search(r'^name:\s*(\S+)\s*$',front,re.M);name=m.group(1) if m else ''
    add('name matches install directory',name==root.name and bool(re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',name)) and len(name)<=64)
    d=re.search(r'^description:\s*(.+)$',front,re.M);add('nonempty description',d is not None and 1<=len(d.group(1))<=1024)
    broken=[]
    for target in re.findall(r'\]\(([^)]+)\)',main):
        if '://' not in target and not (root/target.split('#')[0]).exists():broken.append(target)
    add('SKILL relative links resolve',not broken,str(broken))
    books=json.loads((root/'references/books/出版物与全文状态.json').read_text())
    add('six distinct book IDs',len(books)==6 and len({b['id'] for b in books})==6)
    add('ISBN13 check digits (not identity proof)',all(isbn_valid(b['isbn']) for b in books))
    ids={b['id'] for b in books};bad=[]
    for b in books:
        if b['body_status']=='MISSING' and (b.get('full_review_complete') or b.get('book_claims_enabled')):bad.append(b['id'])
        if b.get('full_review_complete') and not b.get('complete_review_manifest'):bad.append(b['id'])
    add('body/read evidence gate',not bad,str(bad))
    s=json.loads((root/'references/index/sources_v04.json').read_text());sids={x['id'] for x in s}
    add('unique current sources with http origins',len(s)==len(sids) and all(x['url'].startswith('https://') for x in s))
    ops=json.loads((root/'method/operations.json').read_text())
    add('eight operations with sources',len(ops)==8 and all(set(o['source_ids'])<=sids for o in ops))
    add('operations expose limits and counterexamples',all(o.get('evidence_limit') and o.get('counterexample') and o.get('test') and o['epistemic_status']=='RESEARCH_OPERATIONALIZATION' for o in ops))
    channels=json.loads((root/'references/books/电子资源渠道核验.json').read_text())
    add('channel target identity registered',all(a['book_id'] in ids for a in channels))
    add('legacy 102 project title records retained',len(json.loads((root/'references/index/projects.json').read_text()))==102)
    add('legacy 12 case cards retained',len(list((root/'references/cases').glob('C*.md')))==12)
    add('legacy 16 rules retained',len(json.loads((root/'method/rules.json').read_text()))==16)
    figs=json.loads((root/'references/reading/公开图示检查.json').read_text())
    add('three reviewed public figures, no invented book pages',len(figs)==3 and all(f['book_page'] is None and f['source_id'] in sids for f in figs))
    return checks
if __name__=='__main__':
    try:rows=validate(ROOT)
    except Exception as e:print('Validation failed:',e,file=sys.stderr);raise SystemExit(2)
    print(json.dumps({'scope':'Static structure and evidence-state checks, not design validation','checks':rows},ensure_ascii=False,indent=2))
    raise SystemExit(0 if all(c['pass'] for c in rows) else 1)
