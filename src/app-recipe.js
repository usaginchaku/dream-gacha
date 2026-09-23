(function(root){
 "use strict";
 const D=root.DreamGachaDomain;
 function profiles(){
  const work=currentCharacter()?.work||"",override=state.requestProtagonist;
  const standard=$("#protagonistProfile"),workField=$("#workProtagonistProfile"),workSelect=$("#workProfileWork");
  return {protagonistProfile:override?override.protagonistProfile:(standard?standard.value:state.protagonistProfile),
   workProtagonistProfile:override&&override.work===work?override.workProtagonistProfile:(workSelect?.value===work?workField.value:workProtagonistProfileFor(work))};
 }
 function baseText(){const field=$("#basePrompt");return field?(field.value.trim()||DEFAULT_BASE_PROMPT):(state.basePrompt||DEFAULT_BASE_PROMPT)}
 function read(){
  return D.makeSnapshot({character:currentCharacter(),...state.values,supportingSituation:state.supportingSituation,
   freeExtra:$("#freeExtra").value,...profiles(),worldMode:state.worldMode,promptContext:DreamGachaContextUI.capture()});
 }
 function isCurrent(){
  const snap=state.promptDraftSnapshot;if(!snap)return false;
  const base=snap.promptRecord?.revision?.baseText??snap.promptBaseText;
  // Legacy text without a recorded template remains usable, but its provenance is unknown.
  return typeof base==="string"&&base===baseText()&&D.sameConditions(read(),snap);
 }
 function manualSnapshot(){return {...read(),prompt:$("#output").value,promptBaseText:baseText()}}
 function hasManualPrompt(){
  const output=$("#output").value;
  return !!output&&(!state.promptDraftSnapshot?.promptRecord||output!==state.promptDraftSnapshot.promptRecord.assembledPrompt);
 }
 function refresh(){
  const label=$("#promptFreshness"),copyStored=$("#copyStoredPrompt");if(!label)return;
  let current=false;try{current=isCurrent()}catch(error){/* The context panel reports invalid selections. */}
  const hasPrompt=!!$("#output").value;
  label.textContent=!hasPrompt?"条件を保存してからでも、すぐにプロンプトを作れます。":current?"現在の条件を反映しています。":"条件・設定が変わったか、作成時の情報が未記録です。表示中の文はそのまま残しています。";
  label.dataset.state=!hasPrompt?"empty":current?"current":"stale";
  if(copyStored)copyStored.hidden=!hasPrompt||current;
 }
 function capture(){
  const snapshot=read();
  if(isCurrent()){
   snapshot.prompt=$("#output").value;
   if(state.promptDraftSnapshot.promptRecord)snapshot.promptRecord=D.clone(state.promptDraftSnapshot.promptRecord);
   if(state.promptDraftSnapshot.promptBaseText!==undefined)snapshot.promptBaseText=state.promptDraftSnapshot.promptBaseText;
  }
  return snapshot;
 }
 function render(){
  for(const key of DreamGachaData.SNAPSHOT_KEYS){const field=$("#recipe-"+key);if(field&&field.value!==(state.values[key]||""))field.value=state.values[key]||"";}
  const support=$("#recipeSupportingSituation");if(support&&support.value!==state.supportingSituation)support.value=state.supportingSituation;
  const p=profiles();
  for(const [id,key] of [["#requestProtagonistProfile","protagonistProfile"],["#requestWorkProtagonistProfile","workProtagonistProfile"]]){const field=$(id);if(field&&field.value!==p[key])field.value=p[key];}
  const notice=$("#requestProtagonistStatus");if(notice)notice.textContent=state.requestProtagonist?"今回の夢主設定を使用中。標準設定は変わりません。":"標準の夢主設定を使用中。ここでの変更は今回だけに適用します。";
  const update=$("#updateCurrentPreset");if(update)update.hidden=!state.presets.some(p=>p.id===state.editingPresetId);
  refresh();
 }
 function savePreset(update){
  const snap=capture(),original=update?state.presets.find(p=>p.id===state.editingPresetId):null;
  if(update&&!original)return;
  const auto=snapshotAutoTitle(snap),name=update?original.name:window.prompt("条件セット名",auto);
  if(name===null)return;
  const before=state.presets,oldId=state.editingPresetId,now=new Date().toISOString();
  const preset=original?{...original,snapshot:snap,updatedAt:now}:{id:libraryId("preset"),name:String(name||auto).trim()||auto,createdAt:now,snapshot:snap};
  state.presets=original?before.map(p=>p.id===original.id?preset:p):[preset,...before];state.editingPresetId=preset.id;
  try{save()}catch(error){state.presets=before;state.editingPresetId=oldId;return;}
  renderPresetList();render();showToast(update?"保存した条件を更新しました":snap.prompt?"条件とプロンプトを保存しました":"条件を保存しました。プロンプトは後から作れます");
 }
 function renderOrphanNotes(){
  const panel=$("#orphanCharacterNotes"),list=$("#orphanCharacterNoteList");if(!panel||!list)return;
  const known=new Set(state.characters.map(c=>c.id)),counts=new Map();
  for(const entry of state.promptSettings.entries){
   if(!entry.characterNote)continue;
   const id=entry.scope.characterIds[0];if(!known.has(id))counts.set(id,(counts.get(id)||0)+1);
  }
  panel.hidden=counts.size===0;
  list.innerHTML=[...counts].map(([id,count])=>`<button type="button" class="small-btn" data-character-card="${esc(id)}">${esc(id)}（${count}項目）</button>`).join("");
 }
 function build(explicit=true){
  if(hasManualPrompt()){
   if(!explicit){refresh();showToast("手編集した文を残しました。更新する場合はプロンプトを生成してください");return false;}
   if(!confirm("完成欄の手編集を新しいプロンプトで置き換えますか？残す場合はキャンセルして文をコピーしてください。"))return false;
  }
  syncScenario();
  if(!state.conditionEditMode){
   if(!currentCharacter())rollCharacter(false);
   for(const k of DreamGachaData.SNAPSHOT_KEYS)if(!state.values[k])rollOne(k,false);
  }
  const character=currentCharacter();if(!character){showToast("キャラを選んでください");return false;}
  if(state.values.situation&&!situationMatchesWorldMode(state.values.situation,state.worldMode)){
   $("#recipeEditor").open=true;$("#recipeError").textContent="シチュと世界観の組合せを確認してください。内容を編集するか、世界観を選び直してください。";return false;
  }
  $("#recipeError").textContent="";
  const resolved=DreamGachaContextUI.resolve();
  if(resolved.errors.length){DreamGachaContextUI.renderPreview();showToast("適用する設定を確認してください");return false;}
  const world=WORLD_MODES[state.worldMode]||WORLD_MODES[DEFAULT_WORLD_MODE],conditions=read();
  const prompt=D.formatPrompt({...conditions,basePrompt:state.basePrompt,protagonistProfile:resolved.protagonist,workProtagonistProfile:resolved.workProtagonist,contextSections:resolved.sections,worldModeLabel:world.label,worldModePrompt:world.prompt});
  const previous=state.promptDraftSnapshot,previousOutput=$("#output").value;
  const promptRecord={revision:rememberPromptRevision(),assembledPrompt:prompt};
  state.promptDraftSnapshot={...conditions,prompt,promptRecord};$("#output").value=prompt;
  try{save()}catch(error){state.promptDraftSnapshot=previous;$("#output").value=previousOutput;refresh();return false;}
  renderPromptVersionEditor();render();
  if(explicit)$("#output").scrollIntoView({behavior:"smooth",block:"center"});
  return true;
 }
 async function copyStored(){
  try{await copyTextToClipboard($("#output").value);showToast("表示中の文をコピーしました");return true;}
  catch(error){showToast("コピーできませんでした。完成欄から選択してコピーしてください");return false;}
 }
 async function copy(){
  if((!$("#output").value.trim()||!isCurrent())&&build(false)===false)return false;
  const copied=await copyStored();if(copied)setStatus("お使いのAIに貼り付けられます");return copied;
 }
 function editProtagonist(){
  const before=D.clone(state.requestProtagonist);
  state.requestProtagonist={work:currentCharacter()?.work||"",protagonistProfile:$("#requestProtagonistProfile").value,workProtagonistProfile:$("#requestWorkProtagonistProfile").value};
  try{save();DreamGachaContextUI.renderPreview();render()}catch(error){state.requestProtagonist=before;}
 }
 function init(){
  for(const key of DreamGachaData.SNAPSHOT_KEYS){
   $("#recipe-"+key).addEventListener("input",e=>{state.values[key]=e.target.value;state.conditionEditMode=true;updateCard(key);schedulePromptDraftSave();refresh();});
  }
  $("#recipeSupportingSituation").addEventListener("input",e=>{state.supportingSituation=e.target.value;state.conditionEditMode=true;schedulePromptDraftSave();refresh();});
  $("#requestProtagonistProfile").addEventListener("input",editProtagonist);
  $("#requestWorkProtagonistProfile").addEventListener("input",editProtagonist);
  $("#useStandardProtagonist").addEventListener("click",()=>{
   const before=state.requestProtagonist;state.requestProtagonist=null;
   try{save();render();DreamGachaContextUI.renderPreview()}catch(error){state.requestProtagonist=before;}
  });
  $("#updateCurrentPreset").addEventListener("click",()=>savePreset(true));
  $("#copyStoredPrompt").addEventListener("click",copyStored);
  document.addEventListener("input",e=>{if(["freeExtra","basePrompt","protagonistProfile","workProtagonistProfile"].includes(e.target.id))refresh();});
  document.addEventListener("click",e=>{
   const note=e.target.closest("[data-character-card]");
   if(note){DreamGachaCharacterCardUI.open(note.dataset.characterCard||currentCharacter()?.id);return;}
   const relation=e.target.closest("[data-relationship-text]");
   if(relation){const field=$("#recipe-relationship");field.value=[field.value.trim(),relation.dataset.relationshipText].filter(Boolean).join("。");state.values.relationship=field.value;state.conditionEditMode=true;updateCard("relationship");save();}
  });
  render();
 }
 root.DreamGachaRecipe={profiles,read,isCurrent,manualSnapshot,refresh,capture,render,renderOrphanNotes,savePreset,build,copy,init};
})(typeof globalThis!=="undefined"?globalThis:this);
