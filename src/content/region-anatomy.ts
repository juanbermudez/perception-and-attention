import type { RegionId } from "./types";

interface AtlasHighlight {
  parts: string[];
  label: string;
  context?: string;
}

// Functional landmarks retain their positions. Highlight only geometry that
// exists in the atlas, and name the parent when a nucleus is not segmented.
export const regionAnatomy: Record<RegionId, AtlasHighlight> = {
  medulla: { parts: ["Medulla_oblongatar"], label: "Right medulla", context: "Parent structure reference; individual dorsal-column nuclei are not segmented." },
  vpl: { parts: ["Thalamusl"], label: "Left thalamus", context: "Parent structure highlighted; VPL remains an unsegmented reference." },
  s1: { parts: ["Postcentral_gyrusl"], label: "Left postcentral gyrus", context: "Surface reference for S1; individual body maps are not segmented." },
  insula: {
    parts: ["Insula_(Subcentral_gyrus_and_ant_and_post_sulci*)l"],
    label: "Left insular region",
    context: "Parent surface reference; anterior insula is not separately segmented.",
  },
  cingulate: {
    parts: ["Cingulate_gyrus_and_sulcus_(Middle_anterior_part)l"],
    label: "Left middle-anterior cingulate region",
    context: "Anatomical network reference; exact ACC borders are not segmented.",
  },
  retina: { parts: ["Retinal"], label: "Left retina" },
  retinaR: { parts: ["Retinar"], label: "Right retina" },
  chiasm: { parts: ["Optic_chiasml", "Optic_chiasmr"], label: "Optic chiasm" },
  lgn: { parts: ["Lateral_geniculate_bodyl"], label: "Left lateral geniculate body" },
  v1: { parts: ["Calcarine_sulcusl"], label: "Left calcarine region", context: "Surface reference for V1; functional borders vary." },
  l6: { parts: ["Calcarine_sulcusl"], label: "Left calcarine region", context: "Cortical surface reference; microscopic layer 6 is not segmented." },
  trn: { parts: ["Thalamusl"], label: "Left thalamus", context: "Parent structure highlighted; TRN remains an unsegmented landmark." },
  pfc: { parts: ["Middle_frontal_gyrusl"], label: "Left middle frontal gyrus", context: "Anatomical reference for this prefrontal landmark." },
  parietal: { parts: ["Superior_parietal_lobulel"], label: "Left superior parietal lobule", context: "Anatomical reference for this parietal landmark." },
  pulvinar: { parts: ["Thalamusl"], label: "Left thalamus", context: "Parent structure highlighted; pulvinar remains an unsegmented landmark." },
  extrastriate: {
    parts: ["Lateral_occipital_gyrus_(Middle_occipital_gyrus*)l"],
    label: "Left lateral occipital gyrus",
    context: "Anatomical reference for this visual association landmark.",
  },
  cochlea: { parts: ["Cochleal"], label: "Left cochlea" },
  cochleaR: { parts: ["Cochlear"], label: "Right cochlea" },
  brainstem: { parts: ["Anterior_cochlear_nucleusl", "Posterior_cochlear_nucleusl"], label: "Left cochlear nuclei" },
  brainstemR: { parts: ["Anterior_cochlear_nucleusr", "Posterior_cochlear_nucleusr"], label: "Right cochlear nuclei" },
  soc: { parts: ["Ponsl"], label: "Left pons", context: "Parent structure highlighted; SOC remains an unsegmented landmark." },
  socR: { parts: ["Ponsr"], label: "Right pons", context: "Parent structure highlighted; SOC remains an unsegmented landmark." },
  ic: { parts: ["Inferior_colliculusl"], label: "Left inferior colliculus" },
  icR: { parts: ["Inferior_colliculusr"], label: "Right inferior colliculus" },
  mgn: { parts: ["Medial_geniculate_bodyl"], label: "Left medial geniculate body" },
  mgnR: { parts: ["Medial_geniculate_bodyr"], label: "Right medial geniculate body" },
  a1: { parts: ["Transverse_temporal_gyril"], label: "Left Heschl gyri", context: "Anatomical reference for A1; functional borders vary." },
  a1R: { parts: ["Transverse_temporal_gyrir"], label: "Right Heschl gyri", context: "Anatomical reference for A1; functional borders vary." },
  temporal: {
    parts: ["Superior_temporal_gyrus_(Lateral_part)l"],
    label: "Left superior temporal gyrus",
    context: "Anatomical reference for this speech landmark.",
  },
  spt: {
    parts: ["Superior_temporal_gyrus_(Lateral_part)l"],
    label: "Left superior temporal gyrus",
    context: "Parent surface reference; area Spt is not separately segmented.",
  },
  frontal: {
    parts: ["Opercular_part_of_inferior_frontal_gyrusl"],
    label: "Left inferior frontal gyrus · opercular part",
    context: "Anatomical reference for this speech landmark.",
  },
  motor: { parts: ["Precentral_gyrusl"], label: "Left precentral gyrus", context: "Anatomical reference for this motor landmark." },
  meaning: { parts: ["Middle_temporal_gyrusl"], label: "Left middle temporal gyrus", context: "Anatomical reference for this semantic landmark." },
};
