
import { useEffect } from "react";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { exit } from "@tauri-apps/plugin-process";
import { useLocation, useNavigate } from "react-router-dom";
import { PluginListener } from "@tauri-apps/api/core";

export function useAndroidBackHandler(
    options?: {
        canLeave?: () => boolean | Promise<boolean>;
        onRootBack?: () => Promise<void> | void;
    }
) {
    const navigate = useNavigate();
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
                    navigate(-1);
                } else {
                    await options?.onRootBack?.();
                    await exit(0);
                }
            });
        })();

        return () => { unlisten?.unregister(); };
    }, [location.key]);
}
