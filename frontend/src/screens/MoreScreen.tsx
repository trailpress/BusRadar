import { Info, ShieldCheck } from 'lucide-react';
import { RealtimePanel } from '../components/RealtimePanel';

export function MoreScreen() {
  return (
    <main className="screen panel-screen">
      <section className="screen-header">
        <div>
          <span>BusRadar v0.2.1</span>
          <h1>Altro</h1>
        </div>
      </section>
      <section className="info-card">
        <Info size={22} />
        <div>
          <strong>Dati simulati</strong>
          <p>Nessun backend, nessun feed realtime, nessuna API GTT/MaTO/5T e nessuno scraping.</p>
        </div>
      </section>
      <section className="info-card">
        <ShieldCheck size={22} />
        <div>
          <strong>Demo non ufficiale</strong>
          <p>BusRadar non rappresenta operatori o enti di trasporto. La struttura e pronta per future integrazioni autorizzate.</p>
        </div>
      </section>
      <RealtimePanel />
    </main>
  );
}
