// SVG画像を表示
let img;
let imgLoaded = false;
let imagePositions = []; // 配置済みの画像の位置を記録

// Base64エンコードされたSVG
const svgBase64 = 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iX+ODrOOCpOODpOODvF8yIiBkYXRhLW5hbWU9IuODrOOCpOODpOODvCAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNzEuMTYgNDAuNDkiPgogIDxkZWZzPgogICAgPHN0eWxlPgogICAgICAuY2xzLTEgewogICAgICAgIGZvbnQtZmFtaWx5OiBQQW50aXF1ZUFOMnBQcm9OLUJvbGQtODNwdi1SS1NKLUgsICdBIFAtT1RGIEFudGlxdWUgQU4yKyBQcm9OJzsKICAgICAgICBmb250LXNpemU6IDMyLjU4cHg7CiAgICAgICAgZm9udC13ZWlnaHQ6IDcwMDsKICAgICAgfQoKICAgICAgLmNscy0yIHsKICAgICAgICBsZXR0ZXItc3BhY2luZzogLS4yMWVtOwogICAgICB9CgogICAgICAuY2xzLTMgewogICAgICAgIGxldHRlci1zcGFjaW5nOiAtLjA5ZW07CiAgICAgIH0KCiAgICAgIC5jbHMtNCB7CiAgICAgICAgbGV0dGVyLXNwYWNpbmc6IC0uMTNlbTsKICAgICAgfQoKICAgICAgLmNscy01IHsKICAgICAgICBsZXR0ZXItc3BhY2luZzogLS4xNGVtOwogICAgICB9CgogICAgICAuY2xzLTYgewogICAgICAgIGxldHRlci1zcGFjaW5nOiAtLjEyZW07CiAgICAgIH0KCiAgICAgIC5jbHMtNyB7CiAgICAgICAgbGV0dGVyLXNwYWNpbmc6IC0uMDJlbTsKICAgICAgfQogICAgPC9zdHlsZT4KICA8L2RlZnM+CiAgPGcgaWQ9Il/jg6zjgqTjg6Tjg7xfMS0yIiBkYXRhLW5hbWU9IuODrOOCpOODpOODvCAxIj4KICAgIDx0ZXh0IGNsYXNzPSJjbHMtMSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTEuNDcgMjguNjcpIj48dHNwYW4gY2xhc3M9ImNscy0yIiB4PSIwIiB5PSIwIj7jgqQ8L3RzcGFuPjx0c3BhbiBjbGFzcz0iY2xzLTQiIHg9IjI1LjYxIiB5PSIwIj7jg4s8L3RzcGFuPjx0c3BhbiBjbGFzcz0iY2xzLTYiIHg9IjUzLjk4IiB5PSIwIj7jgrc8L3RzcGFuPjx0c3BhbiBjbGFzcz0iY2xzLTMiIHg9IjgyLjUyIiB5PSIwIj7jgqI8L3RzcGFuPjx0c3BhbiBjbGFzcz0iY2xzLTUiIHg9IjExMi4xNiIgeT0iMCI+44OBPC90c3Bhbj48dHNwYW4gY2xhc3M9ImNscy03IiB4PSIxNDAuMDUiIHk9IjAiPuODljwvdHNwYW4+PC90ZXh0PgogIDwvZz4KPC9zdmc+';

function preload() {
  // Base64データURIとしてSVGを読み込む
  img = loadImage('data:image/svg+xml;base64,' + svgBase64);
}

function setup() {
  // SVGのviewBoxからサイズを取得（171.16 x 40.49）
  // スケールを大きくする（10倍）
  const scale = 10;
  createCanvas(171.16 * scale, 40.49 * scale);
  background(255);
  
  console.log('setup完了');
  console.log('img:', img);
  
  if (img) {
    console.log('画像サイズ:', img.width, 'x', img.height);
    imgLoaded = true;
  }
  
  // ボタンのイベントリスナーを設定
  const addImageBtn = document.getElementById('addImageBtn');
  if (addImageBtn) {
    addImageBtn.addEventListener('click', addImageToRandomDirection);
  }
}

// ランダムな方向の見えない領域に画像を追加する関数
function addImageToRandomDirection() {
  if (!img || img.width === 0 || img.height === 0) {
    console.log('画像が読み込まれていません');
    return;
  }
  
  // 画像サイズが正しく取得できていない場合は、viewBoxのサイズを使用
  let imgW = img.width;
  let imgH = img.height;
  
  // 画像サイズが取得できていない場合のフォールバック
  if (imgW === 0 || imgH === 0 || imgW < 10 || imgH < 10) {
    imgW = 171.16 * 10; // viewBoxの幅 * scale
    imgH = 40.49 * 10;  // viewBoxの高さ * scale
    console.log('画像サイズが取得できなかったため、デフォルト値を使用:', imgW, imgH);
  }
  
  let x, y;
  let direction = floor(random(4)); // 0:上, 1:下, 2:左, 3:右
  
  console.log('選択された方向:', direction, '(0:上, 1:下, 2:左, 3:右)');
  console.log('画像サイズ:', imgW, 'x', imgH);
  console.log('キャンバスサイズ:', width, 'x', height);
  
  switch(direction) {
    case 0: // 上
      x = random(-imgW, width);
      y = random(-imgH * 3, -imgH);
      console.log('上方向: x=', x, 'y=', y);
      break;
    case 1: // 下
      x = random(-imgW, width);
      y = random(height + imgH, height + imgH * 3);
      console.log('下方向: x=', x, 'y=', y);
      break;
    case 2: // 左
      x = random(-imgW * 3, -imgW);
      y = random(-imgH, height);
      console.log('左方向: x=', x, 'y=', y);
      break;
    case 3: // 右
      x = random(width + imgW, width + imgW * 3);
      y = random(-imgH, height);
      console.log('右方向: x=', x, 'y=', y);
      break;
  }
  
  // 重複チェック（既存の位置と近すぎないか確認）
  let tooClose = false;
  for (let pos of imagePositions) {
    if (dist(x, y, pos.x, pos.y) < imgW) {
      tooClose = true;
      break;
    }
  }
  
  // 重複していなければ追加
  if (!tooClose) {
    imagePositions.push({x: x, y: y});
    console.log('画像を追加しました。総数:', imagePositions.length);
  } else {
    console.log('重複のため追加をスキップしました');
  }
}

function draw() {
  // 背景を白に
  background(255);
  
  // 画像が読み込まれていない場合は待機
  if (!img) {
    fill(0);
    textAlign(CENTER, CENTER);
    textSize(20);
    text('SVGを読み込み中...', width / 2, height / 2);
    return;
  }
  
  // 画像の読み込み状態を確認
  if (img.width === 0 || img.height === 0) {
    fill(0);
    textAlign(CENTER, CENTER);
    textSize(20);
    text('SVGのサイズが取得できません', width / 2, height / 2);
    console.log('画像サイズが0:', img.width, img.height);
    return;
  }
  
  // 既に配置した画像を表示
  for (let pos of imagePositions) {
    image(img, pos.x, pos.y);
  }
  
  // デバッグ情報（最初の1回だけ）
  if (frameCount === 1) {
    console.log('描画開始');
    console.log('画像サイズ:', img.width, 'x', img.height);
    console.log('キャンバスサイズ:', width, 'x', height);
  }
}
