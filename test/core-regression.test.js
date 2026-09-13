"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {makeApp,run}=require("./helpers/app-harness.js");

test("deleting a bundled character stays deleted on reload without deleting its card or saved conditions",()=>{
 const app=makeApp();app.context.confirm=()=>true;
 run(app,`load();state.presets=[{id:'keep',snapshot:{character:{id:'jojo-fugo'},prompt:'keep'}}];
 state.promptSettings.entries.push({id:'card',revision:1,title:'声',kind:'supplement',body:'keep card',enabled:true,activation:'manual',protagonistMode:'append',worldMode:'modern',scope:{works:[],series:[],characterIds:['jojo-fugo'],worldModes:[],stageIds:[]},reference:{name:'',version:'',excerpt:''},characterNote:{section:'voice',sourceKind:'interpretation',verification:'unverified'}});
 deleteIds(['jojo-fugo']);`);
 assert.equal(run(app,"state.characters.some(c=>c.id==='jojo-fugo')"),false);
 run(app,"load()");assert.equal(run(app,"state.characters.some(c=>c.id==='jojo-fugo')"),false);
 assert.equal(run(app,"state.presets[0].snapshot.prompt"),"keep");
 assert.equal(run(app,"state.promptSettings.entries.find(e=>e.id==='card').body"),"keep card");
 run(app,"DreamGachaRecipe.renderOrphanNotes()");assert.equal(app.get('#orphanCharacterNotes').hidden,false);
});

test("deleting a legacy named copy also suppresses the matching bundled character on reload",()=>{
 const app=makeApp();app.context.confirm=()=>true;
 run(app,"load();const legacy=state.characters.find(c=>c.id==='jojo-fugo');legacy.id='custom-legacy-fugo';deleteIds(['custom-legacy-fugo']);load();");
 assert.equal(run(app,"state.characters.some(c=>c.id==='jojo-fugo'||c.id==='custom-legacy-fugo')"),false);
});
