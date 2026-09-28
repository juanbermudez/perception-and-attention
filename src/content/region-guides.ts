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
      "Rods and cones absorb light; their activity decreases when light reaches them. Other retinal cells (bipolar, horizontal and amacrine cells) compare signals from neighbouring points, so the output mainly reports contrast, colour differences and change. Only ganglion cells send output to the brain. There are several types, each sending a different version of the image. In monkeys, about 80% are midget cells (fine detail and red–green colour) and about 10% are parasol cells (motion and changes in brightness).",
    roles: { vision: "The first stage of vision. The image is processed and compressed here before any signal reaches the brain." },
    connections:
      "Ganglion-cell axons form the optic nerve, which runs to the [[chiasm|optic chiasm]]. The [[retinaR|right retina]] does the same for the other eye.",
    limit: "Shown as a surface. The retinal layers, cell types and the blind spot are not modelled.",
    sourceIds: ["retinal-circuits", "photoreceptors", "magno-parvo-counts"],
  },
  retinaR: {
    summary: "The retina of the right eye.",
    mechanism:
      "Ganglion cells in the half nearest the nose send fibres that cross at the chiasm; those in the outer half send fibres that stay on the same side.",
    roles: { vision: "Both eyes see most of the scene. After the chiasm, each hemisphere receives one half of the visual field from both eyes." },
    connections: "The right optic nerve joins the left at the [[chiasm|optic chiasm]].",
    limit: "The crossing and non-crossing fibres of each optic nerve are drawn as a single curve.",
    sourceIds: ["retinal-circuits", "visual-projections"],
  },
  chiasm: {
    summary: "The optic chiasm is where the two optic nerves meet, just above the pituitary gland.",
    mechanism:
      "Fibres from the nasal half of each retina cross to the opposite side; fibres from the temporal half do not. After the chiasm, fibres are grouped by side of the visual field instead of by eye.",
    roles: { vision: "Everything in the right half of the visual field is sent to the left hemisphere, and the reverse." },
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
      "Receives the optic tract and sends the optic radiation to [[v1|V1]]. Receives feedback from [[l6|layer 6]] directly and through the [[trn|TRN]]. In primates, about 90% of retinal ganglion cells project here; the rest go to the superior colliculus (eye movements), the pretectum (pupil reflex) and the suprachiasmatic nucleus (daily body clock).",
    limit: "The atlas includes this nucleus, but its layers are not modelled.",
    sourceIds: ["lgn-layers", "lgn-synapses", "magno-parvo-counts", "lgn-latency", "visual-projections"],
  },
  v1: {
    summary: "Primary visual cortex (V1) is the first area of cortex to receive visual input. It lies at the back of the brain, along the calcarine sulcus.",
    mechanism:
      "V1 contains a map of the opposite half of the visual field. The central few degrees of vision take up a large share of it. Many neurons respond best to edges at a particular orientation, and inputs from the two eyes are arranged in alternating columns.",
    roles: {
      vision: "Represents the visual field as local features such as edges, which higher visual areas combine into objects, motion and faces.",
      loop: "Its deepest layer sends feedback to the thalamus.",
    },
    connections:
      "Sends output to [[extrastriate|higher visual areas]] along several routes: toward the temporal lobe ([[it|object recognition]]), through [[mt|MT]] toward the parietal lobe (location and action), and a lateral route involved in faces and body movement.",
    limit: "The highlight follows the calcarine sulcus. The actual border of V1 varies between people.",
    sourceIds: ["visual-cortex-map", "hubel-wiesel", "third-pathway"],
  },
  l6: {
    summary: "Layer 6 is the deepest cell layer of the cortex. Here it refers to layer 6 neurons in V1 that project back to the thalamus.",
    mechanism:
      "These neurons excite thalamic relay cells directly. Branches of the same axons excite inhibitory neurons in the TRN, which then inhibit the relay cells. Their synapses onto TRN neurons are individually stronger, so the overall effect can be inhibitory.",
    roles: { loop: "The feedback part of the circuit, through which the cortex adjusts its own input." },
    connections:
      "Projects to the [[lgn|LGN]] and the [[trn|TRN]]. Separate layer 5 neurons project to other thalamic nuclei, such as the [[pulvinar|pulvinar]], which relay signals between cortical areas.",
    limit: "Layer 6 lies a few millimetres below the surface of V1, so it shares V1’s marker and highlight.",
    sourceIds: ["corticothalamic-circuit", "ct-awake", "transthalamic"],
  },
  trn: {
    summary: "The thalamic reticular nucleus (TRN) is a thin layer of inhibitory neurons that surrounds the thalamus.",
    mechanism:
      "TRN neurons receive branches of the connections running between the thalamus and the cortex in both directions, and they inhibit thalamic relay cells. The TRN also generates sleep spindles, a brain rhythm seen in light sleep.",
    roles: { loop: "Allows the cortex to reduce, as well as increase, activity in its own input." },
    connections:
      "Receives input from [[l6|layer 6]] and from relay cells, and inhibits the [[lgn|LGN]] and other thalamic nuclei. In mice, prefrontal cortex influences it through the basal ganglia.",
    limit: "The atlas does not include a separate TRN, so the marker is an approximate position and the highlight shows the whole thalamus.",
    sourceIds: ["corticothalamic-circuit", "trn-basal-ganglia"],
  },
  pfc: {
    summary: "Prefrontal cortex, at the front of the brain, keeps goals and rules active and uses them to guide behaviour.",
    mechanism:
      "Sustained activity keeps a goal available, for example the colour of the coat you are looking for. With the frontal eye fields, it sends signals that favour matching features and locations in sensory areas.",
    roles: { attention: "Provides the goal that determines which sensory signals are prioritized." },
    connections:
      "Works with [[parietal|parietal cortex]] in the dorsal attention network, and with the [[insula|insula]] and [[cingulate|anterior cingulate]]. Connects to the thalamus directly and through the basal ganglia.",
    limit: "The highlight is the left middle frontal gyrus, which is only one part of prefrontal cortex.",
    sourceIds: ["attention-networks", "baseline"],
  },
  parietal: {
    summary: "Posterior parietal cortex combines information from several senses to represent the space around the body and to plan actions.",
    mechanism:
      "Neurons around the intraparietal sulcus represent where things are and how relevant they are at the moment. This priority map guides eye movements, reaching and attention.",
    roles: {
      vision: "The end of the dorsal stream. Uses vision to guide eye movements, reaching and grasping.",
      attention: "Part of the dorsal attention network, which directs attention voluntarily.",
      touch: "Combines touch with vision and body position so that you can act on what you feel.",
    },
    connections:
      "Receives visual input from [[mt|MT]] and other visual areas, as well as auditory and [[s1|touch]] input, and works with [[pfc|prefrontal cortex]]. Damage can cause optic ataxia (inaccurate reaching toward things a person sees clearly) and, especially on the right, spatial neglect.",
    limit: "The highlight is the superior parietal lobule, one part of a larger network.",
    sourceIds: ["attention-networks", "multisensory-space", "optic-ataxia", "two-streams"],
  },
  pulvinar: {
    summary:
      "The pulvinar is the largest nucleus of the primate thalamus, at its back end. Most of its connections are with areas of cortex rather than with the sense organs.",
    mechanism:
      "It is a higher-order thalamic nucleus: its main inputs come from the cortex (layer 5) and the superior colliculus, and it relays signals between cortical areas. In monkeys, it synchronized alpha-frequency activity (8–15 Hz) between visual areas according to where attention was directed.",
    roles: { attention: "Proposed to coordinate communication between visual areas during attention." },
    connections: "Connected with [[extrastriate|higher visual areas]], [[parietal|parietal cortex]] and the superior colliculus.",
    limit: "The atlas does not include a separate pulvinar, so the marker is an approximate position and the highlight shows the whole thalamus.",
    sourceIds: ["pulvinar-coordination", "transthalamic"],
  },
  extrastriate: {
    summary: "Higher visual areas are the many visual areas beyond V1. Different areas specialize in features such as shape, colour, motion, faces and places.",
    mechanism:
      "Neurons here respond to larger parts of the visual field and to more complex features than neurons in V1. Attention effects are larger here than in V1: in monkey area V4, attention increases responses by about 25%.",
    roles: {
      vision: "The first stages after V1. Areas V2 and V4 combine V1's local features into contours, shapes and colours and pass them to the temporal lobe.",
      attention: "Responses to the attended object increase relative to responses to other objects.",
    },
    connections:
      "Receives input from [[v1|V1]], exchanges signals with the [[pulvinar|pulvinar]], and sends output to [[it|inferior temporal cortex]], the category-selective areas and [[parietal|parietal]] cortex.",
    limit: "The lateral occipital highlight represents a large group of different areas.",
    sourceIds: ["attention-gain", "baseline", "third-pathway", "parallel-pathways"],
  },
  mt: {
    summary:
      "Area MT (also called V5) is a visual area specialized for motion. In humans it is usually found on the side of the brain, where the occipital lobe meets the temporal lobe.",
    mechanism:
      "Most MT neurons respond to movement in a particular direction and at a particular speed, over a larger part of the visual field than V1 neurons. Some combine local motion signals into the motion of a whole object. In monkeys, electrically stimulating a small group of MT neurons shifts the animal's judgement of motion toward those neurons' preferred direction. A neighbouring area, MST, responds to the overall patterns of motion produced when you move through a scene (optic flow), such as the expansion seen when walking forward.",
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
      "IT neurons respond to complex shapes and object parts. Their responses stay similar when an object moves, changes size or is seen from a somewhat different angle, which lets the same object be recognized in different conditions. In monkeys, the activity of about 100 IT neurons over as little as 12.5 ms was enough to tell which object was shown and its category. In humans, the lateral occipital complex, next to MT, responds more to objects than to textures and is an early part of this system.",
    roles: { vision: "Identifies what an object is. Its output goes to areas for memory, emotion and decisions." },
    connections:
      "Receives input from V4 and other [[extrastriate|higher visual areas]]. Contains or borders regions that prefer particular categories, such as [[ffa|faces]] and [[ppa|places]]. Sends output to the medial temporal lobe (memory), the amygdala and prefrontal cortex.",
    limit:
      "Monkey IT and human ventral temporal cortex are similar but not identical. The highlight is the inferior temporal sulcus; the region itself is larger and has no sharp borders.",
    sourceIds: ["object-recognition", "it-readout", "loc", "vtc-review"],
  },
  ffa: {
    summary:
      "The fusiform face area (FFA) is a region on the fusiform gyrus that responds more strongly to faces than to other objects. It is found in most people and is usually larger in the right hemisphere.",
    mechanism:
      "In the study that named it, the FFA was found in 12 of 15 people. It responds more to faces than to houses, hands, objects or scrambled faces, including faces seen from a three-quarter view. It is involved mainly in recognizing who a face belongs to; expressions and gaze direction are processed more in the superior temporal sulcus. In monkeys, 97% of the visually responsive neurons in the largest face-selective region preferred faces. How specific the human FFA is remains debated: in car and bird experts, it also responded more to cars or birds.",
    roles: { vision: "Part of a network of face-selective areas used to recognize individuals." },
    connections:
      "Receives input from earlier visual areas, including a face-selective region in the occipital lobe (the occipital face area). Works with the superior temporal sulcus (expressions and gaze) and the front of the temporal lobe (knowing who someone is).",
    limit:
      "The marker shows a typical position on the left fusiform gyrus, to match the rest of the route. The FFA is often larger and more consistent in the right hemisphere, and its exact position varies by several millimetres between people.",
    sourceIds: ["ffa", "ffa-review", "face-network", "face-stimulation", "face-patches", "expertise"],
  },
  ppa: {
    summary:
      "The parahippocampal place area (PPA) responds more to images of places and scenes, such as rooms, streets and landscapes, than to single objects, and hardly at all to faces.",
    mechanism:
      "The PPA responds to the layout of the space in a scene. An empty room produces as strong a response as the same room with furniture, and more than twice the response to a set of objects with no room around them. It is involved in recognizing the type of place and familiar landmarks. A separate scene area on the outer surface of the occipital lobe, the occipital place area, represents where it is possible to walk in a scene.",
    roles: { vision: "Helps recognize places and landmarks, which supports finding your way." },
    connections:
      "Receives input from earlier visual areas and connects with the retrosplenial cortex and hippocampus, which are involved in navigation and memory.",
    limit:
      "The highlight is the collateral sulcus; the PPA covers part of it and nearby parahippocampal cortex. It is found in both hemispheres; only the left is shown.",
    sourceIds: ["ppa", "opa-affordances", "vtc-review"],
  },
  eba: {
    summary:
      "The extrastriate body area (EBA) responds more to images of human bodies and body parts than to faces or other objects. It lies on the side of the brain, next to and partly overlapping area MT.",
    mechanism:
      "It responds to still and moving images of bodies. Briefly disrupting it with magnetic stimulation (TMS) slowed the recognition of body parts, but not of faces or other objects. It is also active when you move your own arm or leg toward a target, even without seeing the movement.",
    roles: { vision: "Analyses the shape and posture of bodies, which supports recognizing people and what they are doing." },
    connections:
      "Part of the lateral visual route toward the superior temporal sulcus, which is involved in perceiving other people's actions. A second body-selective region, the fusiform body area, lies next to the [[ffa|FFA]].",
    limit:
      "The highlight is the middle temporal gyrus; the EBA occupies part of its back end and neighbouring cortex. It is found in both hemispheres; only the left is shown.",
    sourceIds: ["eba", "eba-tms", "eba-action", "fba", "third-pathway"],
  },
  vwfa: {
    summary:
      "The visual word form area (VWFA) is a region in the left occipitotemporal sulcus that responds to written words and letter strings in scripts the reader knows.",
    mechanism:
      "It responds similarly to a word whether it is written in upper or lower case, and its location is similar across people and writing systems. It develops as people learn to read: adults who learned to read show a larger response to writing here than adults who never learned, and a slightly smaller response to faces. Writing is only about 5,000 years old, too recent for a brain area to have evolved for it, so the VWFA is thought to be object-recognition cortex that is taken over when a person learns to read. In one patient, surgery that removed a small part of it caused a marked reading difficulty, while recognition of other kinds of images stayed normal. How specific it is has been debated: it is also active during tasks such as naming pictures or reading Braille.",
    roles: { vision: "Recognizes letters and words, then passes them to language areas that retrieve their sound and meaning." },
    connections: "Receives input from earlier visual areas and sends output to language areas in the left temporal and frontal lobes.",
    limit:
      "The highlight is the left occipitotemporal sulcus; the VWFA covers a small part of it and is not segmented. Its exact position varies by several millimetres between people.",
    sourceIds: ["vwfa", "vwfa-review", "literacy", "recycling", "vwfa-lesion", "vwfa-debate"],
  },
  cochlea: {
    summary: "The cochlea is the spiral-shaped hearing organ of the inner ear, inside the temporal bone.",
    mechanism:
      "Sound makes the basilar membrane vibrate, with the largest movement near the base for high frequencies (up to about 20 kHz) and near the apex for low frequencies (down to about 20 Hz). About 3,500 inner hair cells convert this movement into nerve signals. About 12,000 outer hair cells change length to amplify it, adding roughly 40–60 dB of sensitivity.",
    roles: { hearing: "Separates sound into its frequency components." },
    connections:
      "The auditory nerve carries its output to the [[brainstem|cochlear nuclei]] on the same side. With age, auditory nerve fibres can be lost well before hair cells; this “hidden hearing loss” does not show on a standard hearing test.",
    limit: "The spiral is atlas geometry in its real position. Hair cells and fluid movement are not modelled.",
    sourceIds: ["hair-cells", "prestin", "tonotopy", "hidden-hearing-loss"],
  },
  cochleaR: {
    summary: "The cochlea of the right ear.",
    mechanism: "Same structure as the left cochlea. Having two ears on either side of the head is what allows sounds to be located.",
    roles: { hearing: "Its signals stay separate from the left ear’s until the brainstem." },
    connections: "Projects to the [[brainstemR|right cochlear nuclei]].",
    limit: "Atlas geometry; microscopic structure not modelled.",
    sourceIds: ["hair-cells", "ear-location"],
  },
  brainstem: {
    summary: "The cochlear nuclei are the first stop in the brain for the auditory nerve, where the pons meets the medulla.",
    mechanism:
      "Each auditory nerve fibre branches to three subdivisions. Different cell types extract different features: some preserve precise timing, others encode loudness or frequency content.",
    roles: { hearing: "Splits the signal into parallel pathways that travel upward by different routes." },
    connections: "Sends output to the [[soc|superior olive]] on both sides and directly to the [[ic|inferior colliculus]].",
    limit: "The anterior and posterior nuclei from the atlas are both highlighted.",
    sourceIds: ["cochlear-nuclei"],
  },
  brainstemR: {
    summary: "The right cochlear nuclei, the first stop for the right auditory nerve.",
    mechanism: "Same organization as on the left.",
    roles: { hearing: "The last stage where the right ear is processed separately." },
    connections: "Projects to both the [[socR|right]] and [[soc|left]] superior olives.",
    limit: "Atlas geometry; cell types not modelled.",
    sourceIds: ["cochlear-nuclei"],
  },
  soc: {
    summary: "The superior olivary complex is a group of brainstem nuclei where input from both ears is first combined.",
    mechanism:
      "The medial superior olive compares arrival times between the ears, with a resolution of about 10 microseconds. The lateral superior olive compares loudness between the ears, using inhibition relayed through the calyx of Held, one of the largest synapses in the brain. In mammals, time differences appear to be read out by comparing firing rates between the two sides.",
    roles: { hearing: "Determines whether a sound comes from the left or the right." },
    connections:
      "Receives input from the [[brainstem|left]] and [[brainstemR|right]] cochlear nuclei and sends output to the [[ic|inferior colliculus]]. It also sends fibres back to the cochlea that adjust its sensitivity.",
    limit: "The atlas does not include the superior olive, so the marker is an approximate position and the highlight shows the pons.",
    sourceIds: ["binaural-comparison", "itd-coding"],
  },
  socR: {
    summary: "The right superior olivary complex.",
    mechanism: "Compares timing and loudness between the ears, as on the left.",
    roles: { hearing: "Receives input from both ears, like the left side." },
    connections: "Sends output to the [[icR|right inferior colliculus]].",
    limit: "Approximate position inside the pons.",
    sourceIds: ["binaural-comparison"],
  },
  ic: {
    summary: "The inferior colliculus is the main auditory centre of the midbrain.",
    mechanism:
      "Nearly all ascending auditory pathways synapse here. It combines timing, loudness and frequency information and sends signals to the superior colliculus, which uses a map of space to turn the eyes and head toward sounds.",
    roles: { hearing: "Combines the outputs of the brainstem pathways before the thalamus." },
    connections:
      "Receives input from the [[soc|superior olive]] and the cochlear nuclei and sends output to the [[mgn|MGN]]. The two inferior colliculi are connected to each other.",
    limit: "Atlas geometry; internal subdivisions not modelled.",
    sourceIds: ["inferior-colliculus"],
  },
  icR: {
    summary: "The right inferior colliculus.",
    mechanism: "Because pathways have already crossed in the brainstem, it receives information from both ears.",
    roles: { hearing: "Same role as the left inferior colliculus." },
    connections: "Sends output to the [[mgnR|right MGN]] and is connected with the [[ic|left inferior colliculus]].",
    limit: "Atlas geometry.",
    sourceIds: ["inferior-colliculus"],
  },
  mgn: {
    summary: "The medial geniculate nucleus (MGN) is the auditory relay of the thalamus, next to the visual LGN.",
    mechanism:
      "Its ventral part keeps the frequency map and projects to primary auditory cortex. Its other parts combine hearing with other senses and project to surrounding auditory cortex and to the amygdala.",
    roles: { hearing: "The last relay before auditory cortex." },
    connections: "Receives input from the [[ic|inferior colliculus]], sends output to [[a1|auditory cortex]], and receives feedback from the cortex.",
    limit: "Atlas geometry for the whole nucleus; its subdivisions are not modelled.",
    sourceIds: ["auditory-thalamus"],
  },
  mgnR: {
    summary: "The right medial geniculate nucleus.",
    mechanism: "Same organization as the left MGN.",
    roles: { hearing: "Relays to right auditory cortex." },
    connections: "Sends output to [[a1R|right auditory cortex]].",
    limit: "Atlas geometry.",
    sourceIds: ["auditory-thalamus"],
  },
  a1: {
    summary: "Primary auditory cortex (A1) is on Heschl’s gyrus, inside the lateral sulcus.",
    mechanism:
      "It is organized by frequency, with mirror-image gradients (high–low–high) across the gyrus. Surrounding areas respond to more complex sounds such as speech, music and voices.",
    roles: {
      hearing: "The first cortical area for hearing. Each side receives input from both ears.",
      speech: "Processes speech at the same time as the nearby [[temporal|superior temporal gyrus]].",
      attention: "One of the sensory inputs whose strength attention adjusts.",
    },
    connections: "Receives input from the [[mgn|MGN]] and works with [[a1R|right auditory cortex]] and the rest of the temporal lobe.",
    limit: "The highlight is Heschl’s gyrus. The actual border of A1 varies between people.",
    sourceIds: ["auditory-cortex", "human-tonotopy"],
  },
  a1R: {
    summary: "Right primary auditory cortex.",
    mechanism:
      "Same frequency organization as the left. The right side tends to be more involved in pitch and melody and the left side in rapid speech sounds, but both sides process both.",
    roles: { hearing: "Receives input from both ears.", attention: "Continues to process sound when another sense has priority." },
    connections: "Works with [[a1|left auditory cortex]].",
    limit: "Heschl’s gyrus is used as the reference for A1.",
    sourceIds: ["auditory-cortex"],
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
    roles: { speech: "Part of the dorsal stream, used when repeating new words and holding them in short-term memory." },
    connections: "Connects the [[temporal|superior temporal gyrus]] with [[frontal|Broca’s area]] and [[motor|speech motor cortex]].",
    limit: "Spt is defined by its function in each person. The marker is placed on the nearby superior temporal surface.",
    sourceIds: ["sound-movement"],
  },
  frontal: {
    summary: "Broca’s area, in the left inferior frontal gyrus, is involved in planning speech.",
    mechanism:
      "Recordings show it is most active before speaking, while the sequence of sounds is prepared, and less active while motor cortex carries out the movements. Single neurons in nearby prefrontal cortex have been found to encode the sounds of upcoming words. How much planning happens here, compared with the precentral gyrus just behind it, is debated.",
    roles: { speech: "Coordinates the transition from sound representations to movement." },
    connections: "Works with [[spt|area Spt]], the [[temporal|temporal lobe]] and [[motor|speech motor cortex]].",
    limit: "The highlight is the opercular part of the inferior frontal gyrus. Broca’s area also includes the triangular part in front of it.",
    sourceIds: ["speech-planning", "speech-planning-network", "speech-sequencing", "word-planning"],
  },
  motor: {
    summary: "Speech motor cortex is the lower part of primary motor cortex, which controls the lips, jaw, tongue and larynx.",
    mechanism:
      "These body parts are mapped in order along the precentral gyrus, with the larynx represented twice. Speaking activates them in fast, overlapping patterns. The sound of one’s own voice is used to correct errors during speech.",
    roles: { speech: "Carries out the speech plan and uses auditory feedback to adjust it." },
    connections:
      "Receives input from [[frontal|Broca’s area]] and sends commands through the brainstem to the speech muscles. The resulting sound is processed by [[a1|auditory cortex]].",
    limit: "The highlight is the whole left precentral gyrus, which also controls the rest of the body.",
    sourceIds: ["speech-movement"],
  },
  meaning: {
    summary: "Word meaning is represented across large parts of both hemispheres, not in a single area.",
    mechanism:
      "Brain imaging while people listen to stories shows that different areas of temporal, parietal and frontal cortex respond to different categories of meaning, such as people, places or numbers.",
    roles: { speech: "The end point of the ventral stream, where sounds are linked to meaning." },
    connections: "Receives input from the [[temporal|superior temporal gyrus]] and works with memory systems across the brain.",
    limit: "The highlight is the left middle temporal gyrus, one part of a distributed system.",
    sourceIds: ["semantic-networks", "language-network"],
  },
  medulla: {
    summary: "The gracile and cuneate nuclei (dorsal column nuclei) in the lower medulla are the first relay in the brain for fine touch and body position.",
    mechanism:
      "Touch and position fibres travel up the spinal cord on the same side and end here. The neurons here send axons across the midline, where they form the medial lemniscus.",
    roles: { touch: "The point where the pathway crosses, so the left hemisphere receives touch from the right side of the body." },
    connections: "Receives input from the dorsal columns of the spinal cord and sends crossed fibres to the [[vpl|VPL]].",
    limit: "The nuclei are not included in the atlas. The highlight shows the right half of the medulla.",
    sourceIds: ["body-touch-route", "mechanoreceptors"],
  },
  vpl: {
    summary: "The ventral posterolateral nucleus (VPL) is the thalamic relay for touch and body position from the body.",
    mechanism: "Like the LGN and MGN, it contains a map (here of the opposite side of the body) and receives feedback from the cortex it projects to.",
    roles: { touch: "Relays touch and position signals to the cortex." },
    connections:
      "Receives the medial lemniscus from the [[medulla|medulla]] and sends output to [[s1|S1]]. Touch from the face uses a neighbouring nucleus (VPM).",
    limit: "The VPL is not included in the atlas. The highlight shows the whole left thalamus.",
    sourceIds: ["body-touch-route"],
  },
  s1: {
    summary: "Primary somatosensory cortex (S1), on the postcentral gyrus, contains a map of the body surface.",
    mechanism:
      "Body parts are mapped in order, with the hands, lips and tongue taking up much more space than other parts. Its four narrow areas (3a, 3b, 1 and 2) emphasize position, touch, texture and shape, although most neurons combine several types of input.",
    roles: {
      touch: "Assigns touch and position signals to a location on the body.",
      attention: "Continues to process touch when attention is directed elsewhere.",
    },
    connections: "Receives input from the [[vpl|VPL]] and sends output to [[parietal|parietal cortex]] and secondary somatosensory areas.",
    limit: "The highlight is the whole left postcentral gyrus. The body map and the four areas are not drawn.",
    sourceIds: ["somatosensory-cortex", "s1-coding"],
  },
  insula: {
    summary:
      "The insula is an area of cortex folded inside the lateral sulcus. It processes signals from inside the body and is involved in detecting important events.",
    mechanism:
      "It receives signals about the state of the body, such as heartbeat, breathing and gut sensations. Its front part works with the anterior cingulate cortex as the salience network, which detects important events and can redirect attention.",
    roles: { attention: "Detects unexpected or important events and can shift attention toward them." },
    connections:
      "Works with the [[cingulate|anterior cingulate]] and [[pfc|prefrontal cortex]]. In one study, people who were more accurate at detecting their heartbeat showed more activity in the right anterior insula.",
    limit: "The highlight is the whole left insula. Its front part is not shown separately.",
    sourceIds: ["salience-networks", "interoceptive-awareness", "salience-switch"],
  },
  cingulate: {
    summary: "The anterior cingulate cortex, on the inner surface of the frontal lobe, monitors conflict and errors.",
    mechanism:
      "Its activity increases when responses conflict, after errors, and when a task requires more effort. This is thought to signal that more control is needed.",
    roles: { attention: "Helps maintain task performance when goals and habits conflict." },
    connections: "Works with the [[insula|insula]] in the salience network and with [[pfc|prefrontal cortex]] for control.",
    limit: "The highlight is a middle-anterior part of the cingulate. The exact functional area varies.",
    sourceIds: ["task-control", "salience-networks"],
  },
};

export const guideSources: { id: string; title: string; url: string }[] = [
  { id: "retinal-circuits", title: "Purves et al. · The Retina · Neuroscience (2001)", url: "https://www.ncbi.nlm.nih.gov/books/NBK10885/" },
  { id: "photoreceptors", title: "Curcio et al. · Human photoreceptor topography (1990)", url: "https://doi.org/10.1002/cne.902920402" },
  {
    id: "visual-projections",
    title: "Purves et al. · Central Projections of Retinal Ganglion Cells (2001)",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK11145/",
  },
  { id: "lgn-layers", title: "Hendry & Reid · The koniocellular pathway in primate vision (2000)", url: "https://doi.org/10.1146/annurev.neuro.23.1.127" },
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
  { id: "corticothalamic-circuit", title: "Crandall et al. · A corticothalamic switch (2015)", url: "https://doi.org/10.1016/j.neuron.2015.03.040" },
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
  { id: "multisensory-space", title: "Macaluso · Spatial Constraints in Multisensory Attention (2012)", url: "https://www.ncbi.nlm.nih.gov/books/NBK92871/" },
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
  { id: "mt-review", title: "Born & Bradley · Structure and function of visual area MT (2005)", url: "https://doi.org/10.1146/annurev.neuro.26.041002.131052" },
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
  { id: "mst-flow", title: "Duffy & Wurtz · Sensitivity of MST neurons to optic flow stimuli (1991)", url: "https://doi.org/10.1152/jn.1991.65.6.1329" },
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
  { id: "ppa", title: "Epstein & Kanwisher · A cortical representation of the local visual environment (1998)", url: "https://doi.org/10.1038/33402" },
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
  { id: "fba", title: "Peelen & Downing · Selectivity for the human body in the fusiform gyrus (2005)", url: "https://doi.org/10.1152/jn.00513.2004" },
  { id: "vwfa", title: "Cohen et al. · The visual word form area (2000)", url: "https://doi.org/10.1093/brain/123.2.291" },
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
  { id: "recycling", title: "Dehaene & Cohen · Cultural recycling of cortical maps (2007)", url: "https://doi.org/10.1016/j.neuron.2007.10.004" },
  {
    id: "vwfa-lesion",
    title: "Gaillard et al. · Direct intracranial, fMRI, and lesion evidence for the causal role of left inferotemporal cortex in reading (2006)",
    url: "https://doi.org/10.1016/j.neuron.2006.03.031",
  },
  { id: "vwfa-debate", title: "Price & Devlin · The myth of the visual word form area (2003)", url: "https://doi.org/10.1016/S1053-8119(03)00084-3" },
  { id: "hair-cells", title: "Ashmore · Cochlear outer hair cell motility (2008)", url: "https://doi.org/10.1152/physrev.00044.2006" },
  {
    id: "prestin",
    title: "Liberman et al. · Prestin is required for electromotility of the outer hair cell and for the cochlear amplifier (2002)",
    url: "https://doi.org/10.1038/nature01059",
  },
  { id: "tonotopy", title: "Greenwood · A cochlear frequency-position function for several species (1990)", url: "https://doi.org/10.1121/1.399052" },
  {
    id: "hidden-hearing-loss",
    title: "Wu et al. · Primary neural degeneration in the human cochlea (2019)",
    url: "https://doi.org/10.1016/j.neuroscience.2018.07.053",
  },
  { id: "ear-location", title: "Neuroanatomy, Auditory Pathway · StatPearls", url: "https://www.ncbi.nlm.nih.gov/books/NBK532311/" },
  { id: "cochlear-nuclei", title: "Purves et al. · The Auditory System (2001)", url: "https://www.ncbi.nlm.nih.gov/books/NBK10838/" },
  { id: "binaural-comparison", title: "Purves et al. · Integrating Information from the Two Ears (2001)", url: "https://www.ncbi.nlm.nih.gov/books/NBK10820/" },
  {
    id: "itd-coding",
    title: "Grothe, Pecka & McAlpine · Mechanisms of sound localization in mammals (2010)",
    url: "https://doi.org/10.1152/physrev.00026.2009",
  },
  { id: "inferior-colliculus", title: "Neuroanatomy, Inferior Colliculus · StatPearls", url: "https://www.ncbi.nlm.nih.gov/books/NBK554468/" },
  { id: "auditory-thalamus", title: "Purves et al. · The Auditory Thalamus (2001)", url: "https://www.ncbi.nlm.nih.gov/books/NBK10906/" },
  { id: "auditory-cortex", title: "Purves et al. · The Auditory Cortex (2001)", url: "https://www.ncbi.nlm.nih.gov/books/NBK10900/" },
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
  { id: "speech-planning", title: "Flinker et al. · Redefining the role of Broca’s area in speech (2015)", url: "https://doi.org/10.1073/pnas.1414491112" },
  {
    id: "speech-planning-network",
    title: "Castellucci et al. · A speech planning network for interactive language use (2022)",
    url: "https://doi.org/10.1038/s41586-021-04270-z",
  },
  { id: "speech-sequencing", title: "Liu et al. · Speech sequencing in the human precentral gyrus (2025)", url: "https://doi.org/10.1038/s41562-025-02250-1" },
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
  { id: "body-touch-route", title: "Purves et al. · The Dorsal Column–Medial Lemniscus System (2001)", url: "https://www.ncbi.nlm.nih.gov/books/NBK11142/" },
  {
    id: "mechanoreceptors",
    title: "Johnson · The roles and functions of cutaneous mechanoreceptors (2001)",
    url: "https://doi.org/10.1016/S0959-4388(00)00234-8",
  },
  { id: "somatosensory-cortex", title: "Neuroanatomy, Somatosensory Cortex · StatPearls", url: "https://www.ncbi.nlm.nih.gov/books/NBK555915/" },
  { id: "s1-coding", title: "Saal & Bensmaia · Touch is a team effort (2014)", url: "https://doi.org/10.1016/j.tins.2014.08.012" },
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
  { id: "salience-switch", title: "Menon & Uddin · Saliency, switching, attention and control (2010)", url: "https://doi.org/10.1007/s00429-010-0262-0" },
  {
    id: "task-control",
    title: "Dosenbach et al. · A core system for the implementation of task sets (2006)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3621133/",
  },
];
