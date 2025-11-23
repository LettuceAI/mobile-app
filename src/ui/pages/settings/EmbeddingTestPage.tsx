import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { storageBridge } from "../../../core/storage/files";
import { cn } from "../../design-tokens";

export function EmbeddingTestPage() {
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
    const [error, setError] = useState<string | null>(null);

    const runTest = async () => {
        setTestStatus("testing");
        setError(null);
        setTestResults(null);

        try {
            const results = await storageBridge.runEmbeddingTest();
            setTestResults(results);

            if (results.success) {
                setTestStatus("passed");
            } else {
                setTestStatus("failed");
            }
        } catch (err) {
            setTestStatus("failed");
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    // Run test automatically on mount
    useEffect(() => {
        runTest();
    }, []);

    return (
        <div className="flex min-h-screen flex-col">
            <main className="flex-1 px-4 pb-24 pt-6">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-auto w-full max-w-2xl space-y-6"
                >

                    {/* Test Status Card */}
                    <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                        <div className="mb-6 flex justify-center">
                            {testStatus === "testing" && (
                                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-yellow-400/20 bg-yellow-500/10">
                                    <Loader2 className="h-10 w-10 text-yellow-400 animate-spin" />
                                </div>
                            )}
                            {testStatus === "passed" && (
                                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-green-400/20 bg-green-500/10">
                                    <CheckCircle className="h-10 w-10 text-green-400" />
                                </div>
                            )}
                            {testStatus === "failed" && (
                                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-red-400/20 bg-red-500/10">
                                    <XCircle className="h-10 w-10 text-red-400" />
                                </div>
                            )}
                        </div>

                        <h2 className="text-xl font-semibold text-white mb-2">
                            {testStatus === "testing" && "Running Tests..."}
                            {testStatus === "passed" && "Verification Passed"}
                            {testStatus === "failed" && "Verification Failed"}
                        </h2>

                        <p className="text-white/60 max-w-md mx-auto">
                            {testStatus === "testing" && "Calculating embeddings and similarity scores for test phrases..."}
                            {testStatus === "passed" && "The model is correctly identifying semantic similarities."}
                            {testStatus === "failed" && "The model produced unexpected results. It may be corrupted or incompatible."}
                        </p>

                        {testStatus !== "testing" && (
                            <button
                                onClick={runTest}
                                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Run Test Again
                            </button>
                        )}
                    </div>

                    {/* Detailed Results */}
                    {testResults && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4"
                        >
                            <h3 className="text-lg font-medium text-white px-1">Detailed Results</h3>

                            <div className="space-y-3">
                                {testResults.scores.map((score, idx) => (
                                    <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-white/80">{score.pairName}</span>
                                            <span className={cn(
                                                "text-lg font-bold",
                                                score.similarityScore > 0.6 ? "text-green-400" : "text-yellow-400"
                                            )}>
                                                {(score.similarityScore * 100).toFixed(1)}%
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-white/50 bg-black/20 rounded-lg p-3 mb-2">
                                            <div>
                                                <span className="block uppercase tracking-wider opacity-50 mb-1">Text A</span>
                                                "{score.textA}"
                                            </div>
                                            <div>
                                                <span className="block uppercase tracking-wider opacity-50 mb-1">Text B</span>
                                                "{score.textB}"
                                            </div>
                                        </div>

                                        <div className="text-xs text-white/40 flex items-center gap-2">
                                            <Info className="h-3 w-3" />
                                            Expected Result: {score.expected}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-200 text-sm">
                            <p className="font-medium mb-1">Error Occurred</p>
                            {error}
                        </div>
                    )}
                </motion.div>
            </main>
        </div>
    );
}

function Info({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
        </svg>
    );
}
