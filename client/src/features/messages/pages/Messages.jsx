import { useState } from 'react';
import { ConversationSidebar } from '../components/ConversationSidebar.jsx';
import { ChatWindow } from '../components/ChatWindow.jsx';

export default function Messages() {
  const [activeConversation, setActiveConversation] = useState(null);

  // Responsive layout:
  // On mobile, show Sidebar if no active conversation, else show ChatWindow.
  // On desktop, show both side-by-side.

  return (
    <div className="h-[calc(100vh-140px)] md:h-[calc(100vh-100px)] flex flex-col md:flex-row gap-4 max-w-5xl mx-auto w-full">
      {/* Sidebar - hidden on mobile if a conversation is active */}
      <div 
        className={`w-full md:w-80 lg:w-96 shrink-0 h-full ${
          activeConversation ? 'hidden md:block' : 'block'
        }`}
      >
        <ConversationSidebar 
          activeId={activeConversation?.id} 
          onSelect={setActiveConversation} 
        />
      </div>

      {/* Chat Window - hidden on mobile if NO conversation is active */}
      <div 
        className={`flex-1 h-full min-w-0 ${
          activeConversation ? 'block' : 'hidden md:block'
        }`}
      >
        <ChatWindow 
          conversation={activeConversation} 
          onBack={() => setActiveConversation(null)} 
        />
      </div>
    </div>
  );
}
