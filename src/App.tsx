import { Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { PatientOnboardingPage } from './pages/patient/PatientOnboardingPage';
import { PatientIntakePage } from './pages/patient/PatientIntakePage';
import { PatientDocumentsPage } from './pages/patient/PatientDocumentsPage';
import { PatientVerificationPage } from './pages/patient/PatientVerificationPage';
import { DoctorCasesPage } from './pages/doctor/DoctorCasesPage';
import { DoctorCaseDetailPage } from './pages/doctor/DoctorCaseDetailPage';
import { DoctorLoginPage } from './pages/doctor/DoctorLoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import './index.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/patient" element={<PatientOnboardingPage />} />
      <Route path="/patient/intake" element={<PatientIntakePage />} />
      <Route path="/patient/documents" element={<PatientDocumentsPage />} />
      <Route path="/patient/verification" element={<PatientVerificationPage />} />
      <Route path="/doctor/login" element={<DoctorLoginPage />} />
      <Route path="/doctor/cases" element={<DoctorCasesPage />} />
      <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
