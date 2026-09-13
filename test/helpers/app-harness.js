"use strict";

// Lightweight integration coverage for the classic, file://-compatible bundle.
// This deliberately executes the real app functions (with browser storage/UI mocked).
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const root=path.resolve(__dirname,"../..");

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
 for(const file of ["app-data.js","app-context.js","app-domain.js","app-prompts.js","app-storage.js","app-ui.js","character-data.generated.js","seed-data.js","stage-presets.js","app-context-ui.js","app-character-card-ui.js","app-recipe.js"])
   vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
 let app=fs.readFileSync(path.join(root,"app.js"),"utf8");
 app=app.replace(/\ninit\(\);\s*$/,"\n// init stripped for controlled integration tests\n");
 vm.runInContext(app,context,{filename:"app.js"});
 return {context,elements,local,get,tabs};
}
function run(app,code){return vm.runInContext(code,app.context)}


module.exports={makeApp,run};
