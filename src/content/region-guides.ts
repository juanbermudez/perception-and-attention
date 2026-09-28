import type { PathId, RegionId } from "./types";

export interface RegionGuide {
  /** One or two plain sentences: what this is. */
  summary: string;
  /** How it works. */
  mechanism: string;
  /** What it does in a given pathway. */
  roles: Partial<Record<PathId, string>>;
  connections: string;
  /** What the 3D model shows and simplifies for this region. */
  limit: string;
  sourceIds: string[];
}

// [[regionId|text]] tokens become buttons that focus that region. They point to
// landmarks in the model, not to traced fibre bundles.
export const regionGuides: Record<RegionId, RegionGuide> = {
  retina: {
    summary: "The retina is a thin layer of neural tissue at the back of the eye. It develops from the brain and is part of the central nervous system.",
    mechanism:
      "Rods and cones absorb light; their activity decreases when light reaches them. Bipolar cells carry signals from the photoreceptors to the ganglion cells, and horizontal and amacrine cells compare signals from neighbouring points, so the output mainly reports contrast, colour differences and change. Only ganglion cells send output to the brain. Primates have at least 17 types, each sending a different version of the image. In monkeys, about 80% are midget cells (fine detail and red–green colour) and about 10% are parasol cells (motion and changes in brightness).",
    roles: {
      vision: "The first stage of vision. The image is processed and compressed here before any signal reaches the brain.",
    },
    connections:
      "Ganglion-cell axons form the optic nerve, which runs to the [[chiasm|optic chiasm]]. The [[retinaR|right retina]] does the same for the other eye.",
    limit: "Shown as a surface. The retinal layers, cell types and the blind spot are not modelled.",
    sourceIds: ["retinal-circuits", "photoreceptors", "magno-parvo-counts", "ganglion-counts"],
  },
  retinaR: {
    summary: "The retina of the right eye.",
    mechanism:
      "Ganglion cells in the half nearest the nose send fibres that cross at the chiasm; those in the outer half send fibres that stay on the same side.",
    roles: {
      vision: "Both eyes see most of the scene. After the chiasm, each hemisphere receives one half of the visual field from both eyes.",
    },
    connections: "The right optic nerve joins the left at the [[chiasm|optic chiasm]].",
    limit: "The crossing and non-crossing fibres of each optic nerve are drawn as a single curve.",
    sourceIds: ["retinal-circuits", "visual-projections"],
  },
  chiasm: {
    summary: "The optic chiasm is where the two optic nerves meet, just above the pituitary gland.",
    mechanism:
      "Fibres from the nasal half of each retina cross to the opposite side; fibres from the temporal half do not. After the chiasm, fibres are grouped by side of the visual field instead of by eye.",
    roles: {
      vision: "Everything in the right half of the visual field is sent to the left hemisphere, and the reverse.",
    },
    connections:
      "Receives the optic nerves from the [[retina|left]] and [[retinaR|right]] eyes and sends the optic tracts to the [[lgn|LGN]] and to the midbrain.",
    limit: "Crossing and non-crossing fibres are drawn as single curves.",
    sourceIds: ["visual-projections"],
  },
  lgn: {
    summary: "The lateral geniculate nucleus (LGN) is the visual relay of the thalamus. It passes signals from the eyes to primary visual cortex.",
    mechanism:
      "It has six main layers, each receiving input from one eye. Two layers carry magnocellular signals (fast, coarse, motion); four carry parvocellular signals (fine detail and colour); thin layers between them carry koniocellular signals. Relay cells also receive input from the cortex, the brainstem and inhibitory cells, which control how much is passed on.",
    roles: {
      vision: "The main relay between the eye and the cortex for conscious vision.",
      loop: "Where retinal input (the driver) and cortical feedback (the modulator) meet.",
    },
    connections:
      "Receives the optic tract and sends the optic radiation to [[v1|V1]]. Receives feedback from [[l6|layer 6]] directly and through the [[trn|TRN]]. In macaque monkeys, about 90% of retinal ganglion cells project here; the rest go to the [[sc|superior colliculus]] (eye movements), the pretectum (pupil reflex), the suprachiasmatic nucleus (daily body clock) and other small targets.",
    limit: "The atlas includes this nucleus, but its layers are not modelled.",
    sourceIds: ["lgn-layers", "lgn-synapses", "magno-parvo-counts", "lgn-latency", "visual-projections"],
  },
  v1: {
    summary:
      "Primary visual cortex (V1) receives most of the LGN's output and is the main route by which visual signals reach the cortex. It lies at the back of the brain, along the calcarine sulcus.",
    mechanism:
      "V1 contains a map of the opposite half of the visual field. The central 15 degrees of vision take up about half of it. Many neurons respond best to edges at a particular orientation, and inputs from the two eyes are arranged in alternating columns.",
    roles: {
      vision: "Represents the visual field as local features such as edges, which higher visual areas combine into objects, motion and faces.",
      loop: "Its deep layers send output to the thalamus: layer 6 back to the LGN, and layer 5 to the pulvinar.",
      attention:
        "Attention effects here are smaller than in higher visual areas: in one monkey study, attention increased responses by about 8% in V1 and about 26% in V4. In monkey V1, they depend partly on acetylcholine acting on muscarinic receptors.",
    },
    connections:
      "Sends output to [[extrastriate|higher visual areas]] along several routes: toward the temporal lobe ([[it|object recognition]]), through [[mt|MT]] toward the parietal lobe (location and action), and, according to a recent proposal, a third route along the side of the brain, through MT to the superior temporal sulcus, that is involved in seeing moving faces and bodies.",
    limit: "The highlight follows the calcarine sulcus. The actual border of V1 varies between people.",
    sourceIds: ["visual-cortex-map", "hubel-wiesel", "third-pathway", "attention-gain", "ach-v1", "v1-columns", "lgn-mt"],
  },
  l6: {
    summary: "Layer 6 is the deepest cell layer of the cortex. Here it refers to layer 6 neurons in V1 that project back to the thalamus.",
    mechanism:
      "These neurons excite thalamic relay cells directly. Branches of the same axons excite inhibitory neurons in the TRN, which then inhibit the relay cells. In mice, their individual synapses onto TRN neurons are about 2.4 times stronger than those onto relay cells, so the overall effect can be inhibitory.",
    roles: {
      loop: "The feedback part of the circuit, through which the cortex adjusts its own input.",
    },
    connections:
      "Projects to the [[lgn|LGN]] and the [[trn|TRN]]. Separate [[l5|layer 5]] neurons, just above it, project to higher-order thalamic nuclei such as the [[pulvinar|pulvinar]], which relay signals between cortical areas.",
    limit: "Layer 6 lies within about 2 millimetres of the surface of V1, so it shares V1’s marker and highlight.",
    sourceIds: ["corticothalamic-circuit", "ct-awake", "transthalamic", "cortical-thickness", "trn-synapse-strength"],
  },
  trn: {
    summary: "The thalamic reticular nucleus (TRN) is a thin layer of inhibitory neurons that surrounds the thalamus.",
    mechanism:
      "TRN neurons receive branches of the connections running between the thalamus and the cortex in both directions, and they inhibit thalamic relay cells. Working with thalamic relay cells, the TRN generates sleep spindles, a brain rhythm seen in light (non-REM) sleep.",
    roles: {
      loop: "Allows the cortex to reduce, as well as increase, activity in its own input.",
    },
    connections:
      "Receives input from [[l6|layer 6]] and from relay cells, and inhibits the [[lgn|LGN]] and other thalamic nuclei. In mice, prefrontal cortex influences it through the basal ganglia.",
    limit: "The atlas does not include a separate TRN, so the marker is an approximate position and the highlight shows the whole thalamus.",
    sourceIds: ["corticothalamic-circuit", "trn-basal-ganglia", "spindles-trn", "spindles-review"],
  },
  pfc: {
    summary: "Prefrontal cortex, at the front of the brain, keeps goals and rules active and uses them to guide behaviour.",
    mechanism:
      "Neurons here are active while a goal has to be held in mind, for example the colour of the coat you are looking for. Researchers disagree about whether this activity is continuous or comes in brief bursts. With the [[fef|frontal eye fields]], it sends signals that favour matching features and locations in sensory areas.",
    roles: {
      attention: "Provides the goal that determines which sensory signals are prioritized.",
    },
    connections:
      "Works with [[parietal|parietal cortex]] and the [[fef|frontal eye fields]], and with the [[insula|insula]] and [[cingulate|anterior cingulate]]. Receives noradrenaline from the [[lc|locus coeruleus]]. Connects to the thalamus directly and through the basal ganglia.",
    limit: "The highlight is the left middle frontal gyrus, which is only one part of prefrontal cortex.",
    sourceIds: ["attention-networks", "baseline", "lc-adaptive-gain", "persistent-activity", "activity-bursts"],
  },
  parietal: {
    summary: "Posterior parietal cortex combines information from several senses to represent the space around the body and to plan actions.",
    mechanism:
      "Neurons around the intraparietal sulcus represent where things are and how relevant they are at the moment. In monkeys, the lateral intraparietal area (LIP) has been described as a priority map that combines a fast response to whatever appears with top-down signals such as a planned eye movement. The peak of this map is thought to guide eye movements and attention. Neighbouring parts of parietal cortex guide reaching.",
    roles: {
      vision:
        "A late stage of the dorsal stream, which continues from here to frontal areas that plan eye and hand movements. Uses vision to guide eye movements, reaching and grasping.",
      attention:
        "Part of the dorsal attention network, which directs attention voluntarily. In monkeys, the pattern of activity across LIP tracked where attention was and how it moved.",
      touch: "Combines touch with vision and body position so that you can act on what you feel.",
      hearing:
        "Part of the auditory “where” stream, and the end of that route in this model. In human imaging, locating sounds activates parietal cortex, mainly the inferior parietal lobule, often more on the right.",
    },
    connections:
      "Receives visual input from [[mt|MT]] and other visual areas, as well as auditory and [[s1|touch]] input, and works with [[pfc|prefrontal cortex]] and the [[fef|frontal eye fields]]. Sends output to the [[sc|superior colliculus]]. Damage can cause optic ataxia (inaccurate reaching toward things a person sees clearly). Spatial neglect is more often linked to damage to the inferior parietal lobule, the nearby [[tpj|temporoparietal junction]] and the superior temporal gyrus than to the superior parietal lobule shown here.",
    limit: "The highlight is the superior parietal lobule and the intraparietal sulcus, part of a larger network.",
    sourceIds: [
      "attention-networks",
      "multisensory-space",
      "optic-ataxia",
      "two-streams",
      "lip-priority",
      "lip-attention",
      "lip-sc",
      "neglect-anatomy",
      "neglect-temporal",
      "neglect-networks",
      "auditory-where-meta",
      "auditory-where-debate",
      "parietal-gain-fields",
      "dorsal-framework",
    ],
  },
  pulvinar: {
    summary:
      "The pulvinar is the largest nucleus of the primate thalamus, at its back end. Most of its connections are with areas of cortex rather than with the sense organs.",
    mechanism:
      "It is a higher-order thalamic nucleus: its main inputs come from the cortex (layer 5) and the superior colliculus, and it relays signals between cortical areas. In monkeys, it synchronized alpha-frequency activity (8–15 Hz) between visual areas according to where attention was directed. In mice, the corresponding nucleus sends higher visual areas signals that differ from those carried by the direct connections from V1, combining visual features with information about the animal’s movement.",
    roles: {
      attention: "Proposed to coordinate communication between visual areas during attention.",
      loop: "Relays layer 5 output from V1 to higher visual areas, a route between cortical areas that passes through the thalamus.",
    },
    connections:
      "Receives driving input from [[l5|layer 5]] of visual cortex and input from the [[sc|superior colliculus]]; in monkeys, some pulvinar neurons receive SC input and project to [[mt|area MT]]. Connected with [[extrastriate|higher visual areas]] and [[parietal|parietal cortex]].",
    limit: "The atlas does not include a separate pulvinar, so the marker is an approximate position and the highlight shows the whole left thalamus.",
    sourceIds: ["pulvinar-coordination", "transthalamic", "sc-pulvinar-mt", "transthalamic-review", "visual-transthalamic"],
  },
  extrastriate: {
    summary: "Higher visual areas are the many visual areas beyond V1. Different areas specialize in features such as shape, colour, motion, faces and places.",
    mechanism:
      "Neurons here respond to larger parts of the visual field and to more complex features than neurons in V1. Attention effects are larger here than in V1: in one monkey study, attention increased V4 responses by a median of about 26%, compared with about 8% in V1.",
    roles: {
      vision: "The first stages after V1. Areas V2 and V4 combine V1's local features into contours, shapes and colours and pass them to the temporal lobe.",
      attention: "Responses to the attended object increase relative to responses to other objects.",
      loop: "Receives signals from V1 directly and, through the pulvinar, from layer 5 of V1.",
    },
    connections:
      "Receives input from [[v1|V1]], exchanges signals with the [[pulvinar|pulvinar]], receives feedback from the [[fef|frontal eye fields]], and sends output to [[it|inferior temporal cortex]], the category-selective areas and [[parietal|parietal]] cortex.",
    limit:
      "The highlight is the lateral occipital gyrus. Higher visual areas cover much more than this: V2 and V3 surround V1 on the inner and lower surfaces of the occipital lobe, and V4 lies partly on its underside.",
    sourceIds: [
      "attention-gain",
      "baseline",
      "third-pathway",
      "parallel-pathways",
      "fef-v4",
      "visual-transthalamic",
      "attention-reliability",
      "attention-competition",
      "streams-critique",
    ],
  },
  mt: {
    summary:
      "Area MT (also called V5) is a visual area specialized for motion. In humans it is usually found on the side of the brain, where the occipital lobe meets the temporal lobe.",
    mechanism:
      "Most MT neurons respond to movement in a particular direction and at a particular speed, over a larger part of the visual field than V1 neurons. Some combine local motion signals into the motion of a whole object. In monkeys, electrically stimulating a small group of MT neurons shifts the animal's judgement of motion toward those neurons' preferred direction. In monkeys, a neighbouring area, MST, responds to the overall patterns of motion produced when moving through a scene (optic flow), such as the expansion seen when walking forward.",
    roles: {
      vision:
        "Signals the direction and speed of moving things. Its output is used to follow objects with the eyes and to judge how things, and you, are moving.",
    },
    connections:
      "Receives input from [[v1|V1]], directly and through V2, dominated by magnocellular signals. Sends output to [[parietal|posterior parietal cortex]] and to areas that control eye movements.",
    limit:
      "The marker sits on a nearby sulcal landmark. In human imaging this region is usually called hMT+, because MT and MST are hard to separate. Its position varies between people, most often lying in the inferior temporal sulcus or its ascending branch.",
    sourceIds: ["mt-review", "mt-stimulation", "motion-blindness", "mt-landmark", "mst-flow"],
  },
  it: {
    summary:
      "Inferior temporal cortex (IT) is a late stage of the ventral stream, the route that identifies objects. The term comes from monkey studies; in humans, the corresponding cortex covers the lower side and underside of the temporal lobe.",
    mechanism:
      "IT neurons respond to complex shapes and object parts. In monkeys, they tend to keep their preference for one object over another when the object moves, changes size or is seen from a somewhat different angle, although the strength of their response changes. Across many neurons, this lets the same object be recognized in different conditions. In monkeys, the activity of about 100 IT neurons over as little as 12.5 ms was enough to tell which object was shown and its category. In humans, the lateral occipital complex, next to MT, responds more to objects than to textures and is an intermediate stage of this system.",
    roles: {
      vision: "Identifies what an object is. Its output goes to areas for memory, emotion and decisions.",
    },
    connections:
      "Receives input from V4 and other [[extrastriate|higher visual areas]]. Contains or borders regions that prefer particular categories, such as [[ffa|faces]] and [[ppa|places]]. In monkeys, it sends output to the medial temporal lobe (memory), the amygdala and prefrontal cortex.",
    limit:
      "Monkey IT and human ventral temporal cortex are similar but not identical. The highlight is the inferior temporal sulcus; the region itself is larger and has no sharp borders.",
    sourceIds: ["object-recognition", "it-readout", "loc", "vtc-review", "ventral-framework"],
  },
  ffa: {
    summary:
      "The fusiform face area (FFA) is a region on the fusiform gyrus that responds more strongly to faces than to other objects. It is found in most people and is usually larger in the right hemisphere.",
    mechanism:
      "In the study that named it, the FFA was found in 12 of 15 people. It responds more to faces than to houses, hands, objects or scrambled faces, including faces seen from a three-quarter view. In an influential model, it is involved mainly in recognizing who a face belongs to, while expressions and gaze direction are processed more in the superior temporal sulcus; later studies found that the FFA also contributes to perceiving expressions. In monkeys, 97% of the visually responsive neurons in the largest face-selective region preferred faces. How specific the human FFA is remains debated: in car and bird experts, it also responded more to cars or birds.",
    roles: {
      vision: "Part of a network of face-selective areas used to recognize individuals.",
    },
    connections:
      "Receives input from earlier visual areas, including a face-selective region in the occipital lobe (the occipital face area). Works with the superior temporal sulcus (expressions and gaze) and the front of the temporal lobe (knowing who someone is).",
    limit:
      "The marker shows a typical position on the left fusiform gyrus, to match the rest of the route. The FFA is often larger and more consistent in the right hemisphere, and its exact position varies by several millimetres between people.",
    sourceIds: ["ffa", "ffa-review", "face-network", "face-stimulation", "face-patches", "expertise", "face-framework"],
  },
  ppa: {
    summary:
      "The parahippocampal place area (PPA) responds more to images of places and scenes, such as rooms, streets and landscapes, than to single objects, and hardly at all to faces.",
    mechanism:
      "The PPA responds to the layout of the space in a scene. An empty room produces as strong a response as the same room with furniture, and more than twice the response to a set of objects with no room around them. It is involved in recognizing scenes and the type of place, such as a city, beach or forest. A separate scene area on the outer surface of the occipital lobe, the occipital place area, represents where it is possible to walk in a scene.",
    roles: {
      vision: "Helps recognize places and scenes, which supports finding your way.",
    },
    connections:
      "Receives input from earlier visual areas and connects with the retrosplenial cortex and hippocampus, which are involved in navigation and memory.",
    limit:
      "The highlight is the collateral sulcus; the PPA covers part of it and nearby parahippocampal cortex. It is found in both hemispheres; only the left is shown.",
    sourceIds: ["ppa", "opa-affordances", "vtc-review", "ppa-navigation"],
  },
  eba: {
    summary:
      "The extrastriate body area (EBA) responds more to images of human bodies and body parts than to faces or other objects. It lies on the side of the brain, next to area MT. At standard imaging resolution it appears to overlap MT; higher-resolution imaging shows several separate body-selective patches arranged around MT.",
    mechanism:
      "It responds to still and moving images of bodies. Briefly disrupting it with magnetic stimulation (TMS) slowed the recognition of body parts, but not of faces or other objects. One study found it active when people moved their own arm or leg toward a target without seeing the movement; later studies found little link with movement and suggest that the EBA mainly analyses how bodies look.",
    roles: {
      vision: "Analyses the shape and posture of bodies, which supports recognizing people and what they are doing.",
    },
    connections:
      "Probably part of a proposed lateral visual route toward the superior temporal sulcus, which is involved in perceiving other people's actions. A second body-selective region, the fusiform body area, lies next to the [[ffa|FFA]].",
    limit:
      "The highlight is the middle temporal gyrus; the EBA occupies part of its back end and neighbouring cortex. It is found in both hemispheres; only the left is shown.",
    sourceIds: ["eba", "eba-tms", "eba-action", "fba", "third-pathway", "eba-overlap", "eba-patches", "eba-perceptual"],
  },
  vwfa: {
    summary:
      "The visual word form area (VWFA) is a region in the left occipitotemporal sulcus that responds more to written words and letter strings than to line drawings or other images, and more to scripts the reader knows than to unfamiliar ones.",
    mechanism:
      "It responds similarly to a word whether it is written in upper or lower case, and its location is similar across people and writing systems. It develops as people learn to read: adults who learned to read show a larger response to writing here than adults who never learned, and a slightly smaller response to faces. Writing is only about 5,000 years old, too recent for a brain area to have evolved for it, so the VWFA is thought to be object-recognition cortex that is taken over when a person learns to read. In one patient, surgery that removed a small part of it caused a marked reading difficulty, while recognition of other kinds of images stayed normal. How specific it is has been debated: it is also active during tasks such as naming pictures or reading Braille.",
    roles: {
      vision: "Recognizes letters and words, then passes them to language areas that retrieve their sound and meaning.",
    },
    connections: "Receives input from earlier visual areas and sends output to language areas in the left temporal and frontal lobes.",
    limit:
      "The highlight is the left occipitotemporal sulcus; the VWFA covers a small part of it and is not segmented. Its exact position varies by several millimetres between people.",
    sourceIds: ["vwfa", "vwfa-review", "literacy", "recycling", "vwfa-lesion", "vwfa-debate", "vwfa-experience", "vwfa-case"],
  },
  cochlea: {
    summary: "The cochlea is the spiral-shaped hearing organ of the inner ear, inside the temporal bone.",
    mechanism:
      "Sound makes the basilar membrane vibrate, with the largest movement near the base for high frequencies (up to about 20 kHz) and near the apex for low frequencies (down to about 20 Hz). About 3,500 inner hair cells convert this movement into nerve signals. About 12,000 outer hair cells change length to amplify it; mice lacking prestin, the protein that drives this movement, lose 40–60 dB of sensitivity.",
    roles: {
      hearing: "Separates sound into its frequency components. Feedback from the brainstem adjusts how much it amplifies.",
    },
    connections:
      "The auditory nerve carries its output to the [[brainstem|cochlear nuclei]] on the same side. Medial olivocochlear fibres, mostly from the [[socR|superior olive on the opposite side]], return to the outer hair cells and reduce their amplification. In chinchillas, cochlear sensitivity dropped while the animals attended to lights; in humans, results are inconsistent. In human ears examined after death, many auditory nerve fibres were lost with age while most inner hair cells survived; this “hidden hearing loss” would not show on a standard hearing test.",
    limit: "The spiral is atlas geometry in its real position. Hair cells and fluid movement are not modelled.",
    sourceIds: [
      "ohc-motility",
      "prestin",
      "tonotopy",
      "hidden-hearing-loss",
      "olivocochlear",
      "attention-cochlea",
      "attention-oae",
      "attention-oae-null",
      "hidden-hearing-loss-human",
    ],
  },
  cochleaR: {
    summary: "The cochlea of the right ear.",
    mechanism:
      "Same structure as the left cochlea. Comparing the two ears lets the brain locate sounds to the left or right; the shape of the outer ear also helps locate sounds up or down.",
    roles: {
      hearing: "Its signals first meet the left ear’s in the superior olive, in the brainstem.",
    },
    connections: "Projects to the [[brainstemR|right cochlear nuclei]] and receives olivocochlear feedback, mostly from the [[soc|left superior olive]].",
    limit: "Atlas geometry; microscopic structure not modelled.",
    sourceIds: ["ohc-motility", "ear-location", "olivocochlear-human", "sound-localization"],
  },
  brainstem: {
    summary: "The cochlear nuclei are the first stop in the brain for the auditory nerve, where the pons meets the medulla.",
    mechanism:
      "Each auditory nerve fibre branches to three subdivisions. Different cell types extract different features: some preserve precise timing, others encode loudness or frequency content.",
    roles: {
      hearing: "Splits the signal into parallel pathways that travel upward by different routes.",
    },
    connections: "Sends output to the [[soc|superior olive]] on both sides and directly to the [[ic|inferior colliculus]].",
    limit: "The atlas’s anterior (ventral) and posterior (dorsal) cochlear nuclei are both highlighted.",
    sourceIds: ["cochlear-nuclei"],
  },
  brainstemR: {
    summary: "The right cochlear nuclei, the first stop for the right auditory nerve.",
    mechanism: "Same organization as on the left.",
    roles: {
      hearing: "Its outputs meet the left ear’s signals for the first time in the superior olive.",
    },
    connections: "Projects to both the [[socR|right]] and [[soc|left]] superior olives.",
    limit: "Atlas geometry; cell types not modelled.",
    sourceIds: ["cochlear-nuclei", "vnll"],
  },
  soc: {
    summary:
      "The superior olivary complex is a group of brainstem nuclei where input from both ears is first combined. It also contains the neurons that send feedback to the cochlea.",
    mechanism:
      "The medial superior olive compares arrival times between the ears; people can detect differences as small as about 10 microseconds. The lateral superior olive compares loudness between the ears. Inhibition from the opposite ear reaches it through a small relay nucleus (the MNTB), whose input synapse, the calyx of Held, is one of the largest in the brain; its physiology comes mainly from rodents. In mammals, recent evidence suggests that time differences are read out by comparing firing rates between the two sides, which challenges the older textbook model of a map of delay lines. Olivocochlear neurons in and around the complex send fibres back to the cochlea: medial olivocochlear fibres end on outer hair cells and reduce their amplification, and lateral olivocochlear fibres end on auditory nerve fibres beneath the inner hair cells. Human counts average about 360 medial and 1,005 lateral olivocochlear fibres.",
    roles: {
      hearing: "Determines whether a sound comes from the left or the right, and sends feedback that turns down the cochlea’s amplification.",
    },
    connections:
      "Receives input from the [[brainstem|left]] and [[brainstemR|right]] cochlear nuclei and sends output to the [[ic|inferior colliculus]]. Its medial olivocochlear fibres go mostly to the [[cochleaR|opposite cochlea]]. In rats, these neurons receive descending input from the [[ic|inferior colliculus]] and directly from [[a1|auditory cortex]]. In animals, their reflex helps the auditory nerve respond to brief sounds in noise and protects the ear from loud noise; whether it helps people understand speech in noise is debated.",
    limit:
      "The atlas does not include the superior olive, so the marker is an approximate position and the highlight shows the pons. The olivocochlear fibres, which leave the brainstem with the vestibular nerve, are drawn as single curves.",
    sourceIds: [
      "binaural-comparison",
      "itd-coding",
      "olivocochlear",
      "olivocochlear-human",
      "olivocochlear-behaviour",
      "antimasking",
      "cortex-olive",
      "colliculus-olive",
      "itd-thresholds",
      "sound-localization-mechanisms",
    ],
  },
  socR: {
    summary: "The right superior olivary complex.",
    mechanism: "Compares timing and loudness between the ears, as on the left.",
    roles: {
      hearing: "Receives input from both ears, like the left side.",
    },
    connections: "Sends output to the [[icR|right inferior colliculus]] and olivocochlear fibres mostly to the [[cochlea|left cochlea]].",
    limit: "Approximate position inside the pons.",
    sourceIds: ["binaural-comparison", "olivocochlear-human"],
  },
  ic: {
    summary: "The inferior colliculus is the main auditory centre of the midbrain.",
    mechanism:
      "Nearly all ascending auditory pathways synapse here. It combines timing, loudness and frequency information and sends signals to the superior colliculus, which uses a map of space to turn the eyes and head toward sounds.",
    roles: {
      hearing: "Combines the outputs of the brainstem pathways before the thalamus.",
    },
    connections:
      "Receives input from the [[soc|superior olive]] and the cochlear nuclei and sends output to the [[mgn|MGN]] and the [[sc|superior colliculus]]. The two inferior colliculi are connected to each other. It also receives descending fibres from [[a1|auditory cortex]] and, in rats, sends fibres down to the olivocochlear neurons of the [[soc|superior olive]].",
    limit: "Atlas geometry; internal subdivisions not modelled.",
    sourceIds: ["inferior-colliculus", "cortex-cochlea", "colliculus-olive", "ic-bypass"],
  },
  icR: {
    summary: "The right inferior colliculus.",
    mechanism: "Because pathways have already crossed in the brainstem, it receives information from both ears.",
    roles: {
      hearing: "Same role as the left inferior colliculus.",
    },
    connections: "Sends output to the [[mgnR|right MGN]] and is connected with the [[ic|left inferior colliculus]].",
    limit: "Atlas geometry.",
    sourceIds: ["inferior-colliculus"],
  },
  mgn: {
    summary: "The medial geniculate nucleus (MGN) is the auditory relay of the thalamus, next to the visual LGN.",
    mechanism:
      "Its ventral part keeps the frequency map and projects to primary auditory cortex. Its other parts combine hearing with other senses and project to surrounding auditory cortex; in rats, the medial part also projects to the amygdala.",
    roles: {
      hearing: "The last relay before auditory cortex.",
    },
    connections: "Receives input from the [[ic|inferior colliculus]], sends output to [[a1|auditory cortex]], and receives feedback from the cortex.",
    limit: "Atlas geometry for the whole nucleus; its subdivisions are not modelled.",
    sourceIds: ["auditory-thalamus", "mgn-amygdala"],
  },
  mgnR: {
    summary: "The right medial geniculate nucleus.",
    mechanism: "Same organization as the left MGN.",
    roles: {
      hearing: "Relays to right auditory cortex.",
    },
    connections: "Sends output to [[a1R|right auditory cortex]].",
    limit: "Atlas geometry.",
    sourceIds: ["auditory-thalamus"],
  },
  a1: {
    summary: "Primary auditory cortex (A1) is on Heschl’s gyrus, inside the lateral sulcus.",
    mechanism:
      "It is organized by frequency, with mirror-image gradients (high–low–high). Several high-field MRI studies find these gradients running across the gyrus; others place them along it. It belongs to the core, the areas that receive their main input from the ventral MGN; in humans, it lies along Heschl’s gyrus, mainly toward its inner end, and its borders vary between people. Pure tones activate the core strongly, while the surrounding belt and parabelt respond more to complex sounds such as speech, music and voices.",
    roles: {
      hearing: "The first cortical area for hearing. Each side receives input from both ears.",
      speech: "Processes speech at the same time as the nearby [[temporal|superior temporal gyrus]].",
      attention:
        "One of the sensory inputs whose strength attention adjusts. In human recordings, attended tones evoked larger responses in auditory cortex from about 20 ms after the sound.",
    },
    connections:
      "Receives input from the [[mgn|MGN]] and sends output to the surrounding [[belt|belt areas]]. Works with [[a1R|right auditory cortex]]. Sends descending fibres to the MGN and the [[ic|inferior colliculus]].",
    limit: "The highlight is Heschl’s gyrus. The actual border of A1 varies between people.",
    sourceIds: [
      "auditory-cortex",
      "human-tonotopy",
      "auditory-cortex-streams",
      "belt-fmri",
      "auditory-attention",
      "a1-cytoarchitecture",
      "a1-variability",
      "tonotopy-orientation",
      "speech-parallel",
    ],
  },
  a1R: {
    summary: "Right primary auditory cortex.",
    mechanism:
      "Same frequency organization as the left. The right side tends to be more sensitive to pitch and melody. The proposal that the left side specializes in rapid changes in sound is debated, and both sides process both.",
    roles: {
      hearing: "Receives input from both ears.",
      attention:
        "Continues to process sound, though more weakly, when another sense has priority. Unexpected sounds also engage the right [[tpj|temporoparietal junction]].",
    },
    connections: "Works with [[a1|left auditory cortex]].",
    limit: "Heschl’s gyrus is used as the reference for A1.",
    sourceIds: ["auditory-cortex", "multimodal-change", "crossmodal-attention", "music-speech-asymmetry", "asymmetry-debate"],
  },
  temporal: {
    summary: "The superior temporal gyrus, along the top of the temporal lobe, is where speech sounds are recognized.",
    mechanism:
      "Neurons here respond to phonetic features, such as whether a consonant is made with the lips or the tongue, and follow speech as it unfolds. When two people speak, activity here mainly follows the one being attended to.",
    roles: {
      speech: "Converts sound into speech units and sends them to both the [[meaning|meaning]] (ventral) and [[spt|sound-to-movement]] (dorsal) streams.",
      attention: "An example of attention selecting one input over another.",
    },
    connections: "Receives input at the same time as [[a1|A1]] and connects to [[meaning|meaning networks]] and [[spt|area Spt]].",
    limit: "The highlight is the left superior temporal gyrus. Speech sounds are processed in both hemispheres.",
    sourceIds: ["speech-features", "attended-speech", "parallel-speech"],
  },
  spt: {
    summary: "Area Spt, at the back end of the Sylvian fissure, links the sound of a word with the movements needed to say it.",
    mechanism:
      "It responds both when a person hears speech and when they silently rehearse it, which suggests it converts between auditory and motor representations.",
    roles: {
      speech: "Part of the dorsal stream, used when repeating new words and holding them in short-term memory.",
    },
    connections: "Connects the [[temporal|superior temporal gyrus]] with [[frontal|Broca’s area]] and [[motor|speech motor cortex]].",
    limit: "Spt is defined by its function in each person. The marker is placed on the nearby superior temporal surface.",
    sourceIds: ["sound-movement"],
  },
  frontal: {
    summary: "Broca’s area, in the left inferior frontal gyrus, is involved in planning speech.",
    mechanism:
      "Recordings show it is most active before speaking, while the sequence of sounds is prepared, and less active while motor cortex carries out the movements. Single neurons in nearby prefrontal cortex have been found to encode the sounds of upcoming words. How much planning happens here, compared with the precentral gyrus just behind it, is debated.",
    roles: {
      speech: "Coordinates the transition from sound representations to movement.",
    },
    connections: "Works with [[spt|area Spt]], the [[temporal|temporal lobe]] and [[motor|speech motor cortex]].",
    limit: "The highlight is the opercular part of the inferior frontal gyrus. Broca’s area also includes the triangular part in front of it.",
    sourceIds: ["speech-planning", "speech-planning-network", "speech-sequencing", "word-planning"],
  },
  motor: {
    summary: "Speech motor cortex is the lower part of primary motor cortex, which controls the lips, jaw, tongue and larynx.",
    mechanism:
      "These body parts are mapped in order along the precentral gyrus, with the larynx represented twice. Speaking activates them in fast, overlapping patterns. The sound of one’s own voice is used to correct errors during speech.",
    roles: {
      speech: "Carries out the speech plan and uses auditory feedback to adjust it.",
    },
    connections:
      "Receives input from [[frontal|Broca’s area]] and sends commands through the brainstem to the speech muscles. The resulting sound is processed by [[a1|auditory cortex]].",
    limit: "The highlight is the whole left precentral gyrus, which also controls the rest of the body.",
    sourceIds: ["speech-movement"],
  },
  meaning: {
    summary: "Word meaning is represented across large parts of both hemispheres, not in a single area.",
    mechanism:
      "Brain imaging while people listen to stories shows that different areas of temporal, parietal and frontal cortex respond to different categories of meaning, such as people, places or numbers.",
    roles: {
      speech: "The end point of the ventral stream, where sounds are linked to meaning.",
    },
    connections: "Receives input from the [[temporal|superior temporal gyrus]] and works with memory systems across the brain.",
    limit: "The highlight is the left middle temporal gyrus, one part of a distributed system.",
    sourceIds: ["semantic-networks", "language-network"],
  },
  medulla: {
    summary: "The gracile and cuneate nuclei (dorsal column nuclei) in the lower medulla are the first relay in the brain for fine touch and body position.",
    mechanism:
      "Touch and position fibres travel up the spinal cord on the same side and end here. The neurons here send axons across the midline, where they form the medial lemniscus.",
    roles: {
      touch: "The point where the pathway crosses, so the left hemisphere receives touch from the right side of the body.",
    },
    connections: "Receives input from the dorsal columns of the spinal cord and sends crossed fibres to the [[vpl|VPL]].",
    limit:
      "The nuclei are not included in the atlas. The highlight shows the right half of the medulla, and the marker sits at its centre; the nuclei lie in its lower, back part.",
    sourceIds: ["body-touch-route", "mechanoreceptors"],
  },
  vpl: {
    summary:
      "The ventral posterolateral nucleus (VPL) is the thalamic relay for touch and body position from the body. It also receives part of the spinothalamic pathway for pain and temperature.",
    mechanism:
      "Like the LGN and MGN, it contains a map (here of the opposite side of the body) and receives feedback from the cortex it projects to. Spinothalamic fibres end in the VPL and in several other thalamic nuclei, including the ventral posterior inferior nucleus and nuclei in the posterior and medial thalamus.",
    roles: {
      touch:
        "Relays touch and position signals to S1. The thalamus also relays pain and temperature signals to S1, S2, the posterior insula and the cingulate cortex.",
    },
    connections:
      "Receives the medial lemniscus from the [[medulla|medulla]] and spinothalamic fibres from the [[dorsalHorn|dorsal horn]], and sends output mainly to areas 3b and 1 of [[s1|S1]]. In monkeys, [[s2|S2]] receives its thalamic input mainly from neighbouring nuclei (the ventral posterior inferior and superior nuclei and the anterior pulvinar). Touch from the face uses a neighbouring nucleus (VPM).",
    limit:
      "The VPL is not included in the atlas. The highlight shows the whole left thalamus and the marker sits at its centre; the VPL lies in its lower, back, outer part. The marker also stands for the other thalamic nuclei that relay pain and temperature to the insula and cingulate cortex.",
    sourceIds: ["body-touch-route", "pain-pathways", "lamina1-thalamus", "vmpo-debate", "s1-s2-review"],
  },
  s1: {
    summary: "Primary somatosensory cortex (S1), on the postcentral gyrus, contains a map of the body surface.",
    mechanism:
      "Body parts are mapped in order along the gyrus, with the foot near the midline and the face and tongue at the lower end; the hands, lips and tongue take up much more space than other parts. S1 consists of four strips, areas 3a, 3b, 1 and 2, each with its own map of the opposite side of the body. In monkeys, area 3a responds mainly to muscle stretch and joint movement, areas 3b and 1 mainly to touch on the skin, and area 2 to both. Receptive fields become larger from area 3b to area 1 to area 2, and some area 2 neurons respond to curved shapes. In monkeys, most neurons of the thalamic touch relay project to areas 3b and 1; area 3b corresponds to the primary somatosensory cortex of other mammals. Most neurons combine signals from more than one type of skin receptor.",
    roles: {
      touch:
        "Assigns touch and position signals to a location on the body. It also contributes to the sensory side of pain: after a stroke in the postcentral region, one patient lost the sensory side of pain on the affected side while its unpleasantness remained.",
      attention:
        "Continues to process touch when attention is directed elsewhere, but attention changes its responses: in one monkey, switching attention between touch and vision changed the firing of about half of S1 neurons and 80% of neurons in S2.",
    },
    connections:
      "Receives input from the [[vpl|VPL]] and sends output to [[parietal|parietal cortex]] and [[s2|S2]]. The four areas are strongly interconnected.",
    limit:
      "The highlight is the whole left postcentral gyrus. The body map and the four areas are not drawn; area 3a and much of area 3b lie inside the central sulcus, out of view.",
    sourceIds: ["somatosensory-cortex", "s1-coding", "s1-s2-review", "s1-maps", "penfield", "pain-affect-lesion", "touch-attention", "s1-convergence"],
  },
  insula: {
    summary:
      "The insula is an area of cortex folded inside the lateral sulcus. It processes signals from inside the body and is involved in detecting important events.",
    mechanism:
      "It receives signals about the state of the body, such as heartbeat, breathing and gut sensations. Its front part works with the anterior cingulate cortex as the salience network, which detects important events and can redirect attention. The right anterior insula is also active when attention is reoriented to unexpected events, and at rest its activity rises and falls with the [[tpj|temporoparietal junction]]. Whether the salience network and the ventral attention network are one system or two is debated.",
    roles: {
      attention: "Detects unexpected or important events and can shift attention toward them.",
      touch:
        "According to one influential model, its front part re-represents pain, temperature and body-state signals passed forward from the [[postInsula|posterior insula]]. In one study, how intense cooling felt correlated with activity in the right anterior insula.",
    },
    connections:
      "Works with the [[cingulate|anterior cingulate]] and [[pfc|prefrontal cortex]]. In one study, people who were more accurate at detecting their heartbeat showed more activity in the right anterior insula.",
    limit:
      "The highlight is the left circular sulcus, which outlines the insula; the insular gyri and the front part of the insula are not segmented separately. The marker sits at the centre of the insula rather than its front.",
    sourceIds: [
      "salience-networks",
      "interoceptive-awareness",
      "salience-switch",
      "tpj-connectivity",
      "network-taxonomy",
      "rtpj-meta",
      "thermosensory-insula",
      "interoceptive-cortex",
    ],
  },
  cingulate: {
    summary:
      "The anterior cingulate cortex, on the inner surface of the frontal lobe, is active when responses conflict and after errors. It is also involved in pain and emotion.",
    mechanism:
      "Its activity increases when responses conflict and after errors. This is thought to signal that more control is needed. This is thought to signal that more control is needed.",
    roles: {
      attention: "Helps maintain task performance when goals and habits conflict.",
      touch:
        "In a hypnosis study, its activity changed when pain was made more or less unpleasant while its intensity stayed the same. It also responds to other sudden, important stimuli, not only to pain.",
    },
    connections:
      "Works with the [[insula|insula]] in the salience network and with [[pfc|prefrontal cortex]] for control. Receives pain-related input from the midline, mediodorsal and intralaminar nuclei of the thalamus (represented by the [[vpl|thalamus]] marker). In monkeys, it sends direct input to the [[lc|locus coeruleus]].",
    limit:
      "The highlight is the middle-anterior part of the cingulate, which some anatomists call anterior midcingulate cortex; much of the 'dorsal anterior cingulate' activity in conflict and salience studies is reported here. The exact functional area varies.",
    sourceIds: [
      "task-control",
      "salience-networks",
      "lc-adaptive-gain",
      "pain-affect",
      "cingulate-thalamus",
      "spinothalamic-cortex",
      "conflict-monitoring",
      "conflict-adjustment",
      "cingulate-subregions",
      "pain-matrix",
    ],
  },
  fef: {
    summary:
      "The frontal eye fields (FEF) are areas of frontal cortex that move the eyes and help direct attention. In humans they lie in the precentral sulcus, near its junction with the superior frontal sulcus.",
    mechanism:
      "In monkeys, electrically stimulating an FEF site moves the eyes by a particular direction and distance, and currents as small as 10 microamps can be enough. The FEF contains neurons that respond to visual stimuli, neurons that fire before eye movements, and neurons that do both. Stimulation too weak to move the eyes improved monkeys' performance at the matching location and increased the responses of V4 neurons there. In monkeys, during attention, activity in the FEF and V4 becomes synchronized at gamma frequencies, and the FEF appears to lead by about 8–13 ms. Whether attention simply reuses eye-movement plans is debated: in one monkey study, FEF neurons active only before eye movements did not change during covert attention, while visually responsive FEF neurons did.",
    roles: {
      attention:
        "Turns the current goal into a spatial signal that increases the gain of visual neurons at the chosen location, with or without an eye movement.",
    },
    connections:
      "Works with [[parietal|parietal cortex]] in the dorsal attention network and with [[pfc|prefrontal cortex]]. In monkeys, it sends a large projection to the [[sc|superior colliculus]] and projects to many visual areas, including V2, V4, [[mt|MT]] and [[it|inferior temporal cortex]]. The right [[tpj|temporoparietal junction]] has been proposed to interrupt this network when something unexpected happens, although this role is debated.",
    limit:
      "The marker sits in the left superior precentral sulcus at a typical position from a meta-analysis of brain imaging studies. Across studies and people, the FEF's position varies by around a centimetre, most of all from side to side. It is found in both hemispheres; only the left is shown.",
    sourceIds: [
      "fef-v4",
      "fef-performance",
      "fef-location",
      "fef-review",
      "fef-stimulation-map",
      "fef-tms",
      "fef-v4-coupling",
      "fef-cell-types",
      "fef-projections",
      "fef-sc-projection",
    ],
  },
  sc: {
    summary:
      "The superior colliculus (SC) is the upper of two pairs of small mounds on the roof of the midbrain. It turns the eyes and head toward things and helps select which location to attend.",
    mechanism:
      "Each SC contains a map of the opposite half of the visual field, with the centre of gaze enlarged. Its upper layers receive input directly from the retina and from V1. Its deeper layers also respond to senses other than vision, and most of their neurons are active when orienting movements are planned and made; in monkeys, stimulating them produces combined eye and head movements whose size depends on the site. In monkeys, silencing part of the SC made animals largely ignore signals in the matching part of the visual field when a competing distractor was present, and weak stimulation improved performance there without moving the eyes. Silencing it did not remove the usual effects of attention on neurons in visual areas MT and MST, so the SC seems to act through a separate route. In humans, high-resolution brain imaging shows that attention increases SC activity.",
    roles: {
      attention: "A priority map below the cortex that helps decide which location's signals are used for perception and for eye movements.",
    },
    connections:
      "Receives input from the retina, [[v1|V1]], the [[fef|frontal eye fields]] and [[parietal|parietal cortex]], and auditory signals from the [[ic|inferior colliculus]]. Sends commands to brainstem circuits for eye and head movements. Through the [[pulvinar|pulvinar]] it reaches visual cortex, including [[mt|area MT]], and parietal cortex. Through the mediodorsal thalamus it reaches the frontal eye fields; in monkeys this route carries a copy of upcoming eye movements.",
    limit:
      "The atlas does not include the superior colliculus, so the marker is an approximate position on the back of the midbrain, just above the inferior colliculus, and the highlight shows the left half of the midbrain. The right SC is not marked.",
    sourceIds: [
      "sc-attention",
      "sc-inactivation",
      "sc-cortex-independent",
      "sc-stimulation",
      "sc-gaze",
      "sc-human",
      "sc-pulvinar-mt",
      "lip-sc",
      "fef-sc-projection",
      "sc-corollary",
    ],
  },
  tpj: {
    summary:
      "The temporoparietal junction (TPJ) is the region where the temporal and parietal lobes meet, at the back end of the lateral (Sylvian) fissure. The right TPJ is a core part of the ventral attention network, which redirects attention to unexpected events.",
    mechanism:
      "It responds when something relevant appears where it was not expected, such as a target on the uncued side of a screen, and to changes in what is seen, heard or felt. During focused attention its activity drops, which may help keep distractions out. Its responses depend on the current goal: distractors that shared the target's colour captured attention and activated the TPJ together with ventral frontal cortex. In healthy volunteers, briefly disrupting the right TPJ with magnetic stimulation made it harder to shift attention to a target at an unexpected location. The TPJ is also used when thinking about other people's beliefs; a meta-analysis found that its front part is active in both reorienting and this social task, while its back part is more specific to the social task. Whether the TPJ triggers shifts of attention is debated: some researchers argue that its responses come too late and reflect updating of expectations after an unexpected event.",
    roles: {
      attention: "Responds to relevant, unexpected events and is thought to help pull attention away from the current focus.",
    },
    connections:
      "Works with inferior frontal cortex in the ventral attention network and interacts with the dorsal network ([[fef|frontal eye fields]] and [[parietal|parietal cortex]]); at rest, parts of prefrontal cortex are correlated with both networks. Its resting activity also rises and falls with the anterior [[insula|insula]] and mid-cingulate cortex, more strongly for the right TPJ than the left. Corbetta and colleagues proposed that it is influenced by noradrenaline from the [[lc|locus coeruleus]]. Damage to the right TPJ causes spatial neglect more often than damage to the left.",
    limit:
      "The marker sits on the right supramarginal gyrus, near the peak from a meta-analysis of reorienting studies. The TPJ has no agreed borders; definitions include the back of the superior temporal gyrus, the supramarginal gyrus and the angular gyrus, and its position varies between people. It is drawn on the right because the ventral attention network is stronger there; the left TPJ is not shown.",
    sourceIds: [
      "attention-networks",
      "reorienting",
      "multimodal-change",
      "contingent-capture",
      "rtpj-meta",
      "rtpj-tms",
      "tpj-connectivity",
      "network-taxonomy",
      "neglect-networks",
      "attention-rest",
      "dorsal-ventral-interaction",
      "tpj-updating",
    ],
  },
  lc: {
    summary:
      "The locus coeruleus (LC) is a small nucleus in the upper pons, next to the floor of the fourth ventricle. It is the main source of noradrenaline (norepinephrine) for the cortex.",
    mechanism:
      "Its neurons send widely branching axons throughout the brain. All LC neurons receive inputs related to autonomic arousal, and subgroups can also carry more specific signals. In monkeys, LC neurons fired a brief burst to rare target cues in a vigilance task, about 200 ms before the response; the bursts weakened during poor performance and over long sessions. The adaptive gain theory proposes two modes: brief bursts tied to task decisions support the current task, while a tonic mode goes with disengaging and exploring alternatives. Pupil size is often used as a sign of LC activity; in monkeys, LC activity reliably preceded pupil changes, but so did activity in the colliculi and cingulate cortex.",
    roles: {
      attention: "Sets arousal and adjusts how responsive attention networks are; brief bursts accompany important events.",
    },
    connections:
      "In monkeys, receives direct input from the [[cingulate|anterior cingulate]] and orbitofrontal cortex. Sends noradrenaline across the cortex, including [[pfc|prefrontal cortex]] and sensory areas such as [[extrastriate|higher visual areas]]. Acetylcholine, the other modulator most studied in attention, reaches the cortex mainly from the nucleus basalis in the basal forebrain, which is not drawn. In rats, cues that were detected triggered brief acetylcholine release in prefrontal cortex; missed cues did not.",
    limit:
      "The atlas does not include the locus coeruleus, so the marker is an approximate position in the upper pons, a few millimetres from the midline, and the highlight shows the left half of the pons. In MRI of 44 adults, its signal ran for about 15 mm from top to bottom on each side; only the left is marked.",
    sourceIds: ["lc-adaptive-gain", "lc-vigilance", "lc-review", "lc-location", "lc-pupil", "cholinergic-pathways", "ach-cue-detection"],
  },
  dorsalHorn: {
    summary:
      "The dorsal horn is the back part of the spinal cord’s grey matter, where sensory fibres from the body make their first connections. For pain, temperature and itch it is the first relay; its output crosses the cord and rises to the brain in the spinothalamic tract.",
    mechanism:
      "Nociceptor fibres end mainly in laminae I, II and V of the dorsal horn, on relay neurons and local interneurons that adjust the signal before it leaves. In monkeys, the neurons that project to the thalamus are concentrated in lamina I, the outermost layer, and in laminae IV–VI. Their axons usually cross the midline a short distance from the cell body and ascend in the anterolateral part of the cord. Other branches of this system go to the brainstem and midbrain. In cats, some lamina I spinothalamic neurons respond selectively to histamine, a chemical that causes itch.",
    roles: {
      touch:
        "The first relay of the pain and temperature route. Its signals cross to the opposite side near where they enter the cord, much lower than touch and position signals, which cross in the medulla.",
    },
    connections:
      "Receives thin Aδ and C fibres from the right side of the body and sends crossed axons up the spinothalamic tract to the [[vpl|thalamus]]. Because the two routes cross at different levels, damage to one half of the spinal cord (Brown-Séquard syndrome) causes loss of fine touch, vibration and position sense on the same side below the injury, and loss of pain and temperature on the opposite side, starting a few segments below the injury.",
    limit:
      "The spinal cord is not part of the model. The marker sits at the lower end of the right medulla, where the spinal cord begins, and stands for the dorsal horn at every level of the cord; the medulla is highlighted as the nearest modelled structure. The crossing and the tract are drawn as one curve.",
    sourceIds: ["pain-pathways", "nociceptors", "itch-neurons", "cordotomy", "brown-sequard"],
  },
  s2: {
    summary:
      "Secondary somatosensory cortex (S2) lies on the parietal operculum, the upper bank of the lateral sulcus, just below the lower end of S1. It processes touch from both sides of the body and also responds to pain.",
    mechanism:
      "In humans, the parietal operculum contains four areas that differ in their cell layers (OP1–OP4); OP1 is thought to correspond to monkey S2. In monkeys, S2 neurons have large receptive fields that span several fingers and often respond to touch on either hand, and S2 receives input from all four areas of S1 and directly from the thalamus. In macaques, removing the S1 representation of a body part left the matching part of S2 unresponsive to touch, whereas removing S2 did not change S1. In humans, magnetic stimulation over S2 shortly after a painful laser pulse made people worse at judging the pulse’s intensity, but not its location.",
    roles: {
      touch: "A second stage of touch processing that combines input from both sides of the body. It also contributes to judging how intense a pain is.",
    },
    connections:
      "Receives input from [[s1|S1]] and from the [[vpl|thalamus]], and lies just above and outside the [[postInsula|posterior insula]]. In a meta-analysis of brain imaging, touch on the right hand activated S2 in both hemispheres but S1 only on the left.",
    limit:
      "The atlas does not segment the parietal operculum. The marker is at a group-average position for touch on the right hand (MNI −54, −26, 20), snapped to the left supramarginal gyrus; the highlight shows that whole gyrus, most of which lies outside S2. S2 is active in both hemispheres; only the left is shown.",
    sourceIds: ["s1-s2-review", "s2-areas", "s2-maps", "s2-meta", "s2-serial", "s2-pain"],
  },
  postInsula: {
    summary:
      "The posterior insula is the back part of the insula, folded deep inside the lateral sulcus. It is a main cortical target of the spinothalamic pathway and responds to pain, temperature and other signals about the body’s condition.",
    mechanism:
      "In macaques, a posterior thalamic region that receives lamina I spinothalamic input projects in body-ordered fashion to the dorsal posterior insula. In human brain imaging, graded cooling activated the dorsal edge of the middle and posterior insula on the opposite side, and painful heat on the face, hand and foot produced a rough body map there. In a study of 4,160 electrical stimulations across the cortex, only this region and the neighbouring parietal operculum evoked pain. Another stimulation study also evoked pain from a gyrus in the front half of the insula (the middle short gyrus). In a patient without large touch fibres, slow stroking that activates unmyelinated touch (C-tactile) fibres felt faintly pleasant and activated the insula, but not S1 or S2. Whether any part of it is specific to pain is debated: recordings from electrodes in the human insula found similar responses to painful, vibrating, sound and visual stimuli.",
    roles: {
      touch:
        "Receives pain, temperature, itch and other signals about the body’s condition. Craig proposed it as the primary cortex for interoception, the sense of the body’s internal state.",
    },
    connections:
      "Receives input from posterior thalamic nuclei (represented by the [[vpl|thalamus]] marker) and lies just below and inside [[s2|S2]], which is on the parietal operculum. Craig proposed that its signals are passed forward to the [[insula|anterior insula]], where they are re-represented as feelings; in one study, how intense cooling felt correlated with activity in the right anterior insula.",
    limit:
      "The atlas does not segment the insular gyri. The marker is at a group-average position for painful heat on the right hand (MNI −40, −19, 14), snapped to the circular sulcus that borders the insula, and the highlight shows the whole left circular sulcus. The posterior insula is present in both hemispheres; only the left is shown.",
    sourceIds: [
      "vmpo-insula",
      "thermosensory-insula",
      "insula-pain-map",
      "pain-stimulation",
      "ct-touch",
      "interoceptive-cortex",
      "insula-nonspecific",
      "dpins",
      "dpins-debate",
      "insula-stimulation-pain",
    ],
  },
  belt: {
    summary:
      "The auditory belt is a ring of areas surrounding the auditory core, which includes A1. The parabelt lies just outside the belt, on the superior temporal gyrus. Together they are the second and third stages of auditory cortex.",
    mechanism:
      "In monkeys, three core areas project to eight proposed belt areas, and the belt projects to a parabelt with at least a rostral and a caudal division. Lateral belt neurons respond more to complex sounds than to pure tones: many are tuned to the centre frequency and width of noise bands and to the speed and direction of frequency sweeps, and many prefer a small number of monkey calls. Within the lateral belt, the front area is the most selective for the type of call and the back area for the location of the sound. In humans, brain imaging shows a similar order: pure tones activate mainly the core on Heschl’s gyrus, noise bands the cortex next to it, and vowel sounds regions further forward, outward and lower on the superior temporal gyrus. The belt and parabelt also receive some input directly from the thalamus, so the stages partly work in parallel.",
    roles: {
      hearing: "The stages after A1, where neurons combine frequencies into more complex sound patterns and where the “what” and “where” streams begin.",
    },
    connections:
      "Receives input from the [[a1|core]] and some directly from the [[mgn|MGN]]; in monkeys, the parabelt’s thalamic input comes mainly from the dorsal and medial parts of the MGN, with little from the ventral part. In monkeys, the front of the belt and parabelt connects with the [[astg|anterior superior temporal gyrus]] and ventrolateral prefrontal cortex, and the back connects with [[parietal|posterior parietal cortex]], dorsolateral prefrontal cortex and the frontal eye fields. The parabelt also projects to other auditory and multisensory areas of the temporal lobe.",
    limit:
      "The atlas does not segment the belt or parabelt. The marker is on the lateral superior temporal gyrus next to Heschl’s gyrus, at the group peak for vowel sounds in one imaging study, which fell in parabelt-like cortex; the belt itself lies mostly on the upper surface of the temporal lobe, inside the lateral sulcus, around A1. The highlight is the outer (lateral) surface of the left superior temporal gyrus; the atlas has no separate part for the upper surface. Positions vary between people, and only the left hemisphere is shown.",
    sourceIds: [
      "auditory-cortex-streams",
      "parabelt-connections",
      "auditory-what-where",
      "what-where-neurons",
      "belt-fmri",
      "human-auditory-hierarchy",
      "parabelt-thalamus",
    ],
  },
  astg: {
    summary:
      "The anterior superior temporal gyrus is the front part of the gyrus along the top of the temporal lobe. It is part of the auditory “what” stream, which identifies sounds, including spoken words.",
    mechanism:
      "Along the superior temporal gyrus, from Heschl’s gyrus toward the front, regions respond to increasingly complex sounds. In a meta-analysis of more than 100 imaging experiments, speech sounds the length of single phonemes activated the middle of the gyrus most consistently, and whole words activated a site further forward. In macaque monkeys, brain imaging found a region on the front of the superior temporal plane that prefers calls of their own species and is sensitive to which individual is calling. In a study of 15 patients with right-hemisphere damage, those with a selective difficulty recognizing sounds had lesions in the temporal pole and the front of the middle and lower temporal gyri, below the superior temporal gyrus.",
    roles: {
      hearing: "Part of the “what” stream, which identifies sounds such as words, voices and environmental sounds.",
    },
    connections:
      "Receives input from the front of the [[belt|belt and parabelt]]. Connects with [[vlpfc|ventrolateral prefrontal cortex]] in the inferior frontal gyrus (shown by tracer studies in monkeys). Speech sounds processed along this route feed the ventral speech stream described in the Speech topic.",
    limit:
      "The atlas does not segment this region. The marker is a typical group position from a meta-analysis of word-recognition studies, snapped to the left superior temporal gyrus; the region has no sharp borders. It exists in both hemispheres; only the left is shown.",
    sourceIds: ["auditory-streams-review", "word-recognition", "monkey-voice-region", "auditory-prefrontal", "auditory-lesions"],
  },
  l5: {
    summary:
      "Layer 5 is a deep cell layer of the cortex, just above layer 6. Its large pyramidal neurons send output to the thalamus and to brainstem centres that control movement.",
    mechanism:
      "The layer 5 neurons that project to the thalamus are among the largest pyramidal cells in the cortex. Their axons drive cells in higher-order thalamic nuclei, such as the pulvinar in vision and, in rodents, the posterior medial nucleus in touch, which relay the signal to other cortical areas. This forms a route between cortical areas that passes through the thalamus (a transthalamic route), alongside the direct cortical connections. In mouse brain slices, activity from primary touch cortex still reached secondary touch cortex after the direct connection between them was cut, and it disappeared when the thalamus was cut or silenced. Many of these axons also branch to brainstem centres that control movement; one proposal is that the thalamic branch carries a copy of motor commands.",
    roles: {
      loop: "Starts a second route through the thalamus, which carries signals from V1 to higher visual areas.",
    },
    connections:
      "Receives input from the other layers of [[v1|V1]]. Sends axons to the [[pulvinar|pulvinar]], which relays to [[extrastriate|higher visual areas]], and to brainstem centres such as the superior colliculus. [[l6|Layer 6]], just below it, sends the modulating feedback to the [[lgn|LGN]] and [[trn|TRN]].",
    limit:
      "Layer 5 lies within about 2 millimetres of the surface of V1, so it shares V1’s marker and highlight. Layer 5 of higher visual areas also projects to the pulvinar; only the route from V1 is drawn.",
    sourceIds: [
      "higher-order-thalamus",
      "drivers-modulators",
      "transthalamic",
      "transthalamic-slice",
      "transthalamic-review",
      "corticopulvinar",
      "cortical-thickness",
    ],
  },
  vlpfc: {
    summary:
      "Ventrolateral prefrontal cortex lies on the lower part of the outer surface of the frontal lobe and includes the triangular part of the inferior frontal gyrus. In the auditory system it is the frontal end of the “what” stream.",
    mechanism:
      "In monkeys, the front of the auditory belt connects with the frontal pole and with rostral and ventral prefrontal cortex, and the back with caudal dorsolateral prefrontal cortex and the frontal eye fields. Both reach ventrolateral prefrontal cortex, the front at its forward end and the back further back. In monkeys, clusters of ventrolateral prefrontal neurons respond to similar complex calls. In a meta-analysis of human speech-recognition studies, one of the frontal peaks lay in the left triangular part of the inferior frontal gyrus.",
    roles: {
      hearing: "The frontal end of the auditory “what” stream, which identifies sounds.",
    },
    connections:
      "Receives input from the [[astg|anterior superior temporal gyrus]] and the front of the [[belt|belt and parabelt]]. It overlaps the front part of Broca’s area; the [[frontal|Broca’s area]] marker in this model sits on the opercular part of the same gyrus, just behind it.",
    limit:
      "The marker is a peak from a meta-analysis of speech studies (a small cluster reported by about 4% of the experiments), snapped to the triangular part of the left inferior frontal gyrus; the region’s borders are not segmented. It exists in both hemispheres; only the left is shown.",
    sourceIds: ["auditory-prefrontal", "auditory-streams-review", "word-recognition"],
  },
};

export const guideSources: { id: string; title: string; url: string }[] = [
  {
    id: "pain-matrix",
    title: "Iannetti & Mouraux · From the neuromatrix to the pain matrix (and back) (2010)",
    url: "https://doi.org/10.1007/s00221-010-2340-1",
  },
  {
    id: "retinal-circuits",
    title: "Purves et al. · The Retina · Neuroscience (2001)",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK10885/",
  },
  {
    id: "photoreceptors",
    title: "Curcio et al. · Human photoreceptor topography (1990)",
    url: "https://doi.org/10.1002/cne.902920402",
  },
  {
    id: "visual-projections",
    title: "Purves et al. · Central Projections of Retinal Ganglion Cells (2001)",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK11145/",
  },
  {
    id: "lgn-layers",
    title: "Hendry & Reid · The koniocellular pathway in primate vision (2000)",
    url: "https://doi.org/10.1146/annurev.neuro.23.1.127",
  },
  {
    id: "lgn-synapses",
    title: "Van Horn, Erişir & Sherman · Relative distribution of synapses in the cat LGN (2000)",
    url: "https://pubmed.ncbi.nlm.nih.gov/10660881/",
  },
  {
    id: "visual-cortex-map",
    title: "Horton & Hoyt · The representation of the visual field in human striate cortex (1991)",
    url: "https://doi.org/10.1001/archopht.1991.01080060080030",
  },
  {
    id: "hubel-wiesel",
    title: "Hubel & Wiesel · Receptive fields of single neurones in the cat’s striate cortex (1959)",
    url: "https://doi.org/10.1113/jphysiol.1959.sp006308",
  },
  {
    id: "third-pathway",
    title: "Pitcher & Ungerleider · Evidence for a third visual pathway specialized for social perception (2021)",
    url: "https://doi.org/10.1016/j.tics.2020.11.006",
  },
  {
    id: "corticothalamic-circuit",
    title: "Crandall et al. · A corticothalamic switch (2015)",
    url: "https://doi.org/10.1016/j.neuron.2015.03.040",
  },
  {
    id: "ct-awake",
    title: "Dimwamwa et al. · Dynamic corticothalamic modulation during wakefulness (2024)",
    url: "https://doi.org/10.1038/s41467-024-47863-8",
  },
  {
    id: "transthalamic",
    title: "Mo, McKinnon & Sherman · A transthalamic pathway crucial for perception (2024)",
    url: "https://doi.org/10.1038/s41467-024-50163-w",
  },
  {
    id: "trn-basal-ganglia",
    title: "Nakajima, Schmitt & Halassa · Prefrontal cortex regulates sensory filtering through a basal ganglia-to-thalamus pathway (2019)",
    url: "https://doi.org/10.1016/j.neuron.2019.05.026",
  },
  {
    id: "attention-networks",
    title: "Corbetta & Shulman · Control of goal-directed and stimulus-driven attention in the brain (2002)",
    url: "https://doi.org/10.1038/nrn755",
  },
  {
    id: "baseline",
    title: "Kastner et al. · Increased activity in human visual cortex during directed attention (1999)",
    url: "https://doi.org/10.1016/S0896-6273(00)80734-5",
  },
  {
    id: "multisensory-space",
    title: "Macaluso · Spatial Constraints in Multisensory Attention (2012)",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK92871/",
  },
  {
    id: "pulvinar-coordination",
    title: "Saalmann et al. · The pulvinar regulates information transmission between cortical areas (2012)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3714098/",
  },
  {
    id: "attention-gain",
    title: "McAdams & Maunsell · Effects of attention on orientation-tuning functions in V4 (1999)",
    url: "https://doi.org/10.1523/JNEUROSCI.19-01-00431.1999",
  },
  {
    id: "magno-parvo-counts",
    title: "Perry, Oehler & Cowey · Retinal ganglion cells that project to the dorsal lateral geniculate nucleus in the macaque monkey (1984)",
    url: "https://doi.org/10.1016/0306-4522(84)90006-X",
  },
  {
    id: "lgn-latency",
    title: "Maunsell et al. · Visual response latencies of magnocellular and parvocellular LGN neurons in macaque monkeys (1999)",
    url: "https://doi.org/10.1017/S0952523899156177",
  },
  {
    id: "parallel-pathways",
    title: "Nassi & Callaway · Parallel processing strategies of the primate visual system (2009)",
    url: "https://doi.org/10.1038/nrn2619",
  },
  {
    id: "two-streams",
    title: "Goodale & Milner · Separate visual pathways for perception and action (1992)",
    url: "https://doi.org/10.1016/0166-2236(92)90344-8",
  },
  {
    id: "mt-review",
    title: "Born & Bradley · Structure and function of visual area MT (2005)",
    url: "https://doi.org/10.1146/annurev.neuro.26.041002.131052",
  },
  {
    id: "mt-stimulation",
    title: "Salzman, Britten & Newsome · Cortical microstimulation influences perceptual judgements of motion direction (1990)",
    url: "https://doi.org/10.1038/346174a0",
  },
  {
    id: "motion-blindness",
    title: "Zihl, von Cramon & Mai · Selective disturbance of movement vision after bilateral brain damage (1983)",
    url: "https://doi.org/10.1093/brain/106.2.313",
  },
  {
    id: "mt-landmark",
    title: "Dumoulin et al. · A new anatomical landmark for reliable identification of human area V5/MT (2000)",
    url: "https://doi.org/10.1093/cercor/10.5.454",
  },
  {
    id: "mst-flow",
    title: "Duffy & Wurtz · Sensitivity of MST neurons to optic flow stimuli (1991)",
    url: "https://doi.org/10.1152/jn.1991.65.6.1329",
  },
  {
    id: "optic-ataxia",
    title: "Perenin & Vighetto · Optic ataxia: a specific disruption in visuomotor mechanisms (1988)",
    url: "https://doi.org/10.1093/brain/111.3.643",
  },
  {
    id: "object-recognition",
    title: "DiCarlo, Zoccolan & Rust · How does the brain solve visual object recognition? (2012)",
    url: "https://doi.org/10.1016/j.neuron.2012.01.010",
  },
  {
    id: "it-readout",
    title: "Hung et al. · Fast readout of object identity from macaque inferior temporal cortex (2005)",
    url: "https://doi.org/10.1126/science.1117593",
  },
  {
    id: "loc",
    title: "Malach et al. · Object-related activity revealed by fMRI in human occipital cortex (1995)",
    url: "https://doi.org/10.1073/pnas.92.18.8135",
  },
  {
    id: "vtc-review",
    title: "Grill-Spector & Weiner · The functional architecture of the ventral temporal cortex and its role in categorization (2014)",
    url: "https://doi.org/10.1038/nrn3747",
  },
  {
    id: "ffa",
    title: "Kanwisher, McDermott & Chun · The fusiform face area: a module in human extrastriate cortex specialized for face perception (1997)",
    url: "https://doi.org/10.1523/JNEUROSCI.17-11-04302.1997",
  },
  {
    id: "ffa-review",
    title: "Kanwisher & Yovel · The fusiform face area: a cortical region specialized for the perception of faces (2006)",
    url: "https://doi.org/10.1098/rstb.2006.1934",
  },
  {
    id: "face-network",
    title: "Haxby, Hoffman & Gobbini · The distributed human neural system for face perception (2000)",
    url: "https://doi.org/10.1016/S1364-6613(00)01482-0",
  },
  {
    id: "face-stimulation",
    title: "Parvizi et al. · Electrical stimulation of human fusiform face-selective regions distorts face perception (2012)",
    url: "https://doi.org/10.1523/JNEUROSCI.2609-12.2012",
  },
  {
    id: "face-patches",
    title: "Tsao et al. · A cortical region consisting entirely of face-selective cells (2006)",
    url: "https://doi.org/10.1126/science.1119983",
  },
  {
    id: "expertise",
    title: "Gauthier et al. · Expertise for cars and birds recruits brain areas involved in face recognition (2000)",
    url: "https://doi.org/10.1038/72140",
  },
  {
    id: "ppa",
    title: "Epstein & Kanwisher · A cortical representation of the local visual environment (1998)",
    url: "https://doi.org/10.1038/33402",
  },
  {
    id: "opa-affordances",
    title: "Bonner & Epstein · Coding of navigational affordances in the human visual system (2017)",
    url: "https://doi.org/10.1073/pnas.1618228114",
  },
  {
    id: "eba",
    title: "Downing et al. · A cortical area selective for visual processing of the human body (2001)",
    url: "https://doi.org/10.1126/science.1063414",
  },
  {
    id: "eba-tms",
    title: "Urgesi, Berlucchi & Aglioti · Magnetic stimulation of extrastriate body area impairs visual processing of nonfacial body parts (2004)",
    url: "https://doi.org/10.1016/j.cub.2004.11.031",
  },
  {
    id: "eba-action",
    title: "Astafiev et al. · Extrastriate body area in human occipital cortex responds to the performance of motor actions (2004)",
    url: "https://doi.org/10.1038/nn1241",
  },
  {
    id: "fba",
    title: "Peelen & Downing · Selectivity for the human body in the fusiform gyrus (2005)",
    url: "https://doi.org/10.1152/jn.00513.2004",
  },
  {
    id: "vwfa",
    title: "Cohen et al. · The visual word form area (2000)",
    url: "https://doi.org/10.1093/brain/123.2.291",
  },
  {
    id: "vwfa-review",
    title: "Dehaene & Cohen · The unique role of the visual word form area in reading (2011)",
    url: "https://doi.org/10.1016/j.tics.2011.04.003",
  },
  {
    id: "literacy",
    title: "Dehaene et al. · How learning to read changes the cortical networks for vision and language (2010)",
    url: "https://doi.org/10.1126/science.1194140",
  },
  {
    id: "recycling",
    title: "Dehaene & Cohen · Cultural recycling of cortical maps (2007)",
    url: "https://doi.org/10.1016/j.neuron.2007.10.004",
  },
  {
    id: "vwfa-lesion",
    title: "Gaillard et al. · Direct intracranial, fMRI, and lesion evidence for the causal role of left inferotemporal cortex in reading (2006)",
    url: "https://doi.org/10.1016/j.neuron.2006.03.031",
  },
  {
    id: "vwfa-debate",
    title: "Price & Devlin · The myth of the visual word form area (2003)",
    url: "https://doi.org/10.1016/S1053-8119(03)00084-3",
  },
  {
    id: "ohc-motility",
    title: "Ashmore · Cochlear outer hair cell motility (2008)",
    url: "https://doi.org/10.1152/physrev.00044.2006",
  },
  {
    id: "prestin",
    title: "Liberman et al. · Prestin is required for electromotility of the outer hair cell and for the cochlear amplifier (2002)",
    url: "https://doi.org/10.1038/nature01059",
  },
  {
    id: "tonotopy",
    title: "Greenwood · A cochlear frequency-position function for several species (1990)",
    url: "https://doi.org/10.1121/1.399052",
  },
  {
    id: "hidden-hearing-loss",
    title: "Wu et al. · Primary neural degeneration in the human cochlea (2019)",
    url: "https://doi.org/10.1016/j.neuroscience.2018.07.053",
  },
  {
    id: "ear-location",
    title: "Neuroanatomy, Auditory Pathway · StatPearls",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK532311/",
  },
  {
    id: "cochlear-nuclei",
    title: "Purves et al. · The Auditory System (2001)",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK10838/",
  },
  {
    id: "binaural-comparison",
    title: "Purves et al. · Integrating Information from the Two Ears (2001)",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK10820/",
  },
  {
    id: "itd-coding",
    title: "Grothe, Pecka & McAlpine · Mechanisms of sound localization in mammals (2010)",
    url: "https://doi.org/10.1152/physrev.00026.2009",
  },
  {
    id: "inferior-colliculus",
    title: "Neuroanatomy, Inferior Colliculus · StatPearls",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK554468/",
  },
  {
    id: "auditory-thalamus",
    title: "Purves et al. · The Auditory Thalamus (2001)",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK10906/",
  },
  {
    id: "auditory-cortex",
    title: "Purves et al. · The Auditory Cortex (2001)",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK10900/",
  },
  {
    id: "human-tonotopy",
    title: "Moerel, De Martino & Formisano · An anatomical and functional topography of human auditory cortical areas (2014)",
    url: "https://doi.org/10.3389/fnins.2014.00225",
  },
  {
    id: "speech-features",
    title: "Mesgarani et al. · Phonetic feature encoding in human superior temporal gyrus (2014)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4350233/",
  },
  {
    id: "attended-speech",
    title: "Mesgarani & Chang · Selective cortical representation of attended speaker (2012)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3870007/",
  },
  {
    id: "parallel-speech",
    title: "Hamilton et al. · Parallel and distributed encoding of speech across human auditory cortex (2021)",
    url: "https://doi.org/10.1016/j.cell.2021.07.019",
  },
  {
    id: "sound-movement",
    title: "Hickok et al. · Auditory–motor interaction revealed by fMRI in area Spt (2003)",
    url: "https://pubmed.ncbi.nlm.nih.gov/12965041/",
  },
  {
    id: "speech-planning",
    title: "Flinker et al. · Redefining the role of Broca’s area in speech (2015)",
    url: "https://doi.org/10.1073/pnas.1414491112",
  },
  {
    id: "speech-planning-network",
    title: "Castellucci et al. · A speech planning network for interactive language use (2022)",
    url: "https://doi.org/10.1038/s41586-021-04270-z",
  },
  {
    id: "speech-sequencing",
    title: "Liu et al. · Speech sequencing in the human precentral gyrus (2025)",
    url: "https://doi.org/10.1038/s41562-025-02250-1",
  },
  {
    id: "word-planning",
    title: "Khanna et al. · Single-neuronal elements of speech production in humans (2024)",
    url: "https://doi.org/10.1038/s41586-023-06982-w",
  },
  {
    id: "speech-movement",
    title: "Bouchard et al. · Functional organization of human sensorimotor cortex for speech articulation (2013)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3606666/",
  },
  {
    id: "semantic-networks",
    title: "Huth et al. · Natural speech reveals the semantic maps that tile human cerebral cortex (2016)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4852309/",
  },
  {
    id: "language-network",
    title: "Fedorenko, Ivanova & Regev · The language network as a natural kind (2024)",
    url: "https://doi.org/10.1038/s41583-024-00802-4",
  },
  {
    id: "body-touch-route",
    title: "Purves et al. · The Dorsal Column–Medial Lemniscus System (2001)",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK11142/",
  },
  {
    id: "mechanoreceptors",
    title: "Johnson · The roles and functions of cutaneous mechanoreceptors (2001)",
    url: "https://doi.org/10.1016/S0959-4388(00)00234-8",
  },
  {
    id: "somatosensory-cortex",
    title: "Neuroanatomy, Somatosensory Cortex · StatPearls",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK555915/",
  },
  {
    id: "s1-coding",
    title: "Saal & Bensmaia · Touch is a team effort (2014)",
    url: "https://doi.org/10.1016/j.tins.2014.08.012",
  },
  {
    id: "interoceptive-awareness",
    title: "Critchley et al. · Neural systems supporting interoceptive awareness (2004)",
    url: "https://pubmed.ncbi.nlm.nih.gov/14730305/",
  },
  {
    id: "salience-networks",
    title: "Seeley et al. · Dissociable intrinsic connectivity networks for salience processing and executive control (2007)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2680293/",
  },
  {
    id: "salience-switch",
    title: "Menon & Uddin · Saliency, switching, attention and control (2010)",
    url: "https://doi.org/10.1007/s00429-010-0262-0",
  },
  {
    id: "task-control",
    title: "Dosenbach et al. · A core system for the implementation of task sets (2006)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3621133/",
  },
  {
    id: "fef-v4",
    title: "Moore & Armstrong · Selective gating of visual signals by microstimulation of frontal cortex (2003)",
    url: "https://doi.org/10.1038/nature01341",
  },
  {
    id: "fef-performance",
    title: "Moore & Fallah · Control of eye movements and spatial attention (2001)",
    url: "https://doi.org/10.1073/pnas.98.3.1273",
  },
  {
    id: "fef-location",
    title: "Paus · Location and function of the human frontal eye-field: a selective review (1996)",
    url: "https://doi.org/10.1016/0028-3932(95)00134-4",
  },
  {
    id: "fef-review",
    title: "Vernet et al. · Frontal eye field, where art thou? (2014)",
    url: "https://doi.org/10.3389/fnint.2014.00066",
  },
  {
    id: "fef-stimulation-map",
    title: "Bruce et al. · Primate frontal eye fields. II. Physiological and anatomical correlates of electrically evoked eye movements (1985)",
    url: "https://doi.org/10.1152/jn.1985.54.3.714",
  },
  {
    id: "fef-tms",
    title: "Ruff et al. · Concurrent TMS-fMRI and psychophysics reveal frontal influences on human retinotopic visual cortex (2006)",
    url: "https://doi.org/10.1016/j.cub.2006.06.057",
  },
  {
    id: "fef-v4-coupling",
    title: "Gregoriou et al. · High-frequency, long-range coupling between prefrontal and visual cortex during attention (2009)",
    url: "https://doi.org/10.1126/science.1171402",
  },
  {
    id: "fef-cell-types",
    title: "Gregoriou, Gotts & Desimone · Cell-type-specific synchronization of neural activity in FEF with V4 during attention (2012)",
    url: "https://doi.org/10.1016/j.neuron.2011.12.019",
  },
  {
    id: "fef-projections",
    title: "Stanton, Bruce & Goldberg · Topography of projections to posterior cortical areas from the macaque frontal eye fields (1995)",
    url: "https://doi.org/10.1002/cne.903530210",
  },
  {
    id: "fef-sc-projection",
    title: "Stanton, Goldberg & Bruce · Frontal eye field efferents in the macaque monkey: II. Topography of terminal fields in midbrain and pons (1988)",
    url: "https://doi.org/10.1002/cne.902710403",
  },
  {
    id: "lip-priority",
    title: "Bisley & Goldberg · Attention, intention, and priority in the parietal lobe (2010)",
    url: "https://doi.org/10.1146/annurev-neuro-060909-152823",
  },
  {
    id: "lip-attention",
    title: "Bisley & Goldberg · Neuronal activity in the lateral intraparietal area and spatial attention (2003)",
    url: "https://doi.org/10.1126/science.1077395",
  },
  {
    id: "lip-sc",
    title: "Paré & Wurtz · Monkey posterior parietal cortex neurons antidromically activated from superior colliculus (1997)",
    url: "https://doi.org/10.1152/jn.1997.78.6.3493",
  },
  {
    id: "sc-attention",
    title: "Krauzlis, Lovejoy & Zénon · Superior colliculus and visual spatial attention (2013)",
    url: "https://doi.org/10.1146/annurev-neuro-062012-170249",
  },
  {
    id: "sc-inactivation",
    title: "Lovejoy & Krauzlis · Inactivation of primate superior colliculus impairs covert selection of signals for perceptual judgments (2010)",
    url: "https://doi.org/10.1038/nn.2470",
  },
  {
    id: "sc-cortex-independent",
    title: "Zénon & Krauzlis · Attention deficits without cortical neuronal deficits (2012)",
    url: "https://doi.org/10.1038/nature11497",
  },
  {
    id: "sc-stimulation",
    title: "Müller, Philiastides & Newsome · Microstimulation of the superior colliculus focuses attention without moving the eyes (2005)",
    url: "https://doi.org/10.1073/pnas.0408311101",
  },
  {
    id: "sc-gaze",
    title: "Freedman, Stanford & Sparks · Combined eye-head gaze shifts produced by electrical stimulation of the superior colliculus in rhesus monkeys (1996)",
    url: "https://doi.org/10.1152/jn.1996.76.2.927",
  },
  {
    id: "sc-human",
    title: "Schneider & Kastner · Effects of sustained spatial attention in the human lateral geniculate nucleus and superior colliculus (2009)",
    url: "https://doi.org/10.1523/JNEUROSCI.4452-08.2009",
  },
  {
    id: "sc-pulvinar-mt",
    title: "Berman & Wurtz · Functional identification of a pulvinar path from superior colliculus to cortical area MT (2010)",
    url: "https://doi.org/10.1523/JNEUROSCI.6176-09.2010",
  },
  {
    id: "sc-corollary",
    title: "Sommer & Wurtz · A pathway in primate brain for internal monitoring of movements (2002)",
    url: "https://doi.org/10.1126/science.1069590",
  },
  {
    id: "reorienting",
    title: "Corbetta, Patel & Shulman · The reorienting system of the human brain (2008)",
    url: "https://doi.org/10.1016/j.neuron.2008.04.017",
  },
  {
    id: "multimodal-change",
    title: "Downar et al. · A multimodal cortical network for the detection of changes in the sensory environment (2000)",
    url: "https://doi.org/10.1038/72991",
  },
  {
    id: "contingent-capture",
    title: "Serences et al. · Coordination of voluntary and stimulus-driven attentional control in human cortex (2005)",
    url: "https://doi.org/10.1111/j.0956-7976.2005.00791.x",
  },
  {
    id: "rtpj-meta",
    title: "Krall et al. · The role of the right temporoparietal junction in attention and social interaction as revealed by ALE meta-analysis (2015)",
    url: "https://doi.org/10.1007/s00429-014-0803-z",
  },
  {
    id: "rtpj-tms",
    title: "Krall et al. · The right temporoparietal junction in attention and social interaction: a TMS study (2016)",
    url: "https://doi.org/10.1002/hbm.23068",
  },
  {
    id: "tpj-connectivity",
    title: "Kucyi, Hodaie & Davis · Lateralization in intrinsic functional connectivity of the temporoparietal junction (2012)",
    url: "https://doi.org/10.1152/jn.00674.2012",
  },
  {
    id: "network-taxonomy",
    title: "Uddin, Yeo & Spreng · Towards a universal taxonomy of macro-scale functional human brain networks (2019)",
    url: "https://doi.org/10.1007/s10548-019-00744-6",
  },
  {
    id: "neglect-networks",
    title: "Corbetta & Shulman · Spatial neglect and attention networks (2011)",
    url: "https://doi.org/10.1146/annurev-neuro-061010-113731",
  },
  {
    id: "neglect-anatomy",
    title: "Mort et al. · The anatomy of visual neglect (2003)",
    url: "https://doi.org/10.1093/brain/awg200",
  },
  {
    id: "neglect-temporal",
    title: "Karnath, Ferber & Himmelbach · Spatial awareness is a function of the temporal not the posterior parietal lobe (2001)",
    url: "https://doi.org/10.1038/35082075",
  },
  {
    id: "attention-rest",
    title: "Fox et al. · Spontaneous neuronal activity distinguishes human dorsal and ventral attention systems (2006)",
    url: "https://doi.org/10.1073/pnas.0604187103",
  },
  {
    id: "dorsal-ventral-interaction",
    title: "Vossel, Geng & Fink · Dorsal and ventral attention systems: distinct neural circuits but collaborative roles (2014)",
    url: "https://doi.org/10.1177/1073858413494269",
  },
  {
    id: "lc-adaptive-gain",
    title: "Aston-Jones & Cohen · An integrative theory of locus coeruleus-norepinephrine function (2005)",
    url: "https://doi.org/10.1146/annurev.neuro.28.061604.135709",
  },
  {
    id: "lc-vigilance",
    title: "Aston-Jones et al. · Locus coeruleus neurons in monkey are selectively activated by attended cues in a vigilance task (1994)",
    url: "https://doi.org/10.1523/JNEUROSCI.14-07-04467.1994",
  },
  {
    id: "lc-review",
    title: "Poe et al. · Locus coeruleus: a new look at the blue spot (2020)",
    url: "https://doi.org/10.1038/s41583-020-0360-9",
  },
  {
    id: "lc-location",
    title: "Keren et al. · In vivo mapping of the human locus coeruleus (2009)",
    url: "https://doi.org/10.1016/j.neuroimage.2009.06.012",
  },
  {
    id: "lc-pupil",
    title: "Joshi et al. · Relationships between pupil diameter and neuronal activity in the locus coeruleus, colliculi, and cingulate cortex (2016)",
    url: "https://doi.org/10.1016/j.neuron.2015.11.028",
  },
  {
    id: "cholinergic-pathways",
    title: "Mesulam et al. · Central cholinergic pathways in the rat: an overview based on an alternative nomenclature (Ch1–Ch6) (1983)",
    url: "https://doi.org/10.1016/0306-4522(83)90108-2",
  },
  {
    id: "ach-cue-detection",
    title: "Parikh et al. · Prefrontal acetylcholine release controls cue detection on multiple timescales (2007)",
    url: "https://doi.org/10.1016/j.neuron.2007.08.025",
  },
  {
    id: "ach-v1",
    title: "Herrero et al. · Acetylcholine contributes through muscarinic receptors to attentional modulation in V1 (2008)",
    url: "https://doi.org/10.1038/nature07141",
  },
  {
    id: "pain-pathways",
    title: "Willis & Westlund · Neuroanatomy of the pain system and of the pathways that modulate pain (1997)",
    url: "https://doi.org/10.1097/00004691-199701000-00002",
  },
  {
    id: "nociceptors",
    title: "Dubin & Patapoutian · Nociceptors: the sensors of the pain pathway (2010)",
    url: "https://doi.org/10.1172/JCI42843",
  },
  {
    id: "itch-neurons",
    title: "Andrew & Craig · Spinothalamic lamina I neurons selectively sensitive to histamine: a central neural pathway for itch (2001)",
    url: "https://doi.org/10.1038/82924",
  },
  {
    id: "cordotomy",
    title: "Marshall et al. · Spinal signalling of C-fiber mediated pleasant touch in humans (2019)",
    url: "https://doi.org/10.7554/eLife.51642",
  },
  {
    id: "brown-sequard",
    title: "Rodríguez-Quintero et al. · Traumatic Brown-Séquard syndrome: modern reminder of a neurological injury (2020)",
    url: "https://doi.org/10.1136/bcr-2020-236131",
  },
  {
    id: "lamina1-thalamus",
    title: "Craig · Distribution of trigeminothalamic and spinothalamic lamina I terminations in the macaque monkey (2004)",
    url: "https://doi.org/10.1002/cne.20240",
  },
  {
    id: "vmpo-debate",
    title: "Graziano & Jones · Widespread thalamic terminations of fibers arising in the superficial medullary dorsal horn of monkeys (2004)",
    url: "https://doi.org/10.1523/JNEUROSCI.4122-03.2004",
  },
  {
    id: "vmpo-insula",
    title:
      "Craig · Topographically organized projection to posterior insular cortex from the posterior portion of the ventral medial nucleus in the long-tailed macaque monkey (2014)",
    url: "https://doi.org/10.1002/cne.23425",
  },
  {
    id: "spinothalamic-cortex",
    title: "Dum, Levinthal & Strick · The spinothalamic system targets motor and sensory areas in the cerebral cortex of monkeys (2009)",
    url: "https://doi.org/10.1523/JNEUROSCI.3398-09.2009",
  },
  {
    id: "thermosensory-insula",
    title: "Craig et al. · Thermosensory activation of insular cortex (2000)",
    url: "https://doi.org/10.1038/72131",
  },
  {
    id: "insula-pain-map",
    title: "Brooks et al. · Somatotopic organisation of the human insula to painful heat studied with high resolution functional imaging (2005)",
    url: "https://doi.org/10.1016/j.neuroimage.2005.03.041",
  },
  {
    id: "interoceptive-cortex",
    title: "Craig · Interoception: the sense of the physiological condition of the body (2003)",
    url: "https://doi.org/10.1016/S0959-4388(03)00090-4",
  },
  {
    id: "pain-stimulation",
    title: "Mazzola et al. · Stimulation of the human cortex and the experience of pain (2012)",
    url: "https://doi.org/10.1093/brain/awr265",
  },
  {
    id: "dpins",
    title: "Segerdahl et al. · The dorsal posterior insula subserves a fundamental role in human pain (2015)",
    url: "https://doi.org/10.1038/nn.3969",
  },
  {
    id: "dpins-debate",
    title: "Davis et al. · Evidence against pain specificity in the dorsal posterior insula (2015)",
    url: "https://doi.org/10.12688/f1000research.6833.1",
  },
  {
    id: "insula-nonspecific",
    title: "Liberati et al. · Nociceptive local field potentials recorded from the human insula are not specific for nociception (2016)",
    url: "https://doi.org/10.1371/journal.pbio.1002345",
  },
  {
    id: "ct-touch",
    title: "Olausson et al. · Unmyelinated tactile afferents signal touch and project to insular cortex (2002)",
    url: "https://doi.org/10.1038/nn896",
  },
  {
    id: "s1-s2-review",
    title: "Delhaye, Long & Bensmaia · Neural basis of touch and proprioception in primate cortex (2018)",
    url: "https://doi.org/10.1002/cphy.c170033",
  },
  {
    id: "s1-maps",
    title: "Kaas et al. · Multiple representations of the body within the primary somatosensory cortex of primates (1979)",
    url: "https://doi.org/10.1126/science.107591",
  },
  {
    id: "penfield",
    title: "Penfield & Boldrey · Somatic motor and sensory representation in the cerebral cortex of man as studied by electrical stimulation (1937)",
    url: "https://doi.org/10.1093/brain/60.4.389",
  },
  {
    id: "s2-areas",
    title: "Eickhoff et al. · The human parietal operculum. I. Cytoarchitectonic mapping of subdivisions (2006)",
    url: "https://doi.org/10.1093/cercor/bhi105",
  },
  {
    id: "s2-maps",
    title: "Eickhoff et al. · The human parietal operculum. II. Stereotaxic maps and correlation with functional imaging results (2006)",
    url: "https://doi.org/10.1093/cercor/bhi106",
  },
  {
    id: "s2-meta",
    title: "Lamp et al. · Activation of bilateral secondary somatosensory cortex with right hand touch stimulation (2019)",
    url: "https://doi.org/10.3389/fneur.2018.01129",
  },
  {
    id: "s2-serial",
    title: "Pons et al. · Physiological evidence for serial processing in somatosensory cortex (1987)",
    url: "https://doi.org/10.1126/science.3603028",
  },
  {
    id: "s2-pain",
    title: "Lockwood, Iannetti & Haggard · TMS over human secondary somatosensory cortex disrupts perception of pain intensity (2013)",
    url: "https://doi.org/10.1016/j.cortex.2012.10.006",
  },
  {
    id: "pain-affect",
    title: "Rainville et al. · Pain affect encoded in human anterior cingulate but not somatosensory cortex (1997)",
    url: "https://doi.org/10.1126/science.277.5328.968",
  },
  {
    id: "pain-affect-lesion",
    title: "Ploner, Freund & Schnitzler · Pain affect without pain sensation in a patient with a postcentral lesion (1999)",
    url: "https://doi.org/10.1016/S0304-3959(99)00012-3",
  },
  {
    id: "cingulate-thalamus",
    title: "Shyu & Vogt · Short-term synaptic plasticity in the nociceptive thalamic-anterior cingulate pathway (2009)",
    url: "https://doi.org/10.1186/1744-8069-5-51",
  },
  {
    id: "auditory-cortex-streams",
    title: "Kaas & Hackett · Subdivisions of auditory cortex and processing streams in primates (2000)",
    url: "https://doi.org/10.1073/pnas.97.22.11793",
  },
  {
    id: "parabelt-connections",
    title:
      "Hackett, Stepniewska & Kaas · Subdivisions of auditory cortex and ipsilateral cortical connections of the parabelt auditory cortex in macaque monkeys (1998)",
    url: "https://pubmed.ncbi.nlm.nih.gov/9590556/",
  },
  {
    id: "auditory-what-where",
    title: "Rauschecker & Tian · Mechanisms and streams for processing of “what” and “where” in auditory cortex (2000)",
    url: "https://doi.org/10.1073/pnas.97.22.11800",
  },
  {
    id: "what-where-neurons",
    title: "Tian et al. · Functional specialization in rhesus monkey auditory cortex (2001)",
    url: "https://doi.org/10.1126/science.1058911",
  },
  {
    id: "auditory-prefrontal",
    title: "Romanski et al. · Dual streams of auditory afferents target multiple domains in the primate prefrontal cortex (1999)",
    url: "https://doi.org/10.1038/16056",
  },
  {
    id: "auditory-streams-review",
    title: "Rauschecker & Scott · Maps and streams in the auditory cortex (2009)",
    url: "https://doi.org/10.1038/nn.2331",
  },
  {
    id: "belt-fmri",
    title: "Wessinger et al. · Hierarchical organization of the human auditory cortex revealed by functional magnetic resonance imaging (2001)",
    url: "https://doi.org/10.1162/089892901564108",
  },
  {
    id: "human-auditory-hierarchy",
    title: "Chevillet, Riesenhuber & Rauschecker · Functional correlates of the anterolateral processing hierarchy in human auditory cortex (2011)",
    url: "https://doi.org/10.1523/JNEUROSCI.1448-11.2011",
  },
  {
    id: "word-recognition",
    title: "DeWitt & Rauschecker · Phoneme and word recognition in the auditory ventral stream (2012)",
    url: "https://doi.org/10.1073/pnas.1113427109",
  },
  {
    id: "monkey-voice-region",
    title: "Petkov et al. · A voice region in the monkey brain (2008)",
    url: "https://doi.org/10.1038/nn2043",
  },
  {
    id: "auditory-where-meta",
    title: "Arnott et al. · Assessing the auditory dual-pathway model in humans (2004)",
    url: "https://doi.org/10.1016/j.neuroimage.2004.01.014",
  },
  {
    id: "auditory-lesions",
    title: "Clarke et al. · What and Where in human audition: selective deficits following focal hemispheric lesions (2002)",
    url: "https://doi.org/10.1007/s00221-002-1203-9",
  },
  {
    id: "auditory-where-debate",
    title: "Zatorre et al. · Where is ‘where’ in the human auditory cortex? (2002)",
    url: "https://doi.org/10.1038/nn904",
  },
  {
    id: "olivocochlear",
    title: "Guinan · Olivocochlear efferents: anatomy, physiology, function, and the measurement of efferent effects in humans (2006)",
    url: "https://doi.org/10.1097/01.aud.0000240507.83072.e7",
  },
  {
    id: "olivocochlear-human",
    title: "Lopez-Poveda · Olivocochlear efferents in animals and humans: from anatomy to clinical relevance (2018)",
    url: "https://doi.org/10.3389/fneur.2018.00197",
  },
  {
    id: "olivocochlear-behaviour",
    title: "Lauer, Jimenez & Delano · Olivocochlear efferent effects on perception and behavior (2022)",
    url: "https://doi.org/10.1016/j.heares.2021.108207",
  },
  {
    id: "antimasking",
    title: "Kawase, Delgutte & Liberman · Antimasking effects of the olivocochlear reflex. II (1993)",
    url: "https://doi.org/10.1152/jn.1993.70.6.2533",
  },
  {
    id: "attention-cochlea",
    title: "Delano et al. · Selective attention to visual stimuli reduces cochlear sensitivity in chinchillas (2007)",
    url: "https://doi.org/10.1523/JNEUROSCI.3702-06.2007",
  },
  {
    id: "attention-oae",
    title: "Beim, Oxenham & Wojtczak · Examining replicability of an otoacoustic measure of cochlear function during selective attention (2018)",
    url: "https://doi.org/10.1121/1.5079311",
  },
  {
    id: "attention-oae-null",
    title: "Beim, Oxenham & Wojtczak · No effects of attention or visual perceptual load on cochlear function (2019)",
    url: "https://doi.org/10.1121/1.5123391",
  },
  {
    id: "cortex-olive",
    title: "Mulders & Robertson · Evidence for direct cortical innervation of medial olivocochlear neurones in rats (2000)",
    url: "https://doi.org/10.1016/S0378-5955(00)00046-0",
  },
  {
    id: "colliculus-olive",
    title: "Vetter, Saldaña & Mugnaini · Input from the inferior colliculus to medial olivocochlear neurons in the rat (1993)",
    url: "https://doi.org/10.1016/0378-5955(93)90156-U",
  },
  {
    id: "cortex-cochlea",
    title:
      "Dragicevic et al. · The olivocochlear reflex strength and cochlear sensitivity are independently modulated by auditory cortex microstimulation (2015)",
    url: "https://doi.org/10.1007/s10162-015-0509-9",
  },
  {
    id: "higher-order-thalamus",
    title: "Sherman · Thalamus plays a central role in ongoing cortical functioning (2016)",
    url: "https://doi.org/10.1038/nn.4269",
  },
  {
    id: "drivers-modulators",
    title: "Sherman & Guillery · On the actions that one nerve cell can have on another: distinguishing “drivers” from “modulators” (1998)",
    url: "https://doi.org/10.1073/pnas.95.12.7121",
  },
  {
    id: "transthalamic-slice",
    title: "Theyel, Llano & Sherman · The corticothalamocortical circuit drives higher-order cortex in the mouse (2010)",
    url: "https://doi.org/10.1038/nn.2449",
  },
  {
    id: "transthalamic-review",
    title: "Sherman & Usrey · Transthalamic pathways for cortical function (2024)",
    url: "https://doi.org/10.1523/JNEUROSCI.0909-24.2024",
  },
  {
    id: "corticopulvinar",
    title: "Rockland · Two types of corticopulvinar terminations: round (type 2) and elongate (type 1) (1996)",
    url: "https://pubmed.ncbi.nlm.nih.gov/8725294/",
  },
  {
    id: "visual-transthalamic",
    title: "Blot et al. · Visual intracortical and transthalamic pathways carry distinct information to cortical areas (2021)",
    url: "https://doi.org/10.1016/j.neuron.2021.04.017",
  },
  {
    id: "cortical-thickness",
    title: "Fischl & Dale · Measuring the thickness of the human cerebral cortex from magnetic resonance images (2000)",
    url: "https://doi.org/10.1073/pnas.200033797",
  },
  {
    id: "tpj-updating",
    title: "Geng & Vossel · Re-evaluating the role of TPJ in attentional control: contextual updating? (2013)",
    url: "https://doi.org/10.1016/j.neubiorev.2013.08.010",
  },
  {
    id: "conflict-monitoring",
    title: "Botvinick et al. · Conflict monitoring and cognitive control (2001)",
    url: "https://doi.org/10.1037/0033-295X.108.3.624",
  },
  {
    id: "conflict-adjustment",
    title: "Kerns et al. · Anterior cingulate conflict monitoring and adjustments in control (2004)",
    url: "https://doi.org/10.1126/science.1089910",
  },
  {
    id: "attention-reliability",
    title: "Mitchell, Sundberg & Reynolds · Differential attention-dependent response modulation across cell classes in macaque V4 (2007)",
    url: "https://doi.org/10.1016/j.neuron.2007.06.018",
  },
  {
    id: "attention-competition",
    title: "Reynolds, Chelazzi & Desimone · Competitive mechanisms subserve attention in macaque areas V2 and V4 (1999)",
    url: "https://doi.org/10.1523/JNEUROSCI.19-05-01736.1999",
  },
  {
    id: "crossmodal-attention",
    title: "Johnson & Zatorre · Attention to simultaneous unrelated auditory and visual events (2005)",
    url: "https://doi.org/10.1093/cercor/bhi039",
  },
  {
    id: "crossmodal-shifts",
    title: "Shomstein & Yantis · Control of attention shifts between vision and audition in human cortex (2004)",
    url: "https://doi.org/10.1523/JNEUROSCI.2939-04.2004",
  },
  {
    id: "persistent-activity",
    title: "Constantinidis et al. · Persistent spiking activity underlies working memory (2018)",
    url: "https://doi.org/10.1523/JNEUROSCI.2486-17.2018",
  },
  {
    id: "activity-bursts",
    title: "Lundqvist, Herman & Miller · Working memory: delay activity, yes! Persistent activity? Maybe not (2018)",
    url: "https://doi.org/10.1523/JNEUROSCI.2485-17.2018",
  },
  {
    id: "auditory-attention",
    title: "Woldorff et al. · Modulation of early sensory processing in human auditory cortex during auditory selective attention (1993)",
    url: "https://doi.org/10.1073/pnas.90.18.8722",
  },
  {
    id: "touch-attention",
    title:
      "Hsiao, O'Shaughnessy & Johnson · Effects of selective attention on spatial form processing in monkey primary and secondary somatosensory cortex (1993)",
    url: "https://doi.org/10.1152/jn.1993.70.1.444",
  },
  {
    id: "cingulate-subregions",
    title: "Vogt · Pain and emotion interactions in subregions of the cingulate gyrus (2005)",
    url: "https://doi.org/10.1038/nrn1704",
  },
  {
    id: "insula-stimulation-pain",
    title: "Afif et al. · Middle short gyrus of the insula implicated in pain processing (2008)",
    url: "https://doi.org/10.1016/j.pain.2008.02.004",
  },
  {
    id: "s1-convergence",
    title: "Saal & Bensmaia · Touch is a team effort: interplay of submodalities in cutaneous sensibility (2014)",
    url: "https://doi.org/10.1016/j.tins.2014.08.012",
  },
  {
    id: "ganglion-counts",
    title: "Curcio & Allen · Topography of ganglion cells in human retina (1990)",
    url: "https://doi.org/10.1002/cne.903000103",
  },
  {
    id: "optic-nerve-fibres",
    title: "Pawar et al. · Nerve fibre organisation in the human optic nerve and chiasm: what do we really know? (2024)",
    url: "https://doi.org/10.1038/s41433-024-03137-7",
  },
  {
    id: "streams-critique",
    title: "Schenk & McIntosh · Do we have independent visual streams for perception and action? (2010)",
    url: "https://doi.org/10.1080/17588920903388950",
  },
  {
    id: "parietal-gain-fields",
    title: "Andersen, Essick & Siegel · Encoding of spatial location by posterior parietal neurons (1985)",
    url: "https://doi.org/10.1126/science.4048942",
  },
  {
    id: "lgn-mt",
    title: "Sincich et al. · Bypassing V1: a direct geniculate input to area MT (2004)",
    url: "https://doi.org/10.1038/nn1318",
  },
  {
    id: "v1-columns",
    title: "Adams, Sincich & Horton · Complete pattern of ocular dominance columns in human primary visual cortex (2007)",
    url: "https://doi.org/10.1523/JNEUROSCI.2923-07.2007",
  },
  {
    id: "ventral-framework",
    title: "Kravitz et al. · The ventral visual pathway: an expanded neural framework for the processing of object quality (2013)",
    url: "https://doi.org/10.1016/j.tics.2012.10.011",
  },
  {
    id: "face-framework",
    title: "Duchaine & Yovel · A revised neural framework for face processing (2015)",
    url: "https://doi.org/10.1146/annurev-vision-082114-035518",
  },
  {
    id: "ppa-navigation",
    title: "Epstein · Parahippocampal and retrosplenial contributions to human spatial navigation (2008)",
    url: "https://doi.org/10.1016/j.tics.2008.07.004",
  },
  {
    id: "eba-overlap",
    title: "Downing, Wiggett & Peelen · fMRI investigation of overlapping lateral occipitotemporal activations using multi-voxel pattern analysis (2007)",
    url: "https://doi.org/10.1523/JNEUROSCI.3619-06.2007",
  },
  {
    id: "eba-patches",
    title: "Weiner & Grill-Spector · Not one extrastriate body area (2011)",
    url: "https://doi.org/10.1016/j.neuroimage.2011.03.041",
  },
  {
    id: "eba-perceptual",
    title:
      "Kontaris, Wiggett & Downing · Dissociation of extrastriate body and biological-motion selective areas by manipulation of visual-motor congruency (2009)",
    url: "https://doi.org/10.1016/j.neuropsychologia.2009.07.012",
  },
  {
    id: "vwfa-experience",
    title: "Baker et al. · Visual word processing and experiential origins of functional selectivity in human extrastriate cortex (2007)",
    url: "https://doi.org/10.1073/pnas.0703300104",
  },
  {
    id: "vwfa-case",
    title: "Dehaene et al. · Cerebral mechanisms of word masking and unconscious repetition priming (2001)",
    url: "https://doi.org/10.1038/89551",
  },
  {
    id: "dorsal-framework",
    title: "Kravitz et al. · A new neural framework for visuospatial processing (2011)",
    url: "https://doi.org/10.1038/nrn3008",
  },
  {
    id: "ic-bypass",
    title: "Malmierca et al. · Direct projections from cochlear nuclear complex to auditory thalamus in the rat (2002)",
    url: "https://doi.org/10.1523/JNEUROSCI.22-24-10891.2002",
  },
  {
    id: "mgn-amygdala",
    title: "LeDoux, Farb & Ruggiero · Topographic organization of neurons in the acoustic thalamus that project to the amygdala (1990)",
    url: "https://doi.org/10.1523/JNEUROSCI.10-04-01043.1990",
  },
  {
    id: "a1-cytoarchitecture",
    title: "Morosan et al. · Human primary auditory cortex: cytoarchitectonic subdivisions and mapping into a spatial reference system (2001)",
    url: "https://doi.org/10.1006/nimg.2000.0715",
  },
  {
    id: "a1-variability",
    title: "Rademacher et al. · Probabilistic mapping and volume measurement of human primary auditory cortex (2001)",
    url: "https://doi.org/10.1006/nimg.2000.0714",
  },
  {
    id: "hidden-hearing-loss-human",
    title: "Wu et al. · Primary neural degeneration in the human cochlea: evidence for hidden hearing loss in the aging ear (2019)",
    url: "https://doi.org/10.1016/j.neuroscience.2018.07.053",
  },
  {
    id: "sound-localization",
    title: "Middlebrooks & Green · Sound localization by human listeners (1991)",
    url: "https://doi.org/10.1146/annurev.ps.42.020191.001031",
  },
  {
    id: "vnll",
    title: "Batra & Fitzpatrick · Monaural and binaural processing in the ventral nucleus of the lateral lemniscus (2002)",
    url: "https://doi.org/10.1016/S0378-5955(02)00368-4",
  },
  {
    id: "itd-thresholds",
    title: "Brughera, Dunai & Hartmann · Human interaural time difference thresholds for sine tones: the high-frequency limit (2013)",
    url: "https://doi.org/10.1121/1.4795778",
  },
  {
    id: "sound-localization-mechanisms",
    title: "Grothe, Pecka & McAlpine · Mechanisms of sound localization in mammals (2010)",
    url: "https://doi.org/10.1152/physrev.00026.2009",
  },
  {
    id: "tonotopy-orientation",
    title: "Da Costa et al. · Human primary auditory cortex follows the shape of Heschl's gyrus (2011)",
    url: "https://doi.org/10.1523/JNEUROSCI.2000-11.2011",
  },
  {
    id: "speech-parallel",
    title: "Hamilton et al. · Parallel and distributed encoding of speech across human auditory cortex (2021)",
    url: "https://doi.org/10.1016/j.cell.2021.07.019",
  },
  {
    id: "music-speech-asymmetry",
    title: "Zatorre, Belin & Penhune · Structure and function of auditory cortex: music and speech (2002)",
    url: "https://doi.org/10.1016/S1364-6613(00)01816-7",
  },
  {
    id: "asymmetry-debate",
    title: "McGettigan & Scott · Cortical asymmetries in speech perception: what's wrong, what's right and what's left? (2012)",
    url: "https://doi.org/10.1016/j.tics.2012.04.006",
  },
  {
    id: "parabelt-thalamus",
    title: "Hackett, Stepniewska & Kaas · Thalamocortical connections of the parabelt auditory cortex in macaque monkeys (1998)",
    url: "https://pubmed.ncbi.nlm.nih.gov/9766404/",
  },
  {
    id: "lgn-attention",
    title: "McAlonan, Cavanaugh & Wurtz · Guarding the gateway to cortex with attention in visual thalamus (2008)",
    url: "https://doi.org/10.1038/nature07382",
  },
  {
    id: "spindles-trn",
    title: "Steriade et al. · The deafferented reticular thalamic nucleus generates spindle rhythmicity (1987)",
    url: "https://doi.org/10.1152/jn.1987.57.1.260",
  },
  {
    id: "spindles-review",
    title: "Fernandez & Lüthi · Sleep spindles: mechanisms and functions (2020)",
    url: "https://doi.org/10.1152/physrev.00042.2018",
  },
  {
    id: "lgn-inputs-split",
    title: "Erişir, Van Horn & Sherman · Relative numbers of cortical and brainstem inputs to the lateral geniculate nucleus (1997)",
    url: "https://doi.org/10.1073/pnas.94.4.1517",
  },
  {
    id: "trn-synapse-strength",
    title:
      "Golshani, Liu & Jones · Differences in quantal amplitude reflect GluR4 subunit number at corticothalamic synapses on two populations of thalamic neurons (2001)",
    url: "https://doi.org/10.1073/pnas.061013698",
  },
];
