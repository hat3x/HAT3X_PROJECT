import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import BottomNav from '@/components/BottomNav';

interface PlaceholderPageProps {
  title: string;
  icon?: React.ReactNode;
}

const PlaceholderPage = ({ title, icon }: PlaceholderPageProps) => {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-6 pt-12 pb-8">
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
          <span className="text-sm">{t('general.back')}</span>
        </button>
        <h1 className="font-display text-3xl text-foreground">{title}</h1>
      </div>
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        {icon && <div className="mb-4 text-gold">{icon}</div>}
        <p className="text-sm text-muted-foreground">Próximamente / Coming soon</p>
      </div>
      <BottomNav />
    </div>
  );
};

export default PlaceholderPage;
