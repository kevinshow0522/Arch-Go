// Shared by all offline exports. Keep the full UTF-8 document and inject data as inert JSON.
export function snapshotHtml(html,snapshot){
  const marker='<script type="module">';
  if(!html.includes(marker)||!/<meta\s+charset="utf-8"/i.test(html.slice(0,1024)))throw new Error('工作台模板缺少 UTF-8 声明或程序入口，请先重新构建。');
  const data=JSON.stringify(snapshot).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const bootstrap=`<script>window.__KG_PREVIEW__=${data};window.__KIGAGA_SNAPSHOT__=window.__KG_PREVIEW__;window.KIGAGA_OFFLINE=true;window.openai={toolResponseMetadata:{workbench:window.__KG_PREVIEW__},callTool:async function(name){if(name!=="kg_open_workbench")throw new Error("离线快照只供读取");return {_meta:{workbench:window.__KG_PREVIEW__}};}};</script>`;
  return html.replace(/<meta\s+charset=["']utf-8["'][^>]*>/i,match=>match+'\n'+bootstrap);
}
