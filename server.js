const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Peer-Liste mit Nicknames
const peers = new Map();

// Socket.io Client-Bibliothek verfügbar machen
app.get('/socket.io/socket.io.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules/socket.io/client-dist/socket.io.js'));
});

// Statische Dateien servieren
app.use(express.static(__dirname));

// Hauptseite
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Client verbunden:', socket.id);

  // Nickname registrieren
  socket.on('register', (data) => {
    const { nickname } = data;
    peers.set(socket.id, { id: socket.id, nickname });
    console.log('Client registriert:', socket.id, 'als', nickname);
    
    // Sende aktuelle Peer-Liste an neuen Client
    const peerList = Array.from(peers.values());
    socket.emit('peer-list', peerList);
    
    // Informiere alle anderen über neuen Peer
    socket.broadcast.emit('peer-joined', { id: socket.id, nickname });
  });

  // Broadcast-Request: Server fordert Sender auf, Offers für alle anderen zu erstellen
  socket.on('offer-broadcast', () => {
    console.log('Offer-Broadcast von', socket.id);
    
    // Hole alle anderen Client-IDs
    const allSockets = Array.from(io.sockets.sockets.keys());
    const otherClients = allSockets.filter(id => id !== socket.id);
    
    console.log('Sende create-offer an', socket.id, 'für Clients:', otherClients);
    
    // Fordere den Sender auf, für jeden anderen Client ein Offer zu erstellen
    otherClients.forEach(clientId => {
      socket.emit('create-offer', { to: clientId });
    });
  });

  // Offer weiterleiten
  socket.on('offer', (data) => {
    console.log('Offer von', socket.id, '→', data.to);
    socket.to(data.to).emit('offer', {
      from: socket.id,
      offer: data.offer
    });
  });

  // Answer weiterleiten
  socket.on('answer', (data) => {
    console.log('Answer von', socket.id, '→', data.to);
    socket.to(data.to).emit('answer', {
      from: socket.id,
      answer: data.answer
    });
  });

  // ICE Candidates weiterleiten
  socket.on('ice-candidate', (data) => {
    if (data.to) {
      socket.to(data.to).emit('ice-candidate', {
        from: socket.id,
        candidate: data.candidate
      });
    }
  });

  // PTT Start Event
  socket.on('ptt-start', () => {
    const peer = peers.get(socket.id);
    const nickname = peer ? peer.nickname : 'Unbekannt';
    console.log('PTT gestartet von', socket.id, '(', nickname, ')');
    socket.broadcast.emit('ptt-start', {
      from: socket.id,
      nickname: nickname
    });
  });

  // PTT Stop Event
  socket.on('ptt-stop', () => {
    const peer = peers.get(socket.id);
    const nickname = peer ? peer.nickname : 'Unbekannt';
    console.log('PTT gestoppt von', socket.id, '(', nickname, ')');
    socket.broadcast.emit('ptt-stop', {
      from: socket.id,
      nickname: nickname
    });
  });

  socket.on('disconnect', () => {
    console.log('Client getrennt:', socket.id);
    const peer = peers.get(socket.id);
    if (peer) {
      peers.delete(socket.id);
      // Informiere alle anderen über Disconnect
      socket.broadcast.emit('peer-left', { id: socket.id, nickname: peer.nickname });
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Signaling-Server läuft auf http://localhost:${PORT}`);
});
