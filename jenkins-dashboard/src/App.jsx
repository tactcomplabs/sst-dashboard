import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import JobDetailsPage from './pages/JobDetailsPage';
import LogViewPage from './pages/LogViewPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/jobs/:jobName" element={<JobDetailsPage />} />
        <Route path="/jobs/:jobName/builds/:buildNum" element={<LogViewPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
