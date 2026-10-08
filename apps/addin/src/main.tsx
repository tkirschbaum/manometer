import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { selectHost } from './office/select';
import { Gallery } from './stage/Gallery';

const root = document.getElementById('root');
const params = new URLSearchParams(window.location.search);
if (root && params.has('gallery')) {
  document.documentElement.removeAttribute('data-boot');
  document.documentElement.removeAttribute('data-boot-code');
  createRoot(root).render(<Gallery params={params} />);
} else if (root) {
  void selectHost().then(({ host, harness }) => {
    createRoot(root).render(
      <StrictMode>
        <App host={host} harness={harness} />
      </StrictMode>,
    );
  });
}
