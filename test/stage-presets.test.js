const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app-context.js');
const P=require('../stage-presets.js');

test('bundled stages are valid independent choices and never apply until selected',()=>{
 const settings=P.addMissing(C.emptySettings());
 assert.equal(settings.entries.length,14);
 C.validateSettings(settings);
 const context={character:{id:'c',work:'任意作品',series:'任意部'},worldMode:'canon',protagonistProfile:'成人女性、160cm',workProtagonistProfile:'作品別夢主'};
 assert.deepEqual(C.resolve(settings,C.emptySelection(),C.emptyOutput(),context).sections,[]);
 for(const e of settings.entries){
   const selection={...C.emptySelection(),stageId:e.id};
   const result=C.resolve(settings,selection,C.emptyOutput(),{...context,worldMode:e.worldMode});
   assert.deepEqual(result.errors,[]);
   assert.equal(result.sections.length,1);
   assert.equal(result.sections[0].text,e.body);
   assert.equal(result.protagonist,context.protagonistProfile);
   assert.equal(result.workProtagonist,context.workProtagonistProfile);
 }
});

test('adding missing stages preserves user edits, disabled entries, references and same-title custom entries',()=>{
 const edited={...structuredClone(P.entries[0]),title:'自分の現パロ',body:'自分だけの文\r\n😀',enabled:false,revision:7};
 const custom={...structuredClone(P.entries[1]),id:'my-campus'};
 const supplement={...structuredClone(P.entries[2]),id:'office-note',kind:'supplement',scope:{...P.entries[2].scope,stageIds:[P.entries[2].id]}};
 const original={style:'文体の好み',entries:[edited,custom,supplement,structuredClone(P.entries[2])]},before=structuredClone(original);
 C.validateSettings(original);
 const result=P.addMissing(original);
 C.validateSettings(result);
 assert.deepEqual(original,before);
 assert.deepEqual(result.entries.slice(0,4),before.entries);
 assert.equal(result.entries.length,P.entries.length+2);
 assert.deepEqual(P.addMissing(result),result);
 const second=P.addMissing(C.emptySettings());result.entries.at(-1).body='後から変更';
 assert.notEqual(second.entries.at(-1).body,'後から変更');
});
