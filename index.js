const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Serve static files from the public folder
app.use(express.static(__dirname + '/public'));

io.on('connection', (socket) => {
  console.log('User connected: ' + socket.id);

  // Receive player movement and broadcast to others
  socket.on('playerMove', (data) => {
    socket.broadcast.emit('updaePlayer', { id: socket.id, data });
  });

  // Receive player shoot and broadcast to others
  socket.on('playerShoot', (data) => {
    socket.broadcast.emit('playerShoot', data);
  });

  // Notify when a player disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected: ' + socket.id);
    socket.broadcast.emit('playerDisconnected', { id: socket.id });
  });
});

http.listen(3000, () => { 
  console.log('Server running on port 3000');
});