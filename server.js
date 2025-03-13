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
let gameStates = {}; // Store game states for each lobby
let playAgainVotes = {}; // Store play again votes for each lobby

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

  // Enhanced game state synchronization
  socket.on('gameState', ({ lobbyId, state }) => {
    gameStates[lobbyId] = state;
    socket.to(lobbyId).emit('gameStateUpdate', state);
  });

  socket.on('playerMove', ({ lobbyId, playerId, x, y }) => {
    if (gameStates[lobbyId]) {
      gameStates[lobbyId].players = gameStates[lobbyId].players || {};
      gameStates[lobbyId].players[playerId] = { x, y };
    }
    socket.to(lobbyId).emit('playerMoved', { playerId, x, y });
  });

  socket.on('playerShoot', ({ lobbyId, playerId, bulletData }) => {
    socket.to(lobbyId).emit('playerShot', { playerId, bulletData });
  });

  socket.on('playerStatus', ({ lobbyId, playerId, isAlive }) => {
    if (gameStates[lobbyId]) {
      gameStates[lobbyId].playerStatus = gameStates[lobbyId].playerStatus || {};
      gameStates[lobbyId].playerStatus[playerId] = isAlive;
      io.to(lobbyId).emit('playerStatusUpdate', { playerId, isAlive });
    }
  });

  socket.on('gameReset', ({ lobbyId }) => {
    delete gameStates[lobbyId];
    io.to(lobbyId).emit('forceGameReset');
  });

  socket.on('requestGameState', ({ lobbyId }) => {
    if (gameStates[lobbyId]) {
      socket.emit('fullGameState', gameStates[lobbyId]);
    }
  });

  // Update host start game handler
  socket.on('hostStartGame', ({ lobbyId }) => {
    const lobby = lobbies.find(l => l.id === lobbyId);
    if (!lobby) {
      socket.emit('gameStartError', 'Lobby not found');
      return;
    }
    if (lobby.players[0].id !== socket.id) {
      socket.emit('gameStartError', 'Only host can start the game');
      return;
    }
    if (lobby.players.length < 2) { // Change to require 2 players
      socket.emit('gameStartError', 'Need 2 players to start');
      return;
    }
    io.to(lobbyId).emit('forceGameStart');
  });

  // Add full game sync handler
  socket.on('fullGameSync', ({ lobbyId, gameState }) => {
    gameStates[lobbyId] = gameState;
    socket.to(lobbyId).emit('gameStateSync', gameState);
  });

  // Remove old sync handlers as they're now handled by fullGameSync
  // socket.on('bulletSync',...
  // socket.on('enemySync',...
  // socket.on('scoreSync',...
  // socket.on('playerStatusSync',...

  socket.on('playAgainVote', ({ lobbyId, vote, playerId }) => {
    if (!playAgainVotes[lobbyId]) {
      playAgainVotes[lobbyId] = {
        votes: new Map(),
        timeout: setTimeout(() => {
          // Clear votes after 30 seconds
          delete playAgainVotes[lobbyId];
          io.to(lobbyId).emit('playAgainResult', { 
            restart: false, 
            message: 'Vote timeout - too long to decide' 
          });
        }, 30000)
      };
    }

    playAgainVotes[lobbyId].votes.set(playerId, vote);
    
    // Send vote update to all players
    io.to(lobbyId).emit('voteUpdate', {
      votes: Array.from(playAgainVotes[lobbyId].votes.values()).filter(v => v === 'yes').length,
      needed: 2
    });
    
    const lobby = lobbies.find(l => l.id === lobbyId);
    if (lobby && playAgainVotes[lobbyId].votes.size === lobby.players.length) {
      clearTimeout(playAgainVotes[lobbyId].timeout);
      const allVotedYes = Array.from(playAgainVotes[lobbyId].votes.values())
                         .every(v => v === 'yes');
      
      io.to(lobbyId).emit('playAgainResult', {
        restart: allVotedYes,
        message: allVotedYes ? 'All players voted to restart' : 'Some players voted to leave'
      });
      
      delete playAgainVotes[lobbyId];
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    lobbies.forEach(lobby => {
      if (gameStates[lobby.id]) {
        delete gameStates[lobby.id].players?.[socket.id];
        delete gameStates[lobby.id].playerStatus?.[socket.id];
      }
      if (lobby.players.find(p => p.id === socket.id)) {
        io.to(lobby.id).emit('playerLeft', { message: 'A player left the game. This lobby cannot continue.' });
        // Remove the lobby and its game state
        delete gameStates[lobby.id];
        delete playAgainVotes[lobby.id];
      }
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