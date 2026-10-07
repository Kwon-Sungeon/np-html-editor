const $=id=>document.getElementById(id);
let file=null,source=null,editor=null,mode='tiny',ready=false,dirty=false,busy=false,revision=0,toastTimer,cleanHTML=null;
let protectedNodes=new Map(),protectedAttrs=new Map(),markerPrefix='';
const origin='npapp://editor';
function toast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,error?8000:3000);}
async function result(promise){const r=await promise;if(r?.error)throw new Error(r.error);return r;}
function setDirty(value){dirty=value;$('saved-state').textContent=value?'저장하지 않은 변경':'저장됨';$('saved-state').classList.toggle('dirty',value);np.dirty(value);}
function changed(){if(!ready||busy)return;window.scheduleOutline?.();const differs=snapshot()!==cleanHTML;if(differs){revision++;setDirty(true);$('footer-status').textContent='수정 중 · Ctrl+S로 저장';}else if(dirty)setDirty(false);}
function uiBusy(value){busy=value;$('loading').hidden=value===false;$('open').disabled=value;$('save').disabled=value||!file;$('save-as').disabled=value||!file;document.querySelectorAll('.mode-switch button').forEach(b=>b.disabled=value||!file);document.querySelectorAll('#ribbon button,#ribbon select,#ribbon input').forEach(b=>b.disabled=value||!file);}
function parse(html){return new DOMParser().parseFromString(html,'text/html');}
function previewURL(url){
  if(!url)return url;
  if(/^(data:|https?:|blob:|#)/i.test(url))return url;
  const base=source.querySelector('base[href]')?.getAttribute('href');
  if(base&&/^https?:/i.test(base))return new URL(url,base).href;
  if(/^file:/i.test(url))return url; // Keep export unchanged; local relative resources use the granted document directory.
  return new URL(url,file.assetBase).href;
}
function prepare(html){
  source=parse(html);protectedNodes=new Map();protectedAttrs=new Map();markerPrefix='np-'+crypto.randomUUID();
  const body=source.body.cloneNode(true);
  let idx=0;
  body.querySelectorAll('script,iframe,object,embed,base,meta,link').forEach(el=>{
    const id=markerPrefix+'-'+idx++;protectedNodes.set(id,el.outerHTML);
    const stub=document.createElement('span');stub.setAttribute('data-np-preserved',id);stub.setAttribute('hidden','');stub.style.display='none';el.replaceWith(stub);
  });
  body.querySelectorAll('*').forEach(el=>{
    if(el.hasAttribute('id'))el.setAttribute('data-np-original-id',el.id);
    const attrs={};for(const a of [...el.attributes])if(/^on/i.test(a.name)||((a.name==='href'||a.name==='src'||a.name==='action')&&/^\s*(javascript|vbscript):/i.test(a.value))){attrs[a.name]=a.value;el.removeAttribute(a.name);}
    if(Object.keys(attrs).length){const id=markerPrefix+'-'+idx++;protectedAttrs.set(id,attrs);el.setAttribute('data-np-attrs',id);}
  });
  return body.innerHTML;
}
function restore(body){
  const template=document.createElement('template');template.innerHTML=body;const wrapper=template.content;
  wrapper.querySelectorAll('[data-np-original-id]').forEach(el=>{if(!el.hasAttribute('id'))el.id=el.getAttribute('data-np-original-id');el.removeAttribute('data-np-original-id');});
  wrapper.querySelectorAll('[data-np-preserved]').forEach(el=>{const content=protectedNodes.get(el.getAttribute('data-np-preserved'));if(content!==undefined)el.outerHTML=content;});
  wrapper.querySelectorAll('[data-np-attrs]').forEach(el=>{const attrs=protectedAttrs.get(el.getAttribute('data-np-attrs'));if(attrs)for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);el.removeAttribute('data-np-attrs');});
  return template.innerHTML;
}
function snapshot(){
  if(!editor||!source)return null;
  const doc=source.cloneNode(true),body=mode==='tiny'?editor.getContent():editor.getHtml();
  doc.body.innerHTML=restore(body);
  if(mode==='grapes'){
    const css=editor.getCss({keepUnusedStyles:true});
    if(css?.trim()){let style=doc.head.querySelector('style[data-np-design]');if(!style){style=doc.createElement('style');style.setAttribute('data-np-design','');doc.head.append(style);}style.textContent=css;}
  }
  return '<!DOCTYPE html>\n'+doc.documentElement.outerHTML;
}
function updateFile(){
  $('filename').textContent=file.name;$('filepath').textContent=file.path;$('filepath').title=file.path;
  $('encoding').textContent=(file.encoding||'utf8').toUpperCase()+' · HTML';
  $('document-bar').hidden=false;$('welcome').hidden=true;$('workspace').hidden=false;$('ribbon').hidden=false;$('zoom-controls').hidden=false;document.body.classList.remove('backstage');$('return-document').hidden=false;window.refreshRecent?.();
}
async function save(asNew=false){
  if(!ready||busy)return false;
  const savedRevision=revision;
  const html=snapshot();uiBusy(true);
  try{
    $('save').disabled=true;$('save-as').disabled=true;
    const data=await result(np.save(html,asNew));
    if(!data)return false;
    file={...file,...data};updateFile();
    if(data.html){const wasDirty=dirty;await build(data.html);if(wasDirty&&revision!==savedRevision)setDirty(true);}
    if(revision===savedRevision){cleanHTML=snapshot();setDirty(false);}
    $('footer-status').textContent='저장 완료 · '+new Date(data.time).toLocaleTimeString('ko-KR');toast('파일에 저장했습니다.');return true;
  }catch(e){toast(e.message,true);return false;}finally{uiBusy(false);}
}
async function canLeave(){
  if(!dirty)return true;
  const choice=await result(np.unsaved());
  return choice==='discard'||(choice==='save'&&await save());
}
async function open(recentPath){
  if(busy)return;
  try{if(!await canLeave())return;const chosen=await result(typeof recentPath==='string'?np.openRecent(recentPath):np.open());if(!chosen)return;file=chosen;revision=0;updateFile();await build(chosen.html);setDirty(false);$('footer-status').textContent='문서를 열었습니다. 수정 후 저장하세요.';}catch(e){toast(e.message,true);}
}
async function insertImage(){
  try{const image=await result(np.image());if(!image)return;const el=document.createElement('img');el.src=image.url;el.alt=image.name;el.style.maxWidth='100%';
    if(mode==='tiny')editor.insertContent(el.outerHTML);else{const selected=editor.getSelected();if(selected?.get('type')==='image')selected.addAttributes({src:image.url,alt:image.name});else editor.getWrapper().append(el.outerHTML);}changed();
  }catch(e){toast(e.message,true);}
}
function wireFrame(doc){
  doc.querySelectorAll('[data-np-original-id]').forEach(el=>{if(!el.hasAttribute('id'))el.id=el.getAttribute('data-np-original-id');});
  doc.addEventListener('keydown',shortcuts);
  doc.addEventListener('click',event=>{if(event.target.closest('a'))event.preventDefault();});
  doc.addEventListener('submit',event=>event.preventDefault());
  for(const a of [...source.body.attributes])if(!/^on/i.test(a.name))doc.body.setAttribute(a.name,a.value);
  for(const a of [...source.documentElement.attributes])if(!/^on/i.test(a.name))doc.documentElement.setAttribute(a.name,a.value);
}
async function build(html){
  ready=false;uiBusy(true);
  try{
    if(editor){if(mode==='tiny'&&editor.remove)editor.remove();else if(editor.destroy)editor.destroy();else if(editor.remove)editor.remove();editor=null;}
    // Remove any remaining TinyMCE instance when switching engine.
    tinymce.remove();
    $('editor-host').innerHTML='';
    const body=prepare(html);
    const links=[...source.head.querySelectorAll('link[rel="stylesheet"][href]')].map(e=>previewURL(e.getAttribute('href')));
    const designCSS=source.head.querySelector('style[data-np-design]')?.textContent||'';
    const styles=[...source.head.querySelectorAll(mode==='grapes'?'style:not([data-np-design])':'style')].map(e=>e.textContent).join('\n');
    const scripts=source.querySelectorAll('script,iframe,object,embed').length;
    $('notice').hidden=!scripts;$('notice').textContent='이 문서의 스크립트·외부 삽입 콘텐츠는 편집 중 실행하지 않습니다. 저장 시 원래 코드를 유지합니다.';
    const host=$('editor-host');
    if(mode==='tiny'){
      const input=document.createElement('textarea');input.id='document-editor';host.append(input);
      const instances=await tinymce.init({
        selector:'#document-editor',base_url:origin+'/node_modules/tinymce',suffix:'.min',license_key:'gpl',language:'ko',
        height:'100%',resize:false,menubar:false,promotion:false,branding:true,statusbar:true,elementpath:true,
        plugins:'lists link image table searchreplace visualblocks code wordcount fullscreen',
        toolbar:false,
        content_css:links,content_style:styles+'\n[data-np-preserved]{display:none!important}',
        document_base_url:file.assetBase,convert_urls:false,entity_encoding:'raw',
        valid_elements:'*[*]',valid_children:'+dl[div],+div[dt|dd]',
        setup:ed=>{ed.on('input change undo redo',changed);ed.ui.registry.addButton('npimage',{icon:'image',tooltip:'이미지 넣기',onAction:insertImage});ed.addShortcut('meta+s','저장',()=>save());ed.addShortcut('meta+shift+s','다른 이름으로 저장',()=>save(true));ed.addShortcut('meta+o','HTML 열기',open);}
      });
      editor=instances[0];
      if(!editor)throw new Error('편집기를 불러오지 못했습니다.');
      editor.setContent(body);editor.undoManager.clear();editor.undoManager.add();wireFrame(editor.getDoc());
    }else{
      host.innerHTML='<div id="design-shell"><div id="design-editor"></div><aside id="design-panel"><div class="design-panel-tabs"><button class="active" data-panel="styles">서식</button><button data-panel="layers">구조</button><button data-panel="blocks">추가</button></div><div id="design-styles"></div><div id="design-layers" hidden></div><div id="design-blocks" hidden></div></aside></div>';const div=$('design-editor');
      host.querySelectorAll('[data-panel]').forEach(btn=>btn.onclick=()=>{host.querySelectorAll('[data-panel]').forEach(b=>b.classList.toggle('active',b===btn));['styles','layers','blocks'].forEach(n=>$('design-'+n).hidden=n!==btn.dataset.panel);});
      editor=grapesjs.init({
        container:div,height:'100%',width:'auto',protectedCss:'',storageManager:false,noticeOnUnload:false,telemetry:false,
        i18n:{locale:'ko',detectLocale:false,messages:{ko:window.NP_GJS_KO}},
        panels:{defaults:[]},styleManager:{appendTo:'#design-styles',sectors:[{name:'크기와 간격',open:true,buildProps:['display','width','height','max-width','min-height','margin','padding']},{name:'글꼴',open:true,buildProps:['font-family','font-size','font-weight','letter-spacing','color','line-height','text-align']},{name:'배경과 테두리',open:false,buildProps:['background-color','border','border-radius','box-shadow']}]},layerManager:{appendTo:'#design-layers'},
        selectorManager:{componentFirst:true},parser:{optionsHtml:{keepEmptyTextNodes:true}},
        canvas:{styles:links},
        deviceManager:{devices:[{name:'데스크톱',width:''},{name:'태블릿',width:'820px'},{name:'모바일',width:'390px'}]},
        blockManager:{appendTo:'#design-blocks',blocks:[{id:'text',label:'본문',content:'<p>새 내용을 입력하세요.</p>'},{id:'title',label:'제목',content:'<h2>새 제목</h2>'},{id:'quote',label:'인용',content:'<blockquote>핵심 내용을 입력하세요.</blockquote>'},{id:'table',label:'표',content:'<table style="width:100%;border-collapse:collapse"><tbody><tr><th>항목</th><th>내용</th></tr><tr><td>항목</td><td>내용</td></tr></tbody></table>'},{id:'section',label:'구역',content:'<section><h2>새 구역</h2><p>내용을 입력하세요.</p></section>'}]}
      });
      await new Promise(resolve=>editor.on('load',resolve));
      const doc=editor.Canvas.getDocument(),base=doc.createElement('base');base.href=file.assetBase;doc.head.prepend(base);
      const style=doc.createElement('style');style.textContent=styles+'\n[data-np-preserved]{display:none!important}';doc.head.append(style);
      editor.setComponents(body);if(designCSS)editor.addStyle(designCSS);wireFrame(doc);
      
      // GrapesJS emits its initial component updates on a deferred timer.
      // Attach change tracking after those initialization events have settled.
      await new Promise(resolve=>setTimeout(resolve,80));
      editor.clearDirtyCount();
      editor.on('update',changed);
    }
    cleanHTML=snapshot();ready=true;window.editorReady?.();
  }catch(e){toast('문서를 불러오지 못했습니다: '+e.message,true);throw e;}finally{uiBusy(false);}
}
async function switchMode(next){
  if(next===mode||!ready||busy)return;
  const html=snapshot(),wasDirty=dirty,oldEditor=editor;
  ready=false;if(mode==='tiny')oldEditor.remove();else oldEditor.destroy();editor=null;
  mode=next;document.body.classList.toggle('design-mode',mode==='grapes');document.querySelectorAll('.mode-switch button').forEach(b=>b.classList.toggle('active',b.id==='mode-'+mode));
  $('mode-help').textContent=mode==='tiny'?'본문을 클릭해 수정하세요.':'글은 더블클릭 · 요소를 선택하면 오른쪽에서 디자인을 바꿀 수 있습니다.';
  try{await build(html);if(wasDirty)cleanHTML=null;setDirty(wasDirty);}catch{}
}
function shortcuts(event){
  if(!(event.ctrlKey||event.metaKey))return;
  const key=event.key.toLowerCase();
  if(key==='s'){event.preventDefault();save(event.shiftKey);}else if(key==='o'){event.preventDefault();open();}
}
$('open').onclick=open;$('welcome-open').onclick=open;$('save').onclick=()=>save();$('save-as').onclick=()=>save(true);
$('mode-tiny').onclick=()=>switchMode('tiny');$('mode-grapes').onclick=()=>switchMode('grapes');
$('reveal').onclick=()=>np.reveal();$('about').onclick=()=>np.about();document.addEventListener('keydown',shortcuts);
let closePending=false;np.onClose(async()=>{if(closePending||busy)return;closePending=true;try{if(await canLeave())np.close();}finally{closePending=false;}});
(async()=>{try{const initial=await result(np.initial());if(initial){file=initial;updateFile();await build(initial.html);setDirty(false);}}catch(e){toast(e.message,true);}})();


