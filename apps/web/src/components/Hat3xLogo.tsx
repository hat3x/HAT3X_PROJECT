import logoImg from "@/assets/hat3x-logo.png";

const Hat3xLogo = ({ className = "", size = "md" }: { className?: string; size?: "xs" | "sm" | "md" | "lg" }) => {
  const sizes = {
    xs: { height: 24 },
    sm: { height: 32 },
    md: { height: 42 },
    lg: { height: 56 },
  };
  const s = sizes[size];

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <img src={logoImg} alt="HAT3X" style={{ height: s.height }} className="w-auto" />
    </div>
  );
};

export default Hat3xLogo;
