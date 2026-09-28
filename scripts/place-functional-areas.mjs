// Places visual areas that the atlas does not segment (MT, FFA, PPA, …) on the
// atlas surface. Each area starts from a typical group-average MNI coordinate,
// is mapped into scene units by matching the MNI brain box to the atlas cerebrum
// box, and is then snapped to the nearest vertex of the gyrus or sulcus it lies in.
// The result is approximate: these areas vary by several millimetres between people.
//
// Usage: node scripts/place-functional-areas.mjs
import { readFile, writeFile } from "node:fs/promises";

const atlas = JSON.parse(await readFile("src/data/atlas-data.json", "utf8"));
const provenance = JSON.parse(await readFile("provenance/anatomy.json", "utf8"));

// Approximate MNI152 brain extent in millimetres (x right, y anterior, z superior).
const MNI_MIN = [-70, -104, -45];
const MNI_MAX = [70, 70, 78];

// Left hemisphere, to match the rest of the vision route.
const areas = {
  mt: {
    mni: [-44, -72, 6],
    mesh: "Anterior_occipital_sulcus*l",
    basis: "hMT+/V5 lies where the ascending limb of the inferior temporal sulcus meets the lateral occipital sulcus (Dumoulin et al., 2000).",
  },
  eba: {
    mni: [-50, -70, 0],
    mesh: "Middle_temporal_gyrusl",
    basis: "Lateral occipitotemporal cortex, next to and partly overlapping hMT+ (Downing et al., 2001).",
  },
  it: {
    mni: [-50, -35, -20],
    mesh: "Inferior_temporal_sulcusl",
    basis: "Lateral inferior temporal cortex, anterior to the category-selective fusiform areas (Grill-Spector & Weiner, 2014).",
  },
  ffa: {
    mni: [-40, -52, -20],
    mesh: "Lateral_occipitotemporal_gyrusl",
    basis: "Mid-fusiform gyrus (Kanwisher et al., 1997; Grill-Spector & Weiner, 2014). Usually larger in the right hemisphere.",
  },
  ppa: {
    mni: [-27, -44, -10],
    mesh: "Collateral_sulcusl",
    basis: "Posterior parahippocampal cortex and collateral sulcus (Epstein & Kanwisher, 1998).",
  },
  vwfa: {
    mni: [-44, -56, -15],
    mesh: "Occipitotemporal_sulcus_(Lateral_part*)l",
    basis: "Left lateral occipitotemporal sulcus (Cohen et al., 2000; Dehaene & Cohen, 2011).",
  },
};

const { min, max } = provenance.cerebrumBounds;
// Scene axes: x posterior, y superior, z left. MNI: x right, y anterior, z superior.
function toScene([mx, my, mz]) {
  const f = (value, axis) => (value - MNI_MIN[axis]) / (MNI_MAX[axis] - MNI_MIN[axis]);
  return [max[0] - f(my, 1) * (max[0] - min[0]), min[1] + f(mz, 2) * (max[1] - min[1]), max[2] - f(mx, 0) * (max[2] - min[2])];
}

function vertices(name) {
  const mesh = atlas.meshes.find((m) => m.name === name);
  if (!mesh) throw new Error(`Atlas has no mesh named ${name}`);
  const raw = Buffer.from(mesh.data, "base64");
  return new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
}

const out = {};
for (const [id, area] of Object.entries(areas)) {
  const target = toScene(area.mni),
    v = vertices(area.mesh);
  let best = Infinity,
    anchor = null;
  for (let i = 0; i < v.length; i += 3) {
    const p = [v[i] / 1000, v[i + 1] / 1000, v[i + 2] / 1000];
    const d = (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2 + (p[2] - target[2]) ** 2;
    if (d < best) {
      best = d;
      anchor = p;
    }
  }
  out[id] = { position: anchor, mni: area.mni, mesh: area.mesh, basis: area.basis, snappedMillimetres: Number((Math.sqrt(best) * 34.45).toFixed(1)) };
  console.log(id.padEnd(5), "target", target.map((n) => n.toFixed(2)).join(","), "→", anchor.join(","), `(${out[id].snappedMillimetres} mm)`);
}
await writeFile("src/data/functional-areas.json", `${JSON.stringify(out, null, 2)}\n`);
