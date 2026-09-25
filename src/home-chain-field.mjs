import * as THREE from "three";

// Decorative chain-shaped light paths, deliberately independent of model
// spikes, block confirmations, and wallet state.
export function createChainField() {
  const uniforms = {
    aspect: { value: 1 },
    anchor: { value: new THREE.Vector2(0.72, 0.27) },
    landing: { value: new THREE.Vector2(0.72, 0.27) },
    alpha: { value: 0 },
    pulse: { value: 0 },
    time: { value: 0 },
  };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,.99,1.);}`,
      fragmentShader: `
      varying vec2 vUv;uniform float aspect,alpha,pulse,time;uniform vec2 anchor,landing;
      float segment(vec2 p,vec2 a,vec2 b){vec2 d=b-a;float t=clamp(dot(p-a,d)/dot(d,d),0.,1.);return length(p-a-d*t);}
      float route(vec2 p,vec2 a,vec2 b){float d=segment(p,a,b);return 1.-smoothstep(.0006,.0022,d);}
      float node(vec2 p,vec2 a){float d=length(p-a);return exp(-d*480.)+exp(-d*80.)*.1;}
      void main(){
        vec2 p=(vUv-anchor)*vec2(aspect,3.8);
        if(p.y>.10||p.y<-.98)discard;
        float lines=0.;float nodes=0.;
        for(int i=0;i<7;i++){
          float n=float(i);float side=mod(n,2.)*2.-1.;float reach=.13+n*.095;
          vec2 a=vec2(side*reach,-.06-n*.032);
          vec2 b=a+vec2(side*(.15+n*.035),-.02-n*.018);
          vec2 c=b+vec2(side*.20,-.12-n*.018);
          lines+=route(p,vec2(0.),a)*.48+route(p,a,b)*.7+route(p,b,c)*.4;
          nodes+=node(p,a)*.4+node(p,b)*.65;
        }
        float footprint=exp(-length(p)*100.);
        vec2 arrival=(vUv-landing)*vec2(aspect,3.8);
        float radius=(1.-pulse)*.72;
        float ring=(1.-smoothstep(.002,.008,abs(length(arrival)-radius)))*pulse;
        float ambience=.78+.12*sin(time*.7);
        float ground=(1.-smoothstep(-.025,.02,p.y))*smoothstep(-.95,-.15,p.y);
        float right=smoothstep(.15,.55,vUv.x);
        float a=(lines*.27+nodes*.6)*ground*right*ambience;
        a+=footprint*.8+ring*.3*right;
        gl_FragColor=vec4(1.,.65,.07,clamp(a*alpha,0.,.65));
      }`,
    }),
  );
  mesh.renderOrder = 0;
  return {
    mesh,
    update({ aspect, anchorX, floor, landingX, alpha, pulse, time }) {
      uniforms.aspect.value = aspect;
      uniforms.anchor.value.set(anchorX, floor);
      uniforms.landing.value.set(landingX, floor);
      uniforms.alpha.value = alpha;
      uniforms.pulse.value = pulse;
      uniforms.time.value = time;
      mesh.visible = alpha > 0.002;
    },
  };
}

export function createIdentityParticles() {
  const uniforms = {
    fold: { value: 0 },
    alpha: { value: 0 },
    time: { value: 0 },
    pixel: { value: 1 },
  };
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float seed;varying float a;uniform float fold,alpha,time,pixel;
      void main(){
        vec3 p=position;float drift=sin(fold*3.14159);float theta=seed*43.+time*.13;
        p*=1.-fold*.96;
        p+=vec3(cos(theta),sin(theta)*.7,sin(theta+1.))*drift*(.08+seed*.2);
        p.xy+=vec2(cos(theta),sin(theta))*fold*.014;
        vec4 q=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*q;
        gl_PointSize=(.8+seed*1.4)*pixel;a=alpha*(.35+seed*.65);
      }`,
    fragmentShader: `varying float a;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(1.,.69,.18,a*(1.-d));}`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 7;
  let loaded = false;
  return {
    points,
    setPositions(positions) {
      const current = geometry.getAttribute("position");
      if (current?.array.length === positions.length) {
        current.array.set(positions);
        current.needsUpdate = true;
      } else {
        const seeds = Float32Array.from(
          { length: positions.length / 3 },
          (_, i) => ((i * 137) % 997) / 997,
        );
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
      }
      loaded = true;
    },
    update({ fold, alpha, time, pixel }) {
      points.visible = loaded && alpha > 0.002;
      uniforms.fold.value = fold;
      uniforms.alpha.value = alpha;
      uniforms.time.value = time;
      uniforms.pixel.value = pixel;
    },
  };
}
