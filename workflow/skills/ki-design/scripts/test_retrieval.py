#!/usr/bin/env python3
"""Exercise public-note retrieval; fixtures never contain real book text."""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile
import unittest


class PublicRetrievalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / 'cui-kai-local-design'
        scripts = self.root / 'scripts'
        scripts.mkdir(parents=True)
        shutil.copyfile(Path(__file__).with_name('query_skill.py'), scripts / 'query_skill.py')
        for folder in ('method/operations', 'references/reading', 'references/cases'):
            (self.root / folder).mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def note(self, relative, text):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')

    def query(self, word, *extra):
        result = subprocess.run(
            [sys.executable, str(self.root / 'scripts/query_skill.py'), word, '--limit', '30', *extra],
            capture_output=True, text=True, encoding='utf-8', check=True)
        return [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]

    def test_nested_theory_is_discoverable(self):
        self.note('references/theory/v06/idea.md', '立体公共界面X17')
        self.assertEqual([x['path'] for x in self.query('立体公共界面X17')],
                         ['references/theory/v06/idea.md'])

    def test_nested_drawing_card_is_discoverable(self):
        self.note('references/reading/v06/drawing.md', '剖面邻接Y29')
        self.assertEqual([x['path'] for x in self.query('剖面邻接Y29')],
                         ['references/reading/v06/drawing.md'])

    def test_current_generation_method_is_discoverable(self):
        self.note('method/generation.md', '同源空间底稿Z31')
        self.assertEqual([x['path'] for x in self.query('同源空间底稿Z31')],
                         ['method/generation.md'])

    def test_legacy_public_cards_remain_discoverable(self):
        self.note('references/cases/C01.md', '连续大厅A41')
        self.assertEqual(len(self.query('连续大厅A41')), 1)

    def test_private_archive_and_reports_are_not_public_research_hits(self):
        for relative in ('private_corpus/raw.md', 'archive/old.md', 'reports/run.md'):
            self.note(relative, '非公开检索B53')
        self.assertEqual(self.query('非公开检索B53'), [])

    def test_all_terms_must_match_the_same_section(self):
        self.note('method/example.md', '# 空间\n公共\n## 运营\n路径\n')
        self.assertEqual(self.query('公共 路径', '--match', 'all'), [])

    def test_multi_term_section_ranks_above_repeated_single_term(self):
        self.note('method/long.md', '# 单项\n' + '公共\n'*50)
        self.note('method/relevant.md', '# 对题\n公共路径\n')
        self.assertEqual(self.query('公共 路径')[0]['path'], 'method/relevant.md')

    def test_location_and_excerpt_can_be_read_back(self):
        content = '# 项目\n说明\n\n## 公共空间\n路径依据 T06_S1\n结束\n'
        self.note('method/located.md', content)
        row = self.query('路径')[0]
        self.assertEqual(row['heading'], '公共空间')
        self.assertEqual(row['source_ids'], ['T06_S1'])
        lines = content.splitlines()
        self.assertEqual(row['preview'], '\n'.join(lines[row['line_start']-1:row['line_end']]))

    def test_deduplicated_query_terms_do_not_change_ranking(self):
        self.note('method/sample.md', '# 公共\n路径\n')
        self.assertEqual(self.query('公共 路径'), self.query('公共 公共 路径'))

    def test_empty_query_and_invalid_limit_return_error(self):
        for args in [(' ',), ('公共', '--limit', '0')]:
            result = subprocess.run([sys.executable,str(self.root/'scripts/query_skill.py'),*args],
                                    capture_output=True,text=True,encoding='utf8')
            self.assertEqual(result.returncode, 2)


if __name__ == '__main__':
    unittest.main(verbosity=2)
