import subprocess
# JSX をここで JS に変換しておく（ブラウザ側でBabelを動かさないため）
subprocess.run(["node", "/home/claude/compile.js"], check=True)

with open("/home/claude/app-body.js", "r") as f:
    jsx_body = f.read()

html = f'''<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="麻雀スコアラー">
<meta name="theme-color" content="#0c1117">
<meta name="description" content="麻雀の点数計算と対局スコア管理アプリ">
<title>\U0001f004 麻雀スコアラー</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon.svg">
<link rel="icon" type="image/svg+xml" href="icon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
html,body{{margin:0;padding:0;background:#0c1117;-webkit-tap-highlight-color:transparent;overscroll-behavior-y:contain}}
*,*::before,*::after{{box-sizing:border-box}}
button{{font-family:inherit;-webkit-tap-highlight-color:transparent}}
input,select{{font-family:inherit}}
</style>
</head>
<body>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
<script>
const {{ useState, useCallback, useMemo }} = React;

{jsx_body}

ReactDOM.render(React.createElement(MahjongScorer), document.getElementById("root"));
</script>
</body>
</html>'''

with open("/mnt/user-data/outputs/index.html", "w") as f:
    f.write(html)
print("done")
