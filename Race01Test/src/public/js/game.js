const socket = io();

const duelSound = new Audio('/assets/sounds/duel_sound.mp3');
duelSound.loop = true;
window.AudioManager.register(duelSound, 'music', 0.3);

function playDuelSound() {
    if (duelSound.paused) {
        const playPromise = duelSound.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                if (err.name !== 'NotAllowedError') console.log('Duel sound autoplay prevented:', err);
            });
        }
    }
}
playDuelSound();

document.addEventListener('click', playDuelSound, { once: true });
document.addEventListener('keydown', playDuelSound, { once: true });

// Attack sounds setup
const attackSound = new Audio('/assets/sounds/attack_sound.mp3');
window.AudioManager.register(attackSound, 'sfx', 0.6);

const heroDamageSound = new Audio('/assets/sounds/damage_on_main_character_sound.mp3');
window.AudioManager.register(heroDamageSound, 'sfx', 0.8);

// End game sounds setup
const victorySound = new Audio('/assets/sounds/victory_sound.mp3');
window.AudioManager.register(victorySound, 'sfx', 0.7);

const loseSound = new Audio('/assets/sounds/lose_sound.mp3');
window.AudioManager.register(loseSound, 'sfx', 0.7);

const clickSound = new Audio('/assets/sounds/click_sound.mp3');
window.AudioManager.register(clickSound, 'sfx', 0.5);

socket.on('attackEvent', (data) => {
    attackSound.currentTime = 0;
    attackSound.play().catch(e => { });

    if (data.type === 'hero') {
        setTimeout(() => {
            heroDamageSound.currentTime = 0;
            heroDamageSound.play().catch(e => { });
        }, 150);
    }
});

const gameId = window.location.pathname.split('/').pop();

let myData = null;
let oppData = null;
let isMyTurn = false;
let selectedFieldCard = null;
let myPlayerIndex = -1;
let isTrashMode = false;

const timerEl = document.getElementById('timer');
const myHandEl = document.getElementById('my-hand');
const myFieldEl = document.getElementById('my-field');
const oppFieldEl = document.getElementById('opp-field');
const myEnergyEl = document.getElementById('my-energy');
const oppEnergyEl = document.getElementById('opp-energy');
const myHpFill = document.getElementById('my-hp-fill');
const oppHpFill = document.getElementById('opp-hp-fill');
const turnIndicator = document.getElementById('turn-indicator');
const endTurnBtn = document.getElementById('end-turn-btn');
const canvas = document.getElementById('canvas-effects');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.onresize = resize;
resize();

socket.emit('joinGame', { gameId, nickname, userId: myUserId });

socket.on('startGame', (data) => {
    myPlayerIndex = data.players.findIndex(p => String(p.dbUserId) === String(myUserId));
    if (myPlayerIndex === -1) {
        window.isSpectator = true;
        const specBanner = document.getElementById('spectator-banner');
        if (specBanner) specBanner.classList.remove('hidden');
    } else {
        window.isSpectator = false;
        const specBanner = document.getElementById('spectator-banner');
        if (specBanner) specBanner.classList.add('hidden');
    }

    if (window.isSpectator) {
        myPlayerIndex = 0; // Default to player 1 for spectator stats mapping
        document.body.classList.add('spectator-mode');
        // Hide emoji send button in spectator mode
        const emojiBtn = document.getElementById('emoji-trigger-btn');
        if (emojiBtn) emojiBtn.style.display = 'none';
    }
    console.log('Game started. My index:', myPlayerIndex);

    if (!data.isRejoin && !window.isSpectator) {
        showCoinFlip(data.turn === myPlayerIndex);
    }
    processState(data.players, data.turn);
});

socket.on('timerUpdate', (data) => {
    timerEl.textContent = data.timer;
    timerEl.style.color = data.timer <= 5 ? '#f0a500' : 'var(--marvel-red)';
});

socket.on('turnUpdate', (data) => {
    console.log('Turn update:', data);
    isTrashMode = false;
    processState(data.players, data.turn);
});

socket.on('gameStateUpdate', (data) => {
    processState(data.players, data.turn);
});


function processState(players, turnIndex) {
    myPlayerIndex = players.findIndex(p => String(p.dbUserId) === String(myUserId));
    if (myPlayerIndex === -1) {
        window.isSpectator = true;
    } else {
        window.isSpectator = false;
    }

    if (window.isSpectator) {
        myPlayerIndex = 0;
        myData = players[0];
        oppData = players[1];
        isMyTurn = false;
    } else {
        myData = players[myPlayerIndex];
        oppData = players[myPlayerIndex === 0 ? 1 : 0];
        isMyTurn = turnIndex === myPlayerIndex;
    }

    renderHand();
    renderField();
    updateStats();

    const turnIndicator = document.getElementById('turn-indicator');
    const endTurnBtn = document.getElementById('end-turn-btn');

    if (window.isSpectator) {
        const turnPlayer = players[turnIndex];
        turnIndicator.textContent = `${turnPlayer.nickname.toUpperCase()}'S TURN`;
        turnIndicator.className = 'turn-indicator opp-turn';
        endTurnBtn.style.display = 'none';
    } else {
        if (isMyTurn) {
            turnIndicator.textContent = 'YOUR TURN';
            turnIndicator.className = 'turn-indicator my-turn';
        } else {
            turnIndicator.textContent = "OPPONENT'S TURN";
            turnIndicator.className = 'turn-indicator opp-turn';
        }
        endTurnBtn.style.display = 'block'; // Make sure it is visible for players
        endTurnBtn.disabled = !isMyTurn;
    }
}

function updateStats() {
    if (!myData || !oppData) return;

    myEnergyEl.textContent = `${myData.energy}/${myData.maxEnergy}`;
    oppEnergyEl.textContent = `${oppData.energy}/${oppData.maxEnergy}`;

    myHpFill.style.width = (myData.hp / 20 * 100) + '%';
    oppHpFill.style.width = (oppData.hp / 20 * 100) + '%';

    // Explicit HP numbers with safer selection
    const myHpText = document.querySelector('.player-area:not(.opponent-area) .hp-text');
    const oppHpText = document.querySelector('.opponent-area .hp-text');

    if (myHpText) myHpText.textContent = `${myData.hp}/20`;
    if (oppHpText) oppHpText.textContent = `${oppData.hp}/20`;

    // Update side action buttons
    const trashBtn = document.getElementById('trash-btn');
    const changeBtn = document.getElementById('change-hand-btn');
    const trashCountEl = document.getElementById('trash-count');
    const changeCountEl = document.getElementById('change-count');

    if (trashBtn && myData.trashCount !== undefined) {
        trashCountEl.textContent = myData.trashCount;
        trashBtn.disabled = !isMyTurn || myData.trashCount <= 0 || window.isSpectator;
        if (isTrashMode) trashBtn.classList.add('active');
        else trashBtn.classList.remove('active');
    }

    if (changeBtn && myData.canChangeHand !== undefined) {
        changeCountEl.textContent = myData.canChangeHand ? '1' : '0';
        changeBtn.disabled = !isMyTurn || !myData.canChangeHand || window.isSpectator;
    }

    const oppRankHtml = oppData.rankIcon ? `<img src="/assets/ranks/${oppData.rankIcon}" title="${oppData.rankName}" class="game-rank-icon">` : '';
    const myRankHtml = myData.rankIcon ? `<img src="/assets/ranks/${myData.rankIcon}" title="${myData.rankName}" class="game-rank-icon">` : '';

    document.getElementById('opp-nickname').innerHTML = `${oppRankHtml}${oppData.nickname} <span style="color: var(--marvel-gold); font-size: 0.8em; margin-left: 5px;">(Elo: ${oppData.elo})</span>`;
    document.getElementById('my-nickname').innerHTML = `${myRankHtml}${myData.nickname} <span style="color: var(--marvel-gold); font-size: 0.8em; margin-left: 5px;">(Elo: ${myData.elo})</span>`;

    const myAvatar = document.getElementById('my-avatar');
    const oppAvatar = document.getElementById('opp-avatar');
    if (myAvatar && myData.avatar) myAvatar.src = myData.avatar;
    if (oppAvatar && oppData.avatar) oppAvatar.src = oppData.avatar;

    // Spectator: make avatar & nickname clickable to open player profiles
    if (window.isSpectator) {
        const oppNick = oppData.nickname;
        const myNick = myData.nickname;

        const oppPlayerInfo = document.querySelector('.opponent-area .player-info');
        const myPlayerInfo = document.querySelector('.player-area:not(.opponent-area) .player-info');

        if (oppPlayerInfo && oppNick && !oppPlayerInfo.dataset.profileLinked) {
            oppPlayerInfo.dataset.profileLinked = 'true';
            oppPlayerInfo.style.cursor = 'pointer';
            oppPlayerInfo.title = `View ${oppData.nickname}'s profile`;
            oppPlayerInfo.addEventListener('click', (e) => {
                window.open(`/profile/${encodeURIComponent(oppNick)}`, '_blank');
            });
        }

        if (myPlayerInfo && myNick && !myPlayerInfo.dataset.profileLinked) {
            myPlayerInfo.dataset.profileLinked = 'true';
            myPlayerInfo.style.cursor = 'pointer';
            myPlayerInfo.title = `View ${myData.nickname}'s profile`;
            myPlayerInfo.addEventListener('click', (e) => {
                window.open(`/profile/${encodeURIComponent(myNick)}`, '_blank');
            });
        }
    }
}

function renderHand() {
    myHandEl.innerHTML = '';
    if (!myData || !myData.hand) return;

    if (window.isSpectator) {
        // Render Player 1's cards as beautiful card backs
        myData.hand.forEach(() => {
            const cardEl = document.createElement('div');
            cardEl.className = 'card';
            cardEl.innerHTML = `
                <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle, #3b0764, #1e1b4b); border: 2px solid rgba(147, 51, 234, 0.4); border-radius: 10px; box-shadow: inset 0 0 20px rgba(0,0,0,0.8);">
                    <span style="color: #c084fc; font-weight: bold; font-size: 1.2rem; text-shadow: 0 0 8px #9333ea; letter-spacing: 1.5px;">DARK</span>
                </div>
            `;
            myHandEl.appendChild(cardEl);
        });
    } else {
        myData.hand.forEach(card => {
            const cardEl = createCardElement(card);
            if (isMyTurn && myData.energy >= card.cost) {
                cardEl.classList.add('playable-card');
            }

            cardEl.addEventListener('click', () => {
                if (!isMyTurn) return;
                
                if (isTrashMode) {
                    socket.emit('trashCard', { gameId, cardInstanceId: card.instanceId });
                    isTrashMode = false;
                    return;
                }

                if (myData.energy < card.cost) return;
                socket.emit('playCard', { gameId, cardInstanceId: card.instanceId });
            });
            myHandEl.appendChild(cardEl);
        });
    }
}

function renderField() {
    myFieldEl.innerHTML = '';
    oppFieldEl.innerHTML = '';
    if (!myData || !oppData) return;

    myData.field.forEach(card => {
        const cardEl = createCardElement(card);
        if (card.isSummoning) cardEl.classList.add('summoning-sickness');
        
        if (!window.isSpectator) {
            if (selectedFieldCard && selectedFieldCard.instanceId === card.instanceId) cardEl.classList.add('selected-card');

            // Add "Ready to Attack" indicator
            if (isMyTurn && !card.isSummoning && card.canAttack !== false) {
                cardEl.classList.add('ready-to-attack');
            }

            cardEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isMyTurn || card.isSummoning || card.canAttack === false) return;

                if (selectedFieldCard && selectedFieldCard.instanceId === card.instanceId) {
                    selectedFieldCard = null;
                } else {
                    selectedFieldCard = card;
                }
                renderField(); // Re-render to show selection
            });
        }
        myFieldEl.appendChild(cardEl);
    });

    const hasTaunt = oppData.field.some(c => c.has_taunt);

    oppData.field.forEach(card => {
        const cardEl = createCardElement(card);
        
        if (!window.isSpectator) {
            const canHitThis = !hasTaunt || card.has_taunt;

            if (selectedFieldCard && canHitThis) {
                cardEl.classList.add('valid-target');
            }

            if (hasTaunt && !card.has_taunt) cardEl.style.opacity = '0.5';

            cardEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (selectedFieldCard) {
                    if (hasTaunt && !card.has_taunt) return;

                    console.log(`[BATTLE] Attacking card: ${selectedFieldCard.name} -> ${card.name}`);
                    socket.emit('attack', {
                        gameId,
                        attackerInstanceId: selectedFieldCard.instanceId,
                        targetInstanceId: card.instanceId,
                        target: 'card'
                    });
                    selectedFieldCard = null;
                    renderField();
                }
            });
        } else {
            if (hasTaunt && !card.has_taunt) cardEl.style.opacity = '0.5';
        }
        oppFieldEl.appendChild(cardEl);
    });
}

// Hero attack
document.querySelector('.opponent-area .player-info').addEventListener('click', () => {
    if (window.isSpectator) return;
    if (selectedFieldCard) {
        const hasTaunt = oppData.field.some(c => c.has_taunt);
        if (hasTaunt) {
            alert('You must destroy the Taunt card first!');
            return;
        }

        console.log(`[BATTLE] Attacking hero: ${selectedFieldCard.name} -> Opponent`);
        socket.emit('attack', {
            gameId,
            attackerInstanceId: selectedFieldCard.instanceId,
            target: 'hero'
        });
        selectedFieldCard = null;
        renderField();
    }
});

function createCardElement(card) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    if (card.has_taunt) cardEl.classList.add('taunt-border');

    const displayDef = card.currentDefense !== undefined ? card.currentDefense : card.defense;

    cardEl.innerHTML = `
        <div class="card-cost">${card.cost}</div>
        <div class="card-image" style="background-image: url('${card.image_url}')"></div>
        <div class="card-name">${card.name}</div>
        <div class="card-stats">
            <span class="card-atk">${card.attack}</span>
            <span class="card-def">${displayDef}</span>
        </div>
    `;
    return cardEl;
}

endTurnBtn.addEventListener('click', () => {
    clickSound.currentTime = 0;
    clickSound.play().catch(e => { });
    isTrashMode = false;
    socket.emit('endTurn', { gameId });
});

// Side actions listeners
document.getElementById('trash-btn').addEventListener('click', () => {
    if (!isMyTurn || myData.trashCount <= 0) return;
    clickSound.currentTime = 0;
    clickSound.play().catch(e => { });
    isTrashMode = !isTrashMode;
    updateStats(); // Refresh button state
});

document.getElementById('change-hand-btn').addEventListener('click', () => {
    if (!isMyTurn || !myData.canChangeHand) return;
    clickSound.currentTime = 0;
    clickSound.play().catch(e => { });
    socket.emit('changeHand', { gameId });
});

// Leave Battle logic
const leaveBtn = document.getElementById('leave-battle-btn');
const leaveModal = document.getElementById('leave-confirm-modal');
const confirmLeaveBtn = document.getElementById('confirm-leave-btn');
const cancelLeaveBtn = document.getElementById('cancel-leave-btn');

if (leaveBtn && leaveModal) {
    leaveBtn.addEventListener('click', () => {
        clickSound.currentTime = 0;
        clickSound.play().catch(e => { });
        if (window.isSpectator) {
            duelSound.pause();
            duelSound.currentTime = 0;
            window.location.href = '/lobby';
        } else {
            leaveModal.classList.remove('hidden');
        }
    });

    cancelLeaveBtn.addEventListener('click', () => {
        clickSound.currentTime = 0;
        clickSound.play().catch(e => { });
        leaveModal.classList.add('hidden');
    });

    confirmLeaveBtn.addEventListener('click', () => {
        clickSound.currentTime = 0;
        clickSound.play().catch(e => { });

        socket.emit('leaveGame', { gameId: gameId });

        leaveModal.classList.add('hidden');

        duelSound.pause();
        duelSound.currentTime = 0;

        loseSound.currentTime = 0;
        loseSound.play().catch(e => { });

        const winnerName = (oppData && oppData.nickname) ? oppData.nickname : "Opponent";
        showGameOverScreen(false, winnerName);
    });

    leaveModal.addEventListener('click', (e) => {
        if (e.target === leaveModal) {
            leaveModal.classList.add('hidden');
        }
    });
}

function showCoinFlip(isMeFirst) {
    let frame = 0;
    const duration = 180;
    const startAngle = 0;
    // Random number of full rotations (3 to 6)
    const randomSpins = (3 + Math.floor(Math.random() * 4)) * Math.PI * 2;
    // Target base angle (PI/2 is down towards me, -PI/2 is up towards opponent)
    const baseTargetAngle = isMeFirst ? Math.PI / 2 : -Math.PI / 2;
    const totalRotation = randomSpins + baseTargetAngle;

    const interval = setInterval(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 100;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Cubic ease-out: 1 - (1-x)^3
        const progress = frame / duration;
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentAngle = startAngle + totalRotation * easeOut;

        const arrowX = centerX + Math.cos(currentAngle) * (radius - 10);
        const arrowY = centerY + Math.sin(currentAngle) * (radius - 10);

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(arrowX, arrowY);
        ctx.strokeStyle = '#e23636';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Beautiful, voluminous arrow head
        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(currentAngle);
        ctx.beginPath();
        ctx.moveTo(15, 0); // Tip
        ctx.lineTo(-20, -15); // Top corner
        ctx.lineTo(-10, 0); // Inner indent
        ctx.lineTo(-20, 15); // Bottom corner
        ctx.closePath();

        // Gradient for volume
        const gradient = ctx.createLinearGradient(-20, -15, 15, 15);
        gradient.addColorStop(0, '#ff5a5a');
        gradient.addColorStop(1, '#8b0000');

        ctx.fillStyle = gradient;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff0000';
        ctx.fill();

        // Stroke for highlight
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();

        ctx.font = 'bold 32px Outfit';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';

        if (frame < 120) {
            ctx.fillText('DETERMINING TURN...', centerX, centerY + 180);
        } else {
            const text = isMeFirst ? 'YOU GO FIRST!' : 'OPPONENT GOES FIRST!';
            ctx.fillStyle = isMeFirst ? '#f0a500' : '#e23636';
            ctx.font = 'bold 50px Outfit';
            ctx.shadowBlur = 15;
            ctx.shadowColor = ctx.fillStyle;
            ctx.fillText(text, centerX, centerY + 180);
            ctx.shadowBlur = 0;
        }

        frame++;
        if (frame >= duration) {
            clearInterval(interval);
            setTimeout(() => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }, 1000); // Keep result for 1s
        }
    }, 16);
}

socket.on('gameOver', (data) => {
    // Stop the duel music
    duelSound.pause();
    duelSound.currentTime = 0;

    if (window.isSpectator) {
        victorySound.currentTime = 0;
        victorySound.play().catch(e => console.log('Victory sound prevented', e));
        showGameOverScreen(true, data.winner);
    } else {
        // Check if the winner's nickname is at the start of the message
        const isWinner = data.winner.startsWith(nickname);

        // Play outcome sound
        if (isWinner) {
            victorySound.currentTime = 0;
            victorySound.play().catch(e => console.log('Victory sound prevented', e));
        } else {
            loseSound.currentTime = 0;
            loseSound.play().catch(e => console.log('Lose sound prevented', e));
        }

        showGameOverScreen(isWinner, data.winner);
    }
});

function showGameOverScreen(isWinner, winnerName) {
    // Disable leave button immediately at game end
    const leaveBtn = document.getElementById('leave-battle-btn');
    if (leaveBtn) {
        leaveBtn.disabled = true;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let text = isWinner ? 'YOU WON!' : 'YOU LOST!';
    let eloText = isWinner ? '+25 Elo' : '-25 Elo';
    let mainColor = isWinner ? '#f0a500' : '#e23636';

    if (window.isSpectator) {
        text = 'BATTLE ENDED!';
        eloText = 'Spectator Mode';
        mainColor = '#c084fc'; // Purple spectator color
    }

    ctx.font = 'bold 60px Outfit';
    ctx.fillStyle = mainColor;
    ctx.textAlign = 'center';
    ctx.shadowBlur = 30;
    ctx.shadowColor = mainColor;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 - 40);

    ctx.font = 'bold 45px Outfit';
    ctx.fillText(eloText, canvas.width / 2, canvas.height / 2 + 30);

    ctx.shadowBlur = 0;
    ctx.font = '24px Outfit';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Winner: ${winnerName}`, canvas.width / 2, canvas.height / 2 + 100);
    ctx.fillText('Returning to lobby in 5 seconds...', canvas.width / 2, canvas.height / 2 + 140);

    setTimeout(() => {
        window.location.href = '/lobby';
    }, 5000);
}

// Add CSS for selected card
const style = document.createElement('style');
style.textContent = `
    .selected-card {
        border-color: var(--marvel-gold) !important;
        transform: translateY(-15px) scale(1.1) !important;
        box-shadow: 0 0 25px var(--marvel-gold) !important;
        z-index: 100;
    }
    .ready-to-attack {
        box-shadow: 0 0 15px rgba(0, 255, 0, 0.5) !important;
        border-color: #00ff00 !important;
    }
    .valid-target {
        cursor: crosshair;
        box-shadow: 0 0 15px rgba(255, 0, 0, 0.7) !important;
        border-color: #ff0000 !important;
    }
    body:not(.spectator-mode) .opponent-area .player-info:hover {
        background: rgba(226, 54, 54, 0.2);
        cursor: pointer;
    }
    .spectator-mode .player-info:hover {
        background: rgba(147, 51, 234, 0.15);
        transition: background 0.2s ease;
    }
    .game-rank-icon {
        width: 48px;
        height: 48px;
        vertical-align: middle;
        margin-right: 6px;
        filter: drop-shadow(0 0 8px rgba(192, 132, 252, 0.5));
        transition: transform 0.2s ease;
    }
    .game-rank-icon:hover {
        transform: scale(1.1);
    }

`;
document.head.appendChild(style);
