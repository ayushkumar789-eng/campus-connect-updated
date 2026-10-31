import { useEffect, useRef, useState, useMemo } from 'react';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';
import { useChatStore } from '../store/chatStore.js';
import { useMessages, useSendMessage, useMarkMessagesRead } from '../../../shared/hooks/useData.js';
import { MessageBubble } from './MessageBubble.jsx';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Textarea } from '../../../shared/ui/Input.jsx';
import { EmptyState, Skeleton } from '../../../shared/ui/States.jsx';
import { MessageSquare, Send, ArrowLeft } from 'lucide-react';

export function ChatWindow({ conversation, onBack }) {
  const me = useAuthStore((s) => s.user);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const typingUsers = useChatStore((s) => s.typingUsers);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const emitTyping = useChatStore((s) => s.emitTyping);
  
  const [content, setContent] = useState('');
  
  const scrollRef = useRef(null);
  const observerRef = useRef(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useMessages(conversation?.id);

  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const { mutate: markRead } = useMarkMessagesRead();

  // The realtime connection. Declared here rather than further down because the
  // read-receipt effect below closes over it: a `useEffect` callback runs after
  // render, and the bindings only exist once the whole component body has been
  // evaluated, so a `const` further down leaves the effect's dependency array
  // and its body referencing it in the temporal dead zone —
  //
  //   ReferenceError: Cannot access 'connected' before initialization
  //
  // which threw on every render of the chat pane and took the whole route down
  // to the error boundary. A `var` or a hoisted declaration would have hidden
  // it as `undefined` instead, which is worse: the receipt would silently stop
  // being sent.
  const socket = useChatStore((s) => s.socket);
  const connected = useChatStore((s) => s.connected);

  // Set active conversation when mounted
  useEffect(() => {
    if (conversation?.id) {
      setActiveConversation(conversation.id);
    }
    return () => setActiveConversation(null);
  }, [conversation?.id, setActiveConversation]);

  // Read receipt ping
  useEffect(() => {
    if (conversation?.id && activeConversationId === conversation.id) {
      const hasUnread = data?.pages?.[0]?.data?.some(m => !m.readBy?.includes(me?.id));
      if (hasUnread) {
        if (connected && socket) {
          socket.emit('message:read', { conversationId: conversation.id });
        } else {
          markRead(conversation.id);
        }
      }
    }
  }, [conversation?.id, activeConversationId, data, me?.id, markRead, connected, socket]);

  // Scroll to bottom on new messages (first page changes)
  const firstPage = data?.pages?.[0]?.data;
  const firstMessageId = firstPage?.[0]?.id; // The most recent message
  const hasFetched = !isLoading && !!data;
  
  useEffect(() => {
    if (scrollRef.current && hasFetched) {
      const el = scrollRef.current;
      // If we are near the bottom (within 150px), or we just loaded the conversation, scroll down.
      // We know it's a fresh load if we haven't scrolled at all yet (or if we can track it with a ref, but a simple check works).
      // A better heuristic: if we are very close to the top and just loaded, maybe not.
      // Actually, if we just mounted/loaded this conversation, scroll to bottom unconditionally.
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      
      // We can use a ref to track if this is the first render for this conversation
      if (isNearBottom || el.dataset.conversationId !== activeConversationId) {
        el.scrollTop = el.scrollHeight;
        el.dataset.conversationId = activeConversationId;
      }
    }
  }, [firstMessageId, hasFetched, activeConversationId]);

  // Infinite scroll observer (top of list)
  useEffect(() => {
    const el = observerRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: scrollRef.current, threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // These three hooks must run before the `if (!conversation)` guard below.
  // Selecting a conversation changes the hook count across renders, and React
  // only tolerates a stable hook order — picking the first chat in the list
  // would otherwise throw "Rendered fewer hooks than expected".
  const messages = useMemo(() => {
    if (!data?.pages) return [];
    // Pages come ordered newest first, but we want to display oldest first (top to bottom)
    const all = data.pages.flatMap((p) => p.data);
    return all.reverse();
  }, [data?.pages]);

  if (!conversation) {
    return (
      <div className="h-full hidden md:flex flex-col items-center justify-center">
        <EmptyState 
          icon={MessageSquare} 
          title="Your Messages" 
          description="Select a conversation to start chatting" 
        />
      </div>
    );
  }

  // Find the other participant for context (assuming 1-on-1 for now, or just the first other person)
  const otherParticipant = conversation.participants?.find((p) => (p.id || p) !== me?.id);
  const otherId = otherParticipant?.id || otherParticipant;
  const isOnline = onlineUsers.has(otherId);
  
  const typingSet = typingUsers[conversation.id];
  const isTyping = typingSet && typingSet.size > 0; // In 1-on-1, any typing is the other person

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!content.trim() || isSending) return;

    if (connected && socket) {
      socket.emit('message:send', { conversationId: conversation.id, content: content.trim(), kind: 'text' }, (res) => {
        if (res?.error) {
          // If the socket throws an error, we could show a toast. For now, rely on existing error patterns.
          console.error(res.error);
        } else {
          setContent('');
        }
      });
    } else {
      sendMessage(
        { id: conversation.id, payload: { content: content.trim() } },
        { onSuccess: () => setContent('') }
      );
    }
    emitTyping(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e) => {
    setContent(e.target.value);
    emitTyping(e.target.value.length > 0);
  };

  return (
    <div className="flex flex-col h-full bg-surface border border-line rounded-lg shadow-card overflow-hidden">
      {/* Header */}
      <div className="h-16 shrink-0 px-4 border-b border-line flex items-center gap-3">
        {onBack && (
          <button 
            onClick={onBack}
            className="md:hidden p-2 -ml-2 text-ink-2 hover:bg-surface-2 rounded-full"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        
        <div className="relative">
          <Avatar user={otherParticipant} size="sm" />
          {isOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-success rounded-full ring-2 ring-surface" />
          )}
        </div>
        <div>
          <h2 className="font-semibold text-[15px] text-ink">
            {otherParticipant?.name || otherParticipant?.username || 'User'}
          </h2>
          <div className="text-[12px] text-ink-3">
            {isOnline ? <span className="text-success">Online</span> : 'Offline'}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 relative bg-canvas/30"
      >
        {hasNextPage && (
          <div ref={observerRef} className="py-2 text-center">
            {isFetchingNextPage ? (
              <span className="text-[12px] text-ink-3">Loading older messages...</span>
            ) : null}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-4 mt-auto">
             <Skeleton className="h-10 w-2/3 rounded-2xl" />
             <Skeleton className="h-10 w-1/2 rounded-2xl ml-auto" />
             <Skeleton className="h-16 w-3/4 rounded-2xl" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState title="Say hello!" description="This is the start of your conversation." />
          </div>
        ) : (
          messages.map((msg, i) => {
            const nextMsg = messages[i + 1];
            // Sequence grouping: true if the NEXT message is from someone else, or this is the last message
            const isLastInSequence = !nextMsg || nextMsg.sender?.id !== msg.sender?.id;
            return (
              <MessageBubble 
                key={msg.id} 
                message={msg} 
                isLastInSequence={isLastInSequence} 
              />
            );
          })
        )}
        
        {/* Typers */}
        {isTyping && (
          <div className="text-[11.5px] italic text-ink-3 mt-1 ml-10">
            {otherParticipant?.name?.split(' ')[0] || 'Someone'} is typing...
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="p-3 border-t border-line bg-surface">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <Textarea
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="min-h-[44px] h-[44px] max-h-32 py-2.5 resize-none flex-1 !mb-0 rounded-2xl"
            disabled={isSending}
          />
          <Button 
            type="submit" 
            disabled={!content.trim() || isSending}
            className="rounded-full h-11 w-11 p-0 flex items-center justify-center shrink-0 mb-[1px]"
            aria-label="Send message"
          >
            <Send className="h-5 w-5 ml-0.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
