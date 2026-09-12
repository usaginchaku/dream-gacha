// Exercises the production app in a disposable profile. No user's browser data is accessed.
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
if(!process.argv[2])throw new Error('Pass the installed playwright directory; optional screenshot directory follows.');
const {chromium}=await import(pathToFileURL(path.join(process.argv[2],'index.mjs')).href);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profile=await mkdtemp(path.join(tmpdir(),'dream-gacha-context-qa-'));
let browser;
try{
 browser=await chromium.launchPersistentContext(profile,{headless:true,channel:'chrome',viewport:{width:1280,height:1000},acceptDownloads:true});
 const page=await browser.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});page.on('dialog',d=>d.accept());
 await page.goto(pathToFileURL(path.join(root,'index.html')).href);
 await page.waitForFunction(()=>document.querySelector('#basePrompt').value.includes('0.1.3.2'));
 const standard=await page.locator('#basePrompt').inputValue();
 const who=await page.evaluate(()=>{const c=state.characters.find(c=>c.work==='ジョジョの奇妙な冒険'&&c.series==='5部');state.characterId=c.id;updateCard('character');return c;});
 await page.locator('#contextManager > summary').click();
 await page.locator('#contextStyle').fill('「即答」を避ける。<img src=x onerror=alert(1)>');
 await page.locator('#contextStyleSave').click();
 async function create({title,kind='supplement',body='',work=who.work,series='',stage='',action='append',activation='auto',reference=null}){
   await page.locator('#contextNew').click();await page.locator('#contextTitle').fill(title);await page.locator('#contextKind').selectOption(kind);
   await page.locator('#contextBody').fill(body);
   await page.locator('#contextEditor .context-scope').evaluate(e=>e.open=true);
   await page.locator('#contextScope-works').selectOption(work?[work]:[]);
   if(series)await page.locator('#contextScope-series').selectOption([series]);
   if(stage)await page.locator('#contextScope-stageIds').selectOption([stage]);
   if(kind==='protagonist')await page.locator('#contextProtagonistMode').selectOption(action);
   if(kind!=='stage')await page.locator('#contextActivation').selectOption(activation);
   if(reference){await page.locator('#contextEditor > details').filter({hasText:'参考資料（任意）'}).evaluate(e=>e.open=true);await page.locator('#contextReference-name').fill(reference.name);await page.locator('#contextReference-version').fill('2026-09-12');await page.locator('#contextReference-excerpt').fill(reference.excerpt||'');}
   await page.locator('#contextEntrySave').click();
   assert.match(await page.locator('#contextEditorStatus').textContent(),/保存しました/);
   const id=await page.evaluate(title=>state.promptSettings.entries.find(e=>e.title===title).id,title);
   await page.locator('#contextCancel').click();return id;
 }
 const stage=await create({title:'ジョジョのオフィス',kind:'stage',body:'スタンドは持ち込まない。',reference:{name:'正本.md'}});
 await page.locator('#contextStage').selectOption(stage);
 assert.equal(await page.evaluate(()=>state.worldMode),'modern');assert.match(await page.locator('#worldModeSummary').textContent(),/現代パロ/);
 const note=await create({title:'5部表記 <b>メモ</b>',series:'5部',body:'地名はネアポリスと表記する。'});
 const office=await create({title:'仕事上の距離',stage,body:'部署や学歴を必要なく説明しない。',reference:{name:'抜粋.md',excerpt:'部署設定😀\n同期関係'}});
 const manual=await create({title:'任意の解釈',body:'今回選んだ補足。',activation:'manual'});
 const protagonist=await create({title:'会社員の夢主',kind:'protagonist',stage,action:'replace',body:'成人女性、身長170cm。会社員。'});
 await page.locator('#contextPreview').evaluate(e=>e.open=true);
 await page.locator(`[data-context-apply="${manual}"]`).check();
 await page.locator('#contextPreview > details > summary').click();
 await page.locator('#contextOutputLength').fill('3000');await page.locator('#contextOutputPov').selectOption('character');
 await page.evaluate(()=>{updateCard('character');renderWorldModeControls();});
 assert.equal(await page.locator('#contextOutputLength').inputValue(),'3000');assert.equal(await page.locator('#contextOutputPov').inputValue(),'character');
 await page.locator('#contextOutputSave').click();
 await page.locator('#buildPrompt').click();
 const assembled=await page.locator('#output').inputValue();
 assert.match(assembled,/即答/);assert.match(assembled,/ネアポリス/);assert.match(assembled,/170cm/);assert.doesNotMatch(assembled,/160cm/);
 assert.match(assembled,/今回選んだ補足/);assert.match(assembled,/3000字/);assert.match(assembled,/本文はこのプロンプトに含まれていません/);assert.match(assembled,/部署設定😀\n同期関係/);
 assert.equal(await page.locator('#contextApplied img, #contextApplied b').count(),0);
 await page.locator(`[data-context-apply="${note}"]`).uncheck();await page.locator('#buildPrompt').click();assert.doesNotMatch(await page.locator('#output').inputValue(),/ネアポリス/);
 await page.locator(`[data-context-apply="${note}"]`).check();
 const conflict=await create({title:'別の夢主',kind:'protagonist',stage,action:'replace',body:'別人'});
 await page.locator('#buildPrompt').click();assert.match(await page.locator('#contextErrors').textContent(),/複数/);
 const beforeBlocked=await page.locator('#output').inputValue();await page.locator('#buildPrompt').click();assert.equal(await page.locator('#output').inputValue(),beforeBlocked);
 await page.locator(`[data-context-apply="${conflict}"]`).uncheck();await page.locator('#buildPrompt').click();
 const frozen=await page.evaluate(()=>structuredClone(state.promptDraftSnapshot));
 await page.locator('#saveCurrentPreset').click();
 const savedPreset=await page.evaluate(()=>structuredClone(state.presets[0]));assert.equal(savedPreset.snapshot.promptContext.settings.entries.length,6);
 await page.locator('#openNovelSave').click();await page.locator('#novelTitle').fill('新設定での保存');await page.locator('#novelBody').fill('本文😀\n段落。\n');await page.locator('#saveNovel').click();
 await page.waitForFunction(()=>document.querySelector('#novelCount').textContent==='1本');
 const savedNovel=(await page.evaluate(()=>novelAll()))[0];assert.deepEqual(savedNovel.snapshot.promptContext,frozen.promptContext);
 await page.locator('#tab-gacha').click();
 await page.locator(`[data-context-edit="${office}"]`).click();await page.locator('#contextBody').fill('更新した設定');await page.locator('#contextEntrySave').click();await page.locator('#contextCancel').click();
 await page.locator('#buildPrompt').click();assert.match(await page.locator('#output').inputValue(),/更新した設定/);
 await page.evaluate(s=>applySnapshot(s),savedPreset.snapshot);assert.ok(await page.locator('#contextReuseNotice').isVisible());
 await page.locator('#buildPrompt').click();assert.doesNotMatch(await page.locator('#output').inputValue(),/更新した設定/);assert.match(await page.locator('#output').inputValue(),/部署や学歴/);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#basePrompt').value.includes('0.1.3.2'));assert.ok(await page.locator('#contextReuseNotice').isVisible());
 await page.locator('#buildPrompt').click();assert.doesNotMatch(await page.locator('#output').inputValue(),/更新した設定/);
 // Restore an old snapshot: new auto supplements and style must not leak into it.
 await page.evaluate(()=>applySnapshot({character:{...currentCharacter()},worldMode:'canon',protagonistProfile:'',workProtagonistProfile:'',prompt:'旧完成',relationship:'知人',situation:'雨宿りをしている',mood:'静か',extra:'接触なし'}));
 await page.locator('#buildPrompt').click();let legacy=await page.locator('#output').inputValue();assert.doesNotMatch(legacy,/ネアポリス|即答|【夢主設定】/);
 await page.locator('#contextUseCurrent').click();await page.locator('#contextStage').selectOption(stage);await page.locator('#contextPreview').evaluate(e=>e.open=true);
 await page.locator(`[data-context-apply="${conflict}"]`).uncheck();await page.locator('#buildPrompt').click();assert.match(await page.locator('#output').inputValue(),/更新した設定/);
 // An incompatible reroll blocks generation and keeps the previous completed prompt.
 const validPrompt=await page.locator('#output').inputValue();
 await page.evaluate(()=>{state.characterId=state.characters.find(c=>c.work!=='ジョジョの奇妙な冒険').id;updateCard('character');});await page.locator('#buildPrompt').click();
 assert.match(await page.locator('#contextErrors').textContent(),/一致しません/);assert.equal(await page.locator('#output').inputValue(),validPrompt);
 await page.evaluate(id=>{state.characterId=id;updateCard('character');},who.id);
 // Quota failure must leave stored text and editable input intact and roll back in-memory settings.
 await page.locator('#contextManager').evaluate(e=>e.open=true);
 const before=await page.evaluate(()=>localStorage.getItem('dreamGachaSettings'));
 await page.locator('#contextStyle').fill('保存失敗でも残す入力');
 await page.evaluate(()=>{window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('QA quota failure');};});
 await page.locator('#contextStyleSave').click();assert.match(await page.locator('#contextEditorStatus').textContent(),/保存できません/);assert.equal(await page.locator('#contextStyle').inputValue(),'保存失敗でも残す入力');
 await page.evaluate(()=>{Storage.prototype.setItem=window.qaSetItem;delete window.qaSetItem;});assert.equal(await page.evaluate(()=>localStorage.getItem('dreamGachaSettings')),before);
 await page.locator('#contextStyleSave').click();
 const backup=await page.evaluate(()=>fullBackupPayload());assert.equal(backup.version,3);
 const corrupt=structuredClone(backup);corrupt.data.promptSettings.entries.push(corrupt.data.promptSettings.entries[0]);
 const beforeCorrupt=await page.evaluate(()=>localStorage.getItem('dreamGachaSettings'));
 assert.match(await page.evaluate(async b=>{try{await restoreFullBackup(b);return '';}catch(e){return e.message;}},corrupt),/重複/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('dreamGachaSettings')),beforeCorrupt);
 await page.locator('#contextStyle').fill('復元で破棄する未保存文');
 await page.evaluate(b=>restoreFullBackup(b),backup);assert.deepEqual(await page.evaluate(()=>novelAll()),backup.data.novels);
 assert.equal(await page.locator('#contextStyle').inputValue(),backup.data.promptSettings.style);
 assert.deepEqual((await page.evaluate(()=>novelAll()))[0].snapshot,savedNovel.snapshot);
 assert.equal(await page.locator('#basePrompt').inputValue(),standard);
 // Both themes and narrow mobile layout with a long, scoped entry editor.
 for(const width of [390,1280]){
   await page.setViewportSize({width,height:950});await page.locator('#themeMode').selectOption(width===390?'dark':'light');
   await page.reload();await page.waitForFunction(()=>document.querySelector('#basePrompt').value.includes('0.1.3.2'));
   await page.locator('#contextManager').evaluate(e=>e.open=true);await page.locator(`[data-context-edit="${note}"]`).click();await page.locator('#contextEditor .context-scope').evaluate(e=>e.open=true);
   await page.locator('#contextEditor').evaluate(e=>window.scrollTo({top:scrollY+e.getBoundingClientRect().top-70,behavior:'instant'}));
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.ok(await page.locator('#contextScope-works option').count()>1);
   if(process.argv[3]){await mkdir(process.argv[3],{recursive:true});await page.screenshot({path:path.join(process.argv[3],`context-${width}.png`)});}
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 console.log('PASS: stage/mode, scopes, manual and exclusion, protagonist replacement/conflict, references, output options, snapshots and reuse, reload, quota rollback, invalid/valid backup restore, legacy empty settings, XSS escaping, 390px/1280px and themes; no page errors or external requests');
}finally{
 if(browser)await browser.close();
 const checked=path.resolve(profile);if(path.dirname(checked)!==path.resolve(tmpdir())||!path.basename(checked).startsWith('dream-gacha-context-qa-'))throw new Error('Unexpected QA cleanup path');
 await rm(checked,{recursive:true,force:true});
}
