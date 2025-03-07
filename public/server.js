const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let lobbies = [];

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('createLobby', ({ createName, lobbyName, private, password }) => {
    const lobbyId = `${lobbyName}-${Date.now()}`;
    const lobby = {
      id: lobbyId,
      lobbyName,
      private,
      password,
      players: [{ id: socket.id, name: createName }],
    };
    lobbies.push(lobby);
    socket.join(lobbyId);
    io.emit('lobbyList', lobbies);
    socket.emit('lobbyCreated', { lobbyId, lobby });
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

  socket.on('disconnect', () => {
    lobbies.forEach(lobby => {
      lobby.players = lobby.players.filter(player => player.id !== socket.id);
    });
    lobbies = lobbies.filter(lobby => lobby.players.length > 0);
    io.emit('lobbyList', lobbies);
    console.log('Client disconnected');
  });
});

app.use(express.static('public'));

server.listen(3000, () => {
  console.log('Server is running on port 3000');
});