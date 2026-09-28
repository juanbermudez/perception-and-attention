# Geometry credits and licenses

The geometry in `src/data/atlas-data.json` and `src/data/skull-data.json` is adapted from [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy), the libre 3D atlas of anatomy, by Gauthier Kervyn and contributors. FBX files are distributed in the [Z-Anatomy PC repository](https://github.com/LluisV/Z-Anatomy/tree/PC-Version/Resources/Models/FBX) by Lluís Vinent Juanico. Z-Anatomy credits Kousaku Okubo for the original BodyParts3D model, Gauthier Kervyn for design/anatomy, Marcin Zielinski for the Blender add-on, and Lluís Vinent for Unity development.

Z-Anatomy models and these derived atlas assets retain [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), with the more specific upstream inner-ear terms below. The source project also credits Brainder/white matter from the University of Washington and cranial nerves/foramina from the University of Dundee, CAHID (CC BY 4.0).

BodyParts3D, © The Database Center for Life Science. Z-Anatomy's historical attribution cites CC BY-SA 2.1 Japan for its BodyParts3D source. The [current official BodyParts3D archive license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) is CC BY 4.0; the Z-Anatomy derivative terms remain applicable to the Z-Anatomy files used here.

Inner-ear source: **“Anatomy of the Inner Ear”, University of Dundee School of Medicine**, credited by Z-Anatomy under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Derived cochlear meshes in this project retain that noncommercial share-alike license. Their provenance is linked in the [Z-Anatomy source credits](https://github.com/Z-Anatomy/Models-of-human-anatomy#attributions).

Changes made here: selected atlas parts; applied one shared rigid rotation/translation and uniform scale; quantized positions to 0.001 scene units (at most 0.0173 mm error per coordinate); sampled surfaces with seeded area-weighted sampling; changed rendering colors/opacity; added functional and small-nucleus landmarks and illustrative connecting curves. Original FBX parent transforms are preserved. No separate positioning or scaling of cochleae, eyes, bones, or brain parts is applied.

Exact input SHA-256 hashes and the source Git tree SHA are recorded in `provenance/anatomy.json` and `provenance/skull.json`. The skull particles sample 22 atlas bones and 28 atlas teeth with the identical transform used for the brain. Functional markers, teaching curves, and particle timing are separate explanatory additions and are not claimed to be atlas segmentations or physiological data.
