class Snake {
    constructor(canvasId, soundManager, onGameOver) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.sound = soundManager;
        this.onGameOver = onGameOver;

        this.gridSize = 30;
        this.canvas.width = 600;
        this.canvas.height = 750;
        
        this.cols = Math.floor(this.canvas.width / this.gridSize);
        this.rows = Math.floor(this.canvas.height / this.gridSize);

        this.reset();
        this.particles = [];
        this.gameLoopId = null;
        this.lastTime = 0;
        this.moveInterval = 150;
        this.moveCounter = 0;

        this.colors = {
            head: '#00f3ff',
            body: '#0055ff',
            food: '#ff0044'
        };

        this.init();
    }

    reset() {
        this.snake = [
            { x: 5, y: 5 },
            { x: 4, y: 5 },
            { x: 3, y: 5 }
        ];
        this.direction = { x: 1, y: 0 };
        this.nextDirection = { x: 1, y: 0 };
        this.food = this.generateFood();
        this.score = 0;
        this.gameOver = false;
        this.paused = true;
        this.level = 1;

        this.countdown = 0;
        this.isCountingDown = false;
        this.countdownTimer = 0;
    }

    init() {
        this.render();
    }

    start() {
        this.isCountingDown = true;
        this.countdown = 3;
        this.countdownTimer = 0;
        this.paused = true; // Still paused for movement
        this.lastTime = performance.now();
        if (this.sound.tick) this.sound.tick(); // Initial tick
    }

    stop() {
        this.paused = true;
        if (this.gameLoopId) {
            cancelAnimationFrame(this.gameLoopId);
            this.gameLoopId = null;
        }
    }

    generateFood() {
        let newFood;
        while (true) {
            newFood = {
                x: Math.floor(Math.random() * this.cols),
                y: Math.floor(Math.random() * this.rows)
            };
            const onSnake = this.snake.some(segment => segment.x === newFood.x && segment.y === newFood.y);
            if (!onSnake) break;
        }
        return newFood;
    }

    handleInput(e) {
        if (this.paused || this.gameOver || this.isCountingDown) return;

        if (e.keyCode === 37 && this.direction.x === 0) { // Left
            this.nextDirection = { x: -1, y: 0 };
        } else if (e.keyCode === 38 && this.direction.y === 0) { // Up
            this.nextDirection = { x: 0, y: -1 };
        } else if (e.keyCode === 39 && this.direction.x === 0) { // Right
            this.nextDirection = { x: 1, y: 0 };
        } else if (e.keyCode === 40 && this.direction.y === 0) { // Down
            this.nextDirection = { x: 0, y: 1 };
        }
    }

    update(deltaTime) {
        if (this.gameOver) return;

        if (this.isCountingDown) {
            this.countdownTimer += deltaTime;
            if (this.countdownTimer >= 1000) {
                this.countdown--;
                this.countdownTimer = 0;
                if (this.countdown > 0) {
                    if (this.sound.tick) this.sound.tick();
                } else if (this.countdown === 0) {
                    if (this.sound.go) this.sound.go();
                } else {
                    this.isCountingDown = false;
                    this.paused = false;
                }
            }
            return;
        }

        if (this.paused) return;

        this.moveCounter += deltaTime;
        if (this.moveCounter >= this.moveInterval) {
            this.moveCounter = 0;
            this.move();
        }
    }

    move() {
        this.direction = this.nextDirection;
        const head = { 
            x: this.snake[0].x + this.direction.x, 
            y: this.snake[0].y + this.direction.y 
        };

        // Wall collision
        if (head.x < 0 || head.x >= this.cols || head.y < 0 || head.y >= this.rows) {
            this.handleGameOver();
            return;
        }

        // Self collision
        if (this.snake.some(segment => segment.x === head.x && segment.y === head.y)) {
            this.handleGameOver();
            return;
        }

        this.snake.unshift(head);

        // Food collision
        if (head.x === this.food.x && head.y === this.food.y) {
            this.score += 10;
            this.sound.clear(); // Use clear sound for eating
            this.createParticles(this.food.x * this.gridSize, this.food.y * this.gridSize, this.colors.food);
            this.food = this.generateFood();
            
            // Level up/Speed up
            this.level = Math.floor(this.score / 50) + 1;
            this.moveInterval = Math.max(70, 150 - (this.level - 1) * 10);
            this.updateUI();
        } else {
            this.snake.pop();
            this.sound.move(); // Light sound for moving
        }
    }

    handleGameOver() {
        this.gameOver = true;
        this.paused = true;
        this.sound.gameOver();
        if (this.onGameOver) this.onGameOver(this.score);
    }

    updateUI() {
        const scoreEl = document.getElementById('snake-score');
        if (scoreEl) scoreEl.innerText = this.score;
    }

    createParticles(x, y, color) {
        for (let i = 0; i < 10; i++) {
            this.particles.push({
                x: x + this.gridSize / 2,
                y: y + this.gridSize / 2,
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

        // Grid (Subtle)
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        for (let x = 0; x <= this.canvas.width; x += this.gridSize) {
            this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, this.canvas.height); this.ctx.stroke();
        }
        for (let y = 0; y <= this.canvas.height; y += this.gridSize) {
            this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(this.canvas.width, y); this.ctx.stroke();
        }

        // Food
        const fX = this.food.x * this.gridSize;
        const fY = this.food.y * this.gridSize;
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = this.colors.food;
        this.ctx.fillStyle = this.colors.food;
        this.ctx.beginPath();
        this.ctx.arc(fX + this.gridSize/2, fY + this.gridSize/2, this.gridSize/2 - 4, 0, Math.PI * 2);
        this.ctx.fill();

        // Snake
        this.snake.forEach((segment, index) => {
            const sX = segment.x * this.gridSize;
            const sY = segment.y * this.gridSize;
            const color = index === 0 ? this.colors.head : this.colors.body;
            
            this.ctx.shadowBlur = index === 0 ? 15 : 5;
            this.ctx.shadowColor = color;
            this.ctx.fillStyle = color;
            
            // Rounded segments
            const r = 5;
            this.ctx.beginPath();
            this.ctx.roundRect(sX + 2, sY + 2, this.gridSize - 4, this.gridSize - 4, r);
            this.ctx.fill();
        });

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

        // Countdown Overlay
        if (this.isCountingDown) {
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = this.colors.head;
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 120px Inter';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            let text = this.countdown > 0 ? this.countdown : 'GO!';
            this.ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2);
            this.ctx.shadowBlur = 0;
        }
    }

    render(time = 0) {
        const deltaTime = time - this.lastTime;
        this.lastTime = time;
        
        this.update(deltaTime);
        this.updateParticles(deltaTime);
        this.draw();
        
        this.gameLoopId = requestAnimationFrame((t) => this.render(t));
    }
}
