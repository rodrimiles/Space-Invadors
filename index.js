const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Servir arquivos estáticos da pasta public
app.use(express.static(__dirname + '/public'));

io.on('connection', (socket) => {
  console.log('Usuário conectado: ' + socket.id);

  // Recebe movimento do jogador e repassa para os outros
  socket.on('playerMove', (data) => {
    socket.broadcast.emit('updatePlayer', { id: socket.id, data });
  });

  // Recebe o tiro do jogador e repassa para os outros
  socket.on('playerShoot', (data) => {
    socket.broadcast.emit('playerShoot', data);
  });

  // Notifica quando um jogador desconecta
  socket.on('disconnect', () => {
    console.log('Usuário desconectado: ' + socket.id);
    socket.broadcast.emit('playerDisconnected', { id: socket.id });
  });
});

http.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
