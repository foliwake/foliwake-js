import { createContext, useContext, type ReactNode } from 'react';
import type { ClientSettings } from '@foliwake/blocks-contract/page';

const SettingsContext = createContext<ClientSettings | null>(null);

/** Makes `clientSettings(config)` available to client code (useFoliwakeSettings). */
export function FoliwakeProvider(props: { settings: ClientSettings; children?: ReactNode }): ReactNode {
  return <SettingsContext.Provider value={props.settings}>{props.children}</SettingsContext.Provider>;
}

export function useFoliwakeSettings(): ClientSettings | null {
  return useContext(SettingsContext);
}
