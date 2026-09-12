const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app-context.js');
const D=require('../app-domain.js');
const S=require('../app-storage.js');
const entry=(id,patch={})=>({id,revision:1,title:id,kind:'supplement',body:'補足 '+id,enabled:true,activation:'auto',protagonistMode:'append',worldMode:'modern',scope:{works:[],series:[],characterIds:[],worldModes:[],stageIds:[]},reference:{name:'',version:'',excerpt:''},...patch});
const context={character:{id:'c1',name:'人物',work:'ジョジョ',series:'5部'},worldMode:'canon',protagonistProfile:'共通夢主',workProtagonistProfile:'作品夢主'};
const resolve=(entries,selection={},extra={},style='')=>C.resolve({style,entries},{...C.emptySelection(),...selection},C.emptyOutput(),{...context,...extra});

test('scope uses AND between dimensions, OR within dimensions, and exact identities',()=>{
 const scope={works:['ジョジョ','別作品'],series:['5部'],characterIds:[],worldModes:['canon'],stageIds:[]};
 assert.ok(C.matches(scope,context));
 assert.ok(!C.matches(scope,{...context,worldMode:'modern'}));
 assert.ok(!C.matches(scope,{...context,character:{...context.character,work:'ジョジョ外伝'}}));
 assert.ok(!C.matches(scope,{...context,character:{...context.character,series:'4部'}}));
 assert.ok(!C.matches({...scope,characterIds:['other-id']},context));
});
test('auto, manual, disabled and per-request exclusion never mutate saved definitions',()=>{
 const entries=[entry('auto'),entry('manual',{activation:'manual'}),entry('disabled',{enabled:false})],before=JSON.stringify(entries);
 assert.deepEqual(resolve(entries).sections.map(x=>x.id),['auto']);
 assert.deepEqual(resolve(entries,{manualIds:['manual'],excludedIds:['auto']}).sections.map(x=>x.id),['manual']);
 assert.deepEqual(resolve(entries,{manualIds:['manual'],excludedIds:['auto','manual']}).sections,[]);
 assert.equal(JSON.stringify(entries),before);
});
test('stage is single, checks world and work, and stage-only supplements cannot leak',()=>{
 const stage=entry('office',{kind:'stage',scope:{...entry('x').scope,works:['ジョジョ']}});
 const supplement=entry('office-note',{scope:{...entry('x').scope,stageIds:['office']}});
 assert.deepEqual(resolve([stage,supplement]).sections,[]);
 assert.equal(resolve([stage,supplement],{stageId:'office'}).errors.length,1);
 const good=resolve([stage,supplement],{stageId:'office'},{worldMode:'modern'});
 assert.equal(good.errors.length,0);assert.deepEqual(good.sections.map(x=>x.id),['office','office-note']);
 assert.equal(resolve([stage],{stageId:'missing'}).errors.length,1);
 assert.equal(resolve([{...stage,enabled:false}],{stageId:'office'},{worldMode:'modern'}).errors.length,1);
 assert.equal(resolve([stage],{stageId:'office'},{worldMode:'modern',character:{...context.character,work:'他作品'}}).errors.length,1);
});
test('protagonist replacement replaces both legacy layers; appended notes remain separate',()=>{
 const a=entry('new',{kind:'protagonist',protagonistMode:'replace',body:'170cm'}),b=entry('job',{kind:'protagonist',body:'同僚'});
 const result=resolve([a,b]);assert.equal(result.protagonist,'170cm');assert.equal(result.workProtagonist,'');assert.deepEqual(result.sections.map(x=>x.text),['同僚']);
 assert.equal(resolve([a,{...a,id:'other'}]).errors.length,1);
 assert.equal(resolve([a,{...a,id:'other'}],{excludedIds:['other']}).errors.length,0);
});
test('reference-only is not claimed to be attached; excerpt, style and output survive formatting',()=>{
 const e=entry('ref',{reference:{name:'正本.md',version:'2026-09-12',excerpt:''}});
 const result=C.resolve({style:'即答を避ける',entries:[e]},C.emptySelection(),{length:'3000',pov:'character'},context);
 const prompt=D.formatPrompt({basePrompt:'BASE',character:context.character,contextSections:result.sections,freeExtra:'最後の指定'});
 assert.match(prompt,/本文はこのプロンプトに含まれていません/);assert.match(prompt,/3000字/);assert.match(prompt,/相手キャラクターの視点/);
 assert.ok(prompt.indexOf('即答を避ける')<prompt.indexOf('最後の指定'));
 const excerpt=resolve([{...e,reference:{...e.reference,excerpt:'本文😀\r\n改行'}}]);
 assert.match(excerpt.sections[0].text,/本文😀\r\n改行/);assert.doesNotMatch(excerpt.sections[0].text,/含まれていません/);
});
test('generation snapshots freeze definitions and selection despite later edits',()=>{
 const settings={style:'旧文体',entries:[entry('a')]},selection={...C.emptySelection(),excludedIds:['a']};
 const saved=C.capture(settings,selection,C.emptyOutput());settings.entries[0].body='変更';selection.excludedIds.length=0;
 assert.equal(saved.settings.entries[0].body,'補足 a');assert.deepEqual(saved.selection.excludedIds,['a']);
 const novel=D.makeSnapshot({prompt:'完成',promptContext:saved});saved.settings.style='後で変更';assert.equal(novel.promptContext.settings.style,'旧文体');
});
test('legacy migration preserves custom text, explicit empty profiles and old snapshots',()=>{
 const old={version:41,characters:[],pools:{situation:['独自シチュ']},basePrompt:'独自固定\r\n😀',protagonistProfile:'',workProtagonistProfiles:{ジョジョ:''},freeExtra:'自由文',presets:[{id:'p',snapshot:{prompt:'昔の完成文'}}]};
 const before=JSON.stringify(old),m=S.decodeSettings(old,{},true);
 assert.equal(JSON.stringify(old),before);assert.equal(m.basePrompt,old.basePrompt);assert.equal(m.protagonistProfile,'');assert.deepEqual(m.workProtagonistProfiles,old.workProtagonistProfiles);assert.deepEqual(m.presets,old.presets);assert.deepEqual(m.promptSettings,C.emptySettings());
});
test('backup round trip freezes context on settings, preset, draft and novel',()=>{
 const promptContext=C.capture({style:'好み',entries:[entry('a')]},C.emptySelection(),C.emptyOutput());
 const settings={characters:[],pools:{},promptSettings:promptContext.settings,promptSelection:promptContext.selection,promptOutput:promptContext.output,promptContextOverride:promptContext,promptDraftSnapshot:{prompt:'完成',promptContext},presets:[{id:'p',snapshot:{prompt:'過去',promptContext}}]};
 const novels=[{id:'n',body:'本文\r\n😀',snapshot:{promptContext},promptSnapshot:'元の文'}];
 const result=S.validateBackup(JSON.parse(JSON.stringify(S.makeBackup(settings,novels))));
 assert.deepEqual(result.promptSettings,settings.promptSettings);assert.deepEqual(result.promptContextOverride,promptContext);assert.deepEqual(result.novels,novels);assert.deepEqual(result.presets,settings.presets);
});
test('invalid context is rejected before restoration instead of silently discarding data',()=>{
 const basic={characters:[],pools:{}};
 for(const value of [null,[],{style:'',entries:[entry('same'),entry('same')]},{style:'',entries:[entry('e',{revision:0})]},{style:'',entries:[entry('e',{scope:{...entry('x').scope,stageIds:['missing']}})]}]){
   assert.throws(()=>S.validateSettings({...basic,promptSettings:value}));
 }
 assert.throws(()=>C.validateSelection({stageId:'',manualIds:['a','a'],excludedIds:[]}));
 for(const length of ['0','-1','1.5','1234567','3000字'])assert.throws(()=>C.validateOutput({length,pov:''}));
 const backup=S.makeBackup(basic,[{id:'n',body:'x',snapshot:{promptContext:{version:99}}}]);assert.throws(()=>S.validateBackup(backup));
});
