import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ToastProvider } from './ui.jsx';
import '@fontsource/big-shoulders-display/latin-700';
import '@fontsource/big-shoulders-display/latin-800';
import '@fontsource/big-shoulders-display/latin-900';
import '@fontsource/barlow/latin-400';
import '@fontsource/barlow/latin-500';
import '@fontsource/barlow/latin-600';
import '@fontsource/barlow/latin-700';
import './styles.css';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { registerSW } from './PushToggle.jsx';

registerSW();

createRoot(document.getElementById('root')).render(
  <ErrorBoundary><ToastProvider><App /></ToastProvider></ErrorBoundary>
);
