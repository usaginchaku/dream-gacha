#!/usr/bin/env node
"use strict";

/*
 * Build the browser bundle for the seed character data.
 *
 * This file intentionally uses only Node's standard library so that updating
 * the data also works from a copied file:// application without npm.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_DATA_DIR = path.join(ROOT, "data", "characters");
const DEFAULT_OUTPUT = path.join(ROOT, "character-data.generated.js");
const SCHEMA = "dream-gacha.characters";
const VERSION = 1;

if (Number(process.versions.node.split(".")[0]) < 18) {
  throw new Error("このスクリプトは Node.js 18 以降が必要です");
}

function readCanonicalTags(seedPath = path.join(ROOT, "seed-data.js")) {
  const source = fs.readFileSync(seedPath, "utf8");
  const marker = "const CANONICAL_TAGS=";
  const start = source.indexOf(marker);
  const jsonStart = start < 0 ? -1 : source.indexOf("{", start);
  const jsonEnd = jsonStart < 0 ? -1 : source.indexOf("};", jsonStart);
  if (jsonStart < 0 || jsonEnd < 0) throw usageError("seed-data.js の CANONICAL_TAGS を読み込めません");
  let groups;
  try { groups = JSON.parse(source.slice(jsonStart, jsonEnd + 1)); }
  catch (error) { throw usageError(`seed-data.js の CANONICAL_TAGS を解析できません: ${error.message}`); }
  return new Set(Object.values(groups).flat());
}

// Read the application's canonical vocabulary so the validator and UI cannot
// silently drift apart when a tag is added or renamed.
const ALLOWED_TAGS = readCanonicalTags();

const CHARACTER_FIELDS = [
  "id", "name", "work", "series", "tags", "archived", "favorite",
  "heightText", "heightCm", "heightStatus", "heightSource"
];

function usageError(message) {
  const error = new Error(message);
  error.code = "CHARACTER_DATA_INVALID";
  return error;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateCharacter(character, source, index) {
  if (!character || typeof character !== "object" || Array.isArray(character)) {
    throw usageError(`${source}: characters[${index}] はオブジェクトではありません`);
  }
  for (const field of ["id", "name", "work"]) {
    if (!isNonEmptyString(character[field])) {
      throw usageError(`${source}: characters[${index}].${field} は必須の文字列です`);
    }
  }
  if (character.tags !== undefined) {
    if (!Array.isArray(character.tags) || character.tags.some(tag => typeof tag !== "string")) {
      throw usageError(`${source}: ${character.id} の tags は文字列配列で指定してください`);
    }
    const invalidTags = character.tags.filter(tag => !ALLOWED_TAGS.has(tag));
    if (invalidTags.length) {
      throw usageError(`${source}: ${character.id} に許可されていないタグがあります: ${invalidTags.join(", ")}`);
    }
  }
  for (const field of ["archived", "favorite"]) {
    if (character[field] !== undefined && typeof character[field] !== "boolean") {
      throw usageError(`${source}: ${character.id}.${field} は真偽値で指定してください`);
    }
  }
  if (character.heightText !== undefined && typeof character.heightText !== "string") {
    throw usageError(`${source}: ${character.id}.heightText は文字列で指定してください`);
  }
  if (character.heightSource !== undefined && typeof character.heightSource !== "string") {
    throw usageError(`${source}: ${character.id}.heightSource は文字列で指定してください`);
  }
  const heightCm = character.heightCm === undefined ? null : character.heightCm;
  if (heightCm !== null && (typeof heightCm !== "number" || !Number.isFinite(heightCm) || heightCm <= 0)) {
    throw usageError(`${source}: ${character.id}.heightCm は正の数値または null で指定してください`);
  }
  const status = character.heightStatus === undefined ? "unknown" : character.heightStatus;
  if (!["verified", "manual", "unknown"].includes(status)) {
    throw usageError(`${source}: ${character.id}.heightStatus が不正です: ${status}`);
  }
  if (status === "unknown" && heightCm !== null) {
    throw usageError(`${source}: ${character.id} は heightStatus=unknown のため heightCm は null にしてください`);
  }
  if (status === "manual" && heightCm === null) {
    throw usageError(`${source}: ${character.id} は heightStatus=manual のため heightCm が必要です`);
  }
  if ((status === "verified" || status === "manual") && !isNonEmptyString(character.heightSource)) {
    throw usageError(`${source}: ${character.id} は heightStatus=${status} のため heightSource が必要です`);
  }
  if (status === "unknown" && character.heightSource !== undefined && !isNonEmptyString(character.heightSource)) {
    throw usageError(`${source}: ${character.id} は heightStatus=unknown でも heightSource を空にできません`);
  }
}

function validateDocument(document, source) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw usageError(`${source}: JSONのルートはオブジェクトで指定してください`);
  }
  if (document.schema !== SCHEMA) {
    throw usageError(`${source}: schema は ${SCHEMA} で指定してください`);
  }
  if (document.version !== VERSION) {
    throw usageError(`${source}: version は ${VERSION} で指定してください`);
  }
  if (!Array.isArray(document.characters)) {
    throw usageError(`${source}: characters 配列が見つかりません`);
  }
  const sourceOrder = document.sourceOrder;
  if (sourceOrder !== undefined && (!sourceOrder || typeof sourceOrder !== "object" || Array.isArray(sourceOrder))) {
    throw usageError(`${source}: sourceOrder はキャラIDから元の順序へのオブジェクトです`);
  }
  const localIds = new Set();
  for (let index = 0; index < document.characters.length; index += 1) {
    const character = document.characters[index];
    validateCharacter(character, source, index);
    if (localIds.has(character.id)) throw usageError(`${source}: キャラIDが重複しています: ${character.id}`);
    localIds.add(character.id);
  }
  if (sourceOrder) {
    const keys = Object.keys(sourceOrder);
    for (const id of keys) {
      if (!localIds.has(id) || !Number.isInteger(sourceOrder[id]) || sourceOrder[id] < 0) {
        throw usageError(`${source}: sourceOrder に不正なIDまたは順序があります: ${id}`);
      }
    }
  }
  return document;
}

function compareFileNames(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function readDocuments(dataDir) {
  if (!fs.existsSync(dataDir)) throw usageError(`データフォルダーがありません: ${dataDir}`);
  const files = fs.readdirSync(dataDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map(entry => entry.name)
    .sort(compareFileNames);
  if (!files.length) throw usageError(`作品別JSONがありません: ${dataDir}`);
  return files.map(file => {
    const source = path.join(dataDir, file);
    let document;
    try {
      document = JSON.parse(fs.readFileSync(source, "utf8"));
    } catch (error) {
      throw usageError(`${file}: JSONを読み込めません: ${error.message}`);
    }
    return { file, document: validateDocument(document, file) };
  });
}

function flattenDocuments(documents) {
  const ids = new Map();
  const identities = new Map();
  const ordered = [];
  let fallbackOrder = 0;
  for (const { file, document } of documents) {
    for (const character of document.characters) {
      if (ids.has(character.id)) throw usageError(`キャラIDが重複しています: ${character.id} (${ids.get(character.id)} と ${file})`);
      const identity = `${character.work}\u0000${character.name}`;
      if (identities.has(identity)) throw usageError(`同じ作品の同名キャラが重複しています: ${character.work} / ${character.name}`);
      ids.set(character.id, file);
      identities.set(identity, file);
      const explicitOrder = document.sourceOrder && document.sourceOrder[character.id];
      ordered.push({ character, order: explicitOrder === undefined ? Number.POSITIVE_INFINITY : explicitOrder, fallbackOrder });
      fallbackOrder += 1;
    }
  }
  const explicitOrders = ordered.filter(item => Number.isFinite(item.order)).map(item => item.order);
  if (new Set(explicitOrders).size !== explicitOrders.length) throw usageError("sourceOrder の順序が重複しています");
  let nextOrder = explicitOrders.length ? Math.max(...explicitOrders) + 1 : 0;
  for (const item of ordered) if (!Number.isFinite(item.order)) item.order = nextOrder++;
  ordered.sort((a, b) => a.order - b.order || a.fallbackOrder - b.fallbackOrder);
  return ordered.map(item => item.character);
}

function orderedCharacter(character) {
  const result = {};
  for (const field of CHARACTER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(character, field)) result[field] = character[field];
  }
  // Favorites belong to each user's saved settings, never the public seed bundle.
  result.favorite = false;
  return result;
}

function generateSource(characters) {
  const payload = JSON.stringify(characters.map(orderedCharacter));
  return `/* このファイルは tools/build-character-data.js が生成します。直接編集しないでください。 */\n(function(root){\n  "use strict";\n  root.DreamGachaCharacterData=Object.freeze({DEFAULT_CHARACTERS:Object.freeze(${payload})});\n})(typeof globalThis!=="undefined"?globalThis:this);\n`;
}

function updateIndexCacheKey(output, source) {
  if (path.resolve(output) !== DEFAULT_OUTPUT) return;
  const digest = require("node:crypto").createHash("sha256").update(source, "utf8").digest("hex").slice(0, 12);
  const indexPath = path.join(ROOT, "index.html");
  const index = fs.readFileSync(indexPath, "utf8");
  const referencePattern = /character-data\.generated\.js\?v=[^"']+/;
  if (!referencePattern.test(index)) throw usageError("index.html に character-data.generated.js の参照が見つかりません");
  const updated = index.replace(referencePattern, `character-data.generated.js?v=${digest}`);
  if (updated !== index) fs.writeFileSync(indexPath, updated, "utf8");
}

function parseOptions(argv) {
  const options = { dataDir: DEFAULT_DATA_DIR, output: DEFAULT_OUTPUT, check: false };
  const optionValue = (name, index) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw usageError(`${name} の値を指定してください`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") options.check = true;
    else if (arg === "--data-dir") { options.dataDir = path.resolve(optionValue(arg, index)); index += 1; }
    else if (arg === "--output") { options.output = path.resolve(optionValue(arg, index)); index += 1; }
    else throw usageError(`不明なオプションです: ${arg}`);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseOptions(argv);
  const documents = readDocuments(options.dataDir);
  const characters = flattenDocuments(documents);
  if (!options.check) {
    const generated = generateSource(characters);
    const current = fs.existsSync(options.output) ? fs.readFileSync(options.output, "utf8") : null;
    if (current !== generated) fs.writeFileSync(options.output, generated, "utf8");
    updateIndexCacheKey(options.output, generated);
  }
  console.log(`${options.check ? "検証成功" : "生成成功"}: ${characters.length}件, ${documents.length}作品別JSON`);
  return characters;
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(`キャラデータ更新に失敗しました: ${error.message}`); process.exitCode = 1; }
}

module.exports = { ALLOWED_TAGS, flattenDocuments, generateSource, main, readDocuments, validateCharacter, validateDocument };
