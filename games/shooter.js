class Shooter {
    constructor(canvasId, soundManager, onGameOver) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.sound = soundManager;
        this.onGameOver = onGameOver;

        this.canvas.width = 600;
        this.canvas.height = 750;

        this.colors = {
            player: '#ffaa00', // Gold/Orange
            bullet: '#00f3ff', // Cyan
            enemyLow: '#ff0044',  // Red
            enemyMid: '#ff00ff', // Pink
            enemyHi: '#00ff44',  // Green
            star: 'rgba(255, 255, 255, 0.2)'
        };

        this.reset();
        this.initStars();
        this.particles = [];
        this.gameLoopId = null;
        this.lastTime = 0;

        this.init();
    }

    reset() {
        this.player = {
            x: this.canvas.width / 2,
            y: this.canvas.height - 80,
            size: 25,
            speed: 7,
            hp: 3,
            maxHp: 3
        };

        this.bullets = [];
        this.enemyBullets = [];
        this.enemies = [];
        this.score = 0;
        this.gameOver = false;
        this.paused = true;
        this.level = 1;

        this.formationX = 50;
        this.formationY = 80;
        this.formationDir = 1;
        this.formationSpeed = 0.5;
        this.diveTimer = 0;
        this.diveInterval = 3000; // ms

        this.shootTimer = 0;
        this.shootInterval = 200; // ms
        
        this.createFormation();
    }

    createFormation() {
        const cols = 8;
        const rows = 4;
        const spacingX = 60;
        const spacingY = 50;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let color = this.colors.enemyLow;
                let pts = 10;
                if (r === 0) { color = this.colors.enemyHi; pts = 30; }
                else if (r === 1) { color = this.colors.enemyMid; pts = 20; }

                this.enemies.push({
                    relX: c * spacingX,
                    relY: r * spacingY,
                    x: 0,
                    y: 0,
                    size: 18,
                    color: color,
                    points: pts,
                    state: 'formation', // 'formation', 'diving', 'returning'
                    diveX: 0,
                    diveY: 0,
                    diveV: 0,
                    shootTimer: Math.random() * 5000
                });
            }
        }
    }

    initStars() {
        this.stars = [];
        for (let i = 0; i < 150; i++) {
            this.stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2 + 0.5,
                speed: Math.random() * 2 + 1
            });
        }
    }

    init() {
        this.updateUI();
        this.render();
    }

    start() {
        this.paused = false;
        this.lastTime = performance.now();
    }

    stop() {
        this.paused = true;
        if (this.gameLoopId) {
            cancelAnimationFrame(this.gameLoopId);
            this.gameLoopId = null;
        }
    }

    handleInput(e) {
        if (this.paused || this.gameOver) return;
    }

    update(deltaTime) {
        if (this.paused || this.gameOver) return;

        this.updateStars(deltaTime);
        this.updatePlayer(deltaTime);
        this.updateBullets(deltaTime);
        this.updateEnemies(deltaTime);
        this.checkCollisions();
        this.updateParticles(deltaTime);

        // Difficulty
        this.level = Math.floor(this.score / 500) + 1;
        this.diveInterval = Math.max(1000, 3000 - (this.level - 1) * 300);
        this.formationSpeed = 0.5 + (this.level * 0.1);

        // All enemies dead? Regen.
        if (this.enemies.length === 0) {
            this.createFormation();
            this.level++;
        }
    }

    updateStars(deltaTime) {
        this.stars.forEach(star => {
            star.y += star.speed * (deltaTime / 16);
            if (star.y > this.canvas.height) {
                star.y = 0;
                star.x = Math.random() * this.canvas.width;
            }
        });
    }

    updatePlayer(deltaTime) {
        const keys = window.gameManager.keys || {};
        if (keys['ArrowLeft'] || keys[37]) this.player.x -= this.player.speed * (deltaTime / 16);
        if (keys['ArrowRight'] || keys[39]) this.player.x += this.player.speed * (deltaTime / 16);

        if (this.player.x < this.player.size) this.player.x = this.player.size;
        if (this.player.x > this.canvas.width - this.player.size) this.player.x = this.canvas.width - this.player.size;

        this.shootTimer += deltaTime;
        if ((keys[' '] || keys[32]) && this.shootTimer >= this.shootInterval) {
            this.shoot();
            this.shootTimer = 0;
        }
    }

    shoot() {
        this.bullets.push({
            x: this.player.x,
            y: this.player.y - 20,
            speed: 12,
            size: 4
        });
        if (this.sound.shoot) this.sound.shoot();
    }

    updateBullets(deltaTime) {
        // Player Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.y -= b.speed * (deltaTime / 16);
            if (b.y < 0) this.bullets.splice(i, 1);
        }

        // Enemy Bullets
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            b.y += b.speed * (deltaTime / 16);
            if (b.y > this.canvas.height) this.enemyBullets.splice(i, 1);
        }
    }

    updateEnemies(deltaTime) {
        // Formation Oscillation
        this.formationX += this.formationDir * this.formationSpeed * (deltaTime / 16);
        if (this.formationX > 120 || this.formationX < 40) {
            this.formationDir *= -1;
        }

        // Dive Logic
        this.diveTimer += deltaTime;
        if (this.diveTimer >= this.diveInterval) {
            const eligible = this.enemies.filter(e => e.state === 'formation');
            if (eligible.length > 0) {
                const target = eligible[Math.floor(Math.random() * eligible.length)];
                target.state = 'diving';
                target.diveX = (this.player.x - target.x) / 60; // Soft homing
                target.diveV = 4 + Math.random() * 3;
            }
            this.diveTimer = 0;
        }

        this.enemies.forEach(e => {
            if (e.state === 'formation') {
                e.x = this.formationX + e.relX;
                e.y = this.formationY + e.relY;
                
                // Random shooting
                e.shootTimer += deltaTime;
                if (e.shootTimer > 8000 / this.level) {
                    this.enemyShoot(e);
                    e.shootTimer = 0;
                }
            } else if (e.state === 'diving') {
                e.y += e.diveV * (deltaTime / 16);
                e.x += e.diveX * (deltaTime / 16);
                
                if (e.y > this.canvas.height) {
                    e.y = -50;
                    e.state = 'returning';
                }
            } else if (e.state === 'returning') {
                const targetX = this.formationX + e.relX;
                const targetY = this.formationY + e.relY;
                e.y += 5 * (deltaTime / 16);
                if (e.y >= targetY) {
                    e.state = 'formation';
                }
            }
        });
    }

    enemyShoot(e) {
        this.enemyBullets.push({
            x: e.x,
            y: e.y + e.size,
            speed: 5 + this.level,
            size: 4,
            color: e.color
        });
    }

    checkCollisions() {
        // Player Bullets vs Enemies
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                const dist = Math.hypot(b.x - e.x, b.y - e.y);

                if (dist < e.size + b.size) {
                    this.score += e.points;
                    this.createParticles(e.x, e.y, e.color);
                    if (this.sound.clear) this.sound.clear();
                    this.enemies.splice(j, 1);
                    this.bullets.splice(i, 1);
                    this.updateUI();
                    break;
                }
            }
        }

        // Enemy Bullets vs Player
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            const dist = Math.hypot(b.x - this.player.x, b.y - this.player.y);

            if (dist < b.size + this.player.size - 10) {
                this.handlePlayerHit();
                this.enemyBullets.splice(i, 1);
                break;
            }
        }

        // Diving Enemy vs Player
        this.enemies.forEach((e, idx) => {
            if (e.state === 'diving') {
                const dist = Math.hypot(e.x - this.player.x, e.y - this.player.y);
                if (dist < e.size + this.player.size - 10) {
                    this.handlePlayerHit();
                    this.createParticles(e.x, e.y, e.color);
                    this.enemies.splice(idx, 1);
                }
            }
        });
    }

    handlePlayerHit() {
        this.player.hp--;
        this.createParticles(this.player.x, this.player.y, this.colors.player, 20);
        if (this.sound.drop) this.sound.drop();
        this.updateUI();
        if (this.player.hp <= 0) this.handleGameOver();
    }

    handleGameOver() {
        this.gameOver = true;
        this.paused = true;
        this.sound.gameOver();
        if (this.onGameOver) this.onGameOver(this.score);
    }

    updateUI() {
        const scoreEl = document.getElementById('shooter-score');
        if (scoreEl) scoreEl.innerText = this.score;
        
        const hpEl = document.getElementById('shooter-hp');
        if (hpEl) {
            hpEl.innerHTML = '';
            for (let i = 0; i < this.player.maxHp; i++) {
                const heart = document.createElement('span');
                heart.innerText = i < this.player.hp ? '❤️' : '🖤';
                heart.style.fontSize = '1.2rem';
                heart.style.marginRight = '5px';
                hpEl.appendChild(heart);
            }
        }
    }

    createParticles(x, y, color, count = 12) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 12,
                vy: (Math.random() - 0.5) * 12,
                life: 1.0,
                color: color
            });
        }
    }

    updateParticles(deltaTime) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= deltaTime / 600;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Stars
        this.ctx.fillStyle = this.colors.star;
        this.stars.forEach(star => {
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Enemy Bullets
        this.enemyBullets.forEach(b => {
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = b.color;
            this.ctx.fillStyle = b.color;
            this.ctx.beginPath();
            this.ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Player Bullets
        this.bullets.forEach(b => {
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = this.colors.bullet;
            this.ctx.fillStyle = this.colors.bullet;
            this.ctx.beginPath();
            this.ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Enemies
        this.enemies.forEach(e => {
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = e.color;
            this.ctx.strokeStyle = e.color;
            this.ctx.lineWidth = 2;
            
            this.ctx.beginPath();
            if (e.points === 30) { // Hi - Triangle with inner glow
                this.ctx.moveTo(e.x, e.y - e.size);
                this.ctx.lineTo(e.x - e.size, e.y + e.size);
                this.ctx.lineTo(e.x + e.size, e.y + e.size);
                this.ctx.closePath();
            } else if (e.points === 20) { // Mid - Square
                this.ctx.rect(e.x - e.size + 4, e.y - e.size + 4, (e.size - 4) * 2, (e.size - 4) * 2);
            } else { // Low - Diamond
                this.ctx.moveTo(e.x, e.y - e.size);
                this.ctx.lineTo(e.x + e.size, e.y);
                this.ctx.lineTo(e.x, e.y + e.size);
                this.ctx.lineTo(e.x - e.size, e.y);
                this.ctx.closePath();
            }
            this.ctx.stroke();
            this.ctx.fillStyle = e.color;
            this.ctx.globalAlpha = 0.3;
            this.ctx.fill();
            this.ctx.globalAlpha = 1.0;
        });

        // Player
        if (!this.gameOver) {
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = this.colors.player;
            this.ctx.fillStyle = this.colors.player;
            
            this.ctx.beginPath();
            this.ctx.moveTo(this.player.x, this.player.y - this.player.size);
            this.ctx.lineTo(this.player.x - this.player.size, this.player.y + this.player.size);
            this.ctx.lineTo(this.player.x + this.player.size, this.player.y + this.player.size);
            this.ctx.closePath();
            this.ctx.fill();

            this.ctx.fillStyle = '#fff';
            this.ctx.beginPath();
            this.ctx.arc(this.player.x, this.player.y + 5, 4, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.shadowBlur = 0;

        // Particles
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1.0;
    }

    render(time = 0) {
        if (!this.lastTime) this.lastTime = time;
        const deltaTime = time - this.lastTime;
        this.lastTime = time;
        
        this.update(deltaTime);
        this.draw();
        
        this.gameLoopId = requestAnimationFrame((t) => this.render(t));
    }
}
