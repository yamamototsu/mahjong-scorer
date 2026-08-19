// ビルド後の index.html をNode上でSSRし、実行時の参照エラー（TDZ・未定義変数など）を検出する
// 使い方: node /home/claude/ssr-test.js
const fs = require("fs");
const NM = "/home/claude/prev/node_modules";
const React = require(NM + "/react");
const { renderToString } = require(NM + "/react-dom/server");

global.navigator = { vibrate: () => {}, userAgent: "node" };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.window = {
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  localStorage: global.localStorage, navigator: global.navigator,
  location: { href: "", search: "" },
};
global.document = {
  addEventListener() {}, removeEventListener() {},
  getElementById: () => ({}),
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { style: {}, appendChild() {}, removeChild() {} },
  documentElement: { style: {} },
};
global.React = React;
global.ReactDOM = {
  render: (el) => {
    try {
      console.log("SSR OK:", renderToString(el).length, "chars");
    } catch (e) {
      console.log("SSR ERROR:", e.message);
      process.exit(1);
    }
  },
};

const html = fs.readFileSync("/mnt/user-data/outputs/index.html", "utf8");
const i = html.indexOf("<script>\n", html.indexOf("react-dom")) + "<script>\n".length;
const j = html.lastIndexOf("</script>");
eval(html.slice(i, j));
