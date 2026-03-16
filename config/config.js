const TOP_BOOKMARKS_STORAGE_KEY = 'topBookmarks';
const SHORTCUTS_STORAGE_KEY = 'bookmarks';
const SEARCH_ENGINES_STORAGE_KEY = 'searchEngines';

function $(sel){
  return document.querySelector(sel);
}

function $all(sel){
  return Array.from(document.querySelectorAll(sel));
}

function downloadJson(filename, obj){
  const data = JSON.stringify(obj, null, 2);
  const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(()=>URL.revokeObjectURL(url), 500);
}

async function readJsonFile(file){
  const text = await file.text();
  return JSON.parse(text);
}

function normalizeUrl(url){
  const u = String(url || '').trim();
  if(!u) return '';
  if(/^https?:\/\//i.test(u)) return u;
  return 'https://' + u;
}

function validateTopData(data){
  if(!data || typeof data !== 'object') throw new Error('top 데이터는 객체여야 합니다.');
  if(!Array.isArray(data.top)) throw new Error('top 데이터는 { "top": [...] } 형식이어야 합니다.');
}

function validateShortcutsArray(arr){
  if(!Array.isArray(arr)) throw new Error('shortcuts는 배열이어야 합니다.');
  if(arr.length > 15) throw new Error('하단 바로가기는 최대 15개입니다.');
  arr.forEach((it, idx)=>{
    if(!it || typeof it !== 'object') throw new Error(`shortcuts[${idx}]는 객체여야 합니다.`);
    const name = String(it.name || '').trim();
    const url = String(it.url || '').trim();
    if(!name) throw new Error(`shortcuts[${idx}].name 이 비어있습니다.`);
    if(!url) throw new Error(`shortcuts[${idx}].url 이 비어있습니다.`);
  });
}

function validateEnginesData(data){
  if(!data || typeof data !== 'object') throw new Error('engines 데이터는 객체여야 합니다.');
  if(!data.engines || typeof data.engines !== 'object') throw new Error('{ "engines": { ... } } 형식이어야 합니다.');
  Object.keys(data.engines).forEach(key => {
    const e = data.engines[key];
    if (!e.label || !e.domain || !e.urlPattern) throw new Error(`engines['${key}'] 의 필수 값이 누락되었습니다.`);
  });
}

function getTopFromLocalStorage(){
  try{
    const raw = localStorage.getItem(TOP_BOOKMARKS_STORAGE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    validateTopData(data);
    return data;
  }catch(e){
    return null;
  }
}

async function getTopDefaultFromFile(){
  const res = await fetch('./bookmarks.json', { cache: 'no-store' });
  if(!res.ok) throw new Error(`config/bookmarks.json 로드 실패 (HTTP ${res.status})`);
  const data = await res.json();
  validateTopData(data);
  return data;
}

function getShortcutsFromLocalStorage(){
  try{
    const raw = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if(!Array.isArray(arr)) return null; 
    return arr;
  }catch(e){
    return null;
  }
}

async function getShortcutsDefaultFromFile(){
  const res = await fetch('./shortcuts.json', { cache: 'no-store' });
  if(!res.ok) throw new Error(`config/shortcuts.json 로드 실패 (HTTP ${res.status})`);
  const data = await res.json();
  const arr = fileFormatToShortcuts(data);
  return arr;
}

function getEnginesFromLocalStorage(){
  try{
    const raw = localStorage.getItem(SEARCH_ENGINES_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    validateEnginesData(data);
    return data;
  }catch(e){
    return null;
  }
}

async function getEnginesDefaultFromFile(){
  const res = await fetch('./engines.json', { cache: 'no-store' });
  if(!res.ok) throw new Error(`config/engines.json 로드 실패 (HTTP ${res.status})`);
  const data = await res.json();
  validateEnginesData(data);
  return data;
}

function setEditorTab(tab){
  $all('.tab').forEach((b)=>b.classList.toggle('active', b.dataset.tab === tab));
  $all('.panel').forEach((p)=>p.classList.toggle('hidden', p.dataset.panel !== tab));
}

function setMode(name, value){
  $all(`input[name="${name}"]`).forEach((r)=>{ r.checked = r.value === value; });
}

$all('.tab').forEach((b)=>{
  b.addEventListener('click', ()=>{
    setEditorTab(b.dataset.tab);
  });
});

// --- Top ---
const topJson = $('#topJson');
const topJsonLabel = $('#topJsonLabel');
const topTree = $('#topTree');
const topLoad = $('#topLoad');
const topApply = $('#topApply');
const topExport = $('#topExport');
const topImport = $('#topImport');
const topReset = $('#topReset');

let topData = { top: [] };

function ensureFolder(node){
  if(!node || typeof node !== 'object') return;
  if(!Array.isArray(node.items)) node.items = [];
}

function syncTopJsonFromData(){
  topJson.value = JSON.stringify(topData, null, 2);
}

function syncTopDataFromJson(){
  const data = JSON.parse(topJson.value || 'null');
  validateTopData(data);
  topData = data;
}

function renderTopNode(node, parentArr, index){
  const wrap = document.createElement('div');
  wrap.className = 'node';

  const header = document.createElement('div');
  header.className = 'node-header';

  const isFolder = Array.isArray(node?.items) && !node?.url;
  const badge = document.createElement('span');
  badge.className = 'node-badge';
  badge.textContent = isFolder ? 'FOLDER' : 'LINK';
  header.appendChild(badge);

  const nameField = document.createElement('div');
  nameField.className = 'field';
  const nameInput = document.createElement('input');
  nameInput.placeholder = '이름';
  nameInput.value = node?.name || '';
  nameInput.oninput = ()=>{
    node.name = nameInput.value;
    syncTopJsonFromData();
  };
  nameField.appendChild(nameInput);
  header.appendChild(nameField);

  if(!isFolder){
    const urlField = document.createElement('div');
    urlField.className = 'field';
    const urlInput = document.createElement('input');
    urlInput.placeholder = 'URL';
    urlInput.value = node?.url || '';
    urlInput.oninput = ()=>{
      node.url = urlInput.value;
      syncTopJsonFromData();
    };
    urlField.appendChild(urlInput);
    header.appendChild(urlField);
  }else{
    const addLink = document.createElement('button');
    addLink.type = 'button';
    addLink.className = 'mini';
    addLink.textContent = '하위 링크+';
    addLink.onclick = ()=>{
      ensureFolder(node);
      node.items.push({ name: '새 링크', url: 'https://' });
      syncTopJsonFromData();
      renderTopTree();
    };

    const addFolder = document.createElement('button');
    addFolder.type = 'button';
    addFolder.className = 'mini';
    addFolder.textContent = '하위 폴더+';
    addFolder.onclick = ()=>{
      ensureFolder(node);
      node.items.push({ name: '새 폴더', items: [] });
      syncTopJsonFromData();
      renderTopTree();
    };

    header.appendChild(addLink);
    header.appendChild(addFolder);
  }

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'mini danger';
  delBtn.textContent = '삭제';
  delBtn.onclick = ()=>{
    parentArr.splice(index, 1);
    syncTopJsonFromData();
    renderTopTree();
  };
  header.appendChild(delBtn);

  wrap.appendChild(header);

  if(isFolder){
    const children = document.createElement('div');
    children.className = 'node-children';

    ensureFolder(node);
    node.items.forEach((ch, i)=>{
      children.appendChild(renderTopNode(ch, node.items, i));
    });

    wrap.appendChild(children);
  }

  return wrap;
}

function renderTopTree(){
  if(!topTree) return;
  topTree.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'node';

  const header = document.createElement('div');
  header.className = 'node-header';

  const badge = document.createElement('span');
  badge.className = 'node-badge';
  badge.textContent = 'ROOT(top)';

  const addLink = document.createElement('button');
  addLink.type = 'button';
  addLink.className = 'mini';
  addLink.textContent = '링크 추가';
  addLink.onclick = ()=>{
    topData.top.push({ name: '새 링크', url: 'https://' });
    syncTopJsonFromData();
    renderTopTree();
  };

  const addFolder = document.createElement('button');
  addFolder.type = 'button';
  addFolder.className = 'mini';
  addFolder.textContent = '폴더 추가';
  addFolder.onclick = ()=>{
    topData.top.push({ name: '새 폴더', items: [] });
    syncTopJsonFromData();
    renderTopTree();
  };

  header.appendChild(badge);
  header.appendChild(addLink);
  header.appendChild(addFolder);
  root.appendChild(header);

  const children = document.createElement('div');
  children.className = 'node-children';

  topData.top.forEach((it, idx)=>{
    children.appendChild(renderTopNode(it, topData.top, idx));
  });

  root.appendChild(children);
  topTree.appendChild(root);
}

function setTopMode(mode){
  if(mode === 'json'){
    topTree?.classList.add('hidden');
    topJson?.classList.remove('hidden');
    topJsonLabel?.classList.remove('hidden');
    syncTopJsonFromData();
  }else{
    topTree?.classList.remove('hidden');
    topJson?.classList.add('hidden');
    topJsonLabel?.classList.add('hidden');
    try{
      if(topJson.value.trim()){
        syncTopDataFromJson();
      }
    }catch(e){
      alert(`JSON 파싱 실패: ${String(e?.message || e)}`);
      setMode('topMode', 'json');
      setTopMode('json');
      return;
    }
    renderTopTree();
  }
}

$all('input[name="topMode"]').forEach((r)=>{
  r.addEventListener('change', ()=>{
    setTopMode(r.value);
  });
});

async function loadTopIntoEditor(){
  const stored = getTopFromLocalStorage();
  const data = stored || (await getTopDefaultFromFile());
  validateTopData(data);
  topData = data;
  syncTopJsonFromData();
  renderTopTree();
}

topLoad.addEventListener('click', async ()=>{
  try{
    await loadTopIntoEditor();
  }catch(e){
    alert(String(e?.message || e));
  }
});

topApply.addEventListener('click', ()=>{
  try{
    const data = JSON.parse(topJson.value || 'null');
    validateTopData(data);
    topData = data;
    localStorage.setItem(TOP_BOOKMARKS_STORAGE_KEY, JSON.stringify(data));
    alert('상단 고정(Top) 저장 완료: 홈으로 돌아가면 반영됩니다.');
  }catch(e){
    alert(`적용 실패: ${String(e?.message || e)}`);
  }
});

topExport.addEventListener('click', ()=>{
  try{
    const data = JSON.parse(topJson.value || 'null');
    validateTopData(data);
    downloadJson('top-bookmarks.json', data);
  }catch(e){
    alert(`Export 실패: ${String(e?.message || e)}`);
  }
});

topImport.addEventListener('change', async ()=>{
  const file = topImport.files?.[0];
  if(!file) return;
  try{
    const data = await readJsonFile(file);
    validateTopData(data);
    topData = data;
    syncTopJsonFromData();
    renderTopTree();
    alert('Import 완료(에디터에 반영). 필요하면 “적용”을 눌러 저장하세요.');
  }catch(e){
    alert(`Import 실패: ${String(e?.message || e)}`);
  }finally{
    topImport.value = '';
  }
});

topReset.addEventListener('click', async ()=>{
  try{
    if(!confirm('localStorage(topBookmarks)를 삭제하고 기본값(bookmarks.json)으로 되돌릴까요?')) return;
    localStorage.removeItem(TOP_BOOKMARKS_STORAGE_KEY);
    await loadTopIntoEditor();
    alert('초기화 완료: 홈 상단은 기본값(bookmarks.json)으로 표시됩니다.');
  }catch(e){
    alert(`초기화 실패: ${String(e?.message || e)}`);
  }
});

// --- Shortcuts ---
const scJson = $('#scJson');
const scJsonLabel = $('#scJsonLabel');
const scList = $('#scList');
const scLoad = $('#scLoad');
const scApply = $('#scApply');
const scExport = $('#scExport');
const scImport = $('#scImport');
const scNormalize = $('#scNormalize');

let scData = [];

function shortcutsToFileFormat(arr){
  return { shortcuts: arr };
}

function fileFormatToShortcuts(obj){
  if(!obj || typeof obj !== 'object') throw new Error('shortcuts 파일은 객체여야 합니다.');
  if(!Array.isArray(obj.shortcuts)) throw new Error('{ "shortcuts": [...] } 형식이어야 합니다.');
  return obj.shortcuts;
}

function normalizeShortcutsInPlace(arr){
  return arr.map((it)=>({
    name: String(it.name || '').trim(),
    url: normalizeUrl(it.url),
  })).filter((it)=>it.name && it.url);
}

function syncShortcutsJsonFromData(){
  scJson.value = JSON.stringify(shortcutsToFileFormat(scData), null, 2);
}

function syncShortcutsDataFromJson(){
  const obj = JSON.parse(scJson.value || 'null');
  const arr = fileFormatToShortcuts(obj);
  scData = arr;
}

function renderShortcutRow(item, index){
  const node = document.createElement('div');
  node.className = 'node';

  const header = document.createElement('div');
  header.className = 'node-header';

  const badge = document.createElement('span');
  badge.className = 'node-badge';
  badge.textContent = 'LINK';

  const nameField = document.createElement('div');
  nameField.className = 'field';
  const nameInput = document.createElement('input');
  nameInput.placeholder = '이름';
  nameInput.value = item?.name || '';
  nameInput.oninput = ()=>{
    item.name = nameInput.value;
    syncShortcutsJsonFromData();
  };
  nameField.appendChild(nameInput);

  const urlField = document.createElement('div');
  urlField.className = 'field';
  const urlInput = document.createElement('input');
  urlInput.placeholder = 'URL';
  urlInput.value = item?.url || '';
  urlInput.oninput = ()=>{
    item.url = urlInput.value;
    syncShortcutsJsonFromData();
  };
  urlField.appendChild(urlInput);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'mini danger';
  delBtn.textContent = '삭제';
  delBtn.onclick = ()=>{
    scData.splice(index, 1);
    syncShortcutsJsonFromData();
    renderShortcutsList();
  };

  header.appendChild(badge);
  header.appendChild(nameField);
  header.appendChild(urlField);
  header.appendChild(delBtn);

  node.appendChild(header);
  return node;
}

function renderShortcutsList(){
  if(!scList) return;
  scList.innerHTML = '';

  const top = document.createElement('div');
  top.className = 'node';

  const header = document.createElement('div');
  header.className = 'node-header';

  const badge = document.createElement('span');
  badge.className = 'node-badge';
  badge.textContent = `SHORTCUTS (${scData.length}/15)`;

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'mini';
  addBtn.textContent = '추가';
  addBtn.onclick = ()=>{
    if(scData.length >= 15){
      alert('하단 바로가기는 최대 15개입니다.');
      return;
    }
    scData.push({ name: '새 바로가기', url: 'https://' });
    syncShortcutsJsonFromData();
    renderShortcutsList();
  };

  header.appendChild(badge);
  header.appendChild(addBtn);
  top.appendChild(header);

  const children = document.createElement('div');
  children.className = 'node-children';

  scData.forEach((it, idx)=>{
    children.appendChild(renderShortcutRow(it, idx));
  });

  top.appendChild(children);
  scList.appendChild(top);
}

function setScMode(mode){
  if(mode === 'json'){
    scList?.classList.add('hidden');
    scJson?.classList.remove('hidden');
    scJsonLabel?.classList.remove('hidden');
    syncShortcutsJsonFromData();
  }else{
    scList?.classList.remove('hidden');
    scJson?.classList.add('hidden');
    scJsonLabel?.classList.add('hidden');
    try{
      if(scJson.value.trim()){
        syncShortcutsDataFromJson();
      }
    }catch(e){
      alert(`JSON 파싱 실패: ${String(e?.message || e)}`);
      setMode('scMode', 'json');
      setScMode('json');
      return;
    }
    renderShortcutsList();
  }
}

$all('input[name="scMode"]').forEach((r)=>{
  r.addEventListener('change', ()=>{
    setScMode(r.value);
  });
});

async function loadShortcutsIntoEditor(){
  const stored = getShortcutsFromLocalStorage();
  const arr = stored || (await getShortcutsDefaultFromFile().catch(() => []));
  scData = arr;
  syncShortcutsJsonFromData();
  renderShortcutsList();
}

scLoad.addEventListener('click', async ()=>{
  try{
    await loadShortcutsIntoEditor();
  }catch(e){
    alert(String(e?.message || e));
  }
});

scNormalize.addEventListener('click', ()=>{
  try{
    const obj = JSON.parse(scJson.value || 'null');
    const arr = fileFormatToShortcuts(obj);
    const normalized = normalizeShortcutsInPlace(arr);
    if(normalized.length > 15) throw new Error('정리 후 결과가 15개를 초과했습니다.');
    validateShortcutsArray(normalized);

    scData = normalized;
    syncShortcutsJsonFromData();
    renderShortcutsList();

    alert('URL 정리 완료');
  }catch(e){
    alert(`정리 실패: ${String(e?.message || e)}`);
  }
});

scApply.addEventListener('click', ()=>{
  try{
    const obj = JSON.parse(scJson.value || 'null');
    const arr = fileFormatToShortcuts(obj);
    const normalized = normalizeShortcutsInPlace(arr);

    validateShortcutsArray(normalized);

    scData = normalized;
    syncShortcutsJsonFromData();
    renderShortcutsList();

    localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(normalized));
    alert('하단 바로가기 저장 완료: 홈으로 돌아가면 반영됩니다.');
  }catch(e){
    alert(`적용 실패: ${String(e?.message || e)}`);
  }
});

scExport.addEventListener('click', ()=>{
  try{
    const obj = JSON.parse(scJson.value || 'null');
    const arr = fileFormatToShortcuts(obj);
    const normalized = normalizeShortcutsInPlace(arr);
    validateShortcutsArray(normalized);
    downloadJson('shortcuts.json', shortcutsToFileFormat(normalized));
  }catch(e){
    alert(`Export 실패: ${String(e?.message || e)}`);
  }
});

scImport.addEventListener('change', async ()=>{
  const file = scImport.files?.[0];
  if(!file) return;
  try{
    const obj = await readJsonFile(file);
    const arr = fileFormatToShortcuts(obj);
    const normalized = normalizeShortcutsInPlace(arr);
    validateShortcutsArray(normalized);

    scData = normalized;
    syncShortcutsJsonFromData();
    renderShortcutsList();

    alert('Import 완료(에디터에 반영). 필요하면 “적용”을 눌러 저장하세요.');
  }catch(e){
    alert(`Import 실패: ${String(e?.message || e)}`);
  }finally{
    scImport.value = '';
  }
});

$('#scReset').addEventListener('click', async ()=>{
  try{
    if(!confirm('localStorage(bookmarks)를 삭제하고 기본값(config/shortcuts.json)으로 되돌릴까요?')) return;
    localStorage.removeItem(SHORTCUTS_STORAGE_KEY);
    await loadShortcutsIntoEditor();
    alert('초기화 완료: 하단 바로가기는 기본값(config/shortcuts.json)으로 표시됩니다.');
  }catch(e){
    alert(`초기화 실패: ${String(e?.message || e)}`);
  }
});

// --- Engines ---
const egJson = $('#egJson');
const egJsonLabel = $('#egJsonLabel');
const egList = $('#egList');
const egLoad = $('#egLoad');
const egApply = $('#egApply');
const egExport = $('#egExport');
const egImport = $('#egImport');
const egReset = $('#egReset');

let egData = { engines: {} };

function syncEnginesJsonFromData(){
  egJson.value = JSON.stringify(egData, null, 2);
}

function syncEnginesDataFromJson(){
  const data = JSON.parse(egJson.value || 'null');
  validateEnginesData(data);
  egData = data;
}

function renderEngineRow(key, index){
  const item = egData.engines[key];
  const node = document.createElement('div');
  node.className = 'node';

  const header = document.createElement('div');
  header.className = 'node-header';

  const badge = document.createElement('span');
  badge.className = 'node-badge';
  badge.textContent = 'ENGINE';

  const keyField = document.createElement('div');
  keyField.className = 'field';
  const keyInput = document.createElement('input');
  keyInput.placeholder = 'ID(unique)';
  keyInput.value = key;
  keyInput.oninput = ()=>{
    const newKey = keyInput.value.trim();
    if (newKey && newKey !== key) {
      egData.engines[newKey] = egData.engines[key];
      delete egData.engines[key];
      key = newKey; // 업데이트된 키로 유지
      syncEnginesJsonFromData();
    }
  };
  keyField.appendChild(keyInput);

  const labelField = document.createElement('div');
  labelField.className = 'field';
  const labelInput = document.createElement('input');
  labelInput.placeholder = '표시 이름';
  labelInput.value = item.label;
  labelInput.oninput = ()=>{
    item.label = labelInput.value;
    syncEnginesJsonFromData();
  };
  labelField.appendChild(labelInput);

  const domainField = document.createElement('div');
  domainField.className = 'field';
  const domainInput = document.createElement('input');
  domainInput.placeholder = '도메인 (아이콘용)';
  domainInput.value = item.domain;
  domainInput.oninput = ()=>{
    item.domain = domainInput.value;
    syncEnginesJsonFromData();
  };
  domainField.appendChild(domainInput);

  const urlField = document.createElement('div');
  urlField.className = 'field';
  const urlInput = document.createElement('input');
  urlInput.placeholder = '검색 URL 패턴';
  urlInput.value = item.urlPattern;
  urlInput.oninput = ()=>{
    item.urlPattern = urlInput.value;
    syncEnginesJsonFromData();
  };
  urlField.appendChild(urlInput);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'mini danger';
  delBtn.textContent = '삭제';
  delBtn.onclick = ()=>{
    delete egData.engines[key];
    syncEnginesJsonFromData();
    renderEnginesList();
  };

  header.appendChild(badge);
  header.appendChild(keyField);
  header.appendChild(labelField);
  header.appendChild(domainField);
  header.appendChild(urlField);
  header.appendChild(delBtn);

  node.appendChild(header);
  return node;
}

function renderEnginesList(){
  if(!egList) return;
  egList.innerHTML = '';

  const top = document.createElement('div');
  top.className = 'node';

  const header = document.createElement('div');
  header.className = 'node-header';

  const badge = document.createElement('span');
  badge.className = 'node-badge';
  badge.textContent = `SEARCH ENGINES (${Object.keys(egData.engines).length})`;

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'mini';
  addBtn.textContent = '추가';
  addBtn.onclick = ()=>{
    const newKey = 'new_' + Date.now();
    egData.engines[newKey] = { label: '새 엔진', domain: 'example.com', urlPattern: 'https://search.example.com?q=' };
    syncEnginesJsonFromData();
    renderEnginesList();
  };

  header.appendChild(badge);
  header.appendChild(addBtn);
  top.appendChild(header);

  const children = document.createElement('div');
  children.className = 'node-children';

  Object.keys(egData.engines).forEach((key, idx)=>{
    children.appendChild(renderEngineRow(key, idx));
  });

  top.appendChild(children);
  egList.appendChild(top);
}

function setEgMode(mode){
  if(mode === 'json'){
    egList?.classList.add('hidden');
    egJson?.classList.remove('hidden');
    egJsonLabel?.classList.remove('hidden');
    syncEnginesJsonFromData();
  }else{
    egList?.classList.remove('hidden');
    egJson?.classList.add('hidden');
    egJsonLabel?.classList.add('hidden');
    try{
      if(egJson.value.trim()){
        syncEnginesDataFromJson();
      }
    }catch(e){
      alert(`JSON 파싱 실패: ${String(e?.message || e)}`);
      setMode('egMode', 'json');
      setEgMode('json');
      return;
    }
    renderEnginesList();
  }
}

$all('input[name="egMode"]').forEach((r)=>{
  r.addEventListener('change', ()=>{
    setEgMode(r.value);
  });
});

async function loadEnginesIntoEditor(){
  const stored = getEnginesFromLocalStorage();
  const data = stored || (await getEnginesDefaultFromFile());
  egData = data;
  syncEnginesJsonFromData();
  renderEnginesList();
}

egLoad.addEventListener('click', async ()=>{
  try{
    await loadEnginesIntoEditor();
  }catch(e){
    alert(String(e?.message || e));
  }
});

egApply.addEventListener('click', ()=>{
  try{
    const data = JSON.parse(egJson.value || 'null');
    validateEnginesData(data);
    egData = data;
    localStorage.setItem(SEARCH_ENGINES_STORAGE_KEY, JSON.stringify(data));
    alert('검색 엔진 저장 완료: 홈으로 돌아가면 반영됩니다.');
  }catch(e){
    alert(`적용 실패: ${String(e?.message || e)}`);
  }
});

egExport.addEventListener('click', ()=>{
  try{
    const data = JSON.parse(egJson.value || 'null');
    validateEnginesData(data);
    downloadJson('engines.json', data);
  }catch(e){
    alert(`Export 실패: ${String(e?.message || e)}`);
  }
});

egImport.addEventListener('change', async ()=>{
  const file = egImport.files?.[0];
  if(!file) return;
  try{
    const data = await readJsonFile(file);
    validateEnginesData(data);
    egData = data;
    syncEnginesJsonFromData();
    renderEnginesList();
    alert('Import 완료(에디터에 반영). 필요하면 “적용”을 눌러 저장하세요.');
  }catch(e){
    alert(`Import 실패: ${String(e?.message || e)}`);
  }finally{
    egImport.value = '';
  }
});

egReset.addEventListener('click', async ()=>{
  try{
    if(!confirm('localStorage(searchEngines)를 삭제하고 기본값(config/engines.json)으로 되돌릴까요?')) return;
    localStorage.removeItem(SEARCH_ENGINES_STORAGE_KEY);
    await loadEnginesIntoEditor();
    alert('초기화 완료: 검색 엔진은 기본값(config/engines.json)으로 표시됩니다.');
  }catch(e){
    alert(`초기화 실패: ${String(e?.message || e)}`);
  }
});

// theme (홈과 동일한 localStorage 키 사용) - 편집기에서는 토글 버튼 없이 적용만
if(localStorage.getItem('theme') === 'dark'){
  document.body.classList.add('dark');
}

// init
setEditorTab('top');
setTopMode('tree');
setScMode('list');
setEgMode('list');
loadTopIntoEditor().catch(()=>{});
loadShortcutsIntoEditor();
loadEnginesIntoEditor();
