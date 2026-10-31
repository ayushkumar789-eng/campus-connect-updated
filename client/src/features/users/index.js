import { api } from '../../shared/api/client.js';
import { unwrap, paginated } from '../../shared/api/endpoints.js';

export const usersApi = {
  get: (idOrUsername) => unwrap(api.get(`/users/${idOrUsername}`)),
  // Paginated: the directory must never load the whole user collection.
  list: (params) => paginated(api.get('/users', { params })),
  suggested: () => unwrap(api.get('/users/suggested')),
  posts: (idOrUsername, { cursor, limit = 12 } = {}) =>
    paginated(api.get(`/users/${idOrUsername}/posts`, { params: { cursor, limit } })),
  connections: (idOrUsername, direction, { cursor, limit = 20 } = {}) =>
    paginated(api.get(`/users/${idOrUsername}/${direction}`, { params: { cursor, limit } })),
  follow: (idOrUsername) => api.post(`/users/${idOrUsername}/follow`).then((r) => r.data),
  unfollow: (idOrUsername) => api.delete(`/users/${idOrUsername}/follow`).then((r) => r.data),
  /**
   * `PUT /users/:id` — the same operation as `authApi.updateProfile`, reached
   * by id. Kept because the route is owner- or admin-gated server-side, which
   * is the surface a moderation tool would call.
   *
   * Returns the envelope, matching `authApi` and `usersApi` generally.
   */
  update: (idOrUsername, payload) => {
    if (payload instanceof FormData) {
      return api
        .put(`/users/${idOrUsername}`, payload, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((r) => r.data);
    }
    return api.put(`/users/${idOrUsername}`, payload).then((r) => r.data);
  },
};


