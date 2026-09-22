import React, { useState } from 'react';
import { 
  Building, 
  Mail, 
  Lock, 
  User, 
  Database, 
  ShieldCheck, 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Key
} from 'lucide-react';
import { SolicitorProfile } from '../types';
import { supabase, isSupabaseConfigured, updateSupabaseCredentials } from '../lib/supabase';
import { validateAndConsumeInviteKey } from '../lib/storage';
import { PricingModal } from './Modals/PricingModal';

interface AuthScreenProps {
  onAuthenticated: (profile: SolicitorProfile) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [registrationKey, setRegistrationKey] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('license') || params.get('invite') || params.get('key') || '';
  });

  // Supabase cloud config
  const [showCloudConfig, setShowCloudConfig] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState(
    localStorage.getItem('docvault_supabase_url') || 'https://eccdphuupctvdayyenhl.supabase.co'
  );
  const [supabaseKey, setSupabaseKey] = useState(
    localStorage.getItem('docvault_supabase_key') || 'sb_publishable_8JlfIOAaxD_ePc0yoG7qYA_wC5QkNWq'
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPricingModal, setShowPricingModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let userRole: 'admin' | 'staff' = 'admin';

    // Firm Registration Key enforcement for sign up (supports Master Key & One-Time Keys)
    if (mode === 'signup') {
      const check = validateAndConsumeInviteKey(registrationKey, email.trim());
      if (!check.valid) {
        setError(check.reason || 'Invalid Firm Registration Key. Registration is restricted.');
        setLoading(false);
        return;
      }
      userRole = check.role || 'staff';
    }

    // If user entered Supabase credentials, save them
    if (supabaseUrl.trim() && supabaseKey.trim()) {
      updateSupabaseCredentials(supabaseUrl.trim(), supabaseKey.trim());
    }

    try {
      // If live Supabase client exists, attempt auth
      if (isSupabaseConfigured() && supabase) {
        if (mode === 'signup') {
          const { data, error: signUpErr } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: {
                company_name: companyName.trim() || 'My Legal Practice',
                display_name: displayName.trim() || email.split('@')[0],
                phone: phone.trim(),
                role: userRole
              }
            }
          });
          if (signUpErr) throw signUpErr;

          const userProfile: SolicitorProfile = {
            id: data.user?.id || 'solicitor_' + Math.random().toString(36).substring(2, 9),
            email: data.user?.email || email.trim(),
            displayName: displayName.trim() || email.split('@')[0],
            companyName: companyName.trim() || 'My Legal Practice',
            phone: phone.trim(),
            pinCode: '1234',
            isDemoMode: false,
            role: userRole
          };
          onAuthenticated(userProfile);
        } else {
          const { data, error: signInErr } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password
          });
          if (signInErr) throw signInErr;

          const userProfile: SolicitorProfile = {
            id: data.user?.id || 'solicitor_' + Math.random().toString(36).substring(2, 9),
            email: data.user?.email || email.trim(),
            displayName: data.user?.user_metadata?.display_name || email.split('@')[0],
            companyName: data.user?.user_metadata?.company_name || 'My Legal Practice',
            phone: data.user?.user_metadata?.phone || '',
            pinCode: '1234',
            isDemoMode: false,
            role: data.user?.user_metadata?.role || 'admin'
          };

          if (data.user?.id) {
            try {
              await supabase.from('profiles').upsert({
                id: data.user.id,
                email: data.user.email || email.trim(),
                display_name: userProfile.displayName,
                company_name: userProfile.companyName,
                phone: userProfile.phone || ''
              });
            } catch {}
          }

          onAuthenticated(userProfile);
        }
      } else {
        // Local isolated workspace account
        const accountsKey = 'docvault_registered_accounts';
        const getSavedAccounts = (): Record<string, SolicitorProfile & { password?: string }> => {
          try {
            return JSON.parse(localStorage.getItem(accountsKey) || '{}');
          } catch {
            return {};
          }
        };

        const savedAccounts = getSavedAccounts();
        const emailKey = email.trim().toLowerCase();

        if (mode === 'signin') {
          const existing = savedAccounts[emailKey];
          if (existing) {
            if (existing.password && existing.password !== password) {
              throw new Error('Incorrect password. Please try again.');
            }
            onAuthenticated(existing);
          } else {
            throw new Error('No account found with this email. Please switch to "Create Your Account" and enter your Firm Registration Key to register.');
          }
        } else {
          // Signup mode
          const userProfile: SolicitorProfile = {
            id: 'user_' + Math.random().toString(36).substring(2, 10),
            email: email.trim(),
            displayName: displayName.trim() || email.split('@')[0],
            companyName: companyName.trim() || 'My Legal Practice',
            phone: phone.trim() || '',
            pinCode: '1234',
            isDemoMode: !isSupabaseConfigured(),
            role: userRole
          };
          savedAccounts[emailKey] = { ...userProfile, password };
          localStorage.setItem(accountsKey, JSON.stringify(savedAccounts));
          onAuthenticated(userProfile);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafd] flex flex-col items-center justify-center p-4 selection:bg-[#c2e7ff] selection:text-[#001d35] select-none">
      <div className="w-full max-w-md bg-white border border-[#dadce0] rounded-3xl shadow-xl p-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1a73e8] to-[#1557b0] text-white flex items-center justify-center mx-auto mb-3 shadow-md ring-4 ring-blue-50">
            <Building className="w-7 h-7" />
          </div>
          <h1 className="font-['Google_Sans',sans-serif] text-2xl font-bold text-[#202124]">
            Doc<span className="text-[#1a73e8]">Vault</span>
          </h1>
          <p className="text-xs text-[#5f6368] mt-1">
            Professional Solicitor &amp; Document Management Portal
          </p>
        </div>

        {/* Tab switcher: Sign In vs Create Account */}
        <div className="flex bg-[#f1f3f4] p-1 rounded-2xl mb-6 text-xs font-bold text-[#5f6368]">
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
            className={`flex-1 py-2.5 rounded-xl transition-all ${
              mode === 'signup'
                ? 'bg-white text-[#1a73e8] shadow-xs'
                : 'hover:text-[#202124]'
            }`}
          >
            Create Your Account
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError(null);
            }}
            className={`flex-1 py-2.5 rounded-xl transition-all ${
              mode === 'signin'
                ? 'bg-white text-[#1a73e8] shadow-xs'
                : 'hover:text-[#202124]'
            }`}
          >
            Sign In
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#fce8e6] border border-[#fad2cf] rounded-xl text-xs text-[#d93025] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-xs font-bold text-[#202124] mb-1">
                  Company / Firm Name *
                </label>
                <div className="relative flex items-center">
                  <Building className="w-4 h-4 text-[#5f6368] absolute left-3" />
                  <input
                    type="text"
                    placeholder="e.g. Apex Legal & Solicitor Chambers"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    className="w-full pl-9 pr-3 py-2.5 bg-[#f8fafd] border border-[#dadce0] focus:bg-white focus:border-[#1a73e8] rounded-xl text-xs outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-[#202124] mb-1">
                    Your Name *
                  </label>
                  <div className="relative flex items-center">
                    <User className="w-4 h-4 text-[#5f6368] absolute left-3" />
                    <input
                      type="text"
                      placeholder="e.g. David Sterling"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                      className="w-full pl-9 pr-3 py-2.5 bg-[#f8fafd] border border-[#dadce0] focus:bg-white focus:border-[#1a73e8] rounded-xl text-xs outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#202124] mb-1">
                    Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    placeholder="+44 20 7946..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#f8fafd] border border-[#dadce0] focus:bg-white focus:border-[#1a73e8] rounded-xl text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#202124] mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#1a73e8]" />
                    <span>Firm Registration Key *</span>
                  </span>
                  <span className="text-[10px] text-[#1a73e8] font-semibold bg-[#e8f0fe] px-1.5 py-0.5 rounded">
                    Restricted
                  </span>
                </label>
                <div className="relative flex items-center">
                  <Key className="w-4 h-4 text-[#5f6368] absolute left-3" />
                  <input
                    type="password"
                    placeholder="Enter special registration passcode..."
                    value={registrationKey}
                    onChange={(e) => setRegistrationKey(e.target.value)}
                    required
                    className="w-full pl-9 pr-3 py-2.5 bg-[#f8fafd] border border-[#dadce0] focus:bg-white focus:border-[#1a73e8] rounded-xl text-xs font-mono tracking-wider outline-none"
                  />
                </div>
                <p className="text-[11px] text-[#5f6368] mt-1">
                  Only authorized solicitors with this key can register. Prevents spam or unauthorized accounts.
                </p>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-[#202124] mb-1">
              Email Address *
            </label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-[#5f6368] absolute left-3" />
              <input
                type="email"
                placeholder="solicitor@yourfirm.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 bg-[#f8fafd] border border-[#dadce0] focus:bg-white focus:border-[#1a73e8] rounded-xl text-xs outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#202124] mb-1">
              Password *
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-[#5f6368] absolute left-3" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full pl-9 pr-3 py-2.5 bg-[#f8fafd] border border-[#dadce0] focus:bg-white focus:border-[#1a73e8] rounded-xl text-xs outline-none"
              />
            </div>
          </div>

          {/* Collapsible Supabase Cloud Settings */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowCloudConfig(!showCloudConfig)}
              className="w-full flex items-center justify-between text-xs text-[#5f6368] hover:text-[#1a73e8] py-1 transition-colors"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Database className="w-3.5 h-3.5 text-[#1a73e8]" />
                <span>Supabase Cloud Sync (Optional)</span>
              </span>
              {showCloudConfig ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showCloudConfig && (
              <div className="mt-2 p-3.5 bg-[#f8fafd] border border-[#dadce0] rounded-2xl space-y-2.5 animate-in fade-in duration-100">
                <p className="text-[11px] text-[#5f6368] leading-tight">
                  Enter your Supabase credentials to sync documents directly to your cloud PostgreSQL database and storage buckets.
                </p>

                <div>
                  <label className="block text-[10px] font-bold text-[#202124] uppercase mb-0.5">
                    Project URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://xyzabcdef.supabase.co"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-[#dadce0] rounded-lg text-xs font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#202124] uppercase mb-0.5">
                    Anon / Public Key
                  </label>
                  <input
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-[#dadce0] rounded-lg text-xs font-mono outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 mt-4"
          >
            <span>{loading ? 'Connecting...' : mode === 'signup' ? 'Create Account & Open Workspace' : 'Sign In to Workspace'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[#f1f3f4] text-center space-y-3">
          <div>
            <button
              type="button"
              onClick={() => setShowPricingModal(true)}
              className="text-xs font-semibold text-[#1a73e8] hover:text-[#1557b0] hover:underline inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>View Solicitor Chamber Plans &amp; Pricing</span>
            </button>
          </div>

          <p className="text-[11px] text-[#5f6368] flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#137333]" />
            <span>Secure Cloud Architecture • Isolated Client Data</span>
          </p>
        </div>

        <PricingModal
          isOpen={showPricingModal}
          onClose={() => setShowPricingModal(false)}
        />
      </div>
    </div>
  );
};
