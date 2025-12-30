const SOCKET_URL = 'https://willis-transported-placidly.ngrok-free.dev';
let socket = null;
let gameState = {
    inGame: false,
    isHost: false,
    roomCode: '',
    players: [],
    username: ''
};


const menuScreen = document.getElementById('screen-menu');
const setupScreen = document.getElementById('screen-setup');
const gameScreen = document.getElementById('screen-game');

let roomCodeValue = null;
let startGameBtn = null;
let playerUI = null;
let playerNameDisplay = null;
let playerStartBtn = null;
let playerWaitingMsg = null;
let countdownOverlay = null;




const gamePickerScreen = document.getElementById('screen-game-picker');
const loadingScreen = document.getElementById('screen-loading');
const gameList = document.getElementById('game-list');
const loadingStatus = document.getElementById('loading-status');
const loadingSpinner = document.getElementById('loading-spinner');

const gameCanvas = document.getElementById('gameCanvas');
const gameTitle = document.querySelector('.game-title');
const GAME_NAME = 'BarcodeGames';
let AVAILABLE_GAMES = [];
let CURRENT_GAME_SCRIPT = null;


document.getElementById('btn-host').addEventListener('click', () => {
    gameState.isHost = true;
    menuScreen.classList.add('hidden');
    gamePickerScreen.classList.remove('hidden');
});

document.getElementById('btn-join').addEventListener('click', () => {
    menuScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
});

document.getElementById('btn-picker-back').addEventListener('click', () => {
    gamePickerScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
});

document.getElementById('btn-setup-back').addEventListener('click', () => {
    setupScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
});

const codeChars = document.querySelectorAll('.code-char');
codeChars.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
        const val = e.target.value.toUpperCase();
        e.target.value = val;
        if (val) {
            let nextEmpty = -1;
            for (let i = idx + 1; i < codeChars.length; i++) {
                if (!codeChars[i].value) {
                    nextEmpty = i;
                    break;
                }
            }
            if (nextEmpty !== -1) {
                codeChars[nextEmpty].focus();
            }
        }
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
            if (e.target.value) {
                e.target.value = '';
                setTimeout(() => {
                    let nearestFilled = -1;
                    for (let i = idx - 1; i >= 0; i--) {
                        if (codeChars[i].value) {
                            nearestFilled = i;
                            break;
                        }
                    }
                    if (nearestFilled !== -1) {
                        codeChars[nearestFilled].focus();
                    } else if (idx > 0) {
                        codeChars[idx - 1].focus();
                    }
                }, 0);
            } else if (idx > 0) {
                let nearestFilled = -1;
                for (let i = idx - 1; i >= 0; i--) {
                    if (codeChars[i].value) {
                        nearestFilled = i;
                        break;
                    }
                }
                if (nearestFilled !== -1) {
                    codeChars[nearestFilled].focus();
                } else {
                    codeChars[idx - 1].focus();
                }
                e.preventDefault();
            }
        }
        
        if (e.key === 'Delete' && idx < codeChars.length - 1) {
            codeChars[idx + 1].focus();
            e.preventDefault();
        }
        
        if (e.key === 'ArrowLeft' && idx > 0) {
            e.preventDefault();
            codeChars[idx - 1].focus();
        }
        if (e.key === 'ArrowRight' && idx < codeChars.length - 1) {
            e.preventDefault();
            codeChars[idx + 1].focus();
        }
    });
    
    input.addEventListener('paste', (e) => {
        e.preventDefault();
        const paste = (e.clipboardData.getData('text') || '').toUpperCase().slice(0, 4);
        paste.split('').forEach((char, i) => {
            if (codeChars[i]) codeChars[i].value = char;
        });
        let nextEmpty = -1;
        for (let i = 0; i < codeChars.length; i++) {
            if (!codeChars[i].value) {
                nextEmpty = i;
                break;
            }
        }
        if (nextEmpty !== -1) {
            codeChars[nextEmpty].focus();
        } else {
            codeChars[3].focus();
        }
    });
});

function getCodeFromInputs() {
    return Array.from(codeChars).map(c => c.value).join('').toUpperCase();
}

document.getElementById('btn-clear-name').addEventListener('click', () => {
    const nameInput = document.getElementById('input-name');
    nameInput.value = '';
    nameInput.focus();
});


document.getElementById('btn-setup-go').addEventListener('click', () => {
    const username = document.getElementById('input-name').value.trim();
    const code = getCodeFromInputs();
    if (username.length < 1) {
        document.getElementById('setup-error').textContent = 'Enter a nickname';
        return;
    }
    if (code.length !== 4) {
        document.getElementById('setup-error').textContent = 'Enter 4-letter code';
        return;
    }
    gameState.username = username;
    gameState.isHost = false;
    socket = io(SOCKET_URL, {
        transports: ['websocket'],
        upgrade: false
    });
    setupSocketListeners();
    socket.emit('joinGame', { username, code });
});


fetch('games/games.json')
    .then(res => res.json())
    .then(data => {
        AVAILABLE_GAMES = data;
        renderGamePicker();
    })
    .catch(err => console.error('Failed to load games.json', err));


const searchInput = document.getElementById('game-search-input');
searchInput.addEventListener('input', () => {
    renderGamePicker();
});

function renderGamePicker() {
    gameList.innerHTML = '';
    const term = searchInput.value.toLowerCase();
    
    AVAILABLE_GAMES.filter(g => g.name.toLowerCase().includes(term)).forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.onclick = () => initiateGameLoad(game);
        
        
        const titleContent = game.titleImage 
            ? `<img src="${game.titleImage}" alt="${game.name}" class="game-card-title-img">`
            : `<span>${game.name}</span>`;
        
        card.innerHTML = `
            <div class="game-card-thumbnail"></div>
            <div class="game-card-info">
                <div class="game-card-title">${titleContent}</div>
                <div class="game-card-players">${game.minPlayers}-${game.maxPlayers} Players</div>
            </div>
        `;
        gameList.appendChild(card);
    });
}

function initiateGameLoad(game) {
    
    if (gameState.isHost) {
        if (!socket) {
            startHostSequence();
            
            socket.once('gameHosted', () => {
                socket.emit('setGame', game.id);
            });
        } else {
            
            socket.emit('setGame', game.id);
        }
    }

    gamePickerScreen.classList.add('hidden');
    loadingScreen.classList.remove('hidden');
    loadingSpinner.src = game.loadingIcon;
    
    
    
    
    let toLoad;
    if (gameState.isHost) {
        toLoad = [...(game.hostAssets || game.assets || [])];
    } else {
        toLoad = [...(game.playerAssets || [])];
    }
    
    let total = toLoad.length;
    let loaded = 0;
    
    loadingStatus.textContent = `ASSETS 0/${total}`;
    
    if (total === 0) {
        loadGameScript(game);
        return;
    }

    toLoad.forEach(url => {
        const ext = url.split('.').pop().toLowerCase();
        let el;
        if (['jpg', 'png', 'jpeg', 'webp'].includes(ext)) {
            el = new Image();
        } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
            el = new Audio();
        } else {
            loaded++;
            return;
        }

        const onAssetLoad = () => {
             loaded++;
             loadingStatus.textContent = `ASSETS ${loaded}/${total}`;
             if (loaded >= total) loadGameScript(game);
        };

        el.onload = onAssetLoad;
        el.oncanplaythrough = onAssetLoad;
        el.onerror = onAssetLoad;
        el.src = url;
    });
}

function loadGameScript(gameConfig) {
    if (CURRENT_GAME_SCRIPT) {
        document.body.removeChild(CURRENT_GAME_SCRIPT);
        CURRENT_GAME_SCRIPT = null;
    }
    
    const oldStyle = document.getElementById('game-style');
    if (oldStyle) oldStyle.remove();
    const gameContainer = document.getElementById('game-ui-container');
    if (gameContainer) gameContainer.innerHTML = '';

    const basePath = `games/${gameConfig.id}`;
    
    const scriptPath = gameConfig.script || `${basePath}/client.js`;
    const htmlPath = `${basePath}/ui.html`;
    const cssPath = `${basePath}/style.css`;

    
    const link = document.createElement('link');
    link.id = 'game-style';
    link.rel = 'stylesheet';
    link.href = cssPath;
    document.head.appendChild(link);

    
    fetch(htmlPath)
        .then(response => {
            if (response.ok) return response.text();
            return '';
        })
        .then(html => {
            if (html && gameContainer) {
                gameContainer.innerHTML = html;
                bindGameUI();
            }
            
            const script = document.createElement('script');
            script.src = scriptPath;
            script.onload = () => {
                if (window.initGame) {
                    window.initGame(gameCanvas, socket, gameState);
                }
                warmUpJIT();
                setTimeout(() => {
                    loadingScreen.classList.add('hidden');
                    gameScreen.classList.remove('hidden');
                    
                }, 1500);
            };
            script.onerror = (e) => {
                alert("Found assets but failed to load game logic.");
            };
            document.body.appendChild(script);
            CURRENT_GAME_SCRIPT = script;
        })
        .catch(err => console.error("Error loading game HTML", err));
}

function startHostSequence() {
    gameState.isHost = true;
    
    if (roomCodeValue) roomCodeValue.textContent = '- - - -';
    if (playerUI) playerUI.classList.add('hidden');
    if (startGameBtn) startGameBtn.classList.remove('hidden');
    document.title = GAME_NAME;
    socket = io(SOCKET_URL, {
        transports: ['websocket'],
        upgrade: false
    });
    socket.on('connect_error', (err) => {
        alert('Could not connect to server');
    });
    setupSocketListeners();
    socket.emit('hostGame');
}

function setupSocketListeners() {
    socket.on('gameHosted', (data) => {
        gameState.roomCode = data.code;
        gameState.players = data.players;
        gameState.inGame = true;
        const code = data.code;
        if (roomCodeValue) {
            roomCodeValue.textContent = '- - - -';
            let charIndex = 0;
            const typewriterInterval = setInterval(() => {
                if (charIndex < 4) {
                    const chars = roomCodeValue.textContent.split('');
                    chars[charIndex * 2] = code[charIndex];
                    roomCodeValue.textContent = chars.join('');
                    charIndex++;
                } else {
                    clearInterval(typewriterInterval);
                }
            }, 150);
        }
        
        if(window.updatePlayerCircles) window.updatePlayerCircles(data.players); 
    });
    
    socket.on('gameJoined', (data) => {
        gameState.roomCode = data.code;
        gameState.players = data.players;
        gameState.inGame = true;
        setupScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        
        if (roomCodeValue) roomCodeValue.textContent = data.code;
        if (gameCanvas) gameCanvas.style.display = 'none';
        if (playerUI) playerUI.classList.remove('hidden');
        if (playerNameDisplay) playerNameDisplay.textContent = gameState.username;
        if (startGameBtn) startGameBtn.classList.add('hidden');
        document.title = GAME_NAME;
        updatePlayerUI();
        if(window.updatePlayerCircles) window.updatePlayerCircles(data.players); 

        if (data.gameId) {
            const game = AVAILABLE_GAMES.find(g => g.id === data.gameId);
            if (game) {
                initiateGameLoad(game);
            }
        }
    });
    
    socket.on('playerUpdate', (players) => {
        gameState.players = players;
        if(window.updatePlayerCircles) window.updatePlayerCircles(players);
        if (!gameState.isHost) updatePlayerUI();
    });
    
    socket.on('gameStarted', () => {
        startGameBtn.classList.add('hidden');
        if (!gameState.isHost) {
            playerStartBtn.classList.add('hidden');
            playerWaitingMsg.textContent = "GAME STARTED!";
            playerWaitingMsg.classList.remove('hidden');
        }
        if (window.onGameStart) window.onGameStart();
    });

    socket.on('joinError', (msg) => {
        document.getElementById('setup-error').textContent = msg;
    });
    
    
}

function bindGameUI() {
    roomCodeValue = document.getElementById('roomCodeValue');
    startGameBtn = document.getElementById('startGameBtn');
    playerUI = document.getElementById('player-ui');
    playerNameDisplay = document.getElementById('player-name-display');
    playerStartBtn = document.getElementById('playerStartBtn');
    playerWaitingMsg = document.getElementById('player-waiting-msg');
    countdownOverlay = document.getElementById('countdown-overlay');

    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            if (socket && gameState.isHost) {
                socket.emit('startGame');
            }
        });
    }

    if (playerStartBtn) {
        playerStartBtn.addEventListener('click', () => {
            if (socket && !gameState.isHost) {
                socket.emit('startGame');
            }
        });
    }

    
    const copyBtn = document.getElementById('btn-copy-code');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const originalHTML = copyBtn.innerHTML;
            navigator.clipboard.writeText(gameState.roomCode);
            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
            copyBtn.style.color = '#00ff88';
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.style.color = '';
            }, 1000);
        });
    }

    
    if (gameState.roomCode && roomCodeValue) {
        roomCodeValue.textContent = gameState.roomCode;
    }
    if (gameState.isHost && startGameBtn) {
        startGameBtn.classList.remove('hidden');
    }
    if (playerUI && gameState.isHost) {
        playerUI.classList.add('hidden'); 
        
        
        
        playerUI.classList.add('hidden');
    } else if (playerUI && !gameState.isHost) {
        playerUI.classList.remove('hidden');
    }
    
    
    if (!gameState.isHost) {
        updatePlayerUI();
    }
    if (playerNameDisplay && gameState.username) {
        playerNameDisplay.textContent = gameState.username;
    }
}

function updatePlayerUI() {
    
    if (!playerStartBtn || !playerWaitingMsg) return;

    if (gameState.players.length > 0 && gameState.players[0].username === gameState.username) {
        playerStartBtn.classList.remove('hidden');
        playerWaitingMsg.classList.add('hidden');
    } else {
        playerStartBtn.classList.add('hidden');
        playerWaitingMsg.classList.remove('hidden');
    }
}


window.warmUpJIT = function() { console.log("Default JIT Warmup"); };
