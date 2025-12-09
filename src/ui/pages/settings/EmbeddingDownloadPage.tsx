import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Download, X, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { storageBridge } from "../../../core/storage/files";
import { updateAdvancedSetting } from "../../../core/storage/advanced";
import { useNavigate, useSearchParams } from "react-router-dom";

export function EmbeddingDownloadPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = searchParams.get("returnTo");
    const [progress, setProgress] = useState<{
        downloaded: number;
        total: number;
        status: string;
        currentFileIndex: number;
        totalFiles: number;
        currentFileName: string;
    }>({
        downloaded: 0,
        total: 0,
        status: "idle",
        currentFileIndex: 0,
        totalFiles: 0,
        currentFileName: "",
    });
    const [error, setError] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [testStatus, setTestStatus] = useState<"idle" | "testing" | "passed" | "failed">("idle");
    const [testResults, setTestResults] = useState<{
        success: boolean;
        message: string;
        scores: Array<{
            pairName: string;
            textA: string;
            textB: string;
            similarityScore: number;
            expected: string;
        }>;
    } | null>(null);
    const [countdown, setCountdown] = useState<number>(5);

    useEffect(() => {
        let mounted = true;
        let unsubscribe: (() => void) | null = null;

        const initDownload = async () => {
            try {
                const currentProgress = await storageBridge.getEmbeddingDownloadProgress();

                if (currentProgress.status === "completed") {
                    if (returnTo) {
                        navigate(returnTo, { replace: true });
                    } else {
                        navigate("/settings/advanced/memory", { replace: true });
                    }
                    return;
                }

                unsubscribe = await storageBridge.listenToEmbeddingDownloadProgress((progressData) => {
                    console.log("Progress update:", progressData);
                    if (mounted) {
                        setProgress(progressData);

                        if (progressData.status === "completed") {
                            setIsDownloading(false);
                            runTest();
                        } else if (progressData.status === "failed" || progressData.status === "cancelled") {
                            setIsDownloading(false);
                        }
                    }
                });

                if (currentProgress.status === "downloading") {
                    console.log("Download already in progress, attaching...");
                    setIsDownloading(true);
                    setProgress(currentProgress);
                    return;
                }

                setIsDownloading(true);
                await storageBridge.startEmbeddingDownload();

            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);

                if (errorMessage.includes("Download already in progress")) {
                    console.log("Race condition caught, attaching to existing download...");
                    if (mounted) {
                        setIsDownloading(true);
                    }
                } else {
                    if (mounted) {
                        setError(errorMessage);
                        setIsDownloading(false);
                    }
                }
            }
        };

        initDownload();

        return () => {
            mounted = false;
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [navigate]);

    // Run embedding test
    const runTest = async () => {
        setTestStatus("testing");
        setError(null);

        try {
            const results = await storageBridge.runEmbeddingTest();
            setTestResults(results);

            if (results.success) {
                setTestStatus("passed");
                // Enable dynamic memory
                await updateAdvancedSetting("dynamicMemory", {
                    enabled: true,
                    summaryMessageInterval: 20,
                    maxEntries: 50,
                    minSimilarityThreshold: 0.35,
                    hotMemoryTokenBudget: 2000,
                    decayRate: 0.08,
                    coldThreshold: 0.3,
                });
            } else {
                setTestStatus("failed");
            }
        } catch (err) {
            setTestStatus("failed");
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    // Countdown and redirect after successful test
    useEffect(() => {
        if (testStatus === "passed") {
            setCountdown(5);
            const timer = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        if (returnTo) {
                            navigate(returnTo, { replace: true });
                        } else {
                            navigate("/settings/advanced", { replace: true });
                        }
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        }
    }, [testStatus, navigate]);

    const handleCancel = async () => {
        try {
            await storageBridge.cancelEmbeddingDownload();
            await updateAdvancedSetting("dynamicMemory", {
                enabled: false,
                summaryMessageInterval: 20,
                maxEntries: 50,
                minSimilarityThreshold: 0.35,
                hotMemoryTokenBudget: 2000,
                decayRate: 0.08,
                coldThreshold: 0.3,
            });
            if (returnTo) {
                navigate(returnTo);
            } else {
                navigate("/settings/advanced");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
    };

    const progressPercent =
        testStatus !== "idle" ? 100 :
            progress.total > 0 ? (progress.downloaded / progress.total) * 100 : 0;

    return (
        <div className="flex min-h-screen flex-col">
            <main className="flex-1 px-4 pb-24 pt-6">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-auto w-full max-w-2xl space-y-6"
                >
                    {/* Header */}
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-white">
                            {testStatus === "idle" && "Downloading Embedding Model"}
                            {testStatus === "testing" && "Testing Model"}
                            {testStatus === "passed" && "Test Passed!"}
                            {testStatus === "failed" && "Test Failed"}
                        </h1>
                        <p className="mt-2 text-sm text-white/60">
                            {testStatus === "idle" && "Dynamic Memory requires a local embedding model to function"}
                            {testStatus === "testing" && "Verifying model functionality..."}
                            {testStatus === "passed" && `Redirecting in ${countdown} seconds...`}
                            {testStatus === "failed" && "Model verification failed. Please try again."}
                        </p>
                    </div>

                    {/* Download/Test Progress Card */}
                    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                        {/* Icon */}
                        <div className="mb-4 flex justify-center">
                            {testStatus === "idle" && (
                                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-blue-400/20 bg-blue-500/10">
                                    <Download className="h-8 w-8 text-blue-400" />
                                </div>
                            )}
                            {testStatus === "testing" && (
                                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-yellow-400/20 bg-yellow-500/10">
                                    <Loader2 className="h-8 w-8 text-yellow-400 animate-spin" />
                                </div>
                            )}
                            {testStatus === "passed" && (
                                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-green-400/20 bg-green-500/10">
                                    <CheckCircle className="h-8 w-8 text-green-400" />
                                </div>
                            )}
                            {testStatus === "failed" && (
                                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-red-400/20 bg-red-500/10">
                                    <XCircle className="h-8 w-8 text-red-400" />
                                </div>
                            )}
                        </div>

                        <div className="space-y-6">
                            {/* File Info - Above Progress Bar */}
                            {progress.status.toLowerCase().includes("downloading") && (
                                <div className="space-y-2">
                                    <div className="text-center">
                                        <div className="text-sm font-medium text-white/80">
                                            File {progress.currentFileIndex} of {progress.totalFiles}
                                        </div>
                                        {progress.currentFileName && (
                                            <div className="mt-1 text-xs text-white/50 font-mono">
                                                {progress.currentFileName}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Progress Bar */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-white/70">Progress</span>
                                    <span className="font-medium text-white">{Math.round(progressPercent)}%</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                                    <motion.div
                                        className="h-full bg-green-500"
                                        initial={{ width: 0 }}
                                        animate={{
                                            width: progress.total > 0 ? `${(progress.downloaded / progress.total) * 100}%` : "0%",
                                        }}
                                        transition={{ duration: 0.3 }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-white/50">
                                    <span>{formatBytes(progress.downloaded)}</span>
                                    <span>{formatBytes(progress.total)}</span>
                                </div>
                            </div>

                            {/* Status */}
                            <div className="text-center text-sm text-white/60">
                                {testStatus === "idle" && progress.status === "downloading" && "Downloading..."}
                                {testStatus === "idle" && progress.status === "completed" && "Download completed!"}
                                {testStatus === "idle" && progress.status === "failed" && "Download failed"}
                                {testStatus === "idle" && progress.status === "cancelled" && "Download cancelled"}
                                {testStatus === "testing" && "Running verification tests..."}
                                {testStatus === "passed" && "All tests passed successfully"}
                                {testStatus === "failed" && "Verification failed"}
                            </div>

                            {/* Test Results */}
                            {testResults && (testStatus === "passed" || testStatus === "failed") && (
                                <div className="mt-6 space-y-4">
                                    <div className="text-center">
                                        <div className={`text-sm font-medium ${testResults.success ? "text-green-400" : "text-red-400"
                                            }`}>
                                            {testResults.message}
                                        </div>
                                    </div>

                                    {/* Similarity Scores */}
                                    <div className="space-y-3">
                                        {testResults.scores.map((score, idx) => (
                                            <div key={idx} className="rounded-lg border border-white/10 bg-white/5 p-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-medium text-white/70">{score.pairName}</span>
                                                    <span className={`text-sm font-bold ${score.similarityScore > 0.6 ? "text-green-400" : "text-yellow-400"
                                                        }`}>
                                                        {score.similarityScore.toFixed(4)}
                                                    </span>
                                                </div>
                                                <div className="mt-1 text-xs text-white/50">
                                                    Expected: {score.expected}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                                <p className="text-sm text-red-200">{error}</p>
                            </div>
                        )}
                    </div>

                    {/* Cancel Button */}
                    {isDownloading && (
                        <button
                            onClick={handleCancel}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-6 py-3 text-sm font-medium text-red-200 transition hover:border-red-500/30 hover:bg-red-500/15"
                        >
                            <X className="h-4 w-4" />
                            Cancel Download
                        </button>
                    )}
                </motion.div>
            </main>
        </div>
    );
}
