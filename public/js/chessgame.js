const socket = io();
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");
const moveHistoryElement = document.getElementById("move-history");
const gameStatusElement = document.getElementById("game-status");
const whiteStatusElement = document.getElementById("white-status");
const blackStatusElement = document.getElementById("black-status");
const resignButton = document.getElementById("resign-btn");
const drawButton = document.getElementById("draw-btn");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let moveHistory = [];

// Join the specific game room
socket.emit('joinGameRoom', gameId);

const getPieceUnicode = (piece) => {
  const pieceUnicode = {
    p: "♟",
    r: "♜",
    n: "♞",
    b: "♝",
    q: "♛",
    k: "♚",
    P: "♙",
    R: "♖",
    N: "♘",
    B: "♗",
    Q: "♕",
    K: "♔",
  };

  // Return the Unicode character wrapped in a span
  const unicodeChar = pieceUnicode[piece.type] || "";

  return `<span class="unicode-piece">${unicodeChar}</span>`;
};

const renderBoard = () => {
  const board = chess.board();
  boardElement.innerHTML = ""; // Clear the board before rendering

  board.forEach((row, rowindex) => {
    row.forEach((square, squareindex) => {
      const squareElement = document.createElement("div");
      squareElement.classList.add(
        "square",
        (rowindex + squareindex) % 2 === 0 ? "light" : "dark" // Alternating colors
      );

      squareElement.dataset.row = rowindex;
      squareElement.dataset.col = squareindex;

      if (square) {
        // Only create piece elements if the square has a piece
        const pieceElement = document.createElement("div");
        pieceElement.classList.add(
          "piece",
          square.color === "w" ? "white" : "black"
        );
        pieceElement.innerHTML = getPieceUnicode(square); // Use getPieceUnicode here
        pieceElement.draggable = playerRole === square.color;

        pieceElement.addEventListener("dragstart", (e) => {
          if (pieceElement.draggable) {
            draggedPiece = pieceElement;
            sourceSquare = { row: rowindex, col: squareindex };
            draggedPiece.classList.add("dragging");
            e.dataTransfer.setData("text/plain", "");
          }
        });

        pieceElement.addEventListener("dragend", (e) => {
          draggedPiece.classList.remove("dragging");
          draggedPiece = null;
          sourceSquare = null;
        });

        squareElement.appendChild(pieceElement); // Attach piece to the square
      }

      squareElement.addEventListener("dragover", (e) => {
        e.preventDefault(); // Allow dropping
      });

      squareElement.addEventListener("drop", (e) => {
        e.preventDefault();
        if (draggedPiece) {
          const targetSquare = {
            row: parseInt(squareElement.dataset.row),
            col: parseInt(squareElement.dataset.col),
          };
          handleMove(sourceSquare, targetSquare); // Handle the move
        }
      });

      boardElement.appendChild(squareElement); // Append the square to the board
    });
  });

  // Rotate board for black player
  if (playerRole === 'b') {
    boardElement.classList.add("flipped");
  } else {
    boardElement.classList.remove("flipped");
  }
};

// Handle Move on Drop
const handleMove = (source, target) => {
  const move = {
    from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
    to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
    promotion: "q", // Default to promoting to a queen
    gameId: gameId  // Include the game ID
  };

  // Temporarily update the local chess state to avoid lag
  const result = chess.move({
    from: move.from,
    to: move.to,
    promotion: move.promotion,
  });

  if (result) {
    // Add move to history
    moveHistory.push(result);
    updateMoveHistory();

    // Emit the move to the server
    socket.emit("move", move);

    // Re-render the board to reflect the move
    renderBoard();

    // Update game status
    updateGameStatus();
  }
};

// Update the move history display
const updateMoveHistory = () => {
  if (!moveHistoryElement) return;

  moveHistoryElement.innerHTML = '';

  moveHistory.forEach((move, index) => {
    const moveNumber = Math.floor(index / 2) + 1;
    const isWhiteMove = index % 2 === 0;

    const moveElement = document.createElement('div');
    moveElement.className = 'move-entry';

    if (isWhiteMove) {
      moveElement.textContent = `${moveNumber}. ${move.san}`;
    } else {
      // Find the previous white move
      const prevElement = moveHistoryElement.lastChild;
      if (prevElement) {
        prevElement.textContent += ` ${move.san}`;
        return;
      } else {
        moveElement.textContent = `${moveNumber}... ${move.san}`;
      }
    }

    moveHistoryElement.appendChild(moveElement);
  });

  // Scroll to the bottom
  moveHistoryElement.scrollTop = moveHistoryElement.scrollHeight;
};

// Update game status display
const updateGameStatus = () => {
  if (!gameStatusElement) return;

  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'Black' : 'White';
    gameStatusElement.textContent = `Checkmate! ${winner} wins!`;
    gameStatusElement.className = 'text-sm p-2 bg-yellow-700 rounded font-bold';
  } else if (chess.isDraw()) {
    gameStatusElement.textContent = 'Game ended in a draw';
    gameStatusElement.className = 'text-sm p-2 bg-blue-700 rounded font-bold';
  } else if (chess.isCheck()) {
    const inCheck = chess.turn() === 'w' ? 'White' : 'Black';
    gameStatusElement.textContent = `${inCheck} is in check!`;
    gameStatusElement.className = 'text-sm p-2 bg-red-700 rounded';
  } else {
    const currentTurn = chess.turn() === 'w' ? 'White' : 'Black';
    gameStatusElement.textContent = `${currentTurn} to move`;
    gameStatusElement.className = 'text-sm p-2 bg-gray-700 rounded';
  }

  // Update player indicators
  if (document.getElementById('player-white') && document.getElementById('player-black')) {
    document.getElementById('player-white').classList.toggle('active-player', chess.turn() === 'w');
    document.getElementById('player-black').classList.toggle('active-player', chess.turn() === 'b');
  }
};

// Handle resign button
if (resignButton) {
  resignButton.addEventListener('click', () => {
    if (confirm('Are you sure you want to resign?')) {
      socket.emit('resign', { gameId });
    }
  });
}

// Handle draw button
if (drawButton) {
  drawButton.addEventListener('click', () => {
    socket.emit('offerDraw', { gameId });
  });
}

// Listen for player role changes
socket.on("playerRole", function(role){
  playerRole = role;
  renderBoard();

  // Update player status
  if (whiteStatusElement && blackStatusElement) {
    if (role === 'w') {
      whiteStatusElement.textContent = 'You';
      blackStatusElement.textContent = 'Opponent';
    } else if (role === 'b') {
      whiteStatusElement.textContent = 'Opponent';
      blackStatusElement.textContent = 'You';
    }
  }
});

socket.on("spectatorRole", function(){
  playerRole = null;
  renderBoard();

  // Update player status for spectators
  if (whiteStatusElement && blackStatusElement) {
    whiteStatusElement.textContent = 'Player 1';
    blackStatusElement.textContent = 'Player 2';
  }

  // Hide game control buttons for spectators
  if (resignButton) resignButton.style.display = 'none';
  if (drawButton) drawButton.style.display = 'none';
});

// Listen for game state updates
socket.on("gameState", function(data){
  // Update chess board
  chess.load(data.fen);

  // Update move history
  moveHistory = data.history || [];
  updateMoveHistory();

  // Update player information
  if (whiteStatusElement && data.whiteName) {
    whiteStatusElement.textContent = data.whiteName;
  }

  if (blackStatusElement && data.blackName) {
    blackStatusElement.textContent = data.blackName;
  }

  // Re-render the board
  renderBoard();

  // Update game status
  updateGameStatus();
});

// Listen for board state updates (for backward compatibility)
socket.on("boardState", function(fen){
  chess.load(fen); // Update the chess object state with FEN
  renderBoard();   // Re-render the board
  updateGameStatus();
});

// Listen for draw offers
socket.on("drawOffered", function(data){
  if (confirm('Your opponent has offered a draw. Do you accept?')) {
    socket.emit('acceptDraw', { gameId });
  } else {
    socket.emit('declineDraw', { gameId });
  }
});

// Listen for game end events
socket.on("gameOver", function(data){
  let message = '';

  switch(data.result) {
    case 'checkmate':
      message = `Checkmate! ${data.winner} wins!`;
      break;
    case 'resignation':
      message = `${data.winner} wins by resignation!`;
      break;
    case 'draw':
      message = 'Game ended in a draw';
      break;
    case 'stalemate':
      message = 'Game ended in stalemate';
      break;
    case 'timeout':
      message = `${data.winner} wins on time!`;
      break;
    default:
      message = 'Game over';
  }

  gameStatusElement.textContent = message;
  gameStatusElement.className = 'text-sm p-2 bg-yellow-700 rounded font-bold';

  // Disable game controls
  if (resignButton) resignButton.disabled = true;
  if (drawButton) drawButton.disabled = true;
});

// Initialize the game status on page load
updateGameStatus();

