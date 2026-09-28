// Copy for the overview panel and the About dialog.
export const overview = {
  title: "Perception & Attention",
  lede: [
    "A review of some basics of human perception and attention. Attention acts on the signals that arrive from the senses, as well as on memories and plans, so this review covers both: how sight, touch and sound (including speech) reach the brain, how the cortex adjusts that input, and which brain networks set priorities between signals.",
    "The 3D view maps each topic in its own colour. Point at a topic to see its regions and routes, and select it to go through it step by step.",
  ],
  modelNotes: [
    "The brain, eyes and ears use 175 structures from the Z-Anatomy atlas (based on BodyParts3D), and the skull another 22 bones and 28 teeth, all placed with one shared transform. It is one reference model assembled from atlas meshes (BodyParts3D itself was built from one volunteer’s MRI and redrawn by illustrators); real brains differ from it in size and folding.",
    "Small nuclei that the atlas does not include (the TRN, pulvinar, superior olive, VPL, dorsal column nuclei and locus coeruleus) are shown as markers at their approximate positions. The spinal cord is not loaded here, so the dorsal horn is a marker at the lower end of the medulla. Functional areas such as V1, A1, area Spt and Broca’s area are placed on the gyri and sulci where they are usually found. MT and the face, place, body and word areas are placed from typical coordinates in group imaging studies. Their exact positions and borders vary between people, by a centimetre or more.",
    "Routes are smooth curves between markers, not reconstructed nerve fibres. Particle speed, brightness and the attention numbers are for illustration, not physiological measurements.",
    "This is an educational resource, not a clinical or diagnostic reference.",
  ],
};

export const about = {
  // [text](https://…) becomes a link.
  sections: [
    {
      title: "The guide",
      paragraphs: ["Perception & Attention is an open-source guide to how sensory signals reach the brain and how the brain decides what to pay attention to."],
    },
    {
      title: "Why I made it",
      paragraphs: [
        "Neuroscience is not my field of work. I like reading about human behaviour and performance, and when I came across Robert Sapolsky’s work some years ago, I started going deeper into the topic.",
        "I made this guide as a refresher on some details of human attention that I wanted to look into. I think learning about behavioural biology and neuroscience can provide a lot of insight into systems design. After all, if we extend the logic of [the bitter lesson](http://www.incompleteideas.net/IncIdeas/BitterLesson.html), human intelligence is the result of a multi-billion-year research effort that produced all kinds of adaptations. Sharing attention with others and planning far ahead are among the capabilities often proposed to have given us a leg up on other Old World primates; the basic machinery of attention described here is shared with monkeys.",
        "I am not building neuromorphic agents, but a lot seems to point to composition as another axis for developing more capable AI systems. I share my thoughts on the topic on [my website](https://zeph.computer), and I have now started sharing a bit more on [X](https://x.com/jbermudez5).",
        "I also wanted to try [math](https://github.com/pmndrs/math), a library by Isaac Mason ([X](https://x.com/isaac_mason_), [GitHub](https://github.com/isaac-mason)) that looked very promising, and it is good.",
      ],
    },
  ],
};

export const codeNotes = {
  build: [
    "Built with TypeScript and Three.js, using the pmndrs math library for vectors, curves, springs and seeded random numbers. Everything is bundled into a single HTML file with esbuild and makes no network requests while running.",
  ],
  animation: [
    "Signal speed: ongoing flow moves at about 14 mm per second at the model’s scale, so longer routes usually take longer; the shortest and longest routes are held between 1.25 and 4.5 seconds so they stay readable. Walkthrough pulses move faster, about 50 mm per second. Real signals travel between cortical areas at about 4 m/s (adult median) and along large touch fibres at 35–75 m/s, so the animation is roughly 75 to 5,000 times slower than real conduction.",
    "Region activity: each walkthrough pulse that arrives adds to a region’s activity, which then decays exponentially with a time constant of 0.9 seconds (a leaky integrator, τ·dr/dt = −r + input). Ongoing flow adds a steady low level.",
    "Glowing points: each point flashes at random times, at a rate proportional to its region’s activity, and fades after each flash. This resembles the rise and decay of a calcium-imaging signal; it is not a simulation of real neurons.",
    "Attention: a simplified normalization model, R = A·E / (σ + Σ A·E), with σ = 1 and an attention gain A of up to 3. The published model describes competition within visual cortex; pooling the three senses in one total is an illustration.",
    "View gap: skull and brain points between the camera and the selected region move aside, and those behind it dim, so the region stays visible from any angle. Zooming in also fades the skull and outer brain.",
    "Labels: placed in columns outside the head. Labels on each side keep the vertical order of their regions, so leader lines do not cross, and labels that would overlap are grouped and centred on their regions.",
  ],
};
