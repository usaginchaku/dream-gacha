// Responsive interaction regressions use disposable storage, never an existing profile.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Pass the installed Playwright directory, optional output directory, target URL and --webkit.');
const { chromium, webkit, devices } = await import(pathToFileURL(path.join(process.argv[2], 'index.mjs')).href);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(process.argv[3] || path.join(root, 'output/mobile-ui'));
const target = process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : pathToFileURL(path.join(root, 'index.html')).href;
const useWebKit = process.argv.includes('--webkit');
const profile = await mkdtemp(path.join(tmpdir(), 'dream-gacha-mobile-qa-'));
const checks = [], errors = [], metrics = {};
let context, page;
async function check(name, fn) { await fn(); checks.push(name); console.log(`PASS: ${name}`); }
async function screenshot(name) {
  await page.waitForFunction(() => !document.querySelector('.toast.show')&&getComputedStyle(document.querySelector('.toast')).opacity==='0');
  await page.screenshot({ path: path.join(output, name + '.png'), scale:'css' });
}
async function visibleWithinViewport(selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= page.viewportSize().width + 1 && box.y + box.height <= page.viewportSize().height + 1, selector);
  assert.ok(box.height >= 44 && box.width >= 44, `tap target ${selector}`);
}
async function noOverflow(name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow: ${name}`);
  const bad = await page.locator('button,input[type="text"],select,textarea').evaluateAll(els => els.filter(el => el.getClientRects().length && !el.closest('[hidden]') && (el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1)).map(el => el.id || el.textContent.slice(0,40)));
  assert.deepEqual(bad, [], `control overflow: ${name}`);
  if (await page.locator('#gachaCharacterSlot').isVisible()) {
    const characterControls = await page.locator('#gachaCharacterSlot').evaluate(el => {
      const choose=el.querySelector('[data-quick-choose]'), actions=el.querySelector('.result-quick-actions');
      const a=choose.getBoundingClientRect(), b=actions.getBoundingClientRect();
      return {clipped:choose.scrollWidth>choose.clientWidth, overlapping:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top};
    });
    assert.deepEqual(characterControls,{clipped:false,overlapping:false}, `character controls: ${name}`);
  }
}
try {
  await mkdir(output, { recursive: true });
  context = await (useWebKit?webkit:chromium).launchPersistentContext(profile, { ...devices['iPhone 14'], viewport:{width:390,height:844}, headless:true, ...(useWebKit?{}:{channel:'chrome'}), acceptDownloads:true });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(target);
  await page.waitForFunction(() => state.characters.length && document.querySelector('#output').value);
  await check('iPhone 14: character selection and main actions are on the first screen', async () => {
    assert.equal(await page.locator('#screen-gacha').getAttribute('data-mode'), 'simple');
    for (const selector of ['[data-quick-choose]', '#rollAll', '#copyPrompt', '#tab-gacha', '#tab-library', '#tab-manager', '#tab-help']) await visibleWithinViewport(selector);
    await noOverflow('390 initial');
    metrics.initial = await page.evaluate(() => Object.fromEntries(['[data-quick-choose]','#rollAll','#copyPrompt'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [selector,{top:Math.round(r.top),height:Math.round(r.height)}]})));
    await screenshot('iphone14-simple');
  });
  await check('direct selection locks the character; rapid draws retain it and copy the current prompt', async () => {
    await page.locator('[data-quick-choose]').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'choiceClose', 'touch mode must not summon keyboard automatically');
    await page.locator('#choiceSearch').fill('パンナコッタ');
    await page.locator('[data-choice-value="jojo-fugo"]').click();
    assert.equal(await page.locator('[data-lock="character"]').isChecked(),true);
    assert.equal(await page.locator('#rollAll').innerText(),'シチュを回す');
    for(let i=0;i<5;i++) await page.locator('#rollAll').click();
    assert.equal(await page.evaluate(() => state.characterId),'jojo-fugo');
    assert.ok((await page.locator('#output').inputValue()).includes('パンナコッタ・フーゴ'));
    await page.locator('#copyPrompt').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('貼り付け'));
    assert.match(await page.locator('#status').textContent(),/貼り付け/);
    await screenshot('iphone14-chosen');
  });
  await check('favorite-only empty state and search are recoverable in the picker', async () => {
    await page.locator('[data-quick-choose]').click();
    await page.locator('#quickChoiceFavorite').click();
    assert.match(await page.locator('#choiceList').innerText(),/お気に入りが見つかりません/);
    await page.locator('#quickChoiceFavorite').click();
    await page.locator('#quickChoiceWork').selectOption('ジョジョの奇妙な冒険');
    await page.locator('#choiceSearch').fill('存在しないQAキャラ');
    assert.match(await page.locator('#choiceList').innerText(),/該当する候補がありません/);
    await page.locator('#choiceSearch').fill('フーゴ');
    assert.equal(await page.locator('[data-choice-value="jojo-fugo"]').count(),1);
    await screenshot('iphone14-picker');
    await page.locator('#choiceClose').click();
    assert.equal(await page.locator('[data-quick-choose]').evaluate(el=>el===document.activeElement),true);
  });
  await check('picker groups favorites first and the works tab toggles who appears in the gacha', async () => {
    await page.evaluate(() => { const c=state.characters.find(x=>x.id==='jojo-fugo'); c.favorite=true; save(); });
    await page.locator('[data-quick-choose]').click();
    assert.equal(await page.locator('#choiceList .choice-group').first().innerText(),'★ お気に入り');
    assert.equal(await page.locator('#choiceList .choice-item').first().getAttribute('data-choice-value'),'jojo-fugo');
    await page.locator('#choiceSearch').fill('伊東鴨太郎');
    assert.match(await page.locator('#choiceList').innerText(),/お休み中のキャラ/,'search also finds benched characters');
    await page.locator('#choiceSearch').fill('');
    await page.locator('#choiceManageWorks').click();
    assert.equal(await page.locator('#workPanel').isVisible(),true);
    assert.equal(await page.locator('#manager-tab-works').getAttribute('aria-selected'),'true');
    await noOverflow('works tab');
    const row=page.locator('.work-row[data-work="ジョジョの奇妙な冒険"]');
    await row.locator('summary').click();
    const chip=row.locator('[data-work-character="jojo-caesar"]');
    const before=await page.evaluate(()=>state.characters.find(c=>c.id==='jojo-caesar').archived);
    await chip.click();
    assert.equal(await page.evaluate(()=>state.characters.find(c=>c.id==='jojo-caesar').archived),!before);
    assert.equal(await row.locator('[data-work-character="jojo-caesar"]').getAttribute('aria-pressed'),String(before));
    await page.reload();
    await page.waitForFunction(() => state.characters.length);
    assert.equal(await page.evaluate(()=>state.characters.find(c=>c.id==='jojo-caesar').archived),!before,'toggle persists');
    await page.evaluate(() => { const c=state.characters.find(x=>x.id==='jojo-fugo'); c.favorite=false; save(); });
    await page.locator('#tab-manager').click();
    await page.locator('#manager-tab-works').click();
    await page.locator('.work-row[data-work="ジョジョの奇妙な冒険"] summary').click();
    await page.locator('[data-work-character="jojo-caesar"]').click();
    assert.equal(await page.evaluate(()=>state.characters.find(c=>c.id==='jojo-caesar').archived),before);
    await screenshot('iphone14-works');
    await page.locator('#tab-gacha').click();
  });
  await check('mode switching and reload retain custom conditions, locks, and manual prompt text', async () => {
    await page.locator('[data-gacha-mode="custom"]').click();
    await page.locator('#recipeEditor > summary').click();
    await page.locator('#recipe-relationship').fill('QA 手動の関係性');
    await page.locator('[data-lock="relationship"]').check();
    await page.locator('#freeExtra').fill('QA 今回だけの条件');
    await page.locator('#promptPreview > summary').click();
    await page.locator('#output').fill('QA 手編集の完成文\n改行を保持する。');
    await page.locator('#output').press('Tab');
    await page.waitForTimeout(450); // The product deliberately debounces draft persistence by 350 ms.
    const before = await page.evaluate(() => ({values:state.values,locks:state.locks,prompt:document.querySelector('#output').value,extra:document.querySelector('#freeExtra').value}));
    await page.locator('[data-gacha-mode="simple"]').click();
    assert.equal(await page.locator('#activeSettingsLink').isVisible(),true);
    await page.locator('[data-gacha-mode="custom"]').click();
    assert.deepEqual(await page.evaluate(() => ({values:state.values,locks:state.locks,prompt:document.querySelector('#output').value,extra:document.querySelector('#freeExtra').value})),before);
    await page.reload();
    assert.equal(await page.locator('#screen-gacha').getAttribute('data-mode'),'custom');
    assert.deepEqual(await page.evaluate(() => ({values:state.values,locks:state.locks,prompt:document.querySelector('#output').value,extra:document.querySelector('#freeExtra').value})),before);
    await page.locator('[data-gacha-mode="simple"]').click();
    await page.locator('#copyPrompt').click();
    assert.equal(await page.locator('#promptPreview').getAttribute('open'),'');
    assert.equal(await page.locator('#output').inputValue(),before.prompt);
    await page.locator('#copyStoredPrompt').click();
  });
  await check('zero candidates cannot silently draw with the previous character', async () => {
    await page.locator('[data-lock="character"]').uncheck();
    await page.locator('[data-gacha-mode="custom"]').click();
    await page.locator('#gachaFilterDetails > summary').click();
    await page.locator('#gachaSearch').fill('存在しないQAキャラ');
    await page.locator('[data-gacha-mode="simple"]').click();
    const before=await page.evaluate(()=>({id:state.characterId,values:state.values,output:document.querySelector('#output').value}));
    await page.locator('#rollAll').click();
    assert.match(await page.locator('#rollFeedback').innerText(),/候補が0件/);
    assert.equal(await page.locator('#gachaSearch').isVisible(),true,'empty draws reveal the relevant filters');
    assert.deepEqual(await page.evaluate(()=>({id:state.characterId,values:state.values,output:document.querySelector('#output').value})),before);
    await page.locator('#clearFilters').click();
    await page.locator('#gachaFilterDetails > summary').click();
  });
  await check('library drafts survive tabs; reader closes only after unsaved changes are confirmed', async () => {
    await page.locator('#tab-library').click();
    assert.equal(await page.locator('#novelArchivePanel').isVisible(),true);
    await page.locator('[data-library-pane="save"]').click();
    const title='QA 長い題名でも省略せず読める作品の保存と再編集';
    const body='長文を最後まで読むための検証本文。\n\n'.repeat(100)+'最後の一行。';
    await page.locator('#novelTitle').fill(title);await page.locator('#novelBody').fill(body);
    await page.locator('[data-library-pane="presets"]').click();await page.locator('[data-library-pane="save"]').click();
    assert.equal(await page.locator('#novelBody').inputValue(),body);
    await page.locator('#saveNovel').click();
    await page.locator('[data-open-novel]').first().waitFor();
    await screenshot('iphone14-archive');
    await page.locator('[data-open-novel]').first().click();
    assert.equal(await page.locator('#novelViewBody').textContent(),body);
    await screenshot('iphone14-reader');
    await page.locator('#startNovelEdit').click();await page.locator('#novelEditTitle').fill(title+'（編集中）');
    await Promise.all([
      page.waitForEvent('dialog').then(async dialog=>{assert.equal(dialog.type(),'confirm');await dialog.dismiss();}),
      page.locator('#novelViewClose').click()
    ]);
    assert.equal(await page.locator('#novelModal').isVisible(),true);
    assert.equal(await page.locator('#novelEditTitle').inputValue(),title+'（編集中）');
    await page.locator('#saveNovelEdit').click();
    await page.locator('#novelViewRead').waitFor({state:'visible'});
    await page.locator('#novelViewClose').click();
    assert.equal(await page.locator('[data-open-novel]').first().evaluate(el=>el===document.activeElement),true);
    await page.reload();await page.locator('#tab-library').click();
    assert.match(await page.locator('#novelList').innerText(),/編集中/);
  });
  await check('390, 320, 375, 430 and desktop keep controls within the page in both themes', async () => {
    for(const theme of ['light','dark']){
      await page.locator('#tab-help').click();await page.locator('#themeMode').selectOption(theme);
      for(const width of [390,320,375,430,1280]){
        await page.setViewportSize({width,height:width===1280?900:844});
        for(const screen of ['gacha','library','manager','help']){
          await page.locator('#tab-'+screen).click();await noOverflow(`${width} ${theme} ${screen}`);
          if(screen==='gacha'){
            for(const mode of ['simple','custom']){await page.locator(`[data-gacha-mode="${mode}"]`).click();await noOverflow(`${width} ${theme} ${mode}`);}
          }
        }
      }
      await page.setViewportSize({width:390,height:844});
      await page.locator('#tab-gacha').click();await page.locator('[data-gacha-mode="custom"]').click();await screenshot('iphone14-custom-'+theme);
      await page.locator('#tab-manager').click();await page.locator('#manageSearch').fill('ブチャラティ');await screenshot('iphone14-manager-'+theme);
    }
  });
  await check('large character lists reveal incrementally while selection scope stays explicit', async () => {
    await page.locator('#tab-manager').click();await page.locator('#manageSearch').fill('');
    assert.equal(await page.locator('.char-row').count(),40);
    await page.locator('#manageMore').click();assert.equal(await page.locator('.char-row').count(),80);
    await page.locator('#manageSearch').fill('フーゴ');
    assert.ok(await page.locator('.char-row').count()<40);
    assert.equal(await page.locator('#manageMore').isVisible(),false);
    await page.locator('#manageSearch').fill('');
    assert.equal(await page.locator('.char-row').count(),40);
    await page.locator('.bulk-actions > summary').click();await page.locator('#selectAllVisible').check();
    assert.equal(await page.evaluate(()=>state.selectedIds.size),await page.evaluate(()=>managerFiltered().length));
    assert.match(await page.locator('.bulkbar').innerText(),/検索結果を全選択/);
    await page.locator('#selectAllVisible').uncheck();
  });
  await check('short iPhone browser viewport and a long character name keep main actions reachable', async () => {
    await page.setViewportSize({width:390,height:664});await page.locator('#tab-gacha').click();
    await page.locator('[data-gacha-mode="simple"]').click();
    await page.evaluate(()=>{state.characters.find(c=>c.id===state.characterId).name='QA とても長い名前のキャラクター・別名も含めて最後まで表示';updateCard('character');});
    await noOverflow('390x664 long name');
    await visibleWithinViewport('#rollAll');await visibleWithinViewport('#copyPrompt');
    assert.equal(await page.locator('[data-value="character"]').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    await screenshot('iphone14-short-viewport');
  });
  await check('desktop chooser traps focus and Escape restores the opener', async () => {
    await page.setViewportSize({width:1280,height:900});await page.locator('#tab-gacha').click();
    await page.locator('[data-quick-choose]').click();
    await page.locator('#choiceSearch').fill('フーゴ');
    await page.locator('#choiceClose').focus();await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#choiceModal')),true);
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'choiceClose');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-quick-choose]').evaluate(el=>el===document.activeElement),true);
    await page.locator('[data-gacha-mode="simple"]').click();await screenshot('desktop-simple');
  });
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'results.json'),JSON.stringify({status:'passed',target,engine:useWebKit?'webkit':'chromium',browser:context.browser().version(),checks,metrics,errors},null,2));
} catch(error) {
  await writeFile(path.join(output,'results.json'),JSON.stringify({status:'failed',checks,metrics,errors,error:error.stack},null,2));
  await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
  throw error;
} finally {
  await context?.close();
  if(path.dirname(profile)!==path.resolve(tmpdir())||!path.basename(profile).startsWith('dream-gacha-mobile-qa-'))throw new Error('Unexpected temporary profile path');
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
