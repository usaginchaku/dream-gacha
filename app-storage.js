(function(root){
  "use strict";
  const D=root.DreamGachaData||{SETTINGS_KEY:"dreamGachaSettings",SETTINGS_VERSION:22,BACKUP_SCHEMA:"dream-gacha.full-backup",BACKUP_VERSION:2};
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  function plainSettings(source){
    if(!source||typeof source!=="object")throw new Error("設定データが不正です");
    return {version:D.SETTINGS_VERSION,characters:clone(source.characters||[]),pools:clone(source.pools||{}),basePrompt:String(source.basePrompt||""),protagonistProfile:String(source.protagonistProfile||""),freeExtra:String(source.freeExtra||""),deletedSeedIds:[...(source.deletedSeedIds||[])],characterId:source.characterId||null,values:clone(source.values||{}),locks:clone(source.locks||{}),filters:{...(source.filters||{}),tags:[...(source.filters?.tags||[])]},manage:clone(source.manage||{}),categoryInclude:clone(source.categoryInclude||{}),categoryExcluded:Object.fromEntries(Object.entries(source.categoryExcluded||{}).map(([k,v])=>[k,[...(v||[])]])),presets:clone(source.presets||[])};
  }
  function validateSettings(raw){
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("settings が不正です");
    if(!Array.isArray(raw.characters))throw new Error("characters が見つかりません");
    if(!raw.pools||typeof raw.pools!=="object"||Array.isArray(raw.pools))throw new Error("pools が不正です");
    for(const [k,v] of Object.entries(raw.pools))if(!Array.isArray(v))throw new Error(`pools.${k} が配列ではありません`);
    if(raw.presets!==undefined&&!Array.isArray(raw.presets))throw new Error("presets が配列ではありません");
    const characterIds=new Set();for(const c of raw.characters){const id=c?.id;if(typeof id!=="string"||!id.trim())throw new Error("キャラIDが空か文字列ではありません");if(characterIds.has(id))throw new Error(`キャラIDが重複しています: ${id}`);characterIds.add(id)}
    for(const field of ["deletedSeedIds"]){if(raw[field]!==undefined&&(!Array.isArray(raw[field])||raw[field].some(v=>typeof v!=="string")))throw new Error(`${field} が不正です`)}
    if(raw.filters?.tags!==undefined&&(!Array.isArray(raw.filters.tags)||raw.filters.tags.some(v=>typeof v!=="string")))throw new Error("filters.tags が不正です");
    if(raw.categoryExcluded!==undefined){if(!raw.categoryExcluded||typeof raw.categoryExcluded!=="object"||Array.isArray(raw.categoryExcluded))throw new Error("categoryExcluded が不正です");for(const [k,v] of Object.entries(raw.categoryExcluded))if(!Array.isArray(v)||v.some(x=>typeof x!=="string"))throw new Error(`categoryExcluded.${k} が不正です`)}
    const presetIds=new Set();for(const p of raw.presets||[]){if(!p||typeof p!=="object"||typeof p.id!=="string"||!p.id.trim()||!p.snapshot||typeof p.snapshot!=="object")throw new Error("保存条件データが不正です");if(presetIds.has(p.id))throw new Error(`保存条件IDが重複しています: ${p.id}`);presetIds.add(p.id)}
    return raw;
  }
  function migrateSettings(raw,defaults){
    const r=raw&&typeof raw==="object"?clone(raw):{},d=defaults||{};
    r.version=Number(r.version||0);if(r.version>D.SETTINGS_VERSION)throw new Error("このアプリより新しい形式の設定です");r.characters=Array.isArray(r.characters)?r.characters:[];r.pools=r.pools&&typeof r.pools==="object"&&!Array.isArray(r.pools)?r.pools:clone(d.pools||{});
    r.basePrompt=Object.prototype.hasOwnProperty.call(r,"basePrompt")?String(r.basePrompt):String(d.basePrompt||"");r.protagonistProfile=Object.prototype.hasOwnProperty.call(r,"protagonistProfile")?String(r.protagonistProfile):String(d.protagonistProfile||"");r.presets=Array.isArray(r.presets)?r.presets:[];
    return r;
  }
  function decodeSettings(raw,defaults,strict){
    const d=defaults||{},r=migrateSettings(raw,d),keys=["relationship","situation","mood","extra"];
    // A backup may contain only the pools that were customized. Hydrate every
    // omitted key from the defaults, while preserving an explicitly empty pool.
    r.pools=Object.fromEntries(Object.entries({...clone(d.pools||{}),...r.pools}).map(([k,v])=>[k,Array.isArray(v)?v.map(String):[]]));
    r.deletedSeedIds=Array.isArray(r.deletedSeedIds)?r.deletedSeedIds.map(String):[];r.values=r.values&&typeof r.values==="object"&&!Array.isArray(r.values)?r.values:{};
    r.locks=Object.fromEntries(["character",...keys].map(k=>[k,!!r.locks?.[k]]));
    const f=r.filters&&typeof r.filters==="object"?r.filters:{};r.filters={search:String(f.search||""),work:String(f.work||""),series:String(f.series||""),tags:Array.isArray(f.tags)?f.tags.map(String):[],tagMode:f.tagMode==="any"?"any":"all",favorite:["favorite","normal"].includes(f.favorite)?f.favorite:"all",minHeight:Number.isFinite(f.minHeight)?f.minHeight:null,maxHeight:Number.isFinite(f.maxHeight)?f.maxHeight:null};
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
