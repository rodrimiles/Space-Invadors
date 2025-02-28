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

// In-memory lobby storage
let lobbies = {};
let lobbyCounter = 1;

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('createLobby', (data) => {
    // data: { name, private, password }
    let lobbyId = 'lobby' + lobbyCounter++;
    lobbies[lobbyId] = {
      id: lobbyId,
      host: socket.id,
      players: [{ id: socket.id, name: data.name }],
      private: data.private,
      password: data.password || ''
    };
    socket.join(lobbyId);
    socket.emit('lobbyCreated', { lobbyId, lobby: lobbies[lobbyId] });
    io.emit('lobbyList', getPublicLobbies());
  });

  socket.on('joinLobby', (data) => {
    // data: { lobbyId, name, password }
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
    lobby.players.push({ id: socket.id, name: data.name });
    socket.join(data.lobbyId);
    io.to(data.lobbyId).emit('lobbyJoined', { lobbyId: data.lobbyId, lobby });
    io.emit('lobbyList', getPublicLobbies());
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    for (let lobbyId in lobbies) {
      let lobby = lobbies[lobbyId];
      lobby.players = lobby.players.filter(p => p.id !== socket.id);
      if (lobby.players.length === 0) {
        delete lobbies[lobbyId];
      } else {
        io.to(lobbyId).emit('lobbyJoined', { lobbyId, lobby });
      }
    }
    io.emit('lobbyList', getPublicLobbies());
  });
});

function getPublicLobbies() {
  let list = [];
  for (let lobbyId in lobbies) {
    let lobby = lobbies[lobbyId];
    if (!lobby.private && lobby.players.length < 2) {
      list.push({ id: lobbyId, players: lobby.players });
    }
  }
  return list;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
