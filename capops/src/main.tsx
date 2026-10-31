import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AppProvider, useApp } from './AppContext';
import Layout from './components/Layout';
import Auth from './screens/Auth';
import Welcome from './screens/Welcome';
import Profile from './screens/Profile';
import Questionnaire from './screens/Questionnaire';
import Results from './screens/Results';
import Diagnosis from './screens/Diagnosis';
import Solutions from './screens/Solutions';
import Blueprint from './screens/Blueprint';
import Plan from './screens/Plan';
import Dashboard from './screens/Dashboard';
import Reports from './screens/Reports';
import DocEditor from './screens/DocEditor';
import { Spinner } from './components/ui';

function Gate() {
  const { session, authReady, recovery } = useApp();
  if (!authReady) return <div style={{ padding: 40 }}><Spinner /></div>;
  if (!session || recovery) return <Auth />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/cap" element={<Questionnaire />} />
        <Route path="/results" element={<Results />} />
        <Route path="/diagnosis" element={<Diagnosis />} />
        <Route path="/ops" element={<Solutions />} />
        <Route path="/blueprint" element={<Blueprint />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/documents/:id" element={<DocEditor />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Route>
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </AppProvider>
  </React.StrictMode>,
);
