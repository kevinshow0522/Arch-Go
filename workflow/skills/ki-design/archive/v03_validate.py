from pathlib import Path
import csv,json
root=Path(__file__).resolve().parents[1]
for x in ['SKILL.md','README.md','method/rules.json','references/index/sources.json','references/index/projects.json','references/index/verified_cases.json']:
 assert (root/x).is_file(),x
sources=json.loads((root/'references/index/sources.json').read_text(encoding='utf-8'))
projects=json.loads((root/'references/index/projects.json').read_text(encoding='utf-8'))
cases=json.loads((root/'references/index/verified_cases.json').read_text(encoding='utf-8'))
rules=json.loads((root/'method/rules.json').read_text(encoding='utf-8'))
sids={s['来源ID'] for s in sources}
assert len(projects)==102
assert len(cases)==12
assert len(sids)==len(sources)
assert all(c['source'] in sids for c in cases)
assert all(all(s in sids for s in r['evidence_ids'].split(';')) for r in rules)
for c in cases:
 assert list((root/'references/cases').glob(f"{c['id']}_*.md"))
print(f"PASS sources={len(sources)}, catalogue={len(projects)}, case_cards={len(cases)}, rules={len(rules)}")
