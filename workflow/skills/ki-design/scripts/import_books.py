#!/usr/bin/env python3
"""Local ingestion of user-authorized, unencrypted documents. Never marks a book read.
Python 3.10+. PDF support requires PyMuPDF; EPUB/TXT/MD use the standard library.
"""
from __future__ import annotations
import argparse,csv,hashlib,json,posixpath,re,shutil,sys,tempfile,zipfile
from datetime import datetime,timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote,urlsplit
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
REGISTRY=Path('references/books/出版物与全文状态.json')
MAX_XML=16*1024*1024
MAX_HTML=64*1024*1024
class IngestError(ValueError): pass

def write_json(path:Path,value:object)->None:
    """Atomic replace of JSON; preserve other import records on normal failures."""
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    tmp.replace(path)

class TextParser(HTMLParser):
    def __init__(self)->None:
        super().__init__(convert_charrefs=True);self.parts=[];self.hidden=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'): self.hidden+=1
        if tag in ('p','div','br','li','h1','h2','h3','h4','section','tr') and not self.hidden:self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.hidden=max(0,self.hidden-1)
        if tag in ('p','div','li','h1','h2','h3','h4','section','tr') and not self.hidden:self.parts.append('\n')
    def handle_data(self,data):
        if not self.hidden:self.parts.append(data)
    def result(self):return '\n'.join(x.strip() for x in ''.join(self.parts).splitlines() if x.strip())

def checked_xml(data:bytes)->ET.Element:
    if len(data)>MAX_XML:raise IngestError('XML部分过大，停止解析。')
    # Container and package metadata should not depend on external entities.
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise IngestError('XML包含DOCTYPE或实体定义，需人工检查。')
    try:return ET.fromstring(data)
    except ET.ParseError as e:raise IngestError(f'无效的XML元数据：{e}') from e

def get_member(z:zipfile.ZipFile,name:str,limit:int)->bytes:
    try:info=z.getinfo(name)
    except KeyError as e:raise IngestError(f'EPUB缺少必需资源：{name}') from e
    if info.flag_bits & 1:raise IngestError('ZIP成员加密，不进行解密。')
    if info.file_size>limit:raise IngestError(f'资源超出安全读取上限：{name}')
    return z.read(info)

def member_path(base:str,href:str)->str:
    p=urlsplit(href)
    if p.scheme or p.netloc:raise IngestError('EPUB含外部spine资源；不联网读取。')
    decoded=unquote(p.path)
    if decoded.startswith('/') or '\\' in decoded:raise IngestError('不安全的EPUB资源路径。')
    path=posixpath.normpath(posixpath.join(base,decoded))
    if path=='..' or path.startswith('../'):raise IngestError('EPUB资源越出包根目录。')
    return path

def extract_epub(path:Path)->tuple[list[dict],dict]:
    try:
        with zipfile.ZipFile(path) as z:
            names=z.namelist()
            if len(names)!=len(set(names)):raise IngestError('EPUB包含同名ZIP条目，身份有歧义。')
            if 'META-INF/encryption.xml' in names:
                raise IngestError('EPUB含加密清单（包括可能的字体混淆），本工具保守停止；不移除DRM。')
            container=checked_xml(get_member(z,'META-INF/container.xml',MAX_XML))
            rf=container.find('.//{*}rootfile')
            if rf is None or not rf.get('full-path'):raise IngestError('找不到EPUB OPF根文件。')
            opf_path=member_path('',rf.get('full-path',''))
            opf=checked_xml(get_member(z,opf_path,MAX_XML));base=posixpath.dirname(opf_path)
            manifests={i.get('id'):i for i in opf.findall('.//{*}manifest/{*}item')}
            spine=opf.findall('.//{*}spine/{*}itemref')
            if not spine:raise IngestError('EPUB没有spine阅读顺序；不按文件名猜测章节。')
            units=[]
            for number,itemref in enumerate(spine,1):
                item=manifests.get(itemref.get('idref'))
                if item is None:raise IngestError('EPUB spine指向缺失的manifest条目。')
                href=member_path(base,item.get('href',''));mime=item.get('media-type','')
                if mime in ('application/xhtml+xml','text/html'):
                    data=get_member(z,href,MAX_HTML)
                    try:html=data.decode('utf-8-sig')
                    except UnicodeDecodeError as e:raise IngestError(f'{href}不是有效UTF-8；人工确认编码。') from e
                    parser=TextParser();parser.feed(html);content=parser.result()
                else:
                    # Keep image/SVG-only spine positions, never silently drop them.
                    get_member(z,href,MAX_HTML);content=''
                units.append({'unit_index':number,'unit_type':'epub_spine','locator':f'spine:{number}:{href}',
                    'href':href,'linear':itemref.get('linear','yes'),'printed_page':None,'text':content,
                    'media_type':mime})
            metadata={'opf':opf_path,'declared_titles':[x.text for x in opf.findall('.//{*}metadata/{*}title') if x.text],
                'declared_identifiers':[x.text for x in opf.findall('.//{*}metadata/{*}identifier') if x.text],
                'unit_semantics':'spine单元，不是书内物理页；包含linear=no的单元，可能另有非spine附属资源',
                'manifest_count':len(manifests),'spine_count':len(spine),'asset_review_complete':False}
            return units,metadata
    except zipfile.BadZipFile as e:raise IngestError('不是有效的EPUB/ZIP文件。') from e

def extract_pdf(path:Path)->tuple[list[dict],dict]:
    try:import fitz
    except ImportError as e:raise IngestError('PDF导入需要PyMuPDF；请在许可环境安装后重试。') from e
    try:
        with fitz.open(path) as doc:
            if doc.needs_pass or doc.is_encrypted:raise IngestError('PDF已加密或要求密码；不绕过限制。')
            if not (doc.permissions & fitz.PDF_PERM_COPY):raise IngestError('PDF标记禁止复制；先向权利人确认可提取副本。')
            units=[{'unit_index':i+1,'unit_type':'pdf_physical_page','locator':f'pdf-page:{i+1}',
                'printed_page':None,'text':p.get_text('text'),'page_width_pt':p.rect.width,'page_height_pt':p.rect.height}
                for i,p in enumerate(doc)]
            return units,{'unit_semantics':'PDF物理页；印刷页码须人工映射','page_count':len(doc),'metadata':doc.metadata,
                          'asset_review_complete':False}
    except IngestError:raise
    except Exception as e:raise IngestError(f'PDF读取失败：{e}') from e

def extract(path:Path)->tuple[list[dict],dict]:
    ext=path.suffix.lower()
    if ext=='.epub':return extract_epub(path)
    if ext=='.pdf':return extract_pdf(path)
    if ext in ('.txt','.md'):
        content=path.read_text(encoding='utf-8-sig')
        return [{'unit_index':1,'unit_type':'text_document','locator':'document:1','printed_page':None,'text':content}],{'unit_semantics':'完整文本文件为一个单元，不假设分页'}
    raise IngestError('本版仅支持未加密PDF、EPUB、UTF-8 TXT或Markdown；不支持ACSM或受限客户端格式。')

def ingest(root:Path,book_id:str,source:Path,scope:str,rights_confirmed:bool,rights_note:str,expected_units:int|None=None)->dict:
    if not rights_confirmed or not rights_note.strip():raise IngestError('必须明确确认有权提取，并提供权限来源与范围说明。')
    if scope not in ('FULL','PREVIEW'):raise IngestError('scope必须为FULL或PREVIEW。')
    if not re.fullmatch(r'[A-Z0-9_-]+',book_id):raise IngestError('无效书籍ID。')
    if not source.is_file():raise IngestError('源文件不存在。')
    if expected_units is not None and expected_units<1:raise IngestError('expected-units必须为正整数。')
    registry_path=root/REGISTRY;books=json.loads(registry_path.read_text(encoding='utf8'))
    book=next((b for b in books if b['id']==book_id),None)
    if book is None:raise IngestError('书籍ID不在登记表中。')
    hasher=hashlib.sha256()
    with source.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):hasher.update(block)
    digest=hasher.hexdigest();record_id=digest[:16]+'_'+scope.lower()
    dest=root/'private_corpus'/book_id/record_id
    if dest.exists():raise IngestError('该文件与范围已导入；不覆盖旧记录。')
    units,metadata=extract(source)
    if not units:raise IngestError('没有可登记的文件单元。')
    warnings=[]
    if expected_units is not None and len(units)!=expected_units:warnings.append('预期单元数与实际不一致，不能认定完整。')
    now=datetime.now(timezone.utc).isoformat()
    for u in units:
        u.update({'book_id':book_id,'record_id':record_id,'scope':scope,'source_sha256':digest,
            'text_chars':len(u['text'].strip()),'text_review_status':'UNREVIEWED','visual_review_status':'UNREVIEWED'})
        u['needs_attention']='EMPTY_OR_IMAGE_ONLY' if not u['text'].strip() else ('SHORT_TEXT_REVIEW' if len(u['text'].strip())<80 else 'MANUAL_REVIEW_REQUIRED')
    empty=sum(not u['text'].strip() for u in units)
    if empty:warnings.append(f'{empty}个单元无提取文字，可能是图页、扫描件或空白，必须人工判读。')
    report={'schema_version':'0.4','book_id':book_id,'record_id':record_id,'scope':scope,'source_file_name':source.name,
        'source_sha256':digest,'ingested_at':now,'rights_note':rights_note.strip(),'unit_count':len(units),
        'text_characters':sum(u['text_chars'] for u in units),'empty_unit_count':empty,'expected_units':expected_units,
        'identity_verified':False,'completeness_verified':False,'full_review_complete':False,
        'book_claims_enabled':False,'body_status':scope+'_IMPORTED_UNVERIFIED','metadata':metadata,'warnings':warnings}
    dest.parent.mkdir(parents=True,exist_ok=True)
    stage=Path(tempfile.mkdtemp(prefix='.staging-',dir=dest.parent))
    try:
        with (stage/'text_units.jsonl').open('w',encoding='utf8') as f:
            for u in units:f.write(json.dumps(u,ensure_ascii=False)+'\n')
        write_json(stage/'import_report.json',report)
        with (stage/'review_log.csv').open('w',encoding='utf-8-sig',newline='') as f:
            w=csv.writer(f);w.writerow(['unit_index','locator','printed_page','text_review','visual_review','reviewer','reviewed_at','issues'])
            for u in units:w.writerow([u['unit_index'],u['locator'],'','UNREVIEWED','UNREVIEWED','','',u['needs_attention']])
        stage.rename(dest)
    except Exception:
        shutil.rmtree(stage,ignore_errors=True);raise
    book.setdefault('imports',[]).append({'record_id':record_id,'scope':scope,'sha256':digest,'unit_count':len(units),'status':report['body_status']})
    book['import_count']=len(book['imports'])
    if scope=='FULL':
        book['body_status']='FULL_IMPORTED_UNVERIFIED';book['source_file_sha256']=digest
        book['body_pages']=len(units) if source.suffix.lower()=='.pdf' else None
    # A PREVIEW import does not promote the full-body status or review flags.
    book['full_review_complete']=False;book['completeness_verified']=False;book['book_claims_enabled']=False
    write_json(registry_path,books)
    return report

def main()->int:
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--book',required=True);p.add_argument('--source',type=Path,required=True)
    p.add_argument('--scope',choices=['FULL','PREVIEW'],required=True)
    p.add_argument('--rights-confirmed',action='store_true');p.add_argument('--rights-note',default='')
    p.add_argument('--expected-units',type=int)
    a=p.parse_args()
    try:r=ingest(ROOT,a.book,a.source,a.scope,a.rights_confirmed,a.rights_note,a.expected_units)
    except (IngestError,OSError,UnicodeError,json.JSONDecodeError) as e:print('导入未完成：'+str(e),file=sys.stderr);return 2
    print(json.dumps(r,ensure_ascii=False,indent=2));return 0
if __name__=='__main__':raise SystemExit(main())
