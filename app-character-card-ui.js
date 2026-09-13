(function(root){
  "use strict";
  const C=root.DreamGachaContext;
  let initialized=false,characterId="",editingId="",editingRevision=0,dirty=false;
  const q=id=>document.querySelector(id);
  const dialog=()=>q("#characterCardDialog");
  const notes=()=>state.promptSettings.entries.filter(e=>e.kind==="supplement"&&e.scope.characterIds.length===1&&e.scope.characterIds[0]===characterId);
  const option=(value,label,selected="")=>`<option value="${esc(value)}"${value===selected?" selected":""}>${esc(label)}</option>`;
  const status=text=>{q("#characterNoteStatus").textContent=text;};
  const labels=values=>Object.entries(values).map(([value,label])=>option(value,label)).join("");
  function init(){
    if(initialized||!dialog())return;
    initialized=true;
    dialog().innerHTML=`<div class="character-card-head"><div><h2 id="characterCardTitle">キャラクター詳細</h2><p id="characterCardMeta" class="manager-note"></p></div><button type="button" class="small-btn" id="characterCardClose">閉じる</button></div>
      <div class="character-card-content"><p class="manager-note">カルテは書きたい項目を一つから。未入力でもガチャを使えます。今回の夢主との関係はガチャ結果の「関係性」に入力してください。</p>
      <p id="characterCardNotice" class="context-notice" hidden></p>
      <div class="settings-actions"><button type="button" class="primary" id="characterCardNew">＋ カルテを追加</button></div>
      <div id="characterCardNotes" class="context-entry-list"></div>
      <form id="characterNoteEditor" class="context-panel" hidden>
        <h3 id="characterNoteEditorTitle">カルテを追加</h3>
        <div class="field" id="characterNoteTargetField" hidden><label for="characterNoteTarget">対象キャラを登録済みのキャラへ変更</label><select id="characterNoteTarget"></select><p class="manager-note">変更すると、この項目だけを選んだキャラに紐付けます。本文・出所はそのまま残ります。</p></div>
        <div class="context-grid">
          <div class="field"><label for="characterNoteSection">書く項目</label><select id="characterNoteSection">${labels(C.NOTE_SECTIONS)}</select></div>
          <div class="field"><label for="characterNoteScope">使う世界観・舞台</label><select id="characterNoteScope"></select></div>
          <div class="field"><label for="characterNoteSource">内容の出所</label><select id="characterNoteSource">${labels(C.NOTE_SOURCES)}</select></div>
          <div class="field"><label for="characterNoteVerification">確認状態</label><select id="characterNoteVerification"><option value="unverified">未確認</option><option value="user_checked">自分で確認した</option></select></div>
        </div>
        <p class="manager-note">口調・価値観などは「共通」、原作の所属・経歴は「原作世界だけ」、AUの職業・環境は対応する舞台へ。出所と確認状態は自分で記録するもので、アプリによる原作考証ではありません。</p>
        <div class="field"><label for="characterNoteTitle">見出し（任意）</label><input id="characterNoteTitle" type="text" placeholder="空欄なら項目名を使います"></div>
        <div class="field"><label for="characterNoteBody">内容</label><textarea id="characterNoteBody" rows="7" placeholder="一人称、言い回し、判断の理由など、覚えておきたいことを自由に書けます。"></textarea></div>
        <details><summary>参考資料・原作上の根拠（任意）</summary><div class="context-grid"><div class="field"><label for="characterNoteReference-name">資料名・URL</label><input id="characterNoteReference-name" type="text"></div><div class="field"><label for="characterNoteReference-version">巻・話数・版</label><input id="characterNoteReference-version" type="text"></div></div><div class="field"><label for="characterNoteReference-excerpt">根拠の抜粋・メモ</label><textarea id="characterNoteReference-excerpt" rows="4"></textarea></div><p class="manager-note">資料名・URLだけでは資料本文はプロンプトに含まれません。抜粋欄に書いた内容は含まれます。</p></details>
        <details><summary>プロンプトでの使用方法</summary><div class="context-grid"><div class="field"><label for="characterNoteActivation">適用方法</label><select id="characterNoteActivation"><option value="manual">使うときに選ぶ</option><option value="auto">条件が合うときはいつも使う</option></select></div><div class="field"><label class="lock-label"><input id="characterNoteEnabled" type="checkbox" checked> 使用候補にする</label></div></div><p class="manager-note">初期は「使うときに選ぶ」です。保存後、ガチャの「今回適用する設定」で今回使う項目を選べます。外しても記録は消えません。</p></details>
        <div class="settings-actions"><button class="primary" type="submit" id="characterNoteSave">保存する</button><button type="button" class="small-btn" id="characterNoteCancel">編集を閉じる</button></div>
      </form><p id="characterNoteStatus" class="manager-note" role="status" aria-live="polite"></p></div>`;
    q("#characterCardClose").addEventListener("click",close);
    dialog().addEventListener("cancel",event=>{event.preventDefault();close();});
    q("#characterCardNew").addEventListener("click",()=>{if(discardDraft())edit();});
    q("#characterCardNotes").addEventListener("click",event=>{const button=event.target.closest("[data-character-note-edit]");if(button&&discardDraft())edit(button.dataset.characterNoteEdit);});
    q("#characterNoteEditor").addEventListener("submit",event=>{event.preventDefault();saveNote();});
    q("#characterNoteEditor").addEventListener("input",()=>{dirty=true;});
    q("#characterNoteEditor").addEventListener("change",()=>{dirty=true;});
    q("#characterNoteCancel").addEventListener("click",()=>{if(discardDraft()){q("#characterNoteEditor").hidden=true;editingId="";}});
  }
  function discardDraft(){
    if(dirty&&!window.confirm("カルテの未保存の入力を閉じますか？"))return false;
    dirty=false;return true;
  }
  function close(){if(discardDraft())dialog().close();}
  function open(id){
    init();if(!dialog()||!id)return;
    if(dialog().open&&!discardDraft())return;
    characterId=id;editingId="";dirty=false;q("#characterNoteEditor").hidden=true;status("");refresh();
    if(!dialog().open)dialog().showModal();
  }
  function refresh(){
    if(!initialized||!characterId)return;
    const character=state.characters.find(c=>c.id===characterId),entries=notes();
    q("#characterCardTitle").textContent=`${character?.name||"未登録のキャラ"}のカルテ`;
    q("#characterCardMeta").textContent=character?[character.work,character.series,character.heightText,character.archived?"ガチャ対象外":""].filter(Boolean).join(" / "):"キャラ一覧にないIDのカルテです。内容を保持しています。編集画面で登録済みキャラへ紐付け直せます。";
    q("#characterCardNew").hidden=!character;
    const notice=q("#characterCardNotice");notice.hidden=!state.promptContextOverride;
    notice.textContent="現在のガチャは保存条件に記録された補足を使用しています。ここで編集したカルテを使う場合は、ガチャの「現在の設定集に戻す」で切り替えてください。過去の生成記録は変わりません。";
    q("#characterCardNotes").innerHTML=entries.map(e=>`<article class="character-card-note"><div><strong>${esc(e.title)}</strong><p class="manager-note">${esc(e.characterNote?C.characterNoteLabel(e,state.promptSettings):"以前からのキャラ限定の補足（未分類）")}・版 ${e.revision}・${e.enabled?(e.activation==="auto"?"条件が合うときに自動適用":"使うときに選ぶ"):"使用しない"}</p></div><pre>${esc(e.body)}</pre>${e.reference.name||e.reference.version?`<p class="manager-note">参考：${esc([e.reference.name,e.reference.version].filter(Boolean).join(" / "))}</p>`:""}${e.reference.excerpt?`<details><summary>参考資料の抜粋・メモ</summary><pre>${esc(e.reference.excerpt)}</pre></details>`:""}<button type="button" class="small-btn" data-character-note-edit="${esc(e.id)}">編集する</button></article>`).join("")||'<p class="manager-note">まだカルテはありません。よく使う口調メモなど、一つから追加できます。</p>';
  }
  function scopeValue(scope){
    if(scope.works.length||scope.series.length)return "custom";
    if(!scope.worldModes.length&&!scope.stageIds.length)return "common";
    if(scope.worldModes.length===1&&scope.worldModes[0]==="canon"&&!scope.stageIds.length)return "canon";
    if(!scope.worldModes.length&&scope.stageIds.length===1)return `stage:${scope.stageIds[0]}`;
    return "custom";
  }
  function edit(id=""){
    const entry=notes().find(e=>e.id===id);if(id&&!entry)return;
    editingId=id;editingRevision=entry?.revision||0;dirty=false;
    q("#characterNoteEditor").hidden=false;q("#characterNoteEditorTitle").textContent=entry?"カルテを編集":"カルテを追加";
    q("#characterNoteTitle").value=entry?.title||"";q("#characterNoteBody").value=entry?.body||"";
    q("#characterNoteSection").value=entry?.characterNote?.section||"memo";
    q("#characterNoteSource").value=entry?.characterNote?.sourceKind||"unclassified";
    q("#characterNoteVerification").value=entry?.characterNote?.verification||"unverified";
    q("#characterNoteActivation").value=entry?.activation||"manual";q("#characterNoteEnabled").checked=entry?.enabled??true;
    for(const key of ["name","version","excerpt"])q("#characterNoteReference-"+key).value=entry?.reference[key]||"";
    const scope=entry?scopeValue(entry.scope):"common";
    q("#characterNoteScope").innerHTML=option("common","共通（世界観を問わず使う）",scope)+option("canon","原作世界だけ",scope)+state.promptSettings.entries.filter(e=>e.kind==="stage").map(e=>option(`stage:${e.id}`,`舞台：${e.title}${e.enabled?"":"（無効）"}`,scope)).join("")+(scope==="custom"?option("custom","既存の詳細な適用条件を維持",scope):"");
    const missing=!state.characters.some(c=>c.id===characterId);
    q("#characterNoteTargetField").hidden=!missing;
    q("#characterNoteTarget").innerHTML=(missing?option(characterId,"未登録のキャラ（紐付けを維持）",characterId):"")+state.characters.map(c=>option(c.id,`${c.name} / ${c.work||"作品未指定"}`,characterId)).join("");
    q("#characterNoteTarget").value=characterId;
    status(entry?"保存するまで内容は変わりません。":"一つのメモだけでも保存できます。");q("#characterNoteBody").focus();
  }
  function saveNote(){
    const old=state.promptSettings.entries.find(e=>e.id===editingId);
    if(editingId&&(!old||old.revision!==editingRevision)){status("編集中に保存内容が変わりました。入力を控えて、カルテを開き直してください。");return;}
    const target=q("#characterNoteTarget").value||characterId,scopeKind=q("#characterNoteScope").value;
    const scope=scopeKind==="custom"&&old?structuredClone(old.scope):{works:[],series:[],characterIds:[],worldModes:scopeKind==="canon"?["canon"]:[],stageIds:scopeKind.startsWith("stage:")?[scopeKind.slice(6)]:[]};
    scope.characterIds=[target];
    const characterNote={section:q("#characterNoteSection").value,sourceKind:q("#characterNoteSource").value,verification:q("#characterNoteVerification").value};
    const entry={...old,id:old?.id||libraryId("context"),revision:(old?.revision||0)+1,title:q("#characterNoteTitle").value.trim()||C.NOTE_SECTIONS[characterNote.section],kind:"supplement",body:q("#characterNoteBody").value,enabled:q("#characterNoteEnabled").checked,scope,activation:q("#characterNoteActivation").value,protagonistMode:old?.protagonistMode||"append",worldMode:old?.worldMode||"modern",reference:Object.fromEntries(["name","version","excerpt"].map(key=>[key,q("#characterNoteReference-"+key).value])),characterNote};
    if(!entry.body.trim()&&!entry.reference.excerpt.trim()){status("内容または根拠の抜粋・メモを入力してください。");return;}
    const settings=structuredClone(state.promptSettings),index=settings.entries.findIndex(e=>e.id===entry.id);
    if(index<0)settings.entries.push(entry);else settings.entries[index]=entry;
    try{C.validateSettings(settings)}catch(error){status(error.message);return;}
    const before=state.promptSettings;
    try{state.promptSettings=settings;save();}
    catch(error){state.promptSettings=before;status(`保存できませんでした。入力を残しています：${error.message}`);return;}
    characterId=target;editingId=entry.id;editingRevision=entry.revision;dirty=false;
    refresh();root.DreamGachaContextUI?.render();root.DreamGachaRecipe?.renderOrphanNotes();
    if(typeof refreshPromptStatus==="function")refreshPromptStatus();
    status(state.promptContextOverride?"保存しました。ガチャで最新版を使うには「現在の設定集に戻す」で切り替えてください。":entry.activation==="manual"?"保存しました。今回使う場合は、ガチャの「今回適用する設定」で選んでください。":"保存しました。対象キャラと世界観・舞台が合うとき、次のプロンプト生成から反映します。");
    showToast("カルテを保存しました");
  }
  root.DreamGachaCharacterCardUI={init,open,refresh};
})(typeof globalThis!=="undefined"?globalThis:this);
