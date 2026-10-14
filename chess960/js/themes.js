// Theme definition: UI copy + 3D world settings (lighting, materials, effects).
(function (C) {
  'use strict';

  const THEME = {
    id: 'neon', label: 'NEON',
    title: 'CYBER//CHESS 960', tag: '// FISCHER RANDOM PROTOCOL v2.0',
    sides: { w: 'CYAN', b: 'MAGENTA' },
    world: {
      bg: '#05040b', fog: { color: '#0b0618', near: 20, far: 55 }, exposure: 0.85,
      hemi: { sky: '#6b5cff', ground: '#0a0410', intensity: 0.3 },
      key: { color: '#b9c4ff', intensity: 1.6, pos: [4, 12, 8] },
      rims: [
        { color: '#00f0ff', intensity: 45, pos: [-7, 3, 4] },
        { color: '#ff2bd6', intensity: 45, pos: [7, 3, -4] },
      ],
      tiles: {
        light: { color: '#211c44', rough: 0.18, metal: 0.7 },
        dark: { color: '#07060f', rough: 0.12, metal: 0.85 },
        edge: '#00f0ff',
      },
      frame: { color: '#0b0a14', rough: 0.2, metal: 0.9, trim: '#ff2bd6', trimGlow: 3 },
      pieces: {
        w: { color: '#8fd3df', rough: 0.22, metal: 0.45, accent: '#00f0ff' },
        b: { color: '#2a0a26', rough: 0.18, metal: 0.75, accent: '#ff2bd6' },
      },
      hl: { select: '#f9f871', move: '#00f0ff', capture: '#ff2bd6', last: '#7a5cff', check: '#ff1744' },
      particles: { color: '#00f0ff', color2: '#ff2bd6', count: 600, size: 0.07, rise: 0.25 },
      envIntensity: 0.45,
      bloom: { strength: 0.8, radius: 0.5, threshold: 1.0 },
      hover: true,
    },
  };

  function initThemes() {
    document.documentElement.dataset.theme = THEME.id;
    document.getElementById('title').textContent = THEME.title;
    document.getElementById('tag').textContent = THEME.tag;
    document.title = THEME.title.replace('//', ' ');
    document.dispatchEvent(new CustomEvent('themechange', { detail: THEME }));
  }

  Object.assign(C, {
    THEMES: [THEME],
    initThemes,
    currentTheme: () => THEME,
    sideName: (color) => THEME.sides[color],
  });
})(window.Chess960 = window.Chess960 || {});
