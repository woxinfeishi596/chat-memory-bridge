#!/usr/bin/env node
/**
 * 从运行中的浏览器（Chrome / Edge，远程调试端口）抓取分享页的接口返回。
 *
 * 用法：
 *   node capture-share.mjs --url "https://chat.deepseek.com/share/xxxx" -o share-raw.json
 *   node capture-share.mjs --port 9222 -o share-raw.json        # 页面已经开着
 *
 * 前提：浏览器用 --remote-debugging-port=9222 启动。
 * 这条路拿得到「思考过程」；手动复制粘贴的路子拿不到，正文一样。
 */
import { writeFileSync } from 'node:fs';

const HELP = `
capture-share.mjs — 抓取分享页的 JSON 接口

  --url <url>       分享链接；给了就自动导航过去
  --port <n>        调试端口，默认 9222
  -o, --output <f>  输出文件，默认 share-raw.json
  --timeout <ms>    抓取等待时间，默认 25000
  -h, --help        显示帮助
`;

function parseArgs(argv) {
  const o = { port: 9222, out: 'share-raw.json', url: '', timeout: 25000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`参数 ${a} 缺少值`);
      return v;
    };
    if (a === '-o' || a === '--output') o.out = next();
    else if (a === '--url') o.url = next();
    else if (a === '--port') o.port = Number(next());
    else if (a === '--timeout') o.timeout = Number(next());
    else if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    else throw new Error(`未知参数: ${a}`);
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));

// ---- 找目标页面 ----------------------------------------------------------
let list;
try {
  list = await (await fetch(`http://127.0.0.1:${opts.port}/json/list`)).json();
} catch {
  console.error(`✗ 连不上 CDP 端口 ${opts.port}`);
  console.error('');
  console.error('  请先用调试端口启动浏览器，例如：');
  console.error('    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222');
  console.error('  再在里面打开分享页；或者直接给 --url 让脚本自己导航。');
  console.error('');
  console.error('  没有调试环境的话，走手动路线：分享页全选复制，存成 chat-raw.md，');
  console.error('  然后直接跳到 outline.mjs。正文一样能用，只是少了思考过程。');
  process.exit(2);
}

const isPage = (t) => t.type === 'page' && t.webSocketDebuggerUrl;
let page;
if (opts.url) {
  try {
    const origin = new URL(opts.url).origin;
    page = list.find((t) => isPage(t) && t.url.startsWith(origin));
  } catch {
    throw new Error(`--url 不是合法网址: ${opts.url}`);
  }
}
page ??= list.find((t) => isPage(t) && /deepseek\.com/.test(t.url));
page ??= list.find(isPage);

if (!page) {
  console.error('✗ 调试端口开着，但没有可用的标签页。先建一个页面再重试。');
  process.exit(3);
}

// ---- 连上去，开网络监听 ------------------------------------------------
const ws = new WebSocket(page.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const requests = new Map();
const bodies = [];

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); rej(new Error(`超时: ${method}`)); }
    }, 30000);
  });
}

ws.addEventListener('message', async (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    return;
  }
  if (m.method === 'Network.responseReceived') {
    const { requestId, response } = m.params;
    requests.set(requestId, { url: response.url, mime: response.mimeType, status: response.status });
  }
  if (m.method === 'Network.loadingFinished') {
    const info = requests.get(m.params.requestId);
    if (!info) return;
    if (/json/.test(info.mime || '') && /^https?:\/\/[^/]*deepseek\.com\/api\//.test(info.url)) {
      try {
        const r = await send('Network.getResponseBody', { requestId: m.params.requestId });
        bodies.push({ url: info.url, body: r.body, base64: r.base64Encoded });
        process.stderr.write(`  ← ${info.url}  ${r.body.length} bytes\n`);
      } catch { /* 响应体可能已被浏览器丢弃，忽略 */ }
    }
  }
});

await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')), { once: true });
});

await send('Network.enable');
await send('Page.enable');

console.error(`→ 目标页面: ${page.url}`);
if (opts.url && !page.url.startsWith(opts.url)) {
  console.error('→ 导航到分享链接…');
  await send('Page.navigate', { url: opts.url });
} else {
  console.error('→ 刷新以重新触发接口请求…');
  await send('Page.reload', { ignoreCache: true });
}

await new Promise((r) => setTimeout(r, opts.timeout));

const shareBodies = bodies.filter((b) => /share/.test(b.url));

writeFileSync(opts.out, JSON.stringify(bodies, null, 1), 'utf8');
ws.close();

console.error('');
console.error(`✓ 捕获 ${bodies.length} 个接口响应，其中 ${shareBodies.length} 个是分享内容`);
console.error(`✓ 已写入 ${opts.out}`);
if (shareBodies.length === 0) {
  console.error('');
  console.error('⚠ 没抓到分享内容，可能原因：');
  console.error('  · 页面没加载完 → 加大 --timeout');
  console.error('  · 分享链接需要登录 / 已失效');
  console.error('  · 该站点不是 DeepSeek');
  process.exit(4);
}
process.exit(0);
