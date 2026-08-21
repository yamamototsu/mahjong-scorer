// レイアウト自動検査: 重なり・はみ出し・余白・詰まり・極小文字・折り返しを機械的に検出する
//
//   node /home/user/mj-tools/layout-check.js <local.htmlのパス> [actions.js] [幅,幅,...]
//
// actions.js を渡すと、その操作を行った後の画面を検査する（形式は shot.js と同じ）。
// 幅を省略すると 280,320,390,430 で検査する。
// 指摘が1件でもあれば終了コード1（コミット前のゲートに使える）。

const path = require('path');
const { chromium } = require(path.join(__dirname, 'node_modules/playwright-core'));

const MIN_FONT = 10;      // これ未満は極小文字として指摘
const MIN_GAP = 2;        // 枠と枠がこれ未満まで近いと接触として指摘（px）
const MIN_PAD = 3;        // 文字が枠のふちからこれ未満だと詰まりとして指摘（px）
const MIN_TAP = 32;       // タップ領域がこれ未満だと小さすぎるとして指摘（px）
const EPS = 0.6;          // 実測のゆらぎを吸収する許容値（px）

const audit = () => {
  const out = { overlap: [], overflow: [], selfOverflow: [], gap: [], padding: [], tiny: [], wrap: [], offscreen: [] };
  const vw = window.innerWidth, vh = window.innerHeight;
  const EPS = 0.6, MIN_FONT = 10, MIN_GAP = 2, MIN_PAD = 3, MIN_TAP = 32;

  const label = (el) => {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return t || `<${el.tagName.toLowerCase()}>`;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // 回転している要素は矩形の比較が意味を持たないので、その枝ごと対象外にする
  const rotated = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const tr = getComputedStyle(n).transform;
      if (tr && tr !== 'none' && /matrix/.test(tr)) {
        const m = tr.match(/matrix\(([^)]+)\)/);
        if (m) {
          const [a, b] = m[1].split(',').map(Number);
          if (Math.abs(b) > 0.01 || a < 0.999) return true;   // 回転・反転あり
        }
      }
    }
    return false;
  };
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };

  const all = [...document.querySelectorAll('body *')].filter(el =>
    visible(el) && !['SCRIPT', 'STYLE', 'SVG', 'PATH', 'LINE', 'DEFS', 'MARKER', 'G'].includes(el.tagName));

  // 文字を直接持つ要素（子要素にテキストを預けていないもの）
  const leaves = all.filter(el =>
    [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));

  // ── 極小文字 ──
  for (const el of leaves) {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs && fs < MIN_FONT - 0.01) out.tiny.push({ text: label(el), fontSize: +fs.toFixed(1) });
  }

  // ── 画面の外へのはみ出し ──
  for (const el of leaves) {
    const r = rect(el);
    if (r.r > vw + EPS || r.x < -EPS) out.offscreen.push({ text: label(el), left: +r.x.toFixed(1), right: +r.r.toFixed(1), viewport: vw });
  }

  // ── 自分の枠から文字があふれている ──
  // 高さや幅を固定した枠に文字を入れると、枠の矩形は小さいまま文字だけが外へ出て、
  // 隣の行と重なる。矩形の比較では見つからないので、内容の大きさと枠を直接比べる。
  for (const el of leaves) {
    const s = getComputedStyle(el);
    if (s.overflow !== 'visible' || s.overflowY !== 'visible') continue;
    const dy = el.scrollHeight - el.clientHeight;
    const dx = el.scrollWidth - el.clientWidth;
    if (dy > 1 || dx > 1) {
      out.selfOverflow.push({
        text: label(el),
        枠: `${el.clientWidth}×${el.clientHeight}`,
        中身: `${el.scrollWidth}×${el.scrollHeight}`,
        あふれ: { 縦: dy > 1 ? dy : 0, 横: dx > 1 ? dx : 0 },
        指定: [s.height !== 'auto' ? `height:${s.height}` : '', s.width !== 'auto' ? `width:${s.width}` : ''].filter(Boolean).join(' '),
      });
    }
  }

  // ── 親からのはみ出し / 詰まり ──
  for (const el of leaves) {
    if (rotated(el)) continue;
    const p = el.parentElement;
    if (!p || p === document.body) continue;
    const ps = getComputedStyle(p);
    if (ps.overflow !== 'visible' || ps.overflowY !== 'visible') continue;  // スクロール枠は対象外
    const r = rect(el), pr = rect(p);
    const over = {
      top: +(pr.y - r.y).toFixed(1), bottom: +(r.b - pr.b).toFixed(1),
      left: +(pr.x - r.x).toFixed(1), right: +(r.r - pr.r).toFixed(1),
    };
    const worst = Math.max(over.top, over.bottom, over.left, over.right);
    if (worst > EPS) { out.overflow.push({ text: label(el), 親: label(p), はみ出し: over }); continue; }
    // 枠のふちに貼りついていないか（枠線や背景がある要素のみ対象）
    const hasBox = ps.borderTopWidth !== '0px' || (ps.backgroundColor && ps.backgroundColor !== 'rgba(0, 0, 0, 0)');
    if (hasBox) {
      const pad = Math.min(-over.top, -over.bottom, -over.left, -over.right);
      if (pad < MIN_PAD) out.padding.push({ text: label(el), 親: label(p), 余白: +pad.toFixed(1) });
    }
  }

  // ── 兄弟どうしの重なり・近すぎ ──
  const seen = new Set();
  for (const el of all) {
    const kids = [...el.children].filter(k => visible(k) && !rotated(k));
    if (kids.length < 2) continue;
    if (getComputedStyle(el).position === 'absolute' && kids.some(k => getComputedStyle(k).position === 'absolute')) {
      // 重ね合わせ前提の入れ子（オーバーレイ等）は対象外
    }
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const A = kids[i], B = kids[j];
        // 重ねて表示するのが目的のもの（モーダル・オーバーレイ）は比べない
        const stacked = (n) => { const p = getComputedStyle(n).position; return p === 'absolute' || p === 'fixed' || p === 'sticky'; };
        if (stacked(A) || stacked(B)) continue;
        const a = rect(A), b = rect(B);
        const ox = Math.min(a.r, b.r) - Math.max(a.x, b.x);
        const oy = Math.min(a.b, b.b) - Math.max(a.y, b.y);
        const key = `${label(A)}|${label(B)}`;
        if (seen.has(key)) continue;
        if (ox > EPS && oy > EPS) {
          seen.add(key);
          out.overlap.push({ A: label(A), B: label(B), 重なり: { 横: +ox.toFixed(1), 縦: +oy.toFixed(1) } });
        } else if (ox > EPS && oy > -MIN_GAP && oy <= EPS) {
          // 縦に並んでいて隙間がほぼ無い（枠を持つもの同士だけ指摘する）
          const boxed = (n) => getComputedStyle(n).borderTopWidth !== '0px';
          if (boxed(A) && boxed(B)) { seen.add(key); out.gap.push({ A: label(A), B: label(B), 隙間: +(-oy).toFixed(1) }); }
        }
      }
    }
  }

  // ── 文字の折り返し（1文字だけ次の行に落ちている等） ──
  for (const el of leaves) {
    const s = getComputedStyle(el);
    if (s.whiteSpace === 'nowrap' || s.whiteSpace === 'pre') continue;
    const txt = (el.textContent || '').trim();
    if (txt.length < 2 || txt.length > 40) continue;
    const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
    const r = rect(el);
    const lineN = Math.round(r.h / lh);
    if (lineN >= 2) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()];
      if (rects.length >= 2) {
        const last = rects[rects.length - 1];
        // 最終行が極端に短い＝単語の途中で折れている可能性
        if (last.width < r.w * 0.25) out.wrap.push({ text: txt, 行数: lineN, 最終行の幅: +last.width.toFixed(1), 枠の幅: +r.w.toFixed(1) });
      }
    }
  }

  // ── タップ領域が小さすぎるボタン ──
  out.tap = [];
  for (const el of document.querySelectorAll('button, [role="button"]')) {
    if (!visible(el)) continue;
    const r = rect(el);
    if (r.h < MIN_TAP || r.w < MIN_TAP) out.tap.push({ text: label(el), 大きさ: `${r.w.toFixed(0)}×${r.h.toFixed(0)}` });
  }
  return out;
};

(async () => {
  const [html, actions, widthArg] = process.argv.slice(2);
  if (!html) { console.error('使い方: node layout-check.js <local.html> [actions.js] [幅,幅,...]'); process.exit(2); }
  const widths = (widthArg || '280,320,390,430').split(',').map(n => parseInt(n, 10));

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let total = 0;

  for (const w of widths) {
    const page = await browser.newPage({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2 });
    const jsErrors = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') jsErrors.push(m.text()); });
    page.on('dialog', async (d) => { try { await d.accept(); } catch {} });
    await page.goto('file://' + path.resolve(html));
    await page.waitForTimeout(3000);   // 起動演出を待つ
    if (actions && actions !== '-') {
      try { await require(path.resolve(actions))(page); } catch (e) {
        console.log(`[幅${w}] 操作エラー: ${e.message.split('\n')[0]}`);
      }
    }
    await page.waitForTimeout(400);

    const res = await page.evaluate(audit);
    const groups = [
      ['重なり', res.overlap], ['枠から文字があふれている', res.selfOverflow],
      ['親からのはみ出し', res.overflow], ['画面外へのはみ出し', res.offscreen],
      ['枠どうしの接触', res.gap], ['ふちへの詰まり', res.padding],
      ['極小文字(10px未満)', res.tiny], ['不自然な折り返し', res.wrap], ['小さすぎるタップ領域', res.tap],
    ];
    const n = groups.reduce((a, [, v]) => a + (v ? v.length : 0), 0);
    total += n;
    console.log(`\n══ 幅 ${w}px ══  指摘 ${n}件${jsErrors.length ? `  ／ JSエラー ${jsErrors.length}件` : ''}`);
    if (jsErrors.length) jsErrors.slice(0, 3).forEach(e => console.log(`  [JSエラー] ${e.slice(0, 160)}`));
    for (const [name, list] of groups) {
      if (!list || !list.length) continue;
      console.log(`  ● ${name}: ${list.length}件`);
      list.slice(0, 6).forEach(x => console.log(`      ${JSON.stringify(x)}`));
      if (list.length > 6) console.log(`      …ほか${list.length - 6}件`);
    }
    await page.close();
  }

  await browser.close();
  console.log(`\n${total === 0 ? '✓ 指摘なし（合格）' : `✗ 合計 ${total}件の指摘（要対応）`}`);
  process.exit(total === 0 ? 0 : 1);
})();
