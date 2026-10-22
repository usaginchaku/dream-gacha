"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const builder = require("../tools/build-character-data.js");
const format = require("../src/character-format.js");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data", "characters");

function generatedCharacters() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "data/character-data.generated.js"), "utf8"), context);
  return context.DreamGachaCharacterData.DEFAULT_CHARACTERS;
}

function withFixture(document, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dream-gacha-characters-"));
  try {
    fs.writeFileSync(path.join(directory, "fixture.json"), `${JSON.stringify(document)}\n`, "utf8");
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("generated bundle preserves every seeded character and major fields", () => {
  const characters = generatedCharacters();
  assert.equal(characters.length, 1303);
  assert.equal(crypto.createHash("sha256").update(JSON.stringify(characters)).digest("hex"), "b0a2167a6849c8da81126a08d280da419af796a828c6355ad9f4f674c90b295c");
  assert.deepEqual(JSON.parse(JSON.stringify(characters.find(character => character.id === "jojo-caesar"))), {
    id: "jojo-caesar", name: "シーザー・A・ツェペリ", work: "ジョジョの奇妙な冒険", series: "2部",
    tags: ["キザ", "自信家", "女好き", "情熱的", "年上系", "包容力", "優しい"], archived: false,
    favorite: false, heightText: "186cm", heightCm: 186, heightStatus: "verified",
    heightSource: "JoJo Wiki「Caesar Anthonio Zeppeli」プロフィール：186cm"
  });
  assert.equal(new Set(characters.map(character => character.work)).size, 22);
});

test("public seeds never inherit favorites from an imported source", () => {
  const input = [{ id: "a", favorite: true }, { id: "b", favorite: false }, { id: "c" }];
  const before = JSON.stringify(input);
  const context = {};
  vm.runInNewContext(builder.generateSource(input), context);
  assert.ok(context.DreamGachaCharacterData.DEFAULT_CHARACTERS.every(c => c.favorite === false));
  assert.equal(JSON.stringify(input), before, "building must not mutate imported settings");
  assert.ok(generatedCharacters().every(c => c.favorite === false));
  for (const { document } of builder.readDocuments(dataDir)) {
    assert.ok(document.characters.every(c => c.favorite !== true), "published source JSON must also be neutral");
  }
});

test("index.html cache key matches the generated bundle", () => {
  const source = fs.readFileSync(path.join(root, "data/character-data.generated.js"), "utf8");
  const digest = crypto.createHash("sha256").update(source, "utf8").digest("hex").slice(0, 12);
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(index, new RegExp(`character-data\\.generated\\.js\\?v=${digest}`));
});

test("normal build is idempotent when output and cache key are already current", () => {
  builder.main([]);
  const firstBundle = fs.readFileSync(path.join(root, "data/character-data.generated.js"), "utf8");
  const firstIndex = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.doesNotThrow(() => builder.main([]));
  assert.equal(fs.readFileSync(path.join(root, "data/character-data.generated.js"), "utf8"), firstBundle);
  assert.equal(fs.readFileSync(path.join(root, "index.html"), "utf8"), firstIndex);
});

test("all 22 work files contain characters from exactly one work", () => {
  const documents = builder.readDocuments(dataDir);
  assert.equal(documents.length, 22);
  for (const { file, document } of documents) {
    const works = new Set(document.characters.map(character => character.work));
    assert.equal(works.size, 1, `${file} must contain exactly one work`);
  }
});

test("path options report a clear error when their value is missing", () => {
  assert.throws(() => builder.main(["--data-dir"]), /--data-dir の値/);
  assert.throws(() => builder.main(["--output", "--check"]), /--output の値/);
});

test("validator rejects malformed schema, duplicate identities, tags, and height fields", () => {
  const base = { schema: "dream-gacha.characters", version: 1, characters: [{ id: "c1", name: "A", work: "W", tags: [], heightCm: null, heightStatus: "unknown", heightSource: "未確認" }] };
  assert.throws(() => withFixture({ ...base, schema: "wrong" }, dir => builder.main(["--check", "--data-dir", dir])), /schema/);
  assert.throws(() => withFixture({ ...base, characters: [{ ...base.characters[0] }, { ...base.characters[0], id: "c2" }] }, dir => builder.main(["--check", "--data-dir", dir])), /同じ作品の同名/);
  assert.throws(() => withFixture({ ...base, characters: [{ ...base.characters[0], tags: ["自由タグ"] }] }, dir => builder.main(["--check", "--data-dir", dir])), /許可されていないタグ/);
  assert.throws(() => withFixture({ ...base, characters: [{ ...base.characters[0], heightCm: 170 }] }, dir => builder.main(["--check", "--data-dir", dir])), /heightStatus=unknown/);
  assert.throws(() => withFixture({ ...base, characters: [{ ...base.characters[0], heightCm: null, heightStatus: "manual", heightSource: "手動" }] }, dir => builder.main(["--check", "--data-dir", dir])), /heightStatus=manual/);
});

test("validator rejects duplicate IDs across works", () => {
  const document = {
    schema: "dream-gacha.characters", version: 1,
    characters: [
      { id: "same", name: "A", work: "W1", tags: [], heightCm: null, heightStatus: "unknown", heightSource: "未確認" },
      { id: "same", name: "B", work: "W2", tags: [], heightCm: null, heightStatus: "unknown", heightSource: "未確認" }
    ]
  };
  assert.throws(() => withFixture(document, dir => builder.main(["--check", "--data-dir", dir])), /キャラIDが重複/);
});

test("published work files use the compact version 2 format and are already formatted", () => {
  for (const file of fs.readdirSync(dataDir).filter(name => name.endsWith(".json"))) {
    const text = fs.readFileSync(path.join(dataDir, file), "utf8");
    const document = JSON.parse(text);
    assert.equal(document.version, 2, file);
    assert.equal(format.formatWorkFile(document), text, `${file} は --format 済みの書式です`);
  }
  const documents = builder.readDocuments(dataDir);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dream-gacha-format-"));
  try {
    for (const file of fs.readdirSync(dataDir)) fs.copyFileSync(path.join(dataDir, file), path.join(directory, file));
    assert.equal(builder.formatDocuments(directory, documents), 0, "formatting must be idempotent");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("version 2 expands defaults, compact heights and gacha flags into full records", () => {
  const document = {
    schema: "dream-gacha.characters", version: 2, work: "W",
    heightDefaults: { status: "verified", source: "公式資料" },
    characters: [
      { id: "a", name: "A", series: "1部", tags: ["冷静"], height: 180 },
      { id: "b", name: "B", height: "175cm（アニメ）／172cm（原作）", gacha: false },
      { id: "c", name: "C" },
      { id: "d", name: "D", height: { cm: 190, status: "manual", source: "手動" } },
      { name: "E", height: { text: "成人版は未設定", status: "verified", cm: null } }
    ]
  };
  const records = format.expandWorkFile(document, { deriveId: builder.deriveId });
  assert.deepEqual(records[0], { id: "a", name: "A", work: "W", series: "1部", tags: ["冷静"], archived: false, favorite: false, heightText: "180cm", heightCm: 180, heightStatus: "verified", heightSource: "公式資料" });
  assert.equal(records[1].heightCm, 175);
  assert.equal(records[1].archived, true);
  assert.deepEqual([records[2].heightText, records[2].heightCm, records[2].heightStatus, records[2].heightSource], ["不明", null, "unknown", format.UNKNOWN_SOURCE]);
  assert.deepEqual([records[3].heightStatus, records[3].heightSource], ["manual", "手動"]);
  assert.equal(records[4].id, builder.deriveId("W", "E"));
  assert.equal(records[4].heightCm, null);
  const roundTrip = format.expandWorkFile(format.compactWorkFile(records), {});
  assert.deepEqual(roundTrip, records);
});

test("version 2 reports typos and misplaced fields in plain Japanese", () => {
  const base = { schema: "dream-gacha.characters", version: 2, work: "W", characters: [{ name: "A" }] };
  assert.throws(() => format.expandWorkFile({ ...base, characters: [{ name: "A", tag: ["冷静"] }] }), /使えない項目があります: tag/);
  assert.throws(() => format.expandWorkFile({ ...base, characters: [{ name: "A", work: "W" }] }), /作品名はファイル先頭の work/);
  assert.throws(() => format.expandWorkFile({ ...base, work: "" }), /work（作品名）は必須/);
  assert.throws(() => format.expandWorkFile({ ...base, characters: [{ name: "A", height: { cm: 170, status: "unknown" } }] }), /cm を書かないで/);
  assert.throws(() => format.expandWorkFile({ ...base, characters: [{ name: "A", gacha: "no" }] }), /gacha は true か false/);
  assert.throws(() => withFixture({ ...base, characters: [{ name: "A", tags: ["自由タグ"] }] }, dir => builder.main(["--check", "--data-dir", dir])), /許可されていないタグ/);
  assert.deepEqual(format.charactersFrom([{ name: "X" }]), [{ name: "X" }]);
  assert.throws(() => format.charactersFrom({}), /characters 配列/);
});
