/* =============================================================
   loader.js — Loading screen controller
   Tracks asset loading, drives the zombie progress bar canvas,
   and fades out once everything is ready.
============================================================= */

(function () {
    const ASSETS = [
        'custom_zombie.png',
        'zombie_cone.png',
        'sunflower.png',
        'peashooter.png',
        'potato_mine.png'
    ];

    let loaded = 0;
    let progress = 0;        // 0 → 100
    let targetProgress = 0;
    let animFrame;

    const barFill    = document.getElementById('loadBarFill');
    const zombieEl   = document.getElementById('loadZombie');
    const labelEl    = document.getElementById('loadLabel');
    const loadScreen = document.getElementById('loading-screen');
    const gameContainer = document.getElementById('game-container');

    // ─── Canvas for drool / breath particles ───────────────────
    const lc = document.getElementById('loadCanvas');
    const lCtx = lc.getContext('2d');
    const particles = [];

    function resizeLoadCanvas() {
        lc.width  = window.innerWidth;
        lc.height = window.innerHeight;
    }
    resizeLoadCanvas();
    window.addEventListener('resize', resizeLoadCanvas);

    // ─── Particle class (green drool / dust) ───────────────────
    function spawnParticle(x, y) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 3,
            vy: -(Math.random() * 2 + 1),
            size: Math.random() * 6 + 3,
            alpha: 1,
            color: Math.random() > 0.5 ? '#7CFC00' : '#32CD32'
        });
    }

    function tickParticles() {
        lCtx.clearRect(0, 0, lc.width, lc.height);
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08; // gravity
            p.alpha -= 0.025;
            p.size  *= 0.97;
            if (p.alpha <= 0) { particles.splice(i, 1); continue; }
            lCtx.save();
            lCtx.globalAlpha = p.alpha;
            lCtx.fillStyle   = p.color;
            lCtx.shadowColor = p.color;
            lCtx.shadowBlur  = 8;
            lCtx.beginPath();
            lCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            lCtx.fill();
            lCtx.restore();
        }
    }

    // ─── Animate bar and zombie ─────────────────────────────────
    let zombieWalkFrame = 0;
    const LOADING_TEXTS = [
        '僵尸正在集合... ',
        '脑子气息弥漫... ',
        '防线岌岌可危... ',
        '植物正在觉醒... ',
        '花果山战局打响... '
    ];

    function animate() {
        animFrame = requestAnimationFrame(animate);

        // Smoothly chase targetProgress
        progress += (targetProgress - progress) * 0.04;
        const pct = Math.min(progress, 100);

        // Update bar width
        barFill.style.width = pct + '%';

        // Move zombie to sit just at the right edge of the fill
        // The bar track is 70vw wide centred on page
        const trackEl = barFill.parentElement;
        const trackRect = trackEl.getBoundingClientRect();
        const fillPx = trackRect.width * (pct / 100);
        // Place zombie anchored to the fill edge
        zombieEl.style.left = `calc(${pct}% - 30px)`;

        // Walk animation (bounce)
        zombieWalkFrame++;
        const bounce = Math.sin(zombieWalkFrame * 0.25) * 4;
        const tilt   = Math.sin(zombieWalkFrame * 0.2) * 6; // degrees
        zombieEl.style.transform = `translateY(${bounce}px) rotate(${-tilt}deg) scaleX(-1)`;

        // Drool particles from zombie mouth area
        if (zombieWalkFrame % 8 === 0 && pct < 99) {
            const zRect = zombieEl.getBoundingClientRect();
            spawnParticle(zRect.left + zRect.width * 0.3, zRect.top + zRect.height * 0.6);
        }

        tickParticles();

        // Label
        const textIdx = Math.min(Math.floor(pct / 20), LOADING_TEXTS.length - 1);
        labelEl.textContent = LOADING_TEXTS[textIdx] + Math.floor(pct) + '%';

        // Done!
        if (pct >= 99.5) {
            cancelAnimationFrame(animFrame);
            setTimeout(finishLoading, 500);
        }
    }

    // ─── Asset loading ─────────────────────────────────────────
    ASSETS.forEach(src => {
        const img = new Image();
        img.onload  = img.onerror = onAssetDone;
        img.src = src + '?t=' + Date.now();
    });

    function onAssetDone() {
        loaded++;
        targetProgress = (loaded / ASSETS.length) * 100;
    }

    // ─── Minimum visual time (≥ 2 s) then finish ────────────────
    function finishLoading() {
        loadScreen.style.transition = 'opacity 0.8s ease';
        loadScreen.style.opacity    = '0';
        setTimeout(() => {
            loadScreen.style.display = 'none';
            gameContainer.style.display = 'block';
        }, 800);
    }

    // Start the loop
    animate();

    // Guarantee finish even if images load instantly (min 2.5 s)
    setTimeout(() => {
        targetProgress = 100;
    }, 2500);

})();
