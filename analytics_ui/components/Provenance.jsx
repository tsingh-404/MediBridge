import React from 'react';

export function Provenance({ response }) {
  const provenance = response?.provenance || {};
  const span = provenance.source_span || {};
  const scenarioVersions = Array.isArray(provenance.scenario_versions) ? provenance.scenario_versions : [];
  return (
    <section className="provenance" aria-label="Data provenance and caveats">
      <div className="provenance-heading"><span aria-hidden="true">!</span><div><strong>Synthetic-only demonstration · unvalidated</strong><p>No live conversation data is used. Questions are not diagnoses, claims, prevalence, outbreaks, or confirmed care needs.</p></div></div>
      <div className="provenance-meta">
        <span>Source span: {span.start_date || 'not available'} – {span.end_date || 'not available'}</span>
        <span>Generator: {provenance.generator_version || 'not available'}</span>
        <span>Taxonomy: {provenance.taxonomy_version || 'not available'}</span>
        {scenarioVersions.length > 0 && <span>Scenarios: {scenarioVersions.join(', ')}</span>}
      </div>
      {response?.caveat && <p className="provenance-caveat">{response.caveat}</p>}
    </section>
  );
}
