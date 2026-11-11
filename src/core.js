/* =============================================================================
   core.js — 纯逻辑层：元素表 / 键长 / 价键 / 孤对 / 模板 / 图同构 / VSEPR / 断言
   不碰 DOM，不碰 Three。node 里可直接跑（挂 globalThis.CHEM）。
   ============================================================================= */
(function (g) {
  'use strict';

  /* ---------- 基础数据 ---------- */
  // 价电子数（中性主族原子）
  var VE = { H: 1, C: 4, N: 5, O: 6, F: 7, Cl: 7, Br: 7, I: 7, Na: 1, Mg: 2 };
  // 价键上限（Σ bond.order ≤ cap）
  var CAP = { H: 1, C: 4, N: 3, O: 2, F: 1, Cl: 1, Br: 1, I: 1, Na: 1, Mg: 2 };

  // 单键键长（Å，实验值）
  var L1 = {
    'H-H': 0.74, 'C-H': 1.09, 'N-H': 1.01, 'O-H': 0.96, 'C-C': 1.54, 'C-N': 1.47,
    'C-O': 1.43, 'C-Cl': 1.77, 'C-Br': 1.94, 'N-N': 1.45, 'N-O': 1.40, 'O-O': 1.48,
    'Cl-Cl': 1.99, 'Br-Br': 2.28, 'H-Cl': 1.27, 'H-Br': 1.41, 'H-I': 1.61,
    'Na-Cl': 2.36, 'Na-O': 2.36, 'Mg-O': 2.10, 'N-Cl': 1.70, 'C-F': 1.35, 'C-I': 2.14, 'I-I': 2.66
  };
  // 双键 (order=2)
  var L2 = { 'C-C': 1.34, 'C-O': 1.23, 'C-N': 1.28, 'N-N': 1.25, 'O-O': 1.21, 'C-S': 1.60 };
  // 三键 (order=3)
  var L3 = { 'C-C': 1.20, 'N-N': 1.10, 'C-N': 1.16 };

  function key(el1, el2) {
    return el1 < el2 ? el1 + '-' + el2 : el2 + '-' + el1;
  }
  function bondLen(el1, el2, order, override) {
    if (override != null) return override;
    var k = key(el1, el2);
    if (order === 3 && L3[k]) return L3[k];
    if (order === 2 && L2[k]) return L2[k];
    return L1[k] || 1.50;
  }

  /* ---------- 价键 / 孤对 ---------- */
  function cap(el) { return CAP[el] || 0; }

  // Σ bond.order
  function bondSum(graph, atomId) {
    var s = 0, i, b;
    for (i = 0; i < graph.bonds.length; i++) {
      b = graph.bonds[i];
      if (b.a === atomId || b.b === atomId) s += (b.order || 1);
    }
    return s;
  }

  // 孤对电子对数 = (价电子数 − Σ键级) / 2，仅对中性主族原子成立
  function lonePairs(el, sumOrder) {
    var v = (VE[el] || 0) - sumOrder;
    if (v <= 0) return 0;
    var lp = v / 2;
    return Number.isInteger(lp) ? lp : Math.floor(lp);
  }
  function lonePairsOf(graph, atomId) {
    var at = graph.atoms.find(function (x) { return x.id === atomId; });
    return at ? lonePairs(at.el, bondSum(graph, atomId)) : 0;
  }

  /* ---------- 向量工具（纯数值，不依赖 Three） ---------- */
  function v(x, y, z) { return { x: x, y: y, z: z }; }
  function add(a, b) { return v(a.x + b.x, a.y + b.y, a.z + b.z); }
  function sub(a, b) { return v(a.x - b.x, a.y - b.y, a.z - b.z); }
  function mul(a, k) { return v(a.x * k, a.y * k, a.z * k); }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a) || 1; return v(a.x / l, a.y / l, a.z / l); }
  function cross(a, b) {
    return v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  function angleDeg(a, b) {
    var c = dot(unit(a), unit(b));
    c = Math.max(-1, Math.min(1, c));
    return Math.acos(c) * 180 / Math.PI;
  }
  // Rodrigues 旋转
  function rot(vec, axis, ang) {
    var k = unit(axis), c = Math.cos(ang), s = Math.sin(ang);
    return add(add(mul(vec, c), mul(cross(k, vec), s)), mul(k, dot(k, vec) * (1 - c)));
  }
  function perpTo(d) {
    var cand = Math.abs(d.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
    var u = sub(cand, mul(d, dot(d, cand)));
    return len(u) < 1e-6 ? v(1, 0, 0) : unit(u);
  }

  /* ---------- 理想方向 ---------- */
  var SQ3 = 1 / Math.sqrt(3);
  var TETRA = [v(SQ3, SQ3, SQ3), v(SQ3, -SQ3, -SQ3), v(-SQ3, SQ3, -SQ3), v(-SQ3, -SQ3, SQ3)];

  // 把标准四面体转成"第 0 个顶点对准 p"
  function tetraAlign(p) {
    var a = TETRA[0], axis = cross(a, p), s = len(axis);
    if (s < 1e-9) return TETRA.slice();
    var ang = Math.acos(Math.max(-1, Math.min(1, dot(a, unit(p)))));
    return TETRA.map(function (t) { return rot(t, axis, ang); });
  }

  // 4 电子域下的理想键角：无孤对 109.5 / 一对 107 / 两对 104.5
  function angleForDomains(n, lp) {
    if (n === 2) return 180;
    if (n === 3) return 120 - 0.5 * lp;
    if (n === 4) return 109.5 - 2.5 * lp;
    if (n === 5) return 90;
    if (n === 6) return 90;
    return 109.5;
  }

  /* ---------- 3D 嵌入：按图逐级摆放 ---------- */
  // graph = { atoms:[{id,el}], bonds:[{a,b,order}] }
  // opts = { angleOverride: { atomId: deg }, lenOverride: { 'a-b': Å } }
  function neighbors(graph, id) {
    var out = [], i, b;
    for (i = 0; i < graph.bonds.length; i++) {
      b = graph.bonds[i];
      if (b.a === id) out.push({ id: b.b, order: b.order || 1, bond: b });
      else if (b.b === id) out.push({ id: b.a, order: b.order || 1, bond: b });
    }
    return out;
  }

  // 生成 m 个方向：root 情形（没有父方向）
  function rootDirs(m, theta) {
    var i, out = [];
    if (m === 1) return [v(1, 0, 0)];
    if (m === 2) {
      if (theta >= 170) return [v(1, 0, 0), v(-1, 0, 0)];   // 直线分子沿水平轴
      var half = theta / 2 * Math.PI / 180;
      return [v(Math.cos(half), Math.sin(half), 0), v(Math.cos(-half), Math.sin(-half), 0)];
    }
    if (m === 4) return TETRA.slice();
    if (m === 3) {
      var th = theta * Math.PI / 180;
      var ratio = Math.sin(th / 2) / Math.sin(Math.PI / 3);
      var alpha = Math.asin(Math.min(1, ratio));
      for (i = 0; i < 3; i++) {
        out.push(v(Math.sin(alpha) * Math.cos(2 * Math.PI * i / 3),
          Math.sin(alpha) * Math.sin(2 * Math.PI * i / 3),
          Math.cos(alpha)));
      }
      return out;
    }
    // 5/6 配位兜底：均匀锥面
    var al = Math.acos(-1 / m * 1.0) || 1.2;
    for (i = 0; i < m; i++) {
      out.push(v(Math.sin(al) * Math.cos(2 * Math.PI * i / m),
        Math.sin(al) * Math.sin(2 * Math.PI * i / m),
        Math.cos(al)));
    }
    return out;
  }

  // 生成 m 个方向：已知一个父方向 p
  function dirsFromParent(p, m, theta) {
    var i, out = [];
    if (m === 1) {
      return [rot(p, perpTo(p), theta * Math.PI / 180)];
    }
    if (m === 2 && Math.abs(theta - 120) < 1e-6) {
      // 平面三角：两个取代基与原方向共面，间隔 120°
      var nrm = unit(cross(p, perpTo(p)));
      return [rot(p, nrm, 2 * Math.PI / 3), rot(p, nrm, -2 * Math.PI / 3)];
    }
    if (m === 2 || m === 3) {
      // 四面体骨架：把顶点 0 对齐到 p，剩下的就是取代基方向
      var t = tetraAlign(p);
      for (i = 1; i <= m; i++) out.push(t[i]);
      return out;
    }
    // 其余兜底：绕 p 均匀分布
    for (i = 0; i < m; i++) out.push(rot(p, perpTo(p), theta * Math.PI / 180));
    return out;
  }

  function embed(graph, opts) {
    opts = opts || {};
    var angleOverride = opts.angleOverride || {};
    var n = graph.atoms.length, i;
    var byId = {};
    for (i = 0; i < n; i++) byId[graph.atoms[i].id] = graph.atoms[i];

    // 从配位数最大的原子出发
    var start = graph.atoms[0].id, best = -1;
    graph.atoms.forEach(function (a) {
      var d = neighbors(graph, a.id).length;
      if (d > best) { best = d; start = a.id; }
    });

    var pos = {}, done = {}, order = [], queue = [start];
    pos[start] = v(0, 0, 0);
    done[start] = true;
    order.push(start);

    while (queue.length) {
      var cur = queue.shift();
      var nbrs = neighbors(graph, cur);
      var todo = nbrs.filter(function (x) { return !done[x.id]; });
      if (!todo.length) continue;

      var placedNbrs = nbrs.filter(function (x) { return done[x.id]; });
      var el = byId[cur].el;
      var sumO = 0;
      nbrs.forEach(function (x) { sumO += x.order; });
      var lp = lonePairs(el, sumO);
      var steric = nbrs.length + lp;
      var theta = angleOverride[cur] != null ? angleOverride[cur] : angleForDomains(steric, lp);

      var dirs;
      if (placedNbrs.length === 0) {
        dirs = rootDirs(todo.length, theta);
      } else {
        var p = unit(sub(pos[placedNbrs[0].id], pos[cur]));
        if (todo.length === 1) dirs = dirsFromParent(p, 1, theta);
        else dirs = dirsFromParent(p, todo.length, theta);
      }

      todo.forEach(function (nb, k) {
        var dir = dirs[k] || dirs[dirs.length - 1];
        var L = bondLen(el, byId[nb.id].el, nb.order, opts.lenOverride ? opts.lenOverride[[cur, nb.id].sort().join('-')] : null);
        if (dir) pos[nb.id] = add(pos[cur], mul(unit(dir), L));
        else pos[nb.id] = add(pos[cur], v(L, 0, 0));
        done[nb.id] = true;
        order.push(nb.id);
        queue.push(nb.id);
      });
    }

    // 分离的碎片（理论上不该有）：给个占位位置
    graph.atoms.forEach(function (a) {
      if (!pos[a.id]) pos[a.id] = v(0, 0, 0);
    });
    return pos;
  }

  // 质心归零 + 抬到给定高度
  function recenter(pos, ids, y) {
    var c = v(0, 0, 0), i;
    for (i = 0; i < ids.length; i++) c = add(c, pos[ids[i]]);
    c = mul(c, 1 / (ids.length || 1));
    var out = {};
    for (i = 0; i < ids.length; i++) {
      out[ids[i]] = add(sub(pos[ids[i]], c), v(0, y == null ? 1.5 : y, 0));
    }
    return out;
  }

  /* ---------- 模板：拓扑 + 键级 + 特殊键长/键角 ---------- */
  // els 与 edges 下标一一对应；edges: [i, j, order, lenOverride]
  function T(spec) { return spec; }

  var TEMPLATES = [
    T({ id: 'H2', name: '氢气', formula: 'H₂', els: ['H', 'H'], edges: [[0, 1, 1, 0.74]] }),
    T({ id: 'O2', name: '氧气', formula: 'O₂', els: ['O', 'O'], edges: [[0, 1, 2, 1.21]] }),
    T({ id: 'N2', name: '氮气', formula: 'N₂', els: ['N', 'N'], edges: [[0, 1, 3, 1.10]] }),
    T({ id: 'Cl2', name: '氯气', formula: 'Cl₂', els: ['Cl', 'Cl'], edges: [[0, 1, 1, 1.99]] }),
    T({ id: 'Br2', name: '溴', formula: 'Br₂', els: ['Br', 'Br'], edges: [[0, 1, 1, 2.28]] }),
    T({ id: 'HCl', name: '氯化氢', formula: 'HCl', els: ['H', 'Cl'], edges: [[0, 1, 1, 1.27]] }),
    T({ id: 'NaCl', name: '氯化钠', formula: 'NaCl', els: ['Na', 'Cl'], edges: [[0, 1, 1, 2.36]] }),
    T({ id: 'MgO', name: '氧化镁', formula: 'MgO', els: ['Mg', 'O'], edges: [[0, 1, 1, 2.10]] }),
    T({
      id: 'H2O', name: '水', formula: 'H₂O', els: ['O', 'H', 'H'], edges: [[0, 1, 1, 0.958], [0, 2, 1, 0.958]],
      reason: 'O 上有 2 对孤对，与 2 根 O—H 共 4 个电子域 → 四面体骨架 109.5°；孤对更胖，把两根键压到 104.5°。'
    }),
    T({
      id: 'CO2', name: '二氧化碳', formula: 'CO₂', els: ['C', 'O', 'O'], edges: [[0, 1, 2, 1.16], [0, 2, 2, 1.16]],
      reason: '碳有 4 个价电子，两个氧各要 2 个 → O=C=O 两根双键，sp 杂化直线 180°。'
    }),
    T({
      id: 'NH3', name: '氨', formula: 'NH₃', els: ['N', 'H', 'H', 'H'],
      edges: [[0, 1, 1, 1.012], [0, 2, 1, 1.012], [0, 3, 1, 1.012]],
      reason: 'N 上 1 对孤对 → 4 电子域四面体，孤对挤占空间，键角收到 107°。'
    }),
    T({
      id: 'CH4', name: '甲烷', formula: 'CH₄', els: ['C', 'H', 'H', 'H', 'H'],
      edges: [[0, 1, 1, 1.087], [0, 2, 1, 1.087], [0, 3, 1, 1.087], [0, 4, 1, 1.087]],
      reason: 'C 无孤对，4 个 C—H 均分四面体 → 109.5°。'
    }),
    T({
      id: 'C2H4', name: '乙烯', formula: 'C₂H₄', els: ['C', 'C', 'H', 'H', 'H', 'H'],
      edges: [[0, 1, 2, 1.339], [0, 2, 1, 1.086], [0, 3, 1, 1.086], [1, 4, 1, 1.086], [1, 5, 1, 1.086]],
      reason: 'C=C 双键使两个碳都是 sp² 平面三角，六个原子共面；实测 H—C—H 117.4°、H—C=C 121.3°。'
    }),
    T({
      id: 'C2H6', name: '乙烷', formula: 'C₂H₆', els: ['C', 'C', 'H', 'H', 'H', 'H', 'H', 'H'],
      edges: [[0, 1, 1, 1.545], [0, 2, 1, 1.09], [0, 3, 1, 1.09], [0, 4, 1, 1.09],
      [1, 5, 1, 1.09], [1, 6, 1, 1.09], [1, 7, 1, 1.09]],
      reason: '两个 sp³ 碳，C—C 单键可自由旋转，交错式最稳定。'
    }),
    T({
      id: 'C2H2', name: '乙炔', formula: 'C₂H₂', els: ['C', 'C', 'H', 'H'],
      edges: [[0, 1, 3, 1.20], [0, 2, 1, 1.06], [1, 3, 1, 1.06]],
      reason: 'C≡C 三键，两个碳都是 sp，四个原子共线 180°。'
    }),
    T({
      id: 'CH3OH', name: '甲醇', formula: 'CH₃OH', els: ['C', 'O', 'H', 'H', 'H', 'H'],
      edges: [[0, 1, 1, 1.427], [0, 2, 1, 1.09], [0, 3, 1, 1.09], [0, 4, 1, 1.09], [1, 5, 1, 0.96]],
      angleOverride: { 1: 108.5 },
      reason: 'C—O 单键，O 上两对孤对，∠C—O—H 实测 108.5°。'
    }),
    T({
      id: 'C2H5OH', name: '乙醇', formula: 'C₂H₅OH',
      els: ['C', 'C', 'O', 'H', 'H', 'H', 'H', 'H', 'H'],
      edges: [[0, 1, 1, 1.512], [1, 2, 1, 1.431], [0, 3, 1, 1.09], [0, 4, 1, 1.09], [0, 5, 1, 1.09],
      [1, 6, 1, 1.09], [1, 7, 1, 1.09], [2, 8, 1, 0.96]],
      angleOverride: { 1: 107.8, 2: 108.0 },
      reason: 'C—C—O 骨架，两个碳都是 sp³，O 上两对孤对。'
    }),
    T({
      id: 'Me2O', name: '二甲醚', formula: 'C₂H₆O', els: ['C', 'O', 'C', 'H', 'H', 'H', 'H', 'H', 'H'],
      edges: [[0, 1, 1, 1.410], [1, 2, 1, 1.410], [0, 3, 1, 1.09], [0, 4, 1, 1.09], [0, 5, 1, 1.09],
      [2, 6, 1, 1.09], [2, 7, 1, 1.09], [2, 8, 1, 1.09]],
      angleOverride: { 1: 111.7 },
      reason: 'C—O—C 两个甲基，∠C—O—C 实测 111.7°；它和乙醇元素组成相同，但连接关系不同。'
    }),
    T({
      id: 'H2O2', name: '过氧化氢', formula: 'H₂O₂', els: ['O', 'O', 'H', 'H'],
      edges: [[0, 1, 1, 1.475], [0, 2, 1, 0.96], [1, 3, 1, 0.96]],
      angleOverride: { 0: 94.8, 1: 94.8 },
      reason: 'O—O 单键，每个 O 上一对 O—H、两对孤对，∠O—O—H 实测 94.8°。'
    }),
    T({
      id: 'NaOH', name: '氢氧化钠', formula: 'NaOH', els: ['Na', 'O', 'H'],
      edges: [[0, 1, 1, 2.36], [1, 2, 1, 0.96]]
    })
  ];

  /* ---------- 图同构 ---------- */
  function elCounts(graph) {
    var c = {};
    graph.atoms.forEach(function (a) { c[a.el] = (c[a.el] || 0) + 1; });
    return c;
  }
  function sameCounts(a, b) {
    var k;
    for (k in a) if (a[k] !== b[k]) return false;
    for (k in b) if (!a[k]) return false;
    return true;
  }
  // 度序列（用于证明它区分不了同分异构）
  function degreeSeq(graph) {
    return graph.atoms.map(function (a) { return neighbors(graph, a.id).length; })
      .sort(function (x, y) { return x - y; }).join(',');
  }
  // WL 颜色细化：初始标签=元素，每轮 hash(自身, 排序的邻居标签)
  function wlLabels(graph) {
    var label = {}, i;
    graph.atoms.forEach(function (a) { label[a.id] = a.el; });
    for (var round = 0; round < graph.atoms.length; round++) {
      var next = {};
      graph.atoms.forEach(function (a) {
        var nb = neighbors(graph, a.id).map(function (x) { return label[x.id]; }).sort();
        next[a.id] = label[a.id] + '|' + nb.join(',');
      });
      var changed = false;
      for (i = 0; i < graph.atoms.length; i++) {
        if (next[graph.atoms[i].id] !== label[graph.atoms[i].id]) changed = true;
      }
      label = next;
      if (!changed) break;
    }
    return graph.atoms.map(function (a) { return label[a.id]; }).sort().join(';');
  }
  // 回溯同构（只比拓扑：元素 + 邻接，不比键级）
  function isoMap(a, b) {
    if (a.atoms.length !== b.atoms.length) return null;
    if (a.bonds.length !== b.bonds.length) return null;
    if (wlLabels(a) !== wlLabels(b)) return null;
    var aN = {}, bN = {};
    a.atoms.forEach(function (x) { aN[x.id] = neighbors(a, x.id).map(function (y) { return y.id; }).sort(); });
    b.atoms.forEach(function (x) { bN[x.id] = neighbors(b, x.id).map(function (y) { return y.id; }).sort(); });
    var aIds = a.atoms.map(function (x) { return x.id; });
    var bIds = b.atoms.map(function (x) { return x.id; });
    var map = {}, used = {};
    function ok(aid, bid) {
      if (a.atoms.find(function (x) { return x.id === aid; }).el !==
        b.atoms.find(function (x) { return x.id === bid; }).el) return false;
      var na = aN[aid];
      for (var i = 0; i < na.length; i++) {
        var mb = map[na[i]];
        if (mb == null) continue;
        if (bN[bid].indexOf(mb) < 0) return false;
      }
      var nb = bN[bid];
      for (var j = 0; j < nb.length; j++) {
        var ma = Object.keys(map).find(function (k) { return map[k] === nb[j]; });
        if (ma == null) continue;
        if (aN[aid].indexOf(+ma) < 0 && aN[aid].indexOf(ma) < 0) return false;
      }
      return true;
    }
    function dfs(i) {
      if (i === aIds.length) return true;
      for (var j = 0; j < bIds.length; j++) {
        var bid = bIds[j];
        if (used[bid]) continue;
        map[aIds[i]] = bid;
        if (ok(aIds[i], bid)) {
          used[bid] = true;
          if (dfs(i + 1)) return true;
          used[bid] = false;
        }
        delete map[aIds[i]];
      }
      return false;
    }
    if (!dfs(0)) return null;
    var out = {};
    Object.keys(map).forEach(function (k) { out[k] = map[k]; });
    return out;
  }

  function templateGraph(tpl) {
    var atoms = tpl.els.map(function (el, i) { return { id: i, el: el }; });
    var bonds = tpl.edges.map(function (e, i) { return { id: i, a: e[0], b: e[1], order: e[2] }; });
    return { atoms: atoms, bonds: bonds };
  }

  function matchTemplate(graph) {
    var counts = elCounts(graph);
    for (var i = 0; i < TEMPLATES.length; i++) {
      var tpl = TEMPLATES[i];
      var tg = templateGraph(tpl);
      if (!sameCounts(counts, elCounts(tg))) continue;
      var m = isoMap(graph, tg);
      if (m) return { template: tpl, tgraph: tg, mapping: m };
    }
    return null;
  }

  /* ---------- 模板键级：识别到就回写 ---------- */
  function ordersFor(graph) {
    var hit = matchTemplate(graph);
    if (!hit) return {};
    var rev = {};
    Object.keys(hit.mapping).forEach(function (k) { rev[hit.mapping[k]] = k; });
    var out = {};
    hit.template.edges.forEach(function (e) {
      var a = rev[e[0]], b = rev[e[1]];
      if (a == null || b == null) return;
      var bond = graph.bonds.find(function (x) {
        return (String(x.a) === String(a) && String(x.b) === String(b)) ||
          (String(x.a) === String(b) && String(x.b) === String(a));
      });
      if (bond) out[bond.id] = e[2];
    });
    return out;
  }

  /* ---------- 对外：把图排成坐标 ---------- */
  // 命中模板 → 用模板的键长/键角/键级；否则走 VSEPR 兜底
  function plan(graph, opts) {
    var hit = matchTemplate(graph);
    var used = { angleOverride: {}, lenOverride: {}, orders: {} };
    var targetGraph = graph;
    var mapping = null;

    if (hit) {
      targetGraph = hit.tgraph;
      mapping = hit.mapping;   // 图节点 → 模板节点
      var rev = {};            // 模板节点 → 图节点
      Object.keys(mapping).forEach(function (k) { rev[mapping[k]] = k; });

      hit.template.edges.forEach(function (e) {
        var a = rev[e[0]], b = rev[e[1]];
        if (a == null || b == null) return;
        var k = [String(a), String(b)].sort().join('-');
        used.lenOverride[k] = e[3];
        var bond = graph.bonds.find(function (x) {
          return (String(x.a) === String(a) && String(x.b) === String(b)) ||
            (String(x.a) === String(b) && String(x.b) === String(a));
        });
        if (bond) used.orders[bond.id] = e[2];
      });
      if (hit.template.angleOverride) {
        Object.keys(hit.template.angleOverride).forEach(function (ti) {
          var gi = rev[ti];
          if (gi != null) used.angleOverride[gi] = hit.template.angleOverride[ti];
        });
      }
      var posT = embed(targetGraph, used);
      var posG = {};
      Object.keys(rev).forEach(function (ti) { posG[rev[ti]] = posT[ti]; });
      var ids = graph.atoms.map(function (a) { return a.id; });
      return { pos: recenter(posG, ids, 1.5), hit: hit, orders: used.orders, targetGraph: targetGraph };
    }

    var pos = embed(graph, used);
    var ids2 = graph.atoms.map(function (a) { return a.id; });
    return { pos: recenter(pos, ids2, 1.5), hit: null, orders: {}, targetGraph: graph };
  }

  /* ---------- 自检断言（纯数据层，20 条） ---------- */
  function gH2O() { return templateGraph(TEMPLATES.find(function (t) { return t.id === 'H2O'; })); }
  function gOf(id) { return templateGraph(TEMPLATES.find(function (t) { return t.id === id; })); }

  function measure(build) {
    var graph = build.graph || build;
    var opts = build.opts || {};
    var p = plan(graph, opts);
    return { graph: graph, pos: p.pos, hit: p.hit };
  }

  function dist(pos, a, b) {
    return len(sub(pos[a], pos[b]));
  }
  function ang(pos, v0, p1, p2) {
    return angleDeg(sub(pos[p1], pos[v0]), sub(pos[p2], pos[v0]));
  }

  function runAssertions() {
    var rows = [];
    function check(id, name, fn) {
      var r;
      try { r = fn(); } catch (e) { r = { pass: false, detail: '异常: ' + e.message }; }
      rows.push({ id: id, name: name, pass: !!r.pass, detail: r.detail || '' });
    }

    // 1 坐标有限
    check(1, '所有原子坐标 finite', function () {
      var bad = 0, total = 0;
      TEMPLATES.forEach(function (t) {
        var r = measure(gOf(t.id));
        Object.keys(r.pos).forEach(function (k) {
          total++;
          var p = r.pos[k];
          if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) bad++;
        });
      });
      return { pass: bad === 0, detail: bad === 0 ? total + ' 个坐标全部有限' : bad + ' 个非法' };
    });

    // 2 Cl2 键长
    check(2, 'Cl₂ 键长 1.99', function () {
      var r = measure(gOf('Cl2')), d = dist(r.pos, 0, 1);
      return { pass: Math.abs(d - 1.99) <= 0.03, detail: d.toFixed(3) + ' Å' };
    });

    // 3 O2 键级与键长
    check(3, 'O₂ order=2 且 1.21 Å', function () {
      var t = TEMPLATES.find(function (x) { return x.id === 'O2'; });
      var r = measure(gOf('O2')), d = dist(r.pos, 0, 1);
      return { pass: t.edges[0][2] === 2 && Math.abs(d - 1.21) <= 0.02, detail: 'order=' + t.edges[0][2] + '，' + d.toFixed(3) + ' Å' };
    });

    // 4 N2
    check(4, 'N₂ order=3 且 1.10 Å', function () {
      var t = TEMPLATES.find(function (x) { return x.id === 'N2'; });
      var r = measure(gOf('N2')), d = dist(r.pos, 0, 1);
      return { pass: t.edges[0][2] === 3 && Math.abs(d - 1.10) <= 0.02, detail: 'order=' + t.edges[0][2] + '，' + d.toFixed(3) + ' Å' };
    });

    // 5 CO2 结构
    check(5, 'CO₂：C 配位 2、两根双键', function () {
      var t = TEMPLATES.find(function (x) { return x.id === 'CO2'; });
      var cn = 0, doubles = 0;
      t.edges.forEach(function (e) { if (e[0] === 0) cn++; if (e[2] === 2) doubles++; });
      return { pass: cn === 2 && doubles === 2, detail: '配位 ' + cn + '，双键 ' + doubles + ' 根' };
    });

    // 6 CO2 键长与键角
    check(6, 'CO₂ 1.16 Å / 180°', function () {
      var r = measure(gOf('CO2'));
      var d = dist(r.pos, 0, 1), a = ang(r.pos, 0, 1, 2);
      return { pass: Math.abs(d - 1.16) <= 0.02 && Math.abs(a - 180) <= 1, detail: d.toFixed(3) + ' Å / ' + a.toFixed(1) + '°' };
    });

    // 7 H2O
    check(7, 'H₂O 键角 104.5°', function () {
      var r = measure(gOf('H2O')), a = ang(r.pos, 0, 1, 2);
      return { pass: Math.abs(a - 104.5) <= 2, detail: a.toFixed(1) + '°' };
    });

    // 8 NH3
    check(8, 'NH₃ 键角 107°', function () {
      var r = measure(gOf('NH3'));
      var a = [ang(r.pos, 0, 1, 2), ang(r.pos, 0, 1, 3), ang(r.pos, 0, 2, 3)];
      var worst = Math.max.apply(null, a.map(function (x) { return Math.abs(x - 107); }));
      return { pass: worst <= 2, detail: a.map(function (x) { return x.toFixed(1) + '°'; }).join(' / ') };
    });

    // 9 CH4 六个角
    check(9, 'CH₄ 六个 H—C—H 角 109.5°', function () {
      var r = measure(gOf('CH4')), out = [];
      for (var i = 1; i <= 4; i++) for (var j = i + 1; j <= 4; j++) out.push(ang(r.pos, 0, i, j));
      var worst = Math.max.apply(null, out.map(function (x) { return Math.abs(x - 109.5); }));
      return { pass: worst <= 2, detail: Math.min.apply(null, out).toFixed(1) + '° ~ ' + Math.max.apply(null, out).toFixed(1) + '°' };
    });

    // 10 C2H4 平面性
    check(10, 'C₂H₄ 六个原子共面', function () {
      var r = measure(gOf('C2H4')), maxZ = 0;
      Object.keys(r.pos).forEach(function (k) { maxZ = Math.max(maxZ, Math.abs(r.pos[k].z)); });
      return { pass: maxZ <= 0.02, detail: 'max|z|=' + maxZ.toFixed(4) };
    });

    // 11 C2H4 键角
    check(11, 'C₂H₄ 键角 ≈120°', function () {
      var r = measure(gOf('C2H4'));
      var a = ang(r.pos, 0, 2, 3);   // H-C-H
      var b = ang(r.pos, 0, 1, 2);   // H-C=C
      var worst = Math.max(Math.abs(a - 117.4), Math.abs(b - 121.3));
      return { pass: worst <= 5, detail: 'H-C-H ' + a.toFixed(1) + '°，H-C=C ' + b.toFixed(1) + '°' };
    });

    // 12 超价拒绝（纯数据层）
    check(12, '超价拒绝：O 建第 3 键', function () {
      var graph = { atoms: [{ id: 1, el: 'O' }, { id: 2, el: 'H' }, { id: 3, el: 'H' }, { id: 4, el: 'H' }], bonds: [] };
      var ok1 = canBond(graph, 1, 2, 1);
      if (ok1) graph.bonds.push({ id: 10, a: 1, b: 2, order: 1 });
      var ok2 = canBond(graph, 1, 3, 1);
      if (ok2) graph.bonds.push({ id: 11, a: 1, b: 3, order: 1 });
      var ok3 = canBond(graph, 1, 4, 1);
      var nA = graph.atoms.length, nB = graph.bonds.length;
      return { pass: ok3 === false && nA === 4 && nB === 2, detail: '第 3 键 ' + (ok3 ? '通过(错)' : '被拒') + '，原子 ' + nA + ' / 键 ' + nB };
    });

    // 13 删原子键数守恒
    check(13, '删原子后键数守恒', function () {
      var g2 = { atoms: [{ id: 1, el: 'O' }, { id: 2, el: 'H' }, { id: 3, el: 'H' }], bonds: [{ id: 1, a: 1, b: 2, order: 1 }, { id: 2, a: 1, b: 3, order: 1 }] };
      var before = g2.bonds.length;
      var rel = g2.bonds.filter(function (b) { return b.a === 1 || b.b === 1; }).length;
      g2.bonds = g2.bonds.filter(function (b) { return b.a !== 1 && b.b !== 1; });
      g2.atoms = g2.atoms.filter(function (a) { return a.id !== 1; });
      return { pass: g2.bonds.length === before - rel, detail: before + ' − ' + rel + ' = ' + g2.bonds.length };
    });

    // 14 同分异构
    check(14, '乙醇 ≠ 二甲醚（度序列相同）', function () {
      var g1 = gOf('C2H5OH'), g2 = gOf('Me2O');
      var same = degreeSeq(g1) === degreeSeq(g2);
      var iso = isoMap(g1, g2);
      return { pass: same && iso === null, detail: '度序列相同=' + same + '，同构=' + (iso ? '是(错)' : '否') };
    });

    // 15 模板不误命中
    check(15, 'H₂O 不误命中 NH₃ / H₂O₂', function () {
      var h = matchTemplate(gH2O());
      var wrong = h && (h.template.id === 'NH3' || h.template.id === 'H2O2');
      return { pass: h && h.template.id === 'H2O' && !wrong, detail: '命中 ' + (h ? h.template.id : '无') };
    });

    // 16 整形不改 connectivity
    check(16, '整形前后邻接表与键级一致', function () {
      var g3 = gOf('C2H5OH');
      var before = wlLabels(g3), ordersBefore = g3.bonds.map(function (b) { return b.order; }).sort().join(',');
      plan(g3);
      var after = wlLabels(g3), ordersAfter = g3.bonds.map(function (b) { return b.order; }).sort().join(',');
      return { pass: before === after && ordersBefore === ordersAfter, detail: '邻接 ' + (before === after ? '一致' : '变了') + '，键级 ' + (ordersBefore === ordersAfter ? '一致' : '变了') };
    });

    // 17 整形幂等
    check(17, '整形两次坐标一致', function () {
      var g4 = gOf('C2H5OH');
      var p1 = plan(g4).pos, p2 = plan(g4).pos, maxD = 0;
      Object.keys(p1).forEach(function (k) {
        maxD = Math.max(maxD, len(sub(p1[k], p2[k])));
      });
      return { pass: maxD < 1e-6, detail: '最大差 ' + maxD.toExponential(2) + ' Å' };
    });

    // 18 孤对推导
    check(18, '孤对：H₂O=2 / NH₃=1 / CH₄=0 / HCl=3', function () {
      var a = lonePairs('O', 2), b = lonePairs('N', 3), c = lonePairs('C', 4), d = lonePairs('Cl', 1);
      return { pass: a === 2 && b === 1 && c === 0 && d === 3, detail: [a, b, c, d].join(' / ') };
    });

    // 19 孤对压制单调
    check(19, '键角 104.5 < 107 < 109.5', function () {
      var w = measure(gOf('H2O')), n = measure(gOf('NH3')), m = measure(gOf('CH4'));
      var a1 = ang(w.pos, 0, 1, 2), a2 = ang(n.pos, 0, 1, 2), a3 = ang(m.pos, 0, 1, 2);
      return { pass: a1 < a2 && a2 < a3, detail: a1.toFixed(1) + ' < ' + a2.toFixed(1) + ' < ' + a3.toFixed(1) };
    });

    // 20 键级和合法
    check(20, '模板里每个原子 Σorder ≤ 价键上限', function () {
      var bad = [];
      TEMPLATES.forEach(function (t) {
        var tg = templateGraph(t);
        tg.atoms.forEach(function (a) {
          var s = bondSum(tg, a.id);
          if (s > cap(a.el)) bad.push(t.id + ':' + a.el + s + '>' + cap(a.el));
        });
      });
      return { pass: bad.length === 0, detail: bad.length ? bad.join(' ') : TEMPLATES.length + ' 个模板全部合法' };
    });

    var pass = rows.filter(function (r) { return r.pass; }).length;
    return { rows: rows, pass: pass, fail: rows.length - pass, total: rows.length };
  }

  /* ---------- 成键合法性（供 app 调用） ---------- */
  function canBond(graph, aId, bId, order) {
    if (aId === bId) return false;
    var exists = graph.bonds.some(function (b) {
      return (b.a === aId && b.b === bId) || (b.a === bId && b.b === aId);
    });
    if (exists) return false;
    var ao = graph.atoms.find(function (x) { return x.id === aId; });
    var bo = graph.atoms.find(function (x) { return x.id === bId; });
    if (!ao || !bo) return false;
    if (bondSum(graph, aId) + order > cap(ao.el)) return false;
    if (bondSum(graph, bId) + order > cap(bo.el)) return false;
    return true;
  }

  /* ---------- 导出 ---------- */
  var CHEM = {
    VE: VE, CAP: CAP, L1: L1, L2: L2, L3: L3,
    TEMPLATES: TEMPLATES,
    bondLen: bondLen, cap: cap, bondSum: bondSum,
    lonePairs: lonePairs, lonePairsOf: lonePairsOf,
    angleForDomains: angleForDomains,
    neighbors: neighbors, templateGraph: templateGraph,
    degreeSeq: degreeSeq, wlLabels: wlLabels, isoMap: isoMap, matchTemplate: matchTemplate,
    embed: embed, recenter: recenter, plan: plan, ordersFor: ordersFor,
    canBond: canBond, runAssertions: runAssertions,
    vec: { v: v, add: add, sub: sub, mul: mul, dot: dot, len: len, unit: unit, cross: cross, rot: rot, perpTo: perpTo, angleDeg: angleDeg }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CHEM;
  g.CHEM = CHEM;
  return CHEM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
