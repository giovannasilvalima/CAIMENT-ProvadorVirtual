import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import FitsenseHomePage from './pages/Fitsense/FitsenseHomePage';
import FitsenseCatalogPage from './pages/Fitsense/FitsenseCatalogPage';
import FitsenseProductPage from './pages/Fitsense/FitsenseProductPage';
import FitsenseCartPage from './pages/Fitsense/FitsenseCartPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FitsenseHomePage />} />
        <Route path="/fitsense" element={<FitsenseHomePage />} />
        <Route path="/fitsense/produtos" element={<FitsenseCatalogPage />} />
        <Route path="/fitsense/produtos/:id" element={<FitsenseProductPage />} />
        <Route path="/fitsense/carrinho" element={<FitsenseCartPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
