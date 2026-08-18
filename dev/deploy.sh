#!/bin/bash
# 検証 → ビルド → アップロード をまとめて実行
# 使い方: export GH_TOKEN='...' && bash deploy.sh "コミットメッセージ"
set -e

MSG="${1:-update}"
SRC="/mnt/user-data/outputs/mahjong-scorer.jsx"

if [ -z "$GH_TOKEN" ]; then
  echo "✗ GH_TOKEN が設定されていません"
  echo "  export GH_TOKEN='github_pat_...' を先に実行してください"
  exit 1
fi

echo "▶ 1/3 構文チェック"
tail -n +3 "$SRC" | sed 's/^export default function MahjongScorer/function MahjongScorer/' \
  > /home/claude/app-body.jsx
node /home/claude/validate.js

echo "▶ 2/3 ビルド"
python3 /home/claude/build-html.py

echo "▶ 3/3 アップロード"
python3 /home/claude/upload.py "$MSG"
