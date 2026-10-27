import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Local service adapter; the GitHub Skill itself remains byte-for-byte intact.
export function readMethodCatalog(){
 const root=new URL('../../skills/ki-archmain/',import.meta.url);
 const entry=readFileSync(new URL('SKILL.md',root));
 const framework=JSON.parse(readFileSync(new URL('references/framework-catalog.json',root),'utf8'));
 const version=entry.toString('utf8').match(/^# KI建筑设计工作流 ([\d.]+)/m)?.[1];
 if(version!==framework.method_version||createHash('sha256').update(entry).digest('hex')!==framework.source_sha256)throw new Error('方法正本与本机目录适配不一致，请同步后重新构建。');
 const keys=['opportunity','positioning','site','cases','concept','development','delivery','handover'];
 const chapters=Object.fromEntries(framework.chapters.map((chapter,i)=>[keys[i],{
  number:chapter.number,title:chapter.title,status:chapter.number==='07'?'展示工作，不计设计统计':'项目执行与确认分别记录',
  topics:chapter.topics.map(item=>({...item,summary:item.question||item.title,sections:[]})),
 }]));
 return {version,frameworkVersion:framework.framework_version,serviceStages:framework.service_stages,migration:framework.migration,framework,chapters};
}
