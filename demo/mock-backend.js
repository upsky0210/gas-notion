/*
 * SkyNote 假後端(demo / 本地預覽用)
 *
 * 用途:讓 index.html 的前端能在一般瀏覽器裡跑起來,不需要 GAS、不需要登入。
 * 原理:前端所有後端呼叫都收斂在 index.html 的 run(),而 run() 只用到
 *       google.script.run.withSuccessHandler(...).withFailureHandler(...)[fn](...)
 *       所以這裡只要補一個同形狀的 google.script.run 就能整份接管。
 *
 * 這個檔案不會被 clasp push 上去(不在 rootDir 的推送清單裡),也不影響正式版。
 * 資料存在瀏覽器 localStorage,跟真正的 Sheets/Drive 完全無關。
 * 想清空重來:在 console 打 __demoReset()
 */
(function () {
  'use strict';

  var STORE_KEY = 'skynoteDemoDB_v1';
  var LATENCY_MS = 120;   // 模擬 GAS 往返延遲,順便讓載入狀態看得出來

  // ---- 假資料種子 ----------------------------------------------------------

  function doc(blocks) {
    return JSON.stringify({ time: Date.now(), blocks: blocks });
  }

  function seed() {
    var now = new Date().toISOString();
    var mk = function (id, title, parentId, order, kind, content) {
      return {
        id: id, title: title, parentId: parentId, order: order,
        updatedAt: now, kind: kind || 'page', content: content || doc([])
      };
    };

    return {
      pages: [
        mk('p_welcome', '歡迎使用 SkyNote', '', 0, 'page', doc([
          { type: 'header', data: { text: '歡迎使用 SkyNote', level: 1 } },
          { type: 'paragraph', data: { text: '這是<b>本地示範模式</b>:資料只存在你這台瀏覽器,不會上傳到任何地方,重新整理還在,關掉分頁也還在。' } },
          { type: 'header', data: { text: '幾個容易被忽略的功能', level: 2 } },
          { type: 'list', data: { style: 'unordered', items: [
            '在編輯區按 <b>/</b> 會跳出區塊選單(標題、清單、待辦、表格、圖片、程式碼…)',
            '打兩個左括號 <b>[[</b> 會跳出頁面選單,可以插入內部連結',
            '選取文字會浮出工具列,可以改顏色和字級',
            '左上角搜尋框是全文搜尋,不只搜標題'
          ] } },
          { type: 'paragraph', data: { text: '試試看在下面這行按 / 插入一個表格:' } },
          { type: 'paragraph', data: { text: '' } },
          { type: 'checklist', data: { items: [
            { text: '按 / 插入一個區塊', checked: false },
            { text: '打 [[ 連到別的頁面', checked: false },
            { text: '拖曳左側頁面調整順序', checked: false }
          ] } }
        ])),

        mk('f_class', '班級經營', '', 1, 'folder'),
        mk('p_log', '教學日誌 2026/07/27', 'f_class', 0, 'page', doc([
          { type: 'header', data: { text: '教學日誌', level: 1 } },
          { type: 'paragraph', data: { text: '日期:2026/07/27 | 節次:第三節 | 科目/主題:社會 — 家鄉的產業' } },
          { type: 'header', data: { text: '教學內容', level: 2 } },
          { type: 'paragraph', data: { text: '用學區地圖帶入,讓學生先標出自己家附近看過的店家,再歸類成一級/二級/三級產業。' } },
          { type: 'header', data: { text: '教學反思', level: 2 } },
          { type: 'paragraph', data: { text: '分組討論時間抓太短,下次留 10 分鐘。有三組把「便利商店」歸到二級產業,下一節要先釐清。' } },
          { type: 'header', data: { text: '後續追蹤', level: 2 } },
          { type: 'checklist', data: { items: [
            { text: '補充三級產業的例子', checked: false },
            { text: '找 503 幾位同學個別確認', checked: false },
            { text: '印學習單', checked: true }
          ] } }
        ])),
        mk('p_contact', '聯絡簿範例', 'f_class', 1, 'page', doc([
          { type: 'header', data: { text: '今日聯絡簿', level: 1 } },
          { type: 'paragraph', data: { text: '日期:2026/07/27 | 星期一' } },
          { type: 'header', data: { text: '今日作業', level: 2 } },
          { type: 'checklist', data: { items: [
            { text: '數學習作 p.32–33', checked: false },
            { text: '社會學習單', checked: false }
          ] } },
          { type: 'header', data: { text: '今日提醒', level: 2 } },
          { type: 'list', data: { style: 'unordered', items: ['明天帶直笛', '週三校外教學回條要交'] } }
        ])),
        mk('p_schedule', '本學期課表', 'f_class', 2, 'page', doc([
          { type: 'header', data: { text: '課表匯入 2026/7/27', level: 2 } },
          { type: 'table', data: { withHeadings: true, content: [
            ['時間', '分鐘', '星期一', '星期二', '星期三', '星期四', '星期五'],
            ['0730~0750', '20', '上學、晨間活動', '上學、晨間活動', '上學、晨間活動', '上學、晨間活動', '上學、晨間活動'],
            ['0845~0925', '40', '', '504社會', '', '503社會', ''],
            ['0930~1010', '40', '', '504社會', '501智慧', '503社會', ''],
            ['1120~1200', '40', '', '503社會', '304智慧', '', ''],
            ['1330~1410', '40', '301智慧', '302智慧', '', '', ''],
            ['1420~1500', '40', '303智慧', '502智慧', '', '305智慧', '']
          ] } }
        ])),

        mk('f_trip', '旅遊規劃', '', 2, 'folder'),
        mk('p_osaka', '大阪', 'f_trip', 0, 'page', doc([
          { type: 'header', data: { text: '大阪', level: 1 } },
          { type: 'paragraph', data: { text: '住宿訂在難波,走路到黑門市場約 10 分鐘。' } },
          { type: 'list', data: { style: 'unordered', items: ['黑門市場(早上去比較好逛)', '大阪城公園', '道頓堀'] } },
          { type: 'quote', data: { text: '第三天安排去奈良,近鐵約 40 分鐘。', caption: '行程備註' } }
        ])),
        mk('p_nara', '奈良', 'f_trip', 1, 'page', doc([
          { type: 'header', data: { text: '奈良', level: 1 } },
          { type: 'paragraph', data: { text: '從大阪當天來回。鹿仙貝記得不要提前拿出來。' } },
          { type: 'checklist', data: { items: [
            { text: '東大寺', checked: false },
            { text: '奈良公園', checked: false }
          ] } }
        ])),

        mk('p_notes', '研習筆記', '', 3, 'page', doc([
          { type: 'header', data: { text: '研習筆記', level: 1 } },
          { type: 'paragraph', data: { text: '這頁拿來測試搜尋:試著在左上角搜尋「產業」或「鹿仙貝」,會連內文一起找出來。' } },
          { type: 'code', data: { code: '// 程式碼區塊也支援\nfunction hello() {\n  return "SkyNote";\n}' } }
        ]))
      ],
      templates: [{ id: 't_demo', name: '我的自訂範本(示範)' }],
      templateContent: {
        t_demo: doc([
          { type: 'header', data: { text: '會議紀錄', level: 1 } },
          { type: 'paragraph', data: { text: '時間: | 地點: | 出席:' } },
          { type: 'checklist', data: { items: [{ text: '', checked: false }] } }
        ])
      },
      trash: [],
      versions: {},
      shares: {},
      geminiKey: '',
      geminiModel: 'gemini-2.0-flash',
      daily: { enabled: false, hour: 6 },
      autoBackup: false
    };
  }

  // ---- 儲存 ----------------------------------------------------------------

  var DB;
  try {
    DB = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || seed();
  } catch (e) {
    DB = seed();
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) { /* 超額就算了 */ }
  }

  window.__demoReset = function () {
    localStorage.removeItem(STORE_KEY);
    location.reload();
  };

  // ---- 小工具 --------------------------------------------------------------

  function uid() {
    return 'p_' + Math.random().toString(36).slice(2, 10);
  }

  function pub(p) {
    return {
      id: p.id, title: p.title, parentId: p.parentId,
      order: p.order, updatedAt: p.updatedAt, kind: p.kind || 'page'
    };
  }

  function find(id) {
    for (var i = 0; i < DB.pages.length; i++) {
      if (DB.pages[i].id === id) return DB.pages[i];
    }
    return null;
  }

  function need(id) {
    var p = find(id);
    if (!p) throw new Error('頁面不存在,請重新整理');
    return p;
  }

  // 把 Editor.js 的 JSON 攤成純文字(給全文搜尋用),對應後端的 extractText_
  function plainText(contentJson) {
    var data;
    try { data = JSON.parse(contentJson || '{}'); } catch (e) { return ''; }
    var out = [];
    (data.blocks || []).forEach(function (b) {
      var d = b.data || {};
      if (d.text) out.push(String(d.text));
      if (d.caption) out.push(String(d.caption));
      if (d.code) out.push(String(d.code));
      (d.items || []).forEach(function (it) {
        out.push(String(typeof it === 'string' ? it : (it.text || it.content || '')));
      });
      (d.content || []).forEach(function (row) {
        (row || []).forEach(function (c) { out.push(String(c)); });
      });
    });
    return out.join('\n').replace(/<[^>]+>/g, '');
  }

  function descendants(id) {
    var set = {};
    set[id] = true;
    var grew = true;
    while (grew) {
      grew = false;
      DB.pages.forEach(function (p) {
        if (!set[p.id] && set[p.parentId]) { set[p.id] = true; grew = true; }
      });
    }
    return set;
  }

  // ---- API -----------------------------------------------------------------

  var API = {

    // 啟動
    api_init: function () {
      return {
        pages: DB.pages.map(pub),
        hasGeminiKey: !!DB.geminiKey,
        geminiModel: DB.geminiModel,
        templates: DB.templates
      };
    },

    // 頁面 CRUD
    api_loadPage: function (id) {
      var p = need(id);
      return { id: p.id, title: p.title, content: p.content };
    },

    api_savePage: function (id, title, contentJson) {
      var p = need(id);
      // 存檔前留一份版本快照(真後端有 10 分鐘節流,demo 簡化成每次都留、最多 10 份)
      var list = DB.versions[id] || (DB.versions[id] = []);
      list.unshift({ ts: Date.now(), fileId: 'v_' + Date.now(), label: '', content: p.content });
      DB.versions[id] = list.slice(0, 10);

      p.title = String(title || '未命名').slice(0, 200);
      p.content = contentJson;
      p.updatedAt = new Date().toISOString();
      save();
      return { updatedAt: p.updatedAt };
    },

    api_createPage: function (parentId, kind) {
      kind = kind === 'folder' ? 'folder' : 'page';
      var siblings = DB.pages.filter(function (p) { return p.parentId === String(parentId || ''); });
      var p = {
        id: uid(),
        title: kind === 'folder' ? '新資料夾' : '未命名',
        parentId: String(parentId || ''),
        order: siblings.length,
        updatedAt: new Date().toISOString(),
        kind: kind,
        content: doc([])
      };
      DB.pages.push(p);
      save();
      return pub(p);
    },

    api_createPageWithContent: function (parentId, title, contentJson) {
      var content;
      try { content = JSON.parse(contentJson || '{}'); } catch (e) { content = null; }
      if (!content || !content.blocks) content = { time: Date.now(), blocks: [] };
      var siblings = DB.pages.filter(function (p) { return p.parentId === String(parentId || ''); });
      var p = {
        id: uid(),
        title: String(title || '未命名').slice(0, 200) || '未命名',
        parentId: String(parentId || ''),
        order: siblings.length,
        updatedAt: new Date().toISOString(),
        kind: 'page',
        content: JSON.stringify(content)
      };
      DB.pages.push(p);
      save();
      return pub(p);
    },

    api_renamePage: function (id, title) {
      var p = need(id);
      p.title = String(title || '未命名').slice(0, 200);
      p.updatedAt = new Date().toISOString();
      save();
      return { ok: true };
    },

    api_movePage: function (id, newParentId, newIndex) {
      var page = need(id);
      newParentId = String(newParentId || '');
      // 不能移到自己的子孫底下
      var kin = descendants(id);
      if (kin[newParentId]) throw new Error('不能移到自己的子頁面底下');

      var siblings = DB.pages
        .filter(function (p) { return p.parentId === newParentId && p.id !== id; })
        .sort(function (a, b) { return a.order - b.order || a.title.localeCompare(b.title); });
      var idx = Math.max(0, Math.min(Number(newIndex) || 0, siblings.length));
      siblings.splice(idx, 0, page);
      page.parentId = newParentId;
      siblings.forEach(function (p, i) { p.order = i; });
      save();
      return { ok: true };
    },

    api_deletePage: function (id) {
      var doomed = descendants(id);
      var now = Date.now();
      var kept = [];
      DB.pages.forEach(function (p) {
        if (doomed[p.id]) DB.trash.push({ page: p, deletedAt: now });
        else kept.push(p);
      });
      DB.pages = kept;
      save();
      return { ok: true, deleted: Object.keys(doomed).length };
    },

    // 回收桶
    api_listTrash: function () {
      return {
        items: DB.trash
          .map(function (t) { return { id: t.page.id, title: t.page.title, deletedAt: t.deletedAt }; })
          .sort(function (a, b) { return b.deletedAt - a.deletedAt; })
      };
    },

    api_restorePage: function (id) {
      var hit = -1;
      for (var i = 0; i < DB.trash.length; i++) {
        if (DB.trash[i].page.id === id) { hit = i; break; }
      }
      if (hit < 0) throw new Error('回收桶裡沒有這一頁');
      var p = DB.trash[hit].page;
      if (p.parentId && !find(p.parentId)) p.parentId = '';   // 父層沒了就回到根
      DB.pages.push(p);
      DB.trash.splice(hit, 1);
      save();
      return { restored: 1 };
    },

    api_emptyTrash: function () {
      var n = DB.trash.length;
      DB.trash = [];
      save();
      return { purged: n };
    },

    // 搜尋
    api_search: function (query) {
      var q = String(query || '').trim().toLowerCase();
      if (!q) return { results: [] };
      var results = [];
      DB.pages.forEach(function (p) {
        if (results.length >= 30) return;
        var body = plainText(p.content);
        var ti = p.title.toLowerCase().indexOf(q);
        var bi = body.toLowerCase().indexOf(q);
        if (ti < 0 && bi < 0) return;
        var snippet = '';
        if (bi >= 0) {
          snippet = body.substring(Math.max(0, bi - 30), bi + q.length + 50).replace(/\n+/g, ' ').trim();
        }
        results.push({ id: p.id, title: p.title, snippet: snippet });
      });
      return { results: results };
    },

    // 待辦彙整
    api_allTodos: function () {
      var groups = [];
      DB.pages.forEach(function (p) {
        if (p.kind === 'folder') return;
        var data;
        try { data = JSON.parse(p.content || '{}'); } catch (e) { return; }
        var items = [];
        (data.blocks || []).forEach(function (b) {
          if (b.type !== 'checklist') return;
          ((b.data || {}).items || []).forEach(function (it) {
            if (!it.checked && it.text) items.push(String(it.text).replace(/<[^>]+>/g, '').trim());
          });
        });
        if (items.length) groups.push({ pageId: p.id, title: p.title || '未命名', items: items });
      });
      return { groups: groups };
    },

    // 版本
    api_listVersions: function (pageId) {
      return {
        versions: (DB.versions[pageId] || []).map(function (v) {
          return { ts: v.ts, fileId: v.fileId, label: v.label };
        })
      };
    },

    api_restoreVersion: function (pageId, fileId) {
      var list = DB.versions[pageId] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].fileId === fileId) {
          var p = need(pageId);
          p.content = list[i].content;
          p.updatedAt = new Date().toISOString();
          save();
          return { content: list[i].content };
        }
      }
      throw new Error('找不到這個版本');
    },

    api_renameVersion: function (pageId, fileId, label) {
      var list = DB.versions[pageId] || [];
      list.forEach(function (v) { if (v.fileId === fileId) v.label = String(label || ''); });
      save();
      return { ok: true };
    },

    // 圖片:demo 直接存成 data URL,不需要 Drive
    api_uploadImage: function (name, mimeType, base64) {
      return { url: 'data:' + (mimeType || 'image/png') + ';base64,' + base64 };
    },

    // 匯出
    api_exportAll: function () {
      return {
        pages: DB.pages.map(function (p) {
          return {
            id: p.id, title: p.title, parentId: p.parentId,
            order: p.order, updatedAt: p.updatedAt, content: p.content
          };
        })
      };
    },

    // 範本
    api_saveTemplate: function (name, contentJson) {
      var id = 't_' + Math.random().toString(36).slice(2, 8);
      DB.templates.push({ id: id, name: String(name || '未命名範本') });
      DB.templateContent[id] = contentJson;
      save();
      return { templates: DB.templates };
    },

    api_getTemplate: function (id) {
      if (!DB.templateContent[id]) throw new Error('範本不存在');
      return { content: DB.templateContent[id] };
    },

    api_deleteTemplate: function (id) {
      DB.templates = DB.templates.filter(function (t) { return t.id !== id; });
      delete DB.templateContent[id];
      save();
      return { templates: DB.templates };
    },

    // ---- Gemini(demo 一律回罐頭,不打真的 API,也不需要金鑰) ----

    api_setGeminiKey: function (key) {
      DB.geminiKey = String(key || '');
      save();
      return { ok: true, hasKey: !!DB.geminiKey };
    },

    api_setGeminiModel: function (model) {
      DB.geminiModel = String(model || 'gemini-2.0-flash');
      save();
      return { ok: true, model: DB.geminiModel };
    },

    api_geminiPing: function () {
      return { text: '成功(示範模式,沒有真的連線)' };
    },

    api_listGeminiModels: function () {
      return {
        models: [
          { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash(示範)' },
          { id: 'gemini-2.0-pro', displayName: 'Gemini 2.0 Pro(示範)' }
        ],
        current: DB.geminiModel
      };
    },

    api_gemini: function (prompt) {
      return {
        text: '【示範模式】這裡不會真的呼叫 Gemini,所以回覆是固定的。\n\n'
          + '在正式版中,這段會是 AI 依照你的筆記內容產生的結果。\n'
          + '本次送出的提示詞長度:' + String(prompt || '').length + ' 字。'
      };
    },

    api_geminiVision: function () {
      // 回一份已經轉正方向的課表(時間在最左、星期一→五),示範修正後的結果
      return {
        text: JSON.stringify([
          ['時間', '分鐘', '星期一', '星期二', '星期三', '星期四', '星期五'],
          ['0730~0750', '20', '上學、晨間活動', '上學、晨間活動', '上學、晨間活動', '上學、晨間活動', '上學、晨間活動'],
          ['0820~0840', '20', '導師時間', '導師時間', '導師時間', '導師時間', '導師時間'],
          ['0845~0925', '40', '', '504社會', '', '503社會', ''],
          ['0930~1010', '40', '', '504社會', '501智慧', '503社會', ''],
          ['1120~1200', '40', '', '503社會', '304智慧', '', ''],
          ['1330~1410', '40', '301智慧', '302智慧', '', '', ''],
          ['1420~1500', '40', '303智慧', '502智慧', '', '305智慧', '']
        ])
      };
    },

    // ---- 分享 ----

    api_shareStatus: function (pageId) {
      var s = DB.shares[pageId];
      if (!s) return { available: true, shared: false };
      return {
        available: true, shared: true, scope: s.scope,
        url: 'https://example.invalid/demo-share?s=' + s.token
      };
    },

    api_sharePage: function (pageId, scope) {
      scope = scope === 'tree' ? 'tree' : 'page';
      if (!DB.shares[pageId]) {
        DB.shares[pageId] = { token: Math.random().toString(36).slice(2, 12), scope: scope };
        save();
      }
      return {
        url: 'https://example.invalid/demo-share?s=' + DB.shares[pageId].token,
        scope: DB.shares[pageId].scope
      };
    },

    api_setShareScope: function (pageId, scope) {
      if (!DB.shares[pageId]) throw new Error('這一頁還沒有分享');
      DB.shares[pageId].scope = scope === 'tree' ? 'tree' : 'page';
      save();
      return { scope: DB.shares[pageId].scope };
    },

    api_unsharePage: function (pageId) {
      delete DB.shares[pageId];
      save();
      return { ok: true };
    },

    // ---- 每日頁 / 自動備份 ----

    api_dailyStatus: function () { return DB.daily; },

    api_setDaily: function (enabled, hour) {
      DB.daily = enabled
        ? { enabled: true, hour: Math.max(0, Math.min(23, Number(hour) || 6)) }
        : { enabled: false, hour: DB.daily.hour };
      save();
      return DB.daily;
    },

    api_runDailyNow: function () { return { created: false }; },

    api_autoBackupStatus: function () { return { enabled: DB.autoBackup }; },

    api_setAutoBackup: function (enabled) {
      DB.autoBackup = !!enabled;
      save();
      return { enabled: DB.autoBackup };
    },

    api_runBackupNow: function () {
      return { ok: true, name: 'SkyNote-demo-backup.zip' };
    },

    // ---- Google 整合(demo 一律回假資料或友善錯誤) ----

    api_emailPage: function (to) {
      return { ok: true, to: String(to || 'demo@example.invalid') };
    },

    api_todayEvents: function () {
      return {
        date: new Date().toLocaleDateString('zh-TW'),
        events: [
          { title: '(示範)學年會議', time: '10:00–11:00' },
          { title: '(示範)備課', time: '13:30–14:10' }
        ]
      };
    },

    api_listTasks: function () {
      return {
        listName: '(示範)我的工作',
        tasks: [
          { text: '印學習單', checked: true },
          { text: '回覆家長聯絡簿', checked: false }
        ]
      };
    },

    api_pushTasks: function (arr) {
      var n = Array.isArray(arr) ? arr.length : 0;
      return { ok: true, count: n, listName: '(示範)我的工作' };
    },

    api_listCourses: function () {
      return { courses: [{ id: 'c1', name: '(示範)五年三班 社會' }] };
    },

    api_announceToCourse: function () {
      return { ok: true };
    },

    api_browseDrive: function () {
      return {
        folders: [{ id: 'd1', name: '(示範)教學資料夾' }],
        files: [{
          id: 'f1', name: '(示範)學習單.pdf', mimeType: 'application/pdf',
          url: 'https://example.invalid/demo-file'
        }]
      };
    },

    api_searchDrive: function (query) {
      if (!String(query || '').trim()) return { files: [] };
      return {
        files: [{
          id: 'f1', name: '(示範)' + query + '.pdf', mimeType: 'application/pdf',
          url: 'https://example.invalid/demo-file'
        }]
      };
    }
  };

  // ---- 組出 google.script.run --------------------------------------------

  function makeRunner(onSuccess, onFailure) {
    var runner = {
      withSuccessHandler: function (fn) { return makeRunner(fn, onFailure); },
      withFailureHandler: function (fn) { return makeRunner(onSuccess, fn); },
      withUserObject: function () { return makeRunner(onSuccess, onFailure); }
    };

    Object.keys(API).forEach(function (name) {
      runner[name] = function () {
        var args = Array.prototype.slice.call(arguments);
        setTimeout(function () {
          var result;
          try {
            result = API[name].apply(null, args);
          } catch (err) {
            console.warn('[demo] ' + name + ' 失敗:', err);
            if (onFailure) onFailure(err instanceof Error ? err : new Error(String(err)));
            return;
          }
          if (onSuccess) onSuccess(result);
        }, LATENCY_MS);
      };
    });

    return runner;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = makeRunner(null, null);
  window.google.script.host = {
    close: function () { console.log('[demo] google.script.host.close()'); },
    setHeight: function () {},
    setWidth: function () {},
    origin: location.origin
  };
  window.google.script.url = {
    getLocation: function (cb) { if (cb) cb({ parameter: {}, parameters: {}, hash: '' }); }
  };

  console.log('[demo] SkyNote 假後端已載入,共接管 ' + Object.keys(API).length + ' 個 API。'
    + '清空資料請打 __demoReset()');
})();
