import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const root=process.cwd();
const base='908456c60192907f3c7e65709e18846f08eea2f8';
const files=execFileSync('git',['diff','--name-only',base],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(x=>!x.includes('.test.') && /\.(ts|tsx)$/.test(x));
const old=new Map(files.map(f=>[resolve(root,f),execFileSync('git',['show',`${base}:${f}`],{cwd:root,encoding:'utf8'})]));
const runtimes=['Claude Code','Codex','Pi','OpenCode','Gemini','Copilot'].map((name,i)=>({id:`rt-${i}`,name,provider:i===0?'claude':'codex',status:'online',daemon_id:'daemon-1',device_info:'MacBook Pro',metadata:{},runtime_mode:'local',runtime_config:{}}));
const results=[];
for(const mode of ['before','after']) {
 const server=await createServer({root:resolve(root,'apps/ui-lab'),configFile:resolve(root,'apps/ui-lab/vite.config.ts'),server:{host:'127.0.0.1',port:14381,strictPort:true},plugins:[{name:'evidence-fixtures',enforce:'pre',load(id){
  if(id.endsWith('/onboarding/components/use-runtime-picker.ts')) return `const runtimes=${JSON.stringify(runtimes)}; export function useRuntimePicker(){return {runtimes,selected:runtimes[0],selectedId:runtimes[0].id,setSelectedId(){},hasRuntimes:true}}`;
  if(mode==='before' && old.has(id)) return old.get(id);
 }}]});
 let browser;
 try {
  await server.listen();
  browser=await chromium.launch({headless:true});
  for(const platform of ['web','desktop']) {
   const page=await browser.newPage({viewport:{width:1200,height:920}});
   page.on('pageerror',e=>console.error(e.message));
   const requests=[];
   await page.route('**/api/runtimes/*/models**', async route=>{
    const req=route.request(); const slug=req.headers()['x-workspace-slug'];
    requests.push({method:req.method(),slug:slug??null,url:new URL(req.url()).pathname+new URL(req.url()).search});
    if(slug!=='new-workspace') return route.fulfill({status:400,json:{error:'workspace_id or workspace_slug is required'}});
    const poll=req.method()==='GET';
    return route.fulfill({status:200,json:{id:'req-1',runtime_id:'rt-0',status:poll?'completed':'pending',supported:true,created_at:'2026-10-30T00:00:00Z',updated_at:'2026-10-30T00:00:00Z',models:poll?[{id:'claude-sonnet-4-6',label:'Claude Sonnet 4.6',provider:'anthropic'}]:[]}});
   });
   await page.goto(`http://127.0.0.1:14381/onboarding-evidence.html?${platform}`);
   if(platform==='web') await page.getByRole('button',{name:/show steps/i}).click();
   await page.locator('[data-slot="popover-trigger"]').last().click();
   await page.getByText(mode==='before'?'workspace_id or workspace_slug is required':'Claude Sonnet 4.6',{exact:true}).waitFor({timeout:30000});
   await page.screenshot({animations:"disabled",path:resolve(root,`../evidence/${platform}-${mode}.png`)});
   if(mode==='after') {
    const refreshed=page.waitForResponse(r=>r.request().method()==='GET' && r.url().includes('/models/req-1'));
    await page.getByRole('button',{name:/refresh/i}).last().click();
    await refreshed;
    await page.getByText('Claude Sonnet 4.6',{exact:true}).waitFor();
   }
   results.push({mode,platform,requests});
   await page.close();
  }
 } finally {await browser?.close();await server.close();}
}
writeFileSync(resolve(root,'../evidence/requests.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
