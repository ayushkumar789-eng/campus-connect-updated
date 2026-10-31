import { useState, useMemo } from 'react';
import { Modal } from '../../../shared/ui/Modal.jsx';
import { Input } from '../../../shared/ui/Input.jsx';
import { useDebounce } from '../../../shared/hooks/useDebounce.js';
import { useDirectory, useCreateConversation } from '../../../shared/hooks/useData.js';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Skeleton } from '../../../shared/ui/States.jsx';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';
import { useChatStore } from '../store/chatStore.js';
import { Search } from 'lucide-react';

export function NewConversationModal({ open, onClose, onCreated }) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 350);
  const me = useAuthStore((s) => s.user);
  const onlineUsers = useChatStore((s) => s.onlineUsers);

  // useDirectory fetches students
  const { data, isLoading } = useDirectory({ search: debouncedQuery });
  
  const { mutate: createConversation, isPending: isCreating } = useCreateConversation();

  const results = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages
      .flatMap((p) => p.data)
      .filter((u) => u.id !== me?.id); // Filter out self
  }, [data?.pages, me?.id]);

  const handleSelect = (user) => {
    if (isCreating) return;
    createConversation(
      { participantId: user.id },
      {
        onSuccess: (res) => {
          onClose();
          setQuery('');
          // The API returns the conversation data in res.data
          if (onCreated && res.data) {
            onCreated(res.data);
          }
        }
      }
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="New Conversation" size="md">
      <div className="relative mb-4">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-3" aria-hidden />
        <Input
          type="text"
          placeholder="Search students..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 h-10 w-full"
          autoFocus
        />
      </div>

      <div className="max-h-80 overflow-y-auto">
        {!debouncedQuery ? (
          <div className="py-8 text-center text-ink-3 text-[14px]">
            Search for a student to start a conversation.
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="py-8 text-center text-ink-3 text-[14px]">
            No students found.
          </div>
        ) : (
          <ul className="space-y-1">
            {results.map((user) => {
              const isOnline = onlineUsers.has(user.id);
              return (
                <li key={user.id}>
                  <button
                    onClick={() => handleSelect(user)}
                    disabled={isCreating}
                    className="w-full flex items-center gap-3 p-2 hover:bg-surface-2 rounded-lg transition-colors text-left disabled:opacity-50"
                  >
                    <div className="relative shrink-0">
                      <Avatar user={user} size="md" />
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-success rounded-full ring-2 ring-surface" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14.5px] font-medium text-ink truncate">
                        {user.name || user.username}
                      </p>
                      <p className="text-[13px] text-ink-3 truncate">
                        @{user.username}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
