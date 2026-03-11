'use strict';

/**
 * GUMA 공통 트리 메뉴 유틸리티 (window.GTree)
 * posts / tools / resources 서브페이지에서 공유합니다.
 */
window.GTree = (() => {

  /* ── SVG 아이콘 상수 ────────────────────────────────── */
  const SVG = {
    arrowClosed: '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="8,5 18,12 8,19"/></svg>',
    arrowOpen:   '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5,8 19,8 12,18"/></svg>',
    folderClosed: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    folderOpen:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="2,10 12,10 22,10"/></svg>',
    file:         '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13,2 13,9 20,9"/></svg>',
  };

  /* ── 데이터 빌더: posts / tools 용 ─────────────────── */

  /**
   * 파일 경로에서 정규화된 leaf 키를 추출한다.
   * - index.html / index 로 끝나는 경우: 상위 폴더명 사용
   * - 그 외: 확장자(.html) 제거 후 반환
   */
  function computeLeafKeyFromFilePath(filePath) {
    const parts = String(filePath || '').split('/').filter(Boolean);
    if (parts.length === 0) return '';
    let last = parts[parts.length - 1];
    if (/^index(\.html)?$/i.test(last) && parts.length >= 2) {
      last = parts[parts.length - 2];
    }
    return String(last).replace(/\.html$/i, '');
  }

  /**
   * entries 배열 { file, display, group } 을 받아 트리 노드 맵을 반환한다.
   * group의 '/' 구분자로 중첩 노드를 생성하며, 파일은 group 하위 leaf로 배치한다.
   */
  function buildTreeFromEntries(entries) {
    const root = {};

    function ensureNode(parent, key) {
      if (!parent[key]) parent[key] = { __children: {}, __isFile: false, __meta: null };
      return parent[key];
    }

    entries.forEach(entry => {
      const groupParts = String(entry.group || '기타').split('/').filter(Boolean);
      if (groupParts.length === 0) groupParts.push('기타');

      // group 계층 탐색 / 생성
      let parent = root;
      groupParts.forEach(gp => {
        parent = ensureNode(parent, gp).__children;
      });

      // 파일 leaf 키 계산 후 노드 배치
      const leafKey = computeLeafKeyFromFilePath(String(entry.file || ''));
      if (!parent[leafKey]) parent[leafKey] = { __children: {}, __isFile: false, __meta: null };
      parent[leafKey].__isFile = true;
      parent[leafKey].__meta = { file: entry.file, display: entry.display, group: entry.group };
    });

    return root;
  }

  /* ── 데이터 빌더: resources 용 ──────────────────────── */

  /**
   * files 배열 { group, file, ... } 에서 group 계층을 추출해 트리를 빌드한다.
   * leaf 노드는 클릭 시 파일 카드를 표시할 그룹 항목이다.
   */
  function buildGroupTree(files) {
    const groups = new Set();
    files.forEach(f => { if (f.group) groups.add(f.group); });

    const root = {};
    groups.forEach(groupRaw => {
      const parts = groupRaw.split('/').filter(Boolean);
      let parent = root;
      parts.forEach((p, idx) => {
        if (!parent[p]) parent[p] = { __children: {}, __isGroup: false, __isFile: false, __fullPath: '' };
        if (idx === parts.length - 1) {
          parent[p].__isGroup = true;
          parent[p].__isFile = true; // GTree.renderTree의 isLeaf 감지를 위해 필요
          parent[p].__fullPath = groupRaw;
        }
        parent = parent[p].__children;
      });
    });
    return root;
  }

  /* ── DOM 빌더 헬퍼 ──────────────────────────────────── */

  /**
   * 폴더 버튼 행을 생성한다.
   * @returns {{ btn, arrow, icon }} 각 요소 참조 반환
   */
  function createFolderBtn(label) {
    const btn = document.createElement('button');
    btn.className = 'tree-folder';
    btn.type = 'button';
    btn.title = label;

    const arrow = document.createElement('span');
    arrow.className = 'tree-arrow';
    arrow.innerHTML = SVG.arrowClosed;
    arrow.setAttribute('aria-hidden', 'true');

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.innerHTML = SVG.folderClosed;
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'tree-label';
    text.textContent = label;

    btn.appendChild(arrow);
    btn.appendChild(icon);
    btn.appendChild(text);

    return { btn, arrow, icon };
  }

  /**
   * 자식 ul이 토글될 때 arrow / icon 아이콘을 전환하는 클릭 핸들러를 등록한다.
   * @param {HTMLButtonElement} btn
   * @param {HTMLSpanElement} arrow
   * @param {HTMLSpanElement} icon
   * @param {HTMLUListElement} childUl
   * @param {Function} [onOpen] - 펼칠 때 추가 동작 (선택)
   */
  function bindFolderToggle(btn, arrow, icon, childUl, onOpen) {
    btn.onclick = () => {
      const collapsed = childUl.classList.toggle('tree-collapsed');
      arrow.innerHTML = collapsed ? SVG.arrowClosed : SVG.arrowOpen;
      icon.innerHTML  = collapsed ? SVG.folderClosed : SVG.folderOpen;
      if (!collapsed && typeof onOpen === 'function') onOpen();
    };
  }

  /**
   * 파일(또는 그룹 리프) 링크 행 기본 구조를 생성하고 반환한다.
   * icon 과 label 은 기본으로 추가되며, 데이터셋/href는 호출자가 설정한다.
   */
  function createFileLink(label) {
    const a = document.createElement('a');
    a.className = 'tree-file';
    a.title = label;

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.innerHTML = SVG.file;
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'tree-label';
    text.textContent = label;

    a.appendChild(icon);
    a.appendChild(text);
    return a;
  }

  /* ── 활성 항목 부모 폴더 자동 펼치기 ───────────────── */

  /**
   * container 내에서 matchFn(el)이 true인 요소를 찾아
   * 해당 요소의 모든 상위 .tree-ul을 펼치고 arrow/icon을 갱신한다.
   * @param {Element} container
   * @param {Function} matchFn - (anchorOrBtn) => boolean
   */
  function expandToActive(container, matchFn) {
    container.querySelectorAll('a.tree-file').forEach(a => {
      if (!matchFn(a)) return;
      let parent = a.closest('li.tree-li')?.parentElement;
      while (parent && parent.classList.contains('tree-ul')) {
        if (parent.classList.contains('tree-collapsed')) {
          parent.classList.remove('tree-collapsed');
          const btn = parent.previousElementSibling;
          if (btn) {
            const arr = btn.querySelector('.tree-arrow');
            const ico = btn.querySelector('.tree-icon');
            if (arr) arr.innerHTML = SVG.arrowOpen;
            if (ico) ico.innerHTML = SVG.folderOpen;
          }
        }
        parent = parent.closest('li.tree-li')?.parentElement;
      }
    });
  }

  /* ── 범용 트리 렌더러 ─────────────────────────────── */

  /**
   * 트리 노드 맵을 받아 ul 엘리먼트로 렌더링한다.
   *
   * @param {Object} node - 트리 노드 맵
   * @param {Object} opts
   * @param {string}   opts.parentPath   - 현재 경로 접두사 (재귀 시 전달)
   * @param {Function} opts.onLeaf       - (key, item, parentPath) => HTMLElement (li의 자식)
   *   leaf 노드가 감지될 때 호출. 반환된 엘리먼트가 li에 추가된다.
   * @param {Function} [opts.onFolderOpen] - (key, item) => void (폴더 열릴 때 추가 동작, 선택)
   */
  function renderTree(node, opts) {
    const { parentPath = '', onLeaf, onFolderOpen } = opts;
    const ul = document.createElement('ul');
    ul.className = 'tree-ul';

    Object.keys(node).forEach(key => {
      const item = node[key];
      const li = document.createElement('li');
      li.className = 'tree-li';

      const isLeaf = item.__isFile && Object.keys(item.__children).length === 0;

      if (isLeaf) {
        // 호출자가 leaf 엘리먼트를 반환
        const leafEl = onLeaf(key, item, parentPath);
        if (leafEl) li.appendChild(leafEl);
      } else {
        const { btn, arrow, icon } = createFolderBtn(key);

        const childUl = renderTree(item.__children, { ...opts, parentPath: parentPath + key + '/' });
        childUl.classList.add('tree-collapsed');

        bindFolderToggle(btn, arrow, icon, childUl, () => {
          if (typeof onFolderOpen === 'function') onFolderOpen(key, item);
        });

        li.appendChild(btn);
        li.appendChild(childUl);
      }

      ul.appendChild(li);
    });

    return ul;
  }

  /* ── 공개 API ────────────────────────────────────── */
  return {
    SVG,
    computeLeafKeyFromFilePath,
    buildTreeFromEntries,
    buildGroupTree,
    createFolderBtn,
    createFileLink,
    bindFolderToggle,
    expandToActive,
    renderTree,
  };

})();
