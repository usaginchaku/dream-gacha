"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const builder = require("../tools/build-character-data.js");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data", "characters");

function generatedCharacters() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "character-data.generated.js"), "utf8"), context);
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
  assert.equal(crypto.createHash("sha256").update(JSON.stringify(characters)).digest("hex"), "9320c34775835cc7d82d08976caa2d35ae73ef7ba992c4b019fc97ca352e36cb");
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
  const source = fs.readFileSync(path.join(root, "character-data.generated.js"), "utf8");
  const digest = crypto.createHash("sha256").update(source, "utf8").digest("hex").slice(0, 12);
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(index, new RegExp(`character-data\\.generated\\.js\\?v=${digest}`));
});

test("normal build is idempotent when output and cache key are already current", () => {
  builder.main([]);
  const firstBundle = fs.readFileSync(path.join(root, "character-data.generated.js"), "utf8");
  const firstIndex = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.doesNotThrow(() => builder.main([]));
  assert.equal(fs.readFileSync(path.join(root, "character-data.generated.js"), "utf8"), firstBundle);
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
