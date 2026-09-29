// Which atlas meshes prepare-atlas.mjs puts in the cortex and cerebellum groups.
// Kept apart from the script so tests/atlas.test.mjs can check the patterns without the FBX inputs.

/**
 * Cerebral gyri and sulci. The angular gyrus pattern is anchored: unanchored, "Angular_"
 * also matches the cerebellum's "Anterior_quadrangular_lobule" (the match is case-insensitive).
 */
export const CORTEX_NAME = /gyr|sulc|cuneus|Superior_parietal_lobul|^Angular_gyrus|Supramarginal_|Insula_/i;

/** Cerebellar lobules and the vermis, drawn as the `lower` point cloud. */
export const CEREBELLUM_NAME =
  /quadrangular_lobule|semilunar_lobule|Gracile_lobule|Biventral_lobule|Tonsil_of_cerebellum|Wing_of_central_lobule|^Central_lobule$|^Lingula_of_cerebellum$|of_vermis$/;
