const state={
 characters:[], pools:structuredClone(DEFAULT_POOLS), values:{}, characterId:null,
 locks:{character:false,relationship:false,situation:false,mood:false,extra:false},
 basePrompt:DEFAULT_BASE_PROMPT, deletedSeedIds:new Set(), selectedIds:new Set(), editingCharacterId:null, inlineEditingId:null,
 filters:{search:"",workIncluded:new Set(),workExcluded:new Set(),seriesIncluded:new Set(),seriesExcluded:new Set(),tags:new Set(),tagMode:"all",favorite:"all",minHeight:null,maxHeight:null,characterIncluded:new Set(),characterExcluded:new Set()},
 filterEditMode:{work:"include",series:"include"},
 manage:{status:"all",sort:"work"},
 categoryInclude:{character:null,relationship:null,situation:null,mood:null,extra:null},
 categoryExcluded:{character:new Set(),relationship:new Set(),situation:new Set(),mood:new Set(),extra:new Set()},
  presets:[], protagonistProfile:DEFAULT_PROTAGONIST_PROFILE, workProtagonistProfiles:{}, worldMode:DEFAULT_WORLD_MODE, themeMode:"system", promptDraftSnapshot:null
};
const $=s=>document.querySelector(s);
const unique=a=>[...new Set(a.filter(Boolean))].sort((x,y)=>x.localeCompare(y,"ja"));
const canonicalizeTags=a=>unique(a.map(v=>String(v||"").trim()).filter(Boolean).map(t=>Object.prototype.hasOwnProperty.call(TAG_ALIAS_MAP,t)?TAG_ALIAS_MAP[t]:t).filter(t=>t&&CANONICAL_TAG_SET.has(t)));
const parseLines=t=>t.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
const parseTags=t=>canonicalizeTags(t.split(/[,、，]/));
const makeId=()=> "char-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));


const HEIGHT_SLIDER_FALLBACK_MIN=100,HEIGHT_SLIDER_FALLBACK_MAX=260;
function getRegisteredActiveHeights(){
 return state.characters
   .filter(c=>!c.archived&&Number.isFinite(c.heightCm))
   .map(c=>c.heightCm);
}
function getHeightSliderMin(){
 const heights=getRegisteredActiveHeights();
 return heights.length?Math.floor(Math.min(...heights)):HEIGHT_SLIDER_FALLBACK_MIN;
}
function getHeightSliderMax(){
 const heights=getRegisteredActiveHeights();
 return heights.length?Math.ceil(Math.max(...heights)):HEIGHT_SLIDER_FALLBACK_MAX;
}
function normalizeSeries(work,series){
 series=String(series||"").trim();
 if(work==="ジョジョの奇妙な冒険"){const m=series.match(/^([1-9])部/);if(m)return `${m[1]}部`}
 const map={
  ["HUNTER×HUNTER\u0000G.I.編"]:"グリードアイランド編",
  ["HUNTER×HUNTER\u0000GI編"]:"グリードアイランド編",
  ["HUNTER×HUNTER\u0000選挙編"]:"会長選挙・アルカ編",
  ["Dr.STONE\u0000ストーンワールド"]:"石神村"
 };
 return map[work+"\u0000"+series]||series;
}
function baseNameForDedupe(name){
 let n=String(name||"").normalize("NFKC").trim().replace(/　/g," ");
 n=n.replace(/（(?:成人版|[1-9]部(?:・成人版)?|[1-9]部時点|アニメ[^）]*|原作[^）]*)）/g,"");
 return n.replace(/\s+/g,"").replace(/[＝=・]/g,"").toLowerCase();
}
const CODE_GEASS_SERIES_ORDER=["反逆のルルーシュ / R2","亡国のアキト","復活のルルーシュ","奪還のロゼ"];
function codeGeassSeriesRank(series){
 const i=CODE_GEASS_SERIES_ORDER.indexOf(String(series||"").trim());
 return i<0?999:i;
}
function codeGeassIdentityName(name){
 const n=baseNameForDedupe(name);
 const aliases=new Map([
  ["ルルーシュ","lelouch"],
  ["ルルーシュランペルージ","lelouch"],
  ["ルルーシュヴィブリタニア","lelouch"],
  ["ジュリアスキングスレイ","lelouch"]
 ]);
 return aliases.get(n)||n;
}
function characterIdentityKey(c){
 let n=baseNameForDedupe(c.name);
 if(c.work==="ジョジョの奇妙な冒険"&&(n==="dio"||n==="ディオブランドー"))n="dio";
 // コードギアスは後続作品に同じ人物が再登場しても、
 // 最初に登場した作品の1レコードに統合する。
 if(c.work==="コードギアス")return [c.work,codeGeassIdentityName(c.name)].join("\u0000");
 return [c.work,normalizeSeries(c.work,c.series),n].join("\u0000");
}
function heightQuality(c){return {verified:3,manual:2,unknown:1}[c.heightStatus]||0}
function mergeCharacterRecords(a,b){
 let keep={...a},other=b;
 // コードギアスの重複は、後続作品ではなく最も早い作品のレコードを土台にする。
 if(a.work==="コードギアス"&&b.work==="コードギアス"&&codeGeassIdentityName(a.name)===codeGeassIdentityName(b.name)){
   if(codeGeassSeriesRank(b.series)<codeGeassSeriesRank(a.series)){keep={...b};other=a}
   // ルルーシュは別名・偽名より本編の正式表示名を優先。
   if(codeGeassIdentityName(keep.name)==="lelouch")keep.name="ルルーシュ・ランペルージ";
 }
 if(String(other.name||"").length>String(keep.name||"").length&&keep.work!=="コードギアス")keep.name=other.name;
 keep.work=keep.work||other.work;keep.series=normalizeSeries(keep.work,keep.series||other.series);
 keep.tags=canonicalizeTags([...(keep.tags||[]),...(other.tags||[])]);
 keep.favorite=!!keep.favorite||!!other.favorite;
 keep.archived=!!keep.archived&&!!other.archived;
 if(heightQuality(other)>heightQuality(keep))for(const k of ["heightText","heightCm","heightStatus","heightSource"])keep[k]=other[k];
 if(String(other.id||"").startsWith("seed-")&&!String(keep.id||"").startsWith("seed-"))keep.id=other.id;
 return keep;
}
function cleanupCharacterData(list){
 const out=[],seen=new Map();
 for(const raw of list){
  const c=normalize(raw);if(!c.name)continue;
  if(c.work==="Dr.STONE"&&["サガラ","チョーク"].includes(c.name))c.archived=true;
  const k=characterIdentityKey(c);
  if(seen.has(k)){const i=seen.get(k);out[i]=mergeCharacterRecords(out[i],c)}
  else{seen.set(k,out.length);out.push(c)}
 }
 return out;
}
function matchesSharedFilters(c){
 const f=state.filters,q=String(f.search||"").trim().toLowerCase();
 const workIncluded=f.workIncluded||new Set(),workExcluded=f.workExcluded||new Set(),seriesIncluded=f.seriesIncluded||new Set(),seriesExcluded=f.seriesExcluded||new Set();
 if(q&&!([c.name,c.work,c.series,c.heightText,...(c.tags||[])].join(" ").toLowerCase().includes(q)))return false;
 if(workIncluded.size&&!workIncluded.has(c.work))return false;
 if(workExcluded.has(c.work))return false;
 if(seriesIncluded.size&&!seriesIncluded.has(c.series))return false;
 if(seriesExcluded.has(c.series))return false;
 if(f.favorite==="favorite"&&!c.favorite)return false;
 if(f.favorite==="normal"&&c.favorite)return false;
 if(f.minHeight!==null||f.maxHeight!==null){
  if(!Number.isFinite(c.heightCm))return false;
  if(f.minHeight!==null&&c.heightCm<f.minHeight)return false;
  if(f.maxHeight!==null&&c.heightCm>f.maxHeight)return false;
 }
 return true;
}
function toggleFavoriteFilter(){
 state.filters.favorite=state.filters.favorite==="favorite"?"all":"favorite";
 renderGachaFilters();renderManager();
}
function setHeightFilterFromSlider(which,value){
 const n=Number(value),dynamicMin=getHeightSliderMin(),dynamicMax=getHeightSliderMax();
 if(which==="min")state.filters.minHeight=n<=dynamicMin?null:n;
 else state.filters.maxHeight=n>=dynamicMax?null:n;
 if(state.filters.minHeight!==null&&state.filters.maxHeight!==null&&state.filters.minHeight>state.filters.maxHeight){
  if(which==="min")state.filters.maxHeight=state.filters.minHeight;else state.filters.minHeight=state.filters.maxHeight;
 }
}
function heightFilterText(){
 const a=state.filters.minHeight,b=state.filters.maxHeight;
 if(a===null&&b===null)return "指定なし";
 if(a!==null&&b===null)return `${a}cm以上`;
 if(a===null&&b!==null)return `${b}cm以下`;
 return `${a}〜${b}cm`;
}
function normalize(c){
 const rawCm=(c.heightCm===null||c.heightCm===undefined||c.heightCm==="")?null:Number(c.heightCm);
 return {id:c.id||makeId(),name:String(c.name||"").trim(),work:String(c.work||"").trim(),
   series:normalizeSeries(String(c.work||"").trim(),String(c.series||"").trim()),tags:Array.isArray(c.tags)?canonicalizeTags(c.tags):[],
   archived:!!c.archived,favorite:!!c.favorite,heightText:String(c.heightText||"不明（公称値を確認できず）").trim(),
   heightCm:Number.isFinite(rawCm)?rawCm:null,
   heightStatus:["verified","unknown","manual"].includes(c.heightStatus)?c.heightStatus:"unknown",
   heightSource:String(c.heightSource||"今回確認できた公称資料では数値を特定できず。推測値は登録していません。").trim()};
}

function applySettingsState(saved,overrides={}){
 const source={...saved,...overrides};
 state.characters=source.characters||[];state.pools=source.pools||structuredClone(DEFAULT_POOLS);
 state.basePrompt=Object.prototype.hasOwnProperty.call(source,"basePrompt")?String(source.basePrompt):DEFAULT_BASE_PROMPT;
 state.protagonistProfile=Object.prototype.hasOwnProperty.call(source,"protagonistProfile")?String(source.protagonistProfile):DEFAULT_PROTAGONIST_PROFILE;
 state.workProtagonistProfiles=source.workProtagonistProfiles&&typeof source.workProtagonistProfiles==="object"?{...source.workProtagonistProfiles}:{};
 state.worldMode=Object.prototype.hasOwnProperty.call(WORLD_MODES,source.worldMode)?source.worldMode:DEFAULT_WORLD_MODE;
 state.themeMode=["system","light","dark"].includes(source.themeMode)?source.themeMode:"system";
 state.deletedSeedIds=new Set(source.deletedSeedIds||[]);state.characterId=state.characters.some(c=>c.id===source.characterId&&!c.archived)?source.characterId:null;
 state.values={...(source.values||{})};state.locks={character:false,relationship:false,situation:false,mood:false,extra:false,...(source.locks||{})};
 const f=source.filters||{};state.filters={search:String(f.search||""),workIncluded:new Set(f.workIncluded||[]),workExcluded:new Set(f.workExcluded||[]),seriesIncluded:new Set(f.seriesIncluded||[]),seriesExcluded:new Set(f.seriesExcluded||[]),tags:new Set(canonicalizeTags(f.tags||[])),tagMode:f.tagMode==="any"?"any":"all",favorite:["favorite","normal"].includes(f.favorite)?f.favorite:"all",minHeight:Number.isFinite(f.minHeight)?f.minHeight:null,maxHeight:Number.isFinite(f.maxHeight)?f.maxHeight:null,characterIncluded:new Set(f.characterIncluded||[]),characterExcluded:new Set(f.characterExcluded||[])};
 state.manage={status:["active","archived"].includes(source.manage?.status)?source.manage.status:"all",sort:String(source.manage?.sort||"work")};
 state.categoryInclude={character:null,relationship:null,situation:null,mood:null,extra:null,...(source.categoryInclude||{})};
  state.categoryExcluded=Object.fromEntries(DreamGachaData.CARD_KEYS.map(k=>[k,new Set(source.categoryExcluded?.[k]||[])]));
  state.presets=Array.isArray(source.presets)?source.presets.filter(x=>x&&x.snapshot):[];
  state.promptDraftSnapshot=source.promptDraftSnapshot?DreamGachaDomain.clone(source.promptDraftSnapshot):null;
  const free=$("#freeExtra");if(free)free.value=String(source.freeExtra||"");
  const output=$("#output");if(output)output.value=state.promptDraftSnapshot?.prompt||"";
}

function prepareSettings(raw,strict=false){
  const prepared=DreamGachaStorage.decodeSettings(raw,{pools:DEFAULT_POOLS,basePrompt:DEFAULT_BASE_PROMPT,protagonistProfile:DEFAULT_PROTAGONIST_PROFILE,worldMode:DEFAULT_WORLD_MODE},strict);
  const previousBundledPrompt=prepared.basePrompt.replace("\n\n## 身長差・体格差\n\n夢主は160cmです。\n\n","\n\n## 身長差・体格差\n\n");
  const shouldMigrateBundledPrompt=Number(prepared.version||0)<DreamGachaData.SETTINGS_VERSION&&(LEGACY_BASE_PROMPTS.includes(prepared.basePrompt)||previousBundledPrompt===DEFAULT_BASE_PROMPT);
  if(!prepared.basePrompt||shouldMigrateBundledPrompt)prepared.basePrompt=DEFAULT_BASE_PROMPT;
 if(Number(prepared.version||0)<34&&!prepared.basePrompt.includes("## 人体・姿勢・接触の整合性")&&prepared.basePrompt.includes("## 恋愛描写")){
  const section=DEFAULT_BASE_PROMPT.match(/## 人体・姿勢・接触の整合性[\s\S]*?(?=\n\n## 恋愛描写)/)?.[0];
  if(section)prepared.basePrompt=prepared.basePrompt.replace("## 恋愛描写",section+"\n\n## 恋愛描写");
 }
 if(Number(prepared.version||0)<DreamGachaData.SETTINGS_VERSION&&LEGACY_PROTAGONIST_PROFILES.includes(prepared.protagonistProfile))prepared.protagonistProfile=DEFAULT_PROTAGONIST_PROFILE;
 prepared.characters=cleanupCharacterData(prepared.characters.map(normalize).filter(c=>c.name));
 prepared.filters.tags=canonicalizeTags(prepared.filters.tags||[]);
 if(!prepared.characters.some(c=>c.id===prepared.characterId&&!c.archived))prepared.characterId=null;
 return prepared;
}

function load(){
 let saved=null;
 try{saved=JSON.parse(localStorage.getItem("dreamGachaSettings")||"null")}catch(e){console.warn(e)}
 saved=prepareSettings(saved,false);
 applySettingsState(saved);

 const savedChars=state.characters;
 const byId=new Map(savedChars.map(c=>[c.id,c]));
 const byNameWork=new Map(savedChars.map(c=>[c.work+"\u0000"+c.name,c]));
 state.characters=[...savedChars];

 for(const d0 of DEFAULT_CHARACTERS){
   const d=normalize(d0);
   if(state.deletedSeedIds.has(d.id)) continue;
   const existing=byId.get(d.id)||byNameWork.get(d.work+"\u0000"+d.name);
   if(existing){
      if(!existing.work) existing.work=d.work;
      if(!existing.series) existing.series=d.series;
      if(!existing.tags.length) existing.tags=d.tags;
      if(existing.heightStatus!=="manual"){
        existing.heightText=d.heightText;existing.heightCm=d.heightCm;
        existing.heightStatus=d.heightStatus;existing.heightSource=d.heightSource;
      }
   }else{
      state.characters.push(d);
   }
 }

 // v0.1/v0.2の名前だけキャラを移行
 if(saved?.pools?.character && Array.isArray(saved.pools.character)){
   const names=new Set(state.characters.map(c=>c.name));
   for(const name of saved.pools.character){
     if(name && !names.has(name)){
       state.characters.push({id:makeId(),name,work:"",series:"",tags:[],archived:false,favorite:false,heightText:"不明（公称値を確認できず）",heightCm:null,heightStatus:"unknown",heightSource:"今回確認できた公称資料では数値を特定できず。推測値は登録していません。"});
       names.add(name);
     }
   }
 }

 // v0.14: 既存の手編集候補はそのまま残し、今回追加した新候補だけを一度追加する。
 if(saved&&Number(saved.version||0)<14){
   for(const k of Object.keys(V14_POOL_ADDITIONS)){
     const set=new Set(state.pools[k]||[]);
     for(const item of V14_POOL_ADDITIONS[k])if(!set.has(item)){state.pools[k].push(item);set.add(item)}
   }
 }
 migrateAmbiguousDio();
 // v0.12: コードギアスは後続作品の同一人物も初出レコードへ統合
 state.characters=cleanupCharacterData(state.characters);

 // Re-apply through the canonical path so migrations and seed enrichment leave
 // the same normalized shape used by restore and serialization.
 applySettingsState(prepareSettings({...saved,characters:state.characters,pools:state.pools,deletedSeedIds:[...state.deletedSeedIds],characterId:state.characterId},false));
}


function migrateAmbiguousDio(){
 const work="ジョジョの奇妙な冒険";
 const ambiguous=state.characters.filter(c=>c.work===work&&c.name==="DIO"&&(c.series.includes("1・3")||c.series.includes("1・3")||c.series.startsWith("5部")));
 if(!ambiguous.length)return;
 const fav=ambiguous.some(c=>c.favorite),arch=ambiguous.every(c=>c.archived);
 let p1=state.characters.find(c=>c.work===work&&c.name==="ディオ・ブランドー（1部）");
 let p3=state.characters.find(c=>c.work===work&&c.name==="DIO（3部）");
 if(p1){if(fav)p1.favorite=true;if(arch)p1.archived=true}
 if(p3){if(fav)p3.favorite=true;if(arch)p3.archived=true}
 const ids=new Set(ambiguous.map(c=>c.id));
 for(const c of ambiguous)if(String(c.id).startsWith("seed-"))state.deletedSeedIds.add(c.id);
 state.characters=state.characters.filter(c=>!ids.has(c.id));
 if(ids.has(state.characterId))state.characterId=null;
}

function applyTheme(mode=state.themeMode){
 state.themeMode=["system","light","dark"].includes(mode)?mode:"system";
 const systemDark=!!window.matchMedia?.("(prefers-color-scheme: dark)")?.matches,resolved=state.themeMode==="system"?(systemDark?"dark":"light"):state.themeMode;
 if(document.documentElement)document.documentElement.dataset.theme=resolved;
 const select=$("#themeMode");if(select)select.value=state.themeMode;
}
function setTheme(mode){applyTheme(mode);save();showToast(`表示を「${{system:"端末設定",light:"ライト",dark:"ダーク"}[state.themeMode]}」にしました`)}

function save(msg=false){
 const serialized=DreamGachaStorage.plainSettings({...state,freeExtra:$("#freeExtra").value});DreamGachaStorage.validateSettings(serialized);
 try{localStorage.setItem(DreamGachaData.SETTINGS_KEY,JSON.stringify(serialized))}
 catch(error){alert(`設定を保存できませんでした：${error.message}`);throw error}
 if(msg){setStatus("設定を保存しました");showSettingsSavedState()}
}


const ARCHIVE_DB_NAME="dreamGachaArchive";
const ARCHIVE_DB_VERSION=1;
let novelDraftSnapshot=null;
let novelCache=[];
let novelFavoriteOnly=false;

function openArchiveDB(){
 return new Promise((resolve,reject)=>{
   const req=indexedDB.open(ARCHIVE_DB_NAME,ARCHIVE_DB_VERSION);
   req.onupgradeneeded=()=>{
     const db=req.result;
     if(!db.objectStoreNames.contains("novels")){
       const store=db.createObjectStore("novels",{keyPath:"id"});
       store.createIndex("createdAt","createdAt");
     }
   };
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error||new Error("IndexedDBを開けませんでした"));
 });
}
async function novelAll(){
 const db=await openArchiveDB();
 return new Promise((resolve,reject)=>{
   const tx=db.transaction("novels","readonly"),req=tx.objectStore("novels").getAll();
   let result=[];req.onsuccess=()=>{result=(req.result||[]).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))};
   req.onerror=()=>reject(req.error);tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error||new Error("夢小説の読み込みが中断されました"))};
 });
}
async function novelPut(novel){
 const db=await openArchiveDB();
 return new Promise((resolve,reject)=>{
   const tx=db.transaction("novels","readwrite");
   tx.objectStore("novels").put(novel);
   tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error||new Error("夢小説の保存が中断されました"))};
 });
}
async function novelDelete(id){
 const db=await openArchiveDB();
 return new Promise((resolve,reject)=>{
   const tx=db.transaction("novels","readwrite");
   tx.objectStore("novels").delete(id);
   tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error||new Error("夢小説の削除が中断されました"))};
 });
}
async function replaceAllNovels(items){
 const db=await openArchiveDB();
 return new Promise((resolve,reject)=>{
   const tx=db.transaction("novels","readwrite"),store=tx.objectStore("novels");
   store.clear();for(const item of items||[])if(item&&item.id)store.put(item);
   tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error||new Error("夢小説アーカイブの置換が中断されました"))};
 });
}
function libraryId(prefix){return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`}
function novelCharCount(text){return Array.from(String(text||"")).length}
function fmtChars(n){return `${Number(n||0).toLocaleString("ja-JP")}字`}
function fmtDate(iso){
 try{return new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(iso))}catch(e){return String(iso||"")}
}
function snapshotCurrentConditions(){
 const c=currentCharacter();
 const prompt=$("#output").value;
 const protagonistField=$("#protagonistProfile");
 return DreamGachaDomain.makeSnapshot({character:c,relationship:state.values.relationship,situation:state.values.situation,mood:state.values.mood,extra:state.values.extra,
   freeExtra:$("#freeExtra").value,protagonistProfile:protagonistField?protagonistField.value:(state.protagonistProfile||DEFAULT_PROTAGONIST_PROFILE),workProtagonistProfile:workProtagonistProfileFor(c?.work),worldMode:state.worldMode,prompt});
}
function snapshotAutoTitle(s){return `${s?.character?.name||"キャラ未指定"}｜${s?.situation||"シチュ未指定"}`}
function novelDisplayTitle(n){
 const title=String(n?.title||"").trim()||"無題",suffix=snapshotAutoTitle(n?.snapshot);
 return title===suffix?title:`${title}（${suffix}）`;
}
function snapshotMetaHtml(s){
 if(!s)return "条件なし";
 const world=WORLD_MODES[s.worldMode]?.label;
 return [s.character?.name,world,s.relationship,s.situation,s.mood,s.extra].filter(Boolean).map(v=>`<span class="library-tag">${esc(v)}</span>`).join("");
}
function saveCurrentConditionsPreset(){
 const snap=snapshotCurrentConditions(),auto=snapshotAutoTitle(snap),name=window.prompt("条件セット名",auto);
 if(name===null)return;
 state.presets.unshift({id:libraryId("preset"),name:String(name||auto).trim()||auto,createdAt:new Date().toISOString(),snapshot:snap});
 save();renderPresetList();showToast("条件を保存しました");
}
function applySnapshot(snap){
 if(!snap)return;
 const resolved=DreamGachaDomain.resolveSnapshot(snap,state.characters,DEFAULT_PROTAGONIST_PROFILE);
 state.characterId=resolved.characterId;
 for(const k of DreamGachaData.SNAPSHOT_KEYS)state.values[k]=resolved[k];
 state.worldMode=resolved.worldMode;
 const character=currentCharacter();
 if(character&&Object.prototype.hasOwnProperty.call(snap,"workProtagonistProfile")){
  const work=character.work,profile=resolved.workProtagonistProfile,initial=String(DEFAULT_WORK_PROTAGONIST_PROFILES[work]||"");
  if(profile===initial)delete state.workProtagonistProfiles[work];else state.workProtagonistProfiles[work]=profile;
 }
  $("#freeExtra").value=resolved.freeExtra;state.protagonistProfile=resolved.protagonistProfile;$("#protagonistProfile").value=resolved.protagonistProfile;$("#output").value=resolved.prompt;state.promptDraftSnapshot=DreamGachaDomain.clone(snap);
 for(const k of ["character","relationship","situation","mood","extra"])updateCard(k);
 renderWorldModeControls();renderWorkProfileEditor(character?.work);save();renderGachaFilters();switchScreen("gacha");showToast(resolved.missingCharacter?"保存キャラが利用できないため、キャラ未選択で適用しました":"保存条件をガチャへ適用しました");
}
function rerollSnapshotScenario(snap){
 if(!snap)return;
 applySnapshot(snap);
 for(const key of ["situation","mood","extra"])rollOne(key,true);
 buildPrompt(false);
 showToast("シチュ・雰囲気・追加条件を引き直しました");
}
function renderPresetList(){
 const box=$("#presetList");if(!box)return;
 if(!state.presets.length){box.innerHTML=`<div class="empty-library">まだ保存した条件はありません</div>`;return}
 box.innerHTML=state.presets.map(p=>`<div class="library-card">
  <div class="library-card-head"><div><div class="library-card-title">${esc(p.name)}</div><div class="library-card-sub">${esc(fmtDate(p.createdAt))}</div></div></div>
  <div class="library-tags">${snapshotMetaHtml(p.snapshot)}</div>
  <div class="library-card-actions"><button class="primary" type="button" data-apply-preset="${esc(p.id)}">この条件を使う</button><button class="small-btn" type="button" data-reroll-preset="${esc(p.id)}">🎲 この二人で別シチュ</button><button class="small-btn" type="button" data-delete-preset="${esc(p.id)}">削除</button></div>
 </div>`).join("");
}
function prepareNovelSave(){
  novelDraftSnapshot=DreamGachaDomain.clone(state.promptDraftSnapshot||snapshotCurrentConditions());
 $("#novelSnapshotPreview").innerHTML=`<strong>保存する条件</strong><div class="library-tags">${snapshotMetaHtml(novelDraftSnapshot)}</div>`;
 // The generated prompt belongs to the saved snapshot, not to a personal memo.
 $("#novelMemo").value="";
 switchScreen("library");setTimeout(()=>$("#novelBody").scrollIntoView({behavior:"smooth",block:"center"}),80);
}
async function saveNovelArchive(){
  const body=$("#novelBody").value.trim();if(!body)return showToast("夢小説本文を貼り付けてください");
  const snap=DreamGachaDomain.clone(novelDraftSnapshot||state.promptDraftSnapshot||snapshotCurrentConditions()),title=$("#novelTitle").value.trim()||"無題",enteredMemo=$("#novelMemo").value.trim(),now=new Date().toISOString();
  const novel={id:libraryId("novel"),title,body,charCount:novelCharCount(body),memo:enteredMemo===String(snap.prompt||"").trim()?"":enteredMemo,favorite:$("#novelFavorite").checked,createdAt:now,updatedAt:now,snapshot:snap,promptSnapshot:String(snap.prompt||"")};
 try{
   await novelPut(novel);
   DreamGachaUI.resetNovelForm();
   novelDraftSnapshot=null;$("#novelSnapshotPreview").textContent="現在のガチャ条件を使用します";
   await refreshNovelCache();renderNovelList();showToast("夢小説をアーカイブしました");
 }catch(e){alert(`夢小説を保存できませんでした：${e.message}`)}
}
async function renderNovelList(){
 const box=$("#novelList");if(!box)return;
 const q=$("#novelSearch")?.value.trim().toLowerCase()||"";
 const arr=DreamGachaDomain.filterNovels(novelCache,q,novelFavoriteOnly);
 $("#novelCount").textContent=`${novelCache.length}本`;
 if(!arr.length){box.innerHTML=`<div class="empty-library">${novelCache.length?"条件に合う夢小説がありません":"まだ夢小説は保存されていません"}</div>`;return}
 box.innerHTML=arr.map(n=>`<div class="library-card">
  <div class="library-card-head"><div><div class="library-card-title">${n.favorite?"★ ":""}${esc(novelDisplayTitle(n))}</div><div class="library-card-sub">${esc(fmtDate(n.createdAt))} / ${fmtChars(n.charCount??novelCharCount(n.body))}${n.snapshot?.character?.work?` / ${esc(n.snapshot.character.work)}`:""}</div></div></div>
  <div class="library-tags">${snapshotMetaHtml(n.snapshot)}</div><div class="library-preview">${esc(DreamGachaDomain.preview(n.body,DreamGachaData.NOVEL_PREVIEW_LENGTH))}</div>
  <div class="library-card-actions"><button class="primary" type="button" data-open-novel="${esc(n.id)}">読む</button><button class="small-btn" type="button" data-edit-novel="${esc(n.id)}">編集</button><button class="small-btn" type="button" data-copy-novel="${esc(n.id)}">コピー</button><button class="small-btn" type="button" data-export-novel="${esc(n.id)}">TXT</button><button class="small-btn" type="button" data-reuse-novel="${esc(n.id)}">条件を再利用</button><button class="small-btn" type="button" data-reroll-novel="${esc(n.id)}">🎲 この二人で別シチュ</button><button class="small-btn" type="button" data-fav-novel="${esc(n.id)}">${n.favorite?"★解除":"☆お気に入り"}</button><button class="small-btn" type="button" data-delete-novel="${esc(n.id)}">削除</button></div>
 </div>`).join("");
}
async function refreshNovelCache(){novelCache=await novelAll();return novelCache}
async function renderLibrary(){renderPresetList();try{await refreshNovelCache();renderNovelList()}catch(e){const box=$("#novelList");if(box)box.innerHTML=`<div class="empty-library">アーカイブを読み込めませんでした</div>`}}
let viewingNovelId=null,novelEditOriginal=null;
function novelPromptSnapshot(n){return String(n?.promptSnapshot??n?.snapshot?.prompt??"")}
function novelTextValue(value,fallback="未記録"){const text=String(value||"").trim();return text||fallback}
function sanitizeTxtFilenamePart(value,fallback){
 let text=String(value||"").replace(/[<>:"/\\|?*\u0000-\u001f]/g," ").replace(/\s+/g," ").trim().replace(/[. ]+$/g,"");
 if(!text||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(text))text=fallback;
 return text;
}
function novelTxtFilename(n){
 const s=n?.snapshot||{},title=sanitizeTxtFilenamePart(n?.title,"無題"),character=sanitizeTxtFilenamePart(s.character?.name,"キャラ未指定"),situation=sanitizeTxtFilenamePart(s.situation,"シチュ未指定");
 const base=Array.from(`${title}（${character}・${situation}）`).slice(0,120).join("").replace(/[. ]+$/g,"");
 return `${base||"無題"}.txt`;
}
function novelTxtContent(n){
 const s=n?.snapshot||{},character=novelTextValue(s.character?.name,"キャラ未指定"),prompt=novelPromptSnapshot(n),lines=[
  `${novelTextValue(n?.title,"無題")}（${character}）`,"",String(n?.body||""),"","────────────────────","","【生成条件】",
  `作品：${novelTextValue(s.character?.work)}`,`部・シリーズ：${novelTextValue(s.character?.series)}`,`キャラクター：${character}`,`世界観：${novelTextValue(WORLD_MODES[s.worldMode]?.label)}`,
  `関係性：${novelTextValue(s.relationship)}`,`シチュ：${novelTextValue(s.situation)}`,`雰囲気：${novelTextValue(s.mood)}`,`追加条件：${novelTextValue(s.extra)}`
 ];
 if(String(s.protagonistProfile||"").trim())lines.push(`共通夢主設定：${s.protagonistProfile.trim()}`);
 if(String(s.workProtagonistProfile||"").trim())lines.push(`作品別夢主設定：${s.workProtagonistProfile.trim()}`);
 if(String(s.freeExtra||"").trim())lines.push(`今回だけの追加設定：${s.freeExtra.trim()}`);
 if(String(n?.memo||"").trim())lines.push(`メモ：${n.memo.trim()}`);
 lines.push(`文字数：${fmtChars(n?.charCount??novelCharCount(n?.body))}`,`作成日時：${novelTextValue(n?.createdAt)}`,`最終編集日時：${novelTextValue(n?.updatedAt)}`,"","【生成に使用した完成プロンプト】",prompt||"（未記録）");
 return lines.join("\n");
}
function downloadNovelTxt(n){
 const blob=new Blob(["\uFEFF",novelTxtContent(n)],{type:"text/plain;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=novelTxtFilename(n);document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
}
async function copyNovelArchive(n){await copyTextToClipboard(`${novelTextValue(n?.title,"無題")}\n\n${String(n?.body||"")}`);showToast("タイトルと本文をコピーしました")}
function openNovelView(n){
  if(!n)return;
  viewingNovelId=n.id;novelEditOriginal=null;$("#novelViewRead").hidden=false;$("#novelEditPanel").hidden=true;$("#startNovelEdit").hidden=false;
  $("#novelViewTitle").textContent=novelDisplayTitle(n);$("#novelViewMeta").textContent=[n.snapshot?.character?.name,n.snapshot?.character?.work,fmtChars(n.charCount??novelCharCount(n.body)),fmtDate(n.createdAt),n.updatedAt?`編集 ${fmtDate(n.updatedAt)}`:""].filter(Boolean).join(" / ");$("#novelViewBody").textContent=n.body;
 const s=n.snapshot||{},items=[["キャラ",s.character?.name],["作品",s.character?.work],["部・シリーズ",s.character?.series],["世界観",WORLD_MODES[s.worldMode]?.label],["関係性",s.relationship],["シチュ",s.situation],["雰囲気",s.mood],["追加条件",s.extra],["自由指定",s.freeExtra],["共通の夢主設定",s.protagonistProfile],["作品別の夢主設定",s.workProtagonistProfile]].filter(x=>x[1]);
  $("#novelViewConditions").innerHTML=items.map(([k,v])=>`<div class="novel-detail-item"><b>${esc(k)}</b>${esc(v)}</div>`).join("");$("#novelViewPrompt").value=novelPromptSnapshot(n)||"（未記録）";
  $("#novelModal").hidden=false;document.body.style.overflow="hidden";
}
function hasNovelEditChanges(){return !!novelEditOriginal&&["title","body","memo"].some(k=>$("#novelEdit"+({title:"Title",body:"Body",memo:"Memo"}[k])).value!==novelEditOriginal[k])}
function closeNovelView(){if(hasNovelEditChanges()&&!confirm("保存していない変更を破棄しますか？"))return false;viewingNovelId=null;novelEditOriginal=null;$("#novelModal").hidden=true;document.body.style.overflow="";return true}
function startNovelEdit(){
 const n=novelCache.find(item=>item.id===viewingNovelId);if(!n)return;
 novelEditOriginal={title:n.title||"",body:n.body||"",memo:n.memo||""};$("#novelEditTitle").value=novelEditOriginal.title;$("#novelEditBody").value=novelEditOriginal.body;$("#novelEditMemo").value=novelEditOriginal.memo;$("#novelEditCount").textContent=fmtChars(novelCharCount(n.body));$("#novelViewRead").hidden=true;$("#novelEditPanel").hidden=false;$("#startNovelEdit").hidden=true;
}
function cancelNovelEdit(){if(hasNovelEditChanges()&&!confirm("保存していない変更を破棄しますか？"))return;const n=novelCache.find(item=>item.id===viewingNovelId);if(n)openNovelView(n)}
async function saveNovelEdit(){
 const index=novelCache.findIndex(item=>item.id===viewingNovelId);if(index<0)return;
 const body=$("#novelEditBody").value;if(!body.trim())return showToast("本文を空にはできません");
 const current=novelCache[index],updated={...current,title:$("#novelEditTitle").value.trim()||"無題",body,memo:$("#novelEditMemo").value.trim(),charCount:novelCharCount(body),updatedAt:new Date().toISOString()};
 await novelPut(updated);novelCache=[...novelCache.slice(0,index),updated,...novelCache.slice(index+1)];renderNovelList();openNovelView(updated);showToast("夢小説を更新しました");
}
async function toggleNovelFavorite(id){const index=novelCache.findIndex(n=>n.id===id);if(index<0)return;const updated={...novelCache[index],favorite:!novelCache[index].favorite};await novelPut(updated);novelCache=[...novelCache.slice(0,index),updated,...novelCache.slice(index+1)];renderNovelList()}
async function deleteNovelArchive(id){const n=novelCache.find(n=>n.id===id);if(!n)return;if(!confirm(`「${novelDisplayTitle(n)}」を削除しますか？`))return;await novelDelete(id);await refreshNovelCache();renderNovelList();showToast("夢小説を削除しました")}


function switchScreen(name){
 const screen=document.querySelector(`#screen-${name}`);if(!screen)return;
 document.querySelectorAll(".screen").forEach(el=>el.hidden=el!==screen);
 document.querySelectorAll(".tab-btn").forEach(b=>{const active=b.dataset.screen===name;b.classList.toggle("active",active);b.setAttribute("aria-selected",String(active));b.tabIndex=active?0:-1});
 if(name==="manager") renderManager();
 if(name==="library") renderLibrary();
 $("#managerQuickNav").hidden=name!=="manager";
 document.title=`${{gacha:"ガチャ",library:"ライブラリ",manager:"キャラ管理",help:"使い方"}[name]}｜夢小説シチュガチャ`;
 window.scrollTo?.({top:0,behavior:"smooth"});
}

function goToScreen(name,targetId){
 switchScreen(name);
 if(targetId)setTimeout(()=>document.querySelector(`#${targetId}`)?.scrollIntoView({behavior:"smooth",block:"start"}),120);
}


let chooserKey=null;
function chooserEntries(key){
 if(key==="character"){
   return baseFilteredCharacters().filter(c=>categoryPass("character",c)).map(c=>({
     value:c.id,
     label:(c.favorite?"★ ":"")+c.name,
     meta:[c.work,c.series,Number.isFinite(c.heightCm)?`${c.heightCm}cm`:""].filter(Boolean).join(" / ")
   }));
 }
 return worldEligiblePool(key).filter(v=>categoryPass(key,v)).map(v=>({value:v,label:v,meta:key==="situation"?situationWorldLabel(v):""}));
}
function renderChooserCategoryChips(){
  if(!chooserKey)return;
  const counts=categoryCounts(chooserKey),order=categoryOrderFor(chooserKey);
  $("#choiceCategoryWrap").hidden=!order.length;
  const include=state.categoryInclude[chooserKey],excluded=state.categoryExcluded[chooserKey];
  $("#choiceCategoryTitle").textContent=CATEGORY_LABELS[chooserKey]||"カテゴリ";
  const summary=[];
  if(include)summary.push(`「${include}」だけを表示`);
  if(excluded.size)summary.push(`${excluded.size}カテゴリを除外中`);
  $("#choiceCategorySummary").textContent=summary.join(" ／ ")||"すべてのカテゴリを表示中";
  $("#choiceCategoryClear").disabled=!include&&!excluded.size;
  $("#choiceCategoryChips").innerHTML=
    order.filter(c=>(counts.get(c)||0)>0).map(c=>{
      const included=include===c,isExcluded=excluded.has(c);
      return `<div class="choice-category-option${included?" included":""}${isExcluded?" excluded":""}">
       <button type="button" class="choice-category-chip" data-category-include="${esc(c)}" aria-pressed="${included}" aria-label="${esc(c)}${included?"の絞り込みを解除":"だけに絞り込む"}。候補${counts.get(c)}件">
        <span class="choice-category-state" aria-hidden="true">${included?"✓":""}</span><span>${esc(c)}</span><span class="n">${counts.get(c)}</span>
       </button>
       <button type="button" class="choice-category-exclude" data-category-exclude="${esc(c)}" aria-pressed="${isExcluded}" aria-label="${esc(c)}を${isExcluded?"除外から戻す":"除外する"}"><span aria-hidden="true">×</span> ${isExcluded?"除外中":"除外"}</button>
      </div>`;
    }).join("");
}
function openChooser(key){
  if(key!=="character")syncScenario();
  chooserKey=key;
 $("#choiceTitle").textContent=`${META[key].label}を候補から選ぶ`;
 $("#choiceSearch").value="";
 renderChooserCategoryChips();renderChooserList();
 $("#choiceModal").hidden=false;
 document.body.style.overflow="hidden";
 setTimeout(()=>$("#choiceSearch").focus(),0);
}
function closeChooser(){
 chooserKey=null;$("#choiceModal").hidden=true;document.body.style.overflow="";
}
function renderChooserList(){
 if(!chooserKey)return;
 const q=$("#choiceSearch").value.trim().toLowerCase();
 const current=chooserKey==="character"?state.characterId:state.values[chooserKey];
 const arr=chooserEntries(chooserKey).filter(x=>(x.label+" "+x.meta).toLowerCase().includes(q));
 $("#choiceList").innerHTML=arr.length?arr.map(x=>{
   const badge=`<span class="category-badge">${esc(categoryFor(chooserKey,x.value))}</span>`;
   return `<button type="button" class="choice-item${x.value===current?" current":""}" data-choice-value="${esc(x.value)}"><span>${esc(x.label)}${badge}</span>${x.meta?`<span class="choice-item-meta">${esc(x.meta)}</span>`:""}</button>`;
 }).join(""):`<div class="choice-empty">該当する候補がありません</div>`;
}
function chooseValue(value){
 if(!chooserKey)return;
 if(chooserKey==="character"){
   if(!state.characters.some(c=>c.id===value&&!c.archived))return;
   state.characterId=value;updateCard("character");renderPicker();
 }else{
   state.values[chooserKey]=value;updateCard(chooserKey);
 }
 save();closeChooser();
}
function updateCategoryStatus(key){
  const el=document.querySelector(`[data-category-status="${key}"]`);if(!el)return;
  const include=state.categoryInclude[key],excluded=[...state.categoryExcluded[key]];
  const parts=[];
  if(include)parts.push(`<span class="include">設定：${esc(include)}</span>`);
  if(excluded.length)parts.push(`<span class="exclude">除外：${esc(excluded.join("、"))}</span>`);
  el.innerHTML=parts.length?parts.join("　"):`カテゴリ指定なし`;
  updateResultBulkActions();
}
function updateResultBulkActions(){
 const keys=DreamGachaData.CARD_KEYS;
 const anyLocked=keys.some(k=>!!state.locks[k]),allLocked=keys.every(k=>!!state.locks[k]);
 const hasCategoryRules=keys.some(k=>!!state.categoryInclude[k]||state.categoryExcluded[k]?.size);
 const lockAll=$("#lockAllResults"),unlockAll=$("#unlockAllResults"),resetCategories=$("#resetAllCategoryRules");
 if(lockAll)lockAll.disabled=allLocked;
 if(unlockAll)unlockAll.disabled=!anyLocked;
 if(resetCategories)resetCategories.disabled=!hasCategoryRules;
}
function setAllLocks(locked){
 for(const key of DreamGachaData.CARD_KEYS){
  state.locks[key]=locked;
  const input=document.querySelector(`[data-lock="${key}"]`);if(input)input.checked=locked;
  updateLock(key);
 }
 save();showToast(locked?"すべての結果を固定しました":"固定をすべて解除しました");
}
function resetAllCategoryRules(){
 const keys=DreamGachaData.CARD_KEYS;
 const changed=keys.some(k=>!!state.categoryInclude[k]||state.categoryExcluded[k]?.size);
 if(!changed)return;
 for(const key of keys){state.categoryInclude[key]=null;state.categoryExcluded[key].clear();updateCategoryStatus(key)}
 if(chooserKey){renderChooserCategoryChips();renderChooserList()}
 save();renderGachaFilters();renderManager();showToast("カテゴリの選択・除外をすべて解除しました");
}
function renderResultCards(){
 const grid=$("#resultGrid");grid.innerHTML="";
 const compact=window.matchMedia?.("(max-width: 780px)")?.matches;
 for(const key of Object.keys(META)){
  const card=document.createElement("div");card.className="result-card";card.dataset.key=key;
  card.innerHTML=`<div class="result-main"><div class="label">${META[key].icon} ${META[key].label}</div><div class="value" data-value="${key}">—</div></div>
  <div class="result-quick-actions"><button class="small-btn" data-reroll="${key}">🎲 <span>引き直す</span></button><label class="lock-label"><input type="checkbox" data-lock="${key}"> 🔒 <span>固定</span></label></div>
  <details class="result-detail" ${compact?"":"open"}><summary>選択・カテゴリ詳細</summary><div class="result-detail-content"><div class="result-category-status" data-category-status="${key}">カテゴリ指定なし</div><div class="card-actions"><button class="small-btn choose-btn" data-choose="${key}" type="button">☰ 選ぶ・カテゴリ</button>${key==="character"?`<button class="favorite-btn" data-favorite-current type="button">☆ お気に入り</button>`:""}</div></div></details>`;
  const lockInput=card.querySelector(`[data-lock="${key}"]`);
  if(lockInput)lockInput.checked=!!state.locks[key];
  card.classList.toggle("locked",!!state.locks[key]);
  grid.appendChild(card);updateCategoryStatus(key);
 }
 grid.addEventListener("click",e=>{
  const ch=e.target.closest("[data-choose]");if(ch)return openChooser(ch.dataset.choose);
  const b=e.target.closest("[data-reroll]");if(b)return rollOne(b.dataset.reroll,true);
  const f=e.target.closest("[data-favorite-current]");if(f&&currentCharacter())toggleFavorite([currentCharacter().id])
 });
 grid.addEventListener("change",e=>{const i=e.target.closest("[data-lock]");if(!i)return;state.locks[i.dataset.lock]=i.checked;updateLock(i.dataset.lock);save()});
}
function updateLock(k){document.querySelector(`.result-card[data-key="${k}"]`)?.classList.toggle("locked",!!state.locks[k]);updateResultBulkActions()}
function currentCharacter(){return state.characters.find(c=>c.id===state.characterId&&!c.archived)||null}
function activeCharacters(){return state.characters.filter(c=>!c.archived)}
function baseFilteredCharacters(){
 const tags=[...state.filters.tags];
 return activeCharacters().filter(c=>{
  if(!matchesSharedFilters(c))return false;
  if(tags.length){
   const set=new Set(c.tags),ok=state.filters.tagMode==="any"?tags.some(t=>set.has(t)):tags.every(t=>set.has(t));
   if(!ok)return false;
  }
  return true;
 });
}
function activeCharacterRuleSets(){
 const activeIds=new Set(activeCharacters().map(c=>c.id));
 return {included:new Set([...state.filters.characterIncluded].filter(id=>activeIds.has(id))),excluded:new Set([...state.filters.characterExcluded].filter(id=>activeIds.has(id)))};
}
function candidateCharactersForChoice(){return baseFilteredCharacters().filter(c=>categoryPass("character",c))}
function filteredCharacters(){
 const rules=activeCharacterRuleSets();
 return candidateCharactersForChoice().filter(c=>!rules.excluded.has(c.id)&&(!rules.included.size||rules.included.has(c.id)));
}
function tagCountBaseCharacters(){return activeCharacters().filter(matchesSharedFilters)}
function facetSummary(kind){
 const included=state.filters[`${kind}Included`].size,excluded=state.filters[`${kind}Excluded`].size,parts=[];
 if(included)parts.push(`${included}件選択`);if(excluded)parts.push(`${excluded}件除外`);return parts.join("・")||"すべて";
}
function renderFacet(kind,values){
 const included=state.filters[`${kind}Included`],excluded=state.filters[`${kind}Excluded`],available=new Set(values);
 state.filters[`${kind}Included`]=new Set([...included].filter(value=>available.has(value)));
 state.filters[`${kind}Excluded`]=new Set([...excluded].filter(value=>available.has(value)));
 const nextIncluded=state.filters[`${kind}Included`],nextExcluded=state.filters[`${kind}Excluded`];
 const html=values.map(value=>`<button type="button" class="facet-chip${nextIncluded.has(value)?" included":""}${nextExcluded.has(value)?" excluded":""}" data-facet-kind="${kind}" data-facet-value="${esc(value)}" aria-pressed="${nextIncluded.has(value)||nextExcluded.has(value)}"><span>${nextIncluded.has(value)?"✓ ":nextExcluded.has(value)?"× ":""}${esc(value)}</span></button>`).join("");
 for(const prefix of ["gacha","manage"]){const chips=$("#"+prefix+(kind==="work"?"Work":"Series")+"Chips"),summary=$("#"+prefix+(kind==="work"?"Work":"Series")+"Summary");if(chips)chips.innerHTML=html;if(summary)summary.textContent=facetSummary(kind)}
 document.querySelectorAll(`[data-facet-mode-for="${kind}"] [data-facet-mode]`).forEach(button=>button.classList.toggle("active",button.dataset.facetMode===state.filterEditMode[kind]));
}
function toggleFacet(kind,value,forcedMode){
 if(!["work","series"].includes(kind))return;
 const mode=forcedMode||state.filterEditMode[kind],included=state.filters[`${kind}Included`],excluded=state.filters[`${kind}Excluded`];
 if(mode==="exclude"){excluded.has(value)?excluded.delete(value):excluded.add(value);included.delete(value)}
 else{included.has(value)?included.delete(value):included.add(value);excluded.delete(value)}
 renderGachaFilters();renderManager();save();
}
function renderSharedFilterControls(){
 const all=state.characters,works=unique(all.map(c=>c.work)),series=unique(all.map(c=>c.series));
 renderFacet("work",works);renderFacet("series",series);

 document.querySelectorAll("[data-favorite-filter]").forEach(b=>b.classList.toggle("active",state.filters.favorite==="favorite"));
 for(const id of ["gachaSearch","manageSearch"]){const e=$("#"+id);if(e&&e.value!==state.filters.search)e.value=state.filters.search}

 const dynamicMin=getHeightSliderMin(),dynamicMax=getHeightSliderMax();
 // アーカイブ・復元・インポート等で実データ範囲が変わったら、端の条件を自動で「指定なし」に戻す
 if(state.filters.minHeight!==null&&state.filters.minHeight<=dynamicMin)state.filters.minHeight=null;
 if(state.filters.maxHeight!==null&&state.filters.maxHeight>=dynamicMax)state.filters.maxHeight=null;
 // 範囲外になった古い値も現在の実データ範囲へ丸める
 if(state.filters.minHeight!==null&&state.filters.minHeight>dynamicMax)state.filters.minHeight=dynamicMax;
 if(state.filters.maxHeight!==null&&state.filters.maxHeight<dynamicMin)state.filters.maxHeight=dynamicMin;

 const minV=state.filters.minHeight??dynamicMin,maxV=state.filters.maxHeight??dynamicMax;
 for(const prefix of ["gacha","manage"]){
  const mn=$("#"+prefix+"HeightMin"),mx=$("#"+prefix+"HeightMax");
  if(mn){mn.min=dynamicMin;mn.max=dynamicMax;mn.value=minV}
  if(mx){mx.min=dynamicMin;mx.max=dynamicMax;mx.value=maxV}
  const mno=$("#"+prefix+"HeightMinValue"),mxo=$("#"+prefix+"HeightMaxValue"),sum=$("#"+prefix+"HeightSummary");
  if(mno)mno.value=state.filters.minHeight===null?`下限なし (${dynamicMin}cm〜)`: `${state.filters.minHeight}cm`;
  if(mxo)mxo.value=state.filters.maxHeight===null?`上限なし (〜${dynamicMax}cm)`: `${state.filters.maxHeight}cm`;
  if(sum)sum.textContent=heightFilterText();
 }
}

function renderGachaFilters(){
 renderSharedFilterControls();$("#tagMode").value=state.filters.tagMode;
 const tagBase=tagCountBaseCharacters(),counts=new Map();
 for(const c of tagBase)for(const t of c.tags)counts.set(t,(counts.get(t)||0)+1);

 // 1人だけに付くタグは絞り込みとしてほぼ意味がないため非表示。
 // 選択中タグだけは解除可能にするため残す。
 const available=[...counts.keys()].filter(t=>(counts.get(t)||0)>=2||state.filters.tags.has(t));
 state.filters.tags=new Set([...state.filters.tags].filter(t=>counts.has(t)));
 const groups={age:[],personality:[],appearance:[],role:[]};
 for(const t of available)groups[tagGroupOf(t)].push(t);
 for(const key of Object.keys(groups))groups[key].sort((a,b)=>(counts.get(b)||0)-(counts.get(a)||0)||a.localeCompare(b,"ja"));
 $("#tagChips").innerHTML=TAG_GROUP_ORDER.map(key=>{
  const tags=groups[key];if(!tags.length)return "";
  return `<section class="tag-group"><div class="tag-group-title"><span>${TAG_GROUP_LABELS[key]}</span><span class="tag-group-total">${tags.length}タグ</span></div><div class="tag-chips">`+
   tags.map(t=>`<button type="button" class="tag-chip${state.filters.tags.has(t)?" active":""}" data-tag="${esc(t)}"><span>${esc(t)}</span><span class="tag-count">${counts.get(t)}</span></button>`).join("")+
   `</div></section>`;
 }).join("")||`<span class="label">この条件で2人以上に共通するタグはありません</span>`;
 const selectedTagCount=state.filters.tags.size;
 const tagSummary=$("#tagFilterSummary");
 if(tagSummary)tagSummary.textContent=selectedTagCount?`＋ 印象タグでさらに絞り込む（${selectedTagCount}個選択中）`:"＋ 印象タグでさらに絞り込む（任意）";
 renderPicker();renderCandidatePreview();renderSuggestions();updateCategoryStatus("character");
}
function renderPicker(){
 const candidates=filteredCharacters(),works=new Set(candidates.map(c=>c.work)),mode=WORLD_MODES[state.worldMode]||WORLD_MODES[DEFAULT_WORLD_MODE];
 $("#candidateCount").textContent=`抽選対象 ${candidates.length}人`;
 const summary=$("#filterSummaryMeta");if(summary)summary.textContent=`${mode.label}・${works.size}作品`;
}
function renderCandidatePreview(){
 const arr=candidateCharactersForChoice().slice().sort((a,b)=>{
  const w=a.work.localeCompare(b.work,"ja");if(w)return w;
  if(a.series!==b.series){const seq=orderedSeries(a.work,[a.series,b.series]);return seq.indexOf(a.series)-seq.indexOf(b.series)}
  return a.name.localeCompare(b.name,"ja",{numeric:true});
 });
 const rules=activeCharacterRuleSets(),selectedVisible=[...rules.included].filter(id=>arr.some(c=>c.id===id)).length,excludedVisible=[...rules.excluded].filter(id=>arr.some(c=>c.id===id)).length;
 $("#candidatePreviewSummary").textContent=`候補キャラ（${arr.length}人表示）`;
 $("#candidateSelectionSummary").textContent=[rules.included.size?`${rules.included.size}人を選択中${selectedVisible!==rules.included.size?`（現在表示${selectedVisible}人）`:""}`:"全員から抽選",rules.excluded.size?`${rules.excluded.size}人を除外中${excludedVisible!==rules.excluded.size?`（現在表示${excludedVisible}人）`:""}`:""].filter(Boolean).join(" ／ ");
 $("#clearCandidateRules").disabled=!rules.included.size&&!rules.excluded.size;
 const box=$("#candidatePreviewBox");
 if(box&&!box.open){$("#candidatePreview").innerHTML="";return}
 $("#candidatePreview").innerHTML=arr.length?arr.map(c=>{
  const meta=[c.series,Number.isFinite(c.heightCm)?`${c.heightCm}cm`:""].filter(Boolean).join(" / ");
  const selected=rules.included.has(c.id),excluded=rules.excluded.has(c.id);
  return `<div class="candidate-option${selected?" selected":""}${excluded?" excluded":""}">
   <button type="button" class="candidate-chip" data-toggle-candidate="${esc(c.id)}" aria-pressed="${selected}" aria-label="${esc(c.name)}を${selected?"選択から外す":"抽選対象として選択する"}"><span class="candidate-state" aria-hidden="true">${selected?"✓":""}</span><span class="candidate-name">${esc((c.favorite?"★ ":"")+c.name)}</span>${meta?`<span class="candidate-meta">${esc(meta)}</span>`:""}</button>
   <button type="button" class="candidate-exclude" data-exclude-candidate="${esc(c.id)}" aria-pressed="${excluded}" aria-label="${esc(c.name)}を${excluded?"除外から戻す":"候補から除外する"}">× ${excluded?"除外中":"除外"}</button>
  </div>`;
 }).join(""):`<span class="label">条件に合うキャラはいません</span>`;
}
function toggleCandidateIncluded(id){
 if(state.filters.characterIncluded.has(id))state.filters.characterIncluded.delete(id);
 else{state.filters.characterIncluded.add(id);state.filters.characterExcluded.delete(id)}
 save();renderPicker();renderCandidatePreview();
}
function toggleCandidateExcluded(id){
 if(state.filters.characterExcluded.has(id))state.filters.characterExcluded.delete(id);
 else{state.filters.characterExcluded.add(id);state.filters.characterIncluded.delete(id)}
 save();renderPicker();renderCandidatePreview();
}
function clearCandidateRules(){
 if(!state.filters.characterIncluded.size&&!state.filters.characterExcluded.size)return;
 state.filters.characterIncluded.clear();state.filters.characterExcluded.clear();save();renderPicker();renderCandidatePreview();showToast("キャラの選択・除外を解除しました");
}
function worldEligiblePool(key){
 const pool=state.pools[key]||[];
 return key==="situation"?pool.filter(value=>situationMatchesWorldMode(value,state.worldMode)):pool;
}
function situationWorldLabel(value){
 const labels={canon:"原作・共通",modern:"現代",school:"学園"};
 return situationWorldTags(value).map(tag=>labels[tag]||tag).join(" / ");
}
function renderWorldModeControls(){
 const mode=WORLD_MODES[state.worldMode]||WORLD_MODES[DEFAULT_WORLD_MODE];
 document.querySelectorAll("[data-world-mode]").forEach(button=>{
  const active=button.dataset.worldMode===state.worldMode;
  button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));
 });
 const total=(state.pools.situation||[]).length,eligible=worldEligiblePool("situation").length;
 const summary=$("#worldModeSummary");if(summary)summary.textContent=`${mode.label}・${eligible}/${total}件`;
}
function setWorldMode(mode){
 if(!Object.prototype.hasOwnProperty.call(WORLD_MODES,mode)||state.worldMode===mode)return;
 syncScenario();state.worldMode=mode;
 if(state.values.situation&&!situationMatchesWorldMode(state.values.situation,mode)){
  state.values.situation="";state.locks.situation=false;updateCard("situation");updateLock("situation");
  showToast("世界観に合わないシチュを解除しました");
 }
 renderWorldModeControls();if(chooserKey==="situation"){renderChooserCategoryChips();renderChooserList()}save();
}
function renderSuggestions(){
 $("#workSuggestions").innerHTML=unique(state.characters.map(c=>c.work)).map(x=>`<option value="${esc(x)}"></option>`).join("");
 $("#seriesSuggestions").innerHTML=unique(state.characters.map(c=>c.series)).map(x=>`<option value="${esc(x)}"></option>`).join("");
}
function updateCard(k){
 const el=document.querySelector(`[data-value="${k}"]`);if(!el)return;
 if(k==="character"){
   const c=currentCharacter();if(!c){el.textContent="—";updateCurrentFavoriteButton();return}
   el.innerHTML=`<span>${c.favorite?`<span class="favorite-mark">★</span>`:""}${esc(c.name)}</span><span class="char-meta">${esc([c.work,c.series].filter(Boolean).join(" / "))}</span><span class="char-meta">身長：${esc(c.heightText||"不明")}</span>`;
   updateCurrentFavoriteButton();renderWorkProfileEditor(c.work);
 }else el.textContent=state.values[k]||"—";
}
function updateCurrentFavoriteButton(){
 const b=document.querySelector("[data-favorite-current]");if(!b)return;const c=currentCharacter();
 b.classList.toggle("active",!!c?.favorite);b.textContent=c?.favorite?"★ お気に入り":"☆ お気に入り";b.disabled=!c;
}
function randomItem(arr,current){
 if(!arr.length)return null;if(arr.length===1)return arr[0];let n=current,g=0;
 while(n===current&&g++<30)n=arr[Math.floor(Math.random()*arr.length)];return n;
}
function workProtagonistProfileFor(work){
 const key=String(work||"");
 if(!key)return "";
 return Object.prototype.hasOwnProperty.call(state.workProtagonistProfiles,key)?String(state.workProtagonistProfiles[key]):String(DEFAULT_WORK_PROTAGONIST_PROFILES[key]||"");
}
function syncWorkProfileEditor(){
 const select=$("#workProfileWork"),field=$("#workProtagonistProfile");
 if(!select||!field||!select.value)return;
 const value=field.value.trim(),initial=String(DEFAULT_WORK_PROTAGONIST_PROFILES[select.value]||"");
 if(value===initial)delete state.workProtagonistProfiles[select.value];else state.workProtagonistProfiles[select.value]=value;
 const customized=Object.prototype.hasOwnProperty.call(state.workProtagonistProfiles,select.value);
 const status=$("#workProfileStatus");if(status)status.textContent=customized?(value?"変更済み":"使用しない"):"初期設定";
 const reset=$("#resetWorkProfile");if(reset)reset.disabled=!customized;
}
function renderWorkProfileEditor(preferredWork){
 const select=$("#workProfileWork"),field=$("#workProtagonistProfile");if(!select||!field)return;
 const works=unique([...Object.keys(DEFAULT_WORK_PROTAGONIST_PROFILES),...state.characters.map(c=>c.work)]);
 const chosen=works.includes(preferredWork)?preferredWork:works.includes(select.value)?select.value:works[0]||"";
 select.innerHTML=works.map(work=>`<option value="${esc(work)}">${esc(work)}</option>`).join("");select.value=chosen;
 field.value=workProtagonistProfileFor(chosen);
 const customized=Object.prototype.hasOwnProperty.call(state.workProtagonistProfiles,chosen);
 const status=$("#workProfileStatus");if(status)status.textContent=customized?(state.workProtagonistProfiles[chosen]?"変更済み":"使用しない"):"初期設定";
 const reset=$("#resetWorkProfile");if(reset)reset.disabled=!customized;
}
function syncScenario(){
 syncWorkProfileEditor();
 for(const k of Object.keys(DEFAULT_POOLS)){const e=$(`#pool-${k}`);if(e)state.pools[k]=parseLines(e.value)}
 state.basePrompt=$("#basePrompt").value.trim()||DEFAULT_BASE_PROMPT;state.protagonistProfile=$("#protagonistProfile").value.trim()||DEFAULT_PROTAGONIST_PROFILE;
 renderWorldModeControls();
}
function rollCharacter(force=false){
 if(state.locks.character&&!force)return;const arr=filteredCharacters();
 if(!arr.length){showToast("条件・カテゴリに合うガチャ対象キャラがいません");return}
 state.characterId=randomItem(arr.map(c=>c.id),state.characterId);updateCard("character");renderPicker();
}
function rollOne(k,force=false){
 syncScenario();if(k==="character")return rollCharacter(force);if(state.locks[k]&&!force)return;
 const pool=worldEligiblePool(k).filter(v=>categoryPass(k,v));
 if(!pool.length){showToast(`${META[k].label}のカテゴリ条件で候補が0件です`);return}
 state.values[k]=randomItem(pool,state.values[k]);updateCard(k);
}
function rollAll(){for(const k of Object.keys(META))rollOne(k,false);buildPrompt(false)}
function buildPrompt(scroll=true){
 syncScenario();if(!currentCharacter())rollCharacter(false);
 if(state.values.situation&&!situationMatchesWorldMode(state.values.situation,state.worldMode)){state.values.situation="";state.locks.situation=false;updateCard("situation");updateLock("situation")}
 for(const k of ["relationship","situation","mood","extra"])if(!state.values[k])rollOne(k,false);
 const c=currentCharacter();
 const world=WORLD_MODES[state.worldMode]||WORLD_MODES[DEFAULT_WORLD_MODE];
  const prompt=DreamGachaDomain.formatPrompt({basePrompt:state.basePrompt,character:c,relationship:state.values.relationship,situation:state.values.situation,mood:state.values.mood,extra:state.values.extra,protagonistProfile:state.protagonistProfile,workProtagonistProfile:workProtagonistProfileFor(c?.work),worldModeLabel:world.label,worldModePrompt:world.prompt,freeExtra:$("#freeExtra").value});
  state.promptDraftSnapshot=DreamGachaDomain.makeSnapshot({character:c,relationship:state.values.relationship,situation:state.values.situation,mood:state.values.mood,extra:state.values.extra,freeExtra:$("#freeExtra").value,protagonistProfile:state.protagonistProfile,workProtagonistProfile:workProtagonistProfileFor(c?.work),worldMode:state.worldMode,prompt});$("#output").value=prompt;save();
 if(scroll)$("#output").scrollIntoView({behavior:"smooth",block:"center"});
}
async function copyPrompt(){
 if(!$("#output").value.trim())buildPrompt(false);
 try{await navigator.clipboard.writeText($("#output").value)}catch(e){$("#output").select();document.execCommand("copy")}
 showToast("コピーしました");setStatus("ChatGPTにそのまま貼り付けられます");
}
function schedulePromptDraftSave(){clearTimeout(schedulePromptDraftSave.timer);schedulePromptDraftSave.timer=setTimeout(()=>save(),350)}
function renderPoolEditors(){
 const names={relationship:"関係性候補",situation:"シチュ候補",mood:"雰囲気候補",extra:"追加条件候補"};
 $("#poolGrid").innerHTML=Object.keys(names).map(k=>`<div class="field"><label for="pool-${k}">${names[k]} <span class="label">（${state.pools[k].length}件）</span></label><textarea id="pool-${k}" spellcheck="false">${esc(state.pools[k].join("\n"))}</textarea></div>`).join("");
 $("#basePrompt").value=state.basePrompt;
 $("#protagonistProfile").value=state.protagonistProfile||DEFAULT_PROTAGONIST_PROFILE;
 renderWorkProfileEditor(currentCharacter()?.work);renderWorldModeControls();
}

function compareManagerCharacters(a,b){
 if(a.archived!==b.archived)return a.archived?1:-1; // アーカイブは常に最後
 const byName=(x,y)=>x.name.localeCompare(y.name,"ja",{numeric:true});
 switch(state.manage.sort){
   case "name-asc": return byName(a,b);
   case "name-desc": return byName(b,a);
   case "height-asc":
   case "height-desc":{
     const ah=Number.isFinite(a.heightCm)?a.heightCm:null,bh=Number.isFinite(b.heightCm)?b.heightCm:null;
     if(ah===null&&bh===null)return byName(a,b);
     if(ah===null)return 1;if(bh===null)return -1;
     const d=state.manage.sort==="height-asc"?ah-bh:bh-ah;
     return d||byName(a,b);
   }
   case "favorite":
     if(a.favorite!==b.favorite)return a.favorite?-1:1;
     return byName(a,b);
   case "registered":{
     const ai=state.characters.indexOf(a),bi=state.characters.indexOf(b);
     return ai-bi;
   }
   case "work":
   default:{
     const w=a.work.localeCompare(b.work,"ja");
     if(w)return w;
     const seq=orderedSeries(a.work,[a.series,b.series]);
     if(a.series!==b.series)return seq.indexOf(a.series)-seq.indexOf(b.series);
     return byName(a,b);
   }
 }
}
function managerFiltered(){
 return state.characters.filter(c=>{
  if(!matchesSharedFilters(c))return false;
  if(state.manage.status==="active"&&c.archived)return false;
  if(state.manage.status==="archived"&&!c.archived)return false;
  return true;
 }).sort(compareManagerCharacters);
}function renderManagerFilters(){
 renderSharedFilterControls();
 $("#manageSort").value=state.manage.sort;
 document.querySelectorAll("[data-manage-status]").forEach(b=>b.classList.toggle("active",b.dataset.manageStatus===state.manage.status));
}function renderStats(){
 $("#statTotal").textContent=state.characters.length;
 $("#statActive").textContent=state.characters.filter(c=>!c.archived).length;
 $("#statArchived").textContent=state.characters.filter(c=>c.archived).length;
 $("#statFavorite").textContent=state.characters.filter(c=>c.favorite).length;
}

function tagPickerHtml(selected,attrs=""){
 const set=new Set(selected||[]);
 return TAG_GROUP_ORDER.map(key=>{
   const tags=CANONICAL_TAGS[key]||[];
   return `<div class="tag-picker-group"><div class="tag-picker-label">${TAG_GROUP_LABELS[key]}</div><div class="tag-picker-chips">`+
     tags.map(t=>`<button type="button" class="tag-pick${set.has(t)?" active":""}" data-pick-tag="${esc(t)}" ${attrs}>${esc(t)}</button>`).join("")+
     `</div></div>`;
 }).join("");
}
function renderAddTagPicker(){
 const selected=parseTags($("#charTags").value||"");
 $("#charTagPicker").innerHTML=tagPickerHtml(selected,'data-add-tag="1"');
}
function syncAddTagInput(){
 const selected=[...document.querySelectorAll('#charTagPicker [data-pick-tag].active')].map(b=>b.dataset.pickTag);
 $("#charTags").value=selected.join("、");
}
function inlineEditorHtml(c){
 return `<div class="inline-editor" data-inline-editor="${esc(c.id)}">
   <div class="inline-editor-head"><div class="inline-editor-title">✎ ${esc(c.name)} をその場で編集</div><span class="label">保存してもこの位置のまま</span></div>
   <div class="inline-editor-grid">
     <div class="field"><label>キャラ名</label><input type="text" data-inline-field="name" value="${esc(c.name)}"></div>
     <div class="field"><label>作品</label><input type="text" list="workSuggestions" data-inline-field="work" value="${esc(c.work)}"></div>
     <div class="field"><label>部・シリーズ</label><input type="text" list="seriesSuggestions" data-inline-field="series" value="${esc(c.series)}"></div>
     <div class="field"><label>身長</label><input type="text" data-inline-field="height" value="${esc(c.heightText||"")}"></div>
     <div class="field full"><label class="lock-label"><input type="checkbox" data-inline-field="favorite" ${c.favorite?"checked":""}> ★ お気に入り</label></div>
     <div class="field full"><label>印象タグ <span class="label">（候補をクリック）</span></label><div class="tag-picker-compact">${tagPickerHtml(c.tags,`data-inline-tag-for="${esc(c.id)}"`)}</div></div>
   </div>
   <div class="inline-editor-actions">
     <button type="button" class="primary" data-inline-save="${esc(c.id)}">保存</button>
     <button type="button" class="small-btn" data-inline-cancel="${esc(c.id)}">キャンセル</button>
   </div>
 </div>`;
}
function saveInlineCharacter(id){
 const c=state.characters.find(c=>c.id===id);if(!c)return;
 const box=document.querySelector(`[data-inline-editor="${CSS.escape(id)}"]`);if(!box)return;
 const name=box.querySelector('[data-inline-field="name"]').value.trim();
 if(!name){showToast("キャラ名を入力してください");return}
 const heightText=box.querySelector('[data-inline-field="height"]').value.trim();
 const selectedTags=[...box.querySelectorAll('[data-inline-tag-for].active')].map(b=>b.dataset.pickTag);
 const oldHeight=c.heightText||"";
 c.name=name;
 c.work=box.querySelector('[data-inline-field="work"]').value.trim();
 c.series=box.querySelector('[data-inline-field="series"]').value.trim();
 c.favorite=box.querySelector('[data-inline-field="favorite"]').checked;
 c.tags=canonicalizeTags(selectedTags);
 if(heightText!==oldHeight){
   c.heightText=heightText||"不明（公称値を確認できず）";
   c.heightCm=heightText?parseHeightCm(heightText):null;
   c.heightStatus=heightText?"manual":"unknown";
   c.heightSource=heightText?"手動登録（未検証）":"今回確認できた公称資料では数値を特定できず。推測値は登録していません。";
 }
 state.inlineEditingId=null;
 state.characters=cleanupCharacterData(state.characters);
 save();renderManager();renderGachaFilters();updateCard("character");
 showToast("キャラ情報を更新しました");
}

function renderManager(){
 renderManagerFilters();renderStats();renderSuggestions();
 const arr=managerFiltered(), table=$("#characterTable");
 state.selectedIds=new Set([...state.selectedIds].filter(id=>state.characters.some(c=>c.id===id)));
 if(!arr.length) table.innerHTML=`<div class="empty">条件に合うキャラはいません</div>`;
 else table.innerHTML=arr.map(c=>{
   const row=`<div class="char-row${c.archived?" archived":""}">
   <input class="row-check" type="checkbox" data-select="${esc(c.id)}" ${state.selectedIds.has(c.id)?"checked":""}>
   <div><div class="char-name">${c.favorite?`<span class="favorite-mark">★</span>`:""}${esc(c.name)}</div><div class="char-sub">${c.archived?"📦 アーカイブ":"🎲 ガチャ対象"}${c.favorite?" ・ ★お気に入り":""}</div></div>
   <div class="work-cell"><div>${esc(c.work||"作品未設定")}</div><div class="char-sub">${esc(c.series||"部・シリーズ未設定")}</div></div>
   <div class="tags-cell mini-tags">${c.tags.map(t=>`<span class="mini-tag">${esc(t)}</span>`).join("")||`<span class="char-sub">タグなし</span>`}</div>
   <div class="height-cell"><div class="height-main">${esc(c.heightText||"不明")}</div></div>
   <div class="row-actions"><button class="favorite-btn${c.favorite?" active":""}" data-favorite="${esc(c.id)}">${c.favorite?"★":"☆"}</button><button class="small-btn" data-edit="${esc(c.id)}">${state.inlineEditingId===c.id?"閉じる":"編集"}</button>
     <button class="${c.archived?"ok-btn":"small-btn"}" data-archive="${esc(c.id)}">${c.archived?"復元":"アーカイブ"}</button></div>
   </div>`;
   return row+(state.inlineEditingId===c.id?inlineEditorHtml(c):"");
 }).join("");
 $("#manageCount").textContent=`表示 ${arr.length}件 / 全${state.characters.length}件`;
 updateSelectedUI();
}
function updateSelectedUI(){
 $("#selectedCount").textContent=`${state.selectedIds.size}件選択`;
 const arr=managerFiltered();$("#selectAllVisible").checked=arr.length>0&&arr.every(c=>state.selectedIds.has(c.id));
}
function clearForm(){
 state.editingCharacterId=null;$("#charName").value="";$("#charWork").value="";$("#charSeries").value="";$("#charHeight").value="";$("#charFavorite").checked=false;$("#charTags").value="";
 $("#saveCharacter").textContent="＋ キャラを追加";$("#formTitle").textContent="キャラを追加";renderAddTagPicker();
}
function parseHeightCm(text){
 const m=String(text||"").match(/(\d+(?:\.\d+)?)\s*cm/i);
 return m?Number(m[1]):null;
}
function saveCharacterForm(){
 const name=$("#charName").value.trim();if(!name){showToast("キャラ名を入力してください");return $("#charName").focus()}
 const heightText=$("#charHeight").value.trim();
 const data={name,work:$("#charWork").value.trim(),series:$("#charSeries").value.trim(),tags:parseTags($("#charTags").value),favorite:$("#charFavorite").checked};
 state.characters.push({id:makeId(),...data,archived:false,heightText:heightText||"不明（公称値を確認できず）",
   heightCm:heightText?parseHeightCm(heightText):null,heightStatus:heightText?"manual":"unknown",
   heightSource:heightText?"手動登録（未検証）":"今回確認できた公称資料では数値を特定できず。推測値は登録していません。"});
 showToast(`${name}を追加しました`);
 clearForm();save();renderManager();renderGachaFilters();
}
function editCharacter(id){
 state.inlineEditingId=state.inlineEditingId===id?null:id;
 renderManager();
 if(state.inlineEditingId){
   requestAnimationFrame(()=>document.querySelector(`[data-inline-editor="${CSS.escape(id)}"]`)?.scrollIntoView({behavior:"smooth",block:"nearest"}));
 }
}
function toggleArchive(ids,archived){
 for(const id of ids){const c=state.characters.find(c=>c.id===id);if(c)c.archived=archived}
 if(archived)for(const id of ids){state.filters.characterIncluded.delete(id);state.filters.characterExcluded.delete(id)}
 if(currentCharacter()?.archived||!state.characters.some(c=>c.id===state.characterId&&!c.archived)){state.characterId=null;updateCard("character")}
 state.selectedIds.clear();save();renderManager();renderGachaFilters();showToast(archived?"アーカイブしました":"ガチャ対象に戻しました");
}
function deleteIds(ids){
 const arr=state.characters.filter(c=>ids.includes(c.id));if(!arr.length)return;
 if(!confirm(`${arr.length}件のキャラを完全に削除しますか？\nアーカイブなら後から戻せます。`))return;
 for(const c of arr)if(c.id.startsWith("seed-"))state.deletedSeedIds.add(c.id);
 state.characters=state.characters.filter(c=>!ids.includes(c.id));
 for(const id of ids){state.filters.characterIncluded.delete(id);state.filters.characterExcluded.delete(id)}
 if(ids.includes(state.characterId)){state.characterId=null;updateCard("character")}
 state.selectedIds.clear();save();renderManager();renderGachaFilters();showToast(`${arr.length}件削除しました`);
}
function setFavorite(ids,value){
 let changed=0;
 for(const id of ids){const c=state.characters.find(c=>c.id===id);if(c&&c.favorite!==value){c.favorite=value;changed++}}
 if(!changed)return showToast(value?"すでにお気に入りです":"すでにお気に入り解除済みです");
 save();renderManager();renderGachaFilters();updateCard("character");showToast(value?`★ ${changed}件をお気に入りにしました`:`☆ ${changed}件のお気に入りを解除しました`);
}
function toggleFavorite(ids){
 for(const id of ids){const c=state.characters.find(c=>c.id===id);if(c)c.favorite=!c.favorite}
 save();renderManager();renderGachaFilters();updateCard("character");showToast("お気に入りを更新しました");
}
function exportCharacterPayload(chars){
 return {schema:"dream-gacha.characters",version:1,app:"夢小説シチュガチャ",exportedAt:new Date().toISOString(),characters:chars.map(c=>({
   id:c.id,name:c.name,work:c.work,series:c.series,tags:[...c.tags],archived:!!c.archived,favorite:!!c.favorite,
   heightText:c.heightText||"",heightCm:c.heightCm??null,heightStatus:c.heightStatus||"unknown",heightSource:c.heightSource||""
 }))};
}
function downloadJson(data,filename){
 const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
}
function exportCharacters(mode){
 let arr=state.characters;
 if(mode==="selected"){
   if(!state.selectedIds.size)return showToast("書き出すキャラをチェックしてください");
   arr=state.characters.filter(c=>state.selectedIds.has(c.id));
 }
 const d=new Date(),stamp=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
 downloadJson(exportCharacterPayload(arr),`dream-gacha-characters-${mode}-${stamp}.json`);showToast(`${arr.length}件を書き出しました`);
}
function exportTemplate(){
 const data={schema:"dream-gacha.characters",version:1,instructions:"characters にキャラを追加してください。name は必須です。tags は許可された共通タグだけを使い、身長不明なら heightCm=null、heightStatus=unknown にしてください。",characters:[{
   name:"キャラクター名",work:"作品名",series:"部・シリーズ",tags:["年上系","冷静","優しい"],archived:false,favorite:false,
   heightText:"180cm",heightCm:180,heightStatus:"verified",heightSource:"公式プロフィール名またはURL"
 }]};
 downloadJson(data,"dream-gacha-character-template.json");showToast("ChatGPT用テンプレートを書き出しました");
}
function allowedTagPromptText(){return TAG_GROUP_ORDER.map(key=>`${TAG_GROUP_LABELS[key]}：${CANONICAL_TAGS[key].join(" / ")}`).join("\n")}
function buildCharacterResearchPrompt(workName=""){
 const work=String(workName||"").trim()||"【作品名】";
 const workJson=JSON.stringify(work);
 return `夢小説シチュガチャに読み込むため、「${work}」に登場する男性キャラクターを調査し、JSONファイル用のデータを作ってください。

【調査範囲】
- 主人公・味方・敵・脇役を問わず、作中または公式資料で固有名が確認できる男性キャラクターを可能な限り網羅してください。
- 同一人物の別名・変装・成長後などは原則1件にまとめ、必要なら name や series で分かるようにしてください。
- 性別が公式に男性と確認できないキャラクター、名前のないモブ、実在の出演者・声優は含めないでください。
- ウェブ検索が使える場合は、公式サイト、公式プロフィール、出版社・制作会社、公式設定資料を優先して確認してください。

【身長と出典】
- 公称身長を確認し、heightText に表示用の値、heightCm に代表値をcm単位の数値で入れてください。
- 媒体や時期で公式値が異なる場合は heightText に併記し、heightSource にどの値を採用したか分かる出典名またはURLを書いてください。
- 公称値を確認できない場合は推測せず、heightText は「不明」、heightCm は null、heightStatus は "unknown" としてください。
- 公称値を確認できた場合だけ heightStatus を "verified" としてください。

【印象タグ】
- 各キャラの公式描写に合うものを、次の許可タグから2〜6個程度選んでください。
- 一覧にないタグ、類義語、キャラ1人だけに使う細かいタグは作らないでください。
${allowedTagPromptText()}

【JSON形式】
{
  "schema": "dream-gacha.characters",
  "version": 1,
  "characters": [
    {
      "name": "キャラクター名",
      "work": ${workJson},
      "series": "部・シリーズ。なければ空文字",
      "tags": ["冷静", "知的"],
      "archived": false,
      "favorite": false,
      "heightText": "180cm",
      "heightCm": 180,
      "heightStatus": "verified",
      "heightSource": "具体的な出典名またはURL"
    }
  ]
}

出力前に、重複、女性キャラクターの混入、架空の身長、許可外タグがないか確認してください。
最終出力は有効なJSONだけにし、説明文・注釈・Markdownのコードフェンスは付けないでください。`;
}
const CHARACTER_SCHEMA_PROMPT=buildCharacterResearchPrompt();
async function copyTextToClipboard(value){
 try{await navigator.clipboard.writeText(value)}catch(e){const ta=document.createElement("textarea");ta.value=value;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove()}
}
async function copySchemaPrompt(){
 await copyTextToClipboard(CHARACTER_SCHEMA_PROMPT);showToast("キャラファイル作成用プロンプトをコピーしました");
}
function renderCharacterImportGuide(){
 const input=$("#characterResearchWork"),preview=$("#characterResearchPromptPreview"),tags=$("#allowedTagGuide");if(!input||!preview||!tags)return;
 preview.value=buildCharacterResearchPrompt(input.value);
 tags.innerHTML=TAG_GROUP_ORDER.map(key=>`<section class="allowed-tag-group"><div class="allowed-tag-label">${esc(TAG_GROUP_LABELS[key])}</div><div class="allowed-tag-list">${CANONICAL_TAGS[key].map(tag=>`<span class="allowed-tag">${esc(tag)}</span>`).join("")}</div></section>`).join("");
}
async function copyCharacterResearchPrompt(){
 const work=$("#characterResearchWork").value.trim();if(!work){$("#characterResearchWork").focus();return showToast("先に作品名を入力してください")}
 await copyTextToClipboard(buildCharacterResearchPrompt(work));showToast(`「${work}」の調査用プロンプトをコピーしました`);
}
function normalizeImported(raw,existing=null){
 const merged={...(existing||{}),...raw,id:existing?.id||raw.id||makeId()};
 if(raw.heightText!==undefined&&raw.heightStatus===undefined&&!existing){merged.heightStatus=raw.heightText&&String(raw.heightText).includes("不明")?"unknown":"manual"}
 if(raw.heightText!==undefined&&raw.heightSource===undefined&&!existing){merged.heightSource=merged.heightStatus==="unknown"?"インポート時に公称出典未指定":"インポートデータ（出典未指定）"}
 return normalize(merged);
}
function dedupeImported(rawList){
 const normalized=rawList.filter(raw=>raw&&typeof raw==="object"&&!Array.isArray(raw)&&String(raw.name||"").trim()).map(raw=>normalizeImported(raw));
 return cleanupCharacterData(normalized);
}
function analyzeWorkReplacement(raws){
 const works=unique(raws.map(c=>c.work));
 if(raws.some(c=>!c.work)||works.length!==1||!works[0])throw new Error("作品単位の置換では、全キャラに同じ作品名が入った1作品だけのJSONを使用してください");
 const work=works[0],oldWork=state.characters.filter(c=>c.work===work),used=new Set();
 const matches=raws.map(raw=>{
  const exact=oldWork.find(c=>!used.has(c.id)&&((raw.id&&c.id===raw.id)||characterIdentityKey(c)===characterIdentityKey(raw)));
  const sameName=oldWork.filter(c=>!used.has(c.id)&&c.name===raw.name);
  const existing=exact||(sameName.length===1?sameName[0]:null);
  if(existing)used.add(existing.id);
  return existing;
 });
 return {work,oldWork,matches,current:oldWork.length,total:raws.length,added:matches.filter(x=>!x).length,updated:matches.filter(Boolean).length,removed:oldWork.filter(c=>!used.has(c.id)).length};
}
function importCharactersData(data,mode){
 const list=Array.isArray(data)?data:Array.isArray(data?.characters)?data.characters:null;
 if(!list)throw new Error("characters 配列が見つかりません");
 const raws=dedupeImported(list);if(!raws.length)throw new Error("有効なキャラが1件もありません");
 let added=0,updated=0;
 if(mode==="work-replace"){
   const plan=analyzeWorkReplacement(raws),{work,oldWork,matches}=plan;
   const nextWork=raws.map((raw,index)=>{
     const existing=matches[index];
     if(!existing){added++;return raw}
     updated++;
     const next={...raw,id:existing.id,favorite:existing.favorite,archived:existing.archived};
     if(existing.heightStatus==="manual"&&raw.heightStatus!=="verified")for(const key of ["heightText","heightCm","heightStatus","heightSource"])next[key]=existing[key];
     return next;
   });
   const firstIndex=state.characters.findIndex(c=>c.work===work),without=state.characters.filter(c=>c.work!==work),insertAt=firstIndex<0?without.length:state.characters.slice(0,firstIndex).filter(c=>c.work!==work).length;
   without.splice(insertAt,0,...nextWork);state.characters=cleanupCharacterData(without);
   const importedSeedIds=new Set(nextWork.map(c=>c.id)),importedKeys=new Set(nextWork.map(c=>c.work+"\u0000"+c.name));
   for(const seed of DEFAULT_CHARACTERS.filter(c=>c.work===work)){
     if(importedSeedIds.has(seed.id)||importedKeys.has(seed.work+"\u0000"+seed.name))state.deletedSeedIds.delete(seed.id);else state.deletedSeedIds.add(seed.id);
   }
   const validIds=new Set(state.characters.map(c=>c.id));
   state.filters.characterIncluded=new Set([...state.filters.characterIncluded].filter(id=>validIds.has(id)));state.filters.characterExcluded=new Set([...state.filters.characterExcluded].filter(id=>validIds.has(id)));
   if(state.characterId&&!validIds.has(state.characterId))state.characterId=null;
   state.selectedIds.clear();
   const result={added,updated,removed:plan.removed,total:raws.length,work};
   save();renderManager();renderGachaFilters();updateCard("character");return result;
 }else if(mode==="replace"){
   const next=cleanupCharacterData(raws);
   const importedSeedIds=new Set(next.map(c=>c.id));
   const importedKeys=new Set(next.map(c=>c.work+"\u0000"+c.name));
   state.deletedSeedIds=new Set(DEFAULT_CHARACTERS.filter(seed=>!importedSeedIds.has(seed.id)&&!importedKeys.has(seed.work+"\u0000"+seed.name)).map(seed=>seed.id));
   state.characters=next;added=next.length;state.selectedIds.clear();state.filters.characterIncluded.clear();state.filters.characterExcluded.clear();state.characterId=null;
 }else{
   for(const raw of raws){
     const existing=state.characters.find(c=>(raw.id&&c.id===raw.id)||characterIdentityKey(c)===characterIdentityKey(raw));
     const normalized=existing?mergeCharacterRecords(existing,raw):raw;
     if(existing){Object.assign(existing,normalized);updated++}else{state.characters.push(normalized);added++}
   }
   state.characters=cleanupCharacterData(state.characters);
 }
 save();renderManager();renderGachaFilters();updateCard("character");
 return {added,updated,removed:0,total:raws.length};
}
let pendingCharacterImportMode=null;
async function handleImportFile(file,requestedMode){
 const text=await file.text();let data;
 try{data=JSON.parse(text)}catch(e){throw new Error("JSONとして読み込めませんでした")}
 const mode=requestedMode||$("#importMode").value;
 if(mode==="work-replace"){
  const list=Array.isArray(data)?data:data?.characters;
  if(!Array.isArray(list))throw new Error("characters 配列が見つかりません");
  const raws=dedupeImported(list);if(!raws.length)throw new Error("有効なキャラが1件もありません");
  const plan=analyzeWorkReplacement(raws);
  if(!confirm(`【${plan.work}】を作品単位で置換します。\n現在：${plan.current}人 ／ JSON：${plan.total}人\n新規：${plan.added}人 ／ 更新：${plan.updated}人 ／ 削除候補：${plan.removed}人\n\n同じキャラのお気に入り・アーカイブ・手動登録した身長は引き継ぎます。続けますか？`))return null;
 }
 if(mode==="replace"&&!confirm("現在のキャラ一覧を、読み込むファイルの内容で置き換えます。\nシチュ設定は変更しません。続けますか？"))return null;
 return importCharactersData(data,mode);
}


async function fullBackupPayload(){
 syncScenario();const novels=await novelAll();
 return DreamGachaStorage.makeBackup({...state,freeExtra:$("#freeExtra").value},novels);
}
function backupTimestamp(){const d=new Date(),pad=n=>String(n).padStart(2,"0");return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`}
async function exportFullBackup(){try{const stamp=backupTimestamp(),payload=await fullBackupPayload();downloadJson(payload,`dream-gacha-full-backup-${stamp}.json`);showToast("完全バックアップを書き出しました")}catch(e){alert(`完全バックアップを書き出せませんでした：${e.message}`)}}
function backupCounts(settings,novels){const characters=settings?.characters||[];return {characters:characters.length,favorites:characters.filter(c=>c.favorite).length,archived:characters.filter(c=>c.archived).length,presets:(settings?.presets||[]).length,workProfiles:Object.keys(settings?.workProtagonistProfiles||{}).length,novels:(novels||[]).length}}
function backupCountText(counts){return `ブラウザ設定：キャラ${counts.characters}件（お気に入り${counts.favorites}件・アーカイブ${counts.archived}件）・保存条件${counts.presets}件・作品別設定${counts.workProfiles}件 ／ 夢小説：${counts.novels}本`}
function renderBackupRestoreStatus(kind,message){const box=$("#backupRestoreStatus");if(!box)return;box.className=`backup-restore-status${kind?` ${kind}`:""}`;box.textContent=message}
async function restoreFullBackup(data){
 let phase="バックアップ内容の検証";
 try{
  const validated=DreamGachaStorage.validateBackup(data),b=prepareSettings(validated,true);
  phase="復元前の夢小説読み込み";
  const currentNovels=await novelAll(),nextNovels=Object.prototype.hasOwnProperty.call(validated,"novels")?validated.novels:currentNovels;
  const before=backupCounts(state,currentNovels),after=backupCounts(b,nextNovels),nextSettings=DreamGachaStorage.plainSettings(b);
  phase="ブラウザ設定と夢小説の書き込み";
  await DreamGachaStorage.restoreAtomically({
   // Preserve the exact stored text for rollback. A malformed old setting must
   // not prevent a valid full backup from repairing it.
   readSettings:async()=>localStorage.getItem(DreamGachaData.SETTINGS_KEY),readNovels:()=>Promise.resolve(currentNovels),
   writeSettings:async value=>{phase="localStorage系の復元";try{return value===null?localStorage.removeItem(DreamGachaData.SETTINGS_KEY):localStorage.setItem(DreamGachaData.SETTINGS_KEY,typeof value==="string"?value:JSON.stringify(value))}catch(error){throw new Error(`ブラウザ設定の書き込み：${error.message}`)}},
   writeNovels:async value=>{phase="IndexedDBの復元";try{return await replaceAllNovels(value)}catch(error){throw new Error(`夢小説アーカイブの書き込み：${error.message}`)}}
  },{settings:nextSettings,novels:nextNovels});
  phase="復元後の画面更新";
  applySettingsState(b);applyTheme();state.selectedIds.clear();state.inlineEditingId=null;
  novelCache=structuredClone(nextNovels).sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  renderPoolEditors();renderGachaFilters();renderManager();renderPresetList();renderNovelList();
  for(const k of ["character","relationship","situation","mood","extra"]){updateCard(k);updateCategoryStatus(k);const i=document.querySelector(`[data-lock="${k}"]`);if(i)i.checked=!!state.locks[k];updateLock(k)}
  renderBackupRestoreStatus("success",`復元しました。復元前［${backupCountText(before)}］ → 復元後［${backupCountText(after)}］`);showToast("完全バックアップを復元しました");return {before,after};
 }catch(error){
  const details=[error,...(Array.isArray(error?.errors)?error.errors:[])].map(item=>String(item?.message||item)).join(" ／ ");
  const failedPhase=details.includes("ブラウザ設定")?"localStorage系の復元":details.includes("夢小説アーカイブ")?"IndexedDBの復元":phase;
  const message=`${failedPhase}で失敗しました：${details}`;renderBackupRestoreStatus("error",message);throw new Error(message)
 }
}
async function handleFullBackupFile(file){
 const text=await file.text();let data;try{data=JSON.parse(text)}catch(e){const message="JSONファイルの解析で失敗しました：JSONとして読み込めませんでした";renderBackupRestoreStatus("error",message);throw new Error(message)}
 if(!confirm("現在のキャラ・アーカイブ・お気に入り・シチュ候補・固定プロンプト・保存条件・夢小説アーカイブ等を、バックアップ内容で丸ごと置き換えます。続けますか？"))return;
 await restoreFullBackup(data);
}

function resetScenario(){
 if(!confirm("シチュ・雰囲気・追加条件・世界観・夢主設定・固定プロンプトを初期状態に戻しますか？\nキャラ一覧は変更しません。"))return;
 state.pools=structuredClone(DEFAULT_POOLS);state.basePrompt=DEFAULT_BASE_PROMPT;state.protagonistProfile=DEFAULT_PROTAGONIST_PROFILE;state.workProtagonistProfiles={};state.worldMode=DEFAULT_WORLD_MODE;
 for(const k of ["relationship","situation","mood","extra"]){state.categoryInclude[k]=null;state.categoryExcluded[k].clear();updateCategoryStatus(k)}
 renderPoolEditors();save();showToast("シチュ設定を初期化しました");
}
function setStatus(m){$("#status").textContent=m;clearTimeout(setStatus.t);setStatus.t=setTimeout(()=>$("#status").textContent="",2600)}
function showSettingsSavedState(){
 const button=$("#saveSettings"),status=$("#settingsSaveStatus");if(button){button.classList.add("is-saved");clearTimeout(showSettingsSavedState.buttonTimer);showSettingsSavedState.buttonTimer=setTimeout(()=>button.classList.remove("is-saved"),2600)}
 if(status){status.textContent="保存しました";clearTimeout(showSettingsSavedState.statusTimer);showSettingsSavedState.statusTimer=setTimeout(()=>status.textContent="",2600)}
}
function showToast(m){const e=$("#toast");e.textContent=m;e.classList.add("show");clearTimeout(showToast.t);showToast.t=setTimeout(()=>e.classList.remove("show"),1700)}

function init(){
 const tabs=[...document.querySelectorAll(".tab-btn")];
 tabs.forEach((b,index)=>{
  b.addEventListener("click",()=>switchScreen(b.dataset.screen));
  b.addEventListener("keydown",e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const next=e.key==="Home"?0:e.key==="End"?tabs.length-1:(index+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;switchScreen(tabs[next].dataset.screen);tabs[next].focus()});
 });
 document.addEventListener("click",e=>{const b=e.target.closest("[data-go-screen]");if(b)goToScreen(b.dataset.goScreen,b.dataset.scrollTarget)});
 const compactResults=window.matchMedia?.("(max-width: 780px)");compactResults?.addEventListener?.("change",e=>document.querySelectorAll(".result-detail").forEach(detail=>detail.open=!e.matches));
 const colorScheme=window.matchMedia?.("(prefers-color-scheme: dark)");colorScheme?.addEventListener?.("change",()=>{if(state.themeMode==="system")applyTheme()});

 load();applyTheme();renderResultCards();renderPoolEditors();renderGachaFilters();renderAddTagPicker();renderCharacterImportGuide();renderLibrary();
  $("#choiceClose").addEventListener("click",closeChooser);
  $("#choiceSearch").addEventListener("input",renderChooserList);
  $("#choiceCategoryClear").addEventListener("click",()=>{if(chooserKey)clearCategoryRules(chooserKey)});
  $("#choiceCategoryChips").addEventListener("click",e=>{
    if(!chooserKey)return;
    const include=e.target.closest("[data-category-include]");
    if(include)return setCategoryInclude(chooserKey,include.dataset.categoryInclude);
    const exclude=e.target.closest("[data-category-exclude]");
    if(exclude)toggleCategoryExclude(chooserKey,exclude.dataset.categoryExclude);
  });
  $("#choiceCategoryChips").addEventListener("contextmenu",e=>{
    const b=e.target.closest("[data-category-include]");if(!b||!chooserKey)return;
    e.preventDefault();toggleCategoryExclude(chooserKey,b.dataset.categoryInclude);
  });
 $("#choiceList").addEventListener("click",e=>{const b=e.target.closest("[data-choice-value]");if(b)chooseValue(b.dataset.choiceValue)});
 $("#choiceModal").addEventListener("click",e=>{if(e.target===$("#choiceModal"))closeChooser()});
 document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(!$("#novelModal").hidden)closeNovelView();else if(!$("#choiceModal").hidden)closeChooser()});
 document.addEventListener("click",e=>{
  const mode=e.target.closest("[data-facet-mode-for] [data-facet-mode]");
  if(mode){const kind=mode.closest("[data-facet-mode-for]").dataset.facetModeFor;state.filterEditMode[kind]=mode.dataset.facetMode;renderSharedFilterControls();return}
  const chip=e.target.closest("[data-facet-kind][data-facet-value]");if(chip)toggleFacet(chip.dataset.facetKind,chip.dataset.facetValue);
 });
 document.addEventListener("contextmenu",e=>{const chip=e.target.closest("[data-facet-kind][data-facet-value]");if(!chip)return;e.preventDefault();toggleFacet(chip.dataset.facetKind,chip.dataset.facetValue,"exclude")});
 $("#gachaSearch").addEventListener("input",e=>{state.filters.search=e.target.value;renderGachaFilters();renderManager()});
 document.addEventListener("click",e=>{const b=e.target.closest("[data-favorite-filter]");if(!b)return;toggleFavoriteFilter()});
 for(const prefix of ["gacha","manage"]){
  $("#"+prefix+"HeightMin").addEventListener("input",e=>{setHeightFilterFromSlider("min",e.target.value);renderGachaFilters();renderManager()});
  $("#"+prefix+"HeightMax").addEventListener("input",e=>{setHeightFilterFromSlider("max",e.target.value);renderGachaFilters();renderManager()});
 }
 $("#tagMode").addEventListener("change",e=>{state.filters.tagMode=e.target.value;renderPicker()});
 $("#tagChips").addEventListener("click",e=>{const b=e.target.closest("[data-tag]");if(!b)return;const t=b.dataset.tag;state.filters.tags.has(t)?state.filters.tags.delete(t):state.filters.tags.add(t);renderGachaFilters()});
 $("#candidatePreview").addEventListener("click",e=>{const x=e.target.closest("[data-exclude-candidate]");if(x)return toggleCandidateExcluded(x.dataset.excludeCandidate);const b=e.target.closest("[data-toggle-candidate]");if(b)toggleCandidateIncluded(b.dataset.toggleCandidate)});
 $("#candidatePreview").addEventListener("contextmenu",e=>{const b=e.target.closest("[data-toggle-candidate]");if(!b)return;e.preventDefault();toggleCandidateExcluded(b.dataset.toggleCandidate)});
 $("#candidatePreviewBox").addEventListener("toggle",e=>{if(e.currentTarget.open)renderCandidatePreview();else $("#candidatePreview").innerHTML=""});
 $("#clearCandidateRules").addEventListener("click",clearCandidateRules);
 $("#clearFilters").addEventListener("click",()=>{const characterIncluded=state.filters.characterIncluded,characterExcluded=state.filters.characterExcluded;state.filters={search:"",workIncluded:new Set(),workExcluded:new Set(),seriesIncluded:new Set(),seriesExcluded:new Set(),tags:new Set(),tagMode:"all",favorite:"all",minHeight:null,maxHeight:null,characterIncluded,characterExcluded};$("#tagMode").value="all";renderGachaFilters();renderManager();showToast("検索・作品・タグなどを解除しました")});
 $("#lockAllResults").addEventListener("click",()=>setAllLocks(true));
 $("#unlockAllResults").addEventListener("click",()=>setAllLocks(false));
 $("#resetAllCategoryRules").addEventListener("click",resetAllCategoryRules);
 $("#worldModeOptions").addEventListener("click",e=>{const b=e.target.closest("[data-world-mode]");if(b)setWorldMode(b.dataset.worldMode)});
 $("#themeMode").addEventListener("change",e=>setTheme(e.target.value));
 $("#rollAll").addEventListener("click",rollAll);$("#buildPrompt").addEventListener("click",()=>buildPrompt(true));$("#copyPrompt").addEventListener("click",copyPrompt);
 $("#saveCurrentPreset").addEventListener("click",saveCurrentConditionsPreset);$("#openNovelSave").addEventListener("click",prepareNovelSave);$("#savePresetFromLibrary").addEventListener("click",saveCurrentConditionsPreset);$("#saveNovel").addEventListener("click",saveNovelArchive);
  $("#novelSearch").addEventListener("input",renderNovelList);$("#novelBody").addEventListener("input",()=>$("#novelBodyCount").textContent=fmtChars(novelCharCount($("#novelBody").value)));$("#novelFavoriteOnly").addEventListener("click",()=>{novelFavoriteOnly=!novelFavoriteOnly;$("#novelFavoriteOnly").classList.toggle("active",novelFavoriteOnly);renderNovelList()});$("#output").addEventListener("input",()=>{if(state.promptDraftSnapshot)state.promptDraftSnapshot.prompt=$("#output").value;else state.promptDraftSnapshot=snapshotCurrentConditions();schedulePromptDraftSave()});
 $("#presetList").addEventListener("click",e=>{const a=e.target.closest("[data-apply-preset]");if(a){const p=state.presets.find(x=>x.id===a.dataset.applyPreset);if(p)applySnapshot(p.snapshot);return}const r=e.target.closest("[data-reroll-preset]");if(r){const p=state.presets.find(x=>x.id===r.dataset.rerollPreset);if(p)rerollSnapshotScenario(p.snapshot);return}const d=e.target.closest("[data-delete-preset]");if(d){const p=state.presets.find(x=>x.id===d.dataset.deletePreset);if(p&&confirm(`「${p.name}」を削除しますか？`)){state.presets=state.presets.filter(x=>x.id!==p.id);save();renderPresetList()}}});
  $("#novelList").addEventListener("click",async e=>{try{const o=e.target.closest("[data-open-novel]");if(o){openNovelView(novelCache.find(n=>n.id===o.dataset.openNovel));return}const edit=e.target.closest("[data-edit-novel]");if(edit){openNovelView(novelCache.find(n=>n.id===edit.dataset.editNovel));startNovelEdit();return}const copy=e.target.closest("[data-copy-novel]");if(copy){await copyNovelArchive(novelCache.find(n=>n.id===copy.dataset.copyNovel));return}const exportButton=e.target.closest("[data-export-novel]");if(exportButton){downloadNovelTxt(novelCache.find(n=>n.id===exportButton.dataset.exportNovel));showToast("TXTを書き出しました");return}const r=e.target.closest("[data-reuse-novel]");if(r){const n=novelCache.find(n=>n.id===r.dataset.reuseNovel);if(n)applySnapshot(n.snapshot);return}const s=e.target.closest("[data-reroll-novel]");if(s){const n=novelCache.find(n=>n.id===s.dataset.rerollNovel);if(n)rerollSnapshotScenario(n.snapshot);return}const f=e.target.closest("[data-fav-novel]");if(f){await toggleNovelFavorite(f.dataset.favNovel);return}const d=e.target.closest("[data-delete-novel]");if(d){await deleteNovelArchive(d.dataset.deleteNovel)}}catch(err){alert(`夢小説アーカイブを更新できませんでした：${err.message}`)}});
  $("#novelViewClose").addEventListener("click",closeNovelView);$("#startNovelEdit").addEventListener("click",startNovelEdit);$("#cancelNovelEdit").addEventListener("click",cancelNovelEdit);$("#saveNovelEdit").addEventListener("click",()=>saveNovelEdit().catch(err=>alert(`夢小説を更新できませんでした：${err.message}`)));$("#novelEditBody").addEventListener("input",()=>$("#novelEditCount").textContent=fmtChars(novelCharCount($("#novelEditBody").value)));$("#novelModal").addEventListener("click",e=>{if(e.target===$("#novelModal"))closeNovelView()});
 $("#saveSettings").addEventListener("click",()=>{syncScenario();save(true)});$("#resetScenarioSettings").addEventListener("click",resetScenario);$("#freeExtra").addEventListener("change",()=>save());
 $("#workProfileWork").addEventListener("change",e=>renderWorkProfileEditor(e.target.value));
 $("#workProtagonistProfile").addEventListener("input",syncWorkProfileEditor);
 $("#resetWorkProfile").addEventListener("click",()=>{const work=$("#workProfileWork").value;if(!work)return;delete state.workProtagonistProfiles[work];renderWorkProfileEditor(work);save();showToast("作品別の夢主設定を初期化しました")});

 $("#manageSearch").addEventListener("input",e=>{state.filters.search=e.target.value;renderManager();renderGachaFilters()});
 $("#manageSort").addEventListener("change",e=>{state.manage.sort=e.target.value;renderManager()});
 $("#manageStatusButtons").addEventListener("click",e=>{const b=e.target.closest("[data-manage-status]");if(!b)return;state.manage.status=state.manage.status===b.dataset.manageStatus?"all":b.dataset.manageStatus;renderManager()});
 $("#clearSharedManagerFilters").addEventListener("click",()=>{state.filters.search="";state.filters.workIncluded.clear();state.filters.workExcluded.clear();state.filters.seriesIncluded.clear();state.filters.seriesExcluded.clear();state.filters.favorite="all";state.filters.minHeight=null;state.filters.maxHeight=null;renderManager();renderGachaFilters();showToast("共通検索条件を解除しました")});
 $("#selectAllVisible").addEventListener("change",e=>{for(const c of managerFiltered())e.target.checked?state.selectedIds.add(c.id):state.selectedIds.delete(c.id);renderManager()});
 $("#characterTable").addEventListener("change",e=>{const i=e.target.closest("[data-select]");if(!i)return;i.checked?state.selectedIds.add(i.dataset.select):state.selectedIds.delete(i.dataset.select);updateSelectedUI()});
 $("#characterTable").addEventListener("click",e=>{
   const tag=e.target.closest("[data-inline-tag-for]");if(tag){tag.classList.toggle("active");return}
   const sv=e.target.closest("[data-inline-save]");if(sv)return saveInlineCharacter(sv.dataset.inlineSave);
   const cn=e.target.closest("[data-inline-cancel]");if(cn){state.inlineEditingId=null;return renderManager()}
   const fav=e.target.closest("[data-favorite]");if(fav)return toggleFavorite([fav.dataset.favorite]);
   const ed=e.target.closest("[data-edit]");if(ed)return editCharacter(ed.dataset.edit);
   const ar=e.target.closest("[data-archive]");if(ar){const c=state.characters.find(c=>c.id===ar.dataset.archive);if(c)toggleArchive([c.id],!c.archived)}
 });
 $("#bulkFavorite").addEventListener("click",()=>state.selectedIds.size?setFavorite([...state.selectedIds],true):showToast("キャラを選択してください"));
 $("#bulkUnfavorite").addEventListener("click",()=>state.selectedIds.size?setFavorite([...state.selectedIds],false):showToast("キャラを選択してください"));
 $("#bulkArchive").addEventListener("click",()=>state.selectedIds.size?toggleArchive([...state.selectedIds],true):showToast("キャラを選択してください"));
 $("#bulkRestore").addEventListener("click",()=>state.selectedIds.size?toggleArchive([...state.selectedIds],false):showToast("キャラを選択してください"));
 $("#bulkDelete").addEventListener("click",()=>state.selectedIds.size?deleteIds([...state.selectedIds]):showToast("キャラを選択してください"));
 $("#saveCharacter").addEventListener("click",saveCharacterForm);
 $("#charTagPicker").addEventListener("click",e=>{const b=e.target.closest("[data-add-tag]");if(!b)return;b.classList.toggle("active");syncAddTagInput()});
 $("#exportAll").addEventListener("click",()=>exportCharacters("all"));
 $("#exportSelected").addEventListener("click",()=>exportCharacters("selected"));
 $("#exportTemplate").addEventListener("click",exportTemplate);
 $("#copySchemaPrompt").addEventListener("click",copySchemaPrompt);
 $("#characterResearchWork").addEventListener("input",renderCharacterImportGuide);
 $("#copyCharacterResearchPrompt").addEventListener("click",copyCharacterResearchPrompt);
 $("#downloadCharacterTemplateFromHelp").addEventListener("click",exportTemplate);
 $("#importButton").addEventListener("click",()=>{pendingCharacterImportMode=$("#importMode").value;$("#importFile").click()});
 $("#importReplaceAllButton").addEventListener("click",()=>{pendingCharacterImportMode="replace";$("#importFile").click()});
 $("#exportFullBackup").addEventListener("click",exportFullBackup);
 $("#importFullBackup").addEventListener("click",()=>$("#fullBackupFile").click());
 $("#fullBackupFile").addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{await handleFullBackupFile(f)}catch(err){alert(`完全バックアップの復元失敗：${err.message}`)}finally{e.target.value=""}});
 $("#importFile").addEventListener("change",async e=>{const f=e.target.files?.[0],mode=pendingCharacterImportMode||$("#importMode").value;pendingCharacterImportMode=null;if(!f)return;try{const r=await handleImportFile(f,mode);if(r)showToast(r.work?`「${r.work}」を更新：追加${r.added} / 引継ぎ${r.updated} / 削除${r.removed}`:`読み込み完了：追加${r.added} / 更新${r.updated}`)}catch(err){alert(`インポート失敗：${err.message}`)}finally{e.target.value=""}});
 $("#jumpTop").addEventListener("click",()=>document.querySelector("#pageTop").scrollIntoView({behavior:"smooth",block:"start"}));
 $("#jumpIO").addEventListener("click",()=>document.querySelector("#ioPanel").scrollIntoView({behavior:"smooth",block:"start"}));

 const hasSavedRoll=!!state.characterId||["relationship","situation","mood","extra"].some(k=>!!state.values[k]);
 if(hasSavedRoll){
   for(const k of ["character","relationship","situation","mood","extra"]){updateCard(k);updateLock(k)}
 }else rollAll();
}
init();
