import { api } from '../../shared/api/client.js';
import { unwrap } from '../../shared/api/endpoints.js';

export const searchApi = {
  query: (q, signal) => unwrap(api.get('/search', { params: { q }, signal })),
};
