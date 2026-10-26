(function(root){
  "use strict";
  // キャラ管理の「作品」タブ。作品ごとに、ガチャへ出すキャラをタップで切り替える。
  const openWorks=new Set();

  function works(){
    const groups=new Map();
    for(const character of state.characters){
      const work=character.work||"作品未設定";
      if(!groups.has(work))groups.set(work,[]);
      groups.get(work).push(character);
    }
    return [...groups.entries()].map(([work,characters])=>({work,characters,active:characters.filter(c=>!c.archived).length}))
      .sort((a,b)=>(b.active>0)-(a.active>0)||a.work.localeCompare(b.work,"ja"));
  }
  function summary(group){
    const percent=group.characters.length?Math.round(group.active/group.characters.length*100):0;
    return `<span class="work-row-name">${esc(group.work)}</span><span class="work-row-count"><strong>${group.active}</strong> / ${group.characters.length}人</span><span class="work-row-meter" aria-hidden="true"><span style="width:${percent}%"></span></span>`;
  }
  function chip(c){
    return `<button type="button" class="work-chip${c.archived?"":" on"}" data-work-character="${esc(c.id)}" aria-pressed="${!c.archived}">${c.favorite?'<span class="favorite-mark" aria-label="お気に入り">★</span>':""}${esc(c.name)}</button>`;
  }
  // 部・シリーズが複数ある作品は小見出しで分け、作品内でも探しやすくする。
  function chips(group){
    const seriesList=orderedSeries(group.work,group.characters.map(c=>c.series||""));
    const bySeries=new Map(seriesList.map(series=>[series,[]]));
    for(const c of group.characters){if(!bySeries.has(c.series||""))bySeries.set(c.series||"",[]);bySeries.get(c.series||"").push(c);}
    const sections=[...bySeries.entries()].filter(([,list])=>list.length);
    // 細かく分かれすぎる作品は見出しがかえって邪魔になるため、まとめて並べる。
    const useHeadings=sections.length>1&&sections.length<=10&&group.characters.length/sections.length>=3;
    if(!useHeadings)return `<div class="work-chips">${sections.flatMap(([,list])=>list).map(chip).join("")}</div>`;
    return sections.map(([series,list])=>{
      const heading=useHeadings?`<div class="work-series">${esc(series||"部・シリーズ未設定")}<span>${list.filter(c=>!c.archived).length} / ${list.length}</span></div>`:"";
      return `${heading}<div class="work-chips">${list.map(chip).join("")}</div>`;
    }).join("");
  }
  function body(group){
    return `<div class="work-actions"><button type="button" class="small-btn" data-work-all="on">全員出す</button><button type="button" class="small-btn" data-work-all="off">全員お休み</button>${group.characters.some(c=>c.favorite)?'<button type="button" class="small-btn" data-work-all="favorite">★だけ出す</button>':""}</div>${chips(group)}`;
  }
  function render(){
    const list=document.querySelector("#workList");if(!list)return;
    const groups=works();
    const active=state.characters.filter(c=>!c.archived).length;
    document.querySelector("#workSummary").textContent=`ガチャに出る ${active}人`;
    list.innerHTML=groups.map(group=>`<details class="work-row" data-work="${esc(group.work)}"${openWorks.has(group.work)?" open":""}><summary>${summary(group)}</summary><div class="work-body">${openWorks.has(group.work)?body(group):""}</div></details>`).join("")||'<div class="empty">キャラが登録されていません</div>';
  }
  function refreshRow(row){
    const group=works().find(g=>g.work===row.dataset.work);if(!group)return render();
    row.querySelector("summary").innerHTML=summary(group);
    row.querySelector(".work-body").innerHTML=row.open?body(group):"";
    document.querySelector("#workSummary").textContent=`ガチャに出る ${state.characters.filter(c=>!c.archived).length}人`;
  }
  function apply(ids,archived,message){
    const changed=state.characters.filter(c=>ids.includes(c.id)&&c.archived!==archived);
    if(!changed.length)return false;
    const before=changed.map(c=>[c,c.archived]);
    for(const c of changed)c.archived=archived;
    try{save();}catch(error){for(const [c,value] of before)c.archived=value;return false;}
    if(archived)for(const c of changed){state.filters.characterIncluded.delete(c.id);state.filters.characterExcluded.delete(c.id);}
    if(!currentCharacter()){state.characterId=null;updateCard("character");}
    renderGachaFilters();
    if(message)showToast(message);
    return true;
  }
  function init(){
    const list=document.querySelector("#workList");if(!list)return;
    list.addEventListener("toggle",event=>{
      const row=event.target.closest?.(".work-row");if(!row)return;
      if(row.open)openWorks.add(row.dataset.work);else openWorks.delete(row.dataset.work);
      refreshRow(row);
    },true);
    list.addEventListener("click",event=>{
      const row=event.target.closest(".work-row");if(!row)return;
      const chip=event.target.closest("[data-work-character]");
      if(chip){
        const c=state.characters.find(x=>x.id===chip.dataset.workCharacter);if(!c)return;
        apply([c.id],!c.archived,c.archived?`${c.name}をガチャに出します`:`${c.name}はお休みです`);
        return refreshRow(row);
      }
      const all=event.target.closest("[data-work-all]");if(!all)return;
      const group=works().find(g=>g.work===row.dataset.work);if(!group)return;
      const mode=all.dataset.workAll;
      const changing=group.characters.filter(c=>mode==="favorite"?c.archived===!!c.favorite:c.archived!==(mode==="off")).length;
      if(changing>5&&!confirm(`${group.work}の${changing}人を${mode==="off"?"お休みに":"切り替えて"}します。よろしいですか？`))return;
      if(mode==="favorite"){
        const on=group.characters.filter(c=>c.favorite).map(c=>c.id),off=group.characters.filter(c=>!c.favorite).map(c=>c.id);
        const changed=apply(on,false,"")|apply(off,true,"");
        showToast(changed?`${group.work}は★のキャラだけ出します`:"すでに★のキャラだけです");
      }else if(!apply(group.characters.map(c=>c.id),mode==="off",`${group.work}を${mode==="off"?"全員お休みにしました":"全員ガチャに出します"}`))showToast("変更はありません");
      refreshRow(row);
    });
  }
  root.DreamGachaWorksUI={init,render};
})(typeof globalThis!=="undefined"?globalThis:this);
