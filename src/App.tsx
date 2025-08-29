import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageCircle, Settings, Home } from "lucide-react";
import "./App.css";
import { SettingsPage } from "./ui/pages/Settings";
import { ChatPage } from "./ui/pages/Chat";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <AppContent />
      </div>
    </BrowserRouter>
  );
}

function AppContent() {
  const location = useLocation();
  const isChat = location.pathname === "/chat";

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-white dark:bg-slate-900 shadow-xl">
      {!isChat && (
        <motion.header 
          className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 shadow-lg"
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ type: "spring", stiffness: 100 }}
        >
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">LettuceAI</h1>
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          </div>
          <p className="text-indigo-100 text-sm mt-1">AI Roleplay Assistant</p>
        </motion.header>
      )}

      <main className="flex-1 overflow-hidden">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/chat" element={<ChatPage />} />
          </Routes>
        </motion.div>
      </main>

      <TabBar />
    </div>
  );
}

function HomePage() {
  return (
    <div className="p-6 h-full flex flex-col justify-center text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="space-y-6"
      >
        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full mx-auto flex items-center justify-center">
          <MessageCircle size={40} className="text-white" />
        </div>
        
        <div className="space-y-3">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            Welcome to LettuceAI
          </h2>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            Your privacy-focused AI roleplay companion. All data stays on your device, 
            and requests go directly to your chosen provider.
          </p>
        </div>

        <div className="space-y-3">
          <Link to="/settings">
            <motion.button
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 px-6 rounded-xl font-medium shadow-lg"
              whileTap={{ scale: 0.98 }}
              whileHover={{ scale: 1.02 }}
            >
              Configure Provider
            </motion.button>
          </Link>
          
          <Link to="/chat">
            <motion.button
              className="w-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 py-3 px-6 rounded-xl font-medium"
              whileTap={{ scale: 0.98 }}
              whileHover={{ scale: 1.02 }}
            >
              Start Chatting
            </motion.button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

function TabBar() {
  const { pathname } = useLocation();
  
  return (
    <motion.nav 
      className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-2"
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 100, delay: 0.1 }}
    >
      <div className="flex justify-around">
        <NavItem to="/" icon={Home} label="Home" active={pathname === "/"} />
        <NavItem to="/chat" icon={MessageCircle} label="Chat" active={pathname === "/chat"} />
        <NavItem to="/settings" icon={Settings} label="Settings" active={pathname.startsWith("/settings")} />
      </div>
    </motion.nav>
  );
}

function NavItem({ to, icon: Icon, label, active }: { to: string; icon: any; label: string; active: boolean }) {
  return (
    <Link to={to} className="relative">
      <motion.div
        className={`flex flex-col items-center p-2 rounded-lg transition-colors ${
          active 
            ? "text-indigo-600 dark:text-indigo-400" 
            : "text-slate-600 dark:text-slate-400"
        }`}
        whileTap={{ scale: 0.95 }}
      >
        {active && (
          <motion.div
            className="absolute inset-0 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg"
            layoutId="activeTab"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}
        <Icon size={20} className="relative z-10" />
        <span className="text-xs mt-1 relative z-10">{label}</span>
      </motion.div>
    </Link>
  );
}

export default App;
