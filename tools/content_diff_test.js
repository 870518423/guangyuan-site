/* App 内容覆盖层「差量判定」闸门（第 19 轮，2026-10-19）
   ------------------------------------------------------------------
   为什么要这道闸门：管理者报障「设置页检查更新永远差 11 个文件、下完再点又重下」。
   根因是两件事叠在一起：
     ① 缓存桶里的键是百分号编码（%E6%9E%81…），清单里是原文（极恶贝利亚.js），
        不清码就永远不相等 → 那 11 个中文名文件每轮都被判「缺失」；
     ② 只判「桶里有没有」，不判「内容变没变」→ 同名文件改了也发现不了。
   本闸门用 vm 跑**真实的** app-shell.js（AkContent 段），给桩环境断言：
     A. 冷启动：差分 = 清单文件数（全部缺失）
     B. 全量下载后：差分归零，且中文名文件确实按编码键入桶
     C. 收敛性：紧接着再查一次仍是 0，再点更新不会再下任何文件（等价于「不再重下」）
     D. 内容变更：清单里某文件指纹变 → 差分恰好 1；下载后归零（真正的增量更新）
     E. 老用户升级：桶里有文件但无台账 → 自动补台账、差分归零（不重下 79 个）
     F. 一键删除：桶与台账一起清，删完立刻回到「全部缺失」
     G. 清单卫生：content.json / version.json / module.json 不得自列（自列 = 指纹永远对不上）
     H. SW 卫生：service-worker.js 必须有「三个清单直通网络」的分支（铁律 8）
   用法：node tools/content_diff_test.js
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP_SHELL = path.join(ROOT, 'assets', 'ak', 'app-shell.js');
const MANIFEST = path.join(ROOT, 'content.json');
const SW_PATH = path.join(ROOT, 'service-worker.js');
const SITE = 'https://m78calc.cn';

const shellSrc = fs.readFileSync(APP_SHELL, 'utf8');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
}

/* ---------- 桩环境：caches / localStorage / fetch / document ---------- */
function makeCaches() {
  const buckets = new Map();
  return {
    _buckets: buckets,
    open(name) {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const m = buckets.get(name);
      return Promise.resolve({
        keys: () => Promise.resolve([...m.keys()].map((u) => ({ url: u }))),
        put: (u, res) => { m.set(new URL(u).href, res); return Promise.resolve(); },
        match: (u) => Promise.resolve(m.get(new URL(u).href)),
        delete: () => Promise.resolve(true),
      });
    },
    delete(name) { buckets.delete(name); return Promise.resolve(true); },
    size(name) { const m = buckets.get(name); return m ? m.size : 0; },
    keys(name) { const m = buckets.get(name); return m ? [...m.keys()] : []; },
  };
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _dump: () => m,
  };
}

function boot(opts) {
  const caches = makeCaches();
  const storage = makeStorage();
  const fetched = [];
  const appended = [];   // 页面被注入的元素（用来断言齿轮是否出现）
  const sandbox = {
    console,
    setTimeout, clearTimeout, Promise, JSON, Math, Array, Object, String, Number, Date, Error, URL,
    URLSearchParams,
    caches,
    localStorage: storage,
    location: { pathname: opts.pathname || '/app.html', search: '' },
    document: {
      documentElement: { hasAttribute: () => true, setAttribute: () => {} },
      addEventListener: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null,
      createElement: () => ({ style: {}, setAttribute: () => {}, addEventListener: () => {} }),
      body: { appendChild: (el) => { appended.push(el); } },
      readyState: 'complete',
    },
    navigator: {},
    fetch(url, init) {
      fetched.push({ url: String(url), init: init || {} });
      const u = String(url);
      if (u.replace(/\/$/, '') === SITE + '/content.json') {
        const body = opts.manifest || manifest;
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(JSON.parse(JSON.stringify(body))),
        });
      }
      if (u.indexOf(SITE + '/') === 0) {
        const rel = u.slice((SITE + '/').length);
        if (opts.failPaths && opts.failPaths.indexOf(rel) >= 0) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        return Promise.resolve({ ok: true, status: 200, _rel: rel });
      }
      return Promise.reject(new Error('意外请求：' + u));
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(shellSrc, sandbox, { filename: 'app-shell.js' });
  return { sandbox, caches, storage, fetched, appended, Ak: sandbox.window.AkContent };
}

(async function main() {
  const total = manifest.files.length;
  const chinese = manifest.files.filter((f) => !/^[\x00-\x7F]+$/.test(f.path));

  console.log('清单：%d 个文件，其中中文名 %d 个', total, chinese.length);
  if (!total) { console.log('清单为空，无法测试'); process.exit(1); }

  /* A. 冷启动 */
  {
    const { Ak } = boot({});
    const st = await Ak.status();
    ok('A1 清单可读', st.ok === true);
    ok('A2 冷启动差分 = 全部文件', st.diff.length === total, `期望 ${total}，实际 ${st.diff.length}`);
    ok('A3 中文名占多数的那批也在差分里',
      chinese.every((f) => st.diff.some((d) => d.path === f.path)));
  }

  /* B/C. 全量下载 → 收敛 */
  {
    const { Ak, caches } = boot({});
    const d = await Ak.download(() => {});
    ok('B1 全部成功', d.downloaded === total && d.failed.length === 0,
      `downloaded=${d.downloaded}/${total} failed=${d.failed.length}`);
    const keys = caches.keys('guangyuan-content');
    ok('B2 桶里条目数 = 清单数', keys.length === total, `桶 ${keys.length} / 清单 ${total}`);
    /* 桶键由 URL 解析产生：斜杠保留、中文转 %XX（这是 Bug 的成因，也是本闸门要钉住的事实） */
    const expectedKeys = chinese.map((f) => new URL(SITE + '/' + f.path).href);
    const encoded = expectedKeys.filter((k) => keys.indexOf(k) >= 0);
    ok('B3 中文名文件以百分号编码键入桶', encoded.length === chinese.length && expectedKeys[0].indexOf('%') > 0,
      `${encoded.length}/${chinese.length}，示例键 ${expectedKeys[0]}`);
    const st2 = await Ak.status();
    ok('C1 下载后差分归零（不再重下）', st2.diff.length === 0, `仍有 ${st2.diff.length} 个`);
    const d2 = await Ak.download(() => {});
    ok('C2 二次点击更新：无事可做', d2.total === 0 && d2.downloaded === 0);
  }

  /* D. 清单里改一个指纹 → 恰好差 1 个，下载后归零 */
  {
    const mutated = JSON.parse(JSON.stringify(manifest));
    const idx = mutated.files.findIndex((f) => !/^[\x00-\x7F]+$/.test(f.path));
    mutated.files[idx].hash = 'deadbeefdeadbeefdeadbeefdeadbeef';
    mutated.files[idx].bytes = mutated.files[idx].bytes || 1;
    const { Ak } = boot({ manifest: mutated });
    // 先按原清单铺满桶与台账
    const d0 = await Ak.download(() => {});
    // 换回原清单再改：用同一环境不行（boot 每次是新的），这里直接测「指纹不一致」判定
    const env = boot({ manifest: mutated });
    const st = await env.Ak.status();
    ok('D1 新清单差分 = 全部（全新环境）', st.diff.length === mutated.files.length);

    // 同一环境：先按 mutated 下载，再把清单换成「另一份指纹」验证单文件变化
    const env2 = boot({ manifest: mutated });
    await env2.Ak.download(() => {});
    ok('D2 mutated 下全量后差分 = 0', (await env2.Ak.status()).diff.length === 0);

    const changed = JSON.parse(JSON.stringify(mutated));
    changed.files[idx].hash = 'cafebabecafebabecafebabecafebabe';
    const env3 = boot({ manifest: changed });
    await env3.Ak.download(() => {});
    // 仅替换清单内容无法改同一环境的 fetch 结果，故用「先下 mutated，再用 changed 覆盖 cache 的台账口径」模拟：
    // 直接构造：桶已满 + 台账用 mutated 指纹 → 清单换成 changed → 差 1
    env3.storage.setItem('ak-content-index', JSON.stringify({
      files: mutated.files.reduce((acc, f) => { acc[f.path] = f.hash; return acc; }, {}),
    }));
    const st3 = await env3.Ak.status();
    ok('D3 同名文件指纹变了 → 恰好差 1 个', st3.diff.length === 1,
      `实际差 ${st3.diff.length}`);
    await env3.Ak.download(() => {});
    ok('D4 补下后归零', (await env3.Ak.status()).diff.length === 0);
  }

  /* E. 老用户升级：桶有文件、无台账 */
  {
    const env = boot({});
    // 先铺满桶
    await env.Ak.download(() => {});
    env.storage.removeItem('ak-content-index');   // 模拟第 19 轮之前的老版本
    const st = await env.Ak.status();
    ok('E1 无台账但桶已满 → 不误报全部缺失', st.diff.length === 0, `误报 ${st.diff.length} 个`);
    ok('E2 自动补写台账', !!env.storage.getItem('ak-content-index'));
  }

  /* F. 一键删除 */
  {
    const env = boot({});
    await env.Ak.download(() => {});
    await env.Ak.clear();
    ok('F1 桶已删除', env.caches.size('guangyuan-content') === 0);
    ok('F2 台账已清除', env.storage.getItem('ak-content-index') === null);
    const st = await env.Ak.status();
    ok('F3 删除后回到全部缺失', st.diff.length === total);
  }

  /* G. 清单卫生 */
  {
    const bad = ['content.json', 'version.json', 'module.json']
      .filter((p) => manifest.files.some((f) => f.path === p));
    ok('G1 三份活清单不得自列', bad.length === 0, '仍列着：' + bad.join(', '));
  }

  /* H. SW 卫生 */
  {
    const sw = fs.readFileSync(SW_PATH, 'utf8');
    const hasBypass = /version\.json\|'\/module\.json|\/version\.json' === url\.pathname|url\.pathname === '\/version\.json'/.test(sw)
      || (sw.indexOf("'/version.json'") >= 0 && sw.indexOf("'/module.json'") >= 0 && sw.indexOf("'/content.json'") >= 0);
    ok('H1 SW 有「三清单直通网络」分支', hasBypass);
    const bypassBlock = /\/\* -{2,} 更新清单三件套[\s\S]{0,400}?respondWith\(fetch\(request/.test(sw);
    ok('H2 该分支确实 network-only（无 cache.put）', bypassBlock);
  }

  /* I. 齿轮只在站内首页（第 19 轮 Bug 1） */
  {
    const hasGear = (env) => env.appended.some((el) => el.className === 'ak-app-gear');
    ok('I1 被动页（/passive/index.html）不注入齿轮', !hasGear(boot({ pathname: '/passive/index.html' })));
    ok('I2 被动角色页（/passive/char.html）不注入齿轮', !hasGear(boot({ pathname: '/passive/char.html' })));
    ok('I3 站内首页（/index.html）仍注入齿轮', hasGear(boot({ pathname: '/index.html' })));
    ok('I4 计算器页（/calculator.html）不注入齿轮', !hasGear(boot({ pathname: '/calculator.html' })));
  }

  console.log('\n结果：%d passed, %d failed', pass, fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log('闸门自身异常：' + (e && e.stack || e));
  process.exit(1);
});
