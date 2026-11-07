# 可视化生物传感 · 3D 演示台

伤口感染快速预判检测方案配套的 3D 交互式演示页面，用于课程结课汇报。

## 在线演示

**https://leexenos99-ygxw.github.io/wound-sensor-3d-demo/**

## 这是什么

单文件 HTML 3D 演示台，包含两个可切换窗口：

1. **亲核反应窗口**：演示 SN2 亲核反应的分子轨道过程，对应敷料中酶促显色反应的化学机制类比。
2. **智能敷料分层窗口**：展示渗液接触层 → 比色反应层 → 荧光复核层 → 透气敷料层的结构剖面，以及渗液从伤口进入显色阵列的动态过程。

设计目标：在答辩时用 3D 交互直观说明"一份渗液如何在 6 秒内触发 pH / MPO / 细菌酶三条比色通道，并由荧光通道复核"。

## 技术栈

- 单文件 `index.html`，所有资源（Three.js、样式、脚本、模型贴图）均已内联或离线化
- 无构建步骤、无外部依赖、无需服务器
- 双击 `index.html` 即可在浏览器运行

## 本地运行

直接用浏览器打开 `index.html`，或在本目录启动任意静态服务器：

```bash
# 任选其一
python -m http.server 8000
npx serve .
```

然后访问 `http://localhost:8000`。

## 部署到 GitHub Pages

1. 新建仓库 `<你的用户名>/wound-sensor-3d-demo`
2. 把本目录的 `index.html` 和 `README.md` 推送到 `main` 分支
3. 仓库 Settings → Pages → Source 选 `main` 分支根目录
4. 等待约 1 分钟，访问 `https://<你的用户名>.github.io/wound-sensor-3d-demo/`

## 课程背景

内蒙古工业大学 · 可视化生物传感 · 结课汇报配套演示。

主报告 PPT 围绕"伤口感染快速预判检测"方案展开：以 pH 条、MPO 酶、细菌脂肪酶/蛋白酶为比色三通道，碳点荧光阵列做复核，内部质控位防止假阴性。

## 目录结构

```
wound-sensor-3d-demo/
├── index.html   # 单文件 3D 演示台（离线版）
└── README.md
```

## 许可证

课程作业演示用途，未开源。
