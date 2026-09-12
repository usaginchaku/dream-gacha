(function(root){
  "use strict";
  const D=root.DreamGachaData||{SETTINGS_KEY:"dreamGachaSettings",SETTINGS_VERSION:41,BACKUP_SCHEMA:"dream-gacha.full-backup",BACKUP_VERSION:2};
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const P=root.DreamGachaPrompts||(typeof require!=="undefined"?require("./app-prompts.js"):null);
  function promptSettings(source){return {basePromptLabel:String(source.basePromptLabel||""),basePromptReference:clone(source.basePromptReference||null),promptVersions:clone(source.promptVersions||[])}}
  function plainSettings(source){
    if(!source||typeof source!=="object")throw new Error("設定データが不正です");
    return {version:D.SETTINGS_VERSION,...promptSettings(source),characters:clone(source.characters||[]),pools:clone(source.pools||{}),basePrompt:String(source.basePrompt||""),protagonistProfile:String(source.protagonistProfile||""),workProtagonistProfiles:clone(source.workProtagonistProfiles||{}),worldMode:String(source.worldMode||"canon"),themeMode:String(source.themeMode||"system"),freeExtra:String(source.freeExtra||""),promptDraftSnapshot:clone(source.promptDraftSnapshot||null),deletedSeedIds:[...(source.deletedSeedIds||[])],characterId:source.characterId||null,values:clone(source.values||{}),locks:clone(source.locks||{}),filters:{...(source.filters||{}),workIncluded:[...(source.filters?.workIncluded||[])],workExcluded:[...(source.filters?.workExcluded||[])],seriesIncluded:[...(source.filters?.seriesIncluded||[])],seriesExcluded:[...(source.filters?.seriesExcluded||[])],tags:[...(source.filters?.tags||[])],characterIncluded:[...(source.filters?.characterIncluded||[])],characterExcluded:[...(source.filters?.characterExcluded||[])]},manage:clone(source.manage||{}),categoryInclude:clone(source.categoryInclude||{}),categoryExcluded:Object.fromEntries(Object.entries(source.categoryExcluded||{}).map(([k,v])=>[k,[...(v||[])]])),presets:clone(source.presets||[])};
  }
  function validateSettings(raw){
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("settings が不正です");
    if(raw.basePromptLabel!==undefined&&typeof raw.basePromptLabel!=="string")throw new Error("固定プロンプトの版名が不正です");
    if(raw.basePromptReference!=null&&(typeof raw.basePromptReference!=="object"||typeof raw.basePromptReference.standardText!=="string"||!raw.basePromptReference.standardText.trim()))throw new Error("固定プロンプトの比較基準が不正です");
    if(raw.promptVersions!==undefined){
      if(!Array.isArray(raw.promptVersions))throw new Error("プロンプト履歴が配列ではありません");
      const ids=new Set();for(const revision of raw.promptVersions){if(!P.validRevision(revision)||ids.has(revision.id))throw new Error("プロンプト履歴が不正またはIDが重複しています");ids.add(revision.id)}
    }
    if(!Array.isArray(raw.characters))throw new Error("characters が見つかりません");
    if(!raw.pools||typeof raw.pools!=="object"||Array.isArray(raw.pools))throw new Error("pools が不正です");
    for(const [k,v] of Object.entries(raw.pools))if(!Array.isArray(v))throw new Error(`pools.${k} が配列ではありません`);
    if(raw.presets!==undefined&&!Array.isArray(raw.presets))throw new Error("presets が配列ではありません");
    if(raw.workProtagonistProfiles!==undefined&&(!raw.workProtagonistProfiles||typeof raw.workProtagonistProfiles!=="object"||Array.isArray(raw.workProtagonistProfiles)))throw new Error("workProtagonistProfiles が不正です");
    if(raw.workProtagonistProfiles)for(const [work,value] of Object.entries(raw.workProtagonistProfiles))if(!work.trim()||typeof value!=="string")throw new Error("workProtagonistProfiles の作品名または設定が不正です");
    if(raw.worldMode!==undefined&&!['canon','modern','school','unrestricted'].includes(raw.worldMode))throw new Error("worldMode が不正です");
    if(raw.themeMode!==undefined&&!['system','light','dark'].includes(raw.themeMode))throw new Error("themeMode が不正です");
    if(raw.promptDraftSnapshot!==undefined&&raw.promptDraftSnapshot!==null&&(typeof raw.promptDraftSnapshot!=="object"||Array.isArray(raw.promptDraftSnapshot)))throw new Error("promptDraftSnapshot が不正です");
    const characterIds=new Set();for(const c of raw.characters){const id=c?.id;if(typeof id!=="string"||!id.trim())throw new Error("キャラIDが空か文字列ではありません");if(characterIds.has(id))throw new Error(`キャラIDが重複しています: ${id}`);characterIds.add(id)}
    for(const field of ["deletedSeedIds"]){if(raw[field]!==undefined&&(!Array.isArray(raw[field])||raw[field].some(v=>typeof v!=="string")))throw new Error(`${field} が不正です`)}
    for(const field of ["workIncluded","workExcluded","seriesIncluded","seriesExcluded","tags","characterIncluded","characterExcluded"])if(raw.filters?.[field]!==undefined&&(!Array.isArray(raw.filters[field])||raw.filters[field].some(v=>typeof v!=="string")))throw new Error(`filters.${field} が不正です`);
    if(raw.categoryExcluded!==undefined){if(!raw.categoryExcluded||typeof raw.categoryExcluded!=="object"||Array.isArray(raw.categoryExcluded))throw new Error("categoryExcluded が不正です");for(const [k,v] of Object.entries(raw.categoryExcluded))if(!Array.isArray(v)||v.some(x=>typeof x!=="string"))throw new Error(`categoryExcluded.${k} が不正です`)}
    const presetIds=new Set();for(const p of raw.presets||[]){if(!p||typeof p!=="object"||typeof p.id!=="string"||!p.id.trim()||!p.snapshot||typeof p.snapshot!=="object")throw new Error("保存条件データが不正です");if(presetIds.has(p.id))throw new Error(`保存条件IDが重複しています: ${p.id}`);presetIds.add(p.id)}
    return raw;
  }
  function migrateSettings(raw,defaults){
    const r=raw&&typeof raw==="object"?clone(raw):{},d=defaults||{};
    r.version=Number(r.version||0);if(r.version>D.SETTINGS_VERSION)throw new Error("このアプリより新しい形式の設定です");r.characters=Array.isArray(r.characters)?r.characters:[];r.pools=r.pools&&typeof r.pools==="object"&&!Array.isArray(r.pools)?r.pools:clone(d.pools||{});
    r.basePrompt=Object.prototype.hasOwnProperty.call(r,"basePrompt")?String(r.basePrompt):String(d.basePrompt||"");r.protagonistProfile=Object.prototype.hasOwnProperty.call(r,"protagonistProfile")?String(r.protagonistProfile):String(d.protagonistProfile||"");r.workProtagonistProfiles=r.workProtagonistProfiles&&typeof r.workProtagonistProfiles==="object"&&!Array.isArray(r.workProtagonistProfiles)?Object.fromEntries(Object.entries(r.workProtagonistProfiles).filter(([work,value])=>work.trim()&&typeof value==="string")):{};r.worldMode=['canon','modern','school','unrestricted'].includes(r.worldMode)?r.worldMode:String(d.worldMode||"canon");r.themeMode=['system','light','dark'].includes(r.themeMode)?r.themeMode:"system";r.promptDraftSnapshot=r.promptDraftSnapshot&&typeof r.promptDraftSnapshot==="object"&&!Array.isArray(r.promptDraftSnapshot)?r.promptDraftSnapshot:null;r.presets=Array.isArray(r.presets)?r.presets:[];
    return r;
  }
  function decodeSettings(raw,defaults,strict){
    const d=defaults||{},r=migrateSettings(raw,d),keys=["relationship","situation","mood","extra"];
    // A backup may contain only the pools that were customized. Hydrate every
    // omitted key from the defaults, while preserving an explicitly empty pool.
    r.pools=Object.fromEntries(Object.entries({...clone(d.pools||{}),...r.pools}).map(([k,v])=>[k,Array.isArray(v)?v.map(String):[]]));
    r.deletedSeedIds=Array.isArray(r.deletedSeedIds)?r.deletedSeedIds.map(String):[];r.values=r.values&&typeof r.values==="object"&&!Array.isArray(r.values)?r.values:{};
    r.locks=Object.fromEntries(["character",...keys].map(k=>[k,!!r.locks?.[k]]));
    const f=r.filters&&typeof r.filters==="object"?r.filters:{};r.filters={search:String(f.search||""),workIncluded:Array.isArray(f.workIncluded)?f.workIncluded.map(String):(f.work?[String(f.work)]:[]),workExcluded:Array.isArray(f.workExcluded)?f.workExcluded.map(String):[],seriesIncluded:Array.isArray(f.seriesIncluded)?f.seriesIncluded.map(String):(f.series?[String(f.series)]:[]),seriesExcluded:Array.isArray(f.seriesExcluded)?f.seriesExcluded.map(String):[],tags:Array.isArray(f.tags)?f.tags.map(String):[],tagMode:f.tagMode==="any"?"any":"all",favorite:["favorite","normal"].includes(f.favorite)?f.favorite:"all",minHeight:Number.isFinite(f.minHeight)?f.minHeight:null,maxHeight:Number.isFinite(f.maxHeight)?f.maxHeight:null,characterIncluded:Array.isArray(f.characterIncluded)?f.characterIncluded.map(String):[],characterExcluded:Array.isArray(f.characterExcluded)?f.characterExcluded.map(String):[]};
    r.manage={status:["active","archived"].includes(r.manage?.status)?r.manage.status:"all",sort:String(r.manage?.sort||"work")};
    r.categoryInclude=Object.fromEntries(["character",...keys].map(k=>[k,r.categoryInclude?.[k]?String(r.categoryInclude[k]):null]));
    const legacyExcluded=Array.isArray(r.situationExcludedCategories)?r.situationExcludedCategories.map(String):[];
    r.categoryExcluded=Object.fromEntries(["character",...keys].map(k=>[k,Array.isArray(r.categoryExcluded?.[k])?r.categoryExcluded[k].map(String):(k==="situation"?legacyExcluded:[])]));
    if(strict)validateSettings(r);return r;
  }
  function makeBackup(settings,novels,meta){
    if(!Array.isArray(novels))throw new Error("夢小説アーカイブを読み込めませんでした");
    return {schema:D.BACKUP_SCHEMA,version:D.BACKUP_VERSION,app:"夢小説シチュガチャ",appVersion:D.SETTINGS_VERSION,exportedAt:new Date().toISOString(),data:{...plainSettings(settings),novels:clone(novels),...(meta||{})}};
  }
  function validateBackup(payload){
    if(!payload||payload.schema!==D.BACKUP_SCHEMA||!payload.data)throw new Error("完全バックアップ形式ではありません");
    const version=Number(payload.version);if(!Number.isInteger(version)||version<1)throw new Error("バックアップのバージョンが不正です");if(version>D.BACKUP_VERSION)throw new Error("このアプリより新しい形式のバックアップです");
    const data=clone(payload.data);
    if(!Object.prototype.hasOwnProperty.call(data,"version")){
      const appVersion=Number(payload.appVersion);
      if(Number.isFinite(appVersion))data.version=appVersion;
    }
    validateSettings(data);
    if(version>=2&&!Array.isArray(data.novels))throw new Error("novels が見つかりません");
    if(data.novels!==undefined&&!Array.isArray(data.novels))throw new Error("novels が配列ではありません");
    const novelIds=new Set();for(const n of data.novels||[]){const id=n?.id;if(!n||typeof n!=="object"||typeof id!=="string"||!id.trim()||typeof n.body!=="string")throw new Error("夢小説データが不正です");if(novelIds.has(id))throw new Error(`夢小説IDが重複しています: ${id}`);novelIds.add(id)}
    return data;
  }
  async function restoreAtomically(adapters,next){
    const before={settings:await adapters.readSettings(),novels:await adapters.readNovels()};
    try{await adapters.writeSettings(next.settings);await adapters.writeNovels(next.novels)}catch(error){
      const rollback=[];try{await adapters.writeSettings(before.settings)}catch(e){rollback.push(e)}try{await adapters.writeNovels(before.novels)}catch(e){rollback.push(e)}
      if(rollback.length)throw new AggregateError([error,...rollback],"復元に失敗し、元データの復旧も完了できませんでした");throw error;
    }
  }
  root.DreamGachaStorage={plainSettings,validateSettings,migrateSettings,decodeSettings,makeBackup,validateBackup,restoreAtomically};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.DreamGachaStorage;
})(typeof globalThis!=="undefined"?globalThis:this);
