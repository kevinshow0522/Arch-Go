import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readMethodCatalog} from '../scripts/method-catalog.mjs';

const expected=JSON.parse(readFileSync(new URL('../../skills/ki-archmain/references/framework-catalog.json',import.meta.url),'utf8'));

test('catalog preserves the confirmed eight chapters and all fifty reading entries',()=>{
  const catalog=readMethodCatalog();
  assert.equal(catalog.frameworkVersion,'0.4');
  const actual=Object.values(catalog.chapters);
  assert.deepEqual(actual.map(chapter=>({number:chapter.number,title:chapter.title,topics:chapter.topics.map(topic=>({id:topic.id,title:topic.title}))})),
    expected.chapters.map(chapter=>({number:chapter.number,title:chapter.title,topics:chapter.topics.map(topic=>({id:topic.id,title:topic.title}))})));
  assert.equal(actual.flatMap(chapter=>chapter.topics).length,50);
});

test('service depth and each topic requirement remain separate from content numbering',()=>{
  const catalog=readMethodCatalog();
  assert.deepEqual(catalog.serviceStages,expected.service_stages);
  for(const chapter of expected.chapters){
    const actual=Object.values(catalog.chapters).find(item=>item.number===chapter.number);
    assert.ok(actual,chapter.number);
    for(const topic of chapter.topics){
      const entry=actual.topics.find(item=>item.id===topic.id);
      assert.deepEqual(entry.stages,topic.stages,topic.id);
      assert.equal(entry.counted,topic.counted,topic.id);
      assert.equal(entry.kind,topic.kind,topic.id);
      assert.equal(entry.end,topic.end,topic.id);
    }
  }
});

test('display entries do not count as design or delivery completion',()=>{
  const chapters=Object.values(readMethodCatalog().chapters);
  const display=chapters.find(chapter=>chapter.number==='07');
  assert.ok(display,'07 display chapter');
  assert.equal(display.topics.length,2);
  assert.ok(display.topics.every(topic=>topic.counted===false));
  assert.equal(chapters.filter(chapter=>Number(chapter.number)<=6).flatMap(chapter=>chapter.topics).filter(topic=>topic.counted).length,45);
  assert.equal(chapters.find(chapter=>chapter.number==='08').topics.filter(topic=>topic.counted).length,3);
});

test('new and migrated entries expose usable method text',()=>{
  const topics=Object.values(readMethodCatalog().chapters).flatMap(chapter=>chapter.topics);
  for(const id of ['02.7','03.8','05.6','05.7','05.8','05.9','07.1','07.2','08.1','08.2','08.3']){
    const topic=topics.find(item=>item.id===id);
    assert.ok(topic,id);
    const text=topic.summary+'\n'+topic.sections.map(section=>section.text).join('\n');
    assert.ok(text.trim().length>0,id+' requires an explanatory reading entry');
  }
});
