const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;
const PLAYER_SIZE = 30;
const BULLET_SPEED = 12;
const MAX_HEALTH = 100;
const MAX_BOTS = 10; // More bots for larger map
const TICK_RATE = 60;

const gameState = {
    players: new Map(),
    bots: new Map(),
    bullets: [],
    powerups: [],
    nextBulletId: 0,
    nextBotId: 0,
    averagePlayerScore: 0
};

function calculateBotDifficulty() {
    const players = Array.from(gameState.players.values());
    if (players.length === 0) return 1.0;
    const avgScore = players.reduce((sum, p) => sum + p.score, 0) / players.length;
    gameState.averagePlayerScore = avgScore;
    return Math.min(2.0, 0.5 + (avgScore / 500));
}

class Player {
    constructor(id, name, x, y, isBot = false) {
        this.id = id;
        this.name = name;
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.vx = 0;
        this.vy = 0;
        this.angle = 0;
        this.health = MAX_HEALTH;
        this.maxHealth = MAX_HEALTH;
        this.score = 0;
        this.kills = 0;
        this.deaths = 0;
        this.isBot = isBot;
        this.isDead = false;
        this.respawnTime = 0;
        this.color = isBot ? this.randomColor() : '#00ff00';
        this.baseSpeed = 3.5;
        this.speed = 3.5;
        this.lastShot = Date.now();
        this.fireRate = 250;
        this.baseDamage = 25;
        this.damage = 25;
        this.shield = false;
        this.shieldTime = 0;
        this.rapidFire = false;
        this.rapidFireTime = 0;
        this.damageBoost = false;
        this.damageBoostTime = 0;
        this.invisible = false;
        this.invisibleTime = 0;
        this.moveTimer = 0;
        this.difficulty = 1.0;
        this.lastTarget = null;
        this.strategyTimer = 0;
        this.strategy = 'aggressive';
        this.lastKiller = null;
    }

    randomColor() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f7b731', '#5f27cd', '#ff9ff3', '#ee5a6f', '#00d2ff'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    takeDamage(amount, attackerId) {
        if (this.shield || this.isDead) return false;
        this.health -= amount;
        if (this.health <= 0) {
            this.deaths++;
            this.isDead = true;
            this.respawnTime = 300;
            this.lastKiller = attackerId;
            return true;
        }
        return false;
    }

    update() {
        if (this.isDead) {
            if (this.respawnTime > 0) this.respawnTime--;
            return;
        }
        
        if (this.isBot) {
            this.difficulty = calculateBotDifficulty();
            this.updateBot();
        }

        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 5) {
            const moveSpeed = Math.min(this.speed, dist * 0.15);
            this.vx = (dx / dist) * moveSpeed;
            this.vy = (dy / dist) * moveSpeed;
        } else {
            this.vx *= 0.9;
            this.vy *= 0.9;
        }

        this.x += this.vx;
        this.y += this.vy;
        this.x = Math.max(PLAYER_SIZE, Math.min(WORLD_WIDTH - PLAYER_SIZE, this.x));
        this.y = Math.max(PLAYER_SIZE, Math.min(WORLD_HEIGHT - PLAYER_SIZE, this.y));

        if (this.shield) {
            this.shieldTime--;
            if (this.shieldTime <= 0) this.shield = false;
        }
        
        if (this.rapidFire) {
            this.rapidFireTime--;
            if (this.rapidFireTime <= 0) {
                this.rapidFire = false;
                this.fireRate = 250;
            }
        }
        
        if (this.damageBoost) {
            this.damageBoostTime--;
            if (this.damageBoostTime <= 0) {
                this.damageBoost = false;
                this.damage = this.baseDamage;
            }
        }
        
        if (this.invisible) {
            this.invisibleTime--;
            if (this.invisibleTime <= 0) this.invisible = false;
        }
    }

    updateBot() {
        this.moveTimer++;
        this.strategyTimer++;

        if (this.strategyTimer > 600) {
            const strategies = ['aggressive', 'defensive', 'balanced'];
            this.strategy = strategies[Math.floor(Math.random() * strategies.length)];
            this.strategyTimer = 0;
        }

        const allTargets = [
            ...Array.from(gameState.players.values()),
            ...Array.from(gameState.bots.values())
        ].filter(t => t.id !== this.id && !t.isDead);

        if (this.moveTimer % 30 === 0) {
            let bestTarget = null;
            let bestScore = -Infinity;

            allTargets.forEach(target => {
                const dist = Math.hypot(target.x - this.x, target.y - this.y);
                const healthRatio = target.health / target.maxHealth;
                
                let score = 0;
                switch(this.strategy) {
                    case 'aggressive':
                        score = (1 - healthRatio) * 100 - dist * 0.5;
                        break;
                    case 'defensive':
                        score = -dist * 2;
                        break;
                    case 'balanced':
                        score = (1 - healthRatio) * 50 - dist * 0.3 + (target.isBot ? -20 : 30);
                        break;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestTarget = target;
                }
            });

            let nearestPowerup = null;
            let powerupDist = Infinity;
            gameState.powerups.forEach(powerup => {
                const dist = Math.hypot(powerup.x - this.x, powerup.y - this.y);
                if (dist < powerupDist && dist < 400) {
                    powerupDist = dist;
                    nearestPowerup = powerup;
                }
            });

            if (this.health < 40 && nearestPowerup && nearestPowerup.type === 'health') {
                this.targetX = nearestPowerup.x;
                this.targetY = nearestPowerup.y;
            } else if (nearestPowerup && Math.random() < 0.4) {
                this.targetX = nearestPowerup.x;
                this.targetY = nearestPowerup.y;
            } else if (bestTarget) {
                const distToTarget = Math.hypot(bestTarget.x - this.x, bestTarget.y - this.y);
                const optimalDist = this.strategy === 'defensive' ? 350 : this.strategy === 'aggressive' ? 200 : 250;

                if (distToTarget > optimalDist) {
                    this.targetX = this.x + (bestTarget.x - this.x) * 0.5 + (Math.random() - 0.5) * 100 * this.difficulty;
                    this.targetY = this.y + (bestTarget.y - this.y) * 0.5 + (Math.random() - 0.5) * 100 * this.difficulty;
                } else if (distToTarget < optimalDist * 0.7) {
                    this.targetX = this.x - (bestTarget.x - this.x) * 0.3 + (Math.random() - 0.5) * 100;
                    this.targetY = this.y - (bestTarget.y - this.y) * 0.3 + (Math.random() - 0.5) * 100;
                } else {
                    const perpAngle = Math.atan2(bestTarget.y - this.y, bestTarget.x - this.x) + Math.PI / 2;
                    this.targetX = this.x + Math.cos(perpAngle) * 100;
                    this.targetY = this.y + Math.sin(perpAngle) * 100;
                }
                this.lastTarget = bestTarget;
            } else {
                this.targetX = Math.random() * WORLD_WIDTH;
                this.targetY = Math.random() * WORLD_HEIGHT;
            }

            this.targetX = Math.max(PLAYER_SIZE, Math.min(WORLD_WIDTH - PLAYER_SIZE, this.targetX));
            this.targetY = Math.max(PLAYER_SIZE, Math.min(WORLD_HEIGHT - PLAYER_SIZE, this.targetY));
        }

        if (this.lastTarget && !this.lastTarget.isDead && this.lastTarget.health > 0) {
            const leadAmount = this.difficulty * 0.3;
            const targetVx = this.lastTarget.vx || 0;
            const targetVy = this.lastTarget.vy || 0;
            
            const aimX = this.lastTarget.x + targetVx * leadAmount * 10;
            const aimY = this.lastTarget.y + targetVy * leadAmount * 10;
            
            this.angle = Math.atan2(aimY - this.y, aimX - this.x) + (Math.random() - 0.5) * (0.4 / this.difficulty);

            const dist = Math.hypot(this.lastTarget.x - this.x, this.lastTarget.y - this.y);
            const fireRate = 1200 / this.difficulty;
            const accuracy = 0.15 + (this.difficulty * 0.25);
            
            if (dist < 400 && Math.random() < accuracy) {
                if (Date.now() - this.lastShot > fireRate) {
                    shootBullet(this);
                }
            }
        }
    }

    respawn() {
        const edge = Math.floor(Math.random() * 4);
        switch(edge) {
            case 0: this.x = Math.random() * WORLD_WIDTH; this.y = 50; break;
            case 1: this.x = WORLD_WIDTH - 50; this.y = Math.random() * WORLD_HEIGHT; break;
            case 2: this.x = Math.random() * WORLD_WIDTH; this.y = WORLD_HEIGHT - 50; break;
            case 3: this.x = 50; this.y = Math.random() * WORLD_HEIGHT; break;
        }
        this.health = MAX_HEALTH;
        this.shield = true;
        this.shieldTime = 300;
        this.isDead = false;
        this.respawnTime = 0;
        this.lastKiller = null;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            x: this.x,
            y: this.y,
            angle: this.angle,
            health: this.health,
            maxHealth: this.maxHealth,
            score: this.score,
            kills: this.kills,
            deaths: this.deaths,
            isBot: this.isBot,
            color: this.color,
            shield: this.shield,
            rapidFire: this.rapidFire,
            damageBoost: this.damageBoost,
            invisible: this.invisible,
            isDead: this.isDead,
            respawnTime: this.respawnTime
        };
    }
}

class Bullet {
    constructor(id, x, y, angle, owner) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * BULLET_SPEED;
        this.vy = Math.sin(angle) * BULLET_SPEED;
        this.ownerId = owner.id;
        this.damage = owner.damage || 25;
        this.life = 120;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;

        const allEntities = [...gameState.players.values(), ...gameState.bots.values()];
        
        for (let entity of allEntities) {
            if (entity.id === this.ownerId || entity.isDead) continue;
            
            const dist = Math.hypot(entity.x - this.x, entity.y - this.y);
            if (dist < PLAYER_SIZE) {
                if (entity.takeDamage(this.damage, this.ownerId)) {
                    const owner = gameState.players.get(this.ownerId) || gameState.bots.get(this.ownerId);
                    if (owner) {
                        owner.kills++;
                        owner.score += 100;
                    }

                    io.emit('killFeed', {
                        killer: owner ? owner.name : 'Unknown',
                        victim: entity.name,
                        killerColor: owner ? owner.color : '#ffffff',
                        victimColor: entity.color
                    });

                    if (entity.isBot) {
                        setTimeout(() => {
                            if (gameState.bots.has(entity.id)) {
                                entity.respawn();
                            }
                        }, 3000);
                    } else {
                        io.to(entity.id).emit('playerDied', {
                            score: entity.score,
                            kills: entity.kills,
                            deaths: entity.deaths,
                            killerName: owner ? owner.name : 'Unknown'
                        });
                    }
                }
                return false;
            }
        }

        if (this.x < 0 || this.x > WORLD_WIDTH || this.y < 0 || this.y > WORLD_HEIGHT || this.life <= 0) {
            return false;
        }
        return true;
    }

    toJSON() {
        return { x: this.x, y: this.y, vx: this.vx, vy: this.vy };
    }
}

class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
    }

    toJSON() {
        return { x: this.x, y: this.y, type: this.type };
    }
}

function spawnBot() {
    if (gameState.bots.size >= MAX_BOTS) return;
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    switch(edge) {
        case 0: x = Math.random() * WORLD_WIDTH; y = 50; break;
        case 1: x = WORLD_WIDTH - 50; y = Math.random() * WORLD_HEIGHT; break;
        case 2: x = Math.random() * WORLD_WIDTH; y = WORLD_HEIGHT - 50; break;
        case 3: x = 50; y = Math.random() * WORLD_HEIGHT; break;
    }
    
    const ranks = ['Cpt.', 'Lt.', 'Sgt.', 'Pvt.', 'Col.', 'Maj.'];
    const adjectives = ['Iron', 'Steel', 'Shadow', 'Ghost', 'Thunder', 'Viper', 'Hawk', 'Wolf', 'Tiger', 'Dragon'];
    const nouns = ['Tank', 'Hunter', 'Warrior', 'Striker', 'Guardian', 'Phantom', 'Reaper', 'Titan'];
    
    const rank = ranks[Math.floor(Math.random() * ranks.length)];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const name = `${rank} ${adj} ${noun}`;
    
    const botId = 'bot_' + gameState.nextBotId++;
    const bot = new Player(botId, name, x, y, true);
    gameState.bots.set(botId, bot);
}

function removeBot() {
    if (gameState.bots.size > 0) {
        const botId = Array.from(gameState.bots.keys())[0];
        gameState.bots.delete(botId);
    }
}

function spawnPowerUp() {
    const types = ['health', 'shield', 'speed', 'rapid_fire', 'damage_boost', 'regen', 'invisible'];
    const type = types[Math.floor(Math.random() * types.length)];
    const x = Math.random() * (WORLD_WIDTH - 100) + 50;
    const y = Math.random() * (WORLD_HEIGHT - 100) + 50;
    gameState.powerups.push(new PowerUp(x, y, type));
}

function shootBullet(player) {
    player.lastShot = Date.now();
    const bulletId = gameState.nextBulletId++;
    const bullet = new Bullet(
        bulletId,
        player.x + Math.cos(player.angle) * PLAYER_SIZE,
        player.y + Math.sin(player.angle) * PLAYER_SIZE,
        player.angle,
        player
    );
    gameState.bullets.push(bullet);
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('joinGame', (data) => {
        const playerName = data.name || 'Spieler';
        removeBot();
        const player = new Player(socket.id, playerName, WORLD_WIDTH / 2, WORLD_HEIGHT / 2, false);
        gameState.players.set(socket.id, player);

        socket.emit('initGame', {
            playerId: socket.id,
            worldSize: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
            players: Array.from(gameState.players.values()).map(p => p.toJSON()),
            bots: Array.from(gameState.bots.values()).map(b => b.toJSON()),
            bullets: gameState.bullets.map(b => b.toJSON()),
            powerups: gameState.powerups.map(p => p.toJSON())
        });
    });

    socket.on('updatePlayer', (data) => {
        const player = gameState.players.get(socket.id);
        if (player && !player.isDead) {
            player.targetX = data.targetX;
            player.targetY = data.targetY;
            player.angle = data.angle;
        }
    });

    socket.on('shoot', () => {
        const player = gameState.players.get(socket.id);
        if (player && !player.isDead) {
            const fireRate = player.rapidFire ? player.fireRate : 250;
            if (Date.now() - player.lastShot > fireRate) {
                shootBullet(player);
            }
        }
    });

    socket.on('collectPowerUp', (index) => {
        const player = gameState.players.get(socket.id);
        const powerup = gameState.powerups[index];
        if (player && powerup && !player.isDead) {
            const dist = Math.hypot(player.x - powerup.x, player.y - powerup.y);
            if (dist < PLAYER_SIZE + 20) {
                switch(powerup.type) {
                    case 'health':
                        player.health = Math.min(player.maxHealth, player.health + 50);
                        break;
                    case 'shield':
                        player.shield = true;
                        player.shieldTime = 300;
                        break;
                    case 'speed':
                        player.speed = player.baseSpeed * 1.5;
                        setTimeout(() => player.speed = player.baseSpeed, 5000);
                        break;
                    case 'rapid_fire':
                        player.rapidFire = true;
                        player.rapidFireTime = 300;
                        player.fireRate = 150; // 1.66x faster instead of 2.5x
                        break;
                    case 'damage_boost':
                        player.damageBoost = true;
                        player.damageBoostTime = 300;
                        player.damage = player.baseDamage * 1.5; // 1.5x instead of 2x
                        break;
                    case 'regen':
                        let regenTicks = 300;
                        const regenInterval = setInterval(() => {
                            if (player.health < player.maxHealth && !player.isDead) {
                                player.health = Math.min(player.health + 0.25, player.maxHealth); // 75 HP total instead of 120
                            }
                            regenTicks--;
                            if (regenTicks <= 0) clearInterval(regenInterval);
                        }, 1000 / 60);
                        break;
                    case 'invisible':
                        player.invisible = true;
                        player.invisibleTime = 150; // 2.5s instead of 3s
                        break;
                }
                gameState.powerups.splice(index, 1);
                io.emit('powerUpCollected', { index, type: powerup.type });
            }
        }
    });

    socket.on('respawn', () => {
        const player = gameState.players.get(socket.id);
        if (player) player.respawn();
    });

    socket.on('disconnect', () => {
        const player = gameState.players.get(socket.id);
        if (player) {
            console.log(`${player.name} disconnected`);
            gameState.players.delete(socket.id);
            setTimeout(() => spawnBot(), 1000);
        }
    });
});

function gameLoop() {
    gameState.players.forEach(player => player.update());
    gameState.bots.forEach(bot => bot.update());
    gameState.bullets = gameState.bullets.filter(bullet => bullet.update());

    if (gameState.powerups.length < 16 && Math.random() < 0.015) {
        spawnPowerUp();
    }

    const state = {
        players: Array.from(gameState.players.values()).map(p => p.toJSON()),
        bots: Array.from(gameState.bots.values()).map(b => b.toJSON()),
        bullets: gameState.bullets.map(b => b.toJSON()),
        powerups: gameState.powerups.map(p => p.toJSON()),
        averageScore: gameState.averagePlayerScore
    };

    io.emit('gameState', state);
}

function initGame() {
    for (let i = 0; i < MAX_BOTS; i++) spawnBot();
    for (let i = 0; i < 16; i++) spawnPowerUp();
    setInterval(gameLoop, 1000 / TICK_RATE);
    console.log('🎮 Tank Warfare Server Started!');
    console.log(`📏 World: ${WORLD_WIDTH}x${WORLD_HEIGHT}`);
    console.log(`⚡ Tick rate: ${TICK_RATE} updates/sec`);
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    initGame();
});
