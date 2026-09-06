const state={
 characters:[], pools:structuredClone(DEFAULT_POOLS), values:{}, characterId:null,
 locks:{character:false,relationship:false,situation:false,mood:false,extra:false},
 basePrompt:DEFAULT_BASE_PROMPT, deletedSeedIds:new Set(), selectedIds:new Set(), editingCharacterId:null, inlineEditingId:null,
 filters:{search:"",work:"",series:"",tags:new Set(),tagMode:"all",favorite:"all",minHeight:null,maxHeight:null},
 manage:{status:"all",sort:"work"},
 categoryInclude:{character:null,relationship:null,situation:null,mood:null,extra:null},
 categoryExcluded:{character:new Set(),relationship:new Set(),situation:new Set(),mood:new Set(),extra:new Set()},
 presets:[], protagonistProfile:DEFAULT_PROTAGONIST_PROFILE
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
 if(q&&!([c.name,c.work,c.series,c.heightText,...(c.tags||[])].join(" ").toLowerCase().includes(q)))return false;
 if(f.work&&c.work!==f.work)return false;
 if(f.series&&c.series!==f.series)return false;
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
 state.deletedSeedIds=new Set(source.deletedSeedIds||[]);state.characterId=state.characters.some(c=>c.id===source.characterId&&!c.archived)?source.characterId:null;
 state.values={...(source.values||{})};state.locks={character:false,relationship:false,situation:false,mood:false,extra:false,...(source.locks||{})};
 const f=source.filters||{};state.filters={search:String(f.search||""),work:String(f.work||""),series:String(f.series||""),tags:new Set(canonicalizeTags(f.tags||[])),tagMode:f.tagMode==="any"?"any":"all",favorite:["favorite","normal"].includes(f.favorite)?f.favorite:"all",minHeight:Number.isFinite(f.minHeight)?f.minHeight:null,maxHeight:Number.isFinite(f.maxHeight)?f.maxHeight:null};
 state.manage={status:["active","archived"].includes(source.manage?.status)?source.manage.status:"all",sort:String(source.manage?.sort||"work")};
 state.categoryInclude={character:null,relationship:null,situation:null,mood:null,extra:null,...(source.categoryInclude||{})};
 state.categoryExcluded=Object.fromEntries(DreamGachaData.CARD_KEYS.map(k=>[k,new Set(source.categoryExcluded?.[k]||[])]));
 state.presets=Array.isArray(source.presets)?source.presets.filter(x=>x&&x.snapshot):[];
 const free=$("#freeExtra");if(free)free.value=String(source.freeExtra||"");
}

function prepareSettings(raw,strict=false){
  const prepared=DreamGachaStorage.decodeSettings(raw,{pools:DEFAULT_POOLS,basePrompt:DEFAULT_BASE_PROMPT,protagonistProfile:DEFAULT_PROTAGONIST_PROFILE},strict);
  const previousBundledPrompt=prepared.basePrompt.replace("\n\n## 身長差・体格差\n\n夢主は160cmです。\n\n","\n\n## 身長差・体格差\n\n");
  const shouldMigrateBundledPrompt=Number(prepared.version||0)<DreamGachaData.SETTINGS_VERSION&&(LEGACY_BASE_PROMPTS.includes(prepared.basePrompt)||previousBundledPrompt===DEFAULT_BASE_PROMPT);
  if(!prepared.basePrompt||shouldMigrateBundledPrompt)prepared.basePrompt=DEFAULT_BASE_PROMPT;
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

function save(msg=false){
 const serialized=DreamGachaStorage.plainSettings({...state,freeExtra:$("#freeExtra").value});DreamGachaStorage.validateSettings(serialized);
 try{localStorage.setItem(DreamGachaData.SETTINGS_KEY,JSON.stringify(serialized))}
 catch(error){alert(`設定を保存できませんでした：${error.message}`);throw error}
 if(msg) setStatus("設定を保存しました");
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
   freeExtra:$("#freeExtra").value,protagonistProfile:protagonistField?protagonistField.value:(state.protagonistProfile||DEFAULT_PROTAGONIST_PROFILE),prompt});
}
function snapshotAutoTitle(s){return `${s?.character?.name||"キャラ未指定"}｜${s?.situation||"シチュ未指定"}`}
function snapshotMetaHtml(s){
 if(!s)return "条件なし";
 return [s.character?.name,s.relationship,s.situation,s.mood,s.extra].filter(Boolean).map(v=>`<span class="library-tag">${esc(v)}</span>`).join("");
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
 $("#freeExtra").value=resolved.freeExtra;state.protagonistProfile=resolved.protagonistProfile;$("#protagonistProfile").value=resolved.protagonistProfile;$("#output").value=resolved.prompt;
 for(const k of ["character","relationship","situation","mood","extra"])updateCard(k);
 save();renderGachaFilters();switchScreen("gacha");showToast(resolved.missingCharacter?"保存キャラが利用できないため、キャラ未選択で適用しました":"保存条件をガチャへ適用しました");
}
function renderPresetList(){
 const box=$("#presetList");if(!box)return;
 if(!state.presets.length){box.innerHTML=`<div class="empty-library">まだ保存した条件はありません</div>`;return}
 box.innerHTML=state.presets.map(p=>`<div class="library-card">
  <div class="library-card-head"><div><div class="library-card-title">${esc(p.name)}</div><div class="library-card-sub">${esc(fmtDate(p.createdAt))}</div></div></div>
  <div class="library-tags">${snapshotMetaHtml(p.snapshot)}</div>
  <div class="library-card-actions"><button class="primary" type="button" data-apply-preset="${esc(p.id)}">この条件を使う</button><button class="small-btn" type="button" data-delete-preset="${esc(p.id)}">削除</button></div>
 </div>`).join("");
}
function prepareNovelSave(){
 novelDraftSnapshot=snapshotCurrentConditions();
 $("#novelSnapshotPreview").innerHTML=`<strong>保存する条件</strong><div class="library-tags">${snapshotMetaHtml(novelDraftSnapshot)}</div>`;
 if(!$("#novelTitle").value.trim())$("#novelTitle").value=snapshotAutoTitle(novelDraftSnapshot);
 switchScreen("library");setTimeout(()=>$("#novelBody").scrollIntoView({behavior:"smooth",block:"center"}),80);
}
async function saveNovelArchive(){
 const body=$("#novelBody").value.trim();if(!body)return showToast("夢小説本文を貼り付けてください");
 const snap=novelDraftSnapshot||snapshotCurrentConditions(),title=$("#novelTitle").value.trim()||snapshotAutoTitle(snap);
 const novel={id:libraryId("novel"),title,body,charCount:novelCharCount(body),memo:$("#novelMemo").value.trim(),favorite:$("#novelFavorite").checked,createdAt:new Date().toISOString(),snapshot:snap};
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
  <div class="library-card-head"><div><div class="library-card-title">${n.favorite?"★ ":""}${esc(n.title)}</div><div class="library-card-sub">${esc(fmtDate(n.createdAt))} / ${fmtChars(n.charCount??novelCharCount(n.body))}${n.snapshot?.character?.work?` / ${esc(n.snapshot.character.work)}`:""}</div></div></div>
  <div class="library-tags">${snapshotMetaHtml(n.snapshot)}</div><div class="library-preview">${esc(DreamGachaDomain.preview(n.body,DreamGachaData.NOVEL_PREVIEW_LENGTH))}</div>
  <div class="library-card-actions"><button class="primary" type="button" data-open-novel="${esc(n.id)}">読む</button><button class="small-btn" type="button" data-reuse-novel="${esc(n.id)}">条件を再利用</button><button class="small-btn" type="button" data-fav-novel="${esc(n.id)}">${n.favorite?"★解除":"☆お気に入り"}</button><button class="small-btn" type="button" data-delete-novel="${esc(n.id)}">削除</button></div>
 </div>`).join("");
}
async function refreshNovelCache(){novelCache=await novelAll();return novelCache}
async function renderLibrary(){renderPresetList();try{await refreshNovelCache();renderNovelList()}catch(e){const box=$("#novelList");if(box)box.innerHTML=`<div class="empty-library">アーカイブを読み込めませんでした</div>`}}
function openNovelView(n){
 if(!n)return;
 $("#novelViewTitle").textContent=n.title;$("#novelViewMeta").textContent=[n.snapshot?.character?.name,n.snapshot?.character?.work,fmtChars(n.charCount??novelCharCount(n.body)),fmtDate(n.createdAt)].filter(Boolean).join(" / ");$("#novelViewBody").textContent=n.body;
 const s=n.snapshot||{},items=[["キャラ",s.character?.name],["作品",s.character?.work],["部・シリーズ",s.character?.series],["関係性",s.relationship],["シチュ",s.situation],["雰囲気",s.mood],["追加条件",s.extra],["自由指定",s.freeExtra],["夢主設定",s.protagonistProfile]].filter(x=>x[1]);
 $("#novelViewConditions").innerHTML=items.map(([k,v])=>`<div class="novel-detail-item"><b>${esc(k)}</b>${esc(v)}</div>`).join("");$("#novelViewPrompt").value=s.prompt||"";
 $("#novelModal").hidden=false;document.body.style.overflow="hidden";
}
function closeNovelView(){$("#novelModal").hidden=true;document.body.style.overflow=""}
async function toggleNovelFavorite(id){const index=novelCache.findIndex(n=>n.id===id);if(index<0)return;const updated={...novelCache[index],favorite:!novelCache[index].favorite};await novelPut(updated);novelCache=[...novelCache.slice(0,index),updated,...novelCache.slice(index+1)];renderNovelList()}
async function deleteNovelArchive(id){const n=novelCache.find(n=>n.id===id);if(!n)return;if(!confirm(`「${n.title}」を削除しますか？`))return;await novelDelete(id);await refreshNovelCache();renderNovelList();showToast("夢小説を削除しました")}


function switchScreen(name){
 document.querySelectorAll(".screen").forEach(el=>el.hidden=el.id!==`screen-${name}`);
 document.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active",b.dataset.screen===name));
 if(name==="manager") renderManager();
 if(name==="library") renderLibrary();
 $("#managerQuickNav").hidden=name!=="manager";
 window.scrollTo({top:0,behavior:"smooth"});
}


let chooserKey=null;
let mobileCategoryMode="include";
function chooserEntries(key){
 if(key==="character"){
   return baseFilteredCharacters().filter(c=>categoryPass("character",c)).map(c=>({
     value:c.id,
     label:(c.favorite?"★ ":"")+c.name,
     meta:[c.work,c.series,Number.isFinite(c.heightCm)?`${c.heightCm}cm`:""].filter(Boolean).join(" / ")
   }));
 }
 return (state.pools[key]||[]).filter(v=>categoryPass(key,v)).map(v=>({value:v,label:v,meta:""}));
}
function renderChooserCategoryChips(){
 if(!chooserKey)return;
 const counts=categoryCounts(chooserKey),order=categoryOrderFor(chooserKey);
 $("#choiceCategoryWrap").hidden=!order.length;
 const isTouch=window.matchMedia("(hover:none), (pointer:coarse)").matches;
 $("#choiceCategoryTitle").textContent=isTouch
   ?`${CATEGORY_LABELS[chooserKey]||"カテゴリ"}`
   :`${CATEGORY_LABELS[chooserKey]||"カテゴリ"}（左＝設定 / 右＝除外）`;
 $("#choiceCategoryChips").innerHTML=
   `<button type="button" class="choice-category-chip" data-category-clear="${esc(chooserKey)}">条件クリア</button>`+
   order.filter(c=>(counts.get(c)||0)>0).map(c=>{
     const included=state.categoryInclude[chooserKey]===c;
     const excluded=state.categoryExcluded[chooserKey].has(c);
     return `<button type="button" class="choice-category-chip${included?" included":""}${excluded?" excluded":""}" data-category-name="${esc(c)}" title="左クリック：このカテゴリに設定 / 右クリック：除外">${esc(c)} <span class="n">${counts.get(c)}</span></button>`;
   }).join("");
}
function openChooser(key){
 if(key!=="character")syncScenario();
 chooserKey=key;mobileCategoryMode="include";
 document.querySelectorAll("[data-mobile-category-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mobileCategoryMode==="include"));
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
}
function renderResultCards(){
 const grid=$("#resultGrid");grid.innerHTML="";
 for(const key of Object.keys(META)){
  const card=document.createElement("div");card.className="result-card";card.dataset.key=key;
  card.innerHTML=`<div><div class="label">${META[key].icon} ${META[key].label}</div><div class="value" data-value="${key}">—</div><div class="result-category-status" data-category-status="${key}">カテゴリ指定なし</div></div>
  <div class="card-actions"><button class="small-btn" data-reroll="${key}">🎲 引き直す</button>
  <button class="small-btn choose-btn" data-choose="${key}" type="button">☰ 選ぶ・カテゴリ</button>
  ${key==="character"?`<button class="favorite-btn" data-favorite-current type="button">☆ お気に入り</button>`:""}
  <label class="lock-label"><input type="checkbox" data-lock="${key}"> 🔒 固定</label></div>`;
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
 grid.addEventListener("change",e=>{const i=e.target.closest("[data-lock]");if(!i)return;state.locks[i.dataset.lock]=i.checked;updateLock(i.dataset.lock)});
}
function updateLock(k){document.querySelector(`.result-card[data-key="${k}"]`)?.classList.toggle("locked",!!state.locks[k])}
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
function filteredCharacters(){return baseFilteredCharacters().filter(c=>categoryPass("character",c))}
function tagCountBaseCharacters(){return activeCharacters().filter(matchesSharedFilters)}
function renderSharedFilterControls(){
 const all=state.characters,works=unique(all.map(c=>c.work));
 const wo=`<option value="">すべての作品</option>`+works.map(x=>`<option>${esc(x)}</option>`).join("");
 for(const id of ["workFilter","manageWork"]){const e=$("#"+id);if(e)e.innerHTML=wo}
 if(!works.includes(state.filters.work))state.filters.work="";
 for(const id of ["workFilter","manageWork"]){const e=$("#"+id);if(e)e.value=state.filters.work}

 const base=state.filters.work?all.filter(c=>c.work===state.filters.work):all;
 const series=orderedSeries(state.filters.work,base.map(c=>c.series));
 const so=`<option value="">すべての部・シリーズ</option>`+series.map(x=>`<option>${esc(x)}</option>`).join("");
 for(const id of ["seriesFilter","manageSeries"]){const e=$("#"+id);if(e)e.innerHTML=so}
 if(!series.includes(state.filters.series))state.filters.series="";
 for(const id of ["seriesFilter","manageSeries"]){const e=$("#"+id);if(e)e.value=state.filters.series}

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
 const arr=filteredCharacters();$("#candidateCount").textContent=`候補 ${arr.length}人`;
 $("#characterPicker").innerHTML=`<option value="">— 選択 —</option>`+arr.map(c=>{
  const s=[c.work,c.series].filter(Boolean).join(" / ");return `<option value="${esc(c.id)}">${esc((c.favorite?"★ ":"")+c.name+(s?`（${s}）`:""))}</option>`;
 }).join("");
 if(state.characterId&&arr.some(c=>c.id===state.characterId))$("#characterPicker").value=state.characterId;
}
function renderCandidatePreview(){
 const arr=filteredCharacters().slice().sort((a,b)=>{
  const w=a.work.localeCompare(b.work,"ja");if(w)return w;
  if(a.series!==b.series){const seq=orderedSeries(a.work,[a.series,b.series]);return seq.indexOf(a.series)-seq.indexOf(b.series)}
  return a.name.localeCompare(b.name,"ja",{numeric:true});
 });
 $("#candidatePreviewSummary").textContent=`候補キャラを見る（${arr.length}人）`;
 $("#candidatePreview").innerHTML=arr.length?arr.map(c=>{
  const meta=[c.series,Number.isFinite(c.heightCm)?`${c.heightCm}cm`:""].filter(Boolean).join(" / ");
  return `<button type="button" class="candidate-chip" data-pick-candidate="${esc(c.id)}">${esc((c.favorite?"★ ":"")+c.name)}${meta?` <span class="label">${esc(meta)}</span>`:""}</button>`;
 }).join(""):`<span class="label">条件に合うキャラはいません</span>`;
}function renderSuggestions(){
 $("#workSuggestions").innerHTML=unique(state.characters.map(c=>c.work)).map(x=>`<option value="${esc(x)}"></option>`).join("");
 $("#seriesSuggestions").innerHTML=unique(state.characters.map(c=>c.series)).map(x=>`<option value="${esc(x)}"></option>`).join("");
}
function updateCard(k){
 const el=document.querySelector(`[data-value="${k}"]`);if(!el)return;
 if(k==="character"){
   const c=currentCharacter();if(!c){el.textContent="—";updateCurrentFavoriteButton();return}
   el.innerHTML=`<span>${c.favorite?`<span class="favorite-mark">★</span>`:""}${esc(c.name)}</span><span class="char-meta">${esc([c.work,c.series].filter(Boolean).join(" / "))}</span><span class="char-meta">身長：${esc(c.heightText||"不明")}</span>`;
   updateCurrentFavoriteButton();
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
function syncScenario(){
 for(const k of Object.keys(DEFAULT_POOLS)){const e=$(`#pool-${k}`);if(e)state.pools[k]=parseLines(e.value)}
 state.basePrompt=$("#basePrompt").value.trim()||DEFAULT_BASE_PROMPT;state.protagonistProfile=$("#protagonistProfile").value.trim()||DEFAULT_PROTAGONIST_PROFILE;
}
function rollCharacter(force=false){
 if(state.locks.character&&!force)return;const arr=filteredCharacters();
 if(!arr.length){showToast("条件・カテゴリに合うガチャ対象キャラがいません");return}
 state.characterId=randomItem(arr.map(c=>c.id),state.characterId);updateCard("character");renderPicker();
}
function rollOne(k,force=false){
 syncScenario();if(k==="character")return rollCharacter(force);if(state.locks[k]&&!force)return;
 const pool=(state.pools[k]||[]).filter(v=>categoryPass(k,v));
 if(!pool.length){showToast(`${META[k].label}のカテゴリ条件で候補が0件です`);return}
 state.values[k]=randomItem(pool,state.values[k]);updateCard(k);
}
function rollAll(){for(const k of Object.keys(META))rollOne(k,false);buildPrompt(false)}
function buildPrompt(scroll=true){
 syncScenario();if(!currentCharacter())rollCharacter(false);
 for(const k of ["relationship","situation","mood","extra"])if(!state.values[k])rollOne(k,false);
 const c=currentCharacter();
 $("#output").value=DreamGachaDomain.formatPrompt({basePrompt:state.basePrompt,character:c,relationship:state.values.relationship,situation:state.values.situation,mood:state.values.mood,extra:state.values.extra,protagonistProfile:state.protagonistProfile,freeExtra:$("#freeExtra").value});save();
 if(scroll)$("#output").scrollIntoView({behavior:"smooth",block:"center"});
}
async function copyPrompt(){
 if(!$("#output").value.trim())buildPrompt(false);
 try{await navigator.clipboard.writeText($("#output").value)}catch(e){$("#output").select();document.execCommand("copy")}
 showToast("コピーしました");setStatus("ChatGPTにそのまま貼り付けられます");
}
function renderPoolEditors(){
 const names={relationship:"関係性候補",situation:"シチュ候補",mood:"雰囲気候補",extra:"追加条件候補"};
 $("#poolGrid").innerHTML=Object.keys(names).map(k=>`<div class="field"><label for="pool-${k}">${names[k]} <span class="label">（${state.pools[k].length}件）</span></label><textarea id="pool-${k}" spellcheck="false">${esc(state.pools[k].join("\n"))}</textarea></div>`).join("");
 $("#basePrompt").value=state.basePrompt;
 $("#protagonistProfile").value=state.protagonistProfile||DEFAULT_PROTAGONIST_PROFILE;
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
 if(currentCharacter()?.archived||!state.characters.some(c=>c.id===state.characterId&&!c.archived)){state.characterId=null;updateCard("character")}
 state.selectedIds.clear();save();renderManager();renderGachaFilters();showToast(archived?"アーカイブしました":"ガチャ対象に戻しました");
}
function deleteIds(ids){
 const arr=state.characters.filter(c=>ids.includes(c.id));if(!arr.length)return;
 if(!confirm(`${arr.length}件のキャラを完全に削除しますか？\nアーカイブなら後から戻せます。`))return;
 for(const c of arr)if(c.id.startsWith("seed-"))state.deletedSeedIds.add(c.id);
 state.characters=state.characters.filter(c=>!ids.includes(c.id));
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
   heightText:c.heightText||"",heightCm:c.heightCm??null
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
 const data={schema:"dream-gacha.characters",version:1,instructions:"characters にキャラを追加してください。name は必須です。身長不明なら heightCm=null にしてください。",characters:[{
   name:"キャラクター名",work:"作品名",series:"部・シリーズ",tags:["年上系","冷静","優しい"],archived:false,favorite:false,
   heightText:"180cm",heightCm:180
 }]};
 downloadJson(data,"dream-gacha-character-template.json");showToast("ChatGPT用テンプレートを書き出しました");
}
const CHARACTER_SCHEMA_PROMPT=`夢小説シチュガチャにインポートするキャラクターJSONファイルを作ってください。出力はJSONのみ、説明文やMarkdownのコードフェンスは不要です。

形式：
{
  "schema": "dream-gacha.characters",
  "version": 1,
  "characters": [
    {
      "id": "任意。省略可",
      "name": "キャラ名（必須）",
      "work": "作品名",
      "series": "部・シリーズ",
      "tags": ["印象タグ1", "印象タグ2"],
      "archived": false,
      "favorite": false,
      "heightText": "身長の表示文字列。例: 180cm / 175cm→180cm / 不明",
      "heightCm": 180
    }
  ]
}

タグは必ず以下の共通語彙だけを使ってください。類義語や1人専用の細かいタグは新設せず、抽象度の高い共通タグへ統合してください。
年齢・距離感：年上系 / 年下系 / 同年代系
性格・雰囲気：優しい / 誠実 / 冷静 / 現実的 / 知的 / 明るい / 情熱的 / 不器用 / 寡黙 / 自信家 / 強気 / マイペース / 策士 / 包容力 / 一途 / 危険 / 荒っぽい / 気弱 / 素直 / 個性的 / 挑発的 / 負けず嫌い / 野心家 / キザ / 女好き
容姿・体格：美形 / 色気 / 体格がいい / 強面
役割・属性：主人公 / 悪役 / ライバル / 指導者 / 戦闘系 / 知識職 / 職人系 / 権力者 / 一般人

heightCm は代表値を数値(cm)で入れ、不明なら null にしてください。身長が不明なら推測で作らず、heightText は「不明」、heightCm は null にしてください。
作品名・部/シリーズ・タグ・お気に入り情報も characters 内で一緒に管理してください。`;
async function copySchemaPrompt(){
 try{await navigator.clipboard.writeText(CHARACTER_SCHEMA_PROMPT)}catch(e){const ta=document.createElement("textarea");ta.value=CHARACTER_SCHEMA_PROMPT;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove()}
 showToast("ChatGPT用JSON仕様をコピーしました");
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
function importCharactersData(data,mode){
 const list=Array.isArray(data)?data:Array.isArray(data?.characters)?data.characters:null;
 if(!list)throw new Error("characters 配列が見つかりません");
 const raws=dedupeImported(list);if(!raws.length)throw new Error("有効なキャラが1件もありません");
 let added=0,updated=0;
 if(mode==="replace"){
   const next=cleanupCharacterData(raws);
   const importedSeedIds=new Set(next.map(c=>c.id));
   const importedKeys=new Set(next.map(c=>c.work+"\u0000"+c.name));
   state.deletedSeedIds=new Set(DEFAULT_CHARACTERS.filter(seed=>!importedSeedIds.has(seed.id)&&!importedKeys.has(seed.work+"\u0000"+seed.name)).map(seed=>seed.id));
   state.characters=next;added=next.length;state.selectedIds.clear();state.characterId=null;
 }else{
   for(const raw of raws){
     const existing=state.characters.find(c=>(raw.id&&c.id===raw.id)||characterIdentityKey(c)===characterIdentityKey(raw));
     const normalized=existing?mergeCharacterRecords(existing,raw):raw;
     if(existing){Object.assign(existing,normalized);updated++}else{state.characters.push(normalized);added++}
   }
   state.characters=cleanupCharacterData(state.characters);
 }
 save();renderManager();renderGachaFilters();updateCard("character");
 return {added,updated,total:raws.length};
}
async function handleImportFile(file){
 const text=await file.text();let data;
 try{data=JSON.parse(text)}catch(e){throw new Error("JSONとして読み込めませんでした")}
 const mode=$("#importMode").value;
 if(mode==="replace"&&!confirm("現在のキャラ一覧を、読み込むファイルの内容で置き換えます。\nシチュ設定は変更しません。続けますか？"))return null;
 return importCharactersData(data,mode);
}


async function fullBackupPayload(){
 syncScenario();const novels=await novelAll();
 return DreamGachaStorage.makeBackup({...state,freeExtra:$("#freeExtra").value},novels);
}
function backupTimestamp(){const d=new Date(),pad=n=>String(n).padStart(2,"0");return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`}
async function exportFullBackup(){try{const stamp=backupTimestamp(),payload=await fullBackupPayload();downloadJson(payload,`dream-gacha-full-backup-${stamp}.json`);showToast("完全バックアップを書き出しました")}catch(e){alert(`完全バックアップを書き出せませんでした：${e.message}`)}}
async function restoreFullBackup(data){
 const validated=DreamGachaStorage.validateBackup(data);
 const b=prepareSettings(validated,true);
 const currentNovels=await novelAll(),nextNovels=Object.prototype.hasOwnProperty.call(validated,"novels")?validated.novels:currentNovels;
 const nextSettings=DreamGachaStorage.plainSettings(b);
 await DreamGachaStorage.restoreAtomically({
  // Preserve the exact stored text for rollback. A malformed old setting must
  // not prevent a valid full backup from repairing it.
  readSettings:async()=>localStorage.getItem(DreamGachaData.SETTINGS_KEY),readNovels:()=>Promise.resolve(currentNovels),
  writeSettings:async value=>value===null?localStorage.removeItem(DreamGachaData.SETTINGS_KEY):localStorage.setItem(DreamGachaData.SETTINGS_KEY,typeof value==="string"?value:JSON.stringify(value)),writeNovels:replaceAllNovels
 },{settings:nextSettings,novels:nextNovels});
 applySettingsState(b);state.selectedIds.clear();state.inlineEditingId=null;
 novelCache=structuredClone(nextNovels).sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
 renderPoolEditors();renderGachaFilters();renderManager();renderPresetList();renderNovelList();
 for(const k of ["character","relationship","situation","mood","extra"]){updateCard(k);updateCategoryStatus(k);const i=document.querySelector(`[data-lock="${k}"]`);if(i)i.checked=!!state.locks[k];updateLock(k)}
 showToast("完全バックアップを復元しました");
}
async function handleFullBackupFile(file){
 const text=await file.text();let data;try{data=JSON.parse(text)}catch(e){throw new Error("JSONとして読み込めませんでした")}
 if(!confirm("現在のキャラ・アーカイブ・お気に入り・シチュ候補・固定プロンプト・保存条件・夢小説アーカイブ等を、バックアップ内容で丸ごと置き換えます。続けますか？"))return;
 await restoreFullBackup(data);
}

function resetScenario(){
 if(!confirm("シチュ・雰囲気・追加条件・固定プロンプトを初期状態に戻しますか？\nキャラ一覧は変更しません。"))return;
 state.pools=structuredClone(DEFAULT_POOLS);state.basePrompt=DEFAULT_BASE_PROMPT;state.protagonistProfile=DEFAULT_PROTAGONIST_PROFILE;
 for(const k of ["relationship","situation","mood","extra"]){state.categoryInclude[k]=null;state.categoryExcluded[k].clear();updateCategoryStatus(k)}
 renderPoolEditors();save();showToast("シチュ設定を初期化しました");
}
function setStatus(m){$("#status").textContent=m;clearTimeout(setStatus.t);setStatus.t=setTimeout(()=>$("#status").textContent="",2600)}
function showToast(m){const e=$("#toast");e.textContent=m;e.classList.add("show");clearTimeout(showToast.t);showToast.t=setTimeout(()=>e.classList.remove("show"),1700)}

function init(){
 load();renderResultCards();renderPoolEditors();renderGachaFilters();renderAddTagPicker();renderLibrary();

 document.querySelectorAll(".tab-btn").forEach(b=>b.addEventListener("click",()=>switchScreen(b.dataset.screen)));
 $("#choiceClose").addEventListener("click",closeChooser);
 $("#choiceSearch").addEventListener("input",renderChooserList);
 $("#choiceCategoryChips").addEventListener("click",e=>{
   const clear=e.target.closest("[data-category-clear]");if(clear)return clearCategoryRules(clear.dataset.categoryClear);
   const b=e.target.closest("[data-category-name]");if(!b||!chooserKey)return;
   const isTouch=window.matchMedia("(hover:none), (pointer:coarse)").matches;
   if(isTouch&&mobileCategoryMode==="exclude")toggleCategoryExclude(chooserKey,b.dataset.categoryName);
   else setCategoryInclude(chooserKey,b.dataset.categoryName);
 });
 $("#choiceCategoryChips").addEventListener("contextmenu",e=>{
   const b=e.target.closest("[data-category-name]");if(!b||!chooserKey)return;
   e.preventDefault();toggleCategoryExclude(chooserKey,b.dataset.categoryName);
 });
 document.querySelectorAll("[data-mobile-category-mode]").forEach(b=>b.addEventListener("click",()=>{
   mobileCategoryMode=b.dataset.mobileCategoryMode;
   document.querySelectorAll("[data-mobile-category-mode]").forEach(x=>x.classList.toggle("active",x===b));
 }));
 $("#choiceList").addEventListener("click",e=>{const b=e.target.closest("[data-choice-value]");if(b)chooseValue(b.dataset.choiceValue)});
 $("#choiceModal").addEventListener("click",e=>{if(e.target===$("#choiceModal"))closeChooser()});
 document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(!$("#novelModal").hidden)closeNovelView();else if(!$("#choiceModal").hidden)closeChooser()});
 $("#workFilter").addEventListener("change",e=>{state.filters.work=e.target.value;state.filters.series="";renderGachaFilters();renderManager()});
 $("#seriesFilter").addEventListener("change",e=>{state.filters.series=e.target.value;renderGachaFilters();renderManager()});
 $("#gachaSearch").addEventListener("input",e=>{state.filters.search=e.target.value;renderGachaFilters();renderManager()});
 document.addEventListener("click",e=>{const b=e.target.closest("[data-favorite-filter]");if(!b)return;toggleFavoriteFilter()});
 for(const prefix of ["gacha","manage"]){
  $("#"+prefix+"HeightMin").addEventListener("input",e=>{setHeightFilterFromSlider("min",e.target.value);renderGachaFilters();renderManager()});
  $("#"+prefix+"HeightMax").addEventListener("input",e=>{setHeightFilterFromSlider("max",e.target.value);renderGachaFilters();renderManager()});
 }
 $("#tagMode").addEventListener("change",e=>{state.filters.tagMode=e.target.value;renderPicker()});
 $("#tagChips").addEventListener("click",e=>{const b=e.target.closest("[data-tag]");if(!b)return;const t=b.dataset.tag;state.filters.tags.has(t)?state.filters.tags.delete(t):state.filters.tags.add(t);renderGachaFilters()});
 $("#characterPicker").addEventListener("change",e=>{if(e.target.value){state.characterId=e.target.value;updateCard("character")}});
 $("#candidatePreview").addEventListener("click",e=>{const b=e.target.closest("[data-pick-candidate]");if(!b)return;state.characterId=b.dataset.pickCandidate;updateCard("character");$("#characterPicker").value=state.characterId;showToast("キャラを選択しました")});
 $("#clearFilters").addEventListener("click",()=>{state.filters={search:"",work:"",series:"",tags:new Set(),tagMode:"all",favorite:"all",minHeight:null,maxHeight:null};$("#tagMode").value="all";renderGachaFilters();renderManager();showToast("共通検索条件とタグを解除しました")});
 $("#rollAll").addEventListener("click",rollAll);$("#buildPrompt").addEventListener("click",()=>buildPrompt(true));$("#copyPrompt").addEventListener("click",copyPrompt);
 $("#saveCurrentPreset").addEventListener("click",saveCurrentConditionsPreset);$("#openNovelSave").addEventListener("click",prepareNovelSave);$("#savePresetFromLibrary").addEventListener("click",saveCurrentConditionsPreset);$("#saveNovel").addEventListener("click",saveNovelArchive);
 $("#novelSearch").addEventListener("input",renderNovelList);$("#novelBody").addEventListener("input",()=>$("#novelBodyCount").textContent=fmtChars(novelCharCount($("#novelBody").value)));$("#novelFavoriteOnly").addEventListener("click",()=>{novelFavoriteOnly=!novelFavoriteOnly;$("#novelFavoriteOnly").classList.toggle("active",novelFavoriteOnly);renderNovelList()});
 $("#presetList").addEventListener("click",e=>{const a=e.target.closest("[data-apply-preset]");if(a){const p=state.presets.find(x=>x.id===a.dataset.applyPreset);if(p)applySnapshot(p.snapshot);return}const d=e.target.closest("[data-delete-preset]");if(d){const p=state.presets.find(x=>x.id===d.dataset.deletePreset);if(p&&confirm(`「${p.name}」を削除しますか？`)){state.presets=state.presets.filter(x=>x.id!==p.id);save();renderPresetList()}}});
 $("#novelList").addEventListener("click",async e=>{try{const o=e.target.closest("[data-open-novel]");if(o){openNovelView(novelCache.find(n=>n.id===o.dataset.openNovel));return}const r=e.target.closest("[data-reuse-novel]");if(r){const n=novelCache.find(n=>n.id===r.dataset.reuseNovel);if(n)applySnapshot(n.snapshot);return}const f=e.target.closest("[data-fav-novel]");if(f){await toggleNovelFavorite(f.dataset.favNovel);return}const d=e.target.closest("[data-delete-novel]");if(d){await deleteNovelArchive(d.dataset.deleteNovel)}}catch(err){alert(`夢小説アーカイブを更新できませんでした：${err.message}`)}});
 $("#novelViewClose").addEventListener("click",closeNovelView);$("#novelModal").addEventListener("click",e=>{if(e.target===$("#novelModal"))closeNovelView()});
 $("#saveSettings").addEventListener("click",()=>{syncScenario();save(true)});$("#resetScenarioSettings").addEventListener("click",resetScenario);$("#freeExtra").addEventListener("change",()=>save());

 $("#manageSearch").addEventListener("input",e=>{state.filters.search=e.target.value;renderManager();renderGachaFilters()});
 $("#manageWork").addEventListener("change",e=>{state.filters.work=e.target.value;state.filters.series="";renderManager();renderGachaFilters()});
 $("#manageSeries").addEventListener("change",e=>{state.filters.series=e.target.value;renderManager();renderGachaFilters()});
 $("#manageSort").addEventListener("change",e=>{state.manage.sort=e.target.value;renderManager()});
 $("#manageStatusButtons").addEventListener("click",e=>{const b=e.target.closest("[data-manage-status]");if(!b)return;state.manage.status=state.manage.status===b.dataset.manageStatus?"all":b.dataset.manageStatus;renderManager()});
 $("#clearSharedManagerFilters").addEventListener("click",()=>{state.filters.search="";state.filters.work="";state.filters.series="";state.filters.favorite="all";state.filters.minHeight=null;state.filters.maxHeight=null;renderManager();renderGachaFilters();showToast("共通検索条件を解除しました")});
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
 $("#importButton").addEventListener("click",()=>$("#importFile").click());
 $("#exportFullBackup").addEventListener("click",exportFullBackup);
 $("#importFullBackup").addEventListener("click",()=>$("#fullBackupFile").click());
 $("#fullBackupFile").addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{await handleFullBackupFile(f)}catch(err){alert(`完全バックアップの復元失敗：${err.message}`)}finally{e.target.value=""}});
 $("#importFile").addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{const r=await handleImportFile(f);if(r)showToast(`読み込み完了：追加${r.added} / 更新${r.updated}`)}catch(err){alert(`インポート失敗：${err.message}`)}finally{e.target.value=""}});
 $("#jumpTop").addEventListener("click",()=>document.querySelector("#pageTop").scrollIntoView({behavior:"smooth",block:"start"}));
 $("#jumpIO").addEventListener("click",()=>document.querySelector("#ioPanel").scrollIntoView({behavior:"smooth",block:"start"}));

 const hasSavedRoll=!!state.characterId||["relationship","situation","mood","extra"].some(k=>!!state.values[k]);
 if(hasSavedRoll){
   for(const k of ["character","relationship","situation","mood","extra"]){updateCard(k);updateLock(k)}
 }else rollAll();
}
init();
