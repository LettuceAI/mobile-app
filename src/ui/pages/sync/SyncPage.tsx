import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "react-qr-code";
import {
    Smartphone,
    Monitor,
    Loader2,
    CheckCircle,
    AlertTriangle,
    Wifi,
    Copy,
    Check,
    HelpCircle,
    X,
    RefreshCw
} from "lucide-react";
import { interactive, radius, cn } from "../../design-tokens";
import { BottomMenu, MenuButton } from "../../components/BottomMenu";

type SyncStatus =
    | { status: "Idle" }
    | { status: "DriverRunning", details: { ip: string, port: number, pin: string, clients: number } }
    | { status: "PendingApproval", details: { ip: string, device_name: string } }
    | { status: "PendingSyncStart", details: { ip: string, device_name: string } }
    | { status: "PassengerConnecting" }
    | { status: "PassengerConnected", details: { driver_ip: string } }
    | { status: "Syncing", details: { phase: string, progress: number | null } }
    | { status: "SyncCompleted" }
    | { status: "Error", details: { message: string } };

export function SyncPage() {
    const [activeTab, setActiveTab] = useState<"host" | "client">("client");
    const [status, setStatus] = useState<SyncStatus>({ status: "Idle" });
    const [hostIp, setHostIp] = useState("");
    const [hostPort] = useState("8000");
    const [localIp, setLocalIp] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [pin, setPin] = useState(""); // PIN for joining
    const [isStartingHost, setIsStartingHost] = useState(false);
    const [isConnectingToHost, setIsConnectingToHost] = useState(false);
    const [role, setRole] = useState<"host" | "client" | null>(null);
    const [isAccepting, setIsAccepting] = useState(false);
    const [isStartingSyncSession, setIsStartingSyncSession] = useState(false);

    // Poll status
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const s = await invoke<SyncStatus>("get_sync_status");
                setStatus(s);
            } catch (e) {
                console.error("Failed to get sync status", e);
            }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 500); // Fast polling for responsive UI
        return () => {
            clearInterval(interval);
            invoke("stop_sync").catch(console.error);
        };
    }, []);

    // Clear loading states when status changes
    useEffect(() => {
        if (status.status === "DriverRunning") {
            setIsStartingHost(false);
        }
        if (status.status !== "Idle" && status.status !== "Error") {
            setIsConnectingToHost(false);
        }
    }, [status]);

    // Get Local IP
    useEffect(() => {
        console.log("Getting local IP");
        invoke<string>("get_local_ip").then(setLocalIp).catch(console.error);
        console.log("Local IP", localIp);
    }, []);

    const startHost = async () => {
        setIsStartingHost(true);
        setRole("host");
        try {
            await invoke("start_driver", { port: 8000 });
            // Loading state cleared by useEffect when status changes
        } catch (e) {
            console.error("Failed to start driver", e);
            setIsStartingHost(false);
            setRole(null);
        }
    };

    const connectToHost = async () => {
        setIsConnectingToHost(true);
        setRole("client");
        try {
            console.log("Connecting to host", hostIp, hostPort, "with PIN", pin);
            await invoke("connect_as_passenger", { ip: hostIp, port: parseInt(hostPort), pin });
            // Loading state cleared by useEffect when status changes
        } catch (e) {
            console.error("Failed to connect", e);
            setIsConnectingToHost(false);
            setRole(null);
        }
    };

    const stopSync = async () => {
        try {
            await invoke("stop_sync");
            setStatus({ status: "Idle" });
        } catch (e) {
            console.error("Failed to stop sync", e);
        }
    };

    const isIdle = status.status === "Idle";
    const isDriver = status.status === "DriverRunning";
    const isCompleted = status.status === "SyncCompleted";
    const isSyncing = status.status === "Syncing";
    const isError = status.status === "Error";
    const isConnecting = status.status === "PassengerConnecting";
    const isConnected = status.status === "PassengerConnected";
    const isPendingApproval = status.status === "PendingApproval";
    const isReadyToStart = status.status === "PendingSyncStart";

    const handleApproval = async (allow: boolean) => {
        if (status.status === "PendingApproval") {
            if (allow) setIsAccepting(true);
            try {
                await invoke("approve_connection", { ip: status.details.ip, allow });
            } catch (e) {
                console.error("Failed to approve connection", e);
                setIsAccepting(false);
            }
        }
    };

    const handleStartSync = async () => {
        if (status.status === "PendingSyncStart") {
            setIsStartingSyncSession(true);
            try {
                await invoke("start_sync_session", { ip: status.details.ip });
            } catch (e) {
                console.error("Failed to start sync session", e);
                setIsStartingSyncSession(false);
            }
        }
    };

    const copyAddress = (ipToCopy: string | null) => {
        const addr = ipToCopy ? `${ipToCopy}:8000` : null;
        if (addr) {
            navigator.clipboard.writeText(addr);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="flex h-full flex-col pb-16 relative">
            <BottomMenu
                isOpen={isPendingApproval}
                onClose={() => handleApproval(false)}
                title="Connection Request"
            >
                <div className="mb-6 px-1 text-center">
                    <div className="mb-4 flex justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-blue-500/20 to-indigo-500/20 border border-white/10">
                            <Smartphone className="h-8 w-8 text-blue-300" />
                        </div>
                    </div>
                    <h4 className="text-lg font-medium text-white mb-1">
                        {(status as any).details?.device_name || "Unknown Device"}
                    </h4>
                    <p className="text-sm text-white/50 font-mono mb-2">
                        {(status as any).details?.ip}
                    </p>
                    <p className="text-sm text-white/40">
                        wants to sync with this device.
                    </p>
                </div>

                <div className="space-y-3">
                    <MenuButton
                        icon={Check}
                        title="Accept Connection"
                        description="Allow this device to sync data"
                        color="from-emerald-500 to-emerald-600"
                        onClick={() => handleApproval(true)}
                        loading={isAccepting}
                    />
                    <MenuButton
                        icon={X}
                        title="Decline"
                        description="Block this connection attempt"
                        color="from-rose-500 to-red-600"
                        onClick={() => handleApproval(false)}
                        disabled={isAccepting}
                    />
                </div>
            </BottomMenu>

            <BottomMenu
                isOpen={isReadyToStart}
                onClose={() => { }}
                title="Ready to Sync"
                includeExitIcon={false}
            >
                <div className="mb-6 px-1 text-center">
                    <div className="mb-4 flex justify-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-green-500/20 to-emerald-500/20 border border-white/10">
                            <Check className="h-8 w-8 text-green-300" />
                        </div>
                    </div>
                    <h4 className="text-lg font-medium text-white mb-1">
                        Connection Established
                    </h4>
                    <p className="text-sm text-white/50 mb-2">
                        {(status as any).details?.device_name} is ready.
                    </p>
                    <p className="text-sm text-white/40">
                        Tap below to start synchronizing data.
                    </p>
                </div>

                <div className="space-y-3">
                    <MenuButton
                        icon={RefreshCw}
                        title="Start Syncing"
                        description="Begin data transfer now"
                        color="from-blue-500 to-blue-600"
                        onClick={handleStartSync}
                        loading={isStartingSyncSession}
                    />
                </div>
            </BottomMenu>

            <section className="flex-1 overflow-y-auto px-3 pt-3 space-y-4">
                {/* Status Banners */}
                {isCompleted && (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                        <CheckCircle className="h-5 w-5 shrink-0 text-emerald-400" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-emerald-200">Sync Complete!</p>
                            <p className="text-xs text-emerald-200/60">All data synchronized</p>
                        </div>
                        <button onClick={stopSync} className="text-emerald-300/60 hover:text-emerald-300 text-lg px-1">×</button>
                    </div>
                )}

                {isError && (
                    <div className="flex items-center gap-3 rounded-xl border border-red-400/20 bg-red-400/10 p-3">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-red-200">Connection Error</p>
                            <p className="text-xs text-red-200/60">{(status as any).details?.message}</p>
                        </div>
                        <button onClick={stopSync} className="text-red-300/60 hover:text-red-300 text-lg px-1">×</button>
                    </div>
                )}

                {/* Idle Mode Selection */}
                {isIdle && (
                    <div>
                        <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">Mode</h2>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setActiveTab("client")}
                                className={cn(
                                    "flex-1 rounded-xl border p-3 text-left",
                                    interactive.transition.default,
                                    activeTab === "client" ? "border-blue-400/30 bg-blue-400/10" : "border-white/10 bg-white/5",
                                    "active:scale-[0.99]"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-full border", activeTab === "client" ? "border-blue-400/30 bg-blue-400/15" : "border-white/10 bg-white/10")}>
                                        <Smartphone className={cn("h-5 w-5", activeTab === "client" ? "text-blue-300" : "text-white/60")} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-white">Join</p>
                                        <p className="text-[11px] text-white/50">Connect to host</p>
                                    </div>
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveTab("host")}
                                className={cn(
                                    "flex-1 rounded-xl border p-3 text-left",
                                    interactive.transition.default,
                                    activeTab === "host" ? "border-emerald-400/30 bg-emerald-400/10" : "border-white/10 bg-white/5",
                                    "active:scale-[0.99]"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-full border", activeTab === "host" ? "border-emerald-400/30 bg-emerald-400/15" : "border-white/10 bg-white/10")}>
                                        <Monitor className={cn("h-5 w-5", activeTab === "host" ? "text-emerald-300" : "text-white/60")} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-white">Host</p>
                                        <p className="text-[11px] text-white/50">Share your data</p>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                )}

                {/* Join UI */}
                {(isIdle || isError) && activeTab === "client" && (
                    <div className="space-y-3">
                        <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">Connect to Host</h2>
                        <div className="border border-white/10 bg-white/5 p-4 rounded-xl space-y-3">
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-white/50">Host Address</label>
                                <input
                                    type="text"
                                    value={hostIp}
                                    onChange={(e) => setHostIp(e.target.value.split(":")[0])}
                                    placeholder="e.g. 192.168.1.100"
                                    className={cn("w-full border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 font-mono", radius.lg, "focus:border-white/20 focus:outline-none")}
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-white/50">PIN Code</label>
                                <input
                                    type="text"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    placeholder="000000"
                                    maxLength={6}
                                    className={cn(
                                        "w-full border border-white/10 bg-white/5 px-4 py-3 text-white font-mono text-center text-xl",
                                        pin ? "tracking-[0.3em]" : "tracking-normal",
                                        radius.lg,
                                        "focus:border-white/20 focus:outline-none placeholder-white/20"
                                    )}
                                />
                            </div>
                        </div>
                        <button
                            onClick={connectToHost}
                            disabled={!hostIp || pin.length !== 6 || isConnectingToHost}
                            className={cn("flex w-full items-center justify-center gap-2 bg-blue-500 px-4 py-3 text-sm font-medium text-white", radius.lg, "hover:bg-blue-600 disabled:opacity-50")}
                        >
                            {isConnectingToHost ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Connecting...
                                </>
                            ) : (
                                <>
                                    <Wifi className="h-4 w-4" /> Connect
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Host Setup UI */}
                {isIdle && activeTab === "host" && (
                    <div className="space-y-3">
                        <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">Start Hosting </h2>
                        <div className="border border-white/10 bg-white/5 p-4 rounded-xl">
                            <div className="flex items-start gap-3">
                                <Monitor className="h-5 w-5 text-white/40 mt-0.5" />
                                <div>
                                    <p className="text-sm text-white/70">Other devices can connect and sync data from this device.</p>
                                    <p className="mt-1 text-xs text-white/40">Your data will be shared with connected clients.</p>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={startHost}
                            disabled={isStartingHost}
                            className={cn("flex w-full items-center justify-center gap-2 bg-emerald-500 px-4 py-3 text-sm font-medium text-white", radius.lg, "hover:bg-emerald-600 disabled:opacity-50 transition-all")}
                        >
                            {isStartingHost ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Starting server...
                                </>
                            ) : (
                                <>
                                    <Wifi className="h-4 w-4" /> Start Hosting
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Connecting / Syncing UI (Passenger Only) */}
                {role === "client" && (isConnecting || isSyncing || isConnected) && (
                    <div className="space-y-3">
                        <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">Status</h2>
                        <div className="border border-blue-400/20 bg-blue-400/10 p-4 rounded-xl">
                            <div className="flex items-center gap-3">
                                <Loader2 className="h-5 w-5 animate-spin text-blue-300" />
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-blue-200">
                                        {isConnecting && "Connecting..."}
                                        {isConnected && "Connected"}
                                        {isSyncing && "Syncing..."}
                                    </p>
                                    {isSyncing && <p className="text-xs text-blue-200/60">{(status as any).details?.phase}</p>}
                                </div>
                            </div>
                        </div>
                        <button onClick={stopSync} className={cn("w-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/70", radius.lg)}>Cancel</button>
                    </div>
                )}

                {/* Active Host UI (The Vertical Mobile-Optimized One) */}
                {role === "host" && (isDriver || isPendingApproval || isReadyToStart || isSyncing) && (
                    <div className="space-y-4 pb-6">
                        <div className="flex items-center justify-between px-1">
                            <h2 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">Hosting Service</h2>
                            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                </span>
                                <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider">Live</span>
                            </div>
                        </div>

                        <div className="border border-white/10 bg-white/5 p-6 rounded-2xl">
                            <div className="flex flex-col items-center">
                                {isSyncing ? (
                                    <>
                                        <div className="flex h-[180px] w-[180px] items-center justify-center mb-6">
                                            <div className="text-center">
                                                <Loader2 className="h-12 w-12 animate-spin text-blue-400 mx-auto mb-4" />
                                                <p className="text-lg font-medium text-blue-200">Syncing...</p>
                                                <p className="text-sm text-blue-200/60 mt-1">{(status as any).details?.phase || "Transferring data"}</p>
                                            </div>
                                        </div>
                                        <div className="w-full text-center space-y-3">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">Sync in Progress</p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="bg-white p-3 rounded-xl mb-6 shadow-2xl">
                                            <QRCode
                                                value={`${(status as any).details?.ip || localIp}:8000`}
                                                size={Math.min(window.innerWidth - 120, 180)}
                                            />
                                        </div>
                                        <div className="w-full text-center space-y-3">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">Local Network Address</p>
                                            <div className="flex items-center justify-center gap-2">
                                                <code className="text-2xl font-mono font-bold text-white leading-none">
                                                    {(status as any).details?.ip || localIp}:8000
                                                </code>
                                                <button
                                                    onClick={() => copyAddress((status as any).details?.ip || localIp)}
                                                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white/60"
                                                >
                                                    {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* PIN display (only when not syncing) */}
                        {!isSyncing && (
                            <div className="border border-emerald-400/20 bg-emerald-400/10 p-4 rounded-xl text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/60 mb-2">Connection PIN</p>
                                <code className="text-4xl font-mono font-bold text-emerald-300 tracking-[0.4em]">
                                    {(status as any).details?.pin || "------"}
                                </code>
                                <p className="text-xs text-emerald-200/40 mt-2">Share this PIN with the connecting device</p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div className="border border-white/10 bg-white/5 p-4 rounded-xl">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">Status</p>
                                <p className="text-sm font-medium text-emerald-400">Broadcasting</p>
                            </div>
                            <div className="border border-white/10 bg-white/5 p-4 rounded-xl">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">Connected</p>
                                <p className="text-sm font-medium text-white">{(status as any).details?.clients || 0} Clients</p>
                            </div>
                        </div>

                        <div className="border border-white/5 bg-white/2 p-4 rounded-xl">
                            <div className="flex items-center gap-2 mb-3">
                                <HelpCircle className="h-4 w-4 text-white/30" />
                                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 font-mono">Setup Guide</p>
                            </div>
                            <ul className="space-y-3">
                                {[
                                    "Open app on another device",
                                    "Go to Settings → Local Sync",
                                    "Scan the QR code or enter address"
                                ].map((step, i) => (
                                    <li key={i} className="flex gap-3 items-start text-xs text-white/50">
                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white/40">
                                            {i + 1}
                                        </span>
                                        <span className="leading-5">{step}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <button
                            onClick={stopSync}
                            className={cn(
                                "flex w-full items-center justify-center gap-2 bg-rose-500/10 border border-rose-500/20 px-4 py-4 text-sm font-semibold text-rose-400",
                                "radius-xl",
                                "hover:bg-rose-500/20 active:scale-[0.98] transition-all"
                            )}
                        >
                            <X className="h-4 w-4" /> Stop Hosting
                        </button>
                    </div>
                )}

                {/* Completed state footer */}
                {isCompleted && (
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={startHost}
                            className={cn("flex flex-1 items-center justify-center gap-2 bg-emerald-500 px-4 py-3 text-sm font-medium text-white", radius.lg)}
                        >
                            Host Again
                        </button>
                        <button
                            onClick={stopSync}
                            className={cn("flex-1 border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/70", radius.lg)}
                        >
                            Done
                        </button>
                    </div>
                )}

                <p className="px-1 text-[11px] text-white/30 pt-4">
                    Sync works over your local network. Both devices must be on the same WiFi.
                </p>
            </section>
        </div>
    );
}
