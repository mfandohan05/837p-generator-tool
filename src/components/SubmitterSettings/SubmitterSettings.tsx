import { useSubmitterStore } from '../../store/submitterStore';
import { Field } from '../common/Field';
import { card, cardTitle, fieldInput, fieldLabel } from '../../styles/ui';

/** Envelope-level settings (ISA/GS submitter info) shared by every claim in the batch. */
export function SubmitterSettings() {
  const submitter = useSubmitterStore((s) => s.submitter);
  const setSubmitter = useSubmitterStore((s) => s.setSubmitter);

  return (
    <div className={card}>
      <h3 className={cardTitle}>Submitter (applies to the whole batch)</h3>
      <p className="text-xs text-google-gray-600">Fields marked * are required.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Submitter ID *" value={submitter.submitterId} onChange={(v) => setSubmitter((s) => ({ ...s, submitterId: v }))} />
        <Field label="Submitter Name *" value={submitter.submitterName} onChange={(v) => setSubmitter((s) => ({ ...s, submitterName: v }))} />
        <Field label="Contact Name *" value={submitter.contactName} onChange={(v) => setSubmitter((s) => ({ ...s, contactName: v }))} />
        <Field label="Contact Phone *" value={submitter.contactPhone} onChange={(v) => setSubmitter((s) => ({ ...s, contactPhone: v }))} />
        <label className="block">
          <span className={fieldLabel}>Submission Mode</span>
          <input className={fieldInput} type="text" value="Batch (NCTRACKSBAT)" readOnly disabled />
        </label>
      </div>
    </div>
  );
}
