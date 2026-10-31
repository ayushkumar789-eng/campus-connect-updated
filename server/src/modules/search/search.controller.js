import { asyncHandler } from '../../utils/asyncHandler.js';
import { globalSearch } from './search.service.js';

const viewerId = (req) => req.user?._id ?? null;

/** GET /api/search?q= */
export const search = asyncHandler(async (req, res) => {
  const result = await globalSearch(req.query.q, viewerId(req), Number(req.query.limit) || 8);
  res.json({ success: true, data: result });
});

