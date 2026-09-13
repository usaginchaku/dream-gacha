(function(root){
  "use strict";
  const clone=value=>JSON.parse(JSON.stringify(value));
  const MODES=["canon","modern","school","unrestricted"];
  const KINDS=["stage","supplement","protagonist"];
  const SCOPES=["works","series","characterIds","worldModes","stageIds"];
  const NOTE_SECTIONS={voice:"話し方",personality:"人格・判断",romance:"感情・恋愛",examples:"言動例",background:"所属・経歴",memo:"自由メモ"};
  const NOTE_SOURCES={canon:"原作情報",interpretation:"自分の解釈",au:"AU創作設定",unclassified:"未分類"};
  const MODE_LABELS={canon:"原作世界",modern:"現代パロ",school:"学園パロ",unrestricted:"制限なし"};
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
      if(e.characterNote!==undefined){
        const note=e.characterNote;
        if(e.kind!=="supplement"||e.scope.characterIds.length!==1)fail("キャラカルテは一人のキャラを対象にした補足として保存してください");
        if(!object(note)||!Object.hasOwn(NOTE_SECTIONS,note.section)||!Object.hasOwn(NOTE_SOURCES,note.sourceKind)||!["unverified","user_checked"].includes(note.verification))fail("キャラカルテの項目・出所・確認状態が不正です");
      }
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
    return clone({version:settings.entries.some(e=>e.characterNote!==undefined)?2:1,settings,selection,output});
  }
  function validateSnapshot(value){
    if(!object(value)||![1,2].includes(value.version))fail("補足設定の生成時記録が不正です");
    const captured=capture(value.settings,value.selection,value.output);
    if(value.version===1&&captured.version===2)fail("キャラカルテを含む生成時記録には形式2が必要です");
    return value;
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
  function characterNoteLabel(e,settings){
    if(!e.characterNote)return "";
    const scope=e.scope,parts=[];
    if(scope.stageIds.length)parts.push(`舞台：${scope.stageIds.map(id=>settings.entries.find(s=>s.id===id&&s.kind==="stage")?.title||"未登録の舞台").join("／")}`);
    if(scope.worldModes.length)parts.push(scope.worldModes.map(m=>MODE_LABELS[m]).join("／"));
    if(!parts.length)parts.push("共通");
    parts.push(NOTE_SOURCES[e.characterNote.sourceKind],NOTE_SECTIONS[e.characterNote.section],e.characterNote.verification==="user_checked"?"利用者確認済み":"未確認");
    return parts.join("・");
  }
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
      const title=e.characterNote?`キャラカルテ（${characterNoteLabel(e,settings)}）`:(e.kind==="protagonist"?"夢主の補足":"補足設定");
      const auRule=e.characterNote?.sourceKind==="au"&&e.scope.stageIds.includes(selection.stageId)?"この舞台のキャラ設定として適用してください。共通カルテと異なる内容は、この舞台について明記された点だけを優先し、記載のない人格・口調の変更は補わないでください。":"";
      sections.push({id:e.id,title:`${title}：${e.title}`,text:[auRule,entryText(e)].filter(Boolean).join("\n\n"),revision:e.revision});
    }
    if(settings.style)sections.unshift({title:"文章の好み",text:settings.style});
    const pov={protagonist:"夢主の視点を中心に描いてください。",character:"相手キャラクターの視点を中心に描いてください。",third:"三人称で描き、視点を変える際は切り替わりを明確にしてください。"};
    const instructions=[output.length?`本文はおよそ${output.length}字を目安にしてください。`:"",pov[output.pov]||""].filter(Boolean).join("\n");
    if(instructions)sections.push({title:"今回の出力指定",text:instructions});
    return {errors,rows,stage,sections,protagonist,workProtagonist,replacement:replacements[0]||null};
  }
  root.DreamGachaContext={emptySettings,emptySelection,emptyOutput,fields,validateFields,validateSettings,validateSelection,validateOutput,validateSnapshot,capture,matches,resolve,characterNoteLabel,KINDS,SCOPES,NOTE_SECTIONS,NOTE_SOURCES};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.DreamGachaContext;
})(typeof globalThis!=="undefined"?globalThis:this);
