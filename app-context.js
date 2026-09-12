(function(root){
  "use strict";
  const clone=value=>JSON.parse(JSON.stringify(value));
  const MODES=["canon","modern","school","unrestricted"];
  const KINDS=["stage","supplement","protagonist"];
  const SCOPES=["works","series","characterIds","worldModes","stageIds"];
  const emptySettings=()=>({style:"",entries:[]});
  const emptySelection=()=>({stageId:"",manualIds:[],excludedIds:[]});
  const emptyOutput=()=>({length:"",pov:""});
  const fail=message=>{throw new Error(message)};
  const object=value=>!!value&&typeof value==="object"&&!Array.isArray(value);
  const strings=value=>Array.isArray(value)&&value.every(x=>typeof x==="string"&&x.trim())&&new Set(value).size===value.length;
  function validateSettings(value){
    if(!object(value)||typeof value.style!=="string"||!Array.isArray(value.entries))fail("補足設定集の形式が不正です");
    const ids=new Set();
    for(const e of value.entries){
      if(!object(e)||typeof e.id!=="string"||!e.id.trim()||ids.has(e.id))fail("補足設定のIDが空または重複しています");
      ids.add(e.id);
      if(!KINDS.includes(e.kind)||typeof e.title!=="string"||!e.title.trim()||typeof e.body!=="string"||typeof e.enabled!=="boolean"||!Number.isInteger(e.revision)||e.revision<1)fail("補足設定の名前・種類・版が不正です");
      if(!["auto","manual"].includes(e.activation)||!["append","replace"].includes(e.protagonistMode)||!MODES.includes(e.worldMode))fail("補足設定の適用方法が不正です");
      if(!object(e.scope)||SCOPES.some(k=>!strings(e.scope[k])))fail("補足設定の適用条件が不正です");
      if(e.scope.worldModes.some(m=>!MODES.includes(m)))fail("補足設定の世界観が不正です");
      if(e.kind==="stage"&&(e.scope.stageIds.length||e.scope.worldModes.length))fail("舞台の世界観は対応モードで指定してください");
      if(!object(e.reference)||["name","version","excerpt"].some(k=>typeof e.reference[k]!=="string"))fail("参考資料の形式が不正です");
    }
    for(const e of value.entries)for(const id of e.scope.stageIds)if(!value.entries.some(s=>s.id===id&&s.kind==="stage"))fail(`参照先の舞台設定がありません：${e.title}`);
    return value;
  }
  function validateSelection(value){
    if(!object(value)||typeof value.stageId!=="string"||!strings(value.manualIds)||!strings(value.excludedIds))fail("今回の補足設定の選択が不正です");
    return value;
  }
  function validateOutput(value){
    if(!object(value)||typeof value.length!=="string"||!/^$|^[1-9]\d{0,5}$/.test(value.length)||!['','protagonist','character','third'].includes(value.pov))fail("希望分量・視点の指定が不正です");
    return value;
  }
  function capture(settings,selection,output){
    validateSettings(settings);validateSelection(selection);validateOutput(output);
    return clone({version:1,settings,selection,output});
  }
  function validateSnapshot(value){
    if(!object(value)||value.version!==1)fail("補足設定の生成時記録が不正です");
    capture(value.settings,value.selection,value.output);return value;
  }
  function fields(source){
    return {promptSettings:clone(source.promptSettings??emptySettings()),promptSelection:clone(source.promptSelection??emptySelection()),promptOutput:clone(source.promptOutput??emptyOutput()),promptContextOverride:clone(source.promptContextOverride??null)};
  }
  function validateFields(source){
    if(source.promptSettings!==undefined)validateSettings(source.promptSettings);
    if(source.promptSelection!==undefined)validateSelection(source.promptSelection);
    if(source.promptOutput!==undefined)validateOutput(source.promptOutput);
    if(source.promptContextOverride!=null)validateSnapshot(source.promptContextOverride);
  }
  function matches(scope,context){
    const c=context.character||{};
    const values={works:c.work,series:c.series,characterIds:c.id,worldModes:context.worldMode,stageIds:context.stageId};
    return SCOPES.every(key=>!scope[key].length||scope[key].includes(values[key]));
  }
  function referenceText(e){
    const r=e.reference;if(!r.name&&!r.excerpt)return "";
    const heading=[r.name,r.version].filter(Boolean).join(" / ");
    return r.excerpt?`参考資料${heading?`：${heading}`:""}（以下の抜粋を提供）\n${r.excerpt}`:`参照資料：${heading}\n資料本文はこのプロンプトに含まれていません。参照できない場合は、内容を推測せず確認してください。`;
  }
  function entryText(e){return [e.body,referenceText(e)].filter(Boolean).join("\n\n")}
  function resolve(settings,selection,output,context){
    validateSettings(settings);validateSelection(selection);validateOutput(output);
    const errors=[],rows=[],sections=[];
    const stage=settings.entries.find(e=>e.id===selection.stageId&&e.kind==="stage");
    if(selection.stageId){
      if(!stage||!stage.enabled)errors.push("選択した舞台が無効または見つかりません。舞台を選び直してください。");
      else if(stage.worldMode!==context.worldMode||!matches(stage.scope,{...context,stageId:stage.id}))errors.push(`舞台「${stage.title}」とキャラ・世界観が一致しません。舞台またはキャラ・世界観を選び直してください。`);
      else sections.push({id:stage.id,title:`舞台設定：${stage.title}`,text:entryText(stage),revision:stage.revision});
    }
    for(const e of settings.entries){
      if(e.kind==="stage"||!e.enabled||!matches(e.scope,{...context,stageId:selection.stageId}))continue;
      const excluded=selection.excludedIds.includes(e.id),active=!excluded&&(e.activation==="auto"||selection.manualIds.includes(e.id));
      rows.push({entry:e,active,reason:excluded?"今回だけ除外":e.activation==="auto"?"条件に一致・自動適用":active?"今回選択":"選択すると適用"});
    }
    const active=rows.filter(r=>r.active).map(r=>r.entry),replacements=active.filter(e=>e.kind==="protagonist"&&e.protagonistMode==="replace");
    if(replacements.length>1)errors.push(`夢主の置き換え設定が複数あります：${replacements.map(e=>e.title).join("、")}。適用を一つにしてください。`);
    let protagonist=context.protagonistProfile||"",workProtagonist=context.workProtagonistProfile||"";
    if(replacements.length===1){protagonist=entryText(replacements[0]);workProtagonist="";}
    for(const e of active){
      if(e.kind==="protagonist"&&e.protagonistMode==="replace")continue;
      sections.push({id:e.id,title:`${e.kind==="protagonist"?"夢主の補足":"補足設定"}：${e.title}`,text:entryText(e),revision:e.revision});
    }
    if(settings.style)sections.unshift({title:"文章の好み",text:settings.style});
    const pov={protagonist:"夢主の視点を中心に描いてください。",character:"相手キャラクターの視点を中心に描いてください。",third:"三人称で描き、視点を変える際は切り替わりを明確にしてください。"};
    const instructions=[output.length?`本文はおよそ${output.length}字を目安にしてください。`:"",pov[output.pov]||""].filter(Boolean).join("\n");
    if(instructions)sections.push({title:"今回の出力指定",text:instructions});
    return {errors,rows,stage,sections,protagonist,workProtagonist,replacement:replacements[0]||null};
  }
  root.DreamGachaContext={emptySettings,emptySelection,emptyOutput,fields,validateFields,validateSettings,validateSelection,validateOutput,validateSnapshot,capture,matches,resolve,KINDS,SCOPES};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.DreamGachaContext;
})(typeof globalThis!=="undefined"?globalThis:this);
