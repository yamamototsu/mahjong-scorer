const babel = require('/home/claude/babelcheck/node_modules/@babel/core');
const fs = require('fs');
const src = fs.readFileSync('/home/claude/app-body.jsx', 'utf8');
const out = babel.transformSync(src, {
  presets: [[require('/home/claude/babelcheck/node_modules/@babel/preset-react'), { runtime: 'classic' }]],
  compact: false,
  comments: false,
});
fs.writeFileSync('/home/claude/app-body.js', out.code);
console.log('compiled:', Math.round(out.code.length/1024) + 'KB');
