import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, MapPin, Bell, MessageCircle, LogOut, Globe, ChevronRight, Shield, Trash2, Key } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import type { Tables } from '@/integrations/supabase/types';

type Customer = Tables<'customers'>;
type Location = Tables<'locations'>;

const Profile = () => {
  const navigate = useNavigate();
  const { t, locale, setLocale } = useI18n();
  const { user, signOut } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [preferredLocationId, setPreferredLocationId] = useState<string | null>(null);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const [custRes, locRes, roleRes] = await Promise.all([
        supabase.from('customers').select('*').eq('user_id', user.id).single(),
        supabase.from('locations').select('*'),
        supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle(),
      ]);

      if (custRes.data) {
        const c = custRes.data;
        setCustomer(c);
        setFirstName(c.first_name);
        setLastName(c.last_name);
        setPhone(c.phone);
        setEmail(c.email);
        setPreferredLocationId(c.preferred_location_id);
        setMarketingConsent(!!c.consent_marketing_at);
        setWhatsappConsent(!!c.consent_whatsapp_at);
      }
      setLocations(locRes.data || []);
      setIsAdmin(!!roleRes.data);
      setLoading(false);
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!customer) return;
    setSaving(true);
    const { error } = await supabase
      .from('customers')
      .update({
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        preferred_location_id: preferredLocationId,
        consent_marketing_at: marketingConsent ? new Date().toISOString() : null,
        consent_whatsapp_at: whatsappConsent ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customer.id);

    setSaving(false);
    if (!error) {
      toast({ title: t('profile.saved') });
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="px-6 pt-12 pb-4">
          <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        </div>
        <div className="px-6 space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-6 pt-12 pb-4">
        <h1 className="font-display text-3xl text-foreground">{t('profile.title')}</h1>
      </div>

      <div className="px-6 space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/20">
            <User className="h-8 w-8 text-gold" />
          </div>
          <div>
            <p className="text-lg font-medium text-foreground">{firstName} {lastName}</p>
            <p className="text-xs text-muted-foreground">{email}</p>
          </div>
        </div>

        {/* Personal Info */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">{t('profile.personalInfo')}</h3>
          <div className="space-y-2">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t('auth.name')} className="bg-card border-border" />
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t('auth.surname')} className="bg-card border-border" />
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('auth.phone')} className="bg-card border-border" />
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.email')} className="bg-card border-border" />
          </div>
        </motion.div>

        {/* Preferred location */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">{t('profile.preferredLocation')}</h3>
          <div className="space-y-2">
            {locations.map((loc) => (
              <button
                key={loc.id}
                onClick={() => setPreferredLocationId(loc.id)}
                className={`w-full rounded-xl border p-3 text-left flex items-center gap-3 transition-all ${
                  preferredLocationId === loc.id ? 'border-gold bg-gold/5' : 'border-border bg-card'
                }`}
              >
                <MapPin size={16} className={preferredLocationId === loc.id ? 'text-gold' : 'text-muted-foreground'} />
                <span className="text-sm text-foreground">{loc.name}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Consents */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">{t('profile.consents')}</h3>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell size={16} className="text-muted-foreground" />
                <span className="text-sm text-foreground">{t('profile.marketingConsent')}</span>
              </div>
              <Switch checked={marketingConsent} onCheckedChange={setMarketingConsent} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <MessageCircle size={16} className="text-muted-foreground" />
                <span className="text-sm text-foreground">{t('profile.whatsappConsent')}</span>
              </div>
              <Switch checked={whatsappConsent} onCheckedChange={setWhatsappConsent} />
            </div>
          </div>
        </motion.div>

        {/* Language */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe size={16} className="text-muted-foreground" />
              <span className="text-sm text-foreground">{t('general.language')}</span>
            </div>
            <div className="flex gap-1 rounded-lg bg-muted p-0.5">
              <button
                onClick={() => setLocale('es')}
                className={`rounded-md px-3 py-1 text-xs font-medium ${locale === 'es' ? 'bg-card text-foreground' : 'text-muted-foreground'}`}
              >
                ES
              </button>
              <button
                onClick={() => setLocale('en')}
                className={`rounded-md px-3 py-1 text-xs font-medium ${locale === 'en' ? 'bg-card text-foreground' : 'text-muted-foreground'}`}
              >
                EN
              </button>
            </div>
          </div>
        </div>

        {/* Admin panel */}
        {isAdmin && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="space-y-3">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Shield size={14} className="text-gold" /> Administración
            </h3>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              <button
                onClick={() => navigate('/admin/api-keys')}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Key size={16} className="text-muted-foreground" />
                  <span className="text-sm text-foreground">API Keys</span>
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Save */}
        <Button onClick={handleSave} disabled={saving} className="w-full gradient-gold text-primary-foreground shadow-gold">
          {saving ? t('general.loading') : t('general.save')}
        </Button>

        {/* Logout */}
        <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-3 text-sm text-destructive hover:opacity-80 transition-opacity">
          <LogOut size={16} /> {t('profile.logout')}
        </button>

        <p className="text-center text-[10px] text-muted-foreground pb-4">{t('profile.version')} 1.0.0</p>
      </div>

      <BottomNav />
    </div>
  );
};

export default Profile;
