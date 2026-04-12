/* ==================== Game Constants & Elements ==================== */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1000;
canvas.height = 600;

const CELL_SIZE = 100;
const ROWS = 5;
const COLS = 9;
const BOARD_X = 50; // Centered precisely with CELL_SIZE=100
const BOARD_Y = 80; // Optimized spacing

// UI Elements
const sunAmountEl = document.getElementById('sun-amount');
const selectBar = document.getElementById('seed-bar');
const seedPacketsContainer = document.getElementById('seed-packets');
const shovelBtn = document.getElementById('shovel-btn');
const waveInfo = document.getElementById('wave-info');
const waveText = document.getElementById('wave-text');
const waveProgress = document.getElementById('wave-progress-fill');
const gameContainer = document.getElementById('game-container');

// Overlays
const menuOverlay = document.getElementById('menu-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const victoryOverlay = document.getElementById('victory-overlay');
const startBtn = document.getElementById('startBtn');
const retryBtn = document.getElementById('retryBtn');
const playAgainBtn = document.getElementById('playAgainBtn');

/* ==================== Game State ==================== */
let frames = 0;
let gameRunning = false;
let sun = 50;
let wave = 1;
let zombiesSpawned = 0;
let waveTotalZombies = 10;
let zombieSpawnRate = 400;

const mouse = { x: 0, y: 0, clicked: false, currentSeed: null, shovel: false };
const grid = [];
let plants = [];
let zombies = [];
let projectiles = [];
let drops = [];     // Suns
let particles = []; // Particle effects
let lawnmowers = [];

/* ==================== Audio Engine ==================== */
let audioCtx;
let bgmInterval = null;
let bgmStep = 0;

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function startBGM(waveLevel) {
    if (!audioCtx) return;
    if (bgmInterval) clearInterval(bgmInterval);
    
    let notes = [];
    let speed = 500;
    
    if (waveLevel <= 2) { 
        // Relaxed eerie baseline
        notes = [220, 261, 329, 261, 220, 196];
        speed = 600;
    } else if (waveLevel <= 4) { 
        // More tense and fast
        notes = [196, 233, 293, 233, 196, 174];
        speed = 400;
    } else { 
        // Final wave high tension
        notes = [146, 174, 196, 174, 146, 164, 174, 164];
        speed = 250;
    }
    
    bgmStep = 0;
    bgmInterval = setInterval(() => {
        if (!gameRunning) {
            clearInterval(bgmInterval);
            return;
        }
        let freq = notes[bgmStep % notes.length];
        bgmStep++;
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square'; // gives a more retro zombie vibe
        
        const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(freq, now);
        
        // Lowpass filter for muffled background sound so it isn't annoying
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = waveLevel > 3 ? 800 : 400;
        
        // Envelope
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.04, now + 0.05); 
        gain.gain.exponentialRampToValueAtTime(0.001, now + (speed/1000) * 0.9);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + (speed/1000));
        
    }, speed);
}

function stopBGM() {
    if (bgmInterval) {
        clearInterval(bgmInterval);
        bgmInterval = null;
    }
}

const sfx = {
    playTone: (freq, type, duration, vol=0.1) => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    },
    plant: () => sfx.playTone(300, 'sine', 0.1, 0.2), // pop
    sun: () => {
        sfx.playTone(880, 'sine', 0.1, 0.1);
        setTimeout(() => sfx.playTone(1100, 'sine', 0.1, 0.1), 100);
    },
    pew: () => {
        if(!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    },
    hit: () => sfx.playTone(150, 'triangle', 0.05, 0.2), // tuk
    noise: (duration, vol=0.2) => {
        if (!audioCtx) return;
        const bufferSize = audioCtx.sampleRate * Math.max(duration, 0.1);
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        noise.start();
    },
    eat: () => sfx.noise(0.1, 0.1),
    explode: () => sfx.noise(1.5, 0.5),
    death: () => {
        sfx.noise(0.2, 0.2);
        sfx.playTone(100, 'sawtooth', 0.2, 0.2);
    },
    lawnmower: () => {
        if (!audioCtx) return;
        sfx.noise(0.2, 0.05);
        sfx.playTone(60, 'sawtooth', 0.2, 0.05);
    },
    voice: (text) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'zh-CN';
            utterance.rate = 1.2;
            utterance.pitch = 1.1;
            window.speechSynthesis.speak(utterance);
        }
    }
};

/* ==================== Image Assets ==================== */
const spriteNormal = document.createElement('canvas');
const spriteCone = document.createElement('canvas');
const spriteSunflower = document.createElement('canvas');
const spritePeashooter = document.createElement('canvas');
const spritePotato = document.createElement('canvas');

function initSprites() {
    ['custom_zombie.png', 'zombie_cone.png', 'sunflower.png', 'peashooter.png', 'potato_mine.png'].forEach((src, idx) => {
        const img = new Image();
        img.src = src + '?t=' + Date.now(); // Cache bust
        img.onload = () => {
            let cvs;
            if (idx === 0) cvs = spriteNormal;
            else if (idx === 1) cvs = spriteCone;
            else if (idx === 2) cvs = spriteSunflower;
            else if (idx === 3) cvs = spritePeashooter;
            else if (idx === 4) cvs = spritePotato;
            cvs.width = img.naturalWidth;
            cvs.height = idx === 0 ? img.naturalHeight * 0.9 : img.naturalHeight; // Crop bottom 10% to remove site URL footers
            const ctx = cvs.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                let r = data[i], g = data[i+1], b = data[i+2];
                // Remove magenta background (gen images)
                if (r > 150 && g < 100 && b > 150 && idx !== 0) {
                    data[i+3] = 0;
                } else if (r > 120 && g < 120 && b > 120 && r > g && b > g && idx !== 0) {
                    // Antialiasing feathering
                    data[i+3] = Math.max(0, data[i+3] - 180);
                } else if (idx === 0) {
                    // Fake checkerboard & White Background Removal
                    let brightness = (r+g+b)/3;
                    let px = (i / 4) % cvs.width;
                    let py = Math.floor((i / 4) / cvs.width);
                    let nx = px / cvs.width;
                    let ny = py / cvs.height;
                    
                    let distFromCenter = Math.sqrt((nx - 0.5)**2 + (ny - 0.5)**2);
                    let colorDiff = Math.max(Math.abs(r-g), Math.abs(r-b), Math.abs(g-b));
                    
                    // The checkerboard usually consists of pure white (255) and light grey (~190-210)
                    // They both have very low color variation since they are grayscale.
                    
                    if (distFromCenter > 0.4 && brightness > 140 && colorDiff < 30) {
                        // Aggressively wipe outer checkerboards
                        data[i+3] = 0;
                    } else {
                        // Inner circle
                        if (brightness >= 240) {
                            data[i+3] = 0; // Pure white squares
                        } else if (brightness >= 180 && colorDiff <= 20) {
                            // Light grey squares (part of fake transparency)
                            data[i+3] = 0; 
                        } else if (brightness >= 190 && colorDiff < 40) {
                            // Feathering edges
                            let fade = Math.max(0, 255 - (brightness - 190) * 4);
                            data[i+3] = Math.min(data[i+3], fade);
                        }
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
        };
    });
}
initSprites();

/* ==================== Plant Types Configuration ==================== */
const plantTypes = [
    { name: '向日葵', cost: 50, emoji: '🌻', cooldown: 150, type: 'Sunflower', hp: 500, color: '#FFD700', bgColor: '#3CB371', unlockWave: 1 },
    { name: '豌豆射手', cost: 100, emoji: '🌱', cooldown: 300, type: 'Peashooter', hp: 500, color: '#32CD32', bgColor: '#8FBC8F', unlockWave: 1 },
    { name: '土豆地雷', cost: 25, emoji: '🥔', cooldown: 600, type: 'PotatoMine', hp: 500, color: '#D2B48C', bgColor: '#8B4513', unlockWave: 1 },
    { name: '坚果墙', cost: 50, emoji: '🌰', cooldown: 1200, type: 'Wallnut', hp: 6000, color: '#8B4513', bgColor: '#D2691E', unlockWave: 2 },
    { name: '寒冰射手', cost: 175, emoji: '❄️', cooldown: 450, type: 'SnowPea', hp: 500, color: '#00BFFF', bgColor: '#87CEFA', unlockWave: 3 },
    { name: '火爆辣椒', cost: 125, emoji: '🌶️', cooldown: 2000, type: 'Jalapeno', hp: 500, color: '#FF4500', bgColor: '#FF6347', unlockWave: 4 },
    { name: '樱桃炸弹', cost: 150, emoji: '🍒', cooldown: 2400, type: 'Cherry', hp: 500, color: '#DC143C', bgColor: '#FFB6C1', unlockWave: 5 }
];

const seedCards = [];

/* ==================== Classes ==================== */
class Lawnmower {
    constructor(y) {
        this.x = BOARD_X - 60; // Start slightly left of the board
        this.y = y;
        this.width = 80;
        this.height = 80;
        this.active = false;
        this.speed = 0;
        this.dead = false;
    }
    
    update() {
        if (this.active) {
            this.x += this.speed;
            this.speed += 0.5; // Accelerate
            
            // Engine sound occasionally
            if (frames % 10 === 0) sfx.lawnmower();
            
            // Particles
            createParticles(this.x + 20, this.y + this.height - 20, '#7CFC00', 3, 4);
            
            // Hit zombies
            zombies.forEach(z => {
                if (Math.abs(z.y - this.y) < 10 && z.x < this.x + this.width && z.x + z.width > this.x && z.health > 0) {
                    z.health -= 5000; // Instant crush
                }
            });
            
            // Die when off screen
            if (this.x > canvas.width) {
                this.dead = true;
            }
        }
    }
    
    draw() {
        ctx.save();
        ctx.translate(this.x + this.width/2, this.y + this.height/2);
        
        let tilt = this.active ? Math.sin(frames * 0.5) * 0.1 : 0;
        ctx.rotate(tilt);
        
        // Body (Red)
        ctx.fillStyle = '#DC143C';
        ctx.beginPath();
        // roundRect fallback just in case
        if(ctx.roundRect) {
            ctx.roundRect(-40, -10, 60, 30, 10);
        } else {
            ctx.fillRect(-40, -10, 60, 30);
        }
        ctx.fill();
        
        // Engine block (Silver)
        ctx.fillStyle = '#C0C0C0';
        ctx.fillRect(-20, -30, 30, 20);
        
        // Handlebars
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-10, -20);
        ctx.lineTo(-50, -50);
        ctx.stroke();
        
        // Wheels
        let wheelSpin = this.active ? frames * 0.5 : 0;
        ctx.save();
        ctx.translate(-30, 20);
        ctx.rotate(wheelSpin);
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        
        ctx.save();
        ctx.translate(15, 20);
        ctx.rotate(wheelSpin);
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        
        ctx.restore();
    }
}

class Cell {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = CELL_SIZE;
        this.height = CELL_SIZE;
        this.plant = null;
    }
    draw() {
        if (mouse.x >= this.x && mouse.x < this.x + this.width &&
            mouse.y >= this.y && mouse.y < this.y + this.height) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            
            if (mouse.currentSeed && !this.plant && canvas.style.cursor !== 'not-allowed') {
                ctx.globalAlpha = 0.5;
                ctx.font = '50px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(mouse.currentSeed.emoji, this.x + CELL_SIZE/2, this.y + CELL_SIZE/2);
                ctx.globalAlpha = 1.0;
            }
        }
    }
}

class Plant {
    constructor(x, y, config) {
        this.x = x;
        this.y = y;
        this.width = CELL_SIZE;
        this.height = CELL_SIZE;
        this.type = config.type;
        this.health = config.hp;
        this.maxHealth = config.hp;
        this.emoji = config.emoji;
        this.timer = 0;
        this.frameX = 0; // for basic animation
        
        // Instant use specific
        if (this.type === 'Cherry' || this.type === 'Jalapeno') {
            this.explodeTimer = 60;
        }
    }

    draw() {
        ctx.save();
        
        // Base shadow to separate from background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(this.x + CELL_SIZE/2, this.y + CELL_SIZE - 20, CELL_SIZE * 0.35, CELL_SIZE * 0.15, 0, 0, Math.PI*2);
        ctx.fill();

        // Glow effect
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 20;
        
        let drawY = this.y + CELL_SIZE/2;
        let drawX = this.x + CELL_SIZE/2;
        const pulse = Math.sin(frames * 0.05) * 5;

        // Visual distinction per type
        if (this.type === 'Sunflower' && spriteSunflower.width > 0) {
            ctx.drawImage(spriteSunflower, this.x + 5, this.y + CELL_SIZE - 90, 85, 85);
        } else if (this.type === 'Peashooter' && spritePeashooter.width > 0) {
            ctx.drawImage(spritePeashooter, this.x + 5, this.y + CELL_SIZE - 90, 85, 85);
        } else if (this.type === 'SnowPea' && spritePeashooter.width > 0) {
            ctx.filter = 'drop-shadow(0 0 5px #00BFFF) hue-rotate(180deg) saturate(2)'; 
            ctx.drawImage(spritePeashooter, this.x + 5, this.y + CELL_SIZE - 90, 85, 85);
            ctx.filter = 'none';
        } else if (this.type === 'PotatoMine' && spritePotato.width > 0) {
            ctx.drawImage(spritePotato, this.x + 10, this.y + CELL_SIZE - 80, 80, 80);
        } else {
            // Emoticon Fallback
            ctx.font = '75px Arial'; // Bounding cell fit
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (this.type === 'Cherry' || this.type === 'Jalapeno') {
                 // Shake before exploding
                 drawX += (Math.random() - 0.5) * 10;
                 drawY += (Math.random() - 0.5) * 10;
                 
                 // Expand
                 const scale = 1 + (60 - this.explodeTimer) * 0.01;
                 ctx.translate(drawX, drawY);
                 ctx.scale(scale, scale);
                 ctx.translate(-drawX, -drawY);
                 
                 // Red overlay
                 ctx.fillStyle = `rgba(255, 0, 0, ${(60 - this.explodeTimer) / 60})`;
                 ctx.beginPath();
                 ctx.arc(drawX, drawY, CELL_SIZE/2, 0, Math.PI*2);
                 ctx.fill();
            } else {
                drawY -= pulse;
            }
            ctx.fillText(this.emoji, drawX, drawY);
        }
        
        ctx.restore();
        
        // HP Bar for PotatoMine
        if (this.type === 'PotatoMine' && this.health < this.maxHealth) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(this.x + 10, this.y + CELL_SIZE - 10, CELL_SIZE - 20, 5);
            ctx.fillStyle = this.health > this.maxHealth * 0.5 ? 'lime' : 'red';
            ctx.fillRect(this.x + 10, this.y + CELL_SIZE - 10, (CELL_SIZE - 20) * (this.health / this.maxHealth), 5);
        }
    }

    update() {
        if (this.type === 'Sunflower') {
            this.timer++;
            if (this.timer % 360 === 0) { // Produce sun much faster (every 6 seconds)
                drops.push(new Sun(this.x + CELL_SIZE/2, this.y, this.x + CELL_SIZE/2 + (Math.random()-0.5)*40, this.y + CELL_SIZE - 20));
            }
        } 
        else if (this.type === 'Peashooter' || this.type === 'SnowPea') {
            this.timer++;
            if (this.timer % 80 === 0) { // Firing very fast (approx every 1.3 seconds)
                // Check if zombie in lane
                let zombieInRow = false;
                for (let i = 0; i < zombies.length; i++) {
                    if (zombies[i].y === this.y && zombies[i].x > this.x && zombies[i].health > 0) {
                        zombieInRow = true;
                        break;
                    }
                }
                if (zombieInRow) {
                    sfx.pew();
                    let pType = this.type === 'SnowPea' ? 'frozen' : 'normal';
                    projectiles.push(new Projectile(this.x + CELL_SIZE - 10, this.y + CELL_SIZE/2 - 10, pType));
                    
                    let pColor = this.type === 'SnowPea' ? '#00BFFF' : '#90EE90';
                    createParticles(this.x + CELL_SIZE, this.y + CELL_SIZE/2, pColor, 3, 2);
                }
            }
        }
        else if (this.type === 'Cherry' || this.type === 'Jalapeno') {
            this.explodeTimer--;
            if (this.explodeTimer <= 0) {
                sfx.explode();
                if (this.type === 'Cherry') this.explode();
                else this.explodeJalapeno();
                this.health = 0; // Trigger removal
            }
        }
    }
    
    explode() {
        createParticles(this.x + CELL_SIZE/2, this.y + CELL_SIZE/2, '#FF4500', 50, 8);
        createParticles(this.x + CELL_SIZE/2, this.y + CELL_SIZE/2, '#FFFF00', 30, 10);
        
        // Kill zombies in 3x3 area
        const blastRadius = CELL_SIZE * 1.6; // Expands safely to encompass 3x3 tiles
        const centerX = this.x + CELL_SIZE/2;
        const centerY = this.y + CELL_SIZE/2;
        
        zombies.forEach(zombie => {
            const zCenterX = zombie.x + zombie.width/2;
            const zCenterY = zombie.y + zombie.height/2;
            const dist = Math.hypot(centerX - zCenterX, centerY - zCenterY);
            if (dist < blastRadius) {
                zombie.health -= 1500; // Massive damage
                zombie.burned = true;
            }
        });
        
        // Shake screen
        gameContainer.style.animation = 'none';
        setTimeout(() => gameContainer.style.animation = 'shake 0.5s', 10);
    }
    
    explodeJalapeno() {
        createParticles(this.x + CELL_SIZE/2, this.y + CELL_SIZE/2, '#FF4500', 30, 8);
        
        // Kill all zombies in the same row
        zombies.forEach(zombie => {
            if (zombie.y === this.y) {
                zombie.health -= 2500;
                zombie.burned = true;
            }
        });
        
        // Draw fire particles across the row
        for(let x = BOARD_X; x < BOARD_X + COLS * CELL_SIZE; x += 40) {
             createParticles(x, this.y + CELL_SIZE/2, '#FF4500', 5, 8);
             createParticles(x, this.y + CELL_SIZE/2, '#FFFF00', 3, 10);
        }
        
        gameContainer.style.animation = 'none';
        setTimeout(() => gameContainer.style.animation = 'shake 0.5s', 10);
    }
}

class Zombie {
    constructor(y, type = 'normal') {
        this.x = canvas.width;
        this.y = y; // Keep exact grid Y for collision logic
        this.width = 65;
        this.height = 95;
        this.speed = Math.random() * 0.12 + 0.12; // Slowed down significantly! 0.12 ~ 0.24
        this.movement = this.speed;
        this.type = type;
        this.burned = false;
        this.frostTimer = 0;
        
        if (type === 'cone') {
            this.health = 180; 
        } else if (type === 'bucket') {
            this.health = 300; // Big nerf to bucketheads
            this.speed = Math.max(0.08, this.speed - 0.05);
        } else if (type === 'flag') {
            this.health = 100;
            this.speed += 0.2; // Runner zombie!
        } else {
            this.health = 80; 
        }
        this.maxHealth = this.health;
        this.movement = this.speed;
    }

    draw() {
        ctx.save();
        
        let size = 140; // The generated images are squares
        let drawX = this.x - (size - this.width)/2 - 15;
        let drawY = this.y - (size - this.height) - 20;
        
        let rot = 0;
        if (this.movement > 0) {
            // Walking bounce animation
            drawY += Math.sin(frames * 0.08) * 4;
        } else {
            // Eating animation
            let eatCycle = Math.abs(Math.sin(frames * 0.15));
            drawX -= eatCycle * 15;  // Lunge forward (left)
            rot = -eatCycle * 0.2;   // Lean forward to bite
        }
        
        if (this.burned) {
            ctx.filter = 'brightness(0) sepia(1) hue-rotate(-50deg) saturate(5)';
        } else if (this.health < this.maxHealth && frames % 10 < 5) {
             // flash red when hit
            ctx.filter = 'brightness(1.5) sepia(1) hue-rotate(-50deg) saturate(5)';
        } else if (this.frostTimer > 0) {
             // blue frozen effect
            ctx.filter = 'saturate(0.5) sepia(1) hue-rotate(180deg) brightness(1.2)';
        }

        const sprite = ((this.type === 'cone' || this.type === 'bucket') && this.health > 80) ? spriteCone : spriteNormal;
        
        if (sprite.width > 0) {
            let anchorX = drawX + size / 2;
            let anchorY = drawY + size * 0.8; // Pivot around its knees/feet
            
            ctx.translate(anchorX, anchorY);
            ctx.rotate(rot);
            
            if (this.movement === 0) {
                // Highly visible frantic eating motion!
                let chew = Math.sin(frames * 0.6); // -1 to 1 fast oscillation
                rot += chew * 0.15; // Nodding / ripping back and forth
                drawX += chew * 12; // Body slamming back and forth
                drawY += Math.abs(chew) * 8; // Slapping downwards into the plant
            }
            
            ctx.drawImage(sprite, drawX - anchorX, drawY - anchorY, size, size);
            
            // Render custom components
            if (this.type === 'bucket' && this.health > 80) {
                ctx.fillStyle = '#C0C0C0'; // Silver metallic
                ctx.beginPath();
                ctx.moveTo(-15, -size + 40); // Top left
                ctx.lineTo(20, -size + 40);  // Top right
                ctx.lineTo(25, -size + 75); // Bottom right
                ctx.lineTo(-20, -size + 75); // Bottom left
                ctx.fill();
                
                // Red stripe
                ctx.fillStyle = '#8B0000';
                ctx.fillRect(-18, -size + 60, 40, 6);
                
                // Bucket rim
                ctx.strokeStyle = '#696969';
                ctx.lineWidth = 2;
                ctx.stroke();
            } else if (this.type === 'flag' && this.health > 0) {
                // Draw Flagpole
                ctx.strokeStyle = '#8B4513';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(-10, -30);
                ctx.lineTo(15, -size - 30);
                ctx.stroke();
                
                // Red Flag
                ctx.fillStyle = '#DC143C';
                ctx.fillRect(15, -size - 30, 45, 30);
                
                ctx.fillStyle = 'yellow';
                ctx.font = '20px Arial';
                ctx.fillText('🧠', 37, -size - 15);
            }
            
        } else {
            // Fallback while loading
            ctx.fillStyle = '#556B2F';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }

        ctx.restore();
    }

    update() {
        let currentSpeed = this.movement;
        if (this.frostTimer > 0) {
            this.frostTimer--;
            currentSpeed *= 0.5; // Halve walking speed
        }
        this.x -= currentSpeed;
    }
}

class Projectile {
    constructor(x, y, type = 'normal') {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = 20;
        this.height = 20;
        this.power = 20;
        this.speed = 5;
    }
    
    update() {
        this.x += this.speed;
    }
    
    draw() {
        ctx.save();
        if (this.type === 'frozen') {
            ctx.shadowColor = '#00FFFF';
            ctx.shadowBlur = 15;
            ctx.fillStyle = '#00BFFF'; 
            ctx.strokeStyle = '#4682B4';
        } else {
            ctx.shadowColor = '#00FF00';
            ctx.shadowBlur = 15;
            ctx.fillStyle = '#7FFF00'; 
            ctx.strokeStyle = '#228B22';
        }
        
        ctx.beginPath();
        ctx.arc(this.x + this.width/2, this.y + this.height/2, this.width/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Small highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(this.x + this.width/2 - 4, this.y + this.height/2 - 4, this.width/4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class Sun {
    constructor(startX, startY, targetX, targetY) {
        this.x = startX;
        this.y = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.radius = 25;
        this.value = 25;
        this.collected = false;
        this.isSkySun = startY < 0;
        
        if (this.isSkySun) {
            this.speed = 1;
        } else {
            // Arc logic for sunflower
            this.vx = (targetX - startX) / 30;
            this.vy = -5; // Jump up slightly
        }
        
        this.life = 0;
        this.maxLife = 600; // Disappears after ~10 seconds
    }
    
    update() {
        if (!this.collected) {
            if (this.isSkySun) {
                if (this.y < this.targetY) {
                    this.y += this.speed;
                }
            } else {
                if (this.y < this.targetY) {
                    this.x += this.vx;
                    this.y += this.vy;
                    this.vy += 0.2; // Gravity
                }
            }
            this.life++;
        } else {
            // Move toward sun counter
            const counterRect = sunAmountEl.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            // Approximation of top-left target
            const tx = 50; 
            const ty = 20;
            
            this.x += (tx - this.x) * 0.1;
            this.y += (ty - this.y) * 0.1;
            
            if (Math.abs(this.x - tx) < 10 && Math.abs(this.y - ty) < 10) {
                sun += this.value;
                updateSunDisplay();
                this.life = this.maxLife; // Trigger removal
            }
        }
    }
    
    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - (this.life / this.maxLife));
        
        // Rotation
        ctx.translate(this.x, this.y);
        ctx.rotate(frames * 0.02);
        
        // Sun rays
        ctx.fillStyle = '#FFA500';
        for (let i = 0; i < 8; i++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(-5, -this.radius*1.2);
            ctx.lineTo(5, -this.radius*1.2);
            ctx.lineTo(0, -this.radius*1.5);
            ctx.fill();
        }
        
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI*2);
        ctx.fillStyle = '#FFD700';
        ctx.fill();
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, color, size, velocity) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * size + 2;
        this.vx = (Math.random() - 0.5) * velocity;
        this.vy = (Math.random() - 0.5) * velocity;
        this.life = 1;
        this.decay = Math.random() * 0.05 + 0.02;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        this.size *= 0.95;
    }
    draw() {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

/* ==================== Utilities ==================== */
function createParticles(x, y, color, amount, size = 5, velocity = 5) {
    for (let i = 0; i < amount; i++) {
        particles.push(new Particle(x, y, color, size, velocity));
    }
}

function updateSunDisplay() {
    sunAmountEl.innerText = sun;
    sunAmountEl.parentElement.style.animation = 'none';
    sunAmountEl.parentElement.offsetHeight; // trigger reflow
    sunAmountEl.parentElement.style.animation = 'pulse 0.3s ease';
    updateSeedCards();
}

function buildGrid() {
    grid.length = 0;
    for (let y = BOARD_Y; y < BOARD_Y + ROWS * CELL_SIZE; y += CELL_SIZE) {
        for (let x = BOARD_X; x < BOARD_X + COLS * CELL_SIZE; x += CELL_SIZE) {
            grid.push(new Cell(x, y));
        }
    }
}

function drawBackground() {
    // Grass
    ctx.fillStyle = '#228B22'; // Forest Green base
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Sky/House area
    ctx.fillStyle = '#87CEEB'; // Sky blue
    ctx.fillRect(0, 0, canvas.width, BOARD_Y - 20);
    
    ctx.fillStyle = '#8B4513'; // Fence/Border
    ctx.fillRect(0, BOARD_Y - 20, canvas.width, 20);
    
    // Grid pattern with tile styling
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
             if ((x + y) % 2 === 0) {
                 ctx.fillStyle = '#3CB371'; // Lighter green
             } else {
                 ctx.fillStyle = '#2E8B57'; // Darker green
             }
             let cx = BOARD_X + x * CELL_SIZE;
             let cy = BOARD_Y + y * CELL_SIZE;
             ctx.fillRect(cx + 2, cy + 2, CELL_SIZE - 4, CELL_SIZE - 4);
             ctx.strokeRect(cx + 2, cy + 2, CELL_SIZE - 4, CELL_SIZE - 4);
        }
    }
    
    // Top border of grid
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(BOARD_X, BOARD_Y, COLS * CELL_SIZE, 5);
}

/* ==================== UI Setup ==================== */
function createUI() {
    seedPacketsContainer.innerHTML = '';
    seedCards.length = 0; // Fix duplicate state
    
    plantTypes.forEach((plant, index) => {
        if (plant.unlockWave > wave) return; // Keep hidden until reached
        
        const card = document.createElement('div');
        card.className = 'seed-packet';
        card.innerHTML = `
            <div class="seed-emoji">${plant.emoji}</div>
            <div class="seed-cost">${plant.cost}</div>
            <div class="cooldown-overlay" id="cd-${index}"></div>
        `;
        
        card.addEventListener('click', () => {
            if (card.classList.contains('disabled') || card.classList.contains('cooling')) return;
            
            // Deselect others
            document.querySelectorAll('.seed-packet').forEach(c => c.classList.remove('selected'));
            shovelBtn.classList.remove('active');
            mouse.shovel = false;
            
            if (mouse.currentSeed === plant) {
                mouse.currentSeed = null; // Toggle off
                canvas.style.cursor = 'default';
            } else {
                card.classList.add('selected');
                mouse.currentSeed = plant;
                const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" style="font-size:30px;"><text y="30">${plant.emoji}</text></svg>`;
                canvas.style.cursor = `url('data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}') 20 20, auto`;
            }
        });
        
        seedPacketsContainer.appendChild(card);
        
        seedCards.push({
            element: card,
            overlay: document.getElementById(`cd-${index}`),
            config: plant,
            cooldownTimer: 0,
            maxCooldown: plant.cooldown
        });
    });
    
    shovelBtn.addEventListener('click', () => {
        document.querySelectorAll('.seed-packet').forEach(c => c.classList.remove('selected'));
        mouse.currentSeed = null;
        
        if (mouse.shovel) {
            mouse.shovel = false;
            shovelBtn.classList.remove('active');
            canvas.style.cursor = 'default';
        } else {
            mouse.shovel = true;
            shovelBtn.classList.add('active');
            const shovelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" style="font-size:30px;"><text y="30">🔧</text></svg>`;
            canvas.style.cursor = `url('data:image/svg+xml;utf8,${encodeURIComponent(shovelSvg)}') 20 20, auto`;
        }
    });
}

function updateSeedCards() {
    seedCards.forEach(card => {
        if (sun < card.config.cost) {
            card.element.classList.add('disabled');
        } else {
            card.element.classList.remove('disabled');
        }
        
        if (card.cooldownTimer > 0) {
            card.element.classList.add('cooling');
            card.overlay.style.height = `${(card.cooldownTimer / card.maxCooldown) * 100}%`;
        } else {
            card.element.classList.remove('cooling');
            card.overlay.style.height = '0%';
        }
    });
}

function updateWaveUI() {
    waveText.innerText = `第 ${wave} 波`;
    const progress = Math.min(100, (zombiesSpawned / waveTotalZombies) * 100);
    waveProgress.style.width = `${progress}%`;
}

function showWaveBanner() {
    const banner = document.createElement('div');
    banner.className = 'wave-banner';
    banner.innerText = `一大波僵尸正在接近！ (第 ${wave} 波)`;
    gameContainer.appendChild(banner);
    setTimeout(() => {
        if (banner.parentNode) {
            banner.parentNode.removeChild(banner);
        }
    }, 2000);
}

/* ==================== Input Handling ==================== */
canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouse.x = (e.clientX - rect.left) * scaleX;
    mouse.y = (e.clientY - rect.top) * scaleY;
});

canvas.addEventListener('mouseleave', () => {
    mouse.x = undefined;
    mouse.y = undefined;
});

canvas.addEventListener('click', () => {
    if (!gameRunning) return;
    
    // Check sun collection first
    for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        const dist = Math.hypot(mouse.x - drop.x, mouse.y - drop.y);
        if (dist < drop.radius * 2 && !drop.collected) {
            drop.collected = true;
            sfx.sun();
            createParticles(drop.x, drop.y, '#FFD700', 10, 3);
            return; // Exit click, prefer collecting sun
        }
    }

    // Grid interaction
    const gridX = mouse.x - (mouse.x - BOARD_X) % CELL_SIZE;
    const gridY = mouse.y - (mouse.y - BOARD_Y) % CELL_SIZE;

    if (gridX < BOARD_X || gridX >= BOARD_X + COLS * CELL_SIZE || 
        gridY < BOARD_Y || gridY >= BOARD_Y + ROWS * CELL_SIZE) {
        return; // Click outside grid
    }

    // Find the cell
    let cellObj = null;
    for (let i = 0; i < grid.length; i++) {
        if (grid[i].x === gridX && grid[i].y === gridY) {
            cellObj = grid[i];
            break;
        }
    }

    if (!cellObj) return;

    if (mouse.shovel && cellObj.plant) {
        // Remove plant
        createParticles(cellObj.plant.x + CELL_SIZE/2, cellObj.plant.y + CELL_SIZE/2, '#8B4513', 15);
        
        plants = plants.filter(p => p !== cellObj.plant);
        cellObj.plant = null;
        
        // Reset shovel
        mouse.shovel = false;
        shovelBtn.classList.remove('active');
        canvas.style.cursor = 'default';
        return;
    }

    if (mouse.currentSeed && !cellObj.plant) {
        const card = seedCards.find(c => c.config === mouse.currentSeed);
        
        if (card && sun >= mouse.currentSeed.cost && card.cooldownTimer === 0) {
            // Plant!
            sfx.plant();
            sun -= mouse.currentSeed.cost;
            const newPlant = new Plant(gridX, gridY, mouse.currentSeed);
            plants.push(newPlant);
            cellObj.plant = newPlant;
            
            // Set cooldown
            card.cooldownTimer = card.maxCooldown;
            
            createParticles(gridX + CELL_SIZE/2, gridY + CELL_SIZE/2, mouse.currentSeed.bgColor, 10);
            updateSunDisplay();
            
            // Reset selection
            mouse.currentSeed = null;
            document.querySelectorAll('.seed-packet').forEach(c => c.classList.remove('selected'));
            canvas.style.cursor = 'default';
        }
    }
});

/* ==================== Game Logic Loops ==================== */
function handlePlants() {
    for (let i = 0; i < plants.length; i++) {
        plants[i].update();
        plants[i].draw();
        
        // Check plant death
        if (plants[i].health <= 0) {
            // Find in grid and remove reference
            const cell = grid.find(c => c.x === plants[i].x && c.y === plants[i].y);
            if (cell) cell.plant = null;
            
            createParticles(plants[i].x + CELL_SIZE/2, plants[i].y + CELL_SIZE/2, '#7CFC00', 15);
            plants.splice(i, 1);
            i--;
        }
    }
}

function handleZombies() {
    for (let i = 0; i < zombies.length; i++) {
        zombies[i].update();
        zombies[i].draw();

        // Check if zombie reached the house
        if (zombies[i].x < BOARD_X - 40) {
            let rowY = zombies[i].y;
            let mowersInRow = lawnmowers.filter(m => m.y === rowY && !m.dead);
            
            if (mowersInRow.length > 0 && !mowersInRow[0].active) {
                mowersInRow[0].active = true;
                mowersInRow[0].speed = 2; // Trigger lawnmower!
            } else if (mowersInRow.length === 0 || mowersInRow[0].x > zombies[i].x + 20) {
                endGame(false);
                return;
            }
        }

        // Damage detection: Plant collisions
        let blocked = false;
        for (let j = 0; j < plants.length; j++) {
            if (zombies[i].y === plants[j].y && 
                zombies[i].x <= plants[j].x + CELL_SIZE && 
                zombies[i].x >= plants[j].x - 10) {
                
                if (plants[j].type === 'PotatoMine') {
                    // Explode immediately on contact
                    sfx.explode();
                    createParticles(plants[j].x + CELL_SIZE/2, plants[j].y + CELL_SIZE/2, '#D2B48C', 40, 5);
                    zombies[i].health -= 2500; // instant kill
                    plants[j].health = 0; // Destroy itself
                } else {
                    zombies[i].movement = 0; // Stop moving
                    plants[j].health -= 1; // Munch
                    blocked = true;
                    // Extremely loud and visible eating particles
                    if (frames % 4 === 0) {
                        sfx.eat();
                        // Splatter plant colors everywhere
                        createParticles(plants[j].x + CELL_SIZE/2, plants[j].y + CELL_SIZE/2, plants[j].color, 8, 5, 8);
                        // Zombie saliva/bite debris flying off
                        createParticles(plants[j].x + CELL_SIZE/2, plants[j].y + CELL_SIZE/2 - 20, '#FFF', 4, 3, 6); 
                    }
                }
            }
        }
        
        // Resume moving if no plant blocking
        if (!blocked && zombies[i].health > 0) zombies[i].movement = zombies[i].speed;

        // Check death
        if (zombies[i].health <= 0) {
            sfx.death();
            createParticles(zombies[i].x + 40, zombies[i].y + 40, '#8B008B', 20); // Purple blood
            zombies.splice(i, 1);
            i--;
            
            // Check win condition
            if (zombiesSpawned >= waveTotalZombies && zombies.length === 0) {
                wave++;
                if (wave > 5) { // 5 waves to win
                    endGame(true); // Won!
                } else {
                    startWave();
                }
            }
        }
    }

    // Spawn logic
    if (frames % zombieSpawnRate === 0 && zombiesSpawned < waveTotalZombies) {
        let row = Math.floor(Math.random() * ROWS);
        let y = BOARD_Y + (row * CELL_SIZE);
        
        let type = 'normal';
        let r = Math.random();
        
        if (wave > 1) {
             if (r < 0.2) type = 'cone';
        }
        if (wave > 2) {
             if (r < 0.3) type = 'cone';
             else if (r < 0.4) type = 'bucket';
        }
        if (wave > 3) {
             if (r < 0.3) type = 'cone';
             else if (r < 0.55) type = 'bucket';
        }
        if (wave > 4) {
             if (r < 0.2) type = 'cone';
             else if (r < 0.6) type = 'bucket';
        }
        
        // Flag zombies at specific thresholds
        if (zombiesSpawned === 0 || (wave > 1 && zombiesSpawned === Math.floor(waveTotalZombies / 2))) {
            type = 'flag';
        }
        
        zombies.push(new Zombie(y, type));
        zombiesSpawned++;
        updateWaveUI();
    }
}

function handleProjectiles() {
    for (let i = 0; i < projectiles.length; i++) {
        projectiles[i].update();
        projectiles[i].draw();

        let hit = false;
        for (let j = 0; j < zombies.length; j++) {
            if (projectiles[i].y > zombies[j].y && projectiles[i].y < zombies[j].y + CELL_SIZE &&
                projectiles[i].x > zombies[j].x && projectiles[i].x < zombies[j].x + zombies[j].width) {
                
                zombies[j].health -= projectiles[i].power;
                sfx.hit();
                if (projectiles[i].type === 'frozen') {
                    zombies[j].frostTimer = 180; // 3 seconds freeze
                    createParticles(projectiles[i].x, projectiles[i].y, '#00FFFF', 5);
                } else {
                    createParticles(projectiles[i].x, projectiles[i].y, '#90EE90', 5);
                }
                hit = true;
                break;
            }
        }

        if (hit || projectiles[i].x > canvas.width) {
            projectiles.splice(i, 1);
            i--;
        }
    }
}

function handleDrops() {
    // Sky sun spawn significantly faster
    if (frames % 300 === 0) {
        const x = BOARD_X + Math.random() * (COLS * CELL_SIZE);
        const targetY = BOARD_Y + Math.random() * (ROWS * CELL_SIZE - 50);
        drops.push(new Sun(x, -50, x, targetY));
    }
    
    for (let i = 0; i < drops.length; i++) {
        drops[i].update();
        drops[i].draw();
        
        if (drops[i].life >= drops[i].maxLife) {
            drops.splice(i, 1);
            i--;
        }
    }
}

function handleParticles() {
    for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
        
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
            i--;
        }
    }
}

function updateCooldowns() {
    if (frames % 6 === 0) { // Update approx 10 times a sec
        seedCards.forEach(card => {
            if (card.cooldownTimer > 0) {
                card.cooldownTimer--;
                if (card.cooldownTimer === 0) {
                    updateSeedCards();
                } else if (card.cooldownTimer % 30 === 0) {
                     updateSeedCards(); // update height periodically
                }
            }
        });
    }
}

function handleLawnmowers() {
    for (let i = 0; i < lawnmowers.length; i++) {
        lawnmowers[i].update();
        lawnmowers[i].draw();
        
        if (lawnmowers[i].dead) {
            lawnmowers.splice(i, 1);
            i--;
        }
    }
}

/* ==================== Main Loop & Flow ==================== */
function animate() {
    if (!gameRunning) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    drawBackground();
    
    for (let i = 0; i < grid.length; i++) {
        grid[i].draw();
    }
    
    handleLawnmowers();
    handlePlants();
    handleZombies();
    handleProjectiles();
    handleDrops();
    handleParticles();
    
    updateCooldowns();
    
    frames++;
    requestAnimationFrame(animate);
}

function startWave() {
    zombiesSpawned = 0;
    waveTotalZombies = 5 + (wave * 5); // 10, 15, 20, 25, 30
    zombieSpawnRate = Math.max(250, 650 - (wave * 60)); // Spawns way friendlier, very generous spacing
    
    createUI(); // Refresh UI unlocks
    updateWaveUI();
    showWaveBanner();
    
    startBGM(wave); // Dynamically change music per wave!
    
    // Voice prompt for new wave
    sfx.voice("添添，请做好准备！迎接战斗！");
}

function initGame() {
    grid.length = 0;
    plants.length = 0;
    zombies.length = 0;
    projectiles.length = 0;
    drops.length = 0;
    particles.length = 0;
    
    lawnmowers.length = 0;
    for (let row = 0; row < ROWS; row++) {
        lawnmowers.push(new Lawnmower(BOARD_Y + (row * CELL_SIZE)));
    }
    
    sun = 500; // HUGE starting sun!
    frames = 400; // Start at 400
    wave = 1;
    zombiesSpawned = 0;
    
    mouse.currentSeed = null;
    canvas.style.cursor = 'default';
    
    buildGrid();
    createUI();
    updateSunDisplay();
    startWave();
    
    gameRunning = true;
    animate();
}

function endGame(won) {
    gameRunning = false;
    stopBGM();
    selectBar.style.display = 'none';
    waveInfo.style.display = 'none';
    
    if (won) {
        victoryOverlay.style.display = 'flex';
    } else {
        gameoverOverlay.style.display = 'flex';
    }
}

/* ==================== Event Listeners ==================== */
startBtn.addEventListener('click', () => {
    initAudio();
    menuOverlay.style.display = 'none';
    selectBar.style.display = 'flex';
    waveInfo.style.display = 'flex';
    initGame();
});

retryBtn.addEventListener('click', () => {
    initAudio();
    gameoverOverlay.style.display = 'none';
    selectBar.style.display = 'flex';
    waveInfo.style.display = 'flex';
    initGame();
});

playAgainBtn.addEventListener('click', () => {
    initAudio();
    victoryOverlay.style.display = 'none';
    selectBar.style.display = 'flex';
    waveInfo.style.display = 'flex';
    initGame();
});

// Initial Setup
buildGrid();
drawBackground();

// CSS Keyframes for Shake Effect
const style = document.createElement('style');
style.innerHTML = `
@keyframes shake {
  0% { transform: translate(1px, 1px) rotate(0deg); }
  10% { transform: translate(-1px, -2px) rotate(-1deg); }
  20% { transform: translate(-3px, 0px) rotate(1deg); }
  30% { transform: translate(3px, 2px) rotate(0deg); }
  40% { transform: translate(1px, -1px) rotate(1deg); }
  50% { transform: translate(-1px, 2px) rotate(-1deg); }
  60% { transform: translate(-3px, 1px) rotate(0deg); }
  70% { transform: translate(3px, 1px) rotate(-1deg); }
  80% { transform: translate(-1px, -1px) rotate(1deg); }
  90% { transform: translate(1px, 2px) rotate(0deg); }
  100% { transform: translate(1px, -2px) rotate(-1deg); }
}
`;
document.head.appendChild(style);
