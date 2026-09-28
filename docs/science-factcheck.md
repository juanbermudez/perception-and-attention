# Neuroscience fact-check: 3D brain explorer

Checked 2026-09-27. Sources: abstracts via Europe PMC/PubMed, plus full text where it was open access. Verdicts: CONFIRMED / NEEDS CORRECTION / CONTESTED / UNVERIFIED. Species is flagged on every claim.

---

## CORTICOTHALAMIC LOOP

### 1. LGN synapse sources (cat)
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Numbers (cat, EM with sampling-bias correction):** synapses onto relay cells are 7.1% retinal, 30.9% GABAergic (local interneurons + TRN/perigeniculate) and 62.0% "RS" (cortex + brainstem combined). Erişir et al. 1997 split the RS group roughly half and half, giving about 30% layer 6 cortical and about 30% brainstem (cholinergic parabrachial). Onto interneurons, retinal input is 48.7%.
- **Wording:** "In cats, only about 7% of the synapses on an LGN relay cell come from the eye. About 30% come from layer 6 of cortex, about 30% from the brainstem, and about 30% are inhibitory (local interneurons and TRN)."
- **Citation:** Van Horn SC, Erişir A, Sherman SM (2000) J Comp Neurol 416:509–520. https://pubmed.ncbi.nlm.nih.gov/10660881/ (split of the RS group: Erişir et al. 1997 PNAS, https://doi.org/10.1073/pnas.94.4.1517)

### 2. "Corticothalamic axons outnumber thalamocortical axons 10:1"
- **Verdict:** NEEDS CORRECTION (weakly sourced). **Confidence:** moderate.
- The figure is widely repeated and always traced to Sherman & Koch 1986 (cat). That paper is a review-style estimate, not a direct axon count. Its own abstract puts the synapse figures at "10–20% retinal, roughly half from layer VI". Budd 2004 (cat, quantitative reanalysis) concluded that geniculate cells get cortical synapses "from far fewer corticogeniculate axons than previously thought". I found no direct count of axons that confirms 10:1.
- **Safer wording:** "Cortex sends a massive projection back to the thalamus. In cats, cortical synapses on relay cells outnumber retinal synapses by roughly 4 to 1." If you keep 10:1, write "often estimated at about 10:1 (cat)".
- **Citation:** Sherman SM, Koch C (1986) Exp Brain Res 63:1–20. https://doi.org/10.1007/BF00235642. Counterpoint: Budd JML (2004) Vis Neurosci. https://pubmed.ncbi.nlm.nih.gov/15579216/

### 3. L6 CT → relay (excitation) + L6 CT → TRN → relay (inhibition)
- **Verdict:** CONFIRMED. **Confidence:** high.
- Refinement: L6 inputs to TRN are stronger per synapse than L6 inputs to relay cells. They have larger quantal EPSCs and more GluA4 (Golshani et al. 2001, rodent). This is why the net effect can be suppression.
- **Citation:** Crandall et al. (2015) Neuron 86:768–782. https://doi.org/10.1016/j.neuron.2015.03.040

### 4. Crandall, Cruikshank & Connors 2015
- **Verdict:** CONFIRMED, with details added. **Confidence:** high.
- **Details:** Mouse (Ntsr1-Cre, ChR2 in L6 CT), **in vitro slices only**, somatosensory VPm.
  - At 0.1 Hz, each stimulus gave brief excitation (~15 ms) followed by long suppression (>100 ms), so the net effect was inhibitory.
  - In **10 Hz trains**, CT→VPm synapses facilitate and TRN→VPm inhibition depresses, so enhancement appears over successive pulses.
  - Short gamma bursts (~75 Hz) in L6 produced the same switch.
- **Newer in vivo support:** Dimwamwa et al. 2024 (awake mice). L6 CT activity either suppressed or enhanced VPm firing depending on L6 firing rate and synchrony. https://doi.org/10.1038/s41467-024-47863-8
- **Wording:** "In mouse brain slices, slow layer 6 activity mostly quiets the thalamus. Activity at about 10 Hz or faster flips it to boosting the thalamus."
- **Citation:** Crandall SR, Cruikshank SJ, Connors BW (2015) Neuron. https://doi.org/10.1016/j.neuron.2015.03.040 (PMC4425600)

### 5. Driver/modulator; L5 → higher-order thalamus → cortex (transthalamic)
- **Verdict:** CONFIRMED as a mainstream, actively supported framework. **Confidence:** moderate-high.
- **Status:** The anatomy and physiology are well established in rodent, cat and primate: L5 "driver" terminals in the pulvinar and POm, and L6 "modulators". Causal behavioral evidence is recent and mostly from mice. Mo, McKinnon & Sherman 2024 (mouse) inhibited the L5→POm→S2 route at its thalamic synapse. Texture discrimination was severely impaired even though direct cortico-cortical paths were intact.
- **Caveats:** Driver/modulator is a heuristic classification. Primate transthalamic evidence is still mainly anatomical. Higher-order nuclei also receive subcortical drivers (for example, superior colliculus to pulvinar).
- **Citation:** Sherman SM, Usrey WM (2024) J Neurosci. https://doi.org/10.1523/JNEUROSCI.0909-24.2024. Causal data: Mo et al. 2024 Nat Commun, https://doi.org/10.1038/s41467-024-50163-w

---

## ATTENTION

### 6. Dorsal vs ventral attention networks
- **Verdict:** CONFIRMED, with revisions. **Confidence:** high.
- **Revisions since 2008:**
  - The two networks are not independent; they interact flexibly, with the dorsal network also involved in reorienting (Vossel et al. 2014).
  - The role of the TPJ is debated. It has been reframed as "contextual updating" rather than a pure circuit-breaker (Geng & Vossel 2013).
  - In resting-state parcellations (Yeo 2011), the "ventral attention" network overlaps heavily with the salience/cingulo-opercular network.
- **Citation:** Vossel S, Geng JJ, Fink GR (2014) Neuroscientist 20:150–159. https://doi.org/10.1177/1073858413494269. Originals: Corbetta & Shulman 2002 https://doi.org/10.1038/nrn755; Corbetta, Patel & Shulman 2008 https://doi.org/10.1016/j.neuron.2008.04.017

### 7. Salience network and the "switch" between DMN and CEN
- **Verdict:** Network definition CONFIRMED. The switching role is CONTESTED (plausible and influential, but mostly correlational). **Confidence:** moderate.
- **Network:** Seeley 2007 defined it as dorsal ACC plus orbital fronto-insular cortex, with subcortical and limbic nodes.
- **Evidence for the switch:**
  - fMRI Granger causality (Sridharan et al. 2008, PNAS). Granger causality on BOLD data is methodologically fragile.
  - Traumatic brain injury: damage to salience-network white matter predicts failure to deactivate the DMN (Bonnelle et al. 2012, PNAS).
  - Human iEEG from 177 patients: directed information flow runs from anterior insula to DMN and FPN nodes (Das & Menon 2024, eLife). All of the strongest positive evidence comes from the originating lab.
- Direct causal perturbation tests in healthy people are scarce.
- **Wording:** "The anterior insula is thought to help the brain switch between inward-focused (default) and task-focused (executive) networks. This is an influential hypothesis, not settled fact."
- **Citation:** Menon V, Uddin LQ (2010) Brain Struct Funct 214:655–667. https://doi.org/10.1007/s00429-010-0262-0. Newer: Das A, Menon V (2024) eLife, https://doi.org/10.7554/eLife.99018. Seeley et al. 2007, https://doi.org/10.1523/JNEUROSCI.5587-06.2007

### 8. Gain, variability, noise correlations; normalization model
- **Verdict:** CONFIRMED, with a correction to the equation. **Confidence:** high.
- **Findings (macaque V4):**
  - Attention scales tuning curves multiplicatively (McAdams & Maunsell 1999).
  - Attention lowers Fano factor (Mitchell et al. 2007).
  - Attention lowers noise correlations (Cohen & Maunsell 2009; Mitchell et al. 2009).
- **Refinement (2014):** Attention can **increase or decrease** correlations, depending on whether the two neurons support the same choice or opposite choices (Ruff & Cohen 2014, Nat Neurosci, https://doi.org/10.1038/nn.3835). "Always reduces correlations" is too strong.
- **Equation:** R(x,θ) = A(x,θ)·E(x,θ) / [S(x,θ) + σ], where S = s(x,θ) ∗ [A·E]. The suppressive drive is A·E **convolved with a suppressive field** (a Gaussian weighted pool over space and feature), not a plain sum.
- **Citation:** Reynolds JH, Heeger DJ (2009) Neuron 61:168–185. https://doi.org/10.1016/j.neuron.2009.01.002

### 9. Size of attentional modulation, V1 vs V4 (macaque)
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Numbers:** With one stimulus in the receptive field, median response increase is **~8% in V1** and **~26% in V4** (McAdams & Maunsell 1999; 135 V1 and 262 V4 neurons). Effects are larger and earlier in V4 than in V2, and smaller and later in V1 (Buffalo et al. 2010). With two competing stimuli inside a V4 receptive field, effects can be much larger (Reynolds et al. 1999).
- **Citation:** McAdams CJ, Maunsell JHR (1999) J Neurosci 19:431–441. https://doi.org/10.1523/JNEUROSCI.19-01-00431.1999

### 10. Wimmer et al. 2015 (mouse PFC → TRN)
- **Verdict:** CONFIRMED, with a refinement. **Confidence:** high.
- **Details:** In a mouse cross-modal task, visual-TRN firing before the stimulus changed with the selected modality: it rose when vision had to be ignored (moderate confidence on direction). This controlled visual thalamic gain through feedforward inhibition. Optogenetics showed the effect depended on PFC, and that PFC acted through sensory thalamus rather than sensory cortex.
- **Refinement:** PFC does **not project directly** to sensory TRN. The route runs PFC → basal ganglia → TRN and works mainly by suppressing the distracting modality (Nakajima, Schmitt & Halassa 2019, Neuron, https://doi.org/10.1016/j.neuron.2019.05.026).
- **Citation:** Wimmer RD et al. (2015) Nature 526:705–709. https://doi.org/10.1038/nature15398

### 11. Saalmann et al. 2012 (macaque pulvinar)
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details:** Simultaneous recordings in pulvinar, V4 and TEO, with DTI-guided targeting. Attention increased pulvinar–cortex coherence mainly at **8–15 Hz (alpha)** during the cue-to-target delay. Granger analysis showed pulvinar influence on cortex.
- **Citation:** Saalmann YB, Pinsk MA, Wang L, Li X, Kastner S (2012) Science 337:753–756. https://doi.org/10.1126/science.1223082

### 12. Superior colliculus in attention
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details:** Primate SC inactivation causes deficits in covert attention without abolishing attention-related modulation in visual cortex (Zénon & Krauzlis 2012). This suggests a route partly independent of cortex.
- **Citation:** Krauzlis RJ, Lovejoy LP, Zénon A (2013) Annu Rev Neurosci 36:165–182. https://doi.org/10.1146/annurev-neuro-062012-170249

### 13. Kastner et al. 1999: baseline increases before any stimulus (human fMRI)
- **Verdict:** CONFIRMED, with a refinement. **Confidence:** high.
- **Details:** Baseline increases were clearest in **extrastriate** cortex (V2, V4, TEO). Frontal and parietal areas showed even larger increases, consistent with them being the source of the bias.
- **Citation:** Kastner S et al. (1999) Neuron 22:751–761. https://doi.org/10.1016/S0896-6273(00)80734-5

### 14. Rhythmic attentional sampling at ~4–8 Hz
- **Verdict:** CONTESTED. **Confidence:** moderate.
- **Evidence for:** Neural data in macaque (Fiebelkorn et al. 2018, FEF/LIP theta) and human iEEG (Helfrich et al. 2018).
- **Evidence against:** For the *behavioral* evidence, Brookshire (2022, Nat Hum Behav) showed that the standard analyses produce false positives from aperiodic (1/f-like) structure. After correcting for this, he found no rhythmicity in the published datasets.
- **Rebuttal:** Xu et al. (2026, Commun Psychol) used autoregressive modelling that controls for aperiodic structure and found reliable theta rhythmicity in two datasets. The claimed shift in frequency with task difficulty did not replicate.
- **Wording:** "Some evidence suggests attention samples the world in rhythmic pulses at about 4–8 times per second. This is actively debated."
- **Citations:** Fiebelkorn IC, Kastner S (2019) TICS, https://doi.org/10.1016/j.tics.2018.11.009. Critique: Brookshire G (2022), https://doi.org/10.1038/s41562-022-01364-0. Rebuttal: Xu et al. (2026), https://doi.org/10.1038/s44271-026-00500-0

---

## VISION

### 15. Human retinal and optic nerve counts
- **Verdict:** Rods and cones CONFIRMED. The optic nerve figure NEEDS CORRECTION (minor). **Confidence:** high.
- **Numbers:**
  - Rods: 92 million (77.9–107.3 M). Cones: 4.6 million (4.08–5.29 M) (Curcio 1990; 8 retinas, 7 people aged 27–44).
  - Ganglion cells: 0.7–1.5 million (Curcio & Allen 1990).
  - Optic nerve: a 2024 meta-analysis gives an average of **~1.02 million** fibres, with individual variation of about ±50%. Mean values across studies range from 0.5 to 1.2 million. "1.2 million" is at the high end.
- **Wording:** "about 1 million axons (varies widely between people)".
- **Citation:** Curcio CA et al. (1990) J Comp Neurol 292:497–523, https://doi.org/10.1002/cne.902920402. Pawar PR et al. (2024) Eye, https://doi.org/10.1038/s41433-024-03137-7

### 16. Photoreceptors hyperpolarize in light (dark current)
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Citation:** Hagins WA, Penn RD, Yoshikami S (1970) Biophys J 10:380–412. https://doi.org/10.1016/S0006-3495(70)86308-1

### 17. ~53% of fibers cross at the chiasm
- **Verdict:** CONFIRMED as the standard figure, but weakly based. **Confidence:** moderate.
- **Details:** The 53:47 crossed-to-uncrossed ratio comes from **one** 78-year-old subject (Kupfer 1967). Reviews still say it is "generally assumed" (Pawar et al. 2024).
- **Wording:** "about half (roughly 53%)".
- **Citation:** Kupfer C, Chumbley L, Downer JC (1967) J Anat 101:393–401. https://pubmed.ncbi.nlm.nih.gov/6051727/

### 18. ~90% of RGCs project to the LGN
- **Verdict:** CONFIRMED (macaque estimate). **Confidence:** moderate-high.
- **Numbers (macaque):** About 80% of ganglion cells are P-beta (midget) cells projecting to parvocellular LGN, and about 10% are P-alpha (parasol) cells projecting to magnocellular LGN. The rest go to the SC, pretectum (olivary pretectal nucleus, pupil reflex), SCN and other targets. In primates, axons that branch to both thalamus and midbrain are rare.
- **Refinement:** Primates have at least 17 RGC types (Grünert & Martin 2020). ipRGCs are a tiny fraction; they drive both the SCN and the pupil reflex, and also reach the LGN.
- **Citation:** Perry VH, Oehler R, Cowey A (1984) Neuroscience 12:1101–1123. https://doi.org/10.1016/0306-4522(84)90006-X

### 19. Primate LGN layers
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details:** Layers 1–2 are magnocellular and 3–6 parvocellular, with koniocellular K layers below each main layer. The contralateral eye feeds layers 1, 4 and 6; the ipsilateral eye feeds layers 2, 3 and 5.
- **Citation:** Hendry SHC, Reid RC (2000) Annu Rev Neurosci 23:127–153. https://doi.org/10.1146/annurev.neuro.23.1.127

### 20. Meyer's loop and upper-field mapping
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details:** Meyer's loop carries fibres from the inferior retina, which sees the upper visual field, through the temporal lobe. Damage gives a contralateral upper-quadrant ("pie in the sky") defect. The upper field maps to the lower bank of the calcarine sulcus (lingual gyrus). How far forward the loop reaches varies between individuals, which matters in temporal-lobe surgery.
- **Citation:** Mandelstam SA (2012) AJNR. https://doi.org/10.3174/ajnr.A2652

### 21. V1 retinotopy, cortical magnification, orientation selectivity
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details:** Horton & Hoyt 1991 revised Holmes's map to expand the central representation. The central ~10° of vision occupies roughly half of V1 (moderate confidence on the exact fraction). Orientation selectivity was shown by Hubel & Wiesel in cat (1959/1962) and monkey (1968).
- **Citation:** Horton JC, Hoyt WF (1991) Arch Ophthalmol 109:816–824. https://doi.org/10.1001/archopht.1991.01080060080030

### 22. What/where(how) streams
- **Verdict:** CONFIRMED as a framework; the textbook split is oversimplified. **Confidence:** high.
- **Current view:**
  - The streams interact heavily.
  - The dorsal stream also holds object/shape representations that contribute to perception (Freud, Plaut & Behrmann 2016).
  - A **third, lateral visual pathway** runs from V1 through MT to the STS and is specialised for dynamic social perception such as faces, bodies and gaze (Pitcher & Ungerleider 2021; lesion evidence in Pitcher 2025).
- **Citation:** Pitcher D, Ungerleider LG (2021) TICS 25:100–110. https://doi.org/10.1016/j.tics.2020.11.006

### 23. Response latencies (macaque)
- **Verdict:** CONFIRMED, with the preparation specified. **Confidence:** high.
- **Numbers (anaesthetised macaques, flash onset latencies):** LGN magnocellular ~33 ms, parvocellular ~50 ms, V1 ~66 ms. MT, V3, MST and FEF ~72–75 ms, V2 ~82 ms, V4 ~104 ms. Latencies depend on anaesthesia and stimulus contrast.
- **Citation:** Schmolesky MT et al. (1998) J Neurophysiol 79:3272–3278. https://doi.org/10.1152/jn.1998.79.6.3272

---

## VISION BEYOND V1 (added 2026-09-27)

Added for the expanded Vision topic. Several items check claims from a draft outline; where the draft overstated something, the entry says so.

### 43. Midget and parasol ganglion cell proportions (macaque)
- **Verdict:** CONFIRMED. **Confidence:** high.
- About 80% of ganglion cells are midget (Pβ) cells projecting to the parvocellular LGN layers; about 10% are parasol (Pα) cells projecting to the magnocellular layers.
- **Citation:** Perry VH, Oehler R, Cowey A (1984) Neuroscience 12:1101–1123. https://doi.org/10.1016/0306-4522(84)90006-X

### 44. Magnocellular signals arrive earlier
- **Verdict:** CONFIRMED, with the scope stated. **Confidence:** high.
- In anaesthetised macaque LGN, the fastest magnocellular latencies precede the fastest parvocellular ones by about 10 ms. The authors note that convergence in cortex could reduce or remove this advantage.
- **Citation:** Maunsell JHR et al. (1999) Vis Neurosci 16:1–14. https://doi.org/10.1017/S0952523899156177

### 45. "The magnocellular pathway projects to the superior colliculus"
- **Verdict:** NEEDS CORRECTION. **Confidence:** high.
- The magnocellular pathway is the parasol → LGN magnocellular layers route. The superior colliculus receives a separate retinal projection (about 10% of ganglion cells, mostly other cell types); midbrain injections label no midget cells and few parasol cells (Perry et al. 1984). Used wording: roughly 90% of ganglion cells go to the LGN, the rest to the superior colliculus, pretectum and suprachiasmatic nucleus.

### 46. Dorsal = magnocellular, ventral = parvocellular
- **Verdict:** OVERSIMPLIFIED. **Confidence:** high.
- The dorsal stream is dominated by magnocellular input, but the ventral stream receives both channels, and they mix within V1.
- **Citations:** Merigan WH, Maunsell JHR (1993) Annu Rev Neurosci 16:369–402. https://doi.org/10.1146/annurev.ne.16.030193.002101 · Nassi JJ, Callaway EM (2009) Nat Rev Neurosci 10:360–372. https://doi.org/10.1038/nrn2619

### 47. Patient D.F. (perception vs action)
- **Verdict:** CONFIRMED. **Confidence:** high.
- After ventral-stream damage she could not report the orientation of a slot or the shape of objects, but her grasping and posting movements were accurate.
- **Citations:** Goodale MA et al. (1991) Nature 349:154–156. https://doi.org/10.1038/349154a0 · Goodale & Milner (1992) TINS. https://doi.org/10.1016/0166-2236(92)90344-8

### 48. MT/V5 and motion
- **Verdict:** CONFIRMED for direction and speed tuning; "MT computes optic flow" NEEDS CORRECTION. **Confidence:** high.
- Most MT neurons are tuned to direction and speed. Microstimulation of MT biases monkeys' motion judgements (Salzman et al. 1990). Selectivity for optic-flow patterns (expansion, rotation) is characteristic of the neighbouring area MSTd (Duffy & Wurtz 1991).
- Patient L.M. (Zihl et al. 1983): bilateral lateral temporo-occipital damage, loss of motion perception with other vision largely intact.
- **Citations:** Born & Bradley (2005) https://doi.org/10.1146/annurev.neuro.26.041002.131052 · Salzman et al. (1990) https://doi.org/10.1038/346174a0 · Duffy & Wurtz (1991) https://doi.org/10.1152/jn.1991.65.6.1329 · Zihl et al. (1983) https://doi.org/10.1093/brain/106.2.313

### 49. Human MT location
- **Verdict:** CONFIRMED. **Confidence:** high.
- Usually buried in a sulcus: the ascending limb of the inferior temporal sulcus (53%), its posterior continuation (26%) or the ITS itself (11%), near its junction with the lateral occipital sulcus.
- **Citation:** Dumoulin SO et al. (2000) Cereb Cortex 10:454–463. https://doi.org/10.1093/cercor/10.5.454

### 50. Optic ataxia after parietal damage
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Citation:** Perenin MT, Vighetto A (1988) Brain 111:643–674. https://doi.org/10.1093/brain/111.3.643

### 51. IT object recognition
- **Verdict:** CONFIRMED. **Confidence:** high.
- About 100 randomly sampled IT neurons, over windows as short as 12.5 ms, carried accurate information about object identity and category that generalised across position and scale (macaque). Human LOC responds more to objects than to textures.
- **Citations:** Hung CP et al. (2005) Science 310:863–866. https://doi.org/10.1126/science.1117593 · DiCarlo et al. (2012) https://doi.org/10.1016/j.neuron.2012.01.010 · Malach R et al. (1995) PNAS. https://doi.org/10.1073/pnas.92.18.8135

### 52. FFA
- **Verdict:** "Activates exclusively for facial identity and expression" NEEDS CORRECTION. **Confidence:** high.
- The FFA responds more to faces than to other categories, not exclusively. It was found in 12 of 15 subjects in the original study, and is typically larger in the right hemisphere. Identity is its main role; expression and gaze are processed more in the posterior STS (Haxby et al. 2000). Expertise effects (Gauthier et al. 2000) keep its specificity debated.
- Causal evidence: electrical stimulation distorted perceived faces but not other objects (Parvizi et al. 2012). Macaque: 97% of visually responsive neurons in the largest face patch were face-selective (Tsao et al. 2006).
- **Citations:** Kanwisher et al. (1997) https://doi.org/10.1523/JNEUROSCI.17-11-04302.1997 · Haxby et al. (2000) https://doi.org/10.1016/S1364-6613(00)01482-0 · Gauthier et al. (2000) https://doi.org/10.1038/72140 · Parvizi et al. (2012) https://doi.org/10.1523/JNEUROSCI.2609-12.2012 · Tsao et al. (2006) https://doi.org/10.1126/science.1119983

### 53. PPA
- **Verdict:** CONFIRMED for scene layout; "navigation limits" NEEDS CORRECTION. **Confidence:** high.
- The PPA responds to scenes, weakly to objects and not to faces. Empty rooms drive it as strongly as furnished ones, and more than twice as strongly as object arrays. Coding of where one can walk (navigational affordances) was shown in the occipital place area, not the PPA.
- **Citations:** Epstein R, Kanwisher N (1998) Nature 392:598–601. https://doi.org/10.1038/33402 · Bonner MF, Epstein RA (2017) PNAS. https://doi.org/10.1073/pnas.1618228114

### 54. EBA
- **Verdict:** CONFIRMED; "translates posture and articulation" is stronger than the evidence. **Confidence:** high.
- The EBA is body-selective, in lateral occipitotemporal cortex next to MT. TMS over it slows discrimination of body parts but not faces or objects, and it responds during one's own limb movements without visual feedback. A separate fusiform body area lies next to the FFA.
- **Citations:** Downing PE et al. (2001) Science 293:2470–2473. https://doi.org/10.1126/science.1063414 · Urgesi et al. (2004) https://doi.org/10.1016/j.cub.2004.11.031 · Astafiev et al. (2004) https://doi.org/10.1038/nn1241 · Peelen & Downing (2005) https://doi.org/10.1152/jn.00513.2004

### 55. VWFA
- **Verdict:** CONFIRMED, with its specificity debated. **Confidence:** high.
- Left lateral occipitotemporal sulcus, reproducible across people and scripts, partially selective for written strings. Its response to writing grows with literacy, with a small reduction in face responses (Dehaene et al. 2010). Reading is too recent to have shaped the genome; the region is thought to be recycled object-recognition cortex. Surgical removal of a small part caused a reading deficit with other categories intact (Gaillard et al. 2006). Price & Devlin (2003) argued it is not word-specific.
- The draft's "OCR module" analogy was left out.
- **Citations:** Cohen et al. (2000) https://doi.org/10.1093/brain/123.2.291 · Dehaene & Cohen (2011) https://doi.org/10.1016/j.tics.2011.04.003 · Dehaene et al. (2010) https://doi.org/10.1126/science.1194140 · Dehaene & Cohen (2007) https://doi.org/10.1016/j.neuron.2007.10.004 · Gaillard et al. (2006) https://doi.org/10.1016/j.neuron.2006.03.031 · Price & Devlin (2003) https://doi.org/10.1016/S1053-8119(03)00084-3

### 56. Category areas are selective, not exclusive
- **Verdict:** CONFIRMED. **Confidence:** high.
- Category identity can be decoded from ventral temporal cortex even when the regions that respond most to that category are excluded.
- **Citations:** Haxby JV et al. (2001) Science 293:2425–2430. https://doi.org/10.1126/science.1063736 · Grill-Spector K, Weiner KS (2014) Nat Rev Neurosci 15:536–548. https://doi.org/10.1038/nrn3747

### 57. Marker placement for MT, IT, FFA, PPA, EBA and VWFA
- The atlas does not segment these areas. `scripts/place-functional-areas.mjs` maps a typical group-average MNI coordinate into the atlas by matching the MNI brain box to the atlas cerebrum box, then snaps it to the nearest vertex of the gyrus or sulcus the area lies in. All six snapped within 5 mm. Positions are illustrative; individual locations vary by several millimetres.

## HEARING

### 24. Human cochlear cell counts
- **Verdict:** CONFIRMED. **Confidence:** high for hair cells, moderate for the ganglion count.
- **Numbers:**
  - About 3,500 inner hair cells and about 11,000–12,000 outer hair cells per cochlea (Ashmore 2008).
  - About 30,000–35,000 spiral ganglion neurons in young adults; about 90–95% are type I and contact inner hair cells.
- **Newer finding:** With age, auditory-nerve fibres are lost much faster than inner hair cells. Over 60% of peripheral axons are lost in 7 of 11 people over 60, while inner hair cell loss is rarely above 15%. This "hidden hearing loss" does not show on a standard audiogram (Wu et al. 2019, human temporal bones).
- **Citation:** Ashmore J (2008) Physiol Rev 88:173–210, https://doi.org/10.1152/physrev.00044.2006. Wu PZ et al. (2019) Neuroscience, https://doi.org/10.1016/j.neuroscience.2018.07.053

### 25. Prestin and the cochlear amplifier
- **Verdict:** CONFIRMED (mouse data). **Confidence:** high.
- **Numbers:** Prestin-knockout mice lose 40–60 dB of cochlear sensitivity; heterozygotes lose about 6 dB. Dallos et al. 2008 (prestin knock-in mouse) showed motility is needed for both sensitivity and sharp tuning.
- **Citation:** Liberman MC et al. (2002) Nature 419:300–304. https://doi.org/10.1038/nature01059

### 26. Tonotopy (base ~20 kHz, apex ~20 Hz)
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details:** Greenwood's human function gives about 20 Hz at the apex and about 20 kHz at the base.
- **Citation:** Greenwood DD (1990) JASA 87:2592–2605. https://doi.org/10.1121/1.399052

### 27. Auditory nerve ends only in the ipsilateral cochlear nucleus
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details:** Every auditory-nerve fibre branches to the ipsilateral AVCN, PVCN and DCN. Binaural convergence begins in the superior olive.
- **Citation:** Purves et al., Neuroscience, "The Auditory System". https://www.ncbi.nlm.nih.gov/books/NBK10788/

### 28. MSO/ITD, LSO/ILD, MNTB, calyx of Held
- **Verdict:** CONFIRMED, with refinements. **Confidence:** high.
- **Numbers:** The best human ITD thresholds are about 10 µs for low-frequency or broadband sounds and rise sharply above ~1.3 kHz (Brughera et al. 2013).
- **Refinements:**
  - In mammals, ITD appears to be coded by broadly tuned two-channel (left vs right hemisphere) rate codes, not a Jeffress-style map of delay lines (Grothe, Pecka & McAlpine 2010).
  - The human MNTB was disputed for decades. Post-mortem studies now support its existence (Kulesza & Grothe 2015).
  - The calyx of Held is one of the largest synapses in the mammalian CNS; the physiology comes from rodents.
- **Citation:** Grothe B, Pecka M, McAlpine D (2010) Physiol Rev 90:983–1012, https://doi.org/10.1152/physrev.00026.2009. Kulesza & Grothe 2015, https://doi.org/10.3389/fnana.2015.00035

### 29. The IC as an obligatory relay
- **Verdict:** CONFIRMED ("nearly all" is correct). **Confidence:** high.
- **Exception (rat):** The DCN and the small-cell cap of the VCN project directly to the **medial** MGB, bypassing the IC. This is a small, non-lemniscal route.
- **Citation:** Malmierca MS et al. (2002) J Neurosci 22:10891–10897. https://doi.org/10.1523/JNEUROSCI.22-24-10891.2002

### 30. Ventral MGB → core A1 on Heschl's gyrus
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details:** In humans, the core covers roughly the medial two-thirds of Heschl's gyrus. It has mirror-symmetric high–low–high tonotopic gradients (7T fMRI). The exact layout varies between individuals.
- **Citation:** Moerel M, De Martino F, Formisano E (2014) Front Neurosci 8:225. https://doi.org/10.3389/fnins.2014.00225

### 31. Each auditory cortex hears both ears
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details:** Unilateral cortical damage does not cause deafness in one ear. Typical effects are subtle, such as poorer localisation in the opposite hemifield and dichotic-listening deficits. Cortical deafness requires damage on both sides.
- **Citation:** Purves et al., Neuroscience, "The Auditory Cortex". https://www.ncbi.nlm.nih.gov/books/NBK10900/

### 32. ABR waves I–V "within ~6 ms"
- **Verdict:** NEEDS CORRECTION (minor). **Confidence:** high.
- **Numbers:** Wave V latency is about 5–6 ms at high levels (~80–90 dB) and about 8–9 ms near threshold. The whole ABR falls within **10 ms** of sound onset.
- **Wording:** "Five brainstem waves appear within about 10 ms of a click; for loud sounds, the last one arrives at about 6 ms."
- **Citation:** StatPearls, "Auditory Brainstem Response". https://www.ncbi.nlm.nih.gov/books/NBK564321/

---

## BODY SENSATION

### 33. DCML pathway and lower-limb proprioception
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details:**
  - Leg proprioceptive afferents travel in the gracile fasciculus to Clarke's column (C8–L2/3).
  - From there they ascend in the dorsal spinocerebellar tract. Collaterals synapse in nucleus Z (rostral to the gracile nucleus), cross as internal arcuate fibres, and join the medial lemniscus.
  - The T6 boundary is approximate. Nucleus Z is poorly defined in humans.
- **Citation:** StatPearls, "Neuroanatomy, Spinocerebellar Dorsal Tract". https://www.ncbi.nlm.nih.gov/books/NBK556013/

### 34. S1 areas 3a / 3b / 1 / 2
- **Verdict:** CONFIRMED as the textbook scheme (primate). **Confidence:** high.
- **Refinement:** Most S1 neurons combine input from several afferent classes, and texture is also coded in area 3b. The "one area, one submodality" picture is too clean.
- **Citation:** Saal HP, Bensmaia SJ (2014) Trends Neurosci 37:689–697. https://doi.org/10.1016/j.tins.2014.08.012

### 35. Mechanoreceptors and Aβ conduction speed
- **Verdict:** CONFIRMED, with a caveat about Ruffini. **Confidence:** high.
- **Numbers:**
  - Meissner (RA1): about 5–50 Hz flutter.
  - Pacinian (RA2): best at about 200–300 Hz.
  - Merkel (SA1): fine form, edges and pressure.
  - Ruffini (SA2): skin stretch. However, Ruffini corpuscles are **rare in human glabrous (fingertip) skin**, even though SA2 afferents are recorded there (Paré et al. 2003).
  - Aβ conduction: about 35–75 m/s.
- **Citation:** Johnson KO (2001) Curr Opin Neurobiol 11:455–461, https://doi.org/10.1016/S0959-4388(00)00234-8. Paré et al. 2003, https://doi.org/10.1002/cne.10519

---

## SPEECH & LANGUAGE

### 36. Hickok & Poeppel dual-stream model
- **Verdict:** CONFIRMED (still the dominant framework). **Confidence:** high.
- **Details:** The ventral stream (sound to meaning) is largely bilateral. The dorsal stream (sound to articulation) is left-dominant and runs through area Spt.
- **Caveats:** Findings of parallel processing (Hamilton 2021; Hullett 2025) and the debate over anterior versus posterior ventral routes (Rauschecker & Scott) complicate a strictly serial hierarchy.
- **Citation:** Hickok G, Poeppel D (2007) Nat Rev Neurosci 8:393–402. https://doi.org/10.1038/nrn2113

### 37. Hamilton, Oganian, Hall & Chang 2021
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details (human intracranial recordings, electrical stimulation and a surgical resection):**
  - pSTG responds to speech as early as Heschl's gyrus (HG), and the two encode different features, so processing is parallel rather than serial.
  - Stimulating HG caused auditory hallucinations but did not disrupt word perception or repetition.
  - Stimulating lateral/posterior STG blocked word perception without causing hallucinations.
  - Removing primary auditory cortex (HG) did not affect speech perception.
- **Follow-up:** Frontal speech areas also receive fast parallel input from the auditory thalamus and HG (Hullett et al. 2025, Nat Commun, https://doi.org/10.1038/s41467-025-67517-7).
- **Citation:** Hamilton LS et al. (2021) Cell 184:4626–4639. https://doi.org/10.1016/j.cell.2021.07.019

### 38. Flinker et al. 2015 (Broca's area)
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details (human ECoG):** Broca's area peaked before articulation and was "surprisingly silent" while motor cortex drove speech. Activity was higher for novel nonwords. Broca's area mediates the cascade from temporal to motor cortex.
- **Caveat:** Chang-lab reviews argue Broca's area is not critical for speech motor planning (Silva et al. 2022). Other groups, including Castellucci et al. 2022 and Long, put caudal IFG at the centre of planning. This remains unresolved.
- **Citation:** Flinker A et al. (2015) PNAS 112:2871–2875. https://doi.org/10.1073/pnas.1414491112

### 39. Bouchard et al. 2013 (speech somatotopy)
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details:** The dorsal-to-ventral order on ventral pre- and postcentral gyri is **larynx, lips, jaw, tongue, larynx**. The larynx is represented twice, and representations partly overlap (map from n = 3 subjects). Dichter et al. 2018 (Cell) later tied the dorsal larynx area to vocal pitch control.
- **Citation:** Bouchard KE, Mesgarani N, Johnson K, Chang EF (2013) Nature 495:327–332. https://doi.org/10.1038/nature11911

### 40. Middle precentral gyrus and speech-planning networks
- **Verdict:** Needs correct attribution. Castellucci 2022 is from the **Long lab** (NYU, with Iowa neurosurgery), **not the Chang lab**. Silva et al. 2022 is a **review**, not new data. **Confidence:** high.
- **Silva et al. 2022 (J Neurosci review):**
  - Proposes that the midPrCG, between the hand and face areas, is essential for syllable-level speech sequencing. That role is traditionally given to Broca's area.
  - Evidence: stimulation there evokes complex vocalisation or speech arrest, and focal injury causes pure apraxia of speech.
  - https://doi.org/10.1523/JNEUROSCI.1614-22.2022
- **Castellucci et al. 2022 (Nature, human ECoG during turn-taking and natural conversation):**
  - Found a planning network centred on **caudal IFG (Broca's region) and caudal middle frontal gyrus**.
  - The network is more active when preparing speech than when preparing non-speech actions, and peaks before speaking in real conversation.
  - https://doi.org/10.1038/s41586-021-04270-z
- **Newer primary data:**
  - Liu, Zhao, Hullett & Chang 2025 (Nat Hum Behav, n = 14): sustained mPrCG activity scaled with sequence complexity and predicted reaction time. Stimulation caused apraxia-like disfluencies. https://doi.org/10.1038/s41562-025-02250-1
  - Khanna et al. 2024 (Nature, Neuropixels in human language-dominant prefrontal cortex): single neurons encode the phonetic and syllabic plan of upcoming words. https://doi.org/10.1038/s41586-023-06982-w
  - Zhao et al. 2025 (Nat Hum Behav): many premotor sites where stimulation causes "speech arrest" actually belong to an **inhibitory stop-speech network**, not critical production centres. https://doi.org/10.1038/s41562-025-02118-4

### 41. Fedorenko, Ivanova & Regev 2024
- **Verdict:** CONFIRMED, as a statement of the authors' position. **Confidence:** high.
- **Details:** The core language network is in left frontal and temporal cortex. It is language-selective, works regardless of input or output modality, and is distinct from the multiple-demand and theory-of-mind networks. Some researchers argue domain-general systems contribute more, so present it as a strong, well-supported position rather than a consensus of every lab.
- **Citation:** Fedorenko E, Ivanova AA, Regev TI (2024) Nat Rev Neurosci. https://doi.org/10.1038/s41583-024-00802-4

### 42. Huth et al. 2016 (semantic maps)
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Details (fMRI, 7 people, hours of narrative listening):** Semantic selectivity tiles large areas of **both** hemispheres fairly symmetrically.
- **Reconciling with #41:** Meaning and concept representations are broad and bilateral. The combinatorial language network is left-lateralised and narrower.
- **Citation:** Huth AG et al. (2016) Nature 532:453–458. https://doi.org/10.1038/nature17637

---

## ATTENTION, EXPANDED (added 2026-09-27)

### 58. FEF stimulation improves attention and gates V4 (macaque)
- **Verdict:** CONFIRMED. **Confidence:** high.
- Moore & Fallah 2001: FEF microstimulation below the eye-movement threshold improved performance on a spatial attention task "when, but only when" the attended object was in the space represented by the stimulation site.
- Moore & Armstrong 2003: the same kind of stimulation enhanced V4 visual responses at retinotopically corresponding locations. The enhancement depended on the receptive-field stimulus and on competing stimuli outside the receptive field. Stimulating non-corresponding FEF sites could suppress V4 responses.
- **Citations:** Moore T, Fallah M (2001) PNAS 98:1273–1276. https://doi.org/10.1073/pnas.98.3.1273 · Moore T, Armstrong KM (2003) Nature 421:370–373. https://doi.org/10.1038/nature01341

### 59. Human FEF location and causal evidence
- **Verdict:** CONFIRMED, with variability stated. **Confidence:** high.
- The PET meta-analysis (8 studies, 62 people) places the FEF near the precentral sulcus and/or the depth of the caudal superior frontal sulcus. Talairach Y −6 to 1 and Z 44–51 are consistent across studies; X varies more (−24 to −40 left). The mean is [−32 ± 11; −2 ± 4; 46 ± 4] (Vernet et al. 2014, Table 2). Location depends on method (Amiez & Petrides 2009).
- TMS of the right FEF (Ruff et al. 2006) increased activity for peripheral and decreased it for central visual-field representations in V1–V4, independent of visual input, and increased perceived contrast of peripheral relative to central stimuli.
- **Citations:** Paus T (1996) Neuropsychologia 34:475–483. https://doi.org/10.1016/0028-3932(95)00134-4 · Vernet M et al. (2014) Front Integr Neurosci 8:66. https://doi.org/10.3389/fnint.2014.00066 · Ruff CC et al. (2006) Curr Biol 16:1479–1488. https://doi.org/10.1016/j.cub.2006.06.057

### 60. Are attention and saccade planning the same mechanism?
- **Verdict:** CONTESTED. **Confidence:** moderate.
- Moore & Armstrong interpret attentional gain as reflecting "nascent saccadic eye movement commands". Gregoriou et al. 2012 found that in covert attention only visual and visuomovement FEF neurons showed enhanced responses. Movement neurons were unchanged, and only visual cells showed enhanced gamma synchronization with V4. They concluded that attentional modulation is not mediated by movement neurons. Gregoriou et al. 2009: FEF–V4 gamma coupling with attention, apparently initiated by FEF, time-shifted by about 8–13 ms.
- **Wording used:** "Whether attention simply reuses eye-movement plans is debated."
- **Citations:** Gregoriou GG, Gotts SJ, Desimone R (2012) Neuron 73:581–594. https://doi.org/10.1016/j.neuron.2011.12.019 · Gregoriou GG et al. (2009) Science 324:1207–1210. https://doi.org/10.1126/science.1171402

### 61. LIP priority map (macaque)
- **Verdict:** CONFIRMED as the authors' proposal. **Confidence:** moderate-high.
- LIP ensemble activity across the visual field describes the spatial and temporal dynamics of attention. Activity at one location gives priority there but does not predict where the monkey will attend or look (Bisley & Goldberg 2003). They propose LIP as a priority map combining bottom-up and top-down inputs, whose peak guides saccades and attention (2010).
- **Citations:** Bisley JW, Goldberg ME (2003) Science 299:81–86. https://doi.org/10.1126/science.1077395 · Bisley JW, Goldberg ME (2010) Annu Rev Neurosci 33:1–21. https://doi.org/10.1146/annurev-neuro-060909-152823

### 62. Superior colliculus and covert attention (macaque; human fMRI)
- **Verdict:** CONFIRMED. **Confidence:** high. (Extends entry 12.)
- Lovejoy & Krauzlis 2010: muscimol inactivation of intermediate/deep SC caused "profound inattention" for stimuli in the affected field, but only when distractors carried counter-informative signals. With uninformative distractors, performance was largely unaffected.
- Müller et al. 2005: SC microstimulation lowered thresholds at the location represented by the site, not at a control location in the opposite hemifield, with gaze fixed.
- Zénon & Krauzlis 2012: attention effects in MT and MST were unchanged despite large attention deficits during SC inactivation.
- Schneider & Kastner 2009 (human fMRI): attention enhanced SC activity, more strongly than in the LGN.
- **Citations:** https://doi.org/10.1038/nn.2470 · https://doi.org/10.1073/pnas.0408311101 · https://doi.org/10.1038/nature11497 · https://doi.org/10.1523/JNEUROSCI.4452-08.2009

### 63. SC anatomy and connections (primate)
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Layers and map:** superficial layers get direct retinal and striate input and map stimulus position. Intermediate/deep layers get extrastriate input, respond to other modalities, and are mostly related to orienting movements. Each SC maps the contralateral field with an enlarged centre (Krauzlis et al. 2013, full text).
- **Stimulation:** stimulation evokes combined eye–head gaze shifts whose amplitude depends on the site (Freedman et al. 1996).
- **Inputs:** from FEF (largest FEF terminal fields in midbrain/pons; Stanton et al. 1988) and LIP (Paré & Wurtz 1997).
- **Outputs:** to MT through pulvinar relay neurons (Berman & Wurtz 2010) and to LIP via the lateral pulvinar. A route through the mediodorsal thalamus reaches prefrontal cortex including FEF and carries corollary discharge (Krauzlis 2013; Sommer & Wurtz 2002).
- **Citations:** https://doi.org/10.1146/annurev-neuro-062012-170249 · https://doi.org/10.1152/jn.1996.76.2.927 · https://doi.org/10.1002/cne.902710403 · https://doi.org/10.1152/jn.1997.78.6.3493 · https://doi.org/10.1523/JNEUROSCI.6176-09.2010 · https://doi.org/10.1126/science.1069590

### 64. Ventral attention network and the right TPJ
- **Verdict:** CONFIRMED; the TPJ's exact computation is debated (see entry 6). **Confidence:** high.
- **Original model:** TPJ + inferior frontal cortex, largely right-lateralized, specialised for detecting behaviourally relevant stimuli, particularly salient or unexpected ones; a "circuit breaker" for the dorsal system (Corbetta & Shulman 2002). Suppressed during focused attention (Corbetta et al. 2008).
- **Sensory changes:** changes in visual, auditory and tactile input engage right TPJ, IFG and insula, plus left cingulate/SMA (Downar et al. 2000).
- **Goal dependence:** target-coloured distractors capture attention with concurrent TPJ and ventral frontal activation (Serences et al. 2005).
- **Meta-analysis:** reorienting across 25 experiments peaks in right TPJ at MNI (62, −44, 12). The anterior rTPJ is shared with false-belief tasks; the posterior rTPJ is more social (Krall et al. 2015).
- **Causal (human):** cTBS over anterior rTPJ impaired reorienting (Krall et al. 2016).
- **Citations:** https://doi.org/10.1038/nrn755 · https://doi.org/10.1016/j.neuron.2008.04.017 · https://doi.org/10.1038/72991 · https://doi.org/10.1111/j.0956-7976.2005.00791.x · https://doi.org/10.1007/s00429-014-0803-z · https://doi.org/10.1002/hbm.23068

### 65. Ventral attention network vs salience network
- **Verdict:** CONTESTED (terminology and whether they are one system). **Confidence:** moderate-high.
- **Overlap:** at rest, right and left TPJ connect with anterior insula, dlPFC and mid-cingulate, which Kucyi et al. (2012) call the "salience/ventral attention network"; the connection is stronger for right TPJ. The reorienting meta-analysis includes the right insula (Krall 2015).
- **Disagreement:** Uddin, Yeo & Spreng (2019) note that some investigators treat the two as one system (Kucyi 2012) and others as distinct (Power 2011; Cole 2013). They propose that the VAN is "an instantiation of the larger, bilateral midcingulo-insular network".
- **Wording used:** "It overlaps with the ventral attention network… Some researchers treat the two as one network; others keep them separate."
- **Citations:** https://doi.org/10.1152/jn.00674.2012 · https://doi.org/10.1007/s10548-019-00744-6

### 66. Where damage causes spatial neglect
- **Verdict:** Right-hemisphere predominance CONFIRMED; the critical site is CONTESTED. **Confidence:** high / moderate.
- **Candidate sites:** Corbetta & Shulman (2011) list IPL, STG and IFG as classic egocentric-neglect sites and add white-matter disconnection. Mort et al. (2003) name the angular gyrus. Karnath et al. (2001) name the superior temporal cortex.
- **Network account:** ventral lesions also disrupt the structurally intact dorsal network (Corbetta & Shulman 2011).
- **Consequence for the model:** the superior parietal lobule, which the `parietal` marker highlights, is not among the classic sites. The neglect fact was moved from the "Priority map" step to the TPJ step.
- **Citations:** https://doi.org/10.1146/annurev-neuro-061010-113731 · https://doi.org/10.1093/brain/awg200 · https://doi.org/10.1038/35082075

### 67. Locus coeruleus and adaptive gain
- **Verdict:** Recordings CONFIRMED (monkey); adaptive gain is a THEORY. **Confidence:** high for data, moderate for theory.
- **Recordings:** in an oddball vigilance task (targets on 10–20% of trials), all LC neurons examined responded phasically and selectively to targets. Mean latency was 90.7 ms, about 200 ms before lever release. Responses were attenuated during poor performance and after more than 90 min (Aston-Jones et al. 1994).
- **Theory:** phasic mode supports exploitation and tonic mode goes with exploration; ACC and OFC project directly to LC (Aston-Jones & Cohen 2005).
- **Pupil:** pupil changes follow LC activity but also IC, SC, ACC and PCC activity (Joshi et al. 2016), so pupil size is not a pure LC readout.
- **Link to the ventral network:** Corbetta et al. (2008) proposed LC input to the ventral attention network.
- **Citations:** https://doi.org/10.1523/JNEUROSCI.14-07-04467.1994 · https://doi.org/10.1146/annurev.neuro.28.061604.135709 · https://doi.org/10.1016/j.neuron.2015.11.028 · https://doi.org/10.1038/s41583-020-0360-9

### 68. Human LC location
- **Verdict:** CONFIRMED. **Confidence:** high.
- Adjacent to the floor of the fourth ventricle in the rostral pons, extending up to the level of the inferior colliculi. In MRI of 44 adults (19–79 years), the signal ran from MNI z −18 to −33, with mean left x −2.5 to −6.9 mm and y ≈ −36 to −39. It was most frequent at z −24/−27, matching post-mortem cell density.
- **Citation:** Keren NI et al. (2009) NeuroImage 47:1261–1267. https://doi.org/10.1016/j.neuroimage.2009.06.012

### 69. Acetylcholine: source and role in attention
- **Verdict:** CONFIRMED, species flagged. **Confidence:** high.
- **Source (rat):** Ch4 (nucleus basalis and parts of the diagonal band) provides the major cholinergic input to the cortex. Ch5–Ch6 (pedunculopontine and laterodorsal tegmental nuclei) provide the major input to the thalamus and only a minor cortical component (Mesulam et al. 1983). The companion rhesus-monkey study confirms basal forebrain → cortex (title level; no abstract).
- **V1 (macaque):** low-dose ACh enhanced attentional modulation; scopolamine (muscarinic) reduced it; mecamylamine (nicotinic) had no systematic effect (Herrero et al. 2008).
- **Rat prefrontal cortex:** detected cues evoked second-scale ACh transients in mPFC and missed cues did not (Parikh et al. 2007).
- **Brief's premise:** acetylcholine for cortical attention comes mainly from the basal forebrain, not the brainstem. Confirmed for rat anatomy.
- **Citations:** https://doi.org/10.1016/0306-4522(83)90108-2 · https://doi.org/10.1002/cne.902140206 · https://doi.org/10.1038/nature07141 · https://doi.org/10.1016/j.neuron.2007.08.025

### 70. Marker placement for FEF, TPJ, SC and LC
- **FEF:** Paus 1996 mean Talairach (−32, −2, 46) → MNI (−32, −4, 50) (Brett transform), snapped to `Precentral_sulcus_(Superior_part)*l` at 6.2 mm.
- **TPJ:** Krall 2015 reorienting peak MNI (62, −44, 12), snapped to `Supramarginal_gyrusr` at 6.5 mm. Drawn on the right because the network is right-lateralized.
- **SC and LC:** these nuclei are not in the atlas. Anchors [0.25, −0.52, 0.14] (inside `Midbrainl`, above the IC body, ~2 mm under the tectal surface) and [0.35, −1.0, 0.13] (inside `Ponsl`, ~2 mm under the floor of the fourth ventricle, 4.5 mm from the midline, per Keren 2009). All positions are illustrative.

### 71. Insula highlight mesh (correction)
- **Verdict:** NEEDS CORRECTION. **Confidence:** moderate-high.
- **Current mesh:** `Insula_(Subcentral_gyrus_and_ant_and_post_sulci*)l` has a median vertex distance from the midline of 55 mm (5th–95th percentile 44–64 mm; its centre, used as the marker, is 54 mm). It reaches the lateral surface of the brain (max 68 mm). This matches the subcentral gyrus (central operculum), not the insula, which is hidden inside the lateral sulcus.
- **Better mesh:** `Circular_sulcus_of_insulal`, which outlines the insula, has a median of 37 mm. Typical insula activation peaks lie about 30–44 mm from the midline; for example, the right insula peak in Krall et al. 2015 is at x = 44.
- A test coordinate on the anterior insula snapped 21 mm to the current mesh and 5.5 mm to the circular sulcus.


---

## BODY SENSATION: PAIN, TEMPERATURE, S2 AND INSULA (added 2026-09-27)

### 72. Spinothalamic crossing level and dorsal horn laminae
- **Verdict:** CONFIRMED. **Confidence:** high.
- Nociceptor fibres end mainly in laminae I, II and V (Dubin & Patapoutian 2010). Spinothalamic cells lie mainly in lamina I and laminae IV–VI (monkey, cat, rat), and their axons "often decussate through the ventral white commissure at a very short distance from the cell body" (Willis & Westlund 1997). Dorsal column fibres cross only in the medulla.
- **Citations:** Willis WD, Westlund KN (1997) J Clin Neurophysiol 14:2–31. https://doi.org/10.1097/00004691-199701000-00002 · Dubin AE, Patapoutian A (2010) J Clin Invest 120:3760–3772. https://doi.org/10.1172/JCI42843

### 73. Thin fibres, first and second pain
- **Verdict:** CONFIRMED. **Confidence:** high.
- C fibres conduct at 0.4–1.4 m/s; A-fibre nociceptors at about 5–30 m/s, mostly in the Aδ range. First, pricking pain comes from A fibres; second, burning pain from C fibres and type I A-fibre mechano-heat nociceptors.
- **Citation:** Dubin & Patapoutian (2010). https://doi.org/10.1172/JCI42843

### 74. Anterolateral cordotomy (human)
- **Verdict:** CONFIRMED. **Confidence:** high.
- 19 patients with one-sided cancer pain had the spinothalamic tract lesioned at C1/C2 on the side opposite the pain. Pain, temperature and itch were profoundly impaired: thermal sense was abolished in most patients and cowhage itch was abolished. Touch pleasantness, including the C-tactile velocity tuning, was unchanged. Monofilament detection thresholds were unchanged, while ratings of touch intensity fell.
- Consequence: pleasant (C-tactile) touch does not depend on the spinothalamic tract. This conflicts with the "dual pathway" model. Do not describe the anterolateral system as the route for crude or affective touch.
- **Citation:** Marshall AG et al. (2019) eLife 8:e51642. https://doi.org/10.7554/eLife.51642

### 75. Itch travels with pain and temperature
- **Verdict:** CONFIRMED. **Confidence:** high.
- Cat: a class of lamina I spinothalamic neurons is selectively excited by histamine (Andrew & Craig 2001). Human: cordotomy abolished cowhage itch (entry 74).
- **Citation:** Andrew D, Craig AD (2001) Nat Neurosci 4:72–77. https://doi.org/10.1038/82924

### 76. Thalamic targets and the VMpo debate
- **Verdict:** CONTESTED. **Confidence:** high that it is contested.
- Spinothalamic terminations are reported in VPL (caudal and oral), VPI, POm, CL and other medial nuclei (Willis & Westlund 1997).
- Craig describes lamina I input concentrated in VMpo and MDvc, with only isolated boutons in VPL/VPM (macaque; Craig 2004). He also describes VMpo as a pain- and temperature-specific nucleus in macaques and humans (Craig et al. 1994) that projects topographically to the dorsal posterior insula (Craig 2014).
- Graziano & Jones (2004, monkey) found widespread lamina I terminations and argue VMpo is part of VPM, not an independent relay.
- Wording used: "other anatomists argue that this region is part of neighbouring nuclei."
- **Citations:** Craig AD et al. (1994) Nature 372:770–773. https://doi.org/10.1038/372770a0 · Craig AD (2004) J Comp Neurol 477:119–148. https://doi.org/10.1002/cne.20240 · Craig AD (2014) J Comp Neurol 522:36–63. https://doi.org/10.1002/cne.23425 · Graziano A, Jones EG (2004) J Neurosci 24:248–256. https://doi.org/10.1523/JNEUROSCI.4122-03.2004

### 77. Cortical targets of the spinothalamic system
- **Verdict:** CONFIRMED, with scope. **Confidence:** moderate–high.
- Cebus monkey (transneuronal virus): the major targets are granular insula, S2 and cingulate sulcus areas (Dum et al. 2009). The abstract does not list S1 as a major target.
- Human imaging meta-analysis: the acute pain network includes S1, S2, insula, ACC, PFC and thalamus (Apkarian et al. 2005).
- The text therefore says the pathway "reaches S1 and S2", and names the insula and cingulate as the targets of the posterior and medial thalamic nuclei.
- **Citations:** Dum RP, Levinthal DJ, Strick PL (2009) J Neurosci 29:14223–14235. https://doi.org/10.1523/JNEUROSCI.3398-09.2009 · Apkarian AV et al. (2005) Eur J Pain 9:463–484. https://doi.org/10.1016/j.ejpain.2004.11.001

### 78. Posterior insula: temperature, pain map, interoception
- **Verdict:** CONFIRMED (findings); interoceptive-cortex framing is Craig's proposal. **Confidence:** high.
- Human PET: graded cooling correlated with activity only in the dorsal margin of the contralateral middle/posterior insula. Perceived intensity correlated with the right anterior insula (Craig et al. 2000).
- Human 3T fMRI, 14 subjects: painful heat to the right face, hand and foot mapped somatotopically in the contralateral posterior insula. Hand peak at MNI (−40, −19, 14) (Brooks et al. 2005).
- Craig (2003) calls the dorsal posterior insula the "primary interoceptive representation", with a re-representation in the right anterior insula.
- **Citations:** Craig AD et al. (2000) Nat Neurosci 3:184–190. https://doi.org/10.1038/72131 · Brooks JCW et al. (2005) NeuroImage 27:201–209. https://doi.org/10.1016/j.neuroimage.2005.03.041 · Craig AD (2003) Curr Opin Neurobiol 13:500–505. https://doi.org/10.1016/S0959-4388(03)00090-4 · Craig AD (2002) Nat Rev Neurosci 3:655–666. https://doi.org/10.1038/nrn894

### 79. Cortical stimulation and pain (human)
- **Verdict:** CONFIRMED. **Confidence:** high.
- 4,160 intracerebral stimulations in 164 patients during presurgical epilepsy evaluation. Pain occurred in 1.4%, concentrated in the medial parietal operculum and neighbouring posterior insula, where pain was about 10% of responses. There were no pain responses elsewhere, including S1, lateral S2, and anterior and mid-cingulate cortex.
- **Citation:** Mazzola L et al. (2012) Brain 135:631–640. https://doi.org/10.1093/brain/awr265

### 80. Is any cortical area specific to pain?
- **Verdict:** CONTESTED. **Confidence:** high that it is contested.
- Segerdahl et al. (2015) proposed a specific role for the dorsal posterior insula. Davis et al. (2015) replied that the data do not justify specificity.
- Human intracerebral recordings at 47 insular sites showed nociceptive, vibrotactile, auditory and visual stimuli all elicited responses in the posterior and anterior insula (Liberati et al. 2016).
- fMRI responses to brief painful stimuli are largely explained by multimodal and somatosensory activity that scales with salience (Mouraux et al. 2011; Iannetti & Mouraux 2010).
- Wording used: "Whether any cortical area responds to pain alone is debated."
- **Citations:** Segerdahl AR et al. (2015) Nat Neurosci 18:499–500. https://doi.org/10.1038/nn.3969 · Davis KD et al. (2015) F1000Research 4:362. https://doi.org/10.12688/f1000research.6833.1 · Liberati G et al. (2016) PLoS Biol 14:e1002345. https://doi.org/10.1371/journal.pbio.1002345 · Mouraux A et al. (2011) NeuroImage 54:2237–2249. https://doi.org/10.1016/j.neuroimage.2010.09.084 · Iannetti GD, Mouraux A (2010) Exp Brain Res 205:1–12. https://doi.org/10.1007/s00221-010-2340-1

### 81. C-tactile touch and the insula
- **Verdict:** CONFIRMED (single patient); routing CONTESTED (entry 74). **Confidence:** moderate.
- In a patient lacking large myelinated afferents, C-tactile stimulation produced faint pleasant touch and activated the insular region, but not S1 or S2 (fMRI).
- **Citation:** Olausson H et al. (2002) Nat Neurosci 5:900–904. https://doi.org/10.1038/nn896

### 82. Cingulate cortex and pain unpleasantness
- **Verdict:** CONFIRMED. **Confidence:** high.
- Hypnotic suggestion changed unpleasantness without changing perceived intensity. Pain-evoked ACC activity changed; S1 did not (human PET; Rainville et al. 1997).
- A postcentral stroke patient showed dissociated discriminative and affective pain (Ploner et al. 1999).
- The likely thalamic source of nociceptive input to ACC is the midline, mediodorsal and intralaminar nuclei (Shyu & Vogt 2009; mostly rodent physiology).
- **Citations:** Rainville P et al. (1997) Science 277:968–971. https://doi.org/10.1126/science.277.5328.968 · Ploner M et al. (1999) Pain 81:211–214. https://doi.org/10.1016/S0304-3959(99)00012-3 · Shyu BC, Vogt BA (2009) Mol Pain 5:51. https://doi.org/10.1186/1744-8069-5-51

### 83. S2
- **Verdict:** CONFIRMED. **Confidence:** high.
- Human parietal operculum: four cytoarchitectonic areas (OP1–4) in 10 brains, matching functional S2 from 57 studies (Eickhoff et al. 2006 I, II). OP1 is the putative homologue of macaque S2.
- Monkeys: S2 sits in the upper bank of the lateral sulcus, with bilateral multi-digit receptive fields. It receives input from all four S1 areas and from VPI, VPS and anterior pulvinar (Delhaye et al. 2018).
- Macaque serial dependence on S1 (Pons et al. 1987).
- Human imaging meta-analysis: right-hand touch activates S1 on the left only, and S2 on both sides (Lamp et al. 2019).
- Human TMS over S2 impaired pain-intensity judgements, not localisation (Lockwood et al. 2013).
- **Citations:** Eickhoff SB et al. (2006) Cereb Cortex 16:254–267, https://doi.org/10.1093/cercor/bhi105; 16:268–279, https://doi.org/10.1093/cercor/bhi106 · Delhaye BP et al. (2018) Compr Physiol 8:1575–1602. https://doi.org/10.1002/cphy.c170033 · Pons TP et al. (1987) Science 237:417–420. https://doi.org/10.1126/science.3603028 · Lamp G et al. (2019) Front Neurol 9:1129. https://doi.org/10.3389/fneur.2018.01129 · Lockwood PL et al. (2013) Cortex 49:2201–2209. https://doi.org/10.1016/j.cortex.2012.10.006

### 84. S1 areas 3a, 3b, 1, 2 (update to entry 34)
- **Verdict:** CONFIRMED (monkey data). **Confidence:** high.
- Response types by area: 3a proprioceptive, at the fundus of the central sulcus. 3b mostly cutaneous. Area 1 ≥90% cutaneous. Area 2 55% deep and 45% cutaneous in the hand representation.
- Receptive fields grow from 3b to 1 to 2. Curvature tuning appears in area 2. Area 1 lesions impair texture but not shape discrimination.
- The bulk of VP neurons project to 3b and 1. 3b is the homologue of S1 in other mammals.
- Four complete body maps, with the foot medial and face and tongue lateral (Delhaye et al. 2018). Complete maps in 3b and 1 (Kaas et al. 1979).
- **Citations:** Delhaye et al. (2018) https://doi.org/10.1002/cphy.c170033 · Kaas JH et al. (1979) Science 204:521–523. https://doi.org/10.1126/science.107591

### 85. Existing `insula` marker is not on the insula
- **Verdict:** NEEDS CORRECTION (model placement). **Confidence:** high.
- See correction C1.

### 86. Marker placement for S2, posterior insula and dorsal horn
- S2 uses MNI (−54, −26, 20) from Lamp et al. 2019, snapped 3.3 mm to `Supramarginal_gyrusl`. The posterior insula uses (−40, −19, 14) from Brooks et al. 2005, snapped 2.2 mm to `Circular_sulcus_of_insulal`.
- The dorsal horn is a stand-in anchor at the lower end of the right medulla, because the spinal cord is not in the atlas. Positions are illustrative.
```


---

## HEARING, EXPANDED (added 2026-09-27)

### 87. Core, belt and parabelt
- **Verdict:** CONFIRMED for macaques; human homologs are supported. **Confidence:** high (monkey), moderate (human borders).
- **Macaque:** The ventral MGN projects in parallel to a core of three areas (AI, R, RT). The core projects to "a surrounding array of eight proposed belt areas". The belt projects to a lateral parabelt "with at least rostral and caudal subdivisions". The parabelt projects to temporal areas and to "four functionally distinct regions of the frontal lobe" (Kaas & Hackett 2000). Tracer injections confined to the parabelt labelled few neurons in the core but large numbers in the belt (Hackett et al. 1998). Chimpanzees and humans have a histochemically similar core.
- **Human:** Pure tones activate primarily the core, and belt areas prefer narrow-band noise (Wessinger et al. 2001). In 13 subjects, tones, band-passed noise and vowels defined three regions resembling core, belt and parabelt in each individual; the vowel regions lay anterior, lateral and ventral to the belt (Chevillet et al. 2011).
- **Refinement:** The hierarchy is not strictly serial. Human intracranial data show the STG receiving speech input in parallel with A1 (entry 37). The draft says so in the belt step.
- **Citations:** Kaas JH, Hackett TA (2000) PNAS 97:11793–11799. https://doi.org/10.1073/pnas.97.22.11793 · Hackett TA, Stepniewska I, Kaas JH (1998) J Comp Neurol 394:475–495. https://pubmed.ncbi.nlm.nih.gov/9590556/ · Wessinger CM et al. (2001) J Cogn Neurosci 13:1–7. https://doi.org/10.1162/089892901564108 · Chevillet M et al. (2011) J Neurosci 31:9345–9352. https://doi.org/10.1523/JNEUROSCI.1448-11.2011

### 88. Belt neurons prefer complex sounds (macaque)
- **Verdict:** CONFIRMED. **Confidence:** high.
- Lateral belt neurons are tuned to the centre frequency and bandwidth of band-passed noise and are selective for the rate and direction of FM sweeps. "Many neurons showed a preference for a limited number of species-specific vocalizations."
- **Citation:** Rauschecker JP, Tian B (2000) PNAS 97:11800–11806. https://doi.org/10.1073/pnas.97.22.11800

### 89. "What" and "where" specialization in the lateral belt (macaque)
- **Verdict:** CONFIRMED (a relative specialization). **Confidence:** high.
- Neurons in the anterior belt (AL) are more selective for call type. Neurons in the caudal belt (CL) show the greatest spatial selectivity. Both kinds of selectivity exist in both areas; the wording says "more selective".
- **Anatomy:** The anterior belt is reciprocally connected with the frontal pole (area 10), rostral principal sulcus (area 46) and ventral prefrontal areas 12 and 45. The caudal belt connects mainly with the caudal principal sulcus (area 46) and the frontal eye fields (area 8a).
- **Citations:** Tian B et al. (2001) Science 292:290–293. https://doi.org/10.1126/science.1058911 · Romanski LM et al. (1999) Nat Neurosci 2:1131–1136. https://doi.org/10.1038/16056

### 90. Human evidence for the two auditory streams, and the debate
- **Verdict:** SUPPORTED, with an active debate about the dorsal stream. **Confidence:** moderate-high.
- **Meta-analysis** (Arnott et al. 2004; 11 spatial and 27 nonspatial fMRI/PET studies): all but one spatial study reported inferior parietal activation, compared with 41% of nonspatial studies. Inferior frontal (BA 45/47) activity appeared in 9% of spatial studies and 56% of nonspatial studies.
- **Lesions** (Clarke et al. 2002; 15 patients with right-hemisphere lesions): four were normal in recognition but severely impaired in localization, and three had difficulty recognizing sounds but localized them well.
- **Debate:** Rauschecker & Scott (2009) state that assigning "an exclusively spatial function to the postero-dorsal auditory stream would be unwise". The planum temporale and inferior parietal cortex are also involved in speech and in sensorimotor transformations. Zatorre et al. (2002, PET) found that posterior auditory cortex responded to spatial variation only when several complex sounds were presented at once, which suggests it separates overlapping sources, while the right inferior parietal cortex was specifically recruited in localization tasks. Hickok & Poeppel's dorsal speech stream (Speech topic) is another reading of the same route. Spatial processing is often right-lateralized (Rauschecker & Scott 2009).
- **Human ventral endpoint:** Rauschecker & Scott (2009, Fig. 3) take the anteroventral stream to inferior frontal cortex, area 45.
- **Citations:** Arnott SR et al. (2004) NeuroImage 22:401–408. https://doi.org/10.1016/j.neuroimage.2004.01.014 · Clarke S et al. (2002) Exp Brain Res 147:8–15. https://doi.org/10.1007/s00221-002-1203-9 · Rauschecker JP, Scott SK (2009) Nat Neurosci 12:718–724. https://doi.org/10.1038/nn.2331 · Zatorre RJ et al. (2002) Nat Neurosci 5:905–909. https://doi.org/10.1038/nn904 · Alain C et al. (2001) PNAS 98:12301–12306. https://doi.org/10.1073/pnas.211209098

### 91. Anterior STG and sound identity
- **Verdict:** CONFIRMED. **Confidence:** moderate-high.
- The meta-analysis covered more than 100 imaging experiments. Phoneme-length speech concentrates in left mid-STG and word-length speech in left anterior STG (DeWitt & Rauschecker 2012). Macaque fMRI found a "voice region" on the anterior superior temporal plane that prefers conspecific calls and is sensitive to individual identity; the authors place it in the anterior "what" pathway (Petkov et al. 2008). In monkeys, clusters of ventrolateral prefrontal neurons encode similar complex calls (as summarized in Rauschecker & Scott 2009).
- **Citations:** DeWitt I, Rauschecker JP (2012) PNAS 109. https://doi.org/10.1073/pnas.1113427109 · Petkov CI et al. (2008) Nat Neurosci 11:367–374. https://doi.org/10.1038/nn2043

### 92. Medial olivocochlear (MOC) anatomy and action
- **Verdict:** CONFIRMED. **Confidence:** high.
- MOC fibres originate in the medial part of the SOC and end on outer hair cells. Activating them inhibits basilar-membrane responses to low-level sounds (Guinan 2006), or "low-to-moderate intensity" sounds (Lopez-Poveda 2018), by reducing cochlear-amplifier gain. LOC fibres come from the lateral superior olive region and end on type I afferent dendrites beneath inner hair cells. The efferents reach the cochlea through the vestibular nerve.
- **Numbers:** Human counts average 1005 LOC fibres and 360 MOC fibres (cat: about 850 LOC, 500 MOC). "In most mammals … the majority of MOC fibers project to the contralateral cochlea." Acetylcholine is the main transmitter. In rats, MOC neurons lie in the ventral nucleus of the trapezoid body (Vetter et al. 1993).
- **Reflex:** Sound in either ear elicits it. In humans it is measured as suppression of otoacoustic emissions by contralateral noise, typically about 1–2 dB (Lauer et al. 2022).
- **Citations:** Guinan JJ (2006) Ear Hear 27:589–607. https://doi.org/10.1097/01.aud.0000240507.83072.e7 · Lopez-Poveda EA (2018) Front Neurol 9. https://doi.org/10.3389/fneur.2018.00197

### 93. MOC functions: noise, protection, hearing in noise
- **Verdict:** Antimasking in animals CONFIRMED (cat). Protection from acoustic trauma CONFIRMED (animals). Benefit for speech in noise in humans CONTESTED. **Confidence:** high / high / moderate.
- In anesthetized or decerebrate cats, contralateral noise that activates the OC reflex raised auditory-nerve discharge rates to masked tone bursts and lowered rates to the masker. The largest effects were in fibres with CFs of 6–12 kHz (Kawase et al. 1993).
- Lauer et al. (2022): protection against damaging noise "is clear"; attempts to show a role in hearing in noise "have yielded conflicting results in both animal and human studies". Lopez-Poveda (2018): human evidence for antimasking is "very controversial"; speech-in-noise recognition is worse in some but not all vestibular-neurectomy patients.
- **Citations:** Kawase T, Delgutte B, Liberman MC (1993) J Neurophysiol 70:2533–2549. https://doi.org/10.1152/jn.1993.70.6.2533 · Lauer AM, Jimenez SV, Delano PH (2022) Hear Res 419:108207. https://doi.org/10.1016/j.heares.2021.108207

### 94. Attention and the cochlea
- **Verdict:** CONFIRMED in chinchillas; INCONSISTENT in humans. **Confidence:** high (animal), moderate (human picture).
- **Chinchilla** (Delano et al. 2007): round-window recordings in a visual discrimination task with irrelevant clicks or tones. The five implanted visual-task animals showed CAP reductions during visual attention, with cochlear-microphonic increases in the two tested. The effects reached "up to 4 dB for CAP reductions and 6 dB for CM increases". They were absent in the auditory-task controls and larger with shorter target lights. Bowen et al. (2020, chinchilla) linked individual OC-reflex strength to performance with auditory distractors.
- **Human, positive:** DPOAE levels fell during visual compared with auditory attention (Wittekindt et al. 2014). In cochlear-implant users (n = 16), theta-band (5–8 Hz) auditory-nerve activity was higher when attending to upcoming sound, and the attended modality could be decoded from single trials (Gehmacher et al. 2022). The authors note that this probably involves a different efferent route from the one measured with OAEs.
- **Human, negative or mixed:** In 30 listeners, SFOAEs were 5.4 dB weaker during visual attention in the first 15 but showed no effect in the second 15. The pooled effect was 2.48 dB, with 12 of 30 individually significant (Beim et al. 2018). No systematic effect appeared across 45 listeners (Beim et al. 2019) or with visual oddball attention (Jedrzejczak et al. 2017). Ear-canal noise fell during a task because subjects moved less, a confound for OAE-based attention studies (Francis et al. 2018).
- **Wording used:** "In people, one study measured sounds emitted by the ear: they were 5.4 dB weaker during visual attention in 15 listeners, with no effect in the next 15."
- **Citations:** Delano PH et al. (2007) J Neurosci 27:4146–4153. https://doi.org/10.1523/JNEUROSCI.3702-06.2007 · Wittekindt A et al. (2014) J Neurosci 34:9995–10002. https://doi.org/10.1523/JNEUROSCI.4861-13.2014 · Beim JA et al. (2018) JASA 144:2882–2895. https://doi.org/10.1121/1.5079311 · Beim JA et al. (2019) JASA 146:1475–1491. https://doi.org/10.1121/1.5123391 · Jedrzejczak WW et al. (2017) PeerJ 5:e4199. https://doi.org/10.7717/peerj.4199 · Francis NA et al. (2018) Front Syst Neurosci 12. https://doi.org/10.3389/fnsys.2018.00042 · Gehmacher Q et al. (2022) J Neurosci 42:1343–1351. https://doi.org/10.1523/JNEUROSCI.0665-21.2021 · Bowen M et al. (2020) Sci Rep. https://doi.org/10.1038/s41598-020-71399-8

### 95. Descending routes from cortex to the MOC neurons
- **Verdict:** CONFIRMED (animal anatomy and stimulation). **Confidence:** moderate-high.
- In rats, corticofugal terminals contact MOC neurons in the VNTB (Mulders & Robertson 2000). Also in rats, inferior colliculus axons densely innervate the VNTB and appose crossed and uncrossed MOC neurons; the projection is largely ipsilateral (Vetter et al. 1993). In chinchillas, auditory-cortex microstimulation changed cochlear microphonics and CAPs and changed OC-reflex strength independently (Dragicevic et al. 2015). The same abstract states that the cortex projects to the thalamus, IC, cochlear nucleus and SOC.
- **Citations:** Mulders WH, Robertson D (2000) Hear Res 144:65–72. https://doi.org/10.1016/S0378-5955(00)00046-0 · Vetter DE, Saldaña E, Mugnaini E (1993) Hear Res 70:173–186. https://doi.org/10.1016/0378-5955(93)90156-U · Dragicevic CD et al. (2015) JARO 16:223–240. https://doi.org/10.1007/s10162-015-0509-9

### 96. Marker placement for `belt` and `astg`
- The atlas does not segment these areas, so I followed entry 57.
  - `belt`: Talairach (−56, −19, 3) from Chevillet et al. (2011, Table 2, left vowels > noise, "within our reported parabelt region") → MNI ≈ (−57, −20, 2) → `Superior_temporal_gyrus_(Lateral_part)l`, snapped 1.2 mm.
  - `astg`: Talairach (−56, −10, −4) from DeWitt & Rauschecker (2012, Table 1, repetition-suppression word-length left STG peak) → MNI ≈ (−57, −10, −5) → same mesh, snapped 2.4 mm.
- Talairach→MNI used the inverse of Brett's mni2tal. The matrix is from memory; its error of about 1–3 mm is smaller than the box mapping and the snapping. Positions are illustrative.

### 97. Prestin 40–60 dB is a mouse figure
- **Verdict:** NEEDS SCOPE in the `cochlea` guide. **Confidence:** high.
- The 40–60 dB loss of sensitivity comes from prestin-knockout mice (entry 25). The guide states it without species. New wording: "mice lacking prestin, the protein that drives this movement, lose 40–60 dB of sensitivity."

---

## CORTEX–THALAMUS FEEDBACK: LAYER 5 ROUTE (added 2026-09-27)

### 98. Layer 5 → higher-order thalamus: drivers and branching axons
- **Verdict:** CONFIRMED as the mainstream framework (this extends entry 5). **Confidence:** moderate-high.
- First-order relays receive subcortical drivers (retina → LGN). Higher-order relays such as the pulvinar receive driver input from layer 5 and take part in transthalamic circuits. Direct corticocortical connections "are often paralleled by transthalamic ones". Driver inputs arrive on branching axons whose other branch "often innervates subcortical motor centers", which led to the efference-copy proposal (Sherman 2016). Drivers are few per cell and act through ionotropic receptors; modulators are many and also act through metabotropic receptors (Sherman & Guillery 1998).
- **Species:** Sherman & Usrey (2024): "the vast majority of evidence for transthalamic processing derives from studies of sensory processing in mice". In cats and monkeys, morphological studies show layer 5 inputs to higher-order nuclei with large terminals "consistent with a driver function". In macaques, corticopulvinar axons from occipitotemporal cortex come in two types: a majority with many small endings, and some with 70–160 large beaded endings (Rockland 1996). Layer 5 thalamus-projecting cells are among the largest pyramidal cells. Many or most of the layer 5 axons that reach the thalamus also branch to subcortical motor centres (mouse motor-cortex data).
- **Citations:** Sherman SM (2016) Nat Neurosci 19:533–541. https://doi.org/10.1038/nn.4269 · Sherman SM, Guillery RW (1998) PNAS 95:7121–7126. https://doi.org/10.1073/pnas.95.12.7121 · Sherman SM, Usrey WM (2024) J Neurosci 44:e0909242024. https://doi.org/10.1523/JNEUROSCI.0909-24.2024 · Rockland KS (1996) J Comp Neurol 368:57–87. https://pubmed.ncbi.nlm.nih.gov/8725294/

### 99. Mo, McKinnon & Sherman 2024 (mouse)
- **Verdict:** CONFIRMED. **Confidence:** high.
- **Methods:** Rbp4-Cre mice with the inhibitory opsin Jaws in S1 layer 5. A 633 nm laser through an optic fibre in anterior-dorsal POm suppressed the S1 L5 → POm terminals. The task was head-fixed go/no-go texture discrimination with the whiskers; the main behavioural sample was 9 mice.
- **Results:** Inhibition during texture presentation "severely impaired performance despite intact direct corticocortical projections", raising error, lapse and guess rates. Inhibition during the delay period also impaired performance, but less. Detection was also affected (threshold shift). Two-photon imaging of layer 2/3 showed that overall responsiveness was not reduced, but texture selectivity was disrupted, more in S2 than in S1.
- **Limits noted by the authors:** Rbp4-Cre does not label all layer 5 cells, and Jaws efficiency is incomplete.
- **Note:** This is the touch (whisker) system of mice, not vision. The step fact says so.
- **Citation:** Mo C, McKinnon C, Sherman SM (2024) Nat Commun 15. https://doi.org/10.1038/s41467-024-50163-w (PMC11282105)

### 100. Supporting evidence for transthalamic routes
- **Verdict:** CONFIRMED (mouse). **Confidence:** high.
- **Slices** (Theyel et al. 2010): with the direct S1 → S2 path cut, S2 still responded to S1 stimulation. The response disappeared after cutting the thalamus and after chemically inhibiting it, returning after washout. Stimulating layer 5B, and not layer 6, drove the corticothalamocortical activation.
- **Visual system** (Blot et al. 2021): mouse LP neurons projecting to higher visual areas likely combine feedforward V1 input with input from many areas, including the superior colliculus. Their signals are tuned to specific stimulus features and locomotor context, and differ from direct V1 projections.
- **Citations:** Theyel BB, Llano DA, Sherman SM (2010) Nat Neurosci 13:84–88. https://doi.org/10.1038/nn.2449 · Blot A et al. (2021) Neuron 109:1996–2008. https://doi.org/10.1016/j.neuron.2021.04.017

### 101. Depth of layers 5 and 6 ("a few millimetres below the surface")
- **Verdict:** NEEDS CORRECTION (minor). **Confidence:** high.
- Human cortex is 1–4.5 mm thick, averaging about 2.5 mm. Sensory areas are among the thinnest, and sulcal regions average 2.2 ± 0.3 mm (Fischl & Dale 2000). V1 lies largely in the calcarine sulcus, so layers 5 and 6 are within about 2 mm of the surface. New wording: "within about 2 millimetres of the surface".
- **Citation:** Fischl B, Dale AM (2000) PNAS 97:11050–11055. https://doi.org/10.1073/pnas.200033797

---

## INDEPENDENT ACCURACY AUDIT (2026-09-28)

Six reviewers who had not written the content re-checked every factual statement against the cited papers (Crossref for DOIs; Europe PMC or open full text for claims). Their full reports, with the evidence and replacement text for each finding, are in [`docs/audits/`](audits/). All findings were applied except where noted in the reports' own "not verified" sections.

| Section | Statements checked | Findings | Wrong | Key corrections |
| --- | --- | --- | --- | --- |
| Vision | ~248 | 31 | 1 | Optic nerves carry signals one way; LGN synapse proportions are from cats; IT keeps object preference, not response size; debated models (two streams, Haxby, third pathway, EBA) stated as proposals. |
| Attention | ~208 | 31 | 1 | Parietal highlight now includes the intraparietal sulcus; cross-sense normalization is an illustration; TPJ circuit breaker, conflict monitoring and persistent PFC activity stated with the disagreement. |
| Touch | ~175 | 18 | 2 | Pain from insula stimulation is not limited to the posterior insula; the VPL feeds mainly S1 areas 3b and 1; neglect sites and their debate. |
| Hearing and feedback | ~296 | 41 | 1 | Belt highlight scope; layer 6 as a modulator (it does carry visual signals); the 2024 awake-mouse result; A1 extent and tonotopic orientation debated. |
| Speech | 89 | 29 | 3 | Broca's area is active after a heard word and silent during speaking; the middle precentral gyrus lies higher and further back; Spt lies in the planum temporale. |
| Site-wide text | ~530 | 42 | 6 | The superior colliculus and planum temporale exist in the atlas and are now loaded; signal-speed comparison corrected; source notes and region locations. |

The site-wide audit also found that the atlas includes meshes this model had not loaded. `scripts/prepare-atlas.mjs` now adds the planum temporale, the inferior temporal and parahippocampal gyri and the superior colliculi, after the cerebrum bounds and all point sampling, so every earlier mesh and placement is byte-identical. Area Spt now sits at the back of the planum temporale and the superior colliculus uses its own mesh.

