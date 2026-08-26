#!/bin/bash
# 麻雀スコアラー「卓上ポンづけ」開発環境セットアップ
#
# 使い方: bash dev/setup.sh
#
# ビルド・描画検証・レイアウト検査に必要なツール一式を
# リポジトリの隣（既定: ../mj-tools）に用意する。
# 何度実行しても安全（冪等）。
set -euo pipefail

REPO_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
MJ_TOOLS="${MJ_TOOLS:-$(dirname "$REPO_DIR")/mj-tools}"

echo "▶ 1/3 ツールを $MJ_TOOLS へ配置"
mkdir -p "$MJ_TOOLS"
cp "$REPO_DIR"/dev/build.js "$REPO_DIR"/dev/shot.js "$REPO_DIR"/dev/layout-check.js "$MJ_TOOLS/"

echo "▶ 2/3 依存パッケージを用意"
cd "$MJ_TOOLS"
[ -f package.json ] || npm init -y >/dev/null 2>&1
# build.js は @babel/*、shot.js と layout-check.js は playwright-core、
# local.html（CDNに繋がない検証用）は react/react-dom の UMD を参照する
npm install --silent --no-fund --no-audit \
  @babel/core @babel/preset-react \
  playwright-core \
  react@18.2.0 react-dom@18.2.0

# Chromium は Claude Code on the web の環境に同梱されている
if [ ! -e /opt/pw-browsers/chromium ]; then
  echo "   ⚠ /opt/pw-browsers/chromium が見つかりません。"
  echo "     shot.js / layout-check.js は動きません（build.js は動きます）。"
fi

echo "▶ 3/3 ビルドを確認"
cd "$REPO_DIR"
node "$MJ_TOOLS/build.js" .

cat <<EOS

✓ 準備完了

  編集   : dev/mahjong-scorer.jsx   ← ここだけを編集する
  ビルド : node $MJ_TOOLS/build.js .
  描画   : node $MJ_TOOLS/shot.js local.html out.png [actions.js]
  検査   : node $MJ_TOOLS/layout-check.js local.html [actions.js]
  反映   : git add -A && git commit -m "..." && git push

  ※ index.html は build.js の生成物。手で編集しない。
  ※ local.html は検証用。コミットしない（.gitignore 済み）。
  ※ 詳しい開発ルールは dev/AGENT_README.md を読むこと。
EOS
