import { classNames } from '../../../shared/utils/format.js';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Check, CheckCheck } from 'lucide-react';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';

export function MessageBubble({ message, isLastInSequence }) {
  const me = useAuthStore((s) => s.user);
  
  // Guard against improperly populated sender
  const senderId = message.sender?._id || message.sender?.id || message.sender;
  const isMine = senderId === me?.id;
  
  const senderName = message.sender?.name || message.sender?.username || 'Unknown User';
  const showAvatar = !isMine && isLastInSequence;
  const showStatus = isMine && isLastInSequence;

  // Assuming `message.readBy` contains user IDs, we can check if it's read by anyone other than me
  const isRead = message.readBy && message.readBy.some(id => id !== me?.id);

  return (
    <div className={classNames('flex w-full gap-2 mb-1', isMine ? 'justify-end' : 'justify-start')}>
      {/* Avatar spacer or actual avatar */}
      {!isMine && (
        <div className="w-8 shrink-0 flex items-end">
          {showAvatar && message.sender?.name && (
            <Avatar user={message.sender} size="sm" />
          )}
        </div>
      )}

      <div className={classNames('flex flex-col max-w-[75%]', isMine ? 'items-end' : 'items-start')}>
        {/* Name for group chats or clear context */}
        {!isMine && message.sender?.name && isLastInSequence && (
          <span className="text-[11.5px] font-medium text-ink-3 ml-1 mb-0.5">
            {senderName}
          </span>
        )}

        <div
          className={classNames(
            'px-3.5 py-2 text-[14.5px] leading-relaxed relative',
            isMine
              ? 'bg-accent text-white rounded-2xl rounded-br-sm'
              : 'bg-surface-2 text-ink border border-line/50 rounded-2xl rounded-bl-sm'
          )}
        >
          {message.kind === 'text' ? (
            <span className="whitespace-pre-wrap break-words">{message.content}</span>
          ) : (
            <span className="italic text-white/80">[{message.kind} message]</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-1 mx-1 text-[11px] text-ink-3">
          <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          {showStatus && (
            isRead ? (
              <CheckCheck className="h-3.5 w-3.5 text-accent" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )
          )}
        </div>
      </div>
    </div>
  );
}
