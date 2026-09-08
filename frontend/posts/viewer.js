(() => {
  const container = document.getElementById('md');
  const titleEl = document.getElementById('docTitle');

  // HTML 이스케이프(안전)
  function escapeHtml(s){
    return String(s)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#039;');
  }

  function getFileParam(){
    const params = new URLSearchParams(location.search);
    return params.get('file') || '';
  }

  function isSafeMdFilename(file){
    // posts/ 아래의 md만 허용. 디렉터리 이동(../) 방지.
    // 허용: 영문/숫자/한글/공백/._- , 끝은 .md
    if(!file) return false;
    if(file.includes('..')) return false;
    if(file.includes('/') || file.includes('\\')) return false;
    if(!file.toLowerCase().endsWith('.md')) return false;
    return /^[0-9A-Za-z가-힣 _.\-]+\.md$/u.test(file);
  }

  function setTitle(file){
    const base = file.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim() || '문서 보기';
    document.title = base;
    if(titleEl) titleEl.textContent = base;
  }

  function setupMarked(){
    if(!window.marked) return;

    marked.setOptions({
      gfm: true,
      breaks: false,
      headerIds: true,
      mangle: false,
      highlight(code, lang){
        try{
          if(window.hljs){
            if(lang && hljs.getLanguage(lang)){
              return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
          }
        }catch(e){
          // ignore
        }
        return escapeHtml(code);
      }
    });
  }

  async function loadMd(file){
    setTitle(file);

    const res = await fetch(`./${encodeURIComponent(file)}`, { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    if(!window.marked){
      // fallback: 그냥 pre로 보여주기
      container.innerHTML = `<pre>${escapeHtml(text)}</pre>`;
      return;
    }

    setupMarked();
    container.innerHTML = marked.parse(text);

    // 코드 하이라이트(라이브러리가 highlight 옵션을 무시하는 경우 대비)
    try{
      if(window.hljs){
        container.querySelectorAll('pre code').forEach((block) => {
          hljs.highlightElement(block);
        });
      }
    }catch(e){
      // ignore
    }

    // 외부 링크는 새 탭
    container.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if(/^https?:\/\//i.test(href)){
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
    });
  }

  async function main(){
    const file = getFileParam();

    if(!container) return;

    if(!isSafeMdFilename(file)){
      container.innerHTML = `
        <h2>문서를 지정하세요</h2>
        <p>예: <code>viewer.html?file=docker-cheatsheet.md</code></p>
        <p><a href="./index.html">← 목록으로</a></p>
      `;
      return;
    }

    try{
      await loadMd(file);
    }catch(e){
      container.innerHTML = `
        <h2>문서를 불러올 수 없습니다</h2>
        <p>파일: <code>${escapeHtml(file)}</code></p>
        <p style="opacity:.75">에러: ${escapeHtml(e?.message || e)}</p>
        <p><a href="./index.html">← 목록으로</a></p>
      `;
    }
  }

  main();
})();