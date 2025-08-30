import { motion } from "framer-motion";
import { MessageCircle, Settings } from "lucide-react";
import { useLocation } from "react-router-dom";

import { CreateButton } from "./CreateButton";
import { TabItem } from "./TabItem";

export function TabBar({ onCreateClick }: { onCreateClick: () => void }) {
    const { pathname } = useLocation();

    return (
        <motion.nav
            className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-2"
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            transition={{ type: "spring", stiffness: 100, delay: 0.1 }}
        >
            <div className="flex justify-center items-center max-w-md mx-auto">
                <div className="w-20 flex justify-center">
                    <TabItem to="/chat" icon={MessageCircle} label="Chat" active={pathname === "/chat" || pathname === "/"} />
                </div>

                <div className="flex-shrink-0 mx-4">
                    <CreateButton onClick={onCreateClick} />
                </div>

                <div className="w-20 flex justify-center">
                    <TabItem to="/settings" icon={Settings} label="Settings" active={pathname.startsWith("/settings")} />
                </div>
            </div>
        </motion.nav>
    );
}
