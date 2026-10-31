import { api } from '../../shared/api/client.js';
import { unwrap, paginated } from '../../shared/api/endpoints.js';

export const postsApi = {
  feed: ({ cursor, limit = 10, scope = 'following' } = {}) =>
    paginated(api.get('/posts/feed', { params: { cursor, limit, scope } })),
  get: (id) => unwrap(api.get(`/posts/${id}`)),
  create: (formData) =>
    api.post('/posts', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  update: (id, content) => api.put(`/posts/${id}`, { content }).then((r) => r.data),
  remove: (id) => api.delete(`/posts/${id}`).then((r) => r.data),
  like: (id) => api.post(`/posts/${id}/like`).then((r) => r.data),
  save: (id) => api.post(`/posts/${id}/save`).then((r) => r.data),
  share: (id) => api.post(`/posts/${id}/share`).then((r) => r.data),
  vote: (id, optionId) => api.post(`/posts/${id}/vote`, { optionId }).then((r) => r.data),
  comments: (id, { cursor, limit = 10 } = {}) =>
    paginated(api.get(`/posts/${id}/comments`, { params: { cursor, limit } })),
  addComment: (id, payload) => api.post(`/posts/${id}/comments`, payload).then((r) => r.data),
  deleteComment: (id) => api.delete(`/comments/${id}`).then((r) => r.data),
  saved: ({ cursor, limit = 10 } = {}) => paginated(api.get('/posts/saved', { params: { cursor, limit } })),
  report: (payload) => api.post('/reports', payload).then((r) => r.data),
};
