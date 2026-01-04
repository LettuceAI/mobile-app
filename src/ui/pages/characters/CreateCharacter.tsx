import { useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import { useCharacterForm, Step } from "./hooks/useCharacterForm";
//import { ProgressIndicator } from "./components/ProgressIndicator";
import { IdentityStep } from "./components/IdentityStep";
import { StartingSceneStep } from "./components/StartingSceneStep";
import { DescriptionStep } from "./components/DescriptionStep";
import { TopNav } from "../../components/App";

export function CreateCharacterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, actions, computed } = useCharacterForm(location.state?.draftCharacter);

  const handleBack = () => {
    if (state.step === Step.Description) {
      actions.setStep(Step.StartingScene);
    } else if (state.step === Step.StartingScene) {
      actions.setStep(Step.Identity);
    } else {
      navigate(-1);
    }
  };

  const handleSave = async () => {
    const success = await actions.handleSave();
    if (success) {
      navigate("/chat");
    }
  };

  //const stepLabel = 
  //  state.step === Step.Identity ? "Identity" : 
  //  state.step === Step.StartingScene ? "Starting Scene" : 
  //  "Description";

  return (
    <div className="flex min-h-screen flex-col bg-[#050505] text-gray-100">
      <TopNav currentPath={location.pathname + location.search} onBackOverride={handleBack} />

      {/*<ProgressIndicator
        currentStep={state.step}
        stepLabel={stepLabel}
      />*/}

      <main className="flex flex-1 flex-col overflow-y-auto px-4 pb-20 pt-[calc(72px+env(safe-area-inset-top))]">
        <AnimatePresence mode="wait">
          {state.step === Step.Identity ? (
            <IdentityStep
              key="identity"
              name={state.name}
              onNameChange={actions.setName}
              avatarPath={state.avatarPath}
              onAvatarChange={actions.setAvatarPath}
              backgroundImagePath={state.backgroundImagePath}
              onBackgroundImageChange={actions.setBackgroundImagePath}
              onBackgroundImageUpload={actions.handleBackgroundImageUpload}
              disableAvatarGradient={state.disableAvatarGradient}
              onDisableAvatarGradientChange={actions.setDisableAvatarGradient}
              onContinue={() => actions.setStep(Step.StartingScene)}
              canContinue={computed.canContinueIdentity}
              onImport={actions.handleImport}
              onStartHelper={() => navigate("/create/character/helper")}
            />
          ) : state.step === Step.StartingScene ? (
            <StartingSceneStep
              key="starting-scene"
              scenes={state.scenes}
              onScenesChange={actions.setScenes}
              defaultSceneId={state.defaultSceneId}
              onDefaultSceneIdChange={actions.setDefaultSceneId}
              onContinue={() => actions.setStep(Step.Description)}
              canContinue={computed.canContinueStartingScene}
            />
          ) : (
            <DescriptionStep
              key="description"
              description={state.description}
              onDescriptionChange={actions.setDescription}
              models={state.models}
              loadingModels={state.loadingModels}
              selectedModelId={state.selectedModelId}
              onSelectModel={actions.setSelectedModelId}
              memoryType={state.memoryType}
              dynamicMemoryEnabled={state.dynamicMemoryEnabled}
              onMemoryTypeChange={actions.setMemoryType}
              promptTemplates={state.promptTemplates}
              loadingTemplates={state.loadingTemplates}
              systemPromptTemplateId={state.systemPromptTemplateId}
              onSelectSystemPrompt={actions.setSystemPromptTemplateId}
              onSave={handleSave}
              canSave={computed.canSaveDescription}
              saving={state.saving}
              error={state.error}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
