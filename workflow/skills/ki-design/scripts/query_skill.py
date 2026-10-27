#!/usr/bin/env python3
"""Locate sections in public research notes; never searches full books or private text."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOTS = ('method', 'references/theory', 'references/reading', 'references/cases')
SOURCE_ID = re.compile(r'\b(?:T06_S\d+|D06_\d+_\d+|E\d{2}|S\d{2})\b')


def sections(text):
    """Yield heading sections and their one-based source line numbers."""
    lines = text.splitlines()
    starts = [i for i, line in enumerate(lines) if re.match(r'^#{1,6}\s+', line)]
    if not starts or starts[0] != 0:
        starts.insert(0, 0)
    for start, end in zip(starts, starts[1:] + [len(lines)]):
        if start == end:
            continue
        heading = re.sub(r'^#+\s+', '', lines[start]) if lines[start].startswith('#') else ''
        yield heading, start + 1, end, lines[start:end]


def search(root, query, limit=6, match='any'):
    tokens = list(dict.fromkeys(x.casefold() for x in query.split() if x.strip()))
    if not tokens:
        raise ValueError('请输入检索词，可用空格分隔。')
    if not 1 <= limit <= 30 or match not in ('all', 'any'):
        raise ValueError('limit须为1—30；match须为all或any。')
    root = root.resolve()
    paths = sorted({p for folder in PUBLIC_ROOTS for p in (root / folder).rglob('*.md')
                    if p.is_file() and not p.is_symlink() and root in p.resolve().parents
                    and not any(part.startswith('.') for part in p.relative_to(root).parts)})
    found = []
    for path in paths:
        text = path.read_text(encoding='utf-8-sig')
        for heading, start, end, lines in sections(text):
            low = '\n'.join(lines).casefold()
            matched = [t for t in tokens if t in low]
            if not matched or (match == 'all' and len(matched) != len(tokens)):
                continue
            hits = [i for i, line in enumerate(lines) if any(t in line.casefold() for t in matched)]
            anchor = max(hits, key=lambda i: (sum(t in lines[i].casefold() for t in matched),
                                              not lines[i].startswith('#'), -i))
            lo = max(0, anchor - 1)
            hi = min(len(lines), anchor + 3)
            found.append({
                'score': sum(min(low.count(t), 5) for t in matched),
                'matched_tokens': matched,
                'heading_matches': sum(t in heading.casefold() for t in tokens),
                'path': path.relative_to(root).as_posix(), 'heading': heading,
                'section_line_start': start, 'section_line_end': end,
                'line_start': start + lo, 'line_end': start + hi - 1,
                'status': 'PUBLIC_RESEARCH_NOTE_NOT_FULL_BOOK',
                'source_ids': sorted(set(SOURCE_ID.findall('\n'.join(lines)))),
                'preview': '\n'.join(lines[lo:hi])[:900],
            })
    found.sort(key=lambda r: (-len(r['matched_tokens']), -r['heading_matches'],
                              -r['score'], r['path'], r['section_line_start']))
    return found[:limit]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('query')
    parser.add_argument('--limit', type=int, choices=range(1, 31), default=6, metavar='1..30')
    parser.add_argument('--match', choices=('any', 'all'), default='any',
                        help='any ranks sections matching more terms first; all requires every term')
    args = parser.parse_args()
    try:
        rows = search(ROOT, args.query, args.limit, args.match)
    except (ValueError, OSError, UnicodeError) as exc:
        parser.error(str(exc))
    for row in rows:
        print(json.dumps(row, ensure_ascii=False))
    if not rows:
        print('未命中所选公开笔记段落；可调整检索词或使用--match any，不得据此推断原书无此内容。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
