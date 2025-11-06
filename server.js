const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO to use HTTP Long Polling only (no WebSocket)
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['polling'], // Force HTTP Long Polling only
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

// Serve static files from www folder
app.use(express.static(path.join(__dirname, 'www')));

// Game Constants
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;
const PLAYER_SIZE = 32;
const BULLET_SPEED = 16;
const MAX_HEALTH = 100;
const MIN_BOTS = 4;
const MAX_BOTS = 10;
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

// Player Class - Enhanced
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
        this.color = isBot ? this.randomColor() : '#00ff00';
        this.speed = isBot ? 3.5 : 5.0;
        this.lastShot = Date.now();
        this.shield = false;
        this.shieldTime = 0;
        this.moveTimer = 0;
        this.weaponType = 'normal';
        this.weaponTimer = 0;
        this.damageBoost = 1.0;
        this.speedBoost = 1.0;
        this.regenRate = 0;
        this.lastRegen = Date.now();
        this.combo = 0;
        this.lastKill = 0;
    }

    randomColor() {
        const colors = [
            '#ff6b6b', '#4ecdc4', '#45b7d1', '#f7b731', 
            '#5f27cd', '#ff9ff3', '#ee5a6f', '#f368e0',
            '#00d2ff', '#ff006e', '#8338ec', '#3a86ff'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
        if (this.isBot) {
            this.updateBot();
        }

        // Smooth movement with improved physics
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 5) {
            const moveSpeed = Math.min(this.speed * this.speedBoost, dist * 0.2);
            this.vx = (dx / dist) * moveSpeed;
            this.vy = (dy / dist) * moveSpeed;
        } else {
            this.vx *= 0.85;
            this.vy *= 0.85;
        }

        this.x += this.vx;
        this.y += this.vy;

        // World boundaries with soft bounce
        if (this.x < PLAYER_SIZE) {
            this.x = PLAYER_SIZE;
            this.vx *= -0.5;
        }
        if (this.x > WORLD_WIDTH - PLAYER_SIZE) {
            this.x = WORLD_WIDTH - PLAYER_SIZE;
            this.vx *= -0.5;
        }
        if (this.y < PLAYER_SIZE) {
            this.y = PLAYER_SIZE;
            this.vy *= -0.5;
        }
        if (this.y > WORLD_HEIGHT - PLAYER_SIZE) {
            this.y = WORLD_HEIGHT - PLAYER_SIZE;
            this.vy *= -0.5;
        }

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

        // Health regeneration
        if (this.regenRate > 0 && Date.now() - this.lastRegen > 1000) {
            this.health = Math.min(this.maxHealth, this.health + this.regenRate);
            this.lastRegen = Date.now();
        }

        // Combo reset
        if (Date.now() - this.lastKill > 5000) {
            this.combo = 0;
        }
    }

    updateBot() {
        this.moveTimer++;

        // Bot AI - Free-for-all (attacks everyone)
        if (this.moveTimer % 40 === 0) {
            let nearestTarget = null;
            let minDist = Infinity;

            // Find nearest human player
            gameState.players.forEach(player => {
                const dist = Math.hypot(player.x - this.x, player.y - this.y);
                if (dist < minDist) {
                    minDist = dist;
                    nearestTarget = player;
                }
            });

            // Also find nearest bot (free-for-all)
            gameState.bots.forEach(bot => {
                if (bot.id !== this.id) {
                    const dist = Math.hypot(bot.x - this.x, bot.y - this.y);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestTarget = bot;
                    }
                }
            });

            // Find nearest powerup
            let nearestPowerup = null;
            let powerupDist = Infinity;

            gameState.powerups.forEach(powerup => {
                const dist = Math.hypot(powerup.x - this.x, powerup.y - this.y);
                if (dist < powerupDist && dist < 450) {
                    powerupDist = dist;
                    nearestPowerup = powerup;
                }
            });

            // Advanced decision making
            const healthLow = this.health < this.maxHealth * 0.35;
            const healthCritical = this.health < this.maxHealth * 0.2;
            
            if (healthCritical && nearestPowerup && nearestPowerup.type === 'health') {
                // Critical health - urgent health seeking
                this.targetX = nearestPowerup.x;
                this.targetY = nearestPowerup.y;
            } else if (healthLow && nearestPowerup && (nearestPowerup.type === 'health' || nearestPowerup.type === 'shield')) {
                // Low health - seek health/shield
                this.targetX = nearestPowerup.x + (Math.random() - 0.5) * 40;
                this.targetY = nearestPowerup.y + (Math.random() - 0.5) * 40;
            } else if (nearestPowerup && Math.random() < 0.4 && powerupDist < 300) {
                // Sometimes go for weapon powerups
                this.targetX = nearestPowerup.x + (Math.random() - 0.5) * 30;
                this.targetY = nearestPowerup.y + (Math.random() - 0.5) * 30;
            } else if (nearestTarget) {
                const distToPlayer = Math.hypot(nearestTarget.x - this.x, nearestTarget.y - this.y);
                const optimalRange = 180 + Math.random() * 120;
                
                if (distToPlayer > optimalRange + 120) {
                    // Too far - aggressive approach
                    const angle = Math.atan2(nearestTarget.y - this.y, nearestTarget.x - this.x);
                    const offset = 60 + Math.random() * 120;
                    this.targetX = this.x + Math.cos(angle) * offset;
                    this.targetY = this.y + Math.sin(angle) * offset;
                } else if (distToPlayer < optimalRange - 60) {
                    // Too close - tactical retreat
                    const angle = Math.atan2(this.y - nearestTarget.y, this.x - nearestTarget.x);
                    const offset = 50 + Math.random() * 90;
                    this.targetX = this.x + Math.cos(angle) * offset;
                    this.targetY = this.y + Math.sin(angle) * offset;
                } else {
                    // Perfect range - strafe and circle
                    const angle = Math.atan2(nearestTarget.y - this.y, nearestTarget.x - this.x);
                    const strafeAngle = angle + (Math.PI / 2) * (Math.random() < 0.5 ? 1 : -1);
                    const offset = 70 + Math.random() * 90;
                    this.targetX = this.x + Math.cos(strafeAngle) * offset;
                    this.targetY = this.y + Math.sin(strafeAngle) * offset;
                }
            } else {
                // Random patrol when no targets
                this.targetX = Math.random() * WORLD_WIDTH;
                this.targetY = Math.random() * WORLD_HEIGHT;
            }

            // Ensure targets are within world bounds
            this.targetX = Math.max(PLAYER_SIZE + 60, Math.min(WORLD_WIDTH - PLAYER_SIZE - 60, this.targetX));
            this.targetY = Math.max(PLAYER_SIZE + 60, Math.min(WORLD_HEIGHT - PLAYER_SIZE - 60, this.targetY));

            // aiming with prediction
            if (nearestTarget) {
                const dx = nearestTarget.x - this.x;
                const dy = nearestTarget.y - this.y;
                const dist = Math.hypot(dx, dy);
                
                // Advanced lead target prediction
                const timeToHit = dist / BULLET_SPEED;
                const predictX = nearestTarget.x + nearestTarget.vx * timeToHit * 1.2;
                const predictY = nearestTarget.y + nearestTarget.vy * timeToHit * 1.2;
                
                const pdx = predictX - this.x;
                const pdy = predictY - this.y;
                
                // Distance-based accuracy (better at close range)
                const inaccuracy = Math.min((dist / 600) * 0.25, 0.4);
                this.angle = Math.atan2(pdy, pdx) + (Math.random() - 0.5) * inaccuracy;

                // Wave-scaled shooting behavior
                const shootChance = Math.min(0.45, 0.18 + (gameState.wave * 0.025));
                const shootDelay = Math.max(500, 1100 - (gameState.wave * 45));
                
                if (dist < 450 && Math.random() < shootChance) {
                    if (Date.now() - this.lastShot > shootDelay) {
                        shootBullet(this);
                    }
                }
            }
        }
    }

    damage(amount, attacker) {
        if (this.shield) {
            this.shield = false;
            this.shieldTime = 0;
            return false;
        }
        
        const actualDamage = this.isBot ? amount * 1.8 : amount;
        this.health -= actualDamage;

        if (this.health <= 0) {
            this.deaths++;
            if (attacker) {
                attacker.kills++;
                attacker.score += 100;
                attacker.combo++;
                attacker.lastKill = Date.now();
                
                // Combo bonus
                if (attacker.combo > 1) {
                    const comboBonus = attacker.combo * 25;
                    attacker.score += comboBonus;
                }
            }
            return true; // Entity is dead
        }
        return false;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            x: Math.round(this.x),
            y: Math.round(this.y),
            vx: this.vx,
            vy: this.vy,
            angle: this.angle,
            health: Math.round(this.health),
            maxHealth: this.maxHealth,
            score: this.score,
            kills: this.kills,
            deaths: this.deaths,
            isBot: this.isBot,
            color: this.color,
            shield: this.shield,
            weaponType: this.weaponType,
            combo: this.combo
        };
    }
}

// Bullet Class - Enhanced
class Bullet {
    constructor(id, x, y, angle, owner) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.vx = Math.cos(angle) * BULLET_SPEED;
        this.vy = Math.sin(angle) * BULLET_SPEED;
        this.owner = owner;
        this.damage = 15 * owner.damageBoost;
        this.lifetime = 180; // 3 seconds at 60fps
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.lifetime--;

        // Out of bounds or expired
        if (this.x < 0 || this.x > WORLD_WIDTH || 
            this.y < 0 || this.y > WORLD_HEIGHT || 
            this.lifetime <= 0) {
            return false;
        }

        // Check collision with players
        for (let [id, player] of gameState.players) {
            if (player.id !== this.owner.id) {
                const dist = Math.hypot(player.x - this.x, player.y - this.y);
                if (dist < PLAYER_SIZE) {
                    if (player.damage(this.damage, this.owner)) {
                        // Player is dead - remove from game completely
                        io.to(player.id).emit('playerDied', {
                            victimId: player.id,
                            victimName: player.name,
                            killerId: this.owner.id,
                            killerName: this.owner.name,
                            score: player.score,
                            kills: player.kills
                        });
                        gameState.players.delete(player.id);
                        io.emit('playerLeft', player.id);
                    } else {
                        io.to(player.id).emit('playerHit', { 
                            damage: this.damage,
                            health: player.health
                        });
                    }
                    return false;
                }
            }
        }

        // Check collision with bots (free-for-all, bots can hit bots)
        for (let [id, bot] of gameState.bots) {
            if (bot.id !== this.owner.id) {
                const dist = Math.hypot(bot.x - this.x, bot.y - this.y);
                if (dist < PLAYER_SIZE) {
                    if (bot.damage(this.damage, this.owner)) {
                        gameState.bots.delete(bot.id);
                        io.emit('botDestroyed', {
                            botId: bot.id,
                            killerId: this.owner.id,
                            killerName: this.owner.name,
                            x: bot.x,
                            y: bot.y
                        });
                        
                        // Award score to any killer (bot or player)
                        io.emit('playerKilled', {
                            victimName: bot.name,
                            killerName: this.owner.name,
                            score: this.owner.score
                        });
                    }
                    return false;
                }
            }
        }

        return true;
    }

    toJSON() {
        return {
            id: this.id,
            x: Math.round(this.x),
            y: Math.round(this.y),
            angle: this.angle,
            ownerId: this.owner.id
        };
    }
}

// PowerUp Class - with more types
class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.lifetime = 1200; // 20 seconds
        this.pulseTimer = 0;
    }

    update() {
        this.lifetime--;
        this.pulseTimer++;
        
        // Check collection by players
        gameState.players.forEach(player => {
            const dist = Math.hypot(player.x - this.x, player.y - this.y);
            if (dist < PLAYER_SIZE + 30) {
                this.applyPowerUp(player);
                return false;
            }
        });

        // Check collection by bots
        gameState.bots.forEach(bot => {
            const dist = Math.hypot(bot.x - this.x, bot.y - this.y);
            if (dist < PLAYER_SIZE + 30) {
                this.applyPowerUp(bot);
                return false;
            }
        });

        return this.lifetime > 0;
    }

    applyPowerUp(player) {
        switch(this.type) {
            case 'health':
                player.health = Math.min(player.maxHealth, player.health + 60);
                break;
            case 'shield':
                player.shield = true;
                player.shieldTime = 420; // 7 seconds
                break;
            case 'rapid':
                player.weaponType = 'rapid';
                player.weaponTimer = 720; // 12 seconds
                break;
            case 'shotgun':
                player.weaponType = 'shotgun';
                player.weaponTimer = 600; // 10 seconds
                break;
            case 'damage':
                player.damageBoost = 2.5;
                setTimeout(() => player.damageBoost = 1.0, 10000);
                break;
            case 'speed':
                player.speedBoost = 1.8;
                setTimeout(() => player.speedBoost = 1.0, 8000);
                break;
            case 'regen':
                player.regenRate = 2;
                setTimeout(() => player.regenRate = 0, 12000);
                break;
            case 'maxhealth':
                player.maxHealth += 25;
                player.health = player.maxHealth;
                break;
        }
    }

    toJSON() {
        return {
            x: Math.round(this.x),
            y: Math.round(this.y),
            type: this.type,
            pulse: Math.sin(this.pulseTimer * 0.1) * 0.5 + 0.5
        };
    }
}

// Wave System
function updateWave() {
    gameState.waveTimer++;
    
    const waveInterval = Math.max(1800, 3600 - (gameState.wave * 120)); // Faster waves progression
    
    if (gameState.waveTimer >= waveInterval) {
        gameState.wave++;
        gameState.waveTimer = 0;
        io.emit('newWave', { wave: gameState.wave });
        console.log(`🌊 Wave ${gameState.wave} started!`);
        
        // Spawn extra bots on wave change
        const extraBots = Math.min(3, Math.floor(gameState.wave / 2));
        for (let i = 0; i < extraBots; i++) {
            setTimeout(() => spawnBot(), i * 800);
        }
    }
}

// Bot Management
function maintainBots() {
    const targetBots = Math.min(MAX_BOTS, MIN_BOTS + Math.floor(gameState.wave / 2));
    const currentBots = gameState.bots.size;
    
    if (currentBots < targetBots) {
        spawnBot();
    }
}

function spawnBot() {
    const botId = `bot-${gameState.nextBotId++}`;
    const names = [
        'Alpha Bot', 'Beta Tank', 'Gamma Warrior', 'Delta Fighter',
        'Epsilon Guard', 'Zeta Hunter', 'Theta Striker', 'Omega Destroyer',
        'Sigma Elite', 'Phantom Tank', 'Shadow Unit', 'Ghost Rider',
        'Storm Breaker', 'Iron Will', 'Steel Rain', 'Thunder Strike'
    ];
    
    const spawnX = Math.random() * (WORLD_WIDTH - 400) + 200;
    const spawnY = Math.random() * (WORLD_HEIGHT - 400) + 200;
    
    const bot = new Player(
        botId,
        names[Math.floor(Math.random() * names.length)],
        spawnX,
        spawnY,
        true
    );
    
    gameState.bots.set(botId, bot);
    io.emit('botSpawned', bot.toJSON());
}

// PowerUp Spawning
function spawnPowerUp() {
    const types = ['health', 'shield', 'rapid', 'shotgun', 'damage', 'speed', 'regen', 'maxhealth'];
    const weights = [4, 2, 2, 2, 1, 2, 1, 1]; // Health most common, maxhealth rare
    
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
    
    while (tooClose && attempts < 20) {
        x = Math.random() * (WORLD_WIDTH - 300) + 150;
        y = Math.random() * (WORLD_HEIGHT - 300) + 150;
        
        tooClose = false;
        for (let powerup of gameState.powerups) {
            if (Math.hypot(powerup.x - x, powerup.y - y) < 180) {
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
        // Shotgun - 6 bullets in spread
        for (let i = -2.5; i <= 2.5; i++) {
            const spreadAngle = player.angle + (i * 0.16);
            const bulletId = gameState.nextBulletId++;
            const bullet = new Bullet(
                bulletId,
                player.x + Math.cos(spreadAngle) * PLAYER_SIZE,
                player.y + Math.sin(spreadAngle) * PLAYER_SIZE,
                spreadAngle,
                player
            );
            bullet.damage *= 0.55;
            gameState.bullets.push(bullet);
        }
    } else if (player.weaponType === 'rapid') {
        // Rapid fire - slightly faster bullets
        const bulletId = gameState.nextBulletId++;
        const bullet = new Bullet(
            bulletId,
            player.x + Math.cos(player.angle) * PLAYER_SIZE,
            player.y + Math.sin(player.angle) * PLAYER_SIZE,
            player.angle,
            player
        );
        bullet.vx *= 1.2;
        bullet.vy *= 1.2;
        bullet.damage *= 0.8;
        gameState.bullets.push(bullet);
    } else {
        // Normal shot
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
    console.log('🔌 Player connected:', socket.id, '(Using HTTP Long Polling)');

    socket.on('joinGame', (data) => {
        const playerName = data.name || 'Spieler';
        
        const player = new Player(
            socket.id,
            playerName,
            WORLD_WIDTH / 2 + (Math.random() - 0.5) * 300,
            WORLD_HEIGHT / 2 + (Math.random() - 0.5) * 300,
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
        
        const fireRate = player.weaponType === 'rapid' ? 80 : 200;
        
        if (Date.now() - player.lastShot > fireRate) {
            shootBullet(player);
        }
    });

    socket.on('collectPowerUp', (index) => {
        const player = gameState.players.get(socket.id);
        const powerup = gameState.powerups[index];
        
        if (player && powerup) {
            const dist = Math.hypot(player.x - powerup.x, player.y - powerup.y);
            if (dist < PLAYER_SIZE + 35) {
                powerup.applyPowerUp(player);
                gameState.powerups.splice(index, 1);
                io.emit('powerUpCollected', { 
                    index, 
                    playerId: socket.id, 
                    type: powerup.type 
                });
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

// Optimized Game Loop
function gameLoop() {
    // Update wave
    updateWave();
    
    // Maintain bot population
    if (Math.random() < 0.025) {
        maintainBots();
    }
    
    // Update all entities
    gameState.players.forEach(player => player.update());
    gameState.bots.forEach(bot => bot.update());
    gameState.bullets = gameState.bullets.filter(bullet => bullet.update());
    gameState.powerups = gameState.powerups.filter(powerup => powerup.update());

    // Spawn powerups
    const maxPowerups = 8 + Math.floor(gameState.wave / 2);
    if (gameState.powerups.length < maxPowerups && Math.random() < 0.03) {
        spawnPowerUp();
    }

    // Send optimized game state (every 2nd tick for performance)
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
    console.log('🔒 Connection: HTTP Long Polling (no WebSocket)');
    
    // Spawn initial bots
    for (let i = 0; i < MIN_BOTS; i++) {
        setTimeout(() => spawnBot(), i * 600);
    }

    // Spawn initial powerups
    for (let i = 0; i < 6; i++) {
        setTimeout(() => spawnPowerUp(), i * 250);
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
    console.log(`🔒 Transport: HTTP Long Polling`);
    console.log(`🎯 Visit http://localhost:${PORT} to play!\n`);
    initGame();
});