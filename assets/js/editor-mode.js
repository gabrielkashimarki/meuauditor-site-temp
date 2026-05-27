(function(){
  'use strict';

  var EDITOR_PASSWORD = 'meuauditor2026';
  var DEFAULT_GITHUB_CONFIG = {
    owner: 'gabrielkashimarki',
    repo: 'meuauditor-site-temp',
    branch: 'main'
  };
  var storageKey = 'meuauditor-editor:' + window.location.pathname;
  var configKey = 'meuauditor-github-config';
  var authKey = 'meuauditor-editor-auth';
  var editableSelector = [
    'header a',
    'main h1',
    'main h2',
    'main h3',
    'main h4',
    'main p',
    'main a',
    'main button',
    'main summary',
    'main span',
    'main strong',
    'main li',
    'footer h4',
    'footer p',
    'footer a',
    'footer li'
  ].join(',');

  var isEditing = false;
  var panel;
  var status;
  var setupMode = new URLSearchParams(window.location.search).get('setup') === '1';

  function getEditableElements(){
    return Array.prototype.slice.call(document.querySelectorAll(editableSelector)).filter(function(el){
      if (el.closest('[data-editor-ui]')) return false;
      if (el.closest('script,style,svg')) return false;
      if (!el.textContent || !el.textContent.trim()) return false;
      if (el.children.length && el.querySelector('svg,img,input,textarea,select')) return false;
      return true;
    });
  }

  function assignKeys(){
    getEditableElements().forEach(function(el, index){
      if (!el.dataset.editorKey) {
        el.dataset.editorKey = 'text-' + index;
      }
    });
  }

  function setStatus(message){
    if (!status) return;
    status.textContent = message;
    window.clearTimeout(setStatus.timer);
    setStatus.timer = window.setTimeout(function(){
      status.textContent = '';
    }, 4200);
  }

  function loadSavedContent(){
    var raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      var saved = JSON.parse(raw);
      assignKeys();
      getEditableElements().forEach(function(el){
        var key = el.dataset.editorKey;
        if (Object.prototype.hasOwnProperty.call(saved, key)) {
          el.textContent = saved[key];
        }
      });
    } catch (error) {
      window.localStorage.removeItem(storageKey);
    }
  }

  function saveContent(){
    assignKeys();
    var data = {};
    getEditableElements().forEach(function(el){
      data[el.dataset.editorKey] = el.textContent.trim();
    });
    window.localStorage.setItem(storageKey, JSON.stringify(data));
    setStatus('Alterações salvas neste navegador.');
  }

  function toggleEditor(){
    isEditing = !isEditing;
    assignKeys();
    getEditableElements().forEach(function(el){
      el.contentEditable = String(isEditing);
      el.spellcheck = true;
      el.classList.toggle('editor-active-text', isEditing);
    });
    document.body.classList.toggle('editor-mode-on', isEditing);
    panel.querySelector('[data-editor-toggle]').textContent = isEditing ? 'Sair do editor' : 'Editor';
    setStatus(isEditing ? 'Clique nos textos para editar.' : 'Modo editor desligado.');
  }

  function clearSavedContent(){
    if (!window.confirm('Remover as alterações salvas neste navegador e recarregar a página?')) return;
    window.localStorage.removeItem(storageKey);
    window.location.reload();
  }

  function getCleanHtml(){
    var clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('[data-editor-ui]').forEach(function(el){ el.remove(); });
    clone.querySelectorAll('[contenteditable]').forEach(function(el){
      el.removeAttribute('contenteditable');
      el.removeAttribute('spellcheck');
      el.classList.remove('editor-active-text');
    });
    clone.querySelectorAll('[data-editor-key]').forEach(function(el){
      el.removeAttribute('data-editor-key');
    });
    clone.querySelectorAll('style[data-editor-style]').forEach(function(el){ el.remove(); });
    return '<!doctype html>\n' + clone.outerHTML;
  }

  function exportHtml(){
    saveContent();
    var html = getCleanHtml();
    var blob = new Blob([html], { type:'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    var current = window.location.pathname.split('/').pop() || 'index.html';
    link.href = url;
    link.download = current.replace('.html','') + '-editado.html';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus('HTML exportado.');
  }

  function loadConfig(){
    try {
      return Object.assign({}, DEFAULT_GITHUB_CONFIG, JSON.parse(window.localStorage.getItem(configKey) || '{}'));
    } catch (error) {
      return Object.assign({}, DEFAULT_GITHUB_CONFIG);
    }
  }

  function saveConfig(config){
    window.localStorage.setItem(configKey, JSON.stringify(config));
  }

  function showConfig(){
    var current = loadConfig();
    var owner = window.prompt('Owner do GitHub. Exemplo: f2t-tecnologia', current.owner || '');
    if (owner === null) return null;
    var repo = window.prompt('Nome do repositório. Exemplo: meuauditor-site', current.repo || '');
    if (repo === null) return null;
    var branch = window.prompt('Branch para publicar. Exemplo: main', current.branch || 'main');
    if (branch === null) return null;
    var filePath = window.prompt('Arquivo desta página no repositório.', current.filePath || (window.location.pathname.split('/').pop() || 'index.html'));
    if (filePath === null) return null;
    var token = window.prompt('Token GitHub com permissão de escrita neste repositório.', current.token || '');
    if (token === null) return null;

    var config = {
      owner: owner.trim(),
      repo: repo.trim(),
      branch: (branch.trim() || 'main'),
      filePath: filePath.trim(),
      token: token.trim()
    };
    saveConfig(config);
    setStatus('Configuração do GitHub salva neste navegador.');
    return config;
  }

  function getConfigOrPrompt(){
    var config = loadConfig();
    if (!config.owner || !config.repo || !config.branch || !config.filePath || !config.token) {
      setStatus('Configuração inicial pendente. Abra esta página com ?setup=1 para configurar uma vez.');
      return null;
    }
    return config;
  }

  function toBase64Utf8(text){
    var bytes = new TextEncoder().encode(text);
    var binary = '';
    bytes.forEach(function(byte){ binary += String.fromCharCode(byte); });
    return window.btoa(binary);
  }

  function githubRequest(url, options){
    options = options || {};
    options.headers = options.headers || {};
    options.headers.Accept = 'application/vnd.github+json';
    options.headers['X-GitHub-Api-Version'] = '2022-11-28';
    return window.fetch(url, options).then(function(response){
      return response.text().then(function(text){
        var data = text ? JSON.parse(text) : {};
        if (!response.ok) {
          var message = data.message || 'Erro na API do GitHub.';
          throw new Error(message);
        }
        return data;
      });
    });
  }

  function saveToGithub(){
    saveContent();
    var config = getConfigOrPrompt();
    if (!config) return;

    var encodedPath = config.filePath.split('/').map(encodeURIComponent).join('/');
    var baseUrl = 'https://api.github.com/repos/' + encodeURIComponent(config.owner) + '/' + encodeURIComponent(config.repo) + '/contents/' + encodedPath;
    var headers = { Authorization: 'Bearer ' + config.token };
    var url = baseUrl + '?ref=' + encodeURIComponent(config.branch);

    setStatus('Buscando arquivo no GitHub...');
    githubRequest(url, { headers: headers }).then(function(file){
      setStatus('Enviando commit...');
      return githubRequest(baseUrl, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type':'application/json' }, headers),
        body: JSON.stringify({
          message: 'Atualiza textos do site pelo editor visual',
          content: toBase64Utf8(getCleanHtml()),
          sha: file.sha,
          branch: config.branch
        })
      });
    }).then(function(result){
      var commitUrl = result.commit && result.commit.html_url ? result.commit.html_url : '';
      setStatus(commitUrl ? 'Salvo no GitHub: ' + commitUrl : 'Salvo no GitHub.');
    }).catch(function(error){
      setStatus('Erro ao salvar no GitHub: ' + error.message);
    });
  }

  function unlockEditor(){
    if (window.sessionStorage.getItem(authKey) === 'ok') return true;
    var password = window.prompt('Senha do editor');
    if (password === EDITOR_PASSWORD) {
      window.sessionStorage.setItem(authKey, 'ok');
      return true;
    }
    if (password !== null) window.alert('Senha incorreta.');
    return false;
  }

  function buildPanel(){
    var style = document.createElement('style');
    style.dataset.editorStyle = 'true';
    style.textContent = [
      '.editor-panel{position:fixed;right:18px;bottom:18px;z-index:9999;display:flex;flex-wrap:wrap;gap:8px;align-items:center;max-width:min(520px,calc(100vw - 36px));padding:10px;border:1px solid rgba(18,50,74,.14);border-radius:14px;background:rgba(255,255,255,.94);box-shadow:0 18px 60px rgba(18,50,74,.18);backdrop-filter:blur(14px);font-family:system-ui,sans-serif}',
      '.editor-panel button{border:0;border-radius:10px;padding:9px 12px;background:#12324A;color:#fff;font-size:13px;font-weight:700;cursor:pointer}',
      '.editor-panel button.secondary{background:#EEF4F7;color:#12324A}',
      '.editor-panel button.success{background:#19B5E8;color:#12324A}',
      '.editor-panel button.danger{background:#FDECEC;color:#9D1C1C}',
      '.editor-status{min-width:100%;font-size:12px;color:#4F5963;min-height:16px;line-height:1.35;word-break:break-word}',
      '.editor-mode-on .editor-active-text{outline:1px dashed rgba(25,181,232,.8);outline-offset:3px;border-radius:4px;cursor:text}',
      '.editor-mode-on .editor-active-text:focus{outline:2px solid #19B5E8;background:rgba(25,181,232,.08)}'
    ].join('');
    document.head.appendChild(style);

    panel = document.createElement('div');
    panel.className = 'editor-panel';
    panel.dataset.editorUi = 'true';
    panel.innerHTML = [
      '<button type="button" data-editor-toggle>Editor</button>',
      '<button type="button" class="secondary" data-editor-save>Salvar local</button>',
      '<button type="button" class="success" data-editor-github>Salvar no GitHub</button>',
      setupMode ? '<button type="button" class="secondary" data-editor-config>Configurar GitHub</button>' : '',
      '<button type="button" class="secondary" data-editor-export>Exportar HTML</button>',
      '<button type="button" class="danger" data-editor-clear>Limpar</button>',
      '<span class="editor-status" data-editor-status></span>'
    ].join('');
    document.body.appendChild(panel);
    status = panel.querySelector('[data-editor-status]');

    panel.querySelector('[data-editor-toggle]').addEventListener('click', function(){
      if (unlockEditor()) toggleEditor();
    });
    panel.querySelector('[data-editor-save]').addEventListener('click', function(){
      if (unlockEditor()) saveContent();
    });
    panel.querySelector('[data-editor-github]').addEventListener('click', function(){
      if (unlockEditor()) saveToGithub();
    });
    var configButton = panel.querySelector('[data-editor-config]');
    if (configButton) {
      configButton.addEventListener('click', function(){
        if (unlockEditor()) showConfig();
      });
    }
    panel.querySelector('[data-editor-export]').addEventListener('click', function(){
      if (unlockEditor()) exportHtml();
    });
    panel.querySelector('[data-editor-clear]').addEventListener('click', function(){
      if (unlockEditor()) clearSavedContent();
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    loadSavedContent();
    buildPanel();
  });
})();
