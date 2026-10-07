"""Fail release builds if DMG/ZIP extraction breaks the app's sealed resources."""
import json,pathlib,plistlib,subprocess,sys,tempfile
arch=sys.argv[1]
version=json.loads(pathlib.Path('package.json').read_text())['version']
root=pathlib.Path(tempfile.mkdtemp(prefix='np-container-test-'))
report={'arch':arch,'version':version,'containers':{}}
def run(args):
    return subprocess.run(args,check=True,capture_output=True,text=True,timeout=180)
for kind in ('dmg','zip'):
    archive=pathlib.Path('release')/f'NP-HTML-Editor-{version}-macOS-{arch}.{kind}'
    installed=root/kind
    installed.mkdir()
    if kind=='dmg':
        run(['hdiutil','verify',str(archive)])
        mount_data=subprocess.run(['hdiutil','attach','-readonly','-nobrowse','-plist',str(archive)],check=True,capture_output=True)
        mount=next(pathlib.Path(e['mount-point']) for e in plistlib.loads(mount_data.stdout)['system-entities'] if 'mount-point' in e)
        try:
            app=next(mount.glob('*.app'))
            run(['codesign','--verify','--deep','--strict','--verbose=2',str(app)])
            run(['ditto',str(app),str(installed/app.name)])
        finally:
            run(['hdiutil','detach',str(mount)])
    else:
        run(['ditto','-x','-k',str(archive),str(installed)])
    app=next(installed.glob('*.app'))
    run(['codesign','--verify','--deep','--strict','--verbose=2',str(app)])
    signature=run(['codesign','-dv','--verbose=4',str(app)])
    assessment=subprocess.run(['spctl','--assess','--type','execute','--verbose=4',str(app)],capture_output=True,text=True,timeout=120)
    policy=assessment.stdout+assessment.stderr
    assert 'a sealed resource is missing or invalid' not in policy,policy
    # Developer ID notarization is a separate gate: ad-hoc builds must never be
    # represented as Gatekeeper-approved merely because their seal is valid.
    report['containers'][kind]={'signature':'valid','signer':signature.stderr,'gatekeeper_exit':assessment.returncode,'gatekeeper_output':policy}
    with open(app/'Contents/Info.plist','rb') as f:info=plistlib.load(f)
    executable=app/'Contents/MacOS'/info['CFBundleExecutable']
    subprocess.run(['node','scripts/smoke-mac.cjs',str(executable)],check=True,timeout=180)
    print('PASS',arch,kind,'mounted/extracted signature, copied app, full editing smoke test',flush=True)
pathlib.Path('container-verification-'+arch+'.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
