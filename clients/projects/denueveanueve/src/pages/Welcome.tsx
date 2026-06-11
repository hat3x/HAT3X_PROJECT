import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import logoImg from '@/assets/logo.png';

const Welcome = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 gradient-dark">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-gold/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center text-center">
        
        {/* Brand name */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-2 text-sm uppercase tracking-[0.3em] text-gold-light">
          {t('welcome.title')}
        </motion.p>

        {/* Logo */}
        <motion.img
          src={logoImg}
          alt="denueveanueve"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mb-8 h-8 w-auto" />

        






        

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mb-12 text-sm tracking-widest uppercase text-muted-foreground">
          
          {t('welcome.subtitle')}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="flex w-full max-w-xs flex-col gap-3">
          
          <Button
            onClick={() => navigate('/register')}
            className="h-12 w-full gradient-gold text-primary-foreground font-semibold tracking-wide shadow-gold hover:opacity-90 transition-opacity">
            
            {t('welcome.cta')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate('/login')}
            className="h-12 w-full text-gold-light hover:text-gold hover:bg-gold/5">
            
            {t('welcome.login')}
          </Button>
        </motion.div>
      </motion.div>
    </div>);

};

export default Welcome;