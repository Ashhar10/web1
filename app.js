/**
 * Fullscreen Interactive Avatar & Cursor Effect (135 Frames)
 * Clockwise Rotation: 12 PM (UP) -> 3 PM (RIGHT) -> 6 PM (DOWN) -> 9 PM (LEFT) -> 12 AM (UP)
 * Plus Center Neutral & Warm Smile Interaction
 */

(() => {
  'use strict';

  const TOTAL_FRAMES = 189;

  // Frame sectors specified by user:
  // - 001 to 019: UP (12 PM)
  // - 020 to 029: UP RIGHT (1:30 PM)
  // - 030 to 055: RIGHT (3 PM)
  // - 056 to 065: RIGHT DOWN (4:30 PM)
  // - 066 to 075: DOWN (6 PM)
  // - 076 to 085: LEFT DOWN (7:30 PM)
  // - 086 to 105: LEFT (9 PM)
  // - 106 to 115: LEFT UP (10:30 PM)
  // - 116 to 125: UP (12 AM)
  // - 126 to 135: SMILING / CENTER NEUTRAL
  const SECTORS = {
    UP_1:       { min: 1,   max: 19,  anchor: 10,  label: 'Looking Up (12 PM)' },
    UP_RIGHT:   { min: 20,  max: 29,  anchor: 25,  label: 'Looking Up-Right (1:30 PM)' },
    RIGHT:      { min: 30,  max: 55,  anchor: 42,  label: 'Looking Right (3 PM)' },
    RIGHT_DOWN: { min: 56,  max: 65,  anchor: 60,  label: 'Looking Right-Down (4:30 PM)' },
    DOWN:       { min: 66,  max: 75,  anchor: 70,  label: 'Looking Down (6 PM)' },
    LEFT_DOWN:  { min: 76,  max: 85,  anchor: 80,  label: 'Looking Left-Down (7:30 PM)' },
    LEFT:       { min: 86,  max: 105, anchor: 95,  label: 'Looking Left (9 PM)' },
    LEFT_UP:    { min: 106, max: 115, anchor: 110, label: 'Looking Left-Up (10:30 PM)' },
    UP_2:       { min: 116, max: 125, anchor: 120, label: 'Looking Up (12 AM)' },
    CENTER:     { min: 126, max: 128, anchor: 128, label: 'Center (Neutral)' },
    SMILE:      { min: 129, max: 135, anchor: 135, label: 'Smiling 😊' }
  };

  // State
  let loadedFramesCount = 0;
  const frameImages = new Map(); // frameNum (1-based) -> Image
  let currentFrame = 128;        // Start at Center Neutral
  let targetFrame = 128;
  let activeState = 'CENTER';

  // Config
  const config = {
    smileDelayMs: 500,     // Time cursor must rest in center before breaking into smile
    centerDeadzone: 0.20,  // Normalized radius considered Center
    baseStepMs: 16         // Step interval per frame (~60 FPS)
  };

  // Cursor Tracking
  const mouse = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    smoothX: window.innerWidth / 2,
    smoothY: window.innerHeight / 2,
    normX: 0,
    normY: 0,
    distance: 0,
    clockDeg: 0,
    isInsideCenter: true,
    lastMoveTime: performance.now(),
    hasMoved: false
  };

  // Avatar framing metrics on canvas
  let avatarMetrics = {
    dw: 1920,
    dh: 1080,
    dx: 0,
    dy: 0,
    faceX: window.innerWidth / 2,
    faceY: window.innerHeight / 2
  };

  // Transition path currently active
  let activePath = [];

  // DOM Elements
  const canvas = document.getElementById('avatar-canvas');
  const ctx = canvas.getContext('2d');
  const ambientCanvas = document.getElementById('ambient-canvas');
  const ambientCtx = ambientCanvas ? ambientCanvas.getContext('2d') : null;
  const cursorGlow = document.getElementById('cursor-glow');
  const cursorDot = document.getElementById('cursor-dot');

  // High-Impact Editorial Split Loader Elements
  const splitLoader = document.getElementById('split-loader');
  const strokeNumTop = document.getElementById('stroke-num-top');
  const strokeNumBottom = document.getElementById('stroke-num-bottom');

  let isLoaderDismissed = false;
  let isLoaderReady = false;
  let displayedPercent = 0;
  let targetProgressPct = 0;
  let progressAnimFrame = null;
  let hasPausedAt78 = false;
  let isPausedAt78 = false;

  // ==========================================================================
  // 1. Transition Graph Construction & Dijkstra Pathfinding
  // ==========================================================================
  const graph = new Map();

  function initGraph() {
    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      graph.set(i, []);
    }

    // 1. Circular rotation 1 to 125
    for (let i = 1; i < 125; i++) {
      graph.get(i).push({ node: i + 1, weight: 1.0 });
      graph.get(i + 1).push({ node: i, weight: 1.0 });
    }

    // Loop closure: Frame 125 connects seamlessly to Frame 1 (both UP at 12:00)
    graph.get(125).push({ node: 1, weight: 1.0 });
    graph.get(1).push({ node: 125, weight: 1.0 });

    // 2. Center / Smile branch (126 to 135)
    for (let i = 126; i < 135; i++) {
      graph.get(i).push({ node: i + 1, weight: 1.0 });
      graph.get(i + 1).push({ node: i, weight: 1.0 });
    }

    // 3. Extended Frames (135 to 189)
    for (let i = 135; i < TOTAL_FRAMES; i++) {
      graph.get(i).push({ node: i + 1, weight: 1.0 });
      graph.get(i + 1).push({ node: i, weight: 1.0 });
    }

    // Bridge between 360-degree circle and Center branch:
    // Frame 125 (UP) connects to Frame 126 (lowering head to center)
    graph.get(125).push({ node: 126, weight: 1.0 });
    graph.get(126).push({ node: 125, weight: 1.0 });

    // Frame 1 (UP) also connects to Frame 126
    graph.get(1).push({ node: 126, weight: 1.2 });
    graph.get(126).push({ node: 1, weight: 1.2 });
  }

  function findShortestPath(start, end) {
    if (start === end) return [start];

    const distances = new Map();
    const prev = new Map();
    const queue = [{ node: start, dist: 0 }];
    distances.set(start, 0);

    while (queue.length > 0) {
      queue.sort((a, b) => a.dist - b.dist);
      const { node: u, dist: currentDist } = queue.shift();

      if (u === end) {
        const path = [];
        let curr = end;
        while (curr !== undefined) {
          path.unshift(curr);
          curr = prev.get(curr);
        }
        return path;
      }

      if (currentDist > (distances.get(u) ?? Infinity)) continue;

      const neighbors = graph.get(u) || [];
      for (const { node: v, weight } of neighbors) {
        const alt = currentDist + weight;
        if (alt < (distances.get(v) ?? Infinity)) {
          distances.set(v, alt);
          prev.set(v, u);
          queue.push({ node: v, dist: alt });
        }
      }
    }

    return [start, end];
  }

  initGraph();

  // ==========================================================================
  // 2. Responsive Framing & Ambient Infinite Blur Engine
  // ==========================================================================
  function updateAvatarFraming() {
    const cw = canvas.width;
    const ch = canvas.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const imgW = 1920;
    const imgH = 1080;
    const imgRatio = imgW / imgH; // ~1.777 (16:9)
    const screenRatio = cw / ch;

    // Dynamic focal point of face across frames:
    // In frames 1-135, face is centered (~0.50)
    // In scroll frames 136-189, face shifts to the right side (~0.82)
    let focalNormX = 0.50;
    let focalNormY = 0.38;

    if (currentFrame > 135) {
      const scrollRatio = Math.max(0, Math.min(1, (currentFrame - 135) / (TOTAL_FRAMES - 135)));
      focalNormX = lerp(0.50, 0.82, scrollRatio);
      focalNormY = lerp(0.38, 0.40, scrollRatio);
    }

    let dw, dh, dx, dy;

    if (screenRatio >= imgRatio) {
      // Wide / Ultrawide / Desktop Landscape: Fit sides edge-to-edge to the screen!
      // dw = cw so left side touches x=0 and right side touches x=cw with zero side gaps
      const scale = cw / imgW;
      dw = cw;
      dh = imgH * scale;
      dx = 0;
      // Keep hair and face naturally framed near top
      dy = Math.min(0, (ch - dh) * 0.10);
    } else {
      // Mobile / Portrait / Tablet: Fill height and intelligently center on the active face focal point
      const scale = ch / imgH;
      dw = imgW * scale;
      dh = ch;

      // On mobile / tall screens, dw > cw. Center screen around the active focal point
      const desiredScreenCenterX = cw * 0.5;
      const targetDx = desiredScreenCenterX - (focalNormX * dw);

      // Clamp so image covers viewport without creating empty gaps
      const minDx = cw - dw;
      const maxDx = 0;
      dx = Math.max(minDx, Math.min(maxDx, targetDx));
      dy = 0;
    }

    avatarMetrics = {
      dw,
      dh,
      dx,
      dy,
      faceX: (dx + focalNormX * dw) / dpr,
      faceY: (dy + focalNormY * dh) / dpr
    };
  }

  function resizeCanvas() {
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(sw * dpr);
    canvas.height = Math.round(sh * dpr);

    if (ambientCanvas) {
      ambientCanvas.width = 480;
      ambientCanvas.height = 270;
    }

    updateAvatarFraming();
    renderFrame(currentFrame);
  }

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', resizeCanvas);

  function renderAmbientBackdrop(imgA, imgB, blendT) {
    if (!ambientCanvas || !ambientCtx) return;
    const aw = ambientCanvas.width;
    const ah = ambientCanvas.height;

    ambientCtx.clearRect(0, 0, aw, ah);
    ambientCtx.globalAlpha = 1;
    ambientCtx.drawImage(imgA, 0, 0, aw, ah);

    if (imgB && imgB.complete && blendT > 0.005) {
      ambientCtx.globalAlpha = Math.min(1, blendT);
      ambientCtx.drawImage(imgB, 0, 0, aw, ah);
      ambientCtx.globalAlpha = 1;
    }
  }

  function applyEdgeFeathering() {
    const { dx, dy, dw, dh } = avatarMetrics;
    const cw = canvas.width;
    const ch = canvas.height;

    // Apply horizontal edge feathering when sharp frame has empty pillar space on sides
    if (dx > 1 || (dx + dw) < cw - 1) {
      const featherW = Math.min(160, dw * 0.12);
      const grad = ctx.createLinearGradient(dx, 0, dx + dw, 0);

      if (dx > 1) {
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(Math.min(0.25, featherW / dw), 'rgba(0,0,0,1)');
      } else {
        grad.addColorStop(0, 'rgba(0,0,0,1)');
      }

      if ((dx + dw) < cw - 1) {
        grad.addColorStop(Math.max(0.75, 1 - (featherW / dw)), 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        grad.addColorStop(1, 'rgba(0,0,0,1)');
      }

      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = grad;
      ctx.fillRect(dx, dy, dw, dh);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Apply vertical edge feathering if letterboxed on top/bottom
    if (dy > 1 || (dy + dh) < ch - 1) {
      const featherH = Math.min(120, dh * 0.10);
      const gradV = ctx.createLinearGradient(0, dy, 0, dy + dh);

      if (dy > 1) {
        gradV.addColorStop(0, 'rgba(0,0,0,0)');
        gradV.addColorStop(Math.min(0.25, featherH / dh), 'rgba(0,0,0,1)');
      } else {
        gradV.addColorStop(0, 'rgba(0,0,0,1)');
      }

      if ((dy + dh) < ch - 1) {
        gradV.addColorStop(Math.max(0.75, 1 - (featherH / dh)), 'rgba(0,0,0,1)');
        gradV.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        gradV.addColorStop(1, 'rgba(0,0,0,1)');
      }

      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = gradV;
      ctx.fillRect(dx, dy, dw, dh);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function renderFrame(frameIndex) {
    renderFrameBlended(frameIndex, frameIndex, 0);
  }

  function renderFrameBlended(frameA, frameB, blendT = 0) {
    updateAvatarFraming();

    const cw = canvas.width;
    const ch = canvas.height;

    // Clear sharp foreground canvas so ambient blur canvas shines through on the sides
    ctx.clearRect(0, 0, cw, ch);

    const imgA = frameImages.get(frameA) || findNearestLoadedImage(frameA);
    const imgB = (frameB && frameB !== frameA) ? (frameImages.get(frameB) || findNearestLoadedImage(frameB)) : null;

    if (!imgA || !imgA.complete) return;

    // 1. Draw dynamic ambient infinite blur backdrop
    renderAmbientBackdrop(imgA, imgB, blendT);

    // 2. Draw sharp foreground avatar
    if (!imgB || !imgB.complete || blendT <= 0.005) {
      ctx.globalAlpha = 1;
      ctx.drawImage(imgA, avatarMetrics.dx, avatarMetrics.dy, avatarMetrics.dw, avatarMetrics.dh);
    } else if (blendT >= 0.995) {
      ctx.globalAlpha = 1;
      ctx.drawImage(imgB, avatarMetrics.dx, avatarMetrics.dy, avatarMetrics.dw, avatarMetrics.dh);
    } else {
      // Photographic sub-frame cross-fade blend
      ctx.globalAlpha = 1;
      ctx.drawImage(imgA, avatarMetrics.dx, avatarMetrics.dy, avatarMetrics.dw, avatarMetrics.dh);

      ctx.globalAlpha = blendT;
      ctx.drawImage(imgB, avatarMetrics.dx, avatarMetrics.dy, avatarMetrics.dw, avatarMetrics.dh);
      ctx.globalAlpha = 1;
    }

    // 3. Feather edges so sharp image melts seamlessly into the infinite ambient blur
    applyEdgeFeathering();
  }

  function findNearestLoadedImage(targetIdx) {
    if (frameImages.has(targetIdx)) return frameImages.get(targetIdx);
    for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
      if (frameImages.has(targetIdx - offset)) return frameImages.get(targetIdx - offset);
      if (frameImages.has(targetIdx + offset)) return frameImages.get(targetIdx + offset);
    }
    return null;
  }

  // ==========================================================================
  // 3. Fast Progressive Frame Preloader
  // ==========================================================================
  function getFramePath(index) {
    const padded = String(index).padStart(3, '0');
    return `public/assets/frames/frame_${padded}.webp`;
  }

  function loadSingleFrame(index) {
    return new Promise((resolve) => {
      if (frameImages.has(index)) {
        resolve(frameImages.get(index));
        return;
      }
      const padded = String(index).padStart(3, '0');
      const img = new Image();
      img.src = getFramePath(index);
      img.onload = () => {
        frameImages.set(index, img);
        loadedFramesCount++;
        updateProgress();
        resolve(img);
      };
      img.onerror = () => {
        // Fallback 1: Root-relative assets path with webp
        const fallbackWebp = `assets/frames/frame_${padded}.webp`;
        img.src = fallbackWebp;
        img.onload = () => {
          frameImages.set(index, img);
          loadedFramesCount++;
          updateProgress();
          resolve(img);
        };
        img.onerror = () => {
          // Fallback 2: Legacy PNG fallback if webp is unavailable
          const fallbackPng = `public/assets/frames/frame_${padded}.png`;
          img.src = fallbackPng;
          img.onload = () => {
            frameImages.set(index, img);
            loadedFramesCount++;
            updateProgress();
            resolve(img);
          };
          img.onerror = () => resolve(null);
        };
      };
    });
  }

  // ==========================================================================
  // High-Impact Editorial Split Loader Engine (78% Fit Screen & Page Split)
  // ==========================================================================

  function setLoaderNumber(val) {
    const formatted = val >= 100 ? '100' : String(Math.floor(val)).padStart(2, '0');
    if (strokeNumTop) strokeNumTop.textContent = formatted;
    if (strokeNumBottom) strokeNumBottom.textContent = formatted;
  }

  function updateProgress() {
    targetProgressPct = Math.min(100, (loadedFramesCount / TOTAL_FRAMES) * 100);
    startSplitTimerLoop();
  }

  function startSplitTimerLoop() {
    if (progressAnimFrame) return;

    function step() {
      if (!isPausedAt78) {
        // If approaching 78% and haven't triggered the pause yet
        if (!hasPausedAt78 && displayedPercent >= 77.2 && displayedPercent < 78.5) {
          triggerPauseAt78();
        } else {
          // If haven't paused at 78 yet, cap advance at 78
          const maxAllowed = (!hasPausedAt78) ? 78 : targetProgressPct;
          const diff = Math.min(targetProgressPct, maxAllowed) - displayedPercent;

          if (diff > 0.05) {
            displayedPercent += Math.max(0.12, diff * 0.14);
          } else {
            displayedPercent = Math.min(targetProgressPct, maxAllowed);
          }

          const rounded = Math.floor(displayedPercent);
          setLoaderNumber(rounded);

          // Trigger pause at 78
          if (!hasPausedAt78 && rounded === 78) {
            triggerPauseAt78();
          }

          if (rounded >= 100 && !isLoaderReady) {
            markSplitLoaderReady();
          }
        }
      }

      if (!isLoaderDismissed) {
        progressAnimFrame = requestAnimationFrame(step);
      }
    }

    progressAnimFrame = requestAnimationFrame(step);
  }

  function triggerPauseAt78() {
    hasPausedAt78 = true;
    isPausedAt78 = true;
    displayedPercent = 78;
    setLoaderNumber(78);

    // Expand to fit entire screen!
    if (splitLoader) {
      splitLoader.classList.add('screen-fit');
    }

    // Hold at 78% while screen-fitting for ~850ms
    setTimeout(() => {
      resumeFromPauseAt78();
    }, 850);
  }

  function resumeFromPauseAt78() {
    if (!isPausedAt78) return;
    isPausedAt78 = false;

    // Scale down back to standard size and continue to 100
    if (splitLoader) {
      splitLoader.classList.remove('screen-fit');
    }
  }

  function markSplitLoaderReady() {
    if (isLoaderReady) return;
    isLoaderReady = true;

    displayedPercent = 100;
    setLoaderNumber(100);

    // Hold 100 briefly, then trigger the Number Break & Page Split!
    setTimeout(() => {
      triggerPageSplit();
    }, 280);
  }

  function triggerPageSplit() {
    if (isLoaderDismissed) return;
    isLoaderDismissed = true;

    if (progressAnimFrame) {
      cancelAnimationFrame(progressAnimFrame);
      progressAnimFrame = null;
    }

    // Trigger Page Split Animation (Top half slides UP, Bottom half slides DOWN, breaking the number)
    if (splitLoader) {
      splitLoader.classList.add('splitting');
    }

    // Remove from interaction tree once split curtains clear the screen
    setTimeout(() => {
      if (splitLoader) {
        splitLoader.style.display = 'none';
      }
    }, 950);
  }

  async function preloadAllFrames() {
    // Stage 1: Load main anchors across clock, center, and scroll sequence first for immediate interactivity
    const priorityIndices = [128, 135, 136, 155, 175, 189, 1, 10, 25, 42, 60, 70, 80, 95, 110, 120, 125];
    await Promise.all(priorityIndices.map(idx => loadSingleFrame(idx)));

    // Draw initial center neutral frame immediately
    renderFrame(currentFrame);

    // Stage 2: Stream remaining frames in batches
    const remaining = [];
    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      if (!priorityIndices.includes(i)) remaining.push(i);
    }

    const BATCH_SIZE = 16;
    for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
      const batch = remaining.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(idx => loadSingleFrame(idx)));
    }
  }

  // ==========================================================================
  // 4. Cursor Tracking & Clockwise Angle Mapping
  // ==========================================================================
  function updateCursorPosition(clientX, clientY) {
    mouse.x = clientX;
    mouse.y = clientY;
    mouse.lastMoveTime = performance.now();
    mouse.hasMoved = true;

    cursorGlow.classList.add('active');
    cursorDot.classList.add('active');

    // Vector relative to avatar face center on screen
    const offsetX = clientX - avatarMetrics.faceX;
    const offsetY = clientY - avatarMetrics.faceY;

    const halfWidth = window.innerWidth / 2;
    const halfHeight = window.innerHeight / 2;

    const normX = Math.max(-1, Math.min(1, offsetX / halfWidth));
    const normY = Math.max(-1, Math.min(1, offsetY / halfHeight));

    // Distance from center
    mouse.distance = Math.hypot(normX, normY);
    mouse.isInsideCenter = mouse.distance < config.centerDeadzone;

    // Clock angle in degrees where 12:00 is 0° and increases clockwise to 360°
    let clockDeg = (Math.atan2(offsetX, -offsetY) * 180 / Math.PI + 360) % 360;
    mouse.clockDeg = clockDeg;

    // Immediately update cursor dot position
    cursorDot.style.left = `${clientX}px`;
    cursorDot.style.top = `${clientY}px`;

  }

  // Map clock angle (0° to 360°) to the exact frame range
  function clockAngleToFrame(deg) {
    deg = (deg % 360 + 360) % 360;

    if (deg <= 22.5) {
      // 0° to 22.5°: UP (001 to 019)
      const t = deg / 22.5;
      return Math.round(1 + 18 * t);
    } else if (deg <= 67.5) {
      // 22.5° to 67.5°: UP RIGHT (020 to 029)
      const t = (deg - 22.5) / 45.0;
      return Math.round(20 + 9 * t);
    } else if (deg <= 112.5) {
      // 67.5° to 112.5°: RIGHT (030 to 055)
      const t = (deg - 67.5) / 45.0;
      return Math.round(30 + 25 * t);
    } else if (deg <= 157.5) {
      // 112.5° to 157.5°: RIGHT DOWN (056 to 065)
      const t = (deg - 112.5) / 45.0;
      return Math.round(56 + 9 * t);
    } else if (deg <= 202.5) {
      // 157.5° to 202.5°: DOWN (066 to 075)
      const t = (deg - 157.5) / 45.0;
      return Math.round(66 + 9 * t);
    } else if (deg <= 247.5) {
      // 202.5° to 247.5°: LEFT DOWN (076 to 085)
      const t = (deg - 202.5) / 45.0;
      return Math.round(76 + 9 * t);
    } else if (deg <= 292.5) {
      // 247.5° to 292.5°: LEFT (086 to 105)
      const t = (deg - 247.5) / 45.0;
      return Math.round(86 + 19 * t);
    } else if (deg <= 337.5) {
      // 292.5° to 337.5°: LEFT UP (106 to 115)
      const t = (deg - 292.5) / 45.0;
      return Math.round(106 + 9 * t);
    } else {
      // 337.5° to 360°: UP (116 to 125)
      const t = (deg - 337.5) / 22.5;
      return Math.round(116 + 9 * t);
    }
  }

  function evaluateTarget() {
    const now = performance.now();
    const timeSinceMove = now - mouse.lastMoveTime;

    // 1. Center / Idle Smiling Logic
    if (mouse.isInsideCenter || !mouse.hasMoved) {
      if (timeSinceMove >= config.smileDelayMs) {
        // Smiling state (129 to 135)
        if (activeState !== 'SMILE') {
          activeState = 'SMILE';
          cursorGlow.classList.add('smiling');
          cursorDot.classList.add('smiling');
        }
        const smileProgress = Math.min(1, (timeSinceMove - config.smileDelayMs) / 500);
        targetFrame = Math.round(lerp(129, 135, smileProgress));
        return;
      } else {
        // Center Neutral (128)
        if (activeState !== 'CENTER') {
          activeState = 'CENTER';
          cursorGlow.classList.remove('smiling');
          cursorDot.classList.remove('smiling');
        }
        targetFrame = 128;
        return;
      }
    }

    // 2. Cursor Outside Center -> Rotate Clockwise along the Clock
    if (activeState === 'SMILE') {
      cursorGlow.classList.remove('smiling');
      cursorDot.classList.remove('smiling');
      activeState = 'ROTATING';
    }

    targetFrame = clockAngleToFrame(mouse.clockDeg);
  }

  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  // ==========================================================================
  // 5. Scroll-to-Play Engine (Frames 136 to 189 over ~3 scrolls)
  // ==========================================================================
  const SCROLL_CONFIG = {
    // 3 standard mouse wheel turns (~120px each = 360px total distance)
    maxScroll: 360,
    damping: 0.14,
    anchorFrame: 135,   // Frame 135 acts as seamless bridge from cursor to scroll
    startFrame: 136,    // First frame of extended sequence
    endFrame: 189       // Final frame of sequence
  };

  let scrollTarget = 0;
  let scrollCurrent = 0;
  let isScrollMode = false;
  let scrollBlendWeight = 0; // 0 = cursor mode, 1 = scroll sequence mode
  let preScrollFrame = 128;
  let lastTouchY = null;

  function applyScrollDelta(delta) {
    if (!isLoaderDismissed) return;
    scrollTarget = Math.max(0, Math.min(SCROLL_CONFIG.maxScroll, scrollTarget + delta));
  }

  // ==========================================================================
  // 6. 60 FPS Render & Animation Loop
  // ==========================================================================
  let lastFrameStepTime = 0;

  function animationLoop(timestamp) {
    requestAnimationFrame(animationLoop);

    // Smooth cursor glow lag
    mouse.smoothX += (mouse.x - mouse.smoothX) * 0.14;
    mouse.smoothY += (mouse.y - mouse.smoothY) * 0.14;
    cursorGlow.style.left = `${mouse.smoothX}px`;
    cursorGlow.style.top = `${mouse.smoothY}px`;

    // Smooth scroll inertia / physics damping
    scrollCurrent += (scrollTarget - scrollCurrent) * SCROLL_CONFIG.damping;
    if (Math.abs(scrollTarget - scrollCurrent) < 0.08) {
      scrollCurrent = scrollTarget;
    }

    const hasActiveScroll = scrollTarget > 0 || scrollCurrent > 0.08;

    if (hasActiveScroll) {
      // --- SCROLL PLAY MODE (Frames 136 to 189) ---
      if (!isScrollMode) {
        isScrollMode = true;
        preScrollFrame = currentFrame;
        scrollBlendWeight = 0;
      }

      // Smoothly blend in from preScrollFrame into the scroll sequence
      scrollBlendWeight = Math.min(1, scrollBlendWeight + 0.14);

      // Map scroll 0 -> maxScroll to frames 135 -> 189
      // Frame 135 is the seamless bridge, blending immediately into 136..189
      const scrollT = Math.max(0, Math.min(1, scrollCurrent / SCROLL_CONFIG.maxScroll));
      const exactFrame = SCROLL_CONFIG.anchorFrame + scrollT * (SCROLL_CONFIG.endFrame - SCROLL_CONFIG.anchorFrame);

      const fFloor = Math.floor(exactFrame);
      const fCeil = Math.min(SCROLL_CONFIG.endFrame, fFloor + 1);
      const fFraction = exactFrame - fFloor;

      if (scrollBlendWeight < 0.99) {
        // Blend from the previous cursor face into the current scroll frame
        renderFrameBlended(preScrollFrame, fFloor, scrollBlendWeight);
      } else {
        // Full sub-frame continuous blending across frames 136-189
        renderFrameBlended(fFloor, fCeil, fFraction);
      }

      currentFrame = Math.round(exactFrame);
    } else {
      // --- CURSOR INTERACTIVE MODE (Frames 1 to 135) ---
      if (isScrollMode) {
        // Smoothly blend out from scroll sequence back to cursor frame
        scrollBlendWeight = Math.max(0, scrollBlendWeight - 0.14);
        if (scrollBlendWeight <= 0.01) {
          isScrollMode = false;
          scrollBlendWeight = 0;
        }
      }

      evaluateTarget();

      // Step through shortest path towards targetFrame
      if (currentFrame !== targetFrame) {
        if (activePath.length === 0 || activePath[activePath.length - 1] !== targetFrame) {
          activePath = findShortestPath(currentFrame, targetFrame);
          if (activePath.length > 0 && activePath[0] === currentFrame) {
            activePath.shift();
          }
        }

        if (activePath.length > 0) {
          const pathLen = activePath.length;
          const stepIntervalMs = pathLen > 18 ? 10 : (pathLen > 8 ? 14 : config.baseStepMs);

          if (timestamp - lastFrameStepTime >= stepIntervalMs) {
            lastFrameStepTime = timestamp;
            const nextFrame = activePath.shift();
            if (nextFrame !== undefined) {
              currentFrame = nextFrame;
            }
          }
        }
      }

      if (scrollBlendWeight > 0.01) {
        // Blend transition back from anchor 135 to current cursor frame
        renderFrameBlended(currentFrame, SCROLL_CONFIG.anchorFrame, scrollBlendWeight);
      } else {
        renderFrame(currentFrame);
      }
    }
  }

  // ==========================================================================
  // 7. User Event Listeners
  // ==========================================================================
  window.addEventListener('mousemove', (e) => {
    updateCursorPosition(e.clientX, e.clientY);
  });

  window.addEventListener('mouseleave', () => {
    cursorGlow.classList.remove('active');
    cursorDot.classList.remove('active');
    // Return to center neutral when mouse leaves window
    updateCursorPosition(avatarMetrics.faceX, avatarMetrics.faceY);
  });

  // Wheel Scroll Interaction (~3 scrolls from 136 to 189)
  window.addEventListener('wheel', (e) => {
    if (!isLoaderDismissed) return;

    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 28;      // Lines mode
    else if (e.deltaMode === 2) delta *= 300; // Pages mode

    applyScrollDelta(delta);
  }, { passive: true });

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (!isLoaderDismissed) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      applyScrollDelta(120);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      applyScrollDelta(-120);
    }
  });

  // Touch Support (Touchscreen laptops, Tablets, Phones)
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      lastTouchY = touch.clientY;
      updateCursorPosition(touch.clientX, touch.clientY);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      if (lastTouchY !== null && isLoaderDismissed) {
        const dy = lastTouchY - touch.clientY;
        lastTouchY = touch.clientY;
        if (Math.abs(dy) > 1) {
          applyScrollDelta(dy * 1.6);
        }
      }
      updateCursorPosition(touch.clientX, touch.clientY);
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    lastTouchY = null;
    updateCursorPosition(avatarMetrics.faceX, avatarMetrics.faceY);
  });

  // Click Ripple & Smile Reaction
  window.addEventListener('pointerdown', (e) => {
    if (isLoaderReady && !isLoaderDismissed) {
      triggerPageSplit();
    }

    const ripple = document.createElement('div');
    ripple.className = 'click-ripple';
    ripple.style.left = `${e.clientX}px`;
    ripple.style.top = `${e.clientY}px`;
    const size = Math.max(60, Math.min(140, window.innerWidth * 0.1));
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);

    // Trigger smile reaction on click if not actively scrolling
    if (!isScrollMode) {
      activeState = 'SMILE';
      targetFrame = 135;
      mouse.lastMoveTime = performance.now();
    }
  });

  // ==========================================================================
  // 8. Initialize
  // ==========================================================================
  async function init() {
    resizeCanvas();
    // Start animation loop immediately
    requestAnimationFrame(animationLoop);
    // Preload frames progressively
    await preloadAllFrames();
  }

  init();

})();
