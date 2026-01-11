// ファイルデータを保持
let fileDataList = [];
let selectedTagFilter = null; // 選択されたタグフィルター

// ファイルを処理する共通関数
async function processFiles(files) {
  const fileArray = Array.from(files).filter(file => 
    file.name.endsWith('.md') || file.name.endsWith('.markdown')
  );
  
  if (fileArray.length === 0) return;

  // ファイルリスト表示をクリア（初回のみ）
  const fileList = document.getElementById('fileList');
  // 初期メッセージを削除（初期の追加ボタンエリア内のpタグ）
  const initialAddFileButton = document.getElementById('initialAddFileButton');
  if (initialAddFileButton && fileDataList.length === 0) {
    // 初回のファイル追加時のみ、初期メッセージを削除
    const initialMessage = initialAddFileButton.querySelector('p');
    if (initialMessage) {
      initialMessage.remove();
    }
  }

  // 各ファイルを読み込む
  for (const file of fileArray) {
    try {
      const text = await file.text();
      const title = extractTitle(text, file.name);
      const tag = extractTag(text);
      
      fileDataList.push({
        name: file.name,
        title: title,
        tag: tag,
        content: text
      });

      // ファイルリストに追加
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item flex items-center justify-between p-2 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700';
      fileItem.innerHTML = `
        <span class="text-sm text-neutral-700 dark:text-neutral-300">${file.name}</span>
        <span class="text-xs text-neutral-500 dark:text-neutral-400">${tag || ''}</span>
      `;
      fileList.appendChild(fileItem);
    } catch (error) {
      console.error(`Error reading file ${file.name}:`, error);
    }
  }

  // ファイル登録後のUI切り替え
  updateFileManagementUI();
  
  // タグフィルターを更新
  updateTagFilters();
  
  // プレビューを更新
  updatePreview();
  
  // ダウンロードボタンの状態を更新
  const filteredFiles = getFilteredFiles();
  document.getElementById('downloadBtn').disabled = filteredFiles.length === 0;
}

// ファイル管理UIの更新
function updateFileManagementUI() {
  const initialAddFileButton = document.getElementById('initialAddFileButton');
  const fileManagementButtons = document.getElementById('fileManagementButtons');
  const fileList = document.getElementById('fileList');
  
  if (fileDataList.length > 0) {
    // ファイルが登録されている場合
    initialAddFileButton.style.display = 'none';
    fileManagementButtons.style.display = 'flex';
    // ファイルリストのレイアウトを変更
    fileList.classList.remove('flex', 'flex-col', 'items-center', 'justify-center');
    fileList.classList.add('space-y-2');
  } else {
    // ファイルが登録されていない場合
    initialAddFileButton.style.display = 'flex';
    fileManagementButtons.style.display = 'none';
    // ファイルリストのレイアウトを中央揃えに戻す
    fileList.classList.add('flex', 'flex-col', 'items-center', 'justify-center');
    fileList.classList.remove('space-y-2');
  }
}

// ファイル選択時の処理
document.getElementById('fileInput').addEventListener('change', async (e) => {
  await processFiles(e.target.files);
  e.target.value = ''; // 同じファイルを再度選択できるようにリセット
});

// ファイル追加ボタンの処理（初期表示）
document.getElementById('addFileBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

// ファイル追加ボタンの処理（ファイル追加後）
document.getElementById('addFileBtnAfter').addEventListener('click', () => {
  document.getElementById('addFileInput').click();
});

document.getElementById('addFileInput').addEventListener('change', async (e) => {
  await processFiles(e.target.files);
  e.target.value = ''; // 同じファイルを再度選択できるようにリセット
});

// 全削除ボタンの処理
document.getElementById('clearAllBtn').addEventListener('click', () => {
  fileDataList = [];
  selectedTagFilter = null;
  
  // ファイルリストをクリア
  const fileList = document.getElementById('fileList');
  // ファイルアイテムを削除（初期ボタンエリアは残す）
  const fileItems = fileList.querySelectorAll('.file-item');
  fileItems.forEach(item => item.remove());
  
  // UIを更新
  updateFileManagementUI();
  updateTagFilters();
  updatePreview();
  
  // ダウンロードボタンを無効化
  document.getElementById('downloadBtn').disabled = true;
});

// ドラッグ&ドロップの処理
const fileList = document.getElementById('fileList');

// ドラッグオーバー時の処理
fileList.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  fileList.classList.add('border-neutral-400', 'dark:border-neutral-600', 'bg-neutral-100', 'dark:bg-neutral-800');
  fileList.classList.remove('border-neutral-300', 'dark:border-neutral-700');
});

// ドラッグリーブ時の処理
fileList.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  fileList.classList.remove('border-neutral-400', 'dark:border-neutral-600', 'bg-neutral-100', 'dark:bg-neutral-800');
  fileList.classList.add('border-neutral-300', 'dark:border-neutral-700');
});

// ドロップ時の処理
fileList.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  fileList.classList.remove('border-neutral-400', 'dark:border-neutral-600', 'bg-neutral-100', 'dark:bg-neutral-800');
  fileList.classList.add('border-neutral-300', 'dark:border-neutral-700');
  
  const files = e.dataTransfer.files;
  await processFiles(files);
  
  // ファイルが追加されたら、fileInputの値をリセット（初期状態の場合）
  if (fileDataList.length === files.length) {
    document.getElementById('fileInput').value = '';
  } else {
    document.getElementById('addFileInput').value = '';
  }
});

// タイトルを抽出（frontmatterのtitle、またはファイル名）
function extractTitle(text, fileName) {
  // frontmatterからtitleを抽出
  if (text.startsWith('---')) {
    const secondDash = text.indexOf('---', 3);
    if (secondDash !== -1) {
      const frontmatter = text.substring(3, secondDash);
      const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
      if (titleMatch) {
        let title = titleMatch[1].trim();
        // 引用符を除去
        title = title.replace(/^["']|["']$/g, '');
        if (title) return title;
      }
    }
  }
  
  // ファイル名から拡張子を除去
  return fileName.replace(/\.md$/, '').replace(/\.markdown$/, '');
}

// タグを抽出（#で始まるタグを検出）
function extractTag(text) {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // #で始まる行を検出（#1conclusion, #3memo, #documentなど）
    if (trimmed.startsWith('#')) {
      return trimmed;
    }
  }
  return '';
}

// タグから第一階層のタグを抽出（例: #1conclusion/車/ホンダ → 車、#1conclusion → #1conclusion）
function extractParentTag(tag) {
  if (!tag) return '';
  
  // #1conclusion だけの場合
  if (tag.trim() === '#1conclusion') {
    return '#1conclusion';
  }
  
  // #1conclusion/車/ホンダ のような形式から第一階層の「車」を抽出
  const match = tag.match(/#1conclusion\/([^\/\s]+)/);
  return match ? match[1] : '';
}

// すべての階層タグを取得（例: #1conclusion/キャリア/計画 → #1conclusion, #1conclusion/キャリア, #1conclusion/キャリア/計画）
function getAllParentTags() {
  const allTags = new Set();
  
  fileDataList.forEach(file => {
    const tag = file.tag;
    if (!tag) return;
    
    const trimmedTag = tag.trim();
    
    // #で始まるタグを処理
    if (trimmedTag.startsWith('#')) {
      // タグのルート部分を取得（#1conclusion, #3memo, #documentなど）
      const rootMatch = trimmedTag.match(/^(#[^\/\s]+)/);
      if (rootMatch) {
        const rootTag = rootMatch[1];
        
        // ルートタグ自体を追加
        allTags.add(rootTag);
        
        // 階層がある場合、各階層を追加
        if (trimmedTag.includes('/')) {
          const parts = trimmedTag.split('/');
          let currentPath = rootTag;
          
          // ルートタグの後の各部分を順番に追加
          for (let i = 1; i < parts.length; i++) {
            currentPath += '/' + parts[i];
            allTags.add(currentPath);
          }
        }
      }
    }
  });
  
  return Array.from(allTags).sort();
}

// タグフィルターボタンを更新
function updateTagFilters() {
  const tagFilterSection = document.getElementById('tagFilterSection');
  const tagButtons = document.getElementById('tagButtons');
  
  if (fileDataList.length === 0) {
    tagFilterSection.style.display = 'none';
    return;
  }

  tagFilterSection.style.display = 'block';
  tagButtons.innerHTML = '';

  // 「すべて」ボタン
  const allButton = document.createElement('button');
  allButton.className = `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
    selectedTagFilter === null 
      ? 'bg-purple-500 dark:bg-purple-600 text-white font-semibold ring-2 ring-purple-300 dark:ring-purple-500' 
      : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
  }`;
  allButton.textContent = 'すべて';
  allButton.addEventListener('click', () => {
    selectedTagFilter = null;
    updateTagFilters();
    updatePreview();
  });
  tagButtons.appendChild(allButton);

  // 各親タグのボタン
  const parentTags = getAllParentTags();
  parentTags.forEach(tag => {
    const button = document.createElement('button');
    button.className = `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      selectedTagFilter === tag 
        ? 'bg-purple-500 dark:bg-purple-600 text-white font-semibold ring-2 ring-purple-300 dark:ring-purple-500' 
        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
    }`;
    button.textContent = tag;
    button.addEventListener('click', () => {
      selectedTagFilter = tag;
      updateTagFilters();
      updatePreview();
    });
    tagButtons.appendChild(button);
  });
}

// フィルタリングされたファイルリストを取得
function getFilteredFiles() {
  if (selectedTagFilter === null) {
    return fileDataList;
  }
  return fileDataList.filter(file => {
    const tag = file.tag;
    if (!tag) return false;
    
    const trimmedTag = tag.trim();
    
    // 選択されたタグと完全一致する場合
    if (trimmedTag === selectedTagFilter) {
      return true;
    }
    
    // 選択されたタグが他のタグのプレフィックスである場合も含める
    // 例: #1conclusion が選択された場合、#1conclusion/キャリア なども含める
    // 例: #3memo が選択された場合、#3memo/xxx なども含める
    if (trimmedTag.startsWith(selectedTagFilter + '/')) {
      return true;
    }
    
    return false;
  });
}


// プレビューを更新
function updatePreview() {
  const preview = document.getElementById('preview');
  
  if (fileDataList.length === 0) {
    preview.innerHTML = '';
    return;
  }

  // フィルタリングされたファイルを取得
  const filteredFiles = getFilteredFiles();
  
  // フィルターカウントを更新
  document.getElementById('filteredCount').textContent = filteredFiles.length;
  document.getElementById('totalCount').textContent = fileDataList.length;

  if (filteredFiles.length === 0) {
    preview.innerHTML = '';
    document.getElementById('downloadBtn').disabled = true;
    return;
  }

  // タグでソート
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    const tagA = a.tag || '';
    const tagB = b.tag || '';
    if (tagA !== tagB) {
      return tagA.localeCompare(tagB);
    }
    return a.title.localeCompare(b.title);
  });

  // マークダウンを生成
  let markdown = '';
  for (let i = 0; i < sortedFiles.length; i++) {
    const file = sortedFiles[i];
    
    // タイトル（H1）
    markdown += `# ${file.title}\n\n`;
    
    // 本文を取得（frontmatterを除去）
    let body = file.content;
    if (body.startsWith('---')) {
      const secondDash = body.indexOf('---', 3);
      if (secondDash !== -1) {
        body = body.substring(secondDash + 3).trim();
        // 先頭の改行を除去
        body = body.replace(/^\n+/, '');
      }
    }
    
    // 本文を追加
    markdown += body;
    
    // 最後のファイルでない場合は区切り線とスペースを追加
    if (i < sortedFiles.length - 1) {
      markdown += '\n\n\n\n\n---\n\n\n\n\n';
    }
  }

  // プレビュー表示（マークダウンをそのまま表示）
  preview.innerHTML = `<pre class="whitespace-pre-wrap text-neutral-700 dark:text-neutral-300 font-mono text-sm break-words">${escapeHtml(markdown)}</pre>`;
}

// HTMLエスケープ関数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// マークダウンを簡易的にHTMLに変換してプレビュー
function formatMarkdownPreview(markdown) {
  let html = markdown
    // H1
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-4 text-neutral-900 dark:text-neutral-100 break-words">$1</h1>')
    // H2
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-5 mb-3 text-neutral-800 dark:text-neutral-200 break-words">$1</h2>')
    // H3
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2 text-neutral-700 dark:text-neutral-300 break-words">$1</h3>')
    // リスト
    .replace(/^\- (.+)$/gm, '<li class="ml-4 mb-1 text-neutral-700 dark:text-neutral-300 break-words">$1</li>')
    // 区切り線
    .replace(/^---$/gm, '<hr class="my-6 border-neutral-300 dark:border-neutral-700">')
    // 改行
    .replace(/\n\n/g, '</p><p class="mb-4 text-neutral-700 dark:text-neutral-300 break-words">')
    .replace(/\n/g, '<br>');
  
  // リストをulで囲む
  html = html.replace(/(<li[^>]*>.*?<\/li>(?:\s*<li[^>]*>.*?<\/li>)*)/g, '<ul class="list-disc ml-6 mb-4">$1</ul>');
  
  // 段落が存在しない場合、全体を段落で囲む
  if (!html.includes('<p')) {
    html = '<p class="mb-4 text-neutral-700 dark:text-neutral-300 break-words">' + html + '</p>';
  } else {
    // 最初の要素が段落でない場合、段落で囲む
    if (!html.trim().startsWith('<p')) {
      html = '<p class="mb-4 text-neutral-700 dark:text-neutral-300 break-words">' + html + '</p>';
    }
  }
  
  return '<div class="prose max-w-none dark:prose-invert break-words text-neutral-700 dark:text-neutral-300">' + html + '</div>';
}

// ダウンロード処理
document.getElementById('downloadBtn').addEventListener('click', () => {
  if (fileDataList.length === 0) return;

  // フィルタリングされたファイルを取得
  const filteredFiles = getFilteredFiles();
  if (filteredFiles.length === 0) return;

  // タグでソート
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    const tagA = a.tag || '';
    const tagB = b.tag || '';
    if (tagA !== tagB) {
      return tagA.localeCompare(tagB);
    }
    return a.title.localeCompare(b.title);
  });

  // マークダウンを生成
  let markdown = '';
  for (let i = 0; i < sortedFiles.length; i++) {
    const file = sortedFiles[i];
    
    // タイトル（H1）
    markdown += `# ${file.title}\n\n`;
    
    // 本文を取得（frontmatterを除去）
    let body = file.content;
    if (body.startsWith('---')) {
      const secondDash = body.indexOf('---', 3);
      if (secondDash !== -1) {
        body = body.substring(secondDash + 3).trim();
        // 先頭の改行を除去
        body = body.replace(/^\n+/, '');
      }
    }
    
    // 本文を追加
    markdown += body;
    
    // 最後のファイルでない場合は区切り線とスペースを追加
    if (i < sortedFiles.length - 1) {
      markdown += '\n\n\n---\n\n\n';
    }
  }

  // ファイル名を生成（現在の日付）
  const now = new Date();
  const dateStr = now.getFullYear() + 
    String(now.getMonth() + 1).padStart(2, '0') + 
    String(now.getDate()).padStart(2, '0');
  const filename = `merge${dateStr}.md`;

  // ダウンロード
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
