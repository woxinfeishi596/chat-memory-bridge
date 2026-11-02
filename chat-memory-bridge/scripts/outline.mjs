#!/usr/bin/env node
/**
 * 给原始层 Markdown 出一份大纲：每轮在哪几行、多大，以及该怎么分块读。
 *
 * 用法：
 *   node outline.mjs chat-raw.md
 *   node outline.mjs chat-raw.md --chunk 30000 --all
 *
 * 分块的意义：几万字的对话一次读不进上下文，硬读会被截断，
 * 截断掉的往往正好是后面那些细节。
 */
import { readFileSync } from 'node:fs';

const HELP = `
outline.mjs — 轮次大纲与分块建议

  用法: node outline.mjs <chat-raw.md> [--chunk 40000] [--all]
  --chunk <n>   每块的目标字符数，默认 40000
  --all         即使轮次很多也逐条列出
  -h, --help    显示帮助
`;

function parseArgs(argv) {
  const o = { input: '', chunk: 40000, all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`参数 ${a} 缺少值`);
      return v;
    };
    if (a === '--chunk') o.chunk = Number(next());
    else if (a === '--all') o.all = true;
    else if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    else if (a.startsWith('-')) throw new Error(`未知参数: ${a}`);
    else o.input = a;
  }
  if (!o.input) { console.error(HELP); process.exit(1); }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
const lines = readFileSync(opts.input, 'utf8').split(/\r?\n/);
const totalChars = lines.join('\n').length;

// 收集每一轮的起始行（1-based）
const starts = [];
const re = /^##\s*第\s*(\d+)\s*轮/;
lines.forEach((line, idx) => {
  const m = line.match(re);
  if (m) starts.push({ turn: Number(m[1]), line: idx + 1, time: (line.split('·').pop() || '').trim() });
});

if (starts.length === 0) {
  console.error(`✗ ${opts.input} 里没有找到 "## 第 N 轮" 标记。`);
  console.error('  这个文件可能不是 share-to-md.mjs 生成的，或者内容是手动粘贴的。');
  console.error('  手动粘贴的内容可以直接整篇读，不需要分块，也就不需要这个脚本。');
  process.exit(2);
}

const lineChar = (from, to) => {
  const slice = lines.slice(from - 1, to - 1).join('\n');
  return slice.length;
};

// 每轮的大小
const turns = starts.map((s, i) => {
  const end = i + 1 < starts.length ? starts[i + 1].line : lines.length + 1;
  return { ...s, end, chars: lineChar(s.line, end) };
});

const fmt = (n) => n.toLocaleString('en-US');

console.log(`文件    ${opts.input}`);
console.log(`轮次    ${turns.length}`);
console.log(`字符    ${fmt(totalChars)}`);
console.log(`日期    ${turns[0]?.time || '?'} → ${turns.at(-1)?.time || '?'}`);
console.log('');

// 分块
const chunks = [];
let cur = null;
for (const t of turns) {
  if (!cur) cur = { from: t.turn, lineStart: t.line, chars: 0 };
  cur.to = t.turn;
  cur.lineEnd = t.end - 1;
  cur.chars += t.chars;
  if (cur.chars >= opts.chunk) { chunks.push(cur); cur = null; }
}
if (cur) chunks.push(cur);

const single = totalChars <= opts.chunk;
console.log(single ? '结论    一次可以读完，不用分块。' : `结论    分 ${chunks.length} 块读，每块约 ≤${fmt(opts.chunk)} 字符`);
console.log('');

for (const c of chunks) {
  const range = c.from === c.to ? `第 ${c.from} 轮` : `第 ${c.from}–${c.to} 轮`;
  console.log(`块 ${chunks.indexOf(c) + 1}  ${range.padEnd(16)} 行 ${c.lineStart}–${c.lineEnd}   ${fmt(c.chars)} 字符`);
}

if (opts.all || turns.length <= 60) {
  console.log('');
  console.log('逐轮明细');
  console.log('轮次    行号            字符    时间');
  for (const t of turns) {
    console.log(
      String(t.turn).padStart(4) + '    ' +
      `${t.line}–${t.end - 1}`.padEnd(15) + ' ' +
      fmt(t.chars).padStart(7) + '   ' + t.time
    );
  }
}

console.log('');
console.log('提示：用 read 工具按上面给的行号区间读，offset 起、limit 为该块行数。');
console.log('     每块都带上当前母本一起读，否则会把旧信息当新发现重复记录。');
