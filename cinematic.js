(() => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const intro = document.querySelector('#cinematic-intro');
  const seenKey = 'datamind-cinematic-v1';

  function playIntro() {
    if (motion.matches || document.hidden || (location.hash && location.hash !== '#home')) return;
    if (!intro?.showModal || !CSS.supports('clip-path', 'inset(0)')) return;

    let storage;
    for (const key of ['localStorage', 'sessionStorage']) {
      try {
        const candidate = window[key];
        if (candidate.getItem(seenKey)) return;
        candidate.setItem(seenKey, '1');
        storage = candidate;
        break;
      } catch {
        // Fall back to session storage when persistent storage is unavailable.
      }
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
      try { storage?.removeItem(seenKey); } catch { /* Storage can become unavailable mid-session. */ }
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

  playIntro();
  enablePortraitDepth();
})();
