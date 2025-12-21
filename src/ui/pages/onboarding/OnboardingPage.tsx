import { ArrowLeft, Loader } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useOnboardingController, OnboardingStep } from "./hooks/useOnboardingController";
import { ProviderStep } from "./steps/ProviderStep";
import { ModelStep } from "./steps/ModelStep";
import { MemoryStep } from "./steps/MemoryStep";
import { ModelRecommendations } from "./ModelRecommendations";
import { cn, typography } from "../../design-tokens";
import { getPlatform } from "../../../core/utils/platform";
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { checkEmbeddingModel } from "../../../core/storage/repo";

export function OnboardingPage() {
    const navigate = useNavigate();
    const platform = getPlatform();
    const isDesktop = platform.type === "desktop";
    const controller = useOnboardingController();
    const { state } = controller;

    // Modal state for memory download prompt
    const [showDownloadModal, setShowDownloadModal] = useState(false);
    const [showRecommendations, setShowRecommendations] = useState(false);

    const stepLabel =
        state.step === OnboardingStep.Provider ? "Provider Setup" :
            state.step === OnboardingStep.Model ? "Model Setup" :
                "Memory System";

    const stepNumber =
        state.step === OnboardingStep.Provider ? 1 :
            state.step === OnboardingStep.Model ? 2 : 3;

    // Handle finish - checks for embedding model if dynamic is selected
    const handleFinish = useCallback(async () => {
        if (!state.memoryType) return;

        if (state.memoryType === "dynamic") {
            try {
                const modelExists = await checkEmbeddingModel();
                if (modelExists) {
                    // Model already downloaded, just finish
                    await controller.handleFinish();
                } else {
                    // Show download modal
                    setShowDownloadModal(true);
                }
            } catch (error) {
                console.error("Failed to check embedding model:", error);
                setShowDownloadModal(true);
            }
        } else {
            // Manual mode - just finish
            await controller.handleFinish();
        }
    }, [state.memoryType, controller]);

    // Handle download confirmation
    const handleConfirmDownload = useCallback(() => {
        setShowDownloadModal(false);
        navigate("/settings/embedding-download?returnTo=/chat?firstTime=true");
    }, [navigate]);

    // Handle skip download
    const handleSkipDownload = useCallback(async () => {
        setShowDownloadModal(false);
        // Save with dynamic memory disabled since no model
        controller.handleSelectMemoryType("manual");
        await controller.handleFinish();
    }, [controller]);

    // Loading state
    if (state.capabilitiesLoading && state.step === OnboardingStep.Provider) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] text-gray-200">
                <div className="flex items-center gap-3">
                    <Loader size={20} className="animate-spin" />
                    <span>Loading providers...</span>
                </div>
            </div>
        );
    }

    // Animation variants for step transitions
    const pageVariants = {
        initial: { opacity: 0, x: 20 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -20 },
    };

    return (
        <div className="flex min-h-screen flex-col bg-[#050505] text-gray-200 overflow-hidden">
            {/* Header */}
            <div className={cn(
                "flex items-center justify-between border-b border-white/10",
                isDesktop ? "px-8 py-6" : "px-4 py-4"
            )}>
                <button
                    onClick={controller.goBack}
                    className={cn(
                        "flex items-center justify-center rounded-full border border-white/15 bg-white/8 text-white transition-all duration-200 hover:border-white/30 hover:bg-white/15 active:scale-[0.98]",
                        isDesktop ? "w-11 h-11" : "w-10 h-10"
                    )}
                >
                    <ArrowLeft size={isDesktop ? 18 : 16} />
                </button>
                <div className="text-center">
                    <p className={cn(typography.caption.size, "font-medium uppercase tracking-[0.25em] text-gray-500")}>
                        Step {stepNumber} of 3
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{stepLabel}</p>
                </div>
                <div className={isDesktop ? "w-11" : "w-10"} />
            </div>

            {/* Main Content */}
            <main className={cn(
                "flex flex-1 flex-col overflow-hidden",
                !isDesktop && "px-4 pt-4 overflow-y-auto"
            )}>
                {showRecommendations ? (
                    <ModelRecommendations onBack={() => setShowRecommendations(false)} />
                ) : (
                    <AnimatePresence mode="wait">
                        {state.step === OnboardingStep.Provider && (
                            <motion.div
                                key="provider"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{ duration: 0.2 }}
                                className="flex flex-1 flex-col"
                            >
                                <ProviderStep
                                    capabilities={state.capabilities}
                                    selectedProviderId={state.selectedProviderId}
                                    label={state.providerLabel}
                                    apiKey={state.apiKey}
                                    baseUrl={state.baseUrl}
                                    testResult={state.testResult}
                                    isTesting={state.isTesting}
                                    isSubmitting={state.isSubmittingProvider}
                                    canTest={controller.canTestProvider}
                                    canSave={controller.canSaveProvider}
                                    onSelectProvider={controller.handleSelectProvider}
                                    onLabelChange={controller.handleProviderLabelChange}
                                    onApiKeyChange={controller.handleApiKeyChange}
                                    onBaseUrlChange={controller.handleBaseUrlChange}
                                    onTestConnection={controller.handleTestConnection}
                                    onSave={controller.handleSaveProvider}
                                />
                            </motion.div>
                        )}

                        {state.step === OnboardingStep.Model && (
                            <motion.div
                                key="model"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{ duration: 0.2 }}
                                className="flex flex-1 flex-col"
                            >
                                <ModelStep
                                    providers={state.providerCredentials}
                                    selectedCredential={state.selectedCredential}
                                    modelName={state.modelName}
                                    displayName={state.displayName}
                                    error={state.modelError}
                                    isLoading={state.modelLoading}
                                    isSaving={state.isSavingModel}
                                    canSave={controller.canSaveModel}
                                    onSelectCredential={controller.handleSelectCredential}
                                    onModelNameChange={controller.handleModelNameChange}
                                    onDisplayNameChange={controller.handleDisplayNameChange}
                                    onSave={controller.handleSaveModel}
                                    onSkip={controller.handleSkipModel}
                                    onGoBack={controller.goBack}
                                    onShowRecommendations={() => setShowRecommendations(true)}
                                />
                            </motion.div>
                        )}

                        {state.step === OnboardingStep.Memory && (
                            <motion.div
                                key="memory"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{ duration: 0.2 }}
                                className="flex flex-1 flex-col"
                            >
                                <MemoryStep
                                    selectedType={state.memoryType}
                                    isProcessing={state.isProcessingMemory}
                                    showDownloadModal={showDownloadModal}
                                    onSelectType={controller.handleSelectMemoryType}
                                    onFinish={handleFinish}
                                    onCloseModal={() => setShowDownloadModal(false)}
                                    onConfirmDownload={handleConfirmDownload}
                                    onSkipDownload={handleSkipDownload}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
            </main>
        </div>
    );
}
