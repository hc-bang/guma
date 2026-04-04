class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 1.0;
    }

    play(freq, type = 'sine', duration = 0.1, volume = 0.3) {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    move() { this.play(300, 'square', 0.05, 0.2); }
    rotate() { this.play(400, 'sine', 0.1, 0.2); }
    drop() { this.play(150, 'square', 0.05, 0.2); }
    shoot() { this.play(800, 'sawtooth', 0.05, 0.1); }
    clear() { 
        this.play(600, 'sine', 0.2, 0.4);
        setTimeout(() => this.play(800, 'sine', 0.2, 0.4), 50);
        setTimeout(() => this.play(1000, 'sine', 0.3, 0.4), 100);
    }
    tick() { this.play(440, 'sine', 0.05, 0.2); }
    go() { this.play(880, 'sine', 0.3, 0.3); }
    gameOver() {
        this.play(200, 'sawtooth', 0.5, 0.5);
        setTimeout(() => this.play(150, 'sawtooth', 0.5, 0.5), 200);
        setTimeout(() => this.play(100, 'sawtooth', 0.8, 0.5), 400);
    }
}

class ParticleSystem {
    constructor() {
        this.canvas = document.getElementById('particle-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.init();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    init() {
        for (let i = 0; i < 50; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 3 + 1,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5,
                color: `hsla(${Math.random() * 360}, 100%, 50%, 0.2)`
            });
        }
        this.animate();
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = this.canvas.width;
            if (p.x > this.canvas.width) p.x = 0;
            if (p.y < 0) p.y = this.canvas.height;
            if (p.y > this.canvas.height) p.y = 0;

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = p.color;
            this.ctx.fill();
        });
        requestAnimationFrame(() => this.animate());
    }
}

class GameManager {
    constructor() {
        this.sound = new SoundManager();
        this.particles = new ParticleSystem();
        this.currentGame = null;
        this.currentGameType = null;
        this.keys = {};
        
        this.initEventListeners();
    }

    initEventListeners() {
        // Menu Select
        document.getElementById('select-tetris').addEventListener('click', () => this.switchTo('tetris'));
        document.getElementById('select-snake').addEventListener('click', () => this.switchTo('snake'));
        
        // Tetris Controls
        document.getElementById('tetris-start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('tetris-restart-btn').addEventListener('click', () => this.restartGame());
        
        // Snake Controls
        document.getElementById('snake-start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('snake-restart-btn').addEventListener('click', () => this.restartGame());

        // Shooter Controls
        document.getElementById('select-shooter').addEventListener('click', () => this.switchTo('shooter'));
        document.getElementById('shooter-start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('shooter-restart-btn').addEventListener('click', () => this.restartGame());

        // Help Modal
        const helpBtns = document.querySelectorAll('.help-btn');
        helpBtns.forEach(btn => btn.addEventListener('click', () => this.showHelp()));
        
        document.querySelector('.modal-close-x').addEventListener('click', () => this.closeHelp());
        document.getElementById('help-close-btn').addEventListener('click', () => this.closeHelp());
        document.getElementById('help-modal').addEventListener('click', (e) => {
            if (e.target.id === 'help-modal') this.closeHelp();
        });

        // Global Back to Menu
        const returnBtns = document.querySelectorAll('.menu-return-btn');
        returnBtns.forEach(btn => btn.addEventListener('click', () => this.showMenu()));
        document.getElementById('home-btn').addEventListener('click', () => this.showMenu());

        // Global Keyboard
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            this.keys[e.keyCode] = true;
            if (e.key === 'Escape') this.closeHelp();
            if (this.currentGame) this.currentGame.handleInput(e);
        });
        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
            this.keys[e.keyCode] = false;
        });
    }

    switchTo(gameType) {
        this.currentGameType = gameType;
        const mainMenu = document.getElementById('main-menu');
        mainMenu.classList.remove('visible');
        mainMenu.classList.add('hidden');
        
        const homeBtn = document.getElementById('home-btn');
        homeBtn.classList.remove('hidden');
        homeBtn.classList.add('visible');

        if (gameType === 'tetris') {
            const tetrisView = document.getElementById('tetris-view');
            tetrisView.classList.remove('hidden');
            tetrisView.classList.add('visible');
            
            const tetrisOverlay = document.getElementById('tetris-start-overlay');
            tetrisOverlay.classList.remove('hidden');
            tetrisOverlay.classList.add('visible');
            this.currentGame = new Tetris('game-canvas', 'next-canvas', this.sound, (score) => {
                document.getElementById('final-score').innerText = score;
                const overOverlay = document.getElementById('tetris-over-overlay');
                overOverlay.classList.remove('hidden');
                overOverlay.classList.add('visible');
            });
        } else if (gameType === 'snake') {
            const snakeView = document.getElementById('snake-view');
            snakeView.classList.remove('hidden');
            snakeView.classList.add('visible');
            
            const snakeOverlay = document.getElementById('snake-start-overlay');
            snakeOverlay.classList.remove('hidden');
            snakeOverlay.classList.add('visible');
            this.currentGame = new Snake('snake-canvas', this.sound, (score) => {
                document.getElementById('snake-final-score').innerText = score;
                const overOverlay = document.getElementById('snake-over-overlay');
                overOverlay.classList.remove('hidden');
                overOverlay.classList.add('visible');
            });
        } else if (gameType === 'shooter') {
            const shooterView = document.getElementById('shooter-view');
            shooterView.classList.remove('hidden');
            shooterView.classList.add('visible');
            
            const shooterOverlay = document.getElementById('shooter-start-overlay');
            shooterOverlay.classList.remove('hidden');
            shooterOverlay.classList.add('visible');
            this.currentGame = new Shooter('shooter-canvas', this.sound, (score) => {
                document.getElementById('shooter-final-score').innerText = score;
                const overOverlay = document.getElementById('shooter-over-overlay');
                overOverlay.classList.remove('hidden');
                overOverlay.classList.add('visible');
            });
        }
    }

    startGame() {
        if (this.currentGame) {
            this.currentGame.start();
            
            const overlays = ['tetris-start-overlay', 'snake-start-overlay', 'shooter-start-overlay'];
            overlays.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.remove('visible');
                    el.classList.add('hidden');
                }
            });
        }
    }

    restartGame() {
        if (this.currentGame) {
            const overlays = ['tetris-over-overlay', 'snake-over-overlay', 'shooter-over-overlay'];
            overlays.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.remove('visible');
                    el.classList.add('hidden');
                }
            });
            
            this.currentGame.restart();
            this.currentGame.start();
        }
    }

    showMenu() {
        if (this.currentGame) {
            this.currentGame.stop();
            this.currentGame = null;
        }

        const mainMenu = document.getElementById('main-menu');
        mainMenu.classList.remove('hidden');
        mainMenu.classList.add('visible');

        const homeBtn = document.getElementById('home-btn');
        homeBtn.classList.remove('visible');
        homeBtn.classList.add('hidden');

        const views = [
            'tetris-view', 'snake-view', 'shooter-view',
            'tetris-start-overlay', 'snake-start-overlay', 'shooter-start-overlay',
            'tetris-over-overlay', 'snake-over-overlay', 'shooter-over-overlay'
        ];
        views.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('visible');
                el.classList.add('hidden');
            }
        });
    }

    showHelp() {
        const modal = document.getElementById('help-modal');
        const content = document.getElementById('help-content');
        let helpHtml = '';

        if (this.currentGameType === 'tetris') {
            helpHtml = `
                <div><span class="key-tag">←</span> <span class="key-tag">→</span> 왼쪽/오른쪽 이동</div>
                <div><span class="key-tag">↑</span> 블록 회전</div>
                <div><span class="key-tag">↓</span> 소프트 드롭 (천천히 하강)</div>
                <div><span class="key-tag">Space</span> 하드 드롭 (즉시 하강)</div>
            `;
        } else if (this.currentGameType === 'snake') {
            helpHtml = `
                <div><span class="key-tag">←</span> <span class="key-tag">↑</span> <span class="key-tag">→</span> <span class="key-tag">↓</span> 방향 전환</div>
                <div style="margin-top:20px; font-size:0.9rem; opacity:0.8;">
                    <p>• 먹이를 먹으면 몸길이가 늘어나고 속도가 빨라집니다.</p>
                    <p>• 벽에 부딪히거나 자신의 몸에 닿지 않도록 주의하세요!</p>
                </div>
            `;
        } else if (this.currentGameType === 'shooter') {
            helpHtml = `
                <div><span class="key-tag">←</span> <span class="key-tag">→</span> 기체 이동</div>
                <div><span class="key-tag">Space</span> 미사일 발사 (연사 가능)</div>
                <div style="margin-top:20px; font-size:0.9rem; opacity:0.8;">
                    <p>• 갤러그 스타일의 대형을 이룬 적들이 공격해옵니다.</p>
                    <p>• 적의 공격을 피하고 모든 적을 섬멸하세요 (3 HP 보유).</p>
                </div>
            `;
        }

        content.innerHTML = helpHtml;
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('visible'), 10);
        
        if (this.currentGame && !this.currentGame.paused) {
            this.wasPaused = false;
            this.currentGame.paused = true;
        } else {
            this.wasPaused = true;
        }
    }

    closeHelp() {
        const modal = document.getElementById('help-modal');
        if (modal.classList.contains('hidden')) return;

        modal.classList.remove('visible');
        setTimeout(() => modal.classList.add('hidden'), 300);
        
        if (this.currentGame && !this.wasPaused) {
            this.currentGame.paused = false;
        }
    }
}

// Start Arcade
window.onload = () => {
    window.gameManager = new GameManager();
};
