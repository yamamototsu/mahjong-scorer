#!/bin/bash
# 麻雀スコアラー 開発環境セットアップ
# 使い方: bash setup.sh
set -e

REPO="widespreder/mahjong-scorer"
RAW="https://raw.githubusercontent.com/$REPO/main"

echo "▶ 1/4 ソースを取得"
mkdir -p /home/claude /mnt/user-data/outputs
curl -sf "$RAW/dev/mahjong-scorer.jsx" -o /mnt/user-data/outputs/mahjong-scorer.jsx
curl -sf "$RAW/index.html"             -o /mnt/user-data/outputs/index.html
curl -sf "$RAW/dev/compile.js"         -o /home/claude/compile.js
curl -sf "$RAW/dev/validate.js"        -o /home/claude/validate.js
curl -sf "$RAW/dev/build-html.py"      -o /home/claude/build-html.py
curl -sf "$RAW/dev/upload.py"          -o /home/claude/upload.py
curl -sf "$RAW/dev/deploy.sh"          -o /home/claude/deploy.sh
chmod +x /home/claude/deploy.sh
echo "   $(wc -l < /mnt/user-data/outputs/mahjong-scorer.jsx) 行のソースを取得しました"

echo "▶ 2/4 Babel を用意"
mkdir -p /home/claude/babelcheck && cd /home/claude/babelcheck
npm install @babel/core @babel/preset-react --silent --no-fund --no-audit 2>/dev/null

echo "▶ 3/4 検証用の React を用意"
mkdir -p /home/claude/prev && cd /home/claude/prev
npm install react@18.2.0 react-dom@18.2.0 --silent --no-fund --no-audit 2>/dev/null

echo "▶ 4/4 ビルドを確認"
cd /home/claude
python3 build-html.py > /dev/null
echo ""
echo "✓ 準備完了"
echo ""
echo "  編集: /mnt/user-data/outputs/mahjong-scorer.jsx"
echo "  反映: export GH_TOKEN='...' && bash /home/claude/deploy.sh \"コミットメッセージ\""
