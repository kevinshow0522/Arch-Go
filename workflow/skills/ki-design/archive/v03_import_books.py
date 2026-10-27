#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import user-provided, locally readable book files into the private Skill corpus.
Do not bypass ebook DRM. OCR is intentionally not automatic.
"""
import argparse, json, hashlib, re, sys, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from html.parser import HTMLParser

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/'references'/'books'/'出版物与全文状态.json'
OUT=ROOT/'private_corpus'
class HtmlText(HTMLParser):
    def __init__(self): super().__init__(); self.parts=[]; self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'): self.skip+=1
        if tag in ('p','h1','h2','h3','h4','li','div','tr'): self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style') and self.skip:self.skip-=1
        if tag in ('p','h1','h2','h3','h4','li','div','tr'): self.parts.append('\n')
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)
    def get(self): return normalize(''.join(self.parts))

def normalize(s):
    s=s.replace('\x00','').replace('\r\n','\n').replace('\r','\n')
    return re.sub(r'\n{3,}','\n\n',s).strip()

def extract_pdf(p):
    try: import fitz
    except ImportError: raise RuntimeError('需要安装 PyMuPDF：pip install pymupdf')
    doc=fitz.open(str(p)); rows=[]
    for n,page in enumerate(doc,1): rows.append({'locator':f'PDF page {n}','text':normalize(page.get_text('text'))})
    doc.close();return rows

def extract_epub(p):
    result=[]
    with zipfile.ZipFile(p) as z:
        names=sorted(n for n in z.namelist() if n.lower().endswith(('.xhtml','.html','.htm')) and not n.startswith('__MACOSX/'))
        if not names:raise RuntimeError('EPUB无HTML章节或文件被DRM保护/损坏。')
        for name in names:
            html=z.read(name).decode('utf-8','replace')
            x=HtmlText();x.feed(html)
            result.append({'locator':f'EPUB {name}','text':x.get()})
    return result

def extract_docx(p):
    ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    with zipfile.ZipFile(p) as z:
        root=ET.fromstring(z.read('word/document.xml'))
        pars=[]
        for node in root.findall('.//w:p',ns): pars.append(''.join(x.text or '' for x in node.findall('.//w:t',ns)))
    return [{'locator':'DOCX main body','text':normalize('\n'.join(pars))}]

def extract_text(p):
    return [{'locator':'Text source','text':normalize(p.read_text(encoding='utf-8-sig'))}]

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--book',required=True);ap.add_argument('--source',required=True);args=ap.parse_args()
    catalog=json.loads(CATALOG.read_text(encoding='utf8'))
    ids={r['id'] for r in catalog}
    if args.book not in ids:ap.error(f'未知书籍ID: {args.book}; 应为 {sorted(ids)}')
    p=Path(args.source).expanduser().resolve()
    if not p.is_file():ap.error(f'文件不存在: {p}')
    ext=p.suffix.lower()
    choices={'.pdf':extract_pdf,'.epub':extract_epub,'.docx':extract_docx,'.txt':extract_text,'.md':extract_text}
    if ext not in choices:ap.error('仅支持 PDF、EPUB、DOCX、TXT、MD；DRM文件不支持')
    units=choices[ext](p)
    if not units:ap.error('正文提取为空')
    char_count=sum(len(u['text']) for u in units)
    nonempty=sum(bool(u['text']) for u in units)
    empty=len(units)-nonempty
    # Flag low coverage: empty pages may be legitimate art plates but must be manually reviewed.
    review=char_count<2000 or (empty/len(units)>.15)
    if char_count<100:ap.error('未能提取有效正文；可能是扫描本或带DRM文件，需另行提供可读取正文/OCR版本')
    digest=hashlib.sha256(p.read_bytes()).hexdigest()
    out=OUT/args.book;out.mkdir(parents=True,exist_ok=True)
    file=out/'fulltext_units.jsonl'
    with file.open('w',encoding='utf8') as f:
        for i,u in enumerate(units,1):
            f.write(json.dumps({'book_id':args.book,'unit':i,'locator':u['locator'],'text':u['text'],'source_sha256':digest},ensure_ascii=False)+'\n')
    status='REVIEW_NEEDED' if review else 'IMPORTED_UNVERIFIED'
    report={'id':args.book,'status':status,'original_filename':p.name,'sha256':digest,'units':len(units),'nonempty_units':nonempty,'empty_units':empty,'total_chars':char_count,'file':str(file.relative_to(ROOT)),'notes':'导入≠人工逐页核实；含大量图片或图示时需要单独比对。'}
    (out/'import_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    for entry in catalog:
        if entry['id']==args.book:entry['body_status']=status;entry['body_pages']=len(units)
    CATALOG.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
