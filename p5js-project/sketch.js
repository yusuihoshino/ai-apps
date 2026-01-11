// ベジェ曲線のデータを保存
let curves = [];
let currentPoints = []; // 現在編集中の点 [始点, 終点, アンカーポイント]
let pointIndex = 0; // 0: 始点, 1: 終点, 2: アンカーポイント
let showPoints = true; // 点を表示するかどうか
let selectedCurveIndex = -1; // 選択中の曲線のインデックス
let selectedPointType = null; // 'start', 'handle1', 'anchor', 'handle2', 'end', 'handle3'
let isDragging = false; // ドラッグ中かどうか
let dragOffset = { x: 0, y: 0 }; // ドラッグ時のオフセット

function setup() {
  createCanvas(800, 600);
  background(0);
  
  // SVGダウンロードボタン
  const downloadSvgBtn = document.getElementById('downloadSvgBtn');
  downloadSvgBtn.addEventListener('click', () => {
    downloadSVG();
  });
  
  // クリアボタン
  const clearBtn = document.getElementById('clearBtn');
  clearBtn.addEventListener('click', () => {
    curves = [];
    currentPoints = [];
    pointIndex = 0;
    updateStatus();
    updateCurveCount();
    background(0);
  });
  
  // リロードボタン
  const reloadBtn = document.getElementById('reloadBtn');
  reloadBtn.addEventListener('click', () => {
    location.reload();
  });
  
  // ランダム生成ボタン
  const generateBtn = document.getElementById('generateBtn');
  generateBtn.addEventListener('click', () => {
    const count = Math.min(parseInt(document.getElementById('hairCount').value) || 5, 20);
    curves = [];
    generateRandomHairs(count);
    updateCurveCount();
  });
  
  // 追加生成ボタン
  const addBtn = document.getElementById('addBtn');
  addBtn.addEventListener('click', () => {
    const requestedCount = parseInt(document.getElementById('hairCount').value) || 5;
    const remainingSlots = 20 - curves.length;
    if (remainingSlots <= 0) {
      alert('最大20本までです');
      return;
    }
    const count = Math.min(requestedCount, remainingSlots);
    generateRandomHairs(count);
    updateCurveCount();
  });
  
  // 点の表示/非表示切り替え
  const togglePointsBtn = document.getElementById('togglePointsBtn');
  togglePointsBtn.addEventListener('click', () => {
    showPoints = !showPoints;
    togglePointsBtn.textContent = showPoints ? '点を非表示' : '点を表示';
  });
  
  updateCurveCount();
}

function draw() {
  background(0);
  
  // 既存の曲線を描画
  for (let i = 0; i < curves.length; i++) {
    drawCurve(curves[i], i);
  }
  
  // 編集中の点を描画
  if (currentPoints.length > 0) {
    drawCurrentPoints();
  }
  
  // マウス位置にガイドを表示
  if (pointIndex < 3 && !isDragging) {
    drawGuide();
  }
}

function mousePressed() {
  // 既存の点をクリックしたかチェック
  if (checkPointClick(mouseX, mouseY)) {
    isDragging = true;
    return;
  }
  
  // 編集中でない場合、新しい点を追加
  if (pointIndex < 3 && !isDragging) {
    currentPoints.push({ x: mouseX, y: mouseY });
    pointIndex++;
    
    if (pointIndex === 3) {
      // 3点揃ったら曲線を完成
      if (curves.length >= 20) {
        alert('最大20本までです');
        currentPoints = [];
        pointIndex = 0;
        updateStatus();
        return;
      }
      
      // 2つのベジェ曲線として保存（オレンジをアンカーポイントとして）
      // クリック順序：赤（始点）→緑（終点）→オレンジ（アンカーポイント - 髪の先端）
      // currentPoints[0] = 始点（赤）- 頭の上部
      // currentPoints[1] = 終点（緑）- 頭の上部（赤の近く）
      // currentPoints[2] = アンカーポイント（オレンジ）- 髪の先端
      
      // オレンジのハンドルのみを計算（カーブを制御）
      const handleDistance = 50; // ハンドルの距離（少し長く）
      
      // 垂直線に対して右か左かをランダムに選択（同じ方向に曲げる）
      const curveDirection = random() > 0.5 ? 1 : -1; // 1: 右, -1: 左
      const baseAngleOffset = (PI / 4) * curveDirection; // ±45度の角度
      
      // オレンジから始点への方向のハンドル（始点側）- 同じ方向に斜めに角度を加える（少しバリエーション）
      const baseAngle1 = atan2(currentPoints[0].y - currentPoints[2].y, currentPoints[0].x - currentPoints[2].x);
      const angleOffset1 = baseAngleOffset + random(-PI / 12, PI / 12); // ±15度のバリエーション
      const angle1 = baseAngle1 + angleOffset1;
      const handle2aX = currentPoints[2].x + cos(angle1) * handleDistance;
      const handle2aY = currentPoints[2].y + sin(angle1) * handleDistance;
      
      // オレンジから終点への方向のハンドル（終点側）- 同じ方向に斜めに角度を加える（少しバリエーション）
      const baseAngle2 = atan2(currentPoints[1].y - currentPoints[2].y, currentPoints[1].x - currentPoints[2].x);
      const angleOffset2 = baseAngleOffset + random(-PI / 12, PI / 12); // ±15度のバリエーション
      const angle2 = baseAngle2 + angleOffset2;
      const handle2bX = currentPoints[2].x + cos(angle2) * handleDistance;
      const handle2bY = currentPoints[2].y + sin(angle2) * handleDistance;
      
      curves.push({
        start: currentPoints[0], // 始点（赤）
        anchor: currentPoints[2], // アンカーポイント（オレンジ）
        handle2a: { x: handle2aX, y: handle2aY }, // オレンジのハンドル（始点側）
        handle2b: { x: handle2bX, y: handle2bY }, // オレンジのハンドル（終点側）
        end: currentPoints[1] // 終点（緑）
      });
      currentPoints = [];
      pointIndex = 0;
      updateCurveCount();
    }
    updateStatus();
  }
}

function mouseDragged() {
  if (isDragging && selectedCurveIndex >= 0) {
    const curve = curves[selectedCurveIndex];
    
    if (selectedPointType === 'start') {
      curve.start.x = mouseX - dragOffset.x;
      curve.start.y = mouseY - dragOffset.y;
    } else if (selectedPointType === 'anchor') {
      const oldX = curve.anchor.x;
      const oldY = curve.anchor.y;
      curve.anchor.x = mouseX - dragOffset.x;
      curve.anchor.y = mouseY - dragOffset.y;
      // ハンドルも一緒に移動（相対位置を保つ）
      const dx = curve.anchor.x - oldX;
      const dy = curve.anchor.y - oldY;
      curve.handle2a.x += dx;
      curve.handle2a.y += dy;
      curve.handle2b.x += dx;
      curve.handle2b.y += dy;
    } else if (selectedPointType === 'handle2a') {
      curve.handle2a.x = mouseX - dragOffset.x;
      curve.handle2a.y = mouseY - dragOffset.y;
    } else if (selectedPointType === 'handle2b') {
      curve.handle2b.x = mouseX - dragOffset.x;
      curve.handle2b.y = mouseY - dragOffset.y;
    } else if (selectedPointType === 'end') {
      curve.end.x = mouseX - dragOffset.x;
      curve.end.y = mouseY - dragOffset.y;
    }
  }
}

function mouseReleased() {
  isDragging = false;
  selectedCurveIndex = -1;
  selectedPointType = null;
}

function checkPointClick(x, y) {
  const threshold = 10; // クリック判定の範囲
  
  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    
    // 始点をチェック
    if (dist(x, y, curve.start.x, curve.start.y) < threshold) {
      selectedCurveIndex = i;
      selectedPointType = 'start';
      dragOffset.x = x - curve.start.x;
      dragOffset.y = y - curve.start.y;
      return true;
    }
    
    // アンカーポイントをチェック
    if (dist(x, y, curve.anchor.x, curve.anchor.y) < threshold) {
      selectedCurveIndex = i;
      selectedPointType = 'anchor';
      dragOffset.x = x - curve.anchor.x;
      dragOffset.y = y - curve.anchor.y;
      return true;
    }
    
    // ハンドル2aをチェック（オレンジのハンドル - 始点側）
    if (dist(x, y, curve.handle2a.x, curve.handle2a.y) < threshold) {
      selectedCurveIndex = i;
      selectedPointType = 'handle2a';
      dragOffset.x = x - curve.handle2a.x;
      dragOffset.y = y - curve.handle2a.y;
      return true;
    }
    
    // ハンドル2bをチェック（オレンジのハンドル - 終点側）
    if (dist(x, y, curve.handle2b.x, curve.handle2b.y) < threshold) {
      selectedCurveIndex = i;
      selectedPointType = 'handle2b';
      dragOffset.x = x - curve.handle2b.x;
      dragOffset.y = y - curve.handle2b.y;
      return true;
    }
    
    // 終点をチェック
    if (dist(x, y, curve.end.x, curve.end.y) < threshold) {
      selectedCurveIndex = i;
      selectedPointType = 'end';
      dragOffset.x = x - curve.end.x;
      dragOffset.y = y - curve.end.y;
      return true;
    }
  }
  
  return false;
}

function drawCurve(curve, index) {
  // 2つの3次ベジェ曲線を描画（アンカーポイントで接続）
  stroke(255);
  strokeWeight(2);
  noFill();
  
  // 1つ目のベジェ曲線：始点→アンカーポイント（オレンジのハンドル2aを使用）
  bezier(
    curve.start.x, curve.start.y,
    curve.start.x, curve.start.y, // 始点から直接（ハンドルなし）
    curve.handle2a.x, curve.handle2a.y, // オレンジのハンドル（始点側）
    curve.anchor.x, curve.anchor.y
  );
  
  // 2つ目のベジェ曲線：アンカーポイント→終点（オレンジのハンドル2bを使用）
  bezier(
    curve.anchor.x, curve.anchor.y,
    curve.handle2b.x, curve.handle2b.y, // オレンジのハンドル（終点側）
    curve.end.x, curve.end.y, // 終点から直接（ハンドルなし）
    curve.end.x, curve.end.y
  );
  
  // 点を表示（showPointsがtrueの場合のみ）
  if (showPoints) {
    // 始点（赤）
    fill(255, 100, 100);
    noStroke();
    ellipse(curve.start.x, curve.start.y, 10, 10);
    
    // アンカーポイント（オレンジ）
    fill(255, 165, 0);
    noStroke();
    ellipse(curve.anchor.x, curve.anchor.y, 10, 10);
    
    // ハンドル2a（青）- オレンジのハンドル（始点側）
    fill(100, 100, 255);
    noStroke();
    ellipse(curve.handle2a.x, curve.handle2a.y, 8, 8);
    
    // ハンドル2b（青）- オレンジのハンドル（終点側）
    fill(100, 100, 255);
    noStroke();
    ellipse(curve.handle2b.x, curve.handle2b.y, 8, 8);
    
    // 終点（緑）
    fill(100, 255, 100);
    noStroke();
    ellipse(curve.end.x, curve.end.y, 10, 10);
    
    // ハンドル線を表示
    stroke(100);
    strokeWeight(1);
    line(curve.anchor.x, curve.anchor.y, curve.handle2a.x, curve.handle2a.y);
    line(curve.anchor.x, curve.anchor.y, curve.handle2b.x, curve.handle2b.y);
  }
}

function drawCurrentPoints() {
  // 編集中の点を描画
  // 順序：赤→緑→オレンジ（アンカーポイント）
  if (currentPoints.length >= 1) {
    // 始点（赤）
    fill(255, 100, 100);
    noStroke();
    ellipse(currentPoints[0].x, currentPoints[0].y, 10, 10);
  }
  
  if (currentPoints.length >= 2) {
    // 終点（緑）
    fill(100, 255, 100);
    noStroke();
    ellipse(currentPoints[1].x, currentPoints[1].y, 10, 10);
    
    // ハンドル線を表示（始点から終点へ）
    stroke(100);
    strokeWeight(1);
    line(currentPoints[0].x, currentPoints[0].y, currentPoints[1].x, currentPoints[1].y);
  }
  
  if (currentPoints.length >= 3) {
    // アンカーポイント（オレンジ）
    fill(255, 165, 0);
    noStroke();
    ellipse(currentPoints[2].x, currentPoints[2].y, 10, 10);
    
    // ハンドル線を表示（始点からアンカーポイント、アンカーポイントから終点へ）
    stroke(100);
    strokeWeight(1);
    line(currentPoints[0].x, currentPoints[0].y, currentPoints[2].x, currentPoints[2].y);
    line(currentPoints[2].x, currentPoints[2].y, currentPoints[1].x, currentPoints[1].y);
  }
}

function drawGuide() {
  // マウス位置にガイドを表示
  fill(255, 50);
  noStroke();
  ellipse(mouseX, mouseY, 8, 8);
  
  // 編集中の点からマウスへの線を表示
  if (currentPoints.length > 0) {
    stroke(100);
    strokeWeight(1);
    line(currentPoints[currentPoints.length - 1].x, currentPoints[currentPoints.length - 1].y, mouseX, mouseY);
  }
}

function updateStatus() {
  const statusEl = document.getElementById('status');
  if (pointIndex === 0) {
    statusEl.textContent = '始点（赤）をクリック - 頭の上部';
  } else if (pointIndex === 1) {
    statusEl.textContent = '終点（緑）をクリック - 頭の上部（赤の近く）';
  } else if (pointIndex === 2) {
    statusEl.textContent = 'アンカーポイント（オレンジ）をクリック - 髪の先端';
  }
}

function updateCurveCount() {
  const countEl = document.getElementById('curveCount');
  countEl.textContent = '現在の髪の本数: ' + curves.length + ' / 20';
}

// ランダムに髪を生成
function generateRandomHairs(count) {
  // 最大20本に制限
  const maxHairs = 20;
  const remainingSlots = maxHairs - curves.length;
  if (remainingSlots <= 0) {
    return;
  }
  count = Math.min(count, remainingSlots);
  
  const headTopY = height * 0.15; // 頭の上部位置
  const headCenterX = width / 2; // 頭の中心X
  const startAreaWidth = width * 0.4; // 始点の範囲（広くして間隔を確保）
  const endAreaWidth = width * 0.5; // 終点の範囲（広め）
  const hairLength = height * 0.35; // 髪の長さ
  
  // 始点のX座標を均等に配置（交差を防ぎ、間隔を確保）
  let startXs = [];
  if (count === 1) {
    startXs.push(headCenterX);
  } else {
    const spacing = startAreaWidth / (count - 1);
    for (let i = 0; i < count; i++) {
      startXs.push(headCenterX - startAreaWidth/2 + i * spacing);
    }
  }
  
  // 各髪を生成
  for (let i = 0; i < count; i++) {
    const startX = startXs[i];
    const startY = headTopY + random(-3, 3); // 始点Yはほぼ同じ高さ
    
    // 終点（緑）は始点（赤）の近くに配置（頭の上部）- 横の距離を思いっきり離す
    const endDistanceFromStart = random(5, 12); // 始点からの距離（少し間隔をあける）
    const endX = startX + random(-50, 50); // 始点のX座標から横に思いっきり広げる
    const endY = startY + endDistanceFromStart; // 始点の少し下
    
    // アンカーポイント（オレンジ）は髪の先端に配置
    const spreadFactor = (i - (count - 1) / 2) / (count - 1) * 2; // -1から1の範囲
    const anchorX = startX + spreadFactor * endAreaWidth * 0.3 + random(-endAreaWidth * 0.1, endAreaWidth * 0.1);
    const anchorY = startY + hairLength + random(-15, 15); // 髪の先端
    
    // オレンジのハンドルのみを計算（カーブを制御）- 斜めに角度を加える
    const handleDistance = 50; // ハンドルの距離（少し長く）
    
    // 垂直線に対して右か左かをランダムに選択（同じ方向に曲げる）
    const curveDirection = random() > 0.5 ? 1 : -1; // 1: 右, -1: 左
    const baseAngleOffset = (PI / 4) * curveDirection; // ±45度の角度
    
    // オレンジから始点への方向のハンドル（始点側）- 同じ方向に斜めに角度を加える（少しバリエーション）
    const baseAngle1 = atan2(startY - anchorY, startX - anchorX);
    const angleOffset1 = baseAngleOffset + random(-PI / 12, PI / 12); // ±15度のバリエーション
    const angle1 = baseAngle1 + angleOffset1;
    const handle2aX = anchorX + cos(angle1) * handleDistance;
    const handle2aY = anchorY + sin(angle1) * handleDistance;
    
    // オレンジから終点への方向のハンドル（終点側）- 同じ方向に斜めに角度を加える（少しバリエーション）
    const baseAngle2 = atan2(endY - anchorY, endX - anchorX);
    const angleOffset2 = baseAngleOffset + random(-PI / 12, PI / 12); // ±15度のバリエーション
    const angle2 = baseAngle2 + angleOffset2;
    const handle2bX = anchorX + cos(angle2) * handleDistance;
    const handle2bY = anchorY + sin(angle2) * handleDistance;
    
    // 交差チェック：前の髪と交差しないように調整（間隔を広げる、より厳密に）
    let adjustedAnchorX = anchorX;
    let needsRecalculation = false;
    if (i > 0) {
      const prevCurve = curves[curves.length - 1];
      const minSpacing = 20; // 間隔を広げる（交差を防ぐため）
      
      // アンカーポイントの位置をチェック
      if (adjustedAnchorX < prevCurve.anchor.x + minSpacing) {
        adjustedAnchorX = prevCurve.anchor.x + minSpacing + random(10, 20);
        needsRecalculation = true;
      }
      
      // 始点と終点の範囲をチェック（重複を防ぐ）
      const startRange = [Math.min(startX, endX), Math.max(startX, endX)];
      const prevStartRange = [Math.min(prevCurve.start.x, prevCurve.end.x), Math.max(prevCurve.start.x, prevCurve.end.x)];
      
      // 範囲が重複している場合は調整
      if (!(startRange[1] < prevStartRange[0] || startRange[0] > prevStartRange[1])) {
        if (startX < prevCurve.start.x) {
          adjustedAnchorX = prevCurve.anchor.x + minSpacing + random(10, 20);
          needsRecalculation = true;
        }
      }
    }
    
    // アンカーポイントが調整された場合はハンドルを再計算
    if (needsRecalculation) {
      const newBaseAngle1 = atan2(startY - anchorY, startX - adjustedAnchorX);
      const newAngleOffset1 = baseAngleOffset + random(-PI / 12, PI / 12);
      const newAngle1 = newBaseAngle1 + newAngleOffset1;
      const newHandle2aX = adjustedAnchorX + cos(newAngle1) * handleDistance;
      const newHandle2aY = anchorY + sin(newAngle1) * handleDistance;
      const newBaseAngle2 = atan2(endY - anchorY, endX - adjustedAnchorX);
      const newAngleOffset2 = baseAngleOffset + random(-PI / 12, PI / 12);
      const newAngle2 = newBaseAngle2 + newAngleOffset2;
      const newHandle2bX = adjustedAnchorX + cos(newAngle2) * handleDistance;
      const newHandle2bY = anchorY + sin(newAngle2) * handleDistance;
      curves.push({
        start: { x: startX, y: startY },
        anchor: { x: adjustedAnchorX, y: anchorY },
        handle2a: { x: newHandle2aX, y: newHandle2aY },
        handle2b: { x: newHandle2bX, y: newHandle2bY },
        end: { x: endX, y: endY }
      });
      continue;
    }
    
    curves.push({
      start: { x: startX, y: startY },
      anchor: { x: adjustedAnchorX, y: anchorY },
      handle2a: { x: handle2aX, y: handle2aY },
      handle2b: { x: handle2bX, y: handle2bY },
      end: { x: endX, y: endY }
    });
  }
}

function downloadSVG() {
  let svg = '<?xml version="1.0" encoding="UTF-8"?>\n';
  svg += '<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">\n';
  svg += '<rect width="' + width + '" height="' + height + '" fill="black"/>\n';
  
  // 各曲線をSVGパスとして追加（2つの3次ベジェ曲線 - Cコマンド）
  for (let curve of curves) {
    // 2つの3次ベジェ曲線のパス（Cコマンドを使用）- イラストレーターで編集可能
    // 1つ目：始点→アンカーポイント（オレンジのハンドル2aを使用）
    // 2つ目：アンカーポイント→終点（オレンジのハンドル2bを使用）
    svg += '<path d="M ' + curve.start.x + ' ' + curve.start.y + 
           ' C ' + curve.start.x + ' ' + curve.start.y + 
           ' ' + curve.handle2a.x + ' ' + curve.handle2a.y + 
           ' ' + curve.anchor.x + ' ' + curve.anchor.y + 
           ' C ' + curve.handle2b.x + ' ' + curve.handle2b.y + 
           ' ' + curve.end.x + ' ' + curve.end.y + 
           ' ' + curve.end.x + ' ' + curve.end.y + 
           '" stroke="white" stroke-width="2" fill="none"/>\n';
  }
  
  svg += '</svg>';
  
  // ダウンロード
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vectors_' + new Date().getTime() + '.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
