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
