
import { useEffect } from "react";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { exit } from "@tauri-apps/plugin-process";
import { useLocation } from "react-router-dom";
import { PluginListener } from "@tauri-apps/api/core";
import { useNavigationManager } from "../navigation";

export function useAndroidBackHandler(
    options?: {
        canLeave?: () => boolean | Promise<boolean>;
        onRootBack?: () => Promise<void> | void;
        // Optional fallback route to use instead of exiting when there is no history entry.
        fallbackPath?: string;
    }
) {
    const { back, backOrReplace } = useNavigationManager();
    const location = useLocation();

    useEffect(() => {
        let unlisten: PluginListener | undefined;

        (async () => {
            unlisten = await onBackButtonPress(async () => {
                if (options?.canLeave) {
                    const ok = await options.canLeave();
                    if (!ok) return;
                }
                const idx = (window.history.state && (window.history.state as any).idx) ?? 0;
                if (idx > 0) {
                    back();
                } else {
                    const fallback = options?.fallbackPath;
                    if (fallback) {
                        backOrReplace(fallback);
                        return;
                    }
                    await options?.onRootBack?.();
                    await exit(0);
                }
            });
        })();

        return () => { unlisten?.unregister(); };
    }, [location.key, back, backOrReplace, options?.canLeave, options?.onRootBack, options?.fallbackPath]);
}
