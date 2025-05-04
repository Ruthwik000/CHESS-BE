const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socket(server);

// Store active games
const games = {};

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.get("/", (req, res) => {
  res.redirect("/lobby");
});

app.get("/lobby", (req, res) => {
  res.render("lobby");
});

app.get("/game/:id", (req, res) => {
  const gameId = req.params.id;
  const game = games[gameId];

  if (!game) {
    return res.redirect("/lobby");
  }

  res.render("game", {
    gameId: gameId,
    gameName: game.name || "Chess Game"
  });
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Handle getting list of available games
  socket.on("getGames", () => {
    const gamesList = Object.keys(games).map(id => {
      const game = games[id];
      return {
        id,
        name: game.name,
        playerWhite: game.playerWhite ? true : false,
        playerBlack: game.playerBlack ? true : false
      };
    });

    socket.emit("gamesList", gamesList);
  });

  // Handle creating a new game
  socket.on("createGame", (data) => {
    const gameId = uuidv4();

    // Create a new chess instance for this game
    const chess = new Chess();

    // Determine player's role
    let playerRole = data.side;
    if (playerRole === 'r') {
      // Random side assignment
      playerRole = Math.random() < 0.5 ? 'w' : 'b';
    }

    // Create game object
    games[gameId] = {
      id: gameId,
      name: data.name,
      chess: chess,
      playerWhite: playerRole === 'w' ? socket.id : null,
      playerBlack: playerRole === 'b' ? socket.id : null,
      spectators: [],
      moveHistory: []
    };

    // Join the game room
    socket.join(gameId);

    // Assign player role
    socket.emit("playerRole", playerRole);

    // Redirect to game page
    socket.emit("gameCreated", gameId);

    // Update games list for all clients in lobby
    io.emit("gamesList", Object.keys(games).map(id => {
      const game = games[id];
      return {
        id,
        name: game.name,
        playerWhite: game.playerWhite ? true : false,
        playerBlack: game.playerBlack ? true : false
      };
    }));
  });

  // Handle joining an existing game
  socket.on("joinGame", (gameId) => {
    const game = games[gameId];

    if (!game) {
      return socket.emit("error", "Game not found");
    }

    // Determine which role is available
    let playerRole = null;

    if (!game.playerWhite) {
      game.playerWhite = socket.id;
      playerRole = 'w';
    } else if (!game.playerBlack) {
      game.playerBlack = socket.id;
      playerRole = 'b';
    } else {
      // Both roles taken, join as spectator
      game.spectators.push(socket.id);
      playerRole = null;
    }

    // Join the game room
    socket.join(gameId);

    // Assign player role
    if (playerRole) {
      socket.emit("playerRole", playerRole);
    } else {
      socket.emit("spectatorRole");
    }

    // Send current game state
    socket.emit("gameState", {
      fen: game.chess.fen(),
      history: game.moveHistory,
      whiteName: game.playerWhite ? "Player 1" : "Waiting...",
      blackName: game.playerBlack ? "Player 2" : "Waiting..."
    });

    // Redirect to game page
    socket.emit("gameJoined", gameId);

    // Update games list for all clients in lobby
    io.emit("gamesList", Object.keys(games).map(id => {
      const game = games[id];
      return {
        id,
        name: game.name,
        playerWhite: game.playerWhite ? true : false,
        playerBlack: game.playerBlack ? true : false
      };
    }));
  });

  // Handle joining a specific game room (when loading game page directly)
  socket.on("joinGameRoom", (gameId) => {
    const game = games[gameId];

    if (!game) {
      return socket.emit("error", "Game not found");
    }

    // Check if this socket is already a player in this game
    let playerRole = null;

    if (game.playerWhite === socket.id) {
      playerRole = 'w';
    } else if (game.playerBlack === socket.id) {
      playerRole = 'b';
    } else {
      // Not a player, check if there's an open slot
      if (!game.playerWhite) {
        game.playerWhite = socket.id;
        playerRole = 'w';
      } else if (!game.playerBlack) {
        game.playerBlack = socket.id;
        playerRole = 'b';
      } else {
        // Both roles taken, join as spectator
        if (!game.spectators.includes(socket.id)) {
          game.spectators.push(socket.id);
        }
        playerRole = null;
      }
    }

    // Join the game room
    socket.join(gameId);

    // Assign player role
    if (playerRole) {
      socket.emit("playerRole", playerRole);
    } else {
      socket.emit("spectatorRole");
    }

    // Send current game state
    socket.emit("gameState", {
      fen: game.chess.fen(),
      history: game.moveHistory,
      whiteName: game.playerWhite ? "Player 1" : "Waiting...",
      blackName: game.playerBlack ? "Player 2" : "Waiting..."
    });
  });

  // Handle moves
  socket.on("move", (move) => {
    const gameId = move.gameId;
    const game = games[gameId];

    if (!game) {
      return socket.emit("error", "Game not found");
    }

    try {
      // Check if it's the player's turn
      if (game.chess.turn() === 'w' && socket.id !== game.playerWhite) return;
      if (game.chess.turn() === 'b' && socket.id !== game.playerBlack) return;

      // Make the move
      const result = game.chess.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion
      });

      if (result) {
        // Store move in history
        game.moveHistory.push(result);

        // Broadcast the updated game state to all players in the room
        io.to(gameId).emit("gameState", {
          fen: game.chess.fen(),
          history: game.moveHistory,
          whiteName: game.playerWhite ? "Player 1" : "Waiting...",
          blackName: game.playerBlack ? "Player 2" : "Waiting..."
        });

        // Check for game end conditions
        if (game.chess.isGameOver()) {
          let result = null;
          let winner = null;

          if (game.chess.isCheckmate()) {
            result = 'checkmate';
            winner = game.chess.turn() === 'w' ? 'Black' : 'White';
          } else if (game.chess.isDraw()) {
            result = 'draw';
          } else if (game.chess.isStalemate()) {
            result = 'stalemate';
          }

          if (result) {
            io.to(gameId).emit("gameOver", {
              result: result,
              winner: winner
            });
          }
        }
      } else {
        console.log("Invalid move:", move);
        socket.emit("invalidMove", move);
      }
    } catch (e) {
      console.log(e);
      socket.emit("invalidMove", move);
    }
  });

  // Handle resignation
  socket.on("resign", (data) => {
    const gameId = data.gameId;
    const game = games[gameId];

    if (!game) {
      return socket.emit("error", "Game not found");
    }

    // Determine who resigned and who won
    let winner = null;

    if (socket.id === game.playerWhite) {
      winner = 'Black';
    } else if (socket.id === game.playerBlack) {
      winner = 'White';
    } else {
      // Spectators can't resign
      return;
    }

    // Notify all players in the room
    io.to(gameId).emit("gameOver", {
      result: 'resignation',
      winner: winner
    });
  });

  // Handle draw offers
  socket.on("offerDraw", (data) => {
    const gameId = data.gameId;
    const game = games[gameId];

    if (!game) {
      return socket.emit("error", "Game not found");
    }

    // Determine who offered the draw and notify the opponent
    if (socket.id === game.playerWhite && game.playerBlack) {
      io.to(game.playerBlack).emit("drawOffered");
    } else if (socket.id === game.playerBlack && game.playerWhite) {
      io.to(game.playerWhite).emit("drawOffered");
    }
  });

  // Handle accepting a draw
  socket.on("acceptDraw", (data) => {
    const gameId = data.gameId;
    const game = games[gameId];

    if (!game) {
      return socket.emit("error", "Game not found");
    }

    // Notify all players in the room
    io.to(gameId).emit("gameOver", {
      result: 'draw'
    });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);

    // Check all games for this player
    Object.keys(games).forEach(gameId => {
      const game = games[gameId];

      if (game.playerWhite === socket.id) {
        game.playerWhite = null;

        // Notify other players
        io.to(gameId).emit("gameState", {
          fen: game.chess.fen(),
          history: game.moveHistory,
          whiteName: "Disconnected",
          blackName: game.playerBlack ? "Player 2" : "Waiting..."
        });
      } else if (game.playerBlack === socket.id) {
        game.playerBlack = null;

        // Notify other players
        io.to(gameId).emit("gameState", {
          fen: game.chess.fen(),
          history: game.moveHistory,
          whiteName: game.playerWhite ? "Player 1" : "Waiting...",
          blackName: "Disconnected"
        });
      } else {
        // Remove from spectators if present
        const spectatorIndex = game.spectators.indexOf(socket.id);
        if (spectatorIndex !== -1) {
          game.spectators.splice(spectatorIndex, 1);
        }
      }

      // Clean up empty games after a delay
      if (!game.playerWhite && !game.playerBlack && game.spectators.length === 0) {
        setTimeout(() => {
          // Double check that the game is still empty
          if (!games[gameId] ||
              (!games[gameId].playerWhite &&
               !games[gameId].playerBlack &&
               games[gameId].spectators.length === 0)) {
            delete games[gameId];

            // Update games list for all clients in lobby
            io.emit("gamesList", Object.keys(games).map(id => {
              const game = games[id];
              return {
                id,
                name: game.name,
                playerWhite: game.playerWhite ? true : false,
                playerBlack: game.playerBlack ? true : false
              };
            }));
          }
        }, 60000); // Clean up after 1 minute
      }
    });

    // Update games list for all clients in lobby
    io.emit("gamesList", Object.keys(games).map(id => {
      const game = games[id];
      return {
        id,
        name: game.name,
        playerWhite: game.playerWhite ? true : false,
        playerBlack: game.playerBlack ? true : false
      };
    }));
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});