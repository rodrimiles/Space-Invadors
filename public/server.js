// server.js
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const socketIo = require('socket.io');
const io = socketIo(server);

// Serve static files from the current directory
app.use(express.static(__dirname));

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// In-memory storage for lobbies and leaderboard
let lobbies = {};
let lobbyCounter = 1;
let leaderboard = []; // Array of { username, score }

// Helper: update leaderboard with a new score
function updateLeaderboard(username, score) {
  leaderboard.push({ username, score });
  // Sort descending by score
  leaderboard.sort((a, b) => b.score - a.score);
  // Keep only top 10 scores (for example)
  leaderboard = leaderboard.slice(0, 10);
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // When a client connects, send the current lobby list and leaderboard
  socket.emit('lobbyList', getPublicLobbies());
  socket.emit('leaderboardUpdate', leaderboard);

  socket.on('createLobby', (data) => {
    // data: { createName, lobbyName, private, password }
    let lobbyId = 'lobby' + lobbyCounter++;
    lobbies[lobbyId] = {
      id: lobbyId,
      lobbyName: data.lobbyName,
      host: socket.id,
      players: [{ id: socket.id, name: data.createName }],
      private: data.private,
      password: data.password || ''
    };
    socket.join(lobbyId);
    // Emit lobbyCreated event with lobby info.
    socket.emit('lobbyCreated', { lobbyId, lobby: lobbies[lobbyId] });
    io.emit('lobbyList', getPublicLobbies());
  });

  socket.on('joinLobby', (data) => {
    // data: { lobbyId, joinName, password }
    let lobby = lobbies[data.lobbyId];
    if (!lobby) {
      socket.emit('joinError', { message: 'Lobby does not exist' });
      return;
    }
    if (lobby.private && lobby.password !== data.password) {
      socket.emit('joinError', { message: 'Incorrect password' });
      return;
    }
    if (lobby.players.length >= 2) {
      socket.emit('joinError', { message: 'Lobby is full' });
      return;
    }
    lobby.players.push({ id: socket.id, name: data.joinName });
    socket.join(data.lobbyId);
    io.to(data.lobbyId).emit('lobbyUpdate', lobby);
    io.emit('lobbyList', getPublicLobbies());
  });

  socket.on('cancelLobby', (data) => {
    // data: { lobbyId }
    let lobby = lobbies[data.lobbyId];
    if (lobby && lobby.host === socket.id) {
      io.to(data.lobbyId).emit('lobbyCancelled', { message: 'Lobby cancelled by host.' });
      delete lobbies[data.lobbyId];
      io.emit('lobbyList', getPublicLobbies());
    }
  });
  
  // Example: when a game finishes, the client sends a score update
  socket.on('gameFinished', (data) => {
    // data: { username, score }
    updateLeaderboard(data.username, data.score);
    io.emit('leaderboardUpdate', leaderboard);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    for (let lobbyId in lobbies) {
      let lobby = lobbies[lobbyId];
      lobby.players = lobby.players.filter(p => p.id !== socket.id);
      if (lobby.players.length === 0) {
        delete lobbies[lobbyId];
      } else {
        // If the host disconnects, cancel the lobby.
        if (lobby.host === socket.id) {
          io.to(lobbyId).emit('lobbyCancelled', { message: 'Lobby cancelled because host disconnected.' });
          delete lobbies[lobbyId];
        } else {
          io.to(lobbyId).emit('lobbyUpdate', lobby);
        }
      }
    }
    io.emit('lobbyList', getPublicLobbies());
  });
});

function getPublicLobbies() {
  let list = [];
  for (let lobbyId in lobbies) {
    let lobby = lobbies[lobbyId];
    // Return public lobbies that are not full.
    if (!lobby.private && lobby.players.length < 2) {
      list.push({ id: lobbyId, lobbyName: lobby.lobbyName, players: lobby.players });
    }
  }
  return list;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
