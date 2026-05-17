/* =============================================================
   loader.js — Loading screen controller
   Tracks asset loading, drives the zombie chase progress scene,
   and fades out once everything is ready.
============================================================= */

(function () {
    const ASSETS = [
        'assets/loader_zombie.png',
        'assets/loader_runner.png',
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
    const zombieEl      = document.getElementById('loadZombie');
    const runnerEl      = document.getElementById('loadRunner');
    const labelEl       = document.getElementById('loadLabel');
    const loadScreen    = document.getElementById('loading-screen');
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

    // ─── Animate progress and chase scene ───────────────────────
    let zombieWalkFrame = 0;
    const loadingStartedAt = performance.now();
    const MIN_LOAD_MS = 6200;
    const LOADING_TEXTS = [
        '僵尸闻到了脑子... ',
        '小人正在狂奔... ',
        '僵尸越追越近... ',
        '防线即将展开... ',
        '花果山战局打响... '
    ];

    function animate() {
        animFrame = requestAnimationFrame(animate);

        const elapsed = performance.now() - loadingStartedAt;
        const timedProgress = Math.min(100, (elapsed / MIN_LOAD_MS) * 100);
        const visibleTarget = Math.min(targetProgress, timedProgress);

        // Smoothly chase the throttled target so the loading scene has time to play.
        progress += (visibleTarget - progress) * 0.045;
        const pct = Math.min(progress, 100);

        // Update the real progress bar under the zombie's feet.
        barFill.style.width = pct + '%';

        const trackEl = barFill.parentElement;
        const trackRect = trackEl.getBoundingClientRect();
        const zombieWidth = zombieEl.getBoundingClientRect().width || 88;
        const runnerWidth = runnerEl.getBoundingClientRect().width || 44;
        const zombieCenter = trackRect.width * (pct / 100);
        const zombieLeft = Math.max(-zombieWidth * 0.35, Math.min(trackRect.width - zombieWidth * 0.58, zombieCenter - zombieWidth * 0.5));
        const chaseGap = Math.max(24, 84 - pct * 0.46);
        const runnerLeft = Math.max(42, Math.min(trackRect.width - runnerWidth - 8, zombieLeft + zombieWidth * 0.86 + chaseGap));

        // Walk animation (bounce)
        zombieWalkFrame++;
        const bounce = Math.sin(zombieWalkFrame * 0.25) * 4;
        const tilt   = Math.sin(zombieWalkFrame * 0.2) * 6; // degrees
        const runnerBounce = Math.sin(zombieWalkFrame * 0.42) * 5;

        zombieEl.style.left = `${zombieLeft}px`;
        zombieEl.style.transform = `translateY(${bounce}px) rotate(${-tilt}deg)`;
        zombieEl.style.setProperty('--eye-look-x', `${Math.min(7, Math.max(2, (runnerLeft - zombieLeft) * 0.055))}px`);
        zombieEl.style.setProperty('--eye-look-y', `${Math.sin(zombieWalkFrame * 0.16) * 1.4}px`);
        runnerEl.style.left = `${runnerLeft}px`;
        runnerEl.style.transform = `translateY(${runnerBounce}px) rotate(${Math.sin(zombieWalkFrame * 0.2) * 3}deg)`;

        // Drool particles from zombie mouth area
        if (zombieWalkFrame % 8 === 0 && pct < 99) {
            const zRect = zombieEl.getBoundingClientRect();
            spawnParticle(zRect.left + zRect.width * 0.68, zRect.top + zRect.height * 0.46);
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
        img.onload = onAssetDone;
        img.onerror = onAssetDone;
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

    // Guarantee finish even if a browser stalls an image event.
    setTimeout(() => {
        targetProgress = 100;
    }, MIN_LOAD_MS + 1200);

})();
