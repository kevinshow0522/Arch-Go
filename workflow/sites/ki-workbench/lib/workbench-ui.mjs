export const workbenchUri='ui://ki-arch/cloud-workbench-0.6.1.html';
export const workbenchMime='text/html;profile=mcp-app';

// Keep the website and the sidebar on the same HTML, CSS and rendering code.
export function workbenchResource(origin,assets){
 if(!assets?.html||!assets.method||!assets.runtime||!assets.client||!assets.host)throw Error('工作台界面资源缺失');
 const script=value=>'<script>'+value.replace(/<\/script/gi,'<\\/script')+'</script>';
 let text=assets.html.replace('<head>',()=>'<head>'+script('window.KIGAGA_MCP_UI=true;')+script(assets.host));
 for(const [file,key] of [['workbench-method.js','method'],['workbench-runtime.js','runtime'],['cloud-client.js','client']]){
  const tag='<script src="/'+file+'"></script>';
  if(!text.includes(tag))throw Error('工作台脚本入口缺失：'+file);
  text=text.replace(tag,()=>script(assets[key]));
 }
 // Private images and PDFs need the website's sign-in context. In the sandbox,
 // keep the file card and open its owner-protected URL in the browser instead.
 text=text.replace("var url='/api/artifacts/'",()=>"var url='"+new URL(origin).origin+"/api/artifacts/'")
  .replace('image=/^image\\/(png|jpeg|webp|gif)$/.test(f.mime_type)','image=!W.KIGAGA_MCP_UI&&/^image\\/(png|jpeg|webp|gif)$/.test(f.mime_type)')
  .replace("f.mime_type==='application/pdf'?'<object", "!W.KIGAGA_MCP_UI&&f.mime_type==='application/pdf'?'<object");
 return {uri:workbenchUri,mimeType:workbenchMime,text,_meta:{ui:{prefersBorder:true,csp:{connectDomains:[],resourceDomains:[new URL(origin).origin]}},'openai/ui':{availableDisplayModes:['fullscreen']}}};
}
