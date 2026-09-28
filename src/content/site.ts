// Copy for the overview panel and the About dialog.
export const overview = {
  title: "Perception & Attention",
  lede: [
    "A review of some basics of human perception and attention. Attention acts on the signals that arrive from the senses, so this review covers both: how sight, touch and sound (including speech) reach the brain, how the cortex adjusts that input, and which brain networks set priorities between signals.",
    "The 3D view maps each topic in its own colour. Point at a topic to see its regions and routes, and select it to go through it step by step.",
  ],
  modelNotes: [
    "The anatomy uses 167 structures from the Z-Anatomy atlas (based on BodyParts3D), all placed with one shared transform. It is a single reference brain, not a scan of a real person.",
    "Small nuclei that the atlas does not include (the TRN, pulvinar, superior olive, VPL and dorsal column nuclei) are shown as markers at their approximate positions. Functional areas such as V1, A1, area Spt and Broca’s area are placed on the gyri where they are usually found. MT and the face, place, body and word areas are placed from typical coordinates in group imaging studies. Their exact positions and borders vary between people.",
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
        "I made this guide as a refresher on some details of human attention that I wanted to look into. I think learning about behavioural biology and neuroscience can provide a lot of insight into systems design. After all, if we look at it from the point of view of [the bitter lesson](http://www.incompleteideas.net/IncIdeas/BitterLesson.html), human intelligence is the result of a multi-billion-year research effort that produced all kinds of adaptations. Paying attention and working towards long-term goals are capabilities that gave us a leg up on other Old World primates.",
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
    "Signal speed: particles move at one constant speed, so longer routes take longer. The animation is about a thousand times slower than real nerve conduction.",
    "Region activity: each arriving signal adds to a region’s activity, which then decays exponentially with a time constant of 0.9 seconds (a leaky integrator, τ·dr/dt = −r + input).",
    "Glowing points: each point flashes at random times, at a rate proportional to its region’s activity, and fades after each flash. This resembles the rise and decay of a calcium-imaging signal; it is not a simulation of real neurons.",
    "Attention: a simplified normalization model, R = A·E / (σ + Σ A·E), with σ = 1 and an attention gain A of up to 3.",
    "View gap: skull and brain points between the camera and the selected region move aside, and those behind it dim, so the region stays visible from any angle. Zooming in also fades the skull and outer brain.",
    "Labels: placed in columns outside the head. Labels on each side keep the vertical order of their regions, so leader lines do not cross, and labels that would overlap are grouped and centred on their regions.",
  ],
};
