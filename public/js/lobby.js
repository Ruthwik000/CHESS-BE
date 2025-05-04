const socket = io();
const createGameForm = document.getElementById('create-game-form');
const gamesList = document.getElementById('games-list');
const noGamesMessage = document.getElementById('no-games-message');

// Handle form submission to create a new game
createGameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const gameName = document.getElementById('game-name').value;
  const selectedSide = document.querySelector('input[name="side"]:checked').value;
  
  // Emit event to create a new game
  socket.emit('createGame', {
    name: gameName,
    side: selectedSide
  });
  
  // Clear the form
  document.getElementById('game-name').value = '';
});

// Listen for available games from the server
socket.on('gamesList', (games) => {
  // Clear the current list
  while (gamesList.firstChild && gamesList.firstChild !== noGamesMessage) {
    gamesList.removeChild(gamesList.firstChild);
  }
  
  // Show or hide the "no games" message
  if (games.length === 0) {
    noGamesMessage.style.display = 'block';
  } else {
    noGamesMessage.style.display = 'none';
    
    // Add each game to the list
    games.forEach(game => {
      const gameCard = document.createElement('div');
      gameCard.className = 'game-card p-4 flex justify-between items-center';
      
      const gameInfo = document.createElement('div');
      
      const gameName = document.createElement('h3');
      gameName.className = 'font-bold text-lg';
      gameName.textContent = game.name;
      
      const gameStatus = document.createElement('p');
      gameStatus.className = 'text-sm text-gray-400';
      
      if (game.playerWhite && game.playerBlack) {
        gameStatus.textContent = 'Game in progress';
      } else {
        const availableSide = game.playerWhite ? 'Black' : 'White';
        gameStatus.textContent = `Waiting for ${availableSide} player`;
      }
      
      gameInfo.appendChild(gameName);
      gameInfo.appendChild(gameStatus);
      
      const joinButton = document.createElement('button');
      joinButton.className = 'btn btn-secondary py-2 px-4 rounded-md font-medium';
      joinButton.textContent = 'Join Game';
      
      // Disable button if game is full
      if (game.playerWhite && game.playerBlack) {
        joinButton.disabled = true;
        joinButton.className += ' opacity-50 cursor-not-allowed';
        joinButton.textContent = 'Game Full';
      } else {
        joinButton.addEventListener('click', () => {
          socket.emit('joinGame', game.id);
        });
      }
      
      gameCard.appendChild(gameInfo);
      gameCard.appendChild(joinButton);
      
      // Insert at the beginning of the list (newest first)
      gamesList.insertBefore(gameCard, gamesList.firstChild);
    });
  }
});

// Listen for game creation confirmation
socket.on('gameCreated', (gameId) => {
  // Redirect to the game page
  window.location.href = `/game/${gameId}`;
});

// Listen for game join confirmation
socket.on('gameJoined', (gameId) => {
  // Redirect to the game page
  window.location.href = `/game/${gameId}`;
});

// Request the initial list of games when the page loads
socket.emit('getGames');
