import * as THREE from "three";

const pixelRatio = () => Math.min(devicePixelRatio, 1.8);

/**
 * A see-through channel from the camera to the selected region. Anatomy between
 * the two is pushed sideways (points) or cut away (surfaces), so the region stays
 * visible from any angle. The same uniform objects are shared by every material.
 */
export interface ViewGap {
  gapFocus: { value: THREE.Vector3 };
  /** Channel radius near the camera, in scene units; it narrows to 75% at the focus. */
  gapRadius: { value: number };
  /** 0 closed, 1 fully open. */
  gapAmount: { value: number };
}
export function createViewGap(radius = 0.9): ViewGap {
  return { gapFocus: { value: new THREE.Vector3() }, gapRadius: { value: radius }, gapAmount: { value: 0 } };
}

// Anatomy in front of the focus moves aside; anatomy behind it dims, so the region
// stands out against the far side of the head. Anything within about 0.3 units of
// the focus depth stays, so the region keeps its immediate surroundings.
const GAP_GLSL = `uniform vec3 gapFocus;uniform float gapRadius;uniform float gapAmount;
void gapFrame(vec3 p,out vec3 outward,out float dist,out float radius,out float front,out float back){vec3 axis=gapFocus-cameraPosition;float focusDist=max(length(axis),1e-3);axis/=focusDist;vec3 rel=p-cameraPosition;float along=dot(rel,axis);vec3 perp=rel-axis*along;dist=length(perp);outward=dist>1e-4?perp/dist:vec3(0.0,1.0,0.0);radius=gapRadius*mix(1.0,0.75,clamp(along/focusDist,0.0,1.0));front=gapAmount*smoothstep(0.0,0.4,along)*(1.0-smoothstep(focusDist-0.5,focusDist-0.2,along));back=gapAmount*smoothstep(focusDist+0.2,focusDist+0.6,along);}
vec3 gapDisplace(vec3 p,out float fade){vec3 outward;float dist,radius,front,back;gapFrame(p,outward,dist,radius,front,back);float inside=max(radius-dist,0.0);fade=(1.0-0.5*front*inside/radius)*(1.0-0.7*back*(1.0-smoothstep(radius*0.6,radius,dist)));return p+outward*front*inside*1.25;}
float gapMask(vec3 p){vec3 outward;float dist,radius,front,back;gapFrame(p,outward,dist,radius,front,back);return max(front,0.7*back)*(1.0-smoothstep(radius*0.7,radius,dist));}
`;

/** Cut translucent surfaces where they fall inside the view gap. */
export function applyViewGap(material: THREE.MeshPhongMaterial, gap: ViewGap) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, gap);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGapWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGapWorld=(modelMatrix*vec4(transformed,1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vGapWorld;\n${GAP_GLSL}`)
      .replace("#include <alphamap_fragment>", "#include <alphamap_fragment>\ndiffuseColor.a*=1.0-gapMask(vGapWorld);");
  };
}

/** Soft round points for anatomy clouds. Pass a view gap to have them move out of its way. */
export function pointMaterial(size: number, opacity: number, additive = true, gap: ViewGap = createViewGap()) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { pointSize: { value: size }, opacity: { value: opacity }, pixelRatio: { value: pixelRatio() }, ...gap },
    vertexShader: `attribute vec3 color; varying vec3 vColor; varying float vGap; uniform float pointSize; uniform float pixelRatio; ${GAP_GLSL} void main(){vColor=color;vec4 world=modelMatrix*vec4(position,1.0);world.xyz=gapDisplace(world.xyz,vGap);vec4 mv=viewMatrix*world;gl_PointSize=clamp(pointSize*pixelRatio*16.0/-mv.z,1.0,22.0);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vColor; varying float vGap; uniform float opacity; void main(){float d=length(gl_PointCoord-0.5)*2.0;if(d>1.0)discard;float a=pow(1.0-d,1.8);gl_FragColor=vec4(vColor,a*opacity*vGap);\n#include <colorspace_fragment>\n}`,
  });
}

/** Skull points brighten at grazing angles so the outline reads from any view. */
export function skullPointMaterial(gap: ViewGap = createViewGap()) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: { opacity: { value: 0.7 }, pointSize: { value: 1.3 }, pixelRatio: { value: pixelRatio() }, ...gap },
    vertexShader: `attribute float brightness; varying float vOpacity; uniform float pointSize; uniform float pixelRatio; ${GAP_GLSL} void main(){float fade;vec4 world=modelMatrix*vec4(position,1.0);world.xyz=gapDisplace(world.xyz,fade);vec4 mv=viewMatrix*world;vec3 n=normalize(normalMatrix*normal);float rim=pow(1.0-abs(dot(n,normalize(-mv.xyz))),.8);vOpacity=(.16+.84*rim)*brightness*fade;gl_PointSize=clamp(pointSize*pixelRatio*18.0/-mv.z,1.0,12.0*pixelRatio);gl_Position=projectionMatrix*mv;}`,
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
