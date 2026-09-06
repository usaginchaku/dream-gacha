"use strict";

// Lightweight integration coverage for the classic, file://-compatible bundle.
// This deliberately executes the real app functions (with browser storage/UI mocked).
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const root=path.resolve(__dirname,"..");

function element(){return {value:"",checked:false,textContent:"",innerHTML:"",hidden:false,open:false,style:{},dataset:{},listeners:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},scrollIntoView(){},focus(){},select(){},appendChild(){},addEventListener(type,fn){this.listeners[type]=fn},querySelector(){return null},querySelectorAll(){return []}}}
function makeApp(){
 const elements=new Map();
 const get=s=>{if(!elements.has(s))elements.set(s,element());return elements.get(s)};
 const tabs=["gacha","library","manager","help"].map(screen=>{const item=element();item.dataset.screen=screen;return item});
 const local=new Map();
 const context={console,structuredClone,Set,Map,Date,Math,JSON,Intl,AggregateError,
   document:{querySelector:get,querySelectorAll:s=>s===".tab-btn"?tabs:[],createElement:()=>element(),addEventListener(){},documentElement:{dataset:{},removeAttribute(name){delete this.dataset[name]}},body:{style:{}},execCommand(){}},
   window:{prompt:()=>null,matchMedia:()=>({matches:false})},navigator:{clipboard:{writeText:async()=>{}}},
   localStorage:{getItem:k=>local.has(k)?local.get(k):null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)},
   indexedDB:{open(){throw new Error("IndexedDB mock must be replaced by test")}},CSS:{escape:x=>x},Blob:function(){},URL:{createObjectURL:()=>"blob:x",revokeObjectURL(){}},setTimeout:(fn)=>{fn();return 1},clearTimeout(){}};
 context.globalThis=context;
 vm.createContext(context);
 for(const file of ["app-data.js","app-domain.js","app-storage.js","app-ui.js","character-data.generated.js","seed-data.js"])
   vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
 let app=fs.readFileSync(path.join(root,"app.js"),"utf8");
 app=app.replace(/\ninit\(\);\s*$/,"\n// init stripped for controlled integration tests\n");
 vm.runInContext(app,context,{filename:"app.js"});
 return {context,elements,local,get,tabs};
}
function run(app,code){return vm.runInContext(code,app.context)}

async function main(){
 const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
 const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
 const styleSource=fs.readFileSync(path.join(root,"styles.css"),"utf8");
 const src=[...index.matchAll(/<script src="([^"]+)"><\/script>/g)].map(x=>x[1]);
 assert.deepEqual(src.slice(0,4),["app-data.js?v=34","app-domain.js?v=34","app-storage.js?v=34","app-ui.js?v=34"]);
 assert.match(src[4],/^character-data\.generated\.js\?v=[a-f0-9]{12}$/);
 assert.deepEqual(src.slice(5),["seed-data.js?v=34","app.js?v=34"]);
 assert.ok(index.includes('href="styles.css?v=34"'));
 assert.equal(index.includes("お嬢様"),false);
 assert.equal(index.includes("data-mobile-category-mode"),false);
 assert.equal(index.includes('id="characterPicker"'),false);
 for(const id of ["lockAllResults","unlockAllResults","resetAllCategoryRules"])assert.ok(index.includes(`id="${id}"`));
 for(const id of ["gachaHeightDetails","manageHeightDetails","candidateSelectionSummary","clearCandidateRules"])assert.ok(index.includes(`id="${id}"`));
 for(const id of ["gachaFilterDetails","filterSummaryMeta","themeMode","gachaWorkChips","gachaSeriesChips","manageWorkChips","manageSeriesChips","importReplaceAllButton","backupRestoreStatus"])assert.ok(index.includes(`id="${id}"`));
 assert.ok(index.indexOf('id="rollAll"')>index.indexOf('id="gachaFilterDetails"')&&index.indexOf('id="rollAll"')<index.indexOf('id="resultGrid"'),"all-roll action must appear between filters and results");
 assert.doesNotMatch(index,/<details class="filter-box filter-disclosure" id="gachaFilterDetails"\s+open/);
 assert.doesNotMatch(index,/<select id="importMode"[^>]*>[\s\S]*?<option value="replace"/);
 assert.match(appSource,/result-quick-actions/);assert.match(appSource,/result-detail/);
 assert.match(styleSource,/:root\[data-theme="dark"\]/);assert.match(styleSource,/\.value\{[^}]*white-space:normal[^}]*overflow-wrap:anywhere/);
 assert.match(styleSource,/:root\[data-theme="dark"\] \.tabs\{background:transparent\}/);
 assert.match(styleSource,/:root\[data-theme="dark"\] \.help-hero\{background:linear-gradient\(135deg,var\(--surface-accent\)/);
 assert.match(styleSource,/\.work-profile-editor\)\{background:var\(--surface-soft\)/);
 assert.match(styleSource,/:root\[data-theme="dark"\] \.help-detail-card\{background:linear-gradient\(135deg,var\(--surface\),var\(--surface-accent\)\)/);
 assert.match(styleSource,/:root\[data-theme="dark"\] \.faq-list details\[open\]\{background:var\(--surface-soft\)/);
 assert.match(styleSource,/\.backup-box,.inline-editor\)\{background:linear-gradient\(135deg,var\(--surface-soft\),var\(--surface-accent\)\)/);
 assert.match(index,/<details class="candidate-selector" id="candidatePreviewBox">/);
 for(const id of ["worldModeOptions","worldModeSummary","workProfileWork","workProtagonistProfile","resetWorkProfile"])assert.ok(index.includes(`id="${id}"`));
 for(const id of ["tab-help","screen-help","help-basic","help-details","help-character-json","characterResearchWork","characterResearchPromptPreview","allowedTagGuide","help-faq"])assert.ok(index.includes(`id="${id}"`));
 for(const phrase of ["好きなキャラ","アーカイブしたキャラは消えますか？","完全バックアップ","data-go-screen=\"manager\""])assert.ok(index.includes(phrase));
 assert.match(index,/role="tab" aria-controls="screen-help" aria-selected="false"/);

 const a=makeApp();
 // The bundled writing prompt asks for a title, while the concrete protagonist
 // profile lives only in the separate profile setting.
 assert.equal(run(a,"DEFAULT_BASE_PROMPT.includes('## タイトル')"),true);
 assert.equal(run(a,"DEFAULT_BASE_PROMPT.includes('## 人体・姿勢・接触の整合性')"),true);
 assert.equal(run(a,"DEFAULT_BASE_PROMPT.includes('各人物の左右の手')"),true);
 assert.equal(run(a,"DEFAULT_BASE_PROMPT.includes('夢主は160cmです。')"),false);
 assert.equal(run(a,"DEFAULT_PROTAGONIST_PROFILE.includes('身長160cm')"),true);
 assert.equal(run(a,"DEFAULT_PROTAGONIST_PROFILE.includes('〜かしら？')"),true);
 assert.equal(run(a,"Object.keys(DEFAULT_WORK_PROTAGONIST_PROFILES).length"),14);
 assert.equal(run(a,"situationMatchesWorldMode('満員電車で離れないよう庇われる','canon')"),false);
 assert.equal(run(a,"situationMatchesWorldMode('満員電車で離れないよう庇われる','modern')"),true);
 assert.equal(run(a,"situationMatchesWorldMode('放課後の教室で二人きりになる','school')"),true);
 assert.equal(run(a,"situationMatchesWorldMode('雨宿りをしている','canon')"),true);
 run(a,"state.pools.situation=['満員電車で離れないよう庇われる','雨宿りをしている','放課後の教室で二人きりになる']");
 assert.deepStrictEqual(JSON.parse(JSON.stringify(run(a,"state.worldMode='canon';worldEligiblePool('situation')"))),["雨宿りをしている"]);
 assert.deepStrictEqual(JSON.parse(JSON.stringify(run(a,"state.worldMode='modern';worldEligiblePool('situation')"))),["満員電車で離れないよう庇われる","雨宿りをしている"]);
 assert.deepStrictEqual(JSON.parse(JSON.stringify(run(a,"state.worldMode='school';worldEligiblePool('situation')"))),["雨宿りをしている","放課後の教室で二人きりになる"]);
 assert.equal(run(a,"state.workProtagonistProfiles={};workProtagonistProfileFor('原神')===DEFAULT_WORK_PROTAGONIST_PROFILES['原神']"),true);
 assert.equal(run(a,"state.workProtagonistProfiles={'原神':''};workProtagonistProfileFor('原神')"),"");

 // Full startup reaches tab listener registration; a startup error would make
 // Library and Character Manager appear but leave them unclickable.
 run(a,"init()");
 assert.equal(typeof a.tabs[1].listeners.click,"function");
 assert.equal(typeof a.tabs[2].listeners.click,"function");
 run(a,'setTheme("dark")');assert.equal(a.context.document.documentElement.dataset.theme,"dark");assert.equal(JSON.parse(a.local.get("dreamGachaSettings")).themeMode,"dark");
 run(a,'setTheme("system")');assert.equal(a.context.document.documentElement.dataset.theme,"light");
 const brokenStartup=makeApp();
 run(brokenStartup,"load=()=>{throw new Error('broken saved data')};try{init()}catch(error){} ");
 assert.equal(typeof brokenStartup.tabs[1].listeners.click,"function");
 assert.equal(typeof brokenStartup.tabs[2].listeners.click,"function");
 // The character research guide and copied prompt share the live tag vocabulary.
 a.get("#characterResearchWork").value="架空の作品";
 run(a,"renderCharacterImportGuide()");
 assert.match(a.get("#characterResearchPromptPreview").value,/「架空の作品」に登場する男性キャラクター/);
 assert.match(a.get("#characterResearchPromptPreview").value,/heightSource/);
 assert.equal(run(a,"TAG_GROUP_ORDER.every(k=>CANONICAL_TAGS[k].every(t=>document.querySelector('#allowedTagGuide').innerHTML.includes(t)))"),true);
 const exported=run(a,"exportCharacterPayload([{id:'1',name:'A',work:'W',series:'S',tags:['冷静'],archived:false,favorite:false,heightText:'180cm',heightCm:180,heightStatus:'verified',heightSource:'公式資料'}]).characters[0]");
 assert.equal(exported.heightStatus,"verified");assert.equal(exported.heightSource,"公式資料");
 const previousDefault=run(a,"DEFAULT_BASE_PROMPT.replace('## 身長差・体格差\\n\\n','## 身長差・体格差\\n\\n夢主は160cmです。\\n\\n')");
 a.context.__previousDefault=previousDefault;
 assert.equal(run(a,"prepareSettings({version:22,characters:[],pools:{},basePrompt:__previousDefault},false).basePrompt===DEFAULT_BASE_PROMPT"),true);
 a.context.__legacyProfile=run(a,"LEGACY_PROTAGONIST_PROFILES[0]");
 assert.equal(run(a,"prepareSettings({version:29,characters:[],pools:{},protagonistProfile:__legacyProfile},false).protagonistProfile===DEFAULT_PROTAGONIST_PROFILE"),true);
 const oldCustomPrompt="custom\n\n## 恋愛描写\ntext";a.context.__oldCustomPrompt=oldCustomPrompt;
 assert.equal(run(a,"prepareSettings({version:33,characters:[],pools:{},basePrompt:__oldCustomPrompt},false).basePrompt.includes('## 人体・姿勢・接触の整合性')"),true);

 // Every category exposes separate, unambiguous include and exclude actions.
 run(a,"chooserKey='relationship';state.pools.relationship=DEFAULT_POOLS.relationship;renderChooserCategoryChips()");
 assert.match(a.get("#choiceCategoryChips").innerHTML,/data-category-include=/);
 assert.match(a.get("#choiceCategoryChips").innerHTML,/data-category-exclude=/);
 assert.match(a.get("#choiceCategoryChips").innerHTML,/aria-pressed=/);
 const firstCategory=run(a,"categoryOrderFor('relationship')[0]");
 a.context.__firstCategory=firstCategory;
 run(a,"state.categoryInclude.relationship=__firstCategory;renderChooserCategoryChips()");
 assert.match(a.get("#choiceCategorySummary").textContent,/だけを表示/);
 assert.equal(a.get("#choiceCategoryClear").disabled,false);

 // Candidate chips support a multi-character allow list and a separate block list.
 a.get("#candidatePreviewBox").open=true;
 run(a,"state.characters=[normalize({id:'c1',name:'A',work:'W',tags:[]}),normalize({id:'c2',name:'B',work:'W',tags:[]})];state.filters={search:'',workIncluded:new Set(),workExcluded:new Set(),seriesIncluded:new Set(),seriesExcluded:new Set(),tags:new Set(),tagMode:'all',favorite:'all',minHeight:null,maxHeight:null,characterIncluded:new Set(),characterExcluded:new Set()};state.categoryInclude.character=null;state.categoryExcluded.character.clear();save=()=>{};renderCandidatePreview()");
 assert.match(a.get("#candidatePreview").innerHTML,/data-toggle-candidate="c1"/);
 assert.match(a.get("#candidatePreview").innerHTML,/data-exclude-candidate="c2"/);
 run(a,"toggleCandidateIncluded('c1')");
 assert.deepStrictEqual(JSON.parse(JSON.stringify(run(a,"filteredCharacters().map(c=>c.id)"))),["c1"]);
 run(a,"toggleCandidateExcluded('c2')");
 assert.equal(run(a,"state.filters.characterExcluded.has('c2')"),true);
 run(a,"clearCandidateRules()");
 assert.equal(run(a,"state.filters.characterIncluded.size+state.filters.characterExcluded.size"),0);
 a.get("#candidatePreviewBox").open=false;run(a,"renderCandidatePreview()");assert.equal(a.get("#candidatePreview").innerHTML,"");

 // Work and series facets combine multiple inclusions with exclusions.
 const facet=makeApp();
 run(facet,`state.characters=[normalize({id:"a",name:"A",work:"W1",series:"S1",tags:[]}),normalize({id:"b",name:"B",work:"W2",series:"S1",tags:[]}),normalize({id:"c",name:"C",work:"W3",series:"S2",tags:[]})];state.filters={search:"",workIncluded:new Set(["W1","W2"]),workExcluded:new Set(["W2"]),seriesIncluded:new Set(),seriesExcluded:new Set(["S2"]),tags:new Set(),tagMode:"all",favorite:"all",minHeight:null,maxHeight:null,characterIncluded:new Set(),characterExcluded:new Set()};`);
 assert.deepStrictEqual(JSON.parse(JSON.stringify(run(facet,"filteredCharacters().map(c=>c.id)"))),["a"]);
 run(facet,"renderGachaFilters=()=>{};renderManager=()=>{};save=()=>{};toggleFacet('work','W3','include')");
 assert.equal(run(facet,"state.filters.workIncluded.has('W3')"),true);
 run(facet,"toggleFacet('work','W3','exclude')");
 assert.equal(run(facet,"state.filters.workIncluded.has('W3')"),false);
 assert.equal(run(facet,"state.filters.workExcluded.has('W3')"),true);

 // A work-level replacement preserves other works and local user state.
 const workImport=makeApp();
 run(workImport,`state.characters=[normalize({id:"old-a",name:"A",work:"W",series:"old",tags:[],favorite:true,archived:true,heightText:"181cm（手動）",heightCm:181,heightStatus:"manual",heightSource:"手動"}),normalize({id:"old-b",name:"B",work:"W",tags:[]}),normalize({id:"other",name:"C",work:"Other",tags:[]})];state.filters={search:"",workIncluded:new Set(),workExcluded:new Set(),seriesIncluded:new Set(),seriesExcluded:new Set(),tags:new Set(),tagMode:"all",favorite:"all",minHeight:null,maxHeight:null,characterIncluded:new Set(),characterExcluded:new Set()};save=()=>{};renderManager=()=>{};renderGachaFilters=()=>{};updateCard=()=>{};`);
 const workResult=JSON.parse(JSON.stringify(run(workImport,`importCharactersData({characters:[{name:"A",work:"W",series:"new",tags:[],favorite:false,archived:false,heightText:"不明",heightCm:null,heightStatus:"unknown",heightSource:""},{name:"D",work:"W",tags:[]}]},"work-replace")`)));
 assert.deepEqual(workResult,{added:1,updated:1,removed:1,total:2,work:"W"});
 assert.equal(run(workImport,"state.characters.some(c=>c.id==='other')"),true);
 assert.equal(run(workImport,"state.characters.find(c=>c.name==='A').id"),"old-a");
 assert.equal(run(workImport,"state.characters.find(c=>c.name==='A').favorite&&state.characters.find(c=>c.name==='A').archived"),true);
 assert.equal(run(workImport,"state.characters.find(c=>c.name==='A').heightCm"),181);
 assert.throws(()=>run(workImport,`importCharactersData({characters:[{name:"X",work:"W",tags:[]},{name:"Y",work:"",tags:[]}]},"work-replace")`),/同じ作品名/);
 const workPlan=JSON.parse(JSON.stringify(run(workImport,`analyzeWorkReplacement(dedupeImported([{name:"A",work:"W",series:"new",tags:[]},{name:"E",work:"W",tags:[]}]))`)));
 assert.deepEqual({current:workPlan.current,total:workPlan.total,added:workPlan.added,updated:workPlan.updated,removed:workPlan.removed},{current:2,total:2,added:1,updated:1,removed:1});

 // Result cards support bulk lock/unlock and a separate category-rule reset.
 run(a,"save=()=>{globalThis.__bulkSaved=(globalThis.__bulkSaved||0)+1};showToast=()=>{};setAllLocks(true)");
 assert.equal(run(a,"DreamGachaData.CARD_KEYS.every(k=>state.locks[k])"),true);
 run(a,"setAllLocks(false)");
 assert.equal(run(a,"DreamGachaData.CARD_KEYS.some(k=>state.locks[k])"),false);
 run(a,"renderGachaFilters=()=>{};renderManager=()=>{};chooserKey=null;state.categoryInclude.relationship='恋愛';state.categoryExcluded.situation.add('夜・家');resetAllCategoryRules()");
 assert.equal(run(a,"DreamGachaData.CARD_KEYS.some(k=>state.categoryInclude[k]||state.categoryExcluded[k].size)"),false);
 assert.equal(run(a,"__bulkSaved"),3);

 // Manual prompt is retained while a snapshot is saved, and becomes its saved prompt.
 run(a,`state.characters=[{id:"c1",name:"A",work:"W",series:"S",tags:[],archived:false}];state.characterId="c1";state.values={relationship:"R",situation:"T",mood:"M",extra:"E"};syncScenario=()=>{};`);
 a.get("#output").value="MANUALLY EDITED";
 a.get("#protagonistProfile").value="JUST EDITED PROFILE";
 const snap=run(a,"snapshotCurrentConditions()");
 assert.equal(a.get("#output").value,"MANUALLY EDITED");
 assert.equal(snap.prompt,"MANUALLY EDITED");
 assert.equal(snap.protagonistProfile,"JUST EDITED PROFILE");

 // Applying an empty/missing snapshot must not retain any prior roll.
 run(a,`updateCard=()=>{};renderGachaFilters=()=>{};switchScreen=()=>{};showToast=()=>{};save=()=>{};state.characterId="c1";state.values={relationship:"old",situation:"old",mood:"old",extra:"old"};applySnapshot({character:null,relationship:"",situation:"",mood:"",extra:"",freeExtra:"",protagonistProfile:"P",prompt:""});`);
 assert.equal(run(a,"state.characterId"),null);
 assert.deepStrictEqual(JSON.parse(JSON.stringify(run(a,"state.values"))),{relationship:"",situation:"",mood:"",extra:""});

 // The prompt stays in the snapshot, never in the memo, and the display title
 // appends the same character and situation summary used by the old auto-title.
 run(a,`syncScenario=()=>{};novelPut=async n=>{globalThis.__savedNovel=n};refreshNovelCache=async()=>[];renderNovelList=()=>{};showToast=()=>{};novelDraftSnapshot={character:{name:"A"},situation:"T",prompt:"MANUALLY EDITED"};`);
 a.get("#output").value="MANUALLY EDITED";
 a.get("#novelBody").value="body"; a.get("#novelTitle").value="AI TITLE"; a.get("#novelMemo").value="MANUALLY EDITED"; a.get("#novelFavorite").checked=false;
 await run(a,"saveNovelArchive()");
 assert.equal(run(a,"__savedNovel.snapshot.prompt"),"MANUALLY EDITED");
 assert.equal(run(a,"__savedNovel.memo"),"");
 assert.equal(run(a,"novelDisplayTitle(__savedNovel)"),"AI TITLE（A｜T）");
 assert.equal(run(a,"__savedNovel.charCount"),4);

 // Export does not download or claim success when IndexedDB cannot be read.
 const b=makeApp(); let alerts=[];
 b.context.alert=x=>alerts.push(x);
 run(b,"syncScenario=()=>{};novelAll=async()=>{throw Error('db offline')};downloadJson=()=>{globalThis.__downloaded=true};showToast=()=>{globalThis.__toast=true};");
 await run(b,"exportFullBackup()");
 assert.equal(run(b,"globalThis.__downloaded"),undefined);
 assert.equal(run(b,"globalThis.__toast"),undefined);
 assert.match(alerts[0],/書き出せませんでした/);

 // Invalid input is rejected before either store is read or state is changed.
 const c=makeApp();
 run(c,"state.characters=[{id:'before',name:'Before',tags:[],archived:false}];novelAll=async()=>{globalThis.__read=true;return []};");
 await assert.rejects(()=>run(c,"restoreFullBackup({schema:'dream-gacha.full-backup',version:2,data:{characters:[{id:'x'},{id:'x'}],pools:{},presets:[],novels:[]}})"));
 assert.equal(run(c,"globalThis.__read"),undefined);
 assert.equal(run(c,"state.characters[0].id"),"before");

 // A v1 backup without novels preserves the existing archive through real restore wiring.
 const legacy=JSON.parse(fs.readFileSync(path.join(root,"old","dream-gacha-full-backup-20260905.json"),"utf8"));
 const d=makeApp();
 run(d,"novelAll=async()=>[{id:'keep',body:'old'}];replaceAllNovels=async xs=>{globalThis.__novels=xs};renderPoolEditors=()=>{};renderGachaFilters=()=>{};renderManager=()=>{};renderLibrary=async()=>{};updateCard=()=>{};updateCategoryStatus=()=>{};updateLock=()=>{};showToast=()=>{};");
 await run(d,`restoreFullBackup(${JSON.stringify(legacy)})`);
 assert.equal(run(d,"__novels[0].id"),"keep");

 // A valid partial pool payload is hydrated before commit and before UI code reads pool lengths.
 const f=makeApp();
 run(f,"novelAll=async()=>[];replaceAllNovels=async()=>{};renderGachaFilters=()=>{};renderManager=()=>{};renderLibrary=async()=>{};updateCard=()=>{};updateCategoryStatus=()=>{};updateLock=()=>{};showToast=()=>{};");
 const partial={schema:"dream-gacha.full-backup",version:2,data:{characters:[{id:"partial",name:"Partial"}],pools:{relationship:["only relation"]},presets:[],novels:[]}};
 await run(f,`restoreFullBackup(${JSON.stringify(partial)})`);
 assert.ok(run(f,"Array.isArray(state.pools.situation)"),"missing pool must be hydrated for UI");
 const persisted=JSON.parse(f.local.get("dreamGachaSettings"));
 assert.deepStrictEqual(JSON.parse(JSON.stringify(run(f,"state.pools"))),persisted.pools,"committed settings and runtime state must use the same hydrated pools");

 // A failed favorite write leaves the cache untouched; a successful commit updates it.
 run(f,"novelCache=[{id:'fav',title:'Favorite',body:'body',favorite:false,snapshot:{}}];renderNovelList=()=>{};novelPut=async()=>{throw Error('write failed')};");
 await assert.rejects(()=>run(f,"toggleNovelFavorite('fav')"),/write failed/);
 assert.equal(run(f,"novelCache[0].favorite"),false);
 run(f,"novelPut=async()=>{};");
 await run(f,"toggleNovelFavorite('fav')");
 assert.equal(run(f,"novelCache[0].favorite"),true);

 // Once both stores commit, restore renders from the committed payload rather
 // than performing a second archive read that could fail transiently.
 const g=makeApp();
 const restoredNovel={id:"restored",title:"Restored",body:"new body",createdAt:"2026-09-06T01:00:00.000Z",snapshot:{}};
 run(g,`globalThis.__reads=0;novelAll=async()=>{globalThis.__reads++;if(globalThis.__reads>1)throw Error("transient read failure");return [{id:"old",body:"old"}]};replaceAllNovels=async xs=>{globalThis.__written=xs};renderGachaFilters=()=>{};renderManager=()=>{};updateCard=()=>{};updateCategoryStatus=()=>{};updateLock=()=>{};showToast=()=>{};`);
 const committed={schema:"dream-gacha.full-backup",version:2,appVersion:22,data:{characters:[],pools:{relationship:[],situation:[],mood:[],extra:[]},presets:[],novels:[restoredNovel]}};
 const restoreCounts=JSON.parse(JSON.stringify(await run(g,`restoreFullBackup(${JSON.stringify(committed)})`)));
 assert.equal(run(g,"__reads"),1);
 assert.equal(run(g,"novelCache[0].id"),"restored");
 assert.match(g.get("#novelList").innerHTML,/Restored/);
 assert.equal(restoreCounts.before.novels,1);assert.equal(restoreCounts.after.novels,1);
 assert.equal(typeof restoreCounts.before.favorites,"number");assert.equal(typeof restoreCounts.before.archived,"number");
 assert.match(g.get("#backupRestoreStatus").textContent,/お気に入り\d+件・アーカイブ\d+件/);
 assert.match(g.get("#backupRestoreStatus").textContent,/復元前/);assert.match(g.get("#backupRestoreStatus").textContent,/復元後/);

 // Corrupt existing settings do not block a valid backup, and an interrupted
 // two-store restore puts the exact original text back.
 const h=makeApp();
 h.local.set("dreamGachaSettings","{malformed old json");
 run(h,"novelAll=async()=>[];replaceAllNovels=async()=>{};renderGachaFilters=()=>{};renderManager=()=>{};updateCard=()=>{};updateCategoryStatus=()=>{};updateLock=()=>{};showToast=()=>{};");
 await run(h,`restoreFullBackup(${JSON.stringify(committed)})`);
 assert.doesNotThrow(()=>JSON.parse(h.local.get("dreamGachaSettings")));

 const i=makeApp();
 const malformed="{exact malformed text";i.local.set("dreamGachaSettings",malformed);
 run(i,"globalThis.__writes=0;novelAll=async()=>[{id:'old',body:'old'}];replaceAllNovels=async()=>{globalThis.__writes++;if(globalThis.__writes===1)throw Error('archive commit failed')};renderGachaFilters=()=>{};renderManager=()=>{};updateCard=()=>{};updateCategoryStatus=()=>{};updateLock=()=>{};showToast=()=>{};");
 await assert.rejects(()=>run(i,`restoreFullBackup(${JSON.stringify(committed)})`),/archive commit failed/);
 assert.equal(i.local.get("dreamGachaSettings"),malformed);
 assert.match(i.get("#backupRestoreStatus").textContent,/IndexedDBの復元/);
 assert.match(i.get("#backupRestoreStatus").textContent,/夢小説アーカイブの書き込み/);

 // A localStorage failure is reported as the settings stage even after rollback attempts.
 const localFailure=makeApp();
 run(localFailure,"novelAll=async()=>[];replaceAllNovels=async()=>{};localStorage.setItem=()=>{throw Error('storage denied')};renderGachaFilters=()=>{};renderManager=()=>{};updateCard=()=>{};updateCategoryStatus=()=>{};updateLock=()=>{};showToast=()=>{};");
 await assert.rejects(()=>run(localFailure,`restoreFullBackup(${JSON.stringify(committed)})`),/localStorage系の復元/);
 assert.match(localFailure.get("#backupRestoreStatus").textContent,/ブラウザ設定の書き込み/);

 // Cached search filters the in-memory cache and never opens IndexedDB.
 const e=makeApp();
 run(e,"novelCache=[{id:'n',title:'x',body:'needle in full body',snapshot:{}}];openArchiveDB=async()=>{throw Error('unexpected DB read')};");
 e.get("#novelSearch").value="needle";
 await run(e,"renderNovelList()");
 assert.match(e.get("#novelList").innerHTML,/needle/);

 console.log("integration tests passed");
}
main().catch(error=>{console.error(error);process.exitCode=1});
