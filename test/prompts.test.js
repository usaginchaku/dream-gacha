const test=require("node:test");
const assert=require("node:assert/strict");
const p=require("../app-prompts.js");
const domain=require("../app-domain.js");
const storage=require("../app-storage.js");
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
