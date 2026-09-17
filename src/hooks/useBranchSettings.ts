import { useApp } from '../context/AppContext';
import { BranchSettings } from '../types';

export interface UseBranchSettingsResult {
  branchSettings: BranchSettings;
  updateBranchSettings: (settings: Partial<BranchSettings>) => Promise<boolean>;
}

export const useBranchSettings = (): UseBranchSettingsResult => {
  const { branchSettings, updateBranchSettings } = useApp();
  return {
    branchSettings,
    updateBranchSettings
  };
};

export default useBranchSettings;
