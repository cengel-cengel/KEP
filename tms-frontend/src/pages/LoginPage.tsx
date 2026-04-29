import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import logo from '../assets/logo.png';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post<{ accessToken: string }>('/auth/login', {
        email,
        password,
      });
      login(data.accessToken);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(
        err && typeof err === 'object' && 'response' in err &&
        typeof (err as { response?: { data?: { message?: string } } }).response?.data?.message === 'string'
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-[#1e40af] text-white rounded-2xl shadow-lg p-8 mb-6 flex flex-col items-center">
          <img src={logo} alt="KED Logo" className="h-20 mb-3" />
          <h1 className="text-white font-bold text-[24px] mb-1">
            KED Global Logistics
          </h1>
          <p className="text-blue-200 text-center text-[16px]">
            Transport Management System
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-2xl shadow-md p-8"
        >
          <h2 className="text-lg font-medium text-gray-900 mb-6">Anmelden</h2>
          {error && (
            <div
              className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm"
              role="alert"
            >
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                E-Mail
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e40af] focus:border-[#1e40af] outline-none"
                placeholder="name@beispiel.de"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Passwort
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e40af] focus:border-[#1e40af] outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full py-2.5 bg-[#1e40af] text-white font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Wird angemeldet…' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  );
}
