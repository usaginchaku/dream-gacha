const test=require("node:test");
const assert=require("node:assert/strict");
const domain=require("../app-domain.js");

test("prompt formatting is pure and includes world and protagonist layers",()=>{
  const input={basePrompt:"BASE",character:{name:"A",work:"W",series:"S",heightText:"180cm"},relationship:"恋人",situation:"雨",mood:"甘い",extra:"夜",protagonistProfile:"共通設定",workProtagonistProfile:"作品設定",worldModeLabel:"原作準拠",worldModePrompt:"原作世界を使う",freeExtra:"今回だけ"};
  const before=JSON.stringify(input),out=domain.formatPrompt(input);
  assert.equal(JSON.stringify(input),before);assert.match(out,/【キャラ】\nA/);assert.match(out,/【世界観モード】\n原作準拠：原作世界を使う/);assert.match(out,/【夢主設定】\n共通設定/);assert.match(out,/【作品別の夢主設定：W】\n作品設定/);assert.match(out,/【自由な追加指定】\n今回だけ/);
});

test("snapshot preserves edited prompt and copies character tags",()=>{
  const source={character:{id:"1",name:"A",work:"W",tags:["x"]},prompt:"手編集した文",relationship:"",workProtagonistProfile:"作品設定",worldMode:"school"};
  const snap=domain.makeSnapshot(source,"2026-01-01T00:00:00Z");source.character.tags.push("y");
  assert.equal(snap.prompt,"手編集した文");assert.deepEqual(snap.character.tags,["x"]);assert.equal(snap.workProtagonistProfile,"作品設定");assert.equal(snap.worldMode,"school");
});

test("snapshot application clears empty values and refuses archived exact character",()=>{
  const characters=[{id:"same",name:"A",work:"W",archived:true},{id:"other",name:"A",work:"W",archived:false}];
  const out=domain.resolveSnapshot({character:{id:"same",name:"A",work:"W"},relationship:"",protagonistProfile:""},characters,"default");
  assert.equal(out.characterId,null);assert.equal(out.relationship,"");assert.equal(out.protagonistProfile,"");assert.equal(out.missingCharacter,true);
});

test("novel filtering searches full text while preview is bounded and normalized",()=>{
  const items=[{id:"1",body:"a\n\n hidden-keyword",title:"t",snapshot:{}}];
  assert.equal(domain.filterNovels(items,"hidden-keyword",false).length,1);
  assert.equal(domain.preview(" a\n\n b c ",5),"a b c");assert.equal(domain.preview("0123456789",5),"01234…");
});
