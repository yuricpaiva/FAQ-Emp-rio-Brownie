import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const carouselSlides = [
  { src: "/login-carousel/loja-01.jpg", alt: "Fachada iluminada de uma unidade Empório Brownie" },
  { src: "/login-carousel/loja-02.jpg", alt: "Balcão de uma unidade Empório Brownie" },
  { src: "/login-carousel/loja-03.jpg", alt: "Interior de uma unidade Empório Brownie" },
  { src: "/login-carousel/loja-04.jpg", alt: "Entrada de uma unidade Empório Brownie" },
];

function ArrowIcon({ direction }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function PasswordIcon({ visible }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {visible ? (
        <>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      ) : (
        <>
          <path d="m3 3 18 18" />
          <path d="M10.6 6.1A10.9 10.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17.3 17.3 0 0 1-2.1 2.8M6.2 6.2C3.8 7.9 2.5 12 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 3.1-.5" />
        </>
      )}
    </svg>
  );
}

function LoginCarousel() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const showPrevious = useCallback(() => {
    setCurrent((index) => (index - 1 + carouselSlides.length) % carouselSlides.length);
  }, []);

  const showNext = useCallback(() => {
    setCurrent((index) => (index + 1) % carouselSlides.length);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return undefined;
    const timer = window.setInterval(showNext, 2000);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, showNext]);

  return (
    <section
      className="login-carousel"
      aria-label="Unidades Empório Brownie"
      aria-roledescription="carrossel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <div className="login-carousel__images" aria-live="off">
        {carouselSlides.map((slide, index) => (
          <img
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            className={`login-carousel__image ${index === current ? "login-carousel__image--active" : ""}`}
            aria-hidden={index !== current}
            loading={index === 0 ? "eager" : "lazy"}
            fetchPriority={index === 0 ? "high" : "auto"}
          />
        ))}
      </div>

      <div className="login-carousel__overlay" aria-hidden="true" />

      <button
        type="button"
        className="login-carousel__arrow login-carousel__arrow--previous"
        onClick={showPrevious}
        aria-label="Foto anterior"
      >
        <ArrowIcon direction="left" />
      </button>
      <button
        type="button"
        className="login-carousel__arrow login-carousel__arrow--next"
        onClick={showNext}
        aria-label="Próxima foto"
      >
        <ArrowIcon direction="right" />
      </button>

      <div className="login-carousel__dots" aria-label="Escolher foto">
        {carouselSlides.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            className={`login-carousel__dot ${index === current ? "login-carousel__dot--active" : ""}`}
            onClick={() => setCurrent(index)}
            aria-label={`Exibir foto ${index + 1} de ${carouselSlides.length}`}
            aria-current={index === current ? "true" : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login, consumeAuthMessage } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showRecoveryHelp, setShowRecoveryHelp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const authMessage = consumeAuthMessage();
    if (authMessage) setError(authMessage);
  }, [consumeAuthMessage]);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setShowRecoveryHelp(false);
    setLoading(true);
    try {
      await login(email, password);
      const nextPath = location.state?.from || "/";
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível entrar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand" aria-label="FAQ Empório Brownie">
          <span>FAQ</span>
          <strong>EB</strong>
        </div>

        <div className="login-panel__main">
          <header className="login-heading">
            <h1 id="login-title">
              Bem-vindo ao
              <span>FAQ</span>
            </h1>
            <p>Acesse sua conta para continuar</p>
          </header>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label htmlFor="login-email">E-mail</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@emporiobrownie.com.br"
                required
                autoComplete="email"
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Senha</label>
              <span className="login-password">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-password__toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPassword}
                >
                  <PasswordIcon visible={showPassword} />
                </button>
              </span>
            </div>

            <button
              type="button"
              className="login-recovery"
              onClick={() => setShowRecoveryHelp((visible) => !visible)}
              aria-expanded={showRecoveryHelp}
              aria-controls="login-recovery-help"
            >
              Esqueceu sua senha?
            </button>

            {showRecoveryHelp && (
              <p id="login-recovery-help" className="login-message login-message--info" role="status">
                Entre em contato com o Administrador do sistema ou com a equipe de TI para redefinir sua senha.
              </p>
            )}

            {error && (
              <p className="login-message login-message--error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="login-submit" disabled={loading}>
              {loading && <span className="login-submit__spinner" aria-hidden="true" />}
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>

        <p className="login-footer">© {new Date().getFullYear()} Empório Brownie · Uso interno</p>
      </section>

      <LoginCarousel />
    </main>
  );
}

export default AdminLogin;
