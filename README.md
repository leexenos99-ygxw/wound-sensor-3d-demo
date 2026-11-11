# 可视化生物传感 · 3D 演示台

伤口感染快速预判检测方案配套的 3D 交互式演示页面，用于课程结课汇报。

## 在线演示

**https://leexenos99-ygxw.github.io/wound-sensor-3d-demo/**

## 这是什么

单文件 HTML 3D 演示台，含三个可切换窗口：

1. **亲核反应**：演示 SN2 亲核取代的轨道过程，对应敷料中酶促显色反应的化学机制类比。
2. **智能敷料分层**：渗液接触层 → 比色反应层 → 荧光复核层 → 透气敷料的剖面，以及渗液从伤口进入六窗显色阵列的动态过程。
3. **分子组装**：自由搭建分子，成键后自动按构型整形（H₂O 104.5°、CH₄ 正四面体、CO₂ 直线），实时识别分子名称。

设计目标：在答辩时用 3D 交互直观说明“一份渗液如何触发 pH / MPO / 细菌酶三条比色通道，并由荧光通道复核”。

## 目录结构与文件角色（重要）

```
wound-sensor-3d-demo/
├── index.html                 # 发布用单文件，由 source/build.py 生成，不要手改
├── source/
│   ├── sn2_3d_mechanism.html  # ← 唯一可编辑对象（CDN / importmap 版源码）
│   ├── build.py               # 把源内联成 index.html，并带 --check 校验
│   └── vendor/                # three.min.js / OrbitControls / CSS2DRenderer
└── README.md
```

**改功能只改 `source/sn2_3d_mechanism.html`，然后重新生成 `index.html`。** 直接改 `index.html` 会在下次构建时被覆盖，改动会静默丢失。

## 改完怎么发

```bash
# 1) 改 source/sn2_3d_mechanism.html

# 2) 重新生成单文件
python source/build.py

# 3) 校验成品与源一致（不一致会报出首个差异位置）
python source/build.py --check

# 4) 提交
git add -A
git commit -m "feat: ..."
git push origin main
```

## 自检

页面内置 12 项几何断言（键角、键长、超价拒绝、删原子连带删键、分子识别），不依赖动画时序，可直接机器跑：

- 打开页面切到「分子组装」，点 Dock 上的「自检」；
- 或在地址后加 `?selftest=1`，打开即自动跑。

结果面板逐条显示 PASS / FAIL 与实测值。当前基线：H₂O 104.4°、NH₃ 107.0°×3、CH₄ 109.5°~109.5°、CO₂ 180.0°、Cl₂ 1.98 且抬到 y=1.50。

## 技术栈

- 发布物为单文件 `index.html`，Three.js、样式、脚本全部内联，无外部依赖
- 无运行时构建步骤，双击即可离线运行
- 源码为 ES Module + importmap 形式，构建时降级为 UMD 全局 `THREE`

## 本地运行

直接用浏览器打开 `index.html`，或在本目录启动静态服务器：

```bash
python -m http.server 8000
```

## 课程背景

内蒙古工业大学 · 可视化生物传感 · 结课汇报配套演示。

主报告 PPT 围绕“伤口感染快速预判检测”方案展开：以 pH 条、MPO 酶、细菌脂肪酶/蛋白酶为比色三通道，碳点荧光阵列做复核，内部质控位防止假阴性。

## 许可证

课程作业演示用途，未开源。
