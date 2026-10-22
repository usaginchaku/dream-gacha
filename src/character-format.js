/*
 * キャラJSONの形式変換。ブラウザーの読み込みと tools/build-character-data.js の両方で使う。
 *
 * version 2（作品ファイル形式）は1ファイル＝1作品で、人が編集しやすいよう既定値を省略できる。
 *   {
 *     "schema": "dream-gacha.characters", "version": 2, "work": "作品名",
 *     "heightDefaults": { "status": "verified", "source": "出典", "unknownText": "不明", "unknownSource": "…" },
 *     "characters": [ { "name": "キャラ名", "series": "部", "tags": ["冷静"], "height": 180 }, … ]
 *   }
 * height は数値（cm）・文字列（表示用の文・先頭のcm値を代表値に使う）・オブジェクト（個別の出典など）。
 * 省略すると身長不明。"gacha": false でガチャから外した状態（お休み）になる。
 * version 1 はキャラごとに全項目を書く従来形式で、引き続き読み込める。
 */
(function(root){
  "use strict";
  const SCHEMA="dream-gacha.characters";
  const UNKNOWN_TEXT="不明";
  const UNKNOWN_SOURCE="今回確認できた公称資料では数値を特定できず。推測値は登録していません。";
  const KNOWN_SOURCE="出典未指定";
  const FILE_KEYS=["schema","version","work","heightDefaults","characters","note"];
  const CHARACTER_KEYS=["id","name","series","tags","height","gacha"];
  const HEIGHT_KEYS=["cm","text","status","source"];
  const DEFAULT_KEYS=["status","source","unknownText","unknownSource"];
  const STATUSES=["verified","manual","unknown"];

  function fail(message){const error=new Error(message);error.code="CHARACTER_DATA_INVALID";return error;}
  function isObject(value){return !!value&&typeof value==="object"&&!Array.isArray(value);}
  function own(object,key){return Object.prototype.hasOwnProperty.call(object,key);}
  function unknownKeys(object,allowed){return Object.keys(object).filter(key=>!allowed.includes(key));}
  function cmFromText(text){const match=String(text).match(/(\d+(?:\.\d+)?)\s*cm/i);return match?Number(match[1]):null;}
  function cmText(cm){return `${cm}cm`;}

  function isWorkFile(document){return isObject(document)&&document.schema===SCHEMA&&document.version===2;}

  function heightDefaults(document,source){
    const raw=document.heightDefaults===undefined?{}:document.heightDefaults;
    if(!isObject(raw))throw fail(`${source}: heightDefaults はオブジェクトで指定してください`);
    const extra=unknownKeys(raw,DEFAULT_KEYS);
    if(extra.length)throw fail(`${source}: heightDefaults に使えない項目があります: ${extra.join(", ")}`);
    for(const key of DEFAULT_KEYS)if(raw[key]!==undefined&&typeof raw[key]!=="string")throw fail(`${source}: heightDefaults.${key} は文字列で指定してください`);
    if(raw.status!==undefined&&!["verified","manual"].includes(raw.status))throw fail(`${source}: heightDefaults.status は verified か manual です`);
    return {status:raw.status||"manual",source:raw.source||KNOWN_SOURCE,unknownText:raw.unknownText||UNKNOWN_TEXT,unknownSource:raw.unknownSource||UNKNOWN_SOURCE};
  }

  function expandHeight(value,defaults,label){
    let spec;
    if(value===undefined||value===null)spec={};
    else if(typeof value==="number")spec={cm:value};
    else if(typeof value==="string")spec={text:value};
    else if(isObject(value)){
      const extra=unknownKeys(value,HEIGHT_KEYS);
      if(extra.length)throw fail(`${label}: height に使えない項目があります: ${extra.join(", ")}`);
      spec=value;
    }else throw fail(`${label}: height は数値・文字列・オブジェクトのいずれかで指定してください`);
    if(spec.text!==undefined&&typeof spec.text!=="string")throw fail(`${label}: height.text は文字列で指定してください`);
    if(spec.source!==undefined&&typeof spec.source!=="string")throw fail(`${label}: height.source は文字列で指定してください`);
    if(spec.status!==undefined&&!STATUSES.includes(spec.status))throw fail(`${label}: height.status は verified / manual / unknown のいずれかです`);
    let cm=spec.cm;
    if(cm===undefined)cm=spec.status==="unknown"||spec.text===undefined?null:cmFromText(spec.text);
    if(cm!==null&&(typeof cm!=="number"||!Number.isFinite(cm)||cm<=0))throw fail(`${label}: height.cm は正の数値で指定してください`);
    const status=spec.status||(cm===null?"unknown":defaults.status);
    if(status==="unknown"){
      if(cm!==null)throw fail(`${label}: 身長不明（unknown）のときは cm を書かないでください`);
      return {heightText:spec.text||defaults.unknownText,heightCm:null,heightStatus:"unknown",heightSource:spec.source||defaults.unknownSource};
    }
    // 公式資料で「未設定」と確認できた場合だけ、verified で cm: null を書ける。
    if(cm===null&&!(status==="verified"&&spec.cm===null&&spec.text))throw fail(`${label}: 身長の数値（cm）が必要です`);
    return {heightText:spec.text||cmText(cm),heightCm:cm,heightStatus:status,heightSource:spec.source||defaults.source};
  }

  // options.deriveId(work,name) が与えられたときだけ、id のないキャラへ決まったIDを付ける。
  function expandWorkFile(document,options={}){
    const source=options.source||"JSON";
    if(!isWorkFile(document))throw fail(`${source}: schema が ${SCHEMA}、version が 2 の作品ファイルではありません`);
    const extra=unknownKeys(document,FILE_KEYS);
    if(extra.length)throw fail(`${source}: 使えない項目があります: ${extra.join(", ")}`);
    const work=typeof document.work==="string"?document.work.trim():"";
    if(!work)throw fail(`${source}: work（作品名）は必須です`);
    if(!Array.isArray(document.characters))throw fail(`${source}: characters 配列が見つかりません`);
    const defaults=heightDefaults(document,source);
    return document.characters.map((character,index)=>{
      const label=`${source}: characters[${index}]`;
      if(!isObject(character))throw fail(`${label} はオブジェクトではありません`);
      const keys=unknownKeys(character,CHARACTER_KEYS);
      if(keys.length)throw fail(`${label}（${character.name||"名前なし"}）に使えない項目があります: ${keys.join(", ")}。作品名はファイル先頭の work に書きます`);
      if(typeof character.name!=="string"||!character.name.trim())throw fail(`${label}.name は必須です`);
      const name=character.name.trim();
      if(character.id!==undefined&&(typeof character.id!=="string"||!character.id.trim()))throw fail(`${label}.id は文字列で指定してください`);
      if(character.series!==undefined&&typeof character.series!=="string")throw fail(`${label}.series は文字列で指定してください`);
      if(character.tags!==undefined&&(!Array.isArray(character.tags)||character.tags.some(tag=>typeof tag!=="string")))throw fail(`${label}.tags は文字列の配列で指定してください`);
      if(character.gacha!==undefined&&typeof character.gacha!=="boolean")throw fail(`${label}.gacha は true か false です`);
      const record={};
      const id=character.id||(options.deriveId?options.deriveId(work,name):undefined);
      if(id)record.id=id;
      Object.assign(record,{name,work,series:character.series||"",tags:[...(character.tags||[])],archived:character.gacha===false,favorite:false},expandHeight(character.height,defaults,`${label}（${name}）`));
      return record;
    });
  }

  // 読み込みファイルからキャラ配列を取り出す。version 1・配列・version 2 に対応する。
  function charactersFrom(data,options={}){
    if(Array.isArray(data))return data;
    if(isWorkFile(data))return expandWorkFile(data,options);
    if(isObject(data)&&Array.isArray(data.characters))return data.characters;
    throw fail("characters 配列が見つかりません");
  }

  function mostCommon(values){
    const counts=new Map();let best=null,bestCount=0;
    for(const value of values){const count=(counts.get(value)||0)+1;counts.set(value,count);if(count>bestCount){best=value;bestCount=count;}}
    return best;
  }
  function compactHeight(record,defaults){
    const unknown=record.heightStatus==="unknown";
    const sameSource=record.heightSource===(unknown?defaults.unknownSource:defaults.source);
    const candidates=[];
    if(unknown){
      if(record.heightText===defaults.unknownText&&sameSource)candidates.push(undefined);
      if(sameSource&&cmFromText(record.heightText)===null)candidates.push(record.heightText);
      candidates.push({text:record.heightText,status:"unknown",source:record.heightSource});
    }else{
      if(record.heightStatus===defaults.status&&sameSource&&record.heightCm!==null){
        if(record.heightText===cmText(record.heightCm))candidates.push(record.heightCm);
        candidates.push(record.heightText);
      }
      const spec={cm:record.heightCm};
      if(record.heightText!==cmText(record.heightCm))spec.text=record.heightText;
      if(record.heightStatus!==defaults.status||record.heightCm===null)spec.status=record.heightStatus;
      if(!sameSource)spec.source=record.heightSource;
      candidates.push(spec);
    }
    const expected=JSON.stringify([record.heightText,record.heightCm,record.heightStatus,record.heightSource]);
    const index=candidates.findIndex(candidate=>{
      try{const h=expandHeight(candidate,defaults,"");return JSON.stringify([h.heightText,h.heightCm,h.heightStatus,h.heightSource])===expected;}catch(error){return false;}
    });
    if(index<0)throw fail(`${record.name}: 身長を作品ファイル形式で表せません`);
    return candidates[index];
  }

  // 1作品分の従来形式のキャラを、既定値を省いた version 2 に変換する。
  function compactWorkFile(records,options={}){
    const works=[...new Set(records.map(record=>record.work))];
    if(works.length!==1||!works[0])throw fail("作品ファイルには1作品だけのキャラを入れてください");
    const known=records.filter(record=>record.heightStatus!=="unknown"),unknown=records.filter(record=>record.heightStatus==="unknown");
    const statusSource=known.length?JSON.parse(mostCommon(known.map(record=>JSON.stringify([record.heightStatus,record.heightSource])))):["manual",KNOWN_SOURCE];
    const unknownPair=unknown.length?JSON.parse(mostCommon(unknown.map(record=>JSON.stringify([record.heightText,record.heightSource])))):[UNKNOWN_TEXT,UNKNOWN_SOURCE];
    const raw={status:statusSource[0],source:statusSource[1],unknownText:unknownPair[0],unknownSource:unknownPair[1]};
    const document={schema:SCHEMA,version:2,work:works[0]};
    if(options.note)document.note=options.note;
    const stored={};
    if(raw.status!=="manual")stored.status=raw.status;
    if(raw.source!==KNOWN_SOURCE)stored.source=raw.source;
    if(raw.unknownText!==UNKNOWN_TEXT)stored.unknownText=raw.unknownText;
    if(raw.unknownSource!==UNKNOWN_SOURCE)stored.unknownSource=raw.unknownSource;
    if(Object.keys(stored).length)document.heightDefaults=stored;
    const defaults=heightDefaults(document,"");
    document.characters=records.map(record=>{
      const character={};
      if(record.id)character.id=record.id;
      character.name=record.name;
      if(record.series)character.series=record.series;
      if(record.tags&&record.tags.length)character.tags=[...record.tags];
      const height=compactHeight(record,defaults);
      if(height!==undefined)character.height=height;
      if(record.archived)character.gacha=false;
      return character;
    });
    return document;
  }

  // 1キャラ1行で書き出す。差分が見やすく、メモ帳でも探しやすい。
  function inline(value){
    if(Array.isArray(value))return `[${value.map(inline).join(", ")}]`;
    if(isObject(value))return `{ ${Object.keys(value).map(key=>`${JSON.stringify(key)}: ${inline(value[key])}`).join(", ")} }`;
    return JSON.stringify(value);
  }
  function formatWorkFile(document){
    const lines=["{"];
    const keys=Object.keys(document).filter(key=>key!=="characters");
    for(const key of keys)lines.push(`  ${JSON.stringify(key)}: ${inline(document[key])},`);
    lines.push(`  "characters": [`);
    document.characters.forEach((character,index)=>lines.push(`    ${inline(character)}${index<document.characters.length-1?",":""}`));
    lines.push("  ]","}");
    return lines.join("\n")+"\n";
  }

  const api=Object.freeze({SCHEMA,UNKNOWN_TEXT,UNKNOWN_SOURCE,isWorkFile,expandWorkFile,charactersFrom,compactWorkFile,formatWorkFile});
  root.DreamGachaCharacterFormat=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
