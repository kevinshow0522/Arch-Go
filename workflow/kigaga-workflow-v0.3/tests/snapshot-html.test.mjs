import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {snapshotHtml} from '../scripts/snapshot-html.mjs';
test('snapshot export preserves Chinese and replacement tokens without enabling HTML injection',()=>{
  const snapshot={project:{name:'中文 $& </script><img onerror="bad()">'}};
  const html=snapshotHtml(readFileSync(new URL('../assets/workbench.html',import.meta.url),'utf8'),snapshot);
  const dom=new JSDOM(Buffer.from(html),{runScripts:'outside-only'});
  try{
    assert.equal(dom.window.document.characterSet,'UTF-8');
    dom.window.eval(dom.window.document.querySelector('script:not([type])').textContent);
    assert.equal(dom.window.__KG_PREVIEW__.project.name,snapshot.project.name);
    assert.equal(dom.window.document.querySelectorAll('img').length,0);
  }finally{dom.window.close();}
});
test('large offline snapshots retain an early UTF-8 declaration before embedded project data',()=>{
 const snapshot={project:{name:'大型中文快照',summary:'中文正文'.repeat(3000)},tasks:[]};
 const html=snapshotHtml(readFileSync(new URL('../assets/workbench.html',import.meta.url),'utf8'),snapshot);
 const dom=new JSDOM(Buffer.from(html),{runScripts:'outside-only'});
 try{
  assert.equal(dom.window.document.characterSet,'UTF-8');
  dom.window.eval(dom.window.document.querySelector('script:not([type])').textContent);
  assert.equal(dom.window.__KG_PREVIEW__.project.name,'大型中文快照');
  assert.equal(dom.window.__KG_PREVIEW__.project.summary,snapshot.project.summary);
 }finally{dom.window.close();}
});
