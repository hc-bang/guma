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

        this.colors = {
            head: '#00f3ff',
            body: '#0055ff',
            food: '#ff0044'
        };

        // reset()에서 모든 상태를 초기화하므로 생성자에서는 reset() 한 번만 호출
        this.gameLoopId = null;
        this.lastTime = 0;
        this.reset();

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

        // 재시작 시 초기값으로 완전히 복원 (이전 판 상태 잔류 방지)
        this.moveInterval = 150;  // 이전 레벨의 가속 속도가 유지되는 버그 수정
        this.moveCounter = 0;     // 남은 카운터 값으로 인한 즉시 이동 버그 수정
        this.particles = [];      // 이전 파티클 잔재 제거
    }

    init() {
        this.render();
    }

    start() {
        this.isCountingDown = true;
        this.countdown = 3;
        this.countdownTimer = 0;
        // paused=false 로 설정해야 update()가 실행됨
        // 이동 잠금은 isCountingDown 플래그가 담당
        this.paused = false;
        this.lastTime = performance.now();
        if (this.sound.tick) this.sound.tick(); // 첫 번째 틱 사운드
    }

    stop() {
        this.paused = true;
        if (this.gameLoopId) {
            cancelAnimationFrame(this.gameLoopId);
            this.gameLoopId = null;
        }
    }

    // GameManager의 restartGame()에서 호출 — reset() 후 UI 갱신
    restart() {
        this.reset();
        this.updateUI();
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

        // 카운트다운 중에도 외부 일시정지(도움말 모달 등)를 우선 적용
        if (this.paused) return;

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
                }
            }
            return;
        }

        // 카운트다운이 끝난 후 이동 루프
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
        ParticleHelper.create(this.particles, x + this.gridSize / 2, y + this.gridSize / 2, color, 10, 12, 600);
    }

    updateParticles(deltaTime) {
        ParticleHelper.update(this.particles, deltaTime);
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
        ParticleHelper.draw(this.ctx, this.particles);

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
