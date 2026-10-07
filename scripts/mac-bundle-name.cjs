// electron-builder 26 normalizes helper names to NFD. Electron requires the
// bundle name to match those names byte-for-byte (upstream issue #9771).
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
exports.default=async context=>{
  if(context.electronPlatformName!=='darwin')return;
  const app=fs.readdirSync(context.appOutDir).find(name=>name.endsWith('.app'));
  const contents=path.join(context.appOutDir,app,'Contents');
  const helper=fs.readdirSync(path.join(contents,'Frameworks')).find(name=>name.endsWith(' Helper.app'));
  if(!helper)throw new Error('Missing Electron helper bundle');
  const name=helper.slice(0,-' Helper.app'.length);
  execFileSync('/usr/libexec/PlistBuddy',['-c','Set :CFBundleName '+name,path.join(contents,'Info.plist')]);
  console.log('Aligned CFBundleName with helper bundles:',name);
};
