const { v4: uuidv4 } = require('uuid');
const Card = require('../models/Card');
const User = require('../models/User');
const Match = require('../models/Match');
const Ability = require('../models/Ability');
const Friendship = require('../models/Friendship');

let waitingPlayer = null;
const activeGames = new Map();
const disconnectTimeouts = new Map();
const onlineUsers = new Map(); // userId -> Set of socket.id
const activeBattleInvites = new Map();
const BATTLE_INVITE_TIMEOUT_MS = 30000;

function normalizeUserId(userId) {
    if (userId === undefined || userId === null || userId === '') return null;
    return String(userId);
}

function getUserActiveGameIdInternal(userId) {
    if (!userId) return null;
    for (const [gameId, game] of activeGames.entries()) {
        const player = game.players.find(p => String(p.dbUserId) === String(userId));
        if (player) {
            return gameId;
        }
    }
    return null;
}

function isUserSearching(userId) {
    return !!waitingPlayer && String(waitingPlayer.dbUserId) === String(userId);
}

function isUserBusy(userId) {
    return isUserSearching(userId) || getUserActiveGameIdInternal(userId) !== null;
}

function isUserOnlineInternal(userId) {
    if (!userId) return false;
    return onlineUsers.has(normalizeUserId(userId)) || getUserActiveGameIdInternal(userId) !== null;
}

function getOnlineSocket(io, userId) {
    const sockets = onlineUsers.get(normalizeUserId(userId));
    if (!sockets) return null;

    for (const socketId of sockets) {
        const connectedSocket = io.sockets.sockets.get(socketId);
        if (connectedSocket) {
            return connectedSocket;
        }
    }

    return null;
}

function createBattle(io, playerOne, playerTwo) {
    const gameId = uuidv4();

    playerOne.socket.join(gameId);
    playerTwo.socket.join(gameId);

    activeGames.set(gameId, {
        players: [
            {
                dbUserId: playerOne.dbUserId,
                nickname: playerOne.nickname,
                avatar: playerOne.avatar,
                elo: playerOne.elo,
                socketId: playerOne.socket.id,
                ready: false
            },
            {
                dbUserId: playerTwo.dbUserId,
                nickname: playerTwo.nickname,
                avatar: playerTwo.avatar,
                elo: playerTwo.elo,
                socketId: playerTwo.socket.id,
                ready: false
            }
        ],
        gameState: 'initializing'
    });

    console.log(`[MATCH] Battle found: ${playerOne.nickname} vs ${playerTwo.nickname} (GameID: ${gameId})`);
    io.to(gameId).emit('matchFound', { gameId });
    return gameId;
}

function clearBattleInvite(inviteId) {
    const invite = activeBattleInvites.get(inviteId);
    if (!invite) return null;

    if (invite.timeout) {
        clearTimeout(invite.timeout);
    }

    activeBattleInvites.delete(inviteId);
    return invite;
}

function hasPendingInviteBetween(fromUserId, toUserId) {
    for (const invite of activeBattleInvites.values()) {
        if (String(invite.fromUserId) === String(fromUserId) && String(invite.toUserId) === String(toUserId)) {
            return true;
        }
    }
    return false;
}

function hasOutgoingInvite(userId) {
    for (const invite of activeBattleInvites.values()) {
        if (String(invite.fromUserId) === String(userId)) {
            return true;
        }
    }
    return false;
}

function clearInvitesForUser(userId, io, message = 'Battle invite is no longer available.') {
    const normalizedUserId = normalizeUserId(userId);

    for (const [inviteId, invite] of [...activeBattleInvites.entries()]) {
        if (String(invite.fromUserId) !== normalizedUserId && String(invite.toUserId) !== normalizedUserId) {
            continue;
        }

        clearBattleInvite(inviteId);

        io.to(`user_${invite.fromUserId}`).emit('battleInviteExpired', {
            inviteId,
            targetUserId: invite.toUserId,
            targetNickname: invite.receiver.nickname,
            message
        });

        io.to(`user_${invite.toUserId}`).emit('battleInviteExpired', {
            inviteId,
            senderUserId: invite.fromUserId,
            senderNickname: invite.sender.nickname,
            message
        });
    }
}

module.exports = (io) => {
    function broadcastLobbyStats() {
        const onlineCount = io.engine.clientsCount;
        const searchingCount = waitingPlayer ? 1 : 0;
        io.emit('lobbyStatsUpdate', {
            online: onlineCount,
            searching: searchingCount
        });
    }

    io.on('connection', (socket) => {
        broadcastLobbyStats();
        socket.on('joinUserRoom', (data) => {
            if (data.userId) {
                const userId = normalizeUserId(data.userId);
                socket.dbUserId = userId;
                if (!onlineUsers.has(userId)) {
                    onlineUsers.set(userId, new Set());
                }
                onlineUsers.get(userId).add(socket.id);
                socket.join(`user_${userId}`);
            }
        });

        socket.on('checkActiveGame', (data) => {
            for (const [gameId, game] of activeGames.entries()) {
                const player = game.players.find(p => String(p.dbUserId) === String(data.userId));
                if (player) {
                    socket.emit('activeGameFound', { gameId });
                    return;
                }
            }
        });

        socket.on('cancelSearch', () => {
            if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
                waitingPlayer = null;
                broadcastLobbyStats();
                console.log(`[MATCH] User cancelled search: ${socket.id}`);
            }
        });

        socket.on('findMatch', (data) => {
            // Check for active game first
            for (const [gameId, game] of activeGames.entries()) {
                const player = game.players.find(p => String(p.dbUserId) === String(data.userId));
                if (player) {
                    socket.emit('matchFound', { gameId });
                    return;
                }
            }

            clearInvitesForUser(data.userId, io, 'Battle invite cancelled because a player started searching.');

            if (waitingPlayer && String(waitingPlayer.dbUserId) === String(data.userId)) {
                socket.emit('matchSearchError', {
                    message: 'You are already searching for a battle.'
                });
                return;
            }

            if (waitingPlayer && waitingPlayer.socket.id !== socket.id) {
                // Match found
                const opponent = waitingPlayer;
                waitingPlayer = null;
                broadcastLobbyStats();

                createBattle(io, opponent, {
                    dbUserId: data.userId,
                    nickname: data.nickname,
                    avatar: data.avatar,
                    elo: data.elo,
                    socket
                });
            } else {
                // Start waiting
                waitingPlayer = { dbUserId: data.userId, nickname: data.nickname, avatar: data.avatar, elo: data.elo, socket: socket };
                broadcastLobbyStats();
            }
        });

        socket.on('sendBattleInvite', async (data = {}) => {
            try {
                const senderId = normalizeUserId(socket.dbUserId || data.userId);
                const targetUserId = normalizeUserId(data.targetUserId);

                if (!senderId || !targetUserId || senderId === targetUserId) {
                    socket.emit('battleInviteError', {
                        targetUserId,
                        message: 'Invalid battle invite target.'
                    });
                    return;
                }

                if (isUserBusy(senderId)) {
                    socket.emit('battleInviteError', {
                        targetUserId,
                        message: 'You cannot send a battle invite while searching or already in battle.'
                    });
                    return;
                }

                if (!isUserOnlineInternal(targetUserId)) {
                    socket.emit('battleInviteError', {
                        targetUserId,
                        message: 'Friend is offline.'
                    });
                    return;
                }

                if (isUserBusy(targetUserId)) {
                    socket.emit('battleInviteError', {
                        targetUserId,
                        message: 'Friend is busy.'
                    });
                    return;
                }

                if (hasOutgoingInvite(senderId)) {
                    socket.emit('battleInviteError', {
                        targetUserId,
                        message: 'You already have a pending battle invite.'
                    });
                    return;
                }

                if (hasPendingInviteBetween(senderId, targetUserId)) {
                    socket.emit('battleInviteError', {
                        targetUserId,
                        message: 'Battle invite already sent.'
                    });
                    return;
                }

                const relation = await Friendship.getRelation(senderId, targetUserId);
                if (!relation || relation.status !== 'accepted') {
                    socket.emit('battleInviteError', {
                        targetUserId,
                        message: 'You can only invite friends to battle.'
                    });
                    return;
                }

                const sender = await User.findById(senderId);
                const receiver = await User.findById(targetUserId);

                if (!sender || !receiver) {
                    socket.emit('battleInviteError', {
                        targetUserId,
                        message: 'Player not found.'
                    });
                    return;
                }

                const inviteId = uuidv4();
                const invite = {
                    inviteId,
                    fromUserId: senderId,
                    toUserId: targetUserId,
                    senderSocketId: socket.id,
                    sender: {
                        id: sender.id,
                        nickname: sender.nickname,
                        avatar: sender.avatar || '/assets/default_avatar.png',
                        elo: sender.elo
                    },
                    receiver: {
                        id: receiver.id,
                        nickname: receiver.nickname,
                        avatar: receiver.avatar || '/assets/default_avatar.png',
                        elo: receiver.elo
                    }
                };

                invite.timeout = setTimeout(() => {
                    const timedOutInvite = clearBattleInvite(inviteId);
                    if (!timedOutInvite) return;

                    io.to(`user_${timedOutInvite.fromUserId}`).emit('battleInviteExpired', {
                        inviteId,
                        targetUserId: timedOutInvite.toUserId,
                        targetNickname: timedOutInvite.receiver.nickname,
                        message: `Battle invite to ${timedOutInvite.receiver.nickname} expired.`
                    });

                    io.to(`user_${timedOutInvite.toUserId}`).emit('battleInviteExpired', {
                        inviteId,
                        senderUserId: timedOutInvite.fromUserId,
                        senderNickname: timedOutInvite.sender.nickname,
                        message: 'Battle invite expired.'
                    });
                }, BATTLE_INVITE_TIMEOUT_MS);

                activeBattleInvites.set(inviteId, invite);

                socket.emit('battleInviteSent', {
                    inviteId,
                    targetUserId,
                    targetNickname: receiver.nickname
                });

                io.to(`user_${targetUserId}`).emit('battleInviteReceived', {
                    inviteId,
                    sender: invite.sender
                });
            } catch (error) {
                console.error('[BATTLE INVITE] Failed to send invite:', error);
                socket.emit('battleInviteError', {
                    targetUserId: data.targetUserId,
                    message: 'Failed to send battle invite.'
                });
            }
        });

        socket.on('declineBattleInvite', (data = {}) => {
            const pendingInvite = activeBattleInvites.get(data.inviteId);
            if (!pendingInvite || String(pendingInvite.toUserId) !== String(socket.dbUserId)) {
                return;
            }
            const invite = clearBattleInvite(data.inviteId);

            io.to(`user_${invite.fromUserId}`).emit('battleInviteDeclined', {
                inviteId: invite.inviteId,
                targetUserId: invite.toUserId,
                targetNickname: invite.receiver.nickname,
                message: `${invite.receiver.nickname} declined your battle invite.`
            });

            io.to(`user_${invite.toUserId}`).emit('battleInviteClosed', {
                inviteId: invite.inviteId
            });
        });

        socket.on('acceptBattleInvite', (data = {}) => {
            const invite = activeBattleInvites.get(data.inviteId);
            if (!invite || String(invite.toUserId) !== String(socket.dbUserId)) {
                socket.emit('battleInviteUnavailable', {
                    inviteId: data.inviteId,
                    message: 'Battle invite is no longer available.'
                });
                return;
            }

            if (isUserBusy(invite.fromUserId) || isUserBusy(invite.toUserId)) {
                clearBattleInvite(invite.inviteId);
                io.to(`user_${invite.fromUserId}`).emit('battleInviteUnavailable', {
                    inviteId: invite.inviteId,
                    targetUserId: invite.toUserId,
                    targetNickname: invite.receiver.nickname,
                    message: 'Battle invite cancelled because a player is busy.'
                });
                io.to(`user_${invite.toUserId}`).emit('battleInviteUnavailable', {
                    inviteId: invite.inviteId,
                    senderUserId: invite.fromUserId,
                    senderNickname: invite.sender.nickname,
                    message: 'Battle invite cancelled because a player is busy.'
                });
                return;
            }

            const senderSocket = io.sockets.sockets.get(invite.senderSocketId) || getOnlineSocket(io, invite.fromUserId);
            const receiverSocket = socket.connected ? socket : getOnlineSocket(io, invite.toUserId);

            if (!senderSocket || !receiverSocket) {
                clearBattleInvite(invite.inviteId);
                io.to(`user_${invite.fromUserId}`).emit('battleInviteUnavailable', {
                    inviteId: invite.inviteId,
                    targetUserId: invite.toUserId,
                    targetNickname: invite.receiver.nickname,
                    message: 'Battle invite cancelled because a player went offline.'
                });
                io.to(`user_${invite.toUserId}`).emit('battleInviteUnavailable', {
                    inviteId: invite.inviteId,
                    senderUserId: invite.fromUserId,
                    senderNickname: invite.sender.nickname,
                    message: 'Battle invite cancelled because a player went offline.'
                });
                return;
            }

            clearBattleInvite(invite.inviteId);
            clearInvitesForUser(invite.fromUserId, io);
            clearInvitesForUser(invite.toUserId, io);

            const gameId = createBattle(io, {
                dbUserId: invite.fromUserId,
                nickname: invite.sender.nickname,
                avatar: invite.sender.avatar,
                elo: invite.sender.elo,
                socket: senderSocket
            }, {
                dbUserId: invite.toUserId,
                nickname: invite.receiver.nickname,
                avatar: invite.receiver.avatar,
                elo: invite.receiver.elo,
                socket: receiverSocket
            });

            io.to(`user_${invite.fromUserId}`).emit('battleInviteAccepted', {
                inviteId: invite.inviteId,
                gameId,
                opponentNickname: invite.receiver.nickname
            });

            io.to(`user_${invite.toUserId}`).emit('battleInviteAccepted', {
                inviteId: invite.inviteId,
                gameId,
                opponentNickname: invite.sender.nickname
            });
        });

        socket.on('joinGame', async (data) => {
            socket.join(data.gameId);
            const game = activeGames.get(data.gameId);
            if (game) {
                // Update socket ID for the player who just joined (because of page reload)
                const player = game.players.find(p => String(p.dbUserId) === String(data.userId));
                if (player) {
                    player.socketId = socket.id;
                    player.ready = true;
                    // Update nickname from session in case it was changed
                    if (data.nickname) player.nickname = data.nickname;
                    console.log(`[GAME] Player ${data.nickname} joined the battle (GameID: ${data.gameId})`);
                } else {
                    console.log(`[GAME] Spectator joined the battle (GameID: ${data.gameId})`);
                }

                // If both players joined, start the game
                const room = io.sockets.adapter.rooms.get(data.gameId);
                const allReady = game.players.every(p => p.ready);

                if (room && room.size >= 2 && allReady && game.gameState === 'initializing') {
                    console.log(`[GAME] Battle started (GameID: ${data.gameId})`);
                    game.gameState = 'active';

                    // Initialize game state
                    game.round = 1;
                    game.turn = Math.floor(Math.random() * 2); // Random turn
                    game.startingTurn = game.turn; // Store who started the game
                    game.timer = 30;

                    for (let p of game.players) {
                        p.hp = 20;
                        p.energy = 1;
                        p.maxEnergy = 1;
                        const cards = await Card.getBalancedInitialHand(5, p.dbUserId);
                        p.hand = cards.map(c => ({ ...c, instanceId: uuidv4() }));
                        p.field = [];
                        p.trashCount = 3;
                        p.canChangeHand = true;
                        const rank = User.getRank(p.elo);
                        p.rankName = rank.name;
                        p.rankIcon = rank.icon;

                        // Assign random ability
                        const randomAbility = await Ability.getRandomAbility();
                        p.ability = {
                            ...randomAbility,
                            currentCooldown: 2
                        };
                    }

                    io.to(data.gameId).emit('startGame', {
                        players: game.players.map(p => ({
                            ...p,
                            hand: p.hand // hand is already mapped
                        })),
                        turn: game.turn,
                        round: game.round,
                        isRejoin: false
                    });

                    setTimeout(() => {
                        const currentGame = activeGames.get(data.gameId);
                        if (currentGame && currentGame.gameState === 'active') {
                            startTimer(data.gameId, io);
                        }
                    }, 5000);
                } else if (room && room.size >= 2 && game.gameState === 'active') {
                    // Rejoining active game or Spectator joining mid-game
                    if (player) {
                        // Clear disconnect timeout if exists
                        const timeoutKey = `${data.gameId}_${player.dbUserId}`;
                        if (disconnectTimeouts.has(timeoutKey)) {
                            clearTimeout(disconnectTimeouts.get(timeoutKey));
                            disconnectTimeouts.delete(timeoutKey);
                        }

                        socket.emit('startGame', {
                            players: game.players,
                            turn: game.turn,
                            round: game.round,
                            isRejoin: true
                        });
                    } else {
                        // Send current game state to spectator
                        socket.emit('startGame', {
                            players: game.players,
                            turn: game.turn,
                            round: game.round,
                            isRejoin: true,
                            isSpectator: true
                        });
                    }
                } else if (room && room.size >= 1 && game.gameState === 'initializing' && !player) {
                    // Spectator joining during initialization
                    socket.emit('startGame', {
                        players: game.players,
                        turn: game.turn,
                        round: game.round,
                        isRejoin: false,
                        isSpectator: true
                    });
                }
            }
        });

        socket.on('endTurn', async (data) => {
            const game = activeGames.get(data.gameId);
            if (game && game.players[game.turn].socketId === socket.id) {
                await switchTurn(data.gameId, io);
            }
        });

        socket.on('playCard', (data) => {
            const game = activeGames.get(data.gameId);
            if (!game) return;
            const player = game.players[game.turn];
            if (player.socketId !== socket.id) return;

            const cardIndex = player.hand.findIndex(c => c.instanceId === data.cardInstanceId);
            if (cardIndex !== -1) {
                const card = player.hand[cardIndex];
                if (player.energy >= card.cost) {
                    player.energy -= card.cost;
                    const fieldCard = { ...card, currentDefense: card.defense, isSummoning: true };
                    player.field.push(fieldCard);
                    player.hand.splice(cardIndex, 1);

                    io.to(data.gameId).emit('gameStateUpdate', {
                        players: game.players,
                        turn: game.turn
                    });
                }
            }
        });

        socket.on('trashCard', async (data) => {
            const game = activeGames.get(data.gameId);
            if (!game) return;
            const player = game.players[game.turn];
            if (player.socketId !== socket.id) return;
            if (player.trashCount <= 0) return;

            const cardIndex = player.hand.findIndex(c => c.instanceId === data.cardInstanceId);
            if (cardIndex !== -1) {
                player.hand.splice(cardIndex, 1);
                player.trashCount--;

                // Give one new card
                const newCards = await Card.getWeightedRandomCards(1, player.hand, [], player.dbUserId);
                player.hand.push(...newCards.map(c => ({ ...c, instanceId: uuidv4() })));

                io.to(data.gameId).emit('gameStateUpdate', {
                    players: game.players,
                    turn: game.turn
                });
            }
        });

        socket.on('changeHand', async (data) => {
            const game = activeGames.get(data.gameId);
            if (!game) return;
            const player = game.players[game.turn];
            if (player.socketId !== socket.id) return;
            if (!player.canChangeHand) return;

            const handSize = player.hand.length;
            player.hand = [];
            player.canChangeHand = false;

            const newCards = await Card.getBalancedInitialHand(handSize, player.dbUserId);
            player.hand = newCards.map(c => ({ ...c, instanceId: uuidv4() }));

            io.to(data.gameId).emit('gameStateUpdate', {
                players: game.players,
                turn: game.turn
            });
        });

        socket.on('attack', async (data) => {
            const game = activeGames.get(data.gameId);
            if (!game) return;
            const attackerPlayer = game.players[game.turn];
            if (attackerPlayer.socketId !== socket.id) return;

            const defenderPlayer = game.players[game.turn === 0 ? 1 : 0];
            const attackerCard = attackerPlayer.field.find(c => c.instanceId === data.attackerInstanceId);

            if (attackerCard && !attackerCard.isSummoning && attackerCard.canAttack !== false) {
                if (data.target === 'hero') {
                    // Check for taunt
                    const hasTaunt = defenderPlayer.field.some(c => c.has_taunt);
                    if (!hasTaunt) {
                        defenderPlayer.hp -= attackerCard.attack;
                        attackerCard.canAttack = false;
                        io.to(data.gameId).emit('attackEvent', { type: 'hero' });
                    }
                } else {
                    // Attack card
                    const defenderCard = defenderPlayer.field.find(c => c.instanceId === data.targetInstanceId);
                    const hasTaunt = defenderPlayer.field.some(c => c.has_taunt);

                    if (defenderCard && (!hasTaunt || defenderCard.has_taunt)) {
                        // Trade damage
                        defenderCard.currentDefense -= attackerCard.attack;
                        attackerCard.currentDefense -= defenderCard.attack;
                        attackerCard.canAttack = false;

                        io.to(data.gameId).emit('attackEvent', { type: 'card' });

                        // Remove dead cards
                        if (defenderCard.currentDefense <= 0) {
                            if (defenderCard.hasTotem) {
                                defenderCard.currentDefense = Math.ceil(defenderCard.defense * 0.5);
                                defenderCard.hasTotem = false;
                            } else {
                                defenderPlayer.field = defenderPlayer.field.filter(c => c !== defenderCard);
                            }
                        }
                        if (attackerCard.currentDefense <= 0) {
                            if (attackerCard.hasTotem) {
                                attackerCard.currentDefense = Math.ceil(attackerCard.defense * 0.5);
                                attackerCard.hasTotem = false;
                            } else {
                                attackerPlayer.field = attackerPlayer.field.filter(c => c !== attackerCard);
                            }
                        }
                    }
                }

                // Check for victory
                if (defenderPlayer.hp <= 0) {
                    await endGame(data.gameId, io, attackerPlayer, defenderPlayer);
                } else {
                    io.to(data.gameId).emit('gameStateUpdate', {
                        players: game.players,
                        turn: game.turn
                    });
                }
            }
        });

        socket.on('useAbility', async (data) => {
            const game = activeGames.get(data.gameId);
            if (!game) return;
            const player = game.players[game.turn];
            if (player.socketId !== socket.id) return;
            if (!player.ability || player.ability.currentCooldown > 0) return;

            const oppPlayer = game.players[game.turn === 0 ? 1 : 0];
            let used = false;

            switch (player.ability.name) {
                case 'Freeze':
                    const targetFreeze = oppPlayer.field.find(c => c.instanceId === data.targetInstanceId);
                    if (targetFreeze) {
                        targetFreeze.isFrozen = true;
                        targetFreeze.canAttack = false;
                        used = true;
                    }
                    break;
                case 'Lightning':
                    if (data.target === 'hero') {
                        oppPlayer.hp -= 2;
                        used = true;
                    } else {
                        const targetLightning = oppPlayer.field.find(c => c.instanceId === data.targetInstanceId);
                        if (targetLightning) {
                            targetLightning.currentDefense -= 4;
                            if (targetLightning.currentDefense <= 0) {
                                if (targetLightning.hasTotem) {
                                    targetLightning.currentDefense = Math.ceil(targetLightning.defense * 0.5);
                                    targetLightning.hasTotem = false;
                                } else {
                                    oppPlayer.field = oppPlayer.field.filter(c => c !== targetLightning);
                                }
                            }
                            used = true;
                        }
                    }
                    break;
                case 'Poison':
                    const enemyCards = [...oppPlayer.field];
                    const targetsCount = Math.min(2, enemyCards.length);
                    const poisonedTargets = [];
                    for (let i = 0; i < targetsCount; i++) {
                        const randomIndex = Math.floor(Math.random() * enemyCards.length);
                        const card = enemyCards.splice(randomIndex, 1)[0];
                        card.currentDefense -= 2;
                        poisonedTargets.push(card.instanceId);
                        if (card.currentDefense <= 0) {
                            if (card.hasTotem) {
                                card.currentDefense = Math.ceil(card.defense * 0.5);
                                card.hasTotem = false;
                            }
                        }
                    }
                    oppPlayer.field = oppPlayer.field.filter(c => c.currentDefense > 0);
                    used = true;
                    data.poisonedTargets = poisonedTargets;
                    break;
                case 'Regeneration':
                    const targetRegen = player.field.find(c => c.instanceId === data.targetInstanceId);
                    if (targetRegen && targetRegen.currentDefense < targetRegen.defense) {
                        targetRegen.currentDefense = targetRegen.defense;
                        used = true;
                    }
                    break;
                case 'Totem of Undying':
                    const targetTotem = player.field.find(c => c.instanceId === data.targetInstanceId);
                    if (targetTotem) {
                        targetTotem.hasTotem = true;
                        used = true;
                    }
                    break;
            }

            if (used) {
                player.ability.currentCooldown = player.ability.cooldown;

                io.to(data.gameId).emit('abilityEvent', {
                    type: player.ability.name,
                    playerIndex: game.turn,
                    targetInstanceId: data.targetInstanceId,
                    target: data.target,
                    poisonedTargets: data.poisonedTargets
                });

                // Wait for animations to finish before updating state
                setTimeout(async () => {
                    const updatedGame = activeGames.get(data.gameId);
                    if (!updatedGame) return;

                    const p1 = updatedGame.players[0];
                    const p2 = updatedGame.players[1];

                    if (p1.hp <= 0 || p2.hp <= 0) {
                        await endGame(data.gameId, io, p1, p2);
                    } else {
                        io.to(data.gameId).emit('gameStateUpdate', {
                            players: updatedGame.players,
                            turn: updatedGame.turn
                        });
                    }
                }, 2000);
            }
        });

        socket.on('sendEmoji', (data) => {
            const game = activeGames.get(data.gameId);
            if (!game) return;

            // Make sure the sender is a player, not a spectator
            const isPlayer = game.players.some(p => String(p.dbUserId) === String(data.senderId));
            if (!isPlayer) return;

            // Broadcast the emoji to the room
            io.to(data.gameId).emit('receiveEmoji', {
                emojiId: data.emojiId,
                senderId: data.senderId
            });
        });

        socket.on('disconnect', async () => {
            if (socket.dbUserId) {
                const sockets = onlineUsers.get(socket.dbUserId);
                if (sockets) {
                    sockets.delete(socket.id);
                    if (sockets.size === 0) {
                        onlineUsers.delete(socket.dbUserId);
                        clearInvitesForUser(socket.dbUserId, io, 'Battle invite cancelled because a player went offline.');
                    }
                }
            }
            if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
                waitingPlayer = null;
            }
            setTimeout(broadcastLobbyStats, 100);
            // Cleanup active games if a player disconnects
            for (const [gameId, game] of activeGames.entries()) {
                const disconnectedPlayer = game.players.find(p => p.socketId === socket.id);
                if (disconnectedPlayer && game.gameState === 'active') {
                    console.log(`[GAME] User ${disconnectedPlayer.nickname} disconnected (GameID: ${gameId})`);

                    const timeoutKey = `${gameId}_${disconnectedPlayer.dbUserId}`;
                    const timeout = setTimeout(async () => {
                        const gameAtTimeout = activeGames.get(gameId);
                        if (gameAtTimeout) {
                            const winner = gameAtTimeout.players.find(p => p.socketId !== socket.id);
                            const loser = disconnectedPlayer;
                            await endGame(gameId, io, winner, loser, 'disconnect');
                        }
                        disconnectTimeouts.delete(timeoutKey);
                    }, 5000);

                    disconnectTimeouts.set(timeoutKey, timeout);
                }
            }
        });

        socket.on('leaveGame', async (data) => {
            if (!data || !data.gameId) {
                console.error('[SOCKET ERROR] leaveGame called without gameId');
                return;
            }
            const game = activeGames.get(data.gameId);
            if (game && game.gameState === 'active') {
                const loser = game.players.find(p => p.socketId === socket.id);
                const winner = game.players.find(p => p.socketId !== socket.id);

                if (winner && loser) {
                    console.log(`[GAME] User ${loser.nickname} conceded (GameID: ${data.gameId})`);
                    await endGame(data.gameId, io, winner, loser, 'leave');
                }
            }
        });
    });
};
function startTimer(gameId, io) {
    const game = activeGames.get(gameId);
    if (!game) return;

    if (game.interval) clearInterval(game.interval);

    game.timer = 30;
    game.interval = setInterval(() => {
        game.timer--;
        io.to(gameId).emit('timerUpdate', { timer: game.timer });

        if (game.timer <= 0) {
            switchTurn(gameId, io); // Keeping this as fire-and-forget inside setInterval for now, or make it async
        }
    }, 1000);
}

async function switchTurn(gameId, io) {
    const game = activeGames.get(gameId);
    if (!game) return;

    // Clear frozen status for the player who just finished their turn
    const finishedPlayer = game.players[game.turn];
    finishedPlayer.field.forEach(c => {
        if (c.isFrozen) {
            c.isFrozen = false;
        }
    });

    game.turn = game.turn === 0 ? 1 : 0;

    // If it's the starting player's turn again, increase round/energy
    if (game.turn === game.startingTurn) {
        game.round++;
    }

    const currentPlayer = game.players[game.turn];
    currentPlayer.maxEnergy = Math.min(game.round, 10);
    currentPlayer.energy = currentPlayer.maxEnergy;

    // Update ability cooldown
    if (currentPlayer.ability && currentPlayer.ability.currentCooldown > 0) {
        currentPlayer.ability.currentCooldown--;
    }

    // Draw cards to 5
    if (currentPlayer.hand.length < 5) {
        const needed = 5 - currentPlayer.hand.length;
        let excludedCosts = [];
        if (currentPlayer.maxEnergy >= 5) {
            excludedCosts = [1, 2];
        }

        const newCards = await Card.getWeightedRandomCards(needed, currentPlayer.hand, excludedCosts, currentPlayer.dbUserId);
        currentPlayer.hand.push(...newCards.map(c => ({ ...c, instanceId: uuidv4() })));
    }

    // Reset summoning sickness for cards on field
    currentPlayer.field.forEach(c => {
        if (c.isFrozen) {
            c.canAttack = false;
            // Keep isFrozen = true so the icon remains visible during their turn
        } else {
            c.canAttack = true;
        }
        c.isSummoning = false;
    });

    io.to(gameId).emit('turnUpdate', {
        turn: game.turn,
        round: game.round,
        players: game.players.map(p => ({
            dbUserId: p.dbUserId,
            socketId: p.socketId,
            nickname: p.nickname,
            avatar: p.avatar,
            elo: p.elo,
            hp: p.hp,
            energy: p.energy,
            maxEnergy: p.maxEnergy,
            hand: p.hand,
            field: p.field,
            trashCount: p.trashCount,
            canChangeHand: p.canChangeHand,
            rankName: p.rankName,
            rankIcon: p.rankIcon,
            ability: p.ability
        }))
    });

    startTimer(gameId, io);
}

async function endGame(gameId, io, winner, loser, reason = '') {
    const game = activeGames.get(gameId);
    if (!game) return;

    if (game.gameState === 'finished') return;
    game.gameState = 'finished';

    const message = reason === 'leave'
        ? `${winner.nickname} (Opponent conceded)`
        : (reason === 'disconnect' ? `${winner.nickname} (Opponent disconnected)` : winner.nickname);

    io.to(gameId).emit('gameOver', { winner: message });

    console.log(`[MATCH] Battle ended: ${winner.nickname} vs ${loser.nickname} (GameID: ${gameId})`);

    io.to(`user_${winner.dbUserId}`).emit('activeGameEnded');
    io.to(`user_${loser.dbUserId}`).emit('activeGameEnded');

    const winnerStats = await User.updateStats(winner.dbUserId, true);
    const loserStats = await User.updateStats(loser.dbUserId, false);

    await Match.recordMatch(winner.dbUserId, loser.dbUserId, winner.nickname, loser.nickname);

    io.to(`user_${winner.dbUserId}`).emit('statsUpdate', {
        elo: winnerStats.elo, wins: winnerStats.wins, losses: winnerStats.losses
    });
    io.to(`user_${loser.dbUserId}`).emit('statsUpdate', {
        elo: loserStats.elo, wins: loserStats.wins, losses: loserStats.losses
    });

    if (game.interval) clearInterval(game.interval);
    activeGames.delete(gameId);
}

module.exports.isUserOnline = (userId) => {
    return isUserOnlineInternal(userId);
};

module.exports.getUserActiveGameId = (userId) => {
    return getUserActiveGameIdInternal(userId);
};
