import { create } from "zustand";
import { api } from "./api";
import type {
  AppSettings,
  ConanEnvironment,
  ProfileSummary,
  RemoteSummary,
} from "./types";

interface AppStore {
  profileDrafts: Record<string, string>;
  setProfileDraft: (name: string, content: string | null) => void;
  environment: ConanEnvironment | null;
  settings: AppSettings | null;
  profiles: ProfileSummary[];
  remotes: RemoteSummary[];
  environmentLoading: boolean;
  remotesLoading: boolean;
  profilesLoading: boolean;
  error: string | null;
  refreshEnvironment: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  refreshRemotes: () => Promise<void>;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  profileDrafts: {},
  setProfileDraft: (name, content) => set((state) => {
    const profileDrafts = { ...state.profileDrafts };
    if (content === null) delete profileDrafts[name];
    else profileDrafts[name] = content;
    return { profileDrafts };
  }),
  environment: null,
  settings: null,
  profiles: [],
  remotes: [],
  environmentLoading: false,
  remotesLoading: false,
  profilesLoading: false,
  error: null,

  setError: (error) => set({ error }),

  refreshEnvironment: async () => {
    set({ environmentLoading: true, error: null });
    try {
      const environment = await api.detectConanEnvironment();
      set({ environment, environmentLoading: false });
    } catch (error) {
      set({
        environment: null,
        environmentLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  refreshSettings: async () => {
    try {
      const settings = await api.getAppSettings();
      set({ settings });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  refreshProfiles: async () => {
    set({ profilesLoading: true, error: null });
    try {
      const profiles = await api.listProfiles();
      set({ profiles, profilesLoading: false });
    } catch (error) {
      set({
        profilesLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  refreshRemotes: async () => {
    set({ remotesLoading: true, error: null });
    try {
      const remotes = await api.listRemotes();
      set({ remotes, remotesLoading: false });
    } catch (error) {
      set({
        remotesLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
}));
