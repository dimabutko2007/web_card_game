const { v4: uuidv4 } = require('uuid');
const Card = require('../models/Card');
const User = require('../models/User');
const Match = require('../models/Match');

let waitingPlayer = null;
const activeGames = new Map();
const disconnectTimeouts = new Map();
const onlineUsers = new Map(); // userId -> Set of socket.id

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
                socket.dbUserId = data.userId;
                if (!onlineUsers.has(data.userId)) {
                    onlineUsers.set(data.userId, new Set());
                }
                onlineUsers.get(data.userId).add(socket.id);
                socket.join(`user_${data.userId}`);
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

        socket.on('findMatch', (data) => {
            // Check for active game first
            for (const [gameId, game] of activeGames.entries()) {
                const player = game.players.find(p => String(p.dbUserId) === String(data.userId));
                if (player) {
                    socket.emit('matchFound', { gameId });
                    return;
                }
            }

            if (waitingPlayer && waitingPlayer.socket.id !== socket.id) {
                // Match found
                const gameId = uuidv4();
                const opponent = waitingPlayer;
                waitingPlayer = null;
                broadcastLobbyStats();

                // Join both to a room
                socket.join(gameId);
                opponent.socket.join(gameId);

                activeGames.set(gameId, {
                    players: [
                        { dbUserId: opponent.dbUserId, nickname: opponent.nickname, avatar: opponent.avatar, elo: opponent.elo, socketId: opponent.socket.id, ready: false },
                        { dbUserId: data.userId, nickname: data.nickname, avatar: data.avatar, elo: data.elo, socketId: socket.id, ready: false }
                    ],
                    gameState: 'initializing'
                });

                console.log(`[MATCH] Battle found: ${opponent.nickname} vs ${data.nickname} (GameID: ${gameId})`);
                io.to(gameId).emit('matchFound', { gameId });
            } else {
                // Start waiting
                waitingPlayer = { dbUserId: data.userId, nickname: data.nickname, avatar: data.avatar, elo: data.elo, socket: socket };
                broadcastLobbyStats();
            }
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
                        const cards = await Card.getBalancedInitialHand(5);
                        p.hand = cards.map(c => ({ ...c, instanceId: uuidv4() }));
                        p.field = [];
                        const rank = User.getRank(p.elo);
                        p.rankName = rank.name;
                        p.rankIcon = rank.icon;
                    }

                    io.to(data.gameId).emit('startGame', {
                        players: game.players,
                        turn: game.turn,
                        round: game.round,
                        isRejoin: false
                    });

                    startTimer(data.gameId, io);
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
                            defenderPlayer.field = defenderPlayer.field.filter(c => c !== defenderCard);
                        }
                        if (attackerCard.currentDefense <= 0) {
                            attackerPlayer.field = attackerPlayer.field.filter(c => c !== attackerCard);
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

    game.turn = game.turn === 0 ? 1 : 0;

    // If it's the starting player's turn again, increase round/energy
    if (game.turn === game.startingTurn) {
        game.round++;
    }

    const currentPlayer = game.players[game.turn];
    currentPlayer.maxEnergy = Math.min(game.round, 10);
    currentPlayer.energy = currentPlayer.maxEnergy;

    // Draw cards to 5
    if (currentPlayer.hand.length < 5) {
        const needed = 5 - currentPlayer.hand.length;
        let excludedCosts = [];
        if (currentPlayer.maxEnergy >= 5) {
            excludedCosts = [1, 2];
        }

        const newCards = await Card.getWeightedRandomCards(needed, currentPlayer.hand, excludedCosts);
        currentPlayer.hand.push(...newCards.map(c => ({ ...c, instanceId: uuidv4() })));
    }

    // Reset summoning sickness for cards on field
    currentPlayer.field.forEach(c => {
        c.canAttack = true;
        c.isSummoning = false; // Important: Clear summoning sickness
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
            rankName: p.rankName,
            rankIcon: p.rankIcon
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
    if (!userId) return false;
    return onlineUsers.has(userId) || onlineUsers.has(Number(userId)) || onlineUsers.has(String(userId)) || module.exports.getUserActiveGameId(userId) !== null;
};

module.exports.getUserActiveGameId = (userId) => {
    if (!userId) return null;
    for (const [gameId, game] of activeGames.entries()) {
        const player = game.players.find(p => String(p.dbUserId) === String(userId));
        if (player) {
            return gameId;
        }
    }
    return null;
};
