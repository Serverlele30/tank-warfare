const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game Constants
const WORLD_WIDTH = 2500;
const WORLD_HEIGHT = 2500;
const PLAYER_SIZE = 30;
const BULLET_SPEED = 15;
const MAX_HEALTH = 100;
const MIN_BOTS = 3;
const MAX_BOTS = 8;
const TICK_RATE = 60;

// Game State
const gameState = {
    players: new Map(),
    bots: new Map(),
    bullets: [],
    powerups: [],
    obstacles: [],
    nextBulletId: 0,
    nextBotId: 0,
    wave: 1,
    waveTimer: 0
};

// Player Class
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
        this.isBot = isBot;
        this.color = isBot ? this.randomColor() : '#00ff00';
        this.speed = isBot ? 3.2 : 4.5;
        this.lastShot = Date.now();
        this.shield = false;
        this.shieldTime = 0;
        this.moveTimer = 0;
        this.weaponType = 'normal'; // normal, rapid, shotgun, laser
        this.weaponTimer = 0;
        this.damageBoost = 1.0;
        this.speedBoost = 1.0;
    }

    randomColor() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f7b731', '#5f27cd', '#ff9ff3', '#ee5a6f', '#f368e0'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
        if (this.isBot) {
            this.updateBot();
        }

        // Smooth movement
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 5) {
            const moveSpeed = Math.min(this.speed * this.speedBoost, dist * 1);
            this.vx = (dx / dist) * moveSpeed;
            this.vy = (dy / dist) * moveSpeed;
        } else {
            this.vx *= 1.85;
            this.vy *= 1.85;
        }

        this.x += this.vx;
        this.y += this.vy;

        // World boundaries
        this.x = Math.max(PLAYER_SIZE, Math.min(WORLD_WIDTH - PLAYER_SIZE, this.x));
        this.y = Math.max(PLAYER_SIZE, Math.min(WORLD_HEIGHT - PLAYER_SIZE, this.y));

        // Shield timer
        if (this.shield) {
            this.shieldTime--;
            if (this.shieldTime <= 0) {
                this.shield = false;
            }
        }

        // Weapon timer
        if (this.weaponTimer > 0) {
            this.weaponTimer--;
            if (this.weaponTimer <= 0) {
                this.weaponType = 'normal';
            }
        }
    }

    updateBot() {
        this.moveTimer++;

        // Bot AI - more aggressive and smarter
        if (this.moveTimer % 45 === 0) {
            let nearestPlayer = null;
            let minDist = Infinity;

            // Find nearest human player (prioritize)
            gameState.players.forEach(player => {
                const dist = Math.hypot(player.x - this.x, player.y - this.y);
                if (dist < minDist) {
                    minDist = dist;
                    nearestPlayer = player;
                }
            });

            // Find nearest powerup
            let nearestPowerup = null;
            let powerupDist = Infinity;

            gameState.powerups.forEach(powerup => {
                const dist = Math.hypot(powerup.x - this.x, powerup.y - this.y);
                if (dist < powerupDist && dist < 400) {
                    powerupDist = dist;
                    nearestPowerup = powerup;
                }
            });

            // Decision making
            const healthLow = this.health < this.maxHealth * 0.4;
            
            if (healthLow && nearestPowerup && nearestPowerup.type === 'health') {
                // Low health - seek health powerup
                this.targetX = nearestPowerup.x + (Math.random() - 0.5) * 50;
                this.targetY = nearestPowerup.y + (Math.random() - 0.5) * 50;
            } else if (nearestPowerup && Math.random() < 0.5 && powerupDist < 250) {
                // Sometimes go for powerups
                this.targetX = nearestPowerup.x + (Math.random() - 0.5) * 30;
                this.targetY = nearestPowerup.y + (Math.random() - 0.5) * 30;
            } else if (nearestPlayer) {
                const distToPlayer = Math.hypot(nearestPlayer.x - this.x, nearestPlayer.y - this.y);
                const optimalRange = 200 + Math.random() * 100;
                
                if (distToPlayer > optimalRange + 100) {
                    // Too far - move closer
                    const angle = Math.atan2(nearestPlayer.y - this.y, nearestPlayer.x - this.x);
                    const offset = 50 + Math.random() * 100;
                    this.targetX = this.x + Math.cos(angle) * offset;
                    this.targetY = this.y + Math.sin(angle) * offset;
                } else if (distToPlayer < optimalRange - 50) {
                    // Too close - back away
                    const angle = Math.atan2(this.y - nearestPlayer.y, this.x - nearestPlayer.x);
                    const offset = 40 + Math.random() * 80;
                    this.targetX = this.x + Math.cos(angle) * offset;
                    this.targetY = this.y + Math.sin(angle) * offset;
                } else {
                    // Strafe around player
                    const angle = Math.atan2(nearestPlayer.y - this.y, nearestPlayer.x - this.x) + (Math.PI / 2);
                    const strafeDir = Math.random() < 0.5 ? 1 : -1;
                    const offset = 60 + Math.random() * 80;
                    this.targetX = this.x + Math.cos(angle) * offset * strafeDir;
                    this.targetY = this.y + Math.sin(angle) * offset * strafeDir;
                }
            } else {
                // Random patrol
                this.targetX = Math.random() * WORLD_WIDTH;
                this.targetY = Math.random() * WORLD_HEIGHT;
            }

            // Clamp to world bounds
            this.targetX = Math.max(PLAYER_SIZE + 50, Math.min(WORLD_WIDTH - PLAYER_SIZE - 50, this.targetX));
            this.targetY = Math.max(PLAYER_SIZE + 50, Math.min(WORLD_HEIGHT - PLAYER_SIZE - 50, this.targetY));

            // Aim at nearest player
            if (nearestPlayer) {
                const dx = nearestPlayer.x - this.x;
                const dy = nearestPlayer.y - this.y;
                const dist = Math.hypot(dx, dy);
                
                // Lead target prediction
                const timeToHit = dist / BULLET_SPEED;
                const predictX = nearestPlayer.x + nearestPlayer.vx * timeToHit;
                const predictY = nearestPlayer.y + nearestPlayer.vy * timeToHit;
                
                const pdx = predictX - this.x;
                const pdy = predictY - this.y;
                
                // Add some inaccuracy based on distance
                const inaccuracy = (dist / 500) * 0.3;
                this.angle = Math.atan2(pdy, pdx) + (Math.random() - 0.5) * inaccuracy;

                // Shoot based on difficulty (wave)
                const shootChance = Math.min(0.35, 0.15 + (gameState.wave * 0.02));
                const shootDelay = Math.max(600, 1200 - (gameState.wave * 50));
                
                if (dist < 400 && Math.random() < shootChance) {
                    if (Date.now() - this.lastShot > shootDelay) {
                        shootBullet(this);
                    }
                }
            }
        }
    }

    damage(amount) {
        if (this.shield) return false;
        
        const actualDamage = this.isBot ? amount * 2.0 : amount;
        this.health -= actualDamage;

        if (this.health <= 0) {
            return true;
        }
        return false;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            x: Math.round(this.x * 10) / 10,
            y: Math.round(this.y * 10) / 10,
            vx: Math.round(this.vx * 10) / 10,
            vy: Math.round(this.vy * 10) / 10,
            angle: this.angle,
            health: Math.round(this.health),
            maxHealth: this.maxHealth,
            score: this.score,
            kills: this.kills,
            isBot: this.isBot,
            color: this.color,
            shield: this.shield,
            weaponType: this.weaponType
        };
    }
}

// Bullet Class
class Bullet {
    constructor(id, x, y, angle, owner) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * BULLET_SPEED;
        this.vy = Math.sin(angle) * BULLET_SPEED;
        this.ownerId = owner.id;
        this.damage = (owner.isBot ? 15 : 25) * owner.damageBoost;
        this.life = 120;
        this.type = owner.weaponType;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;

        // Check collisions with players
        const allPlayers = [...gameState.players.values(), ...gameState.bots.values()];
        
        for (let player of allPlayers) {
            if (player.id === this.ownerId) continue;
            
            const dist = Math.hypot(player.x - this.x, player.y - this.y);
            if (dist < PLAYER_SIZE / 2 + 5) {
                const isDead = player.damage(this.damage);
                
                if (isDead) {
                    const owner = gameState.players.get(this.ownerId) || gameState.bots.get(this.ownerId);
                    if (owner) {
                        owner.kills++;
                        owner.score += player.isBot ? 100 : 250;
                        
                        // Notify kill
                        if (!owner.isBot) {
                            io.to(owner.id).emit('playerKilled', {
                                victimName: player.name,
                                score: owner.score,
                                kills: owner.kills
                            });
                        }
                    }

                    if (player.isBot) {
                        gameState.bots.delete(player.id);
                        io.emit('botDestroyed', { botId: player.id });
                    } else {
                        io.to(player.id).emit('playerDied', {
                            score: player.score,
                            kills: player.kills,
                            killerName: (gameState.players.get(this.ownerId) || gameState.bots.get(this.ownerId))?.name || 'Unknown'
                        });
                    }
                } else {
                    // Hit but not dead
                    if (!player.isBot) {
                        io.to(player.id).emit('playerHit', { damage: this.damage });
                    }
                }
                
                return false;
            }
        }

        // Out of bounds
        if (this.x < 0 || this.x > WORLD_WIDTH || this.y < 0 || this.y > WORLD_HEIGHT || this.life <= 0) {
            return false;
        }

        return true;
    }

    toJSON() {
        return {
            id: this.id,
            x: Math.round(this.x * 10) / 10,
            y: Math.round(this.y * 10) / 10,
            vx: this.vx,
            vy: this.vy,
            type: this.type,
            ownerId: this.ownerId
        };
    }
}

// PowerUp Class
class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.lifetime = 1200; // 20 seconds at 60 tick/s
    }

    update() {
        this.lifetime--;
        return this.lifetime > 0;
    }

    toJSON() {
        return {
            x: this.x,
            y: this.y,
            type: this.type
        };
    }
}

// Wave Management
function updateWave() {
    gameState.waveTimer++;
    
    // New wave every 60 seconds
    if (gameState.waveTimer >= 60 * TICK_RATE) {
        gameState.wave++;
        gameState.waveTimer = 0;
        
        // Spawn more bots for new wave
        const botsToSpawn = Math.min(2, MAX_BOTS - gameState.bots.size);
        for (let i = 0; i < botsToSpawn; i++) {
            setTimeout(() => spawnBot(), i * 1000);
        }
        
        io.emit('newWave', { wave: gameState.wave });
        console.log(`Wave ${gameState.wave} started!`);
    }
}

// Spawn Bot
function spawnBot() {
    if (gameState.bots.size >= MAX_BOTS) return;

    // Spawn away from players
    let x, y, attempts = 0;
    let tooClose = true;
    
    while (tooClose && attempts < 20) {
        const edge = Math.floor(Math.random() * 4);
        
        switch(edge) {
            case 0: x = Math.random() * WORLD_WIDTH; y = 50; break;
            case 1: x = WORLD_WIDTH - 50; y = Math.random() * WORLD_HEIGHT; break;
            case 2: x = Math.random() * WORLD_WIDTH; y = WORLD_HEIGHT - 50; break;
            case 3: x = 50; y = Math.random() * WORLD_HEIGHT; break;
        }
        
        tooClose = false;
        for (let player of gameState.players.values()) {
            if (Math.hypot(player.x - x, player.y - y) < 300) {
                tooClose = true;
                break;
            }
        }
        
        attempts++;
    }

    const names = ['Terminator', 'Destroyer', 'Hunter', 'Killer', 'Predator', 'Warrior', 'Fighter', 'Soldier'];
    const name = names[Math.floor(Math.random() * names.length)] + ' ' + Math.floor(Math.random() * 999);
    
    const botId = 'bot_' + gameState.nextBotId++;
    const bot = new Player(botId, name, x, y, true);
    
    // Scale bot health with wave
    bot.maxHealth = MAX_HEALTH + (gameState.wave - 1) * 10;
    bot.health = bot.maxHealth;
    
    gameState.bots.set(botId, bot);
    io.emit('botSpawned', bot.toJSON());
}

// Maintain bot population
function maintainBots() {
    const totalPlayers = gameState.players.size;
    const desiredBots = Math.min(MAX_BOTS, MIN_BOTS + Math.floor(totalPlayers * 1.5));
    
    if (gameState.bots.size < desiredBots) {
        spawnBot();
    }
}

// Spawn PowerUp
function spawnPowerUp() {
    const types = ['health', 'shield', 'rapid', 'shotgun', 'damage', 'speed'];
    const weights = [3, 2, 2, 2, 1, 2]; // Health more common
    
    let total = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * total;
    let type = types[0];
    
    for (let i = 0; i < types.length; i++) {
        if (random < weights[i]) {
            type = types[i];
            break;
        }
        random -= weights[i];
    }
    
    let x, y, attempts = 0;
    let tooClose = true;
    
    while (tooClose && attempts < 15) {
        x = Math.random() * (WORLD_WIDTH - 200) + 100;
        y = Math.random() * (WORLD_HEIGHT - 200) + 100;
        
        tooClose = false;
        for (let powerup of gameState.powerups) {
            if (Math.hypot(powerup.x - x, powerup.y - y) < 150) {
                tooClose = true;
                break;
            }
        }
        attempts++;
    }
    
    gameState.powerups.push(new PowerUp(x, y, type));
}

// Shoot Bullet
function shootBullet(player) {
    player.lastShot = Date.now();
    
    if (player.weaponType === 'shotgun') {
        // Shotgun - 5 bullets in spread
        for (let i = -2; i <= 2; i++) {
            const spreadAngle = player.angle + (i * 0.15);
            const bulletId = gameState.nextBulletId++;
            const bullet = new Bullet(
                bulletId,
                player.x + Math.cos(spreadAngle) * PLAYER_SIZE,
                player.y + Math.sin(spreadAngle) * PLAYER_SIZE,
                spreadAngle,
                player
            );
            bullet.damage *= 0.6; // Less damage per pellet
            gameState.bullets.push(bullet);
        }
    } else {
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
}

// Socket.io Connection
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('joinGame', (data) => {
        const playerName = data.name || 'Spieler';
        
        const player = new Player(
            socket.id,
            playerName,
            WORLD_WIDTH / 2 + (Math.random() - 0.5) * 200,
            WORLD_HEIGHT / 2 + (Math.random() - 0.5) * 200,
            false
        );
        
        gameState.players.set(socket.id, player);

        socket.emit('initGame', {
            playerId: socket.id,
            players: Array.from(gameState.players.values()).map(p => p.toJSON()),
            bots: Array.from(gameState.bots.values()).map(b => b.toJSON()),
            bullets: gameState.bullets.map(b => b.toJSON()),
            powerups: gameState.powerups.map(p => p.toJSON()),
            wave: gameState.wave,
            worldWidth: WORLD_WIDTH,
            worldHeight: WORLD_HEIGHT
        });

        socket.broadcast.emit('playerJoined', player.toJSON());

        console.log(`✅ ${playerName} joined | Players: ${gameState.players.size} | Bots: ${gameState.bots.size}`);
    });

    socket.on('updatePlayer', (data) => {
        const player = gameState.players.get(socket.id);
        if (player) {
            player.targetX = Math.max(0, Math.min(WORLD_WIDTH, data.targetX));
            player.targetY = Math.max(0, Math.min(WORLD_HEIGHT, data.targetY));
            player.angle = data.angle;
        }
    });

    socket.on('shoot', () => {
        const player = gameState.players.get(socket.id);
        if (!player) return;
        
        const fireRate = player.weaponType === 'rapid' ? 100 : 250;
        
        if (Date.now() - player.lastShot > fireRate) {
            shootBullet(player);
        }
    });

    socket.on('collectPowerUp', (index) => {
        const player = gameState.players.get(socket.id);
        const powerup = gameState.powerups[index];
        
        if (player && powerup) {
            const dist = Math.hypot(player.x - powerup.x, player.y - powerup.y);
            if (dist < PLAYER_SIZE + 25) {
                switch(powerup.type) {
                    case 'health':
                        player.health = Math.min(player.maxHealth, player.health + 50);
                        break;
                    case 'shield':
                        player.shield = true;
                        player.shieldTime = 360; // 6 seconds
                        break;
                    case 'rapid':
                        player.weaponType = 'rapid';
                        player.weaponTimer = 600; // 10 seconds
                        break;
                    case 'shotgun':
                        player.weaponType = 'shotgun';
                        player.weaponTimer = 480; // 8 seconds
                        break;
                    case 'damage':
                        player.damageBoost = 2.0;
                        setTimeout(() => player.damageBoost = 1.0, 8000);
                        break;
                    case 'speed':
                        player.speedBoost = 1.6;
                        setTimeout(() => player.speedBoost = 1.0, 6000);
                        break;
                }
                
                gameState.powerups.splice(index, 1);
                io.emit('powerUpCollected', { index, playerId: socket.id, type: powerup.type });
                socket.emit('powerUpApplied', { type: powerup.type });
            }
        }
    });

    socket.on('disconnect', () => {
        const player = gameState.players.get(socket.id);
        if (player) {
            console.log(`❌ ${player.name} disconnected`);
            gameState.players.delete(socket.id);
            io.emit('playerLeft', socket.id);
        }
    });
});

// Game Loop
function gameLoop() {
    // Update wave
    updateWave();
    
    // Maintain bot population
    if (Math.random() < 0.02) {
        maintainBots();
    }
    
    // Update all entities
    gameState.players.forEach(player => player.update());
    gameState.bots.forEach(bot => bot.update());
    gameState.bullets = gameState.bullets.filter(bullet => bullet.update());
    gameState.powerups = gameState.powerups.filter(powerup => powerup.update());

    // Spawn powerups
    const maxPowerups = 6 + Math.floor(gameState.wave / 2);
    if (gameState.powerups.length < maxPowerups && Math.random() < 0.025) {
        spawnPowerUp();
    }

    // Send game state (optimized - only every other tick)
    if (gameState.waveTimer % 2 === 0) {
        const state = {
            players: Array.from(gameState.players.values()).map(p => p.toJSON()),
            bots: Array.from(gameState.bots.values()).map(b => b.toJSON()),
            bullets: gameState.bullets.map(b => b.toJSON()),
            powerups: gameState.powerups.map(p => p.toJSON()),
            wave: gameState.wave
        };

        io.emit('gameState', state);
    }
}

// Initialize game
function initGame() {
    console.log('🎮 Initializing Tank Warfare...');
    
    // Spawn initial bots
    for (let i = 0; i < MIN_BOTS; i++) {
        setTimeout(() => spawnBot(), i * 500);
    }

    // Spawn initial powerups
    for (let i = 0; i < 5; i++) {
        setTimeout(() => spawnPowerUp(), i * 200);
    }

    // Start game loop
    setInterval(gameLoop, 1000 / TICK_RATE);
    
    console.log('✅ Game server ready!');
    console.log(`🌍 World: ${WORLD_WIDTH}x${WORLD_HEIGHT}`);
    console.log(`⚡ Tick rate: ${TICK_RATE} updates/sec`);
}

// Start server
const PORT = process.env.PORT || 80;

server.listen(PORT, () => {
    console.log(`\n🚀 Tank Warfare Server`);
    console.log(`📡 Running on port ${PORT}`);
    console.log(`🎯 Visit http://localhost:${PORT} to play!\n`);
    initGame();
});
