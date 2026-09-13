// Developer QA against the production file:// app in a disposable Chrome profile.
// This never connects to the user's browser or reads its localStorage/IndexedDB.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Pass the installed playwright directory; optional output directory and --smoke follow.');
const { chromium } = await import(pathToFileURL(path.join(process.argv[2], 'index.mjs')).href);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeOnly = process.argv.includes('--smoke');
const output = process.argv[3] && process.argv[3] !== '--smoke' ? path.resolve(process.argv[3]) : path.join(root, 'output', 'recipe-card-browser');
const profile = await mkdtemp(path.join(tmpdir(), 'dream-gacha-recipe-card-qa-'));
const startedAt = new Date().toISOString();
const results = [], errors = [], externalRequests = [];
let browser, page;

async function check(name, task) {
  await task();
  results.push(name);
  console.log(`PASS: ${name}`);
}

async function ready() {
  await page.waitForFunction(() => state.characters.length > 0 && document.querySelector('#basePrompt').value.includes('0.1.3.3'));
}

async function openDetailsFor(selector) {
  await page.locator(selector).evaluate(element => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
  });
}

async function prompt() {
  await page.locator('#buildPrompt').click();
  return page.locator('#output').inputValue();
}

async function screenshot(name, selector) {
  if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, name) });
}

async function checkRecipeEditing() {
  await page.evaluate(() => {
    state.characterId = 'jojo-fugo'; updateCard('character'); DreamGachaRecipe.render();
    // Exercise the copy route without changing the user's operating-system clipboard.
    copyTextToClipboard = async text => { window.qaRecipeCopied = text; return true; };
  });
  await page.locator('#recipeEditor').evaluate(element => element.open = true);
  await page.locator('#recipe-relationship').fill('QA同僚。交際前。互いの好意は未確認。');
  await page.locator('#recipe-situation').fill('二人で本を読んでいる');
  await page.locator('#recipe-mood').fill('QA静かな余韻');
  await page.locator('#recipe-extra').fill('');
  await page.locator('#recipeSupportingSituation').fill('QA窓を開けて風を通す。');
  const original = await prompt();
  assert.match(original, /QA同僚|QA窓を開けて/);
  assert.equal(await page.evaluate(() => state.values.extra), '', 'manual empty conditions are not refilled randomly');
  assert.equal(await page.locator('#promptFreshness').getAttribute('data-state'), 'current');
  const manuallyEdited = original + '\nQA完成欄の手編集を維持する。';
  await page.locator('#output').fill(manuallyEdited);
  await page.locator('#recipe-relationship').fill('QA友人。交際前。まだ告白していない。');
  assert.equal(await page.locator('#promptFreshness').getAttribute('data-state'), 'stale');
  assert.equal(await page.locator('#output').inputValue(), manuallyEdited);
  await page.locator('#saveCurrentPreset').click();
  const saved = await page.evaluate(() => structuredClone(state.presets[0]));
  assert.equal(saved.snapshot.prompt, '', 'stale prompt is not attributed to the edited recipe');
  assert.ok(!saved.snapshot.promptRecord);
  assert.match(saved.snapshot.relationship, /QA友人/);
  assert.match(await page.evaluate(() => state.promptDraftSnapshot.relationship), /QA同僚/, 'generation conditions remain fixed');
  await page.locator('#openNovelSave').click();
  assert.equal(await page.locator('#novelSavePrompt').inputValue(), manuallyEdited);
  await page.locator('#novelTitle').fill('QA過去生成の整合');
  await page.locator('#novelBody').fill('QA前の条件で書かれた本文。');
  await page.locator('#saveNovel').click();
  await page.waitForFunction(async () => (await novelAll()).some(novel => novel.title === 'QA過去生成の整合'));
  const novel = await page.evaluate(() => novelAll().then(novels => novels.find(novel => novel.title === 'QA過去生成の整合')));
  assert.equal(novel.promptSnapshot, manuallyEdited);
  assert.match(novel.snapshot.relationship, /QA同僚/);
  await page.locator('#tab-gacha').click();
  await page.locator('#copyPrompt').click();
  assert.equal(await page.locator('#output').inputValue(), manuallyEdited, 'automatic copy cannot replace manual text');
  assert.equal(await page.evaluate(() => window.qaRecipeCopied), undefined, 'blocked update does not copy an outdated prompt silently');
  await page.locator('#copyStoredPrompt').click();
  assert.equal(await page.evaluate(() => window.qaRecipeCopied), manuallyEdited, 'explicit stored copy preserves text');
  await prompt(); // The test dialog handler accepts the explicit replacement confirmation.
  assert.equal(await page.locator('#promptFreshness').getAttribute('data-state'), 'current');
  await page.locator('#recipe-mood').fill('QA新しい雰囲気');
  await page.locator('#copyPrompt').click();
  assert.equal(await page.locator('#promptFreshness').getAttribute('data-state'), 'current');
  assert.match(await page.evaluate(() => window.qaRecipeCopied), /QA新しい雰囲気/);
}

async function checkRequestProtagonist() {
  const standard = await page.evaluate(() => ({ protagonistProfile: state.protagonistProfile, workProtagonistProfiles: structuredClone(state.workProtagonistProfiles) }));
  await openDetailsFor('#requestProtagonistProfile');
  await page.locator('#requestProtagonistProfile').fill('QA今回だけの夢主。成人女性、170cm。');
  await page.locator('#requestWorkProtagonistProfile').fill('QA今回だけの作品別設定。');
  assert.match(await prompt(), /QA今回だけの夢主/);
  await page.locator('#saveCurrentPreset').click();
  const saved = await page.evaluate(() => structuredClone(state.presets[0]));
  await page.locator('#useStandardProtagonist').click();
  assert.equal(await page.locator('#requestProtagonistProfile').inputValue(), standard.protagonistProfile);
  await page.locator('#tab-library').click();
  await page.locator(`[data-apply-preset="${saved.id}"]`).click();
  assert.equal(await page.locator('#requestProtagonistProfile').inputValue(), saved.snapshot.protagonistProfile);
  assert.equal(await page.locator('#requestWorkProtagonistProfile').inputValue(), saved.snapshot.workProtagonistProfile);
  assert.deepEqual(await page.evaluate(() => ({ protagonistProfile: state.protagonistProfile, workProtagonistProfiles: state.workProtagonistProfiles })), standard);
  await page.locator('#recipe-mood').fill('QA同じ保存条件を更新');
  const count = await page.evaluate(() => state.presets.length);
  await page.locator('#updateCurrentPreset').click();
  assert.equal(await page.evaluate(() => state.presets.length), count);
  assert.match(await page.evaluate(id => state.presets.find(preset => preset.id === id).snapshot.mood, saved.id), /QA同じ保存条件を更新/);
  await page.reload();
  await ready();
  assert.equal(await page.locator('#requestProtagonistProfile').inputValue(), saved.snapshot.protagonistProfile);
  assert.deepEqual(await page.evaluate(() => ({ protagonistProfile: state.protagonistProfile, workProtagonistProfiles: state.workProtagonistProfiles })), standard);
  await openDetailsFor('#useStandardProtagonist');
  await page.locator('#useStandardProtagonist').click();
  await page.locator('#contextUseCurrent').click();
  await prompt();
}

async function createCharacterNote({ title, body, scope = 'common', section = 'voice', source = 'interpretation', activation = 'auto', reference = false }) {
  await page.locator('#characterCardNew').click();
  assert.equal(await page.locator('#characterNoteActivation').inputValue(), 'manual', 'new notes need an explicit adoption choice');
  await page.locator('#characterNoteTitle').fill(title);
  await page.locator('#characterNoteBody').fill(body);
  await page.locator('#characterNoteScope').selectOption(scope);
  await page.locator('#characterNoteSection').selectOption(section);
  await page.locator('#characterNoteSource').selectOption(source);
  await openDetailsFor('#characterNoteActivation');
  await page.locator('#characterNoteActivation').selectOption(activation);
  if (reference) {
    await openDetailsFor('#characterNoteVerification');
    await page.locator('#characterNoteVerification').selectOption('user_checked');
    await openDetailsFor('#characterNoteReference-name');
    await page.locator('#characterNoteReference-name').fill('QA用資料名 <b>文字列</b>');
    await page.locator('#characterNoteReference-version').fill('2026-09-13 QA');
    await page.locator('#characterNoteReference-excerpt').fill('QA資料の抜粋😀\n原文の改行を維持。');
  }
  await page.locator('#characterNoteSave').click();
  assert.match(await page.locator('#characterNoteStatus').textContent(), /保存/);
  const saved = await page.evaluate(title => state.promptSettings.entries.find(entry => entry.title === title), title);
  assert.ok(saved?.id, 'the note was persisted in the existing context entry store');
  assert.equal(saved.body, body);
  assert.deepEqual(saved.scope.characterIds, ['jojo-fugo']);
  assert.equal(saved.characterNote.sourceKind, source);
  assert.equal(saved.characterNote.section, section);
  if (reference) {
    assert.equal(saved.characterNote.verification, 'user_checked');
    assert.equal(saved.reference.excerpt, 'QA資料の抜粋😀\n原文の改行を維持。');
  }
  return saved;
}

async function checkCharacterCards() {
  const originalPrompt = await page.locator('#basePrompt').inputValue();
  const stages = await page.evaluate(() => ({
    office: state.promptSettings.entries.find(entry => entry.kind === 'stage' && entry.title === 'オフィスパロ').id,
    cafe: state.promptSettings.entries.find(entry => entry.kind === 'stage' && entry.title === 'カフェパロ').id
  }));
  await page.locator('#tab-manager').click();
  await page.locator('#manageSearch').fill('パンナコッタ・フーゴ');
  await page.locator('[data-character-card="jojo-fugo"]').click();
  const common = await createCharacterNote({ title: 'QA共通口調 <img src=x onerror=alert(1)>', body: 'QA共通の人物像。\nこれは試験用の仮入力😀', reference: true });
  const canon = await createCharacterNote({ title: 'QA原作の所属', body: 'QA原作だけの所属を適用。', scope: 'canon', section: 'background', source: 'canon' });
  const office = await createCharacterNote({ title: 'QA会社員の職歴', body: 'QAオフィス限定の職歴を適用。', scope: `stage:${stages.office}`, section: 'background', source: 'au' });
  const manual = await createCharacterNote({ title: 'QA未採用メモ', body: 'QA今回だけ選択するメモ。', activation: 'manual', section: 'memo', source: 'unclassified' });
  assert.equal(await page.locator('#characterCardDialog img, #characterCardDialog b').count(), 0, 'user note text is escaped');
  await page.locator('#characterCardClose').click();
  await page.locator('#tab-gacha').click();
  await page.evaluate(() => { state.characterId = 'jojo-fugo'; updateCard('character'); });
  await page.locator('#contextStage').selectOption('');
  await openDetailsFor('[data-world-mode="canon"]');
  await page.locator('[data-world-mode="canon"]').click();
  let text = await prompt();
  assert.match(text, /QA共通の人物像/);
  assert.match(text, /QA原作だけの所属/);
  assert.doesNotMatch(text, /QAオフィス限定|QA今回だけ選択/);
  await page.locator('#contextStage').selectOption(stages.office);
  text = await prompt();
  assert.match(text, /QA共通の人物像/);
  assert.match(text, /QAオフィス限定/);
  assert.doesNotMatch(text, /QA原作だけの所属|QA今回だけ選択/);
  await page.locator('#contextStage').selectOption(stages.cafe);
  text = await prompt();
  assert.match(text, /QA共通の人物像/);
  assert.doesNotMatch(text, /QA原作だけの所属|QAオフィス限定|QA今回だけ選択/);
  await page.locator('#contextStage').selectOption(stages.office);
  await openDetailsFor(`[data-context-apply="${manual.id}"]`);
  await page.locator(`[data-context-apply="${manual.id}"]`).check();
  assert.match(await prompt(), /QA今回だけ選択/);
  await page.locator(`[data-context-apply="${common.id}"]`).uncheck();
  assert.doesNotMatch(await prompt(), /QA共通の人物像/);
  await page.locator(`[data-context-apply="${common.id}"]`).check();
  await page.evaluate(() => { state.characterId = 'jojo-bucciarati'; updateCard('character'); });
  text = await prompt();
  assert.doesNotMatch(text, /QA共通の人物像|QA原作だけの所属|QAオフィス限定|QA今回だけ選択/, 'notes cannot leak to another character');
  await page.evaluate(() => { state.characterId = 'jojo-fugo'; updateCard('character'); });
  await prompt();
  assert.equal(await page.locator('#basePrompt').inputValue(), originalPrompt, 'the published/custom base prompt is untouched');
  return { common, canon, office, manual, stages };
}

async function checkCardPersistence(notes) {
  await page.locator('#saveCurrentPreset').click();
  const preset = await page.evaluate(() => structuredClone(state.presets[0]));
  const frozen = JSON.stringify(preset.snapshot);
  assert.deepEqual(preset.snapshot.promptContext.settings.entries.find(entry => entry.id === notes.common.id), notes.common);
  await page.locator('#openNovelSave').click();
  await page.locator('#novelTitle').fill('QAカルテ利用の本文');
  await page.locator('#novelBody').fill('QA本文😀\n空白と改行を保持する。\n');
  await page.locator('#saveNovel').click();
  await page.waitForFunction(async () => (await novelAll()).some(novel => novel.title === 'QAカルテ利用の本文'));
  const novel = await page.evaluate(() => novelAll().then(novels => novels.find(novel => novel.title === 'QAカルテ利用の本文')));
  assert.ok(novel?.id);
  assert.deepEqual(novel.snapshot.promptContext.settings.entries.find(entry => entry.id === notes.common.id), notes.common);
  await page.locator(`[data-open-novel="${novel.id}"]`).click();
  await openDetailsFor('#exportNovelJson');
  const novelDownloaded = page.waitForEvent('download');
  await page.locator('#exportNovelJson').click();
  const novelExport = JSON.parse(await readFile(await (await novelDownloaded).path(), 'utf8'));
  assert.equal(novelExport.version, 2);
  assert.equal(novelExport.contextScope, 'applied-only');
  assert.ok(!novelExport.novel.snapshot.promptContext, 'external export excludes the full card library');
  assert.match(JSON.stringify(novelExport.prompt.appliedContext), /QA共通の人物像|QAオフィス限定/);
  assert.doesNotMatch(JSON.stringify(novelExport), /QA原作だけの所属|QA原作の所属/, 'unapplied card contents do not leave through novel JSON export');
  await writeFile(path.join(output, 'recipe-card-novel-export.json'), JSON.stringify(novelExport, null, 2) + '\n');
  await page.locator('#novelViewClose').click();
  await page.locator('#tab-gacha').click();
  await openDetailsFor('#contextManager');
  await page.locator('#contextManager').evaluate(element => element.open = true);
  await page.locator(`[data-context-edit="${notes.common.id}"]`).click();
  await page.locator('#contextBody').fill('QA共通カルテの更新後本文。');
  await page.locator('#contextEntrySave').click();
  await page.locator('#contextCancel').click();
  const edited = await page.evaluate(id => structuredClone(state.promptSettings.entries.find(entry => entry.id === id)), notes.common.id);
  assert.deepEqual(edited.characterNote, notes.common.characterNote, 'generic supplement editor must preserve card metadata');
  assert.deepEqual(edited.reference, notes.common.reference);
  assert.match(await prompt(), /QA共通カルテの更新後本文/);
  assert.equal(JSON.stringify(await page.evaluate(id => state.presets.find(preset => preset.id === id).snapshot, preset.id)), frozen, 'editing a card cannot rewrite saved conditions');
  await page.evaluate(snapshot => applySnapshot(snapshot), preset.snapshot);
  assert.ok(await page.locator('#contextReuseNotice').isVisible());
  assert.match(await prompt(), /QA共通の人物像/);
  assert.doesNotMatch(await page.locator('#output').inputValue(), /QA共通カルテの更新後本文/);
  await page.locator('#contextUseCurrent').click();
  assert.match(await prompt(), /QA共通カルテの更新後本文/);

  await page.locator('#tab-help').click();
  const downloaded = page.waitForEvent('download');
  await page.locator('#exportFullBackup').click();
  const backup = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
  assert.deepEqual(backup.data.promptSettings.entries.find(entry => entry.id === notes.common.id), edited);
  assert.equal(JSON.stringify(backup.data.presets.find(item => item.id === preset.id).snapshot), frozen);
  assert.deepEqual(backup.data.novels.find(item => item.id === novel.id), novel);
  const file = path.join(output, 'recipe-card-backup.json');
  await writeFile(file, JSON.stringify(backup, null, 2) + '\n');
  await page.locator('#fullBackupFile').setInputFiles(file);
  await page.waitForFunction(() => document.querySelector('#backupRestoreStatus').textContent.includes('復元しました'));
  await page.reload();
  await ready();
  assert.deepEqual(await page.evaluate(() => state.promptSettings.entries.filter(entry => entry.characterNote)), backup.data.promptSettings.entries.filter(entry => entry.characterNote));
  assert.deepEqual(await page.evaluate(() => novelAll()), backup.data.novels);
  assert.equal(JSON.stringify(await page.evaluate(id => state.presets.find(item => item.id === id).snapshot, preset.id)), frozen);
  return edited;
}

async function checkResponsiveCards(common) {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#themeMode').selectOption(width === 390 ? 'dark' : 'light');
    await page.locator('#tab-gacha').click();
    await page.locator('#recipeEditor').evaluate(element => element.open = true);
    await openDetailsFor('#requestProtagonistProfile');
    for (const selector of ['#recipe-relationship', '#recipe-situation', '#recipeSupportingSituation', '#requestProtagonistProfile', '#requestWorkProtagonistProfile']) {
      assert.ok(await page.locator(selector).evaluate(element => {
        const bounds = element.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth;
      }), `${selector} fits at ${width}px`);
    }
    await page.locator('#recipeEditor').evaluate(element => window.scrollTo({ top: scrollY + element.getBoundingClientRect().top - 65, behavior: 'instant' }));
    await screenshot(`recipe-card-recipe-${width}.png`);
    await screenshot(`recipe-card-protagonist-${width}.png`, '#useStandardProtagonist');
    await page.locator('[data-character-card=""]').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page has no horizontal overflow');
    assert.ok(await page.locator('#characterCardDialog').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight;
    }), 'the complete dialog fits the viewport');
    await page.locator('.character-card-content').evaluate(element => element.scrollTop = 0);
    await screenshot(`recipe-card-${width}.png`);
    await page.locator(`[data-character-note-edit="${common.id}"]`).click();
    await page.locator('#characterNoteBody').fill('QAで全文閲覧を確認する長いメモ。\n'.repeat(100));
    await page.locator('#characterNoteBody').evaluate(element => element.scrollTop = element.scrollHeight);
    assert.ok(await page.locator('#characterNoteBody').evaluate(element => element.scrollTop > 0), 'long note text can scroll to its end');
    await openDetailsFor('#characterNoteReference-excerpt');
    await openDetailsFor('#characterNoteActivation');
    await page.locator('#characterNoteSave').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#characterNoteSave').evaluate(element => {
      const button = element.getBoundingClientRect(), area = document.querySelector('.character-card-content').getBoundingClientRect();
      return button.top >= area.top && button.bottom <= area.bottom + 1;
    }), 'save is reachable after all optional fields');
    for (const selector of ['#characterNoteBody', '#characterNoteScope', '#characterNoteReference-name']) {
      assert.ok(await page.locator(selector).evaluate(element => {
        const bounds = element.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth;
      }), `${selector} is readable at ${width}px`);
    }
    await screenshot(`recipe-card-editor-${width}.png`);
    await page.locator('#characterCardClose').click();
  }
}

async function checkCardSaveFailure(common) {
  await page.locator('#tab-manager').click();
  await page.evaluate(() => DreamGachaCharacterCardUI.open('jojo-fugo'));
  await page.locator(`[data-character-note-edit="${common.id}"]`).click();
  const before = await page.evaluate(() => ({ stored: localStorage.getItem('dreamGachaSettings'), settings: structuredClone(state.promptSettings) }));
  await page.locator('#characterNoteBody').fill('QA保存に失敗しても入力を残す。');
  await page.evaluate(() => {
    window.qaRecipeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new Error('QA quota failure'); };
  });
  try {
    await page.locator('#characterNoteSave').click();
    assert.match(await page.locator('#characterNoteStatus').textContent(), /保存できません/);
    assert.equal(await page.locator('#characterNoteBody').inputValue(), 'QA保存に失敗しても入力を残す。');
    assert.deepEqual(await page.evaluate(() => state.promptSettings), before.settings, 'failed save rolls back in-memory card data');
    assert.equal(await page.evaluate(() => localStorage.getItem('dreamGachaSettings')), before.stored, 'failed save preserves persisted data');
  } finally {
    await page.evaluate(() => { Storage.prototype.setItem = window.qaRecipeSetItem; delete window.qaRecipeSetItem; });
  }
  await page.locator('#characterCardClose').click();
}

try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chrome', viewport: { width: 1280, height: 950 }, acceptDownloads: true
  });
  page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
  page.on('dialog', dialog => dialog.accept());
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await ready();

  await check('no-card startup, roll, and prompt generation remain available', async () => {
    assert.equal(await page.evaluate(() => state.promptSettings.entries.filter(entry => entry.characterNote).length), 0);
    assert.equal(await page.locator('#tab-gacha').getAttribute('aria-selected'), 'true');
    await page.locator('#rollAll').click();
    assert.ok((await prompt()).length > 500);
    assert.ok(await page.evaluate(() => currentCharacter()?.id));
  });

  if (!smokeOnly) {
    await check('recipe edits, stale prompt provenance, manual copy preservation, and explicit regeneration', checkRecipeEditing);
    await check('request-only protagonist, snapshot reuse, and same-ID preset update preserve standard profiles', checkRequestProtagonist);
    let notes, common;
    await check('optional cards, scope isolation, manual adoption, references, and escaping', async () => { notes = await checkCharacterCards(); });
    await check('card edits preserve metadata and frozen snapshots; backup file roundtrip and reload', async () => { common = await checkCardPersistence(notes); });
    await check('card save quota failure preserves editable text and existing data', async () => checkCardSaveFailure(common));
    await check('390px/1280px card and editor scrolling, fitting, and themes', async () => checkResponsiveCards(common));
  }

  assert.deepEqual(errors, [], 'no uncaught page errors');
  assert.deepEqual(externalRequests, [], 'no external network requests');
  if (smokeOnly) await screenshot('recipe-card-smoke-1280.png', '#resultGrid');
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ status: 'passed', startedAt, completedAt: new Date().toISOString(), mode: smokeOnly ? 'runtime-smoke' : 'full', browser: await browser.browser().version(), results, errors, externalRequests }, null, 2) + '\n');
} catch (error) {
  if (page) await screenshot('recipe-card-failure.png').catch(() => {});
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ status: 'failed', startedAt, completedAt: new Date().toISOString(), mode: smokeOnly ? 'runtime-smoke' : 'full', results, error: error.stack, errors, externalRequests }, null, 2) + '\n');
  throw error;
} finally {
  if (browser) await browser.close();
  const checked = path.resolve(profile);
  if (path.dirname(checked) !== path.resolve(tmpdir()) || !path.basename(checked).startsWith('dream-gacha-recipe-card-qa-')) throw new Error('Unexpected QA cleanup path');
  await rm(checked, { recursive: true, force: true });
}
