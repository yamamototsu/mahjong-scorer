import React, { useState, useCallback, useMemo } from "react";

// ── Score Engine ──
function calcBasePoints(fu, han, kiriage) {
  if (han >= 13) return 8000 * Math.max(1, Math.floor(han / 13)); // 13=役満, 26=ダブル役満, 39=トリプル役満
  if (han >= 11) return 6000;
  if (han >= 8) return 4000;
  if (han >= 6) return 3000;
  if (han >= 5) return 2000;
  // 切り上げ満貫（オプション）: 4翻30符・3翻60符を満貫扱い
  if (kiriage) {
    if (han === 4 && fu >= 30) return 2000;
    if (han === 3 && fu >= 60) return 2000;
  }
  return Math.min(fu * Math.pow(2, 2 + han), 2000);
}
function roundUp100(n) { return Math.ceil(n / 100) * 100; }
function calcScore(fu, han, isParent, isTsumo, kiriage, pc) {
  const base = calcBasePoints(fu, han, kiriage);
  // ── 三人麻雀（日本プロ麻雀連盟ルール）──
  // ツモアガリでもロンと同じ点数が動く。親かぶりなしで2者が均等に払う。
  // 例) 子の満貫ツモ=4,000オール(計8,000) / 親の満貫ツモ=6,000オール(計12,000)
  if (pc === 3) {
    if (isTsumo) {
      const e = roundUp100(base * (isParent ? 3 : 2));
      return { total: e * 2, each: e, fromParent: e, fromChild: e };
    }
    return { total: roundUp100(base * (isParent ? 6 : 4)) };
  }
  if (isParent) {
    if (isTsumo) { const e = roundUp100(base * 2); return { total: e * 3, each: e }; }
    else { return { total: roundUp100(base * 6) }; }
  } else {
    if (isTsumo) { const c = roundUp100(base), p = roundUp100(base * 2); return { total: c * 2 + p, fromChild: c, fromParent: p }; }
    else { return { total: roundUp100(base * 4) }; }
  }
}
function getLimitName(han) {
  if (han >= 39) return "トリプル役満";
  if (han >= 26) return "ダブル役満";
  if (han >= 13) return "役満";
  if (han >= 11) return "三倍満";
  if (han >= 8) return "倍満";
  if (han >= 6) return "跳満";
  if (han >= 5) return "満貫";
  return null;
}

const WINDS = ["東", "南", "西", "北"];
// レート（1ptあたりのゴールド）。0.01〜10 をリールから選ぶ
const RATE_VALUES = (() => {
  const out = [0];
  for (let v = 1; v <= 9; v++) out.push(Math.round(v) / 100);        // 0.01〜0.09
  for (let v = 10; v <= 95; v += 5) out.push(Math.round(v) / 100);   // 0.10〜0.95
  for (let v = 100; v <= 1000; v += 50) out.push(Math.round(v) / 100); // 1.0〜10.0
  return out;
})();
const RATE_LABEL = (r) => !r ? "なし" : String(parseFloat(Number(r).toFixed(3)));
const GOLD = (pt, rate) => Math.round(pt * 1000 * rate * 1000) / 1000;  // ptは1000点単位
const GOLD_LABEL = (g) => (g % 1 === 0 ? g.toLocaleString() : parseFloat(g.toFixed(3)).toLocaleString());
const TABLE_IMG = "assets/table.jpg";   // 麻雀卓の画像
// 人数に応じた席風（三麻は北家なし）
const SEATS_OF = (pc) => pc === 3 ? ["東", "南", "西"] : WINDS;
// 三人麻雀（連盟ルール）の既定値
const SANMA_DEFAULT_RULES = {
  startPoints: 40000, returnPoints: 40000,   // 40,000点持ちの40,000点返し
  honbaUnit: 600,                            // 1本場は600点
  kazoeYakuman: false,                       // 11翻から三倍満・数え役満なし
  kiriage: true,                             // 30符4翻は満貫に切り上げ
  doubleYakuman: true,                       // 役満の重複を認める
  agariRenchan: true, tenpaiRenchan: false,  // アガリやめあり・テンパイやめなし
  orasYame: true, multiRon: "atamahane",     // アガリは上家優先（ダブロンなし）
  kuitan: true, atozuke: true, tobiEnd: true,
  umaKey: "renmei3", uma: [10, 0, -10],      // 1着+10 / 2着±0 / 3着▲10
};
const UMA_PRESETS_3 = [
  { key: "renmei3", label: "+10 / 0 / -10", note: "連盟三麻ルール", uma: [10, 0, -10] },
  { key: "5-5", label: "+5 / 0 / -5", note: "小さめ", uma: [5, 0, -5] },
  { key: "20-20", label: "+20 / 0 / -20", note: "大きめ", uma: [20, 0, -20] },
  { key: "none3", label: "なし", note: "素点のみ", uma: [0, 0, 0] },
];
// 試合形式: tonpu=東風戦(東のみ) / hanchan=半荘戦(東南) / zenchan=全荘戦(東南西北)
const MATCH_LABEL = (mt) => mt === "tonpu" ? "東風戦" : mt === "zenchan" ? "全荘戦" : "半荘戦";
const MATCH_LABEL_SHORT = (mt) => mt === "tonpu" ? "東風" : mt === "zenchan" ? "全荘" : "半荘";
const LAST_WIND = (mt) => mt === "tonpu" ? "東" : mt === "zenchan" ? "北" : "南";
const FU_OPTIONS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];
// 翻数とアガリ方から、実戦でありえない符を除く
// 20符 = 平和ツモのみ（平和1翻＋ツモ1翻で最低2翻）
// 25符 = 七対子のみ（2翻。門前ツモが付くツモなら最低3翻）
function validFuOptions(han, isTsumo) {
  return FU_OPTIONS.filter(fu => {
    if (fu === 20) return isTsumo === true && (han === null || han >= 2);
    if (fu === 25) return han === null || han >= (isTsumo ? 3 : 2);
    return true;
  });
}
const DEFAULT_PRESET_NAMES = ["つとむ", "ひろこ", "はじめ", "こころ"];

export default function MahjongScorer() {
  const [view, setView] = useState("title");
  const [gameHistory, setGameHistory] = useState([]); // completed games
  const [suspendedGame, setSuspendedGame] = useState(null); // paused game

  // ── Game Setup Wizard ──
  const [setupStep, setSetupStep] = useState(0);
  // Step 0: 対局日, Step 1: 試合数, Step 2: プレイヤー名, Step 3: ルール設定, Step 4: 確認
  const [gameDate, setGameDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const [matchType, setMatchType] = useState(null); // "tonpu" | "hanchan"
  const [players, setPlayers] = useState(["Aプレーヤー", "Bプレーヤー", "Cプレーヤー", "Dプレーヤー"]);
  const [playerMode, setPlayerMode] = useState([false, false, false, false]); // false=text display, true=editing

  // ── 席の並べ替え: 行を長押し→そのままドラッグ ──
  const [dragSeat, setDragSeat] = useState(null); // { from, offset, target, rowH }
  const seatRowRefs = React.useRef([]);
  const seatAutoReg = React.useRef({}); // 行ごとに自動登録した名前（打ち直し時に置き換えるため）

  // ── 名前リストの並べ替え: 行を長押し→ドラッグ ──
  const [nameDrag, setNameDrag] = useState(null); // { from, offset, target, rowH }
  const nameRowRefs = React.useRef([]);
  const nameDragMeta = React.useRef(null);
  const nameSuppressClick = React.useRef(false);
  const nameDragCleanup = () => {
    const m = nameDragMeta.current;
    if (m) {
      if (m.timer) clearTimeout(m.timer);
      if (m.raf) cancelAnimationFrame(m.raf);
      if (m.moveH) { document.removeEventListener("touchmove", m.moveH); document.removeEventListener("mousemove", m.moveH); }
      if (m.endH) { document.removeEventListener("touchend", m.endH); document.removeEventListener("touchcancel", m.endH); document.removeEventListener("mouseup", m.endH); }
    }
    nameDragMeta.current = null;
    setNameDrag(null);
  };
  const nameDragActivate = () => {
    const m = nameDragMeta.current;
    if (!m || m.active) return;
    m.active = true;
    nameSuppressClick.current = true;
    try { if (navigator.vibrate) navigator.vibrate(30); } catch {}
    const r0 = nameRowRefs.current[m.from], r1 = nameRowRefs.current[m.from + 1] || nameRowRefs.current[m.from - 1];
    m.rowH = (r0 && r1) ? Math.max(36, Math.abs(r1.getBoundingClientRect().top - r0.getBoundingClientRect().top)) : 52;
    const maxIdx = m.count - 1;
    const moveH = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const y = ev.touches ? (ev.touches[0] ? ev.touches[0].clientY : m.lastY) : ev.clientY;
      m.lastY = y;
      const off = y - m.startY;
      m.lastTarget = Math.max(0, Math.min(maxIdx, m.from + Math.round(off / m.rowH)));
      m.lastOffset = off;
      if (!m.raf) m.raf = requestAnimationFrame(() => {
        m.raf = null;
        setNameDrag({ from: m.from, offset: m.lastOffset, target: m.lastTarget, rowH: m.rowH });
      });
    };
    const endH = (ev) => {
      if (ev && ev.cancelable && ev.type === "touchend") ev.preventDefault();
      const from = m.from, to = m.lastTarget;
      nameDragCleanup();
      if (from !== to) {
        const arr = [...presetNames];
        const [x] = arr.splice(from, 1);
        arr.splice(to, 0, x);
        savePresetNames(arr);
      }
      setTimeout(() => { nameSuppressClick.current = false; }, 400);
    };
    m.moveH = moveH; m.endH = endH;
    document.addEventListener("touchmove", moveH, { passive: false });
    document.addEventListener("mousemove", moveH);
    document.addEventListener("touchend", endH, { passive: false });
    document.addEventListener("touchcancel", endH);
    document.addEventListener("mouseup", endH);
    setNameDrag({ from: m.from, offset: 0, target: m.from, rowH: m.rowH });
  };
  const nameDragStart = (e, i, count) => {
    const tag = (e.target && e.target.tagName ? e.target.tagName : "").toUpperCase();
    if (tag === "INPUT" || tag === "BUTTON") return; // 編集・削除ボタンや入力欄は通常操作
    if (nameDragMeta.current) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    nameDragMeta.current = { startY: y, lastY: y, from: i, count, rowH: 52, timer: null, raf: null, active: false, lastTarget: i, lastOffset: 0, moveH: null, endH: null };
    nameDragMeta.current.timer = setTimeout(nameDragActivate, 350);
  };
  const nameDragPreMove = (e) => {
    const m = nameDragMeta.current;
    if (!m || m.active) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    if (Math.abs(y - m.startY) > 10) { clearTimeout(m.timer); nameDragMeta.current = null; }
  };
  const nameDragCancelIfPending = () => {
    const m = nameDragMeta.current;
    if (m && !m.active) { clearTimeout(m.timer); nameDragMeta.current = null; }
  };
  const seatDragMeta = React.useRef(null); // 進行中ドラッグの一時情報
  const seatSuppressClick = React.useRef(false); // ドラッグ直後のselect誤タップ防止

  const moveSeatOrder = (from, to) => {
    if (from === to) return;
    setPlayers(prev => { const a = [...prev]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; });
    setPlayerMode(prev => { const a = [...prev]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; });
  };

  const seatDragCleanup = () => {
    const m = seatDragMeta.current;
    if (m) {
      if (m.timer) clearTimeout(m.timer);
      if (m.raf) cancelAnimationFrame(m.raf);
      if (m.moveH) { document.removeEventListener("touchmove", m.moveH); document.removeEventListener("mousemove", m.moveH); }
      if (m.endH) { document.removeEventListener("touchend", m.endH); document.removeEventListener("touchcancel", m.endH); document.removeEventListener("mouseup", m.endH); }
    }
    seatDragMeta.current = null;
    setDragSeat(null);
  };

  const seatDragActivate = () => {
    const m = seatDragMeta.current;
    if (!m || m.active) return;
    m.active = true;
    seatSuppressClick.current = true;
    try { if (navigator.vibrate) navigator.vibrate(30); } catch {}
    const r0 = seatRowRefs.current[0], r1 = seatRowRefs.current[1];
    m.rowH = (r0 && r1) ? Math.max(40, r1.getBoundingClientRect().top - r0.getBoundingClientRect().top) : 62;
    const moveH = (ev) => {
      if (ev.cancelable) ev.preventDefault(); // ドラッグ中は画面スクロールを止める
      const y = ev.touches ? (ev.touches[0] ? ev.touches[0].clientY : m.lastY) : ev.clientY;
      m.lastY = y;
      const off = y - m.startY;
      m.lastTarget = Math.max(0, Math.min(PC - 1, m.from + Math.round(off / m.rowH)));
      m.lastOffset = off;
      if (!m.raf) m.raf = requestAnimationFrame(() => {
        m.raf = null;
        setDragSeat({ from: m.from, offset: m.lastOffset, target: m.lastTarget, rowH: m.rowH });
      });
    };
    const endH = (ev) => {
      if (ev && ev.cancelable && ev.type === "touchend") ev.preventDefault(); // selectが開くのを防ぐ
      const from = m.from, to = m.lastTarget;
      seatDragCleanup();
      moveSeatOrder(from, to);
      setTimeout(() => { seatSuppressClick.current = false; }, 400);
    };
    m.moveH = moveH; m.endH = endH;
    document.addEventListener("touchmove", moveH, { passive: false });
    document.addEventListener("mousemove", moveH);
    document.addEventListener("touchend", endH, { passive: false });
    document.addEventListener("touchcancel", endH);
    document.addEventListener("mouseup", endH);
    setDragSeat({ from: m.from, offset: 0, target: m.from, rowH: m.rowH });
  };

  const seatDragStart = (e, i) => {
    const tag = (e.target && e.target.tagName ? e.target.tagName : "").toUpperCase();
    if (tag === "INPUT" || tag === "BUTTON") return; // 入力欄・ボタンは通常操作を優先
    if (seatDragMeta.current) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    seatDragMeta.current = { startY: y, lastY: y, from: i, rowH: 62, timer: null, raf: null, active: false, lastTarget: i, lastOffset: 0, moveH: null, endH: null };
    seatDragMeta.current.timer = setTimeout(seatDragActivate, 350);
  };
  // 長押し前に指が動いたら通常のスクロールとみなしてキャンセル
  const seatDragPreMove = (e) => {
    const m = seatDragMeta.current;
    if (!m || m.active) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    if (Math.abs(y - m.startY) > 10) { clearTimeout(m.timer); seatDragMeta.current = null; }
  };
  const seatDragCancelIfPending = () => {
    const m = seatDragMeta.current;
    if (m && !m.active) { clearTimeout(m.timer); seatDragMeta.current = null; }
  };
  const seatTimer = React.useRef(null);
  // 席決め: 伏せた4枚の牌を1人ずつ引く
  // 画面の向き（横向きでは幅を広げて牌を大きく見せる）
  const [vp, setVp] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 390,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  const isLandscape = vp.w > vp.h && vp.w >= 600;
  // 横向きのときは牌を大きく（画面幅に応じて最大2.2倍まで）
  const tileScale = isLandscape ? Math.min(2.2, Math.max(1.3, vp.w / 440)) : 1;

  // 起動時のオープニング演出（このセッションで最初の1回だけ）
  const [booting, setBooting] = useState(true);
  React.useEffect(() => {
    const tm = setTimeout(() => setBooting(false), 2600);
    return () => clearTimeout(tm);
  }, []);

  const [gameConfig, setGameConfig] = useState(null); // saved config after setup
  const [gameStarted, setGameStarted] = useState(false);
  const [playerCount, setPlayerCount] = useState(4);  // 4=四人麻雀 / 3=三人麻雀（セットアップ用）
  // 対局中はその対局の人数（記録に人数がない古いデータは4人）、セットアップ中は選択中の人数
  const PC = (gameStarted && gameConfig) ? (gameConfig.playerCount || 4) : playerCount;
  const SEAT_WINDS = SEATS_OF(PC);
  const HU = () => (gameConfig?.rules?.honbaUnit) || 300;   // 1本場の点数
  const isSanma = PC === 3;
  // 親決め（仮親がサイコロを振って起家を決める）
  const [oyaDice, setOyaDice] = useState(null);     // { d1, d2, sum } 振り終わった目
  const [oyaRolling, setOyaRolling] = useState(false);
  const [seatTiles, setSeatTiles] = useState([]);   // [{wind, by}] by=引いた人のindex(元の並び順)
  const [seatTurn, setSeatTurn] = useState(0);      // 今引く人（元の並び順のindex）
  const [seatDone, setSeatDone] = useState(false);
  const [showRuleCheck, setShowRuleCheck] = useState(false); // 対局中のルール確認
  const [ruleEditMode, setRuleEditMode] = useState(false);   // 対局中のルール変更モード
  // 対局中のルール変更（この対局の gameConfig にだけ反映。リーグの既定は変えない）
  const patchGameRules = (patch) => setGameConfig(g => g ? ({ ...g, rules: { ...(g.rules || {}), ...patch } }) : g);
  const patchMatchType = (mt) => setGameConfig(g => g ? ({ ...g, matchType: mt }) : g);
  const [ronRuleWarn, setRonRuleWarn] = useState(false);     // 複数ロンがルールを超えたときの確認
  const [reviewing, setReviewing] = useState(false);         // 結果画面から修正に戻っている状態
  const [showScoreFix, setShowScoreFix] = useState(false);   // 点数の直接修正

  const WIND_ORDER = SEATS_OF(PC);
  const resetSeatDraw = () => {
    const winds = [...SEATS_OF(PC)];
    for (let i = winds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [winds[i], winds[j]] = [winds[j], winds[i]];
    }
    setSeatTiles(winds.map(w => ({ wind: w, by: null })));
    setSeatTurn(0);
    setSeatDone(false);
  };
  const drawSeatTile = (pos) => {
    if (seatDone || seatTiles[pos]?.by !== null) return;
    const next = seatTiles.map((s, i) => i === pos ? { ...s, by: seatTurn } : s);
    setSeatTiles(next);
    try { if (navigator.vibrate) navigator.vibrate(10); } catch {}
    if (seatTurn + 1 >= PC) {
      // 全員引き終わり → 席順にプレイヤーを並べ替える
      const byWind = {};
      next.forEach(s => { byWind[s.wind] = s.by; });
      setPlayers(prev => {
        const seated = WIND_ORDER.map(w => prev[byWind[w]]);
        // 使っていない席（三麻の北）の名前はそのまま後ろに残す
        return seated.concat(prev.slice(PC));
      });
      setSeatDone(true);
    } else {
      setSeatTurn(seatTurn + 1);
    }
  };

  // ══════════════════════════════════
  // ── リーグ戦 ──
  // ══════════════════════════════════
  const UMA_PRESETS = [
    { key: "5-10",  label: "5-10",  uma: [10, 5, -5, -10],   note: "小さめ" },
    { key: "10-20", label: "10-20", uma: [20, 10, -10, -20], note: "標準" },
    { key: "10-30", label: "10-30", uma: [30, 10, -10, -30], note: "順位重視" },
    { key: "20-30", label: "20-30", uma: [30, 20, -20, -30], note: "大きめ" },
    { key: "none",  label: "なし",  uma: [0, 0, 0, 0],       note: "素点のみ" },
  ];

  const [leagues, setLeagues] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mj_leagues") || "[]"); } catch { return []; }
  });
  const saveLeagues = (arr) => {
    setLeagues(arr);
    try { localStorage.setItem("mj_leagues", JSON.stringify(arr)); } catch {}
  };
  const [leagueId, setLeagueId] = useState(null);      // 開いているリーグ
  const [leagueTab, setLeagueTab] = useState("stand"); // stand | games | info
  const [activeLeagueId, setActiveLeagueId] = useState(null); // 進行中の対局がひもづくリーグ
  const [lgDraft, setLgDraft] = useState(null);        // 作成・編集中のリーグ
  const [lgPick, setLgPick] = useState([]);            // その対局に出る4人
  const [lgMatchType, setLgMatchType] = useState("hanchan"); // 形式は対局ごとに決める
  const [showUmaHelp, setShowUmaHelp] = useState(false); // ウマ・オカの説明を開く

  const curLeague = leagues.find(l => l.id === leagueId) || null;

  // 五捨六入（0.5は切り捨て、0.6から切り上げ）
  const goshaRokunyu = (v) => {
    const s = v < 0 ? -1 : 1;
    const a = Math.abs(v);
    const f = Math.floor(a);
    return s * (a - f > 0.5 ? f + 1 : f);
  };

  // 1回ぶんの精算（素点 → pt）
  const calcGamePts = (scores4, seatOrder, lg) => {
    const startPt = lg.rules?.startPoints ?? 25000;
    const returnPt = lg.rules?.returnPoints ?? 30000;
    const uma = lg.uma || [20, 10, -10, -20];
    // 同点は起家に近い席（配列の先頭に近い）を上位とする
    const ranked = scores4
      .map((s, i) => ({ i, s, seat: seatOrder ? seatOrder[i] : i }))
      .sort((a, b) => (b.s - a.s) || (a.seat - b.seat));
    const pcN = scores4.length;
    const okaPool = (returnPt - startPt) * pcN;
    const out = new Array(pcN);
    ranked.forEach((r, rank) => {
      const raw = r.s - returnPt + (rank === 0 ? okaPool : 0);
      out[r.i] = { rank: rank + 1, pt: goshaRokunyu(raw / 1000) + uma[rank] };
    });
    return out;
  };

  // 通算成績
  const leagueStandings = (lg) => {
    if (!lg) return [];
    const rows = lg.members.map(name => ({
      name, games: 0, pt: 0, rankSum: 0, ranks: [0, 0, 0, 0],
      best: null, worst: null, tobi: 0,
    }));
    const byName = Object.fromEntries(rows.map(r => [r.name, r]));
    (lg.games || []).forEach(g => {
      g.players.forEach((nm, i) => {
        const r = byName[nm];
        if (!r) return;
        r.games++;
        r.pt += g.pts[i];
        r.rankSum += g.ranks[i];
        r.ranks[g.ranks[i] - 1]++;
        if (r.best === null || g.pts[i] > r.best) r.best = g.pts[i];
        if (r.worst === null || g.pts[i] < r.worst) r.worst = g.pts[i];
        if (g.scores[i] < 0) r.tobi++;
      });
    });
    rows.forEach(r => {
      r.avgRank = r.games ? r.rankSum / r.games : 0;
      r.topRate = r.games ? r.ranks[0] / r.games : 0;
      r.lastRate = r.games ? r.ranks[(lg.playerCount || 4) - 1] / r.games : 0;
    });
    return rows.sort((a, b) => b.pt - a.pt || a.avgRank - b.avgRank);
  };

  // リーグの進捗
  const leagueProgress = (lg) => {
    const played = (lg.games || []).length;
    if (lg.mode === "count") {
      return { played, target: lg.targetCount, pct: Math.min(1, played / (lg.targetCount || 1)) };
    }
    if (lg.mode === "period" && lg.endDate) {
      const today = new Date().toISOString().slice(0, 10);
      return { played, target: null, endDate: lg.endDate, over: today > lg.endDate };
    }
    return { played, target: null };
  };

  const newLeagueDraft = () => {
    const d = new Date();
    const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
    const end = new Date(d.getTime() + 1000 * 60 * 60 * 24 * 30);
    return {
      id: "lg_" + Date.now(),
      name: "",
      playerCount: 4,                  // 4=四人麻雀 / 3=三人麻雀
      members: [...presetNames].slice(0, 4),
      mode: "count",
      targetCount: 10,
      startDate: iso(d),
      endDate: iso(end),
      rules: { ...defaultRules },
      umaKey: "10-20",
      uma: [20, 10, -10, -20],
      status: "active",
      games: [],
      createdAt: Date.now(),
    };
  };

  const FACTORY_RULES = {
    tenpaiRenchan: false,   // テンパイ連荘
    agariRenchan: true,     // あがり連荘のみ
    kuitan: true,           // 食いタン
    atozuke: true,          // 後付け
    kiriage: false,         // 切り上げ満貫（4翻30符・3翻60符を満貫扱い）
    doubleYakuman: false,   // ダブル役満（役満の複合を2倍・3倍で計算）
    honbaUnit: 300,         // 1本場の点数（三麻連盟ルールは600）
    rate: 0,                // レート（1点あたりの単位）。0=なし
    rateUnit: "G",          // レートの単位名（3文字以内）
    kazoeYakuman: true,     // 数え役満（OFFなら11翻以上は三倍満どまり）
    orasYame: true,         // オーラスで親がトップなら終了（アガリやめ・テンパイやめ）
    multiRon: "atamahane",  // 複数ロン: "atamahane"=頭ハネ / "double"=ダブロンまで / "triple"=トリプルロンまで
    startPoints: 30000,     // 持ち点
    returnPoints: 30000,    // 返し点
    tobiEnd: true,          // 持ち点が0未満になったら終了（トビ・ハコ下）
    umaKey: "none",         // ウマ（順位点）
    uma: [0, 0, 0, 0],
  };
  const loadDefaultRules = () => {
    try {
      const v = JSON.parse(localStorage.getItem("mj_default_rules") || "null");
      const r = v ? { ...FACTORY_RULES, ...v } : { ...FACTORY_RULES };
      // 返し点は必ず持ち点以上
      if (r.returnPoints < r.startPoints) r.returnPoints = r.startPoints;
      return r;
    } catch { return { ...FACTORY_RULES }; }
  };
  const [defaultRules, setDefaultRules] = useState(loadDefaultRules);
  // 前回の対局で実際に使ったルール
  const [lastRules, setLastRules] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mj_last_rules") || "null"); } catch { return null; }
  });
  const saveDefaultRules = (r) => {
    setDefaultRules(r);
    try { localStorage.setItem("mj_default_rules", JSON.stringify(r)); } catch {}
  };
  const [rules, setRules] = useState(loadDefaultRules);
  // 設定画面の「ルールの初期値」は下書き → 確定ボタンで保存
  const [draftRules, setDraftRules] = useState(loadDefaultRules);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);  // ルール詳細の展開
  // 前回のルールが無い（初回）ときは最初から開いておく
  React.useEffect(() => { if (!lastRules) setRulesOpen(true); }, [lastRules]);
  const rulesDirty = JSON.stringify(draftRules) !== JSON.stringify(defaultRules);
  const editDraft = (patch) => { setDraftRules(d => ({ ...d, ...patch })); setRulesSaved(false); };
  const commitDraftRules = () => {
    saveDefaultRules({ ...draftRules });
    setRulesSaved(true);
    setTimeout(() => setRulesSaved(false), 2500);
  };

  // ── Game state ──
  const [scores, setScores] = useState([25000, 25000, 25000, 25000]);
  const [rounds, setRounds] = useState([]);
  const [dealerIdx, setDealerIdx] = useState(0);
  const [roundWind, setRoundWind] = useState("東");
  const [honba, setHonba] = useState(0);
  const [riichiBets, setRiichiBets] = useState(0);
  // 実況リーチ: 宣言した時点で1000点減算・供託に加算（この局で宣言済みの人）
  const [declaredRiichi, setDeclaredRiichi] = useState([false, false, false, false]);

  const toggleDeclaredRiichi = (i) => {
    setDeclaredRiichi(prev => {
      const next = [...prev];
      const wasDeclared = next[i];
      next[i] = !wasDeclared;
      setScores(s => { const ns = [...s]; ns[i] += wasDeclared ? 1000 : -1000; return ns; });
      setRiichiBets(b => b + (wasDeclared ? -1 : 1));
      return next;
    });
  };
  const [gameFinished, setGameFinished] = useState(false);
  const [showExtendConfirm, setShowExtendConfirm] = useState(false); // tonpu → hanchan extension // natural game end

  // 終局時に卓上へ残った供託リーチ棒（オーラス流局など）はトップが受け取る
  const [kyotakuAward, setKyotakuAward] = useState(null); // { idx, n } 表示用
  React.useEffect(() => {
    if (gameFinished && riichiBets > 0) {
      const n = riichiBets;
      // トップ判定（同点は起家に近い席が上位）
      const top = scores.map((v, i) => ({ v, i })).sort((a, b) => (b.v - a.v) || (a.i - b.i))[0].i;
      setScores(s => { const ns = [...s]; ns[top] += n * 1000; return ns; });
      setKyotakuAward({ idx: top, n });
      setRiichiBets(0);
    }
    if (!gameFinished) setKyotakuAward(null);
  }, [gameFinished, riichiBets]);

  // ── Calc wizard ──
  const [calcStep, setCalcStep] = useState(0);
  const [cTsumo, setCTsumo] = useState(null);
  const [cParent, setCParent] = useState(null);
  const [cHan, setCHan] = useState(null);
  const [cFu, setCFu] = useState(null);
  const resetCalc = useCallback(() => { setCalcStep(0); setCTsumo(null); setCParent(null); setCHan(null); setCFu(null); setGKnownNaki(null); setFuGuide(null); setFuGuideStep(0); }, []);
  const calcResult = useMemo(() => {
    if (cHan === null || cFu === null || cParent === null || cTsumo === null) return null;
    return calcScore(cFu, cHan, cParent, cTsumo, rules.kiriage);
  }, [cHan, cFu, cParent, cTsumo, rules.kiriage]);
  const calcLimit = useMemo(() => cHan !== null ? getLimitName(cHan) : null, [cHan]);

  // ── Game round wizard ──
  const [gStep, setGStep] = useState(0);
  const [gWinner, setGWinner] = useState(null);
  // ダブロン／トリプルロン: 複数人の手を順番に入力するためのキュー
  const [multiRon, setMultiRon] = useState(null); // { loser, queue:[idx], done:[{winner,han,fu,result,limitName}] }
  const [ronPick, setRonPick] = useState([]);     // 和了者の複数選択
  const [ronLoserPick, setRonLoserPick] = useState(null); // 放銃者の選択（確定ボタンで進む）
  const [gTsumo, setGTsumo] = useState(null);
  const [gLoser, setGLoser] = useState(null);
  const [gHan, setGHan] = useState(null);
  const [gFu, setGFu] = useState(null);
  const [showGW, setShowGW] = useState(false);
  const [gRiichi, setGRiichi] = useState([false, false, false, false]); // who declared riichi this round
  // Fu guide state
  const [fuGuide, setFuGuide] = useState(null); // null=not started, object={mentsu, machi, jantou}
  const [fuGuideStep, setFuGuideStep] = useState(0); // wizard step
  // 役ピッカーで答えた「鳴きの有無」を符ガイドに引き継ぐ（同じ質問を2回しない）
  const [gKnownNaki, setGKnownNaki] = useState(null); // null=未回答 / true / false

  // ── 役から翻数を計算するピッカー ──
  const [yakuPickerOpen, setYakuPickerOpen] = useState(false);
  const [pickedYaku, setPickedYaku] = useState([]);
  const [pickerNaki, setPickerNaki] = useState(null);
  const [pickerDora, setPickerDora] = useState(0);
  const [pickerUra, setPickerUra] = useState(0);   // 裏ドラ

  const resetYakuPicker = () => { setPickedYaku([]); setPickerNaki(null); setPickerDora(0); setPickerUra(0); setYakuPickerOpen(false); };

  // 対局中は対局ルール、それ以外（単独計算機）は現在のルール
  const activePickerRules = () => (gameStarted && gameConfig && gameConfig.rules) ? gameConfig.rules : rules;

  const pickerTotalHan = () => {
    const dbl = activePickerRules().doubleYakuman === true;
    let total = 0;
    let yakumanCount = 0;
    pickedYaku.forEach(name => {
      const y = YAKU_DATA.find(x => x.name === name);
      if (!y) return;
      const h = pickerNaki ? y.naki : y.han;
      if (h === null) return;
      if (h >= 13) { yakumanCount++; return; }
      total += h;
    });
    if (yakumanCount > 0) return dbl ? 13 * yakumanCount : 13; // 役満はドラ・通常役を加算しない
    // 数え役満なしのルールでは、通常役の合計は三倍満（12翻）どまり
    const cap = activePickerRules().kazoeYakuman === false ? 12 : 13;
    return Math.min(total + pickerDora + pickerUra, cap);
  };
  const resetFuGuide = () => { setFuGuide(null); setFuGuideStep(0); };
  const initFuGuide = () => {
    // リーチしている＝門前が確定しているので「鳴きましたか？」は飛ばす
    // （実況リーチ・ウィザードのリーチ棒入力のどちらでも）
    const riichiWinner = gWinner !== null && (declaredRiichi[gWinner] || gRiichi[gWinner]);
    // 役ピッカーで鳴きの有無に回答済みなら、その答えを引き継いで質問を省く
    const known = riichiWinner ? false : gKnownNaki;
    setFuGuide({ naki: known !== null ? known : null, mentsu: [], machi: "ryanmen", jantou: "suuhai", pinfu: false, chiitoi: false, kuipin: false });
    setFuGuideStep(known !== null ? 1 : 0);
  };
  const [showFuHelp, setShowFuHelp] = useState(false);
  const MENTSU_OPTIONS = [
    { id: "minko_c", label: "明刻(中張)", fu: 2, desc: "ポンした2〜8の牌の3枚組" },
    { id: "minko_y", label: "明刻(么九)", fu: 4, desc: "ポンした1,9,字牌の3枚組" },
    { id: "anko_c", label: "暗刻(中張)", fu: 4, desc: "自力で揃えた2〜8の3枚組" },
    { id: "anko_y", label: "暗刻(么九)", fu: 8, desc: "自力で揃えた1,9,字牌の3枚組" },
    { id: "minkan_c", label: "明槓(中張)", fu: 8, desc: "ポンから追加した2〜8の4枚組" },
    { id: "minkan_y", label: "明槓(么九)", fu: 16, desc: "ポンから追加した1,9,字牌の4枚組" },
    { id: "ankan_c", label: "暗槓(中張)", fu: 16, desc: "自力で揃えた2〜8の4枚組" },
    { id: "ankan_y", label: "暗槓(么九)", fu: 32, desc: "自力で揃えた1,9,字牌の4枚組" },
  ];
  const MACHI_OPTIONS = [
    { id: "ryanmen", label: "両面", fu: 0, desc: "例: 45で3と6待ち" },
    { id: "shanpon", label: "シャンポン", fu: 0, desc: "2組の対子でどちらか待ち" },
    { id: "kanchan", label: "カンチャン", fu: 2, desc: "例: 46で5待ち（間の牌）" },
    { id: "penchan", label: "ペンチャン", fu: 2, desc: "例: 12で3待ち（端の牌）" },
    { id: "tanki", label: "タンキ", fu: 2, desc: "雀頭の片方1枚待ち" },
  ];
  const JANTOU_OPTIONS = [
    { id: "suuhai", label: "数牌/オタ風", fu: 0, desc: "数牌や役がつかない風牌" },
    { id: "yakuhai", label: "役牌", fu: 2, desc: "白發中・場風・自風" },
  ];
  const calcFuFromGuide = (guide, isTsumo) => {
    if (!guide) return 30;
    // 七対子は25符固定
    if (guide.chiitoi) return 25;
    // クイピン形（鳴き＋順子のみ＋両面待ち＋雀頭が役牌以外）= 副底20符ちょうど → 30符に繰り上げ
    if (guide.kuipin) return 30;
    // 鳴きの有無は明示的な回答のみで判定する
    // （門前ロンのシャンポンで完成した明刻を数えても、門前加符が消えないように）
    const hasNaki = guide.naki === true;
    // 平和の特例
    if (guide.pinfu) {
      if (isTsumo) return 20;       // 平和ツモ = 20符固定（ツモ符なし）
      return 30;                    // 平和ロン(門前) = 30符固定
    }
    let base = 20;                              // 副底
    if (isTsumo) base += 2;                     // ツモ符
    else if (!hasNaki) base += 10;              // 門前加符
    let mentsuFu = 0;
    guide.mentsu.forEach(m => { const opt = MENTSU_OPTIONS.find(o => o.id === m); if (opt) mentsuFu += opt.fu; });
    const machiOpt = MACHI_OPTIONS.find(o => o.id === guide.machi);
    const jantouOpt = JANTOU_OPTIONS.find(o => o.id === guide.jantou);
    let total = base + mentsuFu + (machiOpt?.fu || 0) + (jantouOpt?.fu || 0);
    // 鳴きで20符ちょうど（クイピン形）は30符に繰り上げ
    if (hasNaki && !isTsumo && total === 20) total = 30;
    return Math.ceil(total / 10) * 10;
  };
  const resetGW = useCallback(() => { setGStep(0); setGWinner(null); setGTsumo(null); setGLoser(null); setGHan(null); setGFu(null); setGRiichi([false,false,false,false]); setFuGuide(null); setGKnownNaki(null); setShowGW(false); setCorrectingIdx(null); }, []);

  // Score correction: which round index is being corrected
  const [correctingIdx, setCorrectingIdx] = useState(null);

  // 流局の修正: その局のテンパイ内容を再入力させる（本場・供託は維持）
  const openDrawCorrection = (idx) => {
    const r = rounds[idx];
    if (!r || !r.draw) return;
    setCorrectingDrawIdx(idx);
    setDrawTenpai([...(r.tenpai || [false, false, false, false])]);
    if (tableMode) { setTmDrawMode(true); setShowDrawWiz(false); }
    else setShowDrawWiz(true);
  };

  const openCorrectionWizard = (idx) => {
    const r = rounds[idx];
    if (!r || r.draw) return;
    setGWinner(r.winner);
    setGTsumo(r.tsumo);
    setGLoser(r.loser !== undefined ? r.loser : null);
    setGHan(r.han);
    setGFu(r.fu || 30);
    setGRiichi(r.riichi || [false,false,false,false]);
    setFuGuide(null);
    setCorrectingIdx(idx);
    setEditingRoundIdx(null);
    setShowGW(true);
    setGStep(7);
  };

  // Draw (ryuukyoku) wizard
  const [showDrawWiz, setShowDrawWiz] = useState(false);
  const [drawTenpai, setDrawTenpai] = useState([false, false, false, false]); // who is tenpai
  const [correctingDrawIdx, setCorrectingDrawIdx] = useState(null); // 修正中の流局の局番号
  const resetDrawWiz = useCallback(() => { setShowDrawWiz(false); setDrawTenpai([false, false, false, false]); }, []);
  const gParent = gWinner !== null ? gWinner === dealerIdx : false;
  const gLimit = gHan !== null ? getLimitName(gHan) : null;
  const gResult = useMemo(() => {
    if (gHan === null || gTsumo === null) return null;
    return calcScore(gHan >= 5 ? 30 : (gFu || 30), gHan, gParent, gTsumo, gameConfig?.rules?.kiriage, PC);
  }, [gHan, gFu, gParent, gTsumo, gameConfig]);

  // 和了後の親の進行・終局判定（単独ロン/ツモとダブロンで共用）
  const advanceAfterWin = useCallback((dealerWon, ns) => {
    const cfg = gameConfig || {};
    const lastWi = WINDS.indexOf(LAST_WIND(cfg.matchType));
    const curWi = WINDS.indexOf(roundWind);
    const isOrlast = dealerIdx === PC - 1 && curWi >= lastWi;
    if (!dealerWon) {
      const next = (dealerIdx + 1) % PC;
      if (cfg.matchType === "tonpu" && next === 0) {
        setShowExtendConfirm(true);
      } else if (next === 0 && curWi >= lastWi) {
        setGameFinished(true);
      } else {
        setDealerIdx(next);
        setHonba(0);
        if (next === 0) { const wi = WINDS.indexOf(roundWind); if (wi >= 0 && wi < 3) setRoundWind(WINDS[wi + 1]); }
      }
    } else {
      if (isOrlast) {
        const parentScore = ns[dealerIdx];
        const isTop = ns.every((s, i) => i === dealerIdx || parentScore > s);
        if (isTop && (cfg.rules || {}).orasYame !== false) {
          if (cfg.matchType === "tonpu") setShowExtendConfirm(true);
          else setGameFinished(true);
        } else {
          setHonba(h => h + 1);
        }
      } else {
        setHonba(h => h + 1);
      }
    }
    setRiichiBets(0);
    setDeclaredRiichi([false, false, false, false]);
    // 箱下（トビ）で終了
    if ((cfg.rules || {}).tobiEnd !== false && ns.some(s => s < 0)) setGameFinished(true);
  }, [gameConfig, dealerIdx, roundWind, PC]);

  // ダブロン／トリプルロンの確定処理
  const finalizeMultiRon = useCallback((entries, loser) => {
    const ns = [...scores], hb = honba * HU();
    const riichiThisRound = gRiichi.filter(Boolean).length;
    for (let i = 0; i < PC; i++) { if (gRiichi[i]) ns[i] -= 1000; }
    const pool = (riichiBets + riichiThisRound) * 1000;
    // 頭ハネ順（放銃者の下家から反時計回りに近い順）。本場と供託は頭の一人が総取り
    const sorted = [...entries].sort(
      (a, b) => ((a.winner - loser + PC) % PC) - ((b.winner - loser + PC) % PC)
    );
    sorted.forEach((e, k) => {
      ns[e.winner] += e.result.total + (k === 0 ? hb + pool : 0);
      ns[loser] -= e.result.total + (k === 0 ? hb : 0);
    });
    setScores(ns);

    const newRounds = [...rounds];
    sorted.forEach((e, k) => {
      newRounds.push({
        id: newRounds.length + 1, wind: roundWind, dealer: dealerIdx,
        honba: k === 0 ? honba : 0,          // 本場は頭の一人ぶんだけ記録（再計算の二重加算を防ぐ）
        winner: e.winner, loser, han: e.han, fu: e.fu,
        score: e.result.total, tsumo: false, limitName: e.limitName,
        riichi: k === 0 ? [0, 1, 2, 3].map(i => !!(gRiichi[i] || declaredRiichi[i])) : [false, false, false, false],
        pool: k === 0 ? pool : 0,
        multiRon: sorted.length, multiRonHead: k === 0,
      });
    });
    setRounds(newRounds);
    advanceAfterWin(sorted.some(e => e.winner === dealerIdx), ns);
    setMultiRon(null);
    setRonPick([]);
    resetGW();
  }, [scores, honba, gRiichi, riichiBets, rounds, roundWind, dealerIdx, advanceAfterWin, resetGW]);

  // 全局を最初から再計算する（局修正用）
  // 供託は保存値（pool）を信用せず、履歴のリーチから毎回導出する。
  // これにより修正でリーチの有無を変えても点棒の総量が狂わない。
  const recalcAllRounds = (roundList, cfg) => {
    const sp = cfg.rules?.startPoints || 30000;
    const ns = Array(PC).fill(sp);
    let carry = 0; // 卓上に残っている供託（本数）
    const fixed = roundList.map(r => {
      const rc = r.riichi ? r.riichi.filter(Boolean).length : 0;
      if (r.riichi) { for (let i = 0; i < PC; i++) { if (r.riichi[i]) ns[i] -= 1000; } }
      if (r.draw) {
        carry += rc; // 流局のリーチ棒は次の和了へ持ち越し
        const tc = r.tenpai ? r.tenpai.filter(Boolean).length : 0;
        const nc = PC - tc;
        if (tc > 0 && tc < PC) {
          const nPay = Math.floor(3000 / nc), tGet = Math.floor(3000 / tc);
          for (let i = 0; i < PC; i++) { if (r.tenpai[i]) ns[i] += tGet; else ns[i] -= nPay; }
        }
        return r;
      }
      const res = calcScore(r.han >= 5 ? 30 : (r.fu || 30), r.han, r.winner === r.dealer, r.tsumo, cfg.rules?.kiriage, PC);
      const pool2 = (carry + rc) * 1000; // ダブロンの2人目以降は riichi 空・carry 0 なので自然に 0 になる
      carry = 0;
      const hb2 = r.honba * ((cfg.rules && cfg.rules.honbaUnit) || 300);
      const payers = PC - 1;
      if (r.tsumo) {
        if (isSanma || r.winner === r.dealer) { for (let i = 0; i < PC; i++) { if (i === r.winner) ns[i] += res.each * payers + hb2 + pool2; else ns[i] -= res.each + Math.floor(hb2 / payers); } }
        else { for (let i = 0; i < PC; i++) { if (i === r.winner) ns[i] += res.total + hb2 + pool2; else if (i === r.dealer) ns[i] -= res.fromParent + Math.floor(hb2 / payers); else ns[i] -= res.fromChild + Math.floor(hb2 / payers); } }
      } else { ns[r.winner] += res.total + hb2 + pool2; ns[r.loser] -= res.total + hb2; }
      return { ...r, pool: pool2, score: res.total }; // 表示用のpool・scoreも導出値で上書き
    });
    return { scores: ns, rounds: fixed, carry };
  };

  const applyRound = useCallback(() => {
    if (gWinner === null || !gResult) return;

    if (correctingIdx !== null) {
      // CORRECTION MODE: replace the old round and recalculate everything
      const cfg = gameConfig || {};
      const correctedRound = { ...rounds[correctingIdx], winner: gWinner, loser: gLoser, han: gHan, fu: gHan >= 5 ? null : gFu, score: gResult.total, tsumo: gTsumo, limitName: gLimit, riichi: [...gRiichi] };
      const newRounds = [...rounds];
      newRounds[correctingIdx] = correctedRound;

      // 全局を再計算（供託は履歴から導出）
      const recalced = recalcAllRounds(newRounds, cfg);
      const newScores = [...recalced.scores];
      // 現在宣言中の実況リーチ分を復元（宣言時に既に-1000されている状態）
      let liveCount = 0;
      for (let i = 0; i < PC; i++) { if (declaredRiichi[i]) { newScores[i] -= 1000; liveCount++; } }
      setRounds(recalced.rounds);
      setScores(newScores);
      setRiichiBets(recalced.carry + liveCount);
      resetGW();
      return;
    }

    // ── ダブロン／トリプルロン: 一人ぶん入力し終えたので次へ ──
    if (multiRon && multiRon.queue.length > 0) {
      const entry = { winner: gWinner, han: gHan, fu: gHan >= 5 ? null : gFu, result: gResult, limitName: gLimit };
      const done = [...multiRon.done, entry];
      const queue = multiRon.queue.slice(1);
      if (queue.length > 0) {
        setMultiRon({ ...multiRon, done, queue });
        setGWinner(queue[0]);
        setGTsumo(false);
        setGLoser(multiRon.loser);
        setGHan(null); setGFu(null); setFuGuide(null); setGKnownNaki(null);
        setGStep(5); setShowGW(true);
        return;
      }
      finalizeMultiRon(done, multiRon.loser);
      return;
    }

    // NORMAL MODE
    const ns = [...scores], hb = honba * HU();
    // Riichi: deduct 1000 from each riichi declarer
    const riichiThisRound = gRiichi.filter(Boolean).length;
    for (let i = 0; i < PC; i++) { if (gRiichi[i]) ns[i] -= 1000; }
    // Total riichi pool = previous supply + this round's riichi
    const totalRiichiPool = (riichiBets + riichiThisRound) * 1000;

    const payers = PC - 1;
    if (gTsumo) {
      if (isSanma || gParent) {
        // 三麻は子のツモも均等払い（親かぶりなし）
        for (let i = 0; i < PC; i++) { if (i === gWinner) ns[i] += gResult.each * payers + hb + totalRiichiPool; else ns[i] -= gResult.each + Math.floor(hb / payers); }
      } else {
        for (let i = 0; i < PC; i++) { if (i === gWinner) ns[i] += gResult.total + hb + totalRiichiPool; else if (i === dealerIdx) ns[i] -= gResult.fromParent + Math.floor(hb / payers); else ns[i] -= gResult.fromChild + Math.floor(hb / payers); }
      }
    } else {
      if (gLoser === null) return;
      ns[gWinner] += gResult.total + hb + totalRiichiPool;
      ns[gLoser] -= gResult.total + hb;
    }
    setScores(ns);
    // この局でリーチした人（ウィザードでの入力＋卓上で宣言済みの人）
    const roundRiichi = [0, 1, 2, 3].map(i => !!(gRiichi[i] || declaredRiichi[i]));
    const newRounds = [...rounds, { id: rounds.length + 1, wind: roundWind, dealer: dealerIdx, honba, winner: gWinner, loser: gLoser, han: gHan, fu: gHan >= 5 ? null : gFu, score: gResult.total, tsumo: gTsumo, limitName: gLimit, riichi: roundRiichi, pool: totalRiichiPool }];
    setRounds(newRounds);

    // Advance dealer / check game end
    advanceAfterWin(gWinner === dealerIdx, ns);
    resetGW();
  }, [gWinner, gLoser, gResult, gTsumo, gParent, gHan, gFu, gLimit, gRiichi, scores, honba, riichiBets, dealerIdx, rounds, roundWind, resetGW, gameConfig, correctingIdx, multiRon, finalizeMultiRon, advanceAfterWin]);

  // Handle ryuukyoku (draw) - called after tenpai selection
  const applyDraw = useCallback(() => {
    const cfgAll = gameConfig || {};

    // ── 流局の修正モード: テンパイの内容だけ差し替えて全体を再計算 ──
    if (correctingDrawIdx !== null) {
      const newRounds = [...rounds];
      // 本場はそのまま維持し、テンパイだけ上書きする（供託は履歴から再導出）
      newRounds[correctingDrawIdx] = { ...newRounds[correctingDrawIdx], tenpai: [...drawTenpai] };
      const recalced = recalcAllRounds(newRounds, cfgAll);
      const newScores = [...recalced.scores];
      let liveCount = 0;
      for (let i = 0; i < PC; i++) { if (declaredRiichi[i]) { newScores[i] -= 1000; liveCount++; } }
      setRounds(recalced.rounds);
      setScores(newScores);
      setRiichiBets(recalced.carry + liveCount);
      setCorrectingDrawIdx(null);
      resetDrawWiz();
      setTmDrawMode(false);
      return;
    }

    const ns = [...scores];
    const cfg = gameConfig || {};
    const tenpaiCount = drawTenpai.slice(0, PC).filter(Boolean).length;
    const notenCount = PC - tenpaiCount;

    // Noten penalty: 3000 points split from noten to tenpai players
    if (tenpaiCount > 0 && tenpaiCount < PC) {
      const notenPay = Math.floor(3000 / notenCount);
      const tenpaiGet = Math.floor(3000 / tenpaiCount);
      for (let i = 0; i < PC; i++) {
        if (drawTenpai[i]) ns[i] += tenpaiGet;
        else ns[i] -= notenPay;
      }
    }

    setScores(ns);
    setHonba(h => h + 1);
    setDeclaredRiichi([false, false, false, false]);
    setRounds(prev => [...prev, { id: prev.length + 1, wind: roundWind, dealer: dealerIdx, honba, draw: true, tenpai: [...drawTenpai], riichi: [...declaredRiichi] }]);

    // Renchan / game-end logic
    const dealerTenpai = drawTenpai[dealerIdx];
    let dealerRotates = false;
    const ruleSet = cfg.rules || {};
    const lastWi2 = WINDS.indexOf(LAST_WIND(cfg.matchType));
    const curWi2 = WINDS.indexOf(roundWind);
    const isOrlast = dealerIdx === PC - 1 && curWi2 >= lastWi2;

    if (ruleSet.agariRenchan) {
      dealerRotates = true; // always rotate on draw
    } else if (ruleSet.tenpaiRenchan) {
      dealerRotates = !dealerTenpai; // rotate if dealer noten
    }
    // else (both off): dealer always stays on draw, just honba increments

    if (dealerRotates) {
      const next = (dealerIdx + 1) % PC;
      if (cfg.matchType === "tonpu" && next === 0) {
        setShowExtendConfirm(true);
      } else if (next === 0 && curWi2 >= lastWi2) {
        setGameFinished(true);
      } else {
        setDealerIdx(next);
        if (next === 0) { const wi = WINDS.indexOf(roundWind); if (wi >= 0 && wi < 3) setRoundWind(WINDS[wi + 1]); }
      }
    } else if (isOrlast) {
      const parentScore = ns[dealerIdx];
      const isTop = ns.every((s, i) => i === dealerIdx || parentScore > s);
      if (isTop && ruleSet.orasYame !== false) {
        if (cfg.matchType === "tonpu") setShowExtendConfirm(true);
        else setGameFinished(true);
      }
    }

    // 箱下（トビ）で終了
    if (ruleSet.tobiEnd !== false && ns.some(s => s < 0)) setGameFinished(true);

    resetDrawWiz();
  }, [scores, honba, dealerIdx, roundWind, gameConfig, drawTenpai, resetDrawWiz, correctingDrawIdx, rounds, declaredRiichi]);

  const startGame = useCallback(() => {
    const sp = rules.startPoints || 25000;
    // 次回「前回と同じ」で始められるよう控えておく
    try { localStorage.setItem("mj_last_rules", JSON.stringify(rules)); } catch {}
    setLastRules({ ...rules });
    const activeLg = activeLeagueId ? leagues.find(l => l.id === activeLeagueId) : null;
    const pcNow = activeLg ? (activeLg.playerCount || 4) : playerCount;
    const cfg = { date: gameDate, matchType, playerCount: pcNow, players: players.slice(0, pcNow), rules: { ...rules } };
    setGameConfig(cfg);
    setScores(Array(pcNow).fill(sp));
    setDealerIdx(0);
    setRoundWind("東");
    setHonba(0);
    setRiichiBets(0);
    setDeclaredRiichi([false, false, false, false]);
    setRounds([]);
    setGameStarted(true);
    setGameFinished(false);
    setTableMode(true);   // 卓上モードで開始
    setTmWinStep(null);
    setTmDrawMode(false);
    // 開始の演出（リーグ名／第N戦、または日付＋席順）
    setStartSplash({
      league: activeLg ? activeLg.name : null,
      gameNo: activeLg ? ((activeLg.games || []).length + 1) : null,
      matchType,
      date: gameDate,
      seats: SEATS_OF(pcNow).map((w, i) => ({ w, name: cfg.players[i] })),
    });
    if (splashTimer.current) clearTimeout(splashTimer.current);
    splashTimer.current = setTimeout(() => setStartSplash(null), 3200);
  }, [gameDate, matchType, players, rules, playerCount, activeLeagueId, leagues]);

  // ── Theme ──
  const t = { bg: "#0c1117", sf: "#161d27", card: "#1c2533", ac: "#5b9bff", acS: "rgba(91,155,255,0.14)", gn: "#34d872", gnS: "rgba(52,216,114,0.14)", rd: "#f26d6d", rdS: "rgba(242,109,109,0.14)", gd: "#f2c14e", gdS: "rgba(242,193,78,0.14)", tx: "#f5f8fc", dm: "#9db0c7", bd: "#35415a" };

  // ── Shared Styles ──
  const card = { background: t.card, borderRadius: 14, padding: 22, marginBottom: 18, border: `1px solid ${t.bd}`, boxSizing: "border-box", maxWidth: "100%", overflow: "hidden", lineHeight: 1.7 };
  const question = { fontSize: 16, fontWeight: 700, margin: "4px 0 20px", textAlign: "center", lineHeight: 1.6, letterSpacing: "0.02em" };
  const bigBtn = (c, s) => ({ flex: "1 1 140px", maxWidth: 200, padding: "20px 8px", border: `2px solid ${c}`, borderRadius: 14, background: s, color: c, fontSize: 20, fontWeight: 800, cursor: "pointer", textAlign: "center", transition: "all 0.12s" });
  const numBtn = (on) => ({ height: 62, padding: "0 2px", border: `2px solid ${on ? t.ac : t.bd}`, borderRadius: 12, background: on ? t.acS : "transparent", color: on ? t.ac : t.tx, fontSize: 19, fontWeight: 800, cursor: "pointer", textAlign: "center", transition: "all 0.1s", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", whiteSpace: "nowrap", letterSpacing: "-0.03em" });
  const actionBtn = (v) => ({ width: "100%", padding: "15px 12px", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 10, boxSizing: "border-box", lineHeight: 1.5, ...(v === "p" ? { background: t.ac, color: "#fff" } : v === "d" ? { background: t.rd, color: "#fff" } : { background: t.sf, color: t.tx, border: `1px solid ${t.bd}` }) });
  const pSelBtn = (on) => ({ padding: "14px 8px", border: `2px solid ${on ? t.ac : t.bd}`, borderRadius: 12, background: on ? t.acS : "transparent", color: on ? t.ac : t.tx, fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "center", flex: 1, transition: "all 0.1s" });
  // 対局ルールの説明（設定・セットアップ・リーグで共用）
  const RuleHelp = () => {
    const [open, setOpen] = React.useState(false);
    const item = (title, body) => (
      <div style={{ padding: "11px 0", borderBottom: `1px solid ${t.bd}44` }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: t.tx, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: "#b9c6d8", lineHeight: 1.9 }}>{body}</div>
      </div>
    );
    return (
      <div style={{ marginTop: 12 }}>
        <button onClick={() => setOpen(v => !v)} style={{
          width: "100%", padding: "11px 8px", borderRadius: 9, cursor: "pointer",
          border: `1px solid ${t.bd}`, background: "transparent", color: t.ac,
          fontSize: 12, fontWeight: 700,
        }}>{open ? "ルールの説明を閉じる" : "それぞれのルールの説明を見る"}</button>

        {open && (
          <div style={{ marginTop: 10, padding: "4px 14px 14px", borderRadius: 11, background: t.sf, border: `1px solid ${t.bd}` }}>
            {item("流局したときの親", <>誰もアガらずに流局したとき、親を続けるかどうかです。<br />
              <b>あがり連荘</b>＝流局したら必ず親が流れる（一般的）。<br />
              <b>テンパイ連荘</b>＝親がテンパイしていれば続行。<br />
              <b>無条件連荘</b>＝ノーテンでも親が続く。<br />
              どのルールでもノーテン罰符3,000点のやりとりと本場の加算は行われます。</>)}

            {item("複数人が同時にロン", <>1つの捨て牌に2人以上がロンを宣言したときの扱いです。<br />
              <b>頭ハネ</b>＝放銃者に近い1人だけがアガリ。<br />
              <b>ダブロン</b>＝2人まで、<b>トリプルロン</b>＝3人まで同時に成立。<br />
              複数で成立する場合、本場と供託は放銃者から反時計回りに最も近い人が受け取ります。</>)}

            {item("食いタン", <>鳴いた状態のタンヤオを認めるかどうかです。認めないルールでは、鳴くと役なしになる場面が増えるため打ち方が大きく変わります。</>)}

            {item("後付け", <>鳴いた時点で役がなくても、アガリの瞬間（ロン・ツモの牌が入った時点）に役が確定していればアガリを認めるかどうかです。役牌をあとからポンして役を付ける「役牌バック」や、役の付く側の牌でだけアガれる「片アガリ」がこれにあたります。認めないルール（先付け）では、鳴いた時点で役が確定している必要があります。</>)}

            {item("切り上げ満貫", <>4翻30符（子7,700・親11,600）と3翻60符を、満貫として扱うルールです。ONにすると子8,000・親12,000になります。</>)}

            {item("ダブル役満", <>大三元＋字一色のように役満が複合したとき、2倍（子64,000・親96,000）・3倍で計算するルールです。OFFでは複合してもシングル役満（子32,000・親48,000）です。「役を選んで計算する」から役満を複数選ぶと適用されます。</>)}

            {item("オーラスは親トップで終了", <>最終局で親がトップの状態でアガる、またはテンパイで流局したときに、そこで対局を終える設定です（アガリやめ・テンパイやめ）。OFFにすると親がトップでも連荘を続けます。</>)}

            {item("トビで終了", <>誰かの持ち点が0未満になった時点で対局を終える設定です。ハコ下・ドボンとも呼びます。OFFにするとマイナスのまま最後まで打ち切ります。</>)}

            {item("持ち点・返し点", <>持ち点は開始時の点数、返し点は精算の基準です。差額の合計がオカとしてトップに渡ります。持ち点と返し点が同じならオカは発生しません。</>)}

            <div style={{ fontSize: 11, color: t.dm, marginTop: 12, lineHeight: 1.9 }}>
              ここに無いルール（責任払い、途中流局、四家立直、九種九牌、三家和など）はアプリでは自動処理していません。
              必要な場合は結果画面の「点数を直接修正」で調整するか、その局を流局として入力してください。
            </div>
          </div>
        )}
      </div>
    );
  };

  // ウマ・オカの設定ブロック（設定画面と対局セットアップで共用）
  const UmaOkaSettings = ({ rules: r, onChange, compact }) => {
    const sp = r.startPoints ?? 25000;
    const rp = r.returnPoints ?? 30000;
    const pcU = (r.uma && r.uma.length === 3) || isSanma ? 3 : 4;
    const uma = r.uma || (pcU === 3 ? [0, 0, 0] : [0, 0, 0, 0]);
    const oka = (rp - sp) * pcU / 1000;
    const [open, setOpen] = React.useState(false);

    // 説明用の例（持ち点に合わせて合計が合うようにする）
    const demo = (pcU === 3 ? [15000, 0, -15000] : [15000, 7000, -7000, -15000]).map(o => sp + o);
    const gosha = (v) => { const s = v < 0 ? -1 : 1, a = Math.abs(v), f = Math.floor(a); return s * (a - f > 0.5 ? f + 1 : f); };
    const ranked = demo.map((s, i) => ({ i, s })).sort((a, b) => (b.s - a.s) || (a.i - b.i));
    const pts = new Array(pcU);
    ranked.forEach((x, rank) => {
      pts[x.i] = { rank: rank + 1, pt: gosha((x.s - rp + (rank === 0 ? (rp - sp) * pcU : 0)) / 1000) + uma[rank] };
    });

    return (
      <div>
        <div style={{ fontSize: compact ? 11 : 12, fontWeight: 700, color: t.dm, marginBottom: 4, letterSpacing: "0.05em" }}>
          ウマ・オカ（順位点）
        </div>
        <div style={{ fontSize: 10, color: t.dm, marginBottom: 9 }}>
          順位によってやりとりするポイント。対局結果の精算に使います
        </div>

        <button onClick={() => setOpen(v => !v)} style={{
          width: "100%", marginBottom: 10, padding: "10px 8px", borderRadius: 9, cursor: "pointer",
          border: `1px solid ${t.bd}`, background: "transparent", color: t.ac, fontSize: 12, fontWeight: 700,
        }}>{open ? "説明を閉じる" : "ウマ・オカとは"}</button>

        {open && (
          <div style={{ marginTop: 10, padding: 14, borderRadius: 11, background: t.sf, border: `1px solid ${t.bd}` }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: t.tx, marginBottom: 6 }}>ウマとは</div>
            <div style={{ fontSize: 12, color: t.tx, lineHeight: 1.95, marginBottom: 12 }}>
              順位に応じてやりとりするポイントです。今の設定「
              <span style={{ color: t.ac, fontWeight: 700 }}>{(pcU === 3 ? UMA_PRESETS_3 : UMA_PRESETS).find(u => u.key === (r.umaKey || "none"))?.label || uma.map(u => (u > 0 ? "+" : "") + u).join(" / ")}</span>
              」だと、1位が{uma[0] >= 0 ? "+" : ""}{uma[0]}、2位が{uma[1] >= 0 ? "+" : ""}{uma[1]}、
              3位が{uma[2]}{pcU === 4 ? `、4位が${uma[3]}` : ""}です。合計はゼロなので、場全体のポイントは増減しません。
              数字が大きいほど、素点より順位の価値が高くなります。
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, color: t.tx, marginBottom: 6 }}>オカとは</div>
            <div style={{ fontSize: 12, color: t.tx, lineHeight: 1.95, marginBottom: 12 }}>
              持ち点より高い点数（返し点）を基準に精算し、その差額をトップが総取りする仕組みです。
              {sp === rp ? (
                <> 今は持ち点と返し点が同じ{sp.toLocaleString()}点なので
                <span style={{ color: t.gd, fontWeight: 700 }}>オカは発生しません</span>。
                トップの取り分を増やすなら、持ち点を返し点より低くしてください
                （例: 持ち点25,000 / 返し点30,000 で{5 * pcU}pt）。</>
              ) : (
                <> 1人あたり{((rp - sp) / 1000)}ptを供出し、合計
                <span style={{ color: t.gd, fontWeight: 700 }}>{oka}pt</span>がトップに乗ります。
                全員のポイントを足すとちょうどゼロになります。</>
              )}
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, color: t.tx, marginBottom: 6 }}>計算の順番</div>
            <div style={{ fontSize: 12, color: t.tx, lineHeight: 1.95, marginBottom: 12 }}>
              ① 素点から返し点を引く<br />
              ② 1,000点単位にして五捨六入（500点以下は切り捨て、600点以上は切り上げ）<br />
              ③ トップにオカを加える<br />
              ④ 順位ごとのウマを加える
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, color: t.tx, marginBottom: 7 }}>今の設定での例</div>
            <div style={{ fontSize: 10, color: t.dm, marginBottom: 7 }}>
              終局時の素点が {demo.map(x => x.toLocaleString()).join(" / ")}（合計 {(sp * pcU).toLocaleString()}点）だった場合
            </div>
            {demo.map((s, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                borderBottom: `1px solid ${t.bd}44`,
              }}>
                <span style={{ width: 26, fontSize: 11, fontWeight: 800, color: pts[i].rank === 1 ? t.gd : t.dm }}>{pts[i].rank}位</span>
                <span style={{ flex: 1, fontSize: 12, color: t.dm, fontVariantNumeric: "tabular-nums" }}>{s.toLocaleString()}</span>
                <span style={{ fontSize: 10, color: t.dm }}>
                  {(s - rp) / 1000 >= 0 ? "+" : ""}{(s - rp) / 1000}
                  {pts[i].rank === 1 && oka !== 0 ? ` +${oka}` : ""}
                  {" "}{uma[pts[i].rank - 1] >= 0 ? "+" : ""}{uma[pts[i].rank - 1]}
                </span>
                <span style={{
                  width: 46, textAlign: "right", fontSize: 14, fontWeight: 900, fontVariantNumeric: "tabular-nums",
                  color: pts[i].pt > 0 ? t.gn : pts[i].pt < 0 ? t.rd : t.tx,
                }}>{pts[i].pt > 0 ? "+" : ""}{pts[i].pt}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: t.dm, marginTop: 8, lineHeight: 1.7 }}>
              合計 {pts.reduce((a2, x) => a2 + x.pt, 0)}pt。同点のときは起家に近い席を上位として扱います。
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 10 }}>
          {(pcU === 3 ? UMA_PRESETS_3 : UMA_PRESETS).map(u => {
            const on = (r.umaKey || "none") === u.key;
            return (
              <button key={u.key} onClick={() => onChange({ umaKey: u.key, uma: u.uma })} style={{
                padding: "11px 8px", borderRadius: 10, cursor: "pointer",
                border: `2px solid ${on ? t.ac : t.bd}`,
                background: on ? t.acS : "transparent",
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: on ? t.ac : t.tx }}>{u.label}</div>
                <div style={{ fontSize: 10, color: t.dm, marginTop: 2 }}>{u.note}</div>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: t.dm, marginBottom: 5 }}>持ち点</div>
            <select value={sp} style={selectStyle}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                onChange({ startPoints: v, returnPoints: Math.max(v, rp) });
              }}>
              {Array.from({length:16},(_,i)=>20000+i*1000).map(v => <option key={v} value={v}>{v.toLocaleString()}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: t.dm, marginBottom: 5 }}>返し点</div>
            <select value={rp} style={selectStyle}
              onChange={e => onChange({ returnPoints: parseInt(e.target.value, 10) })}>
              {Array.from({length:16},(_,i)=>20000+i*1000).filter(v => v >= sp).map(v => <option key={v} value={v}>{v.toLocaleString()}</option>)}
            </select>
          </div>
        </div>

        <div style={{ fontSize: 11, color: t.dm, lineHeight: 1.8 }}>
          オカ = (返し点 − 持ち点) × {pcU} = <span style={{ color: oka === 0 ? t.dm : t.gd, fontWeight: 700 }}>{oka}pt</span>
          {oka === 0 ? " — 発生しません" : " がトップへ"}
        </div>

      </div>
    );
  };

  // 「タップで訂正できる」ことを示す小さなタグ
  const editTag = {
    fontSize: 10, fontWeight: 700, color: t.ac,
    border: `1px solid ${t.ac}55`, background: t.acS,
    borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0,
  };
  const backBtn = {
    background: t.card, border: `1px solid ${t.bd}`, borderRadius: 10,
    color: t.tx, fontSize: 15, fontWeight: 700, cursor: "pointer",
    padding: "12px 18px", marginBottom: 18,
    display: "inline-flex", alignItems: "center", gap: 6,
  };
  const inputStyle = { background: t.sf, border: `1px solid ${t.bd}`, borderRadius: 10, padding: "10px 14px", color: t.tx, fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" };
  const selectStyle = { ...inputStyle, appearance: "none", WebkitAppearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2364748b' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32 };
  const toggleRow = (label, on, onToggle) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${t.bd}33` }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <button onClick={onToggle} style={{
        width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
        background: on ? t.ac : t.bd, position: "relative", transition: "background 0.2s",
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: "50%", background: "#fff",
          position: "absolute", top: 3, left: on ? 25 : 3, transition: "left 0.2s",
        }} />
      </button>
    </div>
  );

  const Dots = ({ total, cur }) => (
    <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 16 }}>
      {[...Array(total)].map((_, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i === cur ? t.ac : i < cur ? t.ac + "66" : t.bd, transition: "all 0.2s" }} />)}
    </div>
  );

  const Back = ({ onClick }) => <button style={backBtn} onClick={onClick}>← 戻る</button>;

  const FuHelpModal = () => (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.92)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', overflowY: "auto" }}>
      <div style={{ width: "100%", maxWidth: 400, paddingBottom: 40 }}>
        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>符計算の解説</span>
            <button style={{ background: "none", border: "none", color: t.dm, fontSize: 18, cursor: "pointer" }} onClick={() => setShowFuHelp(false)}>✕</button>
          </div>

          <div style={{ fontSize: 13, lineHeight: 1.8, color: t.tx }}>
            <div style={{ fontWeight: 700, color: t.ac, marginBottom: 4 }}>基本符</div>
            <div style={{ color: t.dm, marginBottom: 12 }}>ツモあがり = 20符 + ツモ符2{"\n"}ロンあがり（門前）= 30符</div>

            <div style={{ fontWeight: 700, color: t.ac, marginBottom: 4 }}>面子（メンツ）とは？</div>
            <div style={{ color: t.dm, marginBottom: 4 }}>手牌の中の3枚または4枚の組み合わせです。</div>

            <div style={{ background: t.sf, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: t.gn, fontWeight: 700 }}>明刻（ミンコ）</span> = ポンで作った同じ牌3枚
              </div>
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: t.gn, fontWeight: 700 }}>暗刻（アンコ）</span> = 自力で揃えた同じ牌3枚
              </div>
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: t.gn, fontWeight: 700 }}>明槓（ミンカン）</span> = ポンから追加 or 他家から4枚目
              </div>
              <div>
                <span style={{ color: t.gn, fontWeight: 700 }}>暗槓（アンカン）</span> = 自力で揃えた同じ牌4枚
              </div>
            </div>

            <div style={{ background: t.sf, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: t.gd, fontWeight: 700 }}>中張牌（チュウチャン）</span> = 2〜8の数牌
              </div>
              <div>
                <span style={{ color: t.gd, fontWeight: 700 }}>么九牌（ヤオチュウ）</span> = 1, 9, 字牌（東南西北白發中）
              </div>
            </div>

            <div style={{ fontWeight: 700, color: t.ac, marginBottom: 4 }}>待ち（マチ）</div>
            <div style={{ background: t.sf, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>
              <div style={{ marginBottom: 6 }}><span style={{ fontWeight: 700 }}>両面（リャンメン）</span> = 例: 🀇🀈 で 🀆と🀉待ち → 0符</div>
              <div style={{ marginBottom: 6 }}><span style={{ fontWeight: 700 }}>シャンポン</span> = 2つの対子で片方待ち → 0符</div>
              <div style={{ marginBottom: 6 }}><span style={{ fontWeight: 700 }}>カンチャン</span> = 例: 🀇🀉 で間の🀈待ち → +2符</div>
              <div style={{ marginBottom: 6 }}><span style={{ fontWeight: 700 }}>ペンチャン</span> = 例: 🀇🀈 で端の🀉待ち → +2符</div>
              <div><span style={{ fontWeight: 700 }}>タンキ</span> = 雀頭の1枚待ち → +2符</div>
            </div>

            <div style={{ fontWeight: 700, color: t.ac, marginBottom: 4 }}>雀頭（ジャントウ）</div>
            <div style={{ background: t.sf, borderRadius: 8, padding: 10, fontSize: 12 }}>
              <div style={{ marginBottom: 6 }}>あがりの形にある同じ牌2枚のペア（アタマ）</div>
              <div style={{ marginBottom: 4 }}><span style={{ fontWeight: 700 }}>数牌 / オタ風</span> = 0符</div>
              <div><span style={{ fontWeight: 700 }}>役牌（白發中・場風・自風）</span> = +2符</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════
  // ── FU GUIDE WIZARD (step by step) ──
  // ══════════════════════════════════
  // ══════════════════════════════════
  // ── MAHJONG TILE ILLUSTRATION ──
  // ══════════════════════════════════
  // ── 牌の絵柄 ──
  const MAN_KANJI = { "1":"一","2":"二","3":"三","4":"四","5":"五","6":"六","7":"七","8":"八","9":"九" };
  // [cx, cy, r] を viewBox 100x135 で配置
  const PIN_LAYOUT = {
    1: [[50,67,30]],
    2: [[50,38,19],[50,96,19]],
    3: [[26,30,16],[50,67,16],[74,104,16]],
    4: [[31,40,19],[69,40,19],[31,94,19],[69,94,19]],
    5: [[28,34,16],[72,34,16],[50,67,16],[28,100,16],[72,100,16]],
    6: [[30,29,16],[70,29,16],[30,67,16],[70,67,16],[30,105,16],[70,105,16]],
    7: [[24,22,13],[50,40,13],[76,58,13],[29,90,13],[71,90,13],[29,116,13],[71,116,13]],
    8: [[31,24,13],[69,24,13],[31,54,13],[69,54,13],[31,84,13],[69,84,13],[31,114,13],[69,114,13]],
    9: [[24,29,14],[50,29,14],[76,29,14],[24,67,14],[50,67,14],[76,67,14],[24,105,14],[50,105,14],[76,105,14]],
  };
  const SOU_LAYOUT = {
    2: [[50,38],[50,97]],
    3: [[50,32],[30,98],[70,98]],
    4: [[30,38],[70,38],[30,97],[70,97]],
    5: [[29,34],[71,34],[50,67],[29,101],[71,101]],
    6: [[30,29],[70,29],[30,67],[70,67],[30,105],[70,105]],
    7: [[50,24],[29,60],[71,60],[29,90],[71,90],[29,118],[71,118]],
    8: [[30,24],[70,24],[30,54],[70,54],[30,84],[70,84],[30,114],[70,114]],
    9: [[24,29],[50,29],[76,29],[24,67],[50,67],[76,67],[24,105],[50,105],[76,105]],
  };
  const PIN_RED = { 1: [0], 3: [0,2], 5: [2], 7: [0,1,2], 9: [0,1,2] };
  const SOU_RED = { 5: [2], 7: [0], 3: [0] };

  const TileFace = ({ label, sub, size }) => {
    const sv = { width: "100%", height: "100%", display: "block" };
    // 数牌以外（字牌）
    if (!sub) {
      if (label === "白") {
        return (
          <svg viewBox="0 0 100 135" style={sv}>
            <rect x="20" y="26" width="60" height="84" rx="5" fill="none" stroke="#2a5b9e" strokeWidth="5" />
          </svg>
        );
      }
      const col = label === "中" ? "#c0392b" : label === "發" ? "#1a7a3c" : "#1a1a1a";
      return (
        <span style={{ fontSize: size * 0.62, fontWeight: 900, color: col, lineHeight: 1, fontFamily: "serif" }}>{label}</span>
      );
    }
    // 萬子
    if (sub === "萬") {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1, gap: size * 0.04 }}>
          <span style={{ fontSize: size * 0.46, fontWeight: 700, color: "#1a1a1a", fontFamily: "serif" }}>{MAN_KANJI[label] || label}</span>
          <span style={{ fontSize: size * 0.40, fontWeight: 700, color: "#c0392b", fontFamily: "serif" }}>萬</span>
        </div>
      );
    }
    // 筒子
    if (sub === "筒") {
      const n = parseInt(label, 10);
      const pts = PIN_LAYOUT[n] || [];
      const reds = PIN_RED[n] || [];
      return (
        <svg viewBox="0 0 100 135" style={sv}>
          {pts.map(([cx, cy, r], i) => {
            const red = reds.includes(i);
            const outer = red ? "#c0392b" : "#2a5b9e";
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={outer} strokeWidth={r * 0.34} />
                <circle cx={cx} cy={cy} r={r * 0.34} fill={outer} />
              </g>
            );
          })}
        </svg>
      );
    }
    // 索子
    const n = parseInt(label, 10);
    if (n === 1) {
      // 一索は鳥
      return (
        <svg viewBox="0 0 100 135" style={sv}>
          <ellipse cx="50" cy="72" rx="21" ry="27" fill="#1a7a3c" />
          <path d="M50 45 C62 52, 70 66, 64 84 C58 74, 54 62, 50 45 Z" fill="#0e5c2a" />
          <circle cx="50" cy="40" r="12" fill="#1a7a3c" />
          <circle cx="54" cy="38" r="2.6" fill="#fff" />
          <path d="M60 41 L72 45 L60 48 Z" fill="#c0392b" />
          <path d="M44 98 L50 116 L56 98 Z" fill="#c0392b" />
          <path d="M38 104 L30 118 M62 104 L70 118" stroke="#c0392b" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    }
    const pts = SOU_LAYOUT[n] || [];
    const reds = SOU_RED[n] || [];
    const h = n >= 7 ? 25 : n >= 4 ? 32 : 44;
    const w = n >= 7 ? 13 : n >= 4 ? 15 : 18;
    return (
      <svg viewBox="0 0 100 135" style={sv}>
        {pts.map(([cx, cy], i) => {
          const col = reds.includes(i) ? "#c0392b" : "#1a7a3c";
          return (
            <g key={i}>
              <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={w / 2} fill={col} />
              <rect x={cx - w / 2} y={cy - h * 0.20} width={w} height={h * 0.07} fill="#f8f6ef" />
              <rect x={cx - w / 2} y={cy + h * 0.13} width={w} height={h * 0.07} fill="#f8f6ef" />
            </g>
          );
        })}
      </svg>
    );
  };

  const Tile = ({ label, sub, dim, size = 30 }) => (
    <div style={{
      width: size, height: size * 1.35, borderRadius: 4,
      background: dim ? "#2a3444" : "linear-gradient(160deg, #f8f6ef, #e6e1d0)",
      border: `1px solid ${dim ? "#3a4454" : "#c8c2ae"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: dim ? "none" : "0 1px 2px rgba(0,0,0,0.4)",
      flexShrink: 0, overflow: "hidden", padding: size * 0.06, boxSizing: "border-box",
    }}>
      {dim ? null : <TileFace label={label} sub={sub} size={size} />}
    </div>
  );


  // 面子IDごとの牌イラスト定義
  const TILE_EXAMPLES = {
    minko_c:  { tiles: [["5","萬"],["5","萬"],["5","萬"]], note: "ポン（横向き）", naki: true },
    minko_y:  { tiles: [["9","筒"],["9","筒"],["9","筒"]], note: "ポン（横向き）", naki: true },
    anko_c:   { tiles: [["3","索"],["3","索"],["3","索"]], note: "自分で揃える", naki: false },
    anko_y:   { tiles: [["中",""],["中",""],["中",""]], note: "自分で揃える", naki: false },
    minkan_c: { tiles: [["4","萬"],["4","萬"],["4","萬"],["4","萬"]], note: "明カン", naki: true },
    minkan_y: { tiles: [["1","筒"],["1","筒"],["1","筒"],["1","筒"]], note: "明カン", naki: true },
    ankan_c:  { tiles: [["6","索"],["6","索"],["6","索"],["6","索"]], note: "暗カン（両端裏向き）", naki: false, ankan: true },
    ankan_y:  { tiles: [["東",""],["東",""],["東",""],["東",""]], note: "暗カン（両端裏向き）", naki: false, ankan: true },
  };

  const TileSet = ({ mentsuId, size = 26 }) => {
    const ex = TILE_EXAMPLES[mentsuId];
    if (!ex) return null;
    return (
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
        {ex.tiles.map(([lab, sub], i) => {
          // 暗槓は両端が裏向き
          const isDim = ex.ankan && (i === 0 || i === ex.tiles.length - 1);
          // 鳴きは1枚目を横向き表現
          const rotated = ex.naki && i === 0;
          return (
            <div key={i} style={rotated ? { transform: "rotate(90deg)", margin: "0 3px" } : undefined}>
              <Tile label={isDim ? "" : lab} sub={isDim ? "" : sub} dim={isDim} size={size} />
            </div>
          );
        })}
      </div>
    );
  };

  // 待ちのイラスト（手牌と待ち牌を明確に分離、待ち位置をゴースト表示）
  const MACHI_TILES = {
    ryanmen: {
      hand: [["4","萬"],["5","萬"]],
      ghostL: ["3","萬"], ghostR: ["6","萬"],
      wait: [["3","萬"],["6","萬"]],
      desc: "両側どちらでもOK",
    },
    shanpon: {
      hand: [["2","筒"],["2","筒"],["7","索"],["7","索"]],
      wait: [["2","筒"],["7","索"]],
      desc: "どちらかが3枚目に",
    },
    kanchan: {
      hand: [["4","索"],["6","索"]],
      ghostM: ["5","索"],
      wait: [["5","索"]],
      desc: "間の1枚だけ",
    },
    penchan: {
      hand: [["1","萬"],["2","萬"]],
      ghostR: ["3","萬"],
      wait: [["3","萬"]],
      alt: { hand: [["8","筒"],["9","筒"]], ghostL: ["7","筒"], wait: [["7","筒"]] },
      desc: "12→3待ち / 89→7待ち",
    },
    tanki: {
      hand: [["西",""]],
      ghostR: ["西",""],
      wait: [["西",""]],
      desc: "雀頭の相方待ち",
    },
  };

  // ゴースト（透明な待ち牌）
  const GhostTile = ({ label, sub, size = 22 }) => (
    <div style={{
      width: size, height: size * 1.35, borderRadius: 4,
      background: "rgba(34,197,94,0.12)",
      border: `1.5px dashed ${t.gn}`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      flexShrink: 0, opacity: 0.85,
    }}>
      <span style={{ fontSize: size * 0.5, fontWeight: 800, lineHeight: 1, color: t.gn }}>{label}</span>
      {sub && <span style={{ fontSize: size * 0.28, color: t.gn, lineHeight: 1.2 }}>{sub}</span>}
    </div>
  );

  const MachiIllust = ({ machiId, size = 22 }) => {
    const m = MACHI_TILES[machiId];
    if (!m) return null;

    const renderRow = (hand, ghostL, ghostM, ghostR, wait, isKanchan) => (
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 9, color: t.dm, letterSpacing: "0.05em", marginBottom: 4 }}>手牌</span>
          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            {ghostL && <GhostTile label={ghostL[0]} sub={ghostL[1]} size={size} />}
            {isKanchan ? (
              <>
                <Tile label={hand[0][0]} sub={hand[0][1]} size={size} />
                <GhostTile label={ghostM[0]} sub={ghostM[1]} size={size} />
                <Tile label={hand[1][0]} sub={hand[1][1]} size={size} />
              </>
            ) : (
              hand.map(([l, s], i) => <Tile key={i} label={l} sub={s} size={size} />)
            )}
            {ghostR && <GhostTile label={ghostR[0]} sub={ghostR[1]} size={size} />}
          </div>
        </div>
        <div style={{ width: 1, height: size * 1.5, background: t.bd, margin: `14px 12px 0` }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 9, color: t.gn, letterSpacing: "0.05em", marginBottom: 4 }}>待ち牌</span>
          <div style={{ display: "flex", gap: 3 }}>
            {wait.map(([l, s], i) => (
              <div key={i} style={{ border: `2px solid ${t.gn}`, borderRadius: 5, padding: 1 }}>
                <Tile label={l} sub={s} size={size} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );

    return (
      <div style={{ marginTop: 10 }}>
        {renderRow(m.hand, m.ghostL, m.ghostM, m.ghostR, m.wait, machiId === "kanchan")}
        {m.alt && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${t.bd}66` }}>
            {renderRow(m.alt.hand, m.alt.ghostL, m.alt.ghostM, m.alt.ghostR, m.alt.wait, false)}
          </div>
        )}
      </div>
    );
  };

  const FuGuideWizard = ({ onComplete, onBack, isTsumo }) => {
    if (!fuGuide) return null;
    const g = fuGuide;
    const step = fuGuideStep;
    const hasNaki = g.naki === true;
    // 実況リーチ・ウィザードのリーチ棒入力のどちらでも門前確定
    const riichiLocked = gWinner !== null && (declaredRiichi[gWinner] || gRiichi[gWinner]);

    // Total steps depends on path
    const StepLabel = ({ n, total, label }) => (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 5, marginBottom: 10 }}>
          {[...Array(total)].map((_, i) => (
            <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i + 1 === n ? t.ac : i + 1 < n ? t.ac + "66" : t.bd }} />
          ))}
        </div>
        <div style={{ fontSize: 11, color: t.dm, textAlign: "center" }}>{label}</div>
      </div>
    );

    const bigChoice = (label, sub, selected, onClick, color = t.ac, soft = t.acS) => (
      <button onClick={onClick} style={{
        width: "100%", padding: "16px 12px", marginBottom: 8, borderRadius: 12, cursor: "pointer",
        border: `2px solid ${selected ? color : t.bd}`, background: selected ? soft : "transparent",
        color: selected ? color : t.tx, textAlign: "center",
      }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: t.dm, marginTop: 3 }}>{sub}</div>}
      </button>
    );

    const counterRow = (opt) => {
      const count = g.mentsu.filter(x => x === opt.id).length;
      const totalMentsu = g.mentsu.length;
      return (
        <div key={opt.id} style={{
          padding: "10px 12px", marginBottom: 8, borderRadius: 10,
          border: `1px solid ${count > 0 ? t.ac : t.bd}`, background: count > 0 ? t.acS : "transparent",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: count > 0 ? t.ac : t.tx }}>{opt.label}</div>
              <div style={{ fontSize: 10, color: t.dm }}>{opt.fu}符</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button style={{ width: 46, height: 46, borderRadius: 12, border: `1.5px solid ${count > 0 ? t.ac : t.bd}`, background: t.sf, color: count > 0 ? t.ac : t.tx, fontSize: 26, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                onClick={() => { if (count > 0) setFuGuide(gg => ({ ...gg, mentsu: gg.mentsu.filter((x, i) => !(x === opt.id && i === gg.mentsu.indexOf(opt.id))) })); }}>−</button>
              <span style={{ fontSize: 26, fontWeight: 900, width: 34, textAlign: "center", color: count > 0 ? t.ac : t.dm }}>{count}</span>
              <button style={{ width: 46, height: 46, borderRadius: 12, border: `1.5px solid ${totalMentsu >= 4 ? t.bd : t.ac}`, background: totalMentsu >= 4 ? t.sf : t.acS, color: totalMentsu >= 4 ? t.bd : t.ac, fontSize: 26, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                onClick={() => { setFuGuide(gg => gg.mentsu.length >= 4 ? gg : ({ ...gg, mentsu: [...gg.mentsu, opt.id] })); }}>+</button>
            </div>
          </div>
          {/* 牌イラスト */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 6, borderTop: `1px solid ${t.bd}33` }}>
            <TileSet mentsuId={opt.id} size={24} />
            <span style={{ fontSize: 10, color: t.dm, lineHeight: 1.4 }}>{TILE_EXAMPLES[opt.id]?.note}</span>
          </div>
        </div>
      );
    };

    // STEP 0: 鳴きの有無
    if (step === 0) {
      return (
        <div>
          <button style={backBtn} onClick={onBack}>← 戻る</button>
          <StepLabel n={1} total={7} label="STEP 1 / 鳴きの有無" />
          <div style={{ fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>鳴きましたか？</div>
          <div style={{ fontSize: 11, color: t.dm, textAlign: "center", marginBottom: 16 }}>
            ポン・チー・明カンをしたかどうか
          </div>
          <button onClick={() => { setFuGuide(gg => ({ ...gg, naki: false, kuipin: false, mentsu: gg.mentsu.filter(m => !m.startsWith("minko_") && !m.startsWith("minkan_")) })); setFuGuideStep(1); }}
            style={{ width: "100%", padding: "18px 12px", marginBottom: 10, borderRadius: 12, cursor: "pointer",
              border: `2px solid ${t.ac}`, background: t.acS, color: t.ac, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>門前（メンゼン）</div>
            <div style={{ fontSize: 11, color: t.dm, marginTop: 3 }}>鳴いていない → 門前加符10符</div>
          </button>
          <button onClick={() => { setFuGuide(gg => ({ ...gg, naki: true, pinfu: false, chiitoi: false })); setFuGuideStep(1); }}
            style={{ width: "100%", padding: "18px 12px", borderRadius: 12, cursor: "pointer",
              border: `2px solid ${t.gn}`, background: t.gnS, color: t.gn, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>鳴きあり</div>
            <div style={{ fontSize: 11, color: t.dm, marginTop: 3 }}>ポン・チー・明カンをした</div>
          </button>
        </div>
      );
    }

    // STEP 1: 特殊形（平和・七対子）
    if (step === 1) {
      return (
        <div>
          {/* リーチ済みは STEP1 を飛ばしているので戻り先がない */}
          {!riichiLocked &&
            <button style={backBtn} onClick={() => setFuGuideStep(0)}>← 戻る</button>}
          <StepLabel n={2} total={7} label="STEP 2 / 特殊な形" />
          {riichiLocked && (
            <div style={{ fontSize: 11, color: t.rd, textAlign: "center", marginBottom: 10, fontWeight: 700 }}>
              🔴 リーチ済みのため門前で計算します
            </div>
          )}
          <div style={{ fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 16 }}>
            {g.naki ? "特別な形ですか？" : "平和や七対子ですか？"}
          </div>
          {g.naki ? (
            <>
              <div style={{ fontSize: 11, color: t.dm, textAlign: "center", marginBottom: 12, lineHeight: 1.7 }}>
                鳴いているので、平和と七対子は成立しません
              </div>
              <button onClick={() => { setFuGuide(gg => ({ ...gg, kuipin: true, pinfu: false, chiitoi: false })); setFuGuideStep(6); }}
                style={{ width: "100%", padding: "14px 10px", marginBottom: 8, borderRadius: 12, cursor: "pointer", border: `2px solid ${g.kuipin ? t.gn : t.bd}`, background: g.kuipin ? t.gnS : "transparent", color: g.kuipin ? t.gn : t.tx, textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>クイピン形（順子だけの形）</div>
                <div style={{ display: "flex", gap: 1.5, justifyContent: "center", marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Tile label="2" sub="萬" size={17} /><Tile label="3" sub="萬" size={17} /><Tile label="4" sub="萬" size={17} />
                  <span style={{ width: 5 }} />
                  <Tile label="5" sub="筒" size={17} /><Tile label="6" sub="筒" size={17} /><Tile label="7" sub="筒" size={17} />
                  <span style={{ width: 5 }} />
                  <Tile label="3" sub="索" size={17} /><Tile label="4" sub="索" size={17} /><Tile label="5" sub="索" size={17} />
                  <span style={{ width: 5 }} />
                  <Tile label="6" sub="索" size={17} /><Tile label="7" sub="索" size={17} /><Tile label="8" sub="索" size={17} />
                  <span style={{ width: 5 }} />
                  <Tile label="9" sub="萬" size={17} /><Tile label="9" sub="萬" size={17} />
                </div>
                <div style={{ fontSize: 10, color: t.dm, marginTop: 6, lineHeight: 1.6 }}>
                  刻子・槓子なし・両面待ち・雀頭が役牌以外
                </div>
                <div style={{ fontSize: 15, color: t.gd, marginTop: 5, fontWeight: 800 }}>30符固定</div>
                <div style={{ fontSize: 9, color: t.dm, marginTop: 3 }}>選ぶと刻子・槓子・待ち・雀頭の入力を省けます</div>
              </button>
            </>
          ) : (
          <>
          <button onClick={() => { setFuGuide(gg => ({ ...gg, pinfu: true, chiitoi: false })); setFuGuideStep(6); }}
            style={{ width: "100%", padding: "14px 10px", marginBottom: 8, borderRadius: 12, cursor: "pointer", border: `2px solid ${g.pinfu ? t.gn : t.bd}`, background: g.pinfu ? t.gnS : "transparent", color: g.pinfu ? t.gn : t.tx, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>平和型（順子だけの形）</div>
            <div style={{ display: "flex", gap: 1.5, justifyContent: "center", marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Tile label="2" sub="萬" size={17} /><Tile label="3" sub="萬" size={17} /><Tile label="4" sub="萬" size={17} />
              <span style={{ width: 5 }} />
              <Tile label="5" sub="筒" size={17} /><Tile label="6" sub="筒" size={17} /><Tile label="7" sub="筒" size={17} />
              <span style={{ width: 5 }} />
              <Tile label="3" sub="索" size={17} /><Tile label="4" sub="索" size={17} /><Tile label="5" sub="索" size={17} />
              <span style={{ width: 5 }} />
              <Tile label="6" sub="索" size={17} /><Tile label="7" sub="索" size={17} /><Tile label="8" sub="索" size={17} />
              <span style={{ width: 5 }} />
              <Tile label="9" sub="萬" size={17} /><Tile label="9" sub="萬" size={17} />
            </div>
            <div style={{ fontSize: 9, color: t.dm, marginTop: 5 }}>順子4組＋雀頭 = 14枚</div>
            <div style={{ fontSize: 10, color: t.dm, marginTop: 4, lineHeight: 1.7 }}>
              ①門前　②全て順子　③雀頭が役牌以外<br />
              ④両面待ち（例では6索7索に8索が入った形）
            </div>
            <div style={{ fontSize: 10, color: t.gd, marginTop: 4, fontWeight: 700 }}>
              ツモ20符 / ロン30符
            </div>
          </button>
          <button onClick={() => { setFuGuide(gg => ({ ...gg, chiitoi: true, pinfu: false })); setFuGuideStep(6); }}
            style={{ width: "100%", padding: "14px 10px", marginBottom: 8, borderRadius: 12, cursor: "pointer", border: `2px solid ${g.chiitoi ? t.gn : t.bd}`, background: g.chiitoi ? t.gnS : "transparent", color: g.chiitoi ? t.gn : t.tx, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>七対子（チートイツ）</div>
            <div style={{ display: "flex", gap: 1.5, justifyContent: "center", marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Tile label="1" sub="萬" size={17} /><Tile label="1" sub="萬" size={17} />
              <span style={{ width: 4 }} />
              <Tile label="4" sub="筒" size={17} /><Tile label="4" sub="筒" size={17} />
              <span style={{ width: 4 }} />
              <Tile label="7" sub="索" size={17} /><Tile label="7" sub="索" size={17} />
              <span style={{ width: 4 }} />
              <Tile label="東" sub="" size={17} /><Tile label="東" sub="" size={17} />
              <span style={{ width: 4 }} />
              <Tile label="白" sub="" size={17} /><Tile label="白" sub="" size={17} />
              <span style={{ width: 4 }} />
              <Tile label="3" sub="萬" size={17} /><Tile label="3" sub="萬" size={17} />
              <span style={{ width: 4 }} />
              <Tile label="9" sub="筒" size={17} /><Tile label="9" sub="筒" size={17} />
            </div>
            <div style={{ fontSize: 12, color: t.dm, marginTop: 8, fontWeight: 600 }}>対子7組 = 14枚（門前限定）</div>
            <div style={{ fontSize: 15, color: t.gd, marginTop: 5, fontWeight: 800 }}>25符固定</div>
          </button>
          </>
          )}
          {bigChoice(g.naki ? "クイピン形ではない" : "どちらでもない", "通常の符計算に進む", !g.pinfu && !g.chiitoi && !g.kuipin, () => { setFuGuide(gg => ({ ...gg, pinfu: false, chiitoi: false, kuipin: false })); setFuGuideStep(2); })}
        </div>
      );
    }

    // STEP 2: 刻子（明刻・暗刻）
    if (step === 2) {
      // 門前でも、ロンで完成した刻子（シャンポン待ち）は明刻扱いになるので
      // ロンのときは明刻の選択肢を残す。門前ツモは全て暗刻なので明刻を隠す。
      const kotsuOpts = MENTSU_OPTIONS.filter(o => o.id.includes("ko_") && (g.naki || !isTsumo || !o.id.startsWith("minko_")));
      return (
        <div>
          <button style={backBtn} onClick={() => setFuGuideStep(1)}>← 戻る</button>
          <StepLabel n={3} total={7} label="STEP 3 / 刻子（コーツ）" />
          <div style={{ fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>刻子はいくつありますか？</div>
          <div style={{ fontSize: 11, color: t.dm, textAlign: "center", marginBottom: 14 }}>同じ牌3枚の組。なければ 0 のまま次へ</div>
          {!g.naki && !isTsumo && (
            <div style={{ fontSize: 10, color: t.gd, textAlign: "center", marginBottom: 12, lineHeight: 1.7, padding: "7px 10px", borderRadius: 8, background: t.gdS, border: `1px solid ${t.gd}33` }}>
              シャンポン待ちをロンで完成させた刻子は<b>明刻</b>として数えます
            </div>
          )}
          {kotsuOpts.map(counterRow)}
          <button style={actionBtn("p")} onClick={() => setFuGuideStep(3)}>次へ</button>
        </div>
      );
    }

    // STEP 3: 槓子（明槓・暗槓）
    if (step === 3) {
      const kanOpts = MENTSU_OPTIONS.filter(o => o.id.includes("kan_") && (g.naki || !o.id.startsWith("minkan_")));
      return (
        <div>
          <button style={backBtn} onClick={() => setFuGuideStep(2)}>← 戻る</button>
          <StepLabel n={4} total={7} label="STEP 4 / 槓子（カンツ）" />
          <div style={{ fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>カンはしましたか？</div>
          <div style={{ fontSize: 11, color: t.dm, textAlign: "center", marginBottom: 14 }}>同じ牌4枚の組。なければ 0 のまま次へ</div>
          {kanOpts.map(counterRow)}
          <button style={actionBtn("p")} onClick={() => setFuGuideStep(4)}>次へ</button>
        </div>
      );
    }

    // STEP 4: 待ち
    if (step === 4) {
      return (
        <div>
          <button style={backBtn} onClick={() => setFuGuideStep(3)}>← 戻る</button>
          <StepLabel n={5} total={7} label="STEP 5 / 待ち" />
          <div style={{ fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 16 }}>どんな待ちでしたか？</div>
          {MACHI_OPTIONS.map(m => (
            <button key={m.id} onClick={() => { setFuGuide(gg => ({ ...gg, machi: m.id })); setFuGuideStep(5); }}
              style={{
                width: "100%", padding: "14px 12px", marginBottom: 8, borderRadius: 12, cursor: "pointer",
                border: `2px solid ${g.machi === m.id ? t.ac : t.bd}`, background: g.machi === m.id ? t.acS : "transparent",
                color: g.machi === m.id ? t.ac : t.tx, textAlign: "center",
              }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{m.label}{m.fu > 0 ? ` +${m.fu}符` : " 0符"}</div>
              <MachiIllust machiId={m.id} size={22} />
              <div style={{ fontSize: 10, color: t.dm, marginTop: 5 }}>{MACHI_TILES[m.id]?.desc}</div>
            </button>
          ))}
        </div>
      );
    }

    // STEP 5: 雀頭
    if (step === 5) {
      return (
        <div>
          <button style={backBtn} onClick={() => setFuGuideStep(4)}>← 戻る</button>
          <StepLabel n={6} total={7} label="STEP 6 / 雀頭（アタマ）" />
          <div style={{ fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 16 }}>雀頭は何の牌ですか？</div>
          {JANTOU_OPTIONS.map(j => (
            <button key={j.id} onClick={() => { setFuGuide(gg => ({ ...gg, jantou: j.id })); setFuGuideStep(6); }}
              style={{
                width: "100%", padding: "14px 12px", marginBottom: 8, borderRadius: 12, cursor: "pointer",
                border: `2px solid ${g.jantou === j.id ? t.ac : t.bd}`, background: g.jantou === j.id ? t.acS : "transparent",
                color: g.jantou === j.id ? t.ac : t.tx, textAlign: "center",
              }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{j.label}{j.fu > 0 ? ` +${j.fu}符` : " 0符"}</div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9, color: t.dm, marginBottom: 4 }}>雀頭（アタマ）</div>
                <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                  {j.id === "suuhai" ? (
                    <><Tile label="5" sub="筒" size={24} /><Tile label="5" sub="筒" size={24} /></>
                  ) : (
                    <><Tile label="中" sub="" size={24} /><Tile label="中" sub="" size={24} /></>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 10, color: t.dm, marginTop: 6 }}>{j.desc}</div>
            </button>
          ))}
        </div>
      );
    }

    // STEP 6: 結果
    if (step === 6) {
      const fu = calcFuFromGuide(g, isTsumo);
      const mentsuFu = g.mentsu.reduce((s, m) => s + (MENTSU_OPTIONS.find(o => o.id === m)?.fu || 0), 0);
      const machiFu = MACHI_OPTIONS.find(o => o.id === g.machi)?.fu || 0;
      const jantouFu = JANTOU_OPTIONS.find(o => o.id === g.jantou)?.fu || 0;
      return (
        <div>
          <button style={backBtn} onClick={() => { if (g.pinfu || g.chiitoi || g.kuipin) setFuGuideStep(1); else setFuGuideStep(5); }}>← 戻る</button>
          <StepLabel n={7} total={7} label="計算結果" />
          <div style={{ background: `linear-gradient(135deg, ${t.card}, ${t.sf})`, borderRadius: 16, padding: 24, textAlign: "center", border: `1px solid ${t.ac}44`, marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: t.dm, marginBottom: 6 }}>符数</div>
            <div style={{ fontSize: 44, fontWeight: 900, color: t.ac, lineHeight: 1 }}>{fu}<span style={{ fontSize: 20 }}>符</span></div>
          </div>
          {/* Breakdown */}
          <div style={{ background: t.sf, borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.dm, marginBottom: 8 }}>内訳</div>
            {g.chiitoi ? (
              <div style={{ fontSize: 13, color: t.tx }}>七対子 → 25符固定</div>
            ) : g.kuipin ? (
              <div style={{ fontSize: 13, color: t.tx, lineHeight: 1.9 }}>
                副底20符のみ（刻子・槓子・待ち・雀頭の加符なし）<br />
                <span style={{ color: t.gd, fontWeight: 700 }}>鳴きの20符ちょうど → 30符に繰り上げ</span>
              </div>
            ) : g.pinfu ? (
              <div style={{ fontSize: 13, color: t.tx }}>平和 {isTsumo ? "ツモ → 20符固定" : "ロン → 30符固定"}</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: t.tx }}>
                  <span>副底</span><span>20符</span>
                </div>
                {isTsumo && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: t.gn }}><span>ツモ符</span><span>+2符</span></div>}
                {!isTsumo && !hasNaki && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: t.ac }}><span>門前加符</span><span>+10符</span></div>}
                {mentsuFu > 0 && (() => {
                  // 面子を種類ごとに集計
                  const counts = {};
                  g.mentsu.forEach(m => { counts[m] = (counts[m] || 0) + 1; });
                  return Object.entries(counts).map(([id, cnt]) => {
                    const opt = MENTSU_OPTIONS.find(o => o.id === id);
                    if (!opt) return null;
                    return (
                      <div key={id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: t.tx }}>
                        <span style={{ paddingLeft: 8 }}>
                          {opt.label} <span style={{ color: t.dm }}>×{cnt}</span>
                          <span style={{ color: t.dm, fontSize: 10, marginLeft: 4 }}>({opt.fu}符)</span>
                        </span>
                        <span>+{opt.fu * cnt}符</span>
                      </div>
                    );
                  });
                })()}
                {mentsuFu > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", color: t.dm, borderBottom: `1px solid ${t.bd}33`, paddingBottom: 5, marginBottom: 3 }}>
                    <span style={{ paddingLeft: 8 }}>面子 小計</span><span>+{mentsuFu}符</span>
                  </div>
                )}
                {machiFu > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: t.tx }}><span>待ち（{MACHI_OPTIONS.find(o => o.id === g.machi)?.label}）</span><span>+{machiFu}符</span></div>}
                {jantouFu > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: t.tx }}><span>雀頭（{JANTOU_OPTIONS.find(o => o.id === g.jantou)?.label}）</span><span>+{jantouFu}符</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0 0", marginTop: 4, borderTop: `1px solid ${t.bd}`, color: t.gd, fontWeight: 700 }}>
                  <span>合計（10符単位に切上）</span><span>{fu}符</span>
                </div>
              </>
            )}
          </div>
          <button style={actionBtn("p")} onClick={() => onComplete(fu)}>この符数で確定</button>
          <button style={actionBtn()} onClick={() => { initFuGuide(); }}>最初からやり直す</button>
        </div>
      );
    }
    return null;
  };

  // ══════════════════════════════════
  // ── YAKU PICKER (役から翻数を計算) ──
  // ══════════════════════════════════
  // アガリ方・親子・リーチと矛盾する役はリストに出さない
  const YAKU_REQ = {
    "門前清自摸和（メンゼンツモ）": { tsumo: true },
    "嶺上開花（リンシャンカイホウ）": { tsumo: true },
    "海底摸月（ハイテイ）": { tsumo: true },
    "河底撈魚（ホウテイ）": { tsumo: false },
    "搶槓（チャンカン）": { tsumo: false },
    "一発（イッパツ）": { needsRiichi: true },
    "天和（テンホウ）": { tsumo: true, parent: true },
    "地和（チーホウ）": { tsumo: true, parent: false },
  };
  // 同時に成立しない役のペア。片方を選んだらもう片方を自動で外す
  const YAKU_CONFLICT_PAIRS = [
    ["リーチ（立直）", "ダブル立直（ダブルリーチ）"],
    // 平和: 刻子・槓子・役牌雀頭を含む役と両立しない
    ["平和（ピンフ）", "対々和（トイトイ）"], ["平和（ピンフ）", "三暗刻（サンアンコー）"],
    ["平和（ピンフ）", "三色同刻（サンショクドウコー）"], ["平和（ピンフ）", "三槓子（サンカンツ）"],
    ["平和（ピンフ）", "混老頭（ホンロウトウ）"], ["平和（ピンフ）", "七対子（チートイツ）"],
    ["平和（ピンフ）", "役牌 白（ハク）"], ["平和（ピンフ）", "役牌 發（ハツ）"], ["平和（ピンフ）", "役牌 中（チュン）"],
    ["平和（ピンフ）", "場風牌（バカゼハイ）"], ["平和（ピンフ）", "自風牌（ジカゼハイ）"], ["平和（ピンフ）", "小三元（ショウサンゲン）"],
    ["平和（ピンフ）", "嶺上開花（リンシャンカイホウ）"],
    // 七対子: 面子を使う役と両立しない（混老頭のみ複合可）
    ["七対子（チートイツ）", "対々和（トイトイ）"], ["七対子（チートイツ）", "三暗刻（サンアンコー）"],
    ["七対子（チートイツ）", "三色同刻（サンショクドウコー）"], ["七対子（チートイツ）", "三槓子（サンカンツ）"],
    ["七対子（チートイツ）", "一盃口（イーペーコー）"], ["七対子（チートイツ）", "二盃口（リャンペーコー）"],
    ["七対子（チートイツ）", "一気通貫（イッキツウカン）"], ["七対子（チートイツ）", "三色同順（サンショクドウジュン）"],
    ["七対子（チートイツ）", "混全帯么九（チャンタ）"], ["七対子（チートイツ）", "純全帯么九（ジュンチャン）"],
    ["七対子（チートイツ）", "役牌 白（ハク）"], ["七対子（チートイツ）", "役牌 發（ハツ）"], ["七対子（チートイツ）", "役牌 中（チュン）"],
    ["七対子（チートイツ）", "場風牌（バカゼハイ）"], ["七対子（チートイツ）", "自風牌（ジカゼハイ）"],
    ["七対子（チートイツ）", "小三元（ショウサンゲン）"], ["七対子（チートイツ）", "嶺上開花（リンシャンカイホウ）"],
    // 盃口系
    ["一盃口（イーペーコー）", "二盃口（リャンペーコー）"],
    ["一盃口（イーペーコー）", "対々和（トイトイ）"], ["一盃口（イーペーコー）", "三暗刻（サンアンコー）"],
    ["二盃口（リャンペーコー）", "対々和（トイトイ）"], ["二盃口（リャンペーコー）", "三暗刻（サンアンコー）"],
    ["二盃口（リャンペーコー）", "混老頭（ホンロウトウ）"], ["一盃口（イーペーコー）", "混老頭（ホンロウトウ）"],
    // 么九系・染め手系
    ["断么九（タンヤオ）", "混全帯么九（チャンタ）"], ["断么九（タンヤオ）", "純全帯么九（ジュンチャン）"],
    ["断么九（タンヤオ）", "混老頭（ホンロウトウ）"], ["断么九（タンヤオ）", "混一色（ホンイツ）"],
    ["混全帯么九（チャンタ）", "純全帯么九（ジュンチャン）"], ["混全帯么九（チャンタ）", "混老頭（ホンロウトウ）"],
    ["混全帯么九（チャンタ）", "清一色（チンイツ）"],
    ["純全帯么九（ジュンチャン）", "混老頭（ホンロウトウ）"], ["純全帯么九（ジュンチャン）", "混一色（ホンイツ）"],
    ["混老頭（ホンロウトウ）", "一気通貫（イッキツウカン）"], ["混老頭（ホンロウトウ）", "三色同順（サンショクドウジュン）"],
    ["混老頭（ホンロウトウ）", "清一色（チンイツ）"],
    ["混一色（ホンイツ）", "清一色（チンイツ）"],
    // 対々和は順子役と両立しない
    ["対々和（トイトイ）", "一気通貫（イッキツウカン）"], ["対々和（トイトイ）", "三色同順（サンショクドウジュン）"],
    // 役満同士で形が両立しないもの
    ["国士無双（コクシムソウ）", "四暗刻（スーアンコー）"], ["国士無双（コクシムソウ）", "大三元（ダイサンゲン）"],
    ["国士無双（コクシムソウ）", "字一色（ツーイーソー）"], ["国士無双（コクシムソウ）", "小四喜（ショウスーシー）"],
    ["国士無双（コクシムソウ）", "大四喜（ダイスーシー）"], ["国士無双（コクシムソウ）", "緑一色（リューイーソー）"],
    ["国士無双（コクシムソウ）", "清老頭（チンロウトウ）"], ["国士無双（コクシムソウ）", "九蓮宝燈（チューレンポウトウ）"],
    ["国士無双（コクシムソウ）", "四槓子（スーカンツ）"], ["国士無双（コクシムソウ）", "天和（テンホウ）"],
    ["国士無双（コクシムソウ）", "地和（チーホウ）"],
    ["九蓮宝燈（チューレンポウトウ）", "四暗刻（スーアンコー）"], ["九蓮宝燈（チューレンポウトウ）", "大三元（ダイサンゲン）"],
    ["九蓮宝燈（チューレンポウトウ）", "字一色（ツーイーソー）"], ["九蓮宝燈（チューレンポウトウ）", "小四喜（ショウスーシー）"],
    ["九蓮宝燈（チューレンポウトウ）", "大四喜（ダイスーシー）"], ["九蓮宝燈（チューレンポウトウ）", "緑一色（リューイーソー）"],
    ["九蓮宝燈（チューレンポウトウ）", "清老頭（チンロウトウ）"], ["九蓮宝燈（チューレンポウトウ）", "四槓子（スーカンツ）"],
    ["大四喜（ダイスーシー）", "小四喜（ショウスーシー）"],
    ["大三元（ダイサンゲン）", "小四喜（ショウスーシー）"], ["大三元（ダイサンゲン）", "大四喜（ダイスーシー）"],
    ["字一色（ツーイーソー）", "緑一色（リューイーソー）"], ["字一色（ツーイーソー）", "清老頭（チンロウトウ）"],
    ["緑一色（リューイーソー）", "清老頭（チンロウトウ）"],
    ["天和（テンホウ）", "地和（チーホウ）"],
    // 断么九: 么九牌・字牌を使う役と両立しない
    ["断么九（タンヤオ）", "役牌 白（ハク）"], ["断么九（タンヤオ）", "役牌 發（ハツ）"], ["断么九（タンヤオ）", "役牌 中（チュン）"],
    ["断么九（タンヤオ）", "場風牌（バカゼハイ）"], ["断么九（タンヤオ）", "自風牌（ジカゼハイ）"],
    ["断么九（タンヤオ）", "小三元（ショウサンゲン）"], ["断么九（タンヤオ）", "一気通貫（イッキツウカン）"],
    // 清一色: 字牌を使えない
    ["清一色（チンイツ）", "役牌 白（ハク）"], ["清一色（チンイツ）", "役牌 發（ハツ）"], ["清一色（チンイツ）", "役牌 中（チュン）"],
    ["清一色（チンイツ）", "場風牌（バカゼハイ）"], ["清一色（チンイツ）", "自風牌（ジカゼハイ）"],
    ["清一色（チンイツ）", "小三元（ショウサンゲン）"],
    // 純チャン: 字牌を使えない
    ["純全帯么九（ジュンチャン）", "役牌 白（ハク）"], ["純全帯么九（ジュンチャン）", "役牌 發（ハツ）"], ["純全帯么九（ジュンチャン）", "役牌 中（チュン）"],
    ["純全帯么九（ジュンチャン）", "場風牌（バカゼハイ）"], ["純全帯么九（ジュンチャン）", "自風牌（ジカゼハイ）"],
    ["純全帯么九（ジュンチャン）", "小三元（ショウサンゲン）"],
    // 一気通貫・三色系の形の矛盾
    ["一気通貫（イッキツウカン）", "三色同順（サンショクドウジュン）"],
    ["一気通貫（イッキツウカン）", "三色同刻（サンショクドウコー）"],
    ["一気通貫（イッキツウカン）", "混全帯么九（チャンタ）"], ["一気通貫（イッキツウカン）", "純全帯么九（ジュンチャン）"],
    ["三色同刻（サンショクドウコー）", "三色同順（サンショクドウジュン）"],
    ["三色同刻（サンショクドウコー）", "一盃口（イーペーコー）"], ["三色同刻（サンショクドウコー）", "二盃口（リャンペーコー）"],
    ["三槓子（サンカンツ）", "一盃口（イーペーコー）"], ["三槓子（サンカンツ）", "二盃口（リャンペーコー）"],
    ["三槓子（サンカンツ）", "一気通貫（イッキツウカン）"], ["三槓子（サンカンツ）", "三色同順（サンショクドウジュン）"],
    // アガリ方が両立しない偶然役
    ["嶺上開花（リンシャンカイホウ）", "海底摸月（ハイテイ）"], ["嶺上開花（リンシャンカイホウ）", "河底撈魚（ホウテイ）"],
    ["嶺上開花（リンシャンカイホウ）", "搶槓（チャンカン）"],
    ["搶槓（チャンカン）", "海底摸月（ハイテイ）"], ["搶槓（チャンカン）", "河底撈魚（ホウテイ）"],
    ["海底摸月（ハイテイ）", "河底撈魚（ホウテイ）"],
  ];
  const YAKU_CONFLICTS = (() => {
    const m = {};
    YAKU_CONFLICT_PAIRS.forEach(([a, b]) => {
      if (!m[a]) m[a] = [];
      if (!m[b]) m[b] = [];
      m[a].push(b); m[b].push(a);
    });
    return m;
  })();
  const YAKUMAN_LABEL = (h) => h >= 39 ? "トリプル役満" : h >= 26 ? "ダブル役満" : "役満";

  const YakuPicker = ({ onConfirm, onCancel, isTsumo, isParent, lockedRiichi }) => {
    const total = pickerTotalHan();
    const CATS = ["1翻", "2翻", "3翻以上", "役満"];
    // 鳴き時は食い下がり後の翻数でグループ分け
    const effHan = (y) => (pickerNaki ? y.naki : y.han);
    const catOf = (y) => { const eh = effHan(y); return eh >= 13 ? "役満" : eh >= 3 ? "3翻以上" : `${eh}翻`; };

    const kuitanOff = activePickerRules().kuitan === false;
    // リーチが立っているか（宣言済み・リーチ or ダブリー選択のいずれか）
    const riichiOn = lockedRiichi || pickedYaku.includes("リーチ（立直）") || pickedYaku.includes("ダブル立直（ダブルリーチ）");
    // アガリ方・親子・リーチ・食いタン設定と矛盾する役を選択肢から外す
    const ctxOk = (y) => {
      const rq = YAKU_REQ[y.name];
      if (rq) {
        if (rq.tsumo === true && isTsumo === false) return false;
        if (rq.tsumo === false && isTsumo === true) return false;
        if (rq.parent === true && isParent === false) return false;
        if (rq.parent === false && isParent === true) return false;
        if (rq.needsRiichi && !riichiOn) return false;
      }
      if (pickerNaki && y.naki === null) return false;
      if (pickerNaki && kuitanOff && y.name === "断么九（タンヤオ）") return false;
      return true;
    };
    // 門前/鳴きの切替（リーチ確定時はロック）。切替に伴い矛盾する選択を自動整理
    const switchNaki = (v) => {
      if (lockedRiichi && v === true) return;
      setPickerNaki(v);
      if (v === true) {
        setPickedYaku(prev => prev.filter(n => {
          const o = YAKU_DATA.find(x => x.name === n);
          if (!o || o.naki === null) return false;                       // 門前限定役を外す
          if (kuitanOff && n === "断么九（タンヤオ）") return false;      // 食いタンなし
          return true;
        }));
        setPickerUra(0);                                                  // 鳴き=リーチ不可 → 裏ドラなし
      } else if (isTsumo && !pickedYaku.includes("門前清自摸和（メンゼンツモ）")) {
        setPickedYaku(prev => prev.includes("門前清自摸和（メンゼンツモ）") ? prev : [...prev, "門前清自摸和（メンゼンツモ）"]);
      }
    };

    // STEP1: 門前か鳴きかを先に確認
    if (pickerNaki === null) {
      return (
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, textAlign: "center", marginBottom: 6 }}>鳴きましたか？</div>
          <div style={{ fontSize: 12, color: t.dm, textAlign: "center", marginBottom: 20 }}>
            ポン・チー・明カンをしたかどうか
          </div>
          <button onClick={() => switchNaki(false)} style={{
            width: "100%", padding: "18px 12px", marginBottom: 10, borderRadius: 14, cursor: "pointer",
            border: `2px solid ${t.ac}`, background: t.acS, color: t.ac, textAlign: "center",
          }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>門前（メンゼン）</div>
            <div style={{ fontSize: 11, color: t.dm, marginTop: 4 }}>鳴いていない{isTsumo ? " → メンゼンツモを自動でチェック" : ""}</div>
          </button>
          <button onClick={() => switchNaki(true)} style={{
            width: "100%", padding: "18px 12px", marginBottom: 16, borderRadius: 14, cursor: "pointer",
            border: `2px solid ${t.gn}`, background: t.gnS, color: t.gn, textAlign: "center",
          }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>鳴きあり</div>
            <div style={{ fontSize: 11, color: t.dm, marginTop: 4 }}>ポン・チー・明カンをした</div>
          </button>
          <button style={actionBtn()} onClick={onCancel}>キャンセル</button>
        </div>
      );
    }

    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 160,
        background: t.bg, display: "flex", flexDirection: "column",
        paddingTop: "env(safe-area-inset-top)",
      }}>
        {yakuInfo && (() => {
          const y = yakuInfo;
          const m = y.name.match(/^(.+?)（(.+?)）$/);
          const base = m ? m[1] : y.name, paren = m ? m[2] : "";
          const isKana = /^[ァ-ヶー]+$/.test(base);
          const kana = isKana ? base : paren;
          const main = isKana ? (paren || base) : base;
          return (
            <div onClick={() => setYakuInfo(null)} style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.85)", zIndex: 220,
              display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
            }}>
              <div onClick={(e) => e.stopPropagation()} style={{ ...card, maxWidth: 380, width: "100%", margin: 0, padding: 18 }}>
                <div style={{ fontSize: 11, color: t.dm, textAlign: "center", fontWeight: 700 }}>{kana}</div>
                <div style={{ fontSize: 22, fontWeight: 900, textAlign: "center", color: y.han >= 13 ? t.gd : t.tx }}>{main}</div>
                <div style={{ fontSize: 12, color: t.dm, textAlign: "center", marginTop: 4 }}>
                  門前 {y.han >= 13 ? "役満" : `${y.han}翻`}
                  {y.naki === null ? " ・ 鳴くと成立しません" : y.naki < y.han ? ` ／ 鳴き ${y.naki}翻（食い下がり）` : " ／ 鳴いても同じ"}
                </div>
                <div style={{
                  fontSize: 13, color: t.tx, lineHeight: 1.9, marginTop: 12,
                  padding: 12, borderRadius: 10, background: t.sf, border: `1px solid ${t.bd}`,
                }}>{y.desc}</div>
                <button style={{ ...actionBtn(), marginTop: 12, marginBottom: 0 }} onClick={() => setYakuInfo(null)}>閉じる</button>
              </div>
            </div>
          );
        })()}
        {/* 上部: 今の選択内容と合計翻数（スクロールしても見えるよう固定） */}
        <div style={{
          flexShrink: 0, padding: "10px 12px 8px",
          background: t.card, borderBottom: `1px solid ${t.bd}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              flexShrink: 0, minWidth: 74, textAlign: "center", padding: "6px 8px", borderRadius: 10,
              background: total >= 13 ? t.gdS : t.acS, border: `1px solid ${total >= 13 ? t.gd : t.ac}`,
            }}>
              <div style={{ fontSize: 9, color: t.dm, fontWeight: 700 }}>合計</div>
              <div style={{ fontSize: total >= 13 ? 15 : 20, fontWeight: 900, color: total >= 13 ? t.gd : t.ac, lineHeight: 1.2 }}>
                {total >= 13 ? YAKUMAN_LABEL(total) : `${total}翻`}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 4, alignContent: "center" }}>
              {pickedYaku.length === 0 && pickerDora === 0 && pickerUra === 0 ? (
                <span style={{ fontSize: 11, color: t.dm }}>役をタップして選んでください</span>
              ) : (<>
                {pickedYaku.map(n => {
                  const y = YAKU_DATA.find(x => x.name === n);
                  const h = y ? (pickerNaki && y.naki !== null ? y.naki : y.han) : 0;
                  const short = n.replace(/（.*?）/, "");
                  return (
                    <span key={n} style={{
                      fontSize: 10.5, fontWeight: 700, padding: "3px 7px", borderRadius: 6,
                      background: t.acS, border: `1px solid ${t.ac}55`, color: t.tx, whiteSpace: "nowrap",
                    }}>{short}<span style={{ color: t.ac, marginLeft: 3 }}>{h >= 13 ? "役満" : h}</span></span>
                  );
                })}
                {pickerDora > 0 && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 7px", borderRadius: 6,
                    background: t.gdS, border: `1px solid ${t.gd}55`, color: t.gd, whiteSpace: "nowrap" }}>ドラ{pickerDora}</span>
                )}
                {pickerUra > 0 && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 7px", borderRadius: 6,
                    background: t.gdS, border: `1px solid ${t.gd}55`, color: t.gd, whiteSpace: "nowrap" }}>裏ドラ{pickerUra}</span>
                )}
              </>)}
            </div>
          </div>
        </div>

        <div style={{ flexShrink: 0, padding: "10px 12px 0" }}>
        {/* 門前/鳴き（切替可能・リーチ確定時はロック） */}
        <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
          <button onClick={() => switchNaki(false)} style={{
            flex: 1, padding: "7px", borderRadius: 8, cursor: "pointer",
            border: `1.5px solid ${!pickerNaki ? t.ac : t.bd}`,
            background: !pickerNaki ? t.acS : "transparent",
            color: !pickerNaki ? t.ac : t.dm, fontSize: 12, fontWeight: 700,
          }}>門前</button>
          <button onClick={() => switchNaki(true)} disabled={lockedRiichi} style={{
            flex: 1, padding: "7px", borderRadius: 8, cursor: lockedRiichi ? "default" : "pointer",
            border: `1.5px solid ${pickerNaki ? t.gn : t.bd}`,
            background: pickerNaki ? t.gnS : "transparent",
            color: pickerNaki ? t.gn : t.dm, fontSize: 12, fontWeight: 700,
            opacity: lockedRiichi ? 0.4 : 1,
          }}>{lockedRiichi ? "🔒 鳴きあり" : "鳴きあり"}</button>
        </div>

        {/* 合計 ＋ ドラ・裏ドラ */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "stretch" }}>
          {/* 合計 */}
          <div style={{
            flex: "0 0 32%", background: total >= 13 ? t.gdS : t.acS, borderRadius: 10,
            padding: "8px 6px", textAlign: "center",
            border: `1px solid ${total >= 13 ? t.gd : t.ac}44`,
            display: "flex", flexDirection: "column", justifyContent: "center",
          }}>
            <div style={{ fontSize: 10, color: t.dm, lineHeight: 1 }}>合計</div>
            <div style={{ fontSize: total >= 26 ? 15 : 24, fontWeight: 900, color: total >= 13 ? t.gd : t.ac, lineHeight: 1.15 }}>
              {total >= 13 ? YAKUMAN_LABEL(total) : `${total}翻`}
            </div>
          </div>

          {/* ドラ・裏ドラ（裏ドラはリーチ時のみ） */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { label: "ドラ", val: pickerDora, set: setPickerDora, lock: false },
              { label: "裏ドラ", val: pickerUra, set: setPickerUra, lock: !riichiOn },
            ].map(row => (
              <div key={row.label} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between",
                background: t.sf, borderRadius: 10, padding: "5px 8px",
                border: `1px solid ${row.val > 0 ? t.gd + "55" : t.bd}`,
                opacity: row.lock ? 0.35 : 1,
              }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: t.tx, flexShrink: 0 }}>{row.label}{row.lock ? " (リーチ時のみ)" : ""}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <button disabled={row.lock} onClick={() => row.set(v => Math.max(0, v - 1))} style={{
                    width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${row.val > 0 ? t.gd : t.bd}`,
                    background: t.card, color: row.val > 0 ? t.gd : t.dm, fontSize: 19, fontWeight: 700,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0,
                  }}>−</button>
                  <span style={{
                    fontSize: 20, fontWeight: 900, width: 22, textAlign: "center",
                    color: row.val > 0 ? t.gd : t.dm, fontVariantNumeric: "tabular-nums",
                  }}>{row.val}</span>
                  <button disabled={row.lock} onClick={() => row.set(v => v + 1)} style={{
                    width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${t.gd}`,
                    background: t.gdS, color: t.gd, fontSize: 19, fontWeight: 700,
                    cursor: row.lock ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0,
                  }}>+</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        </div>

        {/* 役リスト（ここだけスクロール） */}
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "10px 12px 4px", WebkitOverflowScrolling: "touch" }}>
          {CATS.map(cat => {
            const list = YAKU_DATA.filter(y => catOf(y) === cat && ctxOk(y));
            if (!list.length) return null;
            return (
              <div key={cat} style={{ marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 10px" }}>
                  <div style={{ flex: 1, height: 1, background: cat === "役満" ? t.gd + "66" : t.bd }} />
                  <span style={{
                    fontSize: 13, fontWeight: 900, letterSpacing: "0.08em",
                    color: cat === "役満" ? t.gd : t.ac, whiteSpace: "nowrap",
                    padding: "3px 12px", borderRadius: 20,
                    background: cat === "役満" ? t.gdS : t.acS,
                    border: `1px solid ${cat === "役満" ? t.gd + "55" : t.ac + "44"}`,
                  }}>{cat}</span>
                  <div style={{ flex: 1, height: 1, background: cat === "役満" ? t.gd + "66" : t.bd }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {list.map(y => {
                    const on = pickedYaku.includes(y.name);
                    const h = pickerNaki ? y.naki : y.han;
                    // 表示名とふりがなを決定
                    const paren = (y.name.match(/（([^）]+)）/) || [])[1] || "";
                    const base = y.name.replace(/（.*/, "").replace(/^役牌 /, "");
                    const isKana = /^[ァ-ヶー]+$/.test(base);
                    // 漢字が本体（例: 断么九（タンヤオ））→ 上にカナ、下に漢字
                    // カナが本体（例: リーチ（立直））→ 上にカナ(=base)、下に漢字(=paren)
                    const kana = isKana ? base : paren;
                    const main = isKana ? (paren || base) : base;
                    return (
                      <button key={y.name} {...yakuPressHandlers(y)} onClick={() => {
                        if (yakuPressFired.current) { yakuPressFired.current = false; return; }
                        const cur = pickedYaku;
                        let next;
                        if (cur.includes(y.name)) {
                          next = cur.filter(n => n !== y.name);
                        } else {
                          const conf = YAKU_CONFLICTS[y.name] || [];
                          const isYk = y.han >= 13;
                          next = cur.filter(n => {
                            const o = YAKU_DATA.find(x => x.name === n);
                            if (!o) return false;
                            if ((o.han >= 13) !== isYk) return false; // 役満と通常役は同時計上しない
                            return !conf.includes(n);
                          });
                          next = [...next, y.name];
                          // 白・發・中がそろったら大三元（役満）へ自動昇格
                          const dragons = ["役牌 白（ハク）", "役牌 發（ハツ）", "役牌 中（チュン）"];
                          if (dragons.every(d => next.includes(d))) {
                            next = ["大三元（ダイサンゲン）"];
                            try { if (navigator.vibrate) navigator.vibrate([20, 40, 20]); } catch {}
                          }
                        }
                        // リーチが外れたら一発・裏ドラも自動で外す
                        const rOn = lockedRiichi || next.includes("リーチ（立直）") || next.includes("ダブル立直（ダブルリーチ）");
                        if (!rOn) {
                          next = next.filter(n => n !== "一発（イッパツ）");
                          if (pickerUra > 0) setPickerUra(0);
                        }
                        setPickedYaku(next);
                      }} style={{
                        padding: "9px 5px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                        border: `1.5px solid ${on ? (y.han >= 13 ? t.gd : t.ac) : t.bd}`,
                        background: on ? (y.han >= 13 ? t.gdS : t.acS) : "transparent",
                        color: on ? (y.han >= 13 ? t.gd : t.ac) : t.tx,
                        lineHeight: 1.25,
                      }}>
                        <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 600 }}>{kana}</div>
                        <div style={{ fontSize: 16, fontWeight: on ? 900 : 700 }}>{main}</div>
                        <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2, fontWeight: 700 }}>
                          {pickerNaki && y.naki !== null && y.naki < y.han ? (
                            <span>
                              <span style={{ textDecoration: "line-through", opacity: 0.5 }}>{y.han}翻</span>
                              <span style={{ margin: "0 3px" }}>→</span>
                              <span style={{ color: t.gn }}>{h}翻</span>
                            </span>
                          ) : (h >= 13 ? "役満" : `${h}翻`)}
                        </div>
                        {pickerNaki && y.naki !== null && y.naki < y.han && (
                          <div style={{ fontSize: 8, color: t.gn, opacity: 0.85, marginTop: 1 }}>食い下がり</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          flexShrink: 0, padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
          background: t.card, borderTop: `1px solid ${t.bd}`,
          display: "flex", gap: 8,
        }}>
          <button style={{ ...actionBtn(), flex: 1, marginBottom: 0, padding: "14px 8px" }} onClick={onCancel}>キャンセル</button>
          <button style={{ ...actionBtn("p"), flex: 1.7, marginBottom: 0, padding: "14px 8px", opacity: total > 0 && pickedYaku.length > 0 ? 1 : 0.4 }}
            disabled={total === 0 || pickedYaku.length === 0}
            onClick={() => onConfirm(total)}>
            {pickedYaku.length === 0 ? "役を選んでください" : total >= 13 ? `${YAKUMAN_LABEL(total)}で確定` : `${total}翻で確定`}
          </button>
        </div>
      </div>
    );
  };

  const ScoreDisplay = ({ han, fu, limit, result, tsumo, parent, extra }) => (
    <div style={{ background: `linear-gradient(135deg, ${t.card}, ${t.sf})`, borderRadius: 16, padding: 24, textAlign: "center", border: `1px solid ${t.ac}33`, marginBottom: 14 }}>
      {limit && <div style={{ display: "inline-block", padding: "4px 18px", borderRadius: 20, fontSize: 14, fontWeight: 800, background: han >= 13 ? t.gdS : t.acS, color: han >= 13 ? t.gd : t.ac, marginBottom: 12 }}>{limit}</div>}
      <div style={{ fontSize: 13, color: t.dm, marginBottom: 10 }}>
        {han >= 13 ? getLimitName(han) : han >= 5 ? `${han}翻` : `${han}翻 ${fu}符`} / {tsumo ? "ツモ" : "ロン"} / {parent ? "親" : "子"}
      </div>

      {tsumo ? (
        parent ? (
          /* 親ツモ: 全員から同額 */
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 10 }}>
              <span style={{ fontSize: 16, color: t.dm, fontWeight: 700 }}>合計</span>
              <span style={{ fontSize: 40, fontWeight: 900, color: t.ac, lineHeight: 1 }}>{result.total.toLocaleString()}</span>
            </div>
            <div style={{ padding: "12px 0", borderTop: `1px solid ${t.bd}`, display: "flex", alignItems: "baseline", justifyContent: "center", gap: 12 }}>
              <span style={{ fontSize: 18, color: t.gd, fontWeight: 800 }}>全員から</span>
              <span style={{ fontSize: 34, fontWeight: 900, color: t.gd, lineHeight: 1 }}>{result.each.toLocaleString()}</span>
            </div>
          </div>
        ) : (
          /* 子ツモ: 3行（合計・子から・親から） */
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 10, paddingBottom: 12 }}>
              <span style={{ fontSize: 16, color: t.dm, fontWeight: 700 }}>合計</span>
              <span style={{ fontSize: 40, fontWeight: 900, color: t.ac, lineHeight: 1 }}>{result.total.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 12, padding: "12px 0", borderTop: `1px solid ${t.bd}` }}>
              <span style={{ fontSize: 18, color: t.ac, fontWeight: 800, width: 70, textAlign: "right" }}>子から</span>
              <span style={{ fontSize: 32, fontWeight: 900, color: t.tx, lineHeight: 1, minWidth: 110, textAlign: "left" }}>{result.fromChild.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 12, padding: "12px 0 0", borderTop: `1px solid ${t.bd}33` }}>
              <span style={{ fontSize: 18, color: t.gd, fontWeight: 800, width: 70, textAlign: "right" }}>親から</span>
              <span style={{ fontSize: 32, fontWeight: 900, color: t.tx, lineHeight: 1, minWidth: 110, textAlign: "left" }}>{result.fromParent.toLocaleString()}</span>
            </div>
          </div>
        )
      ) : (
        /* ロン */
        <div>
          <div style={{ fontSize: 48, fontWeight: 900, color: t.ac, lineHeight: 1 }}>{result.total.toLocaleString()}</div>
          <div style={{ fontSize: 15, color: t.dm, marginTop: 8, fontWeight: 600 }}>放銃者から受け取る</div>
        </div>
      )}
      {extra}
    </div>
  );

  const body = { padding: "18px 20px 36px", boxSizing: "border-box", maxWidth: "100%", overflowX: "hidden", lineHeight: 1.7 };

  // Global box-sizing reset
  const globalStyle = `
*, *::before, *::after { box-sizing: border-box; }
button { padding: 8px 12px; }
input, select { padding: 10px 14px; }
@keyframes bootTile {
  0%   { opacity: 0; transform: translateY(-38px) rotate(-25deg) scale(0.7); }
  55%  { opacity: 1; transform: translateY(6px) rotate(6deg) scale(1.06); }
  75%  { transform: translateY(-3px) rotate(-2deg) scale(0.99); }
  100% { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
}
@keyframes bootChar {
  0%   { opacity: 0; transform: translateY(24px) scale(0.8); filter: blur(6px); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
@keyframes bootLine {
  0%   { transform: scaleX(0); opacity: 0; }
  100% { transform: scaleX(1); opacity: 1; }
}
@keyframes bootSub {
  0%   { opacity: 0; transform: translateY(10px); letter-spacing: 0.5em; }
  100% { opacity: 0.9; transform: translateY(0); letter-spacing: 0.22em; }
}
@keyframes bootGlow {
  0%, 100% { text-shadow: 0 0 18px rgba(234,179,8,0.35), 0 3px 14px rgba(0,0,0,0.7); }
  50%      { text-shadow: 0 0 34px rgba(234,179,8,0.7), 0 3px 14px rgba(0,0,0,0.7); }
}
@keyframes bootFade {
  0%, 72% { opacity: 1; }
  100%    { opacity: 0; visibility: hidden; }
}
@keyframes titlePop {
  0%   { opacity: 0; transform: translateY(8px) scale(0.9); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes diceHop {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-14%) scale(1.05); }
}
@keyframes splashIn {
  0% { opacity: 0; transform: translateY(14px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes splashLine {
  0% { transform: scaleX(0); opacity: 0; }
  100% { transform: scaleX(1); opacity: 1; }
}
@keyframes splashRow {
  0% { opacity: 0; transform: translateX(-10px); }
  100% { opacity: 1; transform: translateX(0); }
}
@keyframes dicePrompt {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}
@keyframes wallBlink {
  0%, 100% {
    background: rgba(56,189,248,0.28);
    border-color: #38bdf8;
    box-shadow: 0 0 22px rgba(56,189,248,0.8);
  }
  50% {
    background: rgba(56,189,248,0.06);
    border-color: rgba(56,189,248,0.35);
    box-shadow: 0 0 4px rgba(56,189,248,0.15);
  }
}
@keyframes wallLabelBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
`;

  // ══════════════════════════════════
  // ── YAKU DATA ──
  // ══════════════════════════════════
  // ── 麻雀用語データ（役以外の言葉） ──
  // ── 麻雀用語データ（役以外の言葉） ──
  // ── 麻雀用語データ（役以外の言葉） ──
  const TERM_DATA = [
    { kanji: "副露", yomi: "フーロ", cat: "鳴き", desc: "他家の捨て牌を使って面子を作ること。チー・ポン・カンの総称。「鳴く」ともいう", detail: "チー・ポン・カン（暗槓を除く）をまとめて指す言葉です。鳴くと手牌が公開されて進行は速くなりますが、門前が崩れるためリーチ・門前清自摸和・一発・裏ドラが使えなくなり、平和や一盃口などの門前限定役も消えます。混一色や三色などは鳴いても成立しますが、多くは翻数が1つ下がります（食い下がり）。", abbr: "「フーロ」。日常的には「鳴き」「鳴く」のほうがよく使われます。" },
    { kanji: "明槓", yomi: "ミンカン", cat: "鳴き", desc: "他家の牌を使って作るカン。大明槓と加槓の2種類がある", detail: "他家の牌を使って成立するカンの総称で、大明槓と加槓の2つを指します。暗槓と対になる言葉です。\n【共通点】どちらも門前が崩れるため、以後リーチ・一発・裏ドラは使えません。符は明刻扱いで、中張牌8符・么九牌16符です。\n【カン全体の共通ルール】カンをすると新ドラが増え、嶺上牌を1枚ツモって必ず1枚打牌します。カンは1局で合計4回まで（4回目が終わると四開槓で流局するルールが一般的）。カンをするたびに海底が1つ手前にずれるため、その局の総ツモ数は変わりません。" },
    { kanji: "加槓", yomi: "カカン", cat: "鳴き", desc: "すでにポンしている刻子に、自分でツモった4枚目を加えてカンすること。小明槓ともいう", detail: "先にポンしてある刻子に、あとから自分がツモった4枚目を加えてカンすることです。小明槓ともいいます。\n【手順】ポンして横向きに置いてある牌の上に、4枚目を横向きに重ねて「カン」と発声します。その後、嶺上牌をツモって打牌します。\n【例】5筒をポンしている状態で4枚目の5筒を引いたときに宣言できます。\n【符】明刻の扱いなので、中張牌で8符、么九牌で16符です。\n【注意】加槓した牌は他家が槍槓（チャンカン）でロンできます。相手がその牌の単騎待ちなどをしていると横取りされるため、危険な牌での加槓は慎重に。\n【ドラ】新ドラは打牌の後にめくるルールが一般的です。", abbr: "「小明槓（ショウミンカン）」ともいいます。" },
    { kanji: "大明槓", yomi: "ダイミンカン", cat: "鳴き", desc: "手の内に暗刻がある状態で、他家が捨てた4枚目をカンすること", detail: "自分の手の内に暗刻がある状態で、他家が捨てた4枚目をカンすることです。\n【手順】ポンと同じ要領で「カン」と発声し、鳴いた牌を横向きにして4枚を並べます。その後、嶺上牌をツモって打牌します。\n【符】明刻の扱いで、中張牌8符、么九牌16符です。\n【注意】門前が崩れるので以後リーチはできません。手が安いのにドラだけ増やして相手を利する結果になりがちで、上級者ほど大明槓には慎重です。\n【責任払い（包）】大明槓の直後に嶺上開花でアガられた場合、カンさせた人が全額を払うルールを採用する場もあります。", abbr: "単に「明槓」「大明」と呼ぶこともあります。" },
    { kanji: "暗槓", yomi: "アンカン", cat: "鳴き", desc: "同じ牌4枚を自分だけで揃えてカンすること。門前は崩れない", detail: "同じ牌4枚を自分だけの力で揃えてカンすることです。鳴きにあたらないため門前は崩れず、リーチもできます。\n【手順】4枚のうち両端2枚を裏返して自分の右側に置き、「カン」と発声します。その後、王牌から嶺上牌を1枚ツモって打牌します。\n【符】中張牌で16符、么九牌なら32符と非常に高くなります。\n【ドラ】暗槓した時点で新しいドラ表示牌がすぐめくられます。\n【注意】リーチ後の暗槓は、待ちや手の構成が変わらない場合に限り認められます。四暗刻の判定では暗刻として数えますが、国士無双に対する槍槓を認めるルールもあります。" },
    { kanji: "喰い替え", yomi: "クイカエ", cat: "鳴き", desc: "鳴いた直後に、鳴いた牌と同じ牌や筋の牌を捨てること。多くのルールで禁止", detail: "鳴いた直後に、鳴きに使ったのと同じ牌や、その筋の牌を捨てる行為です。たとえば4萬5萬で6萬をチーして4萬を切ると、同じ待ちのまま手を進めたことになります。ほとんどのルールで反則とされ、和了放棄や罰符の対象になります。" },
    { kanji: "後付け", yomi: "アトヅケ", cat: "鳴き", desc: "鳴いた時点で役がなくても、アガリの瞬間に役が確定していればアガリを認めること", detail: "ポイントは「役がいつ確定するか」です。後付けありでは、アガった瞬間（ロン・ツモの牌が入った時点）に1役成立していればアガれます。形は主に2つ。①役牌バック＝白を2枚持ったまま先に別の面子をポンし（この時点では役なし）、あとで白をポンするか白でアガって役を確定させる形。②片アガリ＝待ちの片方の牌なら三色などの役が付き、もう片方なら役なしという形で、役が付く側の牌でだけアガれます。後付けなし（先付け）では最初に鳴いた時点で役が確定している必要があり、これらのアガリは認められません。", abbr: "「アトヅケ」。後付けと喰いタンの可否を組み合わせて、両方ありなら「アリアリ」、両方なしなら「ナシナシ」と呼びます。" },
    { kanji: "喰いタン", yomi: "クイタン", cat: "鳴き", desc: "鳴いた状態のタンヤオ。ルールによって認めない場合がある", detail: "鳴いた状態で成立するタンヤオのことです。認めるルールでは手を早く進める主力になり、認めないルール（喰いタンなし）では鳴くと役なしになるため打ち方が大きく変わります。対局前に必ず確認しておきたい項目です。", abbr: "正式には「喰い断么九」。「クイタン」と略します。認めないルールは「クイタンなし」「アリアリ／ナシナシ」の文脈で語られます。" },
    { kanji: "門前", yomi: "メンゼン", cat: "手牌", desc: "一度も鳴いていない状態。リーチや門前清自摸和の条件になる", detail: "一度もチー・ポン・明槓をしていない状態です。暗槓は門前のままです。門前でしか成立しない役が多く、リーチ・門前清自摸和・一発・裏ドラ・平和・一盃口・二盃口などが該当します。またロンアガリのときに門前加符10符がつきます。", abbr: "「メンゼン」。門前清自摸和は「メンゼンツモ」「ツモ」と略されます。" },
    { kanji: "聴牌", yomi: "テンパイ", cat: "手牌", desc: "あと1枚でアガリになる状態", detail: "あと1枚でアガリになっている状態です。門前ならリーチが宣言できます。流局時にテンパイしていれば罰符を受け取る側になり、親がテンパイしていればテンパイ連荘ルールでは親を続けられます。形式テンパイ（役がなくても形だけ整っている状態）も、多くのルールでテンパイと認められます。", abbr: "「テンパイ」。テンパイすることを「テンパる」と動詞にして使います。" },
    { kanji: "不聴", yomi: "ノーテン", cat: "手牌", desc: "テンパイしていない状態。流局時に罰符を払う", detail: "テンパイしていない状態です。流局時にノーテンだと罰符を支払う側になり、場に合計3000点をやりとりします。ノーテンが1人なら3000点、2人なら1500点ずつ、3人なら1000点ずつの負担です。", abbr: "「ノーテン」。流局時の罰符は「ノーテン罰符」「ノー罰」と呼びます。" },
    { kanji: "向聴", yomi: "シャンテン", cat: "手牌", desc: "テンパイまであと何枚必要かを表す数。1向聴ならあと1枚でテンパイ", detail: "テンパイまであと何枚の入れ替えが必要かを表す数です。テンパイが0向聴、あと1枚でテンパイなら1向聴と数えます。配牌の平均はおよそ3〜4向聴で、手が進むほど数字が小さくなります。", abbr: "「シャンテン」。テンパイまで2枚必要なら「2シャンテン」と数えます。" },
    { kanji: "面子", yomi: "メンツ", cat: "手牌", desc: "3枚1組の組み合わせ。順子と刻子がある", detail: "3枚1組の組み合わせで、順子（連続した3枚）と刻子（同じ牌3枚）の2種類があります。アガリの基本形は面子4つと雀頭1つです。カンした槓子も面子1つとして数えます。" },
    { kanji: "雀頭", yomi: "ジャントウ", cat: "手牌", desc: "同じ牌2枚の対子。アガリの形に必ず1組必要。「アタマ」ともいう", detail: "同じ牌2枚の組み合わせで、アガリの形に必ず1組だけ必要です。「アタマ」とも呼ばれます。役牌（自風・場風・三元牌）を雀頭にすると符が2符つきます。七対子と国士無双だけは例外的な形になります。", figs: [{ cap: "アガリ形のアタマ", tiles: "99p", note: "役牌なら2符つく" }] },
    { kanji: "順子", yomi: "シュンツ", cat: "手牌", desc: "同じ種類の数牌が3枚連続した面子。例：2萬3萬4萬", detail: "同じ種類の数牌が3つ連続した面子です。たとえば2萬3萬4萬。9萬と1筒のように種類をまたぐことはできず、9と1をつなげることもできません。順子には符がつきません。", figs: [{ cap: "2萬3萬4萬でひと組", tiles: "234m", note: "同じ種類で数が連続" }] },
    { kanji: "刻子", yomi: "コーツ", cat: "手牌", desc: "同じ牌3枚の面子", detail: "同じ牌3枚で作る面子です。自力で揃えた暗刻と、ポンで作った明刻があり、符が違います。中張牌の暗刻は4符・明刻は2符、么九牌の暗刻は8符・明刻は4符です。", figs: [{ cap: "同じ牌3枚", tiles: "555p", note: "暗刻なら4符、明刻なら2符" }] },
    { kanji: "槓子", yomi: "カンツ", cat: "手牌", desc: "同じ牌4枚の面子。カンして成立する", detail: "同じ牌4枚で作る面子です。カンを宣言することで成立します。符が高く、新ドラが増えるため打点が伸びやすい反面、相手のドラも増えるので状況判断が必要です。", figs: [{ cap: "同じ牌4枚", tiles: "3333s", note: "カンで成立。暗槓は16符" }] },
    { kanji: "対子", yomi: "トイツ", cat: "手牌", desc: "同じ牌2枚の組み合わせ", detail: "同じ牌2枚の組み合わせです。雀頭になるか、もう1枚引いて刻子に育てるかの2通りの使い道があります。対子が多い手は七対子や対々和を狙う目安になります。", figs: [{ cap: "同じ牌2枚", tiles: "77m", note: "雀頭になるか刻子に育てる" }] },
    { kanji: "搭子", yomi: "ターツ", cat: "手牌", desc: "あと1枚で順子になる2枚の組み合わせ。例：3萬4萬", detail: "あと1枚で順子になる2枚の組み合わせです。両面（3萬4萬）・嵌張（3萬5萬）・辺張（1萬2萬）の3種類があり、受け入れ枚数が大きく違います。両面は8枚、嵌張と辺張は4枚です。", figs: [{ cap: "両面のターツ", tiles: "34m", note: "あと1枚で順子" }, { cap: "嵌張のターツ", tiles: "35p", note: "真ん中が抜けている" }, { cap: "辺張のターツ", tiles: "12s", note: "端でしか受けられない" }] },
    { kanji: "孤立牌", yomi: "コリツハイ", cat: "手牌", desc: "周りとつながらず、面子になりにくい単独の牌", detail: "周囲とつながっておらず、単独で浮いている牌です。手が進むと真っ先に切る候補になります。ただし中張牌の孤立牌は将来搭子に育つ可能性があるため、么九牌の孤立牌より価値があります。" },
    { kanji: "両面", yomi: "リャンメン", cat: "待ち", desc: "順子の両端どちらでもアガれる待ち。例：3萬4萬で2萬と5萬の待ち。受け入れが最も広い", detail: "順子の両端どちらでもアガれる待ちです。3萬4萬なら2萬と5萬の2種類、合計8枚で受けられます。最も枚数が多く、リーチをかける価値が高い形です。符はつきません（平和の条件のひとつ）。", figs: [{ cap: "3萬4萬を持っていると", tiles: "34m", note: "2萬と5萬の2種類・計8枚で受けられる" }, { cap: "待ち牌", tiles: "25m", note: "最も広い待ち。符はつかない" }] },
    { kanji: "嵌張", yomi: "カンチャン", cat: "待ち", desc: "順子の真ん中が抜けた待ち。例：3萬5萬で4萬待ち。符が2符つく", detail: "順子の真ん中が抜けた待ちです。3萬5萬で4萬を待つ形で、受けは4枚しかありません。符が2符つきますが、両面に変えられるなら変えたほうが有利です。", figs: [{ cap: "3萬5萬を持っていると", tiles: "35m", note: "間の1種類だけ" }, { cap: "待ち牌", tiles: "4m", note: "受けは4枚。2符つく" }] },
    { kanji: "辺張", yomi: "ペンチャン", cat: "待ち", desc: "端でしか受けられない待ち。例：1萬2萬で3萬待ち。符が2符つく", detail: "端でしか受けられない待ちです。1萬2萬で3萬、または8萬9萬で7萬を待ちます。受けは4枚で、嵌張と同じく2符つきます。数の並びの端でしか起こらないのが特徴です。", figs: [{ cap: "1萬2萬を持っていると", tiles: "12m", note: "3萬しか受けられない" }, { cap: "待ち牌", tiles: "3m", note: "8萬9萬なら7萬待ち。2符つく" }] },
    { kanji: "単騎", yomi: "タンキ", cat: "待ち", desc: "雀頭になる1枚を待つ形。符が2符つく", detail: "雀頭になる1枚を待つ形です。受けは3枚と少ないですが、どの牌でも待てるため場に応じて待ち牌を変えられる柔軟さがあります。符は2符つきます。", figs: [{ cap: "面子4つが完成していて", tiles: "55m", note: "アタマの片割れを待つ" }, { cap: "待ち牌", tiles: "5m", note: "受けは3枚。2符つく" }] },
    { kanji: "双碰", yomi: "シャンポン", cat: "待ち", desc: "対子2組のどちらかが刻子になるのを待つ形。シャボともいう", detail: "対子を2組持ち、どちらかが刻子になるのを待つ形です。2萬2萬と7筒7筒なら2萬か7筒でアガリ、受けは4枚です。刻子ができるため符が高くなりやすく、対々和との相性も良い形です。", figs: [{ cap: "対子を2組持って", tiles: "22m 77p", note: "どちらかが刻子になればアガリ" }, { cap: "待ち牌", tiles: "2m7p", note: "受けは4枚。刻子になるので符が高い" }] },
    { kanji: "多面張", yomi: "タメンチャン", cat: "待ち", desc: "3種類以上の牌でアガれる待ちの形", detail: "3種類以上の牌でアガれる待ちです。たとえば2萬3萬4萬5萬6萬と持てば1萬・4萬・7萬の3面待ちになります。受け入れが広くアガリやすいため、テンパイ形を選ぶときの重要な判断材料です。", abbr: "「タメンチャン」。3面待ちなら「サンメンチャン」と具体的に呼びます。", figs: [{ cap: "この5枚を持つと", tiles: "23456m", note: "3面待ちになる" }, { cap: "待ち牌", tiles: "147m", note: "受け入れが広くアガりやすい" }] },
    { kanji: "和了", yomi: "ホーラ", cat: "アガリ", desc: "手牌を完成させて点数を得ること。このアプリでは「アガリ」と表記", detail: "手牌を完成させて点数を得ることです。読みは「ホーラ」。ツモとロンの2通りがあり、いずれも1翻以上の役が必要です。役がない状態でアガることはできず、これを役なしといいます。" },
    { kanji: "自摸", yomi: "ツモ", cat: "アガリ", desc: "山から牌を1枚取ること。また、自分で引いた牌でアガること", detail: "山から自分で牌を引くことです。引いた牌でアガることも「ツモ」といいます。門前でツモアガれば門前清自摸和が1翻つきます。ツモアガリでは3人全員から点数を受け取ります。" },
    { kanji: "栄和", yomi: "ロン", cat: "アガリ", desc: "他家の捨て牌でアガること", detail: "他家の捨て牌でアガることです。通常「ロン」と発声します。放銃した1人だけが点数を支払います。フリテンの状態ではロンできません。" },
    { kanji: "放銃", yomi: "ホウジュウ", cat: "アガリ", desc: "自分の捨て牌で他家にロンされること。「振り込む」ともいう", detail: "自分の捨てた牌で他家にロンされることです。「振り込む」「刺さる」ともいいます。ツモアガリなら3人で分担する失点を1人で背負うため、麻雀で最も避けたい事象とされます。", abbr: "「ホウジュウ」。「振り込む」「刺さる」「打ち込む」も同じ意味です。" },
    { kanji: "頭跳ね", yomi: "アタマハネ", cat: "アガリ", desc: "複数人が同時にロンしたとき、放銃者に近い1人だけがアガリになるルール", detail: "1つの捨て牌に複数人がロンを宣言したとき、放銃者から反時計回りに最も近い1人だけをアガリとするルールです。残りの人のアガリは無効になります。ダブロンを認めるルールでは全員がアガれますが、本場と供託は頭ハネ順の先頭が受け取ります。", abbr: "「アタマハネ」。「頭ハネ」と書くことが多いです。" },
    { kanji: "振聴", yomi: "フリテン", cat: "アガリ", desc: "自分の待ち牌を自分で捨てている状態。ロンできずツモのみになる", detail: "自分の待ち牌のいずれかを、自分がすでに捨てている状態です。この状態ではロンできず、ツモでしかアガれません。リーチ後に見逃した場合や、同巡内で見逃した場合にも一時的なフリテンが発生します。", abbr: "「フリテン」。カタカナ表記が一般的です。" },
    { kanji: "流局", yomi: "リュウキョク", cat: "アガリ", desc: "誰もアガれずに山が尽きて局が終わること", detail: "誰もアガらないまま牌山が尽きて局が終わることです。王牌14枚を残した時点で終了となります。テンパイしていた人とノーテンの人の間で罰符をやりとりし、供託のリーチ棒は場に残って次局に持ち越されます。" },
    { kanji: "連荘", yomi: "レンチャン", cat: "アガリ", desc: "親がアガる、またはテンパイして続けて親を務めること", detail: "親がアガる、またはルールによってはテンパイで流局した場合に、同じ人が続けて親を務めることです。連荘するたびに本場が1つ増え、1本場につき300点が加算されます。親は子の1.5倍の点数を得られるため、連荘は大きな武器になります。", abbr: "「レンチャン」。「レンチャンする」と動詞でも使います。" },
    { kanji: "親流れ", yomi: "オヤナガレ", cat: "アガリ", desc: "親が交代して次の人に移ること", detail: "親が次の人に移ることです。子がアガったとき、または親がノーテンで流局したとき（ルールによる）に起こります。親が流れると本場は0に戻ります。" },
    { kanji: "本場", yomi: "ホンバ", cat: "アガリ", desc: "連荘や流局が続いた回数。1本場につき300点が加算される", detail: "連荘や流局が続いた回数を表します。1本場ごとにアガリ点へ300点が加算され、ツモの場合は各家から100点ずつ集めます。表示は「東1局2本場」のようになり、積み棒で場に示します。" },
    { kanji: "ダブロン", yomi: "ダブロン", cat: "アガリ", desc: "1つの捨て牌に2人が同時にロンすること。認めるかはルール次第", detail: "1つの捨て牌に2人が同時にロンすることです。認めるかどうかはルール次第で、認めない場合は頭ハネになります。認める場合、放銃者は2人分をまとめて支払い、本場と供託は放銃者に近いほうが受け取ります。" },
    { kanji: "符", yomi: "フ", cat: "点数", desc: "手牌の構成から計算する点数の基礎値。20符を土台に加算していく", detail: "手牌の構成から計算する点数の基礎値です。副底20符を土台に、面子・雀頭・待ちの形・門前ロンの加符などを足し、最後に1の位を切り上げます。平和ツモは20符固定、七対子は25符固定という例外があります。" },
    { kanji: "翻", yomi: "ハン", cat: "点数", desc: "役の大きさを表す単位。翻が1つ増えると点数が約2倍になる", detail: "役の大きさを表す単位です。翻が1つ増えるごとに点数はおよそ2倍になります。1〜4翻は符と組み合わせて計算し、5翻以上は満貫・跳満などの固定点になります。ドラも翻数に加算されますが、ドラだけではアガれません。" },
    { kanji: "満貫", yomi: "マンガン", cat: "点数", desc: "5翻以上（または基本点2000点）の区切り。子8000点・親12000点", detail: "5翻以上、または基本点が2000点に達したときの区切りです。子は8000点、親は12000点。4翻でも符が高ければ計算上2000点を超えることがあり、その場合も満貫として扱います（頭打ち）。" },
    { kanji: "跳満", yomi: "ハネマン", cat: "点数", desc: "6〜7翻。子12000点・親18000点", detail: "6翻から7翻の点数です。子は12000点、親は18000点。満貫のちょうど1.5倍になります。" },
    { kanji: "倍満", yomi: "バイマン", cat: "点数", desc: "8〜10翻。子16000点・親24000点", detail: "8翻から10翻の点数です。子は16000点、親は24000点で、満貫のちょうど2倍にあたります。倍満のあたりから、一撃で順位がひっくり返る打点になります。" },
    { kanji: "三倍満", yomi: "サンバイマン", cat: "点数", desc: "11〜12翻。子24000点・親36000点", detail: "11翻から12翻の点数です。子は24000点、親は36000点。満貫の3倍で、13翻に届けば数え役満になります。", abbr: "「サンバイマン」。口頭では「サンバイ」ということもあります。" },
    { kanji: "数え役満", yomi: "カゾエヤクマン", cat: "点数", desc: "13翻以上で役満と同じ点数になること", detail: "役満の手がなくても、翻数が13翻以上に達したときに役満と同じ点数になることです。子は32000点、親は48000点。ドラを大量に含む手で発生しやすく、採用しないルールもあります。", abbr: "「カゾエ」と略されます。" },
    { kanji: "供託", yomi: "キョウタク", cat: "点数", desc: "場に出されたリーチ棒。次にアガった人がまとめて受け取る", detail: "リーチ時に場に出した1000点棒のことです。その局でアガった人がまとめて受け取ります。誰もアガらずに流局した場合は場に残り、次局へ持ち越されます。ダブロンのときは頭ハネ順の先頭が受け取ります。", abbr: "「キョウタク」。場に出ているリーチ棒そのものを指して「棒」と呼ぶこともあります。" },
    { kanji: "罰符", yomi: "バップ", cat: "点数", desc: "流局時にノーテンの人が払う点数。場で合計3000点をやりとりする", detail: "流局時にノーテンだった人が支払う点数です。場全体で3000点をやりとりし、テンパイ者が分け合います。ノーテンが1人なら3000点、2人なら1500点ずつ、3人なら1000点ずつを負担します。全員テンパイまたは全員ノーテンなら移動はありません。" },
    { kanji: "持ち点", yomi: "モチテン", cat: "点数", desc: "対局開始時に各自が持つ点数。25000点や30000点が一般的", detail: "対局開始時に各自が持つ点数です。25000点や30000点が一般的で、4人分の合計が場全体の点数になります。持ち点がなくなると箱下となり、多くのルールでその時点で終局します。" },
    { kanji: "返し点", yomi: "カエシテン", cat: "点数", desc: "精算の基準となる点数。持ち点との差がオカになる", detail: "精算時の基準となる点数です。持ち点25000・返し点30000のように差をつけると、その差額の合計（この場合20000点）がオカとしてトップに渡ります。持ち点と返し点が同じならオカは発生しません。" },
    { kanji: "オカ", yomi: "オカ", cat: "点数", desc: "持ち点と返し点の差を集めたもの。トップが総取りする", detail: "持ち点と返し点の差を4人分集めたもので、トップが総取りします。25000点持ちの30000点返しなら1人あたり5000点、合計20000点がトップに加算されます。順位による差を大きくする仕組みです。" },
    { kanji: "ウマ", yomi: "ウマ", cat: "点数", desc: "順位によってやりとりする点数。10-20や5-10などがある", detail: "順位に応じてやりとりする点数です。10-20なら2位が+10・1位が+20、3位が-10・4位が-20という具合に配分します。5-10、10-20、10-30などの設定があり、大きいほど順位の価値が上がります。" },
    { kanji: "箱下", yomi: "ハコシタ", cat: "点数", desc: "持ち点がマイナスになること。トビ・ハコテンともいい、多くは終局になる", detail: "持ち点がマイナスになることです。トビ、ハコテン、ドボンとも呼ばれます。多くのルールではこの時点で対局が終了しますが、続行するルールもあります。", abbr: "「ハコシタ」。「トビ」「ハコテン」「ドボン」「ブットビ」もすべて同じ意味です。" },
    { kanji: "切り上げ満貫", yomi: "キリアゲマンガン", cat: "点数", desc: "4翻30符・3翻60符を満貫として扱うルール", detail: "4翻30符（子7700・親11600）と3翻60符を、満貫として扱うルールです。計算が簡単になり打点も上がりますが、採用しない場が多いので事前確認が必要です。" },
    { kanji: "起家", yomi: "チーチャ", cat: "場", desc: "最初の親のこと。東1局の親", detail: "最初の親、つまり東1局で親を務める人のことです。席決めで決まります。半荘では起家がもう一度親に戻ってくると南場に入ります。" },
    { kanji: "東風戦", yomi: "トンプウセン", cat: "場", desc: "東場だけで終わる短い対局形式", detail: "東場だけで終える対局形式です。東1局から東4局までの4局が基本で、連荘があればさらに続きます。半荘の半分の時間で終わるため、短時間で打ちたいときに選ばれます。" },
    { kanji: "半荘", yomi: "ハンチャン", cat: "場", desc: "東場と南場を行う標準的な対局形式", detail: "東場と南場を行う標準的な対局形式です。東1局から南4局までの8局が基本になります。「はんちゃん」と読み、1半荘でおよそ1時間が目安です。" },
    { kanji: "オーラス", yomi: "オーラス", cat: "場", desc: "その対局の最終局。東風戦なら東4局、半荘なら南4局", detail: "その対局の最終局です。東風戦なら東4局、半荘なら南4局を指します。順位が確定する局なので、点数状況を見た押し引きの判断が重要になります。親がトップの場合、アガリやめ・テンパイやめで終局にできるルールが一般的です。" },
    { kanji: "上家", yomi: "カミチャ", cat: "場", desc: "自分の左隣の人。チーができる相手", detail: "自分から見て左隣の人です。上家の捨て牌だけがチーの対象になります。上家が鳴くと自分のツモ番が飛ぶため、進行への影響が大きい相手です。" },
    { kanji: "下家", yomi: "シモチャ", cat: "場", desc: "自分の右隣の人", detail: "自分から見て右隣の人です。自分の捨て牌を最初にチーできるのが下家なので、下家に鳴かせない配慮を「絞る」といいます。" },
    { kanji: "対面", yomi: "トイメン", cat: "場", desc: "自分の正面の人", detail: "自分の正面に座っている人です。「といめん」と読みます。距離が最も遠いため、ポンやカンでしか鳴きの影響を受けません。", abbr: "「トイメン」。上家は「カミチャ」、下家は「シモチャ」です。" },
    { kanji: "他家", yomi: "ターチャ", cat: "場", desc: "自分以外の3人", detail: "自分以外の3人のことです。「ターチャ」と読みます。上家・下家・対面をまとめて指すときに使います。" },
    { kanji: "王牌", yomi: "ワンパイ", cat: "場", desc: "山の最後に残す14枚。ドラ表示牌や嶺上牌が含まれ、ここからはツモらない", detail: "牌山の最後に必ず残しておく14枚です。ここからは通常のツモをしません。ドラ表示牌・裏ドラ表示牌・嶺上牌が含まれ、カンをするたびに嶺上牌が使われる代わりに海底が1つ手前にずれます。" },
    { kanji: "嶺上牌", yomi: "リンシャンパイ", cat: "場", desc: "カンしたときに引く牌。王牌から取る", detail: "カンをしたときに補充として引く牌で、王牌から取ります。この牌でアガると嶺上開花という1翻役がつきます。カンは1局で最大4回までなので、嶺上牌も4枚用意されています。", abbr: "「リンシャンパイ」。この牌でのアガリは「リンシャン」と略されます。" },
    { kanji: "海底", yomi: "ハイテイ", cat: "場", desc: "山の最後の1枚。ここでツモアガると海底摸月がつく", detail: "牌山の最後の1枚、およびその牌をツモることを指します。ここでツモアガると海底摸月（1翻）がつきます。海底牌でカンはできません。", abbr: "「ハイテイ」。海底摸月は「ハイテイ」「ハイテイツモ」と略します。" },
    { kanji: "河底", yomi: "ホウテイ", cat: "場", desc: "最後の捨て牌。ここでロンすると河底撈魚がつく", detail: "その局の最後の捨て牌のことです。この牌でロンすると河底撈魚（1翻）がつきます。海底でツモった人が捨てた牌が河底牌になります。", abbr: "「ホウテイ」。河底撈魚は「ホウテイ」「ホウテイロン」と略します。" },
    { kanji: "河", yomi: "ホー", cat: "場", desc: "捨て牌が並べられる場所。捨て牌の総称としても使う", detail: "各自の前に捨て牌を並べていく場所です。1段6枚で並べるのが作法とされます。相手の河を見ることが安全牌の判断や待ちの読みの基本になります。" },
    { kanji: "配牌", yomi: "ハイパイ", cat: "場", desc: "各自に最初に配られる13枚の牌", detail: "各自に最初に配られる13枚の牌です。親だけは第1ツモを含めて14枚からのスタートになります。サイコロの目で決めた場所から、4枚ずつ3回、最後に1枚ずつ取るのが正式な取り方です。" },
    { kanji: "席決め", yomi: "セキギメ", cat: "場", desc: "対局前に座る位置を決めること。サイコロや牌を使う", detail: "対局前に座る位置と最初の親を決めることです。牌を裏返して引く方法や、サイコロを振って決める方法があります。順位戦では公平性のために毎回行います。" },
    { kanji: "萬子", yomi: "マンズ", cat: "牌", desc: "漢数字と「萬」が書かれた数牌。1萬から9萬まで", detail: "漢数字と「萬」の字が書かれた数牌です。一萬から九萬まで各4枚、合計36枚あります。「ワンズ」とも読みます。", figs: [{ cap: "一萬から九萬まで各4枚", tiles: "123456789m", note: "「ワンズ」とも読む" }] },
    { kanji: "筒子", yomi: "ピンズ", cat: "牌", desc: "丸い模様の数牌。1筒から9筒まで", detail: "円形の模様が描かれた数牌です。1筒から9筒まで各4枚、合計36枚。模様の数がそのまま数字を表すので初心者にも読みやすい種類です。", figs: [{ cap: "1筒から9筒まで各4枚", tiles: "123456789p", note: "模様の数がそのまま数字" }] },
    { kanji: "索子", yomi: "ソーズ", cat: "牌", desc: "竹の棒が描かれた数牌。1索は鳥の絵柄", detail: "竹の棒が描かれた数牌です。1索から9索まで各4枚、合計36枚。1索だけは例外的に鳥（孔雀）の絵柄になっています。", figs: [{ cap: "1索から9索まで各4枚", tiles: "123456789s", note: "1索だけ鳥の絵柄" }] },
    { kanji: "字牌", yomi: "ジハイ", cat: "牌", desc: "風牌と三元牌の総称。数字のない牌", detail: "数字を持たない牌の総称で、風牌4種と三元牌3種の合計7種類・28枚です。順子が作れないため、使うなら刻子か雀頭になります。序盤で切られやすい一方、終盤は安全牌として重宝します。", figs: [{ cap: "風牌4種", tiles: "東南西北", note: "順子は作れない" }, { cap: "三元牌3種", tiles: "白發中", note: "刻子にすれば役になる" }] },
    { kanji: "風牌", yomi: "フォンパイ", cat: "牌", desc: "東・南・西・北の4種類", detail: "東・南・西・北の4種類です。自風（自分の座席の風）または場風（その場の風）と一致する牌を刻子にすると1翻の役になります。両方に一致すればダブ東などで2翻です。", figs: [{ cap: "東・南・西・北", tiles: "東南西北", note: "自風・場風と一致すれば1翻" }] },
    { kanji: "三元牌", yomi: "サンゲンパイ", cat: "牌", desc: "白・發・中の3種類。刻子にすると役がつく", detail: "白・發・中の3種類です。どれでも刻子にすれば1翻の役になります。3種類すべてを刻子にすると大三元という役満です。", figs: [{ cap: "白・發・中", tiles: "白發中", note: "どれでも刻子で1翻" }] },
    { kanji: "么九牌", yomi: "ヤオチューハイ", cat: "牌", desc: "1と9の数牌、および字牌の総称", detail: "1と9の数牌、および字牌すべてをまとめた呼び方です。「ヤオチュー牌」と読みます。刻子にすると符が高くなり、混老頭・清老頭・国士無双などの役に関わります。タンヤオでは1枚も使えません。", figs: [{ cap: "1と9の数牌", tiles: "19m19p19s", note: "および字牌すべて" }, { cap: "字牌も含む", tiles: "東南西北白發中", note: "タンヤオでは1枚も使えない" }] },
    { kanji: "老頭牌", yomi: "ロウトウハイ", cat: "牌", desc: "1と9の数牌のみ。字牌は含まない", detail: "1と9の数牌だけを指します。字牌は含まないのが么九牌との違いです。清老頭は老頭牌だけで作る役満です。", figs: [{ cap: "1と9の数牌だけ", tiles: "19m19p19s", note: "字牌は含まない" }] },
    { kanji: "中張牌", yomi: "チュンチャンパイ", cat: "牌", desc: "2から8までの数牌。タンヤオで使える牌", detail: "2から8までの数牌です。「チュンチャン牌」と読みます。タンヤオはこの牌だけで手を作る役です。順子が作りやすく手牌の中心になりますが、終盤は危険牌になりやすい牌でもあります。", figs: [{ cap: "2から8までの数牌", tiles: "2345678m", note: "タンヤオで使える牌" }] },
    { kanji: "客風牌", yomi: "オタカゼハイ", cat: "牌", desc: "自風でも場風でもない風牌。刻子にしても役にならない", detail: "自風でも場風でもない風牌のことで、オタ風とも呼びます。刻子にしても役にならないため、字牌の中では価値が低く、序盤で処理されることが多い牌です。" },
    { kanji: "赤ドラ", yomi: "アカドラ", cat: "牌", desc: "赤く塗られた5の牌。1枚につき1翻加算される", detail: "5萬・5筒・5索の一部を赤く塗った牌です。1枚につき1翻加算されます。各種1枚ずつ計3枚入れるのが一般的ですが、枚数はルールによります。役ではないので、赤ドラだけではアガれません。", figs: [{ cap: "赤く塗られた5の牌", tiles: "5m5p5s", note: "1枚につき1翻" }] },
    { kanji: "裏ドラ", yomi: "ウラドラ", cat: "牌", desc: "リーチしてアガったときだけ見られるドラ", detail: "リーチしてアガったときだけ確認できるドラです。ドラ表示牌の真下にある牌をめくって決めます。リーチの価値を大きく高める要素で、一撃で満貫級になることもあります。" },
    { kanji: "槓ドラ", yomi: "カンドラ", cat: "牌", desc: "カンをすると増えるドラ", detail: "カンをすると新たにめくられるドラ表示牌によるドラです。カンした本人だけでなく全員に適用されるため、自分の手が安いときのカンは相手を利する危険があります。" },
    { kanji: "立直", yomi: "リーチ", cat: "戦術", desc: "門前テンパイ時に1000点を場に出して宣言する役", detail: "門前でテンパイしたときに1000点を場に出して宣言する役です。1翻ですが、一発・裏ドラ・ツモがついて打点が跳ね上がります。宣言後は手を変えられず、ツモ切りを続けることになります。", abbr: "「リーチ」。曲げる、棒を出す、などとも表現します。" },
    { kanji: "ダマテン", yomi: "ダマテン", cat: "戦術", desc: "テンパイしてもリーチせずに黙っていること。ヤミテンともいう", detail: "テンパイしてもリーチをかけずに黙っている状態です。ヤミテンともいいます。相手に警戒されないためロンされやすく、手を変える自由も残ります。すでに高い手のときや、リーチすると押し返される場況で選びます。", abbr: "「ヤミテン」「ヤミ」ともいいます。地域によって呼び方が変わるだけで意味は同じです。" },
    { kanji: "降りる", yomi: "オリル", cat: "戦術", desc: "アガリをあきらめ、放銃しないことに徹すること", detail: "アガリをあきらめ、放銃しないことに徹する打ち方です。ベタ降りともいいます。現物や筋の牌を優先して切り、安全度の高い牌から順に処理します。無理に押して満貫を放銃するより、確実に失点を抑えるほうが期待値が高い場面は多くあります。" },
    { kanji: "回し打ち", yomi: "マワシウチ", cat: "戦術", desc: "危険牌を避けながら、アガリも狙って打つこと", detail: "危険牌を避けつつ、アガリの可能性も残して打つことです。完全に降りるのと押し切るのの中間にあたります。手が良く、かつ相手の待ちがある程度読める場合に有効です。" },
    { kanji: "現物", yomi: "ゲンブツ", cat: "戦術", desc: "相手がすでに捨てている牌。その相手にはロンされない安全牌", detail: "相手がすでに捨てている牌のことです。フリテンの規則により、その相手からロンされることは絶対にありません。降りるときの最優先の候補になります。ただし他家に対しては安全とは限りません。", abbr: "「ゲンブツ」。単に「現」と略すこともあります。" },
    { kanji: "筋", yomi: "スジ", cat: "戦術", desc: "3が捨ててあれば6は比較的安全、といった数の関係を使った読み", detail: "3が捨ててあれば6は両面で当たらない、といった数の関係を使った読みです。1-4-7、2-5-8、3-6-9の3系統があります。あくまで両面待ちに対する読みなので、嵌張・辺張・単騎・双碰には通用しません。", abbr: "1-4-7を「イースーチー」、2-5-8を「リャンウーパー」、3-6-9を「サブロッキュー」と呼びます。中国語読みの数字（イー・リャン・サン・スー・ウー・ロー・チー・パー・キュー）に由来します。捨て牌を見て「イースーチーが通ってる」のように使います。", figs: [{ cap: "イースーチー（1-4-7）", tiles: "147m", note: "1が捨ててあれば4は、4が捨ててあれば1と7は両面で当たらない" }, { cap: "リャンウーパー（2-5-8）", tiles: "258m", note: "2と5、5と8がそれぞれ対応する" }, { cap: "サブロッキュー（3-6-9）", tiles: "369m", note: "3が捨ててあれば6、6が捨ててあれば3と9" }] },
    { kanji: "壁", yomi: "カベ", cat: "戦術", desc: "同じ牌が4枚見えていることを利用した安全度の読み。ノーチャンスともいう", detail: "同じ牌が4枚すべて見えていることを利用した読みです。ノーチャンスともいいます。たとえば4萬が4枚見えていれば、2萬3萬や5萬6萬の両面待ちは成立しないと判断できます。" },
    { kanji: "追っかけリーチ", yomi: "オッカケリーチ", cat: "戦術", desc: "他家のリーチに対して、あとからリーチをかけること", detail: "他家のリーチに対して、あとから自分もリーチをかけることです。押し返す姿勢を示せますが、放銃の危険も上がります。手の価値・待ちの良さ・点数状況を見て判断します。" },
  ];
  const TERM_CATS = ["鳴き", "手牌", "待ち", "アガリ", "点数", "場", "牌", "戦術"];
  const YAKU_DATA = [
    { name: "リーチ（立直）", yomi: ["りーち", "りいち"], han: 1, naki: null, desc: "テンパイ時に宣言。門前（メンゼン）限定。宣言後は手牌を変えられない", cat: "1翻" },
    { name: "一発（イッパツ）", yomi: ["いっぱつ"], han: 1, naki: null, desc: "リーチ後、次の自分のツモまでにアガること。途中で鳴きが入ると無効", cat: "1翻" },
    { name: "門前清自摸和（メンゼンツモ）", yomi: ["めんぜんつも", "つも", "めんぜんちんつも"], han: 1, naki: null, desc: "鳴かずにツモでアガる", cat: "1翻" },
    { name: "平和（ピンフ）", yomi: ["ぴんふ"], han: 1, naki: null, desc: "全て順子（シュンツ）で構成。雀頭が役牌でなく、両面待ち。門前限定", cat: "1翻" },
    { name: "断么九（タンヤオ）", yomi: ["たんやお", "たんやおちゅう"], han: 1, naki: 1, desc: "1・9・字牌を使わず、2〜8の数牌だけで構成", cat: "1翻" },
    { name: "一盃口（イーペーコー）", yomi: ["いーぺーこー", "いいぺえこお", "いーぺーこう"], han: 1, naki: null, desc: "同じ順子が2組ある。例: 123 123。門前限定", cat: "1翻" },
    { name: "役牌 白（ハク）", yomi: ["はく", "やくはいはく", "しろ"], han: 1, naki: 1, desc: "白を3枚揃える（刻子か槓子）", cat: "1翻" },
    { name: "役牌 發（ハツ）", yomi: ["はつ", "やくはいはつ"], han: 1, naki: 1, desc: "發を3枚揃える", cat: "1翻" },
    { name: "役牌 中（チュン）", yomi: ["ちゅん", "やくはいちゅん"], han: 1, naki: 1, desc: "中を3枚揃える", cat: "1翻" },
    { name: "場風牌（バカゼハイ）", yomi: ["ばかぜ", "ばかぜはい"], han: 1, naki: 1, desc: "場風（東場なら東、南場なら南）を3枚揃える", cat: "1翻" },
    { name: "自風牌（ジカゼハイ）", yomi: ["じかぜ", "じかぜはい"], han: 1, naki: 1, desc: "自分の風（東家なら東など）を3枚揃える", cat: "1翻" },
    { name: "嶺上開花（リンシャンカイホウ）", yomi: ["りんしゃんかいほう", "りんしゃん"], han: 1, naki: 1, desc: "カンした後のリンシャン牌でアガる", cat: "1翻" },
    { name: "搶槓（チャンカン）", yomi: ["ちゃんかん"], han: 1, naki: 1, desc: "他家がカカンした牌でロンアガリ", cat: "1翻" },
    { name: "海底摸月（ハイテイ）", yomi: ["はいてい", "はいていもーゆえ", "はいていらおゆえ"], han: 1, naki: 1, desc: "最後のツモ牌でアガる", cat: "1翻" },
    { name: "河底撈魚（ホウテイ）", yomi: ["ほうてい", "ほーてい", "ほうていらおゆい"], han: 1, naki: 1, desc: "最後の捨て牌でロンアガリ", cat: "1翻" },
    { name: "ダブル立直（ダブルリーチ）", yomi: ["だぶるりーち", "だぶりー", "だぶるりいち"], han: 2, naki: null, desc: "最初の捨て牌でリーチ宣言。途中で鳴きが入っていないことが条件", cat: "2翻" },
    { name: "三色同順（サンショクドウジュン）", yomi: ["さんしょくどうじゅん", "さんしょく"], han: 2, naki: 1, desc: "萬子・筒子・索子で同じ数の順子。例: 123萬 123筒 123索。鳴くと1翻", cat: "2翻" },
    { name: "一気通貫（イッキツウカン）", yomi: ["いっきつうかん", "いっつう"], han: 2, naki: 1, desc: "同じ種類の牌で123・456・789を揃える。鳴くと1翻", cat: "2翻" },
    { name: "混全帯么九（チャンタ）", yomi: ["ちゃんた", "ほんちゃんたいやおちゅう"], han: 2, naki: 1, desc: "全ての面子と雀頭に1・9・字牌が含まれる。鳴くと1翻", cat: "2翻" },
    { name: "七対子（チートイツ）", yomi: ["ちーといつ", "ちいといつ", "ちーとい"], han: 2, naki: null, desc: "7つの対子（同じ牌2枚のペア×7組）で構成。門前限定。25符固定", cat: "2翻" },
    { name: "対々和（トイトイ）", yomi: ["といとい", "といといほー", "といといほう"], han: 2, naki: 2, desc: "全て刻子（同じ牌3枚）で構成。順子なし", cat: "2翻" },
    { name: "三暗刻（サンアンコー）", yomi: ["さんあんこー", "さんあんこう", "さんあんこ"], han: 2, naki: 2, desc: "暗刻（自力で揃えた3枚組）が3つある", cat: "2翻" },
    { name: "三色同刻（サンショクドウコー）", yomi: ["さんしょくどうこー", "さんしょくどうこう"], han: 2, naki: 2, desc: "萬子・筒子・索子で同じ数の刻子。例: 555萬 555筒 555索", cat: "2翻" },
    { name: "三槓子（サンカンツ）", yomi: ["さんかんつ"], han: 2, naki: 2, desc: "槓子（4枚組）が3つある", cat: "2翻" },
    { name: "小三元（ショウサンゲン）", yomi: ["しょうさんげん", "しょーさんげん"], han: 2, naki: 2, desc: "白・發・中のうち2つを刻子、1つを雀頭にする。※役牌2つ分も加算", cat: "2翻" },
    { name: "混老頭（ホンロウトウ）", yomi: ["ほんろうとう", "ほんろーとー", "ほんろうとお"], han: 2, naki: 2, desc: "1・9・字牌のみで構成。対々和か七対子の形になる", cat: "2翻" },
    { name: "二盃口（リャンペーコー）", yomi: ["りゃんぺーこー", "りゃんぺいこお", "りゃんぺーこう"], han: 3, naki: null, desc: "一盃口が2組ある。門前限定", cat: "3翻" },
    { name: "純全帯么九（ジュンチャン）", yomi: ["じゅんちゃん", "じゅんちゃんた", "じゅんぜんたいやおちゅう"], han: 3, naki: 2, desc: "全ての面子と雀頭に1・9が含まれる（字牌なし）。鳴くと2翻", cat: "3翻" },
    { name: "混一色（ホンイツ）", yomi: ["ほんいつ", "ほんいーそー", "ほんいーそう"], han: 3, naki: 2, desc: "1種類の数牌＋字牌のみで構成。鳴くと2翻", cat: "3翻" },
    { name: "清一色（チンイツ）", yomi: ["ちんいつ", "ちんいーそー", "ちんいーそう"], han: 6, naki: 5, desc: "1種類の数牌のみで構成。鳴くと5翻", cat: "6翻" },
    { name: "国士無双（コクシムソウ）", yomi: ["こくしむそう", "こくし", "こくしむそお"], han: 13, naki: null, desc: "1・9・字牌を全種類1枚ずつ＋どれか1枚。13種の么九牌を集める", cat: "役満" },
    { name: "四暗刻（スーアンコー）", yomi: ["すーあんこー", "すうあんこう", "すーあんこ"], han: 13, naki: null, desc: "暗刻が4つ。全ての刻子を自力で揃える。門前限定", cat: "役満" },
    { name: "大三元（ダイサンゲン）", yomi: ["だいさんげん"], han: 13, naki: 13, desc: "白・發・中の全てを刻子にする", cat: "役満" },
    { name: "字一色（ツーイーソー）", yomi: ["つーいーそー", "つういいそう", "つーいーそう"], han: 13, naki: 13, desc: "字牌（東南西北白發中）のみで構成", cat: "役満" },
    { name: "小四喜（ショウスーシー）", yomi: ["しょうすーしー", "しょうすうしい", "しょーすーしー"], han: 13, naki: 13, desc: "東南西北のうち3つを刻子、1つを雀頭にする", cat: "役満" },
    { name: "大四喜（ダイスーシー）", yomi: ["だいすーしー", "だいすうしい"], han: 13, naki: 13, desc: "東南西北の全てを刻子にする", cat: "役満" },
    { name: "緑一色（リューイーソー）", yomi: ["りゅーいーそー", "りゅういいそう", "りゅーいーそう"], han: 13, naki: 13, desc: "索子の2・3・4・6・8と發のみで構成", cat: "役満" },
    { name: "清老頭（チンロウトウ）", yomi: ["ちんろうとう", "ちんろーとー", "ちんろうとお"], han: 13, naki: 13, desc: "1と9の数牌のみで構成（字牌なし）", cat: "役満" },
    { name: "九蓮宝燈（チューレンポウトウ）", yomi: ["ちゅーれんぽーとー", "ちゅうれんぽうとう", "ちゅーれんぽうとう", "ちゅーれん"], han: 13, naki: null, desc: "1112345678999＋同種の任意の1枚。門前限定", cat: "役満" },
    { name: "四槓子（スーカンツ）", yomi: ["すーかんつ", "すうかんつ"], han: 13, naki: 13, desc: "槓子（4枚組）を4つ作る", cat: "役満" },
    { name: "天和（テンホウ）", yomi: ["てんほう", "てんほー"], han: 13, naki: null, desc: "親が配牌の時点でアガリの形。門前限定", cat: "役満" },
    { name: "地和（チーホウ）", yomi: ["ちーほう", "ちいほう", "ちーほー"], han: 13, naki: null, desc: "子が最初のツモでアガる。鳴きが入っていないことが条件", cat: "役満" },
  ];
  const YAKU_CATEGORIES = ["1翻", "2翻", "3翻", "6翻", "役満"];
  const HAN_CHOICES = ["0", "1", "2", "3", "5", "6", "役満"];

  // ── Quiz state ──
  const [quizAnswer, setQuizAnswer] = useState(null);
  const [quizRevealed, setQuizRevealed] = useState(false);
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 });
  const [quizMode, setQuizMode] = useState(null);
  const [quizOrder, setQuizOrder] = useState([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  // ── 学習状況（localStorage永続化） ──
  const [masteredYaku, setMasteredYaku] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mj_mastered") || "[]"); } catch { return []; }
  });
  const [wrongYaku, setWrongYaku] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mj_wrong") || "{}"); } catch { return {}; }
  });
  const saveMastered = (arr) => { setMasteredYaku(arr); try { localStorage.setItem("mj_mastered", JSON.stringify(arr)); } catch {} };
  const saveWrong = (obj) => { setWrongYaku(obj); try { localStorage.setItem("mj_wrong", JSON.stringify(obj)); } catch {} };

  // ── 用語問題集 ──
  const [termCat, setTermCat] = useState(null);      // null=カテゴリ選択中
  const [termOrder, setTermOrder] = useState([]);
  const [termIdx, setTermIdx] = useState(0);
  const [termRevealed, setTermRevealed] = useState(false);
  const [termScore, setTermScore] = useState({ known: 0, total: 0 });
  const [termFinished, setTermFinished] = useState(false);
  const [masteredTerms, setMasteredTerms] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mj_term_mastered") || "[]"); } catch { return []; }
  });
  const [wrongTerms, setWrongTerms] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mj_term_wrong") || "{}"); } catch { return {}; }
  });
  const saveTermMastered = (arr) => { setMasteredTerms(arr); try { localStorage.setItem("mj_term_mastered", JSON.stringify(arr)); } catch {} };
  const saveTermWrong = (obj) => { setWrongTerms(obj); try { localStorage.setItem("mj_term_wrong", JSON.stringify(obj)); } catch {} };

  // ── 点数問題集（4翻以下） ──
  const SQ_FU = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];
  const SQ_HAN = [1, 2, 3, 4];
  // 実戦でありえない組み合わせを除外
  const sqValid = (fu, han, isTsumo) => {
    if (fu === 20 && !isTsumo) return false;            // 20符は平和ツモのみ
    if (fu === 20 && han === 1) return false;           // 平和+ツモで最低2翻
    if (fu === 25 && han === 1) return false;           // 七対子は2翻から
    if (fu === 25 && han === 2 && isTsumo) return false; // 七対子ツモは3翻から
    return true;
  };
  // 出題1問ぶんの答えを作る
  const sqAnswer = (fu, han, isParent, isTsumo) => {
    const r = calcScore(fu, han, isParent, isTsumo, false);
    if (!isTsumo) return { kind: "single", label: "放銃者から", value: r.total, text: r.total.toLocaleString() };
    if (isParent) return { kind: "single", label: "各家から", value: r.each, text: r.each.toLocaleString() };
    return {
      kind: "pair", label: "子から / 親から",
      child: r.fromChild, parent: r.fromParent,
      text: `${r.fromChild.toLocaleString()} / ${r.fromParent.toLocaleString()}`,
    };
  };
  const [sqMode, setSqMode] = useState(null);     // null | "choice" | "input"
  const [sqQ, setSqQ] = useState(null);
  const [sqPicked, setSqPicked] = useState(null); // 選択式で選んだ答え
  const [sqIn1, setSqIn1] = useState("");
  const [sqIn2, setSqIn2] = useState("");
  const [sqJudged, setSqJudged] = useState(null); // null | true | false
  const [sqScore, setSqScore] = useState({ ok: 0, total: 0 });

  const makeScoreQuestion = () => {
    // ありえる組み合わせの中からランダムに1問
    const all = [];
    for (const fu of SQ_FU) for (const han of SQ_HAN)
      for (const isParent of [true, false]) for (const isTsumo of [true, false])
        if (sqValid(fu, han, isTsumo)) all.push({ fu, han, isParent, isTsumo });
    const q = all[Math.floor(Math.random() * all.length)];
    const ans = sqAnswer(q.fu, q.han, q.isParent, q.isTsumo);

    // 誤答は「近い符・翻の実在する点数」から作る（でたらめな数字にしない）
    const pool = [];
    for (const fu of SQ_FU) for (const han of SQ_HAN) {
      if (!sqValid(fu, han, q.isTsumo)) continue;
      if (fu === q.fu && han === q.han) continue;
      const a = sqAnswer(fu, han, q.isParent, q.isTsumo);
      if (a.text !== ans.text) pool.push(a.text);
    }
    const uniq = [...new Set(pool)];
    // 近い値ほど紛らわしいので、答えに近い順に候補を並べてから上位から選ぶ
    const num = (s) => parseInt(String(s).replace(/[^0-9]/g, ""), 10) || 0;
    uniq.sort((a, b) => Math.abs(num(a) - num(ans.text)) - Math.abs(num(b) - num(ans.text)));
    const near = uniq.slice(0, 8);
    const picked = [];
    while (picked.length < 3 && near.length) {
      picked.push(near.splice(Math.floor(Math.random() * near.length), 1)[0]);
    }
    const choices = [ans.text, ...picked].sort(() => Math.random() - 0.5);

    setSqQ({ ...q, ans, choices });
    setSqPicked(null); setSqIn1(""); setSqIn2(""); setSqJudged(null);
  };

  const judgeScoreInput = () => {
    if (!sqQ) return;
    const n = (s) => parseInt(String(s).replace(/[^0-9]/g, ""), 10);
    const a = sqQ.ans;
    const ok = a.kind === "pair"
      ? (n(sqIn1) === a.child && n(sqIn2) === a.parent)
      : (n(sqIn1) === a.value);
    setSqJudged(ok);
    setSqScore(s => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }));
  };
  const judgeScoreChoice = (choice) => {
    if (sqJudged !== null) return;
    const ok = choice === sqQ.ans.text;
    setSqPicked(choice);
    setSqJudged(ok);
    setSqScore(s => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }));
  };

  const startTermQuiz = (cat) => {
    const base = cat === "all" ? TERM_DATA : TERM_DATA.filter(t => t.cat === cat);
    const pool = base.filter(t => !masteredTerms.includes(t.kanji));
    // 間違えた回数が多いものを優先しつつ、同点はランダムに
    const order = pool
      .map(t => ({ t, w: wrongTerms[t.kanji] || 0, r: Math.random() }))
      .sort((a, b) => (b.w - a.w) || (a.r - b.r))
      .map(x => x.t);
    setTermCat(cat);
    setTermOrder(order);
    setTermIdx(0);
    setTermRevealed(false);
    setTermScore({ known: 0, total: 0 });
    setTermFinished(false);
  };

  const answerTerm = (known) => {
    const cur = termOrder[termIdx];
    if (!cur) return;
    if (known) {
      const w = { ...wrongTerms };
      if (w[cur.kanji]) { w[cur.kanji] = Math.max(0, w[cur.kanji] - 1); saveTermWrong(w); }
    } else {
      saveTermWrong({ ...wrongTerms, [cur.kanji]: (wrongTerms[cur.kanji] || 0) + 1 });
    }
    setTermScore(s => ({ known: s.known + (known ? 1 : 0), total: s.total + 1 }));
    setTermRevealed(true);
  };

  const nextTerm = () => {
    if (termIdx + 1 >= termOrder.length) { setTermFinished(true); return; }
    setTermIdx(i => i + 1);
    setTermRevealed(false);
  };

  const getQuizPool = () => {
    const base = quizMode === "naki" ? YAKU_DATA.filter(y => y.naki !== null) : YAKU_DATA;
    return base.filter(y => !masteredYaku.includes(y.name));
  };
  const isReverse = () => quizMode === "reverse";

  const [quizInput, setQuizInput] = useState("");
  const [quizComposing, setQuizComposing] = useState(false);

  // ひらがな以外を除去（カタカナは自動変換、漢字・英数は削除）
  const toHiraganaOnly = (s) => {
    if (!s) return "";
    return s
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
      .replace(/[^ぁ-んー]/g, "");  // ひらがな・長音以外を削除
  };

  // ひらがな正規化（濁点・長音・小文字の揺れを吸収）
  const normalizeYomi = (s) => {
    if (!s) return "";
    let n = s.trim().toLowerCase()
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
      .replace(/[\s・、。ｰ]/g, "")                                              // 空白・記号を除去
      .replace(/[ぁぃぅぇぉゃゅょ]/g, ch => "あいうえおやゆよ"["ぁぃぅぇぉゃゅょ".indexOf(ch)]); // 小文字→大文字（っは残す）
    // 長音記号を直前の母音に展開（例: ちんろーとー → ちんろおとお）
    const VOWEL = { "あ":"あ","か":"あ","さ":"あ","た":"あ","な":"あ","は":"あ","ま":"あ","や":"あ","ら":"あ","わ":"あ","が":"あ","ざ":"あ","だ":"あ","ば":"あ","ぱ":"あ",
                    "い":"い","き":"い","し":"い","ち":"い","に":"い","ひ":"い","み":"い","り":"い","ぎ":"い","じ":"い","ぢ":"い","び":"い","ぴ":"い",
                    "う":"う","く":"う","す":"う","つ":"う","ぬ":"う","ふ":"う","む":"う","ゆ":"う","る":"う","ぐ":"う","ず":"う","づ":"う","ぶ":"う","ぷ":"う",
                    "え":"え","け":"え","せ":"え","て":"え","ね":"え","へ":"え","め":"え","れ":"え","げ":"え","ぜ":"え","で":"え","べ":"え","ぺ":"え",
                    "お":"お","こ":"お","そ":"お","と":"お","の":"お","ほ":"お","も":"お","よ":"お","ろ":"お","を":"お","ご":"お","ぞ":"お","ど":"お","ぼ":"お","ぽ":"お" };
    let out = "";
    for (let i = 0; i < n.length; i++) {
      const ch = n[i];
      if (ch === "ー" || ch === "－" || ch === "—" || ch === "–" || ch === "-") {
        const prev = out[out.length - 1];
        out += VOWEL[prev] || "";
      } else out += ch;
    }
    // 母音の揺れを統一: え段+い → え段+え、お段+う → お段+お
    out = out.replace(/([けせてねへめれげぜでべぺえ])い/g, "$1え")
             .replace(/([こそとのほもよろごぞどぼぽお])う/g, "$1お");
    return out;
  };

  const checkYomi = (input, yaku) => {
    if (!yaku?.yomi) return false;
    const n = normalizeYomi(input);
    if (!n) return false;
    return yaku.yomi.some(y => normalizeYomi(y) === n);
  };

  const startQuiz = (mode) => {
    const base = mode === "naki" ? YAKU_DATA.filter(y => y.naki !== null) : YAKU_DATA;
    const pool = base.filter(y => !masteredYaku.includes(y.name));
    // 間違えた回数が多い順に前半へ、それ以外はランダム
    const indices = pool.map((_, i) => i);
    const scored = indices.map(i => ({
      i,
      wrong: wrongYaku[pool[i].name] || 0,
      rand: Math.random(),
    }));
    scored.sort((a, b) => (b.wrong - a.wrong) || (a.rand - b.rand));
    setQuizMode(mode);
    setQuizOrder(scored.map(s => s.i));
    setQuizIdx(0);
    setQuizAnswer(null); setQuizRevealed(false); setQuizInput(""); setQuizComposing(false);
    setQuizScore({ correct: 0, total: 0 }); setQuizFinished(false);
  };

  const getQuizYaku = () => { const pool = getQuizPool(); return pool[quizOrder[quizIdx]] || null; };
  const getCorrectAnswer = (yaku, askNaki) => {
    if (!yaku) return "0";
    if (askNaki) { return yaku.naki === null ? "なし" : yaku.naki >= 13 ? "役満" : String(yaku.naki); }
    return yaku.han >= 13 ? "役満" : String(yaku.han);
  };

  const [dictCat, setDictCat] = useState("1翻");
  const [dictExpanded, setDictExpanded] = useState(null);

  // ══════════════════════════════════
  // ── QUIZ VIEW ──
  // ══════════════════════════════════
  const renderQuiz = () => {
    const yaku = getQuizYaku();
    const total = quizOrder.length;

    if (!quizMode) {
      const remainMenzen = YAKU_DATA.filter(y => !masteredYaku.includes(y.name)).length;
      const remainNaki = YAKU_DATA.filter(y => y.naki !== null && !masteredYaku.includes(y.name)).length;
      const wrongCount = Object.keys(wrongYaku).filter(n => !masteredYaku.includes(n)).length;
      return (
        <div style={body}>
          <div style={{ textAlign: "center", padding: "24px 0 16px" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎯</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 8px" }}>翻数・役名テスト</h2>
            <p style={{ fontSize: 13, color: t.dm }}>間違えた役から優先的に出題されます</p>
          </div>

          {/* 学習状況 */}
          <div style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 10 }}>学習状況</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 4px", borderRadius: 8, background: t.gnS, border: `1px solid ${t.gn}33` }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: t.gn }}>{masteredYaku.length}</div>
                <div style={{ fontSize: 10, color: t.dm }}>覚えた</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 4px", borderRadius: 8, background: t.rdS, border: `1px solid ${t.rd}33` }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: t.rd }}>{wrongCount}</div>
                <div style={{ fontSize: 10, color: t.dm }}>間違えた</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 4px", borderRadius: 8, background: t.sf, border: `1px solid ${t.bd}` }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: t.tx }}>{remainMenzen}</div>
                <div style={{ fontSize: 10, color: t.dm }}>残り</div>
              </div>
            </div>
            {/* 進捗バー */}
            <div style={{ height: 6, background: t.bd, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: 6, background: t.gn, width: `${(masteredYaku.length / YAKU_DATA.length) * 100}%`, transition: "width 0.3s" }} />
            </div>
            <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginTop: 6 }}>
              {masteredYaku.length} / {YAKU_DATA.length} 役をマスター
            </div>
          </div>

          <div style={card}>
            <div style={question}>出題モードを選択</div>
            {remainMenzen === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.gn }}>全ての役をマスターしました！</div>
                <div style={{ fontSize: 12, color: t.dm, marginTop: 4 }}>リセットするともう一度挑戦できます</div>
              </div>
            ) : (
              <>
                <button style={{ ...actionBtn("p"), marginBottom: 10 }} onClick={() => startQuiz("menzen")}>
                  門前（メンゼン）の翻数 <span style={{ fontSize: 11, opacity: 0.8 }}>（{remainMenzen}問）</span>
                </button>
                <button style={{ ...actionBtn("p"), marginBottom: 10, background: t.gn }} onClick={() => startQuiz("naki")}>
                  鳴いた時の翻数 <span style={{ fontSize: 11, opacity: 0.8 }}>（{remainNaki}問）</span>
                </button>
                <button style={{ ...actionBtn(), marginBottom: 10 }} onClick={() => startQuiz("both")}>ランダム（門前 or 鳴き）</button>
                <div style={{ height: 1, background: t.bd, margin: "12px 0" }} />
                <button style={{ ...actionBtn("p"), marginBottom: 10, background: t.gd, color: "#1a1a1a" }} onClick={() => startQuiz("reverse")}>
                  ✍️ 役名テスト（説明→役名を入力）
                </button>
              </>
            )}
            <button style={actionBtn()} onClick={() => setView("home")}>メニューに戻る</button>
          </div>

          {/* リセット */}
          {(masteredYaku.length > 0 || Object.keys(wrongYaku).length > 0) && (
            <div style={{ ...card, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 8 }}>学習データのリセット</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ flex: 1, padding: "10px 6px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.sf, color: t.dm, fontSize: 11, cursor: "pointer" }}
                  onClick={() => saveWrong({})}>間違い記録のみ</button>
                <button style={{ flex: 1, padding: "10px 6px", borderRadius: 8, border: `1px solid ${t.rd}55`, background: t.rdS, color: t.rd, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                  onClick={() => { saveMastered([]); saveWrong({}); }}>すべてリセット</button>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (quizFinished) {
      const pct = quizScore.total > 0 ? Math.round(quizScore.correct / quizScore.total * 100) : 0;
      return (
        <div style={body}>
          <div style={{ textAlign: "center", padding: "24px 0 16px" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{pct >= 80 ? "🎉" : pct >= 50 ? "👍" : "📚"}</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>テスト結果</h2>
          </div>
          <div style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: pct >= 80 ? t.gn : pct >= 50 ? t.gd : t.rd }}>{pct}%</div>
            <div style={{ fontSize: 16, color: t.dm, marginTop: 4 }}>{quizScore.correct} / {quizScore.total} 正解</div>
            <div style={{ fontSize: 12, color: t.gn, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.bd}` }}>
              マスター済み: {masteredYaku.length} / {YAKU_DATA.length} 役
            </div>
          </div>
          <button style={actionBtn("p")} onClick={() => startQuiz(quizMode)}>もう一度</button>
          <button style={actionBtn()} onClick={() => setQuizMode(null)}>モード選択に戻る</button>
          <button style={actionBtn()} onClick={() => setView("home")}>メニューに戻る</button>
        </div>
      );
    }

    if (!yaku) { setQuizFinished(true); return null; }

    // Determine question type
    const askNaki = quizMode === "naki" ? true : quizMode === "menzen" ? false : (yaku.naki !== null && quizIdx % 2 === 1);
    const correctAns = getCorrectAnswer(yaku, askNaki);

    return (
      <div style={body}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: t.dm }}>{quizIdx + 1} / {total}</span>
          <span style={{ fontSize: 13, color: t.gn, fontWeight: 700 }}>{quizScore.correct}正解</span>
        </div>
        <div style={{ height: 4, background: t.bd, borderRadius: 2, marginBottom: 16 }}>
          <div style={{ height: 4, background: t.ac, borderRadius: 2, width: `${(quizIdx / total) * 100}%`, transition: "width 0.3s" }} />
        </div>

        <div style={card}>
          {isReverse() ? (
            <>
              <div style={{ fontSize: 12, color: t.gd, fontWeight: 700, textAlign: "center", marginBottom: 10 }}>
                ✍️ 役名テスト
              </div>
              <div style={{ background: t.sf, borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 15, color: t.tx, lineHeight: 1.8, textAlign: "center" }}>{yaku.desc}</div>
              </div>
              <div style={{ fontSize: 13, color: t.dm, textAlign: "center", marginBottom: 6 }}>この役の名前は？</div>
              <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginBottom: 14 }}>ひらがなで入力（例: たんやお）</div>

              {!quizRevealed ? (
                <>
                  <input
                    type="text"
                    value={quizInput}
                    onCompositionStart={() => setQuizComposing(true)}
                    onCompositionEnd={e => {
                      setQuizComposing(false);
                      setQuizInput(toHiraganaOnly(e.target.value));
                    }}
                    onChange={e => {
                      // 変換確定前（IME入力中）はそのまま、確定後はひらがなのみに
                      if (quizComposing) setQuizInput(e.target.value);
                      else setQuizInput(toHiraganaOnly(e.target.value));
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !quizComposing && quizInput.trim()) {
                        const ok = checkYomi(quizInput, yaku);
                        setQuizRevealed(true);
                        setQuizScore(s => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
                        if (!ok) saveWrong({ ...wrongYaku, [yaku.name]: (wrongYaku[yaku.name] || 0) + 1 });
                      }
                    }}
                    placeholder="ひらがなで入力"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    style={{
                      width: "100%", padding: "14px 16px", fontSize: 18, textAlign: "center",
                      background: t.sf, border: `2px solid ${t.bd}`, borderRadius: 12,
                      color: t.tx, outline: "none", marginBottom: 6, boxSizing: "border-box",
                    }}
                  />
                  <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginBottom: 10 }}>
                    ※ひらがなのみ（漢字に変換すると消えます）
                  </div>
                  <button style={{ ...actionBtn("p"), opacity: quizInput.trim() ? 1 : 0.4 }} disabled={!quizInput.trim()}
                    onClick={() => {
                      const ok = checkYomi(quizInput, yaku);
                      setQuizRevealed(true);
                      setQuizScore(s => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
                      if (!ok) saveWrong({ ...wrongYaku, [yaku.name]: (wrongYaku[yaku.name] || 0) + 1 });
                    }}>答え合わせ</button>
                  <button style={actionBtn()} onClick={() => {
                    setQuizRevealed(true);
                    setQuizScore(s => ({ correct: s.correct, total: s.total + 1 }));
                    saveWrong({ ...wrongYaku, [yaku.name]: (wrongYaku[yaku.name] || 0) + 1 });
                  }}>わからない</button>
                </>
              ) : (() => {
                const ok = checkYomi(quizInput, yaku);
                return (
                  <div>
                    <div style={{
                      textAlign: "center", padding: 16, borderRadius: 12, marginBottom: 12,
                      background: ok ? t.gnS : t.rdS, border: `2px solid ${ok ? t.gn : t.rd}`,
                    }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: ok ? t.gn : t.rd }}>
                        {ok ? "⭕ 正解！" : "❌ 不正解"}
                      </div>
                      {quizInput && <div style={{ fontSize: 12, color: t.dm, marginTop: 6 }}>入力: {quizInput}</div>}
                      <div style={{ fontSize: 18, color: t.tx, marginTop: 8, fontWeight: 800 }}>{yaku.name}</div>
                      <div style={{ fontSize: 11, color: t.dm, marginTop: 4 }}>
                        読み: {yaku.yomi?.[0]}
                      </div>
                    </div>
                    <div style={{ background: t.sf, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                      <div style={{ fontSize: 12, display: "flex", gap: 12, justifyContent: "center" }}>
                        <span style={{ color: t.ac }}>門前: {yaku.han >= 13 ? "役満" : `${yaku.han}翻`}</span>
                        {yaku.naki !== null ? <span style={{ color: t.gn }}>鳴き: {yaku.naki >= 13 ? "役満" : `${yaku.naki}翻`}</span>
                          : <span style={{ color: t.rd }}>鳴き: ✕</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: t.dm, textAlign: "center", marginBottom: 8 }}>この役は覚えましたか？</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <button style={{ flex: 1, padding: "12px 8px", borderRadius: 10, cursor: "pointer", border: `2px solid ${t.gn}`, background: t.gnS, color: t.gn, fontSize: 13, fontWeight: 700 }}
                        onClick={() => {
                          if (!masteredYaku.includes(yaku.name)) saveMastered([...masteredYaku, yaku.name]);
                          const nw = { ...wrongYaku }; delete nw[yaku.name]; saveWrong(nw);
                          if (quizIdx + 1 >= total) setQuizFinished(true);
                          else { setQuizIdx(quizIdx + 1); setQuizInput(""); setQuizComposing(false); setQuizRevealed(false); }
                        }}>✓ 覚えた<div style={{ fontSize: 9, opacity: 0.8, fontWeight: 400 }}>今後出題しない</div></button>
                      <button style={{ flex: 1, padding: "12px 8px", borderRadius: 10, cursor: "pointer", border: `2px solid ${t.bd}`, background: t.sf, color: t.tx, fontSize: 13, fontWeight: 700 }}
                        onClick={() => {
                          saveWrong({ ...wrongYaku, [yaku.name]: (wrongYaku[yaku.name] || 0) + 1 });
                          if (quizIdx + 1 >= total) setQuizFinished(true);
                          else { setQuizIdx(quizIdx + 1); setQuizInput(""); setQuizComposing(false); setQuizRevealed(false); }
                        }}>△ まだ覚えてない<div style={{ fontSize: 9, opacity: 0.7, fontWeight: 400 }}>次回優先で出題</div></button>
                    </div>
                    <button style={actionBtn()} onClick={() => {
                      if (quizIdx + 1 >= total) setQuizFinished(true);
                      else { setQuizIdx(quizIdx + 1); setQuizInput(""); setQuizComposing(false); setQuizRevealed(false); }
                    }}>{quizIdx + 1 >= total ? "結果を見る" : "スキップして次へ"}</button>
                  </div>
                );
              })()}
            </>
          ) : (
            <>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{
              display: "inline-block", padding: "10px 24px", borderRadius: 24,
              background: askNaki ? t.gnS : t.acS,
              border: `2px solid ${askNaki ? t.gn : t.ac}`,
            }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: askNaki ? t.gn : t.ac, lineHeight: 1.2 }}>
                {askNaki ? "🔔 鳴いた時" : "🚫 門前"}
              </div>
              <div style={{ fontSize: 11, color: t.dm, marginTop: 3 }}>
                {askNaki ? "ポン・チーをした場合" : "鳴いていない場合"}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, textAlign: "center", marginBottom: 6 }}>{yaku.name}</div>
          <div style={{ fontSize: 12, color: t.dm, textAlign: "center", marginBottom: 16 }}>は何翻？</div>

          {!quizRevealed ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {(askNaki && yaku.naki === null ? ["なし"] : HAN_CHOICES).map(ch => (
                <button key={ch} style={numBtn(false)} onClick={() => {
                  setQuizAnswer(ch); setQuizRevealed(true);
                  const isCorrect = ch === correctAns;
                  setQuizScore(s => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }));
                  // 間違えたら記録（次回優先出題）
                  if (!isCorrect) {
                    saveWrong({ ...wrongYaku, [yaku.name]: (wrongYaku[yaku.name] || 0) + 1 });
                  }
                }}>{ch === "0" ? "なし" : ch === "役満" ? "役満" : ch === "なし" ? "鳴けない" : `${ch}翻`}</button>
              ))}
            </div>
          ) : (
            <div>
              <div style={{
                textAlign: "center", padding: 16, borderRadius: 12, marginBottom: 12,
                background: quizAnswer === correctAns ? t.gnS : t.rdS,
                border: `2px solid ${quizAnswer === correctAns ? t.gn : t.rd}`,
              }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: quizAnswer === correctAns ? t.gn : t.rd }}>
                  {quizAnswer === correctAns ? "⭕ 正解！" : "❌ 不正解"}
                </div>
                {quizAnswer !== correctAns && (
                  <div style={{ fontSize: 16, color: t.tx, marginTop: 6, fontWeight: 700 }}>
                    正解: {correctAns === "なし" ? "鳴けない役" : correctAns === "役満" ? "役満" : `${correctAns}翻`}
                  </div>
                )}
                {wrongYaku[yaku.name] > 0 && (
                  <div style={{ fontSize: 11, color: t.dm, marginTop: 6 }}>
                    この役を間違えた回数: {wrongYaku[yaku.name]}回
                  </div>
                )}
              </div>
              <div style={{ background: t.sf, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: t.tx, lineHeight: 1.7 }}>{yaku.desc}</div>
                <div style={{ fontSize: 12, marginTop: 6, display: "flex", gap: 12 }}>
                  <span style={{ color: t.ac }}>門前: {yaku.han >= 13 ? "役満" : `${yaku.han}翻`}</span>
                  {yaku.naki !== null ? <span style={{ color: t.gn }}>鳴き: {yaku.naki >= 13 ? "役満" : `${yaku.naki}翻`}</span>
                    : <span style={{ color: t.rd }}>鳴き: ✕</span>}
                </div>
              </div>

              {/* 覚えた / 覚えていない */}
              <div style={{ fontSize: 11, color: t.dm, textAlign: "center", marginBottom: 8 }}>この役は覚えましたか？</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button style={{
                  flex: 1, padding: "12px 8px", borderRadius: 10, cursor: "pointer",
                  border: `2px solid ${t.gn}`, background: t.gnS, color: t.gn, fontSize: 13, fontWeight: 700,
                }} onClick={() => {
                  // 覚えた → マスター登録して次へ
                  if (!masteredYaku.includes(yaku.name)) saveMastered([...masteredYaku, yaku.name]);
                  const nw = { ...wrongYaku }; delete nw[yaku.name]; saveWrong(nw);
                  if (quizIdx + 1 >= total) setQuizFinished(true);
                  else { setQuizIdx(quizIdx + 1); setQuizAnswer(null); setQuizRevealed(false); }
                }}>
                  ✓ 覚えた
                  <div style={{ fontSize: 9, opacity: 0.8, fontWeight: 400 }}>今後出題しない</div>
                </button>
                <button style={{
                  flex: 1, padding: "12px 8px", borderRadius: 10, cursor: "pointer",
                  border: `2px solid ${t.bd}`, background: t.sf, color: t.tx, fontSize: 13, fontWeight: 700,
                }} onClick={() => {
                  // 覚えていない → 間違い記録に加算して次へ
                  saveWrong({ ...wrongYaku, [yaku.name]: (wrongYaku[yaku.name] || 0) + 1 });
                  if (quizIdx + 1 >= total) setQuizFinished(true);
                  else { setQuizIdx(quizIdx + 1); setQuizAnswer(null); setQuizRevealed(false); }
                }}>
                  △ まだ覚えてない
                  <div style={{ fontSize: 9, opacity: 0.7, fontWeight: 400 }}>次回優先で出題</div>
                </button>
              </div>
              <button style={actionBtn()} onClick={() => {
                if (quizIdx + 1 >= total) setQuizFinished(true);
                else { setQuizIdx(quizIdx + 1); setQuizAnswer(null); setQuizRevealed(false); }
              }}>{quizIdx + 1 >= total ? "結果を見る" : "スキップして次へ"}</button>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    );
  };

  // ══════════════════════════════════
  // ── DICTIONARY VIEW ──
  // ══════════════════════════════════
  // ══════════════════════════════════
  // ── SCORE PROBLEMS VIEW ──
  // ══════════════════════════════════
  // ── 役の手牌例（イラスト用） ──
  // 表記: "234m"=2萬3萬4萬 / "EEE"=東東東 / E東 S南 W西 N北 H白 G發 C中
  // ══════════════════════════════════
  const YAKU_EXAMPLES = {
    "リーチ（立直）": "234m 567p 345s 678s 99m",
    "一発（イッパツ）": "234m 567p 345s 678s 99m",
    "門前清自摸和（メンゼンツモ）": "234m 567p 345s 678s 99m",
    "平和（ピンフ）": "234m 567p 345s 678s 99m",
    "断么九（タンヤオ）": "234m 567p 345s 678s 55m",
    "一盃口（イーペーコー）": "234m 234m 567p 678s 99p",
    "役牌 白（ハク）": "HHH 234m 567p 345s 99s",
    "役牌 發（ハツ）": "GGG 234m 567p 345s 99s",
    "役牌 中（チュン）": "CCC 234m 567p 345s 99s",
    "場風牌（バカゼハイ）": "EEE 234m 567p 345s 99s",
    "自風牌（ジカゼハイ）": "SSS 234m 567p 345s 99s",
    "嶺上開花（リンシャンカイホウ）": "5555s 234m 567p 345s 99m",
    "搶槓（チャンカン）": "234m 567p 345s 678s 99m",
    "海底摸月（ハイテイ）": "234m 567p 345s 678s 99m",
    "河底撈魚（ホウテイ）": "234m 567p 345s 678s 99m",
    "ダブル立直（ダブルリーチ）": "234m 567p 345s 678s 99m",
    "三色同順（サンショクドウジュン）": "234m 234p 234s 678m 99s",
    "一気通貫（イッキツウカン）": "123m 456m 789m 234p 99s",
    "混全帯么九（チャンタ）": "123m 789p 123s EEE 99s",
    "七対子（チートイツ）": "11m 44p 77s EE HH 33m 99p",
    "対々和（トイトイ）": "111m 555p 999s EEE 33m",
    "三暗刻（サンアンコー）": "111m 555p 999s 234m 33p",
    "三色同刻（サンショクドウコー）": "222m 222p 222s 456m 99s",
    "三槓子（サンカンツ）": "1111m 5555p 9999s 234m 33p",
    "小三元（ショウサンゲン）": "HHH GGG CC 234m 567p",
    "混老頭（ホンロウトウ）": "111m 999p EEE CCC 99s",
    "二盃口（リャンペーコー）": "234m 234m 678p 678p 99s",
    "純全帯么九（ジュンチャン）": "123m 789p 123s 789s 99m",
    "混一色（ホンイツ）": "123m 456m 789m EEE 99m",
    "清一色（チンイツ）": "123m 456m 789m 234m 99m",
    "国士無双（コクシムソウ）": "19m 19p 19s ESWNHGC 1m",
    "四暗刻（スーアンコー）": "111m 555p 999s EEE 33m",
    "大三元（ダイサンゲン）": "HHH GGG CCC 234m 99s",
    "字一色（ツーイーソー）": "EEE SSS WWW CCC HH",
    "小四喜（ショウスーシー）": "EEE SSS WWW NN 234m",
    "大四喜（ダイスーシー）": "EEE SSS WWW NNN 99s",
    "緑一色（リューイーソー）": "234s 234s 666s 888s GG",
    "清老頭（チンロウトウ）": "111m 999m 111p 999s 99p",
    "九蓮宝燈（チューレンポウトウ）": "111m 234m 567m 89m 999m",
    "四槓子（スーカンツ）": "1111m 5555p 9999s 3333s 99p",
    "天和（テンホウ）": "234m 567p 345s 678s 99m",
    "地和（チーホウ）": "234m 567p 345s 678s 99m",
  };

  const HONOR_MAP = { E: "東", S: "南", W: "西", N: "北", H: "白", G: "發", C: "中" };
  const SUIT_MAP = { m: "萬", p: "筒", s: "索" };

  // "234m" や "EEE" を牌の配列に変換
  const parseTileGroup = (g) => {
    const m = g.match(/^([0-9]+)([mps])$/);
    if (m) return m[1].split("").map(n => [n, SUIT_MAP[m[2]]]);
    return g.split("").map(ch => [HONOR_MAP[ch] || ch, ""]);
  };

  // 用語図解用: "19m19p19s" や "東南西北" のように種類が混ざった表記にも対応
  const parseFigTiles = (str) => {
    const out = [];
    let buf = "";
    for (const ch of str) {
      if (ch >= "0" && ch <= "9") { buf += ch; continue; }
      if (SUIT_MAP[ch]) { buf.split("").forEach(n => out.push([n, SUIT_MAP[ch]])); buf = ""; continue; }
      if (ch === " ") { continue; }
      out.push([HONOR_MAP[ch] || ch, ""]);
    }
    return out;
  };

  // 用語の図解1つぶん
  const TermFig = ({ fig, size = 26 }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: t.dm, marginBottom: 5 }}>{fig.cap}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-end", marginBottom: 4 }}>
        {fig.tiles.split(" ").map((grp, gi) => (
          <div key={gi} style={{ display: "flex", gap: 1.5, marginRight: 6 }}>
            {parseFigTiles(grp).map(([l, s], i) => <Tile key={i} label={l} sub={s} size={Math.round(size * tileScale)} />)}
          </div>
        ))}
      </div>
      {fig.note && <div style={{ fontSize: 11, color: t.dm, lineHeight: 1.6 }}>{fig.note}</div>}
    </div>
  );

  const YakuHand = ({ name, size }) => {
    size = size || Math.round(19 * tileScale);
    const src = YAKU_EXAMPLES[name];
    if (!src) return null;
    const groups = src.split(" ").map(parseTileGroup);
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "flex-end", justifyContent: "center", padding: "10px 0" }}>
        {groups.map((g, gi) => (
          <div key={gi} style={{ display: "flex", gap: 1.5 }}>
            {g.map(([l, s], ti) => <Tile key={ti} label={l} sub={s} size={size} />)}
          </div>
        ))}
      </div>
    );
  };

  const renderDict = () => (
    <div style={body}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>役一覧</div>
      <div style={{ display: "flex", gap: 4, marginBottom: 14, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {YAKU_CATEGORIES.map(cat => (
          <button key={cat} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
            border: `1px solid ${dictCat === cat ? t.ac : t.bd}`,
            background: dictCat === cat ? t.acS : "transparent",
            color: dictCat === cat ? t.ac : t.dm,
          }} onClick={() => { setDictCat(cat); setDictExpanded(null); }}>{cat}</button>
        ))}
      </div>
      {YAKU_DATA.filter(y => y.cat === dictCat).map((y, idx) => (
        <div key={idx} style={{ ...card, padding: 0, marginBottom: 8, cursor: "pointer", border: `1px solid ${dictExpanded === y.name ? t.ac + "55" : t.bd}` }}>
          <button onClick={() => setDictExpanded(dictExpanded === y.name ? null : y.name)}
            style={{ width: "100%", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.tx }}>{y.name}</div>
              <div style={{ fontSize: 12, color: t.dm, marginTop: 2 }}>
                門前 {y.han >= 13 ? "役満" : `${y.han}翻`}
                {y.naki !== null ? <span style={{ color: t.gn, marginLeft: 8 }}>鳴き {y.naki >= 13 ? "役満" : `${y.naki}翻`}</span>
                  : <span style={{ color: t.rd, marginLeft: 8 }}>鳴き ✕</span>}
              </div>
            </div>
            <span style={{ fontSize: 14, color: t.dm }}>{dictExpanded === y.name ? "▲" : "▼"}</span>
          </button>
          {dictExpanded === y.name && (
            <div style={{ padding: "0 16px 14px", fontSize: 13, color: t.dm, lineHeight: 1.7, borderTop: `1px solid ${t.bd}33` }}>
              <div style={{ paddingTop: 10 }}>{y.desc}</div>
              {YAKU_EXAMPLES[y.name] && (
                <div style={{ marginTop: 10, background: t.sf, borderRadius: 10, padding: "6px 8px" }}>
                  <div style={{ fontSize: 10, color: t.dm, textAlign: "center" }}>例</div>
                  <YakuHand name={y.name} />
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <button style={actionBtn()} onClick={() => setView("home")}>メニューに戻る</button>
    </div>
  );

  // ══════════════════════════════════
  // ── SCORE MATRIX TABLE ──
  // ══════════════════════════════════
  // ══════════════════════════════════
  // ── SCORE QUIZ (総合問題) ──

  const [tableParent, setTableParent] = useState(false);
  const [tableKiriage, setTableKiriage] = useState(false);
  const [tableTsumo, setTableTsumo] = useState(false);

  // ══════════════════════════════════
  // ── START GUIDE (図解) ──
  // ══════════════════════════════════
  const [guideStep, setGuideStep] = useState(0);

  // 卓の図（4席 + 山）
  // ── 回転リール（縦スクロールで値を選ぶ） ──
  const ReelPicker = ({ values, value, onChange, labelOf, height = 132, itemH = 44 }) => {
    const ref = React.useRef(null);
    const settle = React.useRef(null);
    const idx = Math.max(0, values.indexOf(value));
    // 初期位置を選択値に合わせる
    React.useEffect(() => {
      const el = ref.current;
      if (el) el.scrollTop = idx * itemH;
    }, []);
    const pad = (height - itemH) / 2;
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => {
        const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / itemH)));
        el.scrollTo({ top: i * itemH, behavior: "smooth" });
        if (values[i] !== value) {
          try { if (navigator.vibrate) navigator.vibrate(6); } catch {}
          onChange(values[i]);
        }
      }, 90);
    };
    return (
      <div style={{ position: "relative", height, borderRadius: 12, background: t.sf, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
        {/* 中央の選択枠 */}
        <div style={{
          position: "absolute", top: pad, left: 8, right: 8, height: itemH, borderRadius: 9,
          border: `2px solid ${t.ac}`, background: t.acS, pointerEvents: "none", zIndex: 2,
        }} />
        {/* 上下のフェード */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: pad, zIndex: 3, pointerEvents: "none",
          background: `linear-gradient(${t.sf}, ${t.sf}00)` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: pad, zIndex: 3, pointerEvents: "none",
          background: `linear-gradient(${t.sf}00, ${t.sf})` }} />
        <div ref={ref} onScroll={onScroll} style={{
          height: "100%", overflowY: "auto", scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
        }}>
          <div style={{ height: pad }} />
          {values.map((v, i) => (
            <div key={i} onClick={() => { const el = ref.current; if (el) el.scrollTo({ top: i * itemH, behavior: "smooth" }); onChange(v); }}
              style={{
                height: itemH, display: "flex", alignItems: "center", justifyContent: "center",
                scrollSnapAlign: "start", cursor: "pointer",
                fontSize: v === value ? 22 : 17,
                fontWeight: v === value ? 900 : 700,
                color: v === value ? t.ac : t.dm,
                opacity: v === value ? 1 : 0.55,
                transition: "font-size 0.15s, color 0.15s, opacity 0.15s",
                fontVariantNumeric: "tabular-nums",
              }}>{labelOf ? labelOf(v) : v}</div>
          ))}
          <div style={{ height: pad }} />
        </div>
      </div>
    );
  };

  // レート設定のカード（ルール編集用）
  const RateSetting = ({ rate, onChange, unit, onUnitChange }) => {
    const on = !!rate;
    const U = unit || "G";
    const [unitDraft, setUnitDraft] = React.useState(U);
    React.useEffect(() => { setUnitDraft(U); }, [U]);
    const [rateDraft, setRateDraft] = React.useState(String(rate || 0.1));
    React.useEffect(() => { if (rate) setRateDraft(String(rate)); }, [rate]);
    const rateNum = parseFloat(rateDraft);
    const rateValid = !isNaN(rateNum) && rateNum >= 0.001 && rateNum <= 10;
    return (
      <div style={{ marginBottom: 16 }}>
        {/* レート精算をするかどうか */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: on ? 12 : 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.tx }}>レート計算</div>
            <div style={{ fontSize: 10, color: t.dm, marginTop: 2 }}>点数を{U}に換算して精算します</div>
          </div>
          <button onClick={() => onChange(on ? 0 : 0.1)} style={{
            width: 48, height: 28, borderRadius: 14, border: "none", padding: 0, cursor: "pointer",
            background: on ? t.gd : t.bd, position: "relative", transition: "background 0.15s", flexShrink: 0,
          }}>
            <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
          </button>
        </div>

        {on && (<>
          <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: t.sf, border: `1px solid ${t.bd}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.tx, marginBottom: 6 }}>レート単位を変える</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={unitDraft} maxLength={3}
                onChange={(e) => setUnitDraft(e.target.value.slice(0, 3))}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                placeholder="G"
                style={{
                  flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 9,
                  border: `1px solid ${t.bd}`, background: t.card, color: t.tx,
                  fontSize: 16, fontWeight: 800, textAlign: "center", outline: "none",
                }} />
              <button
                onClick={() => { const v = (unitDraft || "").trim().slice(0, 3) || "G"; setUnitDraft(v); onUnitChange && onUnitChange(v); }}
                disabled={(unitDraft || "").trim() === U}
                style={{
                  padding: "10px 18px", borderRadius: 9, border: "none", cursor: "pointer",
                  background: (unitDraft || "").trim() === U ? t.bd : t.ac,
                  color: (unitDraft || "").trim() === U ? t.dm : "#fff",
                  fontSize: 14, fontWeight: 800, flexShrink: 0,
                }}>決定</button>
            </div>
            <div style={{ fontSize: 10, color: t.dm, marginTop: 6 }}>3文字以内</div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>レート単位（{U}）</div>
          <div style={{ fontSize: 11, color: t.dm, marginBottom: 8, lineHeight: 1.7 }}>
            1点あたりの{U}。精算画面に{U}の増減が表示されます
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={rateDraft}
              inputMode="decimal"
              onChange={(e) => setRateDraft(e.target.value.replace(/[^0-9.]/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              placeholder="0.1"
              style={{
                flex: 1, minWidth: 0, padding: "12px 12px", borderRadius: 9,
                border: `1px solid ${rateValid ? t.bd : t.rd}`, background: t.card, color: t.tx,
                fontSize: 20, fontWeight: 900, textAlign: "center", outline: "none",
              }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: t.gd, flexShrink: 0 }}>{U}</span>
            <button
              onClick={() => { if (rateValid) onChange(rateNum); }}
              disabled={!rateValid || rateNum === rate}
              style={{
                padding: "12px 18px", borderRadius: 9, border: "none", cursor: "pointer",
                background: (rateValid && rateNum !== rate) ? t.ac : t.bd,
                color: (rateValid && rateNum !== rate) ? "#fff" : t.dm,
                fontSize: 14, fontWeight: 800, flexShrink: 0,
              }}>決定</button>
          </div>
          <div style={{ fontSize: 10, color: rateValid ? t.dm : t.rd, marginTop: 6 }}>
            {rateValid ? "0.001 〜 10 の範囲で入力" : "0.001 〜 10 の範囲で入力してください"}
          </div>

          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 10,
            background: t.sf, border: `1px solid ${t.bd}`,
          }}>
            <div style={{ fontSize: 11, color: t.dm, fontWeight: 700, marginBottom: 6 }}>
              点数例（1点 = {RATE_LABEL(rate)}{U}）
            </div>
            {[1000, 10000, 30000].map(pts => (
              <div key={pts} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, lineHeight: 2 }}>
                <span style={{ color: t.dm }}>{pts.toLocaleString()}点</span>
                <span style={{ color: t.gd, fontWeight: 800 }}>
                  {GOLD_LABEL(Math.round(pts * rate * 1000) / 1000)}{U}
                </span>
              </div>
            ))}
          </div>
        </>)}
      </div>
    );
  };

  const TableDiagram = ({ highlight, dice1, dice2, breakPos, labels }) => {
    const seatStyle = (pos, on) => {
      const base = {
        position: "absolute", minWidth: 44, height: 25, padding: "0 8px", borderRadius: 7,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", lineHeight: 1,
        border: `2px solid ${on ? t.gd : t.bd}`,
        background: on ? "#12181f" : t.sf,
        color: on ? t.gd : t.tx,
        boxShadow: "0 2px 6px rgba(0,0,0,0.45)",
        zIndex: 2,
      };
      if (pos === "S") return { ...base, bottom: 6, left: "50%", transform: "translateX(-50%)" };
      if (pos === "E") return { ...base, right: 6, top: "50%", transform: "translateY(-50%)" };
      if (pos === "N") return { ...base, top: 6, left: "50%", transform: "translateX(-50%)" };
      return { ...base, left: 6, top: "50%", transform: "translateY(-50%)" };
    };
    // 山（各辺に小さな牌の列）
    const wallStyle = (pos) => {
      const base = { position: "absolute", display: "flex", gap: 1 };
      if (pos === "S") return { ...base, bottom: 34, left: "50%", transform: "translateX(-50%)" };
      if (pos === "E") return { ...base, right: 34, top: "50%", transform: "translateY(-50%) rotate(90deg)" };
      if (pos === "N") return { ...base, top: 34, left: "50%", transform: "translateX(-50%)" };
      return { ...base, left: 34, top: "50%", transform: "translateY(-50%) rotate(90deg)" };
    };
    const wallTile = (i, pos) => {
      const isBreak = breakPos && breakPos.side === pos && breakPos.idx === i;
      return (
        <div key={i} style={{
          width: 7, height: 11, borderRadius: 1,
          background: isBreak ? t.rd : "#d8d3c0",
          border: `1px solid ${isBreak ? t.rd : "#b0aa96"}`,
        }} />
      );
    };
    return (
      <div style={{ position: "relative", width: "100%", maxWidth: 220, height: 190, margin: "0 auto 10px",
        background: "#1a4d3a", borderRadius: 12, border: `3px solid #2a5d4a` }}>
        {["S","E","N","W"].map(pos => (
          <div key={"w"+pos} style={wallStyle(pos)}>
            {[...Array(11)].map((_, i) => wallTile(i, pos))}
          </div>
        ))}
        {["S","E","N","W"].map(pos => (
          <div key={pos} style={seatStyle(pos, highlight === pos)}>
            {labels?.[pos] || { S:"自分", E:"下家", N:"対面", W:"上家" }[pos]}
          </div>
        ))}
        {/* サイコロ */}
        {(dice1 || dice2) && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", display: "flex", gap: 6 }}>
            {[dice1, dice2].filter(Boolean).map((d, i) => (
              <div key={i} style={{
                width: 30, height: 30, borderRadius: 6, background: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 900, color: "#c0392b",
                boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
              }}>{d}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const GUIDE_STEPS = [
    {
      title: "① 席を決める",
      body: [
        "まず座る位置を決めます。一般的な方法は「掴み取り」です。",
      ],
      box: [
        "東・南・西・北の風牌を1枚ずつ裏返して混ぜる",
        "各自が1枚ずつ取る",
        "東を引いた人が起家（チーチャ＝最初の親）",
        "東の右隣に南、その右に西、さらに右に北が座る",
      ],
      note: "席順は反時計回りに東→南→西→北です。",
      diagram: () => <TableDiagram labels={{S:"東",E:"南",N:"西",W:"北"}} highlight="S" />,
    },
    {
      title: "② 洗牌して山を積む",
      body: [
        "牌を裏返してよく混ぜ（洗牌／シーパイ）、各自が自分の前に山を作ります。",
      ],
      box: [
        "1人あたり 17幢（トン）× 2段 = 34枚",
        "4人合計で 136枚（全部の牌）",
        "山は自分の前に横一列に並べる",
      ],
      note: "上段と下段の2段重ねにするのがポイントです。",
      diagram: () => (
        <div style={{ background: t.sf, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginBottom: 10 }}>山の断面（2段重ね）</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 2, marginBottom: 3 }}>
            {[...Array(9)].map((_, i) => (
              <div key={i} style={{ width: 16, height: 12, borderRadius: 2, background: "#d8d3c0", border: "1px solid #b0aa96" }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 2 }}>
            {[...Array(9)].map((_, i) => (
              <div key={i} style={{ width: 16, height: 12, borderRadius: 2, background: "#c8c3b0", border: "1px solid #a09a86" }} />
            ))}
          </div>
          <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginTop: 8 }}>← 17幢（各自） →</div>
        </div>
      ),
    },
    {
      title: "③ 親がサイコロを振る",
      body: [
        "親（東家）がサイコロ2個を振ります。出た目の合計で、どの人の山から取り始めるかが決まります。",
      ],
      box: [
        "合計 5・9 → 自分（親）の山",
        "合計 2・6・10 → 右隣（下家）の山",
        "合計 3・7・11 → 対面の山",
        "合計 4・8・12 → 左隣（上家）の山",
      ],
      note: "自分から反時計回りに 1・2・3・4… と数えます（1=自分、2=下家、3=対面、4=上家）。",
      diagram: () => {
        const seatBox = (label, on) => (
          <div style={{
            padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
            border: `1.5px solid ${on ? t.rd : t.bd}`,
            background: on ? t.rdS : t.sf,
            color: on ? t.rd : t.dm, whiteSpace: "nowrap",
          }}>{label}</div>
        );
        const hWall = () => (
          <div style={{ display: "flex", gap: 1 }}>
            {[...Array(17)].map((_, i) => (
              <div key={i} style={{ width: 6, height: 9, borderRadius: 1, background: "#b8b3a0", border: "1px solid #9a9484" }} />
            ))}
          </div>
        );
        const vWall = () => (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {[...Array(9)].map((_, i) => (
              <div key={i} style={{ width: 9, height: 6, borderRadius: 1, background: "#b8b3a0", border: "1px solid #9a9484" }} />
            ))}
          </div>
        );
        return (
          <div style={{ background: t.sf, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginBottom: 12 }}>
              卓を上から見た図（例: 4 + 5 = 9 → 自分の山）
            </div>
            {/* 対面 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 6 }}>
              {seatBox("対面 ③⑦", false)}
              <div style={{ marginTop: 4 }}>{hWall()}</div>
            </div>
            {/* 左右 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {seatBox("上家 ④⑧", false)}
                {vWall()}
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                  {[4, 5].map((d, i) => (
                    <div key={i} style={{
                      width: 30, height: 30, borderRadius: 6, background: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, fontWeight: 900, color: "#c0392b",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
                    }}>{d}</div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: t.gd, fontWeight: 700, marginTop: 4 }}>4 + 5 = 9</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {vWall()}
                {seatBox("下家 ②⑥", false)}
              </div>
            </div>
            {/* 自分 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 6 }}>
              {hWall()}
              <div style={{ marginTop: 4 }}>{seatBox("自分（親）①⑤⑨", true)}</div>
            </div>
            {/* 数え方 */}
            <div style={{ fontSize: 10, color: t.gd, textAlign: "center", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${t.bd}33`, lineHeight: 1.7 }}>
自分①→下家②→対面③→上家④→自分⑤→下家⑥→対面⑦→上家⑧→自分⑨<br />
              合計9なので自分の山に決定
            </div>
          </div>
        );
      },
    },
    {
      title: "④ 山を割る（開門）",
      body: [
        "サイコロ合計が 5 か 9 なら自分の山です。自分から見て右端から、目の数だけ数えて割ります。",
      ],
      box: [
        "例: 合計9 → 自分の山を選択",
        "自分の山の右端から 1,2,3…9 と数える",
        "9つ目の右側で山を割る（開門）",
        "数えた側（右側）が王牌のもとになる",
        "割れ目の左側から配牌を始める",
      ],
      note: "他の人の山の場合も同じで、その人から見た右端から数えます。",
      diagram: () => {
        // 自分視点: 自分の山を右から5つ目で割る
        const seatBox = (label, on) => (
          <div style={{
            padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
            border: `1.5px solid ${on ? t.rd : t.bd}`,
            background: on ? t.rdS : t.sf,
            color: on ? t.rd : t.dm, whiteSpace: "nowrap",
          }}>{label}</div>
        );
        return (
          <div style={{ background: t.sf, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginBottom: 12 }}>
              卓を上から見た図（サイコロ合計9 → 自分の山）
            </div>
            {/* 対面 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 6 }}>
              {seatBox("対面", false)}
              <div style={{ display: "flex", gap: 1, marginTop: 4 }}>
                {[...Array(17)].map((_, i) => (
                  <div key={i} style={{ width: 6, height: 9, borderRadius: 1, background: "#b8b3a0", border: "1px solid #9a9484" }} />
                ))}
              </div>
            </div>
            {/* 左右 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {seatBox("上家", false)}
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {[...Array(9)].map((_, i) => (
                    <div key={i} style={{ width: 9, height: 6, borderRadius: 1, background: "#b8b3a0", border: "1px solid #9a9484" }} />
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22 }}>🎲🎲</div>
                <div style={{ fontSize: 10, color: t.gd, fontWeight: 700 }}>4 + 5 = 9</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {[...Array(9)].map((_, i) => (
                    <div key={i} style={{ width: 9, height: 6, borderRadius: 1, background: "#b8b3a0", border: "1px solid #9a9484" }} />
                  ))}
                </div>
                {seatBox("下家", false)}
              </div>
            </div>
            {/* 自分の山（大きく表示・右から数える） */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 10 }}>
              <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
                {[...Array(17)].map((_, i) => {
                  const fromRight = 17 - i;
                  const isBreak = fromRight === 9;
                  const isWanpai = fromRight < 9;
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      {isBreak && <div style={{ fontSize: 12, color: t.rd, lineHeight: 1 }}>▼</div>}
                      <div style={{
                        width: 12, height: 17, borderRadius: 2,
                        background: isBreak ? t.rd : isWanpai ? "#8a8578" : "#e8e4d4",
                        border: `1px solid ${isBreak ? t.rd : "#9a9484"}`,
                      }} />
                      <div style={{ fontSize: 7, color: fromRight <= 9 ? t.rd : "transparent", marginTop: 1 }}>
                        {fromRight <= 9 ? fromRight : "・"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 240, fontSize: 9, color: t.dm, marginTop: 2 }}>
                <span style={{ color: t.gn }}>← 配牌はこちらから</span>
                <span>王牌のもと →</span>
              </div>
              <div style={{ marginTop: 6 }}>{seatBox("自分（親）", true)}</div>
            </div>
            {/* 凡例 */}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${t.bd}33`, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: t.dm }}>
                <span style={{ width: 8, height: 10, background: t.rd, borderRadius: 1, display: "inline-block" }} />割れ目（右から9つ目）
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: t.dm }}>
                <span style={{ width: 8, height: 10, background: "#8a8578", borderRadius: 1, display: "inline-block" }} />王牌側
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: t.dm }}>
                <span style={{ width: 8, height: 10, background: "#e8e4d4", borderRadius: 1, display: "inline-block" }} />配牌に使う
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: "⑤ 配牌する",
      body: [
        "割れ目の左から、親→南→西→北の順に牌を取っていきます。",
      ],
      box: [
        "1巡目: 各自が上下2段まとめて4枚（2幢）を取る",
        "2巡目: 同じく4枚",
        "3巡目: 同じく4枚 → ここまで各自12枚",
        "最後: 親は2枚（チョンチョン）、子は1枚ずつ",
      ],
      note: "結果として親14枚、子13枚になります。",
      diagram: () => (
        <div style={{ background: t.sf, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          {[
            { label: "1巡目", n: 4, color: t.ac },
            { label: "2巡目", n: 4, color: t.ac },
            { label: "3巡目", n: 4, color: t.ac },
            { label: "最後", n: 1, color: t.gd, extra: "親は2枚" },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: t.dm, width: 40 }}>{r.label}</span>
              <div style={{ display: "flex", gap: 2 }}>
                {[...Array(r.n)].map((_, j) => (
                  <div key={j} style={{ width: 13, height: 18, borderRadius: 2, background: "#e8e4d4", border: `1px solid ${r.color}` }} />
                ))}
              </div>
              <span style={{ fontSize: 10, color: r.color }}>{r.n}枚{r.extra ? `（${r.extra}）` : ""}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${t.bd}`, marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-around", fontSize: 12 }}>
            <span style={{ color: t.gd, fontWeight: 700 }}>親 14枚</span>
            <span style={{ color: t.ac, fontWeight: 700 }}>子 13枚</span>
          </div>
        </div>
      ),
    },
    {
      title: "⑥ ドラ表示牌をめくる",
      body: [
        "王牌の左から3つ目の上段の牌をめくります。これが「ドラ表示牌」です。",
      ],
      box: [
        "表示牌の次の牌がドラになる",
        "例: 表示牌が 3萬 → ドラは 4萬",
        "9の次は1に戻る（9萬→1萬）",
        "字牌は 東→南→西→北→東、白→發→中→白",
      ],
      note: "ドラは1枚につき1翻加算されますが、ドラだけではアガれません。",
      diagram: () => (
        <div style={{ background: t.sf, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginBottom: 10 }}>王牌（14枚）とドラ表示牌</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 2, marginBottom: 4 }}>
            {[...Array(7)].map((_, i) => (
              <div key={i} style={{ position: "relative" }}>
                {i === 2 ? (
                  <div style={{ width: 18, height: 24, borderRadius: 2, background: "#f5f2e8", border: `2px solid ${t.gd}`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#1a1a1a" }}>3</div>
                ) : (
                  <div style={{ width: 18, height: 24, borderRadius: 2, background: "#3a4454", border: "1px solid #4a5464" }} />
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 2 }}>
            {[...Array(7)].map((_, i) => (
              <div key={i} style={{ width: 18, height: 24, borderRadius: 2, background: "#3a4454", border: "1px solid #4a5464" }} />
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 10, fontSize: 12 }}>
            <span style={{ color: t.gd }}>表示牌 3萬</span>
            <span style={{ color: t.dm, margin: "0 8px" }}>→</span>
            <span style={{ color: t.gn, fontWeight: 700 }}>ドラは 4萬</span>
          </div>
        </div>
      ),
    },
    {
      title: "⑦ 対局開始",
      body: [
        "親から順に、ツモ（山から1枚取る）→打牌（1枚捨てる）を繰り返します。",
      ],
      box: [
        "順番は反時計回り（親→南→西→北→親…）",
        "手牌は常に13枚（ツモった瞬間だけ14枚）",
        "誰かがアガるか、山が尽きて流局するまで続く",
        "山が尽きる = 王牌14枚を残した時点",
      ],
      note: "アガリには「役」が最低1つ必要です。役一覧で確認しましょう。",
      diagram: () => <TableDiagram highlight="S" labels={{S:"親スタート",E:"②",N:"③",W:"④"}} />,
    },
  ];

  // ══════════════════════════════════
  // ── PLAYER NAME REGISTRY ──
  // ══════════════════════════════════
  const renderNames = () => {
    const addName = () => {
      const v = newNameInput.trim();
      if (!v) return;
      if (presetNames.includes(v)) { setNewNameInput(""); return; }
      savePresetNames([...presetNames, v]);
      setNewNameInput("");
    };
    const removeName = (idx) => savePresetNames(presetNames.filter((_, i) => i !== idx));
    const commitEdit = () => {
      const v = editNameVal.trim();
      if (!v) { setEditNameIdx(null); return; }
      const arr = [...presetNames];
      arr[editNameIdx] = v;
      savePresetNames(arr);
      setEditNameIdx(null);
    };
    return (
      <div style={body}>
        <div style={{ textAlign: "center", padding: "16px 0 12px" }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>👤</div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>プレイヤー名の登録</h2>
          <p style={{ fontSize: 12, color: t.dm }}>対局開始時のリストに表示される名前です</p>
        </div>

        {/* 追加 */}
        <div style={{ ...card, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 8 }}>新しく登録</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newNameInput}
              onChange={e => setNewNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addName(); }}
              placeholder="名前を入力"
              style={{
                flex: "1 1 auto", minWidth: 0, padding: "12px 14px", fontSize: 15,
                background: t.sf, border: `1px solid ${t.bd}`, borderRadius: 10,
                color: t.tx, outline: "none", boxSizing: "border-box",
              }}
            />
            <button onClick={addName} disabled={!newNameInput.trim()} style={{
              flexShrink: 0, padding: "12px 18px", borderRadius: 10, cursor: "pointer",
              border: "none", background: newNameInput.trim() ? t.ac : t.bd,
              color: "#fff", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap",
            }}>追加</button>
          </div>
        </div>

        {/* 一覧 */}
        <div style={{ ...card, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: t.dm }}>登録済み（{presetNames.length}人）</span>
          </div>
          {presetNames.length > 1 && (
            <div style={{ fontSize: 11, color: t.dm, marginBottom: 8, lineHeight: 1.6 }}>
              行を<b style={{ color: t.tx }}>長押し</b>して、そのまま上下にドラッグで並べ替え
            </div>
          )}
          {presetNames.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, fontSize: 13, color: t.dm }}>まだ登録がありません</div>
          ) : presetNames.map((n, i) => {
            const nd = nameDrag;
            const isDragging = nd && nd.from === i;
            let shiftY = 0;
            if (nd && !isDragging) {
              if (nd.from < nd.target && i > nd.from && i <= nd.target) shiftY = -nd.rowH;
              else if (nd.from > nd.target && i >= nd.target && i < nd.from) shiftY = nd.rowH;
            }
            return (
            <div key={i}
              ref={el => { nameRowRefs.current[i] = el; }}
              onTouchStart={(e) => nameDragStart(e, i, presetNames.length)}
              onTouchMove={nameDragPreMove}
              onTouchEnd={nameDragCancelIfPending}
              onMouseDown={(e) => nameDragStart(e, i, presetNames.length)}
              onMouseMove={nameDragPreMove}
              onMouseUp={nameDragCancelIfPending}
              onMouseLeave={nameDragCancelIfPending}
              onClickCapture={(e) => { if (nameSuppressClick.current) { e.preventDefault(); e.stopPropagation(); } }}
              onContextMenu={(e) => { if (nameDrag || nameSuppressClick.current) e.preventDefault(); }}
              style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 0", borderBottom: i < presetNames.length - 1 ? `1px solid ${t.bd}33` : "none",
              position: "relative",
              transform: isDragging ? `translateY(${nd.offset}px) scale(1.01)` : shiftY ? `translateY(${shiftY}px)` : "none",
              transition: isDragging ? "none" : "transform 0.15s ease",
              zIndex: isDragging ? 10 : 1,
              background: isDragging ? t.sf : "transparent",
              borderRadius: isDragging ? 10 : 0,
              boxShadow: isDragging ? "0 8px 22px rgba(0,0,0,0.5)" : "none",
              outline: isDragging ? `2px solid ${t.ac}88` : "none",
              WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none",
            }}>
              {editNameIdx === i ? (
                <>
                  <input
                    value={editNameVal}
                    onChange={e => setEditNameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") commitEdit(); }}
                    autoFocus
                    style={{
                      flex: 1, padding: "8px 10px", fontSize: 15,
                      background: t.sf, border: `2px solid ${t.ac}`, borderRadius: 8,
                      color: t.tx, outline: "none", boxSizing: "border-box",
                    }}
                  />
                  <button onClick={commitEdit} style={{
                    padding: "8px 12px", borderRadius: 8, border: "none",
                    background: t.ac, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}>保存</button>
                  <button onClick={() => setEditNameIdx(null)} style={{
                    padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.bd}`,
                    background: "transparent", color: t.dm, fontSize: 12, cursor: "pointer",
                  }}>✕</button>
                </>
              ) : (
                <>
                  <span style={{ flexShrink: 0, color: t.dm, fontSize: 20, lineHeight: 1, padding: "0 4px", touchAction: "none", cursor: "grab" }}>≡</span>
                  <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: t.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</span>
                  <button onClick={() => { setEditNameIdx(i); setEditNameVal(n); }} style={{
                    padding: "7px 12px", borderRadius: 8, border: `1px solid ${t.bd}`,
                    background: "transparent", color: t.dm, fontSize: 12, cursor: "pointer",
                  }}>編集</button>
                  <button onClick={() => removeName(i)} style={{
                    padding: "7px 12px", borderRadius: 8, border: `1px solid ${t.rd}55`,
                    background: t.rdS, color: t.rd, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}>削除</button>
                </>
              )}
            </div>
            );
          })}
        </div>

        {/* 初期値に戻す */}
        <button style={{ ...actionBtn(), fontSize: 12, color: t.dm }}
          onClick={() => savePresetNames(DEFAULT_PRESET_NAMES)}>初期の名前に戻す</button>
        <button style={actionBtn()} onClick={() => setView("home")}>メニューに戻る</button>
      </div>
    );
  };

  const renderStartGuide = () => {
    const s = GUIDE_STEPS[guideStep];
    return (
      <div style={body}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: t.dm }}>{guideStep + 1} / {GUIDE_STEPS.length}</span>
          <button style={{ background: "none", border: "none", color: t.dm, fontSize: 12, cursor: "pointer" }}
            onClick={() => setView("home")}>✕ 閉じる</button>
        </div>
        <div style={{ height: 4, background: t.bd, borderRadius: 2, marginBottom: 10 }}>
          <div style={{ height: 4, background: t.ac, borderRadius: 2, width: `${((guideStep + 1) / GUIDE_STEPS.length) * 100}%`, transition: "width 0.3s" }} />
        </div>

        {/* 進むボタンは上に置いて、スクロールせずに次へ進めるようにする */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button style={{ ...actionBtn(), flex: 1, marginBottom: 0, padding: "11px 8px", opacity: guideStep === 0 ? 0.4 : 1 }}
            disabled={guideStep === 0}
            onClick={() => { setGuideStep(guideStep - 1); try { window.scrollTo(0, 0); } catch {} }}>← 前へ</button>
          {guideStep < GUIDE_STEPS.length - 1 ? (
            <button style={{ ...actionBtn("p"), flex: 1.4, marginBottom: 0, padding: "11px 8px" }}
              onClick={() => { setGuideStep(guideStep + 1); try { window.scrollTo(0, 0); } catch {} }}>次へ →</button>
          ) : (
            <button style={{ ...actionBtn("p"), flex: 1.4, marginBottom: 0, padding: "11px 8px" }}
              onClick={() => setView("home")}>完了</button>
          )}
        </div>

        <div style={{ ...card, padding: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, textAlign: "center" }}>{s.title}</div>

          {s.diagram && s.diagram()}

          {s.body.map((b, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.7, color: t.tx, marginBottom: 8 }}>{b}</div>
          ))}

          {s.box && (
            <div style={{ background: t.sf, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
              {s.box.map((item, i) => (
                <div key={i} style={{ fontSize: 12.5, lineHeight: 1.7, color: t.tx, display: "flex", gap: 7 }}>
                  <span style={{ color: t.ac, flexShrink: 0 }}>•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}

          {s.note && (
            <div style={{ background: t.gdS, borderRadius: 10, padding: "9px 11px", border: `1px solid ${t.gd}33`, marginBottom: 0 }}>
              <div style={{ fontSize: 11.5, color: t.gd, lineHeight: 1.6 }}>💡 {s.note}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTable = () => {
    const fuList = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];
    const hanList = [1, 2, 3, 4];
    const limits = [
      { label: "満貫", han: 5 },
      { label: "跳満", han: 6 },
      { label: "倍満", han: 8 },
      { label: "三倍満", han: 11 },
      { label: "役満", han: 13 },
    ];

    const cellValue = (fu, han) => {
      // 存在しない組み合わせ
      if (fu === 20 && !tableTsumo) return "—";   // 20符は平和ツモのみ（ロンは30符）
      if (fu === 20 && han === 1) return "—";     // 平和1翻+ツモ1翻=最低2翻
      if (fu === 25 && han === 1) return "—";     // 七対子は2翻から
      if (fu === 25 && han === 2 && tableTsumo) return "—"; // 七対子2翻+門前ツモ1翻=最低3翻
      const r = calcScore(fu, han, tableParent, tableTsumo, tableKiriage);
      if (tableTsumo) {
        if (tableParent) return `${r.each.toLocaleString()}∀`;
        return `${r.fromChild.toLocaleString()}/${r.fromParent.toLocaleString()}`;
      }
      return r.total.toLocaleString();
    };

    const limitValue = (han) => {
      const r = calcScore(30, han, tableParent, tableTsumo, tableKiriage);
      if (tableTsumo) {
        if (tableParent) return `${r.each.toLocaleString()}∀`;
        return `${r.fromChild.toLocaleString()}/${r.fromParent.toLocaleString()}`;
      }
      return r.total.toLocaleString();
    };

    const isMangan = (fu, han) => {
      if (!tableKiriage) return false;
      if (han === 4 && fu >= 30) return true;
      if (han === 3 && fu >= 60) return true;
      return false;
    };

    return (
      <div style={body}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>点数早見表</div>

        {/* Toggles */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `2px solid ${!tableParent ? t.ac : t.bd}`, background: !tableParent ? t.acS : "transparent", color: !tableParent ? t.ac : t.dm }}
            onClick={() => setTableParent(false)}>子</button>
          <button style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `2px solid ${tableParent ? t.gd : t.bd}`, background: tableParent ? t.gdS : "transparent", color: tableParent ? t.gd : t.dm }}
            onClick={() => setTableParent(true)}>親</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          <button style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `2px solid ${!tableTsumo ? t.rd : t.bd}`, background: !tableTsumo ? t.rdS : "transparent", color: !tableTsumo ? t.rd : t.dm }}
            onClick={() => setTableTsumo(false)}>ロン</button>
          <button style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `2px solid ${tableTsumo ? t.gn : t.bd}`, background: tableTsumo ? t.gnS : "transparent", color: tableTsumo ? t.gn : t.dm }}
            onClick={() => setTableTsumo(true)}>ツモ</button>
        </div>

        <button style={{
          width: "100%", padding: "8px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", marginBottom: 10,
          border: `1px solid ${tableKiriage ? t.gd : t.bd}`,
          background: tableKiriage ? t.gdS : "transparent",
          color: tableKiriage ? t.gd : t.dm,
        }} onClick={() => setTableKiriage(!tableKiriage)}>
          切り上げ満貫: {tableKiriage ? "ON" : "OFF"}
        </button>

        <div style={{ fontSize: 11, color: t.dm, marginBottom: 8, textAlign: "center" }}>
          {tableTsumo ? (tableParent ? "∀ = 全員から（オール）" : "子から / 親から") : "放銃者から受け取る点数"}
        </div>

        {/* Main table */}
        <div style={{ ...card, padding: 10, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 4px", color: t.dm, fontSize: 10, fontWeight: 700, borderBottom: `1px solid ${t.bd}`, textAlign: "left", position: "sticky", left: 0, background: t.card }}>符\翻</th>
                {hanList.map(h => (
                  <th key={h} style={{ padding: "6px 4px", color: t.ac, fontSize: 11, fontWeight: 700, borderBottom: `1px solid ${t.bd}`, textAlign: "center" }}>{h}翻</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fuList.map(fu => (
                <tr key={fu}>
                  <td style={{ padding: "7px 4px", color: t.gd, fontWeight: 700, fontSize: 11, borderBottom: `1px solid ${t.bd}22`, position: "sticky", left: 0, background: t.card }}>{fu}</td>
                  {hanList.map(h => {
                    const v = cellValue(fu, h);
                    const mangan = isMangan(fu, h);
                    return (
                      <td key={h} style={{
                        padding: "7px 3px", textAlign: "center", borderBottom: `1px solid ${t.bd}22`,
                        color: v === "—" ? t.bd : mangan ? t.gd : t.tx,
                        fontWeight: mangan ? 700 : 500,
                        fontVariantNumeric: "tabular-nums",
                        background: mangan ? t.gdS : "transparent",
                        fontSize: tableTsumo && !tableParent ? 10 : 11,
                      }}>{v}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Limit hands */}
        <div style={{ ...card, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 10 }}>満貫以上</div>
          {limits.map(l => (
            <div key={l.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${t.bd}22` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: l.han >= 13 ? t.gd : t.tx }}>
                {l.label}
                <span style={{ fontSize: 10, color: t.dm, marginLeft: 6, fontWeight: 400 }}>
                  {l.han === 13 ? "13翻〜" : l.han === 11 ? "11〜12翻" : l.han === 8 ? "8〜10翻" : l.han === 6 ? "6〜7翻" : "5翻"}
                </span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: t.ac, fontVariantNumeric: "tabular-nums" }}>{limitValue(l.han)}</span>
            </div>
          ))}
        </div>

        {/* Notes */}
        <div style={{ ...card, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 8 }}>補足</div>
          <div style={{ fontSize: 11, color: t.dm, lineHeight: 1.8 }}>
            <div>・<span style={{ color: t.gd }}>金色のセル</span> = 満貫扱い（切り上げ満貫ON時）</div>
            <div>・「—」= その組み合わせが存在しない</div>
            <div>・20符 = 平和ツモのみ（ロンは30符、最低2翻）</div>
            <div>・25符 = 七対子のみ（ロンは2翻から、ツモは3翻から）</div>
            <div>・切り上げ満貫ONで4翻30符・3翻60符が満貫に</div>
          </div>
        </div>

        <button style={actionBtn()} onClick={() => setView("home")}>メニューに戻る</button>
      </div>
    );
  };
  // ══════════════════════════════════
  // ── SCORE CALCULATION PROBLEMS (100) ──

  const FU_LESSONS = [
    {
      title: "レベル1: 基本符（キホンフ）",
      content: [
        { type: "text", text: "符計算の土台は「副底（フテイ）」20符。ここにあがり方で加符がつきます。" },
        { type: "box", items: [
          "副底（全員共通）→ 20符",
          "＋門前加符（門前ロンのみ）→ +10符",
          "＋ツモ符（ツモあがり）→ +2符",
        ]},
        { type: "text", text: "結果として、この4パターンになります。" },
        { type: "box", items: [
          "門前ロン → 20+10 = 30符",
          "門前ツモ → 20+2 = 22符",
          "鳴いてツモ → 20+2 = 22符",
          "鳴いてロン → 20符のみ",
        ]},
        { type: "text", text: "ポイント: 門前加符10符はロンの時だけ。ツモ符2符は鳴いていてもつきます。" },
      ],
      questions: [
        { q: "門前（メンゼン）でロンした時の基本符は？", choices: ["20符","30符","40符"], answer: "30符" },
        { q: "門前でツモあがりした時の基本符は？（ツモ符込み）", choices: ["20符","22符","30符"], answer: "22符" },
        { q: "ポンをした手でツモあがり。基本符は？", choices: ["20符","22符","30符"], answer: "22符" },
        { q: "鳴いてロンした時の基本符は？", choices: ["20符","25符","30符"], answer: "20符" },
      ]
    },
    {
      title: "レベル2: 刻子（コーツ）の符",
      content: [
        { type: "text", text: "同じ牌3枚の組を「刻子」といいます。作り方と牌の種類で符が変わります。" },
        { type: "box", items: [
          "明刻（ポン） 中張牌(2〜8) → 2符",
          "明刻（ポン） 么九牌(1,9,字) → 4符",
          "暗刻（自力） 中張牌(2〜8) → 4符",
          "暗刻（自力） 么九牌(1,9,字) → 8符",
        ]},
        { type: "text", text: "ポイント: 暗刻は明刻の2倍！么九牌は中張牌の2倍！" },
      ],
      questions: [
        { q: "5萬をポンした時（明刻・中張牌）の符は？", choices: ["2符","4符","8符"], answer: "2符" },
        { q: "東を自力で3枚揃えた時（暗刻・么九牌）の符は？", choices: ["4符","8符","16符"], answer: "8符" },
        { q: "9筒をポンした時（明刻・么九牌）の符は？", choices: ["2符","4符","8符"], answer: "4符" },
        { q: "3索を自力で3枚揃えた時（暗刻・中張牌）の符は？", choices: ["2符","4符","8符"], answer: "4符" },
      ]
    },
    {
      title: "レベル3: 槓子（カンツ）の符",
      content: [
        { type: "text", text: "同じ牌4枚の組を「槓子」といいます。刻子の4倍の符がつきます。" },
        { type: "box", items: [
          "明槓 中張牌(2〜8) → 8符",
          "明槓 么九牌(1,9,字) → 16符",
          "暗槓 中張牌(2〜8) → 16符",
          "暗槓 么九牌(1,9,字) → 32符 ← 最大！",
        ]},
        { type: "text", text: "暗槓の么九牌は32符。これだけで一気に符が跳ね上がります。" },
      ],
      questions: [
        { q: "6萬を明槓した時（中張牌）の符は？", choices: ["4符","8符","16符"], answer: "8符" },
        { q: "白を暗槓した時（么九牌）の符は？", choices: ["16符","32符","64符"], answer: "32符" },
        { q: "1萬を明槓した時（么九牌）の符は？", choices: ["8符","16符","32符"], answer: "16符" },
      ]
    },
    {
      title: "レベル4: 待ち（マチ）の符",
      content: [
        { type: "text", text: "あがる時の「待ち方」でも符がつきます。" },
        { type: "box", items: [
          "両面（リャンメン）待ち → 0符（例: 45で3,6待ち）",
          "シャンポン待ち → 0符（2組の対子でどちらか）",
          "カンチャン待ち → 2符（例: 46で5待ち）",
          "ペンチャン待ち → 2符（例: 12で3待ち）",
          "タンキ待ち → 2符（雀頭の1枚待ち）",
        ]},
        { type: "text", text: "両面とシャンポンは0符。それ以外は2符です。" },
      ],
      questions: [
        { q: "両面（リャンメン）待ちの符は？", choices: ["0符","2符","4符"], answer: "0符" },
        { q: "カンチャン待ち（例: 46で5待ち）の符は？", choices: ["0符","2符","4符"], answer: "2符" },
        { q: "タンキ待ち（雀頭の1枚待ち）の符は？", choices: ["0符","2符","4符"], answer: "2符" },
        { q: "シャンポン待ちの符は？", choices: ["0符","2符","4符"], answer: "0符" },
      ]
    },
    {
      title: "レベル5: 雀頭（ジャントウ）の符",
      content: [
        { type: "text", text: "あがりの形にある2枚のペア（アタマ）を「雀頭」といいます。" },
        { type: "box", items: [
          "数牌(1〜9)の雀頭 → 0符",
          "オタ風（役がつかない風牌）→ 0符",
          "役牌（白・發・中・場風・自風）→ 2符",
        ]},
        { type: "text", text: "役牌が雀頭の時だけ2符プラスです。" },
      ],
      questions: [
        { q: "5萬が雀頭の時の符は？", choices: ["0符","2符","4符"], answer: "0符" },
        { q: "白が雀頭の時の符は？", choices: ["0符","2符","4符"], answer: "2符" },
        { q: "自分の風牌が雀頭の時の符は？", choices: ["0符","2符","4符"], answer: "2符" },
      ]
    },
    {
      title: "レベル6: 総合問題",
      content: [
        { type: "text", text: "全てを組み合わせた符計算に挑戦！合計を10符単位に切り上げます。" },
        { type: "box", items: [
          "基本符 + 面子の符 + 待ちの符 + 雀頭の符",
          "→ 合計を10の倍数に切り上げ",
          "例: 30 + 4 + 2 + 0 = 36 → 40符",
        ]},
      ],
      questions: [
        { q: "門前ロン、暗刻(中張)1つ、両面待ち、数牌雀頭。合計符は？\n(30+4+0+0=34→切上)", choices: ["30符","40符","50符"], answer: "40符" },
        { q: "ツモ、暗刻(么九)1つ、カンチャン待ち、役牌雀頭。合計符は？\n(20+2+8+2+2=34→切上)", choices: ["30符","40符","50符"], answer: "40符" },
        { q: "門前ロン、暗刻(么九)2つ、タンキ待ち、数牌雀頭。合計符は？\n(30+8+8+2+0=48→切上)", choices: ["40符","50符","60符"], answer: "50符" },
        { q: "ロン（ポンあり）、明刻(中張)1つ、明刻(么九)1つ、両面、数牌雀頭。符は？\n※鳴いているので門前加符なし → 基本20符\n(20+2+4+0+0=26→切上)", choices: ["30符","40符","50符"], answer: "30符" },
      ]
    },
  ];

  const [fuLessonIdx, setFuLessonIdx] = useState(0);
  const [fuLessonPhase, setFuLessonPhase] = useState("menu"); // menu, lecture, test, result
  const [fuTestIdx, setFuTestIdx] = useState(0);
  const [fuTestAnswer, setFuTestAnswer] = useState(null);
  const [fuTestRevealed, setFuTestRevealed] = useState(false);
  const [fuTestScore, setFuTestScore] = useState({ correct: 0, total: 0 });
  const [fuClearedLevels, setFuClearedLevels] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mj_fu_cleared") || "[]"); } catch { return []; }
  });
  const saveFuCleared = (arr) => { setFuClearedLevels(arr); try { localStorage.setItem("mj_fu_cleared", JSON.stringify(arr)); } catch {} };

  const renderFuCourse = () => {
    const lesson = FU_LESSONS[fuLessonIdx];

    if (fuLessonPhase === "menu") {
      return (
        <div style={body}>
          <div style={{ textAlign: "center", padding: "20px 0 16px" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📐</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>符計算講座</h2>
            <p style={{ fontSize: 13, color: t.dm }}>レベル別に学んでマスターしよう</p>
          </div>
          {FU_LESSONS.map((l, idx) => {
            const cleared = fuClearedLevels.includes(idx);
            const locked = idx > 0 && !fuClearedLevels.includes(idx - 1);
            return (
              <button key={idx} disabled={locked} onClick={() => { if (!locked) { setFuLessonIdx(idx); setFuLessonPhase("lecture"); } }}
                style={{
                  ...card, width: "100%", textAlign: "left", cursor: locked ? "default" : "pointer", padding: 16, marginBottom: 8,
                  opacity: locked ? 0.4 : 1, border: `1px solid ${cleared ? t.gn + "55" : t.bd}`,
                  background: cleared ? t.gnS : t.card,
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{cleared ? "✅" : locked ? "🔒" : "📖"}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: locked ? t.dm : t.tx }}>{l.title}</div>
                    <div style={{ fontSize: 11, color: t.dm }}>{l.questions.length}問のテスト</div>
                  </div>
                </div>
              </button>
            );
          })}
          <button style={actionBtn()} onClick={() => setView("home")}>メニューに戻る</button>
        </div>
      );
    }

    if (fuLessonPhase === "lecture") {
      return (
        <div style={body}>
          <button style={backBtn} onClick={() => setFuLessonPhase("menu")}>← レベル選択</button>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>{lesson.title}</div>
          <div style={card}>
            {lesson.content.map((c, ci) => {
              if (c.type === "text") return <div key={ci} style={{ fontSize: 14, lineHeight: 1.8, marginBottom: 12, color: t.tx }}>{c.text}</div>;
              if (c.type === "box") return (
                <div key={ci} style={{ background: t.sf, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                  {c.items.map((item, ii) => <div key={ii} style={{ fontSize: 13, lineHeight: 1.8, color: t.tx, padding: "2px 0" }}>{item}</div>)}
                </div>
              );
              return null;
            })}
          </div>
          <button style={actionBtn("p")} onClick={() => { setFuLessonPhase("test"); setFuTestIdx(0); setFuTestAnswer(null); setFuTestRevealed(false); setFuTestScore({ correct: 0, total: 0 }); }}>
            テストに挑戦 →
          </button>
        </div>
      );
    }

    if (fuLessonPhase === "test") {
      const q = lesson.questions[fuTestIdx];
      if (!q) { setFuLessonPhase("result"); return null; }
      return (
        <div style={body}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: t.dm }}>{lesson.title}</span>
            <span style={{ fontSize: 13, color: t.ac }}>{fuTestIdx + 1}/{lesson.questions.length}</span>
          </div>
          <div style={{ height: 4, background: t.bd, borderRadius: 2, marginBottom: 16 }}>
            <div style={{ height: 4, background: t.ac, borderRadius: 2, width: `${(fuTestIdx / lesson.questions.length) * 100}%`, transition: "width 0.3s" }} />
          </div>
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, lineHeight: 1.6, whiteSpace: "pre-line" }}>{q.q}</div>
            {!fuTestRevealed ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {q.choices.map(ch => (
                  <button key={ch} style={{ ...actionBtn(), textAlign: "center" }} onClick={() => {
                    setFuTestAnswer(ch); setFuTestRevealed(true);
                    setFuTestScore(s => ({ correct: s.correct + (ch === q.answer ? 1 : 0), total: s.total + 1 }));
                  }}>{ch}</button>
                ))}
              </div>
            ) : (
              <div>
                <div style={{
                  textAlign: "center", padding: 14, borderRadius: 12, marginBottom: 12,
                  background: fuTestAnswer === q.answer ? t.gnS : t.rdS,
                  border: `2px solid ${fuTestAnswer === q.answer ? t.gn : t.rd}`,
                }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: fuTestAnswer === q.answer ? t.gn : t.rd }}>
                    {fuTestAnswer === q.answer ? "⭕ 正解！" : `❌ 正解は ${q.answer}`}
                  </div>
                </div>
                <button style={actionBtn("p")} onClick={() => {
                  if (fuTestIdx + 1 >= lesson.questions.length) setFuLessonPhase("result");
                  else { setFuTestIdx(fuTestIdx + 1); setFuTestAnswer(null); setFuTestRevealed(false); }
                }}>{fuTestIdx + 1 >= lesson.questions.length ? "結果を見る" : "次の問題"}</button>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (fuLessonPhase === "result") {
      const pct = fuTestScore.total > 0 ? Math.round(fuTestScore.correct / fuTestScore.total * 100) : 0;
      const passed = pct >= 70;
      if (passed && !fuClearedLevels.includes(fuLessonIdx)) {
        const newCleared = [...fuClearedLevels, fuLessonIdx];
        saveFuCleared(newCleared);
      }
      return (
        <div style={body}>
          <div style={{ textAlign: "center", padding: "24px 0 16px" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{passed ? "🎉" : "📚"}</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>{lesson.title}</h2>
            <p style={{ fontSize: 13, color: t.dm }}>{passed ? "クリア！次のレベルが解放されました" : "70%以上で合格です。もう一度挑戦！"}</p>
          </div>
          <div style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: passed ? t.gn : t.rd }}>{pct}%</div>
            <div style={{ fontSize: 16, color: t.dm }}>{fuTestScore.correct} / {fuTestScore.total} 正解</div>
          </div>
          {!passed && <button style={actionBtn("p")} onClick={() => { setFuLessonPhase("lecture"); }}>もう一度講座を見る</button>}
          {passed && fuLessonIdx < FU_LESSONS.length - 1 && <button style={actionBtn("p")} onClick={() => { setFuLessonIdx(fuLessonIdx + 1); setFuLessonPhase("lecture"); }}>次のレベルへ →</button>}
          <button style={actionBtn()} onClick={() => setFuLessonPhase("menu")}>レベル選択に戻る</button>
          <button style={actionBtn()} onClick={() => setView("home")}>メニューに戻る</button>
        </div>
      );
    }
    return null;
  };

  // ── Score correction ──
  const [editingRoundIdx, setEditingRoundIdx] = useState(null);
  const [tableMode, setTableMode] = useState(true);
  const [homeCat, setHomeCat] = useState(null); // null | play | practice | settings
  const [tmWinStep, setTmWinStep] = useState(null); // null | "winner" | "how"
  const [tmDrawMode, setTmDrawMode] = useState(false); // 卓上モードの流局入力
  const [showRoundEdit, setShowRoundEdit] = useState(false); // 局の修正モーダル
  const [seatRot, setSeatRot] = useState(0); // 卓の回転（0-3）自分を手前に持ってくる
  const [playerDetail, setPlayerDetail] = useState(null); // 変動履歴を表示するプレイヤーのindex
  const [rankPeek, setRankPeek] = useState(null);         // 長押しで順位・点差を表示するプレイヤーのindex
  const [rankPeekGold, setRankPeekGold] = useState(false); // 順位ビューでレート換算を表示
  const [setOpen, setSetOpen] = useState(null); // 設定画面のアコーディオン（開いている項目）
  const secHdr = (id, icon, title, sub) => (
    <button key={"sec-" + id} onClick={() => setSetOpen(v => (v === id ? null : id))} style={{
      ...card, width: "100%", padding: 14, marginTop: 4,
      display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left",
      border: `1px solid ${setOpen === id ? t.ac : t.bd}`,
    }}>
      <span style={{
        fontSize: 20, width: 40, height: 40, borderRadius: 11, background: t.acS,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: t.tx }}>{title}</span>
        <span style={{ display: "block", fontSize: 11, color: t.dm, marginTop: 2 }}>{sub}</span>
      </span>
      <span style={{
        color: setOpen === id ? t.ac : t.dm, fontSize: 13, flexShrink: 0,
        transform: setOpen === id ? "rotate(180deg)" : "none", transition: "transform 0.2s",
      }}>▼</span>
    </button>
  );
  const [showPayView, setShowPayView] = useState(false);  // 卓上表示（点数の受け渡しを矢印で表示）
  const [yakuInfo, setYakuInfo] = useState(null);         // 長押しで説明を出す役
  const [startSplash, setStartSplash] = useState(null);   // 対局開始の演出 { league, gameNo, matchType, date, seats }
  const splashTimer = React.useRef(null);
  const yakuPressTimer = React.useRef(null);
  const yakuPressFired = React.useRef(false);
  const yakuPressHandlers = (y) => ({
    onPointerDown: () => {
      yakuPressFired.current = false;
      if (yakuPressTimer.current) clearTimeout(yakuPressTimer.current);
      yakuPressTimer.current = setTimeout(() => {
        yakuPressFired.current = true;
        try { if (navigator.vibrate) navigator.vibrate(12); } catch {}
        setYakuInfo(y);
      }, 450);
    },
    onPointerUp: () => { if (yakuPressTimer.current) clearTimeout(yakuPressTimer.current); },
    onPointerLeave: () => { if (yakuPressTimer.current) clearTimeout(yakuPressTimer.current); },
    onPointerCancel: () => { if (yakuPressTimer.current) clearTimeout(yakuPressTimer.current); },
    onContextMenu: (e) => e.preventDefault(),
  });
  // 長押し（500ms）で履歴を開く。誤タップで開かないようにする
  const longPressTimer = React.useRef(null);
  const longPressFired = React.useRef(false);
  const longPressHandlers = (i) => ({
    onPointerDown: () => {
      longPressFired.current = false;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        try { if (navigator.vibrate) navigator.vibrate(12); } catch {}
        setRankPeekGold(false);
        setRankPeek(i);
      }, 500);
    },
    onPointerUp: () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); },
    onPointerLeave: () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); },
    onPointerCancel: () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); },
    onContextMenu: (e) => e.preventDefault(),
    style: { WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" },
  });

  // ── 登録プレイヤー名リスト ──
  const [presetNames, setPresetNames] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem("mj_preset_names") || "null");
      return Array.isArray(v) && v.length ? v : DEFAULT_PRESET_NAMES;
    } catch { return DEFAULT_PRESET_NAMES; }
  });
  const savePresetNames = (arr) => {
    setPresetNames(arr);
    try { localStorage.setItem("mj_preset_names", JSON.stringify(arr)); } catch {}
  };
  const [newNameInput, setNewNameInput] = useState("");
  const [editNameIdx, setEditNameIdx] = useState(null);

  // ── よく打つ4人の組み合わせ（グループ） ──
  const [groups, setGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mj_groups") || "[]"); } catch { return []; }
  });
  const saveGroups = (arr) => {
    setGroups(arr);
    try { localStorage.setItem("mj_groups", JSON.stringify(arr)); } catch {}
  };
  const [groupNameInput, setGroupNameInput] = useState("");
  const [showGroupSave, setShowGroupSave] = useState(false);
  // 設定画面でのグループ作成
  const [gEditOpen, setGEditOpen] = useState(false);
  const [gEditId, setGEditId] = useState(null);       // 編集中のグループ（新規は null）
  const [gEditName, setGEditName] = useState("");
  const [gEditMembers, setGEditMembers] = useState([]);
  const [editNameVal, setEditNameVal] = useState("");

  // ══════════════════════════════════
  // ── DICE ROLLER ──
  // ══════════════════════════════════
  const [diceOpen, setDiceOpen] = useState(false);
  const [diceVals, setDiceVals] = useState([1, 1]);
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceSpin, setDiceSpin] = useState(0);   // 振った回数（3Dの回転量に使う）
  // サイコロの効果音（Web Audioでその場で合成。ファイル不要・オフラインOK）
  const [diceSoundOn, setDiceSoundOn] = useState(() => {
    try { return localStorage.getItem("mj_dice_sound") !== "0"; } catch { return true; }
  });
  const saveDiceSound = (on) => {
    setDiceSoundOn(on);
    try { localStorage.setItem("mj_dice_sound", on ? "1" : "0"); } catch {}
  };
  const audioCtxRef = React.useRef(null);
  const playDiceSound = () => {
    if (!diceSoundOn) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const clack = (t, vol, freq) => {
        const dur = 0.05;
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 1.1;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(bp); bp.connect(g); g.connect(ctx.destination);
        src.start(t); src.stop(t + dur);
      };
      const now = ctx.currentTime + 0.01;
      // 転がり: 速い連打から徐々に間隔が開く
      let tt = now;
      const hits = 9 + Math.floor(Math.random() * 3);
      for (let i = 0; i < hits; i++) {
        const prog = i / hits;
        clack(tt, 0.22 + Math.random() * 0.16, 1500 + Math.random() * 2300);
        tt += 0.028 + prog * 0.085 + Math.random() * 0.028;
      }
      // 着地: 低めの音で2回コトッ
      clack(tt + 0.02, 0.5, 1050);
      clack(tt + 0.11, 0.32, 850);
    } catch {}
  };
  const [wallBlink, setWallBlink] = useState(false); // 山を割る人の点滅（10秒）
  const wallBlinkTimer = React.useRef(null);
  const [diceSettled, setDiceSettled] = useState(false);
  const [diceRoundKey, setDiceRoundKey] = useState(null); // サイコロを振った局（局が変わると案内を再表示）
  const diceClearTimer = React.useRef(null);
  const [diceHoldSec, setDiceHoldSec] = useState(() => {
    try { const v = parseInt(localStorage.getItem("mj_dice_hold") || "5", 10); return (isNaN(v) || v <= 0) ? 5 : v; } catch { return 5; }
  });
  const saveDiceHold = (v) => { setDiceHoldSec(v); try { localStorage.setItem("mj_dice_hold", String(v)); } catch {} };

  // ── 卓上モード中は画面を固定し、ずれても中央に戻す ──
  const tableLocked = tableMode && gameStarted && !gameFinished && view === "game";
  React.useEffect(() => {
    if (!tableLocked) return;
    const snapBack = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    window.scrollTo(0, 0);
    window.addEventListener("scroll", snapBack, { passive: true });
    window.addEventListener("orientationchange", snapBack);
    return () => {
      window.removeEventListener("scroll", snapBack);
      window.removeEventListener("orientationchange", snapBack);
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, [tableLocked]);

  // ── 画面スリープ防止（Screen Wake Lock API） ──
  const wakeSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [keepAwake, setKeepAwake] = useState(() => {
    try { return localStorage.getItem("mj_keep_awake") !== "0"; } catch { return true; }
  });
  const [wakeActive, setWakeActive] = useState(false);
  const wakeLockRef = React.useRef(null);
  const saveKeepAwake = (v) => { setKeepAwake(v); try { localStorage.setItem("mj_keep_awake", v ? "1" : "0"); } catch {} };

  React.useEffect(() => {
    if (!wakeSupported) return;
    let cancelled = false;

    const acquire = async () => {
      if (!keepAwake || document.visibilityState !== "visible") return;
      if (wakeLockRef.current) return;
      try {
        const wl = await navigator.wakeLock.request("screen");
        if (cancelled) { try { await wl.release(); } catch {} return; }
        wakeLockRef.current = wl;
        setWakeActive(true);
        wl.addEventListener("release", () => {
          wakeLockRef.current = null;
          setWakeActive(false);
        });
      } catch { setWakeActive(false); }
    };

    const release = async () => {
      const wl = wakeLockRef.current;
      wakeLockRef.current = null;
      setWakeActive(false);
      if (wl) { try { await wl.release(); } catch {} }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };

    if (keepAwake) {
      acquire();
      document.addEventListener("visibilitychange", onVisible);
    } else {
      release();
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (!keepAwake) return;
      const wl = wakeLockRef.current;
      wakeLockRef.current = null;
      if (wl) { try { wl.release(); } catch {} }
    };
  }, [keepAwake, wakeSupported]);


  const rollDice = () => {
    playDiceSound();
    setDiceSpin(v => v + 1);
    setWallBlink(true);
    if (wallBlinkTimer.current) clearTimeout(wallBlinkTimer.current);
    wallBlinkTimer.current = setTimeout(() => setWallBlink(false), 10000);
    setDiceRoundKey(`${roundWind}${dealerIdx}-${honba}-${rounds.length}`);
    if (diceClearTimer.current) clearTimeout(diceClearTimer.current);
    setDiceRolling(true);
    setDiceSettled(false);
    let ticks = 0;
    const timer = setInterval(() => {
      setDiceVals([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
      ticks++;
      if (ticks >= 16) {
        clearInterval(timer);
        const final = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
        setDiceVals(final);
        setDiceRolling(false);
        setDiceSettled(true);
        // 設定した秒数後に自動でクリア（0=ずっと表示）
        if (diceClearTimer.current) clearTimeout(diceClearTimer.current);
        if (diceHoldSec > 0) {
          diceClearTimer.current = setTimeout(() => setDiceSettled(false), diceHoldSec * 1000);
        }
      }
    }, 70);
  };

  // サイコロの目（ピップ配置）
  // ── 3Dサイコロ（キューブが転がって出目で止まる） ──
  // 面の配置: 前=1 / 後=6 / 上=2 / 下=5 / 右=3 / 左=4（対面の和が7）
  const DIE_FACE_ROT = {
    1: { x: 0, y: 0 }, 6: { x: 0, y: 180 },
    2: { x: -90, y: 0 }, 5: { x: 90, y: 0 },
    3: { x: 0, y: -90 }, 4: { x: 0, y: 90 },
  };
  const Die = ({ value, size = 68, rolling, spin = 0 }) => {
    const LAYOUT = {
      1: [4], 2: [0, 8], 3: [0, 4, 8],
      4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
    };
    const h = size / 2;
    const dot = size * 0.15;
    const faces = [
      { n: 1, tf: `translateZ(${h}px)` },
      { n: 6, tf: `rotateY(180deg) translateZ(${h}px)` },
      { n: 2, tf: `rotateX(90deg) translateZ(${h}px)` },
      { n: 5, tf: `rotateX(-90deg) translateZ(${h}px)` },
      { n: 3, tf: `rotateY(90deg) translateZ(${h}px)` },
      { n: 4, tf: `rotateY(-90deg) translateZ(${h}px)` },
    ];
    const fin = DIE_FACE_ROT[value] || DIE_FACE_ROT[1];
    // 振るたびに回転量を増やして、出目の向きでピタッと止める
    const turns = 360 * (3 + (spin % 3));
    const rot = `rotateX(${fin.x + turns}deg) rotateY(${fin.y + turns}deg) rotateZ(${(spin % 2) * 180}deg)`;
    const faceStyle = (n) => ({
      position: "absolute", inset: 0, borderRadius: size * 0.16,
      background: "linear-gradient(150deg, #ffffff 0%, #f2efe7 55%, #ddd8cc 100%)",
      border: "1px solid #cbc6ba",
      boxShadow: "inset 0 0 " + (size * 0.18) + "px rgba(0,0,0,0.14)",
      display: "grid", gridTemplateColumns: "repeat(3,1fr)", gridTemplateRows: "repeat(3,1fr)",
      padding: size * 0.13, boxSizing: "border-box",
      backfaceVisibility: "hidden",
    });
    return (
      <div style={{
        width: size, height: size, perspective: size * 5,
        animation: rolling ? "diceHop 0.5s ease-in-out infinite" : "none",
        filter: `drop-shadow(0 ${size * 0.09}px ${size * 0.14}px rgba(0,0,0,0.55))`,
      }}>
        <div style={{
          width: "100%", height: "100%", position: "relative",
          transformStyle: "preserve-3d",
          transform: rot,
          transition: rolling ? "transform 0.28s linear" : "transform 1.15s cubic-bezier(.16,.9,.28,1)",
        }}>
          {faces.map(f => (
            <div key={f.n} style={{ ...faceStyle(f.n), transform: f.tf }}>
              {[...Array(9)].map((_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {(LAYOUT[f.n] || []).includes(i) && (
                    <div style={{
                      width: dot, height: dot, borderRadius: "50%",
                      background: (f.n === 1 || f.n === 4) ? "#c0392b" : "#22262c",
                      boxShadow: "inset 0 1px 1px rgba(255,255,255,0.5), 0 1px 1px rgba(0,0,0,0.25)",
                    }} />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const DiceModal = () => {
    if (!diceOpen) return null;
    const sum = diceVals[0] + diceVals[1];
    // 親から反時計回りに 1=親, 2=下家, 3=対面, 4=上家 と数える
    const targetIdx = (dealerIdx + (sum - 1)) % PC;
    const relLabel = (PC === 3
      ? ["自分（親）の山", "下家（右）の山", "上家（左）の山"]
      : ["自分（親）の山", "下家（右）の山", "対面の山", "上家（左）の山"])[(sum - 1) % PC];

    return (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.92)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
        onClick={() => { if (!diceRolling) { setDiceOpen(false); setDiceSettled(false); } }}>
        <div style={{ width: "100%", maxWidth: 340 }} onClick={e => e.stopPropagation()}>
          <div style={{
            background: "linear-gradient(160deg, #16452f, #103526)",
            borderRadius: 20, border: "3px solid #24583f", padding: "28px 20px", textAlign: "center",
          }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 20 }}>
              {diceRolling ? "振っています…" : diceSettled ? "結果" : "タップして振る"}
            </div>

            {/* サイコロ */}
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 20, minHeight: 76 }}>
              <Die value={diceVals[0]} rolling={diceRolling} spin={diceSpin} />
              <Die value={diceVals[1]} rolling={diceRolling} spin={diceSpin + 1} />
            </div>

            {/* 合計 */}
            <div style={{
              opacity: diceSettled ? 1 : 0.25,
              transition: "opacity 0.3s",
              background: "rgba(0,0,0,0.35)", borderRadius: 14, padding: "14px 12px", marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>合計</div>
              <div style={{ fontSize: 44, fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>{sum}</div>
              {diceSettled && (
                <>
                  <div style={{ fontSize: 15, fontWeight: 800, color: t.gd, marginTop: 6 }}>{relLabel}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                    {players[targetIdx]} の山を右から {sum} つ目で割る
                  </div>
                </>
              )}
            </div>

            <button style={{
              width: "100%", padding: "14px", borderRadius: 12, marginBottom: 8,
              border: "none", background: diceRolling ? "#2a5d4a" : t.ac,
              color: "#fff", fontSize: 15, fontWeight: 800, cursor: diceRolling ? "default" : "pointer",
            }} disabled={diceRolling} onClick={rollDice}>
              {diceRolling ? "🎲 …" : diceSettled ? "🎲 もう一度振る" : "🎲 サイコロを振る"}
            </button>
            <button style={{
              width: "100%", padding: "12px", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.2)", background: "transparent",
              color: "rgba(255,255,255,0.7)", fontSize: 14, cursor: "pointer",
            }} onClick={() => { if (!diceRolling) { setDiceOpen(false); setDiceSettled(false); } }}>閉じる</button>
          </div>
        </div>
      </div>
    );
  };

  // 指定プレイヤーの点数変動履歴を算出
  const getPlayerHistory = (pi) => {
    const cfg = gameConfig || {};
    let running = cfg.rules?.startPoints || 30000;
    const log = [{ label: "開始", delta: null, total: running }];

    rounds.forEach(r => {
      const before = running;
      let delta = 0;

      // リーチ棒を出した人は、その局で1,000点減る（アガリ・流局どちらでも）
      const paidRiichi = r.riichi && r.riichi[pi];
      const parts = [];   // [{ label, amt }] 内訳。amt が null なら金額を出さない

      if (r.draw) {
        if (paidRiichi) delta -= 1000;
        const rpc = cfg.playerCount || 4;
        const tc = r.tenpai ? r.tenpai.slice(0, rpc).filter(Boolean).length : 0;
        if (tc > 0 && tc < rpc) {
          const nc = rpc - tc;
          if (r.tenpai[pi]) { const g2 = Math.floor(3000 / tc); delta += g2; parts.push({ label: "流局・テンパイ", amt: g2 }); }
          else { const p2 = Math.floor(3000 / nc); delta -= p2; parts.push({ label: "流局・ノーテン", amt: -p2 }); }
        } else {
          parts.push({ label: tc > 0 ? "流局（全員テンパイ）" : "流局（全員ノーテン）", amt: null });
        }
        if (paidRiichi) parts.push({ label: "リーチ", amt: -1000 });
      } else {
        const rpc2 = cfg.playerCount || 4;
        const res = calcScore(r.han >= 5 ? 30 : (r.fu || 30), r.han, r.winner === r.dealer, r.tsumo, cfg.rules?.kiriage, rpc2);
        const rc = r.riichi ? r.riichi.filter(Boolean).length : 0;
        // 受け取る供託。古い記録には pool が無いのでその場合だけ本数から求める
        const pool = (typeof r.pool === "number") ? r.pool : rc * 1000;
        const hb = r.honba * ((cfg.rules && cfg.rules.honbaUnit) || 300);
        const handLabel = r.han >= 13 ? getLimitName(r.han) : r.fu ? `${r.han}翻${r.fu}符` : `${r.han}翻`;
        if (paidRiichi) { delta -= 1000; }

        if (r.winner === pi) {
          const gain = (r.tsumo && (rpc2 === 3 || r.winner === r.dealer)) ? res.each * (rpc2 - 1) : res.total;
          delta += gain + hb + pool;
          parts.push({ label: `${r.tsumo ? "ツモ" : "ロン"}${handLabel}`, amt: gain });
          if (paidRiichi) parts.push({ label: "リーチ", amt: -1000 });
          if (pool > 0) parts.push({ label: "供託", amt: pool });
          if (hb > 0) parts.push({ label: `${r.honba}本場`, amt: hb });
        } else if (r.tsumo) {
          let pay;
          if (rpc2 === 3 || r.winner === r.dealer) pay = res.each;
          else if (pi === r.dealer) pay = res.fromParent;
          else pay = res.fromChild;
          const hbShare = Math.floor(hb / (rpc2 - 1));
          delta -= pay + hbShare;
          parts.push({ label: `${players[r.winner]}のツモ`, amt: -pay });
          if (paidRiichi) parts.push({ label: "リーチ", amt: -1000 });
          if (hbShare > 0) parts.push({ label: `${r.honba}本場`, amt: -hbShare });
        } else if (r.loser === pi) {
          delta -= res.total + hb;
          parts.push({ label: `${players[r.winner]}へ放銃`, amt: -res.total });
          if (paidRiichi) parts.push({ label: "リーチ", amt: -1000 });
          if (hb > 0) parts.push({ label: `${r.honba}本場`, amt: -hb });
        } else {
          if (paidRiichi) parts.push({ label: "リーチ", amt: -1000 });
          else parts.push({ label: "—", amt: null });
        }
      }
      const desc = parts.map(x => x.amt === null ? x.label
        : `${x.label}(${x.amt > 0 ? "+" : ""}${x.amt.toLocaleString()})`).join("　");
      running = before + delta;
      log.push({
        parts,
        label: `${r.wind}${r.dealer + 1}局${r.honba > 0 ? ` ${r.honba}本場` : ""}`,
        desc, delta, total: running,
      });
    });
    return log;
  };

  // 複数ロンがルール設定を超えたときの確認モーダル
  const RonRuleWarnModal = () => {
    if (!ronRuleWarn) return null;
    const rs = gameConfig?.rules || {};
    const cur = rs.multiRon === "triple" ? "トリプルロンあり" : rs.multiRon === "double" ? "ダブロンあり" : "頭ハネ";
    const curMax = rs.multiRon === "triple" ? 3 : rs.multiRon === "double" ? 2 : 1;
    const need = ronPick.length;
    const needKey = need >= 3 ? "triple" : "double";
    const needLabel = need >= 3 ? "トリプルロンあり" : "ダブロンあり";
    const lg = leagues.find(l => l.id === activeLeagueId);
    const proceed = () => { setRonRuleWarn(false); setTmWinStep("how"); };

    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        overflowY: "auto",
      }}>
        <div style={{ ...card, maxWidth: 380, width: "100%", margin: 0, border: `2px solid ${t.rd}88` }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: t.rd, textAlign: "center", marginBottom: 10 }}>
            ⚠️ ルール設定と異なります
          </div>
          <div style={{
            padding: 13, borderRadius: 10, background: t.sf, border: `1px solid ${t.bd}`,
            fontSize: 13, color: t.tx, lineHeight: 1.95, marginBottom: 14,
          }}>
            この対局のルールは <span style={{ color: t.gd, fontWeight: 800 }}>「{cur}」</span>
            （{curMax}人まで）です。<br />
            いま <span style={{ color: t.rd, fontWeight: 800 }}>{need}人</span> のアガリを記録しようとしています。
          </div>

          <button onClick={() => {
            setGameConfig(g => ({ ...g, rules: { ...(g.rules || {}), multiRon: needKey } }));
            if (lg) {
              saveLeagues(leagues.map(l => l.id === lg.id
                ? { ...l, rules: { ...l.rules, multiRon: needKey } } : l));
            }
            proceed();
          }} style={{
            width: "100%", padding: "14px 10px", marginBottom: 9, borderRadius: 11, cursor: "pointer",
            border: "none", background: t.ac, color: "#fff", fontSize: 14, fontWeight: 800, lineHeight: 1.5,
          }}>
            ルールを「{needLabel}」に変更して続ける
            <span style={{ display: "block", fontSize: 10, fontWeight: 400, opacity: 0.85, marginTop: 3 }}>
              {lg ? `${lg.name} の設定も更新されます` : "以降この対局に適用されます"}
            </span>
          </button>

          <button onClick={proceed} style={{
            width: "100%", padding: "13px 10px", marginBottom: 9, borderRadius: 11, cursor: "pointer",
            border: `1px solid ${t.bd}`, background: "transparent", color: t.tx, fontSize: 13, fontWeight: 700, lineHeight: 1.5,
          }}>
            今回だけ例外として記録する
            <span style={{ display: "block", fontSize: 10, fontWeight: 400, color: t.dm, marginTop: 3 }}>
              ルール設定は変えません
            </span>
          </button>

          <button onClick={() => setRonRuleWarn(false)} style={{
            width: "100%", padding: "12px 10px", borderRadius: 11, cursor: "pointer",
            border: `1px solid ${t.bd}`, background: t.sf, color: t.dm, fontSize: 13, fontWeight: 700,
          }}>選び直す</button>
        </div>
      </div>
    );
  };

  // 対局中のルール確認モーダル
  const RuleCheckModal = () => {
    if (!showRuleCheck) return null;
    const rs = gameConfig?.rules || {};
    const lg = leagues.find(l => l.id === activeLeagueId);
    const row = (label, value, hint) => (
      <div style={{ padding: "10px 0", borderBottom: `1px solid ${t.bd}33` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: t.tx, flexShrink: 0 }}>{label}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: t.tx, textAlign: "right" }}>{value}</span>
        </div>
        {hint && <div style={{ fontSize: 11, color: "#b9c6d8", marginTop: 4, lineHeight: 1.6 }}>{hint}</div>}
      </div>
    );
    const renchan = rs.agariRenchan ? "あがり連荘" : rs.tenpaiRenchan ? "テンパイ連荘" : "無条件連荘";
    const renchanHint = rs.agariRenchan
      ? "流局したら親は必ず流れる"
      : rs.tenpaiRenchan ? "親がテンパイなら続行、ノーテンなら流れる" : "流局しても親は続行";
    const mr = rs.multiRon === "triple" ? "トリプルロンあり"
      : rs.multiRon === "double" ? "ダブロンあり" : "頭ハネ";
    // ウマはリーグ戦ならリーグの設定、そうでなければ対局ルールから
    const umaArr = (lg && lg.uma && lg.uma.length === PC) ? lg.uma
      : (rs.uma && rs.uma.length === PC) ? rs.uma : null;
    const umaLabel = (!umaArr || umaArr.every(u => !u))
      ? "なし" : umaArr.map(u => (u > 0 ? "+" : "") + u).join(" / ");
    const rateUnit = rs.rateUnit || "G";

    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "20px 16px",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        overflowY: "auto",
      }} onClick={() => { setShowRuleCheck(false); setRuleEditMode(false); }}>
        <div style={{
          ...card, maxWidth: 400, width: "100%", margin: 0,
          // 上側（対面向き）のボタンから開いたときは、向かいの人が読める向きにする
          transform: showRuleCheck === "flip" ? "rotate(180deg)" : "none",
        }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: t.tx }}>この対局のルール</div>
              {lg && <div style={{ fontSize: 11, color: t.gd, marginTop: 3 }}>🏆 {lg.name}</div>}
            </div>
            <button style={{ background: "none", border: "none", color: t.dm, fontSize: 20, cursor: "pointer", lineHeight: 1 }}
              onClick={() => { setShowRuleCheck(false); setRuleEditMode(false); }}>✕</button>
          </div>

          {!ruleEditMode ? (
            <>
              {row("人数", PC === 3 ? "三人麻雀" : "四人麻雀")}
              {row("形式", MATCH_LABEL(gameConfig?.matchType))}
              {row("持ち点 / 返し点",
                `${(rs.startPoints ?? 25000).toLocaleString()} / ${(rs.returnPoints ?? 30000).toLocaleString()}`,
                `オカ ${(((rs.returnPoints ?? 0) - (rs.startPoints ?? 0)) * PC / 1000)}pt がトップへ`)}
              {row("ウマ（順位点）", umaLabel)}
              {row("流局したときの親", renchan, renchanHint)}
              {row("オーラス", rs.orasYame !== false ? "親トップで終了" : "やめなし",
                rs.orasYame !== false ? "アガリやめ・テンパイやめ" : "親がトップでも続行")}
              {row("複数人が同時にロン", mr,
                rs.multiRon === "atamahane" ? "アガれるのは1人だけ" : "本場と供託は放銃者に近い人へ")}
              {row("食いタン", rs.kuitan ? "あり" : "なし")}
              {row("後付け", rs.atozuke ? "あり" : "なし")}
              {row("切り上げ満貫", rs.kiriage ? "あり" : "なし",
                rs.kiriage ? "4翻30符・3翻60符を満貫扱い" : null)}
              {row("ダブル役満", rs.doubleYakuman ? "あり" : "なし",
                rs.doubleYakuman ? "役満の複合を2倍・3倍で計算" : null)}
              {row("数え役満", rs.kazoeYakuman !== false ? "あり" : "なし",
                rs.kazoeYakuman !== false ? "13翻以上は役満として計算" : "11翻以上でも三倍満どまり")}
              {row("トビで終了", rs.tobiEnd !== false ? "あり" : "なし")}
              {row("本場", `1本 = ${HU().toLocaleString()}点`,
                `ツモのときは他家が ${Math.floor(HU() / (PC - 1)).toLocaleString()}点ずつ負担`)}
              {row("ノーテン罰符", "場で3,000点", "ノーテンの人が払い、テンパイの人で分け合います")}
              {row("レート", rs.rate > 0 ? `1点 = ${RATE_LABEL(rs.rate)} ${rateUnit}` : "なし",
                rs.rate > 0 ? `10,000点なら ${GOLD_LABEL(GOLD(10, rs.rate))} ${rateUnit}` : null)}
            </>
          ) : (() => {
            const seg = (opts, cur, onPick) => (
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {opts.map(([k, lb]) => (
                  <button key={k} onClick={() => onPick(k)} style={{
                    flex: "1 1 30%", padding: "10px 4px", borderRadius: 9, cursor: "pointer",
                    border: `1.5px solid ${cur === k ? t.ac : t.bd}`,
                    background: cur === k ? t.acS : "transparent",
                    color: cur === k ? t.ac : t.dm, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                  }}>{lb}</button>
                ))}
              </div>
            );
            const editRow = (label, body, hint) => (
              <div style={{ padding: "10px 0", borderBottom: `1px solid ${t.bd}33` }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.tx }}>{label}</div>
                {body}
                {hint && <div style={{ fontSize: 11, color: "#b9c6d8", marginTop: 5, lineHeight: 1.6 }}>{hint}</div>}
              </div>
            );
            const tgl = (label, on, onToggle, hint) => (
              <div style={{ padding: "10px 0", borderBottom: `1px solid ${t.bd}33` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: t.tx }}>{label}</span>
                  <button onClick={onToggle} style={{
                    width: 48, height: 28, borderRadius: 14, border: "none", padding: 0, cursor: "pointer",
                    background: on ? t.ac : t.bd, position: "relative", transition: "background 0.15s", flexShrink: 0,
                  }}>
                    <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
                  </button>
                </div>
                {hint && <div style={{ fontSize: 11, color: "#b9c6d8", marginTop: 4, lineHeight: 1.6 }}>{hint}</div>}
              </div>
            );
            const renchanKey = rs.agariRenchan ? "agari" : rs.tenpaiRenchan ? "tenpai" : "none";
            return (
              <>
                <div style={{ fontSize: 11, color: t.gd, padding: "8px 10px", borderRadius: 8, background: t.gdS, border: `1px solid ${t.gd}33`, lineHeight: 1.7, marginBottom: 4 }}>
                  変更はこの対局にすぐ反映されます（リーグや次回対局の既定ルールは変わりません）
                </div>
                {editRow("形式", seg(
                  [["tonpu", "東風戦"], ["hanchan", "半荘戦"], ["zenchan", "全荘戦"]],
                  gameConfig?.matchType, (k) => patchMatchType(k)),
                  "延長・短縮はここで切り替えられます。すでに過ぎた場には戻れません")}
                {row("持ち点 / 返し点",
                  `${(rs.startPoints ?? 25000).toLocaleString()} / ${(rs.returnPoints ?? 30000).toLocaleString()}`,
                  "対局中は変更できません")}
                {editRow("流局したときの親", seg(
                  [["agari", "あがり連荘"], ["tenpai", "テンパイ連荘"], ["none", "無条件連荘"]],
                  renchanKey,
                  (k) => patchGameRules(k === "agari" ? { agariRenchan: true, tenpaiRenchan: false }
                    : k === "tenpai" ? { agariRenchan: false, tenpaiRenchan: true }
                    : { agariRenchan: false, tenpaiRenchan: false })))}
                {tgl("オーラスは親トップで終了", rs.orasYame !== false,
                  () => patchGameRules({ orasYame: rs.orasYame === false }),
                  "アガリやめ・テンパイやめ")}
                {editRow("複数人が同時にロン", seg(
                  [["atamahane", "頭ハネ"], ["double", "ダブロン"], ["triple", "トリプル"]],
                  rs.multiRon || "atamahane", (k) => patchGameRules({ multiRon: k })))}
                {tgl("食いタンあり", rs.kuitan !== false, () => patchGameRules({ kuitan: rs.kuitan === false }))}
                {tgl("後付けあり", rs.atozuke !== false, () => patchGameRules({ atozuke: rs.atozuke === false }))}
                {tgl("切り上げ満貫", rs.kiriage === true, () => patchGameRules({ kiriage: !rs.kiriage }),
                  "4翻30符・3翻60符を満貫扱い（これ以降の入力と局の修正に適用）")}
                {tgl("ダブル役満あり", rs.doubleYakuman === true, () => patchGameRules({ doubleYakuman: !rs.doubleYakuman }),
                  "役満の複合を2倍・3倍で計算")}
                {tgl("トビで終了", rs.tobiEnd !== false, () => patchGameRules({ tobiEnd: rs.tobiEnd === false }))}
              </>
            );
          })()}

          <button style={{ ...actionBtn(), marginTop: 14, marginBottom: 0, color: ruleEditMode ? t.gn : t.ac, border: `1px solid ${ruleEditMode ? t.gn : t.ac}55` }}
            onClick={() => setRuleEditMode(v => !v)}>
            {ruleEditMode ? "✓ 変更を終える" : "✏️ ルールを変更する"}
          </button>

          <button style={{ ...actionBtn("p"), marginTop: 14 }} onClick={() => { setShowRuleCheck(false); setRuleEditMode(false); }}>閉じる</button>

          {/* 途中終了 */}
          <div style={{ marginTop: 6, paddingTop: 14, borderTop: `1px solid ${t.bd}` }}>
            <button
              onClick={() => {
                if (!window.confirm(
                  `${roundWind}${dealerIdx + 1}局の時点で対局を終了します。\nここまでの点数で結果を確認できます。よろしいですか？`
                )) return;
                setShowRuleCheck(false);
                setTmWinStep(null); setTmDrawMode(false);
                setRonPick([]); setRonLoserPick(null); setMultiRon(null);
                setGameFinished(true);
              }}
              style={{ ...actionBtn(), marginBottom: 0, color: t.rd, border: `1px solid ${t.rd}55` }}
            >⏹ この対局を途中で終了する</button>
            <div style={{ fontSize: 10, color: t.dm, marginTop: 7, lineHeight: 1.7, textAlign: "center" }}>
              オーラスを待たずに終わります。結果画面で内容を確認してから記録できます
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 対局開始の演出（数秒で自動的に消えて対局画面へ）
  const StartSplash = () => {
    if (!startSplash) return null;
    const sp = startSplash;
    const d = new Date(sp.date);
    const dateLabel = isNaN(d) ? sp.date
      : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    const close = () => { if (splashTimer.current) clearTimeout(splashTimer.current); setStartSplash(null); };
    return (
      <div onClick={close} style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 300,
        background: "radial-gradient(circle at 50% 38%, #14402b 0%, #0a0f14 62%, #05080b 100%)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}>
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center", animation: "splashIn 0.55s ease-out both" }}>
          <div style={{ fontSize: 30, marginBottom: 10, opacity: 0.9 }}>🀄</div>

          {sp.league ? (
            <>
              <div style={{
                fontSize: 26, fontWeight: 900, color: "#fff", lineHeight: 1.35,
                letterSpacing: "0.04em", textShadow: "0 2px 20px rgba(0,0,0,0.6)",
              }}>{sp.league}</div>
              <div style={{
                height: 2, background: `linear-gradient(90deg, transparent, ${t.gd}, transparent)`,
                margin: "16px auto", width: "78%", animation: "splashLine 0.7s 0.2s ease-out both",
              }} />
              <div style={{ fontSize: 21, fontWeight: 800, color: t.gd, letterSpacing: "0.1em" }}>
                第{sp.gameNo}戦　{MATCH_LABEL(sp.matchType)}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 17, fontWeight: 700, color: "rgba(255,255,255,0.8)", letterSpacing: "0.08em" }}>
                {dateLabel}
              </div>
              <div style={{
                fontSize: 30, fontWeight: 900, color: t.gd, marginTop: 6,
                letterSpacing: "0.14em", textShadow: "0 2px 20px rgba(0,0,0,0.6)",
              }}>{MATCH_LABEL(sp.matchType)}</div>
              <div style={{
                height: 2, background: `linear-gradient(90deg, transparent, ${t.gd}, transparent)`,
                margin: "18px auto", width: "78%", animation: "splashLine 0.7s 0.2s ease-out both",
              }} />
              <div style={{ display: "inline-block", textAlign: "left" }}>
                {sp.seats.map((x, k) => (
                  <div key={k} style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "6px 0",
                    animation: `splashRow 0.45s ${0.35 + k * 0.12}s ease-out both`,
                  }}>
                    <span style={{
                      fontSize: 20, fontWeight: 900, fontFamily: "serif", width: 34, textAlign: "center",
                      color: k === 0 ? "#1a1a1a" : "#fff",
                      background: k === 0 ? t.gd : "rgba(255,255,255,0.1)",
                      border: `1px solid ${k === 0 ? t.gd : "rgba(255,255,255,0.25)"}`,
                      borderRadius: 7, padding: "3px 0",
                    }}>{x.w}</span>
                    <span style={{ fontSize: 21, fontWeight: 800, color: "#fff" }}>{x.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // 起動時のオープニング（タップでスキップ）
  const BootSplash = () => {
    if (!booting) return null;
    const chars = ["卓", "上", "ポ", "ン", "づ", "け"];
    return (
      <div onClick={() => setBooting(false)} style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 400,
        background: "radial-gradient(circle at 50% 42%, #164a32 0%, #0a0f14 60%, #05080b 100%)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        animation: "bootFade 2.6s ease-in forwards",
      }}>
        <div style={{ fontSize: 46, animation: "bootTile 0.75s cubic-bezier(.2,1.4,.4,1) both", lineHeight: 1 }}>🀄</div>

        <div style={{
          marginTop: 14, fontSize: 16, fontWeight: 800, color: t.gd, letterSpacing: "0.22em",
          animation: "bootSub 0.7s 0.3s ease-out both",
        }}>麻雀スコアラー</div>

        <div style={{ display: "flex", gap: 2, marginTop: 8 }}>
          {chars.map((c, i) => (
            <span key={i} style={{
              fontSize: 40, fontWeight: 900, color: "#fff", letterSpacing: "0.02em",
              animation: `bootChar 0.5s ${0.45 + i * 0.11}s cubic-bezier(.2,1.1,.35,1) both, bootGlow 2.2s ${1.2 + i * 0.05}s ease-in-out infinite`,
            }}>{c}</span>
          ))}
        </div>

        <div style={{
          height: 2, width: 210, marginTop: 14,
          background: `linear-gradient(90deg, transparent, ${t.gd}, transparent)`,
          animation: "bootLine 0.7s 1.05s ease-out both",
        }} />

        <div style={{
          marginTop: 22, fontSize: 10, color: "rgba(255,255,255,0.4)",
          animation: "bootSub 0.8s 1.6s ease-out both",
        }}>卓の真ん中に置いて使えます</div>
      </div>
    );
  };

  // 卓上表示: 誰から誰へいくら動くかを、卓の配置＋矢印で見せる
  const PayTableView = () => {
    if (!showPayView || gWinner === null || !gResult) return null;
    const payers = PC - 1;
    const hb = honba * HU();
    const pool = (riichiBets + gRiichi.filter(Boolean).length) * 1000;
    // 支払いの明細（供託は卓上からなので矢印にしない）
    const flows = [];
    if (gTsumo) {
      for (let i = 0; i < PC; i++) {
        if (i === gWinner) continue;
        let amt;
        if (isSanma || gParent) amt = gResult.each;
        else amt = (i === dealerIdx) ? gResult.fromParent : gResult.fromChild;
        flows.push({ from: i, amt: amt + Math.floor(hb / payers) });
      }
    } else if (gLoser !== null) {
      flows.push({ from: gLoser, amt: gResult.total + hb });
    }
    const total = flows.reduce((a, f) => a + f.amt, 0) + pool;

    // 席の配置（卓上モードと同じ: 手前/右/(向かい)/左）
    const slotOf = (i) => (i - seatRot + PC) % PC;
    const POS4 = [
      { x: 50, y: 82, rot: 0 }, { x: 83, y: 50, rot: -90 },
      { x: 50, y: 18, rot: 180 }, { x: 17, y: 50, rot: 90 },
    ];
    const POS3 = [
      { x: 50, y: 82, rot: 0 }, { x: 81, y: 33, rot: -90 }, { x: 19, y: 33, rot: 90 },
    ];
    const posOf = (i) => (PC === 3 ? POS3 : POS4)[slotOf(i)];
    const win = posOf(gWinner);

    return (
      <div onClick={() => setShowPayView(false)} style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.93)", zIndex: 200,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 12,
      }}>
        <div onClick={(e) => e.stopPropagation()} style={{
          position: "relative", width: "min(94vw, 94vh, 560px)", aspectRatio: "1 / 1",
          borderRadius: 18, backgroundImage: `url(${TABLE_IMG})`,
          backgroundSize: "100% 100%", backgroundColor: "#14402b",
          overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        }}>
          {/* 矢印 */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <defs>
              <marker id="payArrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                <path d="M0,0 L5,2.5 L0,5 z" fill={t.gd} />
              </marker>
            </defs>
            {flows.map((f, k) => {
              const p0 = posOf(f.from);
              const dx = win.x - p0.x, dy = win.y - p0.y;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              // 端を少し縮めてパネルに重ならないように
              const x1 = p0.x + (dx / len) * 18, y1 = p0.y + (dy / len) * 18;
              const x2 = win.x - (dx / len) * 20, y2 = win.y - (dy / len) * 20;
              return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={t.gd} strokeWidth="0.7" markerEnd="url(#payArrow)" opacity="0.9" />;
            })}
          </svg>

          {/* 中央: 局とアガリ内容 */}
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            textAlign: "center", padding: "8px 10px", borderRadius: 14,
            background: "rgba(0,0,0,0.55)", border: `1px solid ${t.bd}`,
            width: "38%", boxSizing: "border-box",
          }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>
              {roundWind}{dealerIdx + 1}局{honba > 0 ? ` ${honba}本場` : ""}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
              {gHan >= 13 ? getLimitName(gHan) : gHan >= 5 ? `${gHan}翻` : `${gHan}翻${gFu}符`} / {gTsumo ? "ツモ" : "ロン"}
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: t.gd, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
              +{total.toLocaleString()}
            </div>
            {pool > 0 && (
              <div style={{ fontSize: 10, color: t.ac, fontWeight: 700, lineHeight: 1.5 }}>
                リーチ棒{pool / 1000}本<br />+{pool.toLocaleString()}含む
              </div>
            )}
          </div>

          {/* 各席のパネル */}
          {Array.from({ length: PC }, (_, i) => i).map(i => {
            const pos = posOf(i);
            const isWin = i === gWinner;
            const f = flows.find(x => x.from === i);
            const amt = isWin ? total : (f ? -f.amt : 0);
            return (
              <div key={i} style={{
                position: "absolute", top: `${pos.y}%`, left: `${pos.x}%`,
                transform: `translate(-50%,-50%) rotate(${pos.rot}deg)`,
                textAlign: "center", padding: "8px 10px", borderRadius: 12,
                background: isWin ? "rgba(234,179,8,0.18)" : "rgba(0,0,0,0.5)",
                border: `2px solid ${isWin ? t.gd : amt < 0 ? t.rd : t.bd}`,
                width: "32%", height: "22%", boxSizing: "border-box",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
              }}>
                <div style={{
                  fontSize: Math.max(10, Math.min(15, Math.floor(15 * 5.5 / Math.max(5.5, (players[i] || "").length)))),
                  fontWeight: 800, color: "#fff", lineHeight: 1.2,
                  whiteSpace: "nowrap", maxWidth: "100%",
                }}>{players[i]}{i === dealerIdx ? <span style={{ fontSize: 10, color: t.gd, marginLeft: 3 }}>親</span> : null}</div>
                <div style={{
                  fontSize: 19, fontWeight: 900, fontVariantNumeric: "tabular-nums",
                  color: amt > 0 ? t.gd : amt < 0 ? "#ff8a8a" : "rgba(255,255,255,0.45)",
                }}>
                  {amt > 0 ? "+" : ""}{amt.toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: t.gd, fontWeight: 700, height: 13 }}>{isWin ? "アガリ" : ""}</div>
              </div>
            );
          })}
        </div>

        <button onClick={() => setShowPayView(false)} style={{
          width: "min(94vw, 560px)", marginTop: 12, padding: "15px 8px", borderRadius: 12,
          border: `1px solid ${t.bd}`, background: t.card, color: t.tx, fontSize: 15, fontWeight: 700, cursor: "pointer",
        }}>← 戻る</button>
      </div>
    );
  };

  // 長押し: 現在の順位と点差を、押した人の席の向きで表示（卓上にスマホを置いて全員で見る想定）
  const RankPeekOverlay = () => {
    if (rankPeek === null) return null;
    const pi = rankPeek;
    const rot = (PC === 3 ? [0, -90, 90] : [0, -90, 180, 90])[(pi - seatRot + PC) % PC] ?? 0;
    // 同点は起家に近い席が上位
    const ranked = scores.map((v, i) => ({ i, v })).sort((a, b) => (b.v - a.v) || (a.i - b.i));
    const myRank = ranked.findIndex(r => r.i === pi) + 1;
    // レート換算: いま終局した場合のポイント（ウマ・オカ込み）→ゴールド
    const rate = gameConfig?.rules?.rate || 0;
    const rs = gameConfig?.rules || {};
    let ptOf = null;
    if (rate > 0) {
      const sp = rs.startPoints ?? 25000, rp = rs.returnPoints ?? 30000;
      const uma = (rs.uma && rs.uma.length === PC) ? rs.uma : Array(PC).fill(0);
      const okaPool = (rp - sp) * PC;
      const gosha = (v) => { const sg = v < 0 ? -1 : 1, a = Math.abs(v), f = Math.floor(a); return sg * (a - f > 0.5 ? f + 1 : f); };
      ptOf = {};
      ranked.forEach((r, rank) => {
        ptOf[r.i] = gosha((r.v - rp + (rank === 0 ? okaPool : 0)) / 1000) + (uma[rank] || 0);
      });
    }
    return (
      <div
        onClick={() => setRankPeek(null)}
        style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.88)", zIndex: 150,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
        <div onClick={(e) => e.stopPropagation()} style={{
          ...card, width: "min(86vw, 420px)", margin: 0, padding: 18,
          transform: `rotate(${rot}deg)`,
        }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{players[pi]}</div>
            <div style={{ fontSize: 12, color: t.dm }}>現在 <b style={{ color: t.gd, fontSize: 14 }}>{myRank}位</b> ・ ±はこの人との点差</div>
          </div>

          {ranked.map((r, rank) => {
            const me = r.i === pi;
            const diff = r.v - scores[pi];
            return (
              <div key={r.i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "9px 10px", borderRadius: 10, marginBottom: 5,
                background: me ? t.acS : t.sf,
                border: `1px solid ${me ? t.ac : t.bd}`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: rank === 0 ? t.gd : t.dm, width: 30, flexShrink: 0 }}>{rank + 1}位</span>
                <span style={{
                  fontSize: 12, fontWeight: 800, flexShrink: 0,
                  width: 26, height: 26, lineHeight: "1", padding: 0,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: r.i === dealerIdx ? "#1a1a1a" : t.dm,
                  background: r.i === dealerIdx ? t.gd : t.card,
                  border: `1px solid ${r.i === dealerIdx ? t.gd : t.bd}`,
                  borderRadius: 5, boxSizing: "border-box",
                }}>{SEAT_WINDS[(r.i - dealerIdx + PC) % PC]}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: t.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{players[r.i]}</span>
                {rankPeekGold && ptOf ? (
                  <span style={{ textAlign: "right", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.dm, fontVariantNumeric: "tabular-nums", display: "block" }}>
                      {ptOf[r.i] > 0 ? "+" : ""}{ptOf[r.i]}pt
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: "tabular-nums",
                      color: ptOf[r.i] > 0 ? t.gd : ptOf[r.i] < 0 ? t.rd : t.dm }}>
                      {ptOf[r.i] > 0 ? "+" : ""}{GOLD_LABEL(GOLD(ptOf[r.i], rate))}<span style={{ fontSize: 10, marginLeft: 2, opacity: 0.8 }}>{gameConfig?.rules?.rateUnit || "G"}</span>
                    </span>
                  </span>
                ) : (
                  <>
                    <span style={{ fontSize: 15, fontWeight: 800, color: r.v < 0 ? t.rd : t.tx, fontVariantNumeric: "tabular-nums" }}>{r.v.toLocaleString()}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, width: 66, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums",
                      color: me ? t.dm : diff > 0 ? t.rd : diff < 0 ? t.gn : t.dm }}>
                      {me ? "—" : (diff > 0 ? "+" : "") + diff.toLocaleString()}
                    </span>
                  </>
                )}
              </div>
            );
          })}

          {rate > 0 && (
            <button style={{
              width: "100%", marginTop: 8, padding: "13px 8px", borderRadius: 9, cursor: "pointer",
              border: `1px solid ${rankPeekGold ? t.gd : t.gd + "55"}`,
              background: rankPeekGold ? t.gdS : "transparent",
              color: t.gd, fontSize: 15, fontWeight: 800,
            }} onClick={() => setRankPeekGold(v => !v)}>
              {rankPeekGold ? "点数表示に戻す" : `💰 レート換算を表示（1点 = ${RATE_LABEL(rate)}${gameConfig?.rules?.rateUnit || "G"}）`}
            </button>
          )}
          {rankPeekGold && ptOf && (
            <div style={{ fontSize: 13, color: t.dm, textAlign: "center", marginTop: 6, lineHeight: 1.6 }}>
              いま終局した場合のポイント（ウマ・オカ込み）を{gameConfig?.rules?.rateUnit || "G"}に換算した値です
            </div>
          )}
          <button style={{
            width: "100%", marginTop: 8, padding: "13px 8px", borderRadius: 9, cursor: "pointer",
            border: `1px solid ${t.bd}`, background: "transparent", color: t.ac, fontSize: 15, fontWeight: 700,
          }} onClick={() => { setPlayerDetail(pi); setRankPeek(null); }}>点数の変動履歴を見る</button>

          <button style={{
            width: "100%", marginTop: 8, padding: "14px 8px", borderRadius: 11, cursor: "pointer",
            border: `1px solid ${t.bd}`, background: t.sf, color: t.tx, fontSize: 15, fontWeight: 700,
          }} onClick={() => setRankPeek(null)}>← 戻る</button>
        </div>
      </div>
    );
  };

  const PlayerHistoryModal = () => {
    if (playerDetail === null) return null;
    const pi = playerDetail;
    const log = getPlayerHistory(pi);
    const startPt = gameConfig?.rules?.startPoints || 30000;
    const diff = scores[pi] - startPt;
    return (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.9)", zIndex: 150, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 16px", paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{players[pi]}</div>
                <div style={{ fontSize: 11, color: t.dm }}>点数の変動履歴</div>
              </div>
              <button style={{ background: "none", border: "none", color: t.dm, fontSize: 20, cursor: "pointer" }}
                onClick={() => setPlayerDetail(null)}>✕</button>
            </div>

            {/* 現在の点数 */}
            <div style={{ background: t.sf, borderRadius: 12, padding: 14, marginBottom: 12, textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: scores[pi] < 0 ? t.rd : t.tx, fontVariantNumeric: "tabular-nums" }}>
                {scores[pi].toLocaleString()}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: diff > 0 ? t.gn : diff < 0 ? t.rd : t.dm }}>
                {diff > 0 ? "+" : ""}{diff.toLocaleString()}
              </div>
            </div>

            {/* 履歴 */}
            {log.length === 1 ? (
              <div style={{ textAlign: "center", padding: 20, fontSize: 13, color: t.dm }}>まだ記録がありません</div>
            ) : (
              <div>
                {log.map((row, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 0", borderBottom: i < log.length - 1 ? `1px solid ${t.bd}33` : "none",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.tx }}>{row.label}</div>
                      {row.parts && row.parts.length > 0 && !(row.parts.length === 1 && row.parts[0].label === "—") && (
                        <div style={{ fontSize: 11, marginTop: 3, display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>
                          {row.parts.map((pt, k) => (
                            <span key={k} style={{ color: t.dm, whiteSpace: "nowrap" }}>
                              {pt.label}
                              {pt.amt !== null && (
                                <span style={{
                                  fontWeight: 700, fontVariantNumeric: "tabular-nums",
                                  color: pt.amt < 0 ? t.rd : pt.amt > 0 ? t.gn : t.dm,
                                }}>({pt.amt > 0 ? "+" : ""}{pt.amt.toLocaleString()})</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right", marginLeft: 10 }}>
                      {row.delta !== null && row.delta !== 0 && (
                        <div style={{ fontSize: 14, fontWeight: 800, color: row.delta > 0 ? t.gn : t.rd, fontVariantNumeric: "tabular-nums" }}>
                          {row.delta > 0 ? "+" : ""}{row.delta.toLocaleString()}
                        </div>
                      )}
                      {row.delta === 0 && <div style={{ fontSize: 12, color: t.dm }}>±0</div>}
                      <div style={{ fontSize: 11, color: t.dm, fontVariantNumeric: "tabular-nums" }}>{row.total.toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button style={{ ...actionBtn(), marginTop: 12 }} onClick={() => setPlayerDetail(null)}>閉じる</button>
          </div>
        </div>
      </div>
    );
  };

  const deleteRound = useCallback((idx) => {
    const cfg = gameConfig || {};
    const sp = cfg.rules?.startPoints || 30000;
    let newScores = Array(PC).fill(sp);
    const newRounds = rounds.filter((_, i) => i !== idx);
    const payers = PC - 1;
    newRounds.forEach(r => {
      if (r.draw) {
        const tc = r.tenpai ? r.tenpai.slice(0, PC).filter(Boolean).length : 0;
        const nc = PC - tc;
        if (tc > 0 && tc < PC) {
          const np = Math.floor(3000 / nc), tg = Math.floor(3000 / tc);
          for (let i = 0; i < PC; i++) { if (r.tenpai[i]) newScores[i] += tg; else newScores[i] -= np; }
        }
      } else {
        const result = calcScore(r.han >= 5 ? 30 : (r.fu || 30), r.han, r.winner === r.dealer, r.tsumo, gameConfig?.rules?.kiriage, PC);
        const rc = r.riichi ? r.riichi.filter(Boolean).length : 0;
        if (r.riichi) { for (let i = 0; i < PC; i++) { if (r.riichi[i]) newScores[i] -= 1000; } }
        const hb = r.honba * HU();
        if (r.tsumo) {
          if (isSanma || r.winner === r.dealer) { for (let i = 0; i < PC; i++) { if (i === r.winner) newScores[i] += result.each * payers + hb + rc * 1000; else newScores[i] -= result.each + Math.floor(hb / payers); } }
          else { for (let i = 0; i < PC; i++) { if (i === r.winner) newScores[i] += result.total + hb + rc * 1000; else if (i === r.dealer) newScores[i] -= result.fromParent + Math.floor(hb / payers); else newScores[i] -= result.fromChild + Math.floor(hb / payers); } }
        } else { newScores[r.winner] += result.total + hb + rc * 1000; newScores[r.loser] -= result.total + hb; }
      }
    });
    setRounds(newRounds); setScores(newScores); setEditingRoundIdx(null);
  }, [rounds, gameConfig]);
  // ── タイトル画面（アプリを開いて最初に出るページ） ──
  const renderTitle = () => {
    const resumeGame = () => {
      setGameConfig(suspendedGame.config);
      setPlayerCount(suspendedGame.config.playerCount || 4);
      setPlayers(suspendedGame.players);
      setScores(suspendedGame.scores);
      setRounds(suspendedGame.rounds);
      setDealerIdx(suspendedGame.dealerIdx);
      setRoundWind(suspendedGame.roundWind);
      setHonba(suspendedGame.honba);
      setRiichiBets(suspendedGame.riichiBets);
      setGameStarted(true); setGameFinished(false);
      setTableMode(true);
      setView("game");
    };
    const startPlay = () => {
      setActiveLeagueId(null);
      setView("game"); setGameStarted(false); setGameFinished(false); setSetupStep(3);
    };
    const subBtn = (icon, label, sub, onClick) => (
      <button onClick={onClick} style={{
        flex: 1, minWidth: 0, padding: "13px 6px", borderRadius: 13, cursor: "pointer",
        border: `1px solid ${t.bd}`, background: t.card, color: t.tx,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
      }}>
        <span style={{ fontSize: 19, lineHeight: 1 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontSize: 9, color: t.dm, whiteSpace: "nowrap" }}>{sub}</span>
      </button>
    );
    return (
      <div style={{ ...body, minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: 8 }}>
        {/* ロゴ */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 40, lineHeight: 1, animation: "bootTile 0.7s cubic-bezier(.2,1.4,.4,1) both" }}>🀄</div>
          <div style={{
            fontSize: 16, fontWeight: 800, color: t.gd, letterSpacing: "0.22em", marginTop: 12,
            animation: "bootSub 0.6s 0.15s ease-out both",
          }}>麻雀スコアラー</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 6 }}>
            {["卓", "上", "ポ", "ン", "づ", "け"].map((c, i) => (
              <span key={i} style={{
                fontSize: 34, fontWeight: 900, color: "#fff", lineHeight: 1.2,
                animation: `bootChar 0.45s ${0.2 + i * 0.08}s cubic-bezier(.2,1.1,.35,1) both`,
                textShadow: "0 0 22px rgba(234,179,8,0.28), 0 3px 12px rgba(0,0,0,0.6)",
              }}>{c}</span>
            ))}
          </div>
          <div style={{
            height: 2, width: 200, margin: "12px auto 9px",
            background: `linear-gradient(90deg, transparent, ${t.gd}, transparent)`,
            animation: "bootLine 0.6s 0.6s ease-out both",
          }} />
          <div style={{ fontSize: 10, color: t.dm, marginTop: 2 }}>卓の真ん中に置いて使えます</div>
        </div>

        {/* 保留中があれば最優先で出す */}
        {suspendedGame && (
          <button onClick={resumeGame} style={{
            width: "100%", padding: "14px 12px", borderRadius: 14, cursor: "pointer", marginBottom: 10,
            border: `2px solid ${t.gd}`, background: t.gdS, color: t.tx, textAlign: "left",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>⏸</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: t.gd }}>保留中の対局を再開</div>
              <div style={{ fontSize: 10, color: t.dm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {suspendedGame.config.date} {MATCH_LABEL_SHORT(suspendedGame.config.matchType)} — {suspendedGame.players.join("・")}
              </div>
            </span>
            <span style={{ color: t.gd, fontSize: 18 }}>›</span>
          </button>
        )}

        {/* メイン */}
        <button onClick={startPlay} style={{
          width: "100%", padding: "20px 12px", borderRadius: 16, cursor: "pointer", marginBottom: 12,
          border: "none", background: t.ac, color: "#fff",
          boxShadow: "0 8px 24px rgba(91,155,255,0.28)",
        }}>
          <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: "0.05em" }}>対局をはじめる</div>
          <div style={{ fontSize: 11, opacity: 0.9, marginTop: 3 }}>東風戦・半荘戦・全荘戦 / 四人・三人麻雀</div>
        </button>

        {/* サブメニュー */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {subBtn("🏆", "リーグ戦", "通算で競う", () => setView("league"))}
          {subBtn("🔢", "1局戦", "点数計算", () => { resetCalc(); setView("calc"); })}
          {subBtn("📋", "履歴", `${gameHistory.length}件`, () => { setActiveLeagueId(null); setView("history"); })}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {subBtn("🎓", "練習問題", "点数・役・符", () => { setView("home"); setHomeCat("practice"); })}
          {subBtn("🎴", "始め方", "図解で解説", () => { setView("startguide"); setGuideStep(0); })}
          {subBtn("⚙️", "設定", "ルール初期値", () => {
            setDraftRules({ ...defaultRules }); setRulesSaved(false); setView("home"); setHomeCat("settings");
          })}
        </div>

        <button onClick={() => { setHomeCat(null); setView("home"); }} style={{
          width: "100%", marginTop: 14, padding: "11px 8px", borderRadius: 11, cursor: "pointer",
          border: `1px solid ${t.bd}`, background: "transparent", color: t.dm, fontSize: 12, fontWeight: 700,
        }}>すべてのメニュー</button>
      </div>
    );
  };

  const renderHome = () => {
    const menuItem = (icon, label, sub, onClick, highlight) => (
      <button
        onClick={onClick}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 15,
          padding: "18px 18px", background: highlight ? t.gdS : t.card,
          border: `1px solid ${highlight ? t.gd + "55" : t.bd}`,
          borderRadius: 14, cursor: "pointer", marginBottom: 12, textAlign: "left", lineHeight: 1.6,
        }}
      >
        <span style={{
          fontSize: 22, width: 44, height: 44, borderRadius: 12,
          background: highlight ? t.gd + "22" : t.acS,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 16, fontWeight: 700, color: t.tx }}>{label}</span>
          {sub && <span style={{ display: "block", fontSize: 12, color: t.dm, marginTop: 2 }}>{sub}</span>}
        </span>
        <span style={{ color: t.dm, fontSize: 18 }}>›</span>
      </button>
    );

    // ── トップ: 3カテゴリ ──
    if (homeCat === null) {
      return (
        <div style={body}>
          <div style={{ textAlign: "center", padding: "18px 0 20px" }}>
            <p style={{ fontSize: 13, color: t.gd, margin: "0 0 3px", letterSpacing: "0.2em", fontWeight: 800 }}>麻雀スコアラー</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <span style={{ fontSize: 24, animation: "titlePop 0.45s cubic-bezier(.2,1.3,.4,1) both" }}>🀄</span>
              {["卓", "上", "ポ", "ン", "づ", "け"].map((c, i) => (
                <span key={i} style={{
                  fontSize: 26, fontWeight: 900, lineHeight: 1.2, color: t.tx,
                  animation: `titlePop 0.42s ${0.08 + i * 0.08}s cubic-bezier(.2,1.3,.4,1) both`,
                }}>{c}</span>
              ))}
            </div>
            <div style={{
              height: 2, width: 170, margin: "10px auto 8px",
              background: `linear-gradient(90deg, transparent, ${t.gd}, transparent)`,
              animation: "bootLine 0.6s 0.45s ease-out both",
            }} />
            <p style={{ fontSize: 11, color: t.dm, margin: "3px 0 0" }}>かんたん点数計算 &amp; 対局管理</p>
          </div>

          {suspendedGame && menuItem("⏸", "保留中の対局を再開",
            `${suspendedGame.config.date} ${MATCH_LABEL_SHORT(suspendedGame.config.matchType)} — ${suspendedGame.players.join("・")}`,
            () => {
              setGameConfig(suspendedGame.config);
              setPlayerCount(suspendedGame.config.playerCount || 4);
              setPlayers(suspendedGame.players);
              setScores(suspendedGame.scores);
              setRounds(suspendedGame.rounds);
              setDealerIdx(suspendedGame.dealerIdx);
              setRoundWind(suspendedGame.roundWind);
              setHonba(suspendedGame.honba);
              setRiichiBets(suspendedGame.riichiBets);
              setGameStarted(true); setGameFinished(false);
              setTableMode(true);
              setView("game");
            }, true)}

          {menuItem("▶", "対局", suspendedGame ? "※ 保留中の対局があります" : "対局の開始・1局戦・履歴", () => setHomeCat("play"))}
          {menuItem("🎓", "練習問題", "点数計算・役・符を学ぶ", () => setHomeCat("practice"))}
          {menuItem("🎴", "麻雀の始め方", "席決め・配牌を図解で解説", () => {
            setView("startguide"); setGuideStep(0);
          })}
          {menuItem("⚙️", "設定", "プレイヤー名・ルールの初期値", () => {
            setDraftRules({ ...defaultRules }); setRulesSaved(false); setHomeCat("settings");
          })}

          <button onClick={() => setView("title")} style={{
            width: "100%", marginTop: 14, padding: "11px 8px", borderRadius: 11, cursor: "pointer",
            border: `1px solid ${t.bd}`, background: "transparent", color: t.dm, fontSize: 12, fontWeight: 700,
          }}>← タイトルへ</button>
        </div>
      );
    }

    const CATS = {
      play: { title: "対局", icon: "▶" },
      practice: { title: "練習問題", icon: "🎓" },
      settings: { title: "設定", icon: "⚙️" },
    };
    const cat = CATS[homeCat];

    return (
      <div style={body}>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 16 }}>{cat.icon} {cat.title}</div>

        {homeCat === "play" && (
          <>
            {menuItem("▶", "東風戦・半荘戦・全荘戦", "1回きりの対局。成績は履歴に残ります", () => {
              setView("game"); setGameStarted(false); setGameFinished(false); setSetupStep(3);
              setActiveLeagueId(null); setReviewing(false); setShowScoreFix(false);
              // 対局日は自動で今日にする
              {
                const d = new Date();
                setGameDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
              }
              setPlayerMode([false, false, false, false]);
              setPlayers(["Aプレーヤー", "Bプレーヤー", "Cプレーヤー", "Dプレーヤー"]);
              setTableMode(true);
            })}
            {menuItem("🏆", "リーグ戦", "複数の対局を通して順位を争う", () => { setView("league"); })}
            {menuItem("🔢", "1局戦", "翻・符から点数をすぐ計算", () => {
              setView("calc"); setCalcStep(0); setCTsumo(null); setCParent(null); setCHan(null); setCFu(null); resetFuGuide();
            })}
            {menuItem("📋", "対局履歴", `${gameHistory.length}件の記録`, () => {
              setView("history"); setHistoryDetail(null);
            })}
          </>
        )}

        {homeCat === "practice" && (
          <>
            {menuItem("📚", "用語問題集", "麻雀用語を漢字と読みで覚える", () => {
              setView("termquiz"); setTermCat(null); setTermFinished(false);
            })}
            {menuItem("📖", "役一覧", "全ての役の解説と翻数", () => {
              setView("dict"); setDictCat("1翻"); setDictExpanded(null);
            })}
            {menuItem("🎯", "翻数・役名テスト", "役の翻数クイズ・役名テスト", () => {
              setView("quiz"); setQuizMode(null);
            })}
            {menuItem("📐", "符計算講座", "レベル別に符を学ぶ", () => {
              setView("fucourse"); setFuLessonPhase("menu");
            })}
            {menuItem("🔢", "点数問題集", "4翻以下の点数を当てる（選択・入力）", () => {
              setView("scorequiz"); setSqMode(null); setSqQ(null);
            })}
            {menuItem("📊", "点数早見表", "符×翻のマトリックス表", () => setView("table"))}
          </>
        )}

        {homeCat === "settings" && (
          <>
            {secHdr("players", "👤", "プレーヤー名・グループ設定", `${presetNames.length}人を登録中・グループ${groups.length}件`)}
            {setOpen === "players" && (<>
            {menuItem("👤", "プレイヤー名の登録", `${presetNames.length}人を登録中`, () => {
              setView("names"); setNewNameInput(""); setEditNameIdx(null);
            })}

            {/* グループ */}
            <div style={{ ...card, padding: 16, marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{
                  fontSize: 20, width: 40, height: 40, borderRadius: 11, background: t.acS,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>👥</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.tx }}>グループ</div>
                  <div style={{ fontSize: 11, color: t.dm }}>よく打つ4人の組み合わせ</div>
                </div>
              </div>
              {groups.length === 0 && !gEditOpen && (
                <div style={{ fontSize: 12, color: t.dm, lineHeight: 1.8, marginBottom: 12 }}>
                  まだ登録がありません。下のボタンか、対局を始めるときの「参加者は？」の画面から作れます。
                </div>
              )}
              {groups.map(g => (
                <div key={g.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                  padding: "11px 0", borderBottom: `1px solid ${t.bd}33`,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: t.tx }}>{g.name}</div>
                    <div style={{
                      fontSize: 11, color: t.dm, marginTop: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{g.members.join("、")}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => {
                      setGEditId(g.id); setGEditName(g.name); setGEditMembers([...g.members]); setGEditOpen(true);
                    }} style={{
                      background: "none", border: `1px solid ${t.bd}`, borderRadius: 8,
                      padding: "6px 11px", color: t.ac, fontSize: 11, cursor: "pointer",
                    }}>編集</button>
                    <button onClick={() => {
                      if (!window.confirm(`グループ「${g.name}」を削除しますか？`)) return;
                      saveGroups(groups.filter(x => x.id !== g.id));
                    }} style={{
                      background: "none", border: `1px solid ${t.bd}`, borderRadius: 8,
                      padding: "6px 11px", color: t.rd, fontSize: 11, cursor: "pointer",
                    }}>削除</button>
                  </div>
                </div>
              ))}

              {gEditOpen ? (
                <div style={{ marginTop: 14, padding: 14, borderRadius: 11, background: t.sf, border: `1px solid ${t.ac}44` }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: t.ac, marginBottom: 10 }}>
                    {gEditId ? "グループを編集" : "新しいグループ"}
                  </div>

                  <div style={{ fontSize: 11, color: t.dm, marginBottom: 5 }}>グループ名</div>
                  <input type="text" value={gEditName} onChange={e => setGEditName(e.target.value)}
                    placeholder="例: 金曜メンバー"
                    style={{ ...inputStyle, fontSize: 15, marginBottom: 12 }} />

                  <div style={{ fontSize: 11, color: t.dm, marginBottom: 3 }}>
                    メンバーを4人選ぶ（{gEditMembers.length}/4）
                  </div>
                  <div style={{ fontSize: 10, color: t.dm, marginBottom: 7, lineHeight: 1.7 }}>
                    ここに出るのは「プレイヤー名の登録」に入っている名前です。
                    いない人は先に登録してください
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 12 }}>
                    {presetNames.map(nm => {
                      const on = gEditMembers.includes(nm);
                      const full = gEditMembers.length >= 4 && !on;
                      return (
                        <button key={nm} onClick={() => setGEditMembers(
                          on ? gEditMembers.filter(x => x !== nm) : (full ? gEditMembers : [...gEditMembers, nm])
                        )} style={{
                          padding: "11px 6px", borderRadius: 9, cursor: full ? "default" : "pointer",
                          border: `2px solid ${on ? t.ac : t.bd}`,
                          background: on ? t.acS : "transparent",
                          color: on ? t.ac : t.tx, fontSize: 13, fontWeight: 700, opacity: full ? 0.4 : 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{on ? "✓ " : ""}{nm}</button>
                      );
                    })}
                  </div>
                  {presetNames.length < 4 && (
                    <div style={{
                      padding: "11px 12px", marginBottom: 11, borderRadius: 9,
                      background: t.rdS, border: `1px solid ${t.rd}55`,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: t.rd, marginBottom: 4 }}>
                        名前の登録が足りません
                      </div>
                      <div style={{ fontSize: 11, color: t.tx, lineHeight: 1.8, marginBottom: 9 }}>
                        グループには4人必要ですが、登録されている名前は{presetNames.length}人ぶんです。
                        先にプレイヤー名を登録してください。
                      </div>
                      <button onClick={() => {
                        setGEditOpen(false); setGEditId(null); setGEditName(""); setGEditMembers([]);
                        setView("names"); setNewNameInput(""); setEditNameIdx(null);
                      }} style={{
                        width: "100%", padding: "10px 8px", borderRadius: 9, cursor: "pointer",
                        border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 700,
                      }}>👤 プレイヤー名の登録へ</button>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      disabled={!gEditName.trim() || gEditMembers.length !== 4}
                      onClick={() => {
                        const entry = { name: gEditName.trim(), members: [...gEditMembers] };
                        if (gEditId) saveGroups(groups.map(x => x.id === gEditId ? { ...x, ...entry } : x));
                        else saveGroups([...groups, { id: "g_" + Date.now(), ...entry }]);
                        setGEditOpen(false); setGEditId(null); setGEditName(""); setGEditMembers([]);
                      }}
                      style={{
                        flex: 1, padding: "12px 8px", borderRadius: 10, border: "none", cursor: "pointer",
                        background: t.ac, color: "#fff", fontSize: 14, fontWeight: 800,
                        opacity: (gEditName.trim() && gEditMembers.length === 4) ? 1 : 0.4,
                      }}>{gEditId ? "更新する" : "保存する"}</button>
                    <button onClick={() => { setGEditOpen(false); setGEditId(null); setGEditName(""); setGEditMembers([]); }}
                      style={{
                        padding: "12px 16px", borderRadius: 10, cursor: "pointer",
                        border: `1px solid ${t.bd}`, background: "transparent", color: t.dm, fontSize: 13,
                      }}>やめる</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setGEditId(null); setGEditName(""); setGEditMembers([]); setGEditOpen(true); }}
                  style={{
                    width: "100%", marginTop: 14, padding: "12px 8px", borderRadius: 10, cursor: "pointer",
                    border: `1px dashed ${t.ac}77`, background: "transparent", color: t.ac,
                    fontSize: 13, fontWeight: 700,
                  }}>＋ グループを作る</button>
              )}
            </div>
            </>)}

            {secHdr("rules", "📏", "ルール設定", "連荘・複数ロン・食いタンなどの初期値")}
            {setOpen === "rules" && (<>
            {/* ルールのデフォルト */}
            <div style={{ ...card, padding: 16, marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{
                  fontSize: 20, width: 40, height: 40, borderRadius: 11, background: t.acS,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>📏</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.tx }}>ルールの初期値</div>
                  <div style={{ fontSize: 11, color: t.dm }}>新しい対局を始める時の初期設定</div>
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: t.dm, marginBottom: 6 }}>流局したときの親</div>
              {[
                { key: "agari",  label: "あがり連荘",   desc: "流局したら親は必ず流れる" },
                { key: "tenpai", label: "テンパイ連荘", desc: "親がテンパイなら続行" },
                { key: "always", label: "無条件連荘",   desc: "流局しても親は続行" },
              ].map(o => {
                const cur = draftRules.agariRenchan ? "agari" : draftRules.tenpaiRenchan ? "tenpai" : "always";
                const on = cur === o.key;
                return (
                  <button key={o.key} onClick={() => editDraft({
                    agariRenchan: o.key === "agari",
                    tenpaiRenchan: o.key === "tenpai",
                  })} style={{
                    width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: 9,
                    padding: "10px 11px", marginBottom: 6, borderRadius: 10, cursor: "pointer",
                    border: `2px solid ${on ? t.ac : t.bd}`,
                    background: on ? t.acS : "transparent",
                  }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      border: `2px solid ${on ? t.ac : t.bd}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {on && <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.ac }} />}
                    </span>
                    <span>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: on ? t.ac : t.tx }}>{o.label}</span>
                      <span style={{ display: "block", fontSize: 10, color: t.dm, marginTop: 2 }}>{o.desc}</span>
                    </span>
                  </button>
                );
              })}

              <div style={{ fontSize: 11, fontWeight: 700, color: t.dm, margin: "10px 0 6px" }}>複数人が同時にロン</div>
              {[
                { key: "atamahane", label: "頭ハネ", desc: "アガれるのは1人だけ" },
                { key: "double",    label: "ダブロンあり", desc: "2人まで同時にアガリ" },
                { key: "triple",    label: "トリプルロンあり", desc: "3人同時も認める" },
              ].map(o => {
                const on = (draftRules.multiRon || "atamahane") === o.key;
                return (
                  <button key={o.key} onClick={() => editDraft({ multiRon: o.key })} style={{
                    width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: 9,
                    padding: "10px 11px", marginBottom: 6, borderRadius: 10, cursor: "pointer",
                    border: `2px solid ${on ? t.ac : t.bd}`,
                    background: on ? t.acS : "transparent",
                  }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      border: `2px solid ${on ? t.ac : t.bd}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {on && <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.ac }} />}
                    </span>
                    <span>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: on ? t.ac : t.tx }}>{o.label}</span>
                      <span style={{ display: "block", fontSize: 10, color: t.dm, marginTop: 2 }}>{o.desc}</span>
                    </span>
                  </button>
                );
              })}

              {[
                ["kuitan", "食いタンあり", "鳴いたタンヤオを認めるか。OFFだと鳴くと役なしになる場面が増えます"],
                ["atozuke", "後付けあり", "役が未確定のまま鳴き、あとから役を確定させてよいか。OFFは完全先付け"],
                ["kiriage", "切り上げ満貫", "4翻30符・3翻60符を満貫扱い"],
                ["doubleYakuman", "ダブル役満あり", "役満の複合（大三元＋字一色など）を2倍・3倍で計算"],
                ["orasYame", "オーラスは親トップで終了", "アガリやめ・テンパイやめ"],
                ["tobiEnd", "トビで終了", "誰かの持ち点が0未満になった時点で終局"],
              ].map(([key, label, hint]) => (
                <div key={key} style={{ padding: "10px 0", borderBottom: `1px solid ${t.bd}33` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, color: t.tx }}>{label}</span>
                    <button onClick={() => editDraft({ [key]: !draftRules[key] })} style={{
                      width: 48, height: 28, borderRadius: 14, border: "none", padding: 0, cursor: "pointer",
                      background: draftRules[key] ? t.ac : t.bd, position: "relative", transition: "background 0.15s", flexShrink: 0,
                    }}>
                      <span style={{
                        position: "absolute", top: 3, left: draftRules[key] ? 23 : 3,
                        width: 22, height: 22, borderRadius: "50%", background: "#fff",
                        transition: "left 0.15s",
                      }} />
                    </button>
                  </div>
                  {hint && <div style={{ fontSize: 10, color: t.dm, marginTop: 3 }}>{hint}</div>}
                </div>
              ))}

              <RuleHelp />

            </div>
            </>)}

            {secHdr("uma", "🏅", "ウマ・オカ設定", "順位点・持ち点・返し点")}
            {setOpen === "uma" && (
              <div style={{ ...card, padding: 16, marginTop: 4 }}>
                <UmaOkaSettings rules={draftRules} onChange={editDraft} compact />
              </div>
            )}

            {secHdr("rate", "💰", "レート設定", draftRules.rate ? `1点 = ${RATE_LABEL(draftRules.rate)} ${draftRules.rateUnit || "G"}` : "レート計算なし")}
            {setOpen === "rate" && (
              <div style={{ ...card, padding: 16, marginTop: 4 }}>
                <RateSetting rate={draftRules.rate || 0} onChange={(v) => editDraft({ rate: v })}
                  unit={draftRules.rateUnit} onUnitChange={(u) => editDraft({ rateUnit: u })} />
              </div>
            )}

            {secHdr("dice", "🎲", "サイコロ設定", "表示時間と効果音")}
            {setOpen === "dice" && (<>
            {/* サイコロ設定 */}
            <div style={{ ...card, padding: 16, marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{
                  fontSize: 20, width: 40, height: 40, borderRadius: 11, background: t.acS,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>🎲</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.tx }}>サイコロ</div>
                  <div style={{ fontSize: 11, color: t.dm }}>結果を表示しておく時間</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[3, 5, 8, 10].map(v => (
                  <button key={v} onClick={() => saveDiceHold(v)} style={{
                    flex: 1, padding: "12px 4px", borderRadius: 10, cursor: "pointer",
                    border: `2px solid ${diceHoldSec === v ? t.ac : t.bd}`,
                    background: diceHoldSec === v ? t.acS : "transparent",
                    color: diceHoldSec === v ? t.ac : t.tx, fontSize: 13, fontWeight: 700,
                  }}>{v}秒</button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: t.dm, marginTop: 8 }}>
                振った後、自動で消えるまでの時間です
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.bd}33` }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.tx }}>🔊 転がる効果音</div>
                  <div style={{ fontSize: 10, color: t.dm, marginTop: 2 }}>振ったときにカラカラ…と鳴ります</div>
                </div>
                <button onClick={() => saveDiceSound(!diceSoundOn)} style={{
                  width: 48, height: 28, borderRadius: 14, border: "none", padding: 0, cursor: "pointer",
                  background: diceSoundOn ? t.ac : t.bd, position: "relative", transition: "background 0.15s", flexShrink: 0,
                }}>
                  <span style={{ position: "absolute", top: 3, left: diceSoundOn ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
                </button>
              </div>
            </div>
            </>)}

            {secHdr("screen", "💡", "画面設定", "対局中のスリープ防止")}
            {setOpen === "screen" && (<>
            {/* 画面スリープ防止 */}
            <div style={{ ...card, padding: 16, marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{
                  fontSize: 20, width: 40, height: 40, borderRadius: 11, background: t.acS,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>💡</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.tx }}>画面をスリープさせない</div>
                  <div style={{ fontSize: 11, color: t.dm }}>対局中に画面が暗くなるのを防ぎます</div>
                </div>
              </div>
              {wakeSupported ? (
                <>
                  {toggleRow("スリープ防止を有効にする", keepAwake, () => saveKeepAwake(!keepAwake))}
                  <div style={{ fontSize: 10, color: keepAwake && wakeActive ? t.gn : t.dm, marginTop: 8 }}>
                    {keepAwake
                      ? (wakeActive ? "● 動作中 — このアプリを開いている間は画面が消えません" : "他のアプリに切り替えると一時停止し、戻ると再開します")
                      : "iPhone本体の「設定 → 画面表示と明るさ → 自動ロック」に従います"}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: t.dm, lineHeight: 1.7 }}>
                  お使いのブラウザはこの機能に対応していません（iOSはSafari 16.4以降で対応）。
                  <br />
                  本体の「設定 → 画面表示と明るさ → 自動ロック → なし」で切り替えてください。
                </div>
              )}
            </div>
            </>)}

            {/* ルール類の保存（変更があるときだけ表示） */}
            {(rulesDirty || rulesSaved) && (
              <div style={{ ...card, padding: 14, marginTop: 8 }}>
                <button
                  onClick={commitDraftRules}
                  disabled={!rulesDirty}
                  style={{
                    width: "100%", padding: "14px 8px", borderRadius: 11, border: "none",
                    background: rulesSaved ? t.gn : rulesDirty ? t.ac : t.bd,
                    color: rulesDirty || rulesSaved ? "#fff" : t.dm,
                    fontSize: 15, fontWeight: 800,
                    cursor: rulesDirty ? "pointer" : "default",
                    transition: "background 0.2s",
                  }}
                >{rulesSaved ? "✓ 保存しました" : rulesDirty ? "変更を確定して保存" : "変更はありません"}</button>
                {rulesDirty && (
                  <button
                    onClick={() => { setDraftRules({ ...defaultRules }); setRulesSaved(false); }}
                    style={{ ...actionBtn(), marginTop: 8, marginBottom: 0, fontSize: 12, color: t.dm }}
                  >変更を取り消す</button>
                )}
              </div>
            )}
            <button style={{ ...actionBtn(), marginTop: 8, fontSize: 12, color: t.dm }}
              onClick={() => { setDraftRules({ ...FACTORY_RULES }); setRulesSaved(false); }}>ルールを初期状態に戻す</button>
          </>
        )}

        {/* 画面下に固定の戻り口（スクロール中もいつでも押せる） */}
        {homeCat && (
          <div style={{
            position: "sticky", bottom: 0, zIndex: 20,
            marginTop: 18, marginLeft: -8, marginRight: -8,
            padding: "10px 8px calc(10px + env(safe-area-inset-bottom))",
            background: `linear-gradient(to top, ${t.bg} 65%, transparent)`,
          }}>
            <button
              onClick={() => { setHomeCat(null); try { window.scrollTo(0, 0); } catch {} }}
              style={{
                width: "100%", padding: "15px 8px", borderRadius: 12,
                border: `1px solid ${t.bd}`, background: t.card, color: t.tx,
                fontSize: 15, fontWeight: 700, cursor: "pointer",
                boxShadow: "0 -4px 16px rgba(0,0,0,0.35)",
              }}
            >← メニューに戻る</button>
          </div>
        )}
      </div>
    );
  };


  // ══════════════════════════════════
  // ── リーグ戦 画面 ──
  // ══════════════════════════════════

  // 一覧
  const renderLeagueList = () => {
    const active = leagues.filter(l => l.status === "active");
    const done = leagues.filter(l => l.status !== "active");
    const cardFor = (lg) => {
      const pr = leagueProgress(lg);
      const st = leagueStandings(lg);
      const leader = st.find(r => r.games > 0);
      return (
        <button key={lg.id} onClick={() => { setLeagueId(lg.id); setLeagueTab("stand"); setView("leaguedetail"); }}
          style={{
            width: "100%", textAlign: "left", padding: 16, marginBottom: 10, borderRadius: 13,
            border: `1px solid ${lg.status === "active" ? t.ac + "77" : t.bd}`,
            background: lg.status === "active" ? t.acS : t.card, cursor: "pointer",
          }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: t.tx }}>{lg.name}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 6, flexShrink: 0,
              background: lg.status === "active" ? t.gnS : t.sf,
              color: lg.status === "active" ? t.gn : t.dm,
              border: `1px solid ${lg.status === "active" ? t.gn : t.bd}55`,
            }}>{lg.status === "active" ? "開催中" : "終了"}</span>
          </div>
          <div style={{ fontSize: 11, color: t.dm, marginTop: 5 }}>
            {lg.members.length}人 ・ {pr.played}回
            {lg.mode === "count" ? ` / 全${lg.targetCount}回` : ` ・ 〜${lg.endDate}`}
          </div>
          {leader && (
            <div style={{ fontSize: 12, color: t.gd, marginTop: 6, fontWeight: 700 }}>
              首位 {leader.name}　{leader.pt > 0 ? "+" : ""}{leader.pt}pt
            </div>
          )}
        </button>
      );
    };
    return (
      <div style={body}>
        <button style={backBtn} onClick={() => setView("home")}>← 戻る</button>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>🏆 リーグ戦</div>
        <div style={{ fontSize: 12, color: t.dm, marginBottom: 16 }}>
          同じメンバーで何回か対局し、通算成績を記録します
        </div>

        <button onClick={() => { setLgDraft(newLeagueDraft()); setView("leagueform"); }} style={{
          width: "100%", padding: "16px", marginBottom: 18, borderRadius: 13, cursor: "pointer",
          border: `2px solid ${t.ac}`, background: t.acS,
          fontSize: 16, fontWeight: 800, color: t.ac,
        }}>＋ 新しいリーグ戦を作る</button>

        {active.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 8 }}>開催中</div>
            {active.map(cardFor)}
          </>
        )}
        {done.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, margin: "16px 0 8px" }}>終了したリーグ</div>
            {done.map(cardFor)}
          </>
        )}
        {leagues.length === 0 && (
          <div style={{ ...card, padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: t.dm, lineHeight: 1.9 }}>
              まだリーグ戦がありません。<br />
              名前・メンバー・回数・ウマを決めて始めましょう。
            </div>
          </div>
        )}

        <button style={{ ...actionBtn(), marginTop: 16 }} onClick={() => setView("home")}>メニューに戻る</button>
      </div>
    );
  };

  // 作成 / 編集
  const renderLeagueForm = () => {
    if (!lgDraft) return <div style={body} />;
    const d = lgDraft;
    const set = (patch) => setLgDraft({ ...d, ...patch });
    const toggleMember = (nm) => {
      const has = d.members.includes(nm);
      if (has) set({ members: d.members.filter(x => x !== nm) });
      else set({ members: [...d.members, nm] });
    };
    const lgPC = d.playerCount || 4;
    const canSave = d.name.trim() && d.members.length >= lgPC;

    return (
      <div style={body}>
        <button style={backBtn} onClick={() => setView("league")}>← 戻る</button>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>
          {leagues.some(l => l.id === d.id) ? "リーグ戦の設定" : "新しいリーグ戦"}
        </div>

        {/* 人数 */}
        <div style={{ ...card, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>人数</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[[4, "四人麻雀", "東南西北"], [3, "三人麻雀", "東南西"]].map(([n, lb, sub]) => (
              <button key={n} onClick={() => {
                if (n === lgPC) return;
                // 人数の既定ルール・ウマに切り替える
                if (n === 3) set({ playerCount: 3, rules: { ...d.rules, ...SANMA_DEFAULT_RULES }, umaKey: "renmei3", uma: [10, 0, -10] });
                else set({ playerCount: 4, rules: { ...defaultRules }, umaKey: "10-20", uma: [20, 10, -10, -20] });
              }} style={{
                flex: 1, padding: "13px 6px", borderRadius: 11, cursor: "pointer",
                border: `2px solid ${lgPC === n ? t.ac : t.bd}`,
                background: lgPC === n ? t.acS : "transparent",
                color: lgPC === n ? t.ac : t.dm,
              }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{lb}</div>
                <div style={{ fontSize: 10, marginTop: 3, opacity: 0.85 }}>{sub}</div>
              </button>
            ))}
          </div>
          {leagues.some(l => l.id === d.id) && (
            <div style={{ fontSize: 10, color: t.dm, marginTop: 8, lineHeight: 1.6 }}>
              対局が記録された後の人数変更は、集計が混ざるためおすすめしません
            </div>
          )}
        </div>

        {/* 名前 */}
        <div style={{ ...card, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            1. リーグ名 <span style={{ fontSize: 11, color: t.rd, fontWeight: 700 }}>必須</span>
          </div>
          <input type="text" value={d.name} onChange={e => set({ name: e.target.value })}
            placeholder="例: 2026年夏リーグ"
            style={{
              ...inputStyle, fontSize: 16, padding: "13px 12px",
              border: `1px solid ${d.name.trim() ? t.bd : t.rd + "88"}`,
            }} />
          {!d.name.trim() && (
            <div style={{ fontSize: 11, color: t.rd, marginTop: 7, fontWeight: 700 }}>
              リーグ名を入力してください
            </div>
          )}
        </div>

        {/* メンバー */}
        <div style={{ ...card, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>2. メンバー</div>
          <div style={{ fontSize: 11, color: t.dm, marginBottom: 10 }}>
            {lgPC}人以上。{lgPC + 1}人以上なら毎回そこから{lgPC}人を選んで打ちます（{d.members.length}人選択中）
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            {presetNames.map(nm => {
              const on = d.members.includes(nm);
              return (
                <button key={nm} onClick={() => toggleMember(nm)} style={{
                  padding: "11px 8px", borderRadius: 10, cursor: "pointer",
                  border: `2px solid ${on ? t.ac : t.bd}`,
                  background: on ? t.acS : "transparent",
                  color: on ? t.ac : t.tx, fontSize: 14, fontWeight: 700,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{on ? "✓ " : ""}{nm}</button>
              );
            })}
          </div>
          <button onClick={() => { setView("names"); setNewNameInput(""); setEditNameIdx(null); }} style={{
            background: "none", border: "none", color: t.ac, fontSize: 11,
            cursor: "pointer", textDecoration: "underline", marginTop: 10,
          }}>👤 名前を追加・編集する</button>
        </div>

        {/* 期間 or 回数 */}
        <div style={{ ...card, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>3. 終わり方</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[["count", "回数で決める"], ["period", "期間で決める"]].map(([k, lb]) => (
              <button key={k} onClick={() => set({ mode: k })} style={{
                flex: 1, padding: "12px 6px", borderRadius: 10, cursor: "pointer",
                border: `2px solid ${d.mode === k ? t.ac : t.bd}`,
                background: d.mode === k ? t.acS : "transparent",
                color: d.mode === k ? t.ac : t.tx, fontSize: 13, fontWeight: 700,
              }}>{lb}</button>
            ))}
          </div>
          {d.mode === "count" ? (
            <div>
              <div style={{ fontSize: 11, color: t.dm, marginBottom: 6 }}>何回で終わりにしますか（2〜100）</div>
              <select
                value={d.targetCount}
                onChange={e => set({ targetCount: parseInt(e.target.value, 10) })}
                style={{ ...selectStyle, fontSize: 17, fontWeight: 800, padding: "14px 12px", textAlign: "center" }}
              >
                {Array.from({ length: 99 }, (_, i) => i + 2).map(n => (
                  <option key={n} value={n}>{n} 回</option>
                ))}
              </select>
              <div style={{ fontSize: 10, color: t.dm, marginTop: 6 }}>
                この回数に達すると自動で終了になります
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: t.dm, marginBottom: 5 }}>開始</div>
                <input type="date" value={d.startDate} onChange={e => set({ startDate: e.target.value })}
                  style={{ ...inputStyle, colorScheme: "dark", fontSize: 13 }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: t.dm, marginBottom: 5 }}>終了</div>
                <input type="date" value={d.endDate} onChange={e => set({ endDate: e.target.value })}
                  style={{ ...inputStyle, colorScheme: "dark", fontSize: 13 }} />
              </div>
            </div>
          )}
        </div>

        {/* ウマ・オカ */}
        <div style={{ ...card, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>4. ウマ・オカ</div>
          <div style={{ fontSize: 11, color: t.dm, marginBottom: 10 }}>順位によってやりとりするポイント</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 12 }}>
            {(lgPC === 3 ? UMA_PRESETS_3 : UMA_PRESETS).map(u => {
              const on = d.umaKey === u.key;
              return (
                <button key={u.key} onClick={() => set({ umaKey: u.key, uma: u.uma })} style={{
                  padding: "11px 8px", borderRadius: 10, cursor: "pointer",
                  border: `2px solid ${on ? t.ac : t.bd}`,
                  background: on ? t.acS : "transparent",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: on ? t.ac : t.tx }}>{u.label}</div>
                  <div style={{ fontSize: 10, color: t.dm, marginTop: 2 }}>{u.note}</div>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: t.dm, marginBottom: 5 }}>持ち点</div>
              <select value={d.rules.startPoints} style={selectStyle}
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  set({ rules: { ...d.rules, startPoints: v, returnPoints: Math.max(v, d.rules.returnPoints || v) } });
                }}>
                {Array.from({length:16},(_,i)=>20000+i*1000).map(v => <option key={v} value={v}>{v.toLocaleString()}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: t.dm, marginBottom: 5 }}>返し点</div>
              <select value={d.rules.returnPoints} style={selectStyle}
                onChange={e => set({ rules: { ...d.rules, returnPoints: parseInt(e.target.value, 10) } })}>
                {Array.from({length:16},(_,i)=>20000+i*1000).filter(v => v >= (d.rules.startPoints || 0)).map(v => <option key={v} value={v}>{v.toLocaleString()}</option>)}
              </select>
            </div>
          </div>
          <div style={{ fontSize: 11, color: t.dm, marginTop: 8, lineHeight: 1.8 }}>
            オカ = (返し点 − 持ち点) × 4 = <span style={{ color: t.gd, fontWeight: 700 }}>
              {(((d.rules.returnPoints || 0) - (d.rules.startPoints || 0)) * 4 / 1000)}pt
            </span> がトップへ
          </div>

          {/* 解説 */}
          <button onClick={() => setShowUmaHelp(v => !v)} style={{
            width: "100%", marginTop: 10, padding: "10px 8px", borderRadius: 9, cursor: "pointer",
            border: `1px solid ${t.bd}`, background: "transparent", color: t.ac, fontSize: 12, fontWeight: 700,
          }}>{showUmaHelp ? "説明を閉じる" : "ウマ・オカとは"}</button>

          {showUmaHelp && (() => {
            const sp = d.rules.startPoints || 25000;
            const rp = d.rules.returnPoints || 30000;
            const oka = (rp - sp) * 4 / 1000;
            // 持ち点に合わせた例（合計が 持ち点×4 になるようにする）
            const demo = [15000, 7000, -7000, -15000].map(o => sp + o);
            const res = calcGamePts(demo.slice(0, lgPC), demo.slice(0, lgPC).map((_, i) => i), { rules: d.rules, uma: d.uma });
            return (
              <div style={{ marginTop: 10, padding: 14, borderRadius: 11, background: t.sf, border: `1px solid ${t.bd}` }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: t.tx, marginBottom: 6 }}>ウマとは</div>
                <div style={{ fontSize: 12, color: t.tx, lineHeight: 1.95, marginBottom: 12 }}>
                  順位によってやりとりするポイントです。今の設定「
                  <span style={{ color: t.ac, fontWeight: 700 }}>
                    {UMA_PRESETS.find(u => u.key === d.umaKey)?.label}
                  </span>
                  」だと、1位が{d.uma[0] >= 0 ? "+" : ""}{d.uma[0]}、2位が{d.uma[1] >= 0 ? "+" : ""}{d.uma[1]}、
                  3位が{d.uma[2]}、4位が{d.uma[3]}です。合計はゼロなので、場全体のポイントは増減しません。
                  数字が大きいほど素点より順位の価値が高くなります。
                </div>

                <div style={{ fontSize: 12, fontWeight: 800, color: t.tx, marginBottom: 6 }}>オカとは</div>
                <div style={{ fontSize: 12, color: t.tx, lineHeight: 1.95, marginBottom: 12 }}>
                  持ち点より高い点数を基準（返し点）にして精算し、その差額をトップが総取りする仕組みです。
                  {sp === rp ? (
                    <> 今は持ち点と返し点が同じ{sp.toLocaleString()}点なので、
                    <span style={{ color: t.gd, fontWeight: 700 }}>オカは発生しません</span>。
                    トップの取り分を増やしたい場合は、持ち点を返し点より低くしてください
                    （例: 持ち点25,000 / 返し点30,000 なら20ptがトップへ）。</>
                  ) : (
                    <> 今は1人あたり{((rp - sp) / 1000)}ptぶんを供出し、
                    合計<span style={{ color: t.gd, fontWeight: 700 }}>{oka}pt</span>がトップに乗ります。
                    その結果、全員のポイントを足すとちょうどゼロになります。</>
                  )}
                </div>

                <div style={{ fontSize: 12, fontWeight: 800, color: t.tx, marginBottom: 6 }}>計算の順番</div>
                <div style={{ fontSize: 12, color: t.tx, lineHeight: 1.95, marginBottom: 12 }}>
                  ① 素点から返し点を引く<br />
                  ② 1,000点単位にして五捨六入（500点以下は切り捨て、600点以上は切り上げ）<br />
                  ③ トップにオカを加える<br />
                  ④ 順位ごとのウマを加える
                </div>

                <div style={{ fontSize: 12, fontWeight: 800, color: t.tx, marginBottom: 7 }}>
                  今の設定での例
                </div>
                <div style={{ fontSize: 10, color: t.dm, marginBottom: 7 }}>
                  終局時の素点が {demo.map(x => x.toLocaleString()).join(" / ")} だった場合
                  （合計 {(sp * 4).toLocaleString()}点）
                </div>
                {demo.map((s, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                    borderBottom: `1px solid ${t.bd}44`,
                  }}>
                    <span style={{ width: 26, fontSize: 11, fontWeight: 800, color: res[i].rank === 1 ? t.gd : t.dm }}>
                      {res[i].rank}位
                    </span>
                    <span style={{ flex: 1, fontSize: 12, color: t.dm, fontVariantNumeric: "tabular-nums" }}>
                      {s.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 10, color: t.dm }}>
                      {(s - rp) / 1000 >= 0 ? "+" : ""}{(s - rp) / 1000}
                      {res[i].rank === 1 && oka !== 0 ? ` +${oka}` : ""}
                      {" "}{d.uma[res[i].rank - 1] >= 0 ? "+" : ""}{d.uma[res[i].rank - 1]}
                    </span>
                    <span style={{
                      width: 48, textAlign: "right", fontSize: 14, fontWeight: 900, fontVariantNumeric: "tabular-nums",
                      color: res[i].pt > 0 ? t.gn : res[i].pt < 0 ? t.rd : t.tx,
                    }}>{res[i].pt > 0 ? "+" : ""}{res[i].pt}</span>
                  </div>
                ))}
                <div style={{ fontSize: 10, color: t.dm, marginTop: 8, lineHeight: 1.7 }}>
                  合計 {res.reduce((a2, r) => a2 + r.pt, 0)}pt。設定を変えるとこの例も変わります。
                  同点のときは起家に近い席を上位として扱います。
                </div>
              </div>
            );
          })()}
        </div>

        {/* 対局ルール */}
        <div style={{ ...card, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>5. 対局ルール</div>
          <div style={{ fontSize: 11, color: t.dm, marginBottom: 12 }}>リーグ中の全対局に適用されます</div>

          {/* 流局したときの親 */}
          <div style={{ fontSize: 11, fontWeight: 700, color: t.dm, marginBottom: 6 }}>流局したときの親</div>
          {[
            { key: "agari",  label: "あがり連荘",   desc: "流局したら親は必ず流れる" },
            { key: "tenpai", label: "テンパイ連荘", desc: "親がテンパイなら続行" },
            { key: "always", label: "無条件連荘",   desc: "流局しても親は続行" },
          ].map(o => {
            const cur = d.rules.agariRenchan ? "agari" : d.rules.tenpaiRenchan ? "tenpai" : "always";
            const on = cur === o.key;
            return (
              <button key={o.key} onClick={() => set({ rules: {
                ...d.rules, agariRenchan: o.key === "agari", tenpaiRenchan: o.key === "tenpai",
              } })} style={{
                width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: 9,
                padding: "10px 11px", marginBottom: 6, borderRadius: 10, cursor: "pointer",
                border: `2px solid ${on ? t.ac : t.bd}`, background: on ? t.acS : "transparent",
              }}>
                <span style={{
                  width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                  border: `2px solid ${on ? t.ac : t.bd}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{on && <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.ac }} />}</span>
                <span>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: on ? t.ac : t.tx }}>{o.label}</span>
                  <span style={{ display: "block", fontSize: 10, color: t.dm, marginTop: 2 }}>{o.desc}</span>
                </span>
              </button>
            );
          })}

          {/* 複数人が同時にロン */}
          <div style={{ fontSize: 11, fontWeight: 700, color: t.dm, margin: "12px 0 6px" }}>複数人が同時にロン</div>
          {[
            { key: "atamahane", label: "頭ハネ", desc: "アガれるのは1人だけ" },
            { key: "double",    label: "ダブロンあり", desc: "2人まで同時にアガリ" },
            { key: "triple",    label: "トリプルロンあり", desc: "3人同時も認める" },
          ].map(o => {
            const on = (d.rules.multiRon || "atamahane") === o.key;
            return (
              <button key={o.key} onClick={() => set({ rules: { ...d.rules, multiRon: o.key } })} style={{
                width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: 9,
                padding: "10px 11px", marginBottom: 6, borderRadius: 10, cursor: "pointer",
                border: `2px solid ${on ? t.ac : t.bd}`, background: on ? t.acS : "transparent",
              }}>
                <span style={{
                  width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                  border: `2px solid ${on ? t.ac : t.bd}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{on && <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.ac }} />}</span>
                <span>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: on ? t.ac : t.tx }}>{o.label}</span>
                  <span style={{ display: "block", fontSize: 10, color: t.dm, marginTop: 2 }}>{o.desc}</span>
                </span>
              </button>
            );
          })}

          <div style={{ fontSize: 11, fontWeight: 700, color: t.dm, margin: "12px 0 2px" }}>その他</div>
          {[
            ["kuitan", "食いタンあり", "鳴いたタンヤオを認めるか"],
            ["atozuke", "後付けあり", "役を後から確定させてよいか"],
            ["kiriage", "切り上げ満貫", "4翻30符・3翻60符を満貫扱い"],
            ["doubleYakuman", "ダブル役満あり", "役満の複合を2倍・3倍で計算"],
            ["orasYame", "オーラスは親トップで終了", "アガリやめ・テンパイやめ"],
            ["tobiEnd", "トビで終了", "持ち点が0未満になった時点で終局"],
          ].map(([k, lb, hint]) => (
            <div key={k} style={{ padding: "9px 0", borderBottom: `1px solid ${t.bd}33` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: t.tx }}>{lb}</span>
              <button onClick={() => set({ rules: { ...d.rules, [k]: !d.rules[k] } })} style={{
                width: 46, height: 26, borderRadius: 13, border: "none", padding: 0, cursor: "pointer",
                background: d.rules[k] ? t.ac : t.bd, position: "relative", flexShrink: 0,
              }}>
                <span style={{
                  position: "absolute", top: 3, left: d.rules[k] ? 23 : 3,
                  width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.15s",
                }} />
              </button>
            </div>
            {hint && <div style={{ fontSize: 10, color: t.dm, marginTop: 3 }}>{hint}</div>}
            </div>
          ))}
          <RuleHelp />
        </div>

        {!canSave && (
          <div style={{
            padding: "12px 14px", marginBottom: 10, borderRadius: 10,
            background: t.rdS, border: `1px solid ${t.rd}55`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: t.rd, marginBottom: 5 }}>
              あと少しで作れます
            </div>
            <div style={{ fontSize: 12, color: t.tx, lineHeight: 1.9 }}>
              {!d.name.trim() && <div>・リーグ名を入力してください</div>}
              {d.members.length < lgPC && <div>・メンバーを{lgPC}人以上選んでください（現在{d.members.length}人）</div>}
            </div>
          </div>
        )}
        <button
          style={{ ...actionBtn("p"), opacity: canSave ? 1 : 0.4 }}
          disabled={!canSave}
          onClick={() => {
            const exists = leagues.some(l => l.id === d.id);
            saveLeagues(exists ? leagues.map(l => l.id === d.id ? d : l) : [d, ...leagues]);
            setLeagueId(d.id); setLeagueTab("stand"); setView("leaguedetail");
          }}>{leagues.some(l => l.id === d.id) ? "保存する" : "リーグ戦を作る"}</button>
        <button style={actionBtn()} onClick={() => setView("league")}>キャンセル</button>
      </div>
    );
  };

  // 詳細（成績表・対局一覧・設定）
  const renderLeagueDetail = () => {
    const lg = curLeague;
    if (!lg) return <div style={body}><button style={backBtn} onClick={() => setView("league")}>← 戻る</button></div>;
    const st = leagueStandings(lg);
    const pr = leagueProgress(lg);

    return (
      <div style={body}>
        <button style={backBtn} onClick={() => setView("league")}>← リーグ一覧</button>

        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{lg.name}</div>
          <div style={{ fontSize: 11, color: t.dm, marginTop: 4 }}>
            {lg.members.length}人 ・ {pr.played}回消化
            {lg.mode === "count" ? ` / 全${lg.targetCount}回` : ` ・ ${lg.startDate}〜${lg.endDate}`}
            {" ・ ウマ "}{UMA_PRESETS.find(u => u.key === lg.umaKey)?.label || "10-20"}
          </div>
        </div>

        {lg.mode === "count" && (
          <div style={{ height: 6, borderRadius: 3, background: t.sf, overflow: "hidden", margin: "10px 0 16px" }}>
            <div style={{ height: "100%", width: `${Math.round((pr.pct || 0) * 100)}%`, background: t.ac }} />
          </div>
        )}

        {/* 対局開始 */}
        {lg.status === "active" && (
          <button onClick={() => {
            // メンバーがちょうど4人なら最初から全員選択済みにする
            setLgPick(lg.members.length === (lg.playerCount || 4) ? [...lg.members] : []);
            setLgMatchType("hanchan"); setView("leaguestart");
          }} style={{
            width: "100%", padding: "16px", marginBottom: 16, borderRadius: 13, cursor: "pointer",
            border: "none", background: t.ac, color: "#fff", fontSize: 16, fontWeight: 800,
          }}>▶ このリーグで対局を始める</button>
        )}

        {/* タブ */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["stand", "成績表"], ["games", "対局一覧"], ["info", "設定"]].map(([k, lb]) => (
            <button key={k} onClick={() => setLeagueTab(k)} style={{
              flex: 1, padding: "10px 4px", borderRadius: 9, cursor: "pointer",
              border: `1px solid ${leagueTab === k ? t.ac : t.bd}`,
              background: leagueTab === k ? t.acS : "transparent",
              color: leagueTab === k ? t.ac : t.dm, fontSize: 13, fontWeight: 700,
            }}>{lb}</button>
          ))}
        </div>

        {/* 成績表 */}
        {leagueTab === "stand" && (
          <div style={{ ...card, padding: 14 }}>
            {pr.played === 0 ? (
              <div style={{ fontSize: 13, color: t.dm, textAlign: "center", padding: "20px 0" }}>
                まだ対局がありません
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: t.dm }}>
                      <th style={{ textAlign: "left", padding: "6px 4px", fontWeight: 600 }}>順</th>
                      <th style={{ textAlign: "left", padding: "6px 4px", fontWeight: 600 }}>名前</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 600 }}>pt</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 600 }}>回数</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 600 }}>平均</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 600 }}>1-2-3-4</th>
                    </tr>
                  </thead>
                  <tbody>
                    {st.map((r, i) => (
                      <tr key={r.name} style={{ borderTop: `1px solid ${t.bd}55` }}>
                        <td style={{ padding: "9px 4px", color: i === 0 ? t.gd : t.dm, fontWeight: 800 }}>{i + 1}</td>
                        <td style={{ padding: "9px 4px", color: t.tx, fontWeight: 700, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</td>
                        <td style={{ padding: "9px 4px", textAlign: "right", fontWeight: 900, fontVariantNumeric: "tabular-nums", color: r.pt > 0 ? t.gn : r.pt < 0 ? t.rd : t.tx }}>
                          {r.pt > 0 ? "+" : ""}{r.pt}
                        </td>
                        <td style={{ padding: "9px 4px", textAlign: "right", color: t.dm }}>{r.games}</td>
                        <td style={{ padding: "9px 4px", textAlign: "right", color: t.dm }}>{r.games ? r.avgRank.toFixed(2) : "—"}</td>
                        <td style={{ padding: "9px 4px", textAlign: "right", color: t.dm, fontVariantNumeric: "tabular-nums" }}>{r.ranks.join("-")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 10, color: t.dm, marginTop: 10, lineHeight: 1.8 }}>
                  平均 = 平均順位。1-2-3-4 = 各順位の回数。同点は平均順位が良いほうを上位にしています。
                </div>
              </div>
            )}
          </div>
        )}

        {/* 対局一覧 */}
        {leagueTab === "games" && (
          <div>
            {(lg.games || []).length === 0 ? (
              <div style={{ ...card, padding: 20, textAlign: "center", fontSize: 13, color: t.dm }}>
                まだ対局がありません
              </div>
            ) : [...lg.games].reverse().map((g, gi) => (
              <div key={gi} style={{ ...card, padding: 13, marginBottom: 9 }}>
                <div style={{ fontSize: 11, color: t.dm, marginBottom: 7 }}>
                  第{lg.games.length - gi}戦 ・ {g.date}
                  {g.matchType && ` ・ ${MATCH_LABEL(g.matchType)}`}
                </div>
                {g.players.map((nm, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <span style={{
                      width: 20, fontSize: 12, fontWeight: 800,
                      color: g.ranks[i] === 1 ? t.gd : t.dm,
                    }}>{g.ranks[i]}位</span>
                    <span style={{ flex: 1, fontSize: 13, color: t.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nm}</span>
                    <span style={{ fontSize: 12, color: t.dm, fontVariantNumeric: "tabular-nums" }}>{g.scores[i].toLocaleString()}</span>
                    <span style={{
                      width: 52, textAlign: "right", fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                      color: g.pts[i] > 0 ? t.gn : g.pts[i] < 0 ? t.rd : t.tx,
                    }}>{g.pts[i] > 0 ? "+" : ""}{g.pts[i]}</span>
                  </div>
                ))}
                <button onClick={() => {
                  if (!window.confirm("この対局の記録を削除しますか？")) return;
                  const idx = lg.games.length - 1 - gi;
                  saveLeagues(leagues.map(l => l.id === lg.id
                    ? { ...l, games: l.games.filter((_, k) => k !== idx) } : l));
                }} style={{
                  background: "none", border: "none", color: t.dm, fontSize: 10,
                  cursor: "pointer", textDecoration: "underline", marginTop: 6,
                }}>この記録を削除</button>
              </div>
            ))}
          </div>
        )}

        {/* 設定 */}
        {leagueTab === "info" && (
          <div style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 13, lineHeight: 2.1, color: t.tx }}>
              <div><span style={{ color: t.dm }}>メンバー: </span>{lg.members.join("、")}</div>
              <div><span style={{ color: t.dm }}>終わり方: </span>
                {lg.mode === "count" ? `${lg.targetCount}回で終了` : `${lg.startDate} 〜 ${lg.endDate}`}</div>
              <div><span style={{ color: t.dm }}>ウマ: </span>{lg.uma.map(u => (u > 0 ? "+" : "") + u).join(" / ")}</div>
              <div><span style={{ color: t.dm }}>持ち点 / 返し点: </span>
                {lg.rules.startPoints.toLocaleString()} / {lg.rules.returnPoints.toLocaleString()}</div>
              <div><span style={{ color: t.dm }}>オカ: </span>
                {((lg.rules.returnPoints - lg.rules.startPoints) * 4 / 1000)}pt がトップへ</div>
              <div><span style={{ color: t.dm }}>流局したときの親: </span>
                {lg.rules.agariRenchan ? "あがり連荘" : lg.rules.tenpaiRenchan ? "テンパイ連荘" : "無条件連荘"}</div>
              <div><span style={{ color: t.dm }}>複数人が同時にロン: </span>
                {lg.rules.multiRon === "triple" ? "トリプルロンあり" : lg.rules.multiRon === "double" ? "ダブロンあり" : "頭ハネ"}</div>
              <div><span style={{ color: t.dm }}>その他: </span>
                {[
                  lg.rules.kuitan ? "食いタンあり" : "食いタンなし",
                  lg.rules.atozuke ? "後付けあり" : "後付けなし",
                  lg.rules.kiriage ? "切り上げ満貫あり" : "切り上げ満貫なし",
                  lg.rules.doubleYakuman ? "ダブル役満あり" : "ダブル役満なし",
                  lg.rules.orasYame !== false ? "オーラス親トップで終了" : "オーラスやめなし",
                  lg.rules.tobiEnd !== false ? "トビで終了" : "トビでも続行",
                ].join(" ・ ")}</div>
            </div>

            <button style={{ ...actionBtn(), marginTop: 16 }}
              onClick={() => { setLgDraft({ ...lg }); setView("leagueform"); }}>設定を変更する</button>

            <button style={{ ...actionBtn(), color: lg.status === "active" ? t.gd : t.gn }}
              onClick={() => saveLeagues(leagues.map(l => l.id === lg.id
                ? { ...l, status: l.status === "active" ? "done" : "active" } : l))}>
              {lg.status === "active" ? "このリーグを終了する" : "開催中に戻す"}
            </button>

            <button style={{ ...actionBtn(), color: t.rd }}
              onClick={() => {
                if (!window.confirm(`「${lg.name}」を削除しますか？対局記録もすべて消えます。`)) return;
                saveLeagues(leagues.filter(l => l.id !== lg.id));
                setView("league");
              }}>リーグを削除</button>
          </div>
        )}

        <button style={{ ...actionBtn(), marginTop: 14 }} onClick={() => setView("league")}>リーグ一覧に戻る</button>
      </div>
    );
  };

  // 対局に出る4人を選ぶ → 席決めへ
  const renderLeagueStart = () => {
    const lg = curLeague;
    if (!lg) return <div style={body} />;
    const lgPC = lg.playerCount || 4;
    const ready = lgPick.length === lgPC && !!lgMatchType;
    return (
      <div style={body}>
        <button style={backBtn} onClick={() => setView("leaguedetail")}>← 戻る</button>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{lg.name}</div>
        <div style={{ fontSize: 12, color: t.dm, marginBottom: 16 }}>
          {lg.members.length === lgPC
            ? `メンバーは${lgPC}人なので全員が出場します`
            : `この対局に出る${lgPC}人を選んでください（${lgPick.length}/${lgPC}）`}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
          {lg.members.map(nm => {
            const on = lgPick.includes(nm);
            const full = lgPick.length >= lgPC && !on;
            return (
              <button key={nm} onClick={() => setLgPick(on ? lgPick.filter(x => x !== nm) : (full ? lgPick : [...lgPick, nm]))}
                style={{
                  padding: "14px 8px", borderRadius: 11, cursor: full ? "default" : "pointer",
                  border: `2px solid ${on ? t.ac : t.bd}`,
                  background: on ? t.acS : "transparent",
                  color: on ? t.ac : t.tx, fontSize: 14, fontWeight: 700, opacity: full ? 0.4 : 1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{on ? "✓ " : ""}{nm}</button>
            );
          })}
        </div>

        {/* 形式はこの対局ごとに決める */}
        <div style={{ fontSize: 12, color: t.dm, marginBottom: 8 }}>今回の形式</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {[["tonpu", "東風戦", "東場のみ"], ["hanchan", "半荘戦", "東場＋南場"], ["zenchan", "全荘戦", "東南西北場"]].map(([k, lb, sub]) => (
            <button key={k} onClick={() => setLgMatchType(k)} style={{
              flex: 1, padding: "15px 8px", borderRadius: 12, cursor: "pointer",
              border: `2px solid ${lgMatchType === k ? t.ac : t.bd}`,
              background: lgMatchType === k ? t.acS : "transparent",
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: lgMatchType === k ? t.ac : t.tx }}>{lb}</div>
              <div style={{ fontSize: 11, color: t.dm, marginTop: 3 }}>{sub}</div>
            </button>
          ))}
        </div>

        <button
          style={{ ...actionBtn("p"), opacity: ready ? 1 : 0.4 }}
          disabled={!ready}
          onClick={() => {
            const d = new Date();
            setGameDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
            setPlayers([...lgPick]);
            setPlayerCount(lgPC);
            setRules({ ...defaultRules, ...lg.rules });
            setMatchType(lgMatchType);
            setActiveLeagueId(lg.id);
            resetSeatDraw();
            setGameStarted(false); setGameFinished(false);
            setReviewing(false); setShowScoreFix(false);
            setSetupStep(1);           // 席決めから始める
            setView("game");
          }}>席決めへ進む</button>
      </div>
    );
  };

  // ══════════════════════════════════
  // ── 点数問題集（4翻以下） ──
  // ══════════════════════════════════
  const renderScoreQuiz = () => {
    // ── 計算のしかた（先に読む解説） ──
    if (sqMode === "lesson") {
      const stepBox = (no, title, children) => (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
            <span style={{
              width: 24, height: 24, borderRadius: "50%", background: t.ac, color: "#fff",
              fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>{no}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: t.tx }}>{title}</span>
          </div>
          <div style={{ fontSize: 13, color: t.tx, lineHeight: 1.95, paddingLeft: 32 }}>{children}</div>
        </div>
      );
      const formula = (txt, sub) => (
        <div style={{
          background: t.sf, border: `1px solid ${t.bd}`, borderRadius: 9,
          padding: "10px 12px", margin: "7px 0", fontVariantNumeric: "tabular-nums",
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.gd }}>{txt}</div>
          {sub && <div style={{ fontSize: 11, color: t.dm, marginTop: 4, lineHeight: 1.6 }}>{sub}</div>}
        </div>
      );

      return (
        <div style={body}>
          <button style={backBtn} onClick={() => setSqMode(null)}>← 戻る</button>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>📘 点数計算のしかた</div>
          <div style={{ fontSize: 12, color: t.dm, marginBottom: 16 }}>
            4翻以下の点数は、次の3ステップで求められます
          </div>

          <div style={{ ...card, padding: 18 }}>
            {stepBox(1, "基本点を出す", (
              <>
                符に、翻数で決まる倍率をかけます。翻が1つ増えるごとに2倍になります。
                {formula("基本点 = 符 × 2 の (2+翻) 乗",
                  "1翻なら8倍、2翻なら16倍、3翻なら32倍、4翻なら64倍")}
                <div style={{ color: t.gd, fontWeight: 700 }}>
                  ただし2,000を超えたら2,000で頭打ち（＝満貫）
                </div>
              </>
            ))}

            {stepBox(2, "誰が誰に払うかで倍率をかける", (
              <>
                <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
                  {[
                    ["子がロン", "基本点 × 4", "放銃者が全額"],
                    ["親がロン", "基本点 × 6", "放銃者が全額"],
                    ["子がツモ", "子は ×1 / 親は ×2", "3人から集める"],
                    ["親がツモ", "各家 ×2", "3人が同額"],
                  ].map(([who, f, note]) => (
                    <div key={who} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                      background: t.sf, border: `1px solid ${t.bd}`, borderRadius: 9, padding: "9px 11px",
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.tx, flexShrink: 0 }}>{who}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: t.ac, textAlign: "right" }}>
                        {f}
                        <span style={{ display: "block", fontSize: 10, color: t.dm, fontWeight: 400 }}>{note}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: t.dm }}>
                  親は子の1.5倍、ツモは親から2倍もらう、と覚えると早いです。
                </div>
              </>
            ))}

            {stepBox(3, "100点単位で切り上げる", (
              <>
                端数が出たら100点単位に切り上げます。
                <div style={{ color: t.rd, fontWeight: 700, marginTop: 4 }}>
                  ここが要注意 — ツモは「1人ぶんずつ」切り上げます
                </div>
                <div style={{ fontSize: 12, color: t.dm, marginTop: 4, lineHeight: 1.8 }}>
                  合計してから切り上げるのではありません。子ツモなら、子の払いと親の払いを別々に切り上げてから合計します。
                </div>
              </>
            ))}
          </div>

          {/* 例題 */}
          <div style={{ ...card, padding: 18, marginTop: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>例1: 子・ロン・3翻30符</div>
            <div style={{ fontSize: 13, lineHeight: 2, color: t.tx }}>
              ① 30 × 2<sup>(2+3)</sup> = 30 × 32 = <b style={{ color: t.gd }}>960</b><br />
              ② 子のロンなので 960 × 4 = 3,840<br />
              ③ 100点単位に切り上げて <b style={{ color: t.gn }}>3,900点</b>
            </div>

            <div style={{ height: 1, background: t.bd, margin: "16px 0" }} />

            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>例2: 子・ツモ・1翻100符</div>
            <div style={{ fontSize: 13, lineHeight: 2, color: t.tx }}>
              ① 100 × 2<sup>(2+1)</sup> = 100 × 8 = <b style={{ color: t.gd }}>800</b><br />
              ② 子は 800 × 1 = 800 ／ 親は 800 × 2 = 1,600<br />
              ③ どちらも端数なし → <b style={{ color: t.gn }}>800 / 1,600</b><br />
              <span style={{ fontSize: 12, color: t.dm }}>合計は 800×2 + 1,600 = 3,200点</span>
            </div>

            <div style={{ height: 1, background: t.bd, margin: "16px 0" }} />

            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>例3: 満貫で頭打ちになる形</div>
            <div style={{ fontSize: 13, lineHeight: 2, color: t.tx }}>
              子・ロン・4翻40符<br />
              ① 40 × 2<sup>(2+4)</sup> = 40 × 64 = 2,560<br />
              　→ 2,000を超えるので <b style={{ color: t.gd }}>2,000で頭打ち</b><br />
              ② 2,000 × 4 = <b style={{ color: t.gn }}>8,000点（満貫）</b>
            </div>
          </div>

          {/* 覚えておくと速い早見 */}
          <div style={{ ...card, padding: 18, marginTop: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>まず覚えたい4つ</div>
            <div style={{ fontSize: 11, color: t.dm, marginBottom: 10 }}>
              この4つを軸に、翻が1つ増えたら2倍、と考えると多くの場面に対応できます
            </div>
            {[
              ["子 30符1翻 ロン", "1,000点"],
              ["子 30符2翻 ロン", "2,000点"],
              ["子 30符3翻 ロン", "3,900点"],
              ["子 30符4翻 ロン", "7,700点"],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: "flex", justifyContent: "space-between",
                padding: "9px 0", borderBottom: `1px solid ${t.bd}33`,
              }}>
                <span style={{ fontSize: 13, color: t.tx }}>{k}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: t.gd, fontVariantNumeric: "tabular-nums" }}>{v}</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: t.dm, marginTop: 10, lineHeight: 1.8 }}>
              親はこの1.5倍（1,500 / 2,900 / 5,800 / 11,600）です。3,900と7,700だけは、切り上げの都合でちょうど2倍になりません。
            </div>
          </div>

          <button style={{ ...actionBtn("p"), marginTop: 16 }}
            onClick={() => { setSqMode("choice"); setSqScore({ ok: 0, total: 0 }); makeScoreQuestion(); }}>
            選択式で練習する
          </button>
          <button style={actionBtn()} onClick={() => setSqMode(null)}>出題方式を選ぶ</button>
        </div>
      );
    }

    // モード選択
    if (!sqMode) {
      return (
        <div style={body}>
          <button style={backBtn} onClick={() => setView("home")}>← 戻る</button>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>🔢 点数問題集</div>
          <div style={{ fontSize: 12, color: t.dm, marginBottom: 18 }}>
            4翻以下の点数を、親子・ロンツモの組み合わせで出題します
          </div>

          <button onClick={() => setSqMode("lesson")} style={{
            width: "100%", padding: "18px", marginBottom: 12, borderRadius: 13, cursor: "pointer",
            border: `2px solid ${t.gn}`, background: t.gnS, textAlign: "left",
          }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: t.gn }}>📘 まず計算のしかたを読む</div>
            <div style={{ fontSize: 11, color: t.dm, marginTop: 3, lineHeight: 1.6 }}>
              基本点・倍率・切り上げの3ステップを例題つきで解説
            </div>
          </button>

          <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, margin: "16px 0 8px" }}>問題を解く</div>

          <button onClick={() => { setSqMode("choice"); setSqScore({ ok: 0, total: 0 }); makeScoreQuestion(); }} style={{
            width: "100%", padding: "18px", marginBottom: 12, borderRadius: 13, cursor: "pointer",
            border: `2px solid ${t.ac}`, background: t.acS, textAlign: "left",
          }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: t.ac }}>選択式</div>
            <div style={{ fontSize: 11, color: t.dm, marginTop: 3, lineHeight: 1.6 }}>
              4つの候補から選びます。まずはここから
            </div>
          </button>

          <button onClick={() => { setSqMode("input"); setSqScore({ ok: 0, total: 0 }); makeScoreQuestion(); }} style={{
            width: "100%", padding: "18px", marginBottom: 12, borderRadius: 13, cursor: "pointer",
            border: `2px solid ${t.gd}`, background: t.gdS, textAlign: "left",
          }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: t.gd }}>入力式</div>
            <div style={{ fontSize: 11, color: t.dm, marginTop: 3, lineHeight: 1.6 }}>
              点数を自分で入力します。実戦に近い練習
            </div>
          </button>

          <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: t.card, border: `1px solid ${t.bd}` }}>
            <div style={{ fontSize: 11, color: t.dm, lineHeight: 1.9 }}>
              <div>・ロン → 放銃者が払う合計点</div>
              <div>・親のツモ → 各家が払う点数</div>
              <div>・子のツモ → 子から / 親から の2つ</div>
            </div>
          </div>

          <button style={{ ...actionBtn(), marginTop: 16 }} onClick={() => setView("home")}>メニューに戻る</button>
        </div>
      );
    }

    if (!sqQ) return <div style={body} />;
    const a = sqQ.ans;
    const who = sqQ.isParent ? "親" : "子";
    const how = sqQ.isTsumo ? "ツモ" : "ロン";

    return (
      <div style={body}>
        <button style={backBtn} onClick={() => { setSqMode(null); setSqQ(null); }}>← 出題方式を変える</button>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: t.dm }}>
            {sqMode === "choice" ? "選択式" : "入力式"}
          </span>
          <span style={{ fontSize: 12, color: t.dm }}>
            正解 {sqScore.ok} / {sqScore.total}
            {sqScore.total > 0 && `（${Math.round(sqScore.ok / sqScore.total * 100)}%）`}
          </span>
        </div>

        <div style={card}>
          {/* 問題 */}
          <div style={{ textAlign: "center", padding: "8px 0 20px" }}>
            <div style={{
              display: "inline-flex", gap: 6, marginBottom: 14, flexWrap: "wrap", justifyContent: "center",
            }}>
              <span style={{
                fontSize: 15, fontWeight: 900, padding: "5px 14px", borderRadius: 8,
                background: sqQ.isParent ? t.gd : t.sf,
                color: sqQ.isParent ? "#1a1a1a" : t.tx,
                border: `1px solid ${sqQ.isParent ? t.gd : t.bd}`,
              }}>{who}</span>
              <span style={{
                fontSize: 15, fontWeight: 900, padding: "5px 14px", borderRadius: 8,
                background: sqQ.isTsumo ? t.gnS : t.rdS,
                color: sqQ.isTsumo ? t.gn : t.rd,
                border: `1px solid ${sqQ.isTsumo ? t.gn : t.rd}55`,
              }}>{how}</span>
            </div>
            <div style={{ fontSize: 38, fontWeight: 900, color: t.tx, letterSpacing: "0.02em", lineHeight: 1.25 }}>
              {sqQ.han}翻 {sqQ.fu}符
            </div>
            <div style={{ fontSize: 13, color: t.dm, marginTop: 10 }}>
              {a.label} 何点？
            </div>
          </div>

          {/* 回答欄 */}
          {sqMode === "choice" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
              {sqQ.choices.map((ch, i) => {
                const isAns = ch === a.text;
                const isPicked = sqPicked === ch;
                let bd = t.bd, bg = "transparent", col = t.tx;
                if (sqJudged !== null) {
                  if (isAns) { bd = t.gn; bg = t.gnS; col = t.gn; }
                  else if (isPicked) { bd = t.rd; bg = t.rdS; col = t.rd; }
                }
                return (
                  <button key={i} onClick={() => judgeScoreChoice(ch)} disabled={sqJudged !== null} style={{
                    padding: "16px 6px", borderRadius: 11,
                    border: `2px solid ${bd}`, background: bg, color: col,
                    fontSize: ch.length > 8 ? 15 : 19, fontWeight: 800,
                    cursor: sqJudged === null ? "pointer" : "default",
                    fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                  }}>{ch}</button>
                );
              })}
            </div>
          ) : (
            <div>
              {a.kind === "pair" ? (
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: t.dm, marginBottom: 5 }}>子から</div>
                    <input type="text" inputMode="numeric" value={sqIn1} disabled={sqJudged !== null}
                      onChange={e => setSqIn1(e.target.value)} placeholder="0"
                      style={{ ...inputStyle, fontSize: 20, fontWeight: 800, textAlign: "center" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: t.dm, marginBottom: 5 }}>親から</div>
                    <input type="text" inputMode="numeric" value={sqIn2} disabled={sqJudged !== null}
                      onChange={e => setSqIn2(e.target.value)} placeholder="0"
                      style={{ ...inputStyle, fontSize: 20, fontWeight: 800, textAlign: "center" }} />
                  </div>
                </div>
              ) : (
                <input type="text" inputMode="numeric" value={sqIn1} disabled={sqJudged !== null}
                  onChange={e => setSqIn1(e.target.value)} placeholder="点数を入力"
                  style={{ ...inputStyle, fontSize: 26, fontWeight: 900, textAlign: "center", marginBottom: 12, padding: "14px" }} />
              )}
              {sqJudged === null && (
                <button style={actionBtn("p")} onClick={judgeScoreInput}
                  disabled={!sqIn1 || (a.kind === "pair" && !sqIn2)}>答え合わせ</button>
              )}
            </div>
          )}

          {/* 判定と解説 */}
          {sqJudged !== null && (
            <div style={{ marginTop: 16 }}>
              <div style={{
                padding: 14, borderRadius: 11, textAlign: "center", marginBottom: 12,
                background: sqJudged ? t.gnS : t.rdS,
                border: `1px solid ${(sqJudged ? t.gn : t.rd)}55`,
              }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: sqJudged ? t.gn : t.rd }}>
                  {sqJudged ? "◯ 正解" : "✕ 不正解"}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: t.tx, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                  {a.text}
                </div>
                <div style={{ fontSize: 11, color: t.dm, marginTop: 3 }}>{a.label}</div>
                {sqQ.isTsumo && (
                  <div style={{ fontSize: 11, color: t.dm, marginTop: 6 }}>
                    合計 {(sqQ.isParent ? a.value * 3 : a.child * 2 + a.parent).toLocaleString()}点
                  </div>
                )}
              </div>

              <div style={{ padding: 13, borderRadius: 11, background: t.sf, border: `1px solid ${t.bd}`, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: t.dm, marginBottom: 6 }}>計算の手順</div>
                <div style={{ fontSize: 12, color: t.tx, lineHeight: 1.9 }}>
                  {(() => {
                    const raw = sqQ.fu * Math.pow(2, 2 + sqQ.han);
                    const capped = Math.min(raw, 2000);
                    const mul = sqQ.isTsumo ? (sqQ.isParent ? 2 : null) : (sqQ.isParent ? 6 : 4);
                    return (
                      <>
                        <div>① 基本点 = {sqQ.fu}符 × 2<sup>(2+{sqQ.han})</sup> = {raw.toLocaleString()}
                          {raw > 2000 && <span style={{ color: t.gd }}> → 満貫の上限2,000</span>}
                        </div>
                        {sqQ.isTsumo && !sqQ.isParent ? (
                          <div>② 子は {capped.toLocaleString()}×1、親は {capped.toLocaleString()}×2 を、それぞれ100点単位で切り上げ</div>
                        ) : (
                          <div>② {capped.toLocaleString()} × {mul} を100点単位で切り上げ</div>
                        )}
                        <div>③ 答え = {a.text}</div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <button style={actionBtn("p")} onClick={makeScoreQuestion}>次の問題 →</button>
            </div>
          )}
        </div>

        <button style={{ ...actionBtn(), marginTop: 12 }} onClick={() => setSqMode("lesson")}>📘 計算のしかたを見る</button>
        <button style={actionBtn()} onClick={() => setView("home")}>メニューに戻る</button>
      </div>
    );
  };

  // ══════════════════════════════════
  // ── 用語問題集 ──
  // ══════════════════════════════════
  const renderTermQuiz = () => {
    const bigChoice = (label, sub, color, colorS, onClick) => (
      <button onClick={onClick} style={{
        flex: 1, padding: "18px 8px", borderRadius: 14, cursor: "pointer",
        border: `2px solid ${color}`, background: colorS,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
      }}>
        <span style={{ fontSize: 17, fontWeight: 900, color }}>{label}</span>
        <span style={{ fontSize: 10, color: t.dm }}>{sub}</span>
      </button>
    );

    // ── カテゴリ選択 ──
    if (!termCat) {
      const remaining = (cat) => {
        const base = cat === "all" ? TERM_DATA : TERM_DATA.filter(x => x.cat === cat);
        return base.filter(x => !masteredTerms.includes(x.kanji)).length;
      };
      return (
        <div style={body}>
          <button style={backBtn} onClick={() => setView("home")}>← 戻る</button>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>📚 用語問題集</div>
          <div style={{ fontSize: 12, color: t.dm, marginBottom: 16 }}>
            役以外の麻雀用語を、漢字と読みのセットで覚えます
          </div>

          <button onClick={() => startTermQuiz("all")} style={{
            width: "100%", padding: "16px 18px", marginBottom: 10, borderRadius: 12, cursor: "pointer",
            border: `2px solid ${t.ac}`, background: t.acS, textAlign: "left",
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.ac }}>すべての用語</div>
            <div style={{ fontSize: 11, color: t.dm, marginTop: 2 }}>
              残り {remaining("all")} 語 / 全 {TERM_DATA.length} 語
            </div>
          </button>

          <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, margin: "14px 0 8px" }}>分野を選ぶ</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {TERM_CATS.map(cat => {
              const rem = remaining(cat);
              return (
                <button key={cat} onClick={() => rem > 0 && startTermQuiz(cat)} style={{
                  padding: "13px 8px", borderRadius: 11, cursor: rem > 0 ? "pointer" : "default",
                  border: `1px solid ${t.bd}`, background: t.card, opacity: rem > 0 ? 1 : 0.45,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.tx }}>{cat}</div>
                  <div style={{ fontSize: 10, color: rem > 0 ? t.dm : t.gn, marginTop: 2 }}>
                    {rem > 0 ? `残り ${rem} 語` : "✓ 全て覚えた"}
                  </div>
                </button>
              );
            })}
          </div>

          {masteredTerms.length > 0 && (
            <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: t.card, border: `1px solid ${t.bd}` }}>
              <div style={{ fontSize: 13, color: t.tx, marginBottom: 8 }}>
                覚えた用語: <span style={{ color: t.gn, fontWeight: 800 }}>{masteredTerms.length}</span> / {TERM_DATA.length}
              </div>
              <div style={{ height: 6, borderRadius: 3, background: t.sf, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ height: "100%", width: `${Math.round(masteredTerms.length / TERM_DATA.length * 100)}%`, background: t.gn }} />
              </div>
              <button onClick={() => { saveTermMastered([]); saveTermWrong({}); }} style={{
                ...actionBtn(), fontSize: 12, color: t.dm, marginTop: 0,
              }}>学習状況をリセット</button>
            </div>
          )}

          <button style={{ ...actionBtn(), marginTop: 16 }} onClick={() => setView("home")}>メニューに戻る</button>
        </div>
      );
    }

    // ── 終了画面 ──
    if (termFinished || termOrder.length === 0) {
      const pct = termScore.total ? Math.round(termScore.known / termScore.total * 100) : 0;
      return (
        <div style={body}>
          <div style={card}>
            <div style={{ fontSize: 20, fontWeight: 800, textAlign: "center", marginBottom: 6 }}>おつかれさまでした</div>
            {termOrder.length === 0 ? (
              <div style={{ fontSize: 13, color: t.dm, textAlign: "center", marginBottom: 16 }}>
                この分野は全て「覚えた」になっています
              </div>
            ) : (
              <>
                <div style={{ fontSize: 40, fontWeight: 900, textAlign: "center", color: pct >= 70 ? t.gn : t.gd }}>{pct}%</div>
                <div style={{ fontSize: 13, color: t.dm, textAlign: "center", marginBottom: 16 }}>
                  {termScore.total}語中 {termScore.known}語 わかりました
                </div>
              </>
            )}
            <button style={actionBtn("p")} onClick={() => startTermQuiz(termCat)}>もう一度</button>
            <button style={actionBtn()} onClick={() => setTermCat(null)}>分野を選び直す</button>
            <button style={actionBtn()} onClick={() => setView("home")}>メニューに戻る</button>
          </div>
        </div>
      );
    }

    // ── 出題画面 ──
    const cur = termOrder[termIdx];
    const isMastered = masteredTerms.includes(cur.kanji);
    return (
      <div style={body}>
        <button style={backBtn} onClick={() => setTermCat(null)}>← 分野を選び直す</button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: t.dm }}>{termIdx + 1} / {termOrder.length}</span>
          <span style={{ fontSize: 12, color: t.dm }}>
            わかる {termScore.known} / {termScore.total}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: t.sf, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ height: "100%", width: `${Math.round((termIdx) / termOrder.length * 100)}%`, background: t.ac, transition: "width 0.3s" }} />
        </div>

        <div style={card}>
          <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
            <span style={{
              fontSize: 11, color: t.dm, border: `1px solid ${t.bd}`,
              borderRadius: 6, padding: "3px 10px",
            }}>{cur.cat}</span>
          </div>

          {/* 漢字と読みをセットで表示 */}
          <div style={{ textAlign: "center", padding: "18px 0 22px" }}>
            <div style={{ fontSize: 13, color: t.dm, letterSpacing: "0.15em", marginBottom: 6 }}>{cur.yomi}</div>
            <div style={{ fontSize: 40, fontWeight: 900, color: t.tx, letterSpacing: "0.06em", lineHeight: 1.2 }}>
              {cur.kanji}
            </div>
            <div style={{ fontSize: 12, color: t.dm, marginTop: 12 }}>
              {termRevealed ? "" : "意味がわかりますか？"}
            </div>
          </div>

          {!termRevealed ? (
            <div style={{ display: "flex", gap: 10 }}>
              {bigChoice("わかる", "意味を言える", t.gn, t.gnS, () => answerTerm(true))}
              {bigChoice("わからない", "あとで復習", t.rd, t.rdS, () => answerTerm(false))}
            </div>
          ) : (
            <>
              <div style={{
                padding: 14, borderRadius: 11, background: t.sf,
                border: `1px solid ${t.bd}`, marginBottom: 10,
              }}>
                <div style={{ fontSize: 11, color: t.dm, marginBottom: 5 }}>意味</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.tx, lineHeight: 1.7 }}>{cur.desc}</div>
              </div>

              {cur.figs && (
                <div style={{
                  padding: 14, borderRadius: 11, background: "#12281c",
                  border: `1px solid ${t.gn}33`, marginBottom: 10,
                }}>
                  <div style={{ fontSize: 11, color: t.gn, marginBottom: 8, fontWeight: 700 }}>図で見る</div>
                  {cur.figs.map((f, i) => <TermFig key={i} fig={f} />)}
                </div>
              )}

              {cur.detail && (
                <div style={{
                  padding: 14, borderRadius: 11, background: t.acS,
                  border: `1px solid ${t.ac}33`, marginBottom: 10,
                }}>
                  <div style={{ fontSize: 11, color: t.ac, marginBottom: 6, fontWeight: 700 }}>くわしく</div>
                  <div style={{ fontSize: 13, color: t.tx, lineHeight: 1.95, whiteSpace: "pre-wrap" }}>{cur.detail}</div>
                </div>
              )}

              {cur.abbr && (
                <div style={{
                  padding: 14, borderRadius: 11, background: t.gdS,
                  border: `1px solid ${t.gd}33`, marginBottom: 12,
                }}>
                  <div style={{ fontSize: 11, color: t.gd, marginBottom: 6, fontWeight: 700 }}>呼び方・略語</div>
                  <div style={{ fontSize: 13, color: t.tx, lineHeight: 1.9 }}>{cur.abbr}</div>
                </div>
              )}

              <button
                onClick={() => {
                  if (isMastered) saveTermMastered(masteredTerms.filter(k => k !== cur.kanji));
                  else saveTermMastered([...masteredTerms, cur.kanji]);
                }}
                style={{
                  width: "100%", padding: "11px 8px", borderRadius: 10, marginBottom: 10, cursor: "pointer",
                  border: `1px solid ${isMastered ? t.gn : t.bd}`,
                  background: isMastered ? t.gnS : "transparent",
                  color: isMastered ? t.gn : t.dm, fontSize: 13, fontWeight: 700,
                }}
              >{isMastered ? "✓ 覚えた（出題しない）" : "この用語を「覚えた」にする"}</button>

              <button style={actionBtn("p")} onClick={nextTerm}>
                {termIdx + 1 >= termOrder.length ? "結果を見る" : "次の用語へ →"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // ══════════════════════════════════
  // ── CALCULATOR WIZARD ──
  // ══════════════════════════════════
  const renderCalc = () => (
    <div style={body}>
      {calcStep === 0 && (
        <div style={card}>
          <Dots total={4} cur={0} />
          <div style={question}>あがり方は？</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button style={bigBtn(t.gn, t.gnS)} onClick={() => { setCTsumo(true); setCalcStep(1); }}>ツモ</button>
            <button style={bigBtn(t.rd, t.rdS)} onClick={() => { setCTsumo(false); setCalcStep(1); }}>ロン</button>
          </div>
        </div>
      )}
      {calcStep === 1 && (
        <div style={card}>
          <Back onClick={() => setCalcStep(0)} />
          <Dots total={4} cur={1} />
          <div style={question}>あがった人は？</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button style={bigBtn(t.gd, t.gdS)} onClick={() => { setCParent(true); setCalcStep(2); }}>親</button>
            <button style={bigBtn(t.ac, t.acS)} onClick={() => { setCParent(false); setCalcStep(2); }}>子</button>
          </div>
        </div>
      )}
      {calcStep === 2 && (
        <div style={card}>
          {yakuPickerOpen ? (
            <YakuPicker
              isTsumo={cTsumo}
              isParent={cParent}
              lockedRiichi={false}
              onConfirm={(h) => {
                const pinfu = pickedYaku.includes("平和（ピンフ）");
                const chiitoi = pickedYaku.includes("七対子（チートイツ）");
                const naki = pickerNaki === true;
                setCHan(h); setGKnownNaki(pickerNaki); resetYakuPicker();
                if (h >= 5) { setCFu(30); setCalcStep(4); }
                else if (chiitoi) { setCFu(25); setCalcStep(4); }
                else if (pinfu && !naki) { setCFu(cTsumo ? 20 : 30); setCalcStep(4); }
                else setCalcStep(3);
              }}
              onCancel={() => setYakuPickerOpen(false)}
            />
          ) : (
            <>
              <Back onClick={() => setCalcStep(1)} />
              <Dots total={4} cur={2} />
              <div style={question}>翻数は？</div>
              <button style={{ ...actionBtn("p"), marginBottom: 12, background: t.gd, color: "#1a1a1a" }}
                onClick={() => { setPickedYaku([]); setPickerDora(0); setPickerUra(0); setPickerNaki(null); setGKnownNaki(null); setYakuPickerOpen(true); }}>
                📖 役を選んで計算する
              </button>
              <div style={{ fontSize: 12, color: t.dm, textAlign: "center", marginBottom: 10 }}>または直接選択</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9 }}>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => (
                  <button key={h} style={numBtn(cHan===h)}
                    onClick={() => { setCHan(h); if(h>=5){setCFu(30);setCalcStep(4);} else setCalcStep(3); }}>{h}翻</button>
                ))}
              </div>
              <button style={{
                width: "100%", marginTop: 10, height: 62, padding: "0 4px", borderRadius: 12,
                border: `2px solid ${cHan === 13 ? t.gd : t.bd}`,
                background: cHan === 13 ? t.gdS : "transparent",
                color: cHan === 13 ? t.gd : t.tx, fontSize: 19, fontWeight: 800, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
              }} onClick={() => { setCHan(13); setCFu(30); setCalcStep(4); }}>役満</button>
            </>
          )}
        </div>
      )}
      {calcStep === 3 && (
        <div style={card}>
          {!fuGuide && <><Back onClick={() => { setCalcStep(2); setCHan(null); resetFuGuide(); }} /><Dots total={4} cur={3} /></>}

          {!fuGuide ? (
            <>
              <div style={question}>符の入力方法</div>
              <button style={{ ...actionBtn("p"), marginBottom: 10 }} onClick={() => { initFuGuide(); }}>
                ガイドで符を計算する
              </button>
              <div style={{ fontSize: 12, color: t.dm, textAlign: "center", marginBottom: 10 }}>または直接選択</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                {validFuOptions(cHan, cTsumo).map(f => (
                  <button key={f} style={{ ...numBtn(cFu===f), fontSize: f >= 100 ? 16 : 19 }} onClick={() => { setCFu(f); setCalcStep(4); }}>{f}符</button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>符計算ガイド</span>
                <button style={{ background: t.acS, border: `1px solid ${t.ac}44`, borderRadius: 20, padding: "2px 10px", fontSize: 11, color: t.ac, fontWeight: 700, cursor: "pointer" }} onClick={() => setShowFuHelp(true)}>解説</button>
              </div>
              <FuGuideWizard isTsumo={cTsumo} onComplete={(fu) => { setCFu(fu); setCalcStep(4); resetFuGuide(); }} onBack={() => resetFuGuide()} />
            </>
          )}
        </div>
      )}
      {calcStep === 4 && calcResult && (
        <>
          <ScoreDisplay han={cHan} fu={cFu} limit={calcLimit} result={calcResult} tsumo={cTsumo} parent={cParent} />
          <button style={actionBtn("p")} onClick={resetCalc}>もう一度計算する</button>
          <button style={actionBtn()} onClick={() => setView("home")}>メニューに戻る</button>
        </>
      )}
    </div>
  );

  // ══════════════════════════════════
  // ── GAME SETUP WIZARD ──
  // ══════════════════════════════════
  const renderSetup = () => (
    <div style={body}>
      {/* Step 0: 対局日 */}
      {/* Step 1: 席決め */}
      {setupStep === 1 && (
        <div style={card}>
          <Back onClick={() => {
            // リーグ戦は出場者選択（リーグ側）へ戻す
            if (activeLeagueId) { resetSeatDraw(); setView("leaguestart"); }
            else setSetupStep(0);
          }} />
          <Dots total={activeLeagueId ? 3 : 5} cur={activeLeagueId ? 0 : 2} />
          <div style={question}>席決め</div>
          <div style={{ fontSize: 12, color: t.dm, textAlign: "center", marginBottom: 16, lineHeight: 1.7 }}>
            伏せた牌を1人ずつ引いて席を決めます
          </div>

          {/* 今引く人 */}
          {!seatDone && (
            <div style={{
              textAlign: "center", padding: "12px 10px", marginBottom: 16,
              background: t.acS, border: `1px solid ${t.ac}55`, borderRadius: 11,
            }}>
              <div style={{ fontSize: 11, color: t.dm, marginBottom: 3 }}>{seatTurn + 1}人目</div>
              <div style={{ fontSize: 19, fontWeight: 900, color: t.ac }}>
                {players[seatTurn]} さんが引く
              </div>
            </div>
          )}

          {/* 伏せた4枚 */}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 18 }}>
            {seatTiles.map((s, i) => {
              const open = s.by !== null;
              return (
                <button key={i} onClick={() => drawSeatTile(i)} disabled={open || seatDone}
                  style={{
                    width: 62, height: 84, borderRadius: 8, padding: 0,
                    cursor: open || seatDone ? "default" : "pointer",
                    border: open ? `2px solid ${t.gd}` : `2px solid ${t.bd}`,
                    background: open
                      ? "linear-gradient(160deg, #f8f6ef, #e6e1d0)"
                      : "linear-gradient(160deg, #1f6f4a, #145234)",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 3,
                    boxShadow: "0 2px 6px rgba(0,0,0,0.45)",
                    transition: "background 0.2s",
                  }}>
                  {open ? (
                    <>
                      <span style={{ fontSize: 30, fontWeight: 900, color: "#1a1a1a", fontFamily: "serif", lineHeight: 1 }}>
                        {s.wind}
                      </span>
                      <span style={{
                        fontSize: 9, color: "#5a5a5a", maxWidth: 56,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{players[s.by]}</span>
                    </>
                  ) : (
                    <span style={{
                      width: 44, height: 60, borderRadius: 6,
                      border: "2.5px solid rgba(255,255,255,0.6)",
                      background: "rgba(255,255,255,0.12)",
                    }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* 結果 */}
          {seatDone && (
            <div style={{
              padding: 14, borderRadius: 11, marginBottom: 14,
              background: t.gdS, border: `1px solid ${t.gd}55`,
            }}>
              <div style={{ fontSize: 11, color: t.gd, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>
                席順が決まりました（この東は仮親です）
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {players.slice(0, PC).map((nm, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "9px 10px", borderRadius: 9,
                    background: i === 0 ? t.gdS : t.sf,
                    border: `1px solid ${i === 0 ? t.gd : t.bd}`,
                  }}>
                    <span style={{
                      fontSize: 17, fontWeight: 900, fontFamily: "serif",
                      color: i === 0 ? t.gd : t.tx, flexShrink: 0,
                    }}>{WIND_ORDER[i]}</span>
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: t.tx,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{nm}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: t.dm, textAlign: "center", marginTop: 8, lineHeight: 1.7 }}>
                東の <b style={{ color: t.gd }}>{players[0]}</b> さんが<b style={{ color: t.gd }}>仮親</b>です<br />
                次のページでサイコロを振って親（起家）を決めます
              </div>
            </div>
          )}

          {seatDone ? (
            <>
              <button style={actionBtn("p")} onClick={() => { setOyaDice(null); setSetupStep(2); }}>次へ</button>
              <button style={actionBtn()} onClick={resetSeatDraw}>引き直す</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, color: t.dm, textAlign: "center", marginBottom: 14 }}>
                好きな牌をタップしてください
              </div>
              <button style={actionBtn()} onClick={() => { setOyaDice(null); setSetupStep(2); }}>
                席決めをスキップ
              </button>
              <div style={{ fontSize: 12, color: t.dm, textAlign: "center", marginTop: 10, lineHeight: 1.7 }}>
                スキップすると仮席のまま、以下の席順でスタートします
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
                marginTop: 10, padding: 12, borderRadius: 12,
                background: t.sf, border: `1px solid ${t.bd}`,
              }}>
                {players.slice(0, PC).map((nm, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{
                      fontSize: 16, fontWeight: 900, lineHeight: 1, flexShrink: 0,
                      color: i === 0 ? "#1a1a1a" : t.tx,
                      background: i === 0 ? t.gd : t.card,
                      border: `1px solid ${i === 0 ? t.gd : t.bd}`,
                      borderRadius: 6, padding: "5px 8px",
                    }}>{WIND_ORDER[i]}</span>
                    <span style={{
                      fontSize: 15, fontWeight: 700, color: t.tx,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{nm}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 2: 親決め（仮親がサイコロを振る） */}
      {setupStep === 2 && (() => {
        const nextStep = 4;
        const newDealer = oyaDice ? (oyaDice.sum - 1) % PC : 0;
        const applyOya = () => {
          if (newDealer > 0) {
            // 席の並び（反時計回り）を保ったまま、起家が東になるよう回す
            setPlayers(prev => {
              const head = prev.slice(0, PC);
              const rest = prev.slice(PC);
              return head.slice(newDealer).concat(head.slice(0, newDealer)).concat(rest);
            });
          }
          setSetupStep(nextStep);
        };
        const roll = () => {
          if (oyaRolling) return;
          playDiceSound();
          setOyaRolling(true);
          setOyaDice(null);
          try { if (navigator.vibrate) navigator.vibrate(20); } catch {}
          let n = 0;
          const base = (oyaDice?.spin || 0) + 1;
          const spin = setInterval(() => {
            setOyaDice({ d1: 1 + Math.floor(Math.random() * 6), d2: 1 + Math.floor(Math.random() * 6), sum: 0, spin: base + n });
            if (++n > 8) {
              clearInterval(spin);
              const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6);
              setOyaDice({ d1: a, d2: b, sum: a + b, spin: base + n });
              setOyaRolling(false);
            }
          }, 90);
        };
        const oyaSpin = oyaDice?.spin || 0;
        return (
          <div style={card}>
            <Back onClick={() => setSetupStep(1)} />
            <Dots total={activeLeagueId ? 3 : 5} cur={activeLeagueId ? 1 : 3} />
            <div style={question}>親決め</div>
            {oyaDice?.sum > 0 && !oyaRolling ? (
              <div style={{
                padding: "14px 12px", borderRadius: 14, marginBottom: 12, textAlign: "center",
                background: t.gdS, border: `2px solid ${t.gd}`,
              }}>
                <div style={{ fontSize: 12, color: t.dm, fontWeight: 700 }}>
                  出た目 <b style={{ color: t.gd, fontSize: 16 }}>{oyaDice.sum}</b>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: t.gd, lineHeight: 1.3, margin: "2px 0 6px" }}>
                  {players[newDealer]} さん
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: t.tx }}>が起家（親）です</div>
                {newDealer > 0 && (
                  <div style={{ fontSize: 11, color: t.dm, marginTop: 8, lineHeight: 1.7 }}>
                    座る場所はそのままで、東南西北だけ割り当て直します
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={{
                  padding: "14px 12px", borderRadius: 14, marginBottom: 12, textAlign: "center",
                  background: t.gdS, border: `2px solid ${t.gd}66`,
                }}>
                  <div style={{ fontSize: 12, color: t.dm, fontWeight: 700, letterSpacing: "0.08em" }}>仮親</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: t.gd, lineHeight: 1.3, margin: "2px 0 6px" }}>
                    {players[0]} さん
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: t.tx }}>サイコロを振ってください</div>
                </div>
                <div style={{ fontSize: 11, color: t.dm, textAlign: "center", marginBottom: 12, lineHeight: 1.7 }}>
                  仮親から反時計回りに数えて、出た目の席の人が起家（最初の親）になります
                </div>
              </>
            )}

            <button onClick={roll} disabled={oyaRolling} style={{
              width: "100%", padding: "22px 12px", borderRadius: 16, cursor: oyaRolling ? "default" : "pointer",
              border: `2px solid ${t.gd}55`, background: "linear-gradient(160deg, #1f5c3d, #14402b)",
              marginBottom: 12,
            }}>
              <div style={{ display: "flex", gap: 22, justifyContent: "center", padding: "6px 0 2px" }}>
                <Die value={oyaDice?.d1 || 1} size={62} rolling={oyaRolling} spin={oyaSpin} />
                <Die value={oyaDice?.d2 || 1} size={62} rolling={oyaRolling} spin={oyaSpin + 1} />
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: 700, marginTop: 12 }}>
                {oyaRolling ? "振っています…" : oyaDice?.sum ? "もう一度振る" : "タップしてサイコロを振る"}
              </div>
            </button>

            <button style={{ ...actionBtn("p"), opacity: oyaDice?.sum > 0 ? 1 : 0.4 }}
              disabled={!(oyaDice?.sum > 0)} onClick={applyOya}>次へ</button>
            <button style={actionBtn()} onClick={() => setSetupStep(nextStep)}>
              サイコロを使わない（今の東が親）
            </button>
          </div>
        );
      })()}

      {/* Step 3: ルール設定 */}
      {setupStep === 3 && (
        <div style={card}>
          <Back onClick={() => { setView("menu"); }} />
          <Dots total={5} cur={0} />
          <div style={question}>人数・試合形式・ルール</div>
          {/* 人数（四人麻雀 / 三人麻雀） */}
          <div style={{ fontSize: 12, color: t.dm, marginBottom: 8 }}>人数</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[[4, "四人麻雀", "東南西北"], [3, "三人麻雀", "東南西"]].map(([n, lb, sub]) => (
              <button key={n} onClick={() => {
                if (n === playerCount) return;
                setPlayerCount(n);
                setSeatDone(false); setSeatTiles([]); setSeatTurn(0);
                // 三人麻雀は連盟ルールを初期値にする（4人に戻すと元の既定へ）
                if (n === 3) setRules(r => ({ ...r, ...SANMA_DEFAULT_RULES }));
                else setRules({ ...defaultRules });
              }} style={{
                flex: 1, padding: "13px 6px", borderRadius: 11, cursor: "pointer",
                border: `2px solid ${playerCount === n ? t.ac : t.bd}`,
                background: playerCount === n ? t.acS : "transparent",
                color: playerCount === n ? t.ac : t.dm,
              }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{lb}</div>
                <div style={{ fontSize: 10, marginTop: 3, opacity: 0.85 }}>{sub}</div>
              </button>
            ))}
          </div>

          {/* 試合形式 */}
          <div style={{ fontSize: 12, color: t.dm, marginBottom: 8 }}>試合形式</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[["tonpu", "東風戦", "東場のみ"], ["hanchan", "半荘戦", "東＋南場"], ["zenchan", "全荘戦", "東南西北"]].map(([k, lb, sub]) => (
              <button key={k} onClick={() => setMatchType(k)} style={{
                flex: 1, padding: "13px 4px", borderRadius: 11, cursor: "pointer",
                border: `2px solid ${matchType === k ? t.ac : t.bd}`,
                background: matchType === k ? t.acS : "transparent",
                color: matchType === k ? t.ac : t.dm,
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>{lb}</div>
                <div style={{ fontSize: 10, marginTop: 3, opacity: 0.85, whiteSpace: "nowrap" }}>{sub}</div>
              </button>
            ))}
          </div>


          {/* 前回と同じルールで始める */}
          {lastRules && (() => {
            const same = JSON.stringify(rules) === JSON.stringify(lastRules);
            const sum = [
              lastRules.agariRenchan ? "あがり連荘" : lastRules.tenpaiRenchan ? "テンパイ連荘" : "無条件連荘",
              lastRules.multiRon === "triple" ? "トリプルロン" : lastRules.multiRon === "double" ? "ダブロン" : "頭ハネ",
              lastRules.kuitan ? "食いタンあり" : "食いタンなし",
              lastRules.doubleYakuman ? "ダブル役満あり" : null,
              `持ち点${(lastRules.startPoints || 0).toLocaleString()}`,
            ].filter(Boolean).join(" ・ ");
            return (
              <div style={{
                padding: 14, marginBottom: 18, borderRadius: 12,
                background: same ? t.gnS : t.acS,
                border: `1px solid ${same ? t.gn : t.ac}55`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: same ? t.gn : t.ac, marginBottom: 5 }}>
                  {same ? "✓ 前回と同じルールです" : "前回のルール"}
                </div>
                <div style={{ fontSize: 11, color: t.dm, lineHeight: 1.8, marginBottom: 11 }}>{sum}</div>
                <button disabled={!matchType}
                  onClick={() => { setRules({ ...lastRules }); setSetupStep(0); }} style={{
                  width: "100%", padding: "13px 10px", borderRadius: 10, cursor: matchType ? "pointer" : "default", border: "none",
                  background: same ? t.gn : t.ac, color: "#fff", fontSize: 14, fontWeight: 800,
                  opacity: matchType ? 1 : 0.4,
                }}>{same ? "このままメンバー決定へ" : "前回と同じルールでメンバー決定へ"}</button>
                <div style={{ fontSize: 10, color: matchType ? t.dm : t.gd, marginTop: 7, textAlign: "center", fontWeight: matchType ? 400 : 700 }}>
                  {matchType ? "変更したい場合は、下の「ルールを変更する」から" : "まず上の試合形式を選んでください"}
                </div>
              </div>
            );
          })()}

          {/* ルールの詳細は折りたたみ（変更したいときだけ開く） */}
          <button onClick={() => setRulesOpen(v => !v)} style={{
            width: "100%", padding: "13px 10px", borderRadius: 11, cursor: "pointer",
            border: `1px solid ${rulesOpen ? t.ac : t.bd}`,
            background: rulesOpen ? t.acS : t.sf,
            color: rulesOpen ? t.ac : t.tx, fontSize: 14, fontWeight: 800, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <span>{rulesOpen ? "ルールの詳細を閉じる" : "ルールを変更する"}</span>
            <span style={{ fontSize: 12, transform: rulesOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
          </button>

          {rulesOpen && (<>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 4, letterSpacing: "0.05em" }}>流局したときの親</div>
            <div style={{ fontSize: 10, color: t.dm, marginBottom: 8 }}>誰もアガらずに流局した場合、親を続けるかどうか</div>
            {[
              { key: "agari",  label: "あがり連荘",   desc: "流局したら親は必ず流れる（一般的）" },
              { key: "tenpai", label: "テンパイ連荘", desc: "親がテンパイなら続行、ノーテンなら流れる" },
              { key: "always", label: "無条件連荘",   desc: "流局したら親は必ず続行（ノーテンでも）" },
            ].map(o => {
              const cur = rules.agariRenchan ? "agari" : rules.tenpaiRenchan ? "tenpai" : "always";
              const on = cur === o.key;
              return (
                <button key={o.key} onClick={() => setRules(r => ({
                  ...r,
                  agariRenchan: o.key === "agari",
                  tenpaiRenchan: o.key === "tenpai",
                }))} style={{
                  width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "11px 12px", marginBottom: 6, borderRadius: 10, cursor: "pointer",
                  border: `2px solid ${on ? t.ac : t.bd}`,
                  background: on ? t.acS : "transparent",
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    border: `2px solid ${on ? t.ac : t.bd}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {on && <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.ac }} />}
                  </span>
                  <span>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: on ? t.ac : t.tx }}>{o.label}</span>
                    <span style={{ display: "block", fontSize: 11, color: t.dm, marginTop: 2, lineHeight: 1.5 }}>{o.desc}</span>
                  </span>
                </button>
              );
            })}
            <div style={{ fontSize: 10, color: t.dm, lineHeight: 1.7, marginTop: 2 }}>
              ※ どのルールでも、ノーテン罰符3,000点のやりとりと本場の加算は行われます
            </div>
          </div>

          <div style={{ marginBottom: 8, marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 4, letterSpacing: "0.05em" }}>複数人が同時にロン</div>
            <div style={{ fontSize: 10, color: t.dm, marginBottom: 8 }}>1つの捨て牌に2人以上がロンを宣言したときの扱い</div>
            {[
              { key: "atamahane", label: "頭ハネ（アタマハネ）", desc: "放銃者に近い1人だけがアガリ。他は無効" },
              { key: "double",    label: "ダブロンあり",         desc: "2人まで同時にアガれる" },
              { key: "triple",    label: "トリプルロンあり",     desc: "3人同時のアガリも認める" },
            ].map(o => {
              const on = (rules.multiRon || "atamahane") === o.key;
              return (
                <button key={o.key} onClick={() => setRules(r => ({ ...r, multiRon: o.key }))} style={{
                  width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "11px 12px", marginBottom: 6, borderRadius: 10, cursor: "pointer",
                  border: `2px solid ${on ? t.ac : t.bd}`,
                  background: on ? t.acS : "transparent",
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    border: `2px solid ${on ? t.ac : t.bd}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {on && <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.ac }} />}
                  </span>
                  <span>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: on ? t.ac : t.tx }}>{o.label}</span>
                    <span style={{ display: "block", fontSize: 11, color: t.dm, marginTop: 2, lineHeight: 1.5 }}>{o.desc}</span>
                  </span>
                </button>
              );
            })}
            <div style={{ fontSize: 10, color: t.dm, lineHeight: 1.7, marginTop: 2 }}>
              ※ 本場と供託は、放銃者から反時計回りに最も近い人が受け取ります
            </div>
          </div>

          <div style={{ marginBottom: 8, marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 4, letterSpacing: "0.05em" }}>オーラス（最終局）</div>
            <div style={{ fontSize: 10, color: t.dm, marginBottom: 8 }}>
              {matchType === "tonpu" ? "東4局" : matchType === "zenchan" ? "北4局" : "南4局"}で親がアガった、または流局で親が続く場合の扱い
            </div>
            {toggleRow("親がトップなら終了", rules.orasYame !== false, () => setRules(r => ({ ...r, orasYame: r.orasYame === false })))}
            <div style={{ fontSize: 10, color: t.dm, lineHeight: 1.7, marginTop: 6 }}>
              {rules.orasYame !== false
                ? "ON：親がトップの状態でアガる／テンパイで流局すると、そこで対局終了（アガリやめ・テンパイやめ）。トップでなければ連荘して続行します。"
                : "OFF：親がトップでも連荘して続行します。子がアガるか、親が流れるまで終わりません。"}
            </div>
          </div>

          <div style={{ marginBottom: 8, marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 8, letterSpacing: "0.05em" }}>その他</div>
            {toggleRow("食いタンあり", rules.kuitan, () => setRules(r => ({ ...r, kuitan: !r.kuitan })))}
            <div style={{ fontSize: 10, color: t.dm, paddingLeft: 2, marginTop: -4, marginBottom: 6, lineHeight: 1.7 }}>
              鳴いたタンヤオを認めるか。OFFだと鳴くと役なしになる場面が増えます
            </div>
            {toggleRow("後付けあり", rules.atozuke, () => setRules(r => ({ ...r, atozuke: !r.atozuke })))}
            <div style={{ fontSize: 10, color: t.dm, paddingLeft: 2, marginTop: -4, marginBottom: 6, lineHeight: 1.7 }}>
              役が未確定のまま鳴き、あとから役を確定させてよいか。OFFは完全先付け
            </div>
            {toggleRow("切り上げ満貫", rules.kiriage, () => setRules(r => ({ ...r, kiriage: !r.kiriage })))}
            <div style={{ fontSize: 10, color: t.dm, paddingLeft: 2, marginTop: -4, marginBottom: 6 }}>
              ONにすると4翻30符・3翻60符を満貫扱い
            </div>
            {toggleRow("ダブル役満あり", rules.doubleYakuman, () => setRules(r => ({ ...r, doubleYakuman: !r.doubleYakuman })))}
            <div style={{ fontSize: 10, color: t.dm, paddingLeft: 2, marginTop: -4, marginBottom: 6 }}>
              役満の複合（大三元＋字一色など）を2倍・3倍で計算。役の選択画面から適用されます
            </div>
            {toggleRow("トビで終了", rules.tobiEnd !== false, () => setRules(r => ({ ...r, tobiEnd: r.tobiEnd === false })))}
            <div style={{ fontSize: 10, color: t.dm, paddingLeft: 2, marginTop: -4, marginBottom: 6 }}>
              誰かの持ち点が0未満になった時点で終局（ハコ下・ドボン）
            </div>
          </div>

          <div style={{ marginTop: 18, marginBottom: 8 }}>
            <UmaOkaSettings rules={rules} onChange={(patch) => setRules(r => ({ ...r, ...patch }))} />
            <RateSetting rate={rules.rate || 0} onChange={(v) => setRules(r => ({ ...r, rate: v }))}
              unit={rules.rateUnit} onUnitChange={(u) => setRules(r => ({ ...r, rateUnit: u }))} />
          </div>

          <RuleHelp />
          </>)}


          {/* 詳細を開いているときだけ、下の進むボタンを出す */}
          {(rulesOpen || !lastRules) && (
            <div style={{ marginTop: 16 }}>
              <button style={{ ...actionBtn("p"), opacity: matchType ? 1 : 0.4 }} disabled={!matchType}
                onClick={() => { setRulesOpen(false); setSetupStep(0); }}>ルール確定・メンバー選択へ</button>
              {!matchType && (
                <div style={{ fontSize: 11, color: t.dm, textAlign: "center", marginTop: 8 }}>試合形式を選んでください</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 0: 参加者 */}
      {setupStep === 0 && (
        <div style={card}>
          <Back onClick={() => setSetupStep(3)} />
          <Dots total={5} cur={1} />
          <div style={question}>メンバー決定</div>
          <div style={{ fontSize: 12, color: t.dm, textAlign: "center", marginBottom: 6 }}>名前の欄をタップして選択</div>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <button onClick={() => { setView("names"); setNewNameInput(""); setEditNameIdx(null); }} style={{
              background: "none", border: "none", color: t.ac, fontSize: 11, cursor: "pointer", textDecoration: "underline",
            }}>👤 リストの名前を編集</button>
          </div>

          {/* グループ */}
          <div style={{ marginBottom: 16 }}>
            {(() => {
              // 選択中の人数に合うグループだけ表示（3人グループと4人グループを分ける）
              const pcGroups = groups.filter(g => (g.members || []).length === PC);
              return (
                <>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.dm, marginBottom: 3 }}>
              グループ{pcGroups.length > 0 ? `（タップで${PC}人をまとめて選択）` : ""}
            </div>
            {pcGroups.length === 0 && (
              <div style={{ fontSize: 10, color: t.dm, marginBottom: 7, lineHeight: 1.7 }}>
                いまの{PC}人をまとめて登録しておくと、次回からワンタップで呼び出せます
                {groups.length > 0 ? `（${PC === 3 ? 4 : 3}人のグループは${PC === 3 ? "四" : "三"}人麻雀で表示されます）` : ""}
              </div>
            )}
            {pcGroups.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 9 }}>
                {pcGroups.map(g => {
                  const active = g.members.every((m, k) => players[k] === m);
                  return (
                    <span key={g.id} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      border: `1px solid ${active ? t.ac : t.bd}`,
                      background: active ? t.acS : "transparent",
                      borderRadius: 9, padding: "7px 8px 7px 11px",
                    }}>
                      <button onClick={() => {
                        setPlayers(prev => { const np = [...prev]; g.members.forEach((m, k) => { np[k] = m; }); return np; });
                        setPlayerMode([false, false, false, false]);
                      }}
                        style={{
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                          fontSize: 13, fontWeight: 700, color: active ? t.ac : t.tx,
                        }}>{g.name}</button>
                      <button onClick={() => {
                        if (!window.confirm(`グループ「${g.name}」を削除しますか？`)) return;
                        saveGroups(groups.filter(x => x.id !== g.id));
                      }} style={{
                        background: "none", border: "none", cursor: "pointer", padding: "0 2px",
                        color: t.dm, fontSize: 13, lineHeight: 1,
                      }}>✕</button>
                    </span>
                  );
                })}
              </div>
            )}

            {showGroupSave ? (
              <div style={{ display: "flex", gap: 7 }}>
                <input
                  type="text" value={groupNameInput} autoFocus
                  onChange={e => setGroupNameInput(e.target.value)}
                  placeholder="グループ名（例: 金曜メンバー）"
                  style={{ ...inputStyle, fontSize: 14, flex: 1 }}
                />
                <button
                  disabled={!groupNameInput.trim()}
                  onClick={() => {
                    saveGroups([...groups, { id: "g_" + Date.now(), name: groupNameInput.trim(), members: players.slice(0, PC) }]);
                    setGroupNameInput(""); setShowGroupSave(false);
                  }}
                  style={{
                    padding: "0 16px", borderRadius: 9, border: "none", cursor: "pointer",
                    background: t.ac, color: "#fff", fontSize: 13, fontWeight: 700,
                    opacity: groupNameInput.trim() ? 1 : 0.4, flexShrink: 0,
                  }}>保存</button>
                <button onClick={() => { setShowGroupSave(false); setGroupNameInput(""); }} style={{
                  padding: "0 12px", borderRadius: 9, border: `1px solid ${t.bd}`, cursor: "pointer",
                  background: "transparent", color: t.dm, fontSize: 13, flexShrink: 0,
                }}>✕</button>
              </div>
            ) : (
              <button
                onClick={() => setShowGroupSave(true)}
                disabled={!players.slice(0, PC).every(p => p.trim())}
                style={{
                  width: "100%", padding: "10px 8px", borderRadius: 9, cursor: "pointer",
                  border: `1px dashed ${t.bd}`, background: "transparent", color: t.dm,
                  fontSize: 12, fontWeight: 700, opacity: players.slice(0, PC).every(p => p.trim()) ? 1 : 0.4,
                }}>＋ 今の{PC}人をグループとして保存</button>
            )}
                </>
              );
            })()}
          </div>

          {/* 席の並べ替え: 行を長押し→ドラッグ */}
          <div style={{ fontSize: 11, color: t.dm, textAlign: "center", marginBottom: 10, lineHeight: 1.7 }}>
            並べ替えは行を<b style={{ color: t.tx }}>長押し</b>して、そのまま上下にドラッグ
          </div>

          {players.slice(0, PC).map((p, i) => {
            const isCustom = playerMode[i]; // true = 直接入力モード
            const ds = dragSeat;
            const isDragging = ds && ds.from === i;
            let shiftY = 0;
            if (ds && !isDragging) {
              if (ds.from < ds.target && i > ds.from && i <= ds.target) shiftY = -ds.rowH;
              else if (ds.from > ds.target && i >= ds.target && i < ds.from) shiftY = ds.rowH;
            }
            return (
              <div key={i}
                ref={el => { seatRowRefs.current[i] = el; }}
                onTouchStart={(e) => seatDragStart(e, i)}
                onTouchMove={seatDragPreMove}
                onTouchEnd={seatDragCancelIfPending}
                onMouseDown={(e) => seatDragStart(e, i)}
                onMouseMove={seatDragPreMove}
                onMouseUp={seatDragCancelIfPending}
                onMouseLeave={seatDragCancelIfPending}
                onClickCapture={(e) => { if (seatSuppressClick.current) { e.preventDefault(); e.stopPropagation(); } }}
                onContextMenu={(e) => { if (dragSeat || seatSuppressClick.current) e.preventDefault(); }}
                style={{
                  marginBottom: 10, position: "relative",
                  display: "flex", alignItems: "center", gap: 10,
                  zIndex: isDragging ? 10 : 1,
                  WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none",
                }}>
                {/* 風マークは席に固定（動かさない）。席決め前なので「仮」を添える */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: t.dm, lineHeight: 1, letterSpacing: "0.1em" }}>仮</span>
                  <span style={{
                    fontSize: 18, fontWeight: 900, lineHeight: 1,
                    color: i === 0 ? "#1a1a1a" : t.tx,
                    background: i === 0 ? t.gd : t.sf,
                    border: `1px solid ${i === 0 ? t.gd : t.bd}`,
                    borderRadius: 6, padding: "5px 8px",
                  }}>{WINDS[i]}</span>
                </div>

                {/* 名前の欄だけがドラッグで移動する */}
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", gap: 10, minWidth: 0,
                  position: "relative",
                  transform: isDragging ? `translateY(${ds.offset}px) scale(1.02)` : shiftY ? `translateY(${shiftY}px)` : "none",
                  transition: isDragging ? "none" : "transform 0.15s ease",
                  borderRadius: 12,
                  background: isDragging ? t.sf : "transparent",
                  boxShadow: isDragging ? "0 8px 22px rgba(0,0,0,0.5)" : "none",
                  outline: isDragging ? `2px solid ${t.ac}88` : "none",
                }}>                  {isCustom ? (
                    <>
                      <input
                        autoFocus
                        style={{ ...inputStyle, flex: 1, WebkitUserSelect: "text", userSelect: "text" }}
                        placeholder="名前を入力"
                        value={p}
                        onChange={e => { const np = [...players]; np[i] = e.target.value; setPlayers(np); }}
                        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        onBlur={() => {
                          // 入力を終えたら「リスト」を押さなくても自動で登録し、選択モードに戻す
                          const v = (p || "").trim();
                          if (!v || /^[A-D]プレーヤー$/.test(v)) return;
                          const prev = seatAutoReg.current[i];
                          let list = presetNames;
                          // この行で直前に自動登録した名前は置き換える（打ち直しのゴミを残さない）
                          if (prev && prev !== v && list.includes(prev)) list = list.filter(n => n !== prev);
                          if (!list.includes(v)) list = [...list, v];
                          if (list !== presetNames) savePresetNames(list);
                          seatAutoReg.current[i] = v;
                          if (v !== p) { const np = [...players]; np[i] = v; setPlayers(np); }
                          const nm = [...playerMode]; nm[i] = false; setPlayerMode(nm);
                        }}
                      />
                      <button
                        style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 8, padding: "8px 10px", color: t.dm, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}
                        onClick={() => {
                          // 入力した名前をリストに自動登録（重複・空・初期名は除く）
                          const v = (p || "").trim();
                          if (v && !presetNames.includes(v) && !/^[A-D]プレーヤー$/.test(v)) {
                            savePresetNames([...presetNames, v]);
                          }
                          const nm = [...playerMode]; nm[i] = false; setPlayerMode(nm);
                        }}
                      >リスト</button>
                    </>
                  ) : (
                    <select
                      value={presetNames.includes(p) ? p : "__current__"}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === "__custom__") {
                          const nm = [...playerMode]; nm[i] = true; setPlayerMode(nm);
                          const np = [...players]; np[i] = ""; setPlayers(np);
                        } else {
                          const np = [...players]; np[i] = v; setPlayers(np);
                        }
                      }}
                      style={{ ...selectStyle, flex: 1, fontSize: 15 }}
                    >
                      {!presetNames.includes(p) && <option value="__current__">{p}</option>}
                      {presetNames.map(n => {
                        const usedByOther = players.includes(n) && players[i] !== n;
                        return <option key={n} value={n}>{usedByOther ? `${n}（使用中）` : n}</option>;
                      })}
                      <option value="__custom__">✏️ 直接入力…</option>
                    </select>
                  )}
                  <span style={{ flexShrink: 0, color: t.dm, fontSize: 20, lineHeight: 1, padding: "0 2px", touchAction: "none", cursor: "grab" }}>≡</span>
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 8 }}>
            <button
              style={{
                ...actionBtn("p"),
                opacity: (players.slice(0, PC).every(p => p.trim()) && matchType) ? 1 : 0.4,
              }}
              disabled={!players.slice(0, PC).every(p => p.trim()) || !matchType}
              onClick={() => {
                // 直接入力のまま進んだ名前もリストへ自動登録
                const adds = players.slice(0, PC)
                  .map(x => (x || "").trim())
                  .filter(x => x && !presetNames.includes(x) && !/^[A-D]プレーヤー$/.test(x));
                if (adds.length) savePresetNames([...presetNames, ...Array.from(new Set(adds))]);
                resetSeatDraw(); setSetupStep(1);
              }}
            >席決めへ</button>
            <button
              style={{
                ...actionBtn(),
                marginTop: 8, marginBottom: 0,
                border: `1px solid ${t.gn}66`, color: t.gn, fontWeight: 800,
                opacity: (players.slice(0, PC).every(p => p.trim()) && matchType) ? 1 : 0.4,
              }}
              disabled={!players.slice(0, PC).every(p => p.trim()) || !matchType}
              onClick={() => {
                const adds = players.slice(0, PC)
                  .map(x => (x || "").trim())
                  .filter(x => x && !presetNames.includes(x) && !/^[A-D]プレーヤー$/.test(x));
                if (adds.length) savePresetNames([...presetNames, ...Array.from(new Set(adds))]);
                setSeatRot(0);
                startGame();
              }}
            >⚡ クイックスタート</button>
            <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginTop: 6, lineHeight: 1.6 }}>
              席決め・親決め・確認をスキップして、この並びのまま開始します
            </div>
            {!matchType && (
              <div style={{ fontSize: 11, color: t.dm, textAlign: "center", marginTop: 8 }}>
                試合形式を選んでください
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: 確認 */}
      {setupStep === 4 && (
        <div>
          <div style={card}>
            <div style={{ ...question, marginBottom: 10 }}>対局設定の確認</div>

            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div style={{
                display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8,
                fontSize: 13, fontWeight: 700, color: t.tx,
                borderBottom: `1px solid ${t.bd}33`, paddingBottom: 8, marginBottom: 4,
              }}>
                <span>{gameDate}</span>
                <span style={{ color: t.dm }}>|</span>
                <span style={{ color: t.gd }}>{MATCH_LABEL(matchType)}</span>
                <span style={{ color: t.dm }}>|</span>
                <span>{PC === 3 ? "三人麻雀" : "四人麻雀"}</span>
                <span style={{ color: t.dm }}>|</span>
                <span>{(rules.startPoints ?? 25000).toLocaleString()} / {(rules.returnPoints ?? 30000).toLocaleString()}</span>
              </div>
              <div style={{ borderBottom: `1px solid ${t.bd}33`, padding: "2px 0 8px" }}>
                {/* 卓の並びで表示（手前が起家。実際に座る位置と同じ配置） */}
                {(() => {
                  const seatBox = (i) => (
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      padding: "6px 6px", borderRadius: 9, minWidth: 0,
                      background: i === 0 ? "rgba(234,179,8,0.2)" : "rgba(0,0,0,0.45)",
                      border: `1px solid ${i === 0 ? t.gd : "rgba(255,255,255,0.25)"}`,
                    }}>
                      <span style={{
                        fontSize: 13, fontWeight: 900, lineHeight: 1,
                        color: i === 0 ? "#1a1a1a" : "#fff",
                        background: i === 0 ? t.gd : "rgba(0,0,0,0.5)",
                        border: `1px solid ${i === 0 ? t.gd : "rgba(255,255,255,0.3)"}`,
                        borderRadius: 5, padding: "2px 7px",
                      }}>{WINDS[i]}</span>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: "#fff", maxWidth: "100%",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{players[i]}</span>
                    </div>
                  );
                  return (
                    <div style={{
                      marginTop: 4, maxWidth: 345, marginLeft: "auto", marginRight: "auto",
                      aspectRatio: "1 / 1", borderRadius: 14, position: "relative",
                      backgroundImage: `url(${TABLE_IMG})`, backgroundSize: "100% 100%",
                      backgroundColor: "#103526",
                    }}>
                      {/* 向かい（三人麻雀ではなし） */}
                      {PC === 4 && (
                        <div style={{ position: "absolute", top: "7%", left: "50%", transform: "translateX(-50%)", maxWidth: "40%" }}>{seatBox((2 + seatRot) % PC)}</div>
                      )}
                      {/* 左 */}
                      <div style={{ position: "absolute", left: "7%", top: PC === 3 ? "34%" : "50%", transform: "translateY(-50%)", maxWidth: "34%" }}>{seatBox(((PC === 3 ? 2 : 3) + seatRot) % PC)}</div>
                      {/* 右 */}
                      <div style={{ position: "absolute", right: "7%", top: PC === 3 ? "34%" : "50%", transform: "translateY(-50%)", maxWidth: "34%" }}>{seatBox((1 + seatRot) % PC)}</div>
                      {/* 手前 */}
                      <div style={{ position: "absolute", bottom: "7%", left: "50%", transform: "translateX(-50%)", maxWidth: "40%" }}>{seatBox((0 + seatRot) % PC)}</div>
                      {/* 表示の向きを回転 */}
                      <button onClick={() => setSeatRot(r => (r + PC - 1) % PC)} aria-label="表示を回転" style={{
                        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                        width: 56, height: 56, borderRadius: 28,
                        border: "1.5px solid rgba(255,255,255,0.4)", background: "rgba(0,0,0,0.55)",
                        color: "#fff", fontSize: 26, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 3px 12px rgba(0,0,0,0.45)",
                      }}>🔄</button>
                    </div>
                  );
                })()}
                <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginTop: 5, lineHeight: 1.7 }}>
                  手前: <b style={{ color: seatRot === 0 ? t.gd : t.tx }}>{players[(0 + seatRot) % PC]}</b>
                  {seatRot === 0 ? "（東・起家）" : ""} ・ 🔄で表示の向きを回せます（対局画面にも反映）
                </div>
              </div>
              <div style={{ padding: "6px 0 0" }}>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
                  {(() => {
                    const chip = (label) => (
                      <span key={label} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, background: t.sf, border: `1px solid ${t.bd}` }}>{label}</span>
                    );
                    const renchan = rules.agariRenchan ? "あがり連荘" : rules.tenpaiRenchan ? "テンパイ連荘" : "無条件連荘";
                    return [
                      chip(renchan),
                      rules.kuitan && chip("食いタン"),
                      rules.atozuke && chip("後付け"),
                      rules.kiriage && chip("切り上げ満貫"),
                      rules.doubleYakuman && chip("ダブル役満"),
                      chip(rules.orasYame !== false ? "オーラス親トップで終了" : "オーラスやめなし"),
                      chip(rules.multiRon === "triple" ? "トリプルロンあり" : rules.multiRon === "double" ? "ダブロンあり" : "頭ハネ"),
                    ].filter(Boolean);
                  })()}
                </div>
              </div>
            </div>
          </div>

          <button style={actionBtn("p")} onClick={startGame}>対局開始！</button>
          <button style={actionBtn()} onClick={() => setSetupStep(activeLeagueId ? 1 : 3)}>
            {activeLeagueId ? "席決めをやり直す" : "設定を修正する"}
          </button>
        </div>
      )}
    </div>
  );

  // ══════════════════════════════════
  // ── GAME PLAY ──
  // ══════════════════════════════════
  // ══════════════════════════════════
  // ── TABLE MODE (卓上モード) ──
  // 卓の中央にスマホを置き、各プレイヤーが自分の点数を正面から読める向きに回転
  // ══════════════════════════════════
  const renderTableMode = () => {
    // ルールで許される同時ロンの人数（1=頭ハネ）
    const mrRule = (gameConfig || {}).rules?.multiRon || "atamahane";
    const multiRonMax = mrRule === "triple" ? 3 : mrRule === "double" ? 2 : 1;
    // 席順: players[0]=手前, [1]=右, [2]=向かい, [3]=左（反時計回り＝下家が右）
    // 卓（正方形）の一辺に対する比率で決める。端末サイズが変わっても重ならない
    const PW = "37cqmin";   // パネルの長辺
    const PH = "26cqmin";   // パネルの短辺
    const PGAP = "3cqmin"; // 卓のふちからの余白

    // サイコロの結果で割る山の持ち主
    const diceSum = diceVals[0] + diceVals[1];
    // 点滅は振ってから10秒間続ける（サイコロの表示時間とは別）
    const wallTargetIdx = (diceSettled || wallBlink) ? (dealerIdx + (diceSum - 1)) % PC : -1;
    // 画面上の席位置（0=手前 1=右 2=向かい 3=左）と、その席を正面にする回転角
    const slotOf = (i) => (i - seatRot + PC) % PC;
    const rotOf = (i) => (PC === 3 ? [0, -90, 90] : [0, -90, 180, 90])[slotOf(i)] ?? 0;

    // 名前の長さに合わせて文字サイズを自動調整（長い名前でも枠に収める）
    const nameFont = (name, base) => {
      const n = (name || "").length;
      const scale = n <= 4 ? 1 : n <= 6 ? 0.88 : n <= 8 ? 0.76 : n <= 11 ? 0.66 : 0.58;
      return `${(base * scale).toFixed(2)}cqmin`;
    };

    const panelInner = (i) => {
      const isDealer = i === dealerIdx;
      const seatWind = SEAT_WINDS[(i - dealerIdx + PC) % PC];
      const score = scores[i];
      const isRiichi = declaredRiichi[i];
      const isWallTarget = i === wallTargetIdx;
      return (
        <div style={{
          width: PW, height: PH,
          padding: (tmWinStep || tmDrawMode) ? "2cqmin" : "3cqmin 3.5cqmin", borderRadius: "3.5cqmin",
          // 親は外枠だけ黄色に。背景は他家と同じ
          background: (tmWinStep || tmDrawMode) ? "transparent" : isRiichi ? "rgba(220,60,60,0.16)" : t.card,
          border: (tmWinStep || tmDrawMode) ? "2px solid transparent" : `2px solid ${isRiichi ? t.rd : isDealer ? t.gd : t.bd}`,
          textAlign: "center", boxSizing: "border-box",
          display: "flex", flexDirection: "column", justifyContent: "center", gap: "1.5cqmin",
          position: "relative",
          animation: isWallTarget ? "wallBlink 0.9s ease-in-out infinite" : "none",
        }}>
          {tmDrawMode ? (
            /* 流局: テンパイ/ノーテンをトグル。修正中はその局のリーチ者を参照する */
            (() => {
            const lockR = correctingDrawIdx !== null
              ? !!(rounds[correctingDrawIdx]?.riichi || [])[i]
              : isRiichi;
            return (
            <button disabled={lockR} onClick={() => { if (lockR) return; const n = [...drawTenpai]; n[i] = !n[i]; setDrawTenpai(n); }} style={{
              width: "100%", height: "100%", borderRadius: 10, cursor: lockR ? "default" : "pointer", padding: "2cqmin", boxSizing: "border-box", overflow: "hidden",
              border: `2px solid ${lockR ? t.rd : drawTenpai[i] ? t.gn : t.bd}`,
              background: lockR ? "rgba(220,60,60,0.14)" : drawTenpai[i] ? t.gnS : t.card,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.8cqmin",
            }}>
              <div style={{
                fontSize: "4.4cqmin", fontWeight: 900, lineHeight: 1,
                color: isDealer ? "#1a1a1a" : t.tx,
                background: isDealer ? t.gd : t.sf,
                border: `1px solid ${isDealer ? t.gd : t.bd}`,
                borderRadius: "1.6cqmin", padding: "1.2cqmin 2.2cqmin",
              }}>{seatWind}</div>
              <div style={{ fontSize: nameFont(players[i], 3.9), fontWeight: 700, color: t.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "92%", lineHeight: 1.35, flexShrink: 0 }}>
                {players[i]}
              </div>
              <div style={{ fontSize: "3.8cqmin", fontWeight: 900, color: lockR ? t.gn : drawTenpai[i] ? t.gn : t.dm, whiteSpace: "nowrap", lineHeight: 1.25, flexShrink: 0 }}>
                {lockR ? "✓ テンパイ" : drawTenpai[i] ? "✓ テンパイ" : "ノーテン"}
              </div>
              {lockR && <div style={{ fontSize: "2.4cqmin", color: t.rd, fontWeight: 700, whiteSpace: "nowrap" }}>🔴 リーチ済み</div>}
            </button>
            );
            })()
          ) : tmWinStep === "winner" ? (
            /* 和了者を選ぶ（ダブロン可のときは複数選択） */
            (() => {
              const picked = ronPick.includes(i);
              const maxRon = 3;   // 選択自体は常に3人まで（ルールとの差異は下に警告）
              return (
                <button onClick={() => {
                  setRonPick(prev => prev.includes(i)
                    ? prev.filter(x => x !== i)
                    : (prev.length >= maxRon ? prev : [...prev, i]));
                }} style={{
                  width: "100%", height: "100%", borderRadius: 10, cursor: "pointer", padding: "2cqmin", boxSizing: "border-box", overflow: "hidden",
                  border: `2px solid ${picked ? t.gd : t.ac}`,
                  background: picked ? t.gdS : t.acS,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.9cqmin",
                }}>
                  <div style={{
                    fontSize: "4.6cqmin", fontWeight: 900, lineHeight: 1,
                    color: isDealer ? "#1a1a1a" : t.tx,
                    background: isDealer ? t.gd : t.sf,
                    border: `1px solid ${isDealer ? t.gd : t.bd}`,
                    borderRadius: "1.6cqmin", padding: "1.1cqmin 2.2cqmin",
                  }}>{seatWind}</div>
                  <div style={{ fontSize: nameFont(players[i], 4.6), fontWeight: 900, color: picked ? t.gd : t.ac, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "95%", lineHeight: 1.35, flexShrink: 0 }}>
                    {players[i]}
                  </div>
                  <div style={{ fontSize: "2.7cqmin", color: picked ? t.gd : t.dm, whiteSpace: "nowrap", lineHeight: 1.3, flexShrink: 0 }}>
                    {picked ? "✓ アガリ" : "タップで選択"}
                  </div>
                </button>
              );
            })()
          ) : tmWinStep === "how" ? (
            ronPick.includes(i) ? (
              /* 和了者本人 */
              <div style={{
                width: "100%", height: "100%", borderRadius: 10, padding: "8px 6px",
                border: `2px solid ${t.gd}`, background: t.gdS,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.8cqmin",
                padding: "2cqmin", boxSizing: "border-box", overflow: "hidden",
              }}>
                <div style={{ fontSize: "5cqmin", lineHeight: 1, flexShrink: 0 }}>🏆</div>
                <div style={{ fontSize: nameFont(players[i], 4.4), fontWeight: 900, color: t.gd, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "95%", lineHeight: 1.35, flexShrink: 0 }}>
                  {players[i]}
                </div>
                <div style={{ fontSize: "2.7cqmin", color: t.dm, lineHeight: 1.3, flexShrink: 0, whiteSpace: "nowrap" }}>あがった人</div>
              </div>
            ) : (
              /* 放銃者候補 */
              (() => {
              const sel = ronLoserPick === i;
              const dim = ronLoserPick !== null && !sel;   // 他が選ばれている
              return (
              <button onClick={() => setRonLoserPick(sel ? null : i)} style={{
                width: "100%", height: "100%", borderRadius: 10, cursor: "pointer", padding: "2cqmin",
                border: `2px solid ${sel ? t.rd : dim ? "rgba(255,255,255,0.55)" : t.rd}`,
                background: sel ? "rgba(239,68,68,0.32)" : dim ? "rgba(255,255,255,0.06)" : t.rdS,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.8cqmin",
                overflow: "hidden",
              }}>
                <div style={{ fontSize: "4.6cqmin", fontWeight: 900, color: dim ? "rgba(255,255,255,0.75)" : t.rd, lineHeight: 1.2, flexShrink: 0 }}>ロン</div>
                <div style={{ fontSize: nameFont(players[i], 4.1), fontWeight: 700, color: t.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "95%", lineHeight: 1.35, flexShrink: 0 }}>
                  {players[i]}
                </div>
                <div style={{ fontSize: "2.7cqmin", color: sel ? t.rd : t.dm, fontWeight: sel ? 800 : 400, lineHeight: 1.3, flexShrink: 0, whiteSpace: "nowrap" }}>
                  {sel ? "✓ 選択中" : "から出アガリ"}
                </div>
              </button>
              );
              })()
            )
          ) : isWallTarget ? (
            /* 山に選ばれた時は「山を割る」表示のみ */
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 6, height: "100%",
              animation: "wallLabelBlink 0.9s ease-in-out infinite",
            }}>
              <div style={{ fontSize: 26 }}>🎲</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: "#7dd3fc", lineHeight: 1.2 }}>
                この山を割る
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>
                右から {diceSum} つ目
              </div>
            </div>
          ) : (
            <>
              <div {...longPressHandlers(i)} style={{ ...longPressHandlers(i).style, cursor: "pointer", padding: "0 2px" }}>
                {/* 名前は横幅いっぱいを使う（長い名前でも切れないように） */}
                <div style={{
                  fontSize: nameFont(players[i], 4), fontWeight: 700, color: t.tx,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  lineHeight: 1.3, textAlign: "center", width: "100%", flexShrink: 0,
                }}>{players[i]}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2cqmin", marginTop: "0.4cqmin" }}>
                  <span style={{
                    fontSize: "3.9cqmin", fontWeight: 900, lineHeight: 1,
                    color: isDealer ? "#1a1a1a" : t.tx,
                    background: isDealer ? t.gd : t.sf,
                    border: `1px solid ${isDealer ? t.gd : t.bd}`,
                    borderRadius: "1.6cqmin", padding: "1.2cqmin 2cqmin", flexShrink: 0,
                  }}>{seatWind}</span>
                  <span style={{
                    fontSize: "5.3cqmin", fontWeight: 900, lineHeight: 1.2, flexShrink: 0,
                    color: score < 0 ? t.rd : t.tx, fontVariantNumeric: "tabular-nums",
                  }}>{score.toLocaleString()}</span>
                </div>
              </div>
              {/* リーチボタン */}
              <button onClick={(e) => { e.stopPropagation(); toggleDeclaredRiichi(i); }} style={{
                width: "100%", padding: "1.1cqmin 1.2cqmin", borderRadius: "2cqmin", cursor: "pointer", marginTop: "0.3cqmin",
                border: `1px solid ${isRiichi ? t.rd : t.bd}`,
                background: isRiichi ? t.rd : "transparent",
                color: isRiichi ? "#fff" : t.dm,
                fontSize: "2.5cqmin", fontWeight: 800, letterSpacing: "0.04em", whiteSpace: "nowrap",
              }}>
                {isRiichi ? "🔴 リーチ中 (取消)" : "リーチ"}
              </button>
            </>
          )}
        </div>
      );
    };

    // 上下パネル
    const hSlot = (i, pos, rot) => (
      <div key={i} style={{
        position: "absolute", ...pos,
        width: PW, height: PH,
        transform: `translateX(-50%) rotate(${rot}deg)`,
      }}>{panelInner(i)}</div>
    );

    // 左右パネル: 回転後の見た目サイズ(PH×PW)のラッパーで場所を確保して重なりを防ぐ
    const vSlot = (i, side, rot) => {
      const h = PH;
      return (
        <div key={i} style={{
          position: "absolute", [side]: PGAP, top: "50%",
          width: h, height: PW,
          transform: "translateY(-50%)",
        }}>
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            width: PW, height: h,
            transform: `translate(-50%,-50%) rotate(${rot}deg)`,
          }}>{panelInner(i)}</div>
        </div>
      );
    };

    // 操作ボタン列（上段は対面向きに180度回転）
    const smallBtn = (v) => ({
      width: "100%", padding: "11px 6px", border: "none", borderRadius: 10,
      fontSize: 13, fontWeight: 700, cursor: "pointer", boxSizing: "border-box", lineHeight: 1.4,
      ...(v === "p" ? { background: t.ac, color: "#fff" } : { background: t.sf, color: t.tx, border: `1px solid ${t.bd}` }),
    });
    const actionRow = (flip) => (
      <div style={{
        transform: flip ? "rotate(180deg)" : "none",
        marginBottom: flip ? 8 : 0, marginTop: flip ? 0 : 10,
      }}>
        {tmDrawMode ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: correctingDrawIdx !== null ? t.gd : t.gn, textAlign: "center", marginBottom: 4 }}>
              {correctingDrawIdx !== null
                ? `✏️ ${rounds[correctingDrawIdx]?.wind}${(rounds[correctingDrawIdx]?.dealer ?? 0) + 1}局の修正 — テンパイの人をタップ`
                : "流局 — テンパイの人をタップして「確定」"}
            </div>
            <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginBottom: 6 }}>
              {correctingDrawIdx !== null ? "本場と供託はそのまま、テンパイの内容だけ上書きします" : (() => {
                const rs = (gameConfig || {}).rules || {};
                const dealerTenpai = drawTenpai[dealerIdx];
                const stays = rs.agariRenchan ? false : rs.tenpaiRenchan ? dealerTenpai : true;
                const label = rs.agariRenchan ? "あがり連荘" : rs.tenpaiRenchan ? "テンパイ連荘" : "無条件連荘";
                return `${label}：この内容だと親（${players[dealerIdx]}）は${stays ? "続行（連荘）" : "流れます"}`;
              })()}
            </div>
            <button style={smallBtn()} onClick={() => {
              setTmDrawMode(false); setDrawTenpai([false,false,false,false]); setCorrectingDrawIdx(null);
            }}>キャンセル</button>
          </>
        ) : tmWinStep ? (
          <>
            <div style={{
              fontSize: 13, fontWeight: 700, color: t.ac, textAlign: "center", marginBottom: 6,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap",
            }}>
              {tmWinStep === "winner" ? (
                <>
                  <span>① あがった人をタップ</span>
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: t.dm, padding: "2px 8px",
                    borderRadius: 6, border: `1px solid ${t.bd}`, background: t.sf,
                  }}>{multiRonMax >= 3 ? "トリプルロン" : multiRonMax === 2 ? "ダブロン" : "頭ハネ"}</span>
                </>
              ) : (
                <span>{ronPick.length >= 2 ? "② ホウジュウした人をタップ" : "② ツモ or ホウジュウした人をタップ"}</span>
              )}
            </div>
            {tmWinStep === "how" && ronPick.length >= 2 && (
              <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginBottom: 6 }}>
                {ronPick.length}人でロン。放銃者に近い人から順に手を入力します
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {tmWinStep === "how" && (
                <button style={{ ...smallBtn(), flex: 1 }} onClick={() => {
                  // あがった人の選択に戻る
                  setRonLoserPick(null); setMultiRon(null); setGLoser(null); setGTsumo(null);
                  setTmWinStep("winner");
                }}>← 戻る</button>
              )}
              <button style={{ ...smallBtn(), flex: 1 }} onClick={() => {
                setTmWinStep(null); setGWinner(null); setRonPick([]); setMultiRon(null); setRonRuleWarn(false); setRonLoserPick(null);
              }}>キャンセル</button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button aria-label="ルール確認" style={{ ...smallBtn(), flex: "0 0 46px", fontSize: 19, padding: "10px 0" }}
              onClick={() => setShowRuleCheck(flip ? "flip" : true)}>📋</button>
            <button aria-label="対局を保留" style={{ ...smallBtn(), flex: "0 0 46px", fontSize: 19, padding: "10px 0" }}
              onClick={() => {
                setSuspendedGame({ config: gameConfig, players: [...players], scores: [...scores], rounds: [...rounds], dealerIdx, roundWind, honba, riichiBets });
                setGameStarted(false); setView("home"); setHomeCat(null);
              }}>⏸</button>
            <button style={{ ...smallBtn("p"), flex: 1 }} onClick={() => { resetGW(); setRonPick([]); setMultiRon(null); setRonLoserPick(null); setTmWinStep("winner"); }}>アガリ入力</button>
            <button style={{ ...smallBtn(), flex: 1 }} onClick={() => { setDrawTenpai([...declaredRiichi]); setTmDrawMode(true); }}>流局</button>
            <button aria-label="席順を回す" style={{ ...smallBtn(), flex: "0 0 46px", fontSize: 19, padding: "10px 0" }}
              onClick={() => setSeatRot(r => (r + PC - 1) % PC)}>🔄</button>
          </div>
        )}
      </div>
    );

    return (
      <div style={{
        padding: "6px 8px 10px",
        boxSizing: "border-box",
        // ルート側のセーフエリア余白を引いて、画面ちょうどに収める
        height: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 8px)",
        overflow: "hidden",
        display: "flex", flexDirection: "column", justifyContent: "center",
      }}>
        {reviewing && (
          <button onClick={() => { setReviewing(false); setGameFinished(true); }} style={{
            width: "100%", marginBottom: 8, padding: "13px 8px", borderRadius: 11,
            border: "none", background: t.gn, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer",
          }}>✓ 修正を終えて結果に戻る</button>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginBottom: 4, padding: "0 6px" }}>
          {rounds.length > 0 && (
            <button style={{ background: "none", border: "none", color: t.dm, fontSize: 11, cursor: "pointer", fontWeight: 600 }}
              onClick={() => setShowRoundEdit(true)}>📋 局の修正</button>
          )}
        </div>

        <RuleCheckModal />
        <RonRuleWarnModal />
        {actionRow(true)}

        <div style={{
          flex: "1 1 auto", minHeight: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        <div style={{
          position: "relative", aspectRatio: "1 / 1",
          width: "100%", height: "auto", maxWidth: "100%", maxHeight: "100%",
          flex: "0 1 auto", margin: "auto",
          containerType: "size",
          backgroundImage: `url(${TABLE_IMG})`,
          backgroundSize: "100% 100%", backgroundColor: "#103526",
          borderRadius: 18, overflow: "hidden",
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        }}>
          {PC === 3 ? (
            <>
              {/* 三人麻雀: 上家がいないので 下・右・左 の3席 */}
              {vSlot((1 + seatRot) % 3, "right", -90)}
              {vSlot((2 + seatRot) % 3, "left", 90)}
              {hSlot((0 + seatRot) % 3, { bottom: PGAP, left: "50%" }, 0)}
            </>
          ) : (
            <>
              {hSlot((2 + seatRot) % 4, { top: PGAP, left: "50%" }, 180)}
              {vSlot((1 + seatRot) % 4, "right", -90)}
              {vSlot((3 + seatRot) % 4, "left", 90)}
              {hSlot((0 + seatRot) % 4, { bottom: PGAP, left: "50%" }, 0)}
            </>
          )}

          {/* 中央: 局情報 + サイコロ */}
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: "25cqmin", height: "25cqmin", boxSizing: "border-box",
            background: "rgba(0,0,0,0.45)", borderRadius: 18, transition: "width 0.25s, height 0.25s",
            border: "1px solid rgba(255,255,255,0.1)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: 6, textAlign: "center",
            cursor: (!tmWinStep && !diceRolling && diceSettled) ? "pointer" : "default",
          }}
            onClick={() => { if (!tmWinStep && !diceRolling && diceSettled) rollDice(); }}
          >
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            {tmDrawMode && (
              <button onClick={(e) => { e.stopPropagation(); applyDraw(); setTmDrawMode(false); }} style={{
                padding: "12px 26px", borderRadius: 12, cursor: "pointer",
                border: "none", background: t.ac, color: "#fff",
                fontSize: 17, fontWeight: 900, letterSpacing: "0.05em",
              }}>確定</button>
            )}
            {tmWinStep === "winner" && (
              ronPick.length > 0 ? (
                <button onClick={(e) => {
                  e.stopPropagation();
                  if (ronPick.length > multiRonMax) { setRonRuleWarn(true); return; }
                  if (ronPick.length === 1) { setGWinner(ronPick[0]); }
                  setTmWinStep("how");
                }} style={{
                  padding: "10px 14px", borderRadius: 12, cursor: "pointer",
                  border: "none", background: t.ac, color: "#fff",
                  fontSize: 14, fontWeight: 900, lineHeight: 1.4, whiteSpace: "nowrap",
                }}>{ronPick.length}人<br />で確定</button>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1.5, whiteSpace: "nowrap" }}>
                  あがった人<br />を<br />選択
                </div>
              )
            )}
            {tmWinStep === "how" && (
              ronPick.length >= 2 ? (
                /* 複数ロンではツモはありえない */
                <div style={{
                  width: "100%", height: "100%", borderRadius: 16,
                  border: `2px dashed ${t.rd}77`, background: t.rdS,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                  padding: 4, boxSizing: "border-box", textAlign: "center", overflow: "hidden",
                }}>
                  <div style={{
                    fontSize: ronPick.length === 3 ? 12 : 15, fontWeight: 900, color: t.rd,
                    whiteSpace: "nowrap", lineHeight: 1.1,
                  }}>
                    {ronPick.length === 3 ? "トリプルロン" : "ダブロン"}
                  </div>
                  <div style={{ fontSize: 9, color: t.dm, lineHeight: 1.35, whiteSpace: "nowrap" }}>
                    ホウジュウ<br />した人を選択
                  </div>
                </div>
              ) : ronLoserPick !== null ? (
                /* 放銃者を選んだら確定ボタン */
                <button onClick={(e) => {
                  e.stopPropagation();
                  const i = ronLoserPick;
                  setTmWinStep(null);
                  setGTsumo(false); setGLoser(i);
                  if (ronPick.length >= 2) {
                    const order = [...ronPick].sort((x, y) => ((x - i + PC) % PC) - ((y - i + PC) % PC));
                    setMultiRon({ loser: i, queue: order, done: [] });
                    setGWinner(order[0]);
                  } else {
                    setMultiRon(null);
                    // 結果画面からの訂正で戻ってきた場合にgWinnerが空なので再設定する
                    if (ronPick.length === 1) setGWinner(ronPick[0]);
                  }
                  setRonLoserPick(null);
                  setGHan(null); setGFu(null); setFuGuide(null);
                  setShowGW(true); setGStep(5);
                }} style={{
                  width: "100%", height: "100%", borderRadius: 16, cursor: "pointer",
                  border: "none", background: t.ac, color: "#fff",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1cqmin",
                  padding: "2cqmin", boxSizing: "border-box", overflow: "hidden",
                }}>
                  <div style={{ fontSize: "5.6cqmin", fontWeight: 900, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>確定</div>
                </button>
              ) : (
                <button onClick={(e) => {
                  e.stopPropagation();
                  setGTsumo(true); setGLoser(null); setTmWinStep(null);
                  // 結果画面からの訂正で戻ってきた場合にgWinnerが空なので再設定する
                  if (ronPick.length === 1) setGWinner(ronPick[0]);
                  setShowGW(true); setGStep(5);
                }} style={{
                  width: "100%", height: "100%", borderRadius: 16, cursor: "pointer",
                  border: `2px solid ${t.gn}`, background: t.gnS,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "2cqmin", boxSizing: "border-box", overflow: "hidden",
                }}>
                  <div style={{ fontSize: "5cqmin", fontWeight: 900, color: t.gn, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>ツモ</div>
                </button>
              )
            )}
            {/* サイコロエリア */}
            <div>
              {!tmWinStep && !tmDrawMode && (diceRolling || diceSettled) && (() => {
                // 出目が決まったら「山を割る人」の方を向く（振っている間は親の向き）
                const faceIdx = (diceSettled && wallTargetIdx >= 0) ? wallTargetIdx : dealerIdx;
                const rot = rotOf(faceIdx);
                return (
                  <div style={{ position: "relative", width: 72, height: 62, margin: "0 auto" }}>
                    <div style={{
                      position: "absolute", top: "50%", left: "50%",
                      transform: `translate(-50%,-50%) rotate(${rot}deg)`,
                      transition: "transform 0.45s cubic-bezier(.3,1.2,.4,1)",
                      textAlign: "center", whiteSpace: "nowrap",
                    }}>
                      <div style={{ display: "flex", gap: 7, justifyContent: "center", marginBottom: 5 }}>
                        <Die value={diceVals[0]} size={26} rolling={diceRolling} spin={diceSpin} />
                        <Die value={diceVals[1]} size={26} rolling={diceRolling} spin={diceSpin + 1} />
                      </div>
                      {diceSettled && (
                        <>
                          <div style={{
                            fontSize: 26, fontWeight: 900, color: "#fff", lineHeight: 1.15,
                            textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                          }}>
                            <span style={{ fontSize: 13, fontWeight: 800, opacity: 0.85, marginRight: 4 }}>合計</span>
                            {diceVals[0] + diceVals[1]}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
              {!tmWinStep && !tmDrawMode && !(diceRolling || diceSettled) && (() => {
                const rolled = diceRoundKey === `${roundWind}${dealerIdx}-${honba}-${rounds.length}`;
                const rot = rotOf(dealerIdx);
                return (
                  <button onClick={rollDice} aria-label="サイコロを振る" style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    border: "none", background: "transparent", padding: 2, cursor: "pointer",
                    transform: `rotate(${rot}deg)`,
                    transition: "transform 0.4s cubic-bezier(.3,1.2,.4,1)",
                  }}>
                    {rolled ? (
                      <span style={{
                        fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.9)",
                        letterSpacing: "0.14em", whiteSpace: "nowrap",
                        textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                      }}>対局中</span>
                    ) : (
                      <>
                        <Die value={diceVals[0]} size={26} spin={diceSpin} />
                        <Die value={diceVals[1]} size={26} spin={diceSpin + 1} />
                      </>
                    )}
                  </button>
                );
              })()}
            </div>

            {/* 局表示: 親の方を向いて配置。サイコロを振っている間は合計だけ見せる */}
            {!tmWinStep && !tmDrawMode && !(diceRolling || diceSettled) && (() => {
              const rot = rotOf(dealerIdx);
              const posBase = (offsetY) => ({
                position: "absolute", top: "50%", left: "50%",
                transform: `translate(-50%,-50%) rotate(${rot}deg) translateY(${offsetY}cqmin)`,
                transition: "transform 0.4s cubic-bezier(.3,1.2,.4,1)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                whiteSpace: "nowrap", lineHeight: 1,
              });
              return (
                <>
                  {/* サイコロの上: 何局 */}
                  <div style={posBase(-8.5)}>
                    <span style={{ fontSize: "3.9cqmin", fontWeight: 900, color: "#fff" }}>
                      {roundWind}{dealerIdx + 1}局
                    </span>
                  </div>
                  {/* 局の最初だけ: サイコロを振る案内 */}
                  {diceRoundKey !== `${roundWind}${dealerIdx}-${honba}-${rounds.length}` && (
                    <div style={posBase(15.5)}>
                      <span style={{
                        fontSize: "3.1cqmin", fontWeight: 800, color: t.gd,
                        animation: "dicePrompt 1.6s ease-in-out infinite",
                      }}>タップしてサイコロ</span>
                    </div>
                  )}
                  {/* サイコロの下: 本場・供託 */}
                  <div style={posBase(8.5)}>
                    <span style={{
                      fontSize: "3.2cqmin", fontWeight: 800,
                      color: honba > 0 ? t.gd : "rgba(255,255,255,0.45)",
                    }}>{honba}本場</span>
                    {riichiBets > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 800, color: t.ac }}>
                        供託 {riichiBets.toLocaleString()}
                      </span>
                    )}
                  </div>
                </>
              );
            })()}

            </div>
          </div>
        </div>
        </div>

        {actionRow(false)}
        <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginTop: 6 }}>
          点数を長押しすると順位と点差が見られます
        </div>
        <BootSplash />
        <StartSplash />
        <PayTableView />
        <RankPeekOverlay />
        <PlayerHistoryModal />

        {/* 局の修正モーダル */}
        {showRoundEdit && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.9)", zIndex: 150, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 16px", paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', overflowY: "auto" }}>
            <div style={{ width: "100%", maxWidth: 400 }}>
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>局の修正</span>
                  <button style={{ background: "none", border: "none", color: t.dm, fontSize: 20, cursor: "pointer" }}
                    onClick={() => { setShowRoundEdit(false); setEditingRoundIdx(null); }}>✕</button>
                </div>
                <div style={{ fontSize: 11, color: t.dm, marginBottom: 10 }}>修正したい局をタップしてください</div>
                {rounds.map((r, idx) => (
                  <div key={idx}>
                    <button onClick={() => setEditingRoundIdx(editingRoundIdx === idx ? null : idx)}
                      style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "10px 0", borderBottom: `1px solid ${t.bd}33`, fontSize: 13, display: "flex", justifyContent: "space-between", textAlign: "left" }}>
                      <span style={{ color: t.dm }}>{r.wind}{r.dealer + 1}局{r.honba > 0 ? ` ${r.honba}本場` : ""}</span>
                      {r.draw ? <span style={{ color: t.dm }}>流局</span> : (
                        <span>
                          <span style={{ color: t.ac, fontWeight: 600 }}>{players[r.winner]}</span>
                          {" "}<span style={{ fontWeight: 700, color: t.tx }}>{r.score?.toLocaleString()}</span>
                        </span>
                      )}
                    </button>
                    {editingRoundIdx === idx && (
                      <div style={{ padding: "8px 0 12px", display: "flex", gap: 8 }}>
                        {!r.draw ? (
                          <button style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${t.ac}`, background: t.acS, color: t.ac, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                            onClick={() => { setShowRoundEdit(false); openCorrectionWizard(idx); }}>✏️ この局を修正</button>
                        ) : (
                          <button style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${t.ac}`, background: t.acS, color: t.ac, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                            onClick={() => { setShowRoundEdit(false); setEditingRoundIdx(null); openDrawCorrection(idx); }}>✏️ この局を修正</button>
                        )}
                        <button style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.sf, color: t.dm, fontSize: 12, cursor: "pointer" }}
                          onClick={() => setEditingRoundIdx(null)}>キャンセル</button>
                      </div>
                    )}
                  </div>
                ))}
                <button style={{ ...actionBtn(), marginTop: 12 }} onClick={() => { setShowRoundEdit(false); setEditingRoundIdx(null); }}>閉じる</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGamePlay = () => (
    <div style={body}>
      {/* Config summary */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, fontSize: 12, color: t.dm }}>
        <span>{gameConfig?.date} / {MATCH_LABEL(gameConfig?.matchType)}</span>
      </div>

      {/* Round info */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 22, fontWeight: 800 }}>{roundWind}{dealerIdx + 1}局</span>
          {honba > 0 && <span style={{ fontSize: 13, color: t.gd, marginLeft: 6 }}>{honba}本場</span>}
        </div>
        {riichiBets > 0 && <span style={{ fontSize: 12, color: t.ac }}>供託{riichiBets}本</span>}
      </div>

      {/* Scores */}
      <div style={card}>
        {players.slice(0, PC).map((p, i) => {
          const sw = SEAT_WINDS[(i - dealerIdx + PC) % PC];
          const isD = i === dealerIdx;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 10, marginBottom: 4,
              border: declaredRiichi[i] ? `1px solid ${t.rd}` : isD ? `1px solid ${t.gd}55` : "1px solid transparent",
              background: declaredRiichi[i] ? "rgba(220,60,60,0.12)" : isD ? t.gdS : "transparent" }}>
              <div {...longPressHandlers(i)} style={{ ...longPressHandlers(i).style, display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: "pointer", minWidth: 0 }}>
                <span style={{
                  fontSize: 24, fontWeight: 900, lineHeight: 1,
                  color: isD ? "#1a1a1a" : t.tx,
                  background: isD ? t.gd : t.sf,
                  border: `1px solid ${isD ? t.gd : t.bd}`,
                  borderRadius: 7, padding: "5px 10px", flexShrink: 0,
                }}>{sw}</span>
                <span style={{ fontSize: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
              </div>
              <button onClick={() => toggleDeclaredRiichi(i)} style={{
                padding: "5px 10px", marginRight: 10, borderRadius: 7, cursor: "pointer",
                border: `1px solid ${declaredRiichi[i] ? t.rd : t.bd}`,
                background: declaredRiichi[i] ? t.rd : "transparent",
                color: declaredRiichi[i] ? "#fff" : t.dm,
                fontSize: 10, fontWeight: 800, whiteSpace: "nowrap",
              }}>{declaredRiichi[i] ? "🔴 リーチ" : "リーチ"}</button>
              <span {...longPressHandlers(i)} style={{ ...longPressHandlers(i).style, fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: scores[i] < 0 ? t.rd : t.tx, cursor: "pointer" }}>{scores[i].toLocaleString()}</span>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10, color: t.dm, textAlign: "center", marginBottom: 10, marginTop: -8 }}>
        点数を長押しすると順位と点差が見られます
      </div>
      <BootSplash />
      <StartSplash />
      <PayTableView />
      <RankPeekOverlay />
      <PlayerHistoryModal />
      <RuleCheckModal />

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button style={{ ...actionBtn("p"), flex: 1 }} onClick={() => { resetGW(); setShowGW(true); setGStep(1); }}>アガリ入力</button>
        <button style={{ ...actionBtn(), flex: 1 }} onClick={() => { setDrawTenpai([...declaredRiichi]); setShowDrawWiz(true); }}>流局</button>
        <button style={{ ...actionBtn(), flex: "0 0 92px" }} onClick={() => setShowRuleCheck(true)}>📋 ルール</button>
      </div>

      <button style={{ ...actionBtn(), marginBottom: 14, fontSize: 13 }}
        onClick={() => { setDiceOpen(true); setDiceSettled(false); setTimeout(rollDice, 150); }}>
        🎲 サイコロを振る
      </button>
      <DiceModal />

      {/* ── Round Wizard Modal ── */}
      {showGW && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 16px", paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ width: "100%", maxWidth: 400 }}>
            {gStep === 1 && (
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: t.dm }}>STEP 1</span>
                  <button style={{ background: "none", border: "none", color: t.dm, fontSize: 18, cursor: "pointer" }} onClick={resetGW}>✕</button>
                </div>
                <div style={question}>誰があがった？</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {players.slice(0, PC).map((p, i) => (
                    <button key={i} style={pSelBtn(gWinner === i)} onClick={() => { setGWinner(i); setGStep(2); }}>
                      <div style={{ fontSize: 11, color: t.dm }}>{SEAT_WINDS[(i - dealerIdx + PC) % PC]}{i === dealerIdx ? " (親)" : ""}</div>
                      <div>{p}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {gStep === 2 && (
              <div style={card}>
                <Back onClick={() => { setGStep(1); setGWinner(null); }} />
                <div style={{ fontSize: 12, color: t.dm, marginBottom: 4 }}>STEP 2</div>
                <div style={question}>あがり方は？</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button style={bigBtn(t.gn, t.gnS)} onClick={() => { setGTsumo(true); setGStep(4); }}>ツモ</button>
                  <button style={bigBtn(t.rd, t.rdS)} onClick={() => { setGTsumo(false); setGStep(3); }}>ロン</button>
                </div>
              </div>
            )}
            {gStep === 3 && (
              <div style={card}>
                <Back onClick={() => { setGStep(2); setGTsumo(null); }} />
                <div style={{ fontSize: 12, color: t.dm, marginBottom: 4 }}>STEP 3</div>
                <div style={question}>誰から？</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {players.slice(0, PC).map((p, i) => i !== gWinner && (
                    <button key={i} style={pSelBtn(gLoser === i)} onClick={() => { setGLoser(i); setGStep(4); }}>
                      <div style={{ fontSize: 11, color: t.dm }}>{SEAT_WINDS[(i - dealerIdx + PC) % PC]}</div>
                      <div style={{ fontSize: 13 }}>{p}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {gStep === 4 && (
              <div style={card}>
                <Back onClick={() => { if (gTsumo) { setGStep(2); setGTsumo(null); } else { setGStep(3); setGLoser(null); } }} />
                <div style={{ fontSize: 12, color: t.dm, marginBottom: 4 }}>リーチ棒</div>
                <div style={question}>リーチした人は？</div>
                <div style={{ fontSize: 12, color: t.dm, textAlign: "center", marginBottom: 12 }}>
                  {declaredRiichi.some(Boolean) ? "宣言済みの人は自動で反映されます" : "なければそのまま「次へ」"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                  {players.slice(0, PC).map((p, i) => {
                    const already = declaredRiichi[i];
                    const isR = already || gRiichi[i];
                    return (
                      <button key={i} disabled={already} style={{
                        padding: "12px 8px", border: `2px solid ${isR ? t.gd : t.bd}`, borderRadius: 12,
                        background: isR ? t.gdS : "transparent", color: isR ? t.gd : t.tx,
                        fontSize: 14, fontWeight: 700, cursor: already ? "default" : "pointer", textAlign: "center",
                        opacity: already ? 0.85 : 1,
                      }} onClick={() => { if (already) return; const n = [...gRiichi]; n[i] = !n[i]; setGRiichi(n); }}>
                        <div style={{ fontSize: 11, color: isR ? t.gd : t.dm, marginBottom: 2 }}>{SEAT_WINDS[(i - dealerIdx + PC) % PC]}</div>
                        <div>{p}</div>
                        <div style={{ fontSize: 10, marginTop: 4 }}>
                          {already ? "🔒 宣言済み" : gRiichi[i] ? "🔴 リーチ" : "—"}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {gRiichi.some(Boolean) && (
                  <div style={{ fontSize: 12, color: t.dm, textAlign: "center", marginBottom: 8 }}>
                    リーチ棒: {gRiichi.filter(Boolean).length}本 ({(gRiichi.filter(Boolean).length * 1000).toLocaleString()}点)
                    {riichiBets > 0 && ` + 供託${riichiBets}本`}
                  </div>
                )}
                <button style={actionBtn("p")} onClick={() => setGStep(5)}>次へ</button>
              </div>
            )}
            {gStep === 5 && (
              <div style={card}>
                {yakuPickerOpen ? (
                  <YakuPicker
                    isTsumo={gTsumo}
                    isParent={gParent}
                    lockedRiichi={gWinner !== null && (declaredRiichi[gWinner] || gRiichi[gWinner])}
                    onConfirm={(h) => {
                      // 役ピッカーの回答から符が確定できる場合は符ステップを飛ばす
                      const pinfu = pickedYaku.includes("平和（ピンフ）");
                      const chiitoi = pickedYaku.includes("七対子（チートイツ）");
                      const naki = pickerNaki === true;
                      setGHan(h); setGKnownNaki(pickerNaki); resetYakuPicker();
                      if (h >= 5) { setGFu(30); setGStep(7); }
                      else if (chiitoi) { setGFu(25); setGStep(7); }
                      else if (pinfu && !naki) { setGFu(gTsumo ? 20 : 30); setGStep(7); }
                      else setGStep(6);
                    }}
                    onCancel={() => setYakuPickerOpen(false)}
                  />
                ) : (
                  <>
                    <Back onClick={() => {
                      // 修正モード中は結果画面（サマリ）に戻る
                      if (correctingIdx !== null && gHan !== null) { setGStep(7); return; }
                      // 卓上モードはこの画面から入るので、戻る＝入力をやめて卓に戻る
                      if (tableMode) {
                        resetGW(); setRonPick([]); setMultiRon(null); setTmWinStep(null);
                      } else {
                        setGStep(4);
                      }
                    }} />
                    {multiRon && (
                      <div style={{
                        padding: "9px 12px", borderRadius: 10, marginBottom: 10,
                        background: t.gdS, border: `1px solid ${t.gd}55`, textAlign: "center",
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: t.gd }}>
                          {multiRon.done.length + 1}人目 / 全{multiRon.done.length + multiRon.queue.length}人
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: t.tx, marginLeft: 8 }}>
                          {players[gWinner]} さんの手
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: t.dm, marginBottom: 4 }}>翻数</div>
                    <div style={question}>翻数は？</div>
                    <button style={{ ...actionBtn("p"), marginBottom: 12, background: t.gd, color: "#1a1a1a" }}
                      onClick={() => {
                        // 実況リーチ・リーチ棒入力のどちらでもリーチ扱い
                        const riichi = gWinner !== null && (declaredRiichi[gWinner] || gRiichi[gWinner]);
                        const pre = [];
                        if (riichi) pre.push("リーチ（立直）");
                        // 門前でツモなら門前清自摸和も自動でチェック
                        if (gTsumo && riichi) pre.push("門前清自摸和（メンゼンツモ）");
                        setPickedYaku(pre);
                        setPickerDora(0);
                        setPickerUra(0);
                        setPickerNaki(riichi ? false : null);
                        setGKnownNaki(null);
                        setYakuPickerOpen(true);
                      }}>
                      📖 役を選んで計算する
                    </button>
                    <div style={{ fontSize: 12, color: t.dm, textAlign: "center", marginBottom: 10 }}>または直接選択</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9 }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(h => (
                        <button key={h} style={numBtn(gHan === h)}
                          onClick={() => { setGHan(h); if (h >= 5) { setGFu(30); setGStep(7); } else setGStep(6); }}>{h}翻</button>
                      ))}
                    </div>
                    <button style={{
                      width: "100%", marginTop: 10, height: 62, padding: "0 4px", borderRadius: 12,
                      border: `2px solid ${gHan === 13 ? t.gd : t.bd}`,
                      background: gHan === 13 ? t.gdS : "transparent",
                      color: gHan === 13 ? t.gd : t.tx, fontSize: 19, fontWeight: 800, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
                    }} onClick={() => { setGHan(13); setGFu(30); setGStep(7); }}>役満</button>
                  </>
                )}
              </div>
            )}
            {gStep === 6 && (
              <div style={card}>
                {!fuGuide && <><Back onClick={() => { setGStep(5); if (correctingIdx === null) setGHan(null); resetFuGuide(); }} /><div style={{ fontSize: 12, color: t.dm, marginBottom: 4 }}>符数</div></>}

                {!fuGuide ? (
                  <>
                    <div style={question}>符の入力方法</div>
                    <button style={{ ...actionBtn("p"), marginBottom: 10 }} onClick={() => { initFuGuide(); }}>
                      ガイドで符を計算する
                    </button>
                    <div style={{ fontSize: 12, color: t.dm, textAlign: "center", marginBottom: 10 }}>または直接選択</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                      {validFuOptions(gHan, gTsumo).map(f => (
                        <button key={f} style={{ ...numBtn(gFu === f), fontSize: f >= 100 ? 16 : 19 }} onClick={() => { setGFu(f); setGStep(7); }}>{f}符</button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>符計算ガイド</span>
                      <button style={{ background: t.acS, border: `1px solid ${t.ac}44`, borderRadius: 20, padding: "2px 10px", fontSize: 11, color: t.ac, fontWeight: 700, cursor: "pointer" }} onClick={() => setShowFuHelp(true)}>解説</button>
                    </div>
                    <FuGuideWizard isTsumo={gTsumo} onComplete={(fu) => { setGFu(fu); setGStep(7); resetFuGuide(); }} onBack={() => resetFuGuide()} />
                  </>
                )}
              </div>
            )}
            {gStep === 7 && gResult && (
              <>
                {correctingIdx === null && (
                  <Back onClick={() => {
                    // 一つ前（符 or 翻数）に戻る
                    if (gHan < 5) { setGStep(6); setGFu(null); }
                    else { setGStep(5); setGHan(null); }
                    resetFuGuide();
                  }} />
                )}
                {correctingIdx !== null && (
                  <div style={{ textAlign: "center", padding: "6px 12px", marginBottom: 10, borderRadius: 8, background: t.gdS, border: `1px solid ${t.gd}44` }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.gd }}>✏️ 修正モード — 変更箇所をタップ</span>
                  </div>
                )}
                <div style={card}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "9px 10px", marginBottom: 12, borderRadius: 9,
                    background: t.acS, border: `1px solid ${t.ac}44`,
                  }}>
                    <span style={{ fontSize: 13 }}>✏️</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.ac }}>
                      直したい項目をタップすると訂正できます
                    </span>
                  </div>
                  {/* Editable summary - tap each row to jump to that step */}
                  {(() => {
                    // 卓上モードでは、あがった人・あがり方は卓の画面で選び直す
                    const rowStyle = { width: "100%", background: "transparent", border: "none", padding: "11px 0", borderBottom: `1px solid ${t.bd}33`, display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", gap: 10 };
                    const backToTable = (step) => {
                      resetGW(); setMultiRon(null);
                      if (step === "winner") setRonPick([]);
                      setTmWinStep(step);
                    };
                    return (
                      <>
                        <button onClick={() => (tableMode && correctingIdx === null) ? backToTable("winner") : setGStep(1)}
                          style={{ ...rowStyle, cursor: "pointer" }}>
                          <span style={{ fontSize: 12, color: t.dm }}>あがった人</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: t.tx }}>{players[gWinner]}</span>
                            <span style={editTag}>訂正</span>
                          </span>
                        </button>
                        <button onClick={() => (tableMode && correctingIdx === null) ? backToTable("how") : setGStep(2)}
                          style={{ ...rowStyle, cursor: "pointer" }}>
                          <span style={{ fontSize: 12, color: t.dm }}>あがり方</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: gTsumo ? t.gn : t.rd }}>{gTsumo ? "ツモ" : "ロン"}{!gTsumo && gLoser !== null ? ` ← ${players[gLoser]}` : ""}</span>
                            <span style={editTag}>訂正</span>
                          </span>
                        </button>
                        {(tableMode && correctingIdx === null) ? (
                          <div style={rowStyle}>
                            <span style={{ fontSize: 12, color: t.dm }}>リーチ棒</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: declaredRiichi.some(Boolean) ? t.gd : t.dm }}>
                              {declaredRiichi.some(Boolean) ? `${declaredRiichi.filter(Boolean).length}本` : "なし"}
                            </span>
                          </div>
                        ) : (
                          <button onClick={() => setGStep(4)} style={{ ...rowStyle, cursor: "pointer" }}>
                            <span style={{ fontSize: 12, color: t.dm }}>リーチ棒</span>
                            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: gRiichi.some(Boolean) ? t.gd : t.dm }}>{gRiichi.some(Boolean) ? `${gRiichi.filter(Boolean).length}本` : "なし"}</span>
                              <span style={editTag}>訂正</span>
                            </span>
                          </button>
                        )}
                      </>
                    );
                  })()}
                  <button onClick={() => setGStep(5)} style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "8px 0", borderBottom: `1px solid ${t.bd}33`, display: "flex", justifyContent: "space-between", textAlign: "left" }}>
                    <span style={{ fontSize: 12, color: t.dm }}>翻数</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.tx }}>{gHan >= 13 ? getLimitName(gHan) : `${gHan}翻`}</span>
                      <span style={editTag}>訂正</span>
                    </span>
                  </button>
                  {gHan < 5 && (
                    <button onClick={() => setGStep(6)} style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "8px 0", borderBottom: `1px solid ${t.bd}33`, display: "flex", justifyContent: "space-between", textAlign: "left" }}>
                      <span style={{ fontSize: 12, color: t.dm }}>符数</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: t.tx }}>{gFu}符</span>
                        <span style={editTag}>訂正</span>
                      </span>
                    </button>
                  )}
                </div>
                <ScoreDisplay han={gHan} fu={gFu} limit={gLimit} result={gResult} tsumo={gTsumo} parent={gParent}
                  extra={
                    <>
                      <div style={{ fontSize: 18, color: t.tx, marginTop: 8, fontWeight: 700 }}>
                        {players[gWinner]} {gTsumo ? "ツモ" : `← ${players[gLoser]}`}
                      </div>
                      {(honba > 0 || riichiBets > 0 || gRiichi.some(Boolean)) && (
                        <div style={{ fontSize: 12, color: t.dm, marginTop: 6, borderTop: `1px solid ${t.bd}`, paddingTop: 6 }}>
                          {honba > 0 && `本場 +${(honba * 300).toLocaleString()}`}
                          {honba > 0 && (riichiBets > 0 || gRiichi.some(Boolean)) && " / "}
                          {(riichiBets > 0 || gRiichi.some(Boolean)) && `リーチ棒 ${riichiBets + gRiichi.filter(Boolean).length}本 (+${((riichiBets + gRiichi.filter(Boolean).length) * 1000).toLocaleString()})`}
                        </div>
                      )}
                    </>
                  }
                />
                <button style={{ ...actionBtn(), color: t.gd, border: `1px solid ${t.gd}55` }}
                  onClick={() => setShowPayView(true)}>🀄 卓上表示（点数の受け渡し）</button>
                <button style={actionBtn("p")} onClick={applyRound}>{correctingIdx !== null ? "修正を反映" : "スコアに反映"}</button>
                <button style={actionBtn()} onClick={resetGW}>キャンセル</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Draw (Ryuukyoku) Wizard Modal ── */}
      {showDrawWiz && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 16px", paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ width: "100%", maxWidth: 400 }}>
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: t.dm }}>流局</span>
                <button style={{ background: "none", border: "none", color: t.dm, fontSize: 18, cursor: "pointer" }} onClick={resetDrawWiz}>✕</button>
              </div>
              <div style={question}>テンパイしている人は？</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                {players.slice(0, PC).map((p, i) => {
                  const isTenpai = drawTenpai[i];
                  const lockedRiichi = declaredRiichi[i];
                  const sw = SEAT_WINDS[(i - dealerIdx + PC) % PC];
                  return (
                    <button
                      key={i}
                      disabled={lockedRiichi}
                      style={{
                        padding: "14px 8px",
                        border: `2px solid ${lockedRiichi ? t.rd : isTenpai ? t.gn : t.bd}`,
                        borderRadius: 12,
                        background: lockedRiichi ? "rgba(220,60,60,0.12)" : isTenpai ? t.gnS : "transparent",
                        color: isTenpai ? t.gn : t.tx,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: lockedRiichi ? "default" : "pointer",
                        textAlign: "center",
                        transition: "all 0.12s",
                      }}
                      onClick={() => {
                        if (lockedRiichi) return;
                        const next = [...drawTenpai];
                        next[i] = !next[i];
                        setDrawTenpai(next);
                      }}
                    >
                      <div style={{ fontSize: 11, color: isTenpai ? t.gn : t.dm, marginBottom: 2 }}>{sw}{i === dealerIdx ? " (親)" : ""}</div>
                      <div>{p}</div>
                      {lockedRiichi && <div style={{ fontSize: 9, color: t.rd, fontWeight: 700, marginTop: 2 }}>🔴 リーチ済み</div>}
                      <div style={{ fontSize: 12, marginTop: 4, fontWeight: 800 }}>
                        {isTenpai ? "テンパイ" : "ノーテン"}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Preview payment */}
              {(() => {
                const tc = drawTenpai.slice(0, PC).filter(Boolean).length;
                const nc = PC - tc;
                if (tc === 0 || tc === PC) return (
                  <div style={{ textAlign: "center", fontSize: 13, color: t.dm, marginBottom: 12 }}>
                    {tc === 0 ? "全員ノーテン — 罰符なし" : "全員テンパイ — 罰符なし"}
                  </div>
                );
                const notenPay = Math.floor(3000 / nc);
                const tenpaiGet = Math.floor(3000 / tc);
                return (
                  <div style={{ background: t.sf, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 6 }}>ノーテン罰符</div>
                    {players.slice(0, PC).map((p, i) => {
                      const diff = drawTenpai[i] ? tenpaiGet : -notenPay;
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13 }}>
                          <span>{p}</span>
                          <span style={{ fontWeight: 700, color: diff > 0 ? t.gn : diff < 0 ? t.rd : t.tx }}>
                            {diff > 0 ? "+" : ""}{diff.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Renchan info */}
              {(() => {
                const cfg = gameConfig || {};
                const dealerTenpai = drawTenpai[dealerIdx];
                let renchanText = "";
                if (cfg.agariRenchan) {
                  renchanText = "あがり連荘 → 親が流れます";
                } else if (cfg.tenpaiRenchan) {
                  renchanText = dealerTenpai ? "親テンパイ → 連荘" : "親ノーテン → 親が流れます";
                }
                if (!renchanText) return null;
                return (
                  <div style={{ textAlign: "center", fontSize: 12, color: t.dm, marginBottom: 12, padding: "6px 0", borderTop: `1px solid ${t.bd}33` }}>
                    {renchanText}
                  </div>
                );
              })()}

              <button style={actionBtn("p")} onClick={applyDraw}>確定</button>
              <button style={actionBtn()} onClick={resetDrawWiz}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {rounds.length > 0 && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, letterSpacing: "0.05em" }}>対局履歴</div>
            <div style={{ fontSize: 10, color: t.dm }}>タップで修正</div>
          </div>
          {rounds.map((r, idx) => (
            <div key={idx}>
              <button onClick={() => setEditingRoundIdx(editingRoundIdx === idx ? null : idx)}
                style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "8px 0", borderBottom: `1px solid ${t.bd}33`, fontSize: 12, display: "flex", justifyContent: "space-between", textAlign: "left" }}>
                <span style={{ color: t.dm }}>{r.wind}{r.dealer + 1}局{r.honba > 0 ? ` ${r.honba}本場` : ""}</span>
                {r.draw ? (
                  <span style={{ color: t.dm }}>
                    流局
                    {r.tenpai && r.tenpai.some(Boolean) && (
                      <span style={{ marginLeft: 4, color: t.gn }}>
                        聴{r.tenpai.map((tp, i) => tp ? players[i]?.charAt(0) : null).filter(Boolean).join("")}
                      </span>
                    )}
                  </span>
                ) : (
                  <span>
                    <span style={{ color: t.ac, fontWeight: 600 }}>{players[r.winner]}</span>
                    {" "}<span style={{ color: t.dm }}>{r.han >= 13 ? getLimitName(r.han) : r.fu ? `${r.han}翻${r.fu}符` : `${r.han}翻`}</span>
                    {" "}<span style={{ fontWeight: 700, color: t.tx }}>{r.score?.toLocaleString()}</span>
                    {r.limitName && <span style={{ color: t.gd, marginLeft: 4 }}>{r.limitName}</span>}
                  </span>
                )}
              </button>
              {editingRoundIdx === idx && (
                <div style={{ padding: "8px 0 12px", display: "flex", gap: 8 }}>
                  {!r.draw ? (
                    <button style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${t.ac}`, background: t.acS, color: t.ac, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                      onClick={() => openCorrectionWizard(idx)}>
                      ✏️ この局を修正
                    </button>
                  ) : (
                    <button style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${t.ac}`, background: t.acS, color: t.ac, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                      onClick={() => { setEditingRoundIdx(null); openDrawCorrection(idx); }}>
                      ✏️ この局を修正
                    </button>
                  )}
                  <button style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.sf, color: t.dm, fontSize: 12, cursor: "pointer" }}
                    onClick={() => setEditingRoundIdx(null)}>キャンセル</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Extend to Hanchan Confirm ── */}
      {showExtendConfirm && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 16px", paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ width: "100%", maxWidth: 400 }}>
            <div style={card}>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🀄</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>東風戦 終了</div>
                <div style={{ fontSize: 13, color: t.dm }}>半荘戦に延長しますか？</div>
              </div>
              {/* Current scores preview */}
              <div style={{ background: t.sf, borderRadius: 10, padding: 12, marginBottom: 16 }}>
                {players.slice(0, PC).map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                    <span>{p}</span>
                    <span style={{ fontWeight: 700, color: scores[i] < 0 ? t.rd : t.tx }}>{scores[i].toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <button style={{ ...actionBtn("p"), marginBottom: 8 }} onClick={() => {
                // Extend to hanchan
                setShowExtendConfirm(false);
                setGameConfig(prev => ({ ...prev, matchType: "hanchan" }));
                setRoundWind("南");
                setDealerIdx(0);
                setHonba(0);
              }}>🔄 半荘戦に延長する</button>
              <button style={actionBtn()} onClick={() => {
                setShowExtendConfirm(false);
                setGameFinished(true);
              }}>終了して結果を見る</button>
            </div>
          </div>
        </div>
      )}

      <button style={actionBtn()} onClick={() => {
        setSuspendedGame({
          config: gameConfig,
          players: [...players],
          scores: [...scores],
          rounds: [...rounds],
          dealerIdx,
          roundWind,
          honba,
          riichiBets,
        });
        setGameStarted(false);
        setView("home");
      }}>⏸ 対局保留</button>
    </div>
  );

  // ══════════════════════════════════
  // ── GAME FINISHED SCREEN ──
  // ══════════════════════════════════
  const renderGameFinished = () => {
    const ruleSet = gameConfig?.rules || {};
    const returnPt = ruleSet.returnPoints || 30000;
    const startPt = ruleSet.startPoints || 25000;
    // Oka: (returnPt - startPt) * 4 goes to 1st place, everyone's score is relative to returnPt
    const okaPool = (returnPt - startPt) * PC;
    const adjusted = players.slice(0, PC).map((p, i) => {
      const diff = scores[i] - returnPt;
      return { name: p, rawScore: scores[i], diff, idx: i };
    });
    // Give oka pool to 1st place
    const sortedByRaw = [...adjusted].sort((a, b) => b.rawScore - a.rawScore);
    const finalResults = adjusted.map(a => {
      const isFirst = a.idx === sortedByRaw[0].idx;
      const finalPt = a.diff + (isFirst ? okaPool : 0);
      return { ...a, finalPt };
    });
    const sorted = [...finalResults].sort((a, b) => b.finalPt - a.finalPt);

    return (
      <div style={body}>
        <div style={{ textAlign: "center", padding: "24px 0 16px" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>対局終了</h2>
          <p style={{ fontSize: 13, color: t.dm, margin: 0 }}>
            {gameConfig?.date} / {MATCH_LABEL(gameConfig?.matchType)} / {rounds.length}局
          </p>
        </div>

        {/* Raw scores */}
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 10, letterSpacing: "0.05em" }}>最終持ち点</div>
          {kyotakuAward && (
            <div style={{ fontSize: 11, color: t.gd, marginBottom: 10, padding: "7px 10px", borderRadius: 8, background: t.gdS, border: `1px solid ${t.gd}33`, lineHeight: 1.7 }}>
              卓上に残った供託リーチ棒 {kyotakuAward.n}本（+{(kyotakuAward.n * 1000).toLocaleString()}点）はトップの {players[kyotakuAward.idx]} さんが受け取りました
            </div>
          )}
          {[...adjusted].sort((a, b) => b.rawScore - a.rawScore).map((s, rank) => (
            <div key={s.idx} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", borderRadius: 10, marginBottom: 4,
              background: rank === 0 ? t.gdS : "transparent",
              border: rank === 0 ? `1px solid ${t.gd}44` : `1px solid ${t.bd}33`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: rank === 0 ? t.gd : rank === 1 ? t.tx : t.dm, width: 24 }}>{rank + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: s.rawScore < 0 ? t.rd : t.tx }}>{s.rawScore.toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* Oka calculation */}
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 6, letterSpacing: "0.05em" }}>精算（オカ計算）</div>
          <div style={{ fontSize: 11, color: t.dm, marginBottom: 12 }}>
            返し点 {returnPt.toLocaleString()} / オカ {okaPool > 0 ? `+${okaPool.toLocaleString()} (1位へ)` : "なし"}
            {(ruleSet.uma || []).some(u => u !== 0) && ` / ウマ ${(ruleSet.uma || []).map(u => (u > 0 ? "+" : "") + u).join("/")}`}
          </div>
          {sorted.map((s, rank) => (
            <div key={s.idx} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 14px", borderRadius: 10, marginBottom: 6,
              background: rank === 0 ? t.gdS : "transparent",
              border: rank === 0 ? `1px solid ${t.gd}44` : `1px solid ${t.bd}33`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: rank === 0 ? t.gd : rank === 1 ? t.tx : t.dm, width: 24 }}>{rank + 1}</span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: s.finalPt > 0 ? t.gn : s.finalPt < 0 ? t.rd : t.tx }}>
                  {s.finalPt > 0 ? "+" : ""}{s.finalPt.toLocaleString()}
                </span>
                <div style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", color: s.rawScore < 0 ? t.rd : t.dm }}>
                  素点 {s.rawScore.toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ウマ込みのポイント */}
        {(ruleSet.uma || []).some(u => u !== 0) && (() => {
          const uma = ruleSet.uma;
          const gosha = (v) => { const s = v < 0 ? -1 : 1, a = Math.abs(v), f = Math.floor(a); return s * (a - f > 0.5 ? f + 1 : f); };
          const rk = scores.map((s, i) => ({ i, s })).sort((a3, b3) => (b3.s - a3.s) || (a3.i - b3.i));
          const res = new Array(PC);
          rk.forEach((x, rank) => {
            res[x.i] = { rank: rank + 1, pt: gosha((x.s - returnPt + (rank === 0 ? okaPool : 0)) / 1000) + uma[rank] };
          });
          const order = [...res.map((r, i) => ({ ...r, i }))].sort((a3, b3) => a3.rank - b3.rank);
          return (
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 6, letterSpacing: "0.05em" }}>
                ポイント（ウマ・オカ込み）
              </div>
              <div style={{ fontSize: 11, color: t.dm, marginBottom: 12 }}>
                素点を五捨六入し、オカとウマを加えたものです
              </div>
              {order.map(o => (
                <div key={o.i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "11px 14px", borderRadius: 10, marginBottom: 6,
                  background: o.rank === 1 ? t.gdS : "transparent",
                  border: o.rank === 1 ? `1px solid ${t.gd}44` : `1px solid ${t.bd}33`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 900, width: 24, color: o.rank === 1 ? t.gd : t.dm }}>{o.rank}</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{players[o.i]}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{
                      fontSize: 17, fontWeight: 900, fontVariantNumeric: "tabular-nums",
                      color: o.pt > 0 ? t.gn : o.pt < 0 ? t.rd : t.tx,
                    }}>{o.pt > 0 ? "+" : ""}{o.pt}</span>
                    {!!(gameConfig?.rules?.rate) && (
                      <div style={{
                        fontSize: 12, fontWeight: 800, marginTop: 1, fontVariantNumeric: "tabular-nums",
                        color: o.pt > 0 ? t.gd : o.pt < 0 ? t.rd : t.dm,
                      }}>
                        {o.pt > 0 ? "+" : ""}{GOLD_LABEL(GOLD(o.pt, gameConfig.rules.rate))}
                        <span style={{ fontSize: 9, marginLeft: 2, opacity: 0.8 }}>{gameConfig.rules.rateUnit || "G"}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!!(gameConfig?.rules?.rate) && (
                <div style={{ fontSize: 10, color: t.dm, textAlign: "right", marginTop: 6 }}>
                  レート 1点 = {RATE_LABEL(gameConfig.rules.rate)} {gameConfig.rules.rateUnit || "G"}
                </div>
              )}
            </div>
          );
        })()}

        {/* Round history */}
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 8, letterSpacing: "0.05em" }}>局の記録</div>
          {rounds.map((r, idx) => (
            <div key={idx} style={{ padding: "6px 0", borderBottom: `1px solid ${t.bd}33`, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: t.dm }}>{r.wind}{r.dealer + 1}局{r.honba > 0 ? ` ${r.honba}本場` : ""}</span>
              {r.draw ? (
                <span style={{ color: t.dm }}>
                  流局
                  {r.tenpai && r.tenpai.some(Boolean) && (
                    <span style={{ marginLeft: 4, color: t.gn }}>
                      聴{r.tenpai.map((tp, i) => tp ? players[i]?.charAt(0) : null).filter(Boolean).join("")}
                    </span>
                  )}
                </span>
              ) : (
                <span>
                  <span style={{ color: t.ac, fontWeight: 600 }}>{players[r.winner]}</span>
                  {" "}<span style={{ color: t.dm }}>{r.han >= 13 ? getLimitName(r.han) : r.fu ? `${r.han}翻${r.fu}符` : `${r.han}翻`}</span>
                  {" "}<span style={{ fontWeight: 700 }}>{r.score?.toLocaleString()}</span>
                  {r.limitName && <span style={{ color: t.gd, marginLeft: 4 }}>{r.limitName}</span>}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* リーグ戦の結果 */}
        {(() => {
          const lg = leagues.find(l => l.id === activeLeagueId);
          if (!lg) return null;
          const res = calcGamePts(scores, scores.map((_, i) => i), lg);
          return (
            <div style={{ ...card, border: `1px solid ${t.gd}55`, background: t.gdS }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.gd, marginBottom: 8, letterSpacing: "0.05em" }}>
                🏆 {lg.name} の成績
              </div>
              {players.slice(0, PC).map((nm, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                  <span style={{ width: 24, fontSize: 12, fontWeight: 800, color: res[i].rank === 1 ? t.gd : t.dm }}>
                    {res[i].rank}位
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: t.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nm}</span>
                  <span style={{ fontSize: 12, color: t.dm, fontVariantNumeric: "tabular-nums" }}>{scores[i].toLocaleString()}</span>
                  <span style={{
                    width: 54, textAlign: "right", fontSize: 15, fontWeight: 900, fontVariantNumeric: "tabular-nums",
                    color: res[i].pt > 0 ? t.gn : res[i].pt < 0 ? t.rd : t.tx,
                  }}>{res[i].pt > 0 ? "+" : ""}{res[i].pt}</span>
                  {!!(lg.rules?.rate) && (
                    <span style={{
                      width: 62, textAlign: "right", fontSize: 12, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                      color: res[i].pt > 0 ? t.gd : res[i].pt < 0 ? t.rd : t.dm,
                    }}>{res[i].pt > 0 ? "+" : ""}{GOLD_LABEL(GOLD(res[i].pt, lg.rules.rate))}
                      <span style={{ fontSize: 9, marginLeft: 2, opacity: 0.8 }}>{lg.rules.rateUnit || "G"}</span>
                    </span>
                  )}
                </div>
              ))}
              <div style={{ fontSize: 10, color: t.dm, marginTop: 8, lineHeight: 1.7 }}>
                返し点 {(lg.rules.returnPoints).toLocaleString()} との差を五捨六入し、ウマ
                {" "}{lg.uma.map(u => (u > 0 ? "+" : "") + u).join("/")} を加算。オカはトップへ。
              </div>
            </div>
          );
        })()}

        <button style={actionBtn("p")} onClick={() => {
          const lgName = leagues.find(l => l.id === activeLeagueId)?.name;
          if (!window.confirm(
            lgName
              ? `この結果を「${lgName}」に記録して対局を終了します。\n記録後は変更できません。よろしいですか？`
              : "この結果を履歴に記録して対局を終了します。\n記録後は変更できません。よろしいですか？"
          )) return;
          setReviewing(false);
          setShowScoreFix(false);
          if (rounds.length > 0) {
            setGameHistory(prev => [...prev, {
              id: Date.now(),
              date: gameConfig?.date || "",
              matchType: gameConfig?.matchType || "",
              players: [...players],
              finalScores: [...scores],
              okaResults: sorted.map(s => ({ name: s.name, finalPt: s.finalPt })),
              rounds: [...rounds],
              rules: gameConfig?.rules || {},
              leagueId: activeLeagueId || null,
            }]);
          }
          // リーグ戦なら成績表にも記録する
          const lg = leagues.find(l => l.id === activeLeagueId);
          if (lg && rounds.length > 0) {
            const res = calcGamePts(scores, scores.map((_, i) => i), lg);
            const entry = {
              date: gameConfig?.date || "",
              matchType: gameConfig?.matchType || "hanchan",
              players: [...players],
              scores: [...scores],
              pts: res.map(r => r.pt),
              ranks: res.map(r => r.rank),
            };
            const nextGames = [...(lg.games || []), entry];
            const reached = lg.mode === "count" && nextGames.length >= (lg.targetCount || 0);
            saveLeagues(leagues.map(l => l.id === lg.id
              ? { ...l, games: nextGames, status: reached ? "done" : l.status } : l));
          }
          const back = activeLeagueId;
          setActiveLeagueId(null);
          setGameStarted(false);
          setGameFinished(false);
          if (back) { setLeagueId(back); setLeagueTab("stand"); setView("leaguedetail"); }
          else setView("home");
        }}>{activeLeagueId ? "✓ 対局終了・リーグに記録する" : "✓ 対局終了・履歴に記録する"}</button>

        {/* 修正 */}
        <div style={{ ...card, padding: 14, marginTop: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 4, letterSpacing: "0.05em" }}>
            内容に誤りがある場合
          </div>
          <div style={{ fontSize: 11, color: t.dm, marginBottom: 11, lineHeight: 1.7 }}>
            記録する前に修正できます。記録したあとは変更できません。
          </div>

          <button style={{ ...actionBtn(), marginTop: 0 }}
            onClick={() => { setGameFinished(false); setReviewing(true); setShowRoundEdit(true); }}>
            ✏️ 局の内容を修正する
          </button>

          <button style={{ ...actionBtn() }}
            onClick={() => setShowScoreFix(v => !v)}>
            {showScoreFix ? "▲ 点数の直接修正を閉じる" : "🔧 点数を直接修正する"}
          </button>

          {showScoreFix && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: t.sf, border: `1px solid ${t.bd}` }}>
              <div style={{ fontSize: 11, color: t.dm, marginBottom: 10, lineHeight: 1.7 }}>
                チョンボや点棒の受け渡しミスなど、局の記録では直せない分を調整します
              </div>
              {players.slice(0, PC).map((nm, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{
                    flex: 1, fontSize: 13, fontWeight: 700, color: t.tx,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{nm}</span>
                  <button onClick={() => setScores(s => s.map((v, k) => k === i ? v - 1000 : v))} style={{
                    width: 38, height: 34, borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${t.bd}`, background: t.card, color: t.tx, fontSize: 16, fontWeight: 800,
                  }}>−</button>
                  <span style={{
                    width: 74, textAlign: "center", fontSize: 15, fontWeight: 800,
                    fontVariantNumeric: "tabular-nums", color: scores[i] < 0 ? t.rd : t.tx,
                  }}>{scores[i].toLocaleString()}</span>
                  <button onClick={() => setScores(s => s.map((v, k) => k === i ? v + 1000 : v))} style={{
                    width: 38, height: 34, borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${t.bd}`, background: t.card, color: t.tx, fontSize: 16, fontWeight: 800,
                  }}>＋</button>
                </div>
              ))}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.bd}`,
              }}>
                <span style={{ fontSize: 11, color: t.dm }}>4人の合計</span>
                <span style={{
                  fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                  color: scores.reduce((a2, b2) => a2 + b2, 0) === (ruleSet.startPoints ?? 25000) * 4 ? t.gn : t.rd,
                }}>
                  {scores.reduce((a2, b2) => a2 + b2, 0).toLocaleString()}
                  <span style={{ fontSize: 10, color: t.dm, fontWeight: 400 }}>
                    {" / "}{((ruleSet.startPoints ?? 25000) * 4).toLocaleString()}
                  </span>
                </span>
              </div>
              {scores.reduce((a2, b2) => a2 + b2, 0) !== (ruleSet.startPoints ?? 25000) * 4 && (
                <div style={{ fontSize: 10, color: t.rd, marginTop: 6, lineHeight: 1.7 }}>
                  合計が持ち点×4と一致していません。誰かの点数を調整してください。
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ══════════════════════════════════
  // ── GAME VIEW ROUTER ──
  // ══════════════════════════════════
  const renderGame = () => {
    if (gameFinished) return renderGameFinished();
    if (gameStarted) {
      // 卓上モード（ウィザードが開いている間は通常表示に戻す）
      if (tableMode && !showGW && !showDrawWiz && !showExtendConfirm) return renderTableMode();
      return renderGamePlay();
    }
    return renderSetup();
  };

  // ══════════════════════════════════
  // ── HISTORY VIEW ──
  // ══════════════════════════════════
  const [historyDetail, setHistoryDetail] = useState(null);

  // ── Backup / Restore ──
  const [restoreMsg, setRestoreMsg] = useState(null);

  const exportBackup = async () => {
    const data = { version: 1, exportedAt: new Date().toISOString(), history: gameHistory };
    const json = JSON.stringify(data, null, 2);
    const now = new Date();
    const fname = `mahjong-backup-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}.json`;

    // 1) Android Chrome: File System Access API（保存先を選べる）
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fname,
          types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
        });
        const w = await handle.createWritable();
        await w.write(json);
        await w.close();
        setRestoreMsg({ ok: true, text: "保存しました" });
        return;
      } catch (err) {
        if (err.name === "AbortError") return; // ユーザーがキャンセル
      }
    }

    const blob = new Blob([json], { type: "application/json" });
    const file = new File([blob], fname, { type: "application/json" });

    // 2) iOS Safari / Android: 共有シート
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "麻雀対局履歴のバックアップ" });
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }

    // 3) フォールバック: 通常ダウンロード（PC / 古いブラウザ）
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setRestoreMsg({ ok: true, text: "ダウンロードしました" });
  };

  const importBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const incoming = data.history || (Array.isArray(data) ? data : null);
        if (!incoming) { setRestoreMsg({ ok: false, text: "ファイル形式が正しくありません" }); return; }
        // 既存とマージ（id重複は除外）
        const existingIds = new Set(gameHistory.map(g => g.id));
        const merged = [...gameHistory, ...incoming.filter(g => !existingIds.has(g.id))];
        merged.sort((a, b) => (a.id || 0) - (b.id || 0));
        saveHistory(merged);
        setRestoreMsg({ ok: true, text: `${incoming.filter(g => !existingIds.has(g.id)).length}件を追加しました（合計${merged.length}件）` });
      } catch {
        setRestoreMsg({ ok: false, text: "読み込みに失敗しました" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const renderHistory = () => (
    <div style={body}>
      {historyDetail === null ? (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>対局履歴</div>

          {/* バックアップ操作 */}
          <div style={{ ...card, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 4 }}>データのバックアップ</div>
            <div style={{ fontSize: 11, color: t.dm, marginBottom: 10, lineHeight: 1.6 }}>
              履歴はこの端末に保存されています。ファイルに書き出せば、機種変更やデータ削除に備えられます。
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ flex: 1, padding: "12px 8px", borderRadius: 10, border: `1px solid ${t.ac}`, background: t.acS, color: t.ac, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                onClick={exportBackup} disabled={gameHistory.length === 0}>
                💾 書き出す
              </button>
              <label style={{ flex: 1, padding: "12px 8px", borderRadius: 10, border: `1px solid ${t.bd}`, background: t.sf, color: t.tx, fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "center", display: "block" }}>
                📂 読み込む
                <input type="file" accept=".json,application/json,text/plain,*/*" onChange={importBackup} style={{ display: "none" }} />
              </label>
            </div>
            {restoreMsg && (
              <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, fontSize: 12, background: restoreMsg.ok ? t.gnS : t.rdS, color: restoreMsg.ok ? t.gn : t.rd, textAlign: "center" }}>
                {restoreMsg.ok ? "✓ " : "✕ "}{restoreMsg.text}
              </div>
            )}
          </div>

          {gameHistory.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 14, color: t.dm }}>まだ記録がありません</div>
              <div style={{ fontSize: 12, color: t.dm, marginTop: 4 }}>対局を終了すると自動的に保存されます</div>
            </div>
          ) : (
            [...gameHistory].reverse().map((g, idx) => {
              const sorted = g.players.map((p, i) => ({ name: p, score: g.finalScores[i] })).sort((a, b) => b.score - a.score);
              return (
                <button
                  key={g.id}
                  onClick={() => setHistoryDetail(g)}
                  style={{ ...card, width: "100%", textAlign: "left", cursor: "pointer", padding: 16, transition: "all 0.12s" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{g.date}</span>
                    <span style={{ fontSize: 12, color: t.dm, padding: "2px 10px", background: t.sf, borderRadius: 6 }}>
                      {MATCH_LABEL_SHORT(g.matchType)}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {sorted.map((s, si) => (
                      <span key={si} style={{
                        fontSize: 12, padding: "3px 8px", borderRadius: 6,
                        background: si === 0 ? t.gdS : t.sf,
                        color: s.score < 0 ? t.rd : si === 0 ? t.gd : t.tx,
                        fontWeight: si === 0 || s.score < 0 ? 700 : 400,
                        border: `1px solid ${si === 0 ? t.gd + "33" : t.bd}`,
                      }}>
                        {si === 0 && "🏆 "}{s.name} {s.score.toLocaleString()}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: t.dm, marginTop: 6 }}>{g.rounds.length}局</div>
                </button>
              );
            })
          )}
        </>
      ) : (
        <>
          <button style={backBtn} onClick={() => setHistoryDetail(null)}>← 一覧に戻る</button>
          <div style={{ ...card, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{historyDetail.date}</span>
              <span style={{ fontSize: 12, color: t.dm, padding: "2px 10px", background: t.sf, borderRadius: 6 }}>
                {MATCH_LABEL(historyDetail.matchType)}
              </span>
            </div>

            {/* Final scores ranked */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 8 }}>最終スコア</div>
              {historyDetail.players
                .map((p, i) => ({ name: p, score: historyDetail.finalScores[i], idx: i }))
                .sort((a, b) => b.score - a.score)
                .map((s, rank) => (
                  <div key={s.idx} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", borderRadius: 8, marginBottom: 4,
                    background: rank === 0 ? t.gdS : "transparent",
                    border: rank === 0 ? `1px solid ${t.gd}33` : "1px solid transparent",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: rank === 0 ? t.gd : t.dm, width: 20 }}>{rank + 1}</span>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: s.score < 0 ? t.rd : t.tx }}>
                      {s.score.toLocaleString()}
                    </span>
                  </div>
                ))
              }
            </div>

            {/* Round history */}
            <div style={{ fontSize: 12, fontWeight: 700, color: t.dm, marginBottom: 8 }}>局の記録</div>
            {historyDetail.rounds.map((r, idx) => (
              <div key={idx} style={{ padding: "6px 0", borderBottom: `1px solid ${t.bd}33`, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: t.dm }}>{r.wind}{r.dealer + 1}局{r.honba > 0 ? ` ${r.honba}本場` : ""}</span>
                {r.draw ? (
                  <span style={{ color: t.dm }}>
                    流局
                    {r.tenpai && r.tenpai.some(Boolean) && (
                      <span style={{ marginLeft: 4, color: t.gn }}>
                        聴{r.tenpai.map((tp, i) => tp ? historyDetail.players[i]?.charAt(0) : null).filter(Boolean).join("")}
                      </span>
                    )}
                  </span>
                ) : (
                  <span>
                    <span style={{ color: t.ac, fontWeight: 600 }}>{historyDetail.players[r.winner]}</span>
                    {" "}<span style={{ color: t.dm }}>{r.han >= 13 ? getLimitName(r.han) : r.fu ? `${r.han}翻${r.fu}符` : `${r.han}翻`}</span>
                    {" "}<span style={{ fontWeight: 700 }}>{r.score?.toLocaleString()}</span>
                    {r.limitName && <span style={{ color: t.gd, marginLeft: 4 }}>{r.limitName}</span>}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      <style>{globalStyle}</style>
      <div style={{
        minHeight: "100vh", background: t.bg, color: t.tx,
        fontFamily: "'Noto Sans JP','Hiragino Kaku Gothic ProN',system-ui,sans-serif",
        maxWidth: isLandscape ? Math.min(vp.w - 24, 900) : 440,
        margin: "0 auto", overflowX: "hidden", width: "100%",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        boxSizing: "border-box",
      }}>
        {view !== "title" && !(view === "game" && tableMode && gameStarted && !gameFinished) && !(view === "home" && homeCat === null) && (
        <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${t.bd}`, display: "flex", alignItems: "center", gap: 8 }}>
          {/* 結果画面は記録前なので、うっかり離脱しないよう戻るを出さない */}
          {view !== "home" && !(view === "game" && gameFinished)
            && !(view === "game" && !gameStarted) ? (
            <button
              onClick={() => setView("home")}
              style={{
                background: t.card, border: `1px solid ${t.bd}`, borderRadius: 10,
                padding: "7px 12px", color: t.ac, fontSize: 13, fontWeight: 700,
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              }}>← 戻る</button>
          ) : <span style={{ width: 62, flexShrink: 0 }} />}
          <h1 style={{ flex: 1, fontSize: 17, fontWeight: 800, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}
            onClick={() => { setHomeCat(null); setView("title"); }}>🀄 <span>卓上ポンづけ</span></h1>
          <span style={{ width: 62, flexShrink: 0 }} />
        </div>
        )}
        {view === "title" && renderTitle()}
        {view === "home" && renderHome()}
        {view === "calc" && renderCalc()}
        {view === "game" && renderGame()}
        {view === "history" && renderHistory()}
        {view === "quiz" && renderQuiz()}
        {view === "termquiz" && renderTermQuiz()}
        {view === "scorequiz" && renderScoreQuiz()}
        {view === "league" && renderLeagueList()}
        {view === "leagueform" && renderLeagueForm()}
        {view === "leaguedetail" && renderLeagueDetail()}
        {view === "leaguestart" && renderLeagueStart()}
        {view === "dict" && renderDict()}
        {view === "fucourse" && renderFuCourse()}
        {view === "table" && renderTable()}
        {view === "startguide" && renderStartGuide()}
        {view === "names" && renderNames()}
        {showFuHelp && <FuHelpModal />}
      </div>
    </>
  );
}


