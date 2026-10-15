import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App';
import { extensionBridge } from '../../src/ui/bridge';

createRoot(document.getElementById('root')!).render(
  <App bridge={extensionBridge} view="popup" />,
);
