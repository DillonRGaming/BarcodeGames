
(function() {
    let socket;
    let gameState;
    let canvas, ctx;

    
    
    
    const CONFIG = {
        carriageWidth: 1400, 
        carriageHeight: 300,
        carriagePadding: 100, 
        skyColor: '#72c2d6', 
        shakeBase: 1.5, 
        moveSpeed: 0.08, 
        trainSpeed: 40, 
        cameraZoom: 0.4, 
        insideZoom: 0.9,
        trainLength: 2 
    };

    let currentActionResolve = null;
    let gameData = null;
    let countdownOverlay;

    
    fetch('games/Locomotive/gameplay.json').then(r=>r.json()).then(d=>{gameData=d;}).catch(e=>{});

    
    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyY' && currentActionResolve) {
            currentActionResolve();
            currentActionResolve = null;
        }
    });

    
    async function runSequence(sequence) {
        for (const action of sequence) {
            await processAction(action);
        }
    }

window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyY' && currentActionResolve) {
        currentActionResolve();
        currentActionResolve = null;
    }
});

function startGlobalLoops(loops) {
    loops.forEach(loop => {
        let src = loop.file;
        if (src && !src.startsWith('assets/')) src = 'assets/' + src;
        if (loop.type === 'music') {
             const audio = new Audio(src);
             audio.loop = true;
             audio.volume = loop.volume !== undefined ? loop.volume : 0.5;
             audio.play().catch(e => {});
        } else if (loop.type === 'random_sound') {
             startRandomSoundLoop(src, loop.min_interval, loop.max_interval, loop.volume);
        }
    });
}

function startRandomSoundLoop(src, min, max, volume) {
    const delay = Math.random() * (max - min) + min;
    setTimeout(() => {
        if (gameState.inGame && gameState.isHost) {
             const sfx = new Audio(src);
             sfx.volume = volume !== undefined ? volume : 0.5;
             sfx.play().catch(e => {});
             startRandomSoundLoop(src, min, max, volume);
        }
    }, delay);
}

const activeAudio = new Map();

function playRandomWoosh() {
    const wooshes = ['woosh1.mp3', 'woosh2.mp3', 'woosh3.mp3'];
    const choice = wooshes[Math.floor(Math.random() * wooshes.length)];
    const audio = new Audio('assets/' + choice);
    audio.volume = 0.6;
    audio.play().catch(() => {});
}

function handleCountdownAction(action, resolve) {
    let count = action.seconds;
    countdownOverlay.textContent = count;
    countdownOverlay.classList.remove('hidden');
    
    const playDing = () => {
        const ding = new Audio('assets/ding.mp3');
        ding.volume = action.volume !== undefined ? action.volume : 0.8;
        ding.play().catch(() => {});
    };

    playDing();

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownOverlay.textContent = count;
            playDing();
        } else if (count === 0) {
            countdownOverlay.textContent = ""; 
            countdownOverlay.classList.add('hidden');
            clearInterval(interval);
            resolve();
        }
    }, 1000);
}

function processAction(action) {
    return new Promise((resolve) => {
        currentActionResolve = resolve;
        switch (action.type) {
            case 'log':
                resolve();
                break;
            case 'delay':
                let ms = action.ms || 1000;
                if (action.min && action.max) {
                    ms = Math.random() * (action.max - action.min) + action.min;
                }
                setTimeout(resolve, ms);
                break;
            case 'music':
                handleMusicAction(action, resolve);
                break;
            case 'sound':
            case 'voice':
                handleSoundAction(action, resolve);
                break;
            case 'countdown':
                handleCountdownAction(action, resolve);
                break;
            case 'train':
                handleTrainAction(action, resolve);
                break;
            case 'camera':
                if (action.mode === 'inside') {
                    insideView = true;
                    if (action.zoom) CONFIG.insideZoom = action.zoom;
                } else if (action.mode === 'outside') {
                    insideView = false;
                    cameraMode = 'TRAIN';
                    if (action.zoom) CONFIG.cameraZoom = action.zoom;
                }
                if (action.sound) {
                    let src = action.sound;
                    if (!src.startsWith('assets/')) src = 'assets/' + src;
                    const sfx = new Audio(src);
                    sfx.volume = action.volume !== undefined ? action.volume : 1.0;
                    sfx.play().catch(e => {});
                }
                resolve();
                break;
            case 'wall':
                if (action.visible === true) {
                    manualWallOverride = true;
                    getCarriageState(activeIndex).frontOpacity = 1.0;
                } else if (action.visible === false) {
                    manualWallOverride = true;
                    getCarriageState(activeIndex).frontOpacity = 0.0;
                }
                resolve();
                break;
            case 'score':
                resolve();
                break;
            default:
                resolve();
                break;
        }
    });
}

function handleMusicAction(action, resolve) {
    let audio = null;
    let id = action.id || action.file;
    if (action.action === 'play') {
        if (!activeAudio.has(id)) {
            let src = action.file;
            if (src && !src.startsWith('assets/')) src = 'assets/' + src;
            if (action.file === 'main-menu.mp3') audio = menuAudio; 
            else if (action.file === 'in-game.mp3') audio = gameAudio;
            else audio = new Audio(src);
            activeAudio.set(id, audio);
        } else {
            audio = activeAudio.get(id);
        }
        const fadeInDuration = action.fade_in || action.duration;
        if (action.volume !== undefined) {
             if (fadeInDuration) audio.volume = 0;
             else audio.volume = action.volume;
        } else if (fadeInDuration) {
             audio.volume = 0;
        }
        if (action.loop !== undefined) audio.loop = action.loop;
        audio.play().catch(e => {});
        if (fadeInDuration) {
            const targetVol = action.volume !== undefined ? action.volume : 1.0;
            fadeAudio(audio, 0, targetVol, fadeInDuration, resolve);
        } else {
            resolve();
        }
    } else if (action.action === 'stop' || action.action === 'fade_out') {
        if (activeAudio.has(id)) {
            audio = activeAudio.get(id);
            const fadeOutDuration = action.fade_out || action.duration;
            if (fadeOutDuration) {
                fadeAudio(audio, audio.volume, 0, fadeOutDuration, () => {
                    audio.pause();
                    resolve();
                });
            } else {
                audio.pause();
                audio.currentTime = 0;
                resolve();
            }
        } else {
            resolve();
        }
    } else {
        resolve();
    }
}

function fadeAudio(audio, from, to, duration, callback) {
    let steps = 20;
    let timePerStep = duration / steps;
    let volStep = (to - from) / steps;
    let current = from;
    let interval = setInterval(() => {
        current += volStep;
        if (current < 0) current = 0;
        if (current > 1) current = 1;
        audio.volume = current;
        steps--;
        if (steps <= 0) {
            clearInterval(interval);
            audio.volume = to;
            if (callback) callback();
        }
    }, timePerStep);
}

function handleSoundAction(action, resolve) {
    let src = action.file;
    if (src && !src.startsWith('assets/')) src = 'assets/' + src;
    const sfx = new Audio(src);
    if (action.volume) sfx.volume = action.volume;
    if (action.type === 'voice') {
        const duckVol = action.duck_volume !== undefined ? action.duck_volume : 0.3;
        activeAudio.forEach(audio => {
            if (!audio.paused && audio.volume > duckVol) {
                audio.originalVolume = audio.volume; 
                fadeAudio(audio, audio.volume, duckVol, 300);
            }
        });
        sfx.onended = () => {
             activeAudio.forEach(audio => {
                if (audio.originalVolume !== undefined) {
                    fadeAudio(audio, audio.volume, audio.originalVolume, 500);
                    delete audio.originalVolume;
                }
             });
        };
    }
    sfx.play().catch(e => {});
    if (action.length) {
        setTimeout(resolve, action.length);
    } else {
        resolve();
    }
}

function handleTrainAction(action, resolve) {
    if (action.action === 'move_next') {
        if (activeIndex < CONFIG.trainLength) {
            transitionState = 'COVERING';
            if (action.sound) {
                let src = action.sound;
                if (!src.startsWith('assets/')) src = 'assets/' + src;
                const sfx = new Audio(src);
                sfx.volume = action.volume !== undefined ? action.volume : 1.0;
                sfx.play().catch(e => {});
            }
        }
        resolve();
    } else if (action.action === 'release_last') {
        if (activeIndex > tailIndex) {
            const spacing = CONFIG.carriageWidth + CONFIG.carriagePadding;
            for(let i = tailIndex; i < activeIndex; i++) {
                const s = getCarriageState(i);
                s.isDetached = true;
                s.x = (i * spacing) + trainDistance;
                s.detachSpeed = CONFIG.trainSpeed;
            }
            lastDetachedIndex = activeIndex - 1;
            tailIndex = activeIndex;
            if (action.sound) {
                let src = action.sound;
                if (!src.startsWith('assets/')) src = 'assets/' + src;
                const sfx = new Audio(src);
                sfx.volume = action.volume !== undefined ? action.volume : 1.0;
                sfx.play().catch(e => {});
            }
        }
        resolve();
    } else {
        resolve();
    }
}






const wheelImg = new Image();
const cartImg = new Image();
const engineCartImg = new Image();
const engineWheelImg = new Image();
const engineWheelSmallImg = new Image();
const connectorImg = new Image();
const wheelPivotImg = new Image();
const wallImg = new Image();
const cloud1Img = new Image();
const cloud2Img = new Image();

const menuAudio = new Audio();
const gameAudio = new Audio();

function setupLocomotiveAssets() {
    wheelImg.src = 'games/Locomotive/assets/wheel.png';
    cartImg.src = 'games/Locomotive/assets/cart.png';
    engineCartImg.src = 'games/Locomotive/assets/engine-cart.png';
    engineWheelImg.src = 'games/Locomotive/assets/engine-wheel.png';
    engineWheelSmallImg.src = 'games/Locomotive/assets/engine-wheel-small.png';
    connectorImg.src = 'games/Locomotive/assets/connector.png';
    wheelPivotImg.src = 'games/Locomotive/assets/wheel-pivot.png';
    wheelPivotImg.onload = () => console.log('Pivot Image Loaded', wheelPivotImg.width, wheelPivotImg.height);
    wallImg.src = 'games/Locomotive/assets/wall.png';
    cloud1Img.src = 'games/Locomotive/assets/cloud1.png';
    cloud2Img.src = 'games/Locomotive/assets/cloud2.png';
    
    
    menuAudio.src = 'games/Locomotive/assets/main-menu.mp3';
    gameAudio.src = 'games/Locomotive/assets/in-game.mp3';
}


function createNoiseTexture(width, height, type) {
    const cvs = document.createElement('canvas');
    cvs.width = width;
    cvs.height = height;
    const ctx = cvs.getContext('2d');
    
    function addLayer(res, alphaMax) {
        const temp = document.createElement('canvas');
        temp.width = res;
        temp.height = res;
        const tCtx = temp.getContext('2d');
        const imgData = tCtx.createImageData(res, res);
        for (let i = 0; i < imgData.data.length; i += 4) {
            imgData.data[i] = 255;
            imgData.data[i+1] = 255;
            imgData.data[i+2] = 255;
            imgData.data[i+3] = Math.random() * 255 * alphaMax;
        }
        tCtx.putImageData(imgData, 0, 0);
        ctx.drawImage(temp, 0, 0, width, height);
    }
    
    if (type === 'base') {
        addLayer(64, 0.04); 
        addLayer(128, 0.02);
    } else if (type === 'detail') {
        addLayer(256, 0.03); 
        addLayer(512, 0.02);
    } else if (type === 'grain') {
        addLayer(512, 0.03); 
    }
    return cvs;
}


let skyLayerBase, skyLayerDetail, skyLayerGrain;
let patBase, patDetail, patGrain;

function getTrackState(x) {
    
    
    const y = Math.sin(x * 0.0002) * 200
            + Math.sin(x * 0.0005) * 100
            + Math.sin(x * 0.001) * 40;
    
    
    const dy = 0.04 * Math.cos(x * 0.0002)
             + 0.05 * Math.cos(x * 0.0005)
             + 0.04 * Math.cos(x * 0.001);
             
    return { y: y, angle: Math.atan(dy) };
}




function handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width === 0 || height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
}





function updateAndDrawParticles(ctx, dt) {
    ctx.save();
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx * dt; 
        p.y += p.vy * dt; 
        p.life -= 0.02 * dt; 
        if (p.type === 'spark') {
             p.vy += 0.8 * dt; 
             ctx.globalCompositeOperation = 'lighter';
             ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
             ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
        } else if (p.type === 'smoke') {
             p.size += 0.5 * dt; 
             ctx.globalCompositeOperation = 'source-over';
             ctx.globalAlpha = p.life * 0.3; ctx.fillStyle = '#444';
             ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        }
        if (p.life <= 0) particles.splice(i, 1);
    }
    ctx.restore();
}

function drawEngine(ctx, worldX) {
    const state = getTrackState(worldX);
    const w = CONFIG.carriageWidth;
    const h = CONFIG.carriageHeight;
    const chassisY = -75 - 20;
    
    const bodyY = chassisY - h + 50 + 20; 
    const connectorY = bodyY + h - 150; 

    
    const index = CONFIG.trainLength;
    if (index > tailIndex) {
        const prevIndex = index - 1;
        const prevState = getCarriageState(prevIndex);
        const spacing = CONFIG.carriageWidth + CONFIG.carriagePadding;
        let prevWorldX = prevState.isDetached ? prevState.x : (prevIndex * spacing) + trainDistance;
        
        const pState = getTrackState(prevWorldX);
        
        
        const cartW = CONFIG.carriageWidth;
        const cartWheelRadius = 100;
        const cartBodyY = (-cartWheelRadius - 20) - CONFIG.carriageHeight + 50 + 0;
        const prevConnectorY = cartBodyY + CONFIG.carriageHeight - 100;

        const currHook = getGlobalPos(-w/2 - 10, connectorY, worldX, state.y, state.angle); 
        const prevHook = getGlobalPos(cartW/2 - 10, prevConnectorY, prevWorldX, pState.y, pState.angle);
        
        drawChain(ctx, prevHook, currHook);
    }
    
    ctx.save();
    ctx.translate(worldX, state.y);
    ctx.rotate(state.angle);

    
    ctx.save(); 
    ctx.translate(-w/2 - 10, connectorY); 
    drawConnectorHalf(ctx, 'left'); 
    ctx.restore();

    
    if (engineCartImg.complete && engineCartImg.naturalWidth > 0) {
        const aspect = engineCartImg.naturalWidth / engineCartImg.naturalHeight;
        
        const drawScale = 1.1;
        const drawW = w * drawScale;
        const drawH = drawW / aspect;
        
        ctx.drawImage(engineCartImg, -drawW/2, bodyY - (drawH - h), drawW, drawH);
    } else {
        
        ctx.fillStyle = '#111';
        ctx.fillRect(-w/2, bodyY, w, h);
    }
    
    ctx.restore();

    
    const bigRadius = 100;
    const smallRadius = 60;
    
    function drawIndepWheel(wx, s, img, angleOffset = 0) {
        
        const dx = wx - worldX;
        
        const mount = getGlobalPos(dx, 0, worldX, state.y, state.angle);
        
        
        const trackY = getTrackState(mount.x).y;
        const verticalDist = trackY - mount.y;
        
        
        
        const cos = Math.cos(state.angle);
        const limitCos = Math.abs(cos) < 0.1 ? (cos >=0 ? 0.1 : -0.1) : cos;
        const suspensionLen = verticalDist / limitCos;

        
        const offsetLocalY = suspensionLen - s - 10;
        const pos = getGlobalPos(dx, offsetLocalY, worldX, state.y, state.angle);
        
        ctx.save();
        ctx.translate(pos.x, pos.y);
        
        const spin = (worldX / s) * 0.5 + angleOffset;
        ctx.rotate(state.angle);
        ctx.rotate(spin);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = Math.max(2, s * 0.02);
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.drawImage(img || wheelImg, -s, -s, s*2, s*2);
        ctx.restore();
        
        
        return {x: pos.x, y: pos.y};
    }

    
    const bigOffset = 220 * (Math.PI / 180);
    const p1 = drawIndepWheel(worldX - 450, bigRadius, engineWheelImg, bigOffset);
    const p2 = drawIndepWheel(worldX - 150, bigRadius, engineWheelImg, bigOffset);
    const p3 = drawIndepWheel(worldX + 150, bigRadius, engineWheelImg, bigOffset);

    
    drawIndepWheel(worldX + 325, smallRadius, engineWheelSmallImg);
    drawIndepWheel(worldX + 600, smallRadius, engineWheelSmallImg);

    
    ctx.save();
    
    const phase = state.angle + (worldX / bigRadius) * 0.5 + 220 * (Math.PI / 180);
    const rodRadius = bigRadius * 0.65;
    const rodYOffset = Math.sin(phase) * rodRadius;
    const rodXOffset = Math.cos(phase) * rodRadius;
    
    if (wheelPivotImg.complete && wheelPivotImg.naturalWidth > 0) {
        ctx.save();
        const centerX = p2.x + rodXOffset;
        const centerY = p2.y + rodYOffset;
        
        
        
        const drawW = 640;
        const aspect = wheelPivotImg.naturalWidth / wheelPivotImg.naturalHeight;
        const drawH = drawW / aspect;
        
        
        ctx.translate(centerX, centerY);

        
        const dx = p3.x - p1.x;
        const dy = p3.y - p1.y;
        const rodAngle = Math.atan2(dy, dx);
        
        ctx.rotate(rodAngle);
        
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 5;
        
        ctx.drawImage(wheelPivotImg, -drawW/2 + 10, -drawH/2, drawW, drawH);
        ctx.restore();
    }
    
    ctx.restore();
}

function drawCarriage(ctx, worldX, index, opacity) {
    if (index === CONFIG.trainLength) {
        drawEngine(ctx, worldX);
        return;
    }

    const state = getTrackState(worldX);
    const cartW = CONFIG.carriageWidth;
    const wheelRadius = 100; 
    const chassisY = -wheelRadius - 20; 
    const bodyY = chassisY - CONFIG.carriageHeight + 50 + 0; 
    const connectorY = bodyY + CONFIG.carriageHeight - 100;
    const cState = getCarriageState(index);

    function drawIndepCarriageWheel(wx) {
        
        const dx = wx - worldX;
        const mount = getGlobalPos(dx, 0, worldX, state.y, state.angle);
        
        const trackY = getTrackState(mount.x).y;
        const verticalDist = trackY - mount.y;
        
        const cos = Math.cos(state.angle);
        const limitCos = Math.abs(cos) < 0.1 ? (cos >=0 ? 0.1 : -0.1) : cos;
        const suspensionLen = verticalDist / limitCos;

        const offsetLocalY = suspensionLen - wheelRadius - 10;
        const pos = getGlobalPos(dx, offsetLocalY, worldX, state.y, state.angle);

        ctx.save();
        ctx.translate(pos.x, pos.y);
        
        const spin = (worldX / wheelRadius) * 0.5;
        ctx.rotate(state.angle);
        ctx.rotate(spin);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = Math.max(2, wheelRadius * 0.02);
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.drawImage(wheelImg, -wheelRadius, -wheelRadius, wheelRadius*2, wheelRadius*2);
        ctx.restore();
    }
    
    
    
    
    
    drawIndepCarriageWheel(worldX - 485); 
    drawIndepCarriageWheel(worldX - 280); 
    drawIndepCarriageWheel(worldX + 280); 
    drawIndepCarriageWheel(worldX + 485); 

    if (!cState.isDetached && index > tailIndex) {
        const prevIndex = index - 1;
        const prevState = getCarriageState(prevIndex);
        let prevWorldX = prevState.isDetached ? prevState.x : (prevIndex * (CONFIG.carriageWidth + CONFIG.carriagePadding)) + trainDistance;
        const pState = getTrackState(prevWorldX);
        const currHook = getGlobalPos(-cartW/2 + 10, connectorY, worldX, state.y, state.angle);
        const prevHook = getGlobalPos(cartW/2 - 10, connectorY, prevWorldX, pState.y, pState.angle);
        drawChain(ctx, prevHook, currHook);
    }
    
    ctx.save();
    ctx.translate(worldX, state.y);
    ctx.rotate(state.angle);

    ctx.save(); ctx.translate(-cartW/2 + 10, connectorY); drawConnectorHalf(ctx, 'left'); ctx.restore();
    ctx.save(); ctx.translate(cartW/2 - 10, connectorY); drawConnectorHalf(ctx, 'right'); ctx.restore();

    const x = -cartW / 2;
    let drawX = x;
    let drawY = bodyY;
    let drawW = cartW;
    let drawH = CONFIG.carriageHeight;

    if (cartImg.complete && cartImg.naturalWidth > 0) {
        const aspect = cartImg.naturalWidth / cartImg.naturalHeight;
        drawH = drawW / aspect;
        const currentBottom = bodyY + CONFIG.carriageHeight;
        drawY = currentBottom - drawH;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = Math.max(3, drawW * 0.01);
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;
        ctx.drawImage(cartImg, drawX, drawY, drawW, drawH);
    } else {
        ctx.fillStyle = cState.color; 
        ctx.strokeStyle = '#333'; ctx.lineWidth = 10;
        drawRoundedRect(ctx, x, bodyY, cartW, CONFIG.carriageHeight, 40);
        ctx.fill(); ctx.stroke();
    }
    
    if (index === 0 && opacity < 1) {
        const circleRadius = 50;
        const padding = 25;
        const cols = 4;
        const rows = 2;
        const totalW = cols * circleRadius * 2 + (cols - 1) * padding;
        const totalH = rows * circleRadius * 2 + (rows - 1) * padding;
        const startX = -totalW / 2 + circleRadius;
        const startY = drawY + (drawH - totalH) / 2 + circleRadius - 30;
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const playerIdx = row * cols + col;
                const cx = startX + col * (circleRadius * 2 + padding);
                const cy = startY + row * (circleRadius * 2 + padding);
                
                if (playerIdx < gameState.players.length) {
                    const player = gameState.players[playerIdx];
                    ctx.fillStyle = player.isHost ? 'rgba(255, 200, 100, 0.9)' : 'rgba(147, 227, 226, 0.9)';
                    ctx.beginPath();
                    ctx.arc(cx, cy, circleRadius, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.fillStyle = '#0a0a12';
                    ctx.font = 'bold 32px Outfit, Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const displayName = player.username.length > 6 ? player.username.slice(0, 6) + '..' : player.username;
                    ctx.fillText(displayName, cx, cy);
                } else {
                    ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
                    ctx.beginPath();
                    ctx.arc(cx, cy, circleRadius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    if (opacity > 0) {
        ctx.save();
        ctx.globalAlpha = opacity;
        
        const cX = -drawW/2 + 60;
        const cY = drawY; 
        const cW = drawW - 120;
        const cH = drawH - 120;

        if (wallImg.complete && wallImg.naturalWidth > 0) {
            const imgAspect = wallImg.naturalWidth / wallImg.naturalHeight;
            const rectAspect = cW / cH;
            let sX=0, sY=0, sW=wallImg.naturalWidth, sH=wallImg.naturalHeight;
            if (imgAspect > rectAspect) {
                 sW = wallImg.naturalHeight * rectAspect;
                 sX = (wallImg.naturalWidth - sW) / 2;
            } else {
                 sH = wallImg.naturalWidth / rectAspect;
                 sY = (wallImg.naturalHeight - sH) / 2;
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
            ctx.shadowBlur = Math.max(2, cW * 0.005);
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            ctx.drawImage(wallImg, sX, sY, sW, sH, cX, cY, cW, cH);
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        ctx.font = 'bold 180px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(index + 1, 0, cY + cH/2 + 40);
        ctx.restore();
    }
    ctx.restore(); 

    if (cState.isDetached && cState.detachSpeed > 1.0) {
        const bogie1X = worldX - 402.5;
        const bogie2X = worldX + 402.5;
        [bogie1X - 75, bogie1X + 75, bogie2X - 75, bogie2X + 75].forEach(wx => {
            const ws = getTrackState(wx);
            if (Math.random() < 0.6) spawnParticles(wx, ws.y, 'sparks');
        });
    }
}


const TRACK_CACHE = new Array(500).fill(0).map(() => ({x:0, y:0, angle:0}));

function drawTrack(ctx) {
    const width = canvas.width / (window.devicePixelRatio || 1);
    const startX = camera.x - width * 2;
    const endX = camera.x + width * 2;
    const step = 40; 
    
    
    const gridStartX = Math.floor(startX / step) * step;
    
    let ptCount = 0;
    
    
    for (let x = gridStartX; x <= endX; x += step) {
        if (x > brokenTrackLimit + 200) break;
        if (ptCount >= TRACK_CACHE.length) break;

        const p = TRACK_CACHE[ptCount];
        p.x = x;
        
        
        
        p.y = Math.sin(x * 0.0002) * 200
            + Math.sin(x * 0.0005) * 100
            + Math.sin(x * 0.001) * 40;
            
        
        const dy = 0.04 * Math.cos(x * 0.0002)
                 + 0.05 * Math.cos(x * 0.0005)
                 + 0.04 * Math.cos(x * 0.001);
        p.angle = Math.atan(dy);

        
        if (x > brokenTrackLimit - 1200) {
            const d = x - (brokenTrackLimit - 1200);
            p.y -= Math.pow(d * 0.05, 2.5);
            p.angle -= d * 0.003; 
        }
        ptCount++;
    }

    if (ptCount < 2) return;

    
    ctx.beginPath(); 
    ctx.fillStyle = '#050505'; 
    ctx.moveTo(TRACK_CACHE[0].x, canvas.height * 2);

    for (let i = 0; i < ptCount; i++) {
        ctx.lineTo(TRACK_CACHE[i].x, TRACK_CACHE[i].y + 20);
    }
    
    
    const lastP = TRACK_CACHE[ptCount - 1];
    ctx.lineTo(lastP.x, canvas.height * 2);
    ctx.fill();

    
    ctx.fillStyle = '#111';
    const tieSpacing = 80;
    const firstTiX = Math.floor(startX / tieSpacing) * tieSpacing;
    let nextTieX = firstTiX;
    
    let pIndex = 0;
    while(pIndex < ptCount - 1) {
        const p1 = TRACK_CACHE[pIndex];
        const p2 = TRACK_CACHE[pIndex+1];
        if (p1.x <= nextTieX && p2.x >= nextTieX) {
            
            const t = (nextTieX - p1.x) / (p2.x - p1.x);
            const y = p1.y + (p2.y - p1.y) * t;
            const ang = p1.angle + (p2.angle - p1.angle) * t;
            
            ctx.save(); 
            ctx.translate(nextTieX, y); 
            ctx.rotate(ang); 
            ctx.fillRect(-20, 0, 40, 25); 
            ctx.restore();
            
            nextTieX += tieSpacing;
        } else {
            pIndex++;
        }
    }

    
    
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    ctx.lineWidth = 18; ctx.strokeStyle = '#555'; ctx.beginPath();
    ctx.moveTo(TRACK_CACHE[0].x, TRACK_CACHE[0].y);
    for (let i = 1; i < ptCount; i++) ctx.lineTo(TRACK_CACHE[i].x, TRACK_CACHE[i].y);
    ctx.stroke();

    ctx.lineWidth = 4; ctx.strokeStyle = '#888'; ctx.beginPath();
    ctx.moveTo(TRACK_CACHE[0].x, TRACK_CACHE[0].y - 7);
    for (let i = 1; i < ptCount; i++) ctx.lineTo(TRACK_CACHE[i].x, TRACK_CACHE[i].y - 7);
    ctx.stroke();
    
    
    ctx.lineJoin = 'miter'; 
    ctx.lineCap = 'butt';
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyA') {
        const s = getCarriageState(activeIndex);
        s.frontOpacity = (s.frontOpacity > 0.5) ? 0 : 1;
        manualWallOverride = true;
        transitionState = 'IDLE'; 
    }
    if (e.code === 'Space') {
        if (transitionState === 'IDLE' && activeIndex < CONFIG.trainLength) {
            transitionState = 'COVERING';
        }
    }
    if (e.code === 'KeyQ') cameraMode = (cameraMode === 'TRAIN') ? 'DETACHED' : 'TRAIN';
    if (e.code === 'KeyC') insideView = !insideView;
    if (e.code === 'KeyF') {
        cutscene.active = true;
        cutscene.phase = 'PASSING';
        cutscene.velocity = 0;
        const spacing = CONFIG.carriageWidth + CONFIG.carriagePadding;
        const enginePos = (CONFIG.trainLength * spacing) + trainDistance;
        brokenTrackLimit = enginePos + 40000; 
    }
    if (e.code === 'KeyR') {
        if (activeIndex > tailIndex) {
            const spacing = CONFIG.carriageWidth + CONFIG.carriagePadding;
            for(let i = tailIndex; i < activeIndex; i++) {
                const s = getCarriageState(i);
                s.isDetached = true;
                s.x = (i * spacing) + trainDistance;
                s.detachSpeed = CONFIG.trainSpeed;
            }
            lastDetachedIndex = activeIndex - 1;
            tailIndex = activeIndex;
        }
    }
});

let trainDistance = 0;
let cameraMode = 'TRAIN'; 
let insideView = false;
let lastDetachedIndex = -1;
let brokenTrackLimit = Infinity; 
let cutscene = { active: false, phase: 'IDLE', velocity: 0, timer: 0 };
let carriageStates = new Map();

function getCarriageState(index) {
    if (!carriageStates.has(index)) {
        const hue = 20 + Math.random() * 20; 
        const sat = 20 + Math.random() * 20; 
        const light = 10 + Math.random() * 15; 
        carriageStates.set(index, {
            frontOpacity: 1.0, 
            isDetached: false,
            detachSpeed: 0,
            x: 0,
            color: `hsl(${hue}, ${sat}%, ${light}%)`
        });
    }
    return carriageStates.get(index);
}

let activeIndex = 0;
let transitionState = 'IDLE'; 
let tailIndex = 0; 
let transitionStartOffset = 0; 
let transitionStartTime = 0;
let transitionProgress = 0;
let transitionStartPos = {x:0,y:0};
let manualWallOverride = false;
const TRANSITION_DURATION = 1500; 
let particles = [];
let clouds = [];

class Camera {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.zoom = CONFIG.cameraZoom; 
        this.rotation = 0;
        this.shakeX = 0;
        this.shakeY = 0;
        this.bumpIntensity = 0;
        this.lastDetachedX = undefined;
    }

    addBump(amount) {
        this.bumpIntensity += amount; 
    }

    update(currentSpeed, dt) {
        const spacing = CONFIG.carriageWidth + CONFIG.carriagePadding;
        
        if (cutscene.active) {
            const state = getTrackState(this.x);
            const targetY = state.y - CONFIG.carriageHeight/2 - 50;
            
            this.y += (targetY - this.y) * 0.1 * dt;
            this.rotation += (state.angle - this.rotation) * 0.1 * dt;

            if (cutscene.phase === 'PASSING') {
                cutscene.velocity += 1.0 * dt; 
                this.x += (cutscene.velocity + CONFIG.trainSpeed) * dt; 
                const enginePos = (CONFIG.trainLength * spacing) + trainDistance;
                if (this.x > enginePos + 2000) cutscene.phase = 'SUPER_ZOOM';
            } else if (cutscene.phase === 'SUPER_ZOOM') {
                cutscene.velocity += 5.0 * dt; 
                this.x += (cutscene.velocity + CONFIG.trainSpeed) * dt;
                if (brokenTrackLimit - this.x < 12000) cutscene.phase = 'ARRIVING';
            } else if (cutscene.phase === 'ARRIVING') {
                const target = brokenTrackLimit - 2500; 
                this.x += (target - this.x) * 0.05 * dt; 
                if (Math.abs(target - this.x) < 50) {
                    cutscene.phase = 'WAITING';
                    cutscene.timer = Date.now();
                }
            } else if (cutscene.phase === 'WAITING') {
                 this.x += 2 * dt; 
                 if (Date.now() - cutscene.timer > 3000) cutscene.phase = 'RETURNING';
            } else if (cutscene.phase === 'RETURNING') {
                const activeSpacing = (activeIndex * spacing) + trainDistance;
                this.x += (activeSpacing - this.x) * 0.1 * dt; 
                if (Math.abs(this.x - activeSpacing) < 100) {
                    cutscene.active = false;
                    cutscene.phase = 'IDLE';
                }
            }
            return;
        }

        let cartIndex = activeIndex;
        if (cameraMode === 'DETACHED' && lastDetachedIndex !== -1) {
            cartIndex = lastDetachedIndex;
        }
        const cState = getCarriageState(cartIndex);
        let worldX;
        if (cState.isDetached) {
            const targetWorldX = cState.x;
            if (this.lastDetachedX === undefined) {
                this.lastDetachedX = this.x; 
            }
            worldX = this.lastDetachedX + (targetWorldX - this.lastDetachedX) * 0.15 * dt;
            this.lastDetachedX = worldX;
        } else {
            worldX = (cartIndex * spacing) + trainDistance;
            this.lastDetachedX = undefined;
        }
        
        let isDetachedTarget = cState.isDetached;
        let targetX, targetY, targetRot, targetZoom;
        const state = getTrackState(worldX);

        
        if (insideView) {
            const localCenterY = -350;
            const angle = state.angle;
            targetX = worldX - Math.sin(angle) * localCenterY; 
            targetY = state.y + Math.cos(angle) * localCenterY;
            targetRot = angle; 
            targetZoom = 1.0;
        } else {
            targetX = worldX;
            targetY = state.y - 350; 
            targetRot = state.angle * 0.5;
            targetZoom = CONFIG.cameraZoom;
        }

        if (transitionState === 'MOVING' && cameraMode === 'TRAIN' && !isDetachedTarget) {
             let t = transitionProgress;
             
             const ease = (1 - Math.cos(t * Math.PI)) / 2;
             const targetOffset = activeIndex * spacing;
             const currentOffset = transitionStartOffset + (targetOffset - transitionStartOffset) * ease;
             let baseX = trainDistance + currentOffset;
             if (insideView) {
                 
                 const state = getTrackState(baseX);
                 baseX -= Math.sin(state.angle) * -350; 
             }
             this.x = baseX;
             this.y = transitionStartPos.y + (targetY - transitionStartPos.y) * ease; 
        } else {
              
              this.x = targetX;

              
              
              
              const damping = 0.85;
              this.y = targetY + (this.y - targetY) * Math.pow(damping, dt);
        }

        if (insideView) {
            this.rotation = targetRot + (this.rotation - targetRot) * Math.pow(0.85, dt);
        } else {
            this.rotation = targetRot + (this.rotation - targetRot) * Math.pow(0.9, dt);
        }
        
        this.zoom = targetZoom + (this.zoom - targetZoom) * Math.pow(0.9, dt);
        const speedRatio = Math.min(currentSpeed / CONFIG.trainSpeed, 1.2);
        const viewMult = insideView ? 0.08 : 0.6;
        const wPhase = this.x * 0.002; 
        const wobbleX = (Math.sin(wPhase) * 15 + Math.sin(wPhase * 2.7) * 6) * speedRatio * viewMult;
        const wobbleY = (Math.cos(wPhase * 1.3) * 12 + Math.cos(wPhase * 3.1) * 5) * speedRatio * viewMult;
        const noisemult = insideView ? 0.02 : 0.2;
        const n1 = (Math.random() - 0.5) * CONFIG.shakeBase * noisemult * speedRatio;
        const n2 = (Math.random() - 0.5) * (CONFIG.shakeBase * 1) * noisemult * speedRatio;
        const n3 = (Math.random() - 0.5) * (CONFIG.shakeBase * 0.3) * noisemult * speedRatio;
        this.shakeX = wobbleX + n1 + n2 * 0.5 + n3;
        this.shakeY = wobbleY + n1 + n2 * 0.5 + (Math.random()-0.5)*this.bumpIntensity * speedRatio;
    }

    apply(ctx) {
        ctx.save();
        const logicalW = canvas.width / (window.devicePixelRatio || 1);
        const logicalH = canvas.height / (window.devicePixelRatio || 1);
        ctx.translate(logicalW / 2, logicalH / 2);
        ctx.scale(this.zoom, this.zoom);
        ctx.rotate(-this.rotation);
        ctx.translate(-this.x - this.shakeX, -this.y - this.shakeY);
    }
}
const camera = new Camera();

function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function drawConnectorHalf(ctx, type) {
    ctx.save();
    ctx.fillStyle = '#1a1a1a';
    if (type === 'left') ctx.fillRect(0, -25, 10, 50); 
    else ctx.fillRect(-10, -25, 10, 50); 
    if (type === 'left') {
        ctx.translate(-15, 0); ctx.fillStyle = '#222';
        ctx.fillRect(0, -15, 15, 30); ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.stroke();
    } else {
        ctx.translate(15, 0); ctx.fillStyle = '#222';
        ctx.fillRect(-15, -15, 15, 30); ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#222'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();
}

function getGlobalPos(localX, localY, worldX, trackY, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: worldX + (localX * cos - localY * sin),
        y: trackY + (localX * sin + localY * cos)
    };
}

function drawChain(ctx, p1, p2) {
    ctx.save();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath();ctx.moveTo(p1.x, p1.y);ctx.lineTo(p2.x, p2.y);ctx.stroke();
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(midX, midY, 8, 0, Math.PI*2); ctx.fill();
    ctx.restore();
}

function spawnParticles(worldX, worldY, type) {
    if (type === 'sparks') {
        for(let i=0; i<2; i++) {
            particles.push({
                x: worldX, y: worldY,
                vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15, 
                life: 1.0, type: 'spark',
                color: `hsl(${30 + Math.random()*30}, 100%, 80%)`
            });
        }
    } else if (type === 'smoke') {
         particles.push({
            x: worldX, y: worldY,
            vx: -CONFIG.trainSpeed + (Math.random() - 0.5)*5, 
            vy: -5 - Math.random()*5, life: 1.0, type: 'smoke',
            size: 20 + Math.random()*20
        });
    }
}

function spawnCloud(overrideX) {
    const dpr = window.devicePixelRatio || 1;
    const viewHalfW = (canvas.width / dpr) / camera.zoom / 2;
    
    
    const spawnPadding = 2000;
    const minSpawnX = camera.x + viewHalfW + spawnPadding;
    
    let valid = false;
    let attempts = 0;
    
    let x, y, scale, speedMult, norm;
    
    
    while (!valid && attempts < 50) {
        attempts++;
        
        
        x = overrideX !== undefined ? overrideX : (minSpawnX + Math.random() * 3000); 
        
        y = -25000 + Math.random() * 20000;
        
        scale = 0.15 + Math.random() * 0.3;
        
        let tooClose = false;
        for (const c of clouds) {
            const dx = c.x - x;
            const dy = c.y - y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 1100) {
                tooClose = true;
                break;
            }
        }
        
        if (!tooClose) {
            valid = true;
        }
    }
    
    if (!valid && overrideX === undefined) return;
    
    norm = (scale - 0.15) / 0.3;
    speedMult = 0.98 - (norm * 0.13); 
    
    clouds.push({
        x: x,
        y: y,
        scale: scale,
        vx: CONFIG.trainSpeed * speedMult, 
        opacity: 0.2 + Math.random() * 0.5,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.02 + Math.random() * 0.03,
        type: Math.random() < 0.5 ? 1 : 2
    });
}

function updateClouds(dt) {
    
    if (clouds.length < 80) {
         if (Math.random() < 0.5) spawnCloud();
    }

    const dpr = window.devicePixelRatio || 1;
    const viewHalfW = (canvas.width / dpr) / camera.zoom / 2;
    
    
    const killPadding = 2000;
    const killX = camera.x - viewHalfW - killPadding; 

    for (let i = clouds.length - 1; i >= 0; i--) {
        let c = clouds[i];
        c.x += c.vx * dt; 
        c.wobblePhase += c.wobbleSpeed * dt;
        
        
        const cloudImg = (c.type === 2) ? cloud2Img : cloud1Img;
        const cloudWidth = (cloudImg.complete && cloudImg.naturalWidth > 0) ? cloudImg.naturalWidth * c.scale : 500;
        
        
        if (c.x + cloudWidth < killX) {
             clouds.splice(i, 1);
        }
    }
}

function drawClouds(ctx) {
    clouds.forEach(c => {
        const img = (c.type === 2) ? cloud2Img : cloud1Img;
        if (!img.complete || img.naturalWidth === 0) return;

        ctx.save();
        ctx.globalAlpha = c.opacity;
        
        const w = img.naturalWidth * c.scale;
        const h = img.naturalHeight * c.scale;
        
        
        if (c.scale < 0.3) {
            
             const drawY = c.y + (camera.y - c.y) * 0.95;
             ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, c.x, drawY, w, h);
        } else {
            
            const numStrips = Math.floor(16 * (c.scale / 0.45)); 
            const stripW = img.naturalWidth / numStrips;
            const drawStripW = w / numStrips;
            
            for (let i = 0; i < numStrips; i++) {
                const sx = i * stripW;
                const dx = c.x + i * drawStripW;
                
                const normI = i / (numStrips - 1);
                const edgePin = Math.sin(Math.PI * normI);
                
                const wave1 = Math.sin(c.wobblePhase + i * 0.5);
                const wave2 = Math.cos(c.wobblePhase * 1.3 + i * 1.2);
                const combined = (wave1 + wave2 * 0.5);
                const wobble = combined * edgePin * (45 * c.scale);
                
                const parallaxFactor = 0.95;
                const drawY = c.y + (camera.y - c.y) * parallaxFactor;

                ctx.drawImage(img, sx, 0, stripW, img.naturalHeight, dx, drawY + wobble, drawStripW, h);
            }
        }
        ctx.restore();
    });
}



let lastTime = performance.now();

function updateLogic(dt) {
    
    if (true) {
        trainDistance += CONFIG.trainSpeed * dt;
        if (transitionState === 'IDLE' && !manualWallOverride) {
            getCarriageState(activeIndex).frontOpacity += (0 - getCarriageState(activeIndex).frontOpacity) * 0.1 * dt;
        } else if (transitionState === 'COVERING') {
            const current = getCarriageState(activeIndex);
            
            current.frontOpacity += (1.0 - current.frontOpacity) * 0.15 * dt; 
            if (current.frontOpacity > 0.99) {
                current.frontOpacity = 1.0; activeIndex++; transitionState = 'MOVING';
                
                
                
                let startXCorrection = 0;
                if (insideView) {
                    const s = getTrackState(camera.x);
                    startXCorrection = -Math.sin(s.angle) * -350; 
                }
                transitionStartOffset = (camera.x - trainDistance) - startXCorrection; 
                transitionStartPos = { x: camera.x, y: camera.y }; 
                transitionProgress = 0;
            }
        } else if (transitionState === 'MOVING') {
            transitionProgress += (1 / 90) * dt; 
            if (transitionProgress >= 1.0) {
                transitionProgress = 1.0;
                transitionState = 'UNCOVERING';
            }
        } else if (transitionState === 'UNCOVERING') {
            const current = getCarriageState(activeIndex);
            current.frontOpacity += (0 - current.frontOpacity) * 0.1 * dt; 
            if (current.frontOpacity < 0.02) {current.frontOpacity = 0; transitionState = 'IDLE';}
        }
        carriageStates.forEach((state, idx) => {
            if (idx !== activeIndex) state.frontOpacity = 1.0;
            if (state.isDetached) {
                if (state.detachSpeed > 0) {state.detachSpeed -= 0.15 * dt; if (state.detachSpeed < 0) state.detachSpeed = 0;}
                state.x += state.detachSpeed * dt;
            }
        });
        let trackingSpeed = CONFIG.trainSpeed;
        if (cameraMode === 'DETACHED' && lastDetachedIndex !== -1) {
            const s = getCarriageState(lastDetachedIndex);
            if (s) trackingSpeed = s.detachSpeed;
        }
        camera.update(trackingSpeed, dt);
        updateClouds(dt);
    }
}

function loop() {
    const now = performance.now();
    let dt = (now - lastTime) / 16.666; 
    lastTime = now;
    if (dt > 4.0) dt = 4.0; 

    updateLogic(dt);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); 

    
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#2c6e91'); 
    grad.addColorStop(1, CONFIG.skyColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    
    const skyTime = now * 0.05; 
    
    
    const p1X = -(skyTime * 0.4) % 1024;
    const p1Y = 0;

    
    const p2X = -(skyTime * 0.8) % 1024; 
    const p2Y = Math.sin(skyTime * 0.02) * 30; 

    
    
    const p3X = -(skyTime * 1.5) % 1024 + (Math.random() - 0.5) * 30;
    const p3Y = (Math.random() - 0.5) * 30;

    ctx.save();
    
    
    if (patBase) {
        ctx.translate(p1X, p1Y);
        ctx.fillStyle = patBase; 
        ctx.fillRect(-p1X, -p1Y, canvas.width + 1024, canvas.height + 1024);
    } else {
        ctx.fillStyle = CONFIG.skyColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.restore();

    
    if (patDetail) {
        ctx.save();
        ctx.translate(p2X, p2Y);
        ctx.fillStyle = patDetail; 
        ctx.fillRect(-p2X, -p2Y - 30, canvas.width + 1024, canvas.height + 1024 + 60);
        ctx.restore();
    }

    
    if (patGrain) {
        ctx.save();
        ctx.translate(p3X, p3Y);
        ctx.fillStyle = patGrain; 
        ctx.fillRect(-p3X - 30, -p3Y - 30, canvas.width + 1024 + 60, canvas.height + 1024 + 60);
        ctx.restore();
    }

    ctx.restore();
    camera.apply(ctx);
    
    const width = canvas.width / (window.devicePixelRatio || 1);
    const minViewX = camera.x - width * 2;
    const maxViewX = camera.x + width * 2;
    const spacing = CONFIG.carriageWidth + CONFIG.carriagePadding;
    
    drawClouds(ctx);
    drawTrack(ctx);
    carriageStates.forEach((state, idx) => {
        if (state.isDetached && state.x > minViewX && state.x < maxViewX) drawCarriage(ctx, state.x, idx, state.frontOpacity);
    });
    const minIndex = Math.floor((minViewX - trainDistance) / spacing);
    const maxIndex = Math.ceil((maxViewX - trainDistance) / spacing);
    const start = Math.max(minIndex, tailIndex);
    const end = Math.min(maxIndex, CONFIG.trainLength);
    for (let i = start; i <= end; i++) {
        if (!getCarriageState(i).isDetached) {
            const worldX = (i * spacing) + trainDistance;
            drawCarriage(ctx, worldX, i, getCarriageState(i).frontOpacity);
        }
    }
    updateAndDrawParticles(ctx, dt);
    ctx.restore();
    requestAnimationFrame(loop);
}


    
    window.initGame = function(cvs, sock, state) {
        canvas = cvs;
        socket = sock;
        gameState = state;
        
        ctx = canvas.getContext('2d', { 
            alpha: false,
            desynchronized: false,
            willReadFrequently: false
        });

        setupLocomotiveAssets();
        
        skyLayerBase = createNoiseTexture(512, 512, 'base');
        skyLayerDetail = createNoiseTexture(512, 512, 'detail');
        skyLayerGrain = createNoiseTexture(512, 512, 'grain');
        patBase = skyLayerBase.getContext('2d').createPattern(skyLayerBase, 'repeat');
        patDetail = skyLayerDetail.getContext('2d').createPattern(skyLayerDetail, 'repeat');
        patGrain = skyLayerGrain.getContext('2d').createPattern(skyLayerGrain, 'repeat');
        
        handleResize();
        window.addEventListener('resize', handleResize);

        for (let i = 0; i < 80; i++) {
           const dpr = window.devicePixelRatio || 1;
           const viewHalfW = (canvas.width / dpr) / CONFIG.cameraZoom / 2;
           spawnCloud(camera.x - viewHalfW - 1000 + Math.random() * (viewHalfW * 4 + 2000));
        }
        
        countdownOverlay = document.getElementById('countdown-overlay');
        
        lastTime = performance.now();
        loop();
        
        window.onGameStart = function() {
            if (gameState.isHost && gameData && gameData.sequences && gameData.sequences.game_start) {
                runSequence(gameData.sequences.game_start);
            }
        };

        window.updatePlayerCircles = function(players) {
        };
    };

})();
