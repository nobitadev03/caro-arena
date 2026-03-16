import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Copy, RefreshCw, Users, Circle, X, UserX, Timer, AlertCircle, WifiOff } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BOARD_SIZE = 20;

interface Player {
  id: string;
  symbol: 'X' | 'O';
  name: string;
  avatar: string;
  score: number;
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [inputRoomId, setInputRoomId] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [playerAvatar, setPlayerAvatar] = useState<string>('');

  const [board, setBoard] = useState<(string | null)[][]>(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)));
  const [mySymbol, setMySymbol] = useState<'X' | 'O' | null>(null);
  const [currentTurn, setCurrentTurn] = useState<'X' | 'O'>('X');
  const [winner, setWinner] = useState<string | null>(null);
  const [winningLine, setWinningLine] = useState<{ row: number, col: number }[] | null>(null);
  const [playersCount, setPlayersCount] = useState<number>(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [copied, setCopied] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);

  const [turnExpiresAt, setTurnExpiresAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timeoutWinner, setTimeoutWinner] = useState<string | null>(null);
  const [rematchRequests, setRematchRequests] = useState<string[]>([]);

  const [isConnected, setIsConnected] = useState(true);
  const [toast, setToast] = useState<{ message: string, type: 'error' | 'info' } | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: 'error' | 'info' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    // Generate random avatar on load
    setPlayerAvatar(`https://api.dicebear.com/9.x/bottts/svg?seed=${Math.random().toString(36).substring(7)}`);

    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('gameState', (state) => {
      setBoard(state.board);
      setCurrentTurn(state.currentTurn);
      setWinner(state.winner);
      setWinningLine(state.winningLine);
      setPlayersCount(state.playersCount);
      setTurnExpiresAt(state.turnExpiresAt);
      setTimeoutWinner(state.timeoutWinner);
      setRematchRequests(state.rematchRequests || []);
      if (state.players) {
        setPlayers(state.players);
      }
    });

    newSocket.on('playerSymbol', (symbol) => {
      setMySymbol(symbol);
    });

    newSocket.on('playerDisconnected', () => {
      setOpponentDisconnected(true);
    });

    let disconnectTimeout: NodeJS.Timeout;

    newSocket.on('connect', () => {
      clearTimeout(disconnectTimeout);
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      clearTimeout(disconnectTimeout);
      disconnectTimeout = setTimeout(() => setIsConnected(false), 3000);
    });

    newSocket.on('gameError', (msg) => {
      showToast(msg, 'error');
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!turnExpiresAt || winner) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((turnExpiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [turnExpiresAt, winner]);

  const createRoom = () => {
    if (!playerName.trim()) return alert("Vui lòng nhập tên của bạn!");
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(newRoomId);
    socket?.emit('joinRoom', { roomId: newRoomId, name: playerName.trim(), avatar: playerAvatar });
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return alert("Vui lòng nhập tên của bạn!");
    if (inputRoomId.trim()) {
      const id = inputRoomId.trim().toUpperCase();
      setRoomId(id);
      socket?.emit('joinRoom', { roomId: id, name: playerName.trim(), avatar: playerAvatar });
    }
  };

  const handleCellClick = (row: number, col: number) => {
    if (!socket || !roomId || !mySymbol) return;

    if (winner) {
      showToast("Trận đấu đã kết thúc!");
      return;
    }
    if (currentTurn !== mySymbol) {
      showToast("Chưa đến lượt của bạn!");
      return;
    }
    if (board[row][col] !== null) {
      showToast("Ô này đã được đánh!");
      return;
    }

    socket.emit('makeMove', { roomId, row, col });
  };

  const requestRematch = () => {
    socket?.emit('requestRematch', roomId);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isWinningCell = (row: number, col: number) => {
    if (winningLine) {
      return winningLine.some(cell => cell.row === row && cell.col === col);
    }
    if (timeoutWinner && board[row][col] === timeoutWinner) {
      return true;
    }
    return false;
  };

  // Board is now fluid and centered automatically via Flexbox.

  if (!roomId) {
    return (
      <>
        {!isConnected && (
          <div className="fixed top-0 left-0 right-0 bg-red-500 text-white py-2 px-4 flex items-center justify-center gap-2 z-50 animate-in slide-in-from-top">
            <WifiOff className="w-4 h-4" />
            <span className="text-sm font-medium">Mất kết nối mạng. Đang thử kết nối lại...</span>
          </div>
        )}
        {toast && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom fade-in duration-200">
            <div className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-white font-medium",
              toast.type === 'error' ? "bg-red-500" : "bg-slate-800"
            )}>
              <AlertCircle className="w-5 h-5" />
              {toast.message}
            </div>
          </div>
        )}
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-indigo-600 p-6 sm:p-8 text-center">
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Caro Online</h1>
              <p className="text-indigo-100 text-sm sm:text-base">Chơi cờ Caro 5 nước với bạn bè</p>
            </div>

            <div className="p-6 sm:p-8 space-y-6 sm:space-y-8">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Thông tin của bạn</label>
                  <div className="flex gap-3 items-center">
                    <div className="relative group">
                      <img src={playerAvatar} alt="Avatar" className="w-14 h-14 rounded-full bg-slate-100 border-2 border-slate-200" />
                      <button
                        type="button"
                        onClick={() => setPlayerAvatar(`https://api.dicebear.com/9.x/bottts/svg?seed=${Math.random().toString(36).substring(7)}`)}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Đổi avatar"
                      >
                        <RefreshCw className="w-5 h-5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Nhập tên của bạn..."
                      className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                      maxLength={15}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <button
                  onClick={createRoom}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-lg transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  <Users className="w-5 h-5" />
                  Tạo phòng mới
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-slate-500">Hoặc tham gia phòng</span>
                </div>
              </div>

              <form onSubmit={joinRoom} className="space-y-4">
                <div>
                  <label htmlFor="roomId" className="block text-sm font-medium text-slate-700 mb-1">
                    Mã phòng
                  </label>
                  <input
                    type="text"
                    id="roomId"
                    value={inputRoomId}
                    onChange={(e) => setInputRoomId(e.target.value)}
                    placeholder="Nhập mã phòng (VD: A1B2C3)"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all uppercase"
                    maxLength={6}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!inputRoomId.trim()}
                  className="w-full py-4 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-lg transition-colors shadow-md"
                >
                  Tham gia
                </button>
              </form>
            </div>
          </div>
        </div>
      </>
    );
  }

  const playerX = players.find(p => p.symbol === 'X');
  const playerO = players.find(p => p.symbol === 'O');

  return (
    <>
      {!isConnected && (
        <div className="fixed top-0 left-0 right-0 bg-red-500 text-white py-2 px-4 flex items-center justify-center gap-2 z-50 animate-in slide-in-from-top">
          <WifiOff className="w-4 h-4" />
          <span className="text-sm font-medium">Mất kết nối mạng. Đang thử kết nối lại...</span>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom fade-in duration-200">
          <div className={cn(
            "flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-white font-medium",
            toast.type === 'error' ? "bg-red-500" : "bg-slate-800"
          )}>
            <AlertCircle className="w-5 h-5" />
            {toast.message}
          </div>
        </div>
      )}
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-slate-200 px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2 sm:gap-4">
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 hidden md:block">Caro Online</h1>
            <div className="flex items-center gap-1 sm:gap-2 bg-slate-100 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg">
              <span className="text-xs sm:text-sm font-medium text-slate-600 hidden sm:inline">Phòng:</span>
              <span className="font-mono text-sm sm:text-base font-bold text-indigo-600 tracking-wider">{roomId}</span>
              <button
                onClick={copyRoomId}
                className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors"
                title="Sao chép mã phòng"
              >
                <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              {copied && <span className="text-[10px] sm:text-xs text-green-600 font-medium absolute mt-8 sm:mt-8">Đã chép!</span>}
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium text-slate-600 bg-slate-100 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>{playersCount}/2</span>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="text-xs sm:text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              Thoát
            </button>
          </div>
        </header>

        {/* Game Status / Scoreboard */}
        <div className="bg-white border-b border-slate-200 px-2 sm:px-4 py-3 sm:py-4 shadow-sm z-10">
          <div className="max-w-4xl mx-auto flex items-center justify-between">

            {/* Player X */}
            <div className={cn("flex flex-col sm:flex-row items-center gap-1 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-2xl transition-all", currentTurn === 'X' ? "bg-blue-50 ring-2 ring-blue-500" : "opacity-50")}>
              <div className="relative">
                {playerX ? (
                  <img src={playerX.avatar} alt={playerX.name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 border-2 border-blue-200" />
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center">
                    <Users className="w-5 h-5 text-slate-400" />
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center shadow-sm">
                  <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" strokeWidth={3} />
                </div>
              </div>
              <div className="text-center sm:text-left">
                <div className="font-bold text-slate-800 text-[10px] sm:text-base max-w-[60px] sm:max-w-[100px] truncate">{playerX ? playerX.name : "Đang chờ..."}</div>
                <div className="text-[9px] sm:text-xs text-slate-500 font-medium">Điểm: {playerX?.score || 0}</div>
              </div>
            </div>

            {/* Score & Status */}
            <div className="flex flex-col items-center px-1 sm:px-4">
              <div className="text-xl sm:text-4xl font-black text-slate-800 tracking-widest">
                {playerX?.score || 0} - {playerO?.score || 0}
              </div>
              {winner ? (
                <div className="mt-1 sm:mt-2 text-[10px] sm:text-sm font-bold text-indigo-600 bg-indigo-50 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full animate-bounce text-center max-w-[120px] sm:max-w-none">
                  {timeoutWinner ? (
                    timeoutWinner === mySymbol ? "🎉 Đối thủ hết giờ!" : "⏳ Bạn hết giờ!"
                  ) : (
                    winner === mySymbol ? "🎉 Bạn thắng!" : winner === (mySymbol === 'X' ? 'O' : 'X') ? "😔 Bạn thua!" : `Hòa!`
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center mt-1">
                  <div className="text-[9px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider text-center mb-0.5 sm:mb-1">
                    Lượt của {currentTurn}
                  </div>
                  {timeLeft !== null && playersCount === 2 && (
                    <div className={cn(
                      "flex items-center gap-1 font-mono text-xs sm:text-base font-bold px-1.5 sm:px-2 py-0.5 rounded-full transition-colors",
                      timeLeft <= 10 ? "text-red-600 bg-red-100 animate-pulse" : "text-slate-600 bg-slate-100"
                    )}>
                      <Timer className="w-3 h-3 sm:w-4 sm:h-4" />
                      {timeLeft}s
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Player O */}
            <div className={cn("flex flex-col sm:flex-row items-center gap-1 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-2xl transition-all sm:flex-row-reverse text-center sm:text-left", currentTurn === 'O' ? "bg-red-50 ring-2 ring-red-500" : "opacity-50")}>
              <div className="relative">
                {playerO ? (
                  <img src={playerO.avatar} alt={playerO.name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 border-2 border-red-200" />
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center">
                    <Users className="w-5 h-5 text-slate-400" />
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 sm:-left-1 sm:right-auto bg-red-500 text-white w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center shadow-sm">
                  <Circle className="w-2.5 h-2.5 sm:w-3 sm:h-3" strokeWidth={3} />
                </div>
              </div>
              <div className="text-center sm:text-right">
                <div className="font-bold text-slate-800 text-[10px] sm:text-base max-w-[60px] sm:max-w-[100px] truncate">{playerO ? playerO.name : "Đang chờ..."}</div>
                <div className="text-[9px] sm:text-xs text-slate-500 font-medium">Điểm: {playerO?.score || 0}</div>
              </div>
            </div>

          </div>

          {/* Action buttons (Reset) */}
          {winner && mySymbol && (
            <div className="flex flex-col items-center gap-2 mt-4">
              {rematchRequests.includes(socket?.id || '') ? (
                <div className="text-slate-600 font-medium animate-pulse">
                  Đang chờ đối thủ đồng ý...
                </div>
              ) : (
                <button
                  onClick={requestRematch}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-medium transition-colors shadow-md"
                >
                  <RefreshCw className="w-4 h-4" />
                  {rematchRequests.length > 0 ? "Đồng ý tái đấu" : "Yêu cầu tái đấu"}
                </button>
              )}
              {rematchRequests.length === 1 && !rematchRequests.includes(socket?.id || '') && (
                <div className="text-indigo-600 font-medium text-sm">
                  Đối thủ muốn tái đấu!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Game Board */}
        <main className="flex-1 overflow-hidden bg-slate-200/50 flex items-center justify-center p-2 sm:p-4">
          <div className="w-full h-full max-w-[calc(100vh-180px)] aspect-square bg-white shadow-xl rounded-2xl p-1 sm:p-2 md:p-3 flex items-center justify-center">
            <div
              className="grid w-full h-full gap-0 border border-slate-300 bg-slate-300"
              style={{
                gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`
              }}
            >
              {board.map((row, rowIndex) => (
                row.map((cell, colIndex) => {
                  const isWinning = isWinningCell(rowIndex, colIndex);
                  return (
                    <button
                      key={`${rowIndex}-${colIndex}`}
                      onClick={() => handleCellClick(rowIndex, colIndex)}
                      disabled={!!cell || !!winner || currentTurn !== mySymbol || playersCount < 2}
                      className={cn(
                        "w-full h-full bg-white border border-slate-200 flex items-center justify-center transition-all",
                        !cell && !winner && currentTurn === mySymbol && playersCount === 2 && "hover:bg-slate-50 cursor-pointer",
                        (!mySymbol || winner || currentTurn !== mySymbol || playersCount < 2) && !cell && "cursor-default",
                        isWinning && "bg-yellow-200 ring-4 ring-yellow-500 ring-inset z-10 shadow-md"
                      )}
                    >
                      {cell === 'X' && (
                        <X
                          className={cn(
                            "w-full h-full p-[18%] text-blue-600 transition-transform",
                            isWinning && "animate-bounce scale-110 drop-shadow-md"
                          )}
                          strokeWidth={isWinning ? 3 : 2.5}
                        />
                      )}
                      {cell === 'O' && (
                        <Circle
                          className={cn(
                            "w-full h-full p-[20%] text-red-500 transition-transform",
                            isWinning && "animate-bounce scale-110 drop-shadow-md"
                          )}
                          strokeWidth={isWinning ? 3.5 : 3}
                        />
                      )}
                    </button>
                  );
                })
              ))}
            </div>
          </div>
        </main>

        {/* Disconnect Modal */}
        {opponentDisconnected && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserX className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Đối thủ đã thoát</h3>
              <p className="text-slate-600 mb-6">
                Người chơi kia đã ngắt kết nối khỏi phòng. Trận đấu không thể tiếp tục.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors shadow-md"
              >
                Quay lại trang chủ
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
