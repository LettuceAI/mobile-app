import { 
  PROVIDER_PARAMETER_SUPPORT,
  type AdvancedModelSettings 
} from "../../core/storage/schemas";

interface ProviderParameterSupportInfoProps {
  providerId: string;
  compact?: boolean;
}

const PARAMETER_LABELS: Record<keyof AdvancedModelSettings, string> = {
  temperature: "Temperature",
  topP: "Top P",
  maxOutputTokens: "Max Tokens",
  frequencyPenalty: "Frequency Penalty",
  presencePenalty: "Presence Penalty",
  topK: "Top K",
};

const PARAMETER_DESCRIPTIONS: Record<keyof AdvancedModelSettings, string> = {
  temperature: "Controls randomness (0-2)",
  topP: "Nucleus sampling threshold (0-1)",
  maxOutputTokens: "Maximum response length",
  frequencyPenalty: "Reduce token repetition (-2 to 2)",
  presencePenalty: "Encourage new topics (-2 to 2)",
  topK: "Limit token pool size (1-500)",
};

/**
 * Display which parameters are supported by a specific provider
 * Optimized for bottom menu display
 */
export function ProviderParameterSupportInfo({ 
  providerId, 
  compact = false 
}: ProviderParameterSupportInfoProps) {
  const provider = PROVIDER_PARAMETER_SUPPORT[providerId as keyof typeof PROVIDER_PARAMETER_SUPPORT];

  if (!provider) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <p className="text-xs text-white/50">Unknown provider: {providerId}</p>
      </div>
    );
  }

  const parameters = Object.keys(provider.supportedParameters) as (keyof AdvancedModelSettings)[];

  if (compact) {
    const supported = parameters.filter(param => provider.supportedParameters[param]);
    return (
      <div className="flex flex-wrap gap-1">
        {supported.map(param => (
          <span 
            key={param}
            className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200"
          >
            {PARAMETER_LABELS[param]}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2">
        {parameters.map(param => {
          const isSupported = provider.supportedParameters[param];
          return (
            <div
              key={param}
              className={`flex items-center gap-3 rounded-lg border p-3 transition ${
                isSupported
                  ? 'border-emerald-400/20 bg-emerald-400/5'
                  : 'border-white/10 bg-white/5 opacity-50'
              }`}
            >
              <div className="flex-shrink-0">
                {isSupported ? (
                  <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">
                  {PARAMETER_LABELS[param]}
                </div>
                <div className="text-xs text-white/50 truncate">
                  {PARAMETER_DESCRIPTIONS[param]}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-blue-400/20 bg-blue-400/5 p-3">
        <div className="flex gap-2">
          <svg className="h-4 w-4 flex-shrink-0 text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-blue-200/80 leading-relaxed">
            Unsupported parameters will be ignored by {provider.displayName}. 
            Settings are saved and will apply when switching to compatible models.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Show a summary of all providers and their parameter support
 */
export function AllProvidersParameterSupport() {
  const allProviders = Object.values(PROVIDER_PARAMETER_SUPPORT);
  const allParams = Object.keys(PROVIDER_PARAMETER_SUPPORT.openai.supportedParameters) as (keyof AdvancedModelSettings)[];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">Provider Parameter Support Matrix</h3>
      
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="pb-2 pr-4 text-left font-medium text-white/60">Provider</th>
              {allParams.map(param => (
                <th key={param} className="pb-2 px-2 text-center font-medium text-white/60">
                  {PARAMETER_LABELS[param]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allProviders.map(provider => (
              <tr key={provider.providerId} className="border-b border-white/5">
                <td className="py-2.5 pr-4 font-medium text-white">
                  {provider.displayName}
                </td>
                {allParams.map(param => {
                  const isSupported = provider.supportedParameters[param];
                  return (
                    <td key={param} className="py-2.5 px-2 text-center">
                      {isSupported ? (
                        <svg className="mx-auto h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="mx-auto h-4 w-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-white/40 space-y-1">
        <p>✓ = Supported by provider API</p>
        <p>✗ = Not supported (parameter will be ignored)</p>
      </div>
    </div>
  );
}
