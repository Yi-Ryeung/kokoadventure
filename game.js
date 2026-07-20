// Koko Adventure Game - Platformer Engine & Boss Fight

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const GRAVITY = 0.5;
const COIN_MINING_VALUE = 200; // Each coin awards 200 KOKO

// Dynamic player stats based on Upgrade Shop
function getPlayerSpeed() {
    const lvl = (window.web3State && window.web3State.upgrades && window.web3State.upgrades.speed) || 1;
    return 4.5 + (lvl - 1) * 0.6;
}

function getJumpForce() {
    const lvl = (window.web3State && window.web3State.upgrades && window.web3State.upgrades.jump) || 1;
    return -11.5 - (lvl - 1) * 0.9;
}

function getPlayerMaxHp() {
    return (window.web3State && window.web3State.upgrades && window.web3State.upgrades.maxHp) || 3;
}

function getCoconutDamage() {
    const lvl = (window.web3State && window.web3State.upgrades && window.web3State.upgrades.damage) || 1;
    return 2 * lvl;
}

function getCoinMagnetRadius() {
    const lvl = (window.web3State && window.web3State.upgrades && window.web3State.upgrades.magnet) || 1;
    return 24 + (lvl - 1) * 35;
}

// Game States
let canvas, ctx;
let gameState = 'START'; // START, LEVEL_SELECT, PLAYING, PAUSED, LEVEL_CLEAR, GAME_OVER, VICTORY
let currentLevel = 1;
let score = 0;
let lives = 5;
let player;
let platforms = [];
let coins = [];
let hazards = [];
let enemies = [];
let projectiles = [];
let bossProjectiles = [];
let cameraX = 0;
let levelWidth = 3000; // standard scrolling level length
let boss = null;
let levelClearedTime = 0;

// Loaded Image Assets
const images = {
    background: new Image(),
    player: new Image(),
    boss: new Image(),
    enemy: new Image(),
    coin: new Image()
};

images.background.src = 'assets/forest_background.png';

// Chroma-key filter helper to make white/light backgrounds transparent dynamically
function loadAndCleanImage(imgObject, src) {
    const rawImg = new Image();
    rawImg.src = src;
    rawImg.onload = () => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = rawImg.naturalWidth;
        tempCanvas.height = rawImg.naturalHeight;
        tempCtx.drawImage(rawImg, 0, 0);
        
        try {
            const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                // If pixel is very close to white, make it fully transparent
                if (r > 225 && g > 225 && b > 225) {
                    data[i+3] = 0; // Alpha
                }
            }
            tempCtx.putImageData(imgData, 0, 0);
            imgObject.src = tempCanvas.toDataURL();
        } catch (e) {
            // Fallback to original image if cross-origin or canvas error occurs
            imgObject.src = src;
        }
    };
}

loadAndCleanImage(images.player, 'assets/koko_koala.png');
loadAndCleanImage(images.boss, 'assets/zombie_koala.png');
loadAndCleanImage(images.enemy, 'assets/enemy_prickly.png');
loadAndCleanImage(images.coin, 'assets/koko_coin.png');

// Controls state
const keys = {
    left: false,
    right: false,
    up: false,
    shoot: false
};

// Attack cooldown
let shootCooldown = 0;

// Particle system for nice visuals
let particles = [];

class Particle {
    constructor(x, y, color, size, vx, vy) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        this.vx = vx;
        this.vy = vy;
        this.alpha = 1;
        this.decay = Math.random() * 0.05 + 0.02;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1; // gravity
        this.alpha -= this.decay;
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function spawnExplosion(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
        const size = Math.random() * 4 + 2;
        const vx = (Math.random() - 0.5) * 6;
        const vy = (Math.random() - 0.5) * 6 - 2;
        particles.push(new Particle(x, y, color, size, vx, vy));
    }
}

// Player Class
class Player {
    constructor() {
        this.x = 100;
        this.y = 300;
        this.width = 48;
        this.height = 48;
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;
        this.coyoteTimer = 0;
        this.hp = 3;
        this.invulnerable = 0; // timer frames
        this.facing = 'right';
        this.shootTimer = 0;
        this.jumpCount = 0;
    }

    update(platforms) {
        const speed = getPlayerSpeed();
        // Horizontal Movement
        if (keys.left) {
            this.vx = -speed;
            this.facing = 'left';
        } else if (keys.right) {
            this.vx = speed;
            this.facing = 'right';
        } else {
            this.vx *= 0.8; // friction
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
        }

        // Apply Gravity
        this.vy += GRAVITY;

        // 1. Apply Vertical Movement & Resolve Vertical Collisions FIRST
        this.y += this.vy;
        this.onGround = false;

        for (let plat of platforms) {
            if (AABBCollision(this, plat)) {
                if (this.vy >= 0 && (this.y + this.height - this.vy) <= plat.y + 24) {
                    // Land on top
                    this.y = plat.y - this.height;
                    this.vy = 0;
                    this.onGround = true;
                    this.jumpCount = 0;
                } else if (this.vy < 0 && (this.y - this.vy) >= plat.y + plat.height - 16) {
                    // Head bump
                    this.y = plat.y + plat.height;
                    this.vy = 0;
                }
            }
        }

        // Coyote Time tracking
        if (this.onGround) {
            this.coyoteTimer = 8; // 8 frames tolerance after stepping off edge
        } else if (this.coyoteTimer > 0) {
            this.coyoteTimer--;
        }

        // 2. Apply Horizontal Movement & Resolve Horizontal Collisions
        this.x += this.vx;

        // Level boundary clamps
        if (this.x < 0) this.x = 0;
        if (this.x > levelWidth - this.width) this.x = levelWidth - this.width;

        for (let plat of platforms) {
            if (AABBCollision(this, plat)) {
                // Ignore side wall collision if already landed on top of this platform
                if (!this.onGround || (this.y + this.height > plat.y + 6)) {
                    if (this.vx > 0) {
                        this.x = plat.x - this.width;
                    } else if (this.vx < 0) {
                        this.x = plat.x + plat.width;
                    }
                    this.vx = 0;
                }
            }
        }

        // Invulnerable timer decay
        if (this.invulnerable > 0) this.invulnerable--;
    }

    draw() {
        ctx.save();
        
        // Invulnerability flash
        if (this.invulnerable > 0 && Math.floor(this.invulnerable / 4) % 2 === 0) {
            ctx.globalAlpha = 0.3;
        }

        // Draw Player Sprite (using loaded image, fallback to drawn block if missing/not loaded)
        try {
            if (images.player.complete && images.player.naturalWidth > 0) {
                // Flip image if facing left
                if (this.facing === 'left') {
                    ctx.translate(this.x + this.width, this.y);
                    ctx.scale(-1, 1);
                    ctx.drawImage(images.player, 0, 0, this.width, this.height);
                } else {
                    ctx.drawImage(images.player, this.x, this.y, this.width, this.height);
                }
            } else {
                // Fallback Koala drawing (cute grey circle and ears)
                ctx.fillStyle = '#7f8c8d';
                // Ears
                ctx.beginPath();
                ctx.arc(this.x + 8, this.y + 12, 10, 0, Math.PI*2);
                ctx.arc(this.x + this.width - 8, this.y + 12, 10, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = '#ffb8b8';
                ctx.beginPath();
                ctx.arc(this.x + 8, this.y + 12, 6, 0, Math.PI*2);
                ctx.arc(this.x + this.width - 8, this.y + 12, 6, 0, Math.PI*2);
                ctx.fill();
                // Body
                ctx.fillStyle = '#95a5a6';
                ctx.beginPath();
                ctx.arc(this.x + this.width/2, this.y + this.height/2 + 4, 18, 0, Math.PI*2);
                ctx.fill();
                // Face details
                ctx.fillStyle = '#2c3e50';
                ctx.beginPath();
                // Eyes
                ctx.arc(this.x + 16, this.y + 20, 3, 0, Math.PI*2);
                ctx.arc(this.x + 32, this.y + 20, 3, 0, Math.PI*2);
                ctx.fill();
                // Nose
                ctx.fillStyle = '#34495e';
                ctx.beginPath();
                ctx.ellipse(this.x + 24, this.y + 26, 5, 8, 0, 0, Math.PI*2);
                ctx.fill();
            }
        } catch (e) {
            ctx.fillStyle = '#7f8c8d';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }

        ctx.restore();
    }

    damage() {
        if (this.invulnerable > 0) return;
        this.hp--;
        this.invulnerable = 60; // 1 second invulnerable
        spawnExplosion(this.x + this.width/2, this.y + this.height/2, '#ff4757', 15);
        updateHeartsHUD();

        if (this.hp <= 0) {
            handleLifeLost();
        }
    }
}

// Projectile (Coconut/Coin throw)
class Projectile {
    constructor(x, y, dx) {
        this.x = x;
        this.y = y;
        this.width = 16;
        this.height = 16;
        this.vx = dx * 10;
        this.vy = -2; // slight upward arch
    }
    update() {
        this.vy += 0.1; // small gravity
        this.x += this.vx;
        this.y += this.vy;
    }
    draw() {
        ctx.fillStyle = '#f39c12'; // gold
        ctx.beginPath();
        ctx.arc(this.x + 8, this.y + 8, 8, 0, Math.PI*2);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    }
}

// Patrolling Enemy class
class Enemy {
    constructor(x, y, limitLeft, limitRight, speed = 1.5) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 40;
        this.vx = speed;
        this.limitLeft = limitLeft;
        this.limitRight = limitRight;
    }

    update() {
        this.x += this.vx;
        if (this.x <= this.limitLeft) {
            this.x = this.limitLeft;
            this.vx = -this.vx;
        } else if (this.x >= this.limitRight - this.width) {
            this.x = this.limitRight - this.width;
            this.vx = -this.vx;
        }
    }

    draw() {
        try {
            if (images.enemy.complete && images.enemy.naturalWidth > 0) {
                ctx.drawImage(images.enemy, this.x, this.y, this.width, this.height);
            } else {
                // Draw a simple spiky creature
                ctx.fillStyle = '#a0522d';
                ctx.fillRect(this.x, this.y + 10, this.width, this.height - 10);
                ctx.fillStyle = '#ffd700';
                // spikes
                for(let i=0; i<this.width; i+=8) {
                    ctx.beginPath();
                    ctx.moveTo(this.x + i, this.y + 10);
                    ctx.lineTo(this.x + i + 4, this.y);
                    ctx.lineTo(this.x + i + 8, this.y + 10);
                    ctx.fill();
                }
            }
        } catch (e) {
            ctx.fillStyle = '#a0522d';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

// Boss Zombie Koala (Stage 50)
class Boss {
    constructor() {
        this.x = CANVAS_WIDTH - 200;
        this.y = CANVAS_HEIGHT - 220; // fits on ground
        this.width = 160;
        this.height = 160;
        this.maxHp = 60;
        this.hp = 60;
        this.vx = -1.5;
        this.shootTimer = 0;
        this.jumpTimer = 0;
        this.isJumping = false;
        this.vy = 0;
        this.flashRed = 0;
    }

    update() {
        // Move back and forth in right half
        this.x += this.vx;
        if (this.x <= CANVAS_WIDTH / 2) {
            this.x = CANVAS_WIDTH / 2;
            this.vx = 1.5;
        } else if (this.x >= CANVAS_WIDTH - this.width) {
            this.x = CANVAS_WIDTH - this.width;
            this.vx = -1.5;
        }

        // Projectile attack
        this.shootTimer++;
        if (this.shootTimer > 90) { // every 1.5s
            this.shootTimer = 0;
            // Spits slime balls
            bossProjectiles.push({
                x: this.x,
                y: this.y + 60,
                vx: -6 - Math.random() * 4,
                vy: -3 - Math.random() * 2,
                radius: 12
            });
        }

        // Jump/Stomp shockwave attack
        this.jumpTimer++;
        if (this.jumpTimer > 180) { // every 3s
            this.jumpTimer = 0;
            this.vy = -10;
            this.isJumping = true;
        }

        if (this.isJumping) {
            this.vy += 0.4;
            this.y += this.vy;
            if (this.y >= CANVAS_HEIGHT - 220) {
                this.y = CANVAS_HEIGHT - 220;
                this.isJumping = false;
                this.vy = 0;
                // Slam ground! Trigger particles and screen shake (simulated via particle count)
                spawnExplosion(this.x + this.width/2, CANVAS_HEIGHT - 60, '#00ff00', 30);
                
                // Deal damage if player is grounded during stomp
                if (player.onGround) {
                    player.damage();
                }
            }
        }

        if (this.flashRed > 0) this.flashRed--;
    }

    draw() {
        ctx.save();
        
        // Flash red indicator when damaged
        if (this.flashRed > 0) {
            ctx.filter = 'hue-rotate(300deg) saturate(3) brightness(1.2)';
        }

        try {
            if (images.boss.complete && images.boss.naturalWidth > 0) {
                ctx.drawImage(images.boss, this.x, this.y, this.width, this.height);
            } else {
                // Giant Zombie Koala placeholder
                ctx.fillStyle = '#27ae60'; // zombie green
                ctx.fillRect(this.x, this.y, this.width, this.height);
                // Eyes
                ctx.fillStyle = '#e74c3c'; // red eyes
                ctx.fillRect(this.x + 30, this.y + 40, 20, 20);
                ctx.fillRect(this.x + 80, this.y + 40, 20, 20);
            }
        } catch(e) {
            ctx.fillStyle = '#27ae60';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }

        ctx.restore();

        // Draw Boss Health Bar
        const barW = 300;
        const barH = 15;
        const barX = CANVAS_WIDTH / 2 - barW / 2;
        const barY = 30;

        // bg
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(barX, barY, barW, barH);
        
        // progress
        const hpPercent = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = '#ff2e2e';
        ctx.fillRect(barX, barY, barW * hpPercent, barH);

        // border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barW, barH);

        // Title
        ctx.fillStyle = '#fff';
        ctx.font = "bold 14px 'Orbitron'";
        ctx.textAlign = 'center';
        ctx.fillText("GIANT ZOMBIE KOALA", CANVAS_WIDTH / 2, barY - 8);
    }
}

// Generate level components dynamically
function buildLevel(levelNum) {
    platforms = [];
    coins = [];
    hazards = [];
    enemies = [];
    projectiles = [];
    bossProjectiles = [];
    particles = [];
    cameraX = 0;
    boss = null;

    // Reset player position & apply upgraded Max HP
    player.x = 80;
    player.y = 350;
    player.vx = 0;
    player.vy = 0;
    player.maxHp = getPlayerMaxHp();
    player.hp = player.maxHp;
    updateHeartsHUD();

    if (levelNum === 50) {
        // Stage 50 MID-BOSS (Zombie Commander)
        levelWidth = CANVAS_WIDTH;
        platforms.push({ x: 0, y: CANVAS_HEIGHT - 60, width: CANVAS_WIDTH, height: 60 });
        platforms.push({ x: 180, y: CANVAS_HEIGHT - 180, width: 120, height: 20 });
        platforms.push({ x: 420, y: CANVAS_HEIGHT - 250, width: 120, height: 20 });
        
        boss = new Boss();
        boss.maxHp = 40;
        boss.hp = 40;

        coins.push({ x: 240, y: CANVAS_HEIGHT - 220, collected: false });
        coins.push({ x: 480, y: CANVAS_HEIGHT - 290, collected: false });
        return;
    } else if (levelNum === 100) {
        // Stage 100 FINAL BOSS KING (Giant Zombie Koala King)
        levelWidth = CANVAS_WIDTH;
        platforms.push({ x: 0, y: CANVAS_HEIGHT - 60, width: CANVAS_WIDTH, height: 60 });
        platforms.push({ x: 140, y: CANVAS_HEIGHT - 180, width: 140, height: 20 });
        platforms.push({ x: 440, y: CANVAS_HEIGHT - 250, width: 140, height: 20 });
        
        boss = new Boss();
        boss.maxHp = 100;
        boss.hp = 100;
        boss.vx = -2.5; // Faster boss

        coins.push({ x: 200, y: CANVAS_HEIGHT - 220, collected: false });
        coins.push({ x: 500, y: CANVAS_HEIGHT - 290, collected: false });
        return;
    }

    // Normal Levels 1-49 scrolling levels
    levelWidth = 2000 + (levelNum * 100); // gets longer

    // Ground platforms with gaps
    let currentX = 0;
    platforms.push({ x: 0, y: CANVAS_HEIGHT - 60, width: 400, height: 60 }); // Safe start zone
    currentX = 400;

    const seed = levelNum * 314;
    let randIndex = 0;
    function getRand() {
        const x = Math.sin(seed + randIndex++) * 10000;
        return x - Math.floor(x);
    }

    while (currentX < levelWidth - 300) {
        // Gap sizing: comfortable jump distances (50px to 95px max)
        const gapSize = Math.floor(50 + getRand() * Math.min(45, 20 + levelNum * 1.5));
        const platWidth = Math.floor(180 + getRand() * 200);
        const platHeight = 60; // Fixed consistent ground level height

        // Advance X
        currentX += gapSize;

        // Main Ground Platform block
        platforms.push({
            x: currentX,
            y: CANVAS_HEIGHT - platHeight,
            width: platWidth,
            height: platHeight
        });

        // Add items / traps on this platform
        if (platWidth > 120) {
            // Spawn Spikes or Patrolling enemies
            const obstacleSpawn = getRand();
            const hazardThreshold = 0.25 + (levelNum * 0.008); // more traps at higher levels

            if (obstacleSpawn < hazardThreshold * 0.5) {
                // Spawn a spike hazard
                hazards.push({
                    x: currentX + platWidth / 2 - 15,
                    y: CANVAS_HEIGHT - platHeight - 20,
                    width: 30,
                    height: 20
                });
            } else if (obstacleSpawn < hazardThreshold) {
                // Spawn patrolling enemy
                const eX = currentX + 30;
                enemies.push(new Enemy(
                    eX,
                    CANVAS_HEIGHT - platHeight - 40,
                    currentX + 10,
                    currentX + platWidth - 10,
                    1.2 + (levelNum * 0.05) // speed scale
                ));
            }

            // Spawn some coins above platform
            const coinCount = Math.floor(getRand() * 4) + 1;
            for (let c = 0; c < coinCount; c++) {
                coins.push({
                    x: currentX + 20 + (c * 35),
                    y: CANVAS_HEIGHT - platHeight - 50 - Math.floor(getRand() * 50),
                    collected: false
                });
            }
        }

        // Add secondary floating helper platforms sometimes
        if (getRand() > 0.6) {
            platforms.push({
                x: currentX + 50,
                y: CANVAS_HEIGHT - platHeight - 110,
                width: 100,
                height: 18
            });
            coins.push({
                x: currentX + 90,
                y: CANVAS_HEIGHT - platHeight - 140,
                collected: false
            });
        }

        currentX += platWidth;
    }

    // Goal platform at the end
    platforms.push({
        x: levelWidth - 300,
        y: CANVAS_HEIGHT - 60,
        width: 300,
        height: 60
    });
}

function updateHeartsHUD() {
    const hearts = document.getElementById('hearts-container');
    const maxHp = getPlayerMaxHp();
    if (hearts) {
        hearts.textContent = '❤️'.repeat(Math.max(0, player.hp)) + '🖤'.repeat(Math.max(0, maxHp - player.hp));
    }
}

function handleLifeLost() {
    lives--;
    const livesEl = document.getElementById('lives-count');
    if (livesEl) livesEl.textContent = String(lives).padStart(2, '0');

    if (lives <= 0) {
        setGameState('GAME_OVER');
    } else {
        // Restart the current level
        buildLevel(currentLevel);
    }
}

// Collisions logic helper
function AABBCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// Run loop updating game logic
function updateGame() {
    if (gameState !== 'PLAYING') return;

    player.update(platforms);

    // Shoot cooldown decay
    if (shootCooldown > 0) shootCooldown--;

    // Spawn shooting projectile if key pressed & cooldown zero
    if (keys.shoot && shootCooldown === 0) {
        shootCooldown = 20; // cooldown frame ticks
        const projX = player.facing === 'right' ? player.x + player.width : player.x - 16;
        const dir = player.facing === 'right' ? 1 : -1;
        projectiles.push(new Projectile(projX, player.y + player.height/2 - 8, dir));
    }

    // Falling out of screen bounds (Pits)
    if (player.y > CANVAS_HEIGHT) {
        handleLifeLost();
        return;
    }

    // Camera follow player (x direction scrolling) with smooth interpolation (lerp)
    if (currentLevel < 50) {
        const targetCam = player.x - CANVAS_WIDTH / 3;
        cameraX += (targetCam - cameraX) * 0.08;
        cameraX = Math.max(0, Math.min(levelWidth - CANVAS_WIDTH, cameraX));
    } else {
        cameraX += (0 - cameraX) * 0.08; // smooth return to center for boss arena
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].alpha <= 0) {
            particles.splice(i, 1);
        }
    }

    // Update Projectiles (Player coconuts)
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        proj.update();

        // Bounds check
        if (proj.x < cameraX || proj.x > cameraX + CANVAS_WIDTH || proj.y > CANVAS_HEIGHT) {
            projectiles.splice(i, 1);
            continue;
        }

        // Check hits against regular enemies
        let hitEnemy = false;
        for (let eIdx = enemies.length - 1; eIdx >= 0; eIdx--) {
            const e = enemies[eIdx];
            if (AABBCollision(proj, e)) {
                hitEnemy = true;
                spawnExplosion(e.x + e.width/2, e.y + e.height/2, '#ffd700', 10);
                enemies.splice(eIdx, 1); // Kill enemy
                score += 5; // extra points
                // Collect coins value directly to Mining Pool
                mineTokens(100); // 100 KOKO for enemy defeat
                break;
            }
        }

        // Check hit against boss
        if (!hitEnemy && boss && AABBCollision(proj, boss)) {
            hitEnemy = true;
            const dmg = getCoconutDamage();
            boss.hp -= dmg;
            boss.flashRed = 10;
            spawnExplosion(proj.x + 8, proj.y + 8, '#27ae60', 15);
            
            if (boss.hp <= 0) {
                if (currentLevel === 100) {
                    // FINAL KING DEFEATED!
                    spawnExplosion(boss.x + boss.width/2, boss.y + boss.height/2, '#ffb8b8', 100);
                    triggerVictory();
                } else {
                    // Mid-Boss Defeated!
                    spawnExplosion(boss.x + boss.width/2, boss.y + boss.height/2, '#ffd700', 50);
                    triggerLevelCleared();
                }
            }
        }

        if (hitEnemy) {
            projectiles.splice(i, 1);
        }
    }

    // Update Boss Projectiles (slime balls)
    if (boss) {
        boss.update();

        for (let i = bossProjectiles.length - 1; i >= 0; i--) {
            const sp = bossProjectiles[i];
            sp.x += sp.vx;
            sp.vy += 0.2; // slight falling
            sp.y += sp.vy;

            // Check hit player
            const spRect = { x: sp.x - sp.radius, y: sp.y - sp.radius, width: sp.radius * 2, height: sp.radius * 2 };
            if (AABBCollision(spRect, player)) {
                player.damage();
                bossProjectiles.splice(i, 1);
                continue;
            }

            // Bounds
            if (sp.x < 0 || sp.y > CANVAS_HEIGHT - 40) {
                spawnExplosion(sp.x, CANVAS_HEIGHT - 60, '#00ff00', 5);
                bossProjectiles.splice(i, 1);
            }
        }
    }

    // Update Enemies
    for (let e of enemies) {
        e.update();
        // Check touch player
        if (AABBCollision(e, player)) {
            // Can stomp enemy if falling downwards
            if (player.vy > 0 && player.y + player.height - player.vy <= e.y + 12) {
                player.vy = JUMP_FORCE * 0.8; // bounce up
                spawnExplosion(e.x + e.width/2, e.y + e.height/2, '#ffd700', 12);
                enemies.splice(enemies.indexOf(e), 1);
                mineTokens(150); // stomp bounty
            } else {
                player.damage();
            }
        }
    }

    // Check Coins collisions & Coin Magnet pull
    const magnetR = getCoinMagnetRadius();
    const pCenterX = player.x + player.width / 2;
    const pCenterY = player.y + player.height / 2;

    for (let c of coins) {
        if (!c.collected) {
            const cCenterX = c.x + 12;
            const cCenterY = c.y + 12;
            const dx = pCenterX - cCenterX;
            const dy = pCenterY - cCenterY;
            const dist = Math.sqrt(dx*dx + dy*dy);

            // Magnet attraction
            if (dist < magnetR && dist > 0) {
                c.x += (dx / dist) * 7;
                c.y += (dy / dist) * 7;
            }

            if (AABBCollision({ x: c.x, y: c.y, width: 24, height: 24 }, player)) {
                c.collected = true;
                score++;
                const coinsEl = document.getElementById('coins-count');
                if (coinsEl) coinsEl.textContent = score;

                // Trigger mining logic
                mineTokens(COIN_MINING_VALUE);

                // particle alert
                spawnExplosion(c.x + 12, c.y + 12, '#ffd700', 6);
            }
        }
    }

    // Check Hazards (Spikes) collisions
    for (let h of hazards) {
        if (AABBCollision(h, player)) {
            player.damage();
            // knockback
            player.vy = -6;
            player.vx = player.x < h.x ? -4 : 4;
        }
    }

    // Check level portal exit condition (Flag reached at end of level)
    if (currentLevel < 50 && player.x >= levelWidth - 120) {
        // Clear Level!
        triggerLevelCleared();
    }
}

// Draw/Render visual assets
function drawGame() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 1. Draw Parallax Background
    try {
        if (images.background.complete && images.background.naturalWidth > 0) {
            // Draw background tiled or shifted relative to camera
            const bgW = CANVAS_WIDTH;
            const bgOffset = -(cameraX * 0.3) % bgW;
            ctx.drawImage(images.background, bgOffset, 0, bgW, CANVAS_HEIGHT);
            ctx.drawImage(images.background, bgOffset + bgW, 0, bgW, CANVAS_HEIGHT);
        } else {
            // Fallback gradient sky
            const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
            grad.addColorStop(0, '#1e3c72');
            grad.addColorStop(1, '#2a5298');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
    } catch(e) {
        ctx.fillStyle = '#1e3c72';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Shift context for camera scroll
    ctx.save();
    ctx.translate(-cameraX, 0);

    // 2. Draw Platforms
    for (let plat of platforms) {
        // Forest grass styling
        ctx.fillStyle = '#8b5a2b'; // dirt brown
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
        
        ctx.fillStyle = '#2ecc71'; // grass green
        ctx.fillRect(plat.x, plat.y, plat.width, 10);
    }

    // 3. Draw hazards (Spikes)
    for (let h of hazards) {
        ctx.fillStyle = '#95a5a6'; // spike metal grey
        for(let i=0; i<h.width; i+=10) {
            ctx.beginPath();
            ctx.moveTo(h.x + i, h.y + h.height);
            ctx.lineTo(h.x + i + 5, h.y);
            ctx.lineTo(h.x + i + 10, h.y + h.height);
            ctx.fill();
        }
    }

    // 4. Draw Coins
    for (let c of coins) {
        if (!c.collected) {
            try {
                if (images.coin.complete && images.coin.naturalWidth > 0) {
                    ctx.drawImage(images.coin, c.x, c.y, 24, 24);
                } else {
                    ctx.fillStyle = '#f1c40f'; // shiny gold circle
                    ctx.beginPath();
                    ctx.arc(c.x + 12, c.y + 12, 10, 0, Math.PI*2);
                    ctx.fill();
                }
            } catch(e) {
                ctx.fillStyle = '#f1c40f';
                ctx.fillRect(c.x, c.y, 24, 24);
            }
        }
    }

    // 5. Draw Portal Exit flag (At end of scrolling level)
    if (currentLevel < 50) {
        const portalX = levelWidth - 100;
        const portalY = CANVAS_HEIGHT - 160;

        // Draw portal glow ring
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(portalX + 30, portalY + 50, 40, 0, Math.PI*2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(portalX + 30, portalY + 50, 36, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = "bold 12px var(--font-heading)";
        ctx.fillText("EXIT", portalX + 12, portalY + 54);
    }

    // 6. Draw Enemies
    for (let e of enemies) {
        e.draw();
    }

    // 7. Draw Player Projectiles
    for (let proj of projectiles) {
        proj.draw();
    }

    // 8. Draw Boss & Boss Projectiles
    if (boss) {
        boss.draw();
        
        ctx.fillStyle = '#2ecc71'; // slime green
        for (let sp of bossProjectiles) {
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, sp.radius, 0, Math.PI*2);
            ctx.fill();
        }
    }

    // 9. Draw Particles
    for (let p of particles) {
        p.draw(ctx);
    }

    // 10. Draw Player
    player.draw();

    ctx.restore();
}

// Award tokens to Mining Dashboard
function mineTokens(val) {
    if (window.web3State) {
        const currentMined = window.web3State.minedBalance;
        window.web3State.minedBalance = Math.min(currentMined + val, MAX_MINED_LIMIT);
        
        // Sync display immediately
        const minedCounter = document.getElementById('mined-counter');
        if (minedCounter) minedCounter.textContent = Math.floor(window.web3State.minedBalance).toLocaleString();
        
        if (window.syncUI) window.syncUI();
        if (window.saveWeb3State) window.saveWeb3State();
    }
}

// Change state displays
function setGameState(newState) {
    gameState = newState;
    
    // Hide all canvas modals
    const modals = document.querySelectorAll('.game-screen-modal');
    modals.forEach(m => m.classList.remove('active'));

    switch(newState) {
        case 'LEVEL_SELECT':
            document.getElementById('level-select-screen').classList.add('active');
            renderLevelSelectGrid();
            break;
        case 'START':
            document.getElementById('start-screen').classList.add('active');
            break;
        case 'LEVEL_CLEAR':
            document.getElementById('level-completed-screen').classList.add('active');
            document.getElementById('clear-coins').textContent = score;
            const clearKokoVal = score * COIN_MINING_VALUE;
            document.getElementById('clear-koko').textContent = `+${clearKokoVal.toLocaleString()} $KOKO`;
            
            // Mark completed levels in web3State
            if (window.web3State) {
                if (!window.web3State.levelsCompleted.includes(currentLevel)) {
                    window.web3State.levelsCompleted.push(currentLevel);
                }
                window.updatePassiveRate();
                window.saveWeb3State();
                window.syncUI();
            }
            break;
        case 'GAME_OVER':
            document.getElementById('game-over-screen').classList.add('active');
            break;
        case 'VICTORY':
            document.getElementById('victory-screen').classList.add('active');
            // Mark Level 50 Complete
            if (window.web3State) {
                if (!window.web3State.levelsCompleted.includes(50)) {
                    window.web3State.levelsCompleted.push(50);
                    // Award remaining balance to hit 100k
                    window.web3State.minedBalance = MAX_MINED_LIMIT;
                }
                window.updatePassiveRate();
                window.saveWeb3State();
                window.syncUI();
            }
            break;
    }
}

// Level Grid Builder
function renderLevelSelectGrid() {
    const grid = document.getElementById('level-buttons-grid');
    if (!grid) return;

    grid.innerHTML = "";
    
    const completedList = (window.web3State && window.web3State.levelsCompleted) || [];

    for (let i = 1; i <= 100; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        
        let isLocked = i > 1 && !completedList.includes(i - 1);
        
        // Setup classes
        btn.className = "level-btn";
        if (i === 50 || i === 100) btn.classList.add('boss-stage');
        
        if (isLocked) {
            btn.classList.add('locked');
            btn.disabled = true;
        } else {
            if (completedList.includes(i)) {
                btn.classList.add('completed');
            } else if (i === currentLevel) {
                btn.classList.add('current');
            }

            btn.addEventListener('click', () => {
                currentLevel = i;
                const stageDisplay = document.getElementById('level-display');
                if (stageDisplay) stageDisplay.textContent = currentLevel;
                
                score = 0;
                const coinsEl = document.getElementById('coins-count');
                if (coinsEl) coinsEl.textContent = score;

                buildLevel(currentLevel);
                setGameState('PLAYING');
            });
        }

        grid.appendChild(btn);
    }
}

function triggerLevelCleared() {
    setGameState('LEVEL_CLEAR');
}

function triggerVictory() {
    setGameState('VICTORY');
}

// Global button blur helper to prevent Space/Enter from re-clicking UI buttons
document.addEventListener('click', e => {
    if (e.target && e.target.tagName === 'BUTTON') {
        e.target.blur();
    }
});

// Key Input listeners
window.addEventListener('keydown', e => {
    if (['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF'].includes(e.code)) {
        e.preventDefault(); // Prevent default browser spacebar/enter button triggers & page scrolling
    }
    if (e.repeat) return; // Prevent Windows key repeat from auto double-jumping
    if (gameState !== 'PLAYING') return;

    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        keys.up = true;
        const jForce = getJumpForce();
        // Jump action trigger (coyote time & double jump check)
        if (player.onGround || player.coyoteTimer > 0) {
            player.vy = jForce;
            player.onGround = false;
            player.coyoteTimer = 0;
            player.jumpCount = 1;
        } else if (player.jumpCount < 2) {
            player.vy = jForce * 0.9; // double jump height ratio
            player.jumpCount = 2;
            spawnExplosion(player.x + player.width/2, player.y + player.height, '#fff', 5);
        }
    }
    if (e.code === 'KeyF' || e.code === 'Enter') keys.shoot = true;
});

window.addEventListener('keyup', e => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') keys.up = false;
    if (e.code === 'KeyF' || e.code === 'Enter') keys.shoot = false;
});

// Setup Mobile Control buttons & Canvas touch tracking
function setupMobileControls() {
    // Detect touch device and mark body class
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        document.body.classList.add('is-touch-device');
    }

    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnJump = document.getElementById('btn-jump');
    const btnShoot = document.getElementById('btn-shoot');

    const bindTouch = (el, downCallback, upCallback) => {
        if (!el) return;
        el.addEventListener('mousedown', downCallback);
        el.addEventListener('mouseup', upCallback);
        el.addEventListener('mouseleave', upCallback);

        el.addEventListener('touchstart', (e) => {
            if (e.cancelable) e.preventDefault();
            downCallback();
        }, { passive: false });

        el.addEventListener('touchend', (e) => {
            if (e.cancelable) e.preventDefault();
            upCallback();
        }, { passive: false });

        el.addEventListener('touchcancel', (e) => {
            if (e.cancelable) e.preventDefault();
            upCallback();
        }, { passive: false });
    };

    bindTouch(btnLeft, () => { keys.left = true; }, () => { keys.left = false; });
    bindTouch(btnRight, () => { keys.right = true; }, () => { keys.right = false; });
    
    bindTouch(btnJump, () => {
        keys.up = true;
        const jForce = getJumpForce();
        if (player && (player.onGround || player.coyoteTimer > 0)) {
            player.vy = jForce;
            player.onGround = false;
            player.coyoteTimer = 0;
            player.jumpCount = 1;
        } else if (player && player.jumpCount < 2) {
            player.vy = jForce * 0.9;
            player.jumpCount = 2;
            spawnExplosion(player.x + player.width/2, player.y + player.height, '#fff', 5);
        }
    }, () => { keys.up = false; });

    bindTouch(btnShoot, () => { keys.shoot = true; }, () => { keys.shoot = false; });

    // Direct Canvas Touch Controls (Screen Touch Fallback)
    if (canvas) {
        canvas.addEventListener('touchstart', (e) => {
            if (gameState !== 'PLAYING') return;
            const rect = canvas.getBoundingClientRect();
            for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];
                const touchX = (touch.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
                const touchY = (touch.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

                if (touchY < CANVAS_HEIGHT * 0.45) {
                    // Tap upper screen = Jump
                    const jForce = getJumpForce();
                    if (player && (player.onGround || player.coyoteTimer > 0)) {
                        player.vy = jForce;
                        player.onGround = false;
                        player.coyoteTimer = 0;
                        player.jumpCount = 1;
                    } else if (player && player.jumpCount < 2) {
                        player.vy = jForce * 0.9;
                        player.jumpCount = 2;
                        spawnExplosion(player.x + player.width/2, player.y + player.height, '#fff', 5);
                    }
                } else if (touchX < CANVAS_WIDTH * 0.45) {
                    keys.left = true;
                } else if (touchX > CANVAS_WIDTH * 0.55) {
                    keys.right = true;
                }
            }
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) {
                keys.left = false;
                keys.right = false;
            }
        }, { passive: false });
    }
}

// Initialise Game canvas
function initGame() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    player = new Player();

    // Attach menu actions
    const startAdventureBtn = document.getElementById('start-adventure-btn');
    const startScreenModal = document.getElementById('start-screen');
    
    if (startAdventureBtn) {
        startAdventureBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setGameState('LEVEL_SELECT');
        });
    }

    if (startScreenModal) {
        startScreenModal.addEventListener('click', () => {
            if (gameState === 'START') {
                setGameState('LEVEL_SELECT');
            }
        });
    }

    const nextLevelBtn = document.getElementById('next-level-btn');
    if (nextLevelBtn) {
        nextLevelBtn.addEventListener('click', () => {
            currentLevel++;
            if (currentLevel > 100) {
                setGameState('VICTORY');
                return;
            }
            const stageDisplay = document.getElementById('level-display');
            if (stageDisplay) stageDisplay.textContent = currentLevel;
            
            score = 0;
            const coinsEl = document.getElementById('coins-count');
            if (coinsEl) coinsEl.textContent = score;

            buildLevel(currentLevel);
            setGameState('PLAYING');
        });
    }

    const retryLevelBtn = document.getElementById('retry-level-btn');
    if (retryLevelBtn) {
        retryLevelBtn.addEventListener('click', () => {
            score = 0;
            const coinsEl = document.getElementById('coins-count');
            if (coinsEl) coinsEl.textContent = score;

            buildLevel(currentLevel);
            setGameState('PLAYING');
        });
    }

    const backToSelectBtn = document.getElementById('back-to-select-btn');
    if (backToSelectBtn) {
        backToSelectBtn.addEventListener('click', () => {
            setGameState('LEVEL_SELECT');
        });
    }

    const pauseGameBtn = document.getElementById('pause-game-btn');
    if (pauseGameBtn) {
        pauseGameBtn.addEventListener('click', () => {
            if (gameState === 'PLAYING') {
                gameState = 'PAUSED';
                pauseGameBtn.textContent = '▶';
            } else if (gameState === 'PAUSED') {
                gameState = 'PLAYING';
                pauseGameBtn.textContent = '⏸️';
            }
        });
    }

    // Set controls
    setupMobileControls();

    // Start Draw Loop (Fixed 60 FPS Timestep for 120Hz/90Hz/60Hz consistency)
    let lastTime = 0;
    const TARGET_FPS = 60;
    const STEP = 1000 / TARGET_FPS;
    let accumulator = 0;

    function loop(currentTime) {
        if (!lastTime) lastTime = currentTime;
        const deltaTime = currentTime - lastTime;
        lastTime = currentTime;

        accumulator += Math.min(deltaTime, 100);

        while (accumulator >= STEP) {
            updateGame();
            accumulator -= STEP;
        }

        drawGame();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}

document.addEventListener("DOMContentLoaded", () => {
    initGame();
});
