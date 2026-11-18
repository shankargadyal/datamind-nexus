(() => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const intro = document.querySelector('#cinematic-intro');

  function playIntro() {
    if (motion.matches || (location.hash && location.hash !== '#home')) return;
    if (!intro?.showModal || !CSS.supports('clip-path', 'inset(0)')) return;

    if (document.hidden) {
      const startWhenVisible = () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', startWhenVisible);
        playIntro();
      };
      document.addEventListener('visibilitychange', startWhenVisible);
      return;
    }

    const title = intro.querySelector('.intro-name');
    let delay = .54;
    for (const word of ['SHANKAR', 'GADYAL']) {
      const group = document.createElement('span');
      group.className = 'intro-word';
      for (const letter of word) {
        const face = document.createElement('span');
        face.className = 'intro-letter';
        face.textContent = letter;
        face.dataset.letter = letter;
        face.style.setProperty('--letter-delay', delay.toFixed(2) + 's');
        delay += .063;
        group.append(face);
      }
      title.append(group);
    }

    const listeners = new AbortController();
    const { signal } = listeners;
    let watchdog;
    const close = () => { if (intro.open) intro.close(); };
    intro.addEventListener('close', () => {
      clearTimeout(watchdog);
      listeners.abort();
      document.documentElement.classList.remove('intro-playing');
      intro.remove();
      document.querySelector('.hero .headline')?.focus({ preventScroll: true });
    }, { once: true });
    intro.querySelector('.intro-skip').addEventListener('click', close, { signal });
    intro.addEventListener('animationend', event => {
      if (event.target === intro && event.animationName === 'intro-exit') close();
    }, { signal });
    motion.addEventListener('change', event => { if (event.matches) close(); }, { signal });

    try {
      intro.showModal();
      document.documentElement.classList.add('intro-playing');
      watchdog = window.setTimeout(close, 5900);
    } catch {
      close();
      listeners.abort();
      document.documentElement.classList.remove('intro-playing');
    }
  }

  function enablePortraitDepth() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const frame = document.querySelector('.portrait-frame');
    const reset = () => {
      frame.style.removeProperty('--portrait-x');
      frame.style.removeProperty('--portrait-y');
    };
    frame.addEventListener('pointermove', event => {
      if (motion.matches) return;
      const bounds = frame.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - .5;
      const y = (event.clientY - bounds.top) / bounds.height - .5;
      frame.style.setProperty('--portrait-x', (-y * 7) + 'deg');
      frame.style.setProperty('--portrait-y', (x * 7) + 'deg');
    }, { passive: true });
    frame.addEventListener('pointerleave', reset);
    motion.addEventListener('change', reset);
  }

  function createPipelineBackground() {
    const canvas = document.querySelector('.pipeline-background');
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const spine = [[286, 398], [356, 398], [430, 324], [572, 324], [652, 244], [756, 244], [824, 176], [960, 176]];
    const branches = [
      [[248, 232], [334, 232], [430, 324]],
      [[572, 324], [636, 388], [790, 388], [862, 460], [960, 460]],
      [[652, 244], [652, 134], [740, 46], [960, 46]],
      [[756, 244], [810, 298], [960, 298]],
      [[482, 324], [482, 474], [572, 564], [776, 564], [838, 626], [960, 626]]
    ];
    const nodes = [[430, 324], [572, 324], [652, 244], [756, 244], [824, 176]];
    const scale = canvas.width / 960;
    const length = spine.slice(1).reduce((total, [x, y], index) =>
      total + Math.hypot(x - spine[index][0], y - spine[index][1]), 0);

    function trace(points, color, width = 1) {
      ctx.beginPath();
      ctx.moveTo(...points[0]);
      points.slice(1).forEach(point => ctx.lineTo(...point));
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    function diamond(x, y, size, color) {
      trace([[x - size, y], [x, y - size], [x + size, y], [x, y + size], [x - size, y]], color);
    }

    return position => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, 960, 700);
      ctx.translate(0, -44 * position);
      for (let x = 160; x < 1150; x += 55) {
        trace([[x, 0], [x - 700, 700]], 'rgba(240,240,240,.075)');
        trace([[x - 700, 0], [x, 700]], 'rgba(240,240,240,.065)');
      }
      branches.forEach(path => trace(path, 'rgba(230,230,230,.19)'));
      trace(spine, 'rgba(235,235,235,.29)', 1.5);
      nodes.forEach(([x, y]) => {
        diamond(x, y, 17, 'rgba(235,235,235,.18)');
        diamond(x, y, 8, 'rgba(235,235,235,.52)');
      });
      ctx.setLineDash([46, length]);
      ctx.lineDashOffset = -(length - 46) * (.12 + .88 * position);
      trace(spine, 'rgba(255,255,255,.72)', 2);
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    };
  }

  function enableScrollDepth(drawBackground) {
    const panels = [...document.querySelectorAll('.portrait-frame, .project .gallery[data-gallery]')];
    let frame = 0;
    let listeners;

    function update() {
      frame = 0;
      const viewportHeight = window.innerHeight;
      // Measure the stationary frames before changing any of their children.
      const depth = panels.map(panel => {
        const { top, height } = panel.getBoundingClientRect();
        const position = (viewportHeight - height - 2 * top) / (viewportHeight + height);
        return Math.max(-1, Math.min(1, position)).toFixed(3);
      });
      panels.forEach((panel, index) => {
        if (panel.style.getPropertyValue('--scroll-depth') !== depth[index]) {
          panel.style.setProperty('--scroll-depth', depth[index]);
        }
      });
      const scrollRange = document.documentElement.scrollHeight - viewportHeight;
      const progress = scrollRange > 0 ? window.scrollY / scrollRange : 0;
      drawBackground?.(Math.max(0, Math.min(1, progress)));
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    function syncMotion() {
      listeners?.abort();
      window.cancelAnimationFrame(frame);
      frame = 0;
      document.documentElement.classList.toggle('scroll-depth-enabled', !motion.matches);
      if (motion.matches) {
        drawBackground?.(0);
        return;
      }

      listeners = new AbortController();
      const options = { passive: true, signal: listeners.signal };
      window.addEventListener('scroll', schedule, options);
      window.addEventListener('resize', schedule, options);
      window.addEventListener('pageshow', schedule, options);
      schedule();
    }

    motion.addEventListener('change', syncMotion);
    syncMotion();
  }

  playIntro();
  enablePortraitDepth();
  enableScrollDepth(createPipelineBackground());
})();
