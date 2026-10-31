import { useParams, Link, useNavigate } from 'react-router-dom';
import { Users, Lock, Globe, ArrowLeft, Shield, MoreHorizontal, UserMinus, Search as SearchIcon, BookOpen, Plus, Trash2, MessageSquare } from 'lucide-react';
import { Card, Badge } from '../../../shared/ui/Card.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Dropdown } from '../../../shared/ui/Dropdown.jsx';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.jsx';
import { EmptyState, ErrorState, FeedSkeleton, CardSkeleton } from '../../../shared/ui/States.jsx';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { 
  useGroup, useJoinGroup, useLeaveGroup, 
  useGroupPosts, useGroupMembers, 
  useUpdateGroupMemberRole, useRemoveGroupMember,
  useNotes, useUpdateGroup, useDeleteGroup,
  useDiscussions
} from '../../../shared/hooks/useData.js';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';
import { compactNumber } from '../../../shared/utils/format.js';
import { errorMessage } from '../../../shared/api/client.js';
import { postsApi } from '../../posts/index.js';
import { toast } from '../../../shared/ui/Toast.jsx';
import { PostCard } from '../../posts/components/PostCard.jsx';
import { Composer } from '../../posts/components/Composer.jsx';
import { CommentsPanel } from '../../comments/components/CommentsPanel.jsx';
import { NoteCard } from '../../notes/components/NoteCard.jsx';
import { NoteComposer } from '../../notes/components/NoteComposer.jsx';
import { DiscussionCard } from '../../discussions/components/DiscussionCard.jsx';
import { DiscussionComposer } from '../../discussions/components/DiscussionComposer.jsx';
import { GroupForm } from '../components/GroupForm.jsx';
import { useDebounce } from '../../../shared/hooks/useDebounce.js';
import { useState, useRef, useEffect, Fragment } from 'react';
import { Loader2 } from 'lucide-react';

const TABS = [
  { key: 'posts', label: 'Posts' },
  { key: 'members', label: 'Members', phase: 3 },
  { key: 'resources', label: 'Resources', phase: 3 },
  { key: 'discussions', label: 'Discussions', phase: 3 },
  { key: 'settings', label: 'Settings', phase: 3, requiresAdmin: true },
];

function GroupFeed({ group }) {
  const [activePost, setActivePost] = useState(null);
  const [votingId, setVotingId] = useState(null);

  const {
    data,
    error,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useGroupPosts(group.id);

  const posts = data?.pages?.flatMap((p) => p.data) ?? [];

  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleVote = async (postId, optionId) => {
    setVotingId(postId);
    try {
      await postsApi.vote(postId, optionId);
      refetch();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not record your vote.'));
    } finally {
      setVotingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {group.isMember && (
        <Composer groupId={group.id} />
      )}

      {isLoading ? (
        <FeedSkeleton />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No posts yet"
          description={
            group.isMember
              ? "Start the conversation by posting something."
              : "Nobody has posted here yet."
          }
        />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onOpenComments={setActivePost}
              onVote={handleVote}
              isVoting={votingId === post.id}
            />
          ))}

          {hasNextPage && (
            <div ref={sentinelRef} className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-ink-3" aria-hidden />
            </div>
          )}
        </div>
      )}

      {activePost && (
        <CommentsPanel post={activePost} onClose={() => setActivePost(null)} />
      )}
    </div>
  );
}

function GroupMembers({ group }) {
  const viewer = useAuthStore((s) => s.user);
  const [memberToRemove, setMemberToRemove] = useState(null);

  const updateRole = useUpdateGroupMemberRole();
  const removeMember = useRemoveGroupMember();

  const {
    data,
    error,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useGroupMembers(group.id);

  const members = data?.pages?.flatMap((p) => p.data) ?? [];

  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isCreator = viewer?.id === group.creator?._id;
  const isAdmin = group.myRole === 'admin' || isCreator;
  const isModerator = group.myRole === 'moderator';

  const canEditRole = (member) => {
    if (String(member.user._id) === String(group.creator._id)) return false; // cannot edit creator
    if (String(member.user._id) === String(viewer?.id)) return false; // cannot edit self
    return isAdmin;
  };

  const canRemove = (member) => {
    if (String(member.user._id) === String(group.creator._id)) return false; // cannot remove creator
    if (String(member.user._id) === String(viewer?.id)) return false; // cannot remove self via this UI
    if (isModerator && member.role === 'admin') return false; // mod cannot remove admin
    return isAdmin || isModerator;
  };

  const handleRoleChange = (userId, newRole) => {
    updateRole.mutate({ groupId: group.id, userId, role: newRole });
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          description="This group doesn't have any members yet."
        />
      ) : (
        <div className="space-y-3">
          {members.map((member) => {
            const isMemberCreator = String(member.user._id) === String(group.creator._id);
            const showEdit = canEditRole(member);
            const showRemove = canRemove(member);
            
            return (
              <div key={member.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
                <Avatar user={member.user} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link to={`/u/${member.user.username}`} className="truncate text-[14px] font-semibold text-ink hover:underline">
                    {member.user.name}
                  </Link>
                  <p className="truncate text-[12.5px] text-ink-3">
                    @{member.user.username}
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  {isMemberCreator ? (
                    <Badge tone="accent">Creator</Badge>
                  ) : (
                    <Badge className="capitalize">{member.role}</Badge>
                  )}

                  {(showEdit || showRemove) && (
                    <Dropdown
                      trigger={
                        <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </button>
                      }
                      items={[
                        ...(showEdit ? [
                          { label: 'Make Admin', onSelect: () => handleRoleChange(member.user._id, 'admin') },
                          { label: 'Make Moderator', onSelect: () => handleRoleChange(member.user._id, 'moderator') },
                          { label: 'Make Member', onSelect: () => handleRoleChange(member.user._id, 'member') },
                        ] : []),
                        ...(showRemove ? [
                          { label: 'Remove from group', danger: true, icon: UserMinus, onSelect: () => setMemberToRemove(member) }
                        ] : [])
                      ]}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {hasNextPage && (
            <div ref={sentinelRef} className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-ink-3" aria-hidden />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!memberToRemove}
        onClose={() => setMemberToRemove(null)}
        onConfirm={async () => {
          if (!memberToRemove) return;
          await removeMember.mutateAsync({ groupId: group.id, userId: memberToRemove.user._id });
          setMemberToRemove(null);
        }}
        title="Remove Member"
        body={`Are you sure you want to remove ${memberToRemove?.user?.name} from the group?`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}

function GroupResources({ group }) {
  const [term, setTerm] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);

  const debounced = useDebounce(term.trim(), 350);
  
  const queryParams = { group: group.id };
  if (debounced.length >= 2) queryParams.search = debounced;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useNotes(queryParams);

  const isEmpty = data?.pages?.[0]?.data?.length === 0;

  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="space-y-4">
      {group.isMember && (
        <div className="flex justify-end mb-2">
          <Button onClick={() => setComposerOpen(true)} className="shrink-0 gap-1.5" size="sm">
            <Plus className="h-4 w-4" aria-hidden />
            Upload Resource
          </Button>
        </div>
      )}

      <Card className="p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search group resources…"
            aria-label="Search resources"
            className="h-10 w-full rounded-md border border-line bg-surface-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : isEmpty ? (
        <EmptyState
          icon={BookOpen}
          title={term ? 'No resources found' : 'No resources yet'}
          description={
            term
              ? 'Try adjusting your search terms.'
              : group.isMember
              ? 'Be the first to upload a resource for this group.'
              : 'Nobody has uploaded resources here yet.'
          }
        >
          {group.isMember && !term && (
            <Button onClick={() => setComposerOpen(true)} className="mt-4">
              Upload Resource
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.pages.map((page, i) => (
              <Fragment key={i}>
                {page.data.map((note) => (
                  <NoteCard key={note.id} note={note} />
                ))}
              </Fragment>
            ))}
          </div>

          {hasNextPage && (
            <div ref={sentinelRef} className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-ink-3" aria-hidden />
            </div>
          )}
        </div>
      )}

      <NoteComposer 
        open={composerOpen} 
        onClose={() => setComposerOpen(false)} 
        groupId={group.id}
      />
    </div>
  );
}

function GroupDiscussions({ group }) {
  const [term, setTerm] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);

  const debounced = useDebounce(term.trim(), 350);
  
  const queryParams = { group: group.id };
  if (debounced.length >= 2) queryParams.search = debounced;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useDiscussions(queryParams);

  const isEmpty = data?.pages?.[0]?.data?.length === 0;

  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="space-y-4">
      {group.isMember && (
        <div className="flex justify-end mb-2">
          <Button onClick={() => setComposerOpen(true)} className="shrink-0 gap-1.5" size="sm">
            <Plus className="h-4 w-4" aria-hidden />
            New Discussion
          </Button>
        </div>
      )}

      <Card className="p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search group discussions…"
            aria-label="Search discussions"
            className="h-10 w-full rounded-md border border-line bg-surface-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : isEmpty ? (
        <EmptyState
          icon={MessageSquare}
          title={term ? 'No discussions found' : 'No discussions yet'}
          description={
            term
              ? 'Try adjusting your search terms.'
              : group.isMember
              ? 'Be the first to start a discussion in this group.'
              : 'Nobody has started a discussion here yet.'
          }
        >
          {group.isMember && !term && (
            <Button onClick={() => setComposerOpen(true)} className="mt-4">
              New Discussion
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {data.pages.map((page, i) => (
              <Fragment key={i}>
                {page.data.map((discussion) => (
                  <DiscussionCard key={discussion.id} discussion={discussion} />
                ))}
              </Fragment>
            ))}
          </div>

          {hasNextPage && (
            <div ref={sentinelRef} className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-ink-3" aria-hidden />
            </div>
          )}
        </div>
      )}

      <DiscussionComposer 
        open={composerOpen} 
        onClose={() => setComposerOpen(false)} 
        defaultGroup={group.id}
      />
    </div>
  );
}

function GroupSettings({ group, isCreator }) {
  const navigate = useNavigate();
  const updateGroup = useUpdateGroup();
  const deleteGroup = useDeleteGroup();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Card className="p-4 sm:p-6">
        <h3 className="mb-6 text-lg font-bold text-ink">Group Settings</h3>
        <GroupForm 
          group={group} 
          isSubmitting={updateGroup.isPending}
          onSubmit={(formData) => {
            updateGroup.mutate({ id: group.id, payload: formData });
          }}
        />
      </Card>

      {isCreator && (
        <Card className="border-red-500/20 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-red-600 dark:text-red-400">Danger Zone</h3>
              <p className="mt-1 text-[13.5px] text-ink-3">
                Deleting this group will remove all members, posts, and resources. This action cannot be undone.
              </p>
            </div>
            <Button 
              variant="secondary" 
              className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1.5" aria-hidden />
              Delete Group
            </Button>
          </div>

          <ConfirmDialog
            open={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            onConfirm={() => {
              deleteGroup.mutate(group.id, {
                onSuccess: () => navigate('/groups'),
              });
            }}
            title="Delete Group"
            description="Are you absolutely sure? This will permanently delete the group and remove all of its data. This action cannot be undone."
            confirmText="Yes, delete group"
            isDestructive={true}
            isLoading={deleteGroup.isPending}
          />
        </Card>
      )}
    </div>
  );
}

export default function GroupDetail() {
  const { id } = useParams();
  const viewer = useAuthStore((s) => s.user);

  // Declared with the other hooks, not after the loading/error guards below.
  // React tracks hooks by call order, so a `useState` placed after an early
  // return changes the hook count between renders and React discards the
  // component's state — or throws — as soon as the query resolves.
  const [activeTab, setActiveTab] = useState('posts');

  const { data: group, isLoading, error, refetch } = useGroup(id);
  const joinGroup = useJoinGroup();
  const leaveGroup = useLeaveGroup();

  if (isLoading) {
    return (
      <div className="space-y-4 pb-12">
        <FeedSkeleton />
      </div>
    );
  }

  if (error) {
    if (error.response?.status === 404) {
      return (
        <EmptyState
          icon={Users}
          title="Group not found"
          description="The group you're looking for doesn't exist or has been removed."
          action={
            <Link to="/groups">
              <Button>Browse Groups</Button>
            </Link>
          }
        />
      );
    }
    if (error.response?.status === 403) {
      return <ErrorState message="This is a private group. You do not have permission to view its contents." />;
    }
    return <ErrorState message={errorMessage(error)} onRetry={refetch} />;
  }

  if (!group) return null;

  const isCreator = viewer?.id === group.creator?._id;
  const isAdmin = group.myRole === 'admin' || isCreator;

  return (
    <div className="space-y-4 pb-12">
      <Link to="/groups" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Groups
      </Link>

      <Card className="overflow-hidden">
        {group.coverImage?.url ? (
          <div className="h-32 sm:h-48">
            <img src={group.coverImage.url} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="flex h-32 sm:h-48 items-center justify-center bg-accent-soft text-accent">
            <Users className="h-16 w-16 opacity-50" aria-hidden />
          </div>
        )}

        <div className="px-4 pb-4">
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink">{group.name}</h1>
              
              <div className="mt-2 flex items-center gap-2 text-sm text-ink-3">
                {group.isPrivate ? (
                  <span className="flex items-center gap-1"><Lock className="h-3.5 w-3.5" aria-hidden /> Private Group</span>
                ) : (
                  <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" aria-hidden /> Public Group</span>
                )}
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {compactNumber(group.memberCount)} members
                </span>
                {group.category && (
                  <>
                    <span>·</span>
                    <span className="capitalize">{group.category}</span>
                  </>
                )}
              </div>

              {group.description && (
                <p className="mt-4 text-[14.5px] leading-relaxed text-ink-2 whitespace-pre-wrap">
                  {group.description}
                </p>
              )}

              {group.tags?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {group.tags.map(t => (
                    <Badge key={t} size="sm">#{t}</Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Membership Controls */}
            <div className="flex shrink-0 items-center gap-2">
              {group.isMember ? (
                <>
                  {group.myRole && (
                    <Badge tone="accent" className="capitalize flex items-center gap-1">
                      {group.myRole === 'admin' && <Shield className="h-3 w-3" />}
                      {group.myRole}
                    </Badge>
                  )}
                  {/* Creator cannot leave via API, so we hide the button or disable it. */}
                  {!isCreator && (
                    <Button 
                      variant="secondary" 
                      loading={leaveGroup.isPending && leaveGroup.variables === group.id}
                      onClick={() => {
                        if (window.confirm('Are you sure you want to leave this group?')) {
                          leaveGroup.mutate(group.id);
                        }
                      }}
                    >
                      Leave Group
                    </Button>
                  )}
                </>
              ) : (
                <Button 
                  loading={joinGroup.isPending && joinGroup.variables === group.id}
                  onClick={() => {
                    if (group.isPrivate) {
                      // Handled by the backend, but we can prevent it client-side as well
                      alert('This is a private group. Join requests are not yet supported.');
                    } else {
                      joinGroup.mutate(group.id);
                    }
                  }}
                  disabled={group.isPrivate}
                >
                  Join Group
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-line px-4">
          <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Tabs">
            {TABS.map((tab) => {
              if (tab.requiresAdmin && !isAdmin) return null;
              
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`shrink-0 whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-accent text-accent'
                      : 'border-transparent text-ink-3 hover:border-line hover:text-ink'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </Card>

      {/* Content Area */}
      <div className="pt-4">
        {activeTab === 'posts' ? (
          <GroupFeed group={group} />
        ) : activeTab === 'members' ? (
          <GroupMembers group={group} />
        ) : activeTab === 'resources' ? (
          <GroupResources group={group} />
        ) : activeTab === 'discussions' ? (
          <GroupDiscussions group={group} />
        ) : activeTab === 'settings' && isAdmin ? (
          <GroupSettings group={group} isCreator={isCreator} />
        ) : (
          <EmptyState
            icon={Users}
            title={`${TABS.find((t) => t.key === activeTab)?.label} coming soon`}
            description="This section is not implemented yet."
          />
        )}
      </div>
    </div>
  );
}
