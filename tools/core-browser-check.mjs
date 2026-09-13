// Core UI regression in disposable browser storage; optional URL verifies deployed assets.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
if (!process.argv[2]) throw new Error('Pass installed Playwright directory, optional output directory and URL.');
const { chromium } = await import(pathToFileURL(path.join(process.argv[2], 'index.mjs')).href);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[3] || path.join(root, 'output/core-browser'));
const target = process.argv[4] || pathToFileURL(path.join(root, 'index.html')).href;
const profile = await mkdtemp(path.join(tmpdir(), 'dream-gacha-core-qa-'));
const checks = [], errors = [], badResponses = [];
let browser, page;
async function check(name, task) { await task(); checks.push(name); console.log(`PASS: ${name}`); }
async function reveal(selector) {
  await page.locator(selector).evaluate(el => { for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; });
}
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chrome', viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  page = await browser.newPage();page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) badResponses.push({ url: r.url(), status: r.status() }); });
  page.on('dialog', d => d.accept('QA保存条件'));
  await page.goto(target);await page.waitForFunction(() => state.characters.length > 0 && document.querySelector('#output').value.length > 0);
  const initial = await page.evaluate(() => state.characters.length);
  let first, second;
  await check('character create, inline edit/cancel, tags, favorite and archive/restore', async () => {
    await page.locator('#tab-manager').click();
    for (const [name, height] of [['QA人物A', '175cm'], ['QA人物B', '185cm']]) {
      await page.locator('#charName').fill(name);await page.locator('#charWork').fill('QA作品');await page.locator('#charSeries').fill('QAシリーズ');await page.locator('#charHeight').fill(height);
      await page.locator('#charTagPicker [data-pick-tag]').first().click();await page.locator('#saveCharacter').click();
    }
    assert.equal(await page.evaluate(() => state.characters.length), initial + 2);
    [first, second] = await page.evaluate(() => state.characters.filter(c => c.work === 'QA作品').map(c => c.id));
    await page.locator('#manageSearch').fill('QA人物');assert.equal(await page.locator('#characterTable .char-row').count(), 2);
    await page.locator(`[data-edit="${first}"]`).click();await page.locator('[data-inline-field="name"]').fill('破棄する編集');await page.locator(`[data-inline-cancel="${first}"]`).click();
    assert.equal(await page.evaluate(id => state.characters.find(c => c.id === id).name, first), 'QA人物A');
    await page.locator(`[data-edit="${first}"]`).click();await page.locator('[data-inline-field="name"]').fill('QA人物A改');await page.locator(`[data-inline-save="${first}"]`).click();
    await page.locator(`[data-favorite="${first}"]`).click();assert.equal(await page.evaluate(id => state.characters.find(c => c.id === id).favorite, first), true);
    await page.locator(`[data-archive="${second}"]`).click();assert.equal(await page.evaluate(id => filteredCharacters().some(c => c.id === id), second), false);
    await page.locator(`[data-archive="${second}"]`).click();assert.equal(await page.evaluate(id => state.characters.find(c => c.id === id).archived, second), false);
    await page.locator('#selectAllVisible').check();await page.locator('#bulkFavorite').click();assert.equal(await page.evaluate(() => state.characters.filter(c => c.work === 'QA作品' && c.favorite).length), 2);
    await page.locator('#bulkUnfavorite').click();assert.equal(await page.evaluate(() => state.characters.filter(c => c.work === 'QA作品' && c.favorite).length), 0);
  });
  await check('character JSON downloads, merge, work replacement and invalid input preserve unrelated data', async () => {
    let pending = page.waitForEvent('download');await page.locator('#exportSelected').click();const exported = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
    assert.equal(exported.characters.length, 2);assert.equal(exported.schema, 'dream-gacha.characters');
    await page.locator('#importMode').selectOption('merge');
    exported.characters[0].heightText = '181cm';exported.characters[0].heightCm = 181;exported.characters[0].heightStatus = 'verified';
    const upload = value => page.locator('#importFile').setInputFiles({ name: 'qa.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
    await upload(exported);await page.waitForFunction(id => state.characters.find(c => c.id === id).heightCm === 181, exported.characters[0].id);
    await page.locator('#importMode').selectOption('work-replace');await upload(exported);await page.waitForFunction(() => document.querySelector('#importFile').value === '');
    assert.equal(await page.evaluate(() => state.characters.length), initial + 2);
    const before = await page.evaluate(() => JSON.stringify(state.characters));await upload({ schema: 'wrong', characters: [] });await page.waitForFunction(() => document.querySelector('#importFile').value === '');
    assert.equal(await page.evaluate(() => JSON.stringify(state.characters)), before);
    pending = page.waitForEvent('download');await page.locator('#exportAll').click();assert.equal(JSON.parse(await readFile(await (await pending).path(), 'utf8')).characters.length, initial + 2);
    pending = page.waitForEvent('download');await page.locator('#exportTemplate').click();assert.ok((await readFile(await (await pending).path(), 'utf8')).includes('characters'));
  });
  await check('shared search, multi-select/exclude, chooser, category reset and partial/all locks', async () => {
    await page.locator('#tab-gacha').click();await reveal('#gachaSearch');assert.equal(await page.locator('#gachaSearch').inputValue(), 'QA人物');
    await reveal('#candidatePreview');await page.locator(`[data-toggle-candidate="${first}"]`).click();await page.locator(`[data-exclude-candidate="${second}"]`).click();
    assert.deepEqual(await page.evaluate(() => filteredCharacters().map(c => c.id)), [first]);await page.locator('#rollAll').click();assert.equal(await page.evaluate(() => state.characterId), first);
    await page.locator('#lockAllResults').click();const locked = await page.evaluate(() => JSON.stringify([state.characterId,state.values]));await page.locator('#rollAll').click();assert.equal(await page.evaluate(() => JSON.stringify([state.characterId,state.values])), locked);
    await page.locator('#unlockAllResults').click();await page.locator('[data-lock="relationship"]').check();const relationship = await page.evaluate(() => state.values.relationship);
    await page.locator('#rollAll').click();assert.equal(await page.evaluate(() => state.values.relationship), relationship);
    await reveal('[data-choose="situation"]');await page.locator('[data-choose="situation"]').click();const choice = await page.locator('[data-choice-value]').first().getAttribute('data-choice-value');await page.locator('[data-choice-value]').first().click();assert.equal(await page.evaluate(() => state.values.situation), choice);
    await page.locator('[data-choose="situation"]').click();await page.locator('[data-category-include]').first().click();await page.locator('#choiceClose').click();await page.locator('#resetAllCategoryRules').click();
    assert.equal(await page.evaluate(() => Object.values(state.categoryInclude).some(Boolean)), false);
    await page.locator('#clearCandidateRules').click();await page.locator('#clearFilters').click();assert.equal(await page.evaluate(() => state.filters.search), '');
  });
  await check('preset creation, reuse and deletion; help, theme, keyboard navigation and mobile fitting', async () => {
    await page.locator('#saveCurrentPreset').click();await page.locator('#tab-library').click();assert.equal(await page.locator('[data-apply-preset]').count(), 1);await page.locator('[data-apply-preset]').click();assert.equal(await page.locator('#updateCurrentPreset').isVisible(), true);
    await page.locator('#tab-library').click();await page.locator('[data-delete-preset]').click();assert.equal(await page.locator('[data-apply-preset]').count(), 0);
    await page.locator('#tab-help').click();await page.locator('#characterResearchWork').fill('QA作品');assert.ok((await page.locator('#characterResearchPromptPreview').inputValue()).includes('QA作品'));
    await page.locator('#themeMode').selectOption('dark');await page.reload();await page.waitForFunction(() => state.characters.length > 0);assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await page.locator('#tab-gacha').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#screen-library').isVisible(), true);
    for (const width of [375,390,1280]) { await page.setViewportSize({ width, height: 900 });for (const tab of ['gacha','manager','library','help']) { await page.locator('#tab-'+tab).click();assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width} ${tab}`); } }
    await page.screenshot({ path: path.join(output, 'core-help.png') });
  });
  await check('bulk deletion remains deleted after reload, including bundled characters', async () => {
    await page.locator('#tab-manager').click();await page.locator('#manageSearch').fill('QA人物');await page.locator('#selectAllVisible').check();await page.locator('#bulkDelete').click();
    await page.locator('#manageSearch').fill('パンナコッタ');await page.locator('[data-select="jojo-fugo"]').check();await page.locator('#bulkDelete').click();await page.reload();await page.waitForFunction(() => state.characters.length > 0);
    assert.equal(await page.evaluate(() => state.characters.some(c => c.id === 'jojo-fugo' || c.work === 'QA作品')), false);
  });
  assert.deepEqual(errors, []);assert.deepEqual(badResponses, []);
  await writeFile(path.join(output,'results.json'),JSON.stringify({status:'passed',target,browser:browser.browser().version(),checks,errors,badResponses,completedAt:new Date().toISOString()},null,2));
} catch (error) {
  await writeFile(path.join(output,'results.json'),JSON.stringify({status:'failed',target,checks,errors,badResponses,error:error.message},null,2));throw error;
} finally {
  await browser?.close();
  if (path.dirname(profile) !== path.resolve(tmpdir()) || !path.basename(profile).startsWith('dream-gacha-core-qa-')) throw new Error('Unexpected temporary profile path');
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
