import { create } from 'zustand';
import type { SubmitterInfo } from '../types/domain';

interface SubmitterStore {
  submitter: SubmitterInfo;
  setSubmitter: (updater: (submitter: SubmitterInfo) => SubmitterInfo) => void;
}

/** App defaults: MDC Global Care Solutions LLC, batch mode. */
export const defaultSubmitter: SubmitterInfo = {
  submitterId: 'FA56',
  submitterName: 'MDC Global Care Solutions LLC',
  contactName: 'Enselme Fandohan',
  contactPhone: '7797034819',
  isRealTime: false,
};

/** Envelope-level settings (submitter/receiver info) shared by every claim in a batch. */
export const useSubmitterStore = create<SubmitterStore>((set) => ({
  submitter: defaultSubmitter,
  setSubmitter: (updater) => set((state) => ({ submitter: updater(state.submitter) })),
}));
