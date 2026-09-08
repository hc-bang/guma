/* ═══════════════════════════════════════════════════════
   GUMA™ – Roasted Theme Effects
   ═══════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Greeting Typing Context
  const greetings = [
    "지금 구글링하기 딱 좋은 온도네요 🌡️",
    "오늘도 노릇노릇하게 구워볼까요? 🔥",
    "원하는 정보를 바삭하게 검색해 보세요 🍠",
    "타는 냄새 안 나요? 내 검색어가 불타고 있잖아... ✨",
    "GUMA™와 함께 따뜻한 웹서핑을 즐겨보세요 🧄",
    "검색창 예열 중입니다. 잠시만 기다려주세요 ⏳",
    "지식의 오븐이 갓 데워졌습니다 🍞",
    "어떤 지식을 구워드릴까요? 👨‍🍳",
    "검색결과를 맛있게 요리하는 중... 🍳",
    "바삭한 정보, 촉촉한 인사이트! 💡",
    "장작을 넣고 검색을 시작해 보세요 🪵",
    "노릇노릇 구워진 링크를 준비했습니다 🔗",
    "갓 구운 마늘처럼 풍미 깊은 검색 🧄",
    "화력이 좋습니다. 검색을 바로 시작하세요! 🔥",
    "모닥불 피워놓고 느긋하게 웹서핑해요 🏕️",
    "가장 맛있는 검색 결과를 찾아드릴게요 😋",
    "앗 뜨거! 방금 나온 따끈따끈한 웹페이지 ♨️",
    "오늘의 날씨는 '구워지기 맑음' 상태입니다 ☀️",
    "당신의 궁금증이 마법처럼 구워지는 곳 🪄",
    "검색도 하나의 요리랍니다. 불조절 준비 완-료! 🛠️",
    "장인이 한땀한땀 구워낸 검색창입니다 🧑‍🎨",
    "따뜻한 불씨가 당신의 아이디어를 데워줄 거예요 🌟"
  ];

  const greetingEl = document.getElementById('greeting-text');
  if (greetingEl) {
    const text = greetings[Math.floor(Math.random() * greetings.length)];
    let idx = 0;
    greetingEl.textContent = "";

    function typeWord() {
      if (idx < text.length) {
        greetingEl.textContent += text.charAt(idx);
        idx++;
        setTimeout(typeWord, 60 + Math.random() * 40);
      }
    }

    setTimeout(typeWord, 500);
  }

  // 2. Ambient Embers Canvas
  const canvas = document.getElementById('embers-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    class Ember {
      constructor() {
        this.reset();
        this.y = Math.random() * height; // initial random distribution
      }
      reset() {
        this.x = Math.random() * width;
        this.y = height + Math.random() * 100;
        this.size = Math.random() * 2 + 0.5;
        this.speedY = -(Math.random() * 0.8 + 0.2);
        this.speedX = (Math.random() - 0.5) * 1;
        this.life = Math.random() * 0.5 + 0.5;
        this.opacity = Math.random() * 0.5 + 0.2;
      }
      update() {
        this.y += this.speedY;
        this.x += this.speedX;
        this.life -= 0.002;
        if (this.life <= 0 || this.y < 0) this.reset();
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        // Golden/Orange embers color
        const alpha = Math.max(0, this.opacity * this.life);
        ctx.fillStyle = `rgba(255, 140, 0, ${alpha})`;
        ctx.fill();

        // Add minimal glow
        ctx.shadowBlur = Math.random() * 5 + 2;
        ctx.shadowColor = `rgba(255, 140, 0, ${alpha * 0.8})`;
      }
    }

    // 파티클 개수를 늘려 배경 불씨 효과를 좀 더 입체적으로 강화
    for (let i = 0; i < 55; i++) {
      particles.push(new Ember());
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);
      ctx.shadowBlur = 0; // reset shadow before clear
      particles.forEach(p => { p.update(); p.draw(); });
      requestAnimationFrame(animate);
    }

    animate();
  }

  // 3. Auto-Roast Title Effect
  const mainLogo = document.querySelector('.logo');
  if (mainLogo) {
    setInterval(() => {
      mainLogo.classList.add('auto-roast');
      setTimeout(() => {
        mainLogo.classList.remove('auto-roast');
      }, 2500); // 2.5 seconds duration
    }, 12000); // 12 seconds interval
  }
});
