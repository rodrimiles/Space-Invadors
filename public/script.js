// ----- Socket.IO Setup for Online Multiplayer -----
let socket = null;
if (typeof io !== 'undefined') {
  socket = io(); // auto-connect if available
}

// ----- Lobby UI for Online Multiplayer -----
const lobbyScreen = document.getElementById("lobbyScreen");
if (socket) {
  lobbyScreen.style.display = "block";
}

socket && socket.on("lobbyList", (lobbies) => {
  const lobbyList = document.getElementById("lobbyList");
  lobbyList.innerHTML = "";
  lobbies.forEach(lobby => {
    const li = document.createElement("li");
    li.innerText = `${lobby.id} (${lobby.players.length}/2)`;
    li.onclick = () => {
      document.getElementById("lobbySelect").value = lobby.id;
    };
    lobbyList.appendChild(li);
  });
});

function createLobby() {
  const name = document.getElementById("createName").value;
  const type = document.getElementById("lobbyType").value;
  const password = document.getElementById("lobbyPassword").value;
  if (!name) { alert("Enter your name."); return; }
  socket.emit("createLobby", { name, private: type === "private", password });
}
socket && socket.on("lobbyCreated", (data) => {
  lobbyScreen.style.display = "none";
  startGame();
});

function joinLobby() {
  const name = document.getElementById("joinName").value;
  const lobbyId = document.getElementById("lobbySelect").value;
  const password = document.getElementById("joinPassword").value;
  if (!name) { alert("Enter your name."); return; }
  socket.emit("joinLobby", { lobbyId, name, password });
}
socket && socket.on("joinError", (data) => {
  alert(data.message);
});
socket && socket.on("lobbyJoined", (data) => {
  if (data.lobby.players.length === 2) {
    lobbyScreen.style.display = "none";
    startGame();
  }
});

// ----- Mode Selection & Navigation -----
function selectMode(mode) {
  if (mode === "singleplayer") {
    gameMode = "singleplayer";
    startGame();
  } else if (mode === "multiplayer") {
    if (socket) {
      lobbyScreen.style.display = "block";
    } else {
      document.getElementById("landing").style.display = "none";
      document.getElementById("multiplayerOptions").style.display = "block";
    }
  }
}
function selectMultiplayer(option) {
  if (option === "online") {
    gameMode = "multiplayer_online";
    // Lobby screen handles online mode.
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
  if (lobbyScreen) lobbyScreen.style.display = "none";
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

let invaderLevel = 1;
let invaderSpeed = 2;
let invaderDirection = 1;
let bossDirection = 1;
let teamScore = 0;
let verticalDirection = 1;
let verticalMoveCount = 0;
let nextLevelScheduled = false;

let normalSpeedBoost = 0;
let normalDoubleShot = 0;
let shieldActive = false;
let speedyDoubleActive = false;
let speedyTripleActive = false;
let speedyExpire = 0;

const SHOT_COOLDOWN = 300;

// Player objects
// Multiplayer online/local:
//   - Player1 (controlled with A/D for movement and SPACE to shoot) is white.
//   - Player2 (controlled with arrow keys for movement and ENTER to shoot) is cyan.
let player1, player2;

// Barriers – 3 barriers with 10 health each (not drawn in fullscreen)
let barriers = [];
function createBarriers() {
  if (document.fullscreenElement) {
    barriers = [];
  } else {
    barriers = [
      { x: 150, y: canvas.height - 150, width: 80, height: 40, health: 10 },
      { x: 360, y: canvas.height - 150, width: 80, height: 40, health: 10 },
      { x: 570, y: canvas.height - 150, width: 80, height: 40, health: 10 }
    ];
  }
}

let boss = null;

function updateInfoDisplay() {
  if (gameMode === "singleplayer") {
    document.getElementById('lives').innerText = `Lives: ${player1.lives}`;
  } else {
    document.getElementById('lives').innerText = `P1 Lives: ${player1.lives} | P2 Lives: ${player2.lives}`;
  }
  document.getElementById('score').innerText = `Score: ${teamScore}`;
  document.getElementById('level').innerText = `Level: ${invaderLevel}`;
}

// ----- Shop Powerup Purchase -----
function buyPowerup(type) {
  if (type === 'speed') {
    if (teamScore >= 500 && normalSpeedBoost === 0) {
      teamScore -= 500;
      normalSpeedBoost = 1;
      player1.speed = 10;
      if (player2) player2.speed = 10;
      updateInfoDisplay();
    } else { alert("Not enough points for Speed Boost or already active!"); }
  } else if (type === 'shield') {
    if (teamScore >= 250 && !shieldActive) {
      teamScore -= 250;
      activateShield();
      updateInfoDisplay();
    } else { alert("Not enough points for Shield or already active!"); }
  } else if (type === 'doubleShot') {
    if (teamScore >= 1000 && normalDoubleShot === 0) {
      teamScore -= 1000;
      normalDoubleShot = 2;
      updateInfoDisplay();
    } else { alert("Not enough points for Double Shot or already active!"); }
  } else if (type === 'speedyDouble') {
    if (teamScore >= 100 && !speedyDoubleActive && !speedyTripleActive) {
      teamScore -= 100;
      speedyDoubleActive = true;
      speedyExpire = Date.now() + 5000;
      updateInfoDisplay();
    } else { alert("Not enough points for Speedy Double Shot or one already active!"); }
  } else if (type === 'speedyTriple') {
    if (teamScore >= 300 && !speedyDoubleActive && !speedyTripleActive) {
      teamScore -= 300;
      speedyTripleActive = true;
      speedyExpire = Date.now() + 5000;
      updateInfoDisplay();
    } else { alert("Not enough points for Speedy Triple Shot or one already active!"); }
  }
}

// ----- Activate Shield -----
function activateShield() {
  shieldActive = true;
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
    shieldActive = false;
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
// For singleplayer: use arrow keys for movement and SPACE to shoot.
// For multiplayer_local/online:
//   - Player1 (controlled with A/D for movement and SPACE to shoot) is white.
//   - Player2 (controlled with arrow keys for movement and ENTER to shoot) is cyan.
const keysP1 = {};
const keysP2 = {};
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'f') toggleFullscreen();
  if (e.key.toLowerCase() === 's') toggleShop();
  
  if (gameMode === "singleplayer") {
    if (e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "Space") {
      keysP1[e.code] = true;
    }
  } else if (gameMode === "multiplayer_local" || gameMode === "multiplayer_online") {
    // Player1: keys A and D for movement, SPACE to shoot.
    if (e.code === "KeyA" || e.code === "KeyD" || e.code === "Space") {
      keysP1[e.code] = true;
    }
    // Player2: arrow keys for movement, Enter (or NumpadEnter) to shoot.
    if (e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "Enter" || e.code === "NumpadEnter") {
      keysP2[e.code] = true;
    }
  }
});
document.addEventListener('keyup', (e) => {
  if (gameMode === "singleplayer") {
    if (e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "Space") {
      keysP1[e.code] = false;
    }
  } else if (gameMode === "multiplayer_local" || gameMode === "multiplayer_online") {
    if (e.code === "KeyA" || e.code === "KeyD" || e.code === "Space") {
      keysP1[e.code] = false;
    }
    if (e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "Enter" || e.code === "NumpadEnter") {
      keysP2[e.code] = false;
    }
  }
});

// ----- Bullet Firing & Cooldown -----
let bullets = [];
let invaderBullets = [];
function shoot(player) {
  let now = Date.now();
  let useCooldown = !(speedyDoubleActive || speedyTripleActive);
  if (useCooldown) {
    if (!player.lastShotTime) player.lastShotTime = 0;
    if (now - player.lastShotTime < SHOT_COOLDOWN) return;
    player.lastShotTime = now;
  }
  if ((speedyDoubleActive || speedyTripleActive) && now > speedyExpire) {
    speedyDoubleActive = false;
    speedyTripleActive = false;
  }
  
  if (speedyTripleActive) {
    bullets.push({ x: player.x + player.width/2, y: player.y, speed: 7 });
    bullets.push({ x: player.x + player.width/2 - 15, y: player.y, speed: 7 });
    bullets.push({ x: player.x + player.width/2 + 15, y: player.y, speed: 7 });
  } else if (speedyDoubleActive) {
    bullets.push({ x: player.x + player.width/2, y: player.y, speed: 7 });
    bullets.push({ x: player.x + player.width/2 - 15, y: player.y, speed: 7 });
  } else {
    if (normalDoubleShot > 0) {
      bullets.push({ x: player.x + player.width/2, y: player.y, speed: 7 });
      bullets.push({ x: player.x + player.width/2 - 10, y: player.y, speed: 7 });
      normalDoubleShot--;
    } else if (normalSpeedBoost > 0) {
      bullets.push({ x: player.x + player.width/2, y: player.y, speed: 7 });
      normalSpeedBoost--;
      if (normalSpeedBoost === 0) {
        player1.speed = 5;
        if (player2) player2.speed = 5;
      }
    } else {
      bullets.push({ x: player.x + player.width/2, y: player.y, speed: 7 });
    }
  }
}

// ----- Invaders & Boss -----
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
  if ([5,10,15,20].includes(invaderLevel)) {
    let bossHealth = 20 + (invaderLevel - 5) * 5;
    boss = { x: canvas.width/2 - 100, y: 50, width: 200, height: 50, alive: true, health: bossHealth };
    invaders = [];
  } else {
    invaders = [];
    for (let i = 0; i < invaderCols; i++) {
      invaders[i] = [];
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
  ctx.fillStyle = '#FFF';
  ctx.fillRect(boss.x, boss.y - 10, boss.width, 5);
  ctx.fillStyle = '#0F0';
  let maxHealth = 20 + (invaderLevel - 5) * 5;
  ctx.fillRect(boss.x, boss.y - 10, boss.width * (boss.health / maxHealth), 5);
}
function drawInvaders() {
  if (boss) {
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
  if (document.fullscreenElement) return;
  barriers.forEach(barrier => {
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
    boss.x += bossDirection * invaderSpeed;
    if (boss.x < 0) { boss.x = 0; bossDirection = 1; }
    else if (boss.x + boss.width > canvas.width) { boss.x = canvas.width - boss.width; bossDirection = -1; }
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
  if ((speedyDoubleActive || speedyTripleActive) && Date.now() > speedyExpire) {
    speedyDoubleActive = false;
    speedyTripleActive = false;
  }
  
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.y -= bullet.speed;
    if (!document.fullscreenElement && checkBarrierCollision(bullet)) { bullets.splice(i,1); continue; }
    if (boss && boss.alive &&
        bullet.x > boss.x && bullet.x < boss.x + boss.width &&
        bullet.y > boss.y && bullet.y < boss.y + boss.height) {
      boss.health -= 1;
      if (boss.health <= 0) { boss.alive = false; teamScore += 100; updateInfoDisplay(); boss = null; }
      bullets.splice(i,1);
      continue;
    }
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
  for (let i = invaderBullets.length - 1; i >= 0; i--) {
    const bullet = invaderBullets[i];
    bullet.y += bullet.speed;
    if (!document.fullscreenElement && checkBarrierCollision(bullet)) { invaderBullets.splice(i,1); continue; }
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
  if (document.fullscreenElement) return false;
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
// Singleplayer: use arrow keys and SPACE to shoot.
// Multiplayer_local/online:
//   - Player1: controlled with A/D (movement) and SPACE to shoot (drawn in white).
//   - Player2: controlled with arrow keys (movement) and ENTER to shoot (drawn in cyan).
function handlePlayerMovement() {
  if (gameMode === "singleplayer") {
    if (player1.lives > 0) {
      if (keysP1["ArrowLeft"]) { player1.x -= player1.speed; if (player1.x < 0) player1.x = 0; }
      if (keysP1["ArrowRight"]) { player1.x += player1.speed; if (player1.x + player1.width > canvas.width) player1.x = canvas.width - player1.width; }
      if (keysP1["Space"]) { shoot(player1); keysP1["Space"] = false; }
    }
  } else {
    if (player1.lives > 0) {
      if (keysP1["KeyA"]) { player1.x -= player1.speed; if (player1.x < 0) player1.x = 0; }
      if (keysP1["KeyD"]) { player1.x += player1.speed; if (player1.x + player1.width > canvas.width) player1.x = canvas.width - player1.width; }
      if (keysP1["Space"]) { shoot(player1); keysP1["Space"] = false; }
    }
    if (player2.lives > 0) {
      if (keysP2["ArrowLeft"]) { player2.x -= player2.speed; if (player2.x < 0) player2.x = 0; }
      if (keysP2["ArrowRight"]) { player2.x += player2.speed; if (player2.x + player2.width > canvas.width) player2.x = canvas.width - player2.width; }
      if (keysP2["Enter"] || keysP2["NumpadEnter"]) { shoot(player2); keysP2["Enter"] = keysP2["NumpadEnter"] = false; }
    }
  }
}
function draw() {
  if (gamePaused) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  handlePlayerMovement();
  drawInvaders();
  updateBullets();
  if (!document.fullscreenElement) { drawBarriers(); }
  ctx.fillStyle = 'yellow';
  bullets.forEach(bullet => { ctx.fillRect(bullet.x, bullet.y, 5, 10); });
  ctx.fillStyle = 'red';
  invaderBullets.forEach(bullet => { ctx.fillRect(bullet.x, bullet.y, 5, 10); });
  
  if (gameMode === "singleplayer") {
    if (player1.lives > 0) {
      ctx.fillStyle = 'white';
      ctx.fillRect(player1.x, player1.y, player1.width, player1.height);
      if (player1.shieldActive) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.strokeRect(player1.x - 5, player1.y - 5, player1.width + 10, player1.height + 10);
      }
    }
  } else {
    if (player1.lives > 0) {
      ctx.fillStyle = 'white';
      ctx.fillRect(player1.x, player1.y, player1.width, player1.height);
      if (player1.shieldActive) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.strokeRect(player1.x - 5, player1.y - 5, player1.width + 10, player1.height + 10);
      }
    }
    if (player2.lives > 0) {
      ctx.fillStyle = 'cyan';
      ctx.fillRect(player2.x, player2.y, player2.width, player2.height);
      if (player2.shieldActive) {
        ctx.strokeStyle = 'cyan';
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
    player1 = { x: canvas.width/2 - 20, y: canvas.height - 50, width: 40, height: 20, speed: 5, lives: 3, shieldActive: false, shieldCooldown: false, lastShotTime: 0 };
  } else {
    // Multiplayer: Player1 (A/D, SPACE) is white; Player2 (arrow keys, ENTER) is cyan.
    player1 = { x: canvas.width/2 - 100, y: canvas.height - 50, width: 40, height: 20, speed: 5, lives: 3, shieldActive: false, shieldCooldown: false, lastShotTime: 0 };
    player2 = { x: canvas.width/2 + 60, y: canvas.height - 50, width: 40, height: 20, speed: 5, lives: 3, shieldActive: false, shieldCooldown: false, lastShotTime: 0 };
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
