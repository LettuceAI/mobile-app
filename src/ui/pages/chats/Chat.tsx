import { useState } from "react";
import { 
  Search
} from "lucide-react";
import { ThemeToggle } from "../../components/ThemeToggle";

interface Character {
  id: string;
  name: string;
  description: string;
  avatar: string;
  personality: string;
  messageCount: number;
  isStarred: boolean;
  lastMessage?: string;
  lastActive?: string;
}

// Mock data for characters
const mockCharacters: Character[] = [
  {
    id: "1",
    name: "AI Assistant",
    description: "A helpful AI assistant ready to answer your questions",
    avatar: "🤖",
    personality: "helpful, knowledgeable, friendly",
    messageCount: 45,
    isStarred: true,
    lastMessage: "I'm here to help you with anything you need!",
    lastActive: "2 minutes ago"
  },
  {
    id: "2", 
    name: "Code Mentor",
    description: "Expert programming tutor and code reviewer",
    avatar: "💻",
    personality: "technical, patient, detail-oriented",
    messageCount: 23,
    isStarred: false,
    lastMessage: "Let's review your code together.",
    lastActive: "1 hour ago"
  },
  {
    id: "3",
    name: "Creative Writer",
    description: "Imaginative storyteller and writing companion",
    avatar: "✍️",
    personality: "creative, expressive, inspiring",
    messageCount: 12,
    isStarred: true,
    lastMessage: "What story shall we create today?",
    lastActive: "3 hours ago"
  },
  {
    id: "4",
    name: "Study Buddy",
    description: "Academic tutor for various subjects",
    avatar: "📚",
    personality: "encouraging, methodical, clear",
    messageCount: 8,
    isStarred: false,
    lastMessage: "Ready to tackle that assignment?",
    lastActive: "1 day ago"
  }
];

export function ChatPage() {
  const [characters] = useState<Character[]>(mockCharacters);

  const startChat = (character: Character) => {
    console.log("Starting chat with:", character.name);
  };

  const openSearch = () => {
    console.log("Opening search page");
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Chats</h1>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={openSearch}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
              aria-label="Search characters"
            >
              <Search className="w-5 h-5" />
            </button>
            <ThemeToggle size="md" variant="icon" />
          </div>
        </div>
      </div>

      {/* Character List */}
      <div className="p-6">
        <div className="space-y-3">
          {characters.map((character) => (
            <button
              key={character.id}
              onClick={() => startChat(character)}
              className="w-full flex items-center space-x-4 p-5 rounded-2xl bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-700 transition-all duration-200 shadow-sm hover:shadow-md text-left group"
            >
              {/* Avatar Circle */}
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
                {character.avatar}
              </div>
              
              {/* Name and Description */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-1">
                  {character.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {character.description}
                </p>
              </div>
              
              {/* Arrow */}
              <div className="text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
