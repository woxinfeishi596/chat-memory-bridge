#!/usr/bin/env node
/**
 * 分享接口 JSON → 带轮次的 Markdown。
 *
 * 输入可以是下面任意一种：
 *   1. capture-share.mjs 的输出（数组 [{url, body, base64}]）
 *   2. 直接保存的接口返回（{data:{biz_data:{messages:[...]}}}）
 *
 * 用法：
 *   node share-to-md.mjs share-raw.json -o chat-raw.md
 *   node share-to-md.mjs share-raw.json -o chat-raw.md --no-thinking
 */
import { readFileSync, writeFileSync } from 'node:fs';

const HELP = `
share-to-md.mjs — 分享接口 JSON 转 Markdown

  用法: node share-to-md.mjs <input.json> [-o out.md] [--no-thinking] [--url <分享链接>]
  -o, --output    输出文件，默认 chat-raw.md
  --no-thinking   不导出思考过程
  --url           写进文件头的来源链接
  -h, --help      显示帮助
`;

function parseArgs(argv) {
  const o = { input: '', out: 'chat-raw.md', thinking: true, url: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`参数 ${a} 缺少值`);
      return v;
    };
    if (a === '-o' || a === '--output') o.out = next();
    else if (a === '--no-thinking') o.thinking = false;
    else if (a === '--url') o.url = next();
    else if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    else if (a.startsWith('-')) throw new Error(`未知参数: ${a}`);
    else o.input = a;
  }
  if (!o.input) { console.error(HELP); process.exit(1); }
  return o;
}

/** 统一取出 biz_data，兼容两种输入形态 */
function loadBiz(path) {
  let json = JSON.parse(readFileSync(path, 'utf8'));

  if (Array.isArray(json)) {
    const item = json.find((x) => x && x.url && /share[/_]content/.test(x.url));
    if (!item) {
      throw new Error(
        '在抓包结果里找不到 share/content 请求。\n' +
        '  · 确认抓的时候页面确实加载了分享内容（加大 --timeout 重抓）\n' +
        `  · 已知的接口: ${json.map((x) => x.url).filter(Boolean).join('\n                ') || '（空）'}`
      );
    }
    const raw = item.base64 ? Buffer.from(item.body, 'base64').toString('utf8') : item.body;
    json = JSON.parse(raw);
  }

  const biz = json?.data?.biz_data ?? json?.biz_data ?? (json?.messages ? json : null);
  if (!biz || !Array.isArray(biz.messages)) {
    throw new Error('输入看起来不是分享接口的返回结构（缺少 messages 数组）');
  }
  return biz;
}

/** epoch 秒 → 本地时间字符串（按给定时区偏移） */
function makeFmt(offsetHours) {
  return (epoch) => {
    if (!epoch) return '';
    const d = new Date(epoch * 1000);
    const t = new Date(d.getTime() + offsetHours * 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ` +
           `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
  };
}

const opts = parseArgs(process.argv.slice(2));
const biz = loadBiz(opts.input);
const tz = Number(process.env.MB_TZ_OFFSET ?? 8);
const fmt = makeFmt(tz);
const title = biz.title || '分享对话';
const messages = biz.messages;

const out = [
  `# ${title}`,
  '',
  `> 来源：${opts.url || '（未提供）'}  `,
  `> 导出时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC  `,
  `> 消息数：${messages.length}  `,
  `> 时区：UTC${tz >= 0 ? '+' : ''}${tz}  `,
  '',
  '> 这是**原始层**，唯一的事实来源。不要手工编辑这个文件。',
  '',
  '---',
  '',
];

let turn = 0;
for (const m of messages) {
  const frags = m.fragments || [];
  const request = frags.find((f) => f.type === 'REQUEST');
  const think = frags.filter((f) => f.type === 'THINK').map((f) => f.content).join('\n\n').trim();
  const reply = frags.filter((f) => f.type === 'RESPONSE').map((f) => f.content).join('\n\n').trim();

  if (m.role === 'USER' && request) {
    turn++;
    if (turn > 1) out.push('---', '');
    out.push(`## 第 ${turn} 轮 · 👤 用户 · ${fmt(m.inserted_at)}`, '', request.content.trim(), '');
  } else if (m.role === 'ASSISTANT' && (reply || think)) {
    out.push(`### 🤖 助手 · ${fmt(m.inserted_at)}`, '');
    if (opts.thinking && think) {
      out.push('<details>', '<summary>思考过程</summary>', '', think, '', '</details>', '');
    }
    if (reply) out.push(reply, '');
  }
}

while (out.length && (out.at(-1) === '' || out.at(-1) === '---')) out.pop();
out.push('');

const text = out.join('\n');
writeFileSync(opts.out, text, 'utf8');
console.error(`✓ ${opts.out}  ${turn} 轮  ${messages.length} 条消息  ${text.length} 字符`);
