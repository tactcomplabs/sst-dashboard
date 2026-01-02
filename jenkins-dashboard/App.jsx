import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import JobDetailsPage from './pages/JobDetailsPage';
import LogViewPage from './pages/LogViewPage';
import MatrixPage from './pages/MatrixPage';

function App() {
  return (
    <Layout>
      <Routes>
        {/* Matrix view is default landing page */}
        <Route path="/" element={<MatrixPage />} />
        
        <Route path="/jobs" element={<HomePage />} />
        <Route path="/jobs/:jobName" element={<JobDetailsPage />} />
        <Route path="/jobs/:jobName/builds/:buildNum" element={<LogViewPage />} />
        
        <Route path="/matrix" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
