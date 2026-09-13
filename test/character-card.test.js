"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const C=require("../app-context.js");
const entry=(id,patch={})=>({id,revision:1,title:id,kind:"supplement",body:`内容 ${id}`,enabled:true,activation:"manual",protagonistMode:"append",worldMode:"modern",scope:{works:[],series:[],characterIds:["c1"],worldModes:[],stageIds:[]},reference:{name:"",version:"",excerpt:""},...patch});
const note=(id,patch={})=>entry(id,{characterNote:{section:"voice",sourceKind:"interpretation",verification:"unverified"},...patch});
const settings=entries=>({style:"",entries});
const context={character:{id:"c1",name:"人物",work:"作品"},worldMode:"canon",protagonistProfile:"夢主",workProtagonistProfile:""};
const resolve=(entries,selection={},patch={})=>C.resolve(settings(entries),{...C.emptySelection(),...selection},C.emptyOutput(),{...context,...patch});

test("cards require one character and explicit valid metadata; unknown character IDs are preserved",()=>{
  const valid=note("n");assert.equal(C.validateSettings(settings([valid])).entries[0],valid);
  for(const characterNote of [null,{},"voice",{...valid.characterNote,section:"bad"},{...valid.characterNote,sourceKind:"bad"},{...valid.characterNote,verification:"verified"}]){
    assert.throws(()=>C.validateSettings(settings([{...valid,characterNote}])));
  }
  for(const patch of [{kind:"protagonist"},{kind:"stage"},{scope:{...valid.scope,characterIds:[]}},{scope:{...valid.scope,characterIds:["c1","c2"]}}])assert.throws(()=>C.validateSettings(settings([{...valid,...patch}])));
  const missing=note("missing",{scope:{...valid.scope,characterIds:["removed-character"]}});
  assert.equal(C.validateSettings(settings([missing])).entries[0].scope.characterIds[0],"removed-character");
});

test("legacy capture remains v1; card capture is v2 and freezes metadata without rewriting older records",()=>{
  const legacy=C.capture(settings([entry("old")]),C.emptySelection(),C.emptyOutput());assert.equal(legacy.version,1);
  const before=JSON.stringify(legacy);assert.equal(C.validateSnapshot(legacy),legacy);assert.equal(JSON.stringify(legacy),before);
  const source=settings([note("n")]),snapshot=C.capture(source,C.emptySelection(),C.emptyOutput());
  assert.equal(snapshot.version,2);source.entries[0].characterNote.sourceKind="canon";
  assert.equal(snapshot.settings.entries[0].characterNote.sourceKind,"interpretation");assert.equal(C.validateSnapshot(snapshot),snapshot);
  assert.throws(()=>C.validateSnapshot({...snapshot,version:1}));
  assert.equal(C.capture(C.emptySettings(),C.emptySelection(),C.emptyOutput()).version,1);
});

test("common, original-world and AU notes apply independently, with manual and per-request exclusions",()=>{
  const common=note("common",{activation:"auto"}),canon=note("canon",{activation:"auto",scope:{...common.scope,worldModes:["canon"]},characterNote:{section:"background",sourceKind:"canon",verification:"user_checked"}});
  const stage=entry("office",{kind:"stage",scope:{...common.scope,characterIds:[]},title:"オフィス"});
  const au=note("au",{activation:"auto",scope:{...common.scope,stageIds:["office"]},characterNote:{section:"background",sourceKind:"au",verification:"unverified"}}),manual=note("manual");
  const entries=[common,canon,stage,au,manual],before=JSON.stringify(entries);
  const original=resolve(entries);assert.deepEqual(original.sections.map(e=>e.id),["common","canon"]);
  assert.match(original.sections[0].title,/共通・自分の解釈・話し方・未確認/);assert.match(original.sections[1].title,/原作世界・原作情報・所属・経歴・利用者確認済み/);
  const office=resolve(entries,{stageId:"office"},{worldMode:"modern"});assert.deepEqual(office.sections.map(e=>e.id),["office","common","au"]);assert.match(office.sections[2].title,/舞台：オフィス・AU創作設定/);
  assert.match(office.sections[2].text,/この舞台について明記された点だけを優先/);assert.doesNotMatch(original.sections[0].text,/明記された点だけを優先/);
  assert.deepEqual(resolve(entries,{manualIds:["manual"],excludedIds:["common"]}).sections.map(e=>e.id),["canon","manual"]);
  assert.deepEqual(resolve(entries,{},{character:{id:"c2"}}).sections,[]);
  assert.equal(JSON.stringify(entries),before);
});

function uiApp(entries=[]){
  const elements=new Map();
  function el(){return {value:"",textContent:"",innerHTML:"",hidden:false,checked:false,open:false,selectedOptions:[],options:[],listeners:{},addEventListener(type,fn){this.listeners[type]=fn},focus(){},showModal(){this.open=true},close(){this.open=false},closest(){return null}};}
  const get=id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id);};
  const state={characters:[{id:"c1",name:"<人物>",work:"作品",favorite:false}],promptSettings:settings(entries),promptSelection:C.emptySelection(),promptOutput:C.emptyOutput(),promptContextOverride:null,protagonistProfile:"標準の夢主",worldMode:"canon",values:{},locks:{}};
  const app={state,structuredClone,JSON,Map,Set,Date,Math,Object,window:{confirm:()=>true},document:{querySelector:get,querySelectorAll:()=>[]},$:get,unique:values=>Array.from(new Set(values.filter(Boolean))),esc:value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]),saveCount:0,save(){app.saveCount++;},libraryId:()=>`note-${state.promptSettings.entries.length}`,showToast(){},currentCharacter:()=>state.characters[0],workProtagonistProfileFor:()=>"作品の標準夢主",currentProtagonistSettings:()=>({protagonistProfile:"今回だけの夢主",workProtagonistProfile:"今回の作品夢主"}),DreamGachaContext:C,DreamGachaContextUI:{render(){}}};
  app.globalThis=app;vm.createContext(app);
  const load=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,"..",file),"utf8"),app,{filename:file});
  load("app-character-card-ui.js");
  const click=id=>get(id).listeners.click({target:get(id)});
  const submit=()=>get("#characterNoteEditor").listeners.submit({preventDefault(){}});
  return {app,get,load,click,submit};
}

test("card UI permits unfavorited characters, saves manual free text and references, and rolls back failed saves",()=>{
  const ui=uiApp();ui.app.DreamGachaCharacterCardUI.open("c1");
  assert.equal(ui.get("#characterCardDialog").open,true);assert.equal(ui.get("#characterCardNew").hidden,false);
  ui.click("#characterCardNew");assert.equal(ui.get("#characterNoteActivation").value,"manual");
  ui.get("#characterNoteScope").value="common";ui.get("#characterNoteBody").value="<script>という語彙は使わない\r\n😀";ui.get("#characterNoteReference-name").value="原作";ui.get("#characterNoteReference-version").value="5巻";ui.get("#characterNoteReference-excerpt").value="短い根拠";
  ui.submit();const saved=ui.app.state.promptSettings.entries[0];
  assert.equal(saved.body,ui.get("#characterNoteBody").value);assert.equal(saved.activation,"manual");assert.equal(saved.characterNote.verification,"unverified");assert.deepEqual(Array.from(saved.scope.characterIds),["c1"]);
  assert.equal(saved.reference.excerpt,"短い根拠");assert.doesNotMatch(ui.get("#characterCardNotes").innerHTML,/<script>/);assert.match(ui.get("#characterCardNotes").innerHTML,/&lt;script&gt;/);
  const before=JSON.stringify(ui.app.state.promptSettings);ui.app.save=()=>{throw Error("quota");};ui.get("#characterNoteBody").value="保存できない変更";ui.submit();
  assert.equal(JSON.stringify(ui.app.state.promptSettings),before);assert.equal(ui.get("#characterNoteBody").value,"保存できない変更");assert.match(ui.get("#characterNoteStatus").textContent,/quota/);
});

test("removed character notes remain editable and can be reassigned without changing body or legacy scope",()=>{
  const old=entry("legacy",{scope:{works:["作品"],series:[],characterIds:["removed"],worldModes:["canon","modern"],stageIds:[]},body:"昔からの補足"});
  const ui=uiApp([old]);ui.app.DreamGachaCharacterCardUI.open("removed");assert.equal(ui.get("#characterCardNew").hidden,true);
  ui.get("#characterCardNotes").listeners.click({target:{closest:()=>({dataset:{characterNoteEdit:"legacy"}})}});
  ui.get("#characterNoteScope").value="custom";ui.get("#characterNoteTarget").value="c1";ui.submit();
  const saved=ui.app.state.promptSettings.entries[0];assert.equal(saved.body,old.body);assert.deepEqual(Array.from(saved.scope.works),["作品"]);assert.deepEqual(Array.from(saved.scope.worldModes),["canon","modern"]);assert.deepEqual(Array.from(saved.scope.characterIds),["c1"]);assert.equal(saved.characterNote.sourceKind,"unclassified");assert.equal(saved.revision,2);
});

test("context UI resolves per-request protagonist and generic editor retains card metadata",()=>{
  const original=note("n"),ui=uiApp([original]);ui.load("app-context-ui.js");ui.app.DreamGachaContextUI.init();
  assert.equal(ui.app.DreamGachaContextUI.resolve().protagonist,"今回だけの夢主");assert.equal(ui.app.DreamGachaContextUI.resolve().workProtagonist,"今回の作品夢主");
  ui.get("#contextEntryList").listeners.click({target:{closest:()=>({dataset:{contextEdit:"n"}})}});
  for(const scope of C.SCOPES)ui.get("#contextScope-"+scope).selectedOptions=original.scope[scope].map(value=>({value}));
  ui.get("#contextBody").value="通常の補足編集からの変更";ui.click("#contextEntrySave");
  assert.equal(ui.app.state.promptSettings.entries[0].body,"通常の補足編集からの変更");assert.deepEqual(ui.app.state.promptSettings.entries[0].characterNote,original.characterNote);
});

test("changing stage preserves the selected situation and lock for the user to review",()=>{
  const stage=entry("office",{kind:"stage",worldMode:"modern"}),ui=uiApp([stage]);
  ui.app.state.values={situation:"原作の基地で再会する"};ui.app.state.locks={situation:true};
  ui.app.renderWorldModeControls=()=>{};ui.app.updateCard=()=>{};ui.app.updateLock=()=>{};
  ui.load("app-context-ui.js");ui.app.DreamGachaContextUI.init();
  ui.get("#contextStage").listeners.change({target:{value:"office"}});
  assert.equal(ui.app.state.worldMode,"modern");assert.equal(ui.app.state.promptSelection.stageId,"office");assert.equal(ui.app.state.values.situation,"原作の基地で再会する");assert.equal(ui.app.state.locks.situation,true);
});
