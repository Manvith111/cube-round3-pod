'use client';

import { useEffect, useRef } from 'react';

/**
 * Aurora Borealis "Untitled Blend" Engine
 * Colors:
 * - RAIN MIST:     #000000 (cosmic black sky)
 * - BAMBOO HAZE:   #6BFF86 (auroral emerald green)
 * - SHRIMP BROWN:  #773C30 (horizon lower fringe)
 * - PINE LEAF:     #00FFAA (upper ionosphere ray cyan)
 *
 * Light Mode adaptation:
 * - Soft daybreak mist (#F1F5F9 porcelain) with delicate pearlescent morning aurora wash.
 */
export default function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) return;

    const activeCanvas: HTMLCanvasElement = canvas;
    const activeGl: WebGLRenderingContext = gl;

    const vsSource = `
      attribute vec2 a_pos;
      void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision highp float;
      uniform vec2 u_res;
      uniform float u_time;
      uniform float u_isDark;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_res.xy;
        float aspect = u_res.x / u_res.y;
        vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

        float t = u_time * 0.28;

        if (u_isDark > 0.5) {
          // DARK MODE: MUTED AURORA PALETTE (readable green, not fluorescent)
          vec3 rainMist = vec3(0.0, 0.0, 0.0);           // #000000
          vec3 bambooHaze = vec3(0.255, 0.62, 0.36);     // muted emerald ~#41A05C
          vec3 shrimpBrown = vec3(0.38, 0.185, 0.145);   // #613019
          vec3 pineLeaf = vec3(0.0, 0.58, 0.44);        // muted cyan ~#009470

          // S-curve flowing curtain arch
          float arc1 = 0.14 * sin(p.x * 1.5 + t * 0.75) + 0.07 * cos(p.x * 2.8 - t * 0.45);
          float arc2 = 0.06 * sin(p.x * 3.6 - t * 0.6) + 0.03 * cos(p.x * 5.1 + t * 0.9);
          float arcY = -0.06 + arc1 + arc2;

          float distY = p.y - arcY;

          // Vertical fluted curtain rays
          float ray1 = noise(vec2(p.x * 28.0 + t * 0.35, p.y * 2.5));
          float ray2 = noise(vec2(p.x * 64.0 - t * 0.65, p.y * 4.5));
          float rays = pow(ray1 * 0.6 + ray2 * 0.4, 1.9) * 1.5;

          // Lower fringe warm shrimp brown
          float brownFringe = smoothstep(-0.25, -0.02, distY) * smoothstep(0.08, -0.04, distY) * 0.7;

          // Emerald Bamboo Haze body
          float greenCore = smoothstep(-0.06, 0.14, distY) * smoothstep(0.42, 0.06, distY);

          // Pine leaf cyan vertical upper rays
          float cyanRays = smoothstep(0.04, 0.52, distY) * rays * 0.75;

          vec3 col = rainMist;
          col += shrimpBrown * brownFringe * (0.7 + 0.4 * rays);
          col += bambooHaze * greenCore * (0.75 + 0.55 * rays);
          col += pineLeaf * cyanRays;

          // Subtle night sky stars
          float stars = pow(hash(gl_FragCoord.xy + vec2(19.0, 71.0)), 420.0) * 0.55;
          col += vec3(stars);

          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        } else {
          // LIGHT MODE: BOLD AURORA — unmistakable warm/cool bands on a blue-grey sky
          vec3 skyBase  = vec3(0.62, 0.67, 0.78);   // #9EABC7 deeper slate sky
          vec3 amber    = vec3(0.98, 0.72, 0.38);   // #FAB761 vivid warm amber
          vec3 rose     = vec3(0.92, 0.52, 0.58);   // #EB8595 warm rose-blush
          vec3 lilac    = vec3(0.70, 0.60, 0.90);   // #B299E6 deeper lilac

          // Two overlapping animated curtain arches
          float arc1 = 0.22 * sin(p.x * 1.2 + t * 0.38) + 0.10 * cos(p.x * 2.4 - t * 0.28);
          float arc2 = 0.06 * sin(p.x * 3.8 - t * 0.52) + 0.04 * cos(p.x * 5.5 + t * 0.65);
          float arcY = 0.08 + arc1 + arc2;
          float distY = p.y - arcY;

          // Curtain rays — finer vertical fluting
          float ray1 = noise(vec2(p.x * 22.0 + t * 0.28, p.y * 2.2));
          float ray2 = noise(vec2(p.x * 50.0 - t * 0.45, p.y * 4.0));
          float rays = pow(ray1 * 0.58 + ray2 * 0.42, 1.5) * 1.4;

          // Wide amber curtain body
          float amberCore = smoothstep(-0.28, 0.08, distY) * smoothstep(0.55, 0.05, distY);

          // Rose fringe below amber
          float roseFringe = smoothstep(-0.42, -0.06, distY) * smoothstep(0.0, -0.18, distY);

          // Lilac upper curtain rays
          float lilacRays = smoothstep(0.06, 0.60, distY) * rays * 0.80;

          vec3 col = skyBase;
          col = mix(col, amber, amberCore * (0.72 + 0.38 * rays));
          col = mix(col, rose,  roseFringe * 0.68);
          col = mix(col, lilac, lilacRays);

          // Soft atmospheric darkening at very bottom
          col = mix(col, skyBase * 0.82, smoothstep(0.6, 1.0, uv.y) * 0.35);

          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      }
    `;

    function createShader(type: number, source: string) {
      const shader = activeGl.createShader(type);
      if (!shader) return null;
      activeGl.shaderSource(shader, source);
      activeGl.compileShader(shader);
      if (!activeGl.getShaderParameter(shader, activeGl.COMPILE_STATUS)) {
        activeGl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vs = createShader(activeGl.VERTEX_SHADER, vsSource);
    const fs = createShader(activeGl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const program = activeGl.createProgram();
    if (!program) return;
    activeGl.attachShader(program, vs);
    activeGl.attachShader(program, fs);
    activeGl.linkProgram(program);
    if (!activeGl.getProgramParameter(program, activeGl.LINK_STATUS)) return;

    activeGl.useProgram(program);

    const buffer = activeGl.createBuffer();
    activeGl.bindBuffer(activeGl.ARRAY_BUFFER, buffer);
    activeGl.bufferData(activeGl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), activeGl.STATIC_DRAW);

    const posLoc = activeGl.getAttribLocation(program, 'a_pos');
    activeGl.enableVertexAttribArray(posLoc);
    activeGl.vertexAttribPointer(posLoc, 2, activeGl.FLOAT, false, 0, 0);

    const resLoc = activeGl.getUniformLocation(program, 'u_res');
    const timeLoc = activeGl.getUniformLocation(program, 'u_time');
    const isDarkLoc = activeGl.getUniformLocation(program, 'u_isDark');

    let animId = 0;
    const startTime = performance.now();

    function resize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const canvasWidth = Math.round(width * dpr);
      const canvasHeight = Math.round(height * dpr);

      if (activeCanvas.width !== canvasWidth || activeCanvas.height !== canvasHeight) {
        activeCanvas.width = canvasWidth;
        activeCanvas.height = canvasHeight;
        activeGl.viewport(0, 0, canvasWidth, canvasHeight);
      }
    }

    window.addEventListener('resize', resize);
    resize();

    function render() {
      const now = performance.now();
      const elapsed = (now - startTime) * 0.001;
      const isDark = document.documentElement.classList.contains('dark') ? 1.0 : 0.0;

      activeGl.uniform2f(resLoc, activeCanvas.width, activeCanvas.height);
      activeGl.uniform1f(timeLoc, prefersReducedMotion ? 1.0 : elapsed);
      activeGl.uniform1f(isDarkLoc, isDark);

      activeGl.drawArrays(activeGl.TRIANGLES, 0, 3);

      if (!prefersReducedMotion) {
        animId = requestAnimationFrame(render);
      }
    }

    render();

    const observer = new MutationObserver(() => {
      render();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      observer.disconnect();
      activeGl.deleteProgram(program);
      activeGl.deleteShader(vs);
      activeGl.deleteShader(fs);
      activeGl.deleteBuffer(buffer);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full -z-30 pointer-events-none transition-opacity duration-700"
      />
      {/* Film grain noise overlay from template */}
      <div
        className="fixed inset-0 -z-20 pointer-events-none opacity-[0.22] dark:opacity-[0.29] mix-blend-overlay"
        style={{
          backgroundImage: `url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAQAElEQVR4AUzdBZQn1dEF8KqObZz4ZmPEiW/ckyFKnBAjvsQFWdxhcXf3xd3dF3d3d3d33vd+Nae/k5wzZ2b63/1e1a17b9XrITA8//zzbZ555mkLL7xw+9KXvtS23Xbb9otf/KL99a9/bbNmzWobbrhhO+ecc9r888/fllpqqTZjxoy20047tVVWWaUtuuiibffdd28LLbRQe+tb31o/f+Yzn2knnnhi23LLLeue1VZbrU2fPr3W2nXXXdvrX//62mPJJZdsF1xwQfvsZz/b3v/+97e99tqr/fjHP26un3DCCbWGnycmJmqfP/zhD23ppZdu6623Xrvnnnvasssu2+add95a6/vf/3777ne/W18rrbRSxe7+tddeu62wwgpt5syZbfvtt28f/ehH2+9+97v2pz/9qf3zn/9s66yzTsV93333tbPOOqt98IMfbPPNN1+ztt+POeaYtskmm9QeL3nJS9rmm2/e/v3vf7ePfOQjzdo777xz22yzzWrfv/3tb+3AAw9sO+ywQ+WwTl/bs/b7xz/+UfusscYabfbs2W2BBRYojK+++ur/x+k3v/lNO+WUU9qHPvShtuqqqxaW//3vf5sYYLnmmmu2k046qXK5/fbb20YbbdTk6EvN7P2tb32r3XzzzU1c4vH7UUcdVdj7+ZBDDmlbbLFF+9znPteuv/76dvnllxcGYhL3nDlzmnqJd7vttmv77rtv++lPf9oWW2yx+u7nH/3oR00sX/3qV9sf//jH+lp33XXbyiuv3JZbbrkG/9VXX71dfPHFhY2fl1lmmfapT32qYncvjN/ylre0RRZZpO255571zN///vemjldeeWXbZpttal2f48YRRxzRrDFt2rT229/+tlnzL3/5S11TS7VQO3yxjtrKCWflIX7xwRKvX/nKVzZr4h+s1dA9nsP3ww47rFn/1ltvbXCT669//evCze+77LJLYSJXnLjmmmtKJ/a+8cYb69m3v/3thfU73vGOprZ4rE5HHnlk/f6DH/yguIKbZ555ZtVWbmp0+umnNxrYcccdi3tbbbVVW3/99RttbdL5qC7i/c9//tMefvjhur711lsXZup33HHHFe9PO+200vbJJ5/cDj300Lb88su373znO7W/mHFh6AHEBz7wgXj00UejgxydSLHBBhvEF77whZg6dW0gcZuu+0Wb37zm2OJJZaIJ554IvrDcd5550VPLl544YXoZK+f99lnn7jkkkuiBxHvete74rrrrotzzz03PvzhD8f+++8fvYC1R2ut1jr66KNjjz32iD//+c9xww03RBdWdEOK448/Pl7+8pfXHl2c0YkWL774YrziFa+IHnR0oONtb3tbdBOKq666qmLvhIpe5Jh77rmjFzJ6waIXMC688MLoRIq77rorurCjE6U+60WNLrbYZZddKt83vvGN8a9//av2FSsMxGD9Sy+9NA466KCKpxtgdKOqdZ566qnwmf189eLGGWecEb0w0YsUn//85yvOBRdcMGbPnh29IPHJT34y7r333vrqgoo777wzelHjVa96VWElVhjApRO4cHnooYeiC6Vw7UYWnXSRmRVrN6SYNWtW1UjNuhnXM/DvphxiWnzxxaOLs2K11rvf/e7oAgi1v+OOO6KLLm666abowq/6b7zxxnHttddGN6R4+umn4+Mf/3h04473ve990QkUX//61+MrX/lK5aamnWDxzne+M6ZMmRJdcNGJWpieeuqpxRdYTJ8+Pb74xS9GN6742Mc+VjX6yU9+EmLshK/71BkOF110Ua0lbs90gQbO9AZV12Hu+te+9rXKFVYzZswoHvYmEXPmzKkYP/3pT1csYjz77LOLA67hXW9SVVP8hhvuqTlOq1NvboEjclenRx55pOp+2223hTVoQH7wwfNuzvHqV7+6atkFGM8++2zF0I01umFHN+qqoZjli59qSm/ilTM+d+EXJ/fee+9aDz8uu+yy6IYS3fji/PPPL431BhVyFks3rXB/N4HS3LHHHhs4140uYEYHeN7NKXCqN4fSAn0PhN27Z3ziE5+oDbsLRXeb6F02pk+fHr3bV5EUGDF8jlyI/NhjjxVRuquWkL/3ve9Fd6bo00QI8L3vfW+BhTTf/OY3oztrAE1gvQsUsXo3jO6GRQ4iJjpgbLrpplUwZoI09nOdCSEqggIWIArV3b+S725bJsPUxCPJPrlE73rxzDPPlHkhQO/oBejhhx9eJHn88cdLlAynd5UicnfeUEwxETCTADYCy0P+zEDhYPPLX/4yxEhYfTopTBAMiV73uteVYBioz3xnZIjsefG89KUvLQNkTF/+8pfL3OAuVzVBnl133bXuIWQY965Spvjzn/+8C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)`,
          backgroundSize: '256px 256px',
          imageRendering: 'pixelated',
        }}
      />
    </>
  );
}
