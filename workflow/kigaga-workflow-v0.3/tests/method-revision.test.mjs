// 方法修订日期：方法版本号仍是1.30，修订日期写在记录content的method_revision里。
// 服务新旧记录都收：有没有这个字段都能保存、读回；连接返回本服务规则的日期。
import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkflowStore} from '../src/workflow-store.mjs';
import {METHOD_VERSION,SERVICE_RULES_REVISION} from '../src/method-version.mjs';
import {randomUUID} from 'node:crypto';

function fixture(t){const s=new WorkflowStore(':memory:'),p=s.createProject({request_id:randomUUID(),name:'修订日期回归'}).project;t.after(()=>s.close());return {s,p};}
const save=(s,p,kind,title,content)=>s.saveRecord({request_id:randomUUID(),project_id:p.id,method_version:'1.30',kind,title,status:'active',content:JSON.stringify(content)});
const handoff={from:'claude',to:'any',work_package:'W3.2',task_ids:[],done:'场地条件已整理',next:'W3.4',waiting_on_user:[],files:[],method_version:'1.30',created_at:'2026-11-28T00:00:00.000Z'};
const summary={chapter:'03',item:'03.8',summary:'仅北侧可到达',key_points:[],status:'待确认',method_version:'1.30',created_at:'2026-11-28T00:00:00.000Z'};

test('交接和章末摘要带不带method_revision都能保存并原样读回', t=>{
 const {s,p}=fixture(t);
 for(const [kind,title,body] of [['handoff','交接｜W3.2',handoff],['chapter_summary','章末｜03.8',summary]]){
  const older=save(s,p,kind,title+'（旧）',body);
  const newer=save(s,p,kind,title+'（新）',{...body,method_revision:'2026-11-28'});
  assert.equal(JSON.parse(s.getRecord({project_id:p.id,record_id:older.id}).content).method_revision,undefined);
  assert.equal(JSON.parse(s.getRecord({project_id:p.id,record_id:newer.id}).content).method_revision,'2026-11-28');
 }
});

test('修订日期不代替方法版本号：版本号不同仍被拒绝', t=>{
 const {s,p}=fixture(t);
 assert.throws(()=>s.saveRecord({request_id:randomUUID(),project_id:p.id,method_version:'1.31',kind:'handoff',title:'交接',status:'active',content:JSON.stringify({...handoff,method_revision:'2026-11-28'})}),/方法已更新/);
});

test('服务报告自己的规则日期', ()=>{
 assert.equal(METHOD_VERSION,'1.30');
 assert.match(SERVICE_RULES_REVISION,/^\d{4}-\d{2}-\d{2}$/);
});
