import { api } from '../../shared/api/client.js';
import { unwrap, unwrapAll, paginated } from '../../shared/api/endpoints.js';

export const eventsApi = {
  list: (params) => paginated(api.get('/events', { params })),
  get: (id) => unwrap(api.get(`/events/${id}`)),
  create: (payload) => {
    if (payload instanceof FormData) {
      return unwrapAll(api.post('/events', payload, { headers: { 'Content-Type': 'multipart/form-data' } }));
    }
    return unwrapAll(api.post('/events', payload));
  },
  update: (id, payload) => {
    if (payload instanceof FormData) {
      return unwrapAll(api.put(`/events/${id}`, payload, { headers: { 'Content-Type': 'multipart/form-data' } }));
    }
    return unwrapAll(api.put(`/events/${id}`, payload));
  },
  remove: (id) => api.delete(`/events/${id}`).then((r) => r.data),
  register: (id) => unwrapAll(api.post(`/events/${id}/register`)),
  unregister: (id) => api.delete(`/events/${id}/register`).then((r) => r.data),
  attendees: (id, params) => paginated(api.get(`/events/${id}/attendees`, { params })),
  registration: (id) => unwrap(api.get(`/events/${id}/registration`)),
};
