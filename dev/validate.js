const babel = require('/home/claude/babelcheck/node_modules/@babel/core');
const fs = require('fs');
const code = fs.readFileSync('app-body.jsx', 'utf8');
try {
  babel.transformSync(code, { presets: [require('/home/claude/babelcheck/node_modules/@babel/preset-react')] });
  console.log('JSX OK');
} catch (e) {
  console.log('JSX ERROR:', e.message.split('\n')[0]);
  if (e.loc) console.log('Line:', e.loc.line, 'Col:', e.loc.column);
}
