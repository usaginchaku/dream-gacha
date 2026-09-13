const test=require("node:test");
const assert=require("node:assert/strict");
const p=require("../app-prompts.js");
const domain=require("../app-domain.js");
const storage=require("../app-storage.js");
const context=require("../app-context.js");
const standard="# 【夢小説生成プロンプト Ver.0.1.3.2】\n標準の指示";
const input={id:"p1",baseText:standard,standardText:standard,label:"",createdAt:"2026-09-12T00:00:00.000Z"};

test("paste splits only the first separator, preserving every body character",()=>{
  for(const newline of ["\n","\r\n","\r"]){
    const body=newline+"　本文😀"+newline+"二段落"+newline;
    assert.deepEqual(p.splitNovelPaste("\uFEFF 題名 "+newline+body),{title:"題名",body});
  }
  for(const source of ["","題名だけ","題名\n  ","\n本文"])assert.equal(p.splitNovelPaste(source),null);
});
test("immutable fixed-prompt revisions distinguish content and reference, not header alone",()=>{
  const revision=p.captureRevision([],input);
  assert.equal(p.captureRevision([revision],{...input,id:"ignored"}).id,"p1");
  const custom=p.captureRevision([revision],{...input,id:"p2",baseText:standard+"\n変更",label:"調整"});
  assert.equal(custom.id,"p2");assert.equal(custom.standardVersion,"0.1.3.2");
  assert.match(p.revisionLabel(revision),/^標準/);assert.match(p.revisionLabel(custom),/^自分の版/);
  custom.standardText="changed";assert.equal(revision.standardText,standard);
  assert.equal(p.headerVersion("本文\n"+standard),null);
});
test("generated and manually edited prompts remain independent of current settings",()=>{
  const record={revision:p.captureRevision([],input),assembledPrompt:standard+"\n条件"};
  const snapshot=domain.makeSnapshot({prompt:record.assembledPrompt,promptRecord:record});
  record.revision.baseText="later";assert.equal(snapshot.promptRecord.revision.baseText,standard);
  assert.match(p.promptSummary(snapshot),/追加編集なし/);
  snapshot.prompt+="\n直接編集";assert.match(p.promptSummary(snapshot),/追加編集あり/);
  assert.match(p.promptSummary({prompt:standard}),/版情報未記録/);
  assert.match(p.promptSummary({}),/プロンプト未記録/);
});
test("diff is lossless for additions, removals, repeated lines, CRLF and large inputs",()=>{
  const cases=[["a\nb\nc","a\nx\nc"],["","new"],["old",""],["a\na\nb","a\nb\na"],["a\r\nb\n","a\nb\n"],["x\n".repeat(700),"y\n".repeat(700)]];
  for(const [a,b] of cases){const rows=p.lineDiff(a,b);assert.equal(rows.filter(r=>r.type!=="added").map(r=>r.text).join("\n"),a);assert.equal(rows.filter(r=>r.type!=="removed").map(r=>r.text).join("\n"),b)}
});
test("export keeps annotation text separate from prompt and never labels legacy data as current",()=>{
  const novel={id:"n",title:"題",body:"\n　本文😀\n",snapshot:{prompt:standard},createdAt:"date"};
  const before=JSON.stringify(novel),exported=p.novelExport(novel,"date");
  assert.equal(exported.novel.body,novel.body);assert.equal(exported.annotation.text,novel.body);
  assert.equal(exported.prompt.text,standard);assert.equal(exported.prompt.status,"unknown");assert.equal(exported.prompt.versionId,null);
  assert.equal(exported.annotation.reviewStatus,"unknown");assert.equal(JSON.stringify(novel),before);
  assert.equal(exported.schema,"dream-gacha.novel-export");assert.equal(exported.works,undefined);
});
test("full backup restores new prompt history while old backups remain valid",()=>{
  const revision=p.captureRevision([],input),settings={characters:[],pools:{},presets:[],basePrompt:standard,promptVersions:[revision],basePromptLabel:"試行",basePromptReference:{standardText:standard}};
  const snap=domain.makeSnapshot({prompt:standard,promptRecord:{revision,assembledPrompt:standard}});
  const backup=storage.makeBackup(settings,[{id:"n",body:"本文",snapshot:snap}]);
  const decoded=storage.validateBackup(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(decoded.promptVersions,[revision]);assert.deepEqual(decoded.novels[0].snapshot,snap);
  assert.doesNotThrow(()=>storage.validateSettings({characters:[],pools:{}}));
  for(const promptVersions of ["bad",[{}],[revision,revision]])assert.throws(()=>storage.validateSettings({...settings,promptVersions}));
  assert.throws(()=>storage.validateSettings({...settings,promptVersions:[{...revision,standardVersion:"99.0"}]}));
  assert.throws(()=>storage.validateSettings({...settings,promptVersions:[{...revision,id:"bundled"}]}));
  assert.throws(()=>storage.validateSettings({...settings,basePromptReference:{}}));
});

test("generation AI and model survive export and backup without changing historical snapshots",()=>{
  const novel={id:"ai",body:"本文",generationAi:"独自AI",generationModel:"任意の旧モデル",snapshot:{prompt:"frozen"}};
  const exported=p.novelExport(novel);
  assert.equal(exported.novel.generationAi,novel.generationAi);assert.equal(exported.novel.generationModel,novel.generationModel);
  assert.equal(exported.annotation.text,novel.body);
  assert.equal(p.novelExport({id:"legacy",body:"old"}).novel.generationAi,"");
  const backup=storage.makeBackup({characters:[],pools:{}},[novel]);
  assert.deepEqual(storage.validateBackup(JSON.parse(JSON.stringify(backup))).novels,[novel]);
  for(const key of ["generationAi","generationModel"]){
    const bad=JSON.parse(JSON.stringify(backup));bad.data.novels[0][key]={unexpected:true};
    assert.throws(()=>storage.validateBackup(bad),/文字列/);
  }
});

test("novel export projects only applied card context while preserving the original novel and full backup",()=>{
  const entry=(id,patch={})=>({id,revision:1,title:id,kind:"supplement",body:id,enabled:true,activation:"auto",protagonistMode:"append",worldMode:"modern",scope:{works:[],series:[],characterIds:["c1"],worldModes:[],stageIds:[]},reference:{name:"",version:"",excerpt:""},characterNote:{section:"memo",sourceKind:"interpretation",verification:"unverified"},...patch});
  const stage=entry("office",{kind:"stage",characterNote:undefined,body:"選んだ舞台",scope:{works:[],series:[],characterIds:[],worldModes:[],stageIds:[]}});
  const otherStage={...stage,id:"school",title:"別の舞台",body:"PRIVATE_OTHER_STAGE"};
  const selected=entry("selected",{body:"APPLIED_CARD",activation:"manual",reference:{name:"出典",version:"第1巻",excerpt:"適用する根拠"},scope:{works:[],series:[],characterIds:["c1"],worldModes:[],stageIds:["office","school"]}});
  const entries=[stage,otherStage,selected,entry("disabled",{enabled:false,body:"PRIVATE_DISABLED"}),entry("manual",{activation:"manual",body:"PRIVATE_MANUAL"}),entry("other-character",{body:"PRIVATE_OTHER_CHARACTER",scope:{...selected.scope,characterIds:["c2"]}}),entry("excluded",{body:"PRIVATE_EXCLUDED"}),entry("replacement",{kind:"protagonist",characterNote:undefined,body:"今回の置き換え夢主",protagonistMode:"replace"})];
  const promptContext=context.capture({style:"適用する文章の好み",entries},{stageId:"office",manualIds:["selected"],excludedIds:["excluded"]},{length:"2000",pov:"character"});
  const revision=p.captureRevision([],input),novel={id:"private",body:"小説本文",promptSnapshot:"外部へ渡した完成文",snapshot:domain.makeSnapshot({character:{id:"c1",name:"人物"},worldMode:"modern",protagonistProfile:"元の夢主",prompt:"保存時点の完成文",promptContext,promptRecord:{revision,assembledPrompt:"生成時の完成文"}})};
  const before=JSON.stringify(novel),backupBefore=JSON.stringify(storage.makeBackup({characters:[],pools:{},promptSettings:promptContext.settings},[novel]).data);
  const exported=p.novelExport(novel,"date"),serialized=JSON.stringify(exported);
  assert.equal(exported.version,2);assert.equal(exported.contextScope,"applied-only");assert.equal(exported.novel.snapshot.promptContext,undefined);
  for(const marker of ["PRIVATE_OTHER_STAGE","PRIVATE_DISABLED","PRIVATE_MANUAL","PRIVATE_OTHER_CHARACTER","PRIVATE_EXCLUDED"])assert.equal(serialized.includes(marker),false,marker);
  assert.ok(serialized.includes("APPLIED_CARD"));assert.ok(serialized.includes("適用する根拠"));assert.equal(exported.prompt.text,novel.promptSnapshot);
  assert.deepEqual(exported.prompt.record,novel.snapshot.promptRecord);assert.equal(exported.novel.snapshot.prompt,novel.snapshot.prompt);
  assert.deepEqual(exported.prompt.appliedContext.sections.map(s=>s.id).filter(Boolean),["office","selected"]);
  assert.equal(exported.prompt.appliedContext.protagonistProfile,"今回の置き換え夢主");assert.deepEqual(exported.prompt.appliedContext.output,{length:"2000",pov:"character"});
  assert.deepEqual(exported.prompt.appliedContext.stage,{id:"office",title:"office",revision:1,worldMode:"modern"});
  assert.equal(exported.prompt.appliedContext.settings,undefined);assert.equal(exported.prompt.appliedContext.selection,undefined);
  assert.equal(JSON.stringify(novel),before);assert.equal(JSON.stringify(storage.makeBackup({characters:[],pools:{},promptSettings:promptContext.settings},[novel]).data),backupBefore);
});

test("legacy exports retain v1 context unchanged and failed card resolution never falls back to a library dump",()=>{
  const legacyContext=context.capture({style:"旧文体",entries:[]},context.emptySelection(),context.emptyOutput());
  const old={id:"old",body:"本文",snapshot:{prompt:"完成",promptContext:legacyContext}};
  const exported=p.novelExport(old,"date");assert.equal(exported.version,1);assert.deepEqual(exported.novel.snapshot,old.snapshot);assert.equal(exported.contextScope,undefined);assert.equal(exported.prompt.appliedContext,undefined);
  const card={id:"note",revision:1,title:"n",kind:"supplement",body:"PRIVATE",enabled:false,activation:"manual",protagonistMode:"append",worldMode:"modern",scope:{works:[],series:[],characterIds:["c1"],worldModes:[],stageIds:[]},reference:{name:"",version:"",excerpt:""},characterNote:{section:"memo",sourceKind:"unclassified",verification:"unverified"}};
  const failed={id:"failed",body:"本文",snapshot:{worldMode:"canon",promptContext:context.capture({style:"",entries:[card]},{stageId:"missing",manualIds:[],excludedIds:[]},context.emptyOutput())}};
  const before=JSON.stringify(failed);assert.throws(()=>p.novelExport(failed),/書き出しを中止/);assert.equal(JSON.stringify(failed),before);
  failed.snapshot.promptContext.version=1;assert.throws(()=>p.novelExport(failed),/形式2/);
});
