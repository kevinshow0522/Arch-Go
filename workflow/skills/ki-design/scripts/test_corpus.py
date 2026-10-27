#!/usr/bin/env python3
"""Synthetic tests; does not ingest or validate any of the six commercial books."""
from pathlib import Path
import json,tempfile,unittest,zipfile
from import_books import ingest,extract_epub,IngestError
from package_public import make_package

class CorpusTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name);self.root=self.base/'cui-kai-local-design'
        d=self.root/'references/books';d.mkdir(parents=True)
        (d/'出版物与全文状态.json').write_text(json.dumps([{'id':'BD03','body_status':'MISSING','isbn':'9787112291908','full_review_complete':False}]),encoding='utf8')
        self.txt=self.base/'example.txt';self.txt.write_text('这是自造的测试文本，不是任何书籍原文。',encoding='utf8')
    def tearDown(self):self.tmp.cleanup()
    def book(self):return json.loads((self.root/'references/books/出版物与全文状态.json').read_text())[0]
    def epub(self,encrypted=False,missing=False,external=False):
        path=self.base/'example.epub'
        opf='''<package xmlns="http://www.idpf.org/2007/opf"><metadata><title>合成测试</title></metadata><manifest><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>'''
        if missing:opf=opf.replace('idref="b"','idref="unknown"')
        if external:opf=opf.replace('href="b.xhtml"','href="https://example.invalid/b.xhtml"')
        with zipfile.ZipFile(path,'w') as z:
            z.writestr('META-INF/container.xml','<container><rootfiles><rootfile full-path="OPS/content.opf"/></rootfiles></container>')
            z.writestr('OPS/content.opf',opf);z.writestr('OPS/a.xhtml','<html><body><p>第二单元</p></body></html>')
            z.writestr('OPS/b.xhtml','<html><body><script>DO_NOT_RUN</script><p>第一单元</p></body></html>')
            if encrypted:z.writestr('META-INF/encryption.xml','<encryption/>')
        return path
    def test_preview_does_not_promote_full_body(self):
        r=ingest(self.root,'BD03',self.txt,'PREVIEW',True,'自有合成测试文本')
        self.assertEqual(self.book()['body_status'],'MISSING');self.assertFalse(r['full_review_complete'])
    def test_full_import_stays_unverified(self):
        r=ingest(self.root,'BD03',self.txt,'FULL',True,'自有合成测试文本')
        self.assertEqual(self.book()['body_status'],'FULL_IMPORTED_UNVERIFIED');self.assertFalse(r['book_claims_enabled'])
    def test_missing_permission_rejected(self):
        with self.assertRaises(IngestError):ingest(self.root,'BD03',self.txt,'FULL',False,'')
    def test_duplicate_not_overwritten(self):
        ingest(self.root,'BD03',self.txt,'FULL',True,'自有合成测试文本')
        with self.assertRaises(IngestError):ingest(self.root,'BD03',self.txt,'FULL',True,'自有合成测试文本')
    def test_unknown_id_rejected(self):
        with self.assertRaises(IngestError):ingest(self.root,'UNKNOWN',self.txt,'FULL',True,'自有文本')
    def test_epub_spine_not_alphabetical(self):
        units,_=extract_epub(self.epub());self.assertEqual(units[0]['text'],'第一单元');self.assertEqual(units[1]['text'],'第二单元')
    def test_script_content_not_retrieved(self):
        units,_=extract_epub(self.epub());self.assertNotIn('DO_NOT_RUN',units[0]['text'])
    def test_epub_drm_stops(self):
        with self.assertRaises(IngestError):extract_epub(self.epub(encrypted=True))
    def test_broken_spine_stops(self):
        with self.assertRaises(IngestError):extract_epub(self.epub(missing=True))
    def test_external_resource_stops(self):
        with self.assertRaises(IngestError):extract_epub(self.epub(external=True))
    def test_mismatch_warns_not_complete(self):
        r=ingest(self.root,'BD03',self.txt,'FULL',True,'自有文本',2)
        self.assertTrue(r['warnings']);self.assertFalse(r['completeness_verified'])
    def test_public_archive_excludes_private_text(self):
        ingest(self.root,'BD03',self.txt,'FULL',True,'自有文本')
        (self.root/'SKILL.md').write_text('test');out=self.base/'public.zip';make_package(self.root,out)
        with zipfile.ZipFile(out) as z:self.assertFalse(any('text_units.jsonl' in n or 'import_report' in n for n in z.namelist()))
    def test_pdf_pages_not_omitted_when_blank(self):
        try:import fitz
        except ImportError:self.skipTest('PyMuPDF未安装')
        p=self.base/'test.pdf'
        with fitz.open() as doc:
            doc.new_page().insert_text((70,70),'Synthetic page one');doc.new_page();doc.save(p)
        r=ingest(self.root,'BD03',p,'FULL',True,'自有PDF测试文本')
        self.assertEqual(r['unit_count'],2);self.assertEqual(r['empty_unit_count'],1);self.assertFalse(r['full_review_complete'])
if __name__=='__main__':unittest.main(verbosity=2)
