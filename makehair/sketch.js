// ベジェ曲線のデータを保存
let curves = [];
let showPoints = true; // 点を表示するかどうか

function setup() {
  createCanvas(1200, 600);
  background(0);
  
  // SVGダウンロードボタン
  const downloadSvgBtn = document.getElementById('downloadSvgBtn');
  downloadSvgBtn.addEventListener('click', () => {
    downloadSVG();
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
  });
  
  // 点の表示/非表示切り替え
  const togglePointsBtn = document.getElementById('togglePointsBtn');
  togglePointsBtn.addEventListener('click', () => {
    showPoints = !showPoints;
    togglePointsBtn.textContent = showPoints ? '点を非表示' : '点を表示';
  });
  
  // 角度スライダーの値変更時に表示を更新
  const handleAngleSlider = document.getElementById('handleAngle');
  const angleValueDisplay = document.getElementById('angleValue');
  handleAngleSlider.addEventListener('input', (e) => {
    angleValueDisplay.textContent = e.target.value + '度';
  });
  
  // 距離スライダーの値変更時に表示を更新
  const distanceSlider = document.getElementById('startEndDistance');
  const distanceValueDisplay = document.getElementById('distanceValue');
  distanceSlider.addEventListener('input', (e) => {
    distanceValueDisplay.textContent = e.target.value + 'px';
  });
  
  // オレンジの中点からの距離スライダーの値変更時に表示を更新
  const anchorOffsetSlider = document.getElementById('anchorOffset');
  const anchorOffsetValueDisplay = document.getElementById('anchorOffsetValue');
  anchorOffsetSlider.addEventListener('input', (e) => {
    anchorOffsetValueDisplay.textContent = e.target.value + 'px';
  });
  
  // ハンドルの長さスライダーの値変更時に表示を更新
  const handleDistanceSlider = document.getElementById('handleDistance');
  const handleDistanceValueDisplay = document.getElementById('handleDistanceValue');
  handleDistanceSlider.addEventListener('input', (e) => {
    handleDistanceValueDisplay.textContent = e.target.value + 'px';
  });
  
}

function draw() {
  background(0);
  
  // 既存の曲線を描画
  for (let i = 0; i < curves.length; i++) {
    drawCurve(curves[i], i);
  }
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
  
  // 赤と緑のx座標の距離を取得（誤差なくこの値を使用）
  const startEndDistance = parseFloat(document.getElementById('startEndDistance').value) || 50;
  
  // 各髪を生成
  for (let i = 0; i < count; i++) {
    let startX = startXs[i];
    const startY = headTopY + random(-3, 3); // 始点Yはほぼ同じ高さ
    
    // 終点（緑）は始点（赤）の近くに配置（頭の上部）- 横の距離をパラメーターで指定（誤差なく）
    // 条件: 赤が左、緑が右に必ず配置
    const endDistanceFromStart = random(5, 12); // 始点からの距離（少し間隔をあける）
    const direction = 1; // 常に右方向（赤が左、緑が右）
    
    // 交差を防ぐため、前の曲線との重複をチェックして調整
    if (i > 0) {
      const prevCurve = curves[curves.length - 1];
      // 前の曲線の終点（緑）のX座標を取得（右側の点）
      const prevEndX = Math.max(prevCurve.start.x, prevCurve.end.x);
      // 現在の曲線の始点（赤）が前の曲線の終点（緑）より左にある場合は、右に移動
      if (startX <= prevEndX) {
        startX = prevEndX + 5; // 少し間隔をあける
      }
    }
    
    let endX = startX + direction * startEndDistance; // 始点のX座標から指定距離を正確に使用
    const endY = startY + endDistanceFromStart; // 始点の少し下
    
    // 赤と緑の中点を計算
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    
    // アンカーポイント（オレンジ）は髪の先端に配置
    // 赤と緑の中点を基準にして、あまり離れすぎないようにする
    const maxOffsetFromMid = parseFloat(document.getElementById('anchorOffset').value) || 25; // 中点からの最大オフセット（パラメーターで指定）
    const anchorX = midX + random(-maxOffsetFromMid, maxOffsetFromMid);
    const anchorY = startY + hairLength + random(-15, 15); // 髪の先端
    
    // オレンジのハンドルのみを計算（カーブを制御）- ハンドルの間の角度を指定
    const handleDistance = parseFloat(document.getElementById('handleDistance').value) || 50; // ハンドルの距離（パラメーターで指定）
    
    // 指定されたハンドルの間の角度を取得（度からラジアンに変換）
    const handleAngleDeg = parseFloat(document.getElementById('handleAngle').value) || 45;
    const handleAngleRad = (handleAngleDeg * PI) / 180;
    
    // オレンジから始点への方向と終点への方向の中間角度を計算
    const angleToStart = atan2(startY - anchorY, startX - anchorX);
    const angleToEnd = atan2(endY - anchorY, endX - anchorX);
    
    // 2つの方向の中間角度を計算（平均）
    let midAngle = (angleToStart + angleToEnd) / 2;
    
    // 角度が180度を超える場合の補正
    if (abs(angleToStart - angleToEnd) > PI) {
      midAngle += PI;
      if (midAngle > PI) midAngle -= 2 * PI;
    }
    
    // ハンドルの間の角度の半分を計算
    const halfAngle = handleAngleRad / 2;
    
    // 条件: 髪のカーブは必ず左にそる
    const curveDirection = -1; // 常に左方向
    
    // ランダムなバリエーションを小さく（±2度）
    const variation = random(-PI / 90, PI / 90);
    
    // ハンドル2a（始点側）- 中間角度から指定角度の半分だけ左（または右）に
    // ハンドルの角度を逆にして交差を防ぐ
    let angle1 = midAngle + halfAngle * curveDirection + variation;
    
    // ハンドルの角度を垂直より右にする（垂直は-PI/2、右は0度方向）
    // 角度が垂直（-PI/2）より左にある場合は、右方向にシフト
    if (angle1 < -PI / 2) {
      angle1 = -PI / 2 + random(0, PI / 6); // 垂直より少し右に
    }
    
    const handle2aX = anchorX + cos(angle1) * handleDistance;
    const handle2aY = anchorY + sin(angle1) * handleDistance;
    
    // ハンドル2b（終点側）- angle1から正確にhandleAngleRadだけ離れた位置に配置
    // 角度の差が正確にhandleAngleRadになるようにする（逆方向）
    let angle2 = angle1 - handleAngleRad * curveDirection;
    // 角度を-πからπの範囲に正規化
    if (angle2 > PI) angle2 -= 2 * PI;
    if (angle2 < -PI) angle2 += 2 * PI;
    
    // ハンドル2bも垂直より右にする
    if (angle2 < -PI / 2) {
      angle2 = -PI / 2 + random(0, PI / 6); // 垂直より少し右に
    }
    
    let handle2bX = anchorX + cos(angle2) * handleDistance;
    let handle2bY = anchorY + sin(angle2) * handleDistance;
    
    // 実際の角度の差を計算して確認
    let actualAngleDiff = abs(angle2 - angle1);
    if (actualAngleDiff > PI) {
      actualAngleDiff = 2 * PI - actualAngleDiff;
    }
    // 角度の差が指定値と大きく異なる場合は、angle2を再計算
    if (abs(actualAngleDiff - handleAngleRad) > 0.1) {
      angle2 = angle1 + handleAngleRad * curveDirection;
      if (angle2 > PI) angle2 -= 2 * PI;
      if (angle2 < -PI) angle2 += 2 * PI;
      handle2bX = anchorX + cos(angle2) * handleDistance;
      handle2bY = anchorY + sin(angle2) * handleDistance;
    }
    
    // 曲線を追加
    curves.push({
      start: { x: startX, y: startY },
      anchor: { x: anchorX, y: anchorY },
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
