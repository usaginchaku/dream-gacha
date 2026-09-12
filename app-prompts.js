(function(root){
  "use strict";
  const text=v=>String(v??"");
  const clone=v=>JSON.parse(JSON.stringify(v));
  function splitNovelPaste(value){
    const source=text(value),newline=/\r\n|\n|\r/.exec(source);
    if(!newline)return null;
    const title=source.slice(0,newline.index).trim(),body=source.slice(newline.index+newline[0].length);
    // Keep the body byte-for-byte after the title separator, including blank lines.
    return title&&body.trim()?{title,body}:null;
  }
  function headerVersion(value){return text(value).split(/\r?\n/,1)[0].match(/夢小説生成プロンプト\s+Ver\.([\d]+(?:\.[\d]+)+)/)?.[1]||null}
  function validRevision(r){
    return !!r&&typeof r==="object"&&!Array.isArray(r)&&["id","label","baseText","standardText","createdAt"].every(k=>typeof r[k]==="string")&&!!r.id.trim()&&r.id!=="bundled"&&!!r.baseText.trim()&&!!r.standardText.trim()&&r.standardVersion===headerVersion(r.standardText);
  }
  function captureRevision(versions,input){
    const existing=versions.find(r=>r.baseText===input.baseText&&r.standardText===input.standardText&&r.label===input.label);
    return clone(existing||{id:input.id,label:input.label,baseText:input.baseText,standardText:input.standardText,standardVersion:headerVersion(input.standardText),createdAt:input.createdAt});
  }
  function revisionLabel(revision){
    if(!validRevision(revision))return "版情報未記録";
    const standard=revision.baseText===revision.standardText;
    return standard?`標準 Ver.${revision.standardVersion||"不明"}`:`自分の版：${revision.label||revision.id}（比較基準 Ver.${revision.standardVersion||"不明"}）`;
  }
  function promptRecord(snapshot){
    const r=snapshot?.promptRecord;
    return r&&validRevision(r.revision)&&typeof r.assembledPrompt==="string"?clone(r):null;
  }
  function promptSummary(snapshot){
    const record=promptRecord(snapshot),prompt=text(snapshot?.prompt);
    if(!record){const header=headerVersion(prompt);return prompt?`版情報未記録${header?`（本文の版表記：${header}／標準一致・変更箇所は不明）`:""}`:"プロンプト未記録"}
    return revisionLabel(record.revision)+(prompt===record.assembledPrompt?"／完成欄の追加編集なし":"／完成欄の追加編集あり");
  }
  // Line LCS is capped for large imported prompts. The fallback remains a lossless
  // replacement diff, never a guessed edit or an unbounded quadratic allocation.
  function lineDiff(before,after){
    const a=text(before).split("\n"),b=text(after).split("\n"),rows=[];
    let start=0,endA=a.length,endB=b.length;
    while(start<endA&&start<endB&&a[start]===b[start]){rows.push({type:"same",text:a[start]});start++}
    while(endA>start&&endB>start&&a[endA-1]===b[endB-1]){endA--;endB--}
    const x=a.slice(start,endA),y=b.slice(start,endB),add=(type,line)=>rows.push({type,text:line});
    if((x.length+1)*(y.length+1)>250000){x.forEach(line=>add("removed",line));y.forEach(line=>add("added",line))}
    else{
      const table=Array.from({length:x.length+1},()=>new Uint32Array(y.length+1));
      for(let i=x.length-1;i>=0;i--)for(let j=y.length-1;j>=0;j--)table[i][j]=x[i]===y[j]?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1]);
      let i=0,j=0;
      while(i<x.length||j<y.length){
        if(i<x.length&&j<y.length&&x[i]===y[j]){add("same",x[i]);i++;j++}
        else if(i<x.length&&(j===y.length||table[i+1][j]>=table[i][j+1]))add("removed",x[i++]);
        else add("added",y[j++]);
      }
    }
    a.slice(endA).forEach(line=>add("same",line));return rows;
  }
  function novelExport(n,now){
    const snapshot=clone(n.snapshot||{}),prompt=text(n.promptSnapshot??snapshot.prompt),record=promptRecord(snapshot);
    return {schema:"dream-gacha.novel-export",version:1,exportedAt:now||new Date().toISOString(),
      novel:{id:n.id,title:text(n.title),body:text(n.body),memo:text(n.memo),favorite:!!n.favorite,createdAt:n.createdAt,updatedAt:n.updatedAt,snapshot},
      prompt:{text:prompt,record,versionId:record?.revision.id||null,headerVersion:headerVersion(prompt),status:record?"recorded":"unknown"},
      annotation:{sourceNovelId:n.id,text:text(n.body),offsetUnit:"UTF-16",reviewStatus:"unknown",annotations:[]}};
  }
  root.DreamGachaPrompts={splitNovelPaste,headerVersion,validRevision,captureRevision,revisionLabel,promptRecord,promptSummary,lineDiff,novelExport};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.DreamGachaPrompts;
})(typeof globalThis!=="undefined"?globalThis:this);
