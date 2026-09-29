"""
重新打包 deploy.zip（EdgeOne Pages 上传用）
用法：python pack_deploy.py
生成 deploy.zip，内含站点文件，路径用正斜杠（跨平台兼容）。
"""
import zipfile
import os

# 以脚本所在目录为站点根
SRC = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(SRC, 'deploy.zip')

items = ['index.html', 'calculator.html', 'guides.html', 'manifest.json', 'service-worker.js', 'edgeone.json', 'assets']

if os.path.exists(OUT):
    os.remove(OUT)

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zf:
    for item in items:
        full = os.path.join(SRC, item)
        if os.path.isfile(full):
            zf.write(full, arcname=item)
        elif os.path.isdir(full):
            for root, dirs, files in os.walk(full):
                for f in files:
                    abs_path = os.path.join(root, f)
                    rel = os.path.relpath(abs_path, SRC).replace('\\', '/')
                    zf.write(abs_path, arcname=rel)

with zipfile.ZipFile(OUT, 'r') as zf:
    names = zf.namelist()
    bad = [n for n in names if '\\' in n]
    print(f'deploy.zip: {os.path.getsize(OUT)} bytes, {len(names)} entries')
    if bad:
        print(f'WARN backslash paths: {bad}')
    else:
        print('OK: all forward-slash paths')
