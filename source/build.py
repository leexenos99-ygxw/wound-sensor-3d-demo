# -*- coding: utf-8 -*-
"""把 source/sn2_3d_mechanism.html（CDN / importmap 版）生成发布用单文件 ../index.html。

用法：
  python build.py            # 生成 ../index.html
  python build.py --check    # 只校验 index.html 与源是否一致，不写文件（不一致时退出码 1）

规则：source/sn2_3d_mechanism.html 是唯一可编辑对象；index.html 一律由本脚本生成，不要手改。
"""
import re, sys, os, pathlib

HERE = pathlib.Path(__file__).resolve().parent
SRC  = HERE / "sn2_3d_mechanism.html"
VEN  = HERE / "vendor"
OUT  = HERE.parent / "index.html"

three_umd = (VEN / "three.min.js").read_text(encoding='utf-8', errors='replace')
orbit     = (VEN / "OrbitControls.js").read_text(encoding='utf-8')
css2d     = (VEN / "CSS2DRenderer.js").read_text(encoding='utf-8')

import_re = re.compile(r"import\s*\{[^}]*\}\s*from\s*'three';", re.S)
export_re = re.compile(r"export\s*\{[^}]*\};", re.S)
orbit = export_re.sub("", import_re.sub("", orbit))
css2d = export_re.sub("", import_re.sub("", css2d))

html = SRC.read_text(encoding='utf-8')

m = re.search(r'(?s)<script type="module">(.*?)</script>', html)
if not m:
    sys.exit("错误：source/sn2_3d_mechanism.html 里找不到 <script type=\"module\"> 应用脚本")
app = m.group(1)
for line in ["import * as THREE from 'three';",
             "import {OrbitControls} from 'three/addons/controls/OrbitControls.js';",
             "import {CSS2DRenderer,CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';"]:
    app = app.replace(line, "")

html = re.sub(r'(?s)<script type="importmap">.*?</script>', "", html)

preamble = (
    "var EventDispatcher=THREE.EventDispatcher,MOUSE=THREE.MOUSE,Quaternion=THREE.Quaternion,"
    "Spherical=THREE.Spherical,TOUCH=THREE.TOUCH,Vector2=THREE.Vector2,Vector3=THREE.Vector3,"
    "Plane=THREE.Plane,Ray=THREE.Ray,MathUtils=THREE.MathUtils,Matrix4=THREE.Matrix4,Object3D=THREE.Object3D;\n"
)
# 注意：re.sub 的替换串必须用 lambda，直接传字符串会因 JS 里的反斜杠触发 bad escape
three_scripts = (
    "<script>\n" + three_umd + "\n</script>\n"
    "<script>\n" + preamble + "\n" + orbit + "\n" + css2d + "\n</script>\n"
    "<script>\n" + app + "\n</script>\n"
)
html = re.sub(r'(?s)<script type="module">.*?</script>', lambda _: three_scripts, html, count=1)

if "--check" in sys.argv:
    if not OUT.exists():
        sys.exit("错误：index.html 不存在，先运行 python build.py")
    built = html
    current = OUT.read_text(encoding='utf-8')
    if built == current:
        print("OK：index.html 与 source/sn2_3d_mechanism.html 完全一致")
        sys.exit(0)
    # 定位首个差异，便于排查
    i = next((k for k in range(min(len(built), len(current))) if built[k] != current[k]), min(len(built), len(current)))
    sys.exit("不一致：index.html 与源不同步（首个差异在第 %d 字符附近，源 %d 字节 / 成品 %d 字节）。"
             "请运行 python build.py 重新生成。" % (i, len(built.encode('utf-8')), len(current.encode('utf-8'))))
else:
    OUT.write_text(html, encoding='utf-8')
    print("已生成：%s（%d 字节）" % (OUT, len(html.encode('utf-8'))))
