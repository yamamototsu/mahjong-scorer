// 麻雀スコアラー ビルド（この開発環境用）
// 使い方: node /home/user/mj-tools/build.js <リポジトリのパス>
//   <repo>/dev/mahjong-scorer.jsx → <repo>/index.html（公開用）
//   さらに <repo>/local.html（CDN不要のローカル検証用・コミット禁止）を生成
const fs = require('fs');
const path = require('path');
const babel = require(path.join(__dirname, 'node_modules/@babel/core'));
const presetReact = require(path.join(__dirname, 'node_modules/@babel/preset-react'));

const repo = path.resolve(process.argv[2] || '.');
const src = fs.readFileSync(path.join(repo, 'dev/mahjong-scorer.jsx'), 'utf8');

// 元の deploy.sh と同じ加工: 先頭2行(import+空行)を落とし、export default を外す
const body = src.split('\n').slice(2).join('\n')
  .replace(/^export default function MahjongScorer/m, 'function MahjongScorer');

let out;
try {
  out = babel.transformSync(body, {
    presets: [[presetReact, { runtime: 'classic' }]],
    compact: false,
    comments: false,
  });
} catch (e) {
  console.error('JSX ERROR:', e.message.split('\n')[0]);
  if (e.loc) console.error('Line(app-body基準):', e.loc.line, 'Col:', e.loc.column, '（ソースでは +2 行）');
  process.exit(1);
}

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="卓上ポンづけ">
<meta name="theme-color" content="#0c1117">
<meta name="description" content="卓上ポンづけ｜卓の真ん中に置いて使う麻雀スコアラー。点数計算と対局スコア管理">
<title>🀄 卓上ポンづけ｜麻雀スコアラー</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
<link rel="preload" as="image" href="assets/intro.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800;900&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<style>
html,body{margin:0;padding:0;background:#0c1117;-webkit-tap-highlight-color:transparent;overscroll-behavior-y:contain}
*,*::before,*::after{box-sizing:border-box}
button{font-family:inherit;-webkit-tap-highlight-color:transparent}
input,select{font-family:inherit}
</style>
</head>
<body>
<div id="root"></div>
<script src="vendor/react.production.min.js"></script>
<script src="vendor/react-dom.production.min.js"></script>
<script>
// 部品が読めなかったとき（通信が切れた初回など）は、真っ黒のままにせず一言出す
if (!window.React || !window.ReactDOM) {
  document.getElementById("root").innerHTML =
    '<div style="color:#e6edf6;padding:48px 24px;font:16px/1.9 sans-serif;text-align:center">' +
    'アプリを読み込めませんでした。<br>電波のよいところで、もう一度開いてください。</div>';
}
</script>
<script>
const { useState, useCallback, useMemo } = React;

${out.code}

// 画面のどこかで思わぬエラーが起きても、真っ白にせず立て直せるようにする
class AppGuard extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { try { console.error(err); } catch (e) {} }
  render() {
    if (!this.state.err) return this.props.children;
    const h = React.createElement;
    // 記録は端末に残っているので、念のため書き出せるようにしておく（バックアップと同じ形）
    const save = () => {
      try {
        const data = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(),
          history: JSON.parse(localStorage.getItem("mj_history") || "[]") }, null, 2);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
        a.download = "ponzuke-backup.json";
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) {}
    };
    const btn = (label, onClick, main) => h("button", { onClick, style: {
      display: "block", width: "100%", margin: "12px 0 0", padding: "15px 12px", borderRadius: 12,
      border: main ? "none" : "1px solid #2a3442", background: main ? "#2f6fd6" : "transparent",
      color: main ? "#fff" : "#e6edf6", fontSize: 16, fontWeight: 700 } }, label);
    return h("div", { style: { maxWidth: 420, margin: "0 auto", padding: "56px 24px", color: "#e6edf6",
        fontFamily: "sans-serif", lineHeight: 1.9 } },
      h("div", { style: { fontSize: 20, fontWeight: 800, marginBottom: 8 } }, "うまく表示できませんでした"),
      h("div", { style: { fontSize: 15, color: "#9fb0c6" } },
        "対局の記録は端末に残っています。もう一度開いてみてください。直らないときは、記録を書き出して控えておけます。"),
      btn("もう一度開く", () => location.reload(), true),
      btn("記録を書き出す", save, false));
  }
}

ReactDOM.render(React.createElement(AppGuard, null, React.createElement(MahjongScorer)), document.getElementById("root"));
</script>
</body>
</html>`;

fs.writeFileSync(path.join(repo, 'index.html'), html);

// ── オフライン用（Service Worker）──
// index.html の中身から版を作り、sw.js の VERSION と EXTRA を書き替える。
// 版が変わると古い入れ物が捨てられ、新しい本体が取り直される
const swPath = path.join(repo, 'sw.js');
if (fs.existsSync(swPath)) {
  const crypto = require('crypto');
  const ver = crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);
  // 本体が外から読み込むもの（React など）も、いっしょに取っておかないと開けない
  const extra = [...html.matchAll(/<script src="(https:\/\/[^"]+)"/g)].map(m => m[1]);
  const sw = fs.readFileSync(swPath, 'utf8')
    .replace(/^const VERSION = ".*";$/m, `const VERSION = "${ver}";`)
    .replace(/^const EXTRA = .*;\s*\/\/ (.*)$/m,
             `const EXTRA = ${JSON.stringify(extra)};   // $1`);
  fs.writeFileSync(swPath, sw);
}

// React はリポジトリの vendor/ に同梱する（初回に圏外・CDNが落ちていても開けるように）。
// 無ければこの開発環境の node_modules から入れる
const vendorDir = path.join(repo, 'vendor');
if (!fs.existsSync(vendorDir)) fs.mkdirSync(vendorDir);
for (const [pkg, file] of [['react', 'react.production.min.js'], ['react-dom', 'react-dom.production.min.js']]) {
  const dst = path.join(vendorDir, file);
  if (!fs.existsSync(dst)) fs.copyFileSync(path.join(__dirname, 'node_modules', pkg, 'umd', file), dst);
}

// ローカル検証用（Google Fontsに繋がない）。React は同じ vendor/ を使う
const local = html
  .replace(`<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800;900&display=swap" rel="stylesheet" media="print" onload="this.media='all'">`, '');
fs.writeFileSync(path.join(repo, 'local.html'), local);

console.log('build OK:', Math.round(out.code.length / 1024) + 'KB JS →', path.join(repo, 'index.html'), '/ local.html');
