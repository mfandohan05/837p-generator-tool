import { SubmitterSettings } from './components/SubmitterSettings/SubmitterSettings';
import { BatchImport } from './components/BatchImport/BatchImport';
import { Ack999Viewer } from './components/Ack999Viewer/Ack999Viewer';

function App() {
  return (
    <div className="min-h-screen bg-google-gray-50">
      <header className="sticky top-0 z-10 border-b border-google-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-google-blue-600 text-sm font-medium text-white">
            837
          </div>
          <div>
            <h1 className="text-lg font-medium text-google-gray-900 leading-tight">837P Claim Generator</h1>
            <p className="text-xs text-google-gray-600">ASC X12 005010X222A1 - NCTracks Companion Guide edition</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <SubmitterSettings />
        <BatchImport />
        <Ack999Viewer />
      </main>
    </div>
  );
}

export default App;
