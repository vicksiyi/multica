import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve('multica');
const require = createRequire(path.join(root, 'package.json'));
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const { chromium } = require('@playwright/test');
const postcss = webRequire('postcss');
const tailwind = webRequire('@tailwindcss/postcss');
const read = (file, before) => before ? execFileSync('git', ['show', `2df765a3c:${file}`], {cwd:root, encoding:'utf8'}) : readFileSync(path.join(root,file),'utf8');
const file = {
 header: 'packages/views/issues/components/issue-agent-header-chip.tsx',
 label: 'packages/views/issues/components/issue-agent-activity-indicator.tsx',
 sub: 'packages/views/issues/components/sub-issues-agent-working-chip.tsx',
 fab: 'packages/views/chat/components/chat-fab.tsx',
};
function fixture(before, active) {
 const header = read(file.header,before).match(/anyRunning && "([^"]+)"/)[1];
 const label = before ? 'animate-chat-text-shimmer' : 'text-info';
 if (!read(file.label,before).includes(`"${label}"`) || !read(file.sub,before).includes(label)) throw Error('Label fixture drift');
 const fab = read(file.fab,before).match(/isRunning && "([^"]+)"/)[1];
 const avatar = '<span class="inline-flex size-5 items-center justify-center rounded-full bg-muted text-micro">A</span>';
 const badge = active ? `${avatar}<span class="${label} text-micro">Working</span>` : '';
 return `<aside style="position:fixed;left:0;top:0;width:235px;height:100vh;border-right:1px solid var(--border);padding:25px">Multica<br><br>Inbox<br><br>My issues<br><br>Projects</aside>
 <main style="margin-left:275px;max-width:1120px;padding:30px">
 <div class="flex items-center justify-between"><span class="text-muted-foreground">Performance / Issue #8522</span><button class="flex items-center gap-1.5 rounded-md px-2 h-7 ${active?header:''}">${avatar}<span class="text-info text-caption">${active?'Agent working':'No active runs'}</span></button></div>
 <h1 style="font-size:24px;margin:32px 0 16px">Reduce CPU usage from active-run animations</h1>
 <p>Animation isolation fixture — real shared CSS and activity classes; synthetic issue content.</p>
 <section style="margin-top:32px"><div class="flex items-center gap-2">Sub-issues ${active?`<span class="${label} text-micro font-medium">6 agents working</span>`:''}</div>
 ${Array.from({length:6},(_,i)=>`<div class="flex items-center justify-between" style="padding:12px 0;border-bottom:1px solid var(--border)"><span>Performance investigation ${i+1}</span><span class="flex items-center gap-1">${badge}</span></div>`).join('')}</section>
 <h2 style="margin:28px 0">Activity · 164 comments</h2>
 ${Array.from({length:164},(_,i)=>`<article style="padding:18px 0;border-bottom:1px solid var(--border)"><strong>Agent ${i%6+1}</strong><p>Investigating issue activity and rendering performance. Comment ${i+1}.</p></article>`).join('')}
 </main><button aria-label="${active?'Chat running':'Open chat'}" class="fixed bottom-6 right-6 flex size-12 items-center justify-center rounded-full bg-surface-raised ${active&&!before?'':'text-muted-foreground ring-surface-border'} shadow-[var(--floating-shadow)] ring-1 ${active?fab:''}">Chat</button>`;
}
const browser = await chromium.launch({channel:'chrome',headless:true});
const results=[];
try {
 for (const before of [true,false]) {
  for (const state of ['active','idle','reduced']) {
   const html=fixture(before,state!=='idle');
   const css = `@import "tailwindcss";\n${read('packages/ui/styles/tokens.css',before)}\n${read('packages/ui/styles/base.css',before)}\n@source inline("${[...new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap(x=>x[1].split(' ')))].join(' ')}");\n body{margin:0;background:var(--background);color:var(--foreground);font-family:Arial,sans-serif;font-size:14px}`;
   const compiled = await postcss([tailwind({base:path.join(root,'apps/web')})]).process(css,{from:path.join(root,'apps/web/activity-profile.css')});
   const context=await browser.newContext({viewport:{width:1936,height:1096},deviceScaleFactor:2,reducedMotion:state==='reduced'?'reduce':'no-preference'});
   const page=await context.newPage();
   await page.setContent(`<style>${compiled.css}</style>${html}`);
   await page.waitForTimeout(1000);
   const animations=await page.evaluate(()=>document.getAnimations().map(a=>a.animationName));
   if (!before && animations.length) throw Error('Active indicators still animate');
   const cdp=await context.newCDPSession(page);
   await cdp.send('Performance.enable');
   const metric=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
   const events=[];cdp.on('Tracing.dataCollected',d=>events.push(...d.value));
   await cdp.send('Tracing.start',{categories:'devtools.timeline',transferMode:'ReportEvents'});
   const start=await metric();
   await page.waitForTimeout(5000);
   const end=await metric();
   const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
   await cdp.send('Tracing.end');await done;
   const duration=end.Timestamp-start.Timestamp;
   const result={revision:before?'before':'after',state,seconds:duration,mainThreadBusyPercent:100*(end.TaskDuration-start.TaskDuration)/duration,paintEvents:events.filter(e=>e.name==='Paint').length,paintMs:events.filter(e=>e.name==='Paint').reduce((s,e)=>s+(e.dur||0)/1000,0),scriptMs:1000*(end.ScriptDuration-start.ScriptDuration),animations};
   results.push(result);console.log(JSON.stringify(result));
   await page.screenshot({path:`artifacts/${result.revision}-${state}.png`});
   writeFileSync(`artifacts/${result.revision}-${state}-trace.json`,JSON.stringify({traceEvents:events}));
   if(state==='active') {await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:`artifacts/${result.revision}-active-dark.png`});}
   await context.close();
  }
 }
 writeFileSync('artifacts/measurements.json',JSON.stringify({browser:browser.version(),platform:process.platform,results},null,2));
} finally {await browser.close();}
