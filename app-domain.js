(function(root){
  "use strict";
  function text(value){return String(value??"")}
  function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
  function formatPrompt(input){
    const c=input.character||null,free=text(input.freeExtra).trim();
    const parts=[text(input.basePrompt),"","【キャラ】",c?.name||""];
    if(c?.work)parts.push("","【作品】",c.work);
    if(c?.series)parts.push("","【部・シリーズ】",c.series);
    if(c?.heightText)parts.push("","【公称身長】",c.heightText);
    if(input.worldModeLabel||input.worldModePrompt)parts.push("","【世界観モード】",[text(input.worldModeLabel),text(input.worldModePrompt)].filter(Boolean).join("："));
    parts.push("","【関係性】",text(input.relationship),"","【シチュ】",text(input.situation),"","【雰囲気】",text(input.mood),"","【追加条件】",text(input.extra));
    if(input.supportingSituation)parts.push("","【補助シチュ】",text(input.supportingSituation));
    if(input.protagonistProfile)parts.push("","【夢主設定】",text(input.protagonistProfile));
    if(input.workProtagonistProfile)parts.push("",`【作品別の夢主設定${c?.work?`：${c.work}`:""}】`,text(input.workProtagonistProfile));
    for(const section of input.contextSections||[])if(section.text)parts.push("",`【${section.title}】`,text(section.text));
    if(free)parts.push("","【自由な追加指定】",free);
    return parts.join("\n").trim()+"\n";
  }
  function makeSnapshot(input,now){
    const c=input.character;
    return {character:c?{id:text(c.id),name:text(c.name),work:text(c.work),series:text(c.series),tags:Array.isArray(c.tags)?[...c.tags]:[],heightText:text(c.heightText),heightCm:Number.isFinite(c.heightCm)?c.heightCm:null}:null,
      relationship:text(input.relationship),situation:text(input.situation),mood:text(input.mood),extra:text(input.extra),freeExtra:text(input.freeExtra),
      protagonistProfile:text(input.protagonistProfile),workProtagonistProfile:text(input.workProtagonistProfile),worldMode:text(input.worldMode),prompt:text(input.prompt),...(input.supportingSituation?{supportingSituation:text(input.supportingSituation)}:{}),...(input.promptBaseText!==undefined?{promptBaseText:text(input.promptBaseText)}:{}),...(input.promptRecord?{promptRecord:clone(input.promptRecord)}:{}),...(input.promptContext?{promptContext:clone(input.promptContext)}:{}),savedAt:now||new Date().toISOString()};
  }
  function resolveSnapshot(snapshot,characters,defaultProfile){
    const s=snapshot&&typeof snapshot==="object"?snapshot:{};
    const ref=s.character&&typeof s.character==="object"?s.character:null;
    const list=characters||[],exact=ref?list.find(c=>c.id===ref.id):null;
    const character=!ref?null:exact?(exact.archived?null:exact):list.find(c=>!c.archived&&c.name===ref.name&&c.work===ref.work)||null;
    return {characterId:character?.id||null,relationship:text(s.relationship),situation:text(s.situation),mood:text(s.mood),extra:text(s.extra),
      freeExtra:text(s.freeExtra),supportingSituation:text(s.supportingSituation),protagonistProfile:Object.prototype.hasOwnProperty.call(s,"protagonistProfile")?text(s.protagonistProfile):text(defaultProfile),workProtagonistProfile:text(s.workProtagonistProfile),worldMode:["canon","modern","school","unrestricted"].includes(s.worldMode)?s.worldMode:"canon",prompt:text(s.prompt),missingCharacter:!!ref&&!character};
  }
  function sameConditions(a,b){
    if(!a||!b)return false;
    const key=s=>{
      const c=s.character;
      return [c?[c.id,c.name,c.work,c.series,c.heightText,c.heightCm].map(text):null,
        ...["relationship","situation","supportingSituation","mood","extra","freeExtra","protagonistProfile","workProtagonistProfile","worldMode"].map(k=>text(s[k])),
        s.promptContext||null];
    };
    // savedAt and editable output do not define the conditions used to generate it.
    return JSON.stringify(key(a))===JSON.stringify(key(b));
  }
  function preview(textValue,limit){
    const value=text(textValue).replace(/\s+/g," ").trim(),max=Math.max(1,Number(limit)||320);
    return value.length<=max?value:value.slice(0,max).trimEnd()+"…";
  }
  function filterNovels(items,query,favoriteOnly){
    const q=text(query).trim().toLowerCase();
    return (items||[]).filter(n=>{if(favoriteOnly&&!n.favorite)return false;if(!q)return true;const s=n.snapshot||{};return [n.title,n.body,n.memo,n.generationAi,n.generationModel,s.character?.name,s.character?.work,s.relationship,s.situation,s.supportingSituation,s.mood,s.extra,s.worldMode,s.protagonistProfile,s.workProtagonistProfile].join(" ").toLowerCase().includes(q)});
  }
  root.DreamGachaDomain={clone,formatPrompt,makeSnapshot,resolveSnapshot,sameConditions,preview,filterNovels};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.DreamGachaDomain;
})(typeof globalThis!=="undefined"?globalThis:this);
