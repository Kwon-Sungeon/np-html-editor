const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('np',{
  platform:process.platform,onMenu:callback=>ipcRenderer.on('np:menu',(_event,command)=>callback(command)),
  recent:()=>ipcRenderer.invoke('np:recent'),openRecent:path=>ipcRenderer.invoke('np:open-recent',path),clearRecent:()=>ipcRenderer.invoke('np:clear-recent'),
  open:()=>ipcRenderer.invoke('np:open'),save:(html,asNew=false)=>ipcRenderer.invoke('np:save',html,asNew),
  unsaved:()=>ipcRenderer.invoke('np:unsaved'),dirty:value=>ipcRenderer.invoke('np:dirty',value),
  close:()=>ipcRenderer.invoke('np:close'),reveal:()=>ipcRenderer.invoke('np:reveal'),
  initial:()=>ipcRenderer.invoke('np:initial'),image:()=>ipcRenderer.invoke('np:image'),about:()=>ipcRenderer.invoke('np:about'),
  onClose:callback=>ipcRenderer.on('np:close-request',()=>callback())
});
