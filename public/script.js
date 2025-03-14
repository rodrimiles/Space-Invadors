// script.js

let gameMode; // Global game mode variable
let currentLobbyId = null; // To store the lobby ID after creation

// Update socket connection to use window.location
const socket = io(`http://${window.location.hostname}:3000`, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  path: '/socket.io',
  autoConnect: true
});

// Add more detailed logging
socket.on('connect', () => {
  console.log('Connected to server with ID:', socket.id);
});

// Add better error handling
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error);
  alert('Failed to connect to server. Please check if the server is running on port 3000.');
});

socket.on('reconnect_attempt', () => {
  console.log('Attempting to reconnect...');
});

socket.on('reconnect_failed', () => {
  console.error('Failed to reconnect after all attempts');
  alert('Connection lost. Please refresh the page to try again.');
});

// Store lobbies list
let lobbies = [];

// Add better lobby list handling
socket.on("lobbyList", (lobbiesList) => {
  console.log('Received lobby list:', lobbiesList);
  
  // Store lobbies for later reference
  lobbies = lobbiesList || [];
  
  // Update the list view
  const lobbyList = document.getElementById("lobbyList");
  lobbyList.innerHTML = "";
  
  // Update the dropdown
  const lobbySelect = document.getElementById("lobbySelect");
  lobbySelect.innerHTML = "<option value=''>Select a lobby...</option>";
  
  if (!lobbiesList || lobbiesList.length === 0) {
    lobbyList.innerHTML = "<li>No lobbies available</li>";
    return;
  }
  
  lobbiesList.forEach(lobby => {
    // Create list item
    const li = document.createElement("li");
    li.innerText = `${lobby.lobbyName} (${lobby.id}) - (${lobby.players.length}/2)`;
    li.onclick = () => { document.getElementById("lobbySelect").value = lobby.id; };
    lobbyList.appendChild(li);
    
    // Create dropdown option
    const option = document.createElement("option");
    option.value = lobby.id;
    option.text = `${lobby.lobbyName} (${lobby.players.length}/2)`;
    lobbySelect.appendChild(option);
  });
});

// --- Helper Function: Update Waiting Room Table ---
function updateLobbyPlayersTable(lobby) {
  const tableBody = document.getElementById("lobbyPlayersBody");
  tableBody.innerHTML = "";
  lobby.players.forEach(player => {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.innerText = player.name;
    row.appendChild(cell);
    tableBody.appendChild(row);
  });
}

// Fix the duplicate lobbyUpdate handler issue
socket.on("lobbyUpdate", (lobby) => {
  console.log('Lobby updated:', lobby);
  updateLobbyPlayersTable(lobby);
  
  // Only show start button to host when 2 players are present
  const isHost = socket.id === lobby.players[0]?.id;
  const hasEnoughPlayers = lobby.players.length === 2;
  document.getElementById("hostStartButton").style.display = 
    (isHost && hasEnoughPlayers) ? "block" : "none";
    
  // Don't auto-start the game, wait for host to click the start button
});

// Socket event: lobby cancelled
socket.on("lobbyCancelled", ({ message }) => {
  console.error('Lobby cancelled:', message);
  alert(message);
  backToLanding();
});

// ----- Create and Join Lobby Functions -----
function createLobby() {
  const createName = document.getElementById("createName").value;
  const lobbyName = document.getElementById("lobbyName").value;

  if (!createName || !lobbyName) {
    alert("Please enter both your username and a lobby name.");
    return;
  }

  socket.emit("createLobby", { createName, lobbyName });
}

function joinLobby() {
  const joinName = document.getElementById("joinName").value;
  const lobbyId = document.getElementById("lobbySelect").value;
  
  if (!joinName) {
    alert("Enter your username.");
    return;
  }
  socket.emit("joinLobby", { lobbyId, joinName });
}

// Update socket event handlers
socket.on("lobbyCreated", ({ lobbyId, lobby }) => {
  console.log('Lobby created:', lobbyId, lobby);
  currentLobbyId = lobbyId;
  document.getElementById("lobbyScreen").style.display = "none";
  document.getElementById("waitingScreen").style.display = "block";
  // Only show start button to host (first player)
  document.getElementById("hostStartButton").style.display = socket.id === lobby.players[0].id ? "block" : "none";
  updateLobbyPlayersTable(lobby);
});

socket.on("lobbyUpdate", (lobby) => {
  console.log('Lobby updated:', lobby);
  updateLobbyPlayersTable(lobby);
  
  // Start game automatically when 2 players join
  if (lobby.players.length === 2) {
    document.getElementById("waitingScreen").style.display = "none";
    startGame();
    
    // Set player2's ID for the second player who joined
    if (socket.id === lobby.players[1].id) {
      player2.id = socket.id;
      player1.id = lobby.players[0].id;
    } else {
      player1.id = socket.id;
      player2.id = lobby.players[1].id;
    }
  }
});

// Add host start game function
function hostStartGame() {
  if (currentLobbyId) {
    socket.emit("hostStartGame", { lobbyId: currentLobbyId });
  }
}

socket.on("gameStartError", (message) => {
  alert(message);
});

// Update forceGameStart handler to properly initialize players
socket.on("forceGameStart", () => {
  console.log('Force game start received');
  document.getElementById("waitingScreen").style.display = "none";
  
  // Get the current lobby data before starting
  const currentLobby = lobbies.find(l => l.id === currentLobbyId);
  if (currentLobby && currentLobby.players.length === 2) {
    // Set player IDs based on the lobby data
    if (socket.id === currentLobby.players[1].id) {
      // Second player joins
      console.log('Initializing as Player 2');
      // Initialize player objects
      player2 = {
        id: socket.id,
        x: canvas.width/2 + 60,
        y: canvas.height - 50,
        width: 40,
        height: 20,
        speed: 7, // Changed from 5 to 7
        lives: 3,
        shieldActive: false,
        shieldCooldown: false,
        lastShotTime: 0,
        name: currentLobby.players[1].name
      };
      player1 = {
        id: currentLobby.players[0].id,
        x: canvas.width/2 - 100,
        y: canvas.height - 50,
        width: 40,
        height: 20,
        speed: 7, // Changed from 5 to 7
        lives: 3,
        shieldActive: false,
        shieldCooldown: false,
        lastShotTime: 0,
        name: currentLobby.players[0].name
      };
    } else {
      // First player (host)
      console.log('Initializing as Player 1');
      player1 = {
        id: socket.id,
        x: canvas.width/2 - 100,
        y: canvas.height - 50,
        width: 40,
        height: 20,
        speed: 7, // Changed from 5 to 7
        lives: 3,
        shieldActive: false,
        shieldCooldown: false,
        lastShotTime: 0,
        name: currentLobby.players[0].name
      };
      player2 = {
        id: currentLobby.players[1].id,
        x: canvas.width/2 + 60,
        y: canvas.height - 50,
        width: 40,
        height: 20,
        speed: 7, // Changed from 5 to 7
        lives: 3,
        shieldActive: false,
        shieldCooldown: false,
        lastShotTime: 0,
        name: currentLobby.players[1].name
      };
    }
  }
  
  startGame();
});

socket.on("forceGameStart", () => {
  document.getElementById("waitingScreen").style.display = "none";
  startGame();
});

// Cancel lobby creation
function cancelCreateLobby() {
  if (currentLobbyId) {
    socket.emit("cancelLobby", { lobbyId: currentLobbyId });
    currentLobbyId = null;
  }
  document.getElementById("lobbyScreen").style.display = "none";
  document.getElementById("multiplayerOptions").style.display = "block";
}

// Cancel join lobby
function cancelJoinLobby() {
  document.getElementById("lobbyScreen").style.display = "none";
  document.getElementById("multiplayerOptions").style.display = "block";
}

// ----- Navigation Functions -----
function backToLanding() {
  document.getElementById("lobbyScreen").style.display = "none";
  document.getElementById("multiplayerOptions").style.display = "none";
  document.getElementById("guideScreen").style.display = "none";
  document.getElementById("landingScreen").style.display = "block";
}

function selectMode(mode) {
  if (mode === "singleplayer") {
    gameMode = "singleplayer";
    document.getElementById("landingScreen").style.display = "none";
    startGame();
  } else if (mode === "multiplayer") {
    document.getElementById("landingScreen").style.display = "none";
    document.getElementById("multiplayerOptions").style.display = "block";
  }
}

function selectMultiplayer(option) {
  if (option === "online") {
    gameMode = "multiplayer_online";
    document.getElementById("multiplayerOptions").style.display = "none";
    document.getElementById("lobbyScreen").style.display = "block";
  } else if (option === "local") {
    gameMode = "multiplayer_local";
    document.getElementById("multiplayerOptions").style.display = "none";
    startGame();
  }
}

function cancelWaiting() {
  gameMode = "";
  document.getElementById("waitingScreen").style.display = "none";
  document.getElementById("landingScreen").style.display = "block";
}

function showGuide() {
  document.getElementById("landingScreen").style.display = "none";
  document.getElementById("guideScreen").style.display = "block";
}

function backToLandingLobby() {
  backToLanding();
}

// Fix start game to properly hide all menus
function startGame() {
  // Hide all menu screens
  const screens = ["lobbyScreen", "multiplayerOptions", "waitingScreen", 
                  "landingScreen", "guideScreen", "gameOverPopup"];
  screens.forEach(screen => {
    document.getElementById(screen).style.display = "none";
  });
  
  // Show only game container
  document.getElementById("gameContainer").style.display = "block";
  
  const shop = document.getElementById('shop');
  shop.style.display = 'none';
  gamePaused = false;
  
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

const FPS = 60;
const FRAME_TIME = 1000 / FPS;
const SHOT_COOLDOWN = 300;
let lastTime = 0;

let player1, player2;

let barriers = [];
function createBarriers() {
  // Always draw barriers (even in fullscreen)
  barriers = [
    { x: 150, y: canvas.height - 150, width: 80, height: 40, health: 10 },
    { x: 360, y: canvas.height - 150, width: 80, height: 40, health: 10 },
    { x: 570, y: canvas.height - 150, width: 80, height: 40, health: 10 }
  ];
}

let boss = null;
function updateInfoDisplay() {
  if (gameMode === "singleplayer") {
    document.getElementById('lives').innerText = `Lives: ${Math.max(player1.lives, 0)}`;
  } else {
    document.getElementById('lives').innerText = `P1 Lives: ${Math.max(player1.lives, 0)} | P2 Lives: ${Math.max(player2.lives, 0)}`;
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

// Update toggleShop function to prevent opening during game start
function toggleShop() {
  const shop = document.getElementById('shop');
  if (shop.style.display === 'block') {
    shop.style.display = 'none';
    gamePaused = false;
    draw();
  } else if (!gamePaused) { // Only allow opening if game isn't paused
    shop.style.display = 'block';
    gamePaused = true;
    cancelAnimationFrame(animationFrameId);
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen().catch(err => { alert(`Error: ${err.message}`); });
  } else {
    document.exitFullscreen();
  }
}

const keysP1 = {};
const keysP2 = {};
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'f') toggleFullscreen();
  if (e.key.toLowerCase() === 's') toggleShop();
  
  if (gameMode === "singleplayer") {
    if (e.code === "KeyA" || e.code === "KeyD" || e.code === "Space") {
      keysP1[e.code] = true;
    }
  } else if (gameMode === "multiplayer_local" || gameMode === "multiplayer_online") {
    if (e.code === "KeyA" || e.code === "KeyD" || e.code === "Space") {
      keysP1[e.code] = true;
    }
    if (e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "Enter" || e.code === "NumpadEnter") {
      keysP2[e.code] = true;
    }
  }
});
document.addEventListener('keyup', (e) => {
  if (gameMode === "singleplayer") {
    if (e.code === "KeyA" || e.code === "KeyD" || e.code === "Space") {
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
  
  if (gameMode === "multiplayer_online") {
    const bulletData = { x: player.x + player.width/2, y: player.y, speed: 7 };
    socket.emit('playerShoot', {
      lobbyId: currentLobbyId,
      playerId: player.id,
      bulletData
    });
  }
}

let invaders = [];
const invaderRows = 3;
const invaderCols = 10;
const invaderWidth = 40;
const invaderHeight = 20;
const invaderPadding = 10;
const invaderOffsetTop = 50;
const invaderOffsetLeft = 50;
function createInvaders() {
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
  createBarriers();
  updateInfoDisplay();
}

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
    boss.x + boss.width / 2, boss.y + boss.height / 2, 10,
    boss.x + boss.width / 2, boss.y + boss.height / 2, boss.width / 2
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
  // Always draw barriers (even in fullscreen)
  barriers.forEach(barrier => {
    if (barrier.health >= 8) ctx.fillStyle = '#0f0';
    else if (barrier.health >= 5) ctx.fillStyle = '#ff0';
    else ctx.fillStyle = '#f00';
    ctx.fillRect(barrier.x, barrier.y, barrier.width, barrier.height);
    ctx.strokeStyle = '#555';
    ctx.strokeRect(barrier.x, barrier.y, barrier.width, barrier.height);
  });
}

function updateInvaders() {
  let edgeReached = false;
  for (let i = 0; i < invaderCols; i++) {
    for (let j = 0; j < invaderRows; j++) {
      if (invaders[i][j].alive) {
        invaders[i][j].x += invaderDirection * invaderSpeed;
        if (invaders[i][j].x + invaderWidth > canvas.width || invaders[i][j].x < 0) {
          edgeReached = true;
        }
        if (Math.random() < 0.0015 * invaderLevel) {
          invaderBullets.push({ x: invaders[i][j].x + invaderWidth / 2, y: invaders[i][j].y + invaderHeight, speed: 3 });
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

function updateBullets() {
  if ((speedyDoubleActive || speedyTripleActive) && Date.now() > speedyExpire) {
    speedyDoubleActive = false;
    speedyTripleActive = false;
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.y -= bullet.speed;
    if (checkBarrierCollision(bullet)) { bullets.splice(i, 1); continue; }
    for (let col = 0; col < invaderCols; col++) {
      for (let row = 0; row < invaderRows; row++) {
        const invader = invaders[col][row];
        if (invader.alive &&
            bullet.x > invader.x && bullet.x < invader.x + invaderWidth &&
            bullet.y > invader.y && bullet.y < invader.y + invaderHeight) {
          invader.health -= 1;
          if (invader.health <= 0) {
            invader.alive = false;
            teamScore += 5;
            updateInfoDisplay();
          }
          bullets.splice(i, 1);
          break;
        }
      }
    }
    if (bullet.y < 0) { bullets.splice(i, 1); }
  }

  for (let i = invaderBullets.length - 1; i >= 0; i--) {
    const bullet = invaderBullets[i];
    bullet.y += bullet.speed;
    if (checkBarrierCollision(bullet)) { invaderBullets.splice(i, 1); continue; }
    if (gameMode === "singleplayer") {
      if (bullet.x > player1.x && bullet.x < player1.x + player1.width &&
          bullet.y > player1.y && bullet.y < player1.y + player1.height) {
        invaderBullets.splice(i, 1);
        if (!player1.shieldActive) { player1.lives = Math.max(player1.lives - 1, 0); updateInfoDisplay(); }
      }
    } else {
      if (bullet.x > player1.x && bullet.x < player1.x + player1.width &&
          bullet.y > player1.y && bullet.y < player1.y + player1.height) {
        invaderBullets.splice(i, 1);
        if (!player1.shieldActive) { player1.lives = Math.max(player1.lives - 1, 0); updateInfoDisplay(); }
      }
      if (bullet.x > player2.x && bullet.x < player2.x + player2.width &&
          bullet.y > player2.y && bullet.y < player2.y + player2.height) {
        invaderBullets.splice(i, 1);
        if (!player2.shieldActive) { player2.lives = Math.max(player2.lives - 1, 0); updateInfoDisplay(); }
      }
    }
    if (bullet.y > canvas.height) { invaderBullets.splice(i, 1); }
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

function nextLevel() {
  if (gameMode === "multiplayer_local" || gameMode === "multiplayer_online") {
    if (player1.lives > 0 && player1.lives < 3) { player1.lives++; }
    if (player2.lives > 0 && player2.lives < 3) { player2.lives++; }
  }
  invaderLevel++;
  invaderSpeed += 0.5;
  createInvaders();
  updateInfoDisplay();
}

function gameOver() {
  document.getElementById('gameOverPopup').style.display = 'block';
  
  if (gameMode === "multiplayer_online") {
    document.getElementById('gameOverPopup').innerHTML = `
      <h2>Game Over</h2>
      <p id="finalScore">Team Score: ${teamScore}</p>
      <div id="voteStatus">Waiting for votes...</div>
      <div id="votingButtons">
        <button onclick="votePlayAgain('yes')" class="voteButton">Play Again</button>
        <button onclick="votePlayAgain('no')" class="voteButton">Return to Lobby</button>
      </div>
      <button onclick="leaveGameImmediately()">Leave Game</button>
    `;
  } else {
    document.getElementById('finalScore').innerText = `Team Score: ${teamScore}`;
  }
  
  cancelAnimationFrame(animationFrameId);
}

// Update vote play again function
function votePlayAgain(vote) {
  if (currentLobbyId) {
    socket.emit('playAgainVote', { 
      lobbyId: currentLobbyId, 
      vote,
      playerId: socket.id 
    });
    
    // Disable vote buttons after voting
    document.querySelectorAll('#gameOverPopup button').forEach(btn => {
      if (btn.onclick.toString().includes('votePlayAgain')) {
        btn.disabled = true;
      }
    });
    document.getElementById('voteStatus').innerText = 'Vote submitted. Waiting for other player...';
  }
}

// Add vote update handler
socket.on('voteUpdate', ({ votes, needed }) => {
  if (document.getElementById('voteStatus')) {
    document.getElementById('voteStatus').innerText = 
      `Votes to restart: ${votes} / ${needed}`;
  }
});

// Update play again result handler
socket.on('playAgainResult', ({ restart, message }) => {
  if (restart) {
    // Reset game state
    resetGameState();
    // Start new game
    startGame();
  } else {
    alert(message || "Game ended - returning to lobby");
    backToLanding();
  }
});

// Add new reset game state function
function resetGameState() {
  player1.lives = 3;
  player2.lives = 3;
  player1.x = canvas.width/2 - 100;
  player2.x = canvas.width/2 + 60;
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
}

// Ensure the player's lives do not go below 0
// Fix player movement and sync
function handlePlayerMovement() {
  if (gameMode === "multiplayer_online") {
    const myPlayer = socket.id === player1?.id ? player1 : player2;
    
    if (myPlayer?.lives > 0) {
      let moved = false;
      let newX = myPlayer.x;
      
      if (keysP1["KeyA"]) {
        newX = Math.max(0, myPlayer.x - myPlayer.speed);
        moved = true;
      }
      if (keysP1["KeyD"]) {
        newX = Math.min(canvas.width - myPlayer.width, myPlayer.x + myPlayer.speed);
        moved = true;
      }
      
      if (moved && newX !== myPlayer.x) {
        myPlayer.x = newX;
        socket.emit('playerMove', {
          lobbyId: currentLobbyId,
          playerId: myPlayer.id,
          x: newX
        });
      }
      
      if (keysP1["Space"]) {
        shoot(myPlayer);
        keysP1["Space"] = false;
      }
    }
  } else {
    if (gameMode === "singleplayer") {
      if (player1.lives > 0) {
        if (keysP1["KeyA"]) { player1.x -= player1.speed; if (player1.x < 0) player1.x = 0; }
        if (keysP1["KeyD"]) { player1.x += player1.speed; if (player1.x + player1.width > canvas.width) player1.x = canvas.width - player1.width; }
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
}

// Fix draw players function
function drawPlayers() {
  if (gameMode === "multiplayer_online") {
    // Make sure player objects exist before trying to draw them
    if (!player1 || !player2) return;
    
    // Draw player 1
    if (player1.lives > 0) {
      ctx.fillStyle = player1.id === socket.id ? 'white' : 'cyan';
      ctx.fillRect(player1.x, player1.y, player1.width, player1.height);
      if (player1.shieldActive) {
        ctx.strokeStyle = player1.id === socket.id ? 'white' : 'cyan';
        ctx.lineWidth = 3;
        ctx.strokeRect(player1.x - 5, player1.y - 5, player1.width + 10, player1.height + 10);
      }
    }
    
    // Draw player 2
    if (player2.lives > 0) {
      ctx.fillStyle = player2.id === socket.id ? 'white' : 'cyan';
      ctx.fillRect(player2.x, player2.y, player2.width, player2.height);
      if (player2.shieldActive) {
        ctx.strokeStyle = player2.id === socket.id ? 'white' : 'cyan';
        ctx.lineWidth = 3;
        ctx.strokeRect(player2.x - 5, player2.y - 5, player2.width + 10, player2.height + 10);
      }
    }
  } else if (gameMode === "singleplayer") {
    // Single player mode
    if (player1 && player1.lives > 0) {
      ctx.fillStyle = 'white';
      ctx.fillRect(player1.x, player1.y, player1.width, player1.height);
      if (player1.shieldActive) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.strokeRect(player1.x - 5, player1.y - 5, player1.width + 10, player1.height + 10);
      }
    }
  } else {
    // Local multiplayer mode
    if (player1 && player1.lives > 0) {
      ctx.fillStyle = 'white';
      ctx.fillRect(player1.x, player1.y, player1.width, player1.height);
      if (player1.shieldActive) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.strokeRect(player1.x - 5, player1.y - 5, player1.width + 10, player1.height + 10);
      }
    }
    if (player2 && player2.lives > 0) {
      ctx.fillStyle = 'cyan';
      ctx.fillRect(player2.x, player2.y, player2.width, player2.height);
      if (player2.shieldActive) {
        ctx.strokeStyle = 'cyan';
        ctx.lineWidth = 3;
        ctx.strokeRect(player2.x - 5, player2.y - 5, player2.width + 10, player2.height + 10);
      }
    }
  }
}

// Fix the main draw function to prevent double-drawing
// Fix game speed with proper animation frame timing
function draw(currentTime) {
  if (gamePaused) return;

  animationFrameId = requestAnimationFrame(draw);
  
  if (!currentTime) currentTime = performance.now();
  
  const deltaTime = currentTime - lastTime;
  if (deltaTime < FRAME_TIME) return;
  
  lastTime = currentTime;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  handlePlayerMovement();
  drawInvaders();
  updateBullets();
  drawBarriers();
  drawPlayers();
  
  // Draw bullets
  ctx.fillStyle = 'yellow';
  bullets.forEach(bullet => ctx.fillRect(bullet.x, bullet.y, 5, 10));
  ctx.fillStyle = 'red';
  invaderBullets.forEach(bullet => ctx.fillRect(bullet.x, bullet.y, 5, 10));
  
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
}

// Update start animation
function initGame() {
  if (gameMode === "multiplayer_online") {
    console.log('Game starting with players:', { player1, player2 });
    
    // Ensure both players are initialized
    if (!player1 || !player2) {
      console.error("Players not properly initialized!");
      // Create default players if they don't exist (fallback)
      if (!player1) {
        player1 = {
          id: socket.id,
          x: canvas.width/2 - 100,
          y: canvas.height - 50,
          width: 40,
          height: 20,
          speed: 7, // Changed from 5 to 7
          lives: 3,
          shieldActive: false,
          shieldCooldown: false,
          lastShotTime: 0
        };
      }
      if (!player2) {
        player2 = {
          id: "other-player",
          x: canvas.width/2 + 60,
          y: canvas.height - 50,
          width: 40,
          height: 20,
          speed: 7, // Changed from 5 to 7
          lives: 3,
          shieldActive: false,
          shieldCooldown: false,
          lastShotTime: 0
        };
      }
    }
  } else if (gameMode === "singleplayer") {
    player1 = { 
      x: canvas.width/2 - 20, 
      y: canvas.height - 50, 
      width: 40, 
      height: 20, 
      speed: 7, // Changed from 5 to 7
      lives: 3, 
      shieldActive: false, 
      shieldCooldown: false, 
      lastShotTime: 0, 
      name: document.getElementById("createName").value || "Player1" 
    };
  } else {
    player1 = { 
      x: canvas.width/2 - 100, 
      y: canvas.height - 50, 
      width: 40, 
      height: 20, 
      speed: 7, // Changed from 5 to 7
      lives: 3, 
      shieldActive: false, 
      shieldCooldown: false, 
      lastShotTime: 0, 
      name: document.getElementById("createName").value || "Player1" 
    };
    player2 = { 
      x: canvas.width/2 + 60, 
      y: canvas.height - 50, 
      width: 40, 
      height: 20, 
      speed: 7, // Changed from 5 to 7
      lives: 3, 
      shieldActive: false, 
      shieldCooldown: false, 
      lastShotTime: 0, 
      name: document.getElementById("joinName").value || "Player2" 
    };
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
  lastTime = performance.now();
  animationFrameId = requestAnimationFrame(draw);
}

// Add game state sync functions
function syncGameState() {
  if (gameMode === "multiplayer_online" && currentLobbyId) {
    socket.emit('fullGameSync', {
      lobbyId: currentLobbyId,
      gameState: {
        bullets,
        invaderBullets,
        invaders,
        boss,
        barriers,
        teamScore,
        invaderLevel,
        invaderSpeed,
        gamePaused,
        // Include only player states, not positions
        player1: {
          lives: player1.lives,
          shieldActive: player1.shieldActive
        },
        player2: {
          lives: player2.lives,
          shieldActive: player2.shieldActive
        }
      }
    });
  }
}

// Add new event listener for full game sync
socket.on('gameStateSync', (gameState) => {
  if (gameMode === "multiplayer_online") {
    // Update player positions and states
    if (socket.id === player1.id) {
      player2.x = gameState.player2.x;
      player2.y = gameState.player2.y;
      player2.lives = gameState.player2.lives;
      player2.shieldActive = gameState.player2.shieldActive;
    } else {
      player1.x = gameState.player1.x;
      player1.y = gameState.player1.y;
      player1.lives = gameState.player1.lives;
      player1.shieldActive = gameState.player1.shieldActive;
    }

    // Sync game elements
    bullets = gameState.bullets;
    invaderBullets = gameState.invaderBullets;
    invaders = gameState.invaders;
    boss = gameState.boss;
    barriers = gameState.barriers;
    teamScore = gameState.teamScore;
    invaderLevel = gameState.invaderLevel;
    invaderSpeed = gameState.invaderSpeed;

    updateInfoDisplay();
    
    // Sync pause state
    if (gameState.gamePaused !== gamePaused) {
      gamePaused = gameState.gamePaused;
      const shop = document.getElementById('shop');
      shop.style.display = gamePaused ? 'block' : 'none';
      if (!gamePaused) {
        draw();
      }
    }
  }
});

// Update the socket event handlers for game state sync
socket.on('bulletUpdate', ({ bullets: newBullets, invaderBullets: newInvaderBullets }) => {
  if (gameMode === "multiplayer_online") {
    bullets = newBullets;
    invaderBullets = newInvaderBullets;
  }
});

socket.on('enemyUpdate', ({ invaders: newInvaders, boss: newBoss }) => {
  if (gameMode === "multiplayer_online") {
    invaders = newInvaders;
    boss = newBoss;
  }
});

socket.on('scoreUpdate', ({ teamScore: newScore, invaderLevel: newLevel }) => {
  if (gameMode === "multiplayer_online") {
    teamScore = newScore;
    invaderLevel = newLevel;
    updateInfoDisplay();
  }
});

socket.on('gameStateUpdate', (state) => {
  if (gameMode === "multiplayer_online") {
    invaders = state.invaders;
    teamScore = state.teamScore;
    invaderLevel = state.invaderLevel;
    invaderSpeed = state.invaderSpeed;
    barriers = state.barriers;
    updateInfoDisplay();
  }
});

// Improve movement sync handler
socket.on('playerMoved', ({ playerId, x }) => {
  if (gameMode === "multiplayer_online") {
    if (playerId !== socket.id) {
      if (player1 && player1.id === playerId) {
        player1.x = x;
      } else if (player2 && player2.id === playerId) {
        player2.x = x;
      }
    }
  }
});

socket.on('playerShot', ({ playerId, bulletData }) => {
  if (gameMode === "multiplayer_online") {
    bullets.push(bulletData);
  }
});

// Add these new event listeners
socket.on('playerLivesUpdate', ({ player1Lives, player2Lives }) => {
  if (gameMode === "multiplayer_online") {
    player1.lives = player1Lives;
    player2.lives = player2Lives;
    updateInfoDisplay();
  }
});

socket.on('playerLeft', ({ message }) => {
  alert(message);
  backToLanding();
});

socket.on('playAgainResult', ({ restart, message }) => {
  if (restart) {
    // Reset game state
    resetGameState();
    // Start new game
    startGame();
  } else {
    alert(message || "Game ended - returning to lobby");
    backToLanding();
  }
});

// Add vote update handler
socket.on('voteUpdate', ({ votes, needed }) => {
  if (document.getElementById('voteStatus')) {
    document.getElementById('voteStatus').innerText = 
      `Votes to restart: ${votes} / ${needed}`;
  }
});

// Add new leave game immediately function
function leaveGameImmediately() {
  if (currentLobbyId) {
    socket.emit('playerLeft', { lobbyId: currentLobbyId });
  }
  backToLanding();
}

socket.on("joinLobby", ({ lobbyId, lobby }) => {
  console.log('Joined lobby:', lobbyId, lobby);
  currentLobbyId = lobbyId;
  document.getElementById("lobbyScreen").style.display = "none";
  document.getElementById("waitingScreen").style.display = "block";
  updateLobbyPlayersTable(lobby);
});

socket.on("lobbyUpdate", (lobby) => {
  console.log('Lobby updated:', lobby);
  updateLobbyPlayersTable(lobby);
  
  // Start game automatically when 2 players join
  if (lobby.players.length === 2) {
    console.log('Starting game with players:', lobby.players);
    document.getElementById("waitingScreen").style.display = "none";
    
    // Set player IDs before starting game
    if (socket.id === lobby.players[1].id) {
      // Second player joins
      console.log('Initializing as Player 2');
      player2 = {
        id: socket.id,
        x: canvas.width/2 + 60,
        y: canvas.height - 50,
        width: 40,
        height: 20,
        speed: 7, // Changed from 5 to 7
        lives: 3,
        shieldActive: false,
        shieldCooldown: false,
        lastShotTime: 0,
        name: lobby.players[1].name
      };
      player1 = {
        id: lobby.players[0].id,
        x: canvas.width/2 - 100,
        y: canvas.height - 50,
        width: 40,
        height: 20,
        speed: 7, // Changed from 5 to 7
        lives: 3,
        shieldActive: false,
        shieldCooldown: false,
        lastShotTime: 0,
        name: lobby.players[0].name
      };
    } else {
      // First player (host)
      console.log('Initializing as Player 1');
      player1 = {
        id: socket.id,
        x: canvas.width/2 - 100,
        y: canvas.height - 50,
        width: 40,
        height: 20,
        speed: 7, // Changed from 5 to 7
        lives: 3,
        shieldActive: false,
        shieldCooldown: false,
        lastShotTime: 0,
        name: lobby.players[0].name
      };
      player2 = {
        id: lobby.players[1].id,
        x: canvas.width/2 + 60,
        y: canvas.height - 50,
        width: 40,
        height: 20,
        speed: 7, // Changed from 5 to 7
        lives: 3,
        shieldActive: false,
        shieldCooldown: false,
        lastShotTime: 0,
        name: lobby.players[1].name
      };
    }
    startGame();
  }
});

// Update the lobby event handlers
socket.on("lobbyUpdate", (lobby) => {
  console.log('Lobby updated:', lobby);
  updateLobbyPlayersTable(lobby);
  
  // Only show start button to host when 2 players are present
  const isHost = socket.id === lobby.players[0]?.id;
  const hasEnoughPlayers = lobby.players.length === 2;
  document.getElementById("hostStartButton").style.display = 
    (isHost && hasEnoughPlayers) ? "block" : "none";
});

// Update forceGameStart handler to focus on game only
socket.on("forceGameStart", () => {
  console.log('Force game start received');
  
  // Hide all non-game elements
  document.getElementById("waitingScreen").style.display = "none";
  document.getElementById("lobbyScreen").style.display = "none";
  document.getElementById("landingScreen").style.display = "none";
  document.getElementById("multiplayerOptions").style.display = "none";
  document.getElementById("guideScreen").style.display = "none";
  
  // Show only game container
  document.getElementById("gameContainer").style.display = "block";
  
  // Get the current lobby data before starting
  const currentLobby = lobbies.find(l => l.id === currentLobbyId);
  if (currentLobby && currentLobby.players.length === 2) {
    // Initialize players properly
    if (socket.id === currentLobby.players[1].id) {
      console.log('Initializing as Player 2');
      player2 = {
        id: socket.id,
        x: canvas.width/2 + 60,
        y: canvas.height - 50,
        width: 40,
        height: 20,
        speed: 7, // Changed from 5 to 7
        lives: 3,
        shieldActive: false,
        shieldCooldown: false,
        lastShotTime: 0,
        name: currentLobby.players[1].name
      };
      player1 = {
        id: currentLobby.players[0].id,
        x: canvas.width/2 - 100,
        y: canvas.height - 50,
        width: 40,
        height: 20,
        speed: 7, // Changed from 5 to 7
        lives: 3,
        shieldActive: false,
        shieldCooldown: false,
        lastShotTime: 0,
        name: currentLobby.players[0].name
      };
    } else {
      console.log('Initializing as Player 1');
      player1 = {
        id: socket.id,
        x: canvas.width/2 - 100,
        y: canvas.height - 50,
        width: 40,
        height: 20,
        speed: 7, // Changed from 5 to 7
        lives: 3,
        shieldActive: false,
        shieldCooldown: false,
        lastShotTime: 0,
        name: currentLobby.players[0].name
      };
      player2 = {
        id: currentLobby.players[1].id,
        x: canvas.width/2 + 60,
        y: canvas.height - 50,
        width: 40,
        height: 20,
        speed: 7, // Changed from 5 to 7
        lives: 3,
        shieldActive: false,
        shieldCooldown: false,
        lastShotTime: 0,
        name: currentLobby.players[1].name
      };
    }
  }
  
  initGame();
});

// Fix player movement handling for better synchronization
function handlePlayerMovement() {
  if (gameMode === "multiplayer_online") {
    // Identify which player is controlled by this client
    let myPlayer = null;
    if (socket.id === player1?.id) myPlayer = player1;
    else if (socket.id === player2?.id) myPlayer = player2;
    
    if (myPlayer && myPlayer.lives > 0) {
      let moved = false;
      let newX = myPlayer.x;
      
      if (keysP1["KeyA"]) {
        newX -= myPlayer.speed;
        if (newX < 0) newX = 0;
        moved = true;
      }
      if (keysP1["KeyD"]) {
        newX += myPlayer.speed;
        if (newX + myPlayer.width > canvas.width) {
          newX = canvas.width - myPlayer.width;
        }
        moved = true;
      }
      
      // Only update position and send movement if actually moved
      if (moved && newX !== myPlayer.x) {
        myPlayer.x = newX;
        
        // Send movement update to server with low latency
        socket.emit('playerMove', {
          lobbyId: currentLobbyId,
          playerId: myPlayer.id,
          x: newX,
          timestamp: Date.now()
        });
      }
      
      if (keysP1["Space"]) {
        shoot(myPlayer);
        keysP1["Space"] = false;
      }
    }
  } else {
    if (gameMode === "singleplayer") {
      if (player1.lives > 0) {
        if (keysP1["KeyA"]) { player1.x -= player1.speed; if (player1.x < 0) player1.x = 0; }
        if (keysP1["KeyD"]) { player1.x += player1.speed; if (player1.x + player1.width > canvas.width) player1.x = canvas.width - player1.width; }
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
}

// Fix draw players function
function drawPlayers() {
  if (gameMode === "multiplayer_online") {
    // Make sure player objects exist before trying to draw them
    if (!player1 || !player2) return;
    
    // Draw player 1
    if (player1.lives > 0) {
      ctx.fillStyle = player1.id === socket.id ? 'white' : 'cyan';
      ctx.fillRect(player1.x, player1.y, player1.width, player1.height);
      if (player1.shieldActive) {
        ctx.strokeStyle = player1.id === socket.id ? 'white' : 'cyan';
        ctx.lineWidth = 3;
        ctx.strokeRect(player1.x - 5, player1.y - 5, player1.width + 10, player1.height + 10);
      }
    }
    
    // Draw player 2
    if (player2.lives > 0) {
      ctx.fillStyle = player2.id === socket.id ? 'white' : 'cyan';
      ctx.fillRect(player2.x, player2.y, player2.width, player2.height);
      if (player2.shieldActive) {
        ctx.strokeStyle = player2.id === socket.id ? 'white' : 'cyan';
        ctx.lineWidth = 3;
        ctx.strokeRect(player2.x - 5, player2.y - 5, player2.width + 10, player2.height + 10);
      }
    }
  } else if (gameMode === "singleplayer") {
    // Single player mode
    if (player1 && player1.lives > 0) {
      ctx.fillStyle = 'white';
      ctx.fillRect(player1.x, player1.y, player1.width, player1.height);
      if (player1.shieldActive) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.strokeRect(player1.x - 5, player1.y - 5, player1.width + 10, player1.height + 10);
      }
    }
  } else {
    // Local multiplayer mode
    if (player1 && player1.lives > 0) {
      ctx.fillStyle = 'white';
      ctx.fillRect(player1.x, player1.y, player1.width, player1.height);
      if (player1.shieldActive) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.strokeRect(player1.x - 5, player1.y - 5, player1.width + 10, player1.height + 10);
      }
    }
    if (player2 && player2.lives > 0) {
      ctx.fillStyle = 'cyan';
      ctx.fillRect(player2.x, player2.y, player2.width, player2.height);
      if (player2.shieldActive) {
        ctx.strokeStyle = 'cyan';
        ctx.lineWidth = 3;
        ctx.strokeRect(player2.x - 5, player2.y - 5, player2.width + 10, player2.height + 10);
      }
    }
  }
}

// Fix the main draw function to prevent double-drawing
// Fix game speed with proper animation frame timing
function draw(currentTime) {
  if (gamePaused) return;

  animationFrameId = requestAnimationFrame(draw);
  
  if (!currentTime) currentTime = performance.now();
  
  const deltaTime = currentTime - lastTime;
  if (deltaTime < FRAME_TIME) return;
  
  lastTime = currentTime;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  handlePlayerMovement();
  drawInvaders();
  updateBullets();
  drawBarriers();
  drawPlayers();
  
  // Draw bullets
  ctx.fillStyle = 'yellow';
  bullets.forEach(bullet => ctx.fillRect(bullet.x, bullet.y, 5, 10));
  ctx.fillStyle = 'red';
  invaderBullets.forEach(bullet => ctx.fillRect(bullet.x, bullet.y, 5, 10));
  
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
}

// Update start animation
function initGame() {
  if (gameMode === "multiplayer_online") {
    console.log('Game starting with players:', { player1, player2 });
    
    // Ensure both players are initialized
    if (!player1 || !player2) {
      console.error("Players not properly initialized!");
      // Create default players if they don't exist (fallback)
      if (!player1) {
        player1 = {
          id: socket.id,
          x: canvas.width/2 - 100,
          y: canvas.height - 50,
          width: 40,
          height: 20,
          speed: 7, // Changed from 5 to 7
          lives: 3,
          shieldActive: false,
          shieldCooldown: false,
          lastShotTime: 0
        };
      }
      if (!player2) {
        player2 = {
          id: "other-player",
          x: canvas.width/2 + 60,
          y: canvas.height - 50,
          width: 40,
          height: 20,
          speed: 7, // Changed from 5 to 7
          lives: 3,
          shieldActive: false,
          shieldCooldown: false,
          lastShotTime: 0
        };
      }
    }
  } else if (gameMode === "singleplayer") {
    player1 = { x: canvas.width/2 - 20, y: canvas.height - 50, width: 40, height: 20, speed: 7, lives: 3, shieldActive: false, shieldCooldown: false, lastShotTime: 0, name: document.getElementById("createName").value || "Player1" };
  } else {
    player1 = { x: canvas.width/2 - 100, y: canvas.height - 50, width: 40, height: 20, speed: 7, lives: 3, shieldActive: false, shieldCooldown: false, lastShotTime: 0, name: document.getElementById("createName").value || "Player1" };
    player2 = { x: canvas.width/2 + 60, y: canvas.height - 50, width: 40, height: 20, speed: 7, lives: 3, shieldActive: false, shieldCooldown: false, lastShotTime: 0, name: document.getElementById("joinName").value || "Player2" };
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
  lastTime = performance.now();
  animationFrameId = requestAnimationFrame(draw);
}

// Add game state sync functions
function syncGameState() {
  if (gameMode === "multiplayer_online" && currentLobbyId) {
    socket.emit('fullGameSync', {
      lobbyId: currentLobbyId,
      gameState: {
        bullets,
        invaderBullets,
        invaders,
        boss,
        barriers,
        teamScore,
        invaderLevel,
        invaderSpeed,
        gamePaused,
        // Include only player states, not positions
        player1: {
          lives: player1.lives,
          shieldActive: player1.shieldActive
        },
        player2: {
          lives: player2.lives,
          shieldActive: player2.shieldActive
        }
      }
    });
  }
}

// Add new event listener for full game sync
socket.on('gameStateSync', (gameState) => {
  if (gameMode === "multiplayer_online") {
    // Update player positions and states
    if (socket.id === player1.id) {
      player2.x = gameState.player2.x;
      player2.y = gameState.player2.y;
      player2.lives = gameState.player2.lives;
      player2.shieldActive = gameState.player2.shieldActive;
    } else {
      player1.x = gameState.player1.x;
      player1.y = gameState.player1.y;
      player1.lives = gameState.player1.lives;
      player1.shieldActive = gameState.player1.shieldActive;
    }

    // Sync game elements
    bullets = gameState.bullets;
    invaderBullets = gameState.invaderBullets;
    invaders = gameState.invaders;
    boss = gameState.boss;
    barriers = gameState.barriers;
    teamScore = gameState.teamScore;
    invaderLevel = gameState.invaderLevel;
    invaderSpeed = gameState.invaderSpeed;

    updateInfoDisplay();
    
    // Sync pause state
    if (gameState.gamePaused !== gamePaused) {
      gamePaused = gameState.gamePaused;
      const shop = document.getElementById('shop');
      shop.style.display = gamePaused ? 'block' : 'none';
      if (!gamePaused) {
        draw();
      }
    }
  }
});

// Update the socket event handlers for game state sync
socket.on('bulletUpdate', ({ bullets: newBullets, invaderBullets: newInvaderBullets }) => {
  if (gameMode === "multiplayer_online") {
    bullets = newBullets;
    invaderBullets = newInvaderBullets;
  }
});

socket.on('enemyUpdate', ({ invaders: newInvaders, boss: newBoss }) => {
  if (gameMode === "multiplayer_online") {
    invaders = newInvaders;
    boss = newBoss;
  }
});

socket.on('scoreUpdate', ({ teamScore: newScore, invaderLevel: newLevel }) => {
  if (gameMode === "multiplayer_online") {
    teamScore = newScore;
    invaderLevel = newLevel;
    updateInfoDisplay();
  }
});

socket.on('gameStateUpdate', (state) => {
  if (gameMode === "multiplayer_online") {
    invaders = state.invaders;
    teamScore = state.teamScore;
    invaderLevel = state.invaderLevel;
    invaderSpeed = state.invaderSpeed;
    barriers = state.barriers;
    updateInfoDisplay();
  }
});

// Improve movement sync handler
socket.on('playerMoved', ({ playerId, x }) => {
  if (gameMode === "multiplayer_online") {
    if (playerId !== socket.id) {
      if (player1 && player1.id === playerId) {
        player1.x = x;
      } else if (player2 && player2.id === playerId) {
        player2.x = x;
      }
    }
  }
});

socket.on('playerShot', ({ playerId, bulletData }) => {
  if (gameMode === "multiplayer_online") {
    bullets.push(bulletData);
  }
});

// Add these new event listeners
socket.on('playerLivesUpdate', ({ player1Lives, player2Lives }) => {
  if (gameMode === "multiplayer_online") {
    player1.lives = player1Lives;
    player2.lives = player2Lives;
    updateInfoDisplay();
  }
});

socket.on('playerLeft', ({ message }) => {
  alert(message);
  backToLanding();
});

socket.on('playAgainResult', ({ restart, message }) => {
  if (restart) {
    // Reset game state
    resetGameState();
    // Start new game
    startGame();
  } else {
    alert(message || "Game ended - returning to lobby");
    backToLanding();
  }
});

// Add vote update handler
socket.on('voteUpdate', ({ votes, needed }) => {
  if (document.getElementById('voteStatus')) {
    document.getElementById('voteStatus').innerText = 
      `Votes to restart: ${votes} / ${needed}`;
  }
});

// Add new leave game immediately function
function leaveGameImmediately() {
  if (currentLobbyId) {
    socket.emit('playerLeft', { lobbyId: currentLobbyId });
  }
  backToLanding();
}

// Remove duplicate socket handler registrations
socket.removeAllListeners('forceGameStart');
socket.removeAllListeners('lobbyUpdate');
socket.removeAllListeners('playerMoved');
socket.removeAllListeners('playAgainResult');
socket.removeAllListeners('playerLeft');
socket.removeAllListeners('voteUpdate');
socket.removeAllListeners('gameStateSync');

// Add helper function for player initialization
function initializePlayers(lobby, isPlayer2) {
  if (isPlayer2) {
    player2 = createPlayer(socket.id, canvas.width/2 + 60, lobby.players[1].name);
    player1 = createPlayer(lobby.players[0].id, canvas.width/2 - 100, lobby.players[0].name);
  } else {
    player1 = createPlayer(socket.id, canvas.width/2 - 100, lobby.players[0].name);
    player2 = createPlayer(lobby.players[1].id, canvas.width/2 + 60, lobby.players[1].name);
  }
}

// Add helper function to create player objects
function createPlayer(id, x, name) {
  return {
    id: id,
    x: x,
    y: canvas.height - 50,
    width: 40,
    height: 20,
    speed: 7, // Changed from 5 to 7 for better control
    lives: 3,
    shieldActive: false,
    shieldCooldown: false,
    lastShotTime: 0,
    name: name || "Player"
  };
}

// Re-register the event handlers
socket.on("lobbyUpdate", (lobby) => {
  console.log('Lobby updated:', lobby);
  updateLobbyPlayersTable(lobby);
  
  if (lobby.players.length === 2) {
    // Auto-start the game if 2 players have joined
    document.getElementById("waitingScreen").style.display = "none";
    
    // Initialize players based on which ID we are
    if (socket.id === lobby.players[1].id) {
      initializePlayers(lobby, true);
    } else {
      initializePlayers(lobby, false);
    }
    
    startGame();
  }
  
  // Show start button only to the host when 2 players are present
  const isHost = socket.id === lobby.players[0]?.id;
  const hasEnoughPlayers = lobby.players.length === 2;
  document.getElementById("hostStartButton").style.display = 
    (isHost && hasEnoughPlayers) ? "block" : "none";
});

socket.on("forceGameStart", () => {
  console.log('Force game start received');
  
  // Hide ALL UI elements except game
  const elements = ["waitingScreen", "lobbyScreen", "landingScreen", 
                   "multiplayerOptions", "guideScreen", "gameOverPopup", "shop"];
  elements.forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.style.display = "none";
  });
  
  document.getElementById("gameContainer").style.display = "block";
  
  // Initialize players
  const currentLobby = lobbies.find(l => l.id === currentLobbyId);
  if (currentLobby && currentLobby.players.length === 2) {
    if (socket.id === currentLobby.players[1].id) {
      initializePlayers(currentLobby, true);
    } else {
      initializePlayers(currentLobby, false);
    }
  }
  
  initGame();
});

// Fix the draw function to properly handle frame timing
function draw(currentTime) {
  if (gamePaused) return;

  // Request next frame first to ensure continuous animation
  animationFrameId = requestAnimationFrame(draw);
  
  if (!currentTime) currentTime = performance.now();
  
  const deltaTime = currentTime - lastTime;
  if (deltaTime < FRAME_TIME) return; // Skip this frame if too soon
  
  lastTime = currentTime;
  
  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Game logic
  handlePlayerMovement();
  updateInvaders();
  updateBullets();
  
  // Draw game elements
  drawInvaders();
  drawBarriers();
  drawPlayers();
  
  // Draw bullets
  ctx.fillStyle = 'yellow';
  bullets.forEach(bullet => ctx.fillRect(bullet.x, bullet.y, 5, 10));
  ctx.fillStyle = 'red';
  invaderBullets.forEach(bullet => ctx.fillRect(bullet.x, bullet.y, 5, 10));
  
  // Check for level completion
  if (checkAllEnemiesDefeated() && !nextLevelScheduled) {
    nextLevelScheduled = true;
    setTimeout(() => { nextLevel(); nextLevelScheduled = false; }, 2000);
  }
  
  // Check for game over
  if ((gameMode === "singleplayer" && player1.lives <= 0) ||
      (gameMode !== "singleplayer" && player1.lives <= 0 && player2.lives <= 0)) {
    gameOver();
    return;
  }
}

// Make sure we're using the right function for player movement updates
socket.on('playerMoved', ({ playerId, x }) => {
  if (gameMode === "multiplayer_online" && playerId !== socket.id) {
    if (player1 && player1.id === playerId) {
      player1.x = x;
    } else if (player2 && player2.id === playerId) {
      player2.x = x;
    }
  }
});

// Add functions for game over screen
function playAgain() {
  if (gameMode === "multiplayer_online") {
    votePlayAgain('yes');
  } else {
    resetGameState();
    startGame();
  }
}

function leaveGame() {
  if (gameMode === "multiplayer_online") {
    votePlayAgain('no');
  } else {
    backToLanding();
  }
}

// Add manual lobby refresh button
function refreshLobbies() {
  console.log('Requesting lobby refresh');
  socket.emit('requestLobbyList');
}
