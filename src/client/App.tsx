import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Navbar } from './components/Navbar';
import { RefreshProgress } from './components/RefreshProgress';
import { Spinner } from './components/Spinner';

const LibraryPage = lazy(() => import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const DetailsPage = lazy(() => import('./pages/DetailsPage').then((m) => ({ default: m.DetailsPage })));
const AddPage = lazy(() => import('./pages/AddPage').then((m) => ({ default: m.AddPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));

export function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <RefreshProgress />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/add" element={<AddPage />} />
          <Route path="/details/:bggId" element={<DetailsPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </Suspense>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}
