import { Info, ShieldCheck } from 'lucide-react';
import { GttRealtimePanel } from '../components/GttRealtimePanel';

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
          <strong>Dati transit</strong>
          <p>La mappa usa Vehicle Positions GTFS-RT via proxy tecnico. Se il feed non risponde, BusRadar non inventa mezzi.</p>
        </div>
      </section>
      <section className="info-card">
        <ShieldCheck size={22} />
        <div>
          <strong>Demo non ufficiale</strong>
          <p>BusRadar non rappresenta operatori o enti di trasporto. La struttura e pronta per future integrazioni autorizzate.</p>
        </div>
      </section>
      <GttRealtimePanel />
    </main>
  );
}
