import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import JobDetailsPage from './pages/JobDetailsPage';
import LogViewPage from './pages/LogViewPage';
import SstPerfOverviewPage from './pages/SstPerfOverviewPage';
import SstPerfDetailPage from './pages/SstPerfDetailPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/jobs/:jobName" element={<JobDetailsPage />} />
        <Route path="/jobs/:jobName/builds/:buildNum" element={<LogViewPage />} />
        <Route path="/benchmarks/sst-perf" element={<SstPerfOverviewPage />} />
        <Route path="/benchmarks/sst-perf/:benchmarkId" element={<SstPerfDetailPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
