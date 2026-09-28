import { viewPatchSchema } from "../schemas";
import { defineTool } from "../webmcp";

export const setViewTool = defineTool({
  name: "set_view",
  title: "Change the 3D view",
  description:
    "Change the 3D brain view in one call: camera (focus a region, frame several, a side, yaw/pitch/orbit, zoom), layer presence with dissolve or fade, isolate regions, and labels. Only the fields you pass change. Returns the resulting view and a one-line summary; the user can undo it. While the user is moving the view, the camera part returns locked_by_user and the rest still applies.",
  readOnly: false,
  input: viewPatchSchema,
  run: (input, api) => api.setView(input),
});
