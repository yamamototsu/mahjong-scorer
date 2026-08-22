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
<link rel="apple-touch-icon" href="icon.svg">
<link rel="icon" type="image/svg+xml" href="icon.svg">
<link rel="preload" as="image" href="assets/intro.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
html,body{margin:0;padding:0;background:#0c1117;-webkit-tap-highlight-color:transparent;overscroll-behavior-y:contain}
*,*::before,*::after{box-sizing:border-box}
button{font-family:inherit;-webkit-tap-highlight-color:transparent}
input,select{font-family:inherit}
</style>
</head>
<body>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
<script>
const { useState, useCallback, useMemo } = React;

${out.code}

ReactDOM.render(React.createElement(MahjongScorer), document.getElementById("root"));
</script>
</body>
</html>`;

fs.writeFileSync(path.join(repo, 'index.html'), html);

// ローカル検証用（CDN・Google Fontsに繋がない）
const local = html
  .replace('https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
           'file://' + path.join(__dirname, 'node_modules/react/umd/react.production.min.js'))
  .replace('https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
           'file://' + path.join(__dirname, 'node_modules/react-dom/umd/react-dom.production.min.js'))
  .replace('<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800;900&display=swap" rel="stylesheet">', '');
fs.writeFileSync(path.join(repo, 'local.html'), local);

console.log('build OK:', Math.round(out.code.length / 1024) + 'KB JS →', path.join(repo, 'index.html'), '/ local.html');
