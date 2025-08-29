import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, 
  Settings as SettingsIcon, 
  Bot, 
  User, 
  X,
  ChevronDown,
  MessageCircle
} from "lucide-react";
import { readSettings } from "../../core/storage/repo";
import type { Message } from "../../core/providers/types";
import { sendChatTurn } from "../../core/chat/runner";
import type { ProviderCredential, Model } from "../../core/storage/schemas";

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string>("");
  const [showConfig, setShowConfig] = useState(false);
  
  const [providers, setProviders] = useState<ProviderCredential[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [systemPrompt, setSystemPrompt] = useState("");
  
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadSettings = async () => {
    const settings = await readSettings();
    setProviders(settings.providerCredentials);
    setModels(settings.models);
    
    if (settings.defaultProviderCredentialId) {
      setSelectedProviderId(settings.defaultProviderCredentialId);
    } else if (settings.providerCredentials.length > 0) {
      setSelectedProviderId(settings.providerCredentials[0].id);
    }
    
    if (settings.defaultModelId) {
      setSelectedModelId(settings.defaultModelId);
    } else if (settings.models.length > 0) {
      setSelectedModelId(settings.models[0].id);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const selectedProvider = useMemo(() => 
    providers.find(p => p.id === selectedProviderId), 
    [providers, selectedProviderId]
  );

  const selectedModel = useMemo(() => 
    models.find(m => m.id === selectedModelId), 
    [models, selectedModelId]
  );

  const availableModels = useMemo(() => 
    models.filter(m => m.providerId === selectedProvider?.providerId), 
    [models, selectedProvider]
  );

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedProvider || !selectedModel || isLoading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setIsStreaming(true);
    setError("");

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const assistantMsg: Message = { role: "assistant", content: "" };
      setMessages(prev => [...prev, assistantMsg]);

      let streamedContent = "";
      const res = await sendChatTurn({ 
        cred: selectedProvider, 
        model: selectedModel.name,
        system: systemPrompt || undefined,
        messages: [...messages, userMsg], 
        signal: abortRef.current.signal, 
        onDelta: (delta: string) => {
          streamedContent += delta;
          setMessages(prev => prev.map((msg, idx) => 
            idx === prev.length - 1 ? { ...msg, content: streamedContent } : msg
          ));
        }
      });
      
      setMessages(prev => prev.map((msg, idx) => 
        idx === prev.length - 1 ? { ...msg, content: res.text } : msg
      ));
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.log(e);
        setError(`Error: ${String(e.message || e)}`);
        setMessages(prev => prev.slice(0, -1));
      }
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setIsStreaming(false);
  };

  const clearChat = () => {
    setMessages([]);
    setError("");
  };

  if (providers.length === 0 || models.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-gray-50">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <SettingsIcon className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Setup Required</h2>
          <p className="text-gray-600 mb-4">
            You need to configure at least one provider and model before you can start chatting.
          </p>
          <button
            onClick={() => window.location.href = '/settings'}
            className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Minimal Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Bot className="w-3 h-3 text-white" />
            </div>
            <div className="text-sm text-gray-600">
              {selectedModel?.displayName || "No model"}
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`p-1.5 rounded-lg transition-colors ${
                showConfig 
                  ? "bg-blue-100 text-blue-600" 
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Configuration Panel */}
      <AnimatePresence>
        {showConfig && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-white border-b border-gray-200 overflow-hidden flex-shrink-0"
          >
            <div className="p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Provider</label>
                  <div className="relative">
                    <select
                      value={selectedProviderId}
                      onChange={(e) => {
                        setSelectedProviderId(e.target.value);
                        const newProvider = providers.find(p => p.id === e.target.value);
                        const compatibleModels = models.filter(m => m.providerId === newProvider?.providerId);
                        if (compatibleModels.length > 0) {
                          setSelectedModelId(compatibleModels[0].id);
                        }
                      }}
                      className="w-full p-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white text-sm"
                    >
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Model</label>
                  <div className="relative">
                    <select
                      value={selectedModelId}
                      onChange={(e) => setSelectedModelId(e.target.value)}
                      className="w-full p-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white text-sm"
                      disabled={availableModels.length === 0}
                    >
                      {availableModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.displayName}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">System Prompt</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="You are a helpful AI assistant..."
                  rows={2}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Start chatting</h3>
              <p className="text-gray-500 text-sm">
                Send a message to begin your conversation.
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`flex items-start space-x-2 max-w-[85%] ${message.role === "user" ? "flex-row-reverse space-x-reverse" : ""}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.role === "user" 
                      ? "bg-blue-600 text-white" 
                      : "bg-gray-200 text-gray-600"
                  }`}>
                    {message.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                  </div>
                  <div className={`px-3 py-2 rounded-2xl ${
                    message.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-white text-gray-900 rounded-bl-sm shadow-sm border border-gray-100"
                  }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {message.content}
                      {message.role === "assistant" && isStreaming && index === messages.length - 1 && (
                        <span className="inline-block w-2 h-5 bg-gray-400 ml-1 animate-pulse" />
                      )}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
            
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="flex items-start space-x-2 max-w-[85%]">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-200 text-gray-600">
                    <Bot className="w-3 h-3" />
                  </div>
                  <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-white text-gray-900 shadow-sm border border-gray-100">
                    <div className="flex space-x-1">
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-center"
              >
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg max-w-sm text-center text-sm">
                  {error}
                </div>
              </motion.div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-3 flex-shrink-0">
        <form onSubmit={onSend} className="flex items-end space-x-2">
          <div className="flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              rows={1}
              disabled={isLoading}
              className="w-full p-3 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed text-sm max-h-32"
              style={{ minHeight: "44px" }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend(e as any);
                }
              }}
            />
          </div>
          {isLoading ? (
            <button
              type="button"
              onClick={handleStop}
              className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !selectedProvider || !selectedModel}
              className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
