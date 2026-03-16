import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Game state
  const rooms = new Map<string, {
    players: { id: string, symbol: 'X' | 'O', name: string, avatar: string, score: number }[],
    board: (string | null)[][],
    currentTurn: 'X' | 'O',
    winner: string | null,
    winningLine: {row: number, col: number}[] | null,
    timerId: NodeJS.Timeout | null,
    turnExpiresAt: number | null,
    timeoutWinner: string | null,
    resetTimerId?: NodeJS.Timeout | null,
    rematchRequests: string[]
  }>();

  const BOARD_SIZE = 20;
  const TURN_TIME_MS = 30000;

  function createEmptyBoard() {
    return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
  }

  function clearRoomTimer(room: any) {
    if (room.timerId) {
      clearTimeout(room.timerId);
      room.timerId = null;
    }
    if (room.resetTimerId) {
      clearTimeout(room.resetTimerId);
      room.resetTimerId = null;
    }
  }

  function resetRoom(roomId: string) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    clearRoomTimer(room);
    
    if (room.players.length === 2) {
      const p1 = room.players[0];
      const p2 = room.players[1];
      const tempSymbol = p1.symbol;
      p1.symbol = p2.symbol;
      p2.symbol = tempSymbol;
      
      io.to(p1.id).emit("playerSymbol", p1.symbol);
      io.to(p2.id).emit("playerSymbol", p2.symbol);
    }

    room.board = createEmptyBoard();
    room.currentTurn = 'X';
    room.winner = null;
    room.winningLine = null;
    room.timeoutWinner = null;
    room.rematchRequests = [];
    
    if (room.players.length === 2) {
      startTurnTimer(roomId);
    } else {
      room.turnExpiresAt = null;
    }

    io.to(roomId).emit("gameState", {
      board: room.board,
      currentTurn: room.currentTurn,
      winner: room.winner,
      winningLine: room.winningLine,
      playersCount: room.players.length,
      players: room.players,
      turnExpiresAt: room.turnExpiresAt,
      timeoutWinner: room.timeoutWinner,
      rematchRequests: room.rematchRequests
    });
  }

  function startTurnTimer(roomId: string) {
    const room = rooms.get(roomId);
    if (!room) return;

    clearRoomTimer(room);

    room.turnExpiresAt = Date.now() + TURN_TIME_MS;
    room.timerId = setTimeout(() => {
      const r = rooms.get(roomId);
      if (r && !r.winner) {
        r.winner = r.currentTurn === 'X' ? 'O' : 'X';
        r.timeoutWinner = r.winner;
        const winningPlayer = r.players.find(p => p.symbol === r.winner);
        if (winningPlayer) winningPlayer.score += 1;
        
        io.to(roomId).emit("gameState", {
          board: r.board,
          currentTurn: r.currentTurn,
          winner: r.winner,
          winningLine: r.winningLine,
          playersCount: r.players.length,
          players: r.players,
          turnExpiresAt: r.turnExpiresAt,
          timeoutWinner: r.timeoutWinner,
          rematchRequests: r.rematchRequests
        });
      }
    }, TURN_TIME_MS);
  }

  function checkWin(board: (string | null)[][], row: number, col: number, symbol: string) {
    const directions = [
      [[0, 1], [0, -1]], // horizontal
      [[1, 0], [-1, 0]], // vertical
      [[1, 1], [-1, -1]], // diagonal \
      [[1, -1], [-1, 1]] // diagonal /
    ];

    for (const dir of directions) {
      let count = 1;
      const line = [{row, col}];
      
      for (const [dr, dc] of dir) {
        let r = row + dr;
        let c = col + dc;
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === symbol) {
          count++;
          line.push({row: r, col: c});
          r += dr;
          c += dc;
        }
      }
      
      if (count >= 5) {
        return line;
      }
    }
    return null;
  }

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("joinRoom", ({ roomId, name, avatar }) => {
      socket.join(roomId);
      
      let room = rooms.get(roomId);
      if (!room) {
        room = {
          players: [{ id: socket.id, symbol: 'X', name, avatar, score: 0 }],
          board: createEmptyBoard(),
          currentTurn: 'X',
          winner: null,
          winningLine: null,
          timerId: null,
          turnExpiresAt: null,
          timeoutWinner: null,
          rematchRequests: []
        };
        rooms.set(roomId, room);
      } else if (room.players.length >= 2 && !room.players.find(p => p.id === socket.id)) {
        socket.emit("gameError", "Phòng đã đầy! Bạn đang xem với tư cách khán giả.");
      } else if (room.players.length < 2 && !room.players.find(p => p.id === socket.id)) {
        const existingSymbol = room.players[0].symbol;
        const newSymbol = existingSymbol === 'X' ? 'O' : 'X';
        room.players.push({ id: socket.id, symbol: newSymbol, name, avatar, score: 0 });
        if (room.players.length === 2) {
          startTurnTimer(roomId);
        }
      }

      const player = room.players.find(p => p.id === socket.id);
      
      io.to(roomId).emit("gameState", {
        board: room.board,
        currentTurn: room.currentTurn,
        winner: room.winner,
        winningLine: room.winningLine,
        playersCount: room.players.length,
        players: room.players,
        turnExpiresAt: room.turnExpiresAt,
        timeoutWinner: room.timeoutWinner,
        rematchRequests: room.rematchRequests
      });

      if (player) {
        socket.emit("playerSymbol", player.symbol);
      }
    });

    socket.on("makeMove", ({ roomId, row, col }) => {
      const room = rooms.get(roomId);
      if (!room) {
        socket.emit("gameError", "Phòng không tồn tại!");
        return;
      }
      if (room.winner) {
        socket.emit("gameError", "Trận đấu đã kết thúc!");
        return;
      }

      const player = room.players.find(p => p.id === socket.id);
      if (!player) {
        socket.emit("gameError", "Bạn không phải là người chơi trong phòng này!");
        return;
      }
      if (player.symbol !== room.currentTurn) {
        socket.emit("gameError", "Chưa đến lượt của bạn!");
        return;
      }

      if (room.board[row][col] !== null) {
        socket.emit("gameError", "Ô này đã được đánh!");
        return;
      }

      room.board[row][col] = player.symbol;
      
      const winningLine = checkWin(room.board, row, col, player.symbol);
      if (winningLine) {
        room.winner = player.symbol;
        room.winningLine = winningLine;
        player.score += 1;
        clearRoomTimer(room);
      } else {
        room.currentTurn = room.currentTurn === 'X' ? 'O' : 'X';
        startTurnTimer(roomId);
      }

      io.to(roomId).emit("gameState", {
        board: room.board,
        currentTurn: room.currentTurn,
        winner: room.winner,
        winningLine: room.winningLine,
        playersCount: room.players.length,
        players: room.players,
        turnExpiresAt: room.turnExpiresAt,
        timeoutWinner: room.timeoutWinner,
        rematchRequests: room.rematchRequests
      });
    });

    socket.on("requestRematch", (roomId) => {
      const room = rooms.get(roomId);
      if (!room) return;
      
      if (!room.rematchRequests.includes(socket.id)) {
        room.rematchRequests.push(socket.id);
      }
      
      if (room.rematchRequests.length === 2) {
        resetRoom(roomId);
      } else {
        io.to(roomId).emit("gameState", {
          board: room.board,
          currentTurn: room.currentTurn,
          winner: room.winner,
          winningLine: room.winningLine,
          playersCount: room.players.length,
          players: room.players,
          turnExpiresAt: room.turnExpiresAt,
          timeoutWinner: room.timeoutWinner,
          rematchRequests: room.rematchRequests
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      rooms.forEach((room, roomId) => {
        const index = room.players.findIndex(p => p.id === socket.id);
        if (index !== -1) {
          room.players.splice(index, 1);
          clearRoomTimer(room);
          
          // Clear the board when someone disconnects
          room.board = createEmptyBoard();
          room.winner = null;
          room.winningLine = null;
          room.timeoutWinner = null;
          room.currentTurn = 'X';
          room.turnExpiresAt = null;
          room.rematchRequests = [];

          io.to(roomId).emit("gameState", {
            board: room.board,
            currentTurn: room.currentTurn,
            winner: room.winner,
            winningLine: room.winningLine,
            playersCount: room.players.length,
            players: room.players,
            turnExpiresAt: room.turnExpiresAt,
            timeoutWinner: room.timeoutWinner,
            rematchRequests: room.rematchRequests
          });
          io.to(roomId).emit("playerDisconnected");
        }
      });
    });
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
