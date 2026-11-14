import { useEffect, useState } from 'react';

export default function App() {
  const [status, setStatus] = useState('Verificando conexão com a API…');
  const apiUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/healthz`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('API indisponível');
        await response.json();
        setStatus('API conectada');
      })
      .catch(() => { if (!controller.signal.aborted) setStatus('Não foi possível conectar à API.'); });
    return () => controller.abort();
  }, [apiUrl]);
  return (
    <main>
      <p className="eyebrow">NASA SPACE APPS CHALLENGE · PLANET X</p>
      <h1>SPHEREx<br /><span>Time Explorer</span></h1>
      <p>Um novo olhar sobre o céu, ao longo do tempo.</p>
      <section aria-label="Status do projeto">
        <h2>Ambiente de desenvolvimento publicado</h2>
        <p>A experiência de exploração está em construção.</p>
        <p role="status">{status}</p>
        <a href={`${apiUrl}/healthz`}>Verificar disponibilidade da API ↗</a>
      </section>
    </main>
  );
}
