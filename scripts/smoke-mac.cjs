const {_electron:electron}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'np-html-smoke-'));
const fixture=path.join(tmp,'한글 문서.html'),copy=path.join(tmp,'copy');fs.mkdirSync(copy);
const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Mac test</title><link rel="stylesheet" href="local.css"></head><body><h1>Mac 편집 검증</h1><p>한글 본문</p><table><tbody><tr><td>데이터</td></tr></tbody></table></body></html>';
fs.writeFileSync(fixture,html);fs.writeFileSync(path.join(tmp,'local.css'),'h1{color:rgb(36,90,150)}');
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const application=await electron.launch({executablePath:process.argv[2],args:['--user-data-dir='+path.join(tmp,'profile')],env,timeout:60000});
 try{
 const page=await application.firstWindow();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>ready&&!busy,null,{polling:100,timeout:30000});
 await page.waitForSelector('#welcome-open');assert((await page.locator('#welcome-open').textContent()).includes('Mac'));
 assert.equal(await application.evaluate(({app})=>app.getVersion()),'1.1.0');
 const menu=await application.evaluate(({Menu})=>Menu.getApplicationMenu().items.map(x=>x.label));assert(menu.includes('파일'));assert(menu.includes('편집'));
 await application.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture);
 await page.locator('#welcome-open').click();await ready();
 let frame=page.frameLocator('iframe.tox-edit-area__iframe');assert.equal(await frame.locator('h1').evaluate(e=>getComputedStyle(e).color),'rgb(36, 90, 150)');
 await frame.locator('h1').click();await page.keyboard.press('End');await page.keyboard.insertText(' 저장확인');await page.keyboard.press('Meta+s');
 await page.waitForFunction(()=>!dirty&&!busy,null,{polling:100});assert(fs.readFileSync(fixture,'utf8').includes('저장확인'));assert.equal(fs.readFileSync(fixture+'.np-backup','utf8'),html);
 await page.locator('#mode-grapes').click();await ready();assert((await page.frameLocator('iframe.gjs-frame').locator('h1').textContent()).includes('저장확인'));
 await page.locator('[data-tab="insert"]').click();await page.locator('[data-action="add-heading"]').click();await page.locator('#save').click();await ready();assert(fs.readFileSync(fixture,'utf8').includes('새 제목'));
 const target=path.join(copy,'수정본.html');await application.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},target);
 await page.locator('#save-as').click();await ready();assert(fs.readFileSync(target,'utf8').includes('file:///'));assert(!fs.readFileSync(target,'utf8').includes('file:////'));
 await page.locator('#mode-tiny').click();await ready();frame=page.frameLocator('iframe.tox-edit-area__iframe');assert.equal(await frame.locator('table').count(),1);assert.equal(await frame.locator('h1').evaluate(e=>getComputedStyle(e).color),'rgb(36, 90, 150)');
 await frame.locator('h1').click();await page.keyboard.insertText('종료 전 저장 ');
 await application.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:2});});
 await application.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].close();});
 await page.waitForTimeout(300);assert(!page.isClosed());
 await application.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0});});
 const closed=new Promise(resolve=>application.on('close',resolve));await application.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].close();});await closed;
 assert(fs.readFileSync(target,'utf8').includes('종료 전 저장'));assert.deepEqual(errors,[]);
 console.log('PASS macOS '+process.arch+': packaged launch, native menu, Korean edit, Cmd+S, backup, both engines, Save As + local CSS, cancel close, save on close');
 }finally{await application.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exit(1);});
