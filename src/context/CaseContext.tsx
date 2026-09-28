import React, { createContext, useContext, useState, useCallback } from 'react';

interface CaseContextType {
  caseId: string | null;
  setCaseId: (id: string | null) => void;
}

const CaseContext = createContext<CaseContextType | undefined>(undefined);

export const CaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [caseId, setCaseIdState] = useState<string | null>(() => {
    return sessionStorage.getItem('activeCaseId');
  });

  const setCaseId = useCallback((id: string | null) => {
    setCaseIdState(id);
    if (id) {
      sessionStorage.setItem('activeCaseId', id);
    } else {
      sessionStorage.removeItem('activeCaseId');
    }
  }, []);

  return (
    <CaseContext.Provider value={{ caseId, setCaseId }}>
      {children}
    </CaseContext.Provider>
  );
};

export const useCase = () => {
  const context = useContext(CaseContext);
  if (context === undefined) {
    throw new Error('useCase must be used within a CaseProvider');
  }
  return context;
};
