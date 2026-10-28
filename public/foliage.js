/** Colour-selected foliage movement inside the original scene art. */
(() => {
  if (
    !window.WEDDING.botanicals?.enabled ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return;
  const vertex = `attribute vec2 p; varying vec2 uv; void main(){uv=vec2((p.x+1.)*.5,1.-(p.y+1.)*.5);gl_Position=vec4(p,0.,1.);}`;
  const fragment = `precision mediump float;
    uniform sampler2D image; uniform float time; uniform float strength; varying vec2 uv;
    float foliage(vec3 c){
      float green=smoothstep(.008,.065,c.g-c.r)*smoothstep(-.035,.045,c.g-c.b);
      float olive=smoothstep(.055,.14,c.g-c.b)*(1.-smoothstep(.025,.085,c.r-c.g));
      float flower=smoothstep(.035,.12,c.r-c.g)*smoothstep(.012,.075,c.b-c.g);
      return max(max(green,olive),flower);
    }
    void main(){
      vec3 original=texture2D(image,uv).rgb;
      // Nearby leaves share a breeze but differ in timing and direction.
      float phase=uv.x*18.+uv.y*13.;
      float breeze=sin(time*1.08+phase)*.66+sin(time*.61+uv.y*23.)*.34;
      float flutter=sin(time*2.1+uv.x*39.+uv.y*28.)*.13;
      vec2 offset=vec2((breeze+flutter)*strength,sin(time*.92+phase)*strength*.32);
      vec3 moved=texture2D(image,clamp(uv+offset,vec2(0.),vec2(1.))).rgb;
      gl_FragColor=vec4(mix(original,moved,max(foliage(original),foliage(moved))),1.);
    }`;
  const renderers = [];
  function setup(img) {
    const canvas = document.createElement('canvas');
    canvas.className = 'living-scene';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) return;
    try {
      function compile(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw Error('Foliage shader unavailable');
        return shader;
      }
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      );
      const pos = gl.getAttribLocation(program, 'p');
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      canvas.width = Math.min(img.naturalWidth, 768);
      canvas.height = Math.round((canvas.width * img.naturalHeight) / img.naturalWidth);
      gl.viewport(0, 0, canvas.width, canvas.height);
      const clock = gl.getUniformLocation(program, 'time');
      gl.uniform1f(
        gl.getUniformLocation(program, 'strength'),
        (window.WEDDING.botanicals.sceneWindStrength ?? 0.0065) *
          (window.WEDDING.botanicals.motionScale ?? 1)
      );
      const state = {
        visible: false,
        draw(time) {
          gl.useProgram(program);
          gl.uniform1f(clock, time);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        },
      };
      const observer = new IntersectionObserver(
        (entries) => (state.visible = entries[0].isIntersecting)
      );
      observer.observe(img.closest('.scene'));
      state.draw(0);
      img.after(canvas);
      renderers.push(state);
    } catch {
      canvas.remove();
    }
  }
  document.querySelectorAll('.backdrop').forEach((img) => {
    if (img.complete && img.naturalWidth) setup(img);
    else img.addEventListener('load', () => setup(img), { once: true });
  });
  let previous = 0;
  function frame(now) {
    if (now - previous >= 16) {
      previous = now;
      if (!document.hidden && !document.body.classList.contains('has-palace-intro'))
        renderers.forEach((renderer) => {
          if (renderer.visible) renderer.draw(now / 1000);
        });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
