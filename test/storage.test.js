const test=require("node:test");
const assert=require("node:assert/strict");
global.DreamGachaData=require("../app-data.js");
const storage=require("../app-storage.js");
const settings={characters:[{id:"c1",name:"A"}],pools:{relationship:[]},deletedSeedIds:new Set(["x"]),filters:{workIncluded:new Set(["W1"]),workExcluded:new Set(["W2"]),seriesIncluded:new Set(["S1"]),seriesExcluded:new Set(["S2"]),tags:new Set(["t"]),characterIncluded:new Set(["c1"]),characterExcluded:new Set(["c2"])},categoryExcluded:{situation:new Set(["bad"])},workProtagonistProfiles:{W:"作品設定"},worldMode:"modern",themeMode:"dark",presets:[]};

test("serialization converts Sets and full backup requires loaded novels",()=>{
  const plain=storage.plainSettings(settings);assert.deepEqual(plain.deletedSeedIds,["x"]);assert.deepEqual(plain.filters.tags,["t"]);assert.deepEqual(plain.filters.workIncluded,["W1"]);assert.deepEqual(plain.filters.workExcluded,["W2"]);assert.deepEqual(plain.filters.seriesIncluded,["S1"]);assert.deepEqual(plain.filters.seriesExcluded,["S2"]);assert.deepEqual(plain.filters.characterIncluded,["c1"]);assert.deepEqual(plain.filters.characterExcluded,["c2"]);assert.deepEqual(plain.workProtagonistProfiles,{W:"作品設定"});assert.equal(plain.worldMode,"modern");assert.equal(plain.themeMode,"dark");
  assert.throws(()=>storage.makeBackup(settings,null),/アーカイブ/);assert.deepEqual(storage.makeBackup(settings,[]).data.novels,[]);
});

test("prompt draft and novel snapshots survive a full backup round trip",()=>{
  const promptDraftSnapshot={character:{id:"c1",name:"A",work:"W"},relationship:"R",situation:"T",prompt:"frozen prompt"};
  const novels=[{id:"n1",body:"body",createdAt:"2026-01-01",updatedAt:"2026-01-02",snapshot:promptDraftSnapshot,promptSnapshot:"frozen prompt"}];
  const decoded=storage.validateBackup(storage.makeBackup({...settings,promptDraftSnapshot},novels));
  assert.deepEqual(decoded.promptDraftSnapshot,promptDraftSnapshot);
  assert.deepEqual(decoded.novels,novels);
});

test("shared decoder normalizes persisted fields before load or restore",()=>{
  const decoded=storage.decodeSettings({...storage.plainSettings(settings),pools:{relationship:[1]},locks:{character:1},filters:{tags:["x"],minHeight:"170"}}, {pools:{relationship:["default"],situation:["scene"],mood:["mood"]}},true);
  assert.deepEqual(decoded.pools.relationship,["1"]);assert.equal(decoded.locks.character,true);assert.equal(decoded.filters.minHeight,null);
  assert.deepEqual(decoded.pools.situation,["scene"]);assert.deepEqual(decoded.pools.mood,["mood"]);
  assert.deepEqual(decoded.filters.characterIncluded,[]);assert.deepEqual(decoded.filters.characterExcluded,[]);
  assert.equal(decoded.worldMode,"modern");assert.equal(decoded.themeMode,"dark");assert.deepEqual(decoded.workProtagonistProfiles,{W:"作品設定"});
  const decodedRules=storage.decodeSettings(storage.plainSettings(settings),{},true);
  assert.deepEqual(decodedRules.filters.characterIncluded,["c1"]);assert.deepEqual(decodedRules.filters.characterExcluded,["c2"]);
  const explicitEmpty=storage.decodeSettings({...storage.plainSettings(settings),pools:{relationship:[]}},{pools:{relationship:["default"],situation:["scene"]}},true);
  assert.deepEqual(explicitEmpty.pools.relationship,[]);assert.deepEqual(explicitEmpty.pools.situation,["scene"]);
});

test("legacy settings get the default world mode and invalid new fields are rejected",()=>{
  const legacy=storage.decodeSettings({characters:[],pools:{}},{worldMode:"canon"},true);assert.equal(legacy.worldMode,"canon");assert.equal(legacy.themeMode,"system");assert.deepEqual(legacy.workProtagonistProfiles,{});
  assert.throws(()=>storage.validateSettings({...storage.plainSettings(settings),worldMode:"space"}),/worldMode/);
  assert.throws(()=>storage.validateSettings({...storage.plainSettings(settings),themeMode:"neon"}),/themeMode/);
  assert.throws(()=>storage.validateSettings({...storage.plainSettings(settings),workProtagonistProfiles:[]}),/workProtagonistProfiles/);
  assert.throws(()=>storage.validateSettings({...storage.plainSettings(settings),promptDraftSnapshot:"bad"}),/promptDraftSnapshot/);
});

test("shared decoder migrates legacy situation exclusions",()=>{
  const decoded=storage.decodeSettings({...storage.plainSettings(settings),categoryExcluded:undefined,situationExcludedCategories:["学園"]},{},true);
  assert.deepEqual(decoded.categoryExcluded.situation,["学園"]);
});

test("shared decoder migrates legacy single work and series filters",()=>{
  const plain=storage.plainSettings(settings);
  plain.filters={work:"Old Work",series:"Old Series",tags:[]};
  const decoded=storage.decodeSettings(plain,{},true);
  assert.deepEqual(decoded.filters.workIncluded,["Old Work"]);assert.deepEqual(decoded.filters.workExcluded,[]);
  assert.deepEqual(decoded.filters.seriesIncluded,["Old Series"]);assert.deepEqual(decoded.filters.seriesExcluded,[]);
});

test("backup validation supports legacy missing novels, explicit empty, and rejects future/duplicates",()=>{
  const base={schema:"dream-gacha.full-backup",version:1,data:storage.plainSettings(settings)};
  assert.equal(storage.validateBackup(base).novels,undefined);
  assert.deepEqual(storage.validateBackup({...base,version:2,data:{...base.data,novels:[]}}).novels,[]);
  assert.throws(()=>storage.validateBackup({...base,version:999}),/新しい形式/);
  assert.throws(()=>storage.validateBackup({...base,data:{...base.data,characters:[{id:"x"},{id:"x"}]}}),/重複/);
  assert.throws(()=>storage.validateBackup({...base,version:2,data:{...base.data,novels:[{id:1,body:"x"}]}}),/夢小説データ/);
});

test("backup validation derives a missing settings version from appVersion",()=>{
  const data=storage.plainSettings(settings);delete data.version;
  const decoded=storage.validateBackup({schema:"dream-gacha.full-backup",version:1,appVersion:14,data});
  assert.equal(decoded.version,14);
});

test("cross-store restore rolls both stores back after partial failure",async()=>{
  let currentSettings={old:true},currentNovels=[{id:"old"}],novelWrites=0;
  const adapters={readSettings:async()=>currentSettings,readNovels:async()=>currentNovels,writeSettings:async v=>{currentSettings=v},writeNovels:async v=>{novelWrites++;if(novelWrites===1)throw new Error("disk full");currentNovels=v}};
  await assert.rejects(storage.restoreAtomically(adapters,{settings:{new:true},novels:[{id:"new"}]}),/disk full/);
  assert.deepEqual(currentSettings,{old:true});assert.deepEqual(currentNovels,[{id:"old"}]);
});
