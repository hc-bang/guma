const BLOCKS = {
    I: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    J: [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    L: [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0]
    ],
    O: [
        [1, 1],
        [1, 1]
    ],
    S: [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]
    ],
    T: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    Z: [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]
    ]
};

const COLORS = {
    I: '#00f3ff', // Cyan
    J: '#0055ff', // Blue
    L: '#ffaa00', // Orange
    O: '#ffff00', // Yellow
    S: '#00ff00', // Green
    T: '#9d00ff', // Purple
    Z: '#ff0044'  // Red
};

class Tetris {
    constructor(canvasId, nextCanvasId, soundManager, onGameOver) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.nextCanvas = document.getElementById(nextCanvasId);
        this.nextCtx = this.nextCanvas.getContext('2d');
        
        this.sound = soundManager;
        this.onGameOver = onGameOver;
        
        this.gridSize = 35;
        this.cols = 10;
        this.rows = 20;
        
        this.canvas.width = this.cols * this.gridSize;
        this.canvas.height = this.rows * this.gridSize;
        
        this.board = this.createBoard();
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.gameOver = false;
        this.paused = true;
        
        this.piece = null;
        this.nextPiece = null;
        
        this.dropCounter = 0;
        this.dropInterval = 1000;
        this.lastTime = 0;

        this.particles = [];
        this.gameLoopId = null;
        
        this.init();
    }

    createBoard() {
        return Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
    }

    init() {
        this.nextPiece = this.generatePiece();
        this.spawnPiece();
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

    restart() {
        this.board = this.createBoard();
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.gameOver = false;
        this.paused = false;
        this.updateUI();
        this.nextPiece = this.generatePiece();
        this.spawnPiece();
    }

    generatePiece() {
        const types = Object.keys(BLOCKS);
        const type = types[Math.floor(Math.random() * types.length)];
        return {
            type,
            matrix: BLOCKS[type],
            pos: { x: 0, y: 0 },
            color: COLORS[type]
        };
    }

    spawnPiece() {
        this.piece = this.nextPiece;
        this.nextPiece = this.generatePiece();
        this.piece.pos.x = Math.floor(this.cols / 2) - Math.floor(this.piece.matrix[0].length / 2);
        this.piece.pos.y = 0;
        
        if (this.collide()) {
            this.handleGameOver();
        }
        
        this.drawNext();
    }

    handleGameOver() {
        this.gameOver = true;
        this.paused = true;
        this.sound.gameOver();
        if (this.onGameOver) this.onGameOver(this.score);
    }

    collide(piece = this.piece) {
        if (!piece) return false;
        const [m, o] = [piece.matrix, piece.pos];
        for (let y = 0; y < m.length; ++y) {
            for (let x = 0; x < m[y].length; ++x) {
                if (m[y][x] !== 0) {
                    const boardY = y + o.y;
                    const boardX = x + o.x;
                    
                    if (boardX < 0 || boardX >= this.cols || boardY >= this.rows) {
                        return true;
                    }
                    
                    if (boardY >= 0 && this.board[boardY][boardX] !== 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    rotate(matrix) {
        return matrix[0].map((_, index) => matrix.map(col => col[index]).reverse());
    }

    handleInput(e) {
        if (this.paused || this.gameOver) return;

        if (e.keyCode === 37) { // Left
            this.move(-1);
        } else if (e.keyCode === 39) { // Right
            this.move(1);
        } else if (e.keyCode === 40) { // Down
            this.drop();
        } else if (e.keyCode === 38) { // Up (Rotate)
            this.playerRotate();
        } else if (e.keyCode === 32) { // Space (Hard Drop)
            this.hardDrop();
        }
    }

    move(dir) {
        this.piece.pos.x += dir;
        if (this.collide()) {
            this.piece.pos.x -= dir;
        } else {
            this.sound.move();
        }
    }

    playerRotate() {
        const pos = this.piece.pos.x;
        let offset = 1;
        const originalMatrix = this.piece.matrix;
        this.piece.matrix = this.rotate(this.piece.matrix);
        while (this.collide()) {
            this.piece.pos.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (offset > this.piece.matrix[0].length) {
                this.piece.matrix = originalMatrix;
                this.piece.pos.x = pos;
                return;
            }
        }
        this.sound.rotate();
    }

    drop() {
        this.piece.pos.y++;
        if (this.collide()) {
            this.piece.pos.y--;
            this.merge();
            this.spawnPiece();
            this.clearLines();
            this.updateUI();
            this.sound.drop();
        }
        this.dropCounter = 0;
    }

    hardDrop() {
        while (!this.collide()) {
            this.piece.pos.y++;
        }
        this.piece.pos.y--;
        this.merge();
        this.spawnPiece();
        this.clearLines();
        this.updateUI();
        this.dropCounter = 0;
        this.sound.drop();
    }

    merge() {
        this.piece.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    this.board[y + this.piece.pos.y][x + this.piece.pos.x] = this.piece.color;
                }
            });
        });
    }

    clearLines() {
        let linesCleared = 0;
        outer: for (let y = this.rows - 1; y >= 0; --y) {
            for (let x = 0; x < this.cols; ++x) {
                if (this.board[y][x] === 0) {
                    continue outer;
                }
            }
            
            for (let x = 0; x < this.cols; ++x) {
                this.createParticles(x * this.gridSize, y * this.gridSize, this.board[y][x]);
            }
            
            const row = this.board.splice(y, 1)[0].fill(0);
            this.board.unshift(row);
            ++y;
            linesCleared++;
        }
        
        if (linesCleared > 0) {
            this.lines += linesCleared;
            this.score += linesCleared * 100 * this.level;
            this.level = Math.floor(this.lines / 10) + 1;
            this.dropInterval = Math.max(100, 1000 - (this.level - 1) * 100);
            this.sound.clear();
        }
    }

    createParticles(x, y, color) {
        for (let i = 0; i < 8; i++) {
            this.particles.push({
                x: x + this.gridSize / 2,
                y: y + this.gridSize / 2,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                color: color
            });
        }
    }

    updateUI() {
        const scoreEl = document.getElementById('score');
        const levelEl = document.getElementById('level');
        if (scoreEl) scoreEl.innerText = this.score;
        if (levelEl) levelEl.innerText = this.level;
    }

    getGhostPos() {
        const ghost = {
            pos: { ...this.piece.pos },
            matrix: this.piece.matrix
        };
        while (!this.collide(ghost)) {
            ghost.pos.y++;
        }
        ghost.pos.y--;
        return ghost.pos;
    }

    drawBlock(ctx, x, y, color, isGhost = false) {
        const size = this.gridSize;
        ctx.fillStyle = color;
        
        if (isGhost) {
            ctx.globalAlpha = 0.2;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
            ctx.globalAlpha = 1.0;
            return;
        }

        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(x * size + 1, y * size + 1, size - 2, size / 4);
        
        ctx.shadowBlur = 0;
    }

    drawBoard() {
        this.board.forEach((row, y) => {
            row.forEach((color, x) => {
                if (color !== 0) {
                    this.drawBlock(this.ctx, x, y, color);
                }
            });
        });
    }

    drawPiece() {
        if (!this.piece) return;
        const gPos = this.getGhostPos();
        this.piece.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    this.drawBlock(this.ctx, x + gPos.x, y + gPos.y, this.piece.color, true);
                }
            });
        });

        this.piece.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    this.drawBlock(this.ctx, x + this.piece.pos.x, y + this.piece.pos.y, this.piece.color);
                }
            });
        });
    }

    drawNext() {
        this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        if (!this.nextPiece) return;
        const m = this.nextPiece.matrix;
        const size = 24;
        const offsetX = (this.nextCanvas.width - m[0].length * size) / 2;
        const offsetY = (this.nextCanvas.height - m.length * size) / 2;
        
        m.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    this.nextCtx.fillStyle = this.nextPiece.color;
                    this.nextCtx.shadowBlur = 10;
                    this.nextCtx.shadowColor = this.nextPiece.color;
                    this.nextCtx.fillRect(offsetX + x * size, offsetY + y * size, size - 1, size - 1);
                }
            });
        });
    }

    updateParticles(deltaTime) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= deltaTime / 500;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    drawParticles() {
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
        const deltaTime = time - this.lastTime;
        this.lastTime = time;
        
        if (!this.paused && !this.gameOver) {
            this.dropCounter += deltaTime;
            if (this.dropCounter > this.dropInterval) {
                this.drop();
            }
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.drawBoard();
        if (!this.gameOver) {
            this.drawPiece();
        }
        
        this.updateParticles(deltaTime);
        this.drawParticles();
        
        this.gameLoopId = requestAnimationFrame((t) => this.render(t));
    }
}
