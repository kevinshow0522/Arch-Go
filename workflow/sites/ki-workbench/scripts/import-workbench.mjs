import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const source=path.resolve(process.argv[2]??'../../kigaga-workflow-v0.3'),target=process.cwd();
const {readWorkbenchTemplate}=await import(pathToFileURL(path.join(source,'scripts/workbench-template.mjs')).href);
let html=readWorkbenchTemplate(source);
const runtime=fs.readFileSync(path.join(source,'web/project-workbench.mjs'),'utf8').replace('export function createProjectWorkbench','function createProjectWorkbench');
if(/^\s*(?:import|export) /m.test(runtime))throw Error('Runtime import needs an explicit update');
const catalog=fs.readFileSync(path.join(source,'../skills/ki-archmain/references/framework-catalog.json'),'utf8');
fs.mkdirSync('workbench',{recursive:true});
fs.writeFileSync('public/workbench-runtime.js',"(function(){'use strict';\n"+runtime+'\nwindow.KiGAGAProjectRuntime={createProjectWorkbench};})();\n');
fs.writeFileSync('public/workbench-method.js','window.KIGAGA_METHOD_CATALOG='+JSON.stringify(JSON.parse(catalog)).replaceAll('<','\\u003c')+';\n');
html=html.replace('<title>ki-arch</title>','<title>KI建筑设计工作流 · 云端工作台</title>').replace('</head>','<script src="/workbench-method.js"></script><script src="/workbench-runtime.js"></script>\n</head>');
html=html.replace("['handoffs','交接记录']","['handoffs','交接记录'],['artifacts','成果展示']").replace("'项目工作台'","'云端工作台'").replace("S.view==='mainline'?mainlineView()", "S.view==='artifacts'?cloudArtifactCards():S.view==='mainline'?mainlineView()");
html=html.replace("notices+(S.projectsOpen?projectButtons():'')", "notices+cloudPublicationNote()+(S.projectsOpen?projectButtons():'')");
html=html.replaceAll("p.id===S.snapshot?.project?.id", "p.id===S.snapshot?.publication?.source_key");
const additions=`
function cloudPublicationNote(){var p=S.snapshot?.publication;return p?'<section class="cloud-note" role="status"><b>云端已保存 · 第 '+esc(p.revision)+' 次发布</b><span>来源更新 '+esc(new Date(p.source_updated_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))+' · 发布 '+esc(new Date(p.published_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))+'</span><small>显示最近一次已发布记录。AI在对话中更新，页面每20秒读取一次。</small></section>':'';}
function cloudArtifactCards(){var files=arr(S.snapshot?.artifacts),results=tasks().filter(function(t){return t.hasResult;});return '<div class="stack">'+(results.length?'<section class="card"><div class="cardhead"><h2>已记录的文字成果</h2></div>'+taskRows(results)+'</section>':'')+'<section class="card"><div class="cardhead"><h2>展示成果</h2><span class="muted">'+files.length+' 份云端文件</span></div>'+(files.length?'<div class="artifact-grid">'+files.map(function(f){var url='/api/artifacts/'+encodeURIComponent(f.id),image=/^image\\/(png|jpeg|webp|gif)$/.test(f.mime_type);return '<article class="artifact"><h3>'+esc(f.title)+'</h3><p class="muted">'+esc(f.file_name)+(f.result_revision?' · 成果第 '+esc(f.result_revision)+' 版':'')+'</p>'+(image?'<a target="_blank" rel="noopener" href="'+url+'"><img loading="lazy" src="'+url+'" alt="'+esc(f.title)+'"></a>':'')+(f.mime_type==='application/pdf'?'<object class="pdf-preview" data="'+url+'" type="application/pdf"><p>点下方链接查看PDF。</p></object>':'')+'<a class="artifact-link" target="_blank" rel="noopener" href="'+url+'">'+(image||f.mime_type==='application/pdf'?'打开成果':'下载成果')+'</a></article>';}).join('')+'</div>':empty('选定的图纸、图片或文档由AI在对话中发布到这里。'))+'</section></div>';}
`;
html=html.replace('function projectButtons()',additions+'\nfunction projectButtons()');
html=html.replace('</style>',`.cloud-note{display:grid;gap:5px;margin-bottom:28px;padding:18px 22px;background:var(--surface);border-radius:20px;font-size:12px;color:var(--accent);box-shadow:var(--inset)}.cloud-note span,.cloud-note small{color:var(--muted);font-size:12px}.artifact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:24px}.artifact{padding:22px;background:var(--surface);border-radius:22px;box-shadow:var(--inset)}.artifact img{display:block;width:100%;height:auto;margin:16px 0;border-radius:12px}.pdf-preview{width:100%;height:420px;margin-top:16px;background:var(--surface)}.artifact-link{display:inline-block;color:var(--accent);margin-top:18px}@media(max-width:720px){.cloud-note{padding:16px;font-size:11px}.artifact{padding:18px}.pdf-preview{height:340px}}</style>`);
html=html.replace('</body>','<script src="/cloud-client.js"></script>\n</body>');
fs.writeFileSync(path.join(target,'workbench/page.html'),html);
console.log('Imported the tested read-only workbench; no project data copied.');
