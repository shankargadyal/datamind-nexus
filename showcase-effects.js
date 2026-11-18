import { mountNeuralBackground } from './neural-bg.js';

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const compact = matchMedia('(max-width: 767px)');
const intro = document.querySelector('#cinematic-intro');
const neuralHost = document.querySelector('#nx-bg');
const orb = document.querySelector('#nova-orb');
const send = document.querySelector('#nova-send');
const accent = '#4cc9f0';
let engine;

function loadThree() {
  return engine ??= import('./vendor/three/three.module.min.js').catch(() => null);
}

function syncVisibility() {
  document.documentElement.classList.toggle('motion-paused', document.hidden);
}
document.addEventListener('visibilitychange', syncVisibility);
syncVisibility();

function afterIntro(callback) {
  if (intro?.open) intro.addEventListener('close', callback, { once: true });
  else callback();
}

afterIntro(async () => {
  if (document.hidden) {
    await new Promise(resolve => {
      function onVisible() {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', onVisible);
        resolve();
      }
      document.addEventListener('visibilitychange', onVisible);
    });
  }
  const THREE = await loadThree();
  if (THREE) mountNeuralBackground(THREE, neuralHost, motion, compact);
});

const orbit = document.querySelector('.skills-orbit');
new IntersectionObserver(([entry]) => orbit.classList.toggle('is-visible', entry.isIntersecting)).observe(orbit);

const visibleMotifs = new Set();
const views = new Map();
let renderer;
let novaView;
let renderUnavailable = false;
let frame = 0;
let motifsDirty = false;

function createView(THREE, host) {
  if (renderUnavailable) return;
  if (!renderer) {
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      renderUnavailable = true;
      return;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) return;
  host.append(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 30);
  const group = new THREE.Group();
  scene.add(group);
  return { host, canvas, context, scene, camera, group };
}

function projectView(THREE, host) {
  const view = createView(THREE, host);
  if (!view) return;
  const { camera, scene, group } = view;
  camera.position.set(0, .15, 6.8);
  const lamp = new THREE.DirectionalLight('#e9f3fa', 2.35);
  lamp.position.set(-2, 4, 5);
  scene.add(lamp, new THREE.AmbientLight('#aec8dd', 1.3));
  const mesh = (geometry, color, x = 0, y = 0, z = 0) => {
    const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .42 }));
    object.position.set(x, y, z);
    group.add(object);
    return object;
  };

  switch (host.dataset.motif) {
    case 'datamind': {
      const path = Array.from({ length: 5 }, (_, i) => new THREE.Vector3(
        (i - 2) * .79, Math.sin(i * 1.45) * .3, (i % 2) * -.4
      ));
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(path),
        new THREE.LineBasicMaterial({ color: accent })));
      const node = new THREE.IcosahedronGeometry(.22, 0);
      path.forEach((p, i) => mesh(node, i === 2 ? '#f2f4f8' : accent, p.x, p.y, p.z));
      break;
    }
    case 'finsight': {
      const heights = [.4, .7, .48, .98, 1.25, .62, .92, .76, 1.22, 1.46, .5, .78, .69, 1.11, 1.65];
      heights.forEach((height, i) => {
        const x = (i % 5 - 2) * .56;
        const z = (Math.floor(i / 5) - 1) * .47;
        mesh(new THREE.BoxGeometry(.27, height, .23), i % 4 === 2 ? '#6c8496' : accent, x, height / 2 - .8, z);
        mesh(new THREE.BoxGeometry(.035, height + .24, .035), '#f2f4f8', x, height / 2 - .8, z);
      });
      break;
    }
    case 'customeriq':
      ['#3ddc97', accent, '#ffb454'].forEach((color, cluster) => {
        const dots = new Float32Array(21 * 3);
        for (let i = 0; i < 21; i++) {
          const angle = i * 2.39996;
          const radius = .55 * Math.sqrt(i / 21);
          dots.set([cluster * 1.05 - 1.05 + Math.cos(angle) * radius,
            Math.sin(angle) * radius + Math.sin(cluster * 2.8) * .33, Math.cos(i * 1.7) * .45], i * 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(dots, 3));
        group.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: .07 })));
      });
      break;
    case 'creditiq': {
      mesh(new THREE.TorusGeometry(.78, .055, 8, 42, Math.PI * 1.55), '#64788b').rotation.z = -.25 * Math.PI;
      mesh(new THREE.TorusGeometry(.78, .075, 8, 32, Math.PI * 1.13), accent).rotation.z = .23 * Math.PI;
      mesh(new THREE.BoxGeometry(.045, .68, .06), '#ffb454', .16, .25, .07).rotation.z = -.55;
      mesh(new THREE.SphereGeometry(.095, 10, 8), '#f2f4f8', 0, 0, .08);
      break;
    }
  }
  return view;
}

function orbView(THREE) {
  const view = createView(THREE, orb);
  if (!view) return;
  view.camera.position.z = 4;
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, busy: { value: 0 }, tint: { value: new THREE.Color(accent) } },
    vertexShader: `
      varying vec3 normalView;
      varying vec3 objectPosition;
      void main() {
        objectPosition = position;
        normalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      varying vec3 normalView;
      varying vec3 objectPosition;
      uniform float time, busy;
      uniform vec3 tint;
      void main() {
        vec3 n = normalize(normalView);
        float rim = pow(1. - max(0., n.z), 2.1);
        float light = max(0., dot(n, normalize(vec3(-.45, .65, 1.))));
        float wave = sin(12. * objectPosition.y + 4. * objectPosition.x - time * 4.);
        float pulse = 1. + busy * (.26 + .22 * sin(time * 6.));
        vec3 color = tint * (.15 + .48 * light + .3 * rim + .19 * wave) * pulse;
        gl_FragColor = vec4(color, 1.);
        #include <colorspace_fragment>
      }
    `
  });
  view.group.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material));
  view.uniforms = material.uniforms;
  return view;
}

function paint(view) {
  const { host, canvas, context, scene, camera } = view;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(host.clientWidth * dpr);
  const height = Math.round(host.clientHeight * dpr);
  if (!width || !height) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  if (renderer.domElement.width !== width || renderer.domElement.height !== height) {
    renderer.setSize(width, height, false);
  }
  renderer.render(scene, camera);
  context.clearRect(0, 0, width, height);
  context.drawImage(renderer.domElement, 0, 0);
}

function render(time) {
  frame = 0;
  if (document.hidden) return;
  if (motifsDirty) {
    motifsDirty = false;
    for (const host of visibleMotifs) {
      const view = views.get(host);
      if (!view || compact.matches) continue;
      const rect = host.getBoundingClientRect();
      const scroll = motion.matches ? 0 : (rect.top + rect.height / 2) / innerHeight - .5;
      view.group.rotation.set(.26 + scroll * .5, -.32 + scroll * .9, 0);
      paint(view);
    }
  }
  if (!novaView || !orb.clientWidth) return;
  const pulse = send.disabled && !motion.matches;
  novaView.uniforms.busy.value = pulse ? 1 : 0;
  novaView.uniforms.time.value = pulse ? time / 1000 : 0;
  paint(novaView);
  if (pulse) schedule();
}

function schedule() {
  if (!frame && !document.hidden) frame = requestAnimationFrame(render);
}

function redrawMotifs() {
  motifsDirty = true;
  schedule();
}

async function loadMotifs() {
  if (document.hidden || compact.matches || !visibleMotifs.size) return;
  const THREE = await loadThree();
  if (!THREE || document.hidden || compact.matches) return;
  for (const host of visibleMotifs) {
    if (!views.has(host)) views.set(host, projectView(THREE, host));
  }
  redrawMotifs();
}

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting) visibleMotifs.add(entry.target);
    else visibleMotifs.delete(entry.target);
  }
  loadMotifs();
});
document.querySelectorAll('.project-motif').forEach(host => observer.observe(host));

async function syncNova() {
  orb.classList.toggle('is-busy', send.disabled);
  if (!novaView && !document.hidden && (send.disabled || !compact.matches)) {
    const THREE = await loadThree();
    if (THREE && !novaView && !document.hidden) novaView = orbView(THREE);
  }
  schedule();
}

new MutationObserver(syncNova).observe(send, { attributes: true, attributeFilter: ['disabled'] });
afterIntro(syncNova);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
  } else {
    loadMotifs();
    syncNova();
  }
});
window.addEventListener('scroll', () => { if (visibleMotifs.size && !motion.matches) redrawMotifs(); }, { passive: true });
window.addEventListener('resize', redrawMotifs, { passive: true });
motion.addEventListener('change', redrawMotifs);
compact.addEventListener('change', () => { loadMotifs(); syncNova(); });
