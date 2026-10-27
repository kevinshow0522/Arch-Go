"""Mutation tests for source drift, false book claims and release tampering."""
from pathlib import Path
import hashlib
import json
import shutil
import tempfile
import unittest
import validate

ROOT = Path(__file__).resolve().parents[1]


class EvidenceIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / ROOT.name
        shutil.copytree(ROOT, self.root, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))

    def tearDown(self):
        self.tmp.cleanup()

    def change(self, name, mutate):
        path = self.root / name
        data = json.loads(path.read_text(encoding='utf8'))
        mutate(data)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf8')

    def check(self, name, manifest=False):
        rows = validate.validate(self.root, check_manifest=manifest)
        return next(row['pass'] for row in rows if row['check'] == name)

    def manifest(self):
        records = []
        for path in sorted(self.root.rglob('*')):
            if path.is_file() and path.name != 'manifest.json' and '__pycache__' not in path.parts:
                data = path.read_bytes()
                records.append({'path':path.relative_to(self.root).as_posix(), 'bytes':len(data),
                                'sha256':hashlib.sha256(data).hexdigest()})
        release=json.loads((self.root/'manifest.json').read_text(encoding='utf8'))['release']
        (self.root/'manifest.json').write_text(json.dumps({'release':release,'files':records}),encoding='utf8')

    def test_clean_current_resources_pass(self):
        self.assertTrue(all(row['pass'] for row in validate.validate(self.root)))

    def test_combined_snapshot_drift_is_rejected(self):
        self.change('references/index/sources_v06.json',
                    lambda x: x['theory_sources'][0].update(url='https://example.invalid/changed'))
        self.assertFalse(self.check('combined source snapshot equals split registries'))

    def test_unknown_source_in_reading_card_is_rejected(self):
        path = self.root/'references/reading/v06/图纸阅读卡.md'
        with path.open('a',encoding='utf8') as stream:
            stream.write('\n来源：D06_999_99\n')
        self.assertFalse(self.check('current source citations in method and reading cards resolve'))

    def test_imported_unreviewed_book_cannot_enable_claims(self):
        self.change('references/books/出版物与全文状态.json',lambda x:x[0].update(
            body_status='FULL_IMPORTED_UNVERIFIED',book_claims_enabled=True))
        self.assertFalse(self.check('full-book claim flags have consistent state and review reference'))

    def test_nonexistent_review_reference_is_rejected(self):
        self.change('references/books/出版物与全文状态.json',lambda x:x[0].update(
            body_status='FULL_REVIEWED',book_claims_enabled=True,full_review_complete=True,
            completeness_verified=True,source_file_sha256='a'*64,complete_review_manifest='missing-review.json'))
        self.assertFalse(self.check('full-book claim flags have consistent state and review reference'))

    def test_valid_manifest_passes_and_changed_file_fails(self):
        self.manifest()
        self.assertTrue(self.check('release manifest inventory and SHA256 match', True))
        with (self.root/'SKILL.md').open('a',encoding='utf8') as stream:
            stream.write('\nchanged\n')
        self.assertFalse(self.check('release manifest inventory and SHA256 match', True))

    def test_unlisted_file_is_rejected(self):
        self.manifest()
        (self.root/'unlisted.txt').write_text('new content',encoding='utf8')
        self.assertFalse(self.check('release manifest inventory and SHA256 match', True))

    def test_operation_csv_drift_is_rejected(self):
        path=self.root/'method/操作卡登记.csv'
        path.write_text(path.read_text(encoding='utf8').replace('W04,','W99,',1),encoding='utf8')
        self.assertFalse(self.check('operation JSON cards and CSV registry agree'))

    def test_operation_card_drift_is_rejected(self):
        path=self.root/'method/operations/W04.md'
        lines=path.read_text(encoding='utf8').splitlines()
        path.write_text('\n'.join('操作：different operation' if line.startswith('操作：') else line for line in lines),encoding='utf8')
        self.assertFalse(self.check('operation JSON cards and CSV registry agree'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
