"""Fail closed before packaging an unsigned, offline-capable device app."""

import json
import pathlib
import plistlib
import re
import subprocess
import sys


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def verify(products, expected_id):
    apps = sorted(products.glob('*.app'))
    require(len(apps) == 1, f'Expected one device app in {products}; found {apps}')
    app = apps[0]
    require(app.name == 'Blink.app', f'Unexpected app: {app.name}')
    with (app / 'Info.plist').open('rb') as stream:
        info = plistlib.load(stream)
    require(info.get('CFBundleIdentifier') == expected_id, 'Bundle ID mismatch')
    require(info.get('CFBundleShortVersionString') == '0.2.0', 'App version mismatch')
    require(info.get('CFBundlePackageType') == 'APPL', 'Not an application bundle')
    require(info.get('CFBundleSupportedPlatforms') == ['iPhoneOS'], 'Not an iPhoneOS app')
    require(info.get('DTPlatformName') == 'iphoneos', 'Simulator or unknown platform')
    require(info.get('DTSDKName', '').startswith('iphoneos'), 'Wrong SDK')
    require(1 in info.get('UIDeviceFamily', []), 'App does not support iPhone')
    executable = info.get('CFBundleExecutable', '')
    require(bool(executable) and pathlib.PurePath(executable).name == executable,
            'Invalid executable name')
    binary = app / executable
    require(binary.is_file(), 'App executable is missing')
    archs = subprocess.check_output(['xcrun', 'lipo', '-archs', str(binary)], text=True).split()
    require('arm64' in archs and all(a in {'arm64', 'arm64e'} for a in archs),
            f'Unexpected device architectures: {archs}')
    for arch in archs:
        build = subprocess.check_output(
            ['xcrun', 'vtool', '-arch', arch, '-show-build', str(binary)], text=True)
        platforms = re.findall(r'^\s*platform\s+(\S+)', build, re.MULTILINE)
        require(platforms == ['IOS'], f'{arch} is not a physical iOS binary: {platforms}')
    require((app / 'main.jsbundle').is_file() and (app / 'main.jsbundle').stat().st_size > 0,
            'Embedded production JS bundle is missing (Metro must not be required)')
    require((app / 'Assets.car').is_file() and (app / 'Assets.car').stat().st_size > 0,
            'Compiled app icon / native asset catalog is missing')
    assets = [p for p in (app / 'assets').rglob('*') if p.is_file() and p.stat().st_size > 0]
    require(bool(assets), 'Expo/Metro static assets are missing')
    require(any(p.suffix.lower() == '.ttf' for p in assets), 'Bundled icon fonts are missing')
    # Check the whole app, including nested frameworks/resource bundles.
    for path in app.rglob('*'):
        if not path.is_file():
            continue
        name = path.name.lower()
        require(not (name == '.env' or name.startswith('.env.') or
                     path.suffix.lower() in {'.db', '.sqlite', '.sqlite3', '.p8', '.p12',
                                             '.pem', '.key', '.mobileprovision'} or
                     name.endswith(('.db-wal', '.db-shm', '.sqlite-wal', '.sqlite-shm')) or
                     name == 'credentials.json'), f'Unexpected sensitive/data file: {path}')
    print(json.dumps({
        'app': app.name, 'bundleIdentifier': expected_id,
        'version': info['CFBundleShortVersionString'], 'architectures': archs,
        'minimumOSVersion': info.get('MinimumOSVersion'), 'staticAssetCount': len(assets),
        'embeddedJSBytes': (app / 'main.jsbundle').stat().st_size,
    }, indent=2))


if __name__ == '__main__':
    require(len(sys.argv) == 3, 'Usage: verify-ios-app.py RELEASE_IPHONEOS_DIR BUNDLE_ID')
    configured_id = json.loads(pathlib.Path('app.json').read_text(encoding='utf-8'))['expo']['ios']['bundleIdentifier']
    require(sys.argv[2] == configured_id, 'Workflow Bundle ID differs from app.json')
    verify(pathlib.Path(sys.argv[1]), sys.argv[2])
