import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Payouts from './pages/Payouts.jsx';
import Callbacks from './pages/Callbacks.jsx';
import NewTransfer from './pages/NewTransfer.jsx';
import StatusCheck from './pages/StatusCheck.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        <Route path="/payouts" element={<Payouts />} />
        <Route path="/callbacks" element={<Callbacks />} />
        <Route path="/transfer/new" element={<NewTransfer />} />
        <Route path="/transfer/status" element={<StatusCheck />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
