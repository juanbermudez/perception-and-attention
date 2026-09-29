import { viewPatchSchema } from "../schemas";
import { defineTool } from "../webmcp";

export const setViewTool = defineTool({
  name: "set_view",
  title: "Change the 3D view",
  description:
    'Change only the 3D brain view; the page text stays (go shows a region with its text). One call sets camera, layers (dissolve or fade), isolate and labels; only given fields change. Returns the view and a summary; the user can undo. While the user drags, the camera part returns locked_by_user. Examples: {"camera":{"focus":"ffa"}} · {"camera":{"frame":["lgn","v1"],"from":"left"},"layers":{"skull":0},"isolate":["lgn","v1"]} · {"isolate":null,"layers":{"skull":1},"labels":"auto"} (ends an isolate)',
  readOnly: false,
  input: viewPatchSchema,
  run: (input, api) => api.setView(input),
});
