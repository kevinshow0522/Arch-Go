#!/usr/bin/env python3
"""Static integrity checks only; not an architectural quality or authorship certificate."""
from pathlib import Path
import argparse,csv,hashlib,json,re,sys
from urllib.parse import unquote
ROOT=Path(__file__).resolve().parents[1]
def isbn_valid(s):
    return bool(re.fullmatch(r'\d{13}',s)) and sum(int(x)*(1 if i%2==0 else 3) for i,x in enumerate(s))%10==0

def validate(root, check_manifest=False):
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
    # Check active current resources as well as the inherited V0.4 registry.
    json_errors=[]
    for path in sorted(root.rglob('*.json')):
        if path.relative_to(root).parts[0] in ('archive','private_corpus'):
            continue
        try:json.loads(path.read_text(encoding='utf-8-sig'))
        except (ValueError,OSError) as exc:json_errors.append(f'{path.relative_to(root)}: {exc}')
    add('active JSON resources parse',not json_errors,str(json_errors))
    current_broken=[]
    for path in sorted(root.rglob('*.md')):
        if path.relative_to(root).parts[0] in ('archive','private_corpus'):
            continue
        for match in re.finditer(r'\]\((?:<([^>]+)>|([^\)]+))\)',path.read_text(encoding='utf-8-sig')):
            target=match[1] or match[2]
            if re.match(r'^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|#)',target):continue
            target=unquote(target.split('#',1)[0])
            if target and not (path.parent/target).exists():
                current_broken.append(f'{path.relative_to(root)} -> {target}')
    add('active nested Markdown links resolve',not current_broken,str(current_broken))
    try:
        theory=json.loads((root/'references/index/sources_v06_theory.json').read_text(encoding='utf-8-sig'))['sources']
        drawings=json.loads((root/'references/index/sources_v06_drawings.json').read_text(encoding='utf-8-sig'))['sources']
        current_sources=theory+drawings
        current_ids={row['id'] for row in current_sources}
        add('current theory and drawing source identities',
            len(current_sources)==len(current_ids) and all(row.get('url','').startswith('https://') for row in current_sources))
        mapping=(root/'method/条件到空间操作对照.md').read_text(encoding='utf-8-sig')
        references=set(re.findall(r'\b(?:W\d{2}|R\d{2}|T06_S\d+|D06_\d+_\d+)\b',mapping))
        registered=current_ids|{row['id'] for row in ops}|{row['id'] for row in json.loads((root/'method/rules.json').read_text(encoding='utf-8-sig'))}
        unresolved=sorted(references-registered)
        add('condition map references registered operations and evidence',not unresolved,str(unresolved))
    except (ValueError,OSError,KeyError) as exc:
        add('current research resources readable',False,str(exc))
    # Verify the duplicated current source snapshot, not just JSON syntax.
    combined=json.loads((root/'references/index/sources_v06.json').read_text(encoding='utf-8-sig'))
    mismatches=[]
    for key,filename in [('theory_sources','sources_v06_theory.json'),('drawing_sources','sources_v06_drawings.json')]:
        split=json.loads((root/'references/index'/filename).read_text(encoding='utf-8-sig'))['sources']
        snapshot=combined[key]
        if len(snapshot)!=len({row['id'] for row in snapshot}) or {row['id']:row for row in snapshot}!={row['id']:row for row in split}:
            mismatches.append(key)
    add('combined source snapshot equals split registries',not mismatches,str(mismatches))

    unresolved=[]
    for folder in ('method','references/theory','references/reading'):
        for path in sorted((root/folder).rglob('*.md')):
            refs=set(re.findall(r'\b(?:T06_S\d+|D06_\d+_\d+)\b',path.read_text(encoding='utf-8-sig')))
            unresolved.extend(f'{path.relative_to(root)}: {sid}' for sid in sorted(refs-current_ids))
    add('current source citations in method and reading cards resolve',not unresolved,str(unresolved))

    bad_claims=[]
    for book in books:
        if not (book.get('book_claims_enabled') or book.get('full_review_complete')):
            continue
        reference=book.get('complete_review_manifest')
        proof=(root/reference).resolve() if isinstance(reference,str) and reference else None
        if not (book.get('full_review_complete') and book.get('completeness_verified')
                and book.get('body_status') not in ('MISSING','FULL_IMPORTED_UNVERIFIED','PREVIEW_IMPORTED_UNVERIFIED')
                and re.fullmatch(r'[0-9a-fA-F]{64}',book.get('source_file_sha256') or '')
                and proof and root.resolve() in proof.parents and proof.is_file() and proof.stat().st_size):
            bad_claims.append(book['id'])
    add('full-book claim flags have consistent state and review reference',not bad_claims,str(bad_claims))

    # JSON, human-readable cards and the CSV registry describe the same operations.
    operation_drift=[]
    with (root/'method/操作卡登记.csv').open(encoding='utf-8-sig',newline='') as stream:
        csv_rows=list(csv.DictReader(stream))
    csv_by_id={row['id']:row for row in csv_rows}
    if len(csv_rows)!=len(csv_by_id) or set(csv_by_id)!={row['id'] for row in ops}:
        operation_drift.append('CSV operation identities')
    labels={'trigger':'触发','inputs':'输入','operation':'操作','output':'交付','evidence_limit':'边界','counterexample':'反例','test':'检查'}
    for row in ops:
        csv_row=csv_by_id.get(row['id'],{})
        for key,value in row.items():
            normalized=';'.join(value) if isinstance(value,list) else value
            if csv_row.get(key)!=normalized:operation_drift.append(f"{row['id']}: CSV {key}")
        card=(root/'method/operations'/f"{row['id']}.md").read_text(encoding='utf-8-sig')
        for key,label in labels.items():
            values=[line[len(label)+1:] for line in card.splitlines() if line.startswith(label+'：')]
            if values!=[row[key]]:operation_drift.append(f"{row['id']}: card {key}")
    add('operation JSON cards and CSV registry agree',not operation_drift,str(operation_drift))

    if check_manifest:
        manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8-sig'))
        records=manifest['files'];listed={row['path']:row for row in records}
        actual={p.relative_to(root).as_posix():p for p in root.rglob('*')
                if p.is_file() and not p.is_symlink() and p.name!='manifest.json'
                and '__pycache__' not in p.parts and p.suffix!='.pyc'}
        bad=[]
        for name,record in listed.items():
            path=actual.get(name)
            if path is None or len(path.read_bytes())!=record['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest()!=record['sha256']:
                bad.append(name)
        add('release manifest inventory and SHA256 match',len(records)==len(listed) and set(actual)==set(listed) and not bad,
            str({'mismatches':bad,'unlisted':sorted(set(actual)-set(listed)),'missing':sorted(set(listed)-set(actual))}))
        release=re.search(r'^\s+version:\s*[\"\x27]?([^\"\x27\s]+)',front,re.M)
        add('release manifest version matches SKILL',bool(release) and manifest['release']==release[1])
    return checks
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-manifest',action='store_true',help='Also verify the release inventory and SHA256; run after rebuilding manifest.json.')
    args=parser.parse_args()
    try:rows=validate(ROOT,args.check_manifest)
    except Exception as e:print('Validation failed:',e,file=sys.stderr);raise SystemExit(2)
    print(json.dumps({'scope':'Static structure and evidence-state checks, not design validation','checks':rows},ensure_ascii=False,indent=2))
    raise SystemExit(0 if all(c['pass'] for c in rows) else 1)
