import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// Every API object this module touches must be imported here. A hook that
// references an undeclared `postsApi` does not fail at build time — Rollup
// treats an unknown identifier as a global and emits the bundle happily — it
// fails at runtime with a ReferenceError the moment that query first fetches.
// Five were missing (`postsApi`, `searchApi`, `eventsApi`, `notificationsApi`,
// `notesApi`), which silently broke the feed, saved posts, search, events,
// notes and notifications while `npm run build` stayed green.
import { groupsApi, discussionsApi, messagesApi, notificationsApi, notesApi } from '../api/endpoints.js';
import { usersApi } from '../../features/users/index.js';
import { postsApi } from '../../features/posts/index.js';
import { searchApi } from '../../features/search/index.js';
import { eventsApi } from '../../features/events/index.js';
import { errorMessage } from '../api/client.js';
import { toast } from '../ui/Toast.jsx';

/**
 * Shared cache keys so invalidation stays consistent across the app.
 *
 * These are a namespace, not just labels: TanStack matches `invalidateQueries`
 * and `setQueriesData` by *prefix*, and it keys the cache by the array. Two
 * different `useQuery` shapes must therefore never share a prefix, or a plain
 * query can hand its payload to an infinite observer (which reads
 * `data.pages`) and crash the render. Every branch below is a distinct root.
 */
export const keys = {
  feed: (scope) => ['feed', scope],
  saved: ['posts', 'saved'],
  post: (id) => ['post', id],
  comments: (id) => ['comments', id],
  profile: (id) => ['profile', id],
  userPosts: (id, group) => ['profile-posts', id, group ?? 'all'],
  connections: (id, dir) => ['connections', id, dir],
  search: (q) => ['search', q],
  // Paged directory, keyed by every filter so switching course or text does not
  // reuse another filter's page stack.
  directory: (params) => ['users', 'directory', params],
  suggested: ['users', 'suggested'],
  notifications: ['notifications-list'],
  unreadCount: ['notifications-unread'],
  notes: (params) => ['notes', 'list', params],
  note: (id) => ['notes', 'detail', id],
  groups: (params) => ['groups', 'list', params],
  group: (id) => ['groups', 'detail', id],
  groupPosts: (id) => ['groups', 'posts', id],
  groupMembers: (id) => ['groups', 'members', id],
  discussions: (params) => ['discussions', 'list', params],
  discussion: (id) => ['discussions', 'detail', id],
  discussionComments: (id) => ['discussions', 'comments', id],
  events: (params) => ['events', 'list', params],
  event: (id) => ['events', 'detail', id],
  eventAttendees: (id, params) => ['events', 'attendees', id, params],
  eventRegistration: (id) => ['events', 'registration', id],
};

// ── Feed ──────────────────────────────────────────────────────────────────

/**
 * Home feed with cursor pagination. Keyed by scope so switching between
 * "Following" and "All" keeps its own independent page stack.
 */
export function useFeed(scope = 'following') {
  return useInfiniteQuery({
    queryKey: keys.feed(scope),
    queryFn: ({ pageParam }) => postsApi.feed({ cursor: pageParam, scope, limit: 10 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
    staleTime: 30_000,
  });
}

export function useSavedPosts(enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.saved,
    queryFn: ({ pageParam }) => postsApi.saved({ cursor: pageParam, limit: 10 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
    enabled,
  });
}

export function useUserPosts(idOrUsername) {
  return useInfiniteQuery({
    queryKey: keys.userPosts(idOrUsername),
    queryFn: ({ pageParam }) => usersApi.posts(idOrUsername, { cursor: pageParam, limit: 12 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
    enabled: Boolean(idOrUsername),
  });
}

export function usePost(id) {
  return useQuery({
    queryKey: keys.post(id),
    queryFn: () => postsApi.get(id),
    enabled: Boolean(id),
  });
}

// ── Profile ───────────────────────────────────────────────────────────────

export function useProfile(idOrUsername) {
  return useQuery({
    queryKey: keys.profile(idOrUsername),
    queryFn: () => usersApi.get(idOrUsername),
    enabled: Boolean(idOrUsername),
    staleTime: 60_000,
  });
}

export function useConnections(idOrUsername, direction) {
  return useInfiniteQuery({
    queryKey: keys.connections(idOrUsername, direction),
    queryFn: ({ pageParam }) => usersApi.connections(idOrUsername, direction, { cursor: pageParam, limit: 20 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
    enabled: Boolean(idOrUsername) && Boolean(direction),
  });
}

export function useSuggestedUsers() {
  return useQuery({
    queryKey: keys.suggested,
    queryFn: () => usersApi.suggested(),
    staleTime: 5 * 60_000,
  });
}

/**
 * Paginated student directory.
 *
 * Deliberately an infinite query over the server's own pagination rather than
 * a client-side filter of a full user list: the collection is never loaded into
 * the browser, and the same search-as-you-type field stays fast as the
 * directory grows.
 *
 * @param {{ search?: string, course?: string, year?: string|number, college?: string, skill?: string, sort?: string }} filters
 */
export function useDirectory(filters = {}) {
  const { search = '', course = '', year = '', college = '', skill = '', sort } = filters;

  return useInfiniteQuery({
    queryKey: keys.directory({ search, course, year, college, skill, sort }),
    queryFn: ({ pageParam }) =>
      usersApi.list({
        search: search || undefined,
        course: course || undefined,
        year: year || undefined,
        college: college || undefined,
        skill: skill || undefined,
        sort,
        cursor: pageParam,
        limit: 20,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) =>
      lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
    // Debounced upstream, so a fast typist does not fire a query per keystroke.
    staleTime: 60_000,
  });
}

// ── Search ────────────────────────────────────────────────────────────────

export function useSearch(query) {
  return useQuery({
    queryKey: keys.search(query),
    queryFn: ({ signal }) => searchApi.query(query, signal),
    enabled: query.trim().length >= 2,
    // Keeps the previous results visible while the next query is in flight.
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

// ── Comments ──────────────────────────────────────────────────────────────

export function useComments(postId, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.comments(postId),
    queryFn: ({ pageParam }) => postsApi.comments(postId, { cursor: pageParam, limit: 10 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
    enabled: Boolean(postId) && enabled,
  });
}

// ── Notifications ─────────────────────────────────────────────────────────

export function useNotifications(unreadOnly = false) {
  return useInfiniteQuery({
    queryKey: [...keys.notifications, unreadOnly ? 'unread' : 'all'],
    queryFn: ({ pageParam }) => notificationsApi.list({ cursor: pageParam, unreadOnly }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
    staleTime: 20_000,
  });
}

/** Unread total for the bell badge. Polled while the tab is visible. */
export function useUnreadCount(enabled = true) {
  const { data } = useQuery({
    queryKey: keys.unreadCount,
    queryFn: () => notificationsApi.unreadCount(),
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  return data?.count ?? 0;
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }) => (id ? notificationsApi.markRead(id) : notificationsApi.markAllRead()),
    onSuccess: (_res, { id }) => {
      // Patch in place so the row does not visually jump before the refetch.
      const setRead = (n) => (id && n.id !== id ? n : { ...n, read: true });

      queryClient.setQueriesData({ queryKey: keys.notifications }, patchInfinitePages(setRead));
      queryClient.invalidateQueries({ queryKey: keys.unreadCount });
      queryClient.invalidateQueries({ queryKey: keys.notifications });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not update notifications.')),
  });
}

// ── Optimistic mutations ──────────────────────────────────────────────────

/**
 * Rewrites the rows of every page in a `useInfiniteQuery` cache entry.
 *
 * The updater MUST return the full `{ pages, pageParams }` envelope, not the
 * mapped page array. TanStack reads `data.pages` on every observer update to
 * compute `hasNextPage`; handing it a bare array strips `.pages` and the very
 * next render throws `Cannot read properties of undefined (reading 'length')`
 * — taking the whole screen down. Passing a non-infinite cache entry through
 * unchanged keeps `setQueriesData({ queryKey: ['feed'] })` safe.
 *
 * @param {(post: object) => object} patch
 * @returns {(data: { pages?: object[], pageParams?: unknown[] } | undefined) => unknown}
 */
const patchInfinitePages = (patch) => (data) => {
  if (!Array.isArray(data?.pages)) return data;
  return { ...data, pages: data.pages.map((page) => ({ ...page, data: page.data.map(patch) })) };
};

/** Same contract as {@link patchInfinitePages}, for removing a row. */
const removeFromInfinitePages = (predicate) => (data) => {
  if (!Array.isArray(data?.pages)) return data;
  return { ...data, pages: data.pages.map((page) => ({ ...page, data: page.data.filter(predicate) })) };
};

/**
 * Likes a post optimistically. The server response is authoritative, so a
 * failed request rolls the cache back and surfaces a toast.
 */
export function useToggleLike() {
  const queryClient = useQueryClient();

  return useMutation({
    // The server endpoint is a toggle, so the current state is only needed for
    // the optimistic guess — never to decide which call to make.
    mutationFn: ({ postId }) => postsApi.like(postId),
    onMutate: async ({ postId, isLiked }) => {
      await queryClient.cancelQueries({ queryKey: keys.post(postId) });
      const snapshots = queryClient.getQueriesData({ queryKey: ['feed'] });
      const savedSnapshots = queryClient.getQueriesData({ queryKey: keys.saved });

      const patch = patchInfinitePages((post) =>
        post?.id === postId
          ? { ...post, isLiked: !isLiked, likeCount: Math.max(0, (post.likeCount ?? 0) + (isLiked ? -1 : 1)) }
          : post,
      );

      queryClient.setQueriesData({ queryKey: ['feed'] }, patch);
      queryClient.setQueriesData({ queryKey: keys.saved }, patch);
      return { snapshots, savedSnapshots };
    },
    onError: (_err, _vars, context) => {
      for (const [key, value] of context?.snapshots ?? []) queryClient.setQueryData(key, value);
      for (const [key, value] of context?.savedSnapshots ?? []) queryClient.setQueryData(key, value);
      toast.error('Could not update the like. Check your connection.');
    },
    onSettled: (_data, _err, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: keys.saved });
      queryClient.invalidateQueries({ queryKey: keys.post(postId) });
    },
  });
}

export function useToggleSave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId }) => postsApi.save(postId),
    onSuccess: (res, { postId }) => {
      const saved = res.data.saved;
      const patch = patchInfinitePages((post) => (post?.id === postId ? { ...post, isSaved: saved } : post));

      queryClient.setQueriesData({ queryKey: ['feed'] }, patch);
      queryClient.setQueriesData({ queryKey: keys.saved }, patch);
      // The detail page caches a bare post rather than a page of them, so
      // `patchInfinitePages` passes it straight through untouched. Without
      // this the bookmark button on a post page never moved, and the click
      // looked like it had done nothing.
      queryClient.setQueriesData({ queryKey: keys.post(postId) }, (post) =>
        post ? { ...post, isSaved: saved } : post,
      );

      // Un-bookmarking has to take the row *out* of the bookmarks list, not
      // just flip its flag. Patching alone left the card sitting there
      // reading "Save post" inside the page called Saved, and the empty state
      // could never show because the list still had a row in it.
      if (!saved) {
        const remove = removeFromInfinitePages((p) => p.id !== postId);
        queryClient.setQueriesData({ queryKey: keys.saved }, remove);
      }

      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: keys.saved });
      queryClient.invalidateQueries({ queryKey: keys.post(postId) });
      toast.success(saved ? 'Saved to your bookmarks' : 'Removed from bookmarks');
    },
    onError: () => toast.error('Could not update your bookmarks.'),
  });
}

export function useSharePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId }) => postsApi.share(postId),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Post shared — link copied to clipboard');
      } catch {
        toast.success('Post shared');
      }
    },
    onError: () => toast.error('Could not share that post.'),
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId }) => postsApi.remove(postId),
    onSuccess: (_res, { postId }) => {
      // Remove it from every list that might contain it.
      const remove = removeFromInfinitePages((p) => p.id !== postId);
      queryClient.setQueriesData({ queryKey: ['feed'] }, remove);
      queryClient.setQueriesData({ queryKey: keys.saved }, remove);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: keys.saved });
      toast.success('Post deleted');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not delete that post.')),
  });
}

export function useUpdatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, content }) => postsApi.update(postId, content),
    onSuccess: (res, { postId }) => {
      // A post body shows up in the feed, on the detail page, on the author's
      // profile and in Saved, so patch the ones already cached and let the
      // rest refetch.
      const patch = patchInfinitePages((post) =>
        post.id === postId ? { ...post, ...res.data, editedAt: res.data.editedAt } : post,
      );
      queryClient.setQueriesData({ queryKey: ['feed'] }, patch);
      queryClient.setQueriesData({ queryKey: keys.saved }, patch);
      queryClient.setQueriesData({ queryKey: keys.post(postId) }, (post) => ({ ...post, ...res.data }));
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Post updated');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not update that post.')),
  });
}

export function useAddComment(postId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => postsApi.addComment(postId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.comments(postId) });
      // The post detail header reads `commentCount` off the post itself, so the
      // single-post query has to be refetched too or the tally goes stale.
      queryClient.invalidateQueries({ queryKey: keys.post(postId) });
      queryClient.invalidateQueries({ queryKey: keys.feed('following') });
      queryClient.invalidateQueries({ queryKey: keys.feed('all') });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not post that comment.')),
  });
}

export function useFollow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isFollowing }) => (isFollowing ? usersApi.unfollow(id) : usersApi.follow(id)),
    onSuccess: (res, { id }) => {
      queryClient.invalidateQueries({ queryKey: keys.profile(id) });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: keys.suggested });
      toast.success(res.message);
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not update follow.')),
  });
}

// ── Notes ─────────────────────────────────────────────────────────────────

export function useNotes(params = {}) {
  return useInfiniteQuery({
    queryKey: keys.notes(params),
    queryFn: ({ pageParam }) => notesApi.list({ ...params, cursor: pageParam, limit: 12 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined),
    staleTime: 30_000,
  });
}

export function useNote(id) {
  return useQuery({
    queryKey: keys.note(id),
    queryFn: () => notesApi.get(id),
    enabled: Boolean(id),
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => notesApi.create(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['notes', 'list'] });
      toast.success(res.message || 'Note created');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not create note.')),
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => notesApi.update(id, payload),
    onSuccess: (res, { id }) => {
      queryClient.invalidateQueries({ queryKey: keys.note(id) });
      queryClient.invalidateQueries({ queryKey: ['notes', 'list'] });
      toast.success(res.message || 'Note updated');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not update note.')),
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => notesApi.delete(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['notes', 'list'] });
      toast.success(res.message || 'Note deleted');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not delete note.')),
  });
}

export function useDownloadNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => notesApi.download(id),
    onSuccess: (res, id) => {
      // Optimistically we could update it, but invalidating is fine
      queryClient.invalidateQueries({ queryKey: keys.note(id) });
      queryClient.invalidateQueries({ queryKey: ['notes', 'list'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Download tracking failed.')),
  });
}

// ── Groups ─────────────────────────────────────────────────────────────────

export function useGroups(params = {}) {
  return useInfiniteQuery({
    queryKey: keys.groups(params),
    queryFn: ({ pageParam }) => groupsApi.list({ ...params, cursor: pageParam, limit: 12 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined),
    staleTime: 30_000,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => groupsApi.create(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['groups', 'list'] });
      toast.success(res.message || 'Group created');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not create group.')),
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => groupsApi.update(id, payload),
    onSuccess: (res, { id }) => {
      queryClient.invalidateQueries({ queryKey: keys.group(id) });
      queryClient.invalidateQueries({ queryKey: ['groups', 'list'] });
      toast.success(res.message || 'Group updated');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not update group.')),
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => groupsApi.remove(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast.success(res.message || 'Group deleted');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not delete group.')),
  });
}

export function useGroup(id) {
  return useQuery({
    queryKey: keys.group(id),
    queryFn: () => groupsApi.get(id),
    enabled: Boolean(id),
  });
}

export function useGroupPosts(groupId) {
  return useInfiniteQuery({
    queryKey: keys.groupPosts(groupId),
    queryFn: ({ pageParam }) => groupsApi.posts(groupId, { cursor: pageParam, limit: 12 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined),
    enabled: Boolean(groupId),
    staleTime: 30_000,
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => groupsApi.join(id),
    onSuccess: (res, id) => {
      queryClient.invalidateQueries({ queryKey: keys.group(id) });
      queryClient.invalidateQueries({ queryKey: ['groups', 'list'] });
      toast.success(res.message || 'Joined group');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not join group.')),
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => groupsApi.leave(id),
    onSuccess: (res, id) => {
      queryClient.invalidateQueries({ queryKey: keys.group(id) });
      queryClient.invalidateQueries({ queryKey: ['groups', 'list'] });
      toast.success(res.message || 'Left group');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not leave group.')),
  });
}

export function useGroupMembers(groupId) {
  return useInfiniteQuery({
    queryKey: keys.groupMembers(groupId),
    queryFn: ({ pageParam }) => groupsApi.members(groupId, { cursor: pageParam, limit: 12 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined),
    enabled: Boolean(groupId),
    staleTime: 30_000,
  });
}

export function useUpdateGroupMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId, role }) => groupsApi.updateRole(groupId, userId, role),
    onSuccess: (res, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: keys.groupMembers(groupId) });
      // Depending on if current user's role is updated or just another member, we could invalidate detail
      queryClient.invalidateQueries({ queryKey: keys.group(groupId) });
      toast.success(res.message || 'Role updated');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not update role.')),
  });
}

export function useRemoveGroupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId }) => groupsApi.removeMember(groupId, userId),
    onSuccess: (res, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: keys.groupMembers(groupId) });
      queryClient.invalidateQueries({ queryKey: keys.group(groupId) });
      toast.success(res.message || 'Member removed');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not remove member.')),
  });
}

// ── Discussions ───────────────────────────────────────────────────────────

export function useDiscussions(params = {}) {
  return useInfiniteQuery({
    queryKey: keys.discussions(params),
    queryFn: ({ pageParam }) => discussionsApi.list({ ...params, cursor: pageParam, limit: 12 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
    staleTime: 30_000,
  });
}

export function useDiscussion(id) {
  return useQuery({
    queryKey: keys.discussion(id),
    queryFn: () => discussionsApi.get(id),
    enabled: Boolean(id),
  });
}

export function useDiscussionComments(id) {
  return useInfiniteQuery({
    queryKey: keys.discussionComments(id),
    queryFn: ({ pageParam }) => discussionsApi.comments(id, { cursor: pageParam, limit: 20 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
    enabled: Boolean(id),
  });
}

export function useCreateDiscussion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => discussionsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions', 'list'] });
    },
    onError: (err) => toast.error(errorMessage(err) || 'Failed to start discussion'),
  });
}

export function useUpdateDiscussion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => discussionsApi.update(id, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.discussion(data.data.id), data.data);
      queryClient.invalidateQueries({ queryKey: ['discussions', 'list'] });
    },
    onError: (err) => toast.error(errorMessage(err) || 'Failed to update discussion'),
  });
}

export function useDeleteDiscussion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => discussionsApi.remove(id),
    onSuccess: (data, id) => {
      queryClient.removeQueries({ queryKey: keys.discussion(id) });
      queryClient.invalidateQueries({ queryKey: ['discussions', 'list'] });
      toast.success('Discussion deleted');
    },
    onError: (err) => toast.error(errorMessage(err) || 'Failed to delete discussion'),
  });
}

export function useVoteDiscussion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }) => discussionsApi.vote(id, value),
    onSuccess: (data, { id }) => {
      // Optimistic update could be complex here, so we just invalidate
      queryClient.invalidateQueries({ queryKey: keys.discussion(id) });
      queryClient.invalidateQueries({ queryKey: ['discussions', 'list'] });
    },
    onError: (err) => toast.error(errorMessage(err) || 'Failed to vote'),
  });
}

export function useCreateDiscussionComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ discussionId, payload }) => discussionsApi.createComment(discussionId, payload),
    onSuccess: (data, { discussionId }) => {
      queryClient.invalidateQueries({ queryKey: keys.discussionComments(discussionId) });
      queryClient.invalidateQueries({ queryKey: keys.discussion(discussionId) });
    },
    onError: (err) => toast.error(errorMessage(err) || 'Failed to post comment'),
  });
}

export function useUpdateDiscussionComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => discussionsApi.updateComment(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: keys.discussionComments(data.data.discussion) });
    },
    onError: (err) => toast.error(errorMessage(err) || 'Failed to update comment'),
  });
}

export function useDeleteDiscussionComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => discussionsApi.removeComment(id),
    onSuccess: (_data, { discussionId }) => {
      queryClient.invalidateQueries({ queryKey: keys.discussionComments(discussionId) });
      queryClient.invalidateQueries({ queryKey: keys.discussion(discussionId) });
    },
    onError: (err) => toast.error(errorMessage(err) || 'Failed to delete comment'),
  });
}

export function useVoteDiscussionComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }) => discussionsApi.voteComment(id, value),
    onSuccess: (_data, { discussionId }) => {
      queryClient.invalidateQueries({ queryKey: keys.discussionComments(discussionId) });
    },
    onError: (err) => toast.error(errorMessage(err) || 'Failed to vote on comment'),
  });
}

export function useMarkDiscussionAnswer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ discussionId, commentId }) => discussionsApi.markAnswer(discussionId, commentId),
    onSuccess: (data, { discussionId }) => {
      queryClient.invalidateQueries({ queryKey: keys.discussionComments(discussionId) });
      queryClient.invalidateQueries({ queryKey: keys.discussion(discussionId) });
    },
    onError: (err) => toast.error(errorMessage(err) || 'Failed to mark as answer'),
  });
}

// ── Messages ─────────────────────────────────────────────────────────────

export function useConversations(params) {
  return useInfiniteQuery({
    queryKey: ['conversations', params],
    queryFn: ({ pageParam }) => messagesApi.listConversations({ ...params, cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor,
  });
}

export function useConversation(id) {
  return useQuery({
    queryKey: ['conversations', id],
    queryFn: () => messagesApi.getConversation(id),
    enabled: !!id,
  });
}

export function useMessages(id, params) {
  return useInfiniteQuery({
    queryKey: ['messages', id, params],
    queryFn: ({ pageParam }) => messagesApi.listMessages(id, { ...params, cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor,
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => messagesApi.createConversation(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err) => toast.error(errorMessage(err) || 'Failed to create conversation'),
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => messagesApi.createMessage(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err) => toast.error(errorMessage(err) || 'Failed to send message'),
  });
}

export function useMarkMessagesRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => messagesApi.markRead(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['messages', id] });
    },
  });
}

// ── Events ────────────────────────────────────────────────────────────────

export function useEvents(params = {}) {
  return useInfiniteQuery({
    queryKey: keys.events(params),
    queryFn: ({ pageParam }) => eventsApi.list({ ...params, cursor: pageParam, limit: 12 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
  });
}

export function useEvent(id) {
  return useQuery({
    queryKey: keys.event(id),
    queryFn: () => eventsApi.get(id),
    enabled: Boolean(id),
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => eventsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      toast.success('Event created');
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to create event')),
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => eventsApi.update(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: keys.event(data.id) });
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      toast.success('Event updated');
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to update event')),
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => eventsApi.remove(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: keys.event(id) });
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      toast.success('Event deleted');
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to delete event')),
  });
}

export function useEventRegistration(id) {
  return useQuery({
    queryKey: keys.eventRegistration(id),
    queryFn: () => eventsApi.registration(id),
    enabled: Boolean(id),
  });
}

export function useRegisterEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => eventsApi.register(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: keys.event(id) });
      queryClient.invalidateQueries({ queryKey: keys.eventRegistration(id) });
      queryClient.invalidateQueries({ queryKey: ['events', 'attendees', id] });
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      toast.success('Registered successfully');
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to register')),
  });
}

export function useUnregisterEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => eventsApi.unregister(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: keys.event(id) });
      queryClient.invalidateQueries({ queryKey: keys.eventRegistration(id) });
      queryClient.invalidateQueries({ queryKey: ['events', 'attendees', id] });
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      toast.success('Unregistered successfully');
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to unregister')),
  });
}

export function useEventAttendees(id, params = {}) {
  return useInfiniteQuery({
    queryKey: keys.eventAttendees(id, params),
    queryFn: ({ pageParam }) => eventsApi.attendees(id, { ...params, cursor: pageParam, limit: 12 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.pagination?.hasMore ? lastPage.pagination.nextCursor : undefined,
    enabled: Boolean(id),
  });
}
