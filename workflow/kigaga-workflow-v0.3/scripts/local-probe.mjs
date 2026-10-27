import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

// Run only against a caller-created disposable database, never the project database.
export async function probeLocalService({entry,nodePath,dbPath,cwd}) {
  const clients=[];
  const options={timeout:10000};
  async function connect() {
    const client=new Client({name:'kigaga-local-diagnostic-not-chatgpt',version:'1'});
    clients.push(client);
    const transport=new StdioClientTransport({command:nodePath,args:[entry],cwd,env:{KIGAGA_DB_PATH:dbPath},stderr:'pipe'});
    transport.stderr?.resume();
    await client.connect(transport,options);
    return client;
  }
  async function call(client,name,args) {
    const result=await client.callTool({name,arguments:args},undefined,options);
    if(result.isError)throw new Error(result.content?.find(x=>x.type==='text')?.text||`${name} 调用失败`);
    return result;
  }
  try {
    const first=await connect();
    const tools=(await first.listTools({},options)).tools;
    const expected=['kg_open_workbench','kg_get_project','kg_create_project','kg_add_material','kg_update_material','kg_prepare_task','kg_get_task','kg_mark_message_accepted','kg_save_result','kg_get_context','kg_checkpoint_task','kg_find_projects'];
    assert.ok(expected.every(name=>tools.some(tool=>tool.name===name)),'MCP 工具不完整');
    assert.equal(first.getServerCapabilities().resources,undefined,'本地服务不应注册重复页面');
    assert.ok(tools.every(tool=>!tool._meta?.['openai/ui']?.entrypoints),'本地服务不应注册侧栏入口');
    const project=(await call(first,'kg_create_project',{name:'本地诊断临时项目',request_id:randomUUID()}))._meta.workbench.project;
    const material=(await call(first,'kg_add_material',{project_id:project.id,title:'诊断资料',content:'仅用于验证本地保存，不是真实项目资料。',request_id:randomUUID()}))._meta.workbench.materials[0];
    const task=(await call(first,'kg_prepare_task',{project_id:project.id,stage_id:'opportunity',material_ids:[material.id],instruction:'诊断保存',output:'验证恢复',request_id:randomUUID()})).structuredContent.task;
    const result={title:'诊断成果一',narrative:'程序检查数据，不是 GPT 分析。',facts:['本地测试'],assumptions:[],questions:[],actions:[]};
    await call(first,'kg_save_result',{executor:'gpt',task_id:task.id,expected_revision:0,result});
    await call(first,'kg_save_result',{executor:'gpt',task_id:task.id,expected_revision:1,result:{...result,title:'诊断成果二'}});
    await first.close();
    const second=await connect();
    const restored=(await call(second,'kg_get_task',{task_id:task.id})).structuredContent.task;
    const snapshot=(await call(second,'kg_open_workbench',{project_id:project.id,task_id:task.id}))._meta.workbench;
    assert.equal(snapshot.project.name,project.name);
    assert.equal(snapshot.materials[0].content,material.content);
    const materialPage=(await call(second,'kg_read_material',{project_id:project.id,material_id:material.id,version:1})).structuredContent;
    assert.equal(materialPage.content,material.content);
    assert.equal(restored.revision,2);
    assert.equal(restored.result.title,'诊断成果二');
    assert.deepEqual(restored.history.map(item=>item.result.title),['诊断成果一','诊断成果二']);
    return {toolCount:tools.length,revisions:restored.revision};
  } finally {
    for(const client of clients)await client.close();
  }
}
