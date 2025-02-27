// ----- Mode Selection & Navigation -----
let gameMode = ""; // "singleplayer", "multiplayer_online", or "multiplayer_local"
function selectMode(mode) {
  if (mode === "singleplayer") {
    gameMode = "singleplayer";
    startGame();
  } else if (mode === "multiplayer") {
    document.getElementById("landing").style.display = "none";
    document.getElementById("multiplayerOptions").style.display = "block";
  }
}
function selectMultiplayer(option) {
  if (option === "online") {
    gameMode = "multiplayer_online";
    document.getElementById("multiplayerOptions").style.display = "none";
    document.getElementById("waitingScreen").style.display = "block";
    // Online functionality not implemented in this demo.
  } else if (option === "local") {
    gameMode = "multiplayer_local";
    startGame();
  }
}
function cancelWaiting() {
  gameMode = "";
  document.getElementById("waitingScreen").style.display = "none";
  document.getElementById("landing").style.display = "block";
}
function backToLanding() {
  document.getElementById("multiplayerOptions").style.display = "none";
  document.getElementById("landing").style.display = "block";
}
function startGame() {
  document.getElementById("landing").style.display = "none";
  document.getElementById("multiplayerOptions").style.display = "none";
  document.getElementById("waitingScreen").style.display = "none";
  document.getElementById("gameContainer").style.display = "block";
  initGame();
}

// ----- Game Variables & Setup -----
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let animationFrameId;
let gamePaused = false;

// Level/difficulty variables
let invaderLevel = 1;
let invaderSpeed = 2;
let invaderDirection = 1;  // for regular invaders
let bossDirection = 1;     // separate direction for boss oscillation
let teamScore = 0;
let verticalDirection = 1; // for vertical oscillation of bots
let verticalMoveCount = 0;
let nextLevelScheduled = false;

// Powerups – speed boost now lasts for 1 shot round; double shot lasts 2 rounds; shield lasts 10 seconds.
const powerups = { speed: 0, shield: false, doubleShot: 0 };

// Player objects (in singleplayer only player1 is used)
let player1, player2;

// Barriers – 3 barriers with 10 health each
let barriers = [];
function createBarriers() {
  barriers = [
    { x: 150, y: canvas.height - 150, width: 80, height: 40, health: 10 },
    { x: 360, y: canvas.height - 150, width: 80, height: 40, health: 10 },
    { x: 570, y: canvas.height - 150, width: 80, height: 40, health: 10 }
  ];
}

// Boss object
let boss = null;

// Update info display
function updateInfoDisplay() {
  if (gameMode === "singleplayer") {
    document.getElementById('lives').innerText = `Lives: ${player1.lives}`;
  } else {
    // In multiplayer, player using arrows (player1) is drawn in cyan, player using A/D (player2) in white.
    document.getElementById('lives').innerText = `P1 Lives: ${player1.lives} | P2 Lives: ${player2.lives}`;
  }
  document.getElementById('score').innerText = `Score: ${teamScore}`;
  document.getElementById('level').innerText = `Level: ${invaderLevel}`;
}

// ----- Shop Powerup Purchase -----
function buyPowerup(type) {
  if (type === 'speed') {
    if (teamScore >= 500 && powerups.speed === 0) {
      teamScore -= 500;
      powerups.speed = 1; // lasts for 1 shot round
      // Boost speed to 10
      player1.speed = 10;
      if (player2) player2.speed = 10;
      updateInfoDisplay();
    } else {
      alert("Not enough points for Speed Boost or already active!");
    }
  } else if (type === 'shield') {
    if (teamScore >= 250 && !powerups.shield) {
      teamScore -= 250;
      powerups.shield = true;
      activateShield();
      updateInfoDisplay();
    } else {
      alert("Not enough points for Shield or already active!");
    }
  } else if (type === 'doubleShot') {
    if (teamScore >= 1000 && powerups.doubleShot === 0) {
      teamScore -= 1000;
      powerups.doubleShot = 2; // lasts for 2 shot rounds
      updateInfoDisplay();
    } else {
      alert("Not enough points for Double Shot or already active!");
    }
  }
}

// ----- Activate Shield -----
// Shield lasts 10 seconds with a 30-second cooldown.
function activateShield() {
  if (player1) { player1.shieldActive = true; player1.shieldCooldown = true; }
  if (player2) { player2.shieldActive = true; player2.shieldCooldown = true; }
  document.getElementById('shieldCooldown').style.display = 'block';
  let cooldownTime = 30;
  const cooldownInterval = setInterval(() => {
    cooldownTime--;
    document.getElementById('shieldCooldownTime').innerText = cooldownTime;
    if (cooldownTime <= 0) {
      clearInterval(cooldownInterval);
      if (player1) player1.shieldCooldown = false;
      if (player2) player2.shieldCooldown = false;
      document.getElementById('shieldCooldown').style.display = 'none';
    }
  }, 1000);
  setTimeout(() => {
    if (player1) player1.shieldActive = false;
    if (player2) player2.shieldActive = false;
  }, 10000);
}

// ----- Toggle Shop Popup -----
function toggleShop() {
  const shop = document.getElementById('shop');
  if (shop.style.display === 'none' || shop.style.display === '') {
    shop.style.display = 'block';
    gamePaused = true;
    cancelAnimationFrame(animationFrameId);
  } else {
    shop.style.display = 'none';
    gamePaused = false;
    draw();
  }
}

// ----- Fullscreen Toggle -----
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen().catch(err => { alert(`Error: ${err.message}`); });
  } else {
    document.exitFullscreen();
  }
}

// ----- Input Handling -----
// Singleplayer: Arrow keys for movement and Enter (or NumpadEnter) for shooting.
// Multiplayer_local: Player1 uses Arrow keys/Enter; Player2 uses A/D for movement and Space to shoot.
const keysP1 = {};
const keysP2 = {};
document.addEventListener('keydown', (e) => {
  // Global shortcuts: Fullscreen (F) and Shop (S)
  if (e.key.toLowerCase() === 'f') toggleFullscreen();
  if (e.key.toLowerCase() === 's') toggleShop();
  
  if (gameMode === "singleplayer") {
    if (e.code === "ArrowLeft" || e.code === "ArrowRight" ||
        e.code === "Enter" || e.code === "NumpadEnter") {
      keysP1[e.code] = true;
    }
  } else if (gameMode === "multiplayer_local") {
    if (e.code === "ArrowLeft" || e.code === "ArrowRight" ||
        e.code === "Enter" || e.code === "NumpadEnter") {
      keysP1[e.code] = true;
    }
    if (e.code === "KeyA" || e.code === "KeyD" || e.code === "Space") {
      keysP2[e.code] = true;
    }
  }
});
document.addEventListener('keyup', (e) => {
  if (gameMode === "singleplayer") {
    if (e.code === "ArrowLeft" || e.code === "ArrowRight" ||
        e.code === "Enter" || e.code === "NumpadEnter") {
      keysP1[e.code] = false;
    }
  } else if (gameMode === "multiplayer_local") {
    if (e.code === "ArrowLeft" || e.code === "ArrowRight" ||
        e.code === "Enter" || e.code === "NumpadEnter") {
      keysP1[e.code] = false;
    }
    if (e.code === "KeyA" || e.code === "KeyD" || e.code === "Space") {
      keysP2[e.code] = false;
    }
  }
});

// ----- Bullets -----
let bullets = [];
let invaderBullets = [];
function shoot(player) {
  const bullet = { x: player.x + player.width/2, y: player.y, speed: 7 };
  bullets.push(bullet);
  // If double shot is active, fire a second bullet and decrement its counter.
  if (powerups.doubleShot > 0) {
    const bullet2 = { x: player.x + player.width/2 - 10, y: player.y, speed: 7 };
    bullets.push(bullet2);
    powerups.doubleShot--;
  }
  // If speed boost is active, decrement its counter.
  if (powerups.speed > 0) {
    powerups.speed--;
    if (powerups.speed === 0) {
      // Reset speed to normal (5)
      player1.speed = 5;
      if (player2) player2.speed = 5;
    }
  }
}

// ----- Invaders & Boss -----
// Regular invaders arranged in a grid. Boss spawns on levels 5, 10, 15, 20.
let invaders = [];
const invaderRows = 3;
const invaderCols = 10;
const invaderWidth = 40;
const invaderHeight = 20;
const invaderPadding = 10;
const invaderOffsetTop = 50;
const invaderOffsetLeft = 50;
function createInvaders() {
  boss = null;
  // Spawn boss on designated levels.
  if ([5,10,15,20].includes(invaderLevel)) {
    let bossHealth = 20 + (invaderLevel - 5) * 5;
    boss = { x: canvas.width/2 - 100, y: 50, width: 200, height: 50, alive: true, health: bossHealth };
    invaders = [];
  } else {
    invaders = [];
    for (let i = 0; i < invaderCols; i++) {
      invaders[i] = [];
      // Bots start with 1 health and gradually get tougher.
      let botHealth = 1 + Math.floor((invaderLevel - 1) / 3);
      for (let j = 0; j < invaderRows; j++) {
        invaders[i][j] = { 
          x: i * (invaderWidth + invaderPadding) + invaderOffsetLeft, 
          y: j * (invaderHeight + invaderPadding) + invaderOffsetTop, 
          alive: true, 
          health: botHealth 
        };
      }
    }
  }
  createBarriers();
  updateInfoDisplay();
}
createInvaders();

// ----- Drawing Functions -----
function drawInvader(invader) {
  let gradient = ctx.createRadialGradient(
    invader.x + invaderWidth/2, invader.y + invaderHeight/2, 5,
    invader.x + invaderWidth/2, invader.y + invaderHeight/2, invaderWidth/2
  );
  gradient.addColorStop(0, '#00FF00');
  gradient.addColorStop(1, '#006600');
  ctx.fillStyle = gradient;
  ctx.fillRect(invader.x, invader.y, invaderWidth, invaderHeight);
  if (invader.health > 1) {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(invader.x, invader.y, invaderWidth, invaderHeight);
  }
}
function drawBoss(boss) {
  let gradient = ctx.createRadialGradient(
    boss.x + boss.width/2, boss.y + boss.height/2, 10,
    boss.x + boss.width/2, boss.y + boss.height/2, boss.width/2
  );
  gradient.addColorStop(0, '#FF0000');
  gradient.addColorStop(1, '#660000');
  ctx.fillStyle = gradient;
  ctx.fillRect(boss.x, boss.y, boss.width, boss.height);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;
  ctx.strokeRect(boss.x, boss.y, boss.width, boss.height);
  // Draw boss health bar
  ctx.fillStyle = '#FFF';
  ctx.fillRect(boss.x, boss.y - 10, boss.width, 5);
  ctx.fillStyle = '#0F0';
  let maxHealth = 20 + (invaderLevel - 5) * 5;
  ctx.fillRect(boss.x, boss.y - 10, boss.width * (boss.health / maxHealth), 5);
}
function drawInvaders() {
  if (boss) {
    // If boss is dead, remove it.
    if (!boss.alive) { boss = null; }
    else { drawBoss(boss); }
  } else {
    for (let i = 0; i < invaderCols; i++) {
      for (let j = 0; j < invaderRows; j++) {
        if (invaders[i][j].alive) {
          drawInvader(invaders[i][j]);
        }
      }
    }
  }
}
function drawBarriers() {
  barriers.forEach(barrier => {
    // Change barrier color based on remaining health.
    if (barrier.health >= 8) ctx.fillStyle = '#0f0';
    else if (barrier.health >= 5) ctx.fillStyle = '#ff0';
    else ctx.fillStyle = '#f00';
    ctx.fillRect(barrier.x, barrier.y, barrier.width, barrier.height);
    ctx.strokeStyle = '#555';
    ctx.strokeRect(barrier.x, barrier.y, barrier.width, barrier.height);
  });
}

// ----- Update Functions -----
function updateInvaders() {
  if (boss) {
    // Boss moves using its own bossDirection so it oscillates continuously.
    boss.x += bossDirection * invaderSpeed;
    if (boss.x < 0) { boss.x = 0; bossDirection = 1; }
    else if (boss.x + boss.width > canvas.width) { boss.x = canvas.width - boss.width; bossDirection = -1; }
    // Boss shooting logic
    if (Math.random() < 0.005 * invaderLevel) {
      invaderBullets.push({ x: boss.x + boss.width/2, y: boss.y + boss.height, speed: 4 });
    }
  } else {
    let edgeReached = false;
    for (let i = 0; i < invaderCols; i++) {
      for (let j = 0; j < invaderRows; j++) {
        if (invaders[i][j].alive) {
          invaders[i][j].x += invaderDirection * invaderSpeed;
          if (invaders[i][j].x + invaderWidth > canvas.width || invaders[i][j].x < 0) {
            edgeReached = true;
          }
          // Regular invader shooting logic
          if (Math.random() < 0.0015 * invaderLevel) {
            invaderBullets.push({ x: invaders[i][j].x + invaderWidth/2, y: invaders[i][j].y + invaderHeight, speed: 3 });
          }
        }
      }
    }
    if (edgeReached) {
      invaderDirection *= -1;
      for (let i = 0; i < invaderCols; i++) {
        for (let j = 0; j < invaderRows; j++) {
          invaders[i][j].y += invaderHeight * verticalDirection;
        }
      }
      verticalMoveCount++;
      if (verticalMoveCount >= 2) {
        verticalDirection *= -1;
        verticalMoveCount = 0;
      }
    }
  }
}
function updateBullets() {
  // Update player bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.y -= bullet.speed;
    // Check barrier collisions
    if (checkBarrierCollision(bullet)) { bullets.splice(i,1); continue; }
    // Check collision with boss
    if (boss && boss.alive &&
        bullet.x > boss.x && bullet.x < boss.x + boss.width &&
        bullet.y > boss.y && bullet.y < boss.y + boss.height) {
      boss.health -= 1;
      if (boss.health <= 0) { boss.alive = false; teamScore += 100; updateInfoDisplay(); }
      bullets.splice(i,1);
      continue;
    }
    // Check collision with regular invaders
    for (let col = 0; col < invaderCols; col++) {
      for (let row = 0; row < invaderRows; row++) {
        const invader = invaders[col][row];
        if (invader.alive &&
            bullet.x > invader.x && bullet.x < invader.x + invaderWidth &&
            bullet.y > invader.y && bullet.y < invader.y + invaderHeight) {
          invader.health -= 1;
          if (invader.health <= 0) { invader.alive = false; teamScore += 5; updateInfoDisplay(); }
          bullets.splice(i,1);
          break;
        }
      }
    }
    if (bullet.y < 0) { bullets.splice(i, 1); }
  }
  // Update enemy (and boss) bullets
  for (let i = invaderBullets.length - 1; i >= 0; i--) {
    const bullet = invaderBullets[i];
    bullet.y += bullet.speed;
    if (checkBarrierCollision(bullet)) { invaderBullets.splice(i,1); continue; }
    if (gameMode === "singleplayer") {
      if (bullet.x > player1.x && bullet.x < player1.x + player1.width &&
          bullet.y > player1.y && bullet.y < player1.y + player1.height) {
        invaderBullets.splice(i,1);
        if (!player1.shieldActive) { player1.lives--; updateInfoDisplay(); }
      }
    } else {
      if (bullet.x > player1.x && bullet.x < player1.x + player1.width &&
          bullet.y > player1.y && bullet.y < player1.y + player1.height) {
        invaderBullets.splice(i,1);
        if (!player1.shieldActive) { player1.lives--; updateInfoDisplay(); }
      }
      if (bullet.x > player2.x && bullet.x < player2.x + player2.width &&
          bullet.y > player2.y && bullet.y < player2.y + player2.height) {
        invaderBullets.splice(i,1);
        if (!player2.shieldActive) { player2.lives--; updateInfoDisplay(); }
      }
    }
    if (bullet.y > canvas.height) { invaderBullets.splice(i,1); }
  }
}
function checkBarrierCollision(bullet) {
  for (let i = barriers.length - 1; i >= 0; i--) {
    let barrier = barriers[i];
    if (bullet.x > barrier.x && bullet.x < barrier.x + barrier.width &&
        bullet.y > barrier.y && bullet.y < barrier.y + barrier.height) {
      barrier.health--;
      if (barrier.health <= 0) { barriers.splice(i, 1); }
      return true;
    }
  }
  return false;
}
function checkAllEnemiesDefeated() {
  if (boss) return !boss.alive;
  for (let i = 0; i < invaderCols; i++) {
    for (let j = 0; j < invaderRows; j++) {
      if (invaders[i][j].alive) return false;
    }
  }
  return true;
}

// ----- Next Level & Game Over -----
// In multiplayer, any dead player is revived with 1 life (max lives = 3)
function nextLevel() {
  if (gameMode === "multiplayer_local" || gameMode === "multiplayer_online") {
    if (player1.lives === 0) { player1.lives = 1; }
    else if (player1.lives < 3) { player1.lives++; }
    if (player2.lives === 0) { player2.lives = 1; }
    else if (player2.lives < 3) { player2.lives++; }
  }
  invaderLevel++;
  invaderSpeed += 0.5;
  createInvaders();
  updateInfoDisplay();
}
function gameOver() {
  document.getElementById('gameOverPopup').style.display = 'block';
  document.getElementById('finalScore').innerText = `Your Score: ${teamScore}`;
  cancelAnimationFrame(animationFrameId);
}
function playAgain() {
  document.getElementById('gameOverPopup').style.display = 'none';
  if (gameMode === "singleplayer") {
    player1.lives = 3;
    player1.x = canvas.width/2 - 20;
  } else {
    player1.lives = player2.lives = 3;
    player1.x = canvas.width/2 - 100;
    player2.x = canvas.width/2 + 60;
  }
  teamScore = 0;
  invaderLevel = 1;
  invaderSpeed = 2;
  invaderDirection = 1;
  bossDirection = 1;
  boss = null;
  bullets = [];
  invaderBullets = [];
  createInvaders();
  createBarriers();
  updateInfoDisplay();
  draw();
}
function leaveGame() {
  window.location.href = "about:blank";
}

// ----- Player Movement & Drawing -----
function handlePlayerMovement() {
  if (gameMode === "singleplayer") {
    if (player1.lives > 0) {
      if (keysP1["ArrowLeft"]) { player1.x -= player1.speed; if (player1.x < 0) player1.x = 0; }
      if (keysP1["ArrowRight"]) { player1.x += player1.speed; if (player1.x + player1.width > canvas.width) player1.x = canvas.width - player1.width; }
      if (keysP1["Enter"] || keysP1["NumpadEnter"]) { shoot(player1); keysP1["Enter"] = keysP1["NumpadEnter"] = false; }
    }
  } else {
    if (player1.lives > 0) {
      // Player1 (arrow keys) drawn in cyan now.
      if (keysP1["ArrowLeft"]) { player1.x -= player1.speed; if (player1.x < 0) player1.x = 0; }
      if (keysP1["ArrowRight"]) { player1.x += player1.speed; if (player1.x + player1.width > canvas.width) player1.x = canvas.width - player1.width; }
      if (keysP1["Enter"] || keysP1["NumpadEnter"]) { shoot(player1); keysP1["Enter"] = keysP1["NumpadEnter"] = false; }
    }
    if (player2.lives > 0) {
      // Player2 (A/D) remains white.
      if (keysP2["KeyA"]) { player2.x -= player2.speed; if (player2.x < 0) player2.x = 0; }
      if (keysP2["KeyD"]) { player2.x += player2.speed; if (player2.x + player2.width > canvas.width) player2.x = canvas.width - player2.width; }
      if (keysP2["Space"]) { shoot(player2); keysP2["Space"] = false; }
    }
  }
}
function draw() {
  if (gamePaused) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  handlePlayerMovement();
  drawInvaders();
  updateBullets();
  drawBarriers();
  // Draw player bullets
  ctx.fillStyle = 'yellow';
  bullets.forEach(bullet => { ctx.fillRect(bullet.x, bullet.y, 5, 10); });
  // Draw enemy bullets
  ctx.fillStyle = 'red';
  invaderBullets.forEach(bullet => { ctx.fillRect(bullet.x, bullet.y, 5, 10); });
  
  if (gameMode === "singleplayer") {
    if (player1.lives > 0) {
      // Singleplayer: draw player1 in cyan.
      ctx.fillStyle = 'cyan';
      ctx.fillRect(player1.x, player1.y, player1.width, player1.height);
      if (player1.shieldActive) {
        ctx.strokeStyle = 'cyan';
        ctx.lineWidth = 3;
        ctx.strokeRect(player1.x - 5, player1.y - 5, player1.width + 10, player1.height + 10);
      }
    }
  } else {
    // Multiplayer: player1 (arrow keys) drawn in cyan, player2 (A/D) drawn in white.
    if (player1.lives > 0) {
      ctx.fillStyle = 'cyan';
      ctx.fillRect(player1.x, player1.y, player1.width, player1.height);
      if (player1.shieldActive) {
        ctx.strokeStyle = 'cyan';
        ctx.lineWidth = 3;
        ctx.strokeRect(player1.x - 5, player1.y - 5, player1.width + 10, player1.height + 10);
      }
    }
    if (player2.lives > 0) {
      ctx.fillStyle = 'white';
      ctx.fillRect(player2.x, player2.y, player2.width, player2.height);
      if (player2.shieldActive) {
        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 3;
        ctx.strokeRect(player2.x - 5, player2.y - 5, player2.width + 10, player2.height + 10);
      }
    }
  }
  
  updateInvaders();
  
  if (checkAllEnemiesDefeated() && !nextLevelScheduled) {
    nextLevelScheduled = true;
    setTimeout(() => { nextLevel(); nextLevelScheduled = false; }, 2000);
  }
  
  if ((gameMode === "singleplayer" && player1.lives <= 0) ||
      (gameMode !== "singleplayer" && player1.lives <= 0 && player2.lives <= 0)) {
    gameOver();
    return;
  }
  
  animationFrameId = requestAnimationFrame(draw);
}
function initGame() {
  if (gameMode === "singleplayer") {
    player1 = { x: canvas.width/2 - 20, y: canvas.height - 50, width: 40, height: 20, speed: 5, lives: 3, shieldActive: false, shieldCooldown: false };
  } else {
    player1 = { x: canvas.width/2 - 100, y: canvas.height - 50, width: 40, height: 20, speed: 5, lives: 3, shieldActive: false, shieldCooldown: false };
    player2 = { x: canvas.width/2 + 60, y: canvas.height - 50, width: 40, height: 20, speed: 5, lives: 3, shieldActive: false, shieldCooldown: false };
  }
  teamScore = 0;
  invaderLevel = 1;
  invaderSpeed = 2;
  invaderDirection = 1;
  bossDirection = 1;
  boss = null;
  bullets = [];
  invaderBullets = [];
  createInvaders();
  createBarriers();
  updateInfoDisplay();
  draw();
}
