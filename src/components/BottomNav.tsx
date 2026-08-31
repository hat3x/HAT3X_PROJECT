import { useLocation, useNavigate } from 'react-router-dom';
import { Home, CalendarPlus, CalendarDays, Star, User } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { motion } from 'framer-motion';

const navItems = [
  { key: 'nav.home', icon: Home, path: '/home' },
  { key: 'nav.book', icon: CalendarPlus, path: '/book' },
  { key: 'nav.appointments', icon: CalendarDays, path: '/appointments' },
  { key: 'nav.loyalty', icon: Star, path: '/loyalty' },
  { key: 'nav.profile', icon: User, path: '/profile' },
];

const BottomNav = () => {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav aria-label="Navegación principal" className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          const label = t(item.key);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors"
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-2 h-0.5 w-6 rounded-full gradient-gold"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <Icon
                size={20}
                aria-hidden="true"
                className={isActive ? 'text-gold' : 'text-muted-foreground'}
              />
              <span
                aria-hidden="true"
                className={`text-[10px] font-medium ${
                  isActive ? 'text-gold' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
