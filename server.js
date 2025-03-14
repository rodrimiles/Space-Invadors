const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
// Update CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const server = http.createServer(app);
// Update Socket.IO configuration
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  path: '/socket.io'
});

let lobbies = [];
let gameStates = {}; // Store game states for each lobby
let playAgainVotes = {}; // Store play again votes for each lobby

io.on('connection', (socket) => {
  console.log('New client connected with ID:', socket.id);
  
  // Send initial lobby list on connection
  socket.emit('lobbyList', lobbies);
  
  // Add handler for manual refresh requests
  socket.on('requestLobbyList', () => {
    console.log('Lobby list requested by:', socket.id);
    socket.emit('lobbyList', lobbies);
  });

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

  socket.on('joinLobby', ({ lobbyId, joinName }) => {
    const lobby = lobbies.find(l => l.id === lobbyId);
    if (!lobby) {
      socket.emit('joinError', { message: 'Lobby not found' });
      return;
    }
    if (lobby.players.length >= 2) {
      socket.emit('joinError', { message: 'Lobby is full' });
      return;
    }
    
    // Add player to lobby
    lobby.players.push({ id: socket.id, name: joinName });
    socket.join(lobbyId);
    
    // Update everyone
    io.emit('lobbyList', lobbies);
    io.to(lobbyId).emit('lobbyUpdate', lobby);
    
    // Send confirmation to joining player
    socket.emit('joinLobby', { lobbyId, lobby });
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

  // Update player movement handler for immediate sync
  socket.on('playerMove', ({ lobbyId, playerId, x }) => {
    // Broadcast immediately to all clients in the lobby
    io.to(lobbyId).emit('playerMoved', { playerId, x });
    
    // Update game state
    if (gameStates[lobbyId]) {
      if (!gameStates[lobbyId].players) {
        gameStates[lobbyId].players = {};
      }
      gameStates[lobbyId].players[playerId] = { x };
    }
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
    
    // Force start the game for all players in the lobby
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

  socket.on('playerLeft', ({ lobbyId }) => {
    const lobby = lobbies.find(l => l.id === lobbyId);
    if (lobby) {
      io.to(lobbyId).emit('playerLeft', { 
        message: 'A player left the game. This lobby cannot continue.' 
      });
      // Clean up lobby data
      delete gameStates[lobbyId];
      delete playAgainVotes[lobbyId];
      lobbies = lobbies.filter(l => l.id !== lobbyId);
      io.emit('lobbyList', lobbies);
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

  // Send lobby list with all necessary info to clients
  socket.on('requestLobbyData', ({ lobbyId }) => {
    const lobby = lobbies.find(l => l.id === lobbyId);
    if (lobby) {
      socket.emit('lobbyData', lobby);
    } else {
      socket.emit('joinError', { message: 'Lobby not found' });
    }
  });
});

// Serve static files from public directory
app.use(express.static('public'));

// Add error handling
server.on('error', (error) => {
  console.error('Server error:', error);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});