"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {makeApp,run}=require("./helpers/app-harness.js");
const S=require("../app-storage.js");
const C=require("../app-context.js");
const json=(app,code)=>JSON.parse(run(app,`JSON.stringify(${code})`));

function app(){
 const a=makeApp();a.context.confirm=()=>true;
 run(a,`load();state.characters=[normalize({id:'c1',name:'人物',work:'作品'}),normalize({id:'c2',name:'人物2',work:'別作品'})];state.characterId='c1';state.conditionEditMode=true;state.values={relationship:'同僚',situation:'雨宿り',mood:'穏やか',extra:''};state.promptDraftSnapshot=null;state.promptSettings=DreamGachaContext.emptySettings();state.promptSelection=DreamGachaContext.emptySelection();state.promptOutput=DreamGachaContext.emptyOutput();state.protagonistProfile='標準の夢主';state.workProtagonistProfiles={'作品':'標準の作品夢主','別作品':'別作品の標準'};renderPoolEditors();DreamGachaRecipe.init();`);
 a.get("#output").value="";
 // The harness does not parse generated textarea HTML.
 run(a,String.raw`for(const key of DreamGachaData.SNAPSHOT_KEYS)$('#pool-'+key).value=state.pools[key].join('\n');`);
 return a;
}

test("edited conditions save without an old prompt; unedited output rebuilds on copy",async()=>{
 const a=app();assert.equal(run(a,"buildPrompt(false)"),true);
 const old=json(a,"state.promptDraftSnapshot");
 run(a,"state.values.relationship='恋人';state.supportingSituation='終電のあと';globalThis.copied='';copyTextToClipboard=async text=>{copied=text};");
 const current=json(a,"snapshotCurrentConditions()");
 assert.equal(current.relationship,"恋人");assert.equal(current.supportingSituation,"終電のあと");assert.equal(current.prompt,"");assert.equal(current.promptRecord,undefined);
 assert.deepEqual(json(a,"state.promptDraftSnapshot"),old);assert.equal(a.get("#output").value,old.prompt);
 assert.equal(await run(a,"copyPrompt()"),true);assert.match(run(a,"copied"),/【関係性】\n恋人/);assert.match(run(a,"copied"),/【補助シチュ】\n終電のあと/);
 assert.equal(run(a,"DreamGachaRecipe.isCurrent()"),true);
});

test("copy never replaces a stale hand edit; explicit generation asks and preserves on cancel",async()=>{
 const a=app();run(a,"buildPrompt(false);state.values.mood='照れくさい';copyTextToClipboard=async()=>{throw Error('must not copy')};");
 a.get("#output").value="手編集で残したい文章";
 assert.equal(await run(a,"copyPrompt()"),false);assert.equal(a.get("#output").value,"手編集で残したい文章");
 assert.equal(json(a,"snapshotCurrentConditions()").prompt,"");
 a.context.confirm=()=>false;assert.equal(run(a,"buildPrompt()"),false);assert.equal(a.get("#output").value,"手編集で残したい文章");
 a.context.confirm=()=>true;assert.equal(run(a,"buildPrompt()"),true);assert.match(a.get("#output").value,/照れくさい/);
});

test("empty output is generated before copy even when its saved conditions match",async()=>{
 const a=app();run(a,"buildPrompt(false);copyTextToClipboard=async text=>{globalThis.copied=text};");
 a.get("#output").value="";
 assert.equal(await run(a,"copyPrompt()"),true);assert.match(run(a,"copied"),/【キャラ】\n人物/);
});

test("first manual text after applying a condition-only preset gets its own provenance",()=>{
 const a=makeApp();a.context.confirm=()=>true;run(a,"init();globalThis.conditionOnly=DreamGachaRecipe.read();applySnapshot(conditionOnly);");
 a.get("#output").value="条件セットから手書きしたプロンプト";a.get("#output").listeners.input();
 assert.equal(json(a,"snapshotCurrentConditions()").prompt,"条件セットから手書きしたプロンプト");
 assert.equal(typeof json(a,"state.promptDraftSnapshot").promptBaseText,"string");
});

test("clearing a custom base marks output stale and rebuilding uses the bundled default",()=>{
 const a=app();a.get("#basePrompt").value="MY CUSTOM TEMPLATE";run(a,"buildPrompt(false)");
 a.get("#basePrompt").value="";assert.equal(run(a,"DreamGachaRecipe.isCurrent()"),false);
 run(a,"buildPrompt(false)");assert.equal(run(a,"state.promptDraftSnapshot.promptRecord.revision.baseText===DEFAULT_BASE_PROMPT"),true);
});

test("per-request protagonist keeps standard and other-work settings intact, including explicit empty values",()=>{
 const a=app();const original=json(a,"({common:state.protagonistProfile,works:state.workProtagonistProfiles})");
 a.get("#requestProtagonistProfile").value="今回だけの夢主";a.get("#requestWorkProtagonistProfile").value="";a.get("#requestProtagonistProfile").listeners.input();
 assert.deepEqual(json(a,"currentProtagonistSettings()"),{protagonistProfile:"今回だけの夢主",workProtagonistProfile:""});
 assert.deepEqual(json(a,"({common:state.protagonistProfile,works:state.workProtagonistProfiles})"),original);
 run(a,"state.characterId='c2'");assert.equal(run(a,"currentProtagonistSettings().workProtagonistProfile"),"別作品の標準");
 run(a,"state.characterId='c1';save();load();renderPoolEditors()");assert.equal(run(a,"currentProtagonistSettings().workProtagonistProfile"),"");
 run(a,"resetScenario()");assert.equal(run(a,"state.requestProtagonist"),null);assert.equal(a.get("#requestProtagonistProfile").value,run(a,"DEFAULT_PROTAGONIST_PROFILE"));
});

test("updating a reused preset keeps its ID; failed writes leave the prior saved object unchanged",()=>{
 const a=app();a.context.window.prompt=()=>"保存条件";
 run(a,"saveCurrentConditionsPreset()");const id=run(a,"state.presets[0].id");
 run(a,"state.values.relationship='両片想い';DreamGachaRecipe.savePreset(true)");assert.equal(run(a,"state.presets.length"),1);assert.equal(run(a,"state.presets[0].id"),id);assert.equal(run(a,"state.presets[0].snapshot.relationship"),"両片想い");
 const before=json(a,"state.presets");run(a,"state.values.relationship='恋人';save=()=>{throw Error('quota')};DreamGachaRecipe.savePreset(true)");assert.deepEqual(json(a,"state.presets"),before);
});

test("manual conditions retain deliberate blanks and incompatible scenes instead of drawing or clearing them",()=>{
 const a=app();run(a,"state.values={relationship:'',situation:'',mood:'',extra:''};rollOne=()=>{throw Error('unexpected draw')};");
 assert.equal(run(a,"buildPrompt(false)"),true);assert.deepEqual(json(a,"state.values"),{relationship:"",situation:"",mood:"",extra:""});
 const old=a.get("#output").value;
 run(a,"state.values.situation='原作の基地で再会';situationMatchesWorldMode=()=>false;");
 assert.equal(run(a,"buildPrompt(false)"),false);assert.equal(run(a,"state.values.situation"),"原作の基地で再会");assert.equal(a.get("#output").value,old);assert.match(a.get("#recipeError").textContent,/組合せ/);
});

const card={id:"note",revision:1,title:"声",kind:"supplement",body:"大切な解釈",enabled:true,activation:"manual",protagonistMode:"append",worldMode:"modern",scope:{works:[],series:[],characterIds:["b"],worldModes:[],stageIds:[]},reference:{name:"",version:"",excerpt:""},characterNote:{section:"voice",sourceKind:"interpretation",verification:"unverified"}};
function duplicateSettings(){return {version:45,favoriteResetRevision:1,characters:[{id:"a",name:"同名",work:"独自作品"},{id:"b",name:"同名",work:"独自作品"}],pools:{relationship:[],situation:[],mood:[],extra:[]},promptSettings:{style:"",entries:[card]},promptSelection:C.emptySelection(),promptOutput:C.emptyOutput(),presets:[],novels:[]};}

test("fresh load and full restore preserve incoming character IDs referenced by notes",async()=>{
 const source=duplicateSettings(),a=makeApp();a.local.set("dreamGachaSettings",JSON.stringify(source));run(a,"load()");
 assert.deepEqual(json(a,"state.characters.filter(c=>c.work==='独自作品').map(c=>c.id)"),["a","b"]);
 const b=makeApp();run(b,"novelAll=async()=>[];replaceAllNovels=async()=>{};");b.context.payload={schema:"dream-gacha.full-backup",version:4,data:source};
 await run(b,"restoreFullBackup(payload)");assert.deepEqual(json(b,"state.characters.map(c=>c.id)"),["a","b"]);assert.deepEqual(json(b,"state.promptSettings.entries[0]"),card);
 run(b,"state.characters=state.characters.filter(c=>c.id!=='b');DreamGachaRecipe.renderOrphanNotes()");assert.equal(b.get("#orphanCharacterNotes").hidden,false);assert.match(b.get("#orphanCharacterNoteList").innerHTML,/data-character-card="b"/);assert.deepEqual(json(b,"state.promptSettings.entries[0]"),card);
});

test("work replacement resolves same-name characters by exact ID before input order",()=>{
 const a=app();a.context.source=duplicateSettings();run(a,"applySettingsState(prepareSettings(source,true));");
 a.context.incoming={characters:[{id:"b",name:"同名",work:"独自作品",heightText:"180cm",heightCm:180,heightStatus:"verified"},{id:"a",name:"同名",work:"独自作品",heightText:"170cm",heightCm:170,heightStatus:"verified"}]};
 run(a,"importCharactersData(incoming,'work-replace')");
 assert.equal(run(a,"state.characters.find(c=>c.id==='a').heightCm"),170);assert.equal(run(a,"state.characters.find(c=>c.id==='b').heightCm"),180);assert.deepEqual(json(a,"state.promptSettings.entries[0]"),card);
 // An earlier item without a known ID must not consume a later explicit match.
 const b=app();b.context.source=duplicateSettings();run(b,"applySettingsState(prepareSettings(source,true));");
 b.context.incoming={characters:[{id:"new",name:"同名",work:"独自作品",heightText:"180cm",heightCm:180,heightStatus:"verified"},{id:"a",name:"同名",work:"独自作品",heightText:"170cm",heightCm:170,heightStatus:"verified"}]};
 run(b,"importCharactersData(incoming,'work-replace')");assert.equal(run(b,"state.characters.find(c=>c.id==='a').heightCm"),170);assert.equal(run(b,"state.characters.find(c=>c.id==='b').heightCm"),180);
});

test("new recipe settings round-trip in backup v4; malformed fields are rejected on local load as well",()=>{
 const source={...duplicateSettings(),requestProtagonist:{work:"独自作品",protagonistProfile:"",workProtagonistProfile:"今回"},supportingSituation:"帰り道",conditionEditMode:true,editingPresetId:"set-1"};
 const backup=S.makeBackup(source,[]),restored=S.validateBackup(backup);assert.equal(backup.version,4);
 for(const key of ["requestProtagonist","supportingSituation","conditionEditMode","editingPresetId"])assert.deepEqual(restored[key],source[key]);
 for(const patch of [{requestProtagonist:"wrong"},{requestProtagonist:{work:"W"}},{supportingSituation:[]},{conditionEditMode:"true"},{editingPresetId:1}])assert.throws(()=>S.decodeSettings({...source,...patch},{},false));
});

test("failed prompt persistence restores the previous completed text and its snapshot",()=>{
 const a=app();run(a,"buildPrompt(false)");const old=json(a,"state.promptDraftSnapshot"),text=a.get("#output").value;
 run(a,"state.values.relationship='新しい条件';save=()=>{throw Error('quota')};");assert.equal(run(a,"buildPrompt(false)"),false);assert.deepEqual(json(a,"state.promptDraftSnapshot"),old);assert.equal(a.get("#output").value,text);
});
