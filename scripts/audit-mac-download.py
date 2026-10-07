"""Audit the actual released DMG on a fresh macOS runner, without bypassing Gatekeeper."""
import hashlib,json,pathlib,plistlib,subprocess,sys,tempfile,urllib.request,time
arch=sys.argv[1]
expected={'arm64':'cf256d615efe2440780caf03d3d6b045fa0d70e940571849057b4878925cb7b7','x64':'e06d5a84d1aa4b6b2fa373d4b4e73ff8c855f095e5b8ccfb8677123c4020a48c'}
root=pathlib.Path(tempfile.mkdtemp(prefix='np-distribution-audit-'))
url=f'https://github.com/Kwon-Sungeon/np-html-editor/releases/download/v1.1.0-macos/NP-HTML-Editor-1.1.0-macOS-{arch}.dmg'
dmg=root/'download.dmg'
urllib.request.urlretrieve(url,dmg)
digest=hashlib.sha256(dmg.read_bytes()).hexdigest()
assert digest==expected[arch], 'Downloaded DMG checksum mismatch'
report={'arch':arch,'sha256':digest,'checks':{}}
def check(name,args):
    r=subprocess.run(args,capture_output=True,text=True,timeout=120)
    report['checks'][name]={'exit':r.returncode,'output':r.stdout+r.stderr}
    print(name, r.returncode, r.stdout+r.stderr,flush=True)
    return r
assert check('dmg-integrity',['hdiutil','verify',str(dmg)]).returncode==0
mounted=subprocess.run(['hdiutil','attach','-readonly','-nobrowse','-plist',str(dmg)],check=True,capture_output=True)
mount=next(pathlib.Path(e['mount-point']) for e in plistlib.loads(mounted.stdout)['system-entities'] if 'mount-point' in e)
try:
    app=next(mount.glob('*.app'))
    check('signature-in-dmg',['codesign','--verify','--deep','--strict','--verbose=2',str(app)])
    dest=root/'installed'/app.name
    dest.parent.mkdir()
    subprocess.run(['ditto',str(app),str(dest)],check=True)
    check('signature-after-copy',['codesign','--verify','--deep','--strict','--verbose=2',str(dest)])
    check('signer',['codesign','-dv','--verbose=4',str(dest)])
    check('gatekeeper',['spctl','--assess','--type','execute','--verbose=4',str(dest)])
    check('notarization-ticket',['xcrun','stapler','validate',str(dest)])
    # Mark only this disposable test copy as browser-downloaded. Do not clear
    # quarantine, disable Gatekeeper, or launch around a failed policy check.
    subprocess.run(['xattr','-w','com.apple.quarantine',f'0083;{int(time.time()):x};Chrome;',str(dest)],check=True)
    check('download-quarantine',['xattr','-p','com.apple.quarantine',str(dest)])
    check('gatekeeper-after-quarantine',['spctl','--assess','--type','execute','--verbose=4',str(dest)])
    check('distribution-policy',['syspolicy_check','distribution',str(dest)])
finally:
    subprocess.run(['hdiutil','detach',str(mount)],check=True)
pathlib.Path('audit-'+arch+'.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
