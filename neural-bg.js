// Pointer attraction, twinkle, and distance-based links adapted from neural-bg.html.
export function mountNeuralBackground(THREE, host, motion, compact) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return;
  }

  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 100);
  camera.position.z = 9;
  const cloud = new THREE.Group();
  scene.add(cloud);

  const box = [9, 5, 4];
  const nodes = Array.from({ length: 90 }, () => ({
    position: box.map(bound => (Math.random() * 2 - 1) * bound),
    velocity: box.map(() => (Math.random() - .5) * .006)
  }));
  const hot = new Float32Array(nodes.length);
  const pointPositions = new Float32Array(nodes.length * 3);
  const pointColors = new Float32Array(pointPositions.length);
  const linkPositions = new Float32Array(nodes.length * 6 * 6);
  const linkColors = new Float32Array(linkPositions.length);
  const tint = new THREE.Color('#4cc9f0');
  const pointer = new THREE.Vector2();
  const target = new THREE.Vector2();

  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 32;
  const brush = sprite.getContext('2d');
  const halo = brush.createRadialGradient(16, 16, 0, 16, 16, 16);
  halo.addColorStop(0, '#f2f4f8');
  halo.addColorStop(.32, 'rgba(242,244,248,.68)');
  halo.addColorStop(1, 'rgba(242,244,248,0)');
  brush.fillStyle = halo;
  brush.fillRect(0, 0, 32, 32);

  const pointGeometry = geometry(pointPositions, pointColors);
  const linkGeometry = geometry(linkPositions, linkColors);
  const glow = { vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const points = new THREE.Points(pointGeometry, new THREE.PointsMaterial({
    ...glow, size: .29, map: new THREE.CanvasTexture(sprite)
  }));
  const links = new THREE.LineSegments(linkGeometry, new THREE.LineBasicMaterial(glow));
  points.frustumCulled = links.frustumCulled = false;
  cloud.add(points, links);

  function geometry(positions, colors) {
    const shape = new THREE.BufferGeometry();
    shape.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    shape.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    return shape;
  }

  function colorAt(buffer, offset, intensity) {
    buffer[offset] = tint.r * intensity;
    buffer[offset + 1] = tint.g * intensity;
    buffer[offset + 2] = tint.b * intensity;
  }

  function draw(time) {
    const still = motion.matches;
    const count = compact.matches ? 45 : nodes.length;
    const distance = compact.matches ? 2.8 : 2.5;
    const halfHeight = Math.tan(camera.fov * Math.PI / 360) * camera.position.z;
    pointer.lerp(target, .07);
    const mx = pointer.x * halfHeight * camera.aspect;
    const my = pointer.y * halfHeight;

    for (let i = 0; i < count; i++) {
      const { position, velocity } = nodes[i];
      const dx = mx - position[0];
      const dy = my - position[1];
      hot[i] = still ? 0 : Math.max(0, 1 - Math.hypot(dx, dy) / 2.6);
      if (!still) {
        position[0] += dx * .004 * hot[i];
        position[1] += dy * .004 * hot[i];
        for (let axis = 0; axis < 3; axis++) {
          position[axis] += velocity[axis];
          if (Math.abs(position[axis]) > box[axis]) velocity[axis] = -Math.sign(position[axis]) * Math.abs(velocity[axis]);
        }
      }
      pointPositions.set(position, i * 3);
      colorAt(pointColors, i * 3, .45 + .25 * Math.sin(time * .0015 + i) + hot[i] * .9);
    }

    let total = 0;
    const limit = count * 6;
    for (let i = 0; i < count && total < limit; i++) {
      const a = nodes[i].position;
      for (let j = i + 1; j < count && total < limit; j++) {
        const b = nodes[j].position;
        const length = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (length > distance) continue;
        const strength = (1 - length / distance) * (.28 + (hot[i] + hot[j]) * .7);
        linkPositions.set(a, total * 6);
        linkPositions.set(b, total * 6 + 3);
        colorAt(linkColors, total * 6, strength);
        colorAt(linkColors, total * 6 + 3, strength);
        total++;
      }
    }

    pointGeometry.setDrawRange(0, count);
    linkGeometry.setDrawRange(0, total * 2);
    for (const shape of [pointGeometry, linkGeometry]) {
      shape.attributes.position.needsUpdate = true;
      shape.attributes.color.needsUpdate = true;
    }
    cloud.rotation.set(still ? 0 : -pointer.y * .12, still ? 0 : pointer.x * .22 + Math.sin(time * .00005) * .15, 0);
    renderer.render(scene, camera);
  }

  let frame = 0;
  let last = -Infinity;
  function animate(time) {
    if (time - last >= 31) {
      draw(time);
      last = time;
    }
    frame = requestAnimationFrame(animate);
  }

  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (document.hidden) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, compact.matches ? 1.25 : 2));
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    camera.aspect = host.clientWidth / Math.max(host.clientHeight, 1);
    camera.updateProjectionMatrix();
    if (motion.matches) draw(0);
    else frame = requestAnimationFrame(animate);
  }

  window.addEventListener('pointermove', event => {
    if (!motion.matches && !compact.matches && event.pointerType !== 'touch') {
      target.set(event.clientX / innerWidth * 2 - 1, 1 - event.clientY / innerHeight * 2);
    }
  }, { passive: true });
  window.addEventListener('pointerout', event => {
    if (!event.relatedTarget) target.set(0, 0);
  }, { passive: true });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', sync, { passive: true });
  motion.addEventListener('change', sync);
  compact.addEventListener('change', sync);
  sync();
}
