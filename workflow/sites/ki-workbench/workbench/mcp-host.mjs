import {App} from '@modelcontextprotocol/ext-apps';

const reads=new Set(['ki_cloud_list_projects','ki_cloud_get_project']);
window.KI_CLOUD_CONNECT=async function(onInput){
 const app=new App({name:'KI建筑设计工作台',version:'0.6.1'},{availableDisplayModes:['fullscreen']},{autoResize:false});
 app.ontoolinput=params=>onInput?.(params.arguments??{});
 await app.connect(undefined,{timeout:12000});
 return {
  async call(name,args){
   if(!reads.has(name))throw Error('工作台只查看流程。');
   const result=await app.callServerTool({name,arguments:args},{timeout:15000});
   if(result.isError)throw Error(result.content?.find(c=>c.type==='text')?.text||'云端读取失败');
   return result.structuredContent;
  },
  close(){void app.close();}
 };
};
