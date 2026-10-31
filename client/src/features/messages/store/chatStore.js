import { create } from 'zustand';
import { io } from 'socket.io-client';
import { getAccessToken } from '../../../shared/api/client.js';
import { queryClient } from '../../../main.jsx';

let socketInstance = null;
let typingTimeouts = new Map();

export const useChatStore = create((set, get) => ({
  socket: null,
  connected: false,
  activeConversationId: null,
  onlineUsers: new Set(),
  typingUsers: {}, // { [conversationId]: Set<userId> }
  error: null,

  connect: () => {
    if (socketInstance?.connected) return;

    const token = getAccessToken();
    if (!token) return;

    const url = import.meta.env.VITE_API_URL?.replace('/api', '') || '';

    socketInstance = io(url, {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      set({ connected: true, socket: socketInstance, error: null });
    });

    socketInstance.on('connect_error', (err) => {
      set({ error: err.message });
    });

    socketInstance.on('disconnect', () => {
      set({ connected: false });
    });

    socketInstance.on('presence:online', ({ userId }) => {
      set((state) => {
        const next = new Set(state.onlineUsers);
        next.add(userId);
        return { onlineUsers: next };
      });
    });

    socketInstance.on('presence:offline', ({ userId }) => {
      set((state) => {
        const next = new Set(state.onlineUsers);
        next.delete(userId);
        return { onlineUsers: next };
      });
    });

    socketInstance.on('typing:start', ({ conversationId, userId }) => {
      set((state) => {
        const currentSet = state.typingUsers[conversationId] || new Set();
        const nextSet = new Set(currentSet);
        nextSet.add(userId);

        const key = `${conversationId}:${userId}`;
        if (typingTimeouts.has(key)) {
          clearTimeout(typingTimeouts.get(key));
        }

        typingTimeouts.set(key, setTimeout(() => {
          get().handleTypingStop(conversationId, userId);
        }, 3000));

        return {
          typingUsers: { ...state.typingUsers, [conversationId]: nextSet },
        };
      });
    });

    socketInstance.on('typing:stop', ({ conversationId, userId }) => {
      get().handleTypingStop(conversationId, userId);
    });

    socketInstance.on('message:new', (message) => {
      // Safely insert the message into React Query cache if relevant
      queryClient.setQueriesData({ queryKey: ['messages', message.conversation] }, (old) => {
        if (!old) return old;
        // Prepend message to the first page's data
        const next = { ...old };
        if (next.pages && next.pages.length > 0) {
          // Avoid duplicate insertion
          const exists = next.pages.some(p => p.data.some(m => m.id === message.id));
          if (!exists) {
            next.pages = [
              { ...next.pages[0], data: [message, ...next.pages[0].data] },
              ...next.pages.slice(1)
            ];
          }
        }
        return next;
      });

      // Update the conversations cache to bump the lastMessage
      queryClient.setQueriesData({ queryKey: ['conversations'] }, (old) => {
        if (!old) return old;
        const next = { ...old };
        if (next.pages) {
          next.pages = next.pages.map(page => {
            const pageData = [...page.data];
            const idx = pageData.findIndex(c => c.id === message.conversation);
            if (idx !== -1) {
              const conv = { ...pageData[idx] };
              conv.lastMessage = {
                content: message.kind === 'text' ? message.content : `[${message.kind}]`,
                sender: message.sender.id || message.sender,
                createdAt: message.createdAt,
                type: message.kind,
              };
              conv.lastMessageAt = message.createdAt;
              pageData[idx] = conv;
              
              // Sort the page locally (rough approximation since cross-page sorting is hard)
              pageData.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
            }
            return { ...page, data: pageData };
          });
        }
        return next;
      });
    });

    socketInstance.on('message:read', ({ conversationId, userId }) => {
      queryClient.setQueriesData({ queryKey: ['messages', conversationId] }, (old) => {
        if (!old) return old;
        const next = { ...old };
        if (next.pages) {
          next.pages = next.pages.map(page => {
            const data = page.data.map(m => {
              if (!m.readBy.includes(userId)) {
                return { ...m, readBy: [...m.readBy, userId] };
              }
              return m;
            });
            return { ...page, data };
          });
        }
        return next;
      });
    });
  },

  handleTypingStop: (conversationId, userId) => {
    const key = `${conversationId}:${userId}`;
    if (typingTimeouts.has(key)) {
      clearTimeout(typingTimeouts.get(key));
      typingTimeouts.delete(key);
    }

    set((state) => {
      const currentSet = state.typingUsers[conversationId];
      if (!currentSet) return state;

      const nextSet = new Set(currentSet);
      nextSet.delete(userId);
      return {
        typingUsers: { ...state.typingUsers, [conversationId]: nextSet },
      };
    });
  },

  disconnect: () => {
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
    }
    
    for (const timeout of typingTimeouts.values()) {
      clearTimeout(timeout);
    }
    typingTimeouts.clear();

    set({ 
      socket: null, 
      connected: false, 
      onlineUsers: new Set(),
      typingUsers: {},
      activeConversationId: null,
      error: null 
    });
  },

  setActiveConversation: (id) => {
    const currentId = get().activeConversationId;
    if (currentId === id) return;

    if (socketInstance?.connected) {
      if (currentId) socketInstance.emit('conversation:leave', currentId);
      if (id) {
        socketInstance.emit('conversation:join', id, (res) => {
          if (res?.error) {
            set({ error: res.error });
          }
        });
      }
    }
    set({ activeConversationId: id });
  },
  
  emitTyping: (isTyping) => {
    const { socket, connected, activeConversationId } = get();
    if (!socket || !connected || !activeConversationId) return;

    const event = isTyping ? 'typing:start' : 'typing:stop';
    socket.emit(event, { conversationId: activeConversationId });
  },
}));
