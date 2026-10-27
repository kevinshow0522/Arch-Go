#!/usr/bin/env python3
"""Make a public Skill archive, excluding all private corpus text and raw books."""
from pathlib import Path
import argparse,zipfile
ROOT=Path(__file__).resolve().parents[1]
def public_files(root:Path):
    for p in sorted(root.rglob('*')):
        if not p.is_file() or p.is_symlink():continue
        rel=p.relative_to(root)
        if '__pycache__' in rel.parts or any(x.startswith('.') for x in rel.parts):continue
        if rel.parts[0]=='private_corpus' and rel.as_posix()!='private_corpus/README_不公开分发.md':continue
        if p.suffix.lower() in ('.pdf','.epub','.acsm','.mobi','.azw','.azw3'):continue
        yield p

def make_package(root:Path,destination:Path)->int:
    if root.resolve()==destination.resolve() or root.resolve() in destination.resolve().parents:
        raise ValueError('ZIP输出必须在Skill文件夹之外。')
    destination.parent.mkdir(parents=True,exist_ok=True);count=0
    with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as z:
        for p in public_files(root):
            z.write(p,root.name+'/'+p.relative_to(root).as_posix());count+=1
    return count
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('destination',type=Path);a=p.parse_args()
    print(make_package(ROOT,a.destination),'files')
