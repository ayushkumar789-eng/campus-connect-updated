/**
 * Typed-ish wrappers around the REST API. Components call these instead of
 * touching axios directly, so endpoint paths live in exactly one place.
 */
import { api } from './client.js';

const unwrap = (promise) => promise.then((r) => r.data?.data ?? null);
const unwrapAll = (promise) => promise.then((r) => r.data);

/**
 * Normalises a paginated response into `{ data, pagination, ...rest }`.
 *
 * The API returns the rows under `data` and the cursor block as a sibling
 * `pagination` key. Paginated lists are consumed everywhere as
 * `page.data` / `page.pagination`, so the envelope is flattened here once
 * rather than at every call site — otherwise `flatMap(p => p.data)` silently
 * iterates an object instead of the rows.
 */
const paginated = (promise) =>
  promise.then((r) => {
    const body = r.data ?? {};
    return { data: body.data ?? [], pagination: body.pagination ?? {}, ...body };
  });

// ── Auth ──────────────────────────────────────────────────────────────────
// ── Users ─────────────────────────────────────────────────────────────────
// ── Posts ─────────────────────────────────────────────────────────────────
// ── Notes ──────────────────────────────────────────────────────────────────
export const notesApi = {
  list: (params) => paginated(api.get('/notes', { params })),
  get: (id) => unwrap(api.get(`/notes/${id}`)),
  create: (payload) => 
    api.post('/notes', payload, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  update: (id, payload) => {
    if (payload instanceof FormData) {
      return api.put(`/notes/${id}`, payload, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
    }
    return api.put(`/notes/${id}`, payload).then((r) => r.data);
  },
  delete: (id) => api.delete(`/notes/${id}`).then((r) => r.data),
  download: (id) => api.post(`/notes/${id}/download`).then((r) => r.data),
};

// ── Groups ─────────────────────────────────────────────────────────────────
export const groupsApi = {
  list: (params) => paginated(api.get('/groups', { params })),
  get: (id) => unwrap(api.get(`/groups/${id}`)),
  create: (payload) => api.post('/groups', payload, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  update: (id, payload) => {
    if (payload instanceof FormData) {
      return api.put(`/groups/${id}`, payload, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
    }
    return api.put(`/groups/${id}`, payload).then((r) => r.data);
  },
  remove: (id) => api.delete(`/groups/${id}`).then((r) => r.data),
  posts: (id, params) => paginated(api.get(`/groups/${id}/posts`, { params })),
  members: (id, params) => paginated(api.get(`/groups/${id}/members`, { params })),
  join: (id) => api.post(`/groups/${id}/join`).then((r) => r.data),
  leave: (id) => api.post(`/groups/${id}/leave`).then((r) => r.data),
  updateRole: (groupId, userId, role) => api.put(`/groups/${groupId}/members/${userId}`, { role }).then((r) => r.data),
  removeMember: (groupId, userId) => api.delete(`/groups/${groupId}/members/${userId}`).then((r) => r.data),
};

// ── Search ────────────────────────────────────────────────────────────────
// ── Notifications ─────────────────────────────────────────────────────────
export const notificationsApi = {
  list: ({ cursor, limit = 20, unreadOnly = false } = {}) =>
    paginated(api.get('/notifications', { params: { cursor, limit, ...(unreadOnly ? { unread: 1 } : {}) } })),
  unreadCount: () => unwrap(api.get('/notifications/unread-count')),
  markRead: (id) => api.patch(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.patch('/notifications/read-all').then((r) => r.data),
};

// ── Discussions ───────────────────────────────────────────────────────────
export const discussionsApi = {
  list: (params) => paginated(api.get('/discussions', { params })),
  get: (id) => unwrap(api.get(`/discussions/${id}`)),
  create: (payload) => api.post('/discussions', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/discussions/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/discussions/${id}`).then((r) => r.data),
  vote: (id, value) => api.post(`/discussions/${id}/vote`, { value }).then((r) => r.data),
  comments: (id, params) => paginated(api.get(`/discussions/${id}/comments`, { params })),
  createComment: (id, payload) => api.post(`/discussions/${id}/comments`, payload).then((r) => r.data),
  updateComment: (id, payload) => api.put(`/discussions/comments/${id}`, payload).then((r) => r.data),
  removeComment: (id) => api.delete(`/discussions/comments/${id}`).then((r) => r.data),
  voteComment: (id, value) => api.post(`/discussions/comments/${id}/vote`, { value }).then((r) => r.data),
  markAnswer: (discussionId, commentId) => api.put(`/discussions/${discussionId}/answer/${commentId}`).then((r) => r.data),
};

// ── Messages ──────────────────────────────────────────────────────────────
export const messagesApi = {
  listConversations: (params) => paginated(api.get('/conversations', { params })),
  getConversation: (id) => unwrap(api.get(`/conversations/${id}`)),
  createConversation: (payload) => unwrap(api.post('/conversations', payload)),
  listMessages: (id, params) => paginated(api.get(`/conversations/${id}/messages`, { params })),
  createMessage: (id, payload) => unwrap(api.post(`/conversations/${id}/messages`, payload)),
  markRead: (id) => unwrap(api.post(`/conversations/${id}/messages/read`)),
};

// ── Events ──────────────────────────────────────────────────────────────────
export { unwrapAll, unwrap, paginated };
