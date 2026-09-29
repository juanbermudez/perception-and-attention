import * as z from "zod";
import { TOUR_LIMITS } from "../../api/tour";
import { tourStopSchema } from "../schemas";
import { defineTool } from "../webmcp";

export const startTourTool = defineTool({
  name: "start_tour",
  title: "Play a narrated tour",
  description:
    'Play your own narrated tour: stops in order, each going to a place (ref), applying a set_view patch (view) and captioning it (say) for its seconds. Use it to explain across places in your own words; walkthrough plays built-in steps. User input pauses it; walkthrough\'s pause, play, next, prev, restart and stop control it. Example: {"stops":[{"ref":"region:lgn","say":"The LGN relays the eye."},{"ref":"region:v1","view":{"isolate":["lgn","v1"]},"say":"V1, the first cortical stop.","seconds":8}]}',
  readOnly: false,
  input: z.strictObject({
    stops: z.array(tourStopSchema).min(1).max(TOUR_LIMITS.stops).describe(`1–${TOUR_LIMITS.stops} stops, played in order`),
    seconds: z
      .number()
      .min(TOUR_LIMITS.seconds.min)
      .max(TOUR_LIMITS.seconds.max)
      .optional()
      .describe(`Seconds per stop for stops without their own, default ${TOUR_LIMITS.seconds.default}`),
  }),
  run: (input, api) => api.tour(input),
});
