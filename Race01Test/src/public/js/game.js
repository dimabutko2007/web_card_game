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

const changeOneCardSound = new Audio('/assets/sounds/change_one_card_sound.mp3');
window.AudioManager.register(changeOneCardSound, 'sfx', 0.7);

const shuffleCardsSound = new Audio('/assets/sounds/shuffle_cards_sound.mp3');
window.AudioManager.register(shuffleCardsSound, 'sfx', 0.7);

let lastHandIds = new Set();
let lastMyFieldIds = new Set();
let lastOppFieldIds = new Set();

const cardBirthTimes = new Map(); // instanceId -> timestamp
const cardFirstLocation = new Map(); // instanceId -> 'hand' or 'field'

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
let isAbilityMode = false;

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

socket.emit('joinGame', { gameId });

socket.on('gameCancelled', (data) => {
    alert(data.message || 'The game was cancelled due to a technical error.');
    window.location.href = '/lobby';
});

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

    // Reset tracking for the new match
    cardBirthTimes.clear();
    cardFirstLocation.clear();

    if (!data.isRejoin && !window.isSpectator) {
        showCoinFlip(data.turn === myPlayerIndex);
        
        // Show ability announcement after coin flip
        setTimeout(() => {
            const myAbility = data.players[myPlayerIndex].ability;
            if (myAbility) {
                showAbilityAnnouncement(myAbility);
            }
        }, 4000);
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
    isAbilityMode = false;
    processState(data.players, data.turn);
});

socket.on('abilityEvent', (data) => {
    console.log('Ability Event:', data);
    if (data.type === 'Freeze') {
        const cardEl = document.querySelector(`[data-instance-id="${data.targetInstanceId}"]`);
        if (cardEl) {
            cardEl.classList.add('freeze-impact');
            setTimeout(() => cardEl.classList.remove('freeze-impact'), 1500);
        }
    } else if (data.type === 'Poison') {
        if (data.poisonedTargets && data.poisonedTargets.length > 0) {
            data.poisonedTargets.forEach(id => {
                const cardEl = document.querySelector(`[data-instance-id="${id}"]`);
                if (cardEl) {
                    cardEl.classList.add('poison-impact');
                    setTimeout(() => cardEl.classList.remove('poison-impact'), 2000);
                }
            });
        }
    } else if (data.type === 'Lightning') {
        let targetEl;
        if (data.target === 'card' || data.targetInstanceId) {
            targetEl = document.querySelector(`[data-instance-id="${data.targetInstanceId}"]`);
        } else if (data.target === 'hero') {
            if (data.playerIndex === myPlayerIndex) {
                // I used it, target is opponent
                targetEl = document.querySelector('.opponent-area .player-info');
            } else {
                // Opponent used it, target is me
                targetEl = document.querySelector('.player-area:not(.opponent-area) .player-info');
            }
        }
        
        if (targetEl) {
            targetEl.classList.add('lightning-impact');
            setTimeout(() => {
                targetEl.classList.remove('lightning-impact');
            }, 2000);
        }
    } else if (data.type === 'Regeneration') {
        const cardEl = document.querySelector(`[data-instance-id="${data.targetInstanceId}"]`);
        if (cardEl) {
            cardEl.classList.add('healing-effect');
            cardEl.classList.add('regen-impact');
            setTimeout(() => {
                cardEl.classList.remove('healing-effect');
                cardEl.classList.remove('regen-impact');
            }, 1500);
        }
    } else if (data.type === 'Totem of Undying') {
        const cardEl = document.querySelector(`[data-instance-id="${data.targetInstanceId}"]`);
        if (cardEl) {
            cardEl.classList.add('totem-apply-effect');
            cardEl.classList.add('totem-impact');
            setTimeout(() => {
                cardEl.classList.remove('totem-apply-effect');
                cardEl.classList.remove('totem-impact');
            }, 1500);
        }
    }
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
    updateHeroTargeting();

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
        endTurnBtn.style.display = 'block';
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

    if (myHpText) myHpText.textContent = `❤️ ${myData.hp}/20`;
    if (oppHpText) oppHpText.textContent = `❤️ ${oppData.hp}/20`;

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

    // Update abilities
    const myAbilityBtn = document.getElementById('my-ability-btn');
    const myAbilityImg = document.getElementById('my-ability-img');
    const myAbilityCooldown = document.getElementById('my-ability-cooldown');
    
    const oppAbilityImg = document.getElementById('opp-ability-img');
    const oppAbilityCooldown = document.getElementById('opp-ability-cooldown');

    if (myData && myData.ability && myAbilityImg && myAbilityBtn && myAbilityCooldown) {
        myAbilityImg.src = myData.ability.image_url;
        const nameEl = document.getElementById('tooltip-ability-name');
        const descEl = document.getElementById('tooltip-ability-desc');
        const cdEl = document.getElementById('tooltip-ability-cd');
        
        if (nameEl) nameEl.textContent = myData.ability.name;
        if (descEl) descEl.textContent = myData.ability.description;
        if (cdEl) cdEl.textContent = myData.ability.cooldown;
        
        if (window.isSpectator) {
            myAbilityImg.style.display = 'none';
            myAbilityBtn.classList.add('spectator-ability-back');
            myAbilityBtn.classList.add('disabled');
            // Hide tooltip for spectators so they don't see the name/desc
            const tooltip = myAbilityBtn.querySelector('.ability-tooltip');
            if (tooltip) tooltip.style.display = 'none';
        } else {
            myAbilityImg.style.display = 'block';
            myAbilityBtn.classList.remove('spectator-ability-back');
            const tooltip = myAbilityBtn.querySelector('.ability-tooltip');
            if (tooltip) tooltip.style.display = '';
        }

        if (myData.ability.currentCooldown > 0) {
            myAbilityCooldown.textContent = myData.ability.currentCooldown;
            myAbilityCooldown.classList.remove('hidden');
            myAbilityBtn.classList.add('disabled');
        } else {
            myAbilityCooldown.classList.add('hidden');
            if (!window.isSpectator) {
                myAbilityBtn.classList.toggle('disabled', !isMyTurn);
            }
        }
    }

    if (oppData && oppData.ability && oppAbilityImg && oppAbilityCooldown) {
        oppAbilityImg.src = oppData.ability.image_url;
        if (oppData.ability.currentCooldown > 0) {
            oppAbilityCooldown.textContent = oppData.ability.currentCooldown;
            oppAbilityCooldown.classList.remove('hidden');
        } else {
            oppAbilityCooldown.classList.add('hidden');
        }
    }

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

    const now = Date.now();
    if (window.isSpectator) {
        // Render Player 1's cards as beautiful card backs
        myData.hand.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'card';
            
            if (!cardBirthTimes.has(card.instanceId)) {
                cardBirthTimes.set(card.instanceId, now);
            }
            if (!cardFirstLocation.has(card.instanceId)) {
                cardFirstLocation.set(card.instanceId, 'hand');
            }

            // Add dealing animation if card is "new" AND in its first location
            const elapsed = (now - cardBirthTimes.get(card.instanceId)) / 1000;
            if (elapsed < 1.5 && cardFirstLocation.get(card.instanceId) === 'hand') {
                const totalDelay = (index * 0.1) - elapsed;
                cardEl.classList.add('card-deal');
                cardEl.style.setProperty('animation-delay', `${totalDelay}s`, 'important');
                
                setTimeout(() => cardEl.classList.remove('card-deal'), 1500);
            }

            cardEl.innerHTML = `
                <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle, #3b0764, #1e1b4b); border: 2px solid rgba(147, 51, 234, 0.4); border-radius: 10px; box-shadow: inset 0 0 20px rgba(0,0,0,0.8);">
                    <span style="color: #c084fc; font-weight: bold; font-size: 1.2rem; text-shadow: 0 0 8px #9333ea; letter-spacing: 1.5px;">DARK</span>
                </div>
            `;
            myHandEl.appendChild(cardEl);
        });
    } else {
        myData.hand.forEach((card, index) => {
            const cardEl = createCardElement(card);
            
            if (!cardBirthTimes.has(card.instanceId)) {
                cardBirthTimes.set(card.instanceId, now);
            }
            if (!cardFirstLocation.has(card.instanceId)) {
                cardFirstLocation.set(card.instanceId, 'hand');
            }

            // Add dealing animation for new cards
            const elapsed = (now - cardBirthTimes.get(card.instanceId)) / 1000;
            if (elapsed < 1.5 && cardFirstLocation.get(card.instanceId) === 'hand') {
                const totalDelay = (index * 0.1) - elapsed;
                cardEl.classList.add('card-deal');
                cardEl.style.setProperty('animation-delay', `${totalDelay}s`, 'important');
                
                setTimeout(() => cardEl.classList.remove('card-deal'), 1500);
            }

            if (isMyTurn && myData.energy >= card.cost) {
                cardEl.classList.add('playable-card');
            }

            cardEl.addEventListener('click', () => {
                if (!isMyTurn) return;
                
                if (isTrashMode) {
                    changeOneCardSound.currentTime = 0;
                    changeOneCardSound.play().catch(e => { });
                    socket.emit('trashCard', { gameId, cardInstanceId: card.instanceId });
                    isTrashMode = false;
                    return;
                }

                if (myData.energy < card.cost) return;
                
                // Mark as "old" immediately when played to prevent re-animation on field
                cardBirthTimes.set(card.instanceId, 0);
                
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

    const now = Date.now();
    myData.field.forEach((card, index) => {
        const cardEl = createCardElement(card);
        
        if (!cardBirthTimes.has(card.instanceId)) {
            cardBirthTimes.set(card.instanceId, now);
        }
        if (!cardFirstLocation.has(card.instanceId)) {
            cardFirstLocation.set(card.instanceId, 'field');
        }

        const elapsed = (now - cardBirthTimes.get(card.instanceId)) / 1000;
        if (elapsed < 1.5 && cardFirstLocation.get(card.instanceId) === 'field') {
            const totalDelay = (index * 0.05) - elapsed;
            cardEl.classList.add('card-deal');
            cardEl.style.setProperty('animation-delay', `${totalDelay}s`, 'important');
            
            setTimeout(() => cardEl.classList.remove('card-deal'), 1500);
        }

        if (card.isSummoning) cardEl.classList.add('summoning-sickness');
        
        if (!window.isSpectator) {
            if (isAbilityMode && myData && myData.ability) {
                const abilityName = myData.ability.name;
                if (abilityName === 'Regeneration') {
                    if (card.currentDefense < card.defense) {
                        cardEl.classList.add('valid-ability-target');
                    }
                } else if (abilityName === 'Totem of Undying') {
                    cardEl.classList.add('valid-ability-target');
                }
            }
        }

            if (selectedFieldCard && selectedFieldCard.instanceId === card.instanceId) cardEl.classList.add('selected-card');

            // Add "Ready to Attack" indicator
            if (isMyTurn && !card.isSummoning && card.canAttack !== false) {
                cardEl.classList.add('ready-to-attack');
            }

            cardEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isMyTurn) return;

                if (isAbilityMode) {
                    const abilityName = myData.ability.name;
                    if (abilityName === 'Regeneration') {
                        if (card.currentDefense < card.defense) {
                            socket.emit('useAbility', { gameId, targetInstanceId: card.instanceId });
                            isAbilityMode = false;
                            updateAbilityUI();
                        }
                    } else if (abilityName === 'Totem of Undying') {
                        socket.emit('useAbility', { gameId, targetInstanceId: card.instanceId });
                        isAbilityMode = false;
                        updateAbilityUI();
                    }
                    return;
                }

                if (card.isSummoning || card.canAttack === false) return;

                if (selectedFieldCard && selectedFieldCard.instanceId === card.instanceId) {
                    selectedFieldCard = null;
                } else {
                    selectedFieldCard = card;
                }
                renderField();
            });
            myFieldEl.appendChild(cardEl);
    });

    const hasTaunt = oppData.field.some(c => c.has_taunt);

    oppData.field.forEach((card, index) => {
        const cardEl = createCardElement(card);
        
        if (!cardBirthTimes.has(card.instanceId)) {
            cardBirthTimes.set(card.instanceId, now);
        }
        if (!cardFirstLocation.has(card.instanceId)) {
            cardFirstLocation.set(card.instanceId, 'field');
        }

        const elapsed = (now - cardBirthTimes.get(card.instanceId)) / 1000;
        if (elapsed < 1.5 && cardFirstLocation.get(card.instanceId) === 'field') {
            const totalDelay = (index * 0.05) - elapsed;
            cardEl.classList.add('card-deal');
            cardEl.style.setProperty('animation-delay', `${totalDelay}s`, 'important');
            
            setTimeout(() => cardEl.classList.remove('card-deal'), 1500);
        }
        
        if (!window.isSpectator) {
            if (isAbilityMode) {
                const abilityName = myData.ability.name;
                if (abilityName === 'Freeze' || abilityName === 'Lightning') {
                    cardEl.classList.add('valid-ability-target');
                }
            }

            const canHitThis = !hasTaunt || card.has_taunt;

            if (selectedFieldCard && canHitThis) {
                cardEl.classList.add('valid-target');
            }

            if (hasTaunt && !card.has_taunt) cardEl.style.opacity = '0.5';

            cardEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isMyTurn) return;

                if (isAbilityMode) {
                    const abilityName = myData.ability.name;
                    if (abilityName === 'Freeze' || abilityName === 'Lightning') {
                        socket.emit('useAbility', { gameId, targetInstanceId: card.instanceId });
                        isAbilityMode = false;
                        updateAbilityUI();
                    }
                    return;
                }

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

    // Cleanup cardBirthTimes and cardFirstLocation
    const currentIds = new Set([
        ...myData.hand.map(c => c.instanceId),
        ...myData.field.map(c => c.instanceId),
        ...oppData.field.map(c => c.instanceId)
    ]);
    for (const id of cardBirthTimes.keys()) {
        if (!currentIds.has(id)) {
            cardBirthTimes.delete(id);
            cardFirstLocation.delete(id);
        }
    }
}

// Update hero targeting highlighting
function updateHeroTargeting() {
    const oppInfo = document.querySelector('.opponent-area .player-info');
    if (!oppInfo) return;

    if (isAbilityMode && myData && myData.ability && myData.ability.name === 'Lightning') {
        oppInfo.classList.add('valid-hero-ability-target');
    } else {
        oppInfo.classList.remove('valid-hero-ability-target');
    }
}

// Hero attack
document.querySelector('.opponent-area .player-info').addEventListener('click', () => {
    if (window.isSpectator) return;

    if (isAbilityMode && myData.ability.name === 'Lightning') {
        socket.emit('useAbility', { gameId, target: 'hero' });
        isAbilityMode = false;
        updateAbilityUI();
        return;
    }

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
    cardEl.dataset.instanceId = card.instanceId;
    if (card.has_taunt) cardEl.classList.add('taunt-border');

    const displayDef = card.currentDefense !== undefined ? card.currentDefense : card.defense;

    cardEl.innerHTML = `
        <div class="card-cost">⚡ ${card.cost}</div>
        ${card.isFrozen ? '<div class="frozen-overlay">❄️</div>' : ''}
        <div class="card-image" style="background-image: url('${card.image_url}')"></div>
        <div class="card-name">${card.name}</div>
        <div class="card-stats">
            <span class="card-atk">⚔️ ${card.attack}</span>
            <div class="def-container" style="position: relative; display: flex; align-items: center;">
                <span class="card-def">❤️ ${displayDef}</span>
                ${card.hasTotem ? '<img src="/assets/cards/small_totem_of_undying.png" class="totem-icon-mini" title="Totem of Undying">' : ''}
            </div>
        </div>
        <div class="poison-overlay"></div>
        <div class="lightning-overlay"></div>
        <div class="regen-overlay"></div>
        <div class="freeze-overlay-card"></div>
        <div class="totem-overlay-card"></div>
    `;
    return cardEl;
}

endTurnBtn.addEventListener('click', () => {
    clickSound.currentTime = 0;
    clickSound.play().catch(e => { });
    isTrashMode = false;
    isAbilityMode = false;
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
    
    shuffleCardsSound.currentTime = 0;
    shuffleCardsSound.play().catch(e => { });
    
    socket.emit('changeHand', { gameId });
});

// Ability usage logic
document.getElementById('my-ability-btn').addEventListener('click', () => {
    if (!isMyTurn || myData.ability.currentCooldown > 0 || window.isSpectator) return;
    
    clickSound.currentTime = 0;
    clickSound.play().catch(e => { });

    if (myData.ability.name === 'Poison') {
        socket.emit('useAbility', { gameId });
        return;
    }
    
    isAbilityMode = !isAbilityMode;
    isTrashMode = false;
    selectedFieldCard = null;
    updateAbilityUI();
    renderField();
});

function updateAbilityUI() {
    const btn = document.getElementById('my-ability-btn');
    if (!btn) return;
    if (isAbilityMode) btn.classList.add('active');
    else btn.classList.remove('active');
    updateHeroTargeting();
}

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

        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(currentAngle);
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(-20, -15);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-20, 15);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(-20, -15, 15, 15);
        gradient.addColorStop(0, '#ff5a5a');
        gradient.addColorStop(1, '#8b0000');

        ctx.fillStyle = gradient;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff0000';
        ctx.fill();

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
        mainColor = '#c084fc';
    }

    ctx.font = 'bold 60px Outfit';
    ctx.fillStyle = mainColor;
    ctx.textAlign = 'center';
    ctx.shadowBlur = 30;
    ctx.shadowColor = mainColor;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 - 80);

    ctx.font = 'bold 45px Outfit';
    ctx.fillText(eloText, canvas.width / 2, canvas.height / 2 - 10);

    // Add Coins Display for winner
    if (isWinner && !window.isSpectator) {
        const coinImg = new Image();
        coinImg.src = '/assets/coins.png';
        coinImg.onload = () => {
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2 + 50;
            
            ctx.font = 'bold 45px Outfit';
            ctx.fillStyle = '#FFD700';
            ctx.shadowColor = 'rgba(255, 215, 0, 0.5)';
            ctx.shadowBlur = 15;
            
            const rewardText = '+50';
            const textWidth = ctx.measureText(rewardText).width;
            const iconSize = 45;
            const gap = 15;
            const totalWidth = textWidth + gap + iconSize;
            
            const startX = centerX - totalWidth / 2;
            
            ctx.fillText(rewardText, startX + textWidth / 2, centerY + 12);
            ctx.drawImage(coinImg, startX + textWidth + gap, centerY - iconSize / 2, iconSize, iconSize);
        };
    }

    ctx.shadowBlur = 0;
    ctx.font = '24px Outfit';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Winner: ${winnerName}`, canvas.width / 2, canvas.height / 2 + 130);
    ctx.fillText('Returning to lobby in 5 seconds...', canvas.width / 2, canvas.height / 2 + 170);

    setTimeout(() => {
        window.location.href = '/lobby';
    }, 5000);
}

function showAbilityAnnouncement(ability) {
    const overlay = document.getElementById('ability-announcement');
    const img = document.getElementById('announced-ability-img');
    const name = document.getElementById('announced-ability-name');
    const desc = document.getElementById('announced-ability-desc');
    const closeBtn = document.getElementById('close-announcement-btn');

    if (!overlay || !img || !name || !desc || !closeBtn) return;

    img.src = ability.image_url;
    name.textContent = ability.name;
    desc.textContent = ability.description;

    overlay.classList.remove('hidden');

    closeBtn.onclick = () => {
        overlay.classList.add('hidden');
        clickSound.currentTime = 0;
        clickSound.play().catch(e => { });
    };
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
    .healing-effect {
    animation: healGlow 1s ease-out !important;
    z-index: 100;
}

@keyframes totemGlow {
    0% { box-shadow: 0 0 0px #fbbf24; }
    50% { box-shadow: 0 0 40px #fbbf24; border-color: #fbbf24; }
    100% { box-shadow: 0 0 0px #fbbf24; }
}

.totem-apply-effect {
    animation: totemGlow 1s ease-out !important;
}

.totem-icon-mini {
    width: 24px;
    height: 24px;
    position: absolute;
    right: -28px;
    top: 50%;
    transform: translateY(-50%);
    filter: drop-shadow(0 0 5px rgba(251, 191, 36, 0.8));
    animation: totemMiniFloat 2s infinite ease-in-out;
    z-index: 5;
}

@keyframes totemMiniFloat {
    0%, 100% { transform: translateY(-50%) scale(1); }
    50% { transform: translateY(-60%) scale(1.1); }
}

    @keyframes poisonImpact {
        0% { transform: scale(1); }
        30% { transform: scale(1.2); }
        70% { transform: scale(1.2); }
        100% { transform: scale(1); }
    }

    .poison-impact {
        animation: poisonImpact 1.5s ease-out !important;
        z-index: 100;
    }

    .poison-overlay {
        position: absolute;
        inset: 0;
        background-image: url('/assets/cards/poison.png');
        background-size: cover;
        background-position: center;
        opacity: 0;
        z-index: 15;
        transition: opacity 0.3s ease;
        border-radius: inherit;
        pointer-events: none;
    }

    .poison-impact .poison-overlay {
        opacity: 1;
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

    .lightning-impact {
        animation: poisonImpact 1.5s ease-out !important;
        z-index: 100;
    }

    .regen-impact {
        animation: poisonImpact 1.5s ease-out !important;
        z-index: 100;
    }

    .freeze-impact {
        animation: poisonImpact 1.5s ease-out !important;
        z-index: 100;
    }

    .totem-impact {
        animation: poisonImpact 1.5s ease-out !important;
        z-index: 100;
    }

    .lightning-overlay {
        position: absolute;
        inset: 0;
        background-image: url('/assets/cards/lightning.png');
        background-size: cover;
        background-position: center;
        opacity: 0;
        z-index: 20;
        transition: opacity 0.3s ease;
        border-radius: inherit;
        pointer-events: none;
    }

    .lightning-impact .lightning-overlay {
        opacity: 1 !important;
    }

    .regen-overlay {
        position: absolute;
        inset: 0;
        background-image: url('/assets/cards/regeneration.png');
        background-size: cover;
        background-position: center;
        opacity: 0;
        z-index: 20;
        transition: opacity 0.3s ease;
        border-radius: inherit;
        pointer-events: none;
    }

    .regen-impact .regen-overlay {
        opacity: 1 !important;
    }

    .freeze-overlay-card {
        position: absolute;
        inset: 0;
        background-image: url('/assets/cards/freeze.png');
        background-size: cover;
        background-position: center;
        opacity: 0;
        z-index: 20;
        transition: opacity 0.3s ease;
        border-radius: inherit;
        pointer-events: none;
    }

    .freeze-impact .freeze-overlay-card {
        opacity: 1 !important;
    }

    .totem-overlay-card {
        position: absolute;
        inset: 0;
        background-image: url('/assets/cards/totem_of_undying.png');
        background-size: cover;
        background-position: center;
        opacity: 0;
        z-index: 20;
        transition: opacity 0.3s ease;
        border-radius: inherit;
        pointer-events: none;
    }

    .totem-impact .totem-overlay-card {
        opacity: 1 !important;
    }

    .player-info .lightning-overlay {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        background-image: url('/assets/cards/small_lightning.png');
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        top: 0;
        left: 0;
        transform: none;
    }

    .player-info {
        position: relative;
    }

    .spectator-ability-back {
        background: radial-gradient(circle, #3b0764, #1e1b4b) !important;
        border: 2px solid rgba(147, 51, 234, 0.4) !important;
        position: relative;
    }

    .spectator-ability-back::after {
        content: 'DARK';
        color: #c084fc;
        font-weight: bold;
        font-size: 0.8rem;
        text-shadow: 0 0 5px #9333ea;
        letter-spacing: 1px;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }
`;
document.head.appendChild(style);
