(function(root){
  "use strict";
  const preferenceKey="dreamGachaDisplayMode";
  const panes={library:{novels:"novelArchivePanel",presets:"presetPanel",save:"novelSavePanel"},manager:{list:"characterListPanel",works:"workPanel",add:"characterFormPanel",files:"ioPanel"}};
  let ready=false,dialogTrigger=null,dialogTriggerSelector="";

  function mode(){return document.querySelector("#screen-gacha")?.dataset.mode||"simple";}
  function setMode(value,persist=true){
    if(!["simple","custom"].includes(value))return;
    document.querySelector("#screen-gacha").dataset.mode=value;
    document.querySelectorAll("[data-gacha-mode]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.gachaMode===value)));
    // Display preferences are independent of story settings and their backup schema.
    if(persist)try{localStorage.setItem(preferenceKey,value);}catch(error){showToast("表示モードはこの画面でのみ変更しました");}
    refresh();
  }
  function pane(group,name){
    const ids=panes[group];if(!ids||!ids[name])return;
    for(const [key,id] of Object.entries(ids))document.getElementById(id).hidden=key!==name;
    document.querySelectorAll(`[data-${group}-pane]`).forEach(button=>{
      const active=button.dataset[group+"Pane"]===name;
      button.setAttribute("aria-selected",String(active));button.tabIndex=active?0:-1;
    });
  }
  function reveal(targetId){
    for(const [group,ids] of Object.entries(panes))for(const [name,id] of Object.entries(ids)){
      const target=document.getElementById(targetId),panel=document.getElementById(id);
      if(target&&(target===panel||panel.contains(target)))pane(group,name);
    }
  }
  function showPrompt(){
    document.querySelector("#promptPreview").open=true;
    document.querySelector("#output").scrollIntoView({behavior:"smooth",block:"center"});
  }
  function showCustom(targetId){
    setMode("custom");
    const target=document.getElementById(targetId);
    if(target){if(target.tagName==="DETAILS")target.open=true;target.scrollIntoView({behavior:"smooth",block:"center"});}
  }
  function refresh(){
    if(!ready)return;
    const character=currentCharacter();
    const label=document.querySelector("#rollAll span");
    if(label)label.textContent=state.locks.character&&character?"シチュを回す":"ガチャを回す";
    const locked=DreamGachaData.SNAPSHOT_KEYS.filter(key=>state.locks[key]);
    const link=document.querySelector("#activeSettingsLink");
    const settings=state.promptContextOverride?.settings||state.promptSettings;
    const filters=state.filters;
    const filtered=filters.search||filters.favorite!=="all"||filters.minHeight!==null||filters.maxHeight!==null||["workIncluded","workExcluded","seriesIncluded","seriesExcluded","tags","characterIncluded","characterExcluded"].some(key=>filters[key].size);
    const customized=locked.length||filtered||state.worldMode!==DEFAULT_WORLD_MODE||state.supportingSituation||state.requestProtagonist||document.querySelector("#freeExtra").value||settings.style||state.promptSelection.stageId||state.promptSelection.manualIds.length||state.promptSelection.excludedIds.length||state.promptOutput.length||state.promptOutput.pov||settings.entries.some(entry=>entry.enabled&&entry.kind!=="stage");
    link.hidden=mode()!=="simple"||!customized;
    link.textContent=locked.length?`固定 ${locked.length}件 ›`:"カスタム設定あり ›";
    const errors=document.querySelector("#recipeError")?.textContent||document.querySelector("#contextErrors:not([hidden])")?.textContent;
    if(errors&&mode()==="simple")setMode("custom",false);
    const lock=document.querySelector('[data-lock="character"]');
    if(lock)lock.closest("label").classList.toggle("is-locked",!!state.locks.character);
  }
  function dialogOpened(trigger){
    // Safari does not always focus a button on tap; retain the actual opener.
    dialogTrigger=trigger||document.activeElement;
    if(!dialogTrigger?.matches('button,input,select,textarea,summary,a[href],[tabindex]'))dialogTrigger=null;
    const novelId=dialogTrigger?.dataset.openNovel||dialogTrigger?.dataset.editNovel;
    dialogTriggerSelector=novelId?`[data-open-novel="${CSS.escape(novelId)}"]`:"[data-quick-choose]";
    document.querySelector(".wrap").inert=true;
  }
  function dialogClosed(){
    document.querySelector(".wrap").inert=false;
    const trigger=dialogTrigger?.isConnected?dialogTrigger:(document.querySelector(dialogTriggerSelector)||document.querySelector('#tab-library'));
    trigger?.focus({preventScroll:true});
    dialogTrigger=null;
  }
  function trapFocus(event){
    if(event.key!=="Tab")return;
    const modal=["#choiceModal","#novelModal"].map(id=>document.querySelector(id)).find(el=>!el.hidden);
    if(!modal)return;
    const controls=[...modal.querySelectorAll('button,input,select,textarea,summary,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  function lockZoom(){
    // iOS Safari ignores user-scalable=no, so cancel its pinch gesture directly.
    const cancel=event=>event.preventDefault();
    for(const type of ["gesturestart","gesturechange","gestureend"])document.addEventListener(type,cancel);
    // Trackpad pinch arrives as Ctrl+wheel; also block the keyboard zoom shortcuts.
    document.addEventListener("wheel",event=>{if(event.ctrlKey)event.preventDefault();},{passive:false});
    document.addEventListener("keydown",event=>{if((event.ctrlKey||event.metaKey)&&["+","-","=","0",";"].includes(event.key))event.preventDefault();});
  }
  function init(){
    ready=true;
    lockZoom();
    let saved="simple";try{saved=localStorage.getItem(preferenceKey)||saved;}catch(error){}
    setMode(saved==="custom"?"custom":"simple",false);
    document.querySelectorAll("[data-gacha-mode]").forEach(button=>button.addEventListener("click",()=>setMode(button.dataset.gachaMode)));
    for(const group of Object.keys(panes)){
      const buttons=[...document.querySelectorAll(`[data-${group}-pane]`)];
      buttons.forEach((button,index)=>{
        button.addEventListener("click",()=>pane(group,button.dataset[group+"Pane"]));
        button.addEventListener("keydown",event=>{
          if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
          event.preventDefault();const next=event.key==="Home"?0:event.key==="End"?buttons.length-1:(index+(event.key==="ArrowRight"?1:-1)+buttons.length)%buttons.length;
          buttons[next].click();buttons[next].focus();
        });
      });
    }
    document.querySelector("#activeSettingsLink").addEventListener("click",()=>showCustom("contextPreview"));
    document.querySelector("#quickChoiceWork").addEventListener("change",renderChooserList);
    document.querySelector("#quickChoiceFavorite").addEventListener("click",event=>{
      const button=event.currentTarget,active=button.getAttribute("aria-pressed")!=="true";
      button.setAttribute("aria-pressed",String(active));button.classList.toggle("active",active);renderChooserList();
    });
    document.addEventListener("keydown",trapFocus);
    // Keep action bars out of the software keyboard's way.
    window.visualViewport?.addEventListener("resize",()=>document.body.classList.toggle("keyboard-open",window.innerHeight-window.visualViewport.height>150));
    refresh();
  }
  root.DreamGachaExperience={init,mode,setMode,pane,reveal,showPrompt,showCustom,refresh,dialogOpened,dialogClosed};
})(typeof globalThis!=="undefined"?globalThis:this);
