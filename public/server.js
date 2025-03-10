const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:5500", "http://127.0.0.1:5500"],
    methods: ["GET", "POST"]
  }
});

let lobbies = [];

io.on('connection', (socket) => {
  console.log('New client connected with ID:', socket.id);

  socket.on('createLobby', (data) => {
    console.log('Create lobby request received:', data);
    try {
      const { createName, lobbyName, private, password } = data;
      const lobbyId = `${lobbyName}-${Date.now()}`;
      const lobby = {
        id: lobbyId,
        lobbyName,
        private,
        password,
        players: [{ id: socket.id, name: createName }],
      };
      lobbies.push(lobby);
      console.log('Lobby created:', lobby);
      
      socket.join(lobbyId);
      io.emit('lobbyList', lobbies.filter(l => !l.private));
      socket.emit('lobbyCreated', { lobbyId, lobby });
    } catch (error) {
      console.error('Error creating lobby:', error);
      socket.emit('error', { message: 'Failed to create lobby' });
    }
  });

  socket.on('joinLobby', ({ lobbyId, joinName, password }) => {
    const lobby = lobbies.find(l => l.id === lobbyId);
    if (!lobby) {
      socket.emit('joinError', { message: 'Lobby not found' });
      return;
    }
    if (lobby.private && lobby.password !== password) {
      socket.emit('joinError', { message: 'Incorrect password' });
      return;
    }
    if (lobby.players.length >= 2) {
      socket.emit('joinError', { message: 'Lobby is full' });
      return;
    }
    lobby.players.push({ id: socket.id, name: joinName });
    socket.join(lobbyId);
    io.emit('lobbyList', lobbies);
    io.to(lobbyId).emit('lobbyUpdate', lobby);
    socket.emit('lobbyJoined', { lobbyId, lobby });
  });

  socket.on('cancelLobby', ({ lobbyId }) => {
    lobbies = lobbies.filter(l => l.id !== lobbyId);
    io.emit('lobbyList', lobbies);
    io.to(lobbyId).emit('lobbyCancelled', { message: 'Lobby has been cancelled' });
  });

  // Add new event handlers for game synchronization
  socket.on('gameState', ({ lobbyId, state }) => {
    socket.to(lobbyId).emit('gameStateUpdate', state);
  });

  socket.on('playerMove', ({ lobbyId, playerId, x }) => {
    socket.to(lobbyId).emit('playerMoved', { playerId, x });
  });

  socket.on('playerShoot', ({ lobbyId, playerId, bulletData }) => {
    socket.to(lobbyId).emit('playerShot', { playerId, bulletData });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    lobbies.forEach(lobby => {
      lobby.players = lobby.players.filter(player => player.id !== socket.id);
    });
    lobbies = lobbies.filter(lobby => lobby.players.length > 0);
    io.emit('lobbyList', lobbies);
    console.log('Client disconnected');
  });
});

// Serve static files from public directory
app.use(express.static('public'));

// Add error handling
server.on('error', (error) => {
  console.error('Server error:', error);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});