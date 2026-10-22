import { Component } from 'react';

// Si algo falla al pintar la app, en vez de quedarse la pantalla negra se ofrece recargar
export class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center-screen" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div className="hero-word">Liga <b>KO</b></div>
        <p className="muted">Algo ha fallado al cargar esta pantalla.</p>
        <button className="btn primary" onClick={() => location.reload()}>Recargar</button>
        <p className="xs muted" style={{ maxWidth: 300 }}>{String(this.state.error?.message || '').slice(0, 140)}</p>
      </div>
    );
  }
}
