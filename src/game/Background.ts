import * as THREE from 'three';
import { CONFIG } from '../constants';

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
uniform float uTime;
uniform vec2 uResolution;
varying vec2 vUv;

// Simplex 2D noise
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// FBM
float fbm(vec2 p) {
    float f = 0.0;
    float w = 0.5;
    for (int i = 0; i < 5; i++) {
        f += w * snoise(p);
        p *= 2.0;
        w *= 0.5;
    }
    return f;
}

void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    
    // Animate coordinates
    float time = uTime * 0.1;
    
    // Warp the domain for liquid effect
    vec2 q = vec2(fbm(uv + time * 0.5), fbm(uv + vec2(5.2, 1.3) + time * 0.4));
    vec2 r = vec2(fbm(uv + 4.0 * q + vec2(1.7, 9.2) + time * 0.4), fbm(uv + 4.0 * q + vec2(8.3, 2.8) + time * 0.3));
    
    // Final noise value
    float f = fbm(uv + 6.0 * r);
    
    // Color mapping
    // Deep, dark abyss colors: Black, Dark Teal, Deep Violet
    vec3 colorA = vec3(0.05, 0.05, 0.08); // Very dark blue-gray
    vec3 colorB = vec3(0.1, 0.05, 0.15); // Dark violet
    vec3 colorC = vec3(0.0, 0.1, 0.15); // Dark teal highlight
    
    // Mix based on noise features
    vec3 col = mix(colorA, colorB, smoothstep(-1.0, 1.0, q.x));
    col = mix(col, colorC, smoothstep(0.0, 1.0, r.y));
    
    // Highlight ridges
    float ridge = smoothstep(0.6, 1.0, f);
    col += ridge * vec3(0.1, 0.2, 0.3) * 0.5;
    
    // Vignette
    float vig = 1.0 - length(uv * 0.5);
    col *= smoothstep(0.0, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
}
`;

export class Background {
    public mesh: THREE.Mesh;
    private material: THREE.ShaderMaterial;

    constructor() {
        // Full screen quad geometry
        const geometry = new THREE.PlaneGeometry(2, 2);

        this.material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(1, 1) }
            },
            depthWrite: false,
            depthTest: false
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.frustumCulled = false; // Always render
        this.mesh.renderOrder = -1; // Background
    }

    public update(dt: number) {
        this.material.uniforms.uTime.value += dt;
    }
}
