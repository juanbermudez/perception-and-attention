// Shared zod pieces for tool inputs. Enums come from content, never from hard-coded lists.
import * as z from "zod";
import type { RegionId } from "../content/types";
import { REGION_IDS } from "../model/refs";
import { LIST_LIMIT, SEARCH_LIMIT } from "./help";

export const refField = (description: string) => z.string().trim().min(1).max(200).describe(description);
/** For fields that accept only regions: bare ids, not refs (spec §5.1). */
export const regionIdSchema = z.enum(REGION_IDS as [RegionId, ...RegionId[]]);
export const listLimit = z.number().int().min(1).max(LIST_LIMIT.max).describe(`Default ${LIST_LIMIT.default}`);
export const searchLimit = z.number().int().min(1).max(SEARCH_LIMIT.max).describe(`Default ${SEARCH_LIMIT.default}`);
