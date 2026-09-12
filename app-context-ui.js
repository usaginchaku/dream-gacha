(function(root){
  "use strict";
  const C=root.DreamGachaContext;
  const kinds={stage:"舞台設定",supplement:"補足設定",protagonist:"夢主の差分"};
  const modes={canon:"原作準拠",modern:"現代パロ",school:"学園パロ",unrestricted:"制限なし"};
  let editingId="",initialized=false,styleDirty=false,outputDirty=false;
  const config=()=>state.promptContextOverride?.settings||state.promptSettings;
  const selected=id=>Array.from($(id).selectedOptions||[]).map(o=>o.value);
  function options(id,items,values){
    const list=new Map(items.map(x=>[x.id,x.label]));
    for(const v of values)if(!list.has(v))list.set(v,`未登録：${v}`);
    $(id).innerHTML=Array.from(list,([id,label])=>`<option value="${esc(id)}"${values.includes(id)?" selected":""}>${esc(label)}</option>`).join("");
  }
  function capture(){return C.capture(config(),state.promptSelection,state.promptOutput)}
  function resolve(){return C.resolve(config(),state.promptSelection,state.promptOutput,{character:currentCharacter(),worldMode:state.worldMode,protagonistProfile:state.protagonistProfile,workProtagonistProfile:workProtagonistProfileFor(currentCharacter()?.work)})}
  function readableScope(e){
    const all=config().entries;
    return C.SCOPES.filter(k=>e.scope[k].length).map(k=>{
      const names={works:"作品",series:"部・シリーズ",characterIds:"キャラ",worldModes:"世界観",stageIds:"舞台"};
      const value=e.scope[k].map(v=>k==="worldModes"?modes[v]:k==="stageIds"?(all.find(e=>e.id===v)?.title||"未登録の舞台"):k==="characterIds"?(state.characters.find(c=>c.id===v)?.name||"未登録のキャラ"):v);
      return `${names[k]}：${value.join("／")}`;
    }).join("、")||"すべての作品・世界観";
  }
  function referenceHtml(e){
    const r=e.reference;if(!r.name&&!r.excerpt)return "";
    const hint=r.excerpt?"参考資料の抜粋を含みます":"資料の参照指定のみ（本文は含みません）";
    return `<p>${esc([r.name,r.version,hint].filter(Boolean).join("・"))}</p>${r.excerpt?`<pre>${esc(r.excerpt)}</pre>`:""}`;
  }
  function renderPreview(){
    const list=$("#contextApplied");if(!list)return;
    const result=resolve(),setting=config(),stage=state.promptSelection.stageId;
    const choices=[{id:"",label:"指定なし"},...setting.entries.filter(e=>e.kind==="stage"&&e.enabled).map(e=>({id:e.id,label:e.title}))];
    options("#contextStage",choices,[stage]);$("#contextStage").value=stage;
    $("#contextReuseNotice").hidden=!state.promptContextOverride;
    $("#contextErrors").textContent=result.errors.join("\n");
    $("#contextErrors").hidden=!result.errors.length;
    if(result.errors.length)$("#contextPreview").open=true;
    const textRows=[];
    if(setting.style)textRows.push(`<details><summary>文章の好み</summary><pre>${esc(setting.style)}</pre></details>`);
    if(result.stage)textRows.push(`<details><summary>舞台：${esc(result.stage.title)}（版 ${result.stage.revision}）</summary><p>${esc(readableScope(result.stage))}・${esc(modes[result.stage.worldMode])}</p><pre>${esc(result.stage.body)}</pre>${referenceHtml(result.stage)}</details>`);
    for(const {entry:e,active,reason} of result.rows){
      textRows.push(`<div class="context-applied-row"><label><input type="checkbox" data-context-apply="${esc(e.id)}"${active?" checked":""}> ${esc(e.title)}</label><span class="label">${esc(reason)}・版 ${e.revision}</span><details><summary>内容と適用条件</summary><p>${esc(readableScope(e))}${e.kind==="protagonist"?`・${e.protagonistMode==="replace"?"共通・作品別の夢主設定を置き換え":"夢主設定に追加"}`:""}</p><pre>${esc(e.body)}</pre>${referenceHtml(e)}</details></div>`);
    }
    list.innerHTML=textRows.join("")||'<p class="manager-note">該当する舞台・補足はありません。共通の夢主設定と作品別設定を使用します。</p>';
    $("#contextAppliedCount").textContent=`舞台 ${result.stage?1:0}件・補足 ${result.rows.filter(r=>r.active).length}件${result.replacement?"・夢主を置き換え":""}`;
    if(!outputDirty){$("#contextOutputLength").value=state.promptOutput.length;$("#contextOutputPov").value=state.promptOutput.pov;}
  }
  function resetOutputDraft(){outputDirty=false;}
  function resetDrafts(){
    styleDirty=false;outputDirty=false;editingId="";
    $("#contextEditor").hidden=true;$("#contextEditorStatus").textContent="";
  }
  function persistChange(change){
    const before={...C.fields(state),worldMode:state.worldMode,values:structuredClone(state.values),locks:structuredClone(state.locks)};
    try{change();save();render();return true;}
    catch(error){Object.assign(state,before);$("#contextEditorStatus").textContent=`保存できませんでした。入力を残しています：${error.message}`;renderPreview();return false;}
  }
  function renderList(){
    const type=$("#contextFilterKind").value,work=$("#contextFilterWork").value;
    const visible=state.promptSettings.entries.filter(e=>(!type||e.kind===type)&&(!work||e.scope.works.includes(work)));
    $("#contextEntryList").innerHTML=visible.map(e=>`<button type="button" class="context-entry-button small-btn" data-context-edit="${esc(e.id)}"><strong>${esc(e.title)}</strong><span>${kinds[e.kind]}・版 ${e.revision}${e.enabled?"":"・無効"}</span></button>`).join("")||'<p class="manager-note">登録した設定がここに表示されます。</p>';
  }
  function render(){
    if(!$("#contextStyle"))return;
    if(!styleDirty)$("#contextStyle").value=state.promptSettings.style;
    const works=unique(state.characters.map(c=>c.work));
    const filter=$("#contextFilterWork").value;
    options("#contextFilterWork",[{id:"",label:"すべての作品"},...works.map(w=>({id:w,label:w}))],filter?[filter]:[]);$("#contextFilterWork").value=filter;
    renderList();renderPreview();
  }
  function toggleKind(){
    const kind=$("#contextKind").value;
    $("#contextStageModeField").hidden=kind!=="stage";
    $("#contextActivationField").hidden=kind==="stage";
    $("#contextProtagonistModeField").hidden=kind!=="protagonist";
    $("#contextScopeModesField").hidden=kind==="stage";
    $("#contextScopeStagesField").hidden=kind==="stage";
  }
  function edit(id=""){
    editingId=id;
    const e=state.promptSettings.entries.find(e=>e.id===id);
    $("#contextEditor").hidden=false;
    $("#contextTitle").value=e?.title||"";$("#contextKind").value=e?.kind||"supplement";
    $("#contextBody").value=e?.body||"";$("#contextEnabled").checked=e?.enabled??true;
    $("#contextActivation").value=e?.activation||"auto";$("#contextStageMode").value=e?.worldMode||"modern";
    $("#contextProtagonistMode").value=e?.protagonistMode||"append";
    for(const field of ["name","version","excerpt"])$("#contextReference-"+field).value=e?.reference[field]||"";
    const items={works:unique(state.characters.map(c=>c.work)).map(w=>({id:w,label:w})),series:unique(state.characters.map(c=>c.series)).map(s=>({id:s,label:s})),characterIds:state.characters.map(c=>({id:c.id,label:`${c.name} / ${c.work} / ${c.series}`})),worldModes:Object.entries(modes).map(([id,label])=>({id,label})),stageIds:state.promptSettings.entries.filter(s=>s.kind==="stage").map(s=>({id:s.id,label:s.title}))};
    for(const key of C.SCOPES)options("#contextScope-"+key,items[key],e?.scope[key]||[]);
    $("#contextEditorStatus").textContent=e?`「${e.title}」を編集しています。保存するまで変更は適用されません。`:"新しい設定を作成しています。";
    toggleKind();$("#contextTitle").focus();
  }
  function saveEntry(){
    const old=state.promptSettings.entries.find(e=>e.id===editingId),kind=$("#contextKind").value;
    const scope=Object.fromEntries(C.SCOPES.map(k=>[k,selected("#contextScope-"+k)]));
    if(kind==="stage"){scope.worldModes=[];scope.stageIds=[];}
    if(old?.kind==="stage"&&kind!=="stage"&&state.promptSettings.entries.some(e=>e.scope.stageIds.includes(old.id))){$("#contextEditorStatus").textContent="この舞台を参照する補足があります。参照を外してから種類を変更してください。";return;}
    const entry={id:old?.id||libraryId("context"),revision:(old?.revision||0)+1,title:$("#contextTitle").value.trim(),kind,body:$("#contextBody").value,enabled:$("#contextEnabled").checked,scope,activation:$("#contextActivation").value,protagonistMode:$("#contextProtagonistMode").value,worldMode:$("#contextStageMode").value,reference:Object.fromEntries(["name","version","excerpt"].map(k=>[k,$("#contextReference-"+k).value]))};
    if(!entry.title){$("#contextEditorStatus").textContent="管理名を入力してください。";return;}
    const settings=structuredClone(state.promptSettings);
    const index=settings.entries.findIndex(e=>e.id===entry.id);if(index<0)settings.entries.push(entry);else settings.entries[index]=entry;
    try{C.validateSettings(settings)}catch(e){$("#contextEditorStatus").textContent=e.message;return;}
    if(persistChange(()=>{state.promptSettings=settings;})){editingId=entry.id;$("#contextEditorStatus").textContent=`「${entry.title}」を保存しました。${state.promptContextOverride?"現在は保存条件の設定を使用中です。最新版を使うには「現在の設定集に戻す」を押してください。":"次のプロンプト生成から反映します。"}`;}
  }
  function init(){
    if(initialized)return;initialized=true;
    $("#contextNew").addEventListener("click",()=>edit());
    $("#contextCancel").addEventListener("click",()=>{$("#contextEditor").hidden=true;editingId="";});
    $("#contextEntrySave").addEventListener("click",saveEntry);
    $("#contextKind").addEventListener("change",toggleKind);
    $("#contextFilterKind").addEventListener("change",renderList);$("#contextFilterWork").addEventListener("change",renderList);
    $("#contextEntryList").addEventListener("click",e=>{const button=e.target.closest("[data-context-edit]");if(button)edit(button.dataset.contextEdit);});
    $("#contextStyle").addEventListener("input",()=>{styleDirty=true;});
    $("#contextStyleSave").addEventListener("click",()=>{const style=$("#contextStyle").value;if(persistChange(()=>{state.promptSettings={...state.promptSettings,style};})){styleDirty=false;$("#contextEditorStatus").textContent=state.promptContextOverride?"文章の好みを保存しました。最新版を使うには「現在の設定集に戻す」を押してください。":"文章の好みを保存しました。次の生成から反映します。";}});
    $("#contextUseCurrent").addEventListener("click",()=>persistChange(()=>{state.promptContextOverride=null;state.promptSelection=C.emptySelection();}));
    $("#contextStage").addEventListener("change",e=>{const id=e.target.value;persistChange(()=>{
      state.promptSelection={...state.promptSelection,stageId:id};
      const stage=config().entries.find(e=>e.id===id&&e.kind==="stage");
      if(stage){
        state.worldMode=stage.worldMode;
        if(state.values.situation&&!situationMatchesWorldMode(state.values.situation,state.worldMode)){state.values.situation="";state.locks.situation=false;}
      }
    });renderWorldModeControls();updateCard("situation");updateLock("situation");});
    $("#contextApplied").addEventListener("change",e=>{const box=e.target.closest("[data-context-apply]");if(!box)return;
      const id=box.dataset.contextApply,entry=config().entries.find(e=>e.id===id);if(!entry)return;
      persistChange(()=>{
        const selection=state.promptSelection;
        selection.manualIds=selection.manualIds.filter(x=>x!==id);selection.excludedIds=selection.excludedIds.filter(x=>x!==id);
        if(box.checked&&entry.activation==="manual")selection.manualIds.push(id);
        if(!box.checked)selection.excludedIds.push(id);
      });
    });
    $("#contextOutputLength").addEventListener("input",()=>{outputDirty=true;});
    $("#contextOutputPov").addEventListener("change",()=>{outputDirty=true;});
    $("#contextOutputSave").addEventListener("click",()=>{
      const output={length:$("#contextOutputLength").value.trim(),pov:$("#contextOutputPov").value};
      try{C.validateOutput(output)}catch(e){$("#contextErrors").hidden=false;$("#contextErrors").textContent=e.message;return;}
      if(persistChange(()=>{state.promptOutput=output;}))outputDirty=false;
    });
    document.querySelectorAll("[data-context-clear]").forEach(b=>b.addEventListener("click",()=>{for(const option of $("#contextScope-"+b.dataset.contextClear).options)option.selected=false;}));
    render();
  }
  root.DreamGachaContextUI={capture,resolve,render,renderPreview,init,resetOutputDraft,resetDrafts};
})(typeof globalThis!=="undefined"?globalThis:this);
