import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@multica/core/i18n/react';
import { ApiClient, setApiInstance } from '@multica/core/api';
import { configStore } from '@multica/core/config';
import { StepPlatformFork } from '../../packages/views/onboarding/steps/step-platform-fork';
import { StepRuntimeConnect } from '../../packages/views/onboarding/steps/step-runtime-connect';
import common from '../../packages/views/locales/en/common.json';
import onboarding from '../../packages/views/locales/en/onboarding.json';
import agents from '../../packages/views/locales/en/agents.json';
import runtimes from '../../packages/views/locales/en/runtimes.json';
import ui from '../../packages/views/locales/en/ui.json';
import './src/styles.css';
setApiInstance(new ApiClient(window.location.origin));
configStore.getState().setDaemonConfig({daemonSetupTarget:'cloud'});
const desktop = location.search.includes('desktop');
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
    <I18nProvider locale="en" resources={{en:{common,onboarding,agents,runtimes,ui}}}>
      <main style={{maxWidth:620, margin:'60px auto'}}>
        {desktop ? <StepRuntimeConnect wsId="ws-new" wsSlug="new-workspace" onNext={()=>{}} /> : <StepPlatformFork wsId="ws-new" wsSlug="new-workspace" onNext={()=>{}} />}
      </main>
    </I18nProvider>
  </QueryClientProvider>
);
