/**
 * Fullscreen Interactive Avatar & Cursor Effect (135 Frames)
 * Clockwise Rotation: 12 PM (UP) -> 3 PM (RIGHT) -> 6 PM (DOWN) -> 9 PM (LEFT) -> 12 AM (UP)
 * Plus Center Neutral & Warm Smile Interaction
 */

(() => {
  'use strict';

  const TOTAL_FRAMES = 135;

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
  const cursorGlow = document.getElementById('cursor-glow');
  const cursorDot = document.getElementById('cursor-dot');
  const topLoader = document.getElementById('top-loader');
  const topLoaderBar = document.getElementById('top-loader-bar');

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
  // 2. Responsive Canvas Sizing (MacBook, PC, 4K, Ultrawide, Mobile)
  // ==========================================================================
  function resizeCanvas() {
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(sw * dpr);
    canvas.height = Math.round(sh * dpr);

    const cw = canvas.width;
    const ch = canvas.height;

    const imgW = 1920;
    const imgH = 1080;
    const imgRatio = imgW / imgH; // ~1.777 (16:9)
    const screenRatio = cw / ch;

    let dw, dh, dx, dy;

    if (screenRatio >= imgRatio) {
      // Screen is wider than 16:9 (16:9 standard, 21:9 ultrawide, 32:9)
      // Scale by height so the head and torso are fully framed
      dh = ch;
      dw = ch * imgRatio;
      dx = (cw - dw) / 2;
      dy = 0;
    } else {
      // Screen is taller than 16:9 (MacBook 16:10, 3:2, iPad 4:3, mobile)
      // Scale by width and keep hair comfortably below the top edge
      const scale = Math.max(cw / imgW, ch / imgH);
      dw = imgW * scale;
      dh = imgH * scale;
      dx = (cw - dw) / 2;
      dy = (ch - dh) * 0.18; // 18% offset keeps head/hair (Y=71..94) visible
    }

    avatarMetrics = {
      dw,
      dh,
      dx,
      dy,
      // Face center coordinates converted back to screen CSS pixels
      faceX: (dx + 948 * (dw / imgW)) / dpr,
      faceY: (dy + 410 * (dh / imgH)) / dpr
    };

    renderFrame(currentFrame);
  }

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', resizeCanvas);

  function renderFrame(frameIndex) {
    let img = frameImages.get(frameIndex) || findNearestLoadedImage(frameIndex);
    if (!img || !img.complete) return;

    const cw = canvas.width;
    const ch = canvas.height;

    // Fill background with exact frame border tone (#ebe7e0) for seamless edges
    ctx.fillStyle = '#ebe7e0';
    ctx.fillRect(0, 0, cw, ch);

    ctx.drawImage(img, avatarMetrics.dx, avatarMetrics.dy, avatarMetrics.dw, avatarMetrics.dh);
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
    return `public/assets/frames/frame_${padded}.png`;
  }

  function loadSingleFrame(index) {
    return new Promise((resolve) => {
      if (frameImages.has(index)) {
        resolve(frameImages.get(index));
        return;
      }
      const img = new Image();
      img.src = getFramePath(index);
      img.onload = () => {
        frameImages.set(index, img);
        loadedFramesCount++;
        updateProgress();
        resolve(img);
      };
      img.onerror = () => {
        const fallbackSrc = `assets/frames/frame_${String(index).padStart(3, '0')}.png`;
        img.src = fallbackSrc;
        img.onload = () => {
          frameImages.set(index, img);
          loadedFramesCount++;
          updateProgress();
          resolve(img);
        };
        img.onerror = () => resolve(null);
      };
    });
  }

  function updateProgress() {
    const pct = Math.round((loadedFramesCount / TOTAL_FRAMES) * 100);
    topLoaderBar.style.width = `${pct}%`;
    if (pct >= 100) {
      setTimeout(() => {
        topLoader.classList.add('fade-out');
        setTimeout(() => { topLoader.style.display = 'none'; }, 500);
      }, 250);
    }
  }

  async function preloadAllFrames() {
    // Stage 1: Load main anchors across clock and center first for immediate interactivity
    const priorityIndices = [128, 135, 1, 10, 25, 42, 60, 70, 80, 95, 110, 120, 125];
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
  // 5. 60 FPS Render & Path Stepper Loop
  // ==========================================================================
  let lastFrameStepTime = 0;

  function animationLoop(timestamp) {
    requestAnimationFrame(animationLoop);

    // Smooth cursor glow lag
    mouse.smoothX += (mouse.x - mouse.smoothX) * 0.14;
    mouse.smoothY += (mouse.y - mouse.smoothY) * 0.14;
    cursorGlow.style.left = `${mouse.smoothX}px`;
    cursorGlow.style.top = `${mouse.smoothY}px`;

    evaluateTarget();

    // Step through shortest path towards targetFrame
    if (currentFrame !== targetFrame) {
      // Re-route shortest path if destination changed
      if (activePath.length === 0 || activePath[activePath.length - 1] !== targetFrame) {
        activePath = findShortestPath(currentFrame, targetFrame);
        if (activePath.length > 0 && activePath[0] === currentFrame) {
          activePath.shift();
        }
      }

      if (activePath.length > 0) {
        // Dynamic step speed based on distance to keep animation fluid and responsive
        const pathLen = activePath.length;
        const stepIntervalMs = pathLen > 18 ? 10 : (pathLen > 8 ? 14 : config.baseStepMs);

        if (timestamp - lastFrameStepTime >= stepIntervalMs) {
          lastFrameStepTime = timestamp;
          const nextFrame = activePath.shift();
          if (nextFrame !== undefined) {
            currentFrame = nextFrame;
            renderFrame(currentFrame);
          }
        }
      }
    }
  }

  // ==========================================================================
  // 6. User Event Listeners
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

  // Touch Support (Mac trackpad / Touchscreen laptops / Tablets / Phones)
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      updateCursorPosition(touch.clientX, touch.clientY);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      updateCursorPosition(touch.clientX, touch.clientY);
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    // Return to center neutral & smile
    updateCursorPosition(avatarMetrics.faceX, avatarMetrics.faceY);
  });

  // Click Ripple & Smile Reaction
  window.addEventListener('pointerdown', (e) => {
    const ripple = document.createElement('div');
    ripple.className = 'click-ripple';
    ripple.style.left = `${e.clientX}px`;
    ripple.style.top = `${e.clientY}px`;
    const size = Math.max(60, Math.min(140, window.innerWidth * 0.1));
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);

    // Trigger smile reaction on click
    activeState = 'SMILE';
    targetFrame = 135;
    mouse.lastMoveTime = performance.now();
  });

  // ==========================================================================
  // 7. Initialize
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
