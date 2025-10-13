import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import { useCharacterForm, Step } from "./hooks/useCharacterForm";
import { CreateCharacterHeader } from "./components/CreateCharacterHeader";
import { ProgressIndicator } from "./components/ProgressIndicator";
import { IdentityStep } from "./components/IdentityStep";
import { StartingSceneStep } from "./components/StartingSceneStep";
import { DescriptionStep } from "./components/DescriptionStep";
import { AvatarPreview } from "./components/AvatarPreview";

export function CreateCharacterPage() {
  const navigate = useNavigate();
  const { state, actions, computed } = useCharacterForm();

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

  const stepLabel = 
    state.step === Step.Identity ? "Identity" : 
    state.step === Step.StartingScene ? "Starting Scene" : 
    "Description";

  return (
    <div className="flex min-h-screen flex-col bg-[#050505] text-gray-100">
      <CreateCharacterHeader onBack={handleBack} />

      {/*<ProgressIndicator
        currentStep={state.step}
        stepLabel={stepLabel}
      />*/}

      <main className="flex-1 overflow-y-auto px-4 pb-20 pt-4">
        <AnimatePresence mode="wait">
          {state.step === Step.Identity ? (
            <IdentityStep
              key="identity"
              name={state.name}
              onNameChange={actions.setName}
              avatarPath={state.avatarPath}
              onAvatarChange={actions.setAvatarPath}
              onUpload={actions.handleAvatarUpload}
              onContinue={() => actions.setStep(Step.StartingScene)}
              canContinue={computed.canContinueIdentity}
              avatarPreview={
                <AvatarPreview avatarPath={state.avatarPath} name={state.name} />
              }
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
