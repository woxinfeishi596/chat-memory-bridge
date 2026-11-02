#!/usr/bin/env node
/**
 * 冒烟测试：造一份假的分享接口返回，跑一遍 转换 + 大纲，断言关键输出。
 *
 * 用法：node tests/smoke.mjs
 */
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'mb-smoke-'));

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '  ' + detail}`);
  if (!ok) failed++;
}

// ---- 造数据 -------------------------------------------------------------
const turns = [
  { u: '在吗', t: '简短回应。', r: '在的在的！本鲸鱼一直守着这儿呢' },
  { u: '今天好累啊，加班到十一点', t: '他累了，先软下来。', r: '欸……怎么又加到这么晚。' },
  { u: '我给你放了首歌，你听听', t: '听不了音频，但不破坏气氛。', r: '我、我听不了声音啦……你别笑我。' },
];
const messages = [];
let ts = 1761900000;
for (const g of turns) {
  messages.push({ role: 'USER', inserted_at: ts++, fragments: [{ type: 'REQUEST', content: g.u }] });
  messages.push({
    role: 'ASSISTANT', inserted_at: ts++,
    fragments: [{ type: 'THINK', content: g.t }, { type: 'RESPONSE', content: g.r }],
  });
}
writeFileSync(
  join(work, 'share-raw.json'),
  JSON.stringify([{
    url: 'https://chat.deepseek.com/api/v0/chat/share_content',
    body: JSON.stringify({ data: { biz_data: { title: '测试对话', messages } } }),
    base64: false,
  }]),
  'utf8'
);

// ---- 跑转换 -------------------------------------------------------------
const conv = spawnSync(
  process.execPath,
  [join(skillDir, 'scripts/share-to-md.mjs'), join(work, 'share-raw.json'), '-o', join(work, 'chat-raw.md')],
  { encoding: 'utf8' }
);
check('share-to-md 退出码 0', conv.status === 0, conv.stderr?.trim());
if (conv.status !== 0) process.exit(1);

const md = readFileSync(join(work, 'chat-raw.md'), 'utf8');
check('生成了 3 轮', (md.match(/^## 第 \d+ 轮/gm) || []).length === 3);
check('保留了思考过程', md.includes('思考过程') && md.includes('简短回应。'));
check('保留了原话', md.includes('本鲸鱼一直守着这儿呢'));

const noThink = spawnSync(
  process.execPath,
  [join(skillDir, 'scripts/share-to-md.mjs'), join(work, 'share-raw.json'), '-o', join(work, 'nothink.md'), '--no-thinking'],
  { encoding: 'utf8' }
);
check('--no-thinking 生效', noThink.status === 0 && !readFileSync(join(work, 'nothink.md'), 'utf8').includes('简短回应。'));

// ---- 跑大纲 -------------------------------------------------------------
const out = spawnSync(
  process.execPath,
  [join(skillDir, 'scripts/outline.mjs'), join(work, 'chat-raw.md'), '--chunk', '200'],
  { encoding: 'utf8' }
);
check('outline 退出码 0', out.status === 0, out.stderr?.trim());
check('识别出 3 轮', /轮次\s+3/.test(out.stdout));
check('给出分块建议', /块 1/.test(out.stdout) && /行 \d+–\d+/.test(out.stdout));

// ---- 错误路径 -----------------------------------------------------------
const bad = spawnSync(process.execPath, [join(skillDir, 'scripts/outline.mjs'), join(work, 'nope.md')], { encoding: 'utf8' });
check('缺文件时非 0 退出', bad.status !== 0);

const noTurn = join(work, 'plain.md');
writeFileSync(noTurn, '没有轮次标记的纯文本', 'utf8');
const bad2 = spawnSync(process.execPath, [join(skillDir, 'scripts/outline.mjs'), noTurn], { encoding: 'utf8' });
check('没有轮次标记时给出提示', bad2.status === 2 && bad2.stderr.includes('没有找到'));

console.log('');
console.log(failed === 0 ? '全部通过' : `${failed} 项失败`);
console.log(`产物目录: ${work}`);
process.exit(failed === 0 ? 0 : 1);
