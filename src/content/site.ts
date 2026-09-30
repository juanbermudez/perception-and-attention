// Copy for the overview panel and the About dialog.
export const overview = {
  title: "Perception & Attention",
  lede: [
    "A review of some basics of human perception and attention: how sight, touch and sound (including speech) reach the brain, how the cortex adjusts that input, and which brain networks set priorities between signals.",
    "Each topic has its own colour in the 3D view. Point at a topic to see its regions and routes; select it to go through it step by step.",
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
      paragraphs: ["Perception & Attention is an open-source guide to how sensory signals reach the brain and how it decides what to pay attention to."],
    },
    {
      title: "Why I made it",
      paragraphs: [
        "I made this guide as a refresher on some details of human attention that I wanted to revisit while working on a personal project. When I came across [math](https://github.com/pmndrs/math), a library by Isaac Mason ([X](https://x.com/isaac_mason_), [GitHub](https://github.com/isaac-mason)), it seemed like a great way to make it visual.",
        "Behavioural biology and neuroscience began as a personal interest, but once I got into AI and model architecture, I came to see nature as the GOAT at applying the [“bitter lesson”](http://www.incompleteideas.net/IncIdeas/BitterLesson.html). For all our technological progress, we still struggle to match its designs; after all, it has been tweaking and selecting candidates for far longer than we have been around.",
        "I am in awe of what autoregressive models have made possible, but I believe composition and specialization can lead to systems that are both more efficient and more capable.",
        "It might also be that being GPU poor has made me biased. 😅",
        "Either way, I am enjoying the process a lot.",
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
