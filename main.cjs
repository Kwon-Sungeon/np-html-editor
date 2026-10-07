const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {fileURLToPath,pathToFileURL} = require('node:url');
const iconv = require('iconv-lite');
const APP = 'NP HTML 편집기';
protocol.registerSchemesAsPrivileged([
  {scheme:'npapp',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}},
  {scheme:'npasset',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}
]);
let win, current=null, dirty=false, closing=false;
const assetRoots=new Map();
let recent=[];
async function remember(file){
  recent=[{path:file,name:path.basename(file),opened:new Date().toISOString()},...recent.filter(x=>x.path!==file)].slice(0,12);
  await fs.writeFile(path.join(app.getPath('userData'),'recent.json'),JSON.stringify(recent)).catch(()=>{});
}
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf'};
function isInside(root,file){const rel=path.relative(root,file);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
async function assetResponse(root,file,reportAsset=false){
  try{
    if(!isInside(root,file))return new Response('Forbidden',{status:403});
    if(reportAsset){const real=await fs.realpath(file);if(!isInside(await fs.realpath(root),real))return new Response('Forbidden',{status:403});}
    const ext=path.extname(file).toLowerCase();
    if(reportAsset&&!['.css','.png','.jpg','.jpeg','.gif','.svg','.webp','.ico','.woff','.woff2','.ttf','.otf','.avif'].includes(ext))return new Response('Forbidden',{status:403});
    return new Response(await fs.readFile(file),{headers:{'Content-Type':types[ext]||'application/octet-stream','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response('Not found',{status:404});}
}
function title(){win?.setTitle((dirty?'● ':'')+(current?path.basename(current.path)+' — ':'')+APP);}
function trusted(event){if(!event.senderFrame?.url.startsWith('npapp://editor/'))throw new Error('Untrusted request');}
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{trusted(event);try{return await fn(...args);}catch(e){return {error:e.message};}});}
function decode(buffer){
  if(buffer[0]===0xff&&buffer[1]===0xfe)return {html:iconv.decode(buffer,'utf16-le'),encoding:'utf16-le',bom:true};
  if(buffer[0]===0xfe&&buffer[1]===0xff)return {html:iconv.decode(buffer,'utf16-be'),encoding:'utf16-be',bom:true};
  const sample=buffer.subarray(0,8192).toString('ascii');
  const declared=sample.match(/charset\s*=\s*["']?\s*([\w-]+)/i)?.[1]?.toLowerCase();
  let encoding=['euc-kr','ks_c_5601-1987','cp949','windows-949'].includes(declared)?'cp949':'utf8';
  if(encoding==='utf8'){try{new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{encoding='cp949';}}
  return {html:iconv.decode(buffer,encoding),encoding,bom:buffer.subarray(0,3).equals(Buffer.from([239,187,191]))};
}
function encode(html,doc){
  if(typeof html!=='string'||Buffer.byteLength(html)>60*1024*1024)throw new Error('문서가 너무 크거나 올바르지 않습니다.');
  const encoded=iconv.encode(html,doc.encoding,{addBOM:doc.bom});
  if(iconv.decode(encoded,doc.encoding).replace(/^\uFEFF/,'')!==html.replace(/^\uFEFF/,''))throw new Error('현재 문서 인코딩으로 저장할 수 없는 문자가 있습니다. “다른 이름으로 저장”을 사용하면 UTF-8로 저장됩니다.');
  return encoded;
}
async function load(file){
  if(!/\.html?$/i.test(file))throw new Error('HTML 또는 HTM 파일을 선택하세요.');
  const bytes=await fs.readFile(file);
  if(bytes.length>30*1024*1024)throw new Error('30MB 이하의 HTML 파일을 선택하세요.');
  const data=decode(bytes),token=crypto.randomBytes(16).toString('hex');
  let assetRoot=path.dirname(file);
  const baseHref=data.html.match(/<base\b[^>]*href\s*=\s*["'](file:[^"']+)["']/i)?.[1];
  if(baseHref){try{assetRoot=fileURLToPath(new URL('.',baseHref));}catch{}}
  assetRoots.set(token,assetRoot);
  current={path:file,hash:hash(bytes),encoding:data.encoding,bom:data.bom,token};dirty=false;title();await remember(file);
  return {...data,name:path.basename(file),path:file,assetBase:'npasset://'+token+'/'};
}
async function unsavedChoice(){
  if(!dirty)return 'discard';
  const {response}=await dialog.showMessageBox(win,{type:'question',title:APP,message:'수정한 내용을 저장할까요?',detail:current?path.basename(current.path):'',buttons:['저장','저장하지 않음','취소'],defaultId:0,cancelId:2,noLink:true});
  return ['save','discard','cancel'][response];
}
async function chooseOpen(){
  const {canceled,filePaths}=await dialog.showOpenDialog(win,{title:'편집할 HTML 파일 선택',properties:['openFile'],filters:[{name:'HTML 문서',extensions:['html','htm']}]});
  if(canceled)return null;return load(filePaths[0]);
}
async function save(html,asNew=false){
  if(!current)throw new Error('먼저 HTML 파일을 열어주세요.');
  let target=current.path,doc=current,previous=null;
  if(asNew){
    const selected=await dialog.showSaveDialog(win,{title:'다른 이름으로 저장',defaultPath:current.path.replace(/\.html?$/i,'_수정본.html'),filters:[{name:'HTML 문서',extensions:['html','htm']}]});
    if(selected.canceled||!selected.filePath)return null;
    target=selected.filePath;
    if(!/\.html?$/i.test(target))target+='.html';
    // Copying a report to a different folder retains access to its existing relative assets.
    if(path.dirname(target)!==path.dirname(current.path)){
      const fileBase=pathToFileURL(path.dirname(current.path)+path.sep).href;
      if(!/<base\b/i.test(html))html=html.replace(/<head([^>]*)>/i,'<head$1><base href="'+fileBase+'">');
    }
    html=html.replace(/charset\s*=\s*(["']?)\s*(?:euc-kr|ks_c_5601-1987|cp949|windows-949|utf-16(?:le|be)?)/ig,'charset=$1utf-8');
    doc={...current,encoding:'utf8',bom:false};
  }
  try{previous=await fs.readFile(target);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!asNew&&previous&&hash(previous)!==current.hash){
    const {response}=await dialog.showMessageBox(win,{type:'warning',title:APP,message:'다른 프로그램에서 파일이 변경되었습니다.',detail:'지금 편집한 내용으로 덮어쓸까요?',buttons:['취소','덮어쓰기'],defaultId:0,cancelId:0,noLink:true});
    if(response!==1)return null;
  }
  const bytes=encode(html,doc);
  if(previous)await fs.writeFile(target+'.np-backup',previous);
  const temp=target+'.np-writing-'+crypto.randomBytes(4).toString('hex');
  try{await fs.writeFile(temp,bytes,{flag:'wx'});await fs.rename(temp,target);}catch(e){await fs.unlink(temp).catch(()=>{});throw e;}
  current={...doc,path:target,hash:hash(bytes)};dirty=false;title();await remember(target);
  return {name:path.basename(target),path:target,encoding:current.encoding,time:new Date().toISOString(),html:asNew?html:null};
}
app.whenReady().then(async()=>{
  try{const data=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'recent.json'),'utf8'));if(Array.isArray(data))recent=data.filter(x=>typeof x.path==='string'&&typeof x.name==='string').slice(0,12);}catch{}

  protocol.handle('npapp',request=>{const u=new URL(request.url);const file=path.resolve(__dirname,'.'+decodeURIComponent(u.pathname));return assetResponse(__dirname,file);});
  protocol.handle('npasset',request=>{const u=new URL(request.url),root=assetRoots.get(u.hostname);return root?assetResponse(root,path.resolve(root,'.'+decodeURIComponent(u.pathname)),true):new Response('Not found',{status:404});});
  win=new BrowserWindow({width:1440,height:960,minWidth:980,minHeight:680,show:false,title:APP,backgroundColor:'#f4f6f8',icon:path.join(__dirname,'build/icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
  if(process.platform==='darwin'){
    const send=command=>win.webContents.send('np:menu',command);
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:APP,submenu:[{label:'NP HTML 편집기 정보',role:'about'},{type:'separator'},{role:'services'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{label:'종료',role:'quit'}]},
      {label:'파일',submenu:[{label:'열기…',accelerator:'Cmd+O',click:()=>send('open')},{label:'저장',accelerator:'Cmd+S',click:()=>send('save')},{label:'다른 이름으로 저장…',accelerator:'Cmd+Shift+S',click:()=>send('save-as')},{type:'separator'},{label:'창 닫기',role:'close'}]},
      {label:'편집',submenu:[{label:'실행 취소',accelerator:'Cmd+Z',click:()=>send('undo')},{label:'다시 실행',accelerator:'Cmd+Shift+Z',click:()=>send('redo')},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
      {label:'보기',submenu:[{role:'togglefullscreen'}]},
      {label:'윈도우',submenu:[{role:'minimize'},{role:'zoom'},{role:'front'}]}
    ]));
  }else Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  win.on('close',event=>{if(dirty&&!closing){event.preventDefault();win.webContents.send('np:close-request');}});
  handle('np:open',chooseOpen);
  handle('np:recent',()=>recent);
  handle('np:open-recent',file=>{if(!recent.some(x=>x.path===file))throw new Error('최근 문서 목록에서 파일을 선택하세요.');return load(file);});
  handle('np:clear-recent',async()=>{recent=[];await fs.writeFile(path.join(app.getPath('userData'),'recent.json'),'[]');return true;});
  handle('np:save',(html,asNew)=>save(html,Boolean(asNew)));
  handle('np:unsaved',unsavedChoice);
  handle('np:dirty',value=>{dirty=Boolean(value);title();return true;});
  handle('np:close',()=>{closing=true;win.close();return true;});
  handle('np:reveal',()=>{if(current)shell.showItemInFolder(current.path);return true;});
  handle('np:initial',async()=>{
    const candidate=process.argv.find(arg=>/\.html?$/i.test(arg)&&path.isAbsolute(arg));
    return candidate?load(candidate):null;
  });
  handle('np:image',async()=>{
    const result=await dialog.showOpenDialog(win,{title:'이미지 선택',properties:['openFile'],filters:[{name:'이미지',extensions:['png','jpg','jpeg','gif','webp']}]});
    if(result.canceled)return null;
    const file=result.filePaths[0],data=await fs.readFile(file);if(data.length>15*1024*1024)throw new Error('15MB 이하의 이미지를 선택하세요.');
    return {url:'data:'+types[path.extname(file).toLowerCase()]+';base64,'+data.toString('base64'),name:path.basename(file)};
  });
  handle('np:about',async()=>{await dialog.showMessageBox(win,{type:'info',title:APP,message:APP+'  v'+app.getVersion(),detail:'HTML 파일 열기 · 편집 · 저장\nTinyMCE 8.9.3 / GrapesJS 0.23.6\nGPL-2.0-or-later\n\n정적 HTML 문서 편집용입니다. 문서의 스크립트는 편집 중 실행하지 않습니다.'});return true;});
  await win.loadURL('npapp://editor/renderer/index.html');win.show();
});
app.on('window-all-closed',()=>app.quit());
