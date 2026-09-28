import * as THREE from "three";

const pixelRatio = () => Math.min(devicePixelRatio, 1.8);

/** Soft round points for anatomy clouds. */
export function pointMaterial(size: number, opacity: number, additive = true) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { pointSize: { value: size }, opacity: { value: opacity }, pixelRatio: { value: pixelRatio() } },
    vertexShader: `attribute vec3 color; varying vec3 vColor; uniform float pointSize; uniform float pixelRatio; void main(){vColor=color;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=clamp(pointSize*pixelRatio*16.0/-mv.z,1.0,22.0);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vColor; uniform float opacity; void main(){float d=length(gl_PointCoord-0.5)*2.0;if(d>1.0)discard;float a=pow(1.0-d,1.8);gl_FragColor=vec4(vColor,a*opacity);\n#include <colorspace_fragment>\n}`,
  });
}

/** Skull points brighten at grazing angles so the outline reads from any view. */
export function skullPointMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: { opacity: { value: 0.7 }, pointSize: { value: 1.3 }, pixelRatio: { value: pixelRatio() } },
    vertexShader: `attribute float brightness; varying float vOpacity; uniform float pointSize; uniform float pixelRatio; void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vec3 n=normalize(normalMatrix*normal);float rim=pow(1.0-abs(dot(n,normalize(-mv.xyz))),.8);vOpacity=(.16+.84*rim)*brightness;gl_PointSize=clamp(pointSize*pixelRatio*18.0/-mv.z,1.0,12.0*pixelRatio);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying float vOpacity; uniform float opacity; void main(){float d=length(gl_PointCoord-0.5)*2.0;if(d>1.0)discard;gl_FragColor=vec4(vec3(.94,.95,.97),pow(1.0-d,1.5)*opacity*vOpacity);\n#include <colorspace_fragment>\n}`,
  });
}

// A luminous core and a soft skirt make activity readable without enlarging anatomy.
export function activityMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { pointScale: { value: 1 }, pixelRatio: { value: pixelRatio() } },
    vertexShader: `attribute vec3 color; attribute float size; varying vec3 vColor; uniform float pointScale; uniform float pixelRatio; void main(){vColor=color;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=clamp(size*pointScale*pixelRatio*32.0/-mv.z,2.5*pixelRatio,24.0*pixelRatio);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vColor; void main(){float d=length(gl_PointCoord-0.5)*2.0;if(d>1.0)discard;float core=exp(-d*d*32.0);float glow=exp(-d*d*5.0)*(1.0-smoothstep(.7,1.0,d));gl_FragColor=vec4(vColor*(1.0+core*.45),core*.8+glow*.24);\n#include <colorspace_fragment>\n}`,
  });
}

/** Selected-region highlight: small points drawn over everything, tinted and pulsed. */
export function highlightMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    uniforms: { color: { value: new THREE.Color("#bda0ff") }, pulse: { value: 0.575 }, pixelRatio: { value: pixelRatio() } },
    vertexShader: `uniform float pixelRatio; void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=clamp(1.8*pixelRatio*20.0/-mv.z,1.0*pixelRatio,5.0*pixelRatio);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform vec3 color; uniform float pulse; void main(){float d=length(gl_PointCoord-0.5)*2.0;if(d>1.0)discard;float core=exp(-d*d*9.0);gl_FragColor=vec4(mix(color,vec3(1.0),.12),core*pulse);\n#include <colorspace_fragment>\n}`,
  });
}
