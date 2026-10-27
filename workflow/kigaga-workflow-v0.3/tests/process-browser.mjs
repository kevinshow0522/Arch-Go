// Real Chromium rendering of the compiled page; the host is an offline fixture.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {processSnapshot} from './fixtures/workbench-130.mjs';
import {snapshotHtml} from '../scripts/snapshot-html.mjs';
const playwright=process.env.KG_PLAYWRIGHT_PATH||'playwright';
const {chromium}=await import(playwright.includes(':')?pathToFileURL(playwright).href:playwright);
const output=resolve('test-output/process-ui-20261026');mkdirSync(output,{recursive:true});
const html=snapshotHtml(readFileSync(new URL('../assets/workbench.html',import.meta.url),'utf8'),processSnapshot());
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],requests=[],checks=[];
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.route('**/*',route=>{const url=route.request().url();if(url==='https://ki-arch.test/')return route.fulfill({contentType:'text/html; charset=utf-8',body:html});if(url.endsWith('/favicon.ico'))return route.fulfill({status:204});requests.push(url);return route.abort();});
 for(const width of [1280,390])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:width===390?844:1000});await page.goto('https://ki-arch.test/');
  if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('[data-act="theme"]').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
  assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');
  for(const view of ['overview','results','method','mainline','handoffs']){
   await page.locator(`[data-act="view"][data-v="${view}"]`).click();
   assert.equal(await page.locator('input,textarea,select,form,[contenteditable=true],[data-ki-map-panel]').count(),0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}/${theme}/${view}: horizontal overflow`);
   assert.ok(await page.locator('h1').isVisible());
   await page.screenshot({path:join(output,`${width}-${theme}-${view}.png`),fullPage:true});
   checks.push({width,theme,view,no_horizontal_overflow:true,no_editors:true});
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 writeFileSync(join(output,'checks.json'),JSON.stringify({checks,errors,unexpected_requests:requests,native_host_verified:false},null,2)+'\n');
 console.log(JSON.stringify({views_checked:checks.length,errors:errors.length,unexpected_requests:requests.length,output}));
}finally{await browser.close();}
