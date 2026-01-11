// 魚のクラス
class Fish {
  constructor() {
    this.x = random(width);
    this.y = random(height);
    this.vx = random(-2, 2);
    this.vy = random(-2, 2);
    this.size = random(15, 30);
    this.maxSpeed = random(2, 4);
    this.turnSpeed = 0.1;
    this.colorOffset = random(0, TWO_PI); // 色の変化のオフセット
    
    // 方向変化の検出用
    this.prevVx = this.vx;
    this.prevVy = this.vy;
    this.glowIntensity = 0; // 光る強度（0-1）
    
    // 蛍のように光る効果用
    this.fireflyPhase = random(0, TWO_PI); // 各魚の点滅の位相
    this.fireflySpeed = random(0.02, 0.05); // 点滅の速度
  }
  
  // 色を取得（時間経過で変化する寒色）
  getColor() {
    const time = frameCount * 0.01 + this.colorOffset;
    // 寒色系のグラデーション（青、水色、シアン、紫を含む）
    const r = map(sin(time), -1, 1, 80, 200); // 紫色を含むためR値を上げる
    const g = map(sin(time + PI / 3), -1, 1, 50, 150);
    const b = map(sin(time + 2 * PI / 3), -1, 1, 150, 255);
    return [r, g, b];
  }
  
  // 蛍のように光る強度を取得（0-1）
  getFireflyIntensity() {
    const time = frameCount * this.fireflySpeed + this.fireflyPhase;
    // sin関数で0から1の間で点滅（より自然な点滅パターン）
    return map(sin(time), -1, 1, 0.3, 1.0);
  }
  
  // マウスに反応
  reactToMouse() {
    const dx = mouseX - this.x;
    const dy = mouseY - this.y;
    const distance = sqrt(dx * dx + dy * dy);
    
    // マウスが近い場合、逃げる
    if (distance < 150 && distance > 0) {
      const angle = atan2(dy, dx);
      // マウスから離れる方向に回転
      const targetVx = -cos(angle) * this.maxSpeed * 2;
      const targetVy = -sin(angle) * this.maxSpeed * 2;
      
      // 滑らかに方向を変える
      this.vx = lerp(this.vx, targetVx, this.turnSpeed);
      this.vy = lerp(this.vy, targetVy, this.turnSpeed);
    } else {
      // 通常の泳ぐ動き
      this.vx += random(-0.1, 0.1);
      this.vy += random(-0.1, 0.1);
      
      // 速度を制限
      const speed = sqrt(this.vx * this.vx + this.vy * this.vy);
      if (speed > this.maxSpeed) {
        this.vx = (this.vx / speed) * this.maxSpeed;
        this.vy = (this.vy / speed) * this.maxSpeed;
      }
    }
  }
  
  // 更新
  update() {
    // 前フレームの速度を保存
    this.prevVx = this.vx;
    this.prevVy = this.vy;
    
    this.reactToMouse();
    
    // 方向変化を検出
    const prevAngle = atan2(this.prevVy, this.prevVx);
    const currentAngle = atan2(this.vy, this.vx);
    let angleDiff = abs(currentAngle - prevAngle);
    
    // 角度差を0からPIの範囲に正規化
    if (angleDiff > PI) {
      angleDiff = 2 * PI - angleDiff;
    }
    
    // 方向が大きく変わった場合、光らせる（閾値を下げてより頻繁に）
    if (angleDiff > 0.2) { // 約11度以上の変化
      this.glowIntensity = 1.0;
    }
    
    // 光る強度を徐々に減らす（減衰を遅くして長く光らせる）
    this.glowIntensity = max(0, this.glowIntensity - 0.05);
    
    // 位置を更新
    this.x += this.vx;
    this.y += this.vy;
    
    // 画面端で反転
    if (this.x < 0 || this.x > width) {
      this.vx *= -1;
      this.x = constrain(this.x, 0, width);
    }
    if (this.y < 0 || this.y > height) {
      this.vy *= -1;
      this.y = constrain(this.y, 0, height);
    }
  }
  
  // 描画
  display() {
    push();
    translate(this.x, this.y);
    
    // 魚の向きを計算
    const angle = atan2(this.vy, this.vx);
    rotate(angle);
    
    // 魚を線で描画（寒色系、時間で変化）
    const color = this.getColor();
    
    // 蛍のように光る効果
    const fireflyIntensity = this.getFireflyIntensity();
    
    // 蛍の発光効果（常に適用）- 暗闇のライト風（控えめに）
    if (fireflyIntensity > 0.6) {
      const fireflyGlow = (fireflyIntensity - 0.6) * 2.5; // 0.6-1.0を0-1にマッピング
      // 暗闇のライト風の色（青・シアン系の柔らかい光）
      const lightR = color[0] * 0.3 + 30 * fireflyGlow;
      const lightG = color[1] * 0.5 + 60 * fireflyGlow;
      const lightB = color[2] * 0.7 + 90 * fireflyGlow;
      
      // 外側の発光（控えめな光）
      stroke(lightR, lightG, lightB, 80 * fireflyGlow);
      strokeWeight(2 + 1.5 * fireflyGlow);
      noFill();
      line(0, 0, this.size, 0);
      line(this.size, 0, this.size * 0.7, -this.size * 0.3);
      line(this.size, 0, this.size * 0.7, this.size * 0.3);
    }
    
    // 方向転換時の光る効果を適用（暗闇のライト風、控えめに）
    if (this.glowIntensity > 0) {
      // 暗闇のライト風の色（青・シアン系の明るい光）
      const glowR = color[0] * 0.4 + 50 * this.glowIntensity;
      const glowG = color[1] * 0.6 + 80 * this.glowIntensity;
      const glowB = color[2] * 0.8 + 120 * this.glowIntensity;
      
      // 外側の発光効果（控えめに、層数を減らす）
      for (let i = 2; i >= 1; i--) {
        const layerIntensity = this.glowIntensity * (i / 2);
        stroke(glowR, glowG, glowB, 100 * layerIntensity);
        strokeWeight((3 + 2 * layerIntensity) * i);
        noFill();
        line(0, 0, this.size, 0);
        line(this.size, 0, this.size * 0.7, -this.size * 0.3);
        line(this.size, 0, this.size * 0.7, this.size * 0.3);
      }
      
      // 中央の発光（控えめ）
      stroke(glowR * 1.1, glowG * 1.1, glowB * 1.1, 150 * this.glowIntensity);
      strokeWeight(2 + 1.5 * this.glowIntensity);
      noFill();
      line(0, 0, this.size, 0);
      line(this.size, 0, this.size * 0.7, -this.size * 0.3);
      line(this.size, 0, this.size * 0.7, this.size * 0.3);
    }
    
    // 通常の描画（蛍の明るさに応じて変化）
    const baseR = color[0] * fireflyIntensity;
    const baseG = color[1] * fireflyIntensity;
    const baseB = color[2] * fireflyIntensity;
    stroke(baseR, baseG, baseB);
    strokeWeight(2);
    noFill();
    
    // 魚の体（線）
    line(0, 0, this.size, 0);
    // 尾びれ
    line(this.size, 0, this.size * 0.7, -this.size * 0.3);
    line(this.size, 0, this.size * 0.7, this.size * 0.3);
    // 目
    fill(255);
    noStroke();
    ellipse(this.size * 0.3, -this.size * 0.1, this.size * 0.15, this.size * 0.15);
    
    pop();
  }
}

// 水面の波紋クラス
class WaterRipple {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.maxRadius = random(50, 100);
    this.speed = random(0.5, 1.5);
    this.alpha = 100;
  }
  
  update() {
    this.radius += this.speed;
    this.alpha = map(this.radius, 0, this.maxRadius, 100, 0);
  }
  
  display() {
    if (this.radius < this.maxRadius) {
      stroke(100, 150, 255, this.alpha);
      strokeWeight(1);
      noFill();
      ellipse(this.x, this.y, this.radius * 2, this.radius * 2);
    }
  }
  
  isFinished() {
    return this.radius >= this.maxRadius;
  }
}

// 魚の配列
let fishes = [];
const numFishes = 8;

// 水面の波紋の配列
let ripples = [];

// クリア処理の遅延用
let clearCounter = 0;

function setup() {
  createCanvas(800, 600);
  background(0);
  
  // 魚を生成
  for (let i = 0; i < numFishes; i++) {
    fishes.push(new Fish());
  }
  
  // PNGスクリーンショットボタン
  const screenshotBtn = document.getElementById('screenshotBtn');
  screenshotBtn.addEventListener('click', () => {
    saveCanvas('screenshot', 'png');
  });
  
  // リロードボタン
  const reloadBtn = document.getElementById('reloadBtn');
  reloadBtn.addEventListener('click', () => {
    location.reload();
  });
}

function draw() {
  // クリックしている間はクリア処理を遅らせる（数フレームに1回だけ）
  // クリックしていない時は通常通りクリア
  if (mouseIsPressed) {
    clearCounter++;
    // 5フレームに1回だけクリア（遅延）
    if (clearCounter % 5 === 0) {
      background(0, 10);
    }
  } else {
    // 通常通り毎フレームクリア
    background(0, 10);
    clearCounter = 0;
  }
  
  // 波紋を更新・描画
  for (let i = ripples.length - 1; i >= 0; i--) {
    ripples[i].update();
    ripples[i].display();
    if (ripples[i].isFinished()) {
      ripples.splice(i, 1);
    }
  }
  
  // ランダムに波紋を生成
  if (random() < 0.02) {
    ripples.push(new WaterRipple(random(width), random(height * 0.2, height * 0.4)));
  }
  
  // 全ての魚を更新・描画
  for (let fish of fishes) {
    fish.update();
    fish.display();
  }
  
  // クリックしている間だけ、魚同士を結ぶラインを描画
  if (mouseIsPressed) {
    // 魚同士が近づいたら、頭を結ぶラインを描画
    for (let i = 0; i < fishes.length; i++) {
      for (let j = i + 1; j < fishes.length; j++) {
        const fish1 = fishes[i];
        const fish2 = fishes[j];
        const distance = dist(fish1.x, fish1.y, fish2.x, fish2.y);
        
        // 近づいたら（距離が150以下）ラインを描画
        if (distance < 150) {
          // 魚の頭の位置を計算（進行方向の先端）
          const angle1 = atan2(fish1.vy, fish1.vx);
          const head1X = fish1.x + cos(angle1) * fish1.size;
          const head1Y = fish1.y + sin(angle1) * fish1.size;
          
          const angle2 = atan2(fish2.vy, fish2.vx);
          const head2X = fish2.x + cos(angle2) * fish2.size;
          const head2Y = fish2.y + sin(angle2) * fish2.size;
          
          // 頭を結ぶライン（赤色）
          stroke(255, 0, 0, 150);
          strokeWeight(1);
          line(head1X, head1Y, head2X, head2Y);
        }
      }
    }
  }
}
