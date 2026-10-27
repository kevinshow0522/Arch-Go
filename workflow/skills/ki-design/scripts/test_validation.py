#!/usr/bin/env python3
"""Ensure active V0.6+ research is checked, not only the legacy registry."""
from pathlib import Path
import importlib.util
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('skill_validation', ROOT / 'scripts/validate.py')
validation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validation)


class CurrentResearchValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / ROOT.name
        shutil.copytree(ROOT, self.root, ignore=shutil.ignore_patterns('__pycache__'))

    def tearDown(self):
        self.tmp.cleanup()

    def rejected(self):
        try:
            return not all(check['pass'] for check in validation.validate(self.root))
        except (ValueError, OSError, KeyError):
            return True

    def test_corrupt_current_theory_index_is_rejected(self):
        (self.root / 'references/index/sources_v06_theory.json').write_text('{', encoding='utf-8')
        self.assertTrue(self.rejected(), 'Current theory source index was silently ignored')

    def test_broken_link_inside_current_theory_is_rejected(self):
        path = self.root / 'references/theory/v06/理念生成判断.md'
        with path.open('a', encoding='utf-8') as stream:
            stream.write('\n[Missing research card](missing-research-card.md)\n')
        self.assertTrue(self.rejected(), 'Nested current-method link was silently ignored')


if __name__ == '__main__':
    unittest.main(verbosity=2)
