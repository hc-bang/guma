const TOP_BOOKMARKS_STORAGE_KEY = 'topBookmarks';
const SHORTCUTS_STORAGE_KEY = 'bookmarks';
const SEARCH_ENGINES_STORAGE_KEY = 'searchEngines';
const YT_CHANNELS_STORAGE_KEY = 'guma_yt_channels';

function getProfileStorageKey(baseKey) {
  const curProfile = (window.GumaCore && window.GumaCore.getActiveProfile()) || localStorage.getItem('guma_active_profile') || 'default';
  return (curProfile === 'default') ? baseKey : `${baseKey}_${curProfile}`;
}

function $(sel){
  return document.querySelector(sel);
}

function $all(sel){
  return Array.from(document.querySelectorAll(sel));
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

function validateChannelsData(data){
  if(!data || typeof data !== 'object') throw new Error('유튜브 채널 데이터는 객체 또는 배열이어야 합니다.');
  const list = Array.isArray(data) ? data : data.channels;
  if(!Array.isArray(list)) throw new Error('{ "channels": [...] } 형식이어야 합니다.');
  list.forEach((it, idx)=>{
    if(!it || typeof it !== 'object') throw new Error(`channels[${idx}]는 객체여야 합니다.`);
    const name = String(it.name || '').trim();
    const url = String(it.url || '').trim();
    if(!name) throw new Error(`channels[${idx}].name 이 비어있습니다.`);
    if(!url) throw new Error(`channels[${idx}].url 이 비어있습니다.`);
  });
}

function getTopFromLocalStorage(){
  try{
    const raw = localStorage.getItem(getProfileStorageKey(TOP_BOOKMARKS_STORAGE_KEY));
    if(!raw) return null;
    const data = JSON.parse(raw);
    validateTopData(data);
    return data;
  }catch(e){
    return null;
  }
}

async function getTopDefaultFromFile(){
  return { top: [] };
}

function getShortcutsFromLocalStorage(){
  try{
    const raw = localStorage.getItem(getProfileStorageKey(SHORTCUTS_STORAGE_KEY));
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if(!Array.isArray(arr)) return null; 
    return arr;
  }catch(e){
    return null;
  }
}

async function getShortcutsDefaultFromFile(){
  return [];
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
  return { engines: {} };
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
  let data = null;
  if (window.GumaCore && window.GumaCore.fetchProfileConfig) {
    try {
      const dbData = await window.GumaCore.fetchProfileConfig('topBookmarks');
      if (dbData && (Array.isArray(dbData.top) || Array.isArray(dbData))) {
        data = Array.isArray(dbData.top) ? dbData : { top: dbData };
      }
    } catch {}
  }
  if (!data) {
    data = await getTopDefaultFromFile();
  }
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

topApply.addEventListener('click', async ()=>{
  try{
    const data = JSON.parse(topJson.value || 'null');
    validateTopData(data);
    topData = data;
    if (window.GumaCore && window.GumaCore.saveProfileConfig) {
      await window.GumaCore.saveProfileConfig('topBookmarks', data);
    }
    alert('상단 고정(Top) 저장 완료: 클라우드 DB에 즉시 반영되었습니다.');
  }catch(e){
    alert(`적용 실패: ${String(e?.message || e)}`);
  }
});

// --- Shortcuts ---
const scJson = $('#scJson');
const scJsonLabel = $('#scJsonLabel');
const scList = $('#scList');
const scLoad = $('#scLoad');
const scApply = $('#scApply');
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
  let arr = null;
  if (window.GumaCore && window.GumaCore.fetchProfileConfig) {
    try {
      const dbData = await window.GumaCore.fetchProfileConfig('bookmarks');
      if (dbData) {
        arr = Array.isArray(dbData.shortcuts) ? dbData.shortcuts : (Array.isArray(dbData) ? dbData : []);
      }
    } catch {}
  }
  if (!arr) {
    arr = await getShortcutsDefaultFromFile().catch(() => []);
  }
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

scApply.addEventListener('click', async ()=>{
  try{
    const obj = JSON.parse(scJson.value || 'null');
    const arr = fileFormatToShortcuts(obj);
    const normalized = normalizeShortcutsInPlace(arr);

    validateShortcutsArray(normalized);

    scData = normalized;
    syncShortcutsJsonFromData();
    renderShortcutsList();

    if (window.GumaCore && window.GumaCore.saveProfileConfig) {
      await window.GumaCore.saveProfileConfig('bookmarks', { shortcuts: normalized });
    }
    alert('하단 바로가기 저장 완료: 클라우드 DB에 즉시 반영되었습니다.');
  }catch(e){
    alert(`적용 실패: ${String(e?.message || e)}`);
  }
});

// --- Engines ---
const egJson = $('#egJson');
const egJsonLabel = $('#egJsonLabel');
const egList = $('#egList');
const egLoad = $('#egLoad');
const egApply = $('#egApply');

let egData = { engines: {} };

function syncEnginesJsonFromData(){
  egJson.value = JSON.stringify(egData, null, 2);
}

function syncEnginesDataFromJson(){
  const data = JSON.parse(egJson.value || 'null');
  validateEnginesData(data);
  egData = data;
}

function extractDomainFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function renderEngineRow(key){
  const item = egData.engines[key];
  const node = document.createElement('div');
  node.className = 'node';

  const header = document.createElement('div');
  header.className = 'node-header';

  const badge = document.createElement('span');
  badge.className = 'node-badge';
  badge.textContent = 'ENGINE';

  const labelField = document.createElement('div');
  labelField.className = 'field';
  const labelInput = document.createElement('input');
  labelInput.placeholder = '표시 명칭 (예: 네이버)';
  labelInput.value = item.label || '';
  labelInput.oninput = ()=>{
    item.label = labelInput.value;
    syncEnginesJsonFromData();
  };
  labelField.appendChild(labelInput);

  const urlField = document.createElement('div');
  urlField.className = 'field';
  const urlInput = document.createElement('input');
  urlInput.placeholder = '검색 주소 (예: https://search.naver.com/search.naver?query=)';
  urlInput.style.minWidth = '340px';
  urlInput.value = item.urlPattern || '';
  urlInput.oninput = ()=>{
    item.urlPattern = urlInput.value;
    const extracted = extractDomainFromUrl(urlInput.value);
    if (extracted) {
      item.domain = extracted;
    }
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
  header.appendChild(labelField);
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
  let data = null;
  if (window.GumaCore && window.GumaCore.fetchProfileConfig) {
    try {
      const dbData = await window.GumaCore.fetchProfileConfig('engines');
      if (dbData && dbData.engines) {
        data = dbData;
      }
    } catch {}
  }
  if (!data) {
    data = getEnginesFromLocalStorage() || (await getEnginesDefaultFromFile());
  }
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

egApply.addEventListener('click', async ()=>{
  try{
    const data = JSON.parse(egJson.value || 'null');
    validateEnginesData(data);
    egData = data;
    if (window.GumaCore && window.GumaCore.saveProfileConfig) {
      await window.GumaCore.saveProfileConfig('engines', data);
    }
    localStorage.setItem(SEARCH_ENGINES_STORAGE_KEY, JSON.stringify(data));
    alert('검색 엔진 저장 완료: 클라우드 DB에 즉시 반영되었습니다.');
  }catch(e){
    alert(`적용 실패: ${String(e?.message || e)}`);
  }
});

// --- YouTube Channels ---
const ytJson = $('#ytJson');
const ytJsonLabel = $('#ytJsonLabel');
const ytList = $('#ytList');
const ytLoad = $('#ytLoad');
const ytApply = $('#ytApply');
let ytData = [];

function channelsToFileFormat(arr){
  return {
    channels: (arr || []).map(c => ({
      name: String(c.name || '').trim(),
      url: c.url || ''
    }))
  };
}

function fileFormatToChannels(obj){
  if(!obj || typeof obj !== 'object') throw new Error('youtube channels 파일은 객체여야 합니다.');
  if(Array.isArray(obj)) return obj;
  if(!Array.isArray(obj.channels)) throw new Error('{ "channels": [...] } 형식이어야 합니다.');
  return obj.channels;
}

function normalizeChannelUrl(url){
  let u = String(url || '').trim();
  if(!u) return '';
  // 풀 URL이 입력되더라도 @핸들만 깔끔하게 추출 (예: https://www.youtube.com/@보다BODA/videos -> @보다BODA)
  if(u.includes('@')){
    const match = u.match(/(@[^\/?&#\s]+)/);
    if(match) return match[1];
  }
  // @ 없이 영문/숫자 핸들만 입력된 경우 @ 부착 (단, http 링크가 아닌 경우)
  if(!/^https?:\/\//i.test(u) && !u.startsWith('@')){
    return '@' + u;
  }
  return u;
}

function getChannelsFromLocalStorage(){
  try{
    const raw = localStorage.getItem(getProfileStorageKey(YT_CHANNELS_STORAGE_KEY));
    if(!raw) return null;
    const list = JSON.parse(raw);
    if(!Array.isArray(list) || list.length === 0) return null;
    const cleaned = list.map(it => ({
      name: String(it.name || '').trim(),
      url: String(it.url || '').trim()
    })).filter(it => it.name && it.url);
    return cleaned.length > 0 ? cleaned : null;
  }catch(e){
    return null;
  }
}

async function getChannelsDefaultFromFile(){
  try{
    const res = await fetch('./youtube-channels.json', { cache: 'no-store' });
    if(!res.ok) return [];
    const data = await res.json();
    validateChannelsData(data);
    return data.channels || [];
  }catch(e){
    return [];
  }
}

function syncChannelsJsonFromData(){
  if(ytJson) ytJson.value = JSON.stringify(channelsToFileFormat(ytData), null, 2);
}

function syncChannelsDataFromJson(){
  const obj = JSON.parse(ytJson?.value || 'null');
  const arr = fileFormatToChannels(obj);
  ytData = arr;
}

function renderChannelRow(item, index){
  const node = document.createElement('div');
  node.className = 'node';

  const header = document.createElement('div');
  header.className = 'node-header';

  const badge = document.createElement('span');
  badge.className = 'node-badge';
  badge.textContent = 'CHANNEL';

  const nameField = document.createElement('div');
  nameField.className = 'field';
  const nameInput = document.createElement('input');
  nameInput.placeholder = '채널 이름 (예: PBA TV)';
  nameInput.value = item?.name || '';
  nameInput.oninput = ()=>{
    item.name = nameInput.value;
    syncChannelsJsonFromData();
  };
  nameField.appendChild(nameInput);

  const urlField = document.createElement('div');
  urlField.className = 'field';
  const urlInput = document.createElement('input');
  urlInput.placeholder = '@핸들 (예: @보다BODA)';
  urlInput.value = item?.url || '';
  urlInput.oninput = ()=>{
    item.url = urlInput.value;
    syncChannelsJsonFromData();
  };
  urlField.appendChild(urlInput);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'mini danger';
  delBtn.textContent = '삭제';
  delBtn.onclick = ()=>{
    ytData.splice(index, 1);
    syncChannelsJsonFromData();
    renderChannelsList();
  };

  header.appendChild(badge);
  header.appendChild(nameField);
  header.appendChild(urlField);
  header.appendChild(delBtn);

  node.appendChild(header);
  return node;
}

function renderChannelsList(){
  if(!ytList) return;
  ytList.innerHTML = '';

  const top = document.createElement('div');
  top.className = 'node';

  const header = document.createElement('div');
  header.className = 'node-header';

  const badge = document.createElement('span');
  badge.className = 'node-badge';
  badge.textContent = `CHANNELS (${ytData.length})`;

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'mini';
  addBtn.textContent = '채널 추가';
  addBtn.onclick = ()=>{
    ytData.push({
      name: '새 채널',
      url: '@'
    });
    syncChannelsJsonFromData();
    renderChannelsList();
  };

  header.appendChild(badge);
  header.appendChild(addBtn);
  top.appendChild(header);

  const children = document.createElement('div');
  children.className = 'node-children';

  ytData.forEach((it, idx)=>{
    children.appendChild(renderChannelRow(it, idx));
  });

  top.appendChild(children);
  ytList.appendChild(top);
}

function setYtMode(mode){
  if(mode === 'json'){
    ytList?.classList.add('hidden');
    ytJson?.classList.remove('hidden');
    ytJsonLabel?.classList.remove('hidden');
    syncChannelsJsonFromData();
  }else{
    ytList?.classList.remove('hidden');
    ytJson?.classList.add('hidden');
    ytJsonLabel?.classList.add('hidden');
    try{
      if(ytJson?.value.trim()){
        syncChannelsDataFromJson();
      }
    }catch(e){
      alert(`JSON 파싱 실패: ${String(e?.message || e)}`);
      setMode('ytMode', 'json');
      setYtMode('json');
      return;
    }
    renderChannelsList();
  }
}

$all('input[name="ytMode"]').forEach((r)=>{
  r.addEventListener('change', ()=>{
    setYtMode(r.value);
  });
});

async function loadChannelsIntoEditor(){
  try{
    let data = null;
    if (window.GumaCore && window.GumaCore.fetchProfileConfig) {
      const dbData = await window.GumaCore.fetchProfileConfig('youtube_channels');
      if (dbData) {
        data = dbData.channels || (Array.isArray(dbData) ? dbData : []);
      }
    }
    if(!data || data.length === 0){
      data = await getChannelsDefaultFromFile();
    }
    ytData = (data && data.length > 0) ? data : [];
  }catch(e){
    ytData = [];
  }
  syncChannelsJsonFromData();
  renderChannelsList();
}

ytLoad?.addEventListener('click', async ()=>{
  try{
    await loadChannelsIntoEditor();
  }catch(e){
    alert(String(e?.message || e));
  }
});

ytApply?.addEventListener('click', async ()=>{
  try{
    const obj = JSON.parse(ytJson?.value || 'null');
    const arr = fileFormatToChannels(obj);
    const cleaned = arr.map(c => ({
      name: String(c.name || '').trim(),
      url: normalizeChannelUrl(c.url)
    })).filter(c => c.name && c.url);
    validateChannelsData({ channels: cleaned });
    ytData = cleaned;
    if (window.GumaCore && window.GumaCore.saveProfileConfig) {
      await window.GumaCore.saveProfileConfig('youtube_channels', { channels: cleaned });
    }
    syncChannelsJsonFromData();
    renderChannelsList();
    alert('유튜브 채널 저장 완료: 클라우드 DB에 즉시 반영되었습니다.');
  }catch(e){
    alert(`적용 실패: ${String(e?.message || e)}`);
  }
});

// theme (홈과 동일한 localStorage 키 사용) - 편집기에서는 토글 버튼 없이 적용만
if(localStorage.getItem('theme') === 'dark'){
  document.body.classList.add('dark');
}

// URL 쿼리 파라미터로 초기 탭 지정 지원 (?tab=youtube 등)
const urlParams = new URLSearchParams(window.location.search);
const initialTab = urlParams.get('tab') || 'top';

// init
setEditorTab(initialTab);
setTopMode('tree');
setScMode('list');
setEgMode('list');
setYtMode('list');

// 탭 바 좌측 기기(프로필) 선택 드롭다운 초기화
async function initProfileTabSelector() {
  const sel = $('#configProfileSelect');
  if (!sel) return;

  let profiles = [];
  if (window.GumaCore && window.GumaCore.loadProfiles) {
    profiles = await window.GumaCore.loadProfiles();
  } else {
    profiles = [
      { id: 'default', name: '기본 (PC)', icon: '🖥️' },
      { id: 'mobile',  name: '모바일',    icon: '📱' }
    ];
  }

  const curProfileId = (window.GumaCore && window.GumaCore.getActiveProfile()) || localStorage.getItem('guma_active_profile') || 'default';
  sel.innerHTML = '';
  profiles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.icon || '🏷️'} ${p.name}`;
    if (p.id === curProfileId) opt.selected = true;
    sel.appendChild(opt);
  });

  sel.addEventListener('change', () => {
    const nextId = sel.value;
    if (window.GumaCore) window.GumaCore.setActiveProfile(nextId);
    else localStorage.setItem('guma_active_profile', nextId);
    const activeTab = document.querySelector('.tab.active')?.getAttribute('data-tab') || 'top';
    window.location.href = `?tab=${activeTab}`;
  });
}

async function initConfigPage() {
  if (window.GumaCore && window.GumaCore.discoverActiveTunnel) {
    try { await window.GumaCore.discoverActiveTunnel(); } catch {}
  }
  initProfileTabSelector();
  loadTopIntoEditor().catch(()=>{});
  loadShortcutsIntoEditor();
  loadEnginesIntoEditor();
  loadChannelsIntoEditor();

  const initialTab = new URLSearchParams(window.location.search).get('tab');
  if(initialTab) setEditorTab(initialTab);
}
initConfigPage();

