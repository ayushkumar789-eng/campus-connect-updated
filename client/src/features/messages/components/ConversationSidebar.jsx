import { useMemo, useState } from 'react';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';
import { useChatStore } from '../store/chatStore.js';
import { useConversations } from '../../../shared/hooks/useData.js';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Skeleton, EmptyState } from '../../../shared/ui/States.jsx';
import { classNames, timeAgo } from '../../../shared/utils/format.js';
import { MessageSquare, Plus } from 'lucide-react';
import { NewConversationModal } from './NewConversationModal.jsx';

export function ConversationSidebar({ activeId, onSelect }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const me = useAuthStore((s) => s.user);
  const onlineUsers = useChatStore((s) => s.onlineUsers);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useConversations();

  const conversations = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((p) => p.data);
  }, [data?.pages]);

  return (
    <div className="flex flex-col h-full bg-surface border border-line rounded-lg shadow-card overflow-hidden">
      <div className="p-4 border-b border-line shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink tracking-[-0.02em]">Messages</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="p-1.5 text-ink-2 hover:bg-surface-2 rounded-full transition-colors"
          aria-label="New Conversation"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-4">
            <ConversationSkeleton />
            <ConversationSkeleton />
            <ConversationSkeleton />
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 mt-8">
            <EmptyState 
              icon={MessageSquare} 
              title="No conversations yet" 
              description="Your conversations will appear here." 
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {conversations.map((conv) => {
              const other = conv.participants?.find((p) => (p.id || p) !== me?.id);
              const otherId = other?.id || other;
              const isOnline = onlineUsers.has(otherId);
              const isActive = activeId === conv.id;
              
              // We rely on the global notification bell for unread counts, 
              // but we can bold the message text if the last message isn't ours and we haven't seen it (heuristic).
              const isUnreadHeuristic = conv.lastMessage && conv.lastMessage.sender !== me?.id && !isActive;

              return (
                <li key={conv.id}>
                  <button
                    onClick={() => onSelect(conv)}
                    className={classNames(
                      'w-full text-left flex items-start gap-3 p-4 transition-colors hover:bg-surface-2',
                      isActive && 'bg-surface-2'
                    )}
                  >
                    <div className="relative shrink-0">
                      <Avatar user={other} size="md" />
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-success rounded-full ring-2 ring-surface" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className="font-semibold text-[14.5px] text-ink truncate pr-2">
                          {other?.name || other?.username || 'Unknown User'}
                        </span>
                        {conv.lastMessageAt && (
                          <span className="text-[11.5px] text-ink-3 shrink-0">
                            {timeAgo(conv.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <p className={classNames(
                          'text-[13.5px] truncate',
                          isUnreadHeuristic ? 'font-medium text-ink' : 'text-ink-2'
                        )}>
                          {conv.lastMessage?.content || 'Started a conversation'}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        
        {hasNextPage && (
          <div className="p-4 text-center">
            <button 
              onClick={() => fetchNextPage()} 
              disabled={isFetchingNextPage}
              className="text-[13px] font-medium text-accent hover:underline disabled:opacity-50"
            >
              {isFetchingNextPage ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>

      <NewConversationModal 
        open={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onCreated={(conv) => onSelect(conv)}
      />
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}
