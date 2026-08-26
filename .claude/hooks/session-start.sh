#!/bin/bash
# 麻雀スコアラー「卓上ポンづけ」— セッション開始時の自動セットアップ
#
# Claude Code on the web でこのリポジトリのセッションを開くと自動で走り、
# ビルド（build.js）・描画検証（shot.js）・レイアウト検査（layout-check.js）が
# すぐ使える状態にする。中身は dev/setup.sh に集約している。
set -euo pipefail

# ローカルの端末では走らせない（web セッション専用）
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

bash "${CLAUDE_PROJECT_DIR}/dev/setup.sh"
