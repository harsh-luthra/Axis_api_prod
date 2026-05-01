import { Navigate } from 'react-router-dom';
import { getApiKey } from '../auth.js';

export default function ProtectedRoute({ children }) {
  if (!getApiKey()) return <Navigate to="/login" replace />;
  return children;
}
