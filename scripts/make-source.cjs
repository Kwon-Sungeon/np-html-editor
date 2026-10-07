// Produce the corresponding-source ZIP using only the Node.js standard library.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
const sources=new Set();
function collect(rel){const full=path.join(root,rel);if(!fs.existsSync(full))return;const stat=fs.lstatSync(full);if(stat.isSymbolicLink())return;if(stat.isDirectory()){for(const name of fs.readdirSync(full))collect(path.join(rel,name));}else sources.add(rel);}
for(const rel of ['package.json','package-lock.json','main.cjs','preload.cjs','renderer','scripts','README.txt','LICENSE','THIRD-PARTY-NOTICES.txt','build/icon.png','build/icon.ico','vendor-sources'])collect(rel);
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json')));
for(const [rel,pkg]of Object.entries(lock.packages))if(rel.startsWith('node_modules/')&&!pkg.dev)collect(rel);
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(data){let c=0xffffffff;for(const byte of data)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
const output=path.join(root,'build/source.zip');fs.mkdirSync(path.dirname(output),{recursive:true});const fd=fs.openSync(output,'w');
let offset=0;const central=[];let count=0;
const now=new Date(),dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1),dosDate=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
function write(data){fs.writeSync(fd,data);offset+=data.length;}
for(const rel of [...sources].sort()){
  const name=Buffer.from('NP-HTML-Editor-'+require('../package.json').version+'-Source/'+rel.replace(/\\/g,'/'));
  const raw=fs.readFileSync(path.join(root,rel)),compressed=zlib.deflateRawSync(raw,{level:6}),crc=crc32(raw),start=offset;
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(dosTime,10);header.writeUInt16LE(dosDate,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(raw.length,22);header.writeUInt16LE(name.length,26);
  write(header);write(name);write(compressed);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(8,10);entry.writeUInt16LE(dosTime,12);entry.writeUInt16LE(dosDate,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(raw.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(start,42);central.push(entry,name);count++;
}
const centralStart=offset;for(const data of central)write(data);const centralSize=offset-centralStart;
const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(centralStart,16);write(end);fs.closeSync(fd);
console.log('Source archive: '+count+' files, '+Math.round(offset/1024/1024)+' MB');
