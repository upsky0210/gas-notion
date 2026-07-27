const SHEET_NAME = 'PageIndex';
const TEXT_SHEET_NAME = 'PageText';
const VERSION_SHEET_NAME = 'PageVersions';
const CACHE_KEY = 'pageIndex_v1';
const INDEX_HEADER = ['id', 'title', 'parentId', 'order', 'updatedAt', 'fileId', 'kind'];
const MAX_VERSIONS = 10;
const VERSION_MIN_GAP_MS = 10 * 60 * 1000;

// 公開分享部署(第二個 deployment,匿名唯讀)。id/URL 由部署流程回填,見交接文件。
const PUBLIC_DEPLOY_ID = 'AKfycbwAUNmjY1TNA-trnACmFlTJO0sqR_VsMOr4ubcxsBD2sdNLbzXhsGUHSQpTKUVjqUe2mw';
const PUBLIC_EXEC_URL = 'https://script.google.com/macros/s/' + PUBLIC_DEPLOY_ID + '/exec';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.s) return renderShare_(String(p.s), String(p.p || ''));
  if (PUBLIC_DEPLOY_ID && ScriptApp.getService().getUrl().indexOf(PUBLIC_DEPLOY_ID) >= 0) {
    return shareErr_('這是分享專用網址,請使用完整的分享連結開啟頁面。');
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('SkyNote')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 儲存位置指標一律以 UserProperties 為準(B 模式每位使用者各自一份);
// ScriptProperties 只做舊部署的遷移來源,開啟成功才寫回 UserProperties。
function getStoredId_(key) {
  const v = PropertiesService.getUserProperties().getProperty(key);
  if (v) return v;
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setStoredId_(key, value) {
  PropertiesService.getUserProperties().setProperty(key, value);
  // 鏡射到 ScriptProperties:公開分享頁由匿名訪客觸發,讀不到 UserProperties
  try { PropertiesService.getScriptProperties().setProperty(key, value); } catch (e) { /* 略過 */ }
}

function db_() {
  const key = 'DB_SPREADSHEET_ID';
  const id = getStoredId_(key);
  if (id) {
    try {
      const ss = SpreadsheetApp.openById(id);
      setStoredId_(key, id);
      return ss;
    } catch (e) { /* 開不了(換帳號或被刪)就重建 */ }
  }
  const ss = SpreadsheetApp.create('SkyNote DB');
  setStoredId_(key, ss.getId());
  return ss;
}

function sheetOf_(name, header) {
  const ss = db_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return sh;
}

function sheet_() {
  const sh = sheetOf_(SHEET_NAME, INDEX_HEADER);
  if (String(sh.getRange(1, 7).getValue()) !== 'kind') sh.getRange(1, 7).setValue('kind');
  return sh;
}
function textSheet_() { return sheetOf_(TEXT_SHEET_NAME, ['id', 'text']); }
function versionSheet_() {
  const sh = sheetOf_(VERSION_SHEET_NAME, ['pageId', 'ts', 'fileId', 'label']);
  if (String(sh.getRange(1, 4).getValue()) !== 'label') sh.getRange(1, 4).setValue('label');
  return sh;
}

function folderOf_(key, name) {
  const id = getStoredId_(key);
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      setStoredId_(key, id);
      return f;
    } catch (e) { /* 重建 */ }
  }
  const f = DriveApp.createFolder(name);
  setStoredId_(key, f.getId());
  return f;
}

function folder_() { return folderOf_('PAGES_FOLDER_ID', 'SkyNote Pages'); }
function assetsFolder_() { return folderOf_('ASSETS_FOLDER_ID', 'SkyNote Assets'); }
function versionsFolder_() { return folderOf_('VERSIONS_FOLDER_ID', 'SkyNote Versions'); }

function lock_() {
  const lock = LockService.getUserLock();
  lock.waitLock(10000);
  return lock;
}

function readIndex_() {
  const cache = CacheService.getUserCache();
  const cached = cache.get(CACHE_KEY);
  if (cached) return JSON.parse(cached);
  const sh = sheet_();
  const last = sh.getLastRow();
  const pages = [];
  if (last > 1) {
    const rows = sh.getRange(2, 1, last - 1, INDEX_HEADER.length).getValues();
    for (const r of rows) {
      if (!r[0]) continue;
      pages.push({
        id: String(r[0]),
        title: String(r[1]),
        parentId: String(r[2]),
        order: Number(r[3]) || 0,
        updatedAt: String(r[4]),
        fileId: String(r[5]),
        kind: String(r[6]) === 'folder' ? 'folder' : 'page'
      });
    }
  }
  cache.put(CACHE_KEY, JSON.stringify(pages), 21600);
  return pages;
}

function invalidateIndex_() {
  CacheService.getUserCache().remove(CACHE_KEY);
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

function pub_(p) {
  return { id: p.id, title: p.title, parentId: p.parentId, order: p.order, updatedAt: p.updatedAt, kind: p.kind || 'page' };
}

function api_init() {
  let pages = readIndex_();
  if (pages.length === 0) {
    createPage_('', '歡迎使用', welcome_());
    pages = readIndex_();
  }
  return {
    pages: pages.map(pub_),
    hasGeminiKey: !!getGeminiKey_(),
    geminiModel: getGeminiModel_(),
    templates: listTemplates_()
  };
}

// ---- 自訂範本(存在 Templates 表,一列一範本) ----
const TEMPLATES_SHEET_NAME = 'Templates';

function templatesSheet_() { return sheetOf_(TEMPLATES_SHEET_NAME, ['id', 'name', 'content', 'createdAt']); }

function listTemplates_() {
  const sh = templatesSheet_();
  const last = sh.getLastRow();
  const out = [];
  if (last > 1) {
    const rows = sh.getRange(2, 1, last - 1, 2).getValues();
    for (const r of rows) {
      if (r[0]) out.push({ id: String(r[0]), name: String(r[1]) });
    }
  }
  return out;
}

function api_saveTemplate(name, content) {
  name = String(name || '未命名範本').slice(0, 60);
  templatesSheet_().appendRow([Utilities.getUuid(), name, String(content || '').slice(0, 45000), new Date().toISOString()]);
  return { templates: listTemplates_() };
}

function api_getTemplate(id) {
  const sh = templatesSheet_();
  const last = sh.getLastRow();
  if (last > 1) {
    const rows = sh.getRange(2, 1, last - 1, 3).getValues();
    for (const r of rows) {
      if (String(r[0]) === id) return { content: String(r[2]) };
    }
  }
  throw new Error('範本不存在');
}

function api_deleteTemplate(id) {
  const sh = templatesSheet_();
  const last = sh.getLastRow();
  if (last > 1) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === id) { sh.deleteRow(i + 2); break; }
    }
  }
  return { templates: listTemplates_() };
}

// ---- 待辦彙整:掃全部頁面的未勾待辦 ----
function api_allTodos() {
  const pages = readIndex_().filter((p) => p.kind !== 'folder');
  const groups = [];
  for (const p of pages) {
    let data;
    try { data = JSON.parse(DriveApp.getFileById(p.fileId).getBlob().getDataAsString('utf-8') || '{}'); } catch (e) { continue; }
    const items = [];
    for (const b of (data.blocks || [])) {
      if (b.type !== 'checklist') continue;
      for (const it of (b.data.items || [])) {
        if (!it.checked && it.text) items.push(String(it.text).replace(/<[^>]+>/g, '').trim());
      }
    }
    if (items.length) groups.push({ pageId: p.id, title: p.title || '未命名', items: items });
  }
  return { groups: groups };
}

function api_loadPage(id) {
  const page = readIndex_().find((p) => p.id === id);
  if (!page) throw new Error('頁面不存在,請重新整理');
  const content = DriveApp.getFileById(page.fileId).getBlob().getDataAsString('utf-8');
  return { id: page.id, title: page.title, content: content };
}

function api_savePage(id, title, contentJson) {
  const lock = lock_();
  try {
    const page = readIndex_().find((p) => p.id === id);
    if (!page) throw new Error('頁面不存在,請重新整理');
    DriveApp.getFileById(page.fileId).setContent(contentJson);
    const sh = sheet_();
    const row = findRow_(sh, id);
    const now = new Date().toISOString();
    if (row > 0) {
      sh.getRange(row, 2).setValue(title);
      sh.getRange(row, 5).setValue(now);
    }
    upsertText_(id, extractText_(contentJson));
    maybeSnapshot_(id, contentJson, false);
    invalidateIndex_();
    return { updatedAt: now };
  } finally {
    lock.releaseLock();
  }
}

function api_createPage(parentId, kind) {
  kind = kind === 'folder' ? 'folder' : 'page';
  const title = kind === 'folder' ? '新資料夾' : '未命名';
  return pub_(createPage_(String(parentId || ''), title, { time: Date.now(), blocks: [] }, kind));
}

// 拆分筆記(Note Composer):把選取的區塊抽成新子頁,帶內容建立
function api_createPageWithContent(parentId, title, contentJson) {
  let content;
  try { content = JSON.parse(contentJson || '{}'); } catch (e) { content = { time: Date.now(), blocks: [] }; }
  if (!content.blocks) content = { time: Date.now(), blocks: [] };
  const t = String(title || '未命名').slice(0, 200) || '未命名';
  const page = createPage_(String(parentId || ''), t, content, 'page');
  upsertText_(page.id, extractText_(JSON.stringify(content)));
  return pub_(page);
}

function api_renamePage(id, title) {
  const lock = lock_();
  try {
    const sh = sheet_();
    const row = findRow_(sh, id);
    if (row < 0) throw new Error('頁面不存在');
    sh.getRange(row, 2).setValue(String(title || '未命名').slice(0, 200));
    sh.getRange(row, 5).setValue(new Date().toISOString());
    invalidateIndex_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function createPage_(parentId, title, content, kind) {
  const lock = lock_();
  try {
    const id = Utilities.getUuid();
    const file = folder_().createFile(id + '.json', JSON.stringify(content), 'application/json');
    const order = Date.now(); // 新頁永遠排在最後;拖曳重排時會被改寫成 0..n
    const now = new Date().toISOString();
    kind = kind === 'folder' ? 'folder' : 'page';
    sheet_().appendRow([id, title, parentId, order, now, file.getId(), kind]);
    invalidateIndex_();
    return { id: id, title: title, parentId: parentId, order: order, updatedAt: now, fileId: file.getId(), kind: kind };
  } finally {
    lock.releaseLock();
  }
}

function api_movePage(id, newParentId, newIndex) {
  const lock = lock_();
  try {
    const pages = readIndex_();
    const page = pages.find((p) => p.id === id);
    if (!page) throw new Error('頁面不存在,請重新整理');
    newParentId = String(newParentId || '');
    const byId = new Map(pages.map((p) => [p.id, p]));
    let cur = newParentId;
    while (cur) {
      if (cur === id) throw new Error('不能移到自己的子頁面底下');
      cur = (byId.get(cur) || {}).parentId || '';
    }
    const siblings = pages
      .filter((p) => p.parentId === newParentId && p.id !== id)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    const idx = Math.max(0, Math.min(Number(newIndex) || 0, siblings.length));
    siblings.splice(idx, 0, page);
    const sh = sheet_();
    const last = sh.getLastRow();
    const rowOf = new Map();
    if (last > 1) {
      const ids = sh.getRange(2, 1, last - 1, 1).getValues();
      ids.forEach((r, i) => rowOf.set(String(r[0]), i + 2));
    }
    for (let i = 0; i < siblings.length; i++) {
      const row = rowOf.get(siblings[i].id);
      if (!row) continue;
      sh.getRange(row, 4).setValue(i);
      if (siblings[i].id === id) sh.getRange(row, 3).setValue(newParentId);
    }
    invalidateIndex_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// 刪除 = 搬進 Trash 表(檔案原地保留),30 天後或清空時才真刪
const TRASH_SHEET_NAME = 'Trash';
const TRASH_HEADER = ['id', 'title', 'parentId', 'order', 'updatedAt', 'fileId', 'kind', 'deletedAt'];
const TRASH_DEL_COL = 7; // deletedAt 在陣列中的索引(第 8 欄)
const TRASH_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

function trashSheet_() {
  const sh = sheetOf_(TRASH_SHEET_NAME, TRASH_HEADER);
  // 舊版 Trash 是 7 欄(deletedAt 在第 7 欄),補插 kind 欄避免日期被誤讀成過期
  if (String(sh.getRange(1, 7).getValue()) === 'deletedAt') {
    sh.insertColumnBefore(7);
    sh.getRange(1, 7).setValue('kind');
    sh.getRange(1, 8).setValue('deletedAt');
  }
  return sh;
}

function api_deletePage(id) {
  const lock = lock_();
  try {
    const pages = readIndex_();
    const doomed = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of pages) {
        if (!doomed.has(p.id) && doomed.has(p.parentId)) {
          doomed.add(p.id);
          grew = true;
        }
      }
    }
    const sh = sheet_();
    const trash = trashSheet_();
    const now = Date.now();
    const last = sh.getLastRow();
    if (last > 1) {
      const rows = sh.getRange(2, 1, last - 1, INDEX_HEADER.length).getValues();
      for (let i = rows.length - 1; i >= 0; i--) {
        if (doomed.has(String(rows[i][0]))) {
          trash.appendRow(rows[i].concat([now]));
          sh.deleteRow(i + 2);
        }
      }
    }
    const tsh = textSheet_();
    const tLast = tsh.getLastRow();
    if (tLast > 1) {
      const tIds = tsh.getRange(2, 1, tLast - 1, 1).getValues();
      for (let i = tIds.length - 1; i >= 0; i--) {
        if (doomed.has(String(tIds[i][0]))) tsh.deleteRow(i + 2);
      }
    }
    invalidateIndex_();
    purgeTrash_(false);
    return { deletedIds: Array.from(doomed) };
  } finally {
    lock.releaseLock();
  }
}

function purgeTrash_(all) {
  const trash = trashSheet_();
  const last = trash.getLastRow();
  if (last < 2) return 0;
  const rows = trash.getRange(2, 1, last - 1, TRASH_HEADER.length).getValues();
  const cutoff = Date.now() - TRASH_KEEP_MS;
  let purged = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const delAt = Number(rows[i][TRASH_DEL_COL]) || 0;
    if (!all && delAt > cutoff) continue;
    const pid = String(rows[i][0]);
    try { DriveApp.getFileById(String(rows[i][5])).setTrashed(true); } catch (e) { /* 略過 */ }
    const vsh = versionSheet_();
    for (const v of readVersions_(vsh, pid).sort((a, b) => b.row - a.row)) {
      try { DriveApp.getFileById(v.fileId).setTrashed(true); } catch (e) { /* 略過 */ }
      vsh.deleteRow(v.row);
    }
    trash.deleteRow(i + 2);
    purged++;
  }
  return purged;
}

function api_listTrash() {
  purgeTrash_(false);
  const trash = trashSheet_();
  const last = trash.getLastRow();
  const items = [];
  if (last > 1) {
    const rows = trash.getRange(2, 1, last - 1, TRASH_HEADER.length).getValues();
    for (const r of rows) {
      if (r[0]) items.push({ id: String(r[0]), title: String(r[1]), deletedAt: Number(r[TRASH_DEL_COL]) || 0 });
    }
  }
  items.sort((a, b) => b.deletedAt - a.deletedAt);
  return { items: items };
}

function api_restorePage(id) {
  const lock = lock_();
  try {
    const trash = trashSheet_();
    const last = trash.getLastRow();
    if (last < 2) throw new Error('回收桶是空的');
    const rows = trash.getRange(2, 1, last - 1, TRASH_HEADER.length).getValues();
    const byId = new Map();
    rows.forEach((r, i) => byId.set(String(r[0]), { r: r, row: i + 2 }));
    if (!byId.has(id)) throw new Error('回收桶裡沒有這一頁');
    const restoreSet = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const pid of byId.keys()) {
        if (!restoreSet.has(pid) && restoreSet.has(String(byId.get(pid).r[2]))) {
          restoreSet.add(pid);
          grew = true;
        }
      }
    }
    const live = new Set(readIndex_().map((p) => p.id));
    const sh = sheet_();
    const rowsToDelete = [];
    for (const pid of restoreSet) {
      const o = byId.get(pid);
      const r = o.r.slice(0, INDEX_HEADER.length);
      if (pid === id) {
        const par = String(r[2]);
        if (par && !live.has(par) && !restoreSet.has(par)) r[2] = ''; // 父頁不在了就掛回根層
      }
      sh.appendRow(r);
      rowsToDelete.push(o.row);
      try {
        const content = DriveApp.getFileById(String(r[5])).getBlob().getDataAsString('utf-8');
        upsertText_(pid, extractText_(content));
      } catch (e) { /* 檔案讀不到就略過全文索引 */ }
    }
    rowsToDelete.sort((a, b) => b - a).forEach((row) => trash.deleteRow(row));
    invalidateIndex_();
    return { restored: restoreSet.size };
  } finally {
    lock.releaseLock();
  }
}

function api_emptyTrash() {
  const lock = lock_();
  try {
    return { purged: purgeTrash_(true) };
  } finally {
    lock.releaseLock();
  }
}

// ---- 整站備份匯出 ----
function api_exportAll() {
  const pages = readIndex_();
  const out = [];
  for (const p of pages) {
    let content = '';
    try { content = DriveApp.getFileById(p.fileId).getBlob().getDataAsString('utf-8'); } catch (e) { /* 略過 */ }
    out.push({ id: p.id, title: p.title, parentId: p.parentId, order: p.order, updatedAt: p.updatedAt, content: content });
  }
  return { pages: out };
}

// ---- 全文搜尋:存檔時抽純文字進 PageText 表,搜尋只讀一張表 ----

function extractText_(contentJson) {
  const out = [];
  try {
    const data = JSON.parse(contentJson);
    for (const b of (data.blocks || [])) {
      const d = b.data || {};
      if (typeof d.text === 'string') out.push(d.text);
      if (typeof d.caption === 'string') out.push(d.caption);
      if (typeof d.code === 'string') out.push(d.code);
      if (typeof d.name === 'string') out.push(d.name);
      if (Array.isArray(d.items)) {
        for (const it of d.items) {
          out.push(typeof it === 'string' ? it : String((it && (it.text || it.content)) || ''));
        }
      }
      if (Array.isArray(d.content)) {
        for (const row of d.content) {
          if (Array.isArray(row)) out.push(row.join(' '));
        }
      }
    }
  } catch (e) {
    return '';
  }
  return out.join('\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .toLowerCase()
    .slice(0, 45000);
}

function upsertText_(id, text) {
  const tsh = textSheet_();
  const row = findRow_(tsh, id);
  if (row > 0) tsh.getRange(row, 2).setValue(text);
  else tsh.appendRow([id, text]);
}

function api_search(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { results: [] };
  const pages = readIndex_();
  const tsh = textSheet_();
  const last = tsh.getLastRow();
  const texts = new Map();
  if (last > 1) {
    tsh.getRange(2, 1, last - 1, 2).getValues().forEach((r) => texts.set(String(r[0]), String(r[1])));
  }
  const results = [];
  for (const p of pages) {
    const body = texts.get(p.id) || '';
    const ti = p.title.toLowerCase().indexOf(q);
    const bi = body.indexOf(q);
    if (ti < 0 && bi < 0) continue;
    let snippet = '';
    if (bi >= 0) {
      snippet = body.substring(Math.max(0, bi - 30), bi + q.length + 50).replace(/\n+/g, ' ').trim();
    }
    results.push({ id: p.id, title: p.title, snippet: snippet });
    if (results.length >= 30) break;
  }
  return { results: results };
}

// ---- 版本快照:PageVersions 表登記,檔案放 versions 資料夾 ----

function readVersions_(vsh, pageId) {
  const last = vsh.getLastRow();
  const out = [];
  if (last > 1) {
    const rows = vsh.getRange(2, 1, last - 1, 4).getValues();
    rows.forEach((r, i) => {
      if (String(r[0]) === pageId) out.push({ ts: Number(r[1]), fileId: String(r[2]), label: String(r[3] || ''), row: i + 2 });
    });
  }
  return out;
}

function maybeSnapshot_(pageId, contentJson, force, label) {
  const vsh = versionSheet_();
  const versions = readVersions_(vsh, pageId).sort((a, b) => b.ts - a.ts);
  const now = Date.now();
  if (!force && versions.length && now - versions[0].ts < VERSION_MIN_GAP_MS) return;
  const file = versionsFolder_().createFile(pageId + '__' + now + '.json', contentJson, 'application/json');
  vsh.appendRow([pageId, now, file.getId(), String(label || '')]);
  const excess = versions.slice(MAX_VERSIONS - 1).sort((a, b) => b.row - a.row);
  for (const v of excess) {
    try { DriveApp.getFileById(v.fileId).setTrashed(true); } catch (e) { /* 略過 */ }
    vsh.deleteRow(v.row);
  }
}

function api_listVersions(pageId) {
  const versions = readVersions_(versionSheet_(), String(pageId))
    .sort((a, b) => b.ts - a.ts)
    .map((v) => ({ ts: v.ts, fileId: v.fileId, label: v.label }));
  return { versions: versions };
}

function api_renameVersion(pageId, versionFileId, label) {
  const vsh = versionSheet_();
  const v = readVersions_(vsh, String(pageId)).find((x) => x.fileId === versionFileId);
  if (!v) throw new Error('版本不存在');
  vsh.getRange(v.row, 4).setValue(String(label || '').slice(0, 100));
  return { ok: true };
}

function api_restoreVersion(pageId, versionFileId) {
  const lock = lock_();
  try {
    const page = readIndex_().find((p) => p.id === pageId);
    if (!page) throw new Error('頁面不存在,請重新整理');
    const versions = readVersions_(versionSheet_(), pageId);
    if (!versions.some((v) => v.fileId === versionFileId)) throw new Error('版本不存在');
    const current = DriveApp.getFileById(page.fileId).getBlob().getDataAsString('utf-8');
    maybeSnapshot_(pageId, current, true, '還原前自動備份');
    const content = DriveApp.getFileById(versionFileId).getBlob().getDataAsString('utf-8');
    DriveApp.getFileById(page.fileId).setContent(content);
    upsertText_(pageId, extractText_(content));
    const sh = sheet_();
    const row = findRow_(sh, pageId);
    if (row > 0) sh.getRange(row, 5).setValue(new Date().toISOString());
    invalidateIndex_();
    return { content: content };
  } finally {
    lock.releaseLock();
  }
}

// ---- 圖片上傳與 Drive 檔案搜尋 ----

function api_uploadImage(name, mimeType, base64) {
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('圖片超過 8MB,請先縮小');
  const blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', name || ('image-' + Date.now()));
  const file = assetsFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: 'https://lh3.googleusercontent.com/d/' + file.getId() };
}

function api_searchDrive(query) {
  const q = String(query || '').trim().replace(/\\/g, '').replace(/'/g, "\\'");
  if (!q) return { files: [] };
  const it = DriveApp.searchFiles("title contains '" + q + "' and trashed = false");
  const files = [];
  while (it.hasNext() && files.length < 12) {
    const f = it.next();
    files.push({ id: f.getId(), name: f.getName(), mimeType: f.getMimeType(), url: f.getUrl() });
  }
  return { files: files };
}

function api_browseDrive(folderId) {
  folderId = String(folderId || '');
  const folders = [];
  const files = [];
  let folderIt, fileIt;
  if (folderId === 'shared') {
    folderIt = DriveApp.searchFolders('sharedWithMe = true');
    fileIt = DriveApp.searchFiles('sharedWithMe = true');
  } else {
    const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
    folderIt = folder.getFolders();
    fileIt = folder.getFiles();
  }
  while (folderIt.hasNext() && folders.length < 100) {
    const f = folderIt.next();
    folders.push({ id: f.getId(), name: f.getName() });
  }
  while (fileIt.hasNext() && files.length < 100) {
    const f = fileIt.next();
    files.push({ id: f.getId(), name: f.getName(), mimeType: f.getMimeType(), url: f.getUrl() });
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'zh-Hant');
  folders.sort(byName);
  files.sort(byName);
  return { folders: folders, files: files };
}

// ---- Gemini(附加功能):金鑰存 Properties,不進程式碼與版控 ----

const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest'; // 官方別名,自動指向最新版 flash

function getGeminiKey_() {
  return PropertiesService.getUserProperties().getProperty('GEMINI_API_KEY')
    || PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')
    || '';
}

function getGeminiModel_() {
  return PropertiesService.getUserProperties().getProperty('GEMINI_MODEL') || GEMINI_DEFAULT_MODEL;
}

function api_setGeminiModel(model) {
  model = String(model || '').trim();
  if (!model) throw new Error('模型名稱是空的');
  PropertiesService.getUserProperties().setProperty('GEMINI_MODEL', model);
  return { ok: true };
}

function api_listGeminiModels() {
  const key = getGeminiKey_();
  if (!key) throw new Error('尚未設定 Gemini API 金鑰');
  const res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(key),
    { muteHttpExceptions: true }
  );
  const code = res.getResponseCode();
  if (code !== 200) throw new Error('讀取模型列表失敗 HTTP ' + code + ':' + res.getContentText().slice(0, 200));
  const body = JSON.parse(res.getContentText());
  const models = (body.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
    .map((m) => ({ id: String(m.name || '').replace(/^models\//, ''), displayName: String(m.displayName || '') }));
  return { models: models, current: getGeminiModel_() };
}

function api_setGeminiKey(key) {
  key = String(key || '').trim();
  if (!key) throw new Error('金鑰是空的');
  PropertiesService.getUserProperties().setProperty('GEMINI_API_KEY', key);
  return { ok: true };
}

function api_gemini(prompt) {
  const key = getGeminiKey_();
  if (!key) throw new Error('尚未設定 Gemini API 金鑰(右上「AI」→ 金鑰設定)');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + getGeminiModel_()
    + ':generateContent?key=' + encodeURIComponent(key);
  const payload = {
    contents: [{ parts: [{ text: String(prompt || '') }] }],
    generationConfig: { temperature: 0.6 }
  };
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) Utilities.sleep(1200 * attempt);
    let res;
    try {
      res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/PERMISSION|permission|權限|external_request/i.test(msg)) {
        throw new Error('缺少「連外網路」授權:請到 script.google.com 開啟此專案,任選一個函式按「執行」,在跳出的視窗完成重新授權後再試一次。');
      }
      lastErr = msg;
      continue;
    }
    const code = res.getResponseCode();
    if (code === 200) {
      const body = JSON.parse(res.getContentText());
      const cand = (body.candidates || [])[0];
      const parts = ((cand || {}).content || {}).parts || [];
      const text = parts.map((p) => p.text || '').join('');
      if (!text) throw new Error('Gemini 回了空內容(可能被安全機制擋下,換個說法試試)');
      return { text: text };
    }
    lastErr = 'HTTP ' + code;
    if (code === 429 || code >= 500) continue; // 免費層常見的忙線/伺服器錯誤,退避後重試
    throw new Error('Gemini 錯誤 ' + code + ':' + res.getContentText().slice(0, 300));
  }
  throw new Error('Gemini 忙線(' + lastErr + '),已自動重試 3 次仍失敗,請過一分鐘再試');
}

function api_geminiPing() {
  const key = getGeminiKey_();
  if (!key) return { ok: false, model: getGeminiModel_(), detail: '尚未設定金鑰' };
  try {
    const res = api_gemini('請只回覆兩個字:成功');
    return { ok: true, model: getGeminiModel_(), reply: String(res.text).slice(0, 50) };
  } catch (e) {
    return { ok: false, model: getGeminiModel_(), detail: String((e && e.message) || e) };
  }
}

// 多模態:送一張圖片 + 指令給 Gemini(課表/行事曆 OCR 用)。骨架同 api_gemini。
function api_geminiVision(base64, mimeType, prompt) {
  const key = getGeminiKey_();
  if (!key) throw new Error('尚未設定 Gemini API 金鑰(右上「AI」→ 金鑰設定)');
  if (!base64) throw new Error('沒有收到圖片內容');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + getGeminiModel_()
    + ':generateContent?key=' + encodeURIComponent(key);
  const payload = {
    contents: [{ parts: [
      { inline_data: { mime_type: mimeType || 'image/png', data: String(base64) } },
      { text: String(prompt || '') }
    ] }],
    generationConfig: { temperature: 0.2 }
  };
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) Utilities.sleep(1200 * attempt);
    let res;
    try {
      res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/PERMISSION|permission|權限|external_request/i.test(msg)) {
        throw new Error('缺少「連外網路」授權:請到 script.google.com 開啟此專案,任選一個函式按「執行」,在跳出的視窗完成重新授權後再試一次。');
      }
      lastErr = msg;
      continue;
    }
    const code = res.getResponseCode();
    if (code === 200) {
      const body = JSON.parse(res.getContentText());
      const cand = (body.candidates || [])[0];
      const parts = ((cand || {}).content || {}).parts || [];
      const text = parts.map((p) => p.text || '').join('');
      if (!text) throw new Error('Gemini 回了空內容(可能被安全機制擋下,換張清楚一點的圖試試)');
      return { text: text };
    }
    lastErr = 'HTTP ' + code;
    if (code === 429 || code >= 500) continue;
    throw new Error('Gemini 錯誤 ' + code + ':' + res.getContentText().slice(0, 300));
  }
  throw new Error('Gemini 忙線(' + lastErr + '),已自動重試 3 次仍失敗,請過一分鐘再試');
}

// ---- Google 服務整合:Email / 日曆 / Tasks / 文件 / 簡報 / Classroom ----

function api_emailPage(to, title, markdown) {
  to = String(to || '').trim() || Session.getActiveUser().getEmail();
  if (!to) throw new Error('讀不到收件者,請直接輸入 email');
  MailApp.sendEmail({ to: to, subject: '[筆記] ' + String(title || '未命名'), body: String(markdown || '') });
  return { ok: true, to: to };
}

function api_todayEvents() {
  const tz = Session.getScriptTimeZone();
  const events = CalendarApp.getDefaultCalendar().getEventsForDay(new Date());
  return {
    date: Utilities.formatDate(new Date(), tz, 'yyyy/MM/dd'),
    events: events.map((e) => ({
      title: e.getTitle(),
      time: e.isAllDayEvent()
        ? '整天'
        : Utilities.formatDate(e.getStartTime(), tz, 'HH:mm') + '–' + Utilities.formatDate(e.getEndTime(), tz, 'HH:mm')
    }))
  };
}

function api_listTasks() {
  const lists = (Tasks.Tasklists.list().items) || [];
  if (!lists.length) return { listName: '', tasks: [] };
  const items = (Tasks.Tasks.list(lists[0].id, { showCompleted: true, maxResults: 50 }).items) || [];
  return {
    listName: lists[0].title,
    tasks: items.filter((t) => t.title).map((t) => ({ text: t.title, checked: t.status === 'completed' }))
  };
}

function api_pushTasks(titles) {
  const lists = (Tasks.Tasklists.list().items) || [];
  if (!lists.length) throw new Error('找不到 Google Tasks 清單');
  const arr = (titles || []).slice(0, 50);
  for (const t of arr) Tasks.Tasks.insert({ title: String(t).slice(0, 500) }, lists[0].id);
  return { ok: true, count: arr.length, listName: lists[0].title };
}

function api_exportDoc(title, markdown) {
  const doc = DocumentApp.create(String(title || '未命名'));
  const body = doc.getBody();
  const stripInline = (s) => String(s)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1($2)');
  for (const raw of String(markdown || '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) {
      const lv = h[1].length;
      body.appendParagraph(stripInline(h[2])).setHeading(
        lv === 1 ? DocumentApp.ParagraphHeading.HEADING1
          : lv === 2 ? DocumentApp.ParagraphHeading.HEADING2
            : DocumentApp.ParagraphHeading.HEADING3
      );
      continue;
    }
    const chk = line.match(/^[-*]\s+\[( |x)\]\s+(.*)/);
    if (chk) { body.appendListItem((chk[1] === 'x' ? '✓ ' : '☐ ') + stripInline(chk[2])).setGlyphType(DocumentApp.GlyphType.BULLET); continue; }
    const ul = line.match(/^[-*]\s+(.*)/);
    if (ul) { body.appendListItem(stripInline(ul[1])).setGlyphType(DocumentApp.GlyphType.BULLET); continue; }
    const ol = line.match(/^\d+\.\s+(.*)/);
    if (ol) { body.appendListItem(stripInline(ol[1])).setGlyphType(DocumentApp.GlyphType.NUMBER); continue; }
    body.appendParagraph(stripInline(line));
  }
  doc.saveAndClose();
  return { url: doc.getUrl() };
}

function api_exportSlides(title, markdown) {
  const pres = SlidesApp.create(String(title || '未命名'));
  const slides = [];
  let cur = { title: String(title || ''), bullets: [] };
  for (const raw of String(markdown || '').split('\n')) {
    const line = raw.trim();
    if (!line || line === '---') continue;
    const h = line.match(/^(#{1,2})\s+(.*)/);
    if (h) {
      if (cur.bullets.length || slides.length === 0) slides.push(cur);
      cur = { title: h[2], bullets: [] };
    } else {
      cur.bullets.push(line.replace(/^[-*]\s+|\d+\.\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^\[( |x)\]\s*/, ''));
    }
  }
  slides.push(cur);
  for (const s of slides.slice(0, 30)) {
    const slide = pres.appendSlide(SlidesApp.PredefinedLayout.TITLE_AND_BODY);
    try {
      slide.getPlaceholder(SlidesApp.PlaceholderType.TITLE).asShape().getText().setText(String(s.title || '').slice(0, 100));
      slide.getPlaceholder(SlidesApp.PlaceholderType.BODY).asShape().getText().setText(s.bullets.slice(0, 12).join('\n').slice(0, 1500));
    } catch (e) { /* 版面沒有對應佔位框就略過 */ }
  }
  try { pres.getSlides()[0].remove(); } catch (e) { /* 預設空白頁刪不掉就留著 */ }
  return { url: pres.getUrl() };
}

function api_listCourses() {
  try {
    const res = Classroom.Courses.list({ teacherId: 'me', courseStates: ['ACTIVE'], pageSize: 30 });
    return { courses: (res.courses || []).map((c) => ({ id: c.id, name: c.name })) };
  } catch (e) {
    throw new Error('讀取 Classroom 課程失敗——個人帳號通常沒有課程,此功能適用學校帳號。(' + String((e && e.message) || e).slice(0, 150) + ')');
  }
}

function api_announceToCourse(courseId, text) {
  if (!courseId) throw new Error('請先選課程');
  Classroom.Courses.Announcements.create({ text: String(text || '').slice(0, 3000) }, String(courseId));
  return { ok: true };
}

// ---- 公開分享:Shares 表存 pageId↔token,分享頁為伺服器端渲染的靜態 HTML ----
const SHARES_SHEET_NAME = 'Shares';

function sharesSheet_() {
  const sh = sheetOf_(SHARES_SHEET_NAME, ['pageId', 'token', 'createdAt', 'scope']);
  if (String(sh.getRange(1, 4).getValue()) !== 'scope') sh.getRange(1, 4).setValue('scope');
  return sh;
}

function api_shareStatus(pageId) {
  if (!PUBLIC_EXEC_URL) return { available: false };
  const sh = sharesSheet_();
  const last = sh.getLastRow();
  if (last > 1) {
    const rows = sh.getRange(2, 1, last - 1, 4).getValues();
    for (const r of rows) {
      if (String(r[0]) === pageId) {
        return {
          available: true,
          shared: true,
          scope: String(r[3]) === 'tree' ? 'tree' : 'page',
          url: PUBLIC_EXEC_URL + '?s=' + String(r[1])
        };
      }
    }
  }
  return { available: true, shared: false };
}

// 分享採「檔案公開連結 + 全域 token 表」機制,A/B 版通用:
// 分享時把該頁(或整組)的 Drive JSON 檔設為「知道連結即可檢視」,並把 token→內容清單存進
// ScriptProperties(全 script 共用,匿名分享頁讀得到)。renderShare_ 只靠 fileId 讀檔,
// 不需要匿名端有試算表存取權——所以 B 版(資料在各使用者私有 Drive)也能運作。
const SHARE_MAX_ITEMS = 60; // ScriptProperties 單值 9KB 上限,子樹分享最多納入的頁數

function tokenOfPage_(pageId) {
  const sh = sharesSheet_();
  const last = sh.getLastRow();
  if (last > 1) {
    const rows = sh.getRange(2, 1, last - 1, 2).getValues();
    for (const r of rows) {
      if (String(r[0]) === pageId) return String(r[1]);
    }
  }
  return '';
}

function publishShare_(token, pageId, scope) {
  const pages = readIndex_();
  const set = new Set([pageId]);
  if (scope === 'tree') {
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of pages) {
        if (!set.has(p.id) && set.has(p.parentId)) { set.add(p.id); grew = true; }
      }
    }
  }
  const items = [];
  for (const p of pages) {
    if (!set.has(p.id)) continue;
    try { DriveApp.getFileById(p.fileId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* 略過 */ }
    items.push({ i: p.id, t: p.title, p: p.parentId, f: p.fileId, k: p.kind || 'page' });
    if (items.length >= SHARE_MAX_ITEMS) break;
  }
  PropertiesService.getScriptProperties().setProperty('sh_' + token, JSON.stringify({ s: scope, r: pageId, items: items }));
}

function unpublishShare_(token) {
  const sp = PropertiesService.getScriptProperties();
  const raw = sp.getProperty('sh_' + token);
  if (raw) {
    try {
      const o = JSON.parse(raw);
      for (const it of (o.items || [])) {
        try { DriveApp.getFileById(it.f).setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) { /* 略過 */ }
      }
    } catch (e) { /* 略過 */ }
    sp.deleteProperty('sh_' + token);
  }
}

function api_sharePage(pageId, scope) {
  if (!PUBLIC_EXEC_URL) throw new Error('分享部署尚未設定');
  const page = readIndex_().find((p) => p.id === pageId);
  if (!page) throw new Error('頁面不存在');
  const existing = api_shareStatus(pageId);
  if (existing.shared) return { url: existing.url, scope: existing.scope };
  scope = scope === 'tree' ? 'tree' : 'page';
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  sharesSheet_().appendRow([pageId, token, new Date().toISOString(), scope]);
  publishShare_(token, pageId, scope);
  return { url: PUBLIC_EXEC_URL + '?s=' + token, scope: scope };
}

function api_setShareScope(pageId, scope) {
  scope = scope === 'tree' ? 'tree' : 'page';
  const sh = sharesSheet_();
  const row = findRow_(sh, pageId);
  if (row < 0) throw new Error('這一頁還沒有分享');
  sh.getRange(row, 4).setValue(scope);
  const token = tokenOfPage_(pageId);
  if (token) publishShare_(token, pageId, scope);
  return { scope: scope };
}

function api_unsharePage(pageId) {
  const sh = sharesSheet_();
  const last = sh.getLastRow();
  if (last > 1) {
    const rows = sh.getRange(2, 1, last - 1, 2).getValues();
    for (let i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i][0]) === pageId) {
        unpublishShare_(String(rows[i][1]));
        sh.deleteRow(i + 2);
      }
    }
  }
  return { ok: true };
}

function shareErr_(msg) {
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>'
    + '<body style="font-family:sans-serif;color:#5f5e5a;text-align:center;padding:80px 20px">' + esc_(msg) + '</body></html>'
  );
}

// 優先讀全域 ScriptProperties 的 token 表(A/B 通用,靠 fileId 讀公開連結檔);
// 讀不到才退回舊的「讀 DB 試算表」法(僅 A 版舊連結、且匿名端能存取部署者試算表時可用)。
function resolveShare_(token) {
  const raw = PropertiesService.getScriptProperties().getProperty('sh_' + token);
  if (raw) {
    try {
      const o = JSON.parse(raw);
      const all = (o.items || []).map((x, idx) => ({
        id: x.i, title: x.t, parentId: x.p, order: idx, fileId: x.f, kind: x.k || 'page'
      }));
      if (all.length) return { rootId: o.r, scope: o.s === 'tree' ? 'tree' : 'page', all: all };
    } catch (e) { /* 落到下面的舊法 */ }
  }
  const ssId = PropertiesService.getScriptProperties().getProperty('DB_SPREADSHEET_ID');
  if (!ssId) return null;
  const ss = SpreadsheetApp.openById(ssId);
  const shSheet = ss.getSheetByName(SHARES_SHEET_NAME);
  if (!shSheet) return null;
  let rootId = '', scope = 'page';
  const sLast = shSheet.getLastRow();
  if (sLast > 1) {
    const rows = shSheet.getRange(2, 1, sLast - 1, 4).getValues();
    for (const r of rows) {
      if (String(r[1]) === token) { rootId = String(r[0]); scope = String(r[3]) === 'tree' ? 'tree' : 'page'; break; }
    }
  }
  if (!rootId) return null;
  const idx = ss.getSheetByName(SHEET_NAME);
  const all = [];
  const iLast = idx.getLastRow();
  if (iLast > 1) {
    const rows = idx.getRange(2, 1, iLast - 1, INDEX_HEADER.length).getValues();
    for (const r of rows) {
      if (r[0]) all.push({ id: String(r[0]), title: String(r[1]), parentId: String(r[2]), order: Number(r[3]) || 0, fileId: String(r[5]), kind: String(r[6]) === 'folder' ? 'folder' : 'page' });
    }
  }
  return { rootId: rootId, scope: scope, all: all };
}

function renderShare_(token, pParam) {
  token = String(token || '').replace(/[^A-Za-z0-9]/g, '');
  if (!token) return shareErr_('連結不完整。');
  try {
    const resolved = resolveShare_(token);
    if (!resolved) return shareErr_('此頁面不存在或已取消分享。');
    const rootId = resolved.rootId;
    const scope = resolved.scope;
    const all = resolved.all;
    const byId = new Map(all.map((p) => [p.id, p]));
    if (!byId.has(rootId)) return shareErr_('此頁面不存在或已取消分享。');
    const subtree = new Set([rootId]);
    if (scope === 'tree') {
      let grew = true;
      while (grew) {
        grew = false;
        for (const p of all) {
          if (!subtree.has(p.id) && subtree.has(p.parentId)) { subtree.add(p.id); grew = true; }
        }
      }
    }
    const targetId = (scope === 'tree' && pParam && subtree.has(String(pParam))) ? String(pParam) : rootId;
    const target = byId.get(targetId);
    if (!target || !target.fileId) return shareErr_('此頁面不存在或已取消分享。');
    const data = JSON.parse(DriveApp.getFileById(target.fileId).getBlob().getDataAsString('utf-8') || '{}');
    const body = blocksToHtml_(data.blocks || []);
    let nav = '';
    if (scope === 'tree' && subtree.size > 1) {
      const kidsOf = (pid) => all.filter((p) => p.parentId === pid && subtree.has(p.id))
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
      const navWalk = (pid, depth) => {
        let out = '';
        for (const p of kidsOf(pid)) {
          out += '<a' + (p.id === targetId ? ' aria-current="true"' : '')
            + ' style="padding-left:' + (10 + depth * 14) + 'px"'
            + ' href="' + PUBLIC_EXEC_URL + '?s=' + token + '&p=' + p.id + '">'
            + esc_(p.title || '未命名') + '</a>';
          out += navWalk(p.id, depth + 1);
        }
        return out;
      };
      nav = '<nav><a' + (targetId === rootId ? ' aria-current="true"' : '')
        + ' style="padding-left:10px" href="' + PUBLIC_EXEC_URL + '?s=' + token + '">'
        + esc_(byId.get(rootId).title || '未命名') + '</a>'
        + navWalk(rootId, 1) + '</nav>';
    }
    const html = '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><base target="_top">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">'
      + '<style>body{font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;color:#37352f;margin:0;line-height:1.75;font-size:16px}'
      + '.wrap{display:flex;gap:28px;max-width:1000px;margin:0 auto;padding:32px 20px 80px}'
      + 'nav{width:220px;flex:none;font-size:14px;border-right:1px solid #e8e7e4;padding-right:8px}'
      + 'nav a{display:block;padding:4px 8px;border-radius:4px;color:#5f5e5a;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + 'nav a:hover{background:#f1f0ed}nav a[aria-current]{background:#e9e7e2;font-weight:700;color:#37352f}'
      + 'article{flex:1;min-width:0;max-width:720px}'
      + '@media (max-width:700px){.wrap{display:block;padding:20px 14px 60px}nav{width:auto;border-right:none;border-bottom:1px solid #e8e7e4;padding:0 0 12px;margin-bottom:16px}}'
      + 'h1{font-size:32px;margin:8px 0 20px}h2{font-size:24px;margin:24px 0 8px}h3{font-size:19px;margin:20px 0 6px}'
      + 'img{max-width:100%;border-radius:6px}figure{margin:16px 0}figcaption{color:#a09f9b;font-size:13px}'
      + 'table{border-collapse:collapse;margin:12px 0;width:100%}td,th{border:1px solid #d5d4d0;padding:6px 10px;text-align:left}th{background:#f1efe8}'
      + 'blockquote{border-left:3px solid #d5d4d0;margin:12px 0;padding:4px 16px;color:#5f5e5a}blockquote footer{font-size:13px;color:#a09f9b}'
      + 'pre{background:#f1f0ed;border-radius:6px;padding:12px;overflow-x:auto}code{font-size:14px}'
      + 'ul.ck{list-style:none;padding-left:8px}hr{border:none;border-top:1px solid #e8e7e4;margin:20px 0}'
      + '.yt{position:relative;padding-top:56.25%;margin:12px 0}.yt iframe{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:6px}'
      + '.foot{margin-top:48px;padding-top:12px;border-top:1px solid #e8e7e4;color:#a09f9b;font-size:12px}</style>'
      + '<title>' + esc_(target.title || '未命名') + ' · SkyNote</title></head><body><div class="wrap">'
      + nav
      + '<article><h1>' + esc_(target.title || '未命名') + '</h1>'
      + body
      + '<div class="foot">此頁為唯讀分享 · 由 SkyNote 製作</div></article>'
      + '</div></body></html>';
    return HtmlService.createHtmlOutput(html)
      .setTitle((target.title || '未命名') + ' · SkyNote')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (e) {
    return shareErr_('讀取失敗,請稍後再試。');
  }
}

function safeInline_(html) {
  return String(html || '')
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<a([^>]*)href="#page=[^"]*"([^>]*)>([\s\S]*?)<\/a>/gi, '<span>$3</span>');
}

function blocksToHtml_(blocks) {
  const out = [];
  for (const b of blocks) {
    const d = b.data || {};
    switch (b.type) {
      case 'header': {
        const lv = Math.min(Math.max(Number(d.level) || 2, 1), 3);
        out.push('<h' + (lv + 1) + '>' + safeInline_(d.text) + '</h' + (lv + 1) + '>');
        break;
      }
      case 'paragraph':
        out.push('<p>' + (safeInline_(d.text) || '&nbsp;') + '</p>');
        break;
      case 'list': {
        const tag = d.style === 'ordered' ? 'ol' : 'ul';
        out.push('<' + tag + '>' + (d.items || []).map((it) =>
          '<li>' + safeInline_(typeof it === 'string' ? it : String((it && (it.content || it.text)) || '')) + '</li>'
        ).join('') + '</' + tag + '>');
        break;
      }
      case 'checklist':
        out.push('<ul class="ck">' + (d.items || []).map((it) =>
          '<li>' + (it.checked ? '☑' : '☐') + ' ' + safeInline_(it.text) + '</li>'
        ).join('') + '</ul>');
        break;
      case 'quote':
        out.push('<blockquote>' + safeInline_(d.text)
          + (d.caption ? '<footer>— ' + safeInline_(d.caption) + '</footer>' : '') + '</blockquote>');
        break;
      case 'code':
        out.push('<pre><code>' + esc_(d.code || '') + '</code></pre>');
        break;
      case 'delimiter':
        out.push('<hr>');
        break;
      case 'table': {
        const rows = d.content || [];
        let html = '<table>';
        rows.forEach((r, i) => {
          const cell = (d.withHeadings && i === 0) ? 'th' : 'td';
          html += '<tr>' + (r || []).map((c) => '<' + cell + '>' + safeInline_(c) + '</' + cell + '>').join('') + '</tr>';
        });
        out.push(html + '</table>');
        break;
      }
      case 'image': {
        const u = (d.file && d.file.url) || '';
        if (/^https?:/.test(u)) {
          out.push('<figure><img src="' + esc_(u) + '" alt="">'
            + (d.caption ? '<figcaption>' + safeInline_(d.caption) + '</figcaption>' : '') + '</figure>');
        }
        break;
      }
      case 'driveFile':
        if (/^https?:/.test(d.url || '')) {
          out.push('<p><a href="' + esc_(d.url) + '" target="_blank" rel="noopener">' + esc_(d.name || 'Drive 檔案') + '</a></p>');
        }
        break;
      case 'youtube':
        if (/^[A-Za-z0-9_-]{6,20}$/.test(d.videoId || '')) {
          out.push('<div class="yt"><iframe src="https://www.youtube.com/embed/' + d.videoId + '" allowfullscreen></iframe></div>');
        }
        break;
      case 'map':
        if (d.query) {
          out.push('<div class="yt"><iframe src="https://www.google.com/maps?q=' + encodeURIComponent(d.query) + '&output=embed" allowfullscreen></iframe></div>');
        }
        break;
    }
  }
  return out.join('\n');
}

// ---- 每日自動頁(時間觸發器) ----
function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function api_dailyStatus() {
  const up = PropertiesService.getUserProperties();
  return { enabled: up.getProperty('DAILY_ENABLED') === '1', hour: Number(up.getProperty('DAILY_HOUR') || 6) };
}

function api_setDaily(enabled, hour) {
  const up = PropertiesService.getUserProperties();
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'dailyPageJob') ScriptApp.deleteTrigger(t);
  }
  if (enabled) {
    hour = Math.max(0, Math.min(23, Number(hour) || 6));
    ScriptApp.newTrigger('dailyPageJob').timeBased().everyDays(1).atHour(hour).create();
    up.setProperty('DAILY_ENABLED', '1');
    up.setProperty('DAILY_HOUR', String(hour));
    return { enabled: true, hour: hour };
  }
  up.setProperty('DAILY_ENABLED', '0');
  return { enabled: false };
}

function api_runDailyNow() {
  return { created: dailyPageJob() };
}

function dailyPageJob() {
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy/MM/dd');
  const week = ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()];
  const title = today + '(週' + week + ')';
  let pages = readIndex_();
  let parent = pages.find((p) => p.parentId === '' && p.title === '每日筆記');
  const parentId = parent ? parent.id : createPage_('', '每日筆記', { time: Date.now(), blocks: [] }).id;
  pages = readIndex_();
  if (pages.some((p) => p.parentId === parentId && p.title === title)) return false;
  let evBlock = { type: 'paragraph', data: { text: '(今天沒有行程)' } };
  try {
    const evs = api_todayEvents().events;
    if (evs.length) {
      evBlock = { type: 'checklist', data: { items: evs.map((ev) => ({ text: esc_(ev.time + ' ' + ev.title), checked: false })) } };
    }
  } catch (e) { /* 日曆讀不到就留預設 */ }
  createPage_(parentId, title, {
    time: Date.now(),
    blocks: [
      { type: 'header', data: { text: '今日行程', level: 2 } },
      evBlock,
      { type: 'header', data: { text: '今日待辦', level: 2 } },
      { type: 'checklist', data: { items: [{ text: '', checked: false }] } },
      { type: 'header', data: { text: '隨手記', level: 2 } },
      { type: 'paragraph', data: { text: '' } }
    ]
  });
  return true;
}

// ---- 自動備份(每週時間觸發器,zip 存 Drive「SkyNote 備份」,保留最近 8 份) ----
function backupFolder_() { return folderOf_('BACKUP_FOLDER_ID', 'SkyNote 備份'); }

function mdInlineSrv_(html) {
  let s = String(html || '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, '**$2**');
  s = s.replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, '*$2*');
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  s = s.replace(/<a[^>]*href="#page=[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return s;
}

function pageMd_(title, contentJson) {
  const lines = ['# ' + title, ''];
  let data;
  try { data = JSON.parse(contentJson || '{}'); } catch (e) { data = {}; }
  for (const b of (data.blocks || [])) {
    const d = b.data || {};
    switch (b.type) {
      case 'header': lines.push('#'.repeat(d.level || 2) + ' ' + mdInlineSrv_(d.text), ''); break;
      case 'paragraph': lines.push(mdInlineSrv_(d.text), ''); break;
      case 'list':
        (d.items || []).forEach((it, i) => {
          const t = typeof it === 'string' ? it : String((it && (it.content || it.text)) || '');
          lines.push(d.style === 'ordered' ? (i + 1) + '. ' + mdInlineSrv_(t) : '- ' + mdInlineSrv_(t));
        });
        lines.push('');
        break;
      case 'checklist':
        (d.items || []).forEach((it) => lines.push('- [' + (it.checked ? 'x' : ' ') + '] ' + mdInlineSrv_(it.text)));
        lines.push('');
        break;
      case 'quote':
        lines.push('> ' + mdInlineSrv_(d.text));
        if (d.caption) lines.push('> — ' + mdInlineSrv_(d.caption));
        lines.push('');
        break;
      case 'code': lines.push('```', d.code || '', '```', ''); break;
      case 'delimiter': lines.push('---', ''); break;
      case 'table': {
        const rows = (d.content || []).map((r) => '| ' + (r || []).map((c) => mdInlineSrv_(c)).join(' | ') + ' |');
        if (rows.length) {
          const width = (d.content[0] || []).length;
          const sep = '| ' + Array(width).fill('---').join(' | ') + ' |';
          if (d.withHeadings) lines.push(rows[0], sep, ...rows.slice(1));
          else lines.push('| ' + Array(width).fill(' ').join(' | ') + ' |', sep, ...rows);
          lines.push('');
        }
        break;
      }
      case 'image': lines.push('![' + mdInlineSrv_(d.caption || '') + '](' + ((d.file && d.file.url) || '') + ')', ''); break;
      case 'driveFile': lines.push('[' + (d.name || 'Drive 檔案') + '](' + (d.url || '') + ')', ''); break;
      case 'youtube': lines.push(d.url || ('https://youtu.be/' + (d.videoId || '')), ''); break;
    }
  }
  return lines.join('\n');
}

function backupJob() {
  const pages = readIndex_();
  const items = pages.map((p) => {
    let content = '';
    try { content = DriveApp.getFileById(p.fileId).getBlob().getDataAsString('utf-8'); } catch (e) { /* 略過 */ }
    return { id: p.id, title: p.title, parentId: p.parentId, order: p.order, updatedAt: p.updatedAt, content: content };
  });
  const blobs = [];
  const sanitize = (s) => (String(s || '未命名').replace(/[\\/:*?"<>|#%{}]/g, '_').trim() || '未命名').slice(0, 60);
  const walk = (pid, prefix) => {
    const kids = items.filter((p) => p.parentId === pid)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    const used = {};
    for (const p of kids) {
      let name = sanitize(p.title);
      if (used[name]) { used[name]++; name += '_' + used[name]; } else used[name] = 1;
      blobs.push(Utilities.newBlob(pageMd_(p.title || '未命名', p.content), 'text/markdown', prefix + name + '.md'));
      walk(p.id, prefix + name + '/');
    }
  };
  walk('', '');
  blobs.push(Utilities.newBlob(JSON.stringify(items), 'application/json', '_backup.json'));
  const tz = Session.getScriptTimeZone();
  const zipName = '筆記備份-' + Utilities.formatDate(new Date(), tz, 'yyyyMMdd-HHmm') + '.zip';
  const folder = backupFolder_();
  const file = folder.createFile(Utilities.zip(blobs, zipName));
  const all = [];
  const it = folder.getFiles();
  while (it.hasNext()) all.push(it.next());
  all.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  for (let i = 8; i < all.length; i++) {
    try { all[i].setTrashed(true); } catch (e) { /* 略過 */ }
  }
  return { url: file.getUrl(), pages: pages.length, name: zipName };
}

function api_runBackupNow() {
  return backupJob();
}

function api_autoBackupStatus() {
  return { enabled: PropertiesService.getUserProperties().getProperty('AUTOBACKUP_ENABLED') === '1' };
}

function api_setAutoBackup(enabled) {
  const up = PropertiesService.getUserProperties();
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'backupJob') ScriptApp.deleteTrigger(t);
  }
  if (enabled) {
    ScriptApp.newTrigger('backupJob').timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).create();
    up.setProperty('AUTOBACKUP_ENABLED', '1');
    return { enabled: true };
  }
  up.setProperty('AUTOBACKUP_ENABLED', '0');
  return { enabled: false };
}

function welcome_() {
  return {
    time: Date.now(),
    blocks: [
      { type: 'header', data: { text: '歡迎使用你的筆記', level: 1 } },
      { type: 'paragraph', data: { text: '這是一個掛在 Google Sites、後端跑在 Apps Script 上的個人筆記。內容停止輸入約兩秒後會自動儲存,右上角會顯示儲存狀態。' } },
      { type: 'list', data: { style: 'unordered', items: ['左側清單列出所有頁面,滑過去按「＋」可以新增子頁面,拖曳可以搬移排序', '在編輯區按「/」或點左側的「＋」按鈕可以插入標題、清單、待辦、表格、圖片等區塊', '左上搜尋框可以全文搜尋;右上可以匯出 Markdown、查看版本紀錄'] } },
      { type: 'checklist', data: { items: [{ text: '建立第一個自己的頁面', checked: false }, { text: '試試拖曳頁面調整順序', checked: false }] } }
    ]
  };
}
